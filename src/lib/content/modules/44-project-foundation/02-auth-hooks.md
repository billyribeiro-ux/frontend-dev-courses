# Authentication Hooks & Session Management

Every request to TeamBoard passes through hooks before reaching any route. Hooks are the backbone of the application -- they handle authentication, logging, security headers, error tracking, URL rewriting, and custom serialization. If load functions are the heart of SvelteKit's data story, hooks are the nervous system: they intercept, inspect, transform, and route every request before any page-level code executes.

In this lesson you will build the complete hook infrastructure that every subsequent module depends on. You will understand not just what each hook does, but how the `resolve` pipeline works internally, how `sequence()` composes hooks, and the critical security concerns that arise when you get hooks wrong.

## How the Resolve Pipeline Works

Before writing any hooks, you need to understand what `resolve` actually does. The `handle` function receives two arguments: `event` (the request context) and `resolve` (a function that continues the pipeline). When you call `resolve(event)`, SvelteKit does the following:

1. **Matches the route.** SvelteKit's router examines `event.url.pathname` and finds the matching `+page.svelte`, `+layout.svelte`, and associated load functions.
2. **Runs load functions.** All `+layout.server.ts`, `+page.server.ts`, `+layout.ts`, and `+page.ts` load functions execute in the correct order.
3. **Renders the page.** SvelteKit renders the component tree (layouts + page) to HTML on the server.
4. **Returns a Response.** The rendered HTML (or JSON for client-side navigations) is wrapped in a standard `Response` object.

Your `handle` function wraps this entire pipeline. You can run code *before* `resolve` (modify the request, attach data to `event.locals`, reject the request entirely) and *after* `resolve` (modify the response, add headers, log timing).

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  // BEFORE resolve — runs before any load function or rendering
  console.log('Request started:', event.url.pathname);
  event.locals.startTime = performance.now();

  // resolve() runs the entire SvelteKit pipeline
  const response = await resolve(event);

  // AFTER resolve — runs after rendering, before sending to client
  const duration = performance.now() - event.locals.startTime;
  response.headers.set('X-Response-Time', `${duration.toFixed(0)}ms`);

  return response;
};
```

### The resolve Options

`resolve` accepts an optional second argument with transformation options:

```typescript
const response = await resolve(event, {
  // Transform the rendered HTML before sending
  transformPageChunk: ({ html }) => {
    return html.replace('%lang%', event.locals.locale ?? 'en');
  },

  // Control which nodes get data-sveltekit-* attributes for hydration
  filterSerializedResponseHeaders: (name) => {
    return name.startsWith('x-');
  },

  // Preload specific resources
  preload: ({ type, path }) => {
    return type === 'js' || type === 'css';
  }
});
```

The `transformPageChunk` option is particularly useful. It receives chunks of the rendered HTML and lets you modify them. A common pattern is replacing placeholder strings in `app.html` with dynamic values:

```html
<!-- src/app.html -->
<html lang="%lang%">
  <head>%sveltekit.head%</head>
  <body>%sveltekit.body%</body>
</html>
```

```typescript
transformPageChunk: ({ html }) => {
  return html.replace('%lang%', getLocaleFromRequest(event));
}
```

## The Handle Hook: Building TeamBoard's Middleware Stack

TeamBoard needs three concerns: authentication, logging, and security headers. Instead of cramming them into one function, use `sequence` to compose them:

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

### How sequence() Works Internally

`sequence` runs each hook in order, passing the response from one to the next. But it is not a simple loop -- it composes the `resolve` functions. Think of it like middleware in Express, where each layer can decide to continue or short-circuit.

Here is what `sequence(auth, logger, securityHeaders)` effectively does:

```typescript
// Conceptual implementation of sequence
async function composedHandle({ event, resolve }) {
  return auth({
    event,
    resolve: (event) => logger({
      event,
      resolve: (event) => securityHeaders({
        event,
        resolve  // The original resolve from SvelteKit
      })
    })
  });
}
```

The auth hook runs first. When it calls `resolve(event)`, that `resolve` is actually the logger hook. When the logger calls `resolve(event)`, that `resolve` is the security headers hook. When security headers calls `resolve(event)`, *that* `resolve` is SvelteKit's actual route handling pipeline.

This nesting means:
- **Before-resolve code** runs in order: auth, then logger, then security headers
- **After-resolve code** runs in reverse order: security headers, then logger, then auth
- Any hook can short-circuit by returning a response without calling `resolve`

### Short-Circuiting the Pipeline

A hook can reject a request by returning a response without calling `resolve`. This is how you implement route guards:

```typescript
const requireAuth: Handle = async ({ event, resolve }) => {
  const protectedPaths = ['/dashboard', '/settings', '/api/tasks'];

  if (protectedPaths.some(p => event.url.pathname.startsWith(p))) {
    if (!event.locals.user) {
      // Short-circuit — never reaches the route
      return new Response(null, {
        status: 303,
        headers: { Location: '/login' }
      });
    }
  }

  return resolve(event);
};
```

**Important:** This `requireAuth` hook must come *after* the `auth` hook in the `sequence`, because it depends on `event.locals.user` being set. Hook order matters.

```typescript
// CORRECT order — auth populates user, then requireAuth checks it
export const handle = sequence(auth, requireAuth, logger, securityHeaders);

