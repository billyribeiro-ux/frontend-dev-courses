# Server Routes

SvelteKit is not just a frontend framework — it is a full-stack platform. Beyond rendering pages, SvelteKit lets you create **API endpoints** that live right alongside your routes. These are called server routes, and they are defined in `+server.ts` files.

Here is the mental model. You already know that `+page.server.ts` files contain `load` functions that fetch data and hand it to a Svelte component for rendering. The component is the response. A `+server.ts` file is different: **there is no component**. The file itself IS the response. It receives an HTTP request and returns a raw `Response` object — JSON, plain text, a file download, an event stream, whatever you need. No HTML, no rendering pipeline, no hydration. Just HTTP in, HTTP out.

This distinction matters architecturally. Use `+page.server.ts` when you need to feed data to your own UI. Use `+server.ts` when you need a standalone HTTP endpoint — something a mobile app calls, a webhook receiver, a download URL, or an SSE stream.

Understanding how `+server.ts` works under the hood is essential because every non-trivial SvelteKit application eventually needs raw HTTP endpoints. Whether you are building a webhook listener for Stripe, a proxy that hides third-party API keys, a file upload processor, or a Server-Sent Events stream for live updates, `+server.ts` is the tool. And unlike most "API route" features in other frameworks, SvelteKit's implementation uses the Web Platform standard `Request` and `Response` objects — meaning everything you learn here transfers directly to Cloudflare Workers, Deno, Bun, and any other runtime that implements the Fetch API standard.

## Creating a Server Route

Create a `+server.ts` file inside any route directory. Each exported function name corresponds to an HTTP method:

```typescript
// src/routes/api/hello/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ message: 'Hello from the API!' });
};
```

Visit `/api/hello` in your browser and you will see the JSON response. The `json()` helper sets the `Content-Type: application/json` header automatically and serializes your object with `JSON.stringify()` for you.

Notice that the file exports a named constant, not a default export. The name **must** match a valid HTTP method. SvelteKit will return `405 Method Not Allowed` for any method you don't export — you get correct HTTP semantics for free.

### How It Works Under the Hood

When SvelteKit processes a request, it first checks if the route directory contains a `+server.ts` file. If it does, and the request's HTTP method matches one of the named exports, SvelteKit calls that function with a `RequestEvent` object and expects a `Response` back. If the method is not exported, SvelteKit returns a `405` response with an `Allow` header listing the methods that are available. If the route has both a `+page.svelte` and a `+server.ts`, SvelteKit decides which one to use based on content negotiation — browser navigation requests (which accept `text/html`) go to the page, while `fetch` calls and API clients go to the server route.

This content negotiation is why you can colocate a page and an API endpoint in the same route directory. A browser navigating to `/products/123` gets the rendered page. A `fetch('/products/123', { headers: { Accept: 'application/json' } })` call gets the JSON response from `+server.ts`. Same URL, different representations — proper RESTful design.

### The `/api` Convention

There is no technical requirement to put server routes under `/api`. A `+server.ts` file works in any route directory. However, the `/api` prefix is a strong convention that communicates intent. When another developer sees `/api/bookmarks`, they immediately know it is a data endpoint, not a page. When you see `/products/[id]/+server.ts` alongside `/products/[id]/+page.svelte`, you know the server route exists for content negotiation rather than as a standalone API. Use the convention that makes your intent clearest.

## HTTP Methods as Named Exports

A single `+server.ts` file can handle every HTTP method a resource needs. You typically split across two files — one for the collection, one for individual items:

```typescript
// src/routes/api/items/+server.ts — collection
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => { /* list items */ };
export const POST: RequestHandler = async () => { /* create item */ };
```

```typescript
// src/routes/api/items/[id]/+server.ts — individual
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => { /* get one */ };
export const PUT: RequestHandler = async () => { /* replace */ };
export const PATCH: RequestHandler = async () => { /* partial update */ };
export const DELETE: RequestHandler = async () => { /* remove */ };
```

Each handler receives one argument: a `RequestEvent` object. Let's look at what is inside it.

### The HEAD and OPTIONS Methods

Two methods deserve special attention. SvelteKit automatically handles `HEAD` requests by running your `GET` handler and stripping the body from the response. You never need to export a `HEAD` handler unless you want custom behavior (such as different headers for HEAD vs GET).

`OPTIONS` is where you implement CORS preflight handling. Browsers send an `OPTIONS` request before making cross-origin requests with custom headers or non-simple methods. If you do not export an `OPTIONS` handler, SvelteKit returns `405`. If your API serves external consumers, you need this:

```typescript
export const OPTIONS: RequestHandler = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': 'https://my-other-app.com',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400' // cache preflight for 24 hours
    }
  });
};
```

### The Fallback Handler

If you need to handle methods that SvelteKit does not recognize by name, or you want a single handler for all methods, export a `fallback` function:

```typescript
export const fallback: RequestHandler = async ({ request }) => {
  return json(
    { error: `Method ${request.method} is not supported` },
    { status: 405 }
  );
};
```

The `fallback` runs for any HTTP method that does not have its own named export. This is useful for returning custom error messages instead of SvelteKit's default 405 response, or for handling WebDAV methods like `PROPFIND` that are not part of the standard HTTP method set.

## RequestEvent Deep Dive

Every handler receives the same `RequestEvent` shape. This is your interface to the entire HTTP request and the SvelteKit runtime:

```typescript
export const GET: RequestHandler = async (event) => {
  event.request;      // The raw Web API Request — headers, body, method
  event.params;       // Route params: { id: string } for [id] segments
  event.url;          // Full URL object — event.url.searchParams.get('q')
  event.cookies;      // Cookie API — .get(), .set(), .delete()
  event.locals;       // Shared data from hooks — typically { user, session }
  event.platform;     // Adapter-specific context (Cloudflare env, etc.)
  event.fetch;        // Enhanced fetch that preserves cookies internally
  event.setHeaders;   // Set response headers: (headers) => void
  event.getClientAddress; // Get the client's IP address
  event.isDataRequest;    // True if SvelteKit is fetching data for client navigation
  event.isSubRequest;     // True if this request was made by SvelteKit internally

  return json({ ok: true });
};
```

Each property serves a specific purpose in the request lifecycle. Let's examine them individually.

### event.request — The Raw Web API Request

This is a standard `Request` object from the Fetch API. It contains everything the client sent:

```typescript
export const POST: RequestHandler = async ({ request }) => {
  // Access the HTTP method
  console.log(request.method); // "POST"

  // Read headers
  const contentType = request.headers.get('Content-Type');
  const userAgent = request.headers.get('User-Agent');
  const authorization = request.headers.get('Authorization');

  // Parse the body based on content type
  if (contentType?.includes('application/json')) {
    const body = await request.json(); // Parse as JSON
    // body is typed as 'any' — validate it
  } else if (contentType?.includes('multipart/form-data')) {
    const formData = await request.formData(); // Parse as FormData
    const file = formData.get('avatar') as File;
  } else if (contentType?.includes('text/plain')) {
    const text = await request.text(); // Parse as plain text
  } else if (contentType?.includes('application/octet-stream')) {
    const buffer = await request.arrayBuffer(); // Parse as binary
  }

  return json({ received: true });
};
```

A critical rule: the `request.body` can only be consumed **once**. If you call `request.json()`, you cannot also call `request.text()` on the same request. The body is a stream — once read, it is gone. If you need to read the body multiple times (for logging, then processing), clone the request first: `const clone = request.clone()`.

### event.params — Route Parameters

Route parameters from dynamic segments in the file path:

```typescript
// src/routes/api/teams/[teamId]/members/[memberId]/+server.ts
export const GET: RequestHandler = async ({ params }) => {
  // params = { teamId: string, memberId: string }
  const { teamId, memberId } = params;

  // params are ALWAYS strings — parse them yourself
  const teamIdNum = parseInt(teamId, 10);
  if (isNaN(teamIdNum)) {
    throw error(400, 'Team ID must be a number');
  }

  // Rest parameters: [...slug] gives params.slug as "a/b/c"
  // Optional rest: [[...slug]] gives params.slug as "" for the base route
  return json({ teamId: teamIdNum, memberId });
};
```

### event.url — The Full URL Object

A standard `URL` object with the complete request URL. The most useful property is `searchParams` for query string parsing:

```typescript
export const GET: RequestHandler = async ({ url }) => {
  // Parse query parameters with type coercion and defaults
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const sort = url.searchParams.get('sort') ?? 'created_at';
  const order = url.searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const search = url.searchParams.get('q')?.trim() ?? '';

  // Multiple values for the same key
  const tags = url.searchParams.getAll('tag'); // ['svelte', 'typescript']

  // Access other URL parts
  console.log(url.pathname);  // "/api/items"
  console.log(url.origin);    // "https://myapp.com"
  console.log(url.hostname);  // "myapp.com"

  return json({ page, limit, sort, order, search, tags });
};
```

### event.cookies — The Cookie API

SvelteKit provides a type-safe cookie API that handles serialization and security options:

```typescript
export const POST: RequestHandler = async ({ cookies, request }) => {
  const { token } = await request.json();

  // Set a cookie — SvelteKit encodes the value automatically
  cookies.set('session', token, {
    path: '/',           // Required — cookie scope
    httpOnly: true,      // Not accessible from JavaScript
    secure: true,        // Only sent over HTTPS
    sameSite: 'lax',     // CSRF protection
    maxAge: 60 * 60 * 24 * 7 // Expires in 7 days (in seconds)
  });

  return json({ ok: true });
};

export const DELETE: RequestHandler = async ({ cookies }) => {
  // Delete a cookie by setting maxAge to 0
  cookies.delete('session', { path: '/' });
  return json({ ok: true });
};

export const GET: RequestHandler = async ({ cookies }) => {
  // Read a cookie — returns undefined if not set
  const theme = cookies.get('theme') ?? 'system';

  // Get all cookies as an array of { name, value } objects
  const all = cookies.getAll();

  return json({ theme });
};
```

The `path` option in `cookies.set()` is **required** in SvelteKit (unlike the browser API where it defaults to the current path). This is a deliberate design decision — implicit cookie scoping is a common source of bugs where cookies are accidentally set on a specific API route path and then not available on other pages.

### event.locals — Shared Data from Hooks

The `locals` property deserves special attention. In your `hooks.server.ts`, you typically parse a session token and attach user data to `event.locals`. By the time your API route handler runs, `locals.user` is already populated. This is how authentication flows through SvelteKit — hooks run first, routes consume the result:

```typescript
// Declare the shape in src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: { id: string; email: string; role: 'admin' | 'user' } | null;
      requestId: string;
    }
  }
}

// Use it in your handlers — the type is fully inferred
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Not authenticated');
  if (locals.user.role !== 'admin') throw error(403, 'Admin access required');

  console.log(`Request ${locals.requestId} by ${locals.user.email}`);
  return json({ user: locals.user });
};
```

