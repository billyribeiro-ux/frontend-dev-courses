# Authentication Hooks & Session Management

Every request to TeamBoard passes through hooks before reaching any route. Hooks are the backbone of the application — they handle authentication, logging, security headers, error tracking, URL rewriting, and custom serialization. In this lesson you will build the complete hook infrastructure that every subsequent module depends on.

## The Handle Hook

The `handle` hook intercepts every request. TeamBoard needs three concerns: authentication, logging, and security headers. Instead of cramming them into one function, use `sequence` to compose them:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit';
import { getSession, type SessionUser } from '$server/auth';

const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await getSession(sessionId);
    if (user) {
      event.locals.user = user;
    }
  }

  return resolve(event);
};

const logger: Handle = async ({ event, resolve }) => {
  const start = performance.now();
  const response = await resolve(event);
  const duration = Math.round(performance.now() - start);

  console.log(`${event.request.method} ${event.url.pathname} → ${response.status} (${duration}ms)`);

  return response;
};

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  return response;
};

export const handle = sequence(auth, logger, securityHeaders);
```

`sequence` runs each hook in order, passing the response from one to the next. If the auth hook sets `event.locals.user`, the logger and every load function downstream can read it. This pattern keeps each concern isolated and testable.

## Typing event.locals

Tell TypeScript about the `user` property on `event.locals`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: import('$server/auth').SessionUser | null;
    }

    interface Error {
      message: string;
      errorId: string;
    }

    interface PageState {
      task?: import('$lib/types').Task;
      activeTab?: string;
    }
  }
}

export {};
```

The `PageState` interface types the state object you pass to `pushState` and `replaceState` — you will use this for the task detail modal in Module 48. The `Error` interface adds an `errorId` field that `handleError` will populate.

## The handleError Hook

When an unexpected error occurs, `handleError` transforms it into a safe, user-facing error. TeamBoard generates a unique error ID for each failure so users can report issues:

```typescript
// src/hooks.server.ts (continued)
import crypto from 'crypto';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  console.error(`[${errorId}] ${event.request.method} ${event.url.pathname}:`, error);

  // In production, send to Sentry/DataDog/etc.
  // await reportError({ errorId, error, url: event.url.pathname });

  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};
```

The client-side hook mirrors this pattern:

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleClientError: HandleClientError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  console.error(`[${errorId}] Client error:`, error);

  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};
```

Both hooks return an object matching the `App.Error` interface you declared above. The `+error.svelte` pages will display the `errorId` so users can include it in bug reports.

## The handleFetch Hook

When a load function calls `fetch` during SSR, `handleFetch` can modify the request. TeamBoard uses it to forward the user's session cookie on internal API calls:

```typescript
// src/hooks.server.ts (continued)
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  // Forward cookies on internal API requests during SSR
  if (request.url.startsWith(event.url.origin)) {
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }
  }

  return fetch(request);
};
```

Without this, server-side fetch calls to your own API routes would not include the session cookie, and authenticated endpoints would reject the request.

## The reroute Hook

TeamBoard supports optional locale prefixes in URLs. The path `/en/dashboard` and `/dashboard` should resolve to the same route. The `reroute` hook strips the prefix before SvelteKit matches routes:

```typescript
// src/hooks.server.ts (continued)
import type { Reroute } from '@sveltejs/kit';

const locales = ['en', 'es', 'fr', 'pt'];

export const reroute: Reroute = ({ url }) => {
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0])) {
    // Strip the locale prefix — /en/dashboard → /dashboard
    return '/' + segments.slice(1).join('/');
  }
};
```

The locale itself is not lost — you can read it from `url.pathname` in layout load functions and use it for translations.

## The transport Hook

Load functions can return data that travels from server to client during hydration. By default, SvelteKit can serialize JSON-safe values. But `Date` objects, `Map`, `Set`, and custom classes need custom serialization. The `transport` hook handles this:

```typescript
// src/hooks.server.ts (continued)
import type { Transport } from '@sveltejs/kit';

export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (value) => new Date(value)
  }
};
```

Now when a load function returns `{ createdAt: new Date() }`, the client receives an actual `Date` object instead of a string. Without this hook, you would need to manually parse date strings in every component. TeamBoard uses timestamps extensively in task cards, comments, and the activity log.

## Session Helper Module

The hooks reference a `getSession` function. Here is the server-side session module:

```typescript
// src/lib/server/auth.ts
import { db } from '$server/database';
import { users } from '$server/schema';
import { eq } from 'drizzle-orm';
import { SESSION_SECRET } from '$env/static/private';
import crypto from 'crypto';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
};

// In production, use a proper session store (Redis, database table)
const sessions = new Map<string, { userId: number; expiresAt: Date }>();

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  sessions.set(token, { userId, expiresAt });
  return token;
}

export async function getSession(token: string): Promise<SessionUser | null> {
  const session = sessions.get(token);
  if (!session) return null;

  if (session.expiresAt < new Date()) {
    sessions.delete(token);
    return null;
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  return user ?? null;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}
```

This in-memory session store is fine for development. In production, store sessions in a database table or Redis.

## Try It

Review the complete `hooks.server.ts` file you have built. Verify that:
- `sequence` composes auth, logger, and security headers in order
- `handleError` returns an object matching `App.Error`
- `handleFetch` forwards cookies on internal requests
- `reroute` strips locale prefixes
- `transport` handles Date serialization

## Key Takeaways

- `sequence` composes multiple handle hooks — each handles one concern (auth, logging, security)
- `handleError` transforms raw errors into safe user-facing messages with tracking IDs
- `handleFetch` modifies server-side fetch requests — essential for forwarding auth cookies during SSR
- `reroute` rewrites URLs before route matching — useful for locale prefixes or legacy URL redirects
- `transport` teaches SvelteKit how to serialize custom types (Date, Map, Set) across the server-client boundary
- `event.locals` is the bridge between hooks and load functions — set data in hooks, read it everywhere
- Type your locals, errors, and page state in `app.d.ts` for full TypeScript safety
