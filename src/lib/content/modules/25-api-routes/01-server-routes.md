# Server Routes

SvelteKit is not just a frontend framework — it is a full-stack platform. Beyond rendering pages, SvelteKit lets you create **API endpoints** that live right alongside your routes. These are called server routes, and they are defined in `+server.ts` files.

Here is the mental model. You already know that `+page.server.ts` files contain `load` functions that fetch data and hand it to a Svelte component for rendering. The component is the response. A `+server.ts` file is different: **there is no component**. The file itself IS the response. It receives an HTTP request and returns a raw `Response` object — JSON, plain text, a file download, an event stream, whatever you need. No HTML, no rendering pipeline, no hydration. Just HTTP in, HTTP out.

This distinction matters architecturally. Use `+page.server.ts` when you need to feed data to your own UI. Use `+server.ts` when you need a standalone HTTP endpoint — something a mobile app calls, a webhook receiver, a download URL, or an SSE stream.

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

Visit `/api/hello` in your browser and you will see the JSON response. The `json()` helper sets the `Content-Type: application/json` header automatically and serializes your object for you.

Notice that the file exports a named constant, not a default export. The name **must** match a valid HTTP method. SvelteKit will return `405 Method Not Allowed` for any method you don't export — you get correct HTTP semantics for free.

## HTTP Methods as Named Exports

A single `+server.ts` file can handle every HTTP method a resource needs. You typically split across two files — one for the collection, one for individual items:

```typescript
// src/routes/api/items/+server.ts — collection
export const GET: RequestHandler = async () => { /* list items */ };
export const POST: RequestHandler = async () => { /* create item */ };
```

```typescript
// src/routes/api/items/[id]/+server.ts — individual
export const GET: RequestHandler = async () => { /* get one */ };
export const PUT: RequestHandler = async () => { /* replace */ };
export const PATCH: RequestHandler = async () => { /* partial update */ };
export const DELETE: RequestHandler = async () => { /* remove */ };
```

Each handler receives one argument: a `RequestEvent` object. Let's look at what is inside it.

## RequestEvent Anatomy

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

  return json({ ok: true });
};
```

The `locals` property deserves special attention. In your `hooks.server.ts`, you typically parse a session token and attach user data to `event.locals`. By the time your API route handler runs, `locals.user` is already populated. This is how authentication flows through SvelteKit — hooks run first, routes consume the result.

## Response Helpers

SvelteKit provides four helpers from `@sveltejs/kit` that cover the vast majority of response patterns:

```typescript
import { json, error, redirect, text } from '@sveltejs/kit';

// json() — serialize an object, set Content-Type: application/json
return json({ id: 1, title: 'Hello' });
return json(created, { status: 201 });

// error() — throw an HTTP error (stops execution immediately)
throw error(404, 'Bookmark not found');
throw error(400, { message: 'Invalid URL', field: 'url' });

// redirect() — send a 3xx redirect (throw it, don't return it)
throw redirect(303, '/login');

// text() — return a plain text response
return text('pong');
```

You can also construct a `Response` directly when the helpers don't fit:

```typescript
// CSV download
return new Response(csvString, {
  headers: {
    'Content-Type': 'text/csv',
    'Content-Disposition': 'attachment; filename="export.csv"'
  }
});

// 204 No Content (common for DELETE)
return new Response(null, { status: 204 });
```

Since these are standard Web `Response` objects, anything you can do with the Fetch API response works here. SvelteKit does not invent its own abstraction layer.

## Status Codes That Matter

Choose the right status code. Clients, browsers, and caches all behave differently based on the code you return:

| Code | Name | When to use |
|------|------|-------------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE (nothing to return) |
| `400` | Bad Request | Invalid input from the client |
| `401` | Unauthorized | No valid authentication |
| `404` | Not Found | Resource does not exist |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Unhandled exception (SvelteKit sends this automatically) |

A common mistake is returning `200` for everything and putting `{ success: false }` in the body. HTTP clients, error-tracking tools, and retry logic all depend on status codes.

## Setting Response Headers

Use the second argument of `json()` to set headers like `Cache-Control`, or construct a `Response` for full control:

```typescript
export const GET: RequestHandler = async () => {
  const data = await fetchExpensiveData();
  return json(data, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
  });
};
```

For CORS, handle preflight `OPTIONS` requests and include the headers on every response:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://my-other-app.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const GET: RequestHandler = async () => {
  return json(await getBookmarks(), { headers: corsHeaders });
};
```

If you find yourself repeating CORS headers across endpoints, move them into a `handle` hook in `hooks.server.ts` instead.

## A Complete Bookmarks API

A bookmarks CRUD API with validation, error handling, and authentication — the kind of endpoint a browser extension or mobile app would call.