### event.platform — Adapter-Specific Context

The `platform` property gives you access to runtime-specific features that differ between deployment targets:

```typescript
export const GET: RequestHandler = async ({ platform }) => {
  // On Cloudflare Workers:
  // platform.env gives access to KV namespaces, R2 buckets, D1 databases
  const value = await platform?.env?.MY_KV.get('key');

  // On Vercel:
  // platform might give access to edge-specific features

  // On Node.js (adapter-node):
  // platform is typically undefined

  return json({ value });
};
```

This abstraction layer is how SvelteKit remains deployment-agnostic while still letting you access platform-specific capabilities.

### event.fetch — Enhanced Fetch

The `fetch` function on `RequestEvent` is not the global `fetch`. It is an enhanced version that handles SvelteKit-specific concerns:

```typescript
export const GET: RequestHandler = async ({ fetch, cookies }) => {
  // event.fetch automatically:
  // 1. Preserves cookies when calling your own endpoints
  // 2. Resolves relative URLs against the app's origin
  // 3. Runs server-side on initial page load, client-side on navigation
  // 4. Prevents infinite loops when calling your own API routes

  // Calling your own API endpoint — cookies are forwarded automatically
  const internalResponse = await fetch('/api/user/preferences');

  // Calling an external API — works like regular fetch
  const externalResponse = await fetch('https://api.github.com/users/octocat');

  return json({
    preferences: await internalResponse.json(),
    github: await externalResponse.json()
  });
};
```

However, be cautious about calling your own `+server.ts` endpoints from `+page.server.ts` load functions. While it works, it adds unnecessary overhead — you are making an HTTP request to yourself. If both files need the same data, extract the logic into a shared function in `$lib/server/` and call it directly.

### event.setHeaders — Response Header Control

The `setHeaders` function sets headers on the response. It is most commonly used in `load` functions, but in `+server.ts` you typically set headers directly on the `Response` object. It exists on the event for consistency with the page load API:

```typescript
export const GET: RequestHandler = async ({ setHeaders }) => {
  // setHeaders is useful when you want to set headers before
  // deciding what to return
  setHeaders({
    'Cache-Control': 'public, max-age=3600',
    'X-Custom-Header': 'value'
  });

  // You can also set headers on the Response directly
  return json({ data: 'value' }, {
    headers: { 'X-Another-Header': 'value' }
  });
};
```

Note: `setHeaders` will throw if you try to set the same header twice. This prevents accidental conflicts between hooks and route handlers. If you need to append to a header (like `Set-Cookie`), use the `Response` constructor directly.

## Response Helpers

SvelteKit provides four helpers from `@sveltejs/kit` that cover the vast majority of response patterns:

```typescript
import { json, error, redirect, text } from '@sveltejs/kit';
```

### json() — JSON Responses

The workhorse of API development. It serializes your object with `JSON.stringify`, sets `Content-Type: application/json`, and returns a `Response`:

```typescript
// Basic usage
return json({ id: 1, title: 'Hello' });

// With a custom status code
return json(created, { status: 201 });

// With custom headers
return json(data, {
  status: 200,
  headers: {
    'Cache-Control': 'public, max-age=60',
    'X-Request-Id': requestId
  }
});

// WRONG: Don't use JSON.stringify yourself
return new Response(JSON.stringify(data)); // Missing Content-Type header!

// json() handles nested objects, arrays, null, numbers, booleans
return json({
  users: [{ id: 1, name: 'Alice' }],
  total: 42,
  hasMore: true,
  cursor: null
});
```

Internally, `json()` is a thin wrapper around `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', ...init?.headers }, status: init?.status })`. The convenience is in never forgetting that Content-Type header.

### error() — HTTP Error Responses

`error()` is **thrown**, not returned. It stops execution immediately and sends an error response:

```typescript
// Simple string message
throw error(404, 'Bookmark not found');

// Structured error body — useful for validation errors
throw error(400, {
  message: 'Validation failed',
  errors: {
    url: 'Must be a valid URL',
    title: 'Required'
  }
});

// WRONG: returning error (it must be thrown)
return error(404, 'Not found'); // TypeScript will complain — error() returns never

// Common status codes
throw error(400, 'Bad Request');           // Client sent invalid data
throw error(401, 'Authentication required'); // No valid credentials
throw error(403, 'Forbidden');              // Authenticated but not authorized
throw error(404, 'Resource not found');     // Resource does not exist
throw error(409, 'Conflict');               // Resource already exists
throw error(422, 'Unprocessable entity');   // Semantically invalid
throw error(429, 'Too many requests');      // Rate limit exceeded
throw error(500, 'Internal server error');  // Use this sparingly — let unhandled errors become 500s naturally
```

When `error()` is thrown in a `+server.ts` handler, SvelteKit returns a JSON response with the message. When thrown in a `+page.server.ts` load function, SvelteKit renders the nearest `+error.svelte` page instead. This behavioral difference is another reason to choose the right file for your use case.

### redirect() — HTTP Redirects

Like `error()`, `redirect()` is **thrown**, not returned:

```typescript
// After creating a resource — redirect to it
throw redirect(303, `/bookmarks/${newId}`);

// Permanent redirect (use for URL changes)
throw redirect(301, '/new-path');

// Temporary redirect (default choice)
throw redirect(302, '/temporary-location');

// 303 See Other — the correct redirect after a POST
// Tells the browser: "POST was successful, now GET this URL"
throw redirect(303, '/dashboard');
```

