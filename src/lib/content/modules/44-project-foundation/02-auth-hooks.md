# Authentication Hooks & Session Management

Every request to TeamBoard passes through hooks before reaching any route. Hooks are the backbone of the application -- they handle authentication, logging, security headers, error tracking, URL rewriting, and custom serialization. If load functions are the heart of SvelteKit's data story, hooks are the nervous system: they intercept, inspect, transform, and route every request before any page-level code executes.

In this lesson you will build the complete hook infrastructure that every subsequent module depends on. You will understand not just what each hook does, but how the `resolve` pipeline works internally, how `sequence()` composes hooks, and the critical security concerns that arise when you get hooks wrong. A misconfigured auth hook means unauthenticated users accessing protected pages. A missing security header means XSS or clickjacking vulnerabilities. A broken error hook means users see raw stack traces in production. These are not edge cases -- they are the exact failures that distinguish amateur applications from production-grade systems.

## The Handle Hook and the resolve Pipeline

The `handle` hook intercepts every HTTP request that SvelteKit processes. It receives two arguments: `event` (the incoming request) and `resolve` (a function that processes the request through SvelteKit's routing system). What you do between receiving the request and calling `resolve` is entirely up to you.

The mental model is middleware. If you have used Express, Koa, or any HTTP framework with middleware, `handle` serves the same purpose. But unlike Express middleware where you call `next()`, in SvelteKit you call `resolve(event)` and it returns a `Response` object. This means you can modify both the request (before `resolve`) and the response (after `resolve`).

```typescript
// The conceptual flow of a request through handle:
//
// Browser → handle() → resolve(event) → router → load functions → render → Response
//                                                                            ↓
// Browser ← handle() ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← Response
```

### Composing Hooks with sequence()

TeamBoard needs three concerns in its handle hook: authentication, logging, and security headers. Cramming all three into one function creates a monolithic handler that is hard to test, hard to reason about, and hard to modify. The `sequence` utility from `@sveltejs/kit/hooks` composes multiple handle functions into one, running them in order:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit';
import { getSession, type SessionUser } from '$lib/server/auth';

const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await getSession(sessionId);
    if (user) {
      event.locals.user = user;
    }
  }

  // If no session or invalid session, event.locals.user remains
  // whatever the default is (null, from the next hook or the framework)
  return resolve(event);
};

