# Hooks Deep Dive

Hooks are SvelteKit's middleware system. They let you intercept every request before it reaches your routes, modify responses before they leave the server, handle errors globally, customize fetch behavior during SSR, rewrite URLs, and teach SvelteKit how to serialize custom data types. If you have used middleware in Express or Next.js, hooks serve the same purpose — but with a cleaner, more composable API and clear separation between server-side and universal concerns.

SvelteKit provides three hook files:

- **`src/hooks.server.ts`** — server-only hooks (`handle`, `handleFetch`, `handleError`)
- **`src/hooks.client.ts`** — client-only hooks (`handleError`)
- **`src/hooks.ts`** — universal hooks (`reroute`, `transport`)

All three are optional. You create them only when you need them. Most applications need at least `hooks.server.ts` for authentication.

## The handle Hook

The `handle` function in `src/hooks.server.ts` intercepts every HTTP request that hits your SvelteKit server — page requests, API route requests, data requests, everything. It receives the `event` (the incoming request) and a `resolve` function (which processes the route normally). You can modify the request before resolving, modify the response after, or skip resolving entirely.

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const start = performance.now();

  // Add data to event.locals (available in all load functions and actions)
  event.locals.requestId = crypto.randomUUID();

  // Resolve the request normally
  const response = await resolve(event);

  // Modify the response
  const duration = Math.round(performance.now() - start);
  response.headers.set('X-Request-Duration', `${duration}ms`);
  response.headers.set('X-Request-Id', event.locals.requestId);

  return response;
};
```

### The event Object

The `event` parameter is a `RequestEvent` with these properties:

- **`request`** — the native `Request` object (method, headers, body, url)
- **`url`** — a `URL` object parsed from the request
- **`params`** — route parameters (empty object in `handle` since route matching has not happened yet for some requests)
- **`route`** — the matched route's `id` (e.g., `/blog/[slug]`)
- **`cookies`** — a helper for getting, setting, and deleting cookies
- **`locals`** — a per-request object for passing data to load functions and actions
- **`platform`** — adapter-specific platform data (e.g., Cloudflare Workers' `env` and `ctx`)
- **`isDataRequest`** — `true` when SvelteKit is fetching data for client-side navigation (not a full page load)
- **`isSubRequest`** — `true` when the request was made by SvelteKit itself (e.g., a server-side `fetch` to an internal API route)
- **`fetch`** — a special `fetch` that can call internal API routes directly without going through the network

### The resolve Function

`resolve` processes the request through SvelteKit's normal pipeline — route matching, running load functions, rendering the page, etc. It accepts an optional second argument with options:

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event, {
    // Transform the HTML before it is sent to the client
    transformPageChunk: ({ html }) => {
      return html.replace('%theme%', getTheme(event.cookies));
    },

    // Control which headers from server-side fetch responses are serialized
    filterSerializedResponseHeaders: (name) => {
      return name.startsWith('x-') || name === 'content-type';
    },

    // Control which resources are preloaded
    preload: ({ type, path }) => {
      // Preload fonts and critical CSS
      if (type === 'font') return true;
      if (type === 'css') return true;
      // Skip preloading large JS modules
      if (type === 'js' && path.includes('heavy-module')) return false;
      return true; // Default: preload
    }
  });

  return response;
};
```

#### transformPageChunk

Called with each chunk of the rendered HTML. For non-streamed responses, there is a single chunk containing the entire page. For streamed responses, you get multiple chunks. Use this for:

- Injecting theme classes into `<html>` or `<body>`
- Adding nonce attributes for CSP
- Server-side string replacement of placeholders

```typescript
transformPageChunk: ({ html, done }) => {
  if (done) {
    // This is the last (or only) chunk
    const nonce = crypto.randomUUID();
    event.locals.cspNonce = nonce;
    return html.replace('%nonce%', nonce);
  }
  return html;
}
```

#### filterSerializedResponseHeaders

When a load function makes a `fetch` call to an internal API route during SSR, SvelteKit serializes the response so the client can replay it during hydration. By default, no response headers are included. Use this option to whitelist headers the client needs:

```typescript
filterSerializedResponseHeaders: (name) => {
  // Include cache control and custom headers
  return ['cache-control', 'content-type', 'x-total-count', 'x-page'].includes(name);
}
```

This is important for APIs that return pagination info or cache directives in headers.

#### preload

Controls `<link rel="preload">` tags in the HTML head. Return `true` to preload, `false` to skip. The `type` parameter is `'js'`, `'css'`, or `'font'`.

### Authentication with handle