The 303 status code deserves special attention. After a successful `POST`, `PUT`, or `DELETE`, redirecting with 303 tells the browser to follow the redirect with a `GET` request. This prevents the "resubmit form?" dialog when the user hits the back button. It is the correct status code for Post/Redirect/Get (PRG) patterns.

### text() — Plain Text Responses

For simple text responses:

```typescript
// Health check endpoint
return text('ok');

// With custom headers
return text('pong', {
  headers: { 'X-Response-Time': `${Date.now() - start}ms` }
});
```

### Raw Response Construction

When the helpers don't fit, construct a `Response` directly. This gives you complete control over every aspect of the HTTP response:

```typescript
// CSV download
const csvString = 'name,email\nAlice,alice@example.com\nBob,bob@example.com';
return new Response(csvString, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': 'attachment; filename="export.csv"'
  }
});

// 204 No Content (common for DELETE)
return new Response(null, { status: 204 });

// Binary data (PDF, image, etc.)
const pdfBuffer = await generatePDF(data);
return new Response(pdfBuffer, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': `attachment; filename="report-${Date.now()}.pdf"`,
    'Content-Length': pdfBuffer.byteLength.toString()
  }
});

// XML response (for RSS feeds, sitemaps, etc.)
return new Response(xmlString, {
  headers: { 'Content-Type': 'application/xml; charset=utf-8' }
});
```

Since these are standard Web `Response` objects, anything you can do with the Fetch API response works here. SvelteKit does not invent its own abstraction layer.

## Status Codes That Matter

Choose the right status code. Clients, browsers, and caches all behave differently based on the code you return:

| Code | Name | When to use |
|------|------|-------------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE (nothing to return) |
| `206` | Partial Content | Range request (file streaming, resumable downloads) |
| `301` | Moved Permanently | URL has permanently changed — search engines update their index |
| `302` | Found | Temporary redirect — original URL should still be used |
| `303` | See Other | Redirect after POST — always follow with GET |
| `304` | Not Modified | Conditional request — client cache is still valid |
| `400` | Bad Request | Invalid input from the client |
| `401` | Unauthorized | No valid authentication |
| `403` | Forbidden | Authenticated but lacks permission |
| `404` | Not Found | Resource does not exist |
| `405` | Method Not Allowed | HTTP method not supported (SvelteKit sends this automatically) |
| `409` | Conflict | Resource already exists or state conflict |
| `422` | Unprocessable Entity | Request is well-formed but semantically invalid |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Unhandled exception (SvelteKit sends this automatically) |

A common mistake is returning `200` for everything and putting `{ success: false }` in the body. HTTP clients, error-tracking tools, and retry logic all depend on status codes. A `fetch()` call only rejects on network errors — it considers a `200` with `{ success: false }` a successful response. Your client code has to check `response.ok` or the status code to detect errors. Using proper status codes means standard error handling works:

```typescript
// WRONG: Always 200, error hidden in body
return json({ success: false, error: 'Not found' }); // status 200

// CORRECT: Proper status code
throw error(404, 'Not found'); // status 404, response.ok === false
```

## Setting Response Headers

Headers control caching, security, CORS, and content negotiation. Here are the patterns you will use most often.

### Cache-Control

Caching is the single most effective performance optimization for API responses. A well-cached response eliminates the request entirely:

```typescript
export const GET: RequestHandler = async () => {
  const data = await fetchExpensiveData();

  // Public: CDNs and browsers can cache this
  // max-age: browser caches for 60 seconds
  // s-maxage: CDN caches for 300 seconds (overrides max-age for shared caches)
  // stale-while-revalidate: serve stale content while fetching fresh content
  return json(data, {
    headers: {
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
    }
  });
};

// Private data — only the user's browser should cache it
export const GET: RequestHandler = async ({ locals }) => {
  const user = requireAuth(locals);
  const profile = await getProfile(user.id);

  return json(profile, {
    headers: {
      'Cache-Control': 'private, max-age=300', // browser-only, 5 minutes
      'Vary': 'Cookie' // different cache per session
    }
  });
};

// Never cache — for real-time or sensitive data
return json(data, {
  headers: {
    'Cache-Control': 'no-store' // do not cache at all
  }
});
```

The `Vary` header is important but often overlooked. It tells caches that the response varies based on certain request headers. `Vary: Cookie` means each unique cookie value gets its own cached response — critical for per-user data. `Vary: Accept-Encoding` is usually handled by your CDN or reverse proxy automatically.

### CORS Headers

For cross-origin API access, handle preflight `OPTIONS` requests and include headers on every response:

```typescript
// src/routes/api/public/data/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_ORIGINS = [
  'https://my-other-app.com',
  'https://my-extension.example.com'
];

function getCorsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400' // Cache preflight for 24h
  };

  // Only allow known origins — never use '*' with credentials
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin'; // Tell caches this varies by origin
  }

  return headers;
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  return new Response(null, {
    headers: getCorsHeaders(request.headers.get('Origin'))
  });
};

export const GET: RequestHandler = async ({ request }) => {
  const data = await getPublicData();
  return json(data, {
    headers: getCorsHeaders(request.headers.get('Origin'))
  });
};
```

If you find yourself repeating CORS headers across endpoints, move them into a `handle` hook in `hooks.server.ts` instead. This centralizes the logic and ensures every API response gets the headers:

```typescript
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  // Handle CORS preflight for all /api/* routes
  if (event.url.pathname.startsWith('/api/') && event.request.method === 'OPTIONS') {
    return new Response(null, {
      headers: getCorsHeaders(event.request.headers.get('Origin'))
    });
  }

  const response = await resolve(event);

  // Add CORS headers to all /api/* responses
  if (event.url.pathname.startsWith('/api/')) {
    const origin = event.request.headers.get('Origin');
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Credentials', 'true');
      response.headers.set('Vary', 'Origin');
    }
  }

  return response;
};
```

### Security Headers

Beyond CORS, several headers harden your API against common attacks:

```typescript
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',       // Prevent MIME type sniffing
  'X-Frame-Options': 'DENY',                 // Prevent clickjacking
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'", // API responses need nothing
};
```

## Streaming Responses

`+server.ts` is the right place for Server-Sent Events (SSE) and other streaming patterns. Because you control the raw `Response`, you can use `ReadableStream` to send data incrementally:

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  const user = requireAuth(locals);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send a message every second
      const interval = setInterval(() => {
        const data = JSON.stringify({
          time: new Date().toISOString(),
          user: user.id
        });

        // SSE format: "data: {json}\n\n"
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }, 1000);

      // Send initial connection event
      controller.enqueue(encoder.encode(`event: connected\ndata: {}\n\n`));

      // Clean up when the client disconnects
      // Note: The client disconnect detection depends on the runtime
      // In Node.js, you check request.signal; in Cloudflare Workers, the
      // stream is automatically closed when the client disconnects
    },
    cancel() {
      // Called when the client disconnects
      console.log('Client disconnected');
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

A more robust SSE implementation with proper cleanup and reconnection support:

```typescript
// src/routes/api/notifications/stream/+server.ts
import type { RequestHandler } from './$types';
import { subscribeToNotifications } from '$lib/server/notifications';

export const GET: RequestHandler = async ({ locals, request }) => {
  const user = requireAuth(locals);
  const lastEventId = request.headers.get('Last-Event-ID');

  let unsubscribe: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let messageId = parseInt(lastEventId ?? '0', 10);

      function send(event: string, data: unknown) {
        messageId++;
        const message = [
          `id: ${messageId}`,
          `event: ${event}`,
          `data: ${JSON.stringify(data)}`,
          '', '' // SSE requires double newline
        ].join('\n');

        try {
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream was closed — clean up
          unsubscribe?.();
        }
      }

      // Subscribe to real-time notifications for this user
      unsubscribe = subscribeToNotifications(user.id, (notification) => {
        send('notification', notification);
      });

      // Send heartbeat every 30 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        send('heartbeat', { time: Date.now() });
      }, 30_000);

      // Clean up heartbeat when stream is cancelled
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        unsubscribe?.();
      });
    },
    cancel() {
      unsubscribe?.();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      'X-Accel-Buffering': 'no' // Disable nginx buffering
    }
  });
};
```

### File Downloads

Generating and serving file downloads is another common `+server.ts` use case:

```typescript
// src/routes/api/export/csv/+server.ts
import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireAuth(locals);
  const format = url.searchParams.get('format') ?? 'csv';

  const items = await db.select().from(bookmarks)
    .where(eq(bookmarks.userId, user.id));

  if (format === 'csv') {
    const header = 'id,url,title,created_at\n';
    const rows = items.map(item =>
      `${item.id},"${item.url}","${item.title.replace(/"/g, '""')}",${item.createdAt}`
    ).join('\n');

    return new Response(header + rows, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookmarks-${Date.now()}.csv"`
      }
    });
  }

  if (format === 'json') {
    return new Response(JSON.stringify(items, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="bookmarks-${Date.now()}.json"`
      }
    });
  }

  throw error(400, `Unsupported format: ${format}`);
};
```

## A Complete Bookmarks CRUD API

Here is a production-grade bookmarks API with input validation using Zod, proper authentication, pagination, and authorization baked into every query. This is the kind of endpoint a browser extension, mobile app, or third-party integration would call.

```typescript
// src/lib/server/validation.ts
import { z } from 'zod';
import { error } from '@sveltejs/kit';

export const BookmarkSchema = z.object({
  url: z
    .string()
    .min(1, 'URL is required')
    .url('Must be a valid URL')
    .max(2048, 'URL must be under 2048 characters'),
  title: z
    .string()
    .min(1, 'Title is required')
    .max(500, 'Title must be under 500 characters')
    .transform(s => s.trim()),
  description: z
    .string()
    .max(2000, 'Description must be under 2000 characters')
    .optional()
    .transform(s => s?.trim()),
  tags: z
    .array(z.string().max(50))
    .max(10, 'Maximum 10 tags')
    .optional()
    .default([])
});

export type BookmarkInput = z.infer<typeof BookmarkSchema>;

export function validateBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fieldErrors = result.error.flatten().fieldErrors;
    throw error(400, {
      message: 'Validation failed',
      errors: fieldErrors
    } as any);
  }
  return result.data;
}
```

```typescript
// src/routes/api/bookmarks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { eq, and, ilike, desc, asc, sql } from 'drizzle-orm';
import { BookmarkSchema, validateBody } from '$lib/server/validation';
import { rateLimit } from '$lib/server/rate-limit';

function requireAuth(locals: App.Locals) {
  if (!locals.user) throw error(401, 'Authentication required');
  return locals.user;
}

// List bookmarks for the authenticated user
export const GET: RequestHandler = async ({ locals, url, getClientAddress }) => {
  const user = requireAuth(locals);

  // Parse pagination and filtering params
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;
  const search = url.searchParams.get('q')?.trim();
  const sortField = url.searchParams.get('sort') === 'title' ? bookmarks.title : bookmarks.createdAt;
  const sortDir = url.searchParams.get('order') === 'asc' ? asc : desc;

  // Build the where clause
  const conditions = [eq(bookmarks.userId, user.id)];
  if (search) {
    conditions.push(ilike(bookmarks.title, `%${search}%`));
  }

  // Execute count and data queries in parallel
  const [items, [{ count }]] = await Promise.all([
    db.select()
      .from(bookmarks)
      .where(and(...conditions))
      .orderBy(sortDir(sortField))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(and(...conditions))
  ]);

  return json({
    data: items,
    pagination: {
      page,
      limit,
      total: Number(count),
      totalPages: Math.ceil(Number(count) / limit),
      hasNext: offset + limit < Number(count),
      hasPrev: page > 1
    }
  }, {
    headers: {
      'Cache-Control': 'private, max-age=0', // Never cache user-specific data in CDN
    }
  });
};

// Create a new bookmark
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const user = requireAuth(locals);
  rateLimit(getClientAddress(), 30, 60_000); // 30 creates per minute

  // Validate Content-Type before parsing
  const contentType = request.headers.get('Content-Type');
  if (!contentType?.includes('application/json')) {
    throw error(415, 'Content-Type must be application/json');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON in request body');
  }

  const validated = validateBody(BookmarkSchema, body);

  // Check for duplicate URL for this user
  const existing = await db.select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(
      eq(bookmarks.userId, user.id),
      eq(bookmarks.url, validated.url)
    ))
    .limit(1);

  if (existing.length > 0) {
    throw error(409, 'You already have a bookmark with this URL');
  }

  const [created] = await db
    .insert(bookmarks)
    .values({
      url: validated.url,
      title: validated.title,
      description: validated.description,
      tags: validated.tags,
      userId: user.id
    })
    .returning();

  return json(created, {
    status: 201,
    headers: {
      'Location': `/api/bookmarks/${created.id}` // REST convention: Location of new resource
    }
  });
};
```

```typescript
// src/routes/api/bookmarks/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import { BookmarkSchema, validateBody } from '$lib/server/validation';

function requireAuth(locals: App.Locals) {
  if (!locals.user) throw error(401, 'Authentication required');
  return locals.user;
}

// The and() clause is critical: it prevents users from accessing
// each other's data by baking authorization into the query itself.
function parseId(raw: string): string {
  if (!raw || raw.length > 36) throw error(400, 'Invalid bookmark ID');
  return raw;
}

// Get a single bookmark
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireAuth(locals);
  const id = parseId(params.id);

  const [bookmark] = await db.select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .limit(1);

  if (!bookmark) throw error(404, 'Bookmark not found');

  return json(bookmark, {
    headers: {
      'Cache-Control': 'private, max-age=60',
      'ETag': `"${bookmark.updatedAt?.getTime() ?? bookmark.createdAt.getTime()}"`
    }
  });
};

// Replace a bookmark entirely
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireAuth(locals);
  const id = parseId(params.id);

  let body: unknown;
  try { body = await request.json(); } catch { throw error(400, 'Invalid JSON'); }

  const validated = validateBody(BookmarkSchema, body);

  const [updated] = await db.update(bookmarks)
    .set({
      url: validated.url,
      title: validated.title,
      description: validated.description,
      tags: validated.tags,
      updatedAt: new Date()
    })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning();

  if (!updated) throw error(404, 'Bookmark not found');

  return json(updated);
};

// Partial update
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  const user = requireAuth(locals);
  const id = parseId(params.id);

  let body: unknown;
  try { body = await request.json(); } catch { throw error(400, 'Invalid JSON'); }

  // For PATCH, make all fields optional
  const validated = validateBody(BookmarkSchema.partial(), body);

  // Only include fields that were actually provided
  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (validated.url !== undefined) updates.url = validated.url;
  if (validated.title !== undefined) updates.title = validated.title;
  if (validated.description !== undefined) updates.description = validated.description;
  if (validated.tags !== undefined) updates.tags = validated.tags;

  const [updated] = await db.update(bookmarks)
    .set(updates)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning();

  if (!updated) throw error(404, 'Bookmark not found');

  return json(updated);
};

// Delete a bookmark
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireAuth(locals);
  const id = parseId(params.id);

  const [deleted] = await db.delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning({ id: bookmarks.id });

  if (!deleted) throw error(404, 'Bookmark not found');

  return new Response(null, { status: 204 });
};
```

Every handler follows the same rhythm: authenticate, validate, scope to user, return the right status code. The `and()` clause combining `bookmarks.id` with `bookmarks.userId` is the single most important security pattern in this code. Without it, any authenticated user could access any bookmark by guessing IDs — an Insecure Direct Object Reference (IDOR) vulnerability.

## Authentication in API Routes

Authentication flows through hooks into `locals`. Your `hooks.server.ts` parses a session cookie and attaches user data to `event.locals` before any route handler runs:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
  if (token) {
    try {
      event.locals.user = await verifySessionToken(token);
    } catch {
      // Invalid token — clear it
      event.cookies.delete('session', { path: '/' });
      event.locals.user = null;
    }
  } else {
    event.locals.user = null;
  }

  return resolve(event);
};
```

Your API routes never parse cookies or verify tokens directly — that logic lives in one place, the hook. For external consumers that cannot use browser cookies, support Bearer tokens as a fallback:

```typescript
// src/lib/server/auth-helpers.ts
import { error } from '@sveltejs/kit';
import { validateApiKey } from '$lib/server/api-keys';

export function requireApiAuth(request: Request, locals: App.Locals) {
  // First check if the hook already authenticated via cookie
  if (locals.user) return locals.user;

  // Fall back to API key authentication
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw error(401, 'Missing or invalid Authorization header');
  }

  const apiKey = auth.slice(7); // Remove 'Bearer ' prefix
  if (!apiKey || apiKey.length < 32) {
    throw error(401, 'Invalid API key format');
  }

  const user = validateApiKey(apiKey);
  if (!user) throw error(401, 'Invalid API key');

  return user;
}
```

This dual authentication approach lets your endpoints serve both browser users (cookie auth, managed by SvelteKit) and programmatic clients (Bearer token auth). The hook handles the common case; the helper handles the API case.

## Rate Limiting and Security

API endpoints exposed to the internet need protection beyond authentication. Here are the production security patterns every `+server.ts` endpoint should consider.

### Rate Limiting

Rate limiting is best handled at the infrastructure level (Cloudflare, nginx, API gateway), but here is a production-grade in-memory approach for single-instance deployments:

```typescript
// src/lib/server/rate-limit.ts
import { error } from '@sveltejs/kit';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitRecord>();

// Clean up expired records every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of buckets) {
    if (now > record.resetAt) buckets.delete(key);
  }
}, 5 * 60_000);