const logger: Handle = async ({ event, resolve }) => {
  const start = performance.now();
  const response = await resolve(event);
  const duration = Math.round(performance.now() - start);

  console.log(
    `${event.request.method} ${event.url.pathname} → ${response.status} (${duration}ms)`
  );

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

### How sequence() Works Internally

`sequence` is not magic -- it is a simple combinator. Given hooks `[A, B, C]`, it creates a new hook where:

1. Hook A receives the original `resolve` function replaced with one that calls Hook B
2. Hook B receives a `resolve` function that calls Hook C
3. Hook C receives the real `resolve` function that invokes SvelteKit's router

The chain looks like this:

```
A(event, resolveB) → B(event, resolveC) → C(event, resolveReal) → SvelteKit router
```

This means each hook can:
- Modify `event` before passing it to the next hook
- Short-circuit by returning a response without calling `resolve` (e.g., redirecting unauthenticated users)
- Modify the response returned by `resolve` (e.g., adding headers)

### WRONG: Putting All Concerns in One Handle Function

```typescript
// WRONG -- monolithic handle function
export const handle: Handle = async ({ event, resolve }) => {
  // Auth logic (20 lines)
  const sessionId = event.cookies.get('session');
  if (sessionId) { /* ... */ }

  // Logging logic (10 lines)
  const start = performance.now();

  // Security headers (15 lines)
  // ... mixed together, hard to test individually

  const response = await resolve(event);
  // More logging
  // More headers
  return response;
};
```

This approach makes it impossible to test auth independently from logging, and adding a new concern (rate limiting, CORS, feature flags) means modifying a single growing function. With `sequence`, each concern is its own function that can be tested, enabled, disabled, or reordered independently.

### WRONG: Forgetting to Initialize event.locals

```typescript
// WRONG -- only sets locals when user exists
const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await getSession(sessionId);
    if (user) {
      event.locals.user = user;
    }
  }
  // If no session: event.locals.user is undefined, not null
  // Downstream code checking `if (event.locals.user)` works,
  // but `event.locals.user.email` throws a TypeError instead
  // of a clean "user is null" check

  return resolve(event);
};
```

```typescript
// CORRECT -- always initialize locals to a known state
const auth: Handle = async ({ event, resolve }) => {
  event.locals.user = null;  // Default to null

  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await getSession(sessionId);
    if (user) {
      event.locals.user = user;
    }
  }

  return resolve(event);
};
```

Always initialize `event.locals` to a known default state at the top of your auth hook. This prevents `undefined` vs `null` confusion and ensures downstream code can rely on a consistent type.

## Typing event.locals

TypeScript needs to know the shape of `event.locals`, `App.Error`, and `App.PageState`. Without these declarations, every access to `event.locals.user` requires a type assertion, and your load function return types are imprecise:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: import('$lib/server/auth').SessionUser | null;
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

### What Each Interface Controls

**`Locals`** types the `event.locals` object. Every hook, load function, form action, and API route receives `event.locals`. By declaring its type here, TypeScript can verify that your auth hook sets the right properties and your load functions read them correctly.

**`Error`** types the object returned by your `handleError` hook. When SvelteKit catches an unexpected error, it passes the transformed error to `+error.svelte` pages as `$page.error`. This interface ensures your error pages can safely access `errorId` without type assertions.

**`PageState`** types the state object you pass to `pushState()` and `replaceState()` from `$app/navigation`. TeamBoard uses this for the task detail modal -- when you click a task, the URL changes and the task data is stored in page state. This interface ensures the state object is typed consistently.

### WRONG: Declaring Locals as Optional

```typescript
// WRONG -- optional properties create null-check chaos
interface Locals {
  user?: SessionUser;  // Every consumer must handle undefined AND null
}
```

```typescript
// CORRECT -- explicit null means "no user", required field
interface Locals {
  user: SessionUser | null;  // Consumers check for null only
}
```

The difference between `user?: SessionUser` and `user: SessionUser | null` is significant. With the optional form, TypeScript requires you to handle `undefined` everywhere. With the explicit `null` form, you initialize `user` to `null` in the auth hook and only check for `null` downstream. This is cleaner and less error-prone.

## The handleError Hook

When an unexpected error occurs (a database query throws, an API call fails, a bug in your code causes a runtime exception), SvelteKit catches it and calls `handleError`. This hook transforms the raw error into a safe, user-facing message. Without it, users see raw error messages (or worse, stack traces) that expose internal implementation details.

```typescript
// src/hooks.server.ts (continued)
import crypto from 'crypto';

export const handleError: HandleServerError = async ({
  error,
  event,
  status,
  message
}) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  // Log the full error for debugging (this goes to your server logs)
  console.error(
    `[${errorId}] ${event.request.method} ${event.url.pathname}:`,
    error
  );

  // In production, send to an error tracking service
  // await reportToSentry({ errorId, error, url: event.url.pathname, userId: event.locals.user?.id });

  // Return a safe, generic message to the client
  // NEVER include the raw error message -- it may contain SQL, file paths, or secrets
  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};
```

### Why Error IDs Matter

The `errorId` is a short, unique string that appears in both the server logs and the user-facing error page. When a user reports "I got an error," they can include the error ID, and you can search your logs to find the exact stack trace, request URL, user ID, and timestamp. Without error IDs, user reports of "something is broken" are nearly impossible to debug.

### WRONG: Exposing Raw Error Messages

```typescript
// WRONG -- leaks internal details to the client
export const handleError: HandleServerError = async ({ error }) => {
  return {
    message: error instanceof Error ? error.message : 'Unknown error'
  };
};
```

If the error is a database query failure, the message might be `"relation 'users' does not exist"` or `"connection refused to localhost:5432"`. If it is a file system error, it might be `"ENOENT: no such file or directory, '/app/src/lib/server/schema.ts'"`. These messages reveal your infrastructure, file paths, and database structure to anyone who triggers an error. Always return a generic message and log the real error server-side.

### The Client-Side Error Hook

The client-side hook mirrors the server pattern. Client errors include unhandled promise rejections, runtime exceptions in components, and navigation failures:

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleClientError: HandleClientError = async ({
  error,
  status,
  message
}) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  console.error(`[${errorId}] Client error:`, error);

  // In production, send to error tracking
  // reportToSentry({ errorId, error, status });

  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};
