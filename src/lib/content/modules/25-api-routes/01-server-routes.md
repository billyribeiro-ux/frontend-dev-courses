# Server Routes

SvelteKit is not just a frontend framework — it is a full-stack platform. Beyond rendering pages, SvelteKit lets you create **API endpoints** that live right alongside your routes. These are called server routes, and they are defined in `+server.ts` files.

Before we write code, let's build the right mental model. You already know that `+page.server.ts` files contain `load` functions that fetch data and hand it to a Svelte component for rendering. The component is the response. A `+server.ts` file is different: **there is no component**. The file itself IS the response. It receives an HTTP request and returns a raw `Response` object — JSON, plain text, a file download, an event stream, whatever you need. No HTML, no rendering pipeline, no hydration. Just HTTP in, HTTP out.

This distinction matters architecturally. When you need to feed data to your own UI, use `+page.server.ts` and let SvelteKit handle serialization and hydration. When you need a standalone HTTP endpoint — something a mobile app can call, a webhook receiver, a download URL, or an SSE stream — that's `+server.ts` territory.

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

A single `+server.ts` file can handle every HTTP method a resource needs:

```typescript
// src/routes/api/items/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => { /* list items */ };
export const POST: RequestHandler = async () => { /* create item */ };
```

```typescript
// src/routes/api/items/[id]/+server.ts
export const GET: RequestHandler = async () => { /* get one item */ };
export const PUT: RequestHandler = async () => { /* replace item */ };
export const PATCH: RequestHandler = async () => { /* partial update */ };
export const DELETE: RequestHandler = async () => { /* remove item */ };
```

Each handler receives one argument: a `RequestEvent` object. Let's look at what's inside it.

## RequestEvent Anatomy

Every handler receives the same `RequestEvent` shape. Understanding its properties is essential — this is your interface to the entire HTTP request and the SvelteKit runtime:

```typescript
export const GET: RequestHandler = async (event) => {
  // The raw Web API Request object. Use it for headers, body, method.
  event.request;        // Request

  // Route parameters from dynamic segments like [id] or [slug]
  event.params;         // { id: string } for routes/api/items/[id]

  // The full URL. Great for query strings.
  event.url;            // URL object — event.url.searchParams.get('q')

  // Read and write cookies — HttpOnly by default, path '/' by default
  event.cookies;        // Cookies API — .get(), .set(), .delete()

  // Shared data set by hooks (handle function in hooks.server.ts)
  event.locals;         // App.Locals — typically { user, session }

  // Adapter-specific data (Cloudflare env, Vercel edge config, etc.)
  event.platform;       // Platform-specific context

  // Fetch that preserves cookies — use for internal API calls
  event.fetch;          // Enhanced fetch

  // Set individual headers on the response
  event.setHeaders;     // (headers: Record<string, string>) => void

  return json({ ok: true });
};
```

The `locals` property deserves special attention. In your `hooks.server.ts`, you typically parse a session token and attach user data to `event.locals`. By the time your API route handler runs, `locals.user` is already populated. This is how authentication flows through SvelteKit — hooks run first, routes consume the result.

## Response Helpers

SvelteKit provides four helpers from `@sveltejs/kit` that cover the vast majority of response patterns:

```typescript
import { json, error, redirect, text } from '@sveltejs/kit';

// json() — serialize an object and set Content-Type: application/json
return json({ id: 1, title: 'Hello' });
return json(created, { status: 201 });

// error() — throw an HTTP error (stops execution)
throw error(404, 'Bookmark not found');
throw error(400, { message: 'Invalid URL', field: 'url' });

// redirect() — send a 3xx redirect (throw it, don't return it)
throw redirect(303, '/login');
throw redirect(301, '/new-location');

// text() — return a plain text response
return text('OK', { status: 200 });
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

Since these are standard Web `Response` objects, anything you can do with the Fetch API response works here. That's by design — SvelteKit does not invent its own abstraction layer.

## Status Codes That Matter

Choose the right status code. Clients, browsers, and caches all behave differently based on the code you return:

| Code | Name | When to use |
|------|------|-------------|
| `200` | OK | Successful GET, PUT, PATCH |
| `201` | Created | Successful POST that creates a resource |
| `204` | No Content | Successful DELETE (nothing to return) |
| `301` | Moved Permanently | Resource URL has changed forever |
| `303` | See Other | Redirect after form submission |
| `400` | Bad Request | Invalid input from the client |
| `401` | Unauthorized | No valid authentication provided |
| `403` | Forbidden | Authenticated but not permitted |
| `404` | Not Found | Resource doesn't exist |
| `409` | Conflict | Duplicate or state conflict |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Server Error | Unexpected failure (SvelteKit sends this if your handler throws) |

A common mistake is returning `200` for everything and putting `{ success: false }` in the body. Don't do that. HTTP clients, error-tracking tools, caches, and retry logic all depend on status codes to do the right thing.

## Setting Response Headers

Use the second argument of `json()` or construct a `Response` to set headers:

```typescript
export const GET: RequestHandler = async () => {
  const data = await fetchExpensiveData();

  return json(data, {
    headers: {
      // Cache for 60 seconds, revalidate for up to 5 minutes
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
    }
  });
};
```

For CORS (Cross-Origin Resource Sharing), you need to handle preflight `OPTIONS` requests and set the right headers on every response:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://my-other-app.com',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const OPTIONS: RequestHandler = async () => {
  // Preflight requests get just the headers, no body
  return new Response(null, { headers: corsHeaders });
};

export const GET: RequestHandler = async () => {
  const data = await getBookmarks();
  return json(data, { headers: corsHeaders });
};
```

If you find yourself adding CORS headers everywhere, move them into a `handle` hook in `hooks.server.ts` where they apply globally. Don't scatter them across every endpoint.

## A Complete Bookmarks API

Let's build something real. A bookmarks CRUD API with proper validation, error handling, and authentication. This is the kind of endpoint a browser extension, a mobile app, or a third-party integration would call.

```typescript
// src/routes/api/bookmarks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

function requireAuth(locals: App.Locals) {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  return locals.user;
}

function validateBookmark(body: unknown): { url: string; title: string } {
  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be a JSON object');
  }

  const { url, title } = body as Record<string, unknown>;

  if (!url || typeof url !== 'string') {
    throw error(400, 'URL is required');
  }

  try {
    new URL(url); // validates URL format
  } catch {
    throw error(400, 'Invalid URL format');
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw error(400, 'Title is required');
  }

  if (title.length > 500) {
    throw error(400, 'Title must be 500 characters or fewer');
  }

  return { url: url.trim(), title: title.trim() };
}

// List all bookmarks for the authenticated user
export const GET: RequestHandler = async ({ locals, url }) => {
  const user = requireAuth(locals);

  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);

  const results = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, user.id))
    .limit(limit)
    .offset(offset);

  return json(results);
};

// Create a new bookmark
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireAuth(locals);
  const body = await request.json();
  const { url, title } = validateBookmark(body);

  const [created] = await db
    .insert(bookmarks)
    .values({ url, title, userId: user.id })
    .returning();

  return json(created, { status: 201 });
};
```

```typescript
// src/routes/api/bookmarks/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

function requireAuth(locals: App.Locals) {
  if (!locals.user) {
    throw error(401, 'Authentication required');
  }
  return locals.user;
}

// Get a single bookmark
export const GET: RequestHandler = async ({ params, locals }) => {
  const user = requireAuth(locals);

  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, Number(params.id)), eq(bookmarks.userId, user.id)));

  if (!bookmark) {
    throw error(404, 'Bookmark not found');
  }

  return json(bookmark);
};

// Update a bookmark
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  const user = requireAuth(locals);
  const body = await request.json();

  // Validate the ID is a number, not arbitrary input
  const id = Number(params.id);
  if (Number.isNaN(id)) {
    throw error(400, 'Invalid bookmark ID');
  }

  const [updated] = await db
    .update(bookmarks)
    .set({ url: body.url, title: body.title })
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning();

  if (!updated) {
    throw error(404, 'Bookmark not found');
  }

  return json(updated);
};

// Delete a bookmark
export const DELETE: RequestHandler = async ({ params, locals }) => {
  const user = requireAuth(locals);

  const id = Number(params.id);
  if (Number.isNaN(id)) {
    throw error(400, 'Invalid bookmark ID');
  }

  const [deleted] = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning();

  if (!deleted) {
    throw error(404, 'Bookmark not found');
  }

  return new Response(null, { status: 204 });
};
```