export function rateLimit(
  key: string,
  limit = 60,
  windowMs = 60_000
): { remaining: number; resetAt: number } {
  const now = Date.now();
  const record = buckets.get(key);

  if (!record || now > record.resetAt) {
    const newRecord = { count: 1, resetAt: now + windowMs };
    buckets.set(key, newRecord);
    return { remaining: limit - 1, resetAt: newRecord.resetAt };
  }

  record.count++;

  if (record.count > limit) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    throw error(429, {
      message: 'Too many requests',
      retryAfter
    } as any);
  }

  return { remaining: limit - record.count, resetAt: record.resetAt };
}
```

Use it in your handlers and include rate limit headers in the response:

```typescript
export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  const user = requireAuth(locals);

  // Rate limit by user ID (more accurate than IP for authenticated endpoints)
  const { remaining, resetAt } = rateLimit(`create:${user.id}`, 30, 60_000);

  // ... handle the request ...

  return json(created, {
    status: 201,
    headers: {
      'X-RateLimit-Limit': '30',
      'X-RateLimit-Remaining': remaining.toString(),
      'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString()
    }
  });
};
```

### Input Validation Patterns

Never trust client input. Validate everything — request bodies, URL parameters, query strings, headers:

```typescript
// Validate Content-Type before parsing
const contentType = request.headers.get('Content-Type');
if (!contentType?.includes('application/json')) {
  throw error(415, 'Content-Type must be application/json');
}