```

Both hooks return an object matching the `App.Error` interface. The `+error.svelte` pages display the `errorId` so users can include it in bug reports:

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>{page.status}</h1>
  <p>{page.error?.message}</p>
  {#if page.error?.errorId}
    <p class="text-sm text-gray-500">
      Error ID: {page.error.errorId}
    </p>
  {/if}
</div>
```

Note the use of `$app/state` instead of the deprecated `$app/stores`. In Svelte 5 / SvelteKit, `page` from `$app/state` is a reactive object -- you access properties directly (`page.status`, `page.error`) without a `$` prefix.

## The handleFetch Hook

When a load function calls `fetch` during server-side rendering, `handleFetch` can intercept and modify the request. TeamBoard uses it to forward the user's session cookie on internal API calls:

```typescript
// src/hooks.server.ts (continued)
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  // Only modify requests to our own origin
  if (request.url.startsWith(event.url.origin)) {
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }
  }

  return fetch(request);
};
```

### Why This Is Necessary

During server-side rendering, load functions run on the server. When a load function calls `fetch('/api/boards')`, the request goes from the server to itself. But the browser's cookies are attached to the original incoming request, not to the internal fetch. Without `handleFetch`, the internal API call has no session cookie, so the API route sees an unauthenticated request and returns 401.

By copying the `cookie` header from the original request to the internal fetch, you ensure that API routes see the same session context during SSR as they would during client-side navigation.

### WRONG: Forwarding Cookies to External APIs

```typescript
// WRONG -- forwards cookies to ANY URL, including external APIs
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const cookie = event.request.headers.get('cookie');
  if (cookie) {
    request.headers.set('cookie', cookie);  // Sends your session to external APIs!
  }
  return fetch(request);
};
```

Always check `request.url.startsWith(event.url.origin)` before forwarding cookies. Sending your session cookie to external APIs is a security vulnerability -- the external service could use it to impersonate the user.

## The reroute Hook

TeamBoard supports optional locale prefixes in URLs. The path `/en/dashboard` and `/dashboard` should resolve to the same route. The `reroute` hook strips the prefix before SvelteKit matches routes:

```typescript
// src/hooks.ts
import type { Reroute } from '@sveltejs/kit';

const locales = ['en', 'es', 'fr', 'pt'];

export const reroute: Reroute = ({ url }) => {
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0])) {
    // Strip the locale prefix: /en/dashboard → /dashboard
    return '/' + segments.slice(1).join('/');
  }
};
```

### Why reroute Instead of Dynamic Routes

You might think "just use `[locale]/dashboard` as a route parameter." But that creates problems:

1. Every route now needs a `[locale]` parameter: `[locale]/dashboard`, `[locale]/settings`, `[locale]/boards/[id]`
2. Every load function must extract and validate the locale
3. Links become harder to construct: do you always include the locale prefix?
4. The root `/dashboard` (without locale) does not match `[locale]/dashboard`

With `reroute`, your route files are clean (`/dashboard`, `/settings`, `/boards/[id]`), and the locale is extracted from `url.pathname` in a layout load function -- one place, not every route.

### WRONG: Using reroute for Authentication Redirects

```typescript
// WRONG -- reroute changes the route that matches, it does NOT redirect
export const reroute: Reroute = ({ url }) => {
  if (url.pathname.startsWith('/admin') && !isAuthenticated()) {
    return '/login';  // This renders /login at the /admin URL, it does NOT redirect
  }
};
```