// WRONG order — requireAuth runs before user is populated
export const handle = sequence(requireAuth, auth, logger, securityHeaders);
```

## Authorization: Hooks vs Load Functions vs Form Actions

A common question: where should authorization checks live? The answer depends on what you are protecting.

### Hooks: Broad Path-Based Protection

Hooks are best for coarse-grained, path-based checks. "All routes under `/admin` require admin role" is a perfect hook use case because it is a blanket rule that applies regardless of what the specific page does.

```typescript
const requireAdmin: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/admin')) {
    if (event.locals.user?.role !== 'admin' && event.locals.user?.role !== 'owner') {
      return new Response(null, {
        status: 303,
        headers: { Location: '/' }
      });
    }
  }

  return resolve(event);
};
```

### Load Functions: Data-Specific Authorization

Load functions are best for "can this user access *this specific resource*?" checks, where the resource ID comes from the URL.

```typescript
// src/routes/(app)/[teamSlug]/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ params, locals }) => {
  if (!locals.user) {
    error(401, 'Not authenticated');
  }

  const membership = await db.query.teamMembers.findFirst({
    where: and(
      eq(teamMembers.teamId, team.id),
      eq(teamMembers.userId, locals.user.id)
    )
  });

  if (!membership) {
    error(403, 'You are not a member of this team');
  }

  return { team, membership };
};
```

### Form Actions: Operation-Specific Authorization

Form actions should verify authorization for the specific operation being performed, especially for destructive actions.

```typescript
// src/routes/(app)/[teamSlug]/settings/+page.server.ts
export const actions = {
  deleteTeam: async ({ locals, params }) => {
    if (!locals.user) error(401);

    const membership = await getTeamMembership(params.teamSlug, locals.user.id);

    // Only the owner can delete the team
    if (membership.role !== 'owner') {
      error(403, 'Only the team owner can delete the team');
    }

    await deleteTeam(membership.teamId);
    redirect(303, '/dashboard');
  }
};
```

### The Decision Framework

| Question | Use |
|----------|-----|
| "Is the user logged in at all?" | Hook |
| "Does the user have admin/owner role?" | Hook (path-based) or load function (resource-based) |
| "Is the user a member of this team?" | Load function (resource-specific) |
| "Can the user perform this action?" | Form action (operation-specific) |
| "Is this API key valid?" | Hook |
| "Has the user exceeded rate limits?" | Hook |

## CSRF Protection

SvelteKit has built-in CSRF protection that rejects cross-origin POST requests. This is enabled by default in `svelte.config.js`:

```javascript
export default {
  kit: {
    csrf: {
      checkOrigin: true  // This is the default
    }
  }
};
```

When `checkOrigin` is true, SvelteKit compares the `Origin` header of POST requests against the app's URL. If they don't match, the request is rejected with a 403. This prevents other websites from submitting forms to your app on behalf of your users.

**Never disable this without a replacement.** If you need to accept cross-origin POST requests (e.g., webhooks), handle those in `+server.ts` API routes with their own verification:

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST({ request }) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  try {
    // Stripe's own signature verification replaces CSRF protection
    const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    // Handle the event...
    return new Response('OK');
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }
}
```

## Rate Limiting in Hooks