```typescript
// src/routes/api/bookmarks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

function requireAuth(locals: App.Locals) {
  if (!locals.user) throw error(401, 'Authentication required');
  return locals.user;
}

function validateBookmark(body: unknown): { url: string; title: string } {
  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be a JSON object');
  }
  const { url, title } = body as Record<string, unknown>;

  if (!url || typeof url !== 'string') throw error(400, 'URL is required');
  try { new URL(url); } catch { throw error(400, 'Invalid URL format'); }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw error(400, 'Title is required');
  }
  if (title.length > 500) throw error(400, 'Title must be 500 characters or fewer');

  return { url: url.trim(), title: title.trim() };
}

// List bookmarks for the authenticated user
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireAuth(locals);
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const results = await db
    .select().from(bookmarks)
    .where(eq(bookmarks.userId, user.id))
    .limit(limit).offset(offset);

  return json(results);
};

// Create a new bookmark
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireAuth(locals);
  const { url, title } = validateBookmark(await request.json());

  const [created] = await db
    .insert(bookmarks)
    .values({ url, title, userId: user.id })
    .returning();

  return json(created, { status: 201 });
};
```

The individual item endpoint at `src/routes/api/bookmarks/[id]/+server.ts` follows the same pattern — `GET`, `PUT`, and `DELETE` handlers that each call `requireAuth`, validate `params.id`, and scope the database query with `and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id))`. The `and()` clause is critical: it prevents users from accessing each other's data by baking authorization into the query itself. We will build that file in the next lesson on REST patterns.

Every handler follows the same rhythm: authenticate, validate, scope to user, return the right status code.

## Authentication in API Routes

Authentication flows through hooks into `locals`. Your `hooks.server.ts` parses a session cookie and attaches user data to `event.locals` before any route handler runs:

```typescript
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');
  if (token) {
    event.locals.user = await verifySessionToken(token);
  }
  return resolve(event);
};
```

Your API routes never parse cookies or verify tokens directly — that logic lives in one place, the hook. For external consumers that can't use browser cookies, support Bearer tokens as a fallback:

```typescript
function requireApiAuth(request: Request, locals: App.Locals) {
  if (locals.user) return locals.user;

  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw error(401, 'Missing or invalid Authorization header');
  }
  const user = validateApiKey(auth.slice(7));
  if (!user) throw error(401, 'Invalid API key');
  return user;
}
```

## Rate Limiting and Security

API endpoints exposed to the internet need protection beyond authentication. **Rate limiting** is best handled at the infrastructure level (Cloudflare, nginx), but here is a basic in-memory approach for low-traffic apps:

```typescript
// src/lib/server/rate-limit.ts
import { error } from '@sveltejs/kit';
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string, limit = 60, windowMs = 60_000): void {
  const now = Date.now();
  const record = hits.get(ip);
  if (!record || now > record.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }
  record.count++;
  if (record.count > limit) throw error(429, 'Too many requests');
}
```

Other production security essentials:

- **Validate Content-Type** before calling `request.json()` — malformed requests will throw.
- **Limit body size** via your adapter or reverse proxy. SvelteKit does not cap request bodies by default.
- **Sanitize output** — never leak stack traces or internal column names to clients.
- **CSRF protection** — `+server.ts` endpoints do not have it built in (form actions do). If your API accepts cookie-based auth from browsers, verify the `Origin` header matches your domain.

## When to Use `+server.ts` vs `+page.server.ts`

This decision comes up constantly. Here is the framework:

**Use `+page.server.ts`** (load functions and form actions) when:
- The data feeds your own SvelteKit pages
- You want SvelteKit to handle serialization, streaming, and hydration
- You need progressive enhancement on forms (works without JavaScript)

**Use `+server.ts`** when:
- External clients need the endpoint (mobile apps, browser extensions, integrations)
- You are receiving webhooks from services like Stripe or GitHub
- You need non-HTML responses (CSV, PDF, images, file downloads)
- You are implementing Server-Sent Events or streaming responses
- You need full control over the response (custom headers, status codes, content types)

The common mistake? Building an internal JSON API with `+server.ts` and then calling it from your own `load` functions with `fetch`. That is extra work for no benefit — SvelteKit already provides a direct data pipeline through `+page.server.ts`. Save the API layer for when you genuinely need HTTP as the interface.

## Try It

Build a server route at `src/routes/api/bookmarks/+server.ts` that handles both GET and POST:

1. **GET** returns a list of bookmarks. Accept `?search=` to filter by title (case-insensitive) and `?limit=` to cap results (default 20, max 100). Return `200` with the JSON array.

2. **POST** accepts `{ url, title }` in the body. Validate that `url` is a valid URL (use `new URL()` to check) and `title` is a non-empty string under 500 characters. On success, return `201` with the created bookmark. On validation failure, return `400` with a descriptive message.

3. Add a `requireAuth` helper that checks `locals.user` and throws `401` if missing. Call it from both handlers.

Bonus: Add CORS headers so the endpoint can be called from a browser extension on a different origin.

## Key Takeaways

- `+server.ts` files are standalone HTTP endpoints — they return raw `Response` objects with no component rendering
- `+page.server.ts` feeds data to a page; `+server.ts` IS the entire response
- Export named functions (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`) — each receives a `RequestEvent` with `request`, `params`, `url`, `cookies`, `locals`, and `platform`
- Use SvelteKit helpers: `json()` for JSON, `error()` for HTTP errors, `redirect()` for redirects, `text()` for plain text
- Always validate input — never trust request bodies, URL params, or query strings from the client
- Authentication flows through `hooks.server.ts` into `locals` — API routes consume it, they don't implement it
- Use `+server.ts` for external APIs, webhooks, file downloads, and streaming; use `+page.server.ts` and form actions when the data feeds your own UI
- Rate limiting and CSRF protection don't come for free on API routes — plan for them in production