Notice the pattern: every handler checks authentication, validates input, scopes queries to the current user, and returns the right status code. The `and()` clause in the WHERE prevents users from accessing each other's bookmarks — authorization baked into the query itself.

## Authentication in API Routes

Authentication typically flows through hooks. Here's how the pieces connect:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
  const token = event.cookies.get('session');

  if (token) {
    const user = await verifySessionToken(token);
    event.locals.user = user; // null if token is invalid
  }

  return resolve(event);
};
```

By the time any `+server.ts` handler runs, `locals.user` is either populated or `null`. Your API routes never parse cookies or verify tokens directly — that logic lives in one place, the hook.

For API endpoints consumed by external clients (not your own browser pages), you'll often use Bearer tokens instead of cookies:

```typescript
function requireApiAuth(request: Request, locals: App.Locals) {
  // First check cookie-based auth (from hooks)
  if (locals.user) return locals.user;

  // Fall back to Bearer token for API consumers
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    throw error(401, 'Missing or invalid Authorization header');
  }

  const apiKey = auth.slice(7);
  const user = validateApiKey(apiKey); // your implementation

  if (!user) {
    throw error(401, 'Invalid API key');
  }

  return user;
}
```

## Rate Limiting and Security

API endpoints exposed to the internet need protection. Here are the essentials:

**Rate limiting** is best done at the infrastructure level (Cloudflare, nginx, a reverse proxy), but you can implement basic in-memory limiting for development or low-traffic apps:

```typescript
// src/lib/server/rate-limit.ts
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string, limit = 60, windowMs = 60_000): void {
  const now = Date.now();
  const record = hits.get(ip);

  if (!record || now > record.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + windowMs });
    return;
  }

  record.count++;
  if (record.count > limit) {
    throw error(429, 'Too many requests. Please try again later.');
  }
}
```

**Other security considerations** for production API routes:

- **Validate Content-Type**: Before calling `request.json()`, check that the Content-Type header is `application/json`. A malformed request will throw otherwise.
- **Limit body size**: SvelteKit doesn't limit request bodies by default. Configure your adapter or reverse proxy to cap request sizes.
- **Sanitize output**: Don't leak internal error messages, stack traces, or database column names to clients. In production, return generic messages.
- **CSRF protection**: SvelteKit's form actions have built-in CSRF protection, but `+server.ts` endpoints do not. If your API accepts cookie-based auth from browsers, verify the `Origin` header matches your domain.

## When to Use `+server.ts` vs `+page.server.ts`

This decision comes up constantly. Here's the framework:

**Use `+page.server.ts`** (load functions and form actions) when:
- The data feeds your own SvelteKit pages
- You want SvelteKit to handle serialization, streaming, and hydration
- You need progressive enhancement on forms (works without JavaScript)
- You don't need external consumers to call this endpoint

**Use `+server.ts`** when:
- External clients need the endpoint (mobile apps, browser extensions, third-party integrations)
- You're receiving webhooks from services like Stripe or GitHub
- You need to return non-HTML responses (CSV, PDF, images, file downloads)
- You're implementing Server-Sent Events (SSE) or streaming responses
- You need full control over the response (custom headers, status codes, content types)

The common mistake? Building an internal JSON API with `+server.ts` and then calling it from your own `load` functions with `fetch`. That's extra work for no benefit — SvelteKit already provides a direct data pipeline through `+page.server.ts`. Save the API layer for when you genuinely need HTTP as the interface.

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