The most common `handle` use case is authentication — checking for a session cookie, validating it, and attaching the user to `event.locals`:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = await db.sessions.findUnique({
      where: { id: sessionId },
      include: { user: true }
    });

    if (session && new Date(session.expiresAt) > new Date()) {
      event.locals.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role
      };

      // Extend session on activity (sliding window)
      if (shouldExtendSession(session.expiresAt)) {
        const newExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.sessions.update({
          where: { id: sessionId },
          data: { expiresAt: newExpiry }
        });
        event.cookies.set('session', sessionId, {
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60
        });
      }
    } else if (session) {
      // Session expired — clean up
      await db.sessions.delete({ where: { id: sessionId } });
      event.cookies.delete('session', { path: '/' });
    }
  }

  return resolve(event);
};

function shouldExtendSession(expiresAt: Date): boolean {
  const remaining = expiresAt.getTime() - Date.now();
  const halfLife = 3.5 * 24 * 60 * 60 * 1000; // 3.5 days
  return remaining < halfLife; // Extend when less than half the TTL remains
}
```

### Returning Early from handle

You can skip `resolve()` entirely and return your own response. This is useful for health checks, CORS preflight, and blocking requests:

```typescript
export const handle: Handle = async ({ event, resolve }) => {
  // Health check endpoint — no need to go through the router
  if (event.url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Block requests to sensitive paths
  if (event.url.pathname.startsWith('/.env')) {
    return new Response('Not found', { status: 404 });
  }

  return resolve(event);
};
```

## Chaining Hooks with sequence

When you need multiple concerns — authentication, logging, security headers, CORS, rate limiting — use `sequence` to compose them. Each hook runs in order, and each can modify the event or response:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const auth: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session');
  if (session) {
    event.locals.user = await validateSession(session);
  }
  return resolve(event);
};

const logging: Handle = async ({ event, resolve }) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();
  event.locals.requestId = requestId;

  console.log(`[${requestId}] ${event.request.method} ${event.url.pathname}`);

  const response = await resolve(event);

  const duration = Math.round(performance.now() - start);
  console.log(`[${requestId}] ${response.status} (${duration}ms)`);

  return response;
};

const security: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy
  const nonce = event.locals.cspNonce ?? '';
  response.headers.set('Content-Security-Policy', [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: https:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`
  ].join('; '));

  return response;
};

const rateLimit: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const ip = event.getClientAddress();
    const key = `rate:${ip}:${event.url.pathname}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60); // 60-second window
    }

    if (count > 100) { // 100 requests per minute
      return new Response(
        JSON.stringify({ error: 'Too many requests' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60'
          }
        }
      );
    }
  }

  return resolve(event);
};

const cors: Handle = async ({ event, resolve }) => {
  const allowedOrigins = ['https://example.com', 'https://staging.example.com'];
  const origin = event.request.headers.get('origin');

  // Handle CORS preflight
  if (event.request.method === 'OPTIONS' && origin) {
    if (allowedOrigins.includes(origin)) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400'
        }
      });
    }
  }

  const response = await resolve(event);

  if (origin && allowedOrigins.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
};

export const handle = sequence(auth, logging, rateLimit, cors, security);
```

### How sequence Works Internally

`sequence` creates a chain where each hook's `resolve` function is the next hook in the sequence. Conceptually:

```
Request → auth → logging → rateLimit → cors → security → SvelteKit Router → Response
```

Each hook wraps the next. If `rateLimit` returns a 429 response without calling `resolve()`, `cors` and `security` never run. This means the order matters:

- Put `auth` first so that `event.locals.user` is available in all subsequent hooks.
- Put `logging` early so it captures the full request lifecycle.
- Put `rateLimit` before `cors` so you rate-limit before doing CORS processing.
- Put `security` last so security headers are added to all responses (including those from earlier hooks).

### Extracting Hooks into Modules

For large applications, keep hooks in separate files:

```typescript
// src/lib/server/hooks/auth.ts
import type { Handle } from '@sveltejs/kit';

export const auth: Handle = async ({ event, resolve }) => {
  // ... auth logic
  return resolve(event);
};
```

```typescript
// src/lib/server/hooks/logging.ts
import type { Handle } from '@sveltejs/kit';

export const logging: Handle = async ({ event, resolve }) => {
  // ... logging logic
  return resolve(event);
};
```

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { auth } from '$lib/server/hooks/auth';
import { logging } from '$lib/server/hooks/logging';
import { security } from '$lib/server/hooks/security';
import { rateLimit } from '$lib/server/hooks/rate-limit';