For production applications, rate limiting prevents abuse. Here is a simple in-memory rate limiter for TeamBoard:

```typescript
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT = 100;     // requests
const RATE_WINDOW = 60_000; // per minute

const rateLimit: Handle = async ({ event, resolve }) => {
  // Only rate-limit API routes and form submissions
  if (!event.url.pathname.startsWith('/api') && event.request.method === 'GET') {
    return resolve(event);
  }

  const ip = event.getClientAddress();
  const now = Date.now();
  const entry = rateLimiter.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimiter.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return resolve(event);
  }

  entry.count++;

  if (entry.count > RATE_LIMIT) {
    return new Response('Too many requests', {
      status: 429,
      headers: {
        'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000))
      }
    });
  }

  return resolve(event);
};
```

**Production note:** In-memory rate limiting only works for single-server deployments. For multi-server or serverless deployments, use Redis or a rate limiting service. The in-memory map also grows unbounded -- in production, add periodic cleanup of expired entries or use a library like `rate-limiter-flexible`.

## Request Logging

The logger hook from earlier is minimal. Here is a production-grade version with structured logging:

```typescript
const logger: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const start = performance.now();

  // Attach request ID for downstream use (error tracking, etc.)
  event.locals.requestId = requestId;

  const response = await resolve(event);

  const duration = Math.round(performance.now() - start);
  const logData = {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    status: response.status,
    duration,
    userId: event.locals.user?.id ?? null,
    userAgent: event.request.headers.get('user-agent')?.slice(0, 100)
  };

  if (response.status >= 500) {
    console.error('[ERROR]', JSON.stringify(logData));
  } else if (response.status >= 400) {
    console.warn('[WARN]', JSON.stringify(logData));
  } else {
    console.log('[INFO]', JSON.stringify(logData));
  }

  // Add request ID header for client-side debugging
  response.headers.set('X-Request-Id', requestId);

  return response;
};
```

Structured JSON logging is essential for production because log aggregation tools (Datadog, CloudWatch, Grafana Loki) can parse and index JSON fields. With plain text logs, searching for "all requests from user 42 that took more than 500ms" requires regex. With structured logs, it is a simple query.

## Typing event.locals

Tell TypeScript about all the properties you set on `event.locals`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: import('$server/auth').SessionUser | null;
      requestId: string;
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

The `PageState` interface types the state object you pass to `pushState` and `replaceState` -- you will use this for the task detail modal in Module 48. The `Error` interface adds an `errorId` field that `handleError` will populate.

## The handleError Hook

When an unexpected error occurs, `handleError` transforms it into a safe, user-facing error. TeamBoard generates a unique error ID for each failure so users can report issues:

```typescript
// src/hooks.server.ts (continued)
import crypto from 'crypto';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID().slice(0, 8);

  // Log the full error for debugging
  console.error(`[${errorId}] ${event.request.method} ${event.url.pathname}:`, error);

  // In production, send to error tracking service
  // await reportError({
  //   errorId,
  //   error,
  //   url: event.url.pathname,
  //   userId: event.locals.user?.id,
  //   requestId: event.locals.requestId
  // });

  // Return a safe error object — never expose internal details to the client
  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};
```

### Why handleError Matters for Security

The raw `error` object might contain stack traces, database queries, file paths, and other internal details. If you pass it directly to the client, you leak server internals. The `handleError` hook is your last line of defense -- it intercepts the raw error and returns a sanitized object that matches your `App.Error` interface.