// Wrap JSON parsing in try/catch — malformed JSON throws
let body: unknown;
try {
  body = await request.json();
} catch {
  throw error(400, 'Invalid JSON in request body');
}

// Validate the body structure with Zod (or any schema validation library)
const validated = validateBody(BookmarkSchema, body);

// Validate route parameters
const id = params.id;
if (!id || !/^[a-f0-9-]{36}$/.test(id)) {
  throw error(400, 'Invalid ID format');
}

// Validate and bound query parameters
const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
```

### CSRF Protection

`+server.ts` endpoints do NOT have CSRF protection built in (form actions do). If your API accepts cookie-based auth from browsers, verify the `Origin` header:

```typescript
// src/lib/server/csrf.ts
import { error } from '@sveltejs/kit';

export function verifyCsrf(request: Request, allowedOrigin: string) {
  const origin = request.headers.get('Origin');

  // Requests without an Origin header are same-origin or non-browser
  if (!origin) return;

  if (origin !== allowedOrigin) {
    throw error(403, 'Cross-site request rejected');
  }
}
```

### Other Security Essentials

- **Limit body size** via your adapter or reverse proxy. SvelteKit does not cap request bodies by default. A malicious client can send a 10GB JSON body and exhaust your server's memory.
- **Sanitize output** — never leak stack traces, internal column names, or database error messages to clients. Catch database errors and return generic messages.
- **Log for observability** — log request IDs, user IDs, status codes, and response times. In production, this is how you diagnose issues.
- **Use `$lib/server/`** for all server-only code. SvelteKit guarantees that imports from `$lib/server/` never end up in client bundles. Put database connections, API keys, encryption utilities, and business logic there.

## Webhook Receivers

A common `+server.ts` use case is receiving webhooks from external services. Webhooks require careful handling because they come from external systems and must be verified:

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text(); // Read as text, not JSON — Stripe needs the raw body
  const signature = request.headers.get('stripe-signature');

  if (!signature) throw error(400, 'Missing stripe-signature header');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw error(400, 'Invalid webhook signature');
  }

  // Process the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionCancelled(subscription);
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Always return 200 quickly — process async work in the background
  // Webhook providers retry on non-2xx responses
  return json({ received: true });
};
```