export const handle = sequence(auth, logging, rateLimit, security);
```

This keeps `hooks.server.ts` clean and makes each hook independently testable.

## handleFetch

The `handleFetch` hook intercepts outgoing `fetch` calls made during server-side load functions. This lets you add authentication headers, rewrite URLs, or bypass the network for internal requests:

```typescript
// src/hooks.server.ts
import type { HandleFetch } from '@sveltejs/kit';

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  // Add auth header to all API requests
  if (request.url.startsWith('https://api.myservice.com')) {
    const newRequest = new Request(request, {
      headers: {
        ...Object.fromEntries(request.headers),
        Authorization: `Bearer ${event.locals.apiToken}`
      }
    });
    return fetch(newRequest);
  }

  // Rewrite internal API calls to go direct (skip the network)
  if (request.url.startsWith(event.url.origin + '/api/')) {
    // SvelteKit's fetch already handles internal requests efficiently,
    // but you can rewrite to hit a different backend
    const rewritten = new Request(
      request.url.replace(event.url.origin, 'http://internal-api:3000'),
      request
    );
    return fetch(rewritten);
  }

  return fetch(request);
};
```

### When handleFetch Runs

`handleFetch` only intercepts `fetch` calls that happen during server-side rendering — in server load functions, form actions, and API route handlers. Client-side `fetch` calls are not affected. This makes it ideal for:

- **Service-to-service authentication**: Add internal tokens that the client should never see.
- **URL rewriting**: Redirect API calls to internal services in a microservices architecture.
- **Request modification**: Add tracing headers, modify query parameters, or change the request method.

```typescript
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  // Add distributed tracing headers
  const headers = new Headers(request.headers);
  headers.set('X-Request-Id', event.locals.requestId);
  headers.set('X-Trace-Id', event.locals.traceId);

  // Forward auth cookies to same-origin requests
  if (new URL(request.url).origin === event.url.origin) {
    headers.set('cookie', event.request.headers.get('cookie') ?? '');
  }

  return fetch(new Request(request, { headers }));
};
```

### Cookie Forwarding Caveat

When SvelteKit makes a `fetch` to an internal API route during SSR, it does not automatically forward the browser's cookies. This is a security measure — but it means your API routes will not see the session cookie unless you explicitly forward it. SvelteKit handles same-origin requests specially (it does forward cookies for those), but cross-origin requests need explicit handling in `handleFetch`.

## handleError

Unhandled errors in load functions, actions, and API routes pass through `handleError`. Use it to log errors to an external service and return a sanitized message to the user:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({
  error, event, status, message
}) => {
  const errorId = crypto.randomUUID();

  // Log the full error with context
  console.error(`[${errorId}]`, {
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error,
    url: event.url.pathname,
    method: event.request.method,
    status,
    user: event.locals.user?.id ?? 'anonymous',
    requestId: event.locals.requestId
  });

  // Report to external service (Sentry, DataDog, etc.)
  if (status >= 500) {
    await reportToSentry({
      error,
      tags: {
        errorId,
        url: event.url.pathname,
        userId: event.locals.user?.id
      }
    });
  }

  // Return a safe message (this is what the user sees via $page.error)
  return {
    message: status >= 500
      ? 'An internal error occurred. Our team has been notified.'
      : message,
    errorId
  };
};
```

### Expected vs Unexpected Errors

SvelteKit distinguishes between expected errors (created with `error()` from `@sveltejs/kit`) and unexpected errors (thrown exceptions). Only unexpected errors pass through `handleError`. Expected errors are already safe — they have a known status code and message:

```typescript
import { error } from '@sveltejs/kit';

// Expected error — does NOT go through handleError
throw error(404, 'Product not found');

// Unexpected error — DOES go through handleError
throw new Error('Database connection failed');
```

This design means `handleError` only deals with genuine surprises — bugs, infrastructure failures, and edge cases you did not anticipate.

### Client-Side handleError

The `src/hooks.client.ts` file provides `handleError` for catching unhandled client-side errors — errors in event handlers, effects, and other browser-only code:

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({
  error, message, status
}) => {
  const errorId = crypto.randomUUID();

  // Log to console in development
  console.error(`[${errorId}] Client error:`, error);

  // Report to error tracking service
  try {
    await fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorId,
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        url: location.href,
        userAgent: navigator.userAgent,
        status
      })
    });
  } catch {
    // Error reporting failed — do not throw
  }

  return {
    message: 'An unexpected error occurred.',
    errorId
  };
};
```

### Typing the Error Object

Declare your error shape in `app.d.ts` so `$page.error` is properly typed:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Error {
      message: string;
      errorId?: string;
    }
  }
}
export {};
```

Then in your error page:

```svelte
<!-- +error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>Error {page.status}</h1>
<p>{page.error?.message}</p>

{#if page.error?.errorId}
  <p class="error-id">
    Reference: {page.error.errorId}
  </p>
{/if}
```

## The reroute Hook

The `reroute` hook rewrites URLs before SvelteKit matches them to routes. It runs universally (server and client), so it lives in `src/hooks.ts` (not `hooks.server.ts`):

```typescript
// src/hooks.ts
import type { Reroute } from '@sveltejs/kit';

const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es', 'ja'];

export const reroute: Reroute = ({ url }) => {
  const [, maybeLocale, ...rest] = url.pathname.split('/');

  // /fr/about → resolve to /about (locale is handled elsewhere)
  if (SUPPORTED_LOCALES.includes(maybeLocale)) {
    return `/${rest.join('/')}`;
  }
};
```

With this hook, `/fr/about`, `/de/about`, and `/about` all resolve to `src/routes/about/+page.svelte`. The load function can read the locale from the URL:

```typescript
// src/routes/about/+page.server.ts
export const load = async ({ url }) => {
  const [, maybeLocale] = url.pathname.split('/');
  const locale = SUPPORTED_LOCALES.includes(maybeLocale) ? maybeLocale : 'en';

  return {
    content: await loadContent('about', locale),
    locale
  };
};
```

### Vanity URLs and Legacy Redirects

```typescript
export const reroute: Reroute = ({ url }) => {
  const vanityUrls: Record<string, string> = {
    '/jobs': '/careers',
    '/team': '/about/team',
    '/docs': '/documentation',
    '/pricing-old': '/pricing'
  };

  if (url.pathname in vanityUrls) {
    return vanityUrls[url.pathname];
  }
};
```

Note the difference between `reroute` and `redirect`: `reroute` changes which route handles the request without changing the URL in the browser. `redirect` sends the browser to a different URL. Use `reroute` for internal routing decisions and `redirect` for actual URL changes.

### A/B Testing with reroute

```typescript
export const reroute: Reroute = ({ url }) => {
  if (url.pathname === '/pricing') {
    // Cookie-based A/B test — the cookie is set elsewhere
    const variant = url.searchParams.get('variant');
    if (variant === 'b') {
      return '/pricing-b';
    }
  }
};
```

## The transport Hook

The `transport` hook teaches SvelteKit how to serialize and deserialize custom types when passing data from server load functions to the client. By default, only JSON-compatible data survives the server-to-client boundary.

```typescript
// src/hooks.ts
import type { Transport } from '@sveltejs/kit';

export const transport: Transport = {
  Date: {
    encode: (value) => value instanceof Date && value.toISOString(),
    decode: (str) => new Date(str)
  },
  Set: {
    encode: (value) => value instanceof Set && [...value],
    decode: (arr) => new Set(arr)
  },
  Map: {
    encode: (value) => value instanceof Map && [...value.entries()],
    decode: (entries) => new Map(entries)
  }
};
```

Now your load functions can return `Date`, `Set`, and `Map` objects, and they arrive on the client as real instances:

```typescript
// +page.server.ts
export const load = async () => {
  return {
    createdAt: new Date(),           // Arrives as a real Date object
    tags: new Set(['svelte', 'kit']), // Arrives as a real Set
    metadata: new Map([['key', 'value']]) // Arrives as a real Map
  };
};
```

### Custom Classes

Transport works with custom classes too:

```typescript
// src/lib/money.ts
export class Money {
  constructor(public amount: number, public currency: string) {}

  format() {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.currency
    }).format(this.amount / 100);
  }
}
```

```typescript
// src/hooks.ts
import { Money } from '$lib/money';

export const transport: Transport = {
  Money: {
    encode: (value) =>
      value instanceof Money && { amount: value.amount, currency: value.currency },
    decode: ({ amount, currency }) => new Money(amount, currency)
  }
};
```

```typescript
// +page.server.ts
export const load = async () => {
  return {
    price: new Money(1999, 'USD') // Arrives on client as Money instance with .format()
  };
};
```

## Complete Production Hooks Setup

Here is a full production `hooks.server.ts` that ties everything together:

```typescript
// src/hooks.server.ts
import type { Handle, HandleFetch, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { db } from '$lib/server/db';
import { reportError } from '$lib/server/error-reporting';

// --- Authentication ---
const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const session = await db.sessions.findUnique({
      where: { id: sessionId },
      include: { user: { select: { id: true, email: true, name: true, role: true } } }
    });

    if (session && new Date(session.expiresAt) > new Date()) {
      event.locals.user = session.user;
    }
  }

  return resolve(event);
};

// --- Request Logging ---
const logging: Handle = async ({ event, resolve }) => {
  const requestId = crypto.randomUUID();
  const start = performance.now();
  event.locals.requestId = requestId;

  const response = await resolve(event);

  const duration = Math.round(performance.now() - start);
  const logData = {
    requestId,
    method: event.request.method,
    path: event.url.pathname,
    status: response.status,
    duration: `${duration}ms`,
    user: event.locals.user?.id ?? 'anonymous'
  };

  if (response.status >= 500) {
    console.error('Request failed:', logData);
  } else if (response.status >= 400) {
    console.warn('Client error:', logData);
  } else {
    console.log('Request:', logData);
  }

  response.headers.set('X-Request-Id', requestId);
  return response;
};

// --- Security Headers ---
const security: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
};

// --- Compose all hooks ---
export const handle = sequence(auth, logging, security);

// --- Customize SSR fetch behavior ---
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  const headers = new Headers(request.headers);
  headers.set('X-Request-Id', event.locals.requestId);

  if (request.url.startsWith('https://api.internal.com')) {
    headers.set('Authorization', `Bearer ${process.env.INTERNAL_API_KEY}`);
  }

  return fetch(new Request(request, { headers }));
};

// --- Global error handling ---
export const handleError: HandleServerError = async ({
  error, event, status, message
}) => {
  const errorId = crypto.randomUUID();

  if (status >= 500) {
    console.error(`[${errorId}] Server error:`, error);
    await reportError(error, {
      errorId,
      url: event.url.pathname,
      userId: event.locals.user?.id
    });
  }

  return {
    message: status >= 500
      ? 'An internal error occurred. Our team has been notified.'
      : message,
    errorId
  };
};
```

And the universal hooks file:

```typescript
// src/hooks.ts
import type { Reroute, Transport } from '@sveltejs/kit';
import { Money } from '$lib/money';

const LOCALES = ['en', 'fr', 'de', 'es'];

export const reroute: Reroute = ({ url }) => {
  const [, maybeLocale, ...rest] = url.pathname.split('/');
  if (LOCALES.includes(maybeLocale)) {
    return `/${rest.join('/')}`;
  }
};

export const transport: Transport = {
  Date: {
    encode: (v) => v instanceof Date && v.toISOString(),
    decode: (s) => new Date(s)
  },
  Money: {
    encode: (v) =>
      v instanceof Money && { amount: v.amount, currency: v.currency },
    decode: ({ amount, currency }) => new Money(amount, currency)
  }
};
```

## Try It

Create a complete hooks setup for a production application:

1. Write an `auth` hook that reads a `session` cookie, validates it against a database, attaches the user to `event.locals`, and extends the session if it is close to expiring (sliding window).
2. Write a `logging` hook that records the method, path, response status, and duration in milliseconds, with a unique request ID.
3. Write a `security` hook that sets `X-Frame-Options`, `X-Content-Type-Options`, `Content-Security-Policy`, and `Referrer-Policy` headers.
4. Write a `rateLimit` hook that limits API routes to 100 requests per minute per IP address, returning a 429 response with a `Retry-After` header when exceeded.
5. Compose them all with `sequence` in the correct order.
6. Add a `handleError` hook that logs errors with a unique ID, reports 500+ errors to an external service, and returns a sanitized message.
7. Add a `handleFetch` hook that adds an `X-Request-Id` header to all outgoing fetch calls.
8. Add a `reroute` hook in `src/hooks.ts` that strips locale prefixes from URLs.
9. Add a `transport` hook that enables `Date` and `Set` serialization.

## Key Takeaways

- The `handle` hook intercepts every server request — use it for auth, logging, security headers, rate limiting, and CORS
- `resolve(event, options)` provides `transformPageChunk`, `filterSerializedResponseHeaders`, and `preload` for fine-grained response control
- `sequence()` composes multiple handle functions left-to-right — each hook's resolve is the next hook in the chain
- `handleFetch` intercepts outgoing `fetch` calls during SSR — use for service-to-service auth and URL rewriting
- `handleError` catches unexpected errors (not `error()` calls) — return a sanitized message for `$page.error`
- Both server and client have `handleError` — the client version catches errors in event handlers and effects
- `reroute` in `src/hooks.ts` rewrites URLs before route matching — runs universally (server and client)
- `transport` in `src/hooks.ts` enables serialization of custom types (Date, Set, Map, custom classes) across the server-client boundary
- `event.locals` is the per-request bag for passing data from hooks to load functions and actions
- Extract individual hooks into `$lib/server/hooks/` modules for clean separation and testability
- Hook order in `sequence` matters — put auth first (data used by later hooks) and security last (headers applied to all responses)