```typescript
// WRONG — leaking internal details
export const handleError: HandleServerError = async ({ error }) => {
  return {
    message: error.message,  // Might be "connection refused at postgres://admin:password@..."
    stack: error.stack       // Full file paths and line numbers
  };
};

// CORRECT — safe, generic message with tracking ID
export const handleError: HandleServerError = async ({ error, status }) => {
  const errorId = crypto.randomUUID().slice(0, 8);
  console.error(`[${errorId}]`, error);  // Full error stays on the server
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

### Why This Is Necessary

During SSR, load functions run on the server. When they call `fetch('/api/tasks')`, the fetch goes from the server to itself. But this internal fetch does not include the browser's cookies -- it is a new HTTP request without the session cookie. The API route sees an unauthenticated request and returns 401.

`handleFetch` solves this by copying the original request's cookies onto the internal fetch. Now the API route sees the session cookie and can authenticate the request.

```typescript
// src/routes/(app)/dashboard/+page.server.ts
export const load = async ({ fetch }) => {
  // This fetch goes through handleFetch during SSR
  // Without handleFetch forwarding cookies, this would get 401
  const response = await fetch('/api/tasks');
  const tasks = await response.json();
  return { tasks };
};
```

**Note:** For most TeamBoard routes, you should query the database directly in load functions rather than going through API routes. The `handleFetch` pattern is most useful when you have standalone API routes that are also called from the client side and you want to reuse them during SSR.

## The reroute Hook

TeamBoard supports optional locale prefixes in URLs. The path `/en/dashboard` and `/dashboard` should resolve to the same route. The `reroute` hook strips the prefix before SvelteKit matches routes:

```typescript
// src/hooks.ts (note: not hooks.server.ts — reroute runs on both server and client)
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

The locale itself is not lost -- you can read it from `url.pathname` in layout load functions and use it for translations. The `reroute` hook only affects which route file SvelteKit matches, not the URL the user sees.

**Important:** The `reroute` hook lives in `src/hooks.ts` (without `.server`), because it needs to run on both server and client. Server-side rerouting affects SSR route matching, and client-side rerouting affects client-side navigation.

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

### Why Not Just Return ISO Strings?

You could return `createdAt.toISOString()` from every load function and call `new Date(isoString)` in every component. But this has three problems:

1. **Repetitive.** Every component that displays a date must parse it.
2. **Fragile.** If you forget the parse in one component, you get `[object Object]` or `Invalid Date`.
3. **Type-unsafe.** The load function says it returns a `Date`, but the client receives a `string`. TypeScript does not catch this mismatch.

The `transport` hook solves all three: dates are real `Date` objects on both server and client, with zero per-component boilerplate.

## The Complete hooks.server.ts

Here is the full hooks file for TeamBoard, composing all the concerns:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle, HandleFetch, HandleServerError, Transport } from '@sveltejs/kit';
import { getSession } from '$server/auth';
import crypto from 'crypto';

// ===== Authentication =====
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

// ===== Request Logging =====
const logger: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const start = performance.now();
  event.locals.requestId = requestId;

  const response = await resolve(event);

  const duration = Math.round(performance.now() - start);
  const level = response.status >= 500 ? 'ERROR' : response.status >= 400 ? 'WARN' : 'INFO';

  console.log(`[${level}] ${requestId} ${event.request.method} ${event.url.pathname} → ${response.status} (${duration}ms)`);

  response.headers.set('X-Request-Id', requestId);
  return response;
};

// ===== Security Headers =====
const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-XSS-Protection', '0');  // Disabled — modern CSP is better

  return response;
};

// ===== Route Protection =====
const requireAuth: Handle = async ({ event, resolve }) => {
  const protectedPrefixes = ['/(app)'];

  // Check if the resolved route belongs to a protected group
  const routeId = event.route.id;
  if (routeId && protectedPrefixes.some(p => routeId.startsWith(p))) {
    if (!event.locals.user) {
      const redirectTo = encodeURIComponent(event.url.pathname);
      return new Response(null, {
        status: 303,
        headers: { Location: `/login?redirect=${redirectTo}` }
      });
    }
  }

  return resolve(event);
};

// ===== Compose all hooks =====
export const handle = sequence(auth, requireAuth, logger, securityHeaders);

// ===== Error Handling =====
export const handleError: HandleServerError = async ({ error, event, status }) => {
  const errorId = crypto.randomUUID().slice(0, 8);
  console.error(`[${errorId}] ${event.request.method} ${event.url.pathname}:`, error);

  return {
    message: status === 404 ? 'Page not found' : 'Something went wrong',
    errorId
  };
};

// ===== Internal Fetch Cookie Forwarding =====
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  if (request.url.startsWith(event.url.origin)) {
    const cookie = event.request.headers.get('cookie');
    if (cookie) {
      request.headers.set('cookie', cookie);
    }
  }
  return fetch(request);
};