`reroute` does not send a 302 redirect -- it changes which route SvelteKit matches for the current URL. If you return `/login`, the user sees the login page but their URL bar still shows `/admin`. For authentication redirects, use `redirect()` in a load function or in the handle hook.

### Where the reroute Hook Lives

Unlike `handle` and `handleError`, the `reroute` hook is defined in `src/hooks.ts` (not `src/hooks.server.ts`). This is because rerouting must work on both the server and the client -- client-side navigation also needs to resolve locale prefixes.

## The transport Hook

Load functions can return data that travels from server to client during hydration. By default, SvelteKit serializes JSON-safe values. But `Date` objects, `Map`, `Set`, and custom classes lose their type during serialization -- a `Date` becomes a string, a `Map` becomes a plain object, and a class instance loses its methods.

The `transport` hook teaches SvelteKit how to serialize and deserialize custom types:

```typescript
// src/hooks.ts (continued)
import type { Transport } from '@sveltejs/kit';

export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (value) => new Date(value)
  }
};
```

### How Transport Works

When a load function returns `{ createdAt: new Date('2024-01-15') }`:

1. **Server**: SvelteKit calls `transport.Date.encode(value)`. The `encode` function checks if the value is a `Date` instance. If so, it returns the ISO string representation. If not, it returns `false` (meaning "I don't handle this value").
2. **Wire**: The serialized data includes a type tag: `{ createdAt: { __type: "Date", value: "2024-01-15T00:00:00.000Z" } }`
3. **Client**: SvelteKit calls `transport.Date.decode(value)` with the ISO string, which constructs a real `Date` object.

Without this hook, `createdAt` arrives on the client as a plain string. Every component that displays a date would need to call `new Date(createdAt)` manually. With the transport hook, dates are dates everywhere -- server and client.

### Adding More Types

TeamBoard uses timestamps extensively in task cards, comments, and the activity log. You can add additional types as needed:

```typescript
export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (value) => new Date(value)
  },
  Set: {
    encode: (value) => value instanceof Set && [...value],
    decode: (value) => new Set(value)
  },
  Map: {
    encode: (value) => value instanceof Map && [...value.entries()],
    decode: (value) => new Map(value)
  }
};
```

## Session Helper Module

The hooks reference a `getSession` function. Here is the complete server-side session module that backs the auth hook:

```typescript
// src/lib/server/auth.ts
import { db } from '$lib/server/database';
import { users, sessions as sessionsTable } from '$lib/server/schema';
import { eq, and, gt } from 'drizzle-orm';
import { SESSION_SECRET } from '$env/static/private';
import crypto from 'crypto';

export type SessionUser = {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
};

export function createSession(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Insert into sessions table (async, but we return the token synchronously)
  db.insert(sessionsTable).values({
    token,
    userId,
    expiresAt
  }).execute();

  return token;
}

export async function getSession(
  token: string
): Promise<SessionUser | null> {
  // Query session and user in one join
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      expiresAt: sessionsTable.expiresAt
    })
    .from(sessionsTable)
    .innerJoin(users, eq(sessionsTable.userId, users.id))
    .where(
      and(
        eq(sessionsTable.token, token),
        gt(sessionsTable.expiresAt, new Date())
      )
    )
    .limit(1);

  if (result.length === 0) return null;

  const { expiresAt, ...user } = result[0];
  return user;
}

export async function deleteSession(token: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.token, token));
}

export async function deleteAllUserSessions(
  userId: number
): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(eq(sessionsTable.userId, userId));
}
```

### Why Database Sessions Instead of JWTs

TeamBoard uses database-backed sessions instead of JWTs for three reasons:

1. **Revocation**: When a user logs out or changes their password, you can delete their session(s) from the database immediately. With JWTs, you cannot revoke a token -- it remains valid until it expires. This means a stolen JWT gives an attacker access for the entire token lifetime.

2. **No token size growth**: JWTs include all user data in the token itself. As you add claims (roles, permissions, team memberships), the token grows, and it is sent with every request in a cookie. Database sessions store a fixed-size token (32 bytes) regardless of how much user data exists.

