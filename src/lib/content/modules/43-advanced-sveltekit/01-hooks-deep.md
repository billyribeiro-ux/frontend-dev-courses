# Hooks Deep Dive

Hooks are SvelteKit's middleware system. They let you intercept every request before it reaches your routes, modify responses before they leave the server, handle errors globally, and even rewrite URLs. If you have used middleware in Express or Next.js, hooks serve the same purpose — but with a cleaner, more composable API.

SvelteKit provides two hook files: `src/hooks.server.ts` for server-side hooks and `src/hooks.client.ts` for client-side hooks. Both are optional. You create them only when you need them.

## The handle Hook

The `handle` function in `src/hooks.server.ts` intercepts every server request. It receives the `event` (the request) and a `resolve` function (which processes the route normally). You can modify the request before resolving, modify the response after, or skip resolving entirely:

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

A common use case is authentication. Check for a session cookie, look up the user, and attach it to `event.locals` so every load function can access it:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/db';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');

  if (sessionId) {
    const user = await db.getUserBySession(sessionId);
    event.locals.user = user;
  }

  return resolve(event);
};
```

## Chaining Hooks with sequence

When you need multiple hooks (authentication, logging, CORS headers), use `sequence` to compose them. Each hook runs in order, and each can modify the event or response:

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
  console.log(`${event.request.method} ${event.url.pathname}`);
  const response = await resolve(event);
  console.log(`  -> ${response.status}`);
  return response;
};

const security: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  return response;
};

export const handle = sequence(auth, logging, security);
```

Hooks in `sequence` run left to right. The first hook's response passes through the remaining hooks, so `security` can modify the response created by `logging` which used the `event.locals.user` set by `auth`.

## handleFetch

The `handleFetch` hook intercepts outgoing `fetch` calls made during server-side load functions. This lets you add authentication headers, rewrite URLs, or route internal API calls directly:

```typescript
// src/hooks.server.ts
import type { HandleFetch } from '@sveltejs/kit';

export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
  // Add auth header to all API requests
  if (request.url.startsWith('https://api.myservice.com')) {
    request.headers.set('Authorization', `Bearer ${event.locals.apiToken}`);
  }

  // Rewrite internal API calls to go direct (skip the network)
  if (request.url.startsWith('https://myapp.com/api/')) {
    request = new Request(
      request.url.replace('https://myapp.com', ''),
      request
    );
  }

  return fetch(request);
};
```

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
  console.error(`[${errorId}]`, error, {
    url: event.url.pathname,
    method: event.request.method,
    status
  });

  // Return a safe message (this is what the user sees)
  return {
    message: 'Something went wrong. Please try again.',
    errorId
  };
};
```

The returned object is available in your `+error.svelte` pages through `$page.error`. Never expose raw error messages or stack traces to users.

## reroute

The `reroute` hook rewrites URLs before SvelteKit matches them to routes. This is useful for multilingual routing, vanity URLs, or A/B testing:

```typescript
// src/hooks.ts (note: not hooks.server.ts — reroute runs universally)
import type { Reroute } from '@sveltejs/kit';

const SUPPORTED_LOCALES = ['en', 'fr', 'de', 'es'];

export const reroute: Reroute = ({ url }) => {
  const [, locale, ...rest] = url.pathname.split('/');

  // /fr/about → /about (locale handled elsewhere)
  if (SUPPORTED_LOCALES.includes(locale)) {
    return `/${rest.join('/')}`;
  }
};
```

With this hook, `/fr/about`, `/de/about`, and `/about` all resolve to the same `src/routes/about/+page.svelte` file. You can read the locale from the URL in your load functions.

## Client Hooks

The `src/hooks.client.ts` file provides `handleError` for catching unhandled client-side errors — errors that happen in event handlers, effects, and other browser-only code:

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = async ({
  error, message, status
}) => {
  // Send to error tracking service
  await fetch('/api/log-error', {
    method: 'POST',
    body: JSON.stringify({
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      status
    })
  });

  return {
    message: 'An unexpected error occurred.',
  };
};
```

## Transport Hook

The `transport` hook teaches SvelteKit how to serialize and deserialize custom types when passing data from server load functions to the client. By default, only JSON-compatible data survives the server-to-client boundary. With `transport`, you can pass `Date`, `Map`, `Set`, and custom classes:

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
  }
};
```

Now your load functions can return `Date` objects and `Set` instances, and they arrive on the client as real `Date` and `Set` objects rather than plain strings and arrays.

## Try It

Create a `hooks.server.ts` that uses `sequence` to chain three hooks: an authentication hook that reads a session cookie and attaches the user to `event.locals`, a logging hook that records the method, path, and response status, and a security hook that sets `X-Frame-Options` and `Content-Security-Policy` headers. Add a `handleError` hook that logs errors with a unique ID and returns a sanitized message.

## Key Takeaways

- The `handle` hook intercepts every server request — use it for auth, logging, and response headers
- `sequence` composes multiple handle functions that run in order, each able to modify the event and response
- `handleFetch` intercepts outgoing fetch calls during SSR, letting you add headers or rewrite URLs
- `handleError` catches unhandled errors on both server and client, returning safe messages to users
- `reroute` rewrites URLs before route matching, enabling multilingual routing and vanity URLs
- The `transport` hook enables custom serialization for non-JSON types like Date, Map, and Set
- Use `event.locals` to pass data from hooks to load functions and actions