// ===== Custom Type Serialization =====
export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (value) => new Date(value)
  }
};
```

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

### Production Session Storage

The in-memory `Map` above is fine for development but has three critical problems in production:

1. **Lost on restart.** Every server restart logs out all users.
2. **Not shared across instances.** If you have multiple server instances behind a load balancer, a user authenticated on instance A gets 401 on instance B.
3. **Memory growth.** Without cleanup, expired sessions accumulate indefinitely.

For production, store sessions in the database (using the sessions table from the schema) or in Redis. The interface stays the same -- only the storage implementation changes.

## Common Hook Mistakes

### WRONG: Forgetting to Initialize Locals

```typescript
// WRONG — if no session cookie, locals.user is undefined (not null)
const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    const user = await getSession(sessionId);
    if (user) {
      event.locals.user = user;  // Only set when authenticated
    }
  }
  // If no session, locals.user is never set — it's undefined
  return resolve(event);
};
```

```typescript
// CORRECT — always initialize to null
const auth: Handle = async ({ event, resolve }) => {
  event.locals.user = null;  // Default

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

When `locals.user` is `undefined`, checking `if (locals.user)` works, but `locals.user === null` fails. This causes subtle bugs in components that explicitly check for null.

### WRONG: Blocking Requests During Session Validation

```typescript
// WRONG — every request waits for database query, even static assets
const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    // This query runs on EVERY request — images, CSS, JS files
    const user = await getSession(sessionId);
    event.locals.user = user;
  }
  return resolve(event);
};
```

In development, this is fine. In production, static assets are typically served by a CDN or reverse proxy before reaching your SvelteKit app. But for API routes and page requests, the session query is unavoidable -- it is the cost of server-side authentication.

If session validation latency is a concern, cache sessions in memory with a short TTL:

```typescript
const sessionCache = new Map<string, { user: SessionUser; cachedAt: number }>();
const CACHE_TTL = 60_000; // 1 minute

async function getCachedSession(token: string): Promise<SessionUser | null> {
  const cached = sessionCache.get(token);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.user;
  }

  const user = await getSession(token);
  if (user) {
    sessionCache.set(token, { user, cachedAt: Date.now() });
  }
  return user;
}
```

## Try It

Review the complete `hooks.server.ts` file you have built. Verify that:
- `sequence` composes auth, requireAuth, logger, and security headers in the correct order
- Auth hook initializes `event.locals.user` to null before checking the session
- `requireAuth` short-circuits with a redirect for protected routes
- `handleError` returns an object matching `App.Error` with a unique `errorId`
- `handleFetch` forwards cookies only on same-origin requests
- `reroute` strips locale prefixes without losing the locale information
- `transport` handles Date serialization for the server-client boundary

Then test these scenarios:
1. Access `/dashboard` without a session cookie -- verify redirect to `/login`
2. Access `/dashboard` with a valid session -- verify the page loads with `event.locals.user` populated
3. Trigger a 500 error -- verify the `errorId` appears in both the server log and the client error page
4. Make a fetch call from a load function to an API route -- verify the session cookie is forwarded

## Key Takeaways

- The `resolve` function runs SvelteKit's entire pipeline (routing, load functions, rendering) -- your hook wraps this pipeline with before/after logic
- `sequence` composes multiple handle hooks where each hook's `resolve` calls the next hook -- before-code runs in order, after-code runs in reverse
- **Hook order in `sequence` matters** -- auth must run before requireAuth, and both must run before logger if you want the user ID in logs
- Hooks can **short-circuit** by returning a response without calling `resolve` -- this is how route guards work
- **Always initialize `event.locals`** to null/default values, not just when the condition is met -- prevents undefined vs null bugs
- `handleError` is a security boundary -- **never expose raw error messages, stack traces, or database queries** to the client
- `handleFetch` forwards cookies on internal fetches during SSR -- without it, server-side fetch calls to your own API routes fail authentication
- **Authorization at three levels:** hooks for broad path-based rules, load functions for resource-specific access, form actions for operation-specific permissions
- `reroute` lives in `hooks.ts` (not `hooks.server.ts`) because it runs on both server and client for route matching
- `transport` teaches SvelteKit to serialize custom types (Date, Map, Set) across the server-client boundary -- eliminates per-component date parsing
- `event.locals` is the bridge between hooks and load functions -- set data in hooks, read it everywhere downstream
- Type your locals, errors, and page state in `app.d.ts` for full TypeScript safety across the entire request lifecycle