Critical details: (1) Read the body as `text()`, not `json()`, because signature verification needs the raw string. (2) Verify the signature before processing anything. (3) Return 200 quickly — if processing takes too long, the webhook provider will retry and you will process duplicates. (4) Make your webhook handler idempotent — it might receive the same event multiple times.

## When to Use `+server.ts` vs `+page.server.ts`

This decision comes up constantly. Here is the definitive framework:

**Use `+page.server.ts`** (load functions and form actions) when:
- The data feeds your own SvelteKit pages
- You want SvelteKit to handle serialization, streaming, and hydration
- You need progressive enhancement on forms (works without JavaScript)
- You want automatic invalidation when navigating between pages
- You are building forms that should work for users with JavaScript disabled

**Use `+server.ts`** when:
- External clients need the endpoint (mobile apps, browser extensions, third-party integrations)
- You are receiving webhooks from services like Stripe, GitHub, or Clerk
- You need non-HTML responses (CSV, PDF, images, file downloads, RSS feeds)
- You are implementing Server-Sent Events or streaming responses
- You need full control over the response (custom headers, status codes, content types)
- You are building a public API that follows REST conventions
- You need to handle file uploads with progress tracking

**The golden rule:** if your SvelteKit page needs data, use `+page.server.ts`. If an external system needs an HTTP endpoint, use `+server.ts`. The common mistake is building an internal JSON API with `+server.ts` and then calling it from your own `load` functions with `fetch`. That is extra work for no benefit — SvelteKit already provides a direct data pipeline through `+page.server.ts`. Save the API layer for when you genuinely need HTTP as the interface.

There is one legitimate exception: when you need the same endpoint to serve both your SvelteKit pages AND external clients. In that case, extract the business logic into a shared function in `$lib/server/`, use it directly from `+page.server.ts`, and also expose it through `+server.ts` for external access:

```typescript
// $lib/server/bookmarks.ts — shared business logic
export async function listBookmarks(userId: string, options: ListOptions) {
  return db.select().from(bookmarks).where(eq(bookmarks.userId, userId));
}

// +page.server.ts — for your own pages
export const load = async ({ locals }) => {
  return { bookmarks: await listBookmarks(locals.user.id, {}) };
};

// +server.ts — for external clients
export const GET: RequestHandler = async ({ locals }) => {
  return json(await listBookmarks(locals.user.id, {}));
};
```

## Try It

Build a complete API at `src/routes/api/bookmarks/+server.ts` that demonstrates production patterns:

1. **GET** returns a paginated list of bookmarks. Accept `?q=` to filter by title (case-insensitive), `?page=` and `?limit=` for pagination (default 20, max 100), and `?sort=title|created_at` with `?order=asc|desc`. Return a response envelope with `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`.

2. **POST** accepts `{ url, title, description?, tags? }` in the body. Validate using Zod: `url` must be a valid URL under 2048 characters, `title` must be a non-empty string under 500 characters, `tags` must be an array of at most 10 strings. Check for duplicate URLs per user. On success, return `201` with the created bookmark and a `Location` header. On validation failure, return `400` with field-level error messages.

3. Add a `requireAuth` helper that checks `locals.user` and throws `401` if missing. Call it from both handlers.

4. Add rate limiting to the `POST` handler: maximum 30 creates per minute per user.

5. **Bonus**: Add CORS headers so the endpoint can be called from a browser extension on a different origin. Add `Cache-Control: private, max-age=0` to the GET response. Add rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) to the POST response.

6. **Stretch goal**: Build a `+server.ts` at `/api/bookmarks/export` that returns the user's bookmarks as a CSV file download. Set the correct `Content-Type` and `Content-Disposition` headers.

## Key Takeaways

- `+server.ts` files are standalone HTTP endpoints — they return raw `Response` objects with no component rendering
- `+page.server.ts` feeds data to a page; `+server.ts` IS the entire response
- Export named functions (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`) — each receives a `RequestEvent` with `request`, `params`, `url`, `cookies`, `locals`, `platform`, `fetch`, `setHeaders`, and `getClientAddress`
- Use SvelteKit helpers: `json()` for JSON, `error()` for HTTP errors (throw it), `redirect()` for redirects (throw it), `text()` for plain text
- `error()` and `redirect()` are thrown, not returned — they stop execution immediately
- The `RequestEvent` properties map directly to Web Platform APIs: `request` is a `Request`, responses are `Response` objects
- `event.fetch` is enhanced — it preserves cookies when calling your own endpoints and resolves relative URLs
- The `request.body` can only be consumed once — clone the request if you need to read it multiple times
- Always validate input: check Content-Type before parsing JSON, validate bodies with Zod, bound query parameters, and verify route param formats
- Authentication flows through `hooks.server.ts` into `locals` — API routes consume it, they don't implement it
- Support dual authentication (cookies for browsers, Bearer tokens for API clients) when external consumers need access
- Rate limiting, CSRF protection, and body size limits don't come for free on API routes — plan for them in production
- Use `+server.ts` for external APIs, webhooks, file downloads, SSE, and streaming; use `+page.server.ts` and form actions when the data feeds your own UI
- Extract shared business logic into `$lib/server/` so both `+page.server.ts` and `+server.ts` can use it without duplication
- For webhooks: verify signatures, return 200 quickly, make handlers idempotent, and read the body as `text()` not `json()`
- Streaming with `ReadableStream` enables Server-Sent Events, real-time updates, and large file generation without buffering everything in memory