3. **Simpler security model**: JWTs require careful handling of signing algorithms, key rotation, and token refresh. Database sessions are simple: generate a random token, store it, look it up on each request, delete it on logout.

The tradeoff is that database sessions require a database query on every request. For TeamBoard, this is acceptable -- the query is indexed and takes under 1ms.

### WRONG: In-Memory Session Store in Production

```typescript
// WRONG -- sessions are lost on server restart
const sessions = new Map<string, { userId: number; expiresAt: Date }>();
```

An in-memory `Map` works during development because you rarely restart the dev server. In production, every deployment restarts the server, logging out all users. With multiple server instances (horizontal scaling), each instance has its own `Map`, so a session created on instance A does not exist on instance B. Always use a persistent store (database, Redis) for production sessions.

### WRONG: Short Session Tokens

```typescript
// WRONG -- 16 bytes is too short for a session token
const token = crypto.randomBytes(8).toString('hex');  // 16 hex chars

// CORRECT -- 32 bytes provides 256 bits of entropy
const token = crypto.randomBytes(32).toString('hex');  // 64 hex chars
```

Session tokens must be unguessable. With 16 bytes (128 bits), a brute-force attack is theoretically possible with sufficient compute. With 32 bytes (256 bits), the token space is large enough that brute-force is infeasible even with nation-state resources. Always use at least 32 bytes for session tokens.

## Protecting Routes with Load Functions

The auth hook sets `event.locals.user`, but it does not block unauthenticated users from accessing protected routes. That is the job of load functions. TeamBoard's `(app)` layout group has a layout load function that enforces authentication:

```typescript
// src/routes/(app)/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Redirect to login, preserving the intended destination
    const redirectTo = encodeURIComponent(url.pathname);
    redirect(302, `/login?redirectTo=${redirectTo}`);
  }

  // User is authenticated -- pass user data to all child routes
  return {
    user: locals.user
  };
};
```

### WRONG: Blocking Auth in the Handle Hook

```typescript
// WRONG -- checking routes in the handle hook
const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  const user = sessionId ? await getSession(sessionId) : null;

  // This is fragile -- you must manually list every protected route
  if (!user && event.url.pathname.startsWith('/dashboard')) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login' }
    });
  }

  event.locals.user = user;
  return resolve(event);
};
```

This approach requires maintaining a list of protected routes in the handle hook. Every time you add a new protected route, you must update this list. With layout load functions, protection is structural -- any route under `(app)/` is automatically protected because the layout load function runs before any child route.

## Security Headers in Depth

The security headers hook adds HTTP headers that protect against common web vulnerabilities:

```typescript
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Prevent the page from being embedded in an iframe (clickjacking protection)
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent the browser from MIME-sniffing the content type
  // (stops attacks where a file is served as text/plain but interpreted as HTML)
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Control how much referrer information is sent with requests
  // 'strict-origin-when-cross-origin' sends the origin (not the full URL)
  // on cross-origin requests, protecting sensitive URL paths
  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  );

  // Disable browser features the app does not need
  // This prevents malicious scripts from accessing the camera, mic, or geolocation
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  );

  return response;
};
```

### What Each Header Prevents

| Header | Attack Prevented | Without It |
|---|---|---|
| `X-Frame-Options: DENY` | Clickjacking | Attackers embed your page in a transparent iframe and trick users into clicking hidden buttons |
| `X-Content-Type-Options: nosniff` | MIME confusion | A file served as `text/plain` could be interpreted as `text/html`, executing scripts |
| `Referrer-Policy` | URL leakage | The full URL (including query parameters with tokens) is sent to external sites |
| `Permissions-Policy` | Feature abuse | Injected scripts access the camera, microphone, or geolocation |

### WRONG: Adding CSP Without Testing

```typescript
// WRONG -- Content-Security-Policy without testing breaks your app
response.headers.set(
  'Content-Security-Policy',
  "default-src 'self'; script-src 'self'"
);
// This blocks all inline scripts, including SvelteKit's hydration scripts!
```

Content Security Policy (CSP) is the most powerful security header, but it is also the most complex. A strict CSP breaks SvelteKit's inline scripts, third-party analytics, and CDN-hosted fonts. Add CSP only after thorough testing, using `Content-Security-Policy-Report-Only` first to log violations without blocking them.

## Putting It All Together

Here is the complete `hooks.server.ts` file for TeamBoard:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit';
import { getSession } from '$lib/server/auth';
import crypto from 'crypto';

// --- Handle Hooks (composed with sequence) ---

const auth: Handle = async ({ event, resolve }) => {
  event.locals.user = null;

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

  console.log(
    `${event.request.method} ${event.url.pathname} → ${response.status} (${duration}ms)`
  );

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

// --- Error Hook ---

export const handleError: HandleServerError = async ({
  error,
  event,
  status,
  message
}) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  console.error(
    `[${errorId}] ${event.request.method} ${event.url.pathname}:`,
    error
  );

  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};

// --- Fetch Hook ---

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (request.url.startsWith(event.url.origin)) {
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }
  }

  return fetch(request);
};
```

And the universal hooks in `hooks.ts`:

```typescript
// src/hooks.ts
import type { Reroute, Transport } from '@sveltejs/kit';

const locales = ['en', 'es', 'fr', 'pt'];

export const reroute: Reroute = ({ url }) => {
  const segments = url.pathname.split('/').filter(Boolean);

  if (segments.length > 0 && locales.includes(segments[0])) {
    return '/' + segments.slice(1).join('/');
  }
};

export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (value) => new Date(value)
  }
};
```

## Try It

Build and verify the complete hook infrastructure:

1. Create `src/hooks.server.ts` with three composed handle hooks (auth, logger, security headers) using `sequence()`
2. Create `src/hooks.client.ts` with a `handleClientError` hook that generates error IDs
3. Create `src/hooks.ts` with `reroute` (for locale prefixes) and `transport` (for Date serialization)
4. Fill in `src/app.d.ts` with types for `Locals` (user: SessionUser | null), `Error` (message + errorId), and `PageState`
5. Build the session helper module in `src/lib/server/auth.ts` with `createSession`, `getSession`, `deleteSession`, and `deleteAllUserSessions` functions
6. Create a `+layout.server.ts` in `(app)/` that redirects unauthenticated users to `/login`
7. Create an `+error.svelte` page that displays the error message and error ID
8. Verify the logger hook by watching the terminal as you navigate between pages
9. Verify the security headers by checking the Response Headers in browser DevTools
10. Verify auth by accessing a protected route without a session cookie

## Key Takeaways

- **`sequence()` composes multiple handle hooks** -- each handles one concern (auth, logging, security) and can be tested, enabled, or disabled independently
- **Always initialize `event.locals`** to a known default state (e.g., `user = null`) at the top of your auth hook -- this prevents `undefined` vs `null` confusion downstream
- **`handleError` transforms raw errors into safe user-facing messages** with tracking IDs -- never expose raw error messages, stack traces, or internal details to the client
- **`handleFetch` forwards cookies on internal requests** during SSR -- without it, API routes see unauthenticated requests during server-side rendering
- **`reroute` lives in `hooks.ts`** (not `hooks.server.ts`) because it must work on both server and client -- it changes which route matches, not the URL in the browser
- **`transport` teaches SvelteKit how to serialize custom types** (Date, Map, Set) across the server-client boundary during hydration
- **Use `$app/state`** instead of the deprecated `$app/stores` -- access `page.status` and `page.error` directly without a `$` prefix
- **Protect routes with layout load functions**, not the handle hook -- structural protection via `(app)/+layout.server.ts` automatically covers all child routes
- **Use database-backed sessions** instead of JWTs for revocability, fixed token size, and simpler security -- the tradeoff is one indexed database query per request
- **Security headers protect against real attacks** (clickjacking, MIME confusion, referrer leakage, feature abuse) -- add them to every production application
- **`event.locals` is the bridge** between hooks and load functions -- set data in hooks, read it everywhere downstream
