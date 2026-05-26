# REST API Patterns

REST (Representational State Transfer) is not a protocol or a library. It is an architectural style — a set of constraints that, when followed, produce APIs that are predictable, cacheable, and composable. Roy Fielding defined REST in his 2000 doctoral dissertation, and it remains the dominant pattern for web APIs because it maps cleanly onto HTTP semantics that browsers, CDNs, and proxies already understand.

The core insight is this: your API is a collection of **resources** (nouns) that clients interact with using **HTTP methods** (verbs). A resource like "tasks" lives at `/api/tasks`. You GET to read, POST to create, PUT/PATCH to update, DELETE to remove. When every API on your team follows these conventions, a developer who has never seen your codebase can guess most of the endpoints on the first try. That is the real value of REST — not theoretical purity, but practical predictability.

## Resource Naming Conventions

URLs should represent resources, never actions. This is the single most common mistake in API design, and it compounds over time. An API that starts with `/api/getUsers` and `/api/createUser` will inevitably end up with `/api/getUsersByDepartmentAndRole` and `/api/createUserIfNotExistsAndSendEmail`. RESTful resource naming avoids this by separating the "what" (URL) from the "how" (HTTP method).

```
Good (RESTful):
GET    /api/tasks              → List all tasks
POST   /api/tasks              → Create a task
GET    /api/tasks/42           → Get task 42
PUT    /api/tasks/42           → Replace task 42 entirely
PATCH  /api/tasks/42           → Partially update task 42
DELETE /api/tasks/42           → Delete task 42

GET    /api/tasks/42/comments  → List comments on task 42
POST   /api/tasks/42/comments  → Add a comment to task 42

Bad (action-oriented):
GET    /api/getTasks
POST   /api/createTask
POST   /api/deleteTask/42
GET    /api/getTaskComments?taskId=42
POST   /api/markTaskComplete
```

Key rules for resource URLs:

1. **Use plural nouns.** `/api/tasks` not `/api/task`. The collection is plural; an individual item is identified by its ID within that plural collection.
2. **Use kebab-case.** `/api/order-items` not `/api/orderItems` or `/api/order_items`. URLs are case-insensitive by convention, and hyphens are the standard separator.
3. **Nest for relationships, but stop at two levels deep.** `/api/users/5/tasks` is fine. `/api/users/5/tasks/42/comments/7/reactions` is a sign you need a flatter structure.
4. **Never put verbs in the URL.** The HTTP method is the verb. If you find yourself writing `/api/tasks/42/complete`, consider `PATCH /api/tasks/42` with `{ "status": "completed" }` instead.

## HTTP Methods in Depth

Each HTTP method carries semantic meaning. Getting this right affects caching behavior, retry safety, and how intermediaries (proxies, CDNs, load balancers) handle your requests.

```
Method    Safe?   Idempotent?   Request Body?   Typical Use
──────    ─────   ───────────   ─────────────   ───────────
GET       Yes     Yes           No              Read a resource
POST      No      No            Yes             Create a resource
PUT       No      Yes           Yes             Replace a resource entirely
PATCH     No      No*           Yes             Partial update
DELETE    No      Yes           Rarely          Remove a resource
HEAD      Yes     Yes           No              GET without body (check existence)
OPTIONS   Yes     Yes           No              CORS preflight, discover methods
```

**Safe** means the method does not modify server state. Crawlers and prefetch mechanisms assume safe methods can be called without side effects.

**Idempotent** means calling the method multiple times produces the same result as calling it once. This is critical for retry logic: if a network error occurs during a PUT, the client can safely retry because applying the same replacement twice is the same as applying it once. POST is not idempotent — submitting a form twice might create two records.

This is why `DELETE /api/tasks/42` returns 204 even if the task was already deleted: the end state (task 42 does not exist) is the same regardless of how many times you call it.

## HTTP Status Codes That Matter

You do not need to memorize all 70+ status codes. In practice, you will use about a dozen regularly. The key principle: **2xx means success, 3xx means redirect, 4xx means the client did something wrong, 5xx means the server broke**.

```typescript
// 200 — OK (default for successful GET, PUT, PATCH)
return json(task);

// 201 — Created (POST that created a new resource)
return json(task, { status: 201 });

// 204 — No Content (successful DELETE, nothing to return)
return new Response(null, { status: 204 });

// 301 — Moved Permanently (resource URL changed permanently)
// 303 — See Other (redirect after POST, typically used in SvelteKit form actions)
// 304 — Not Modified (ETag/Last-Modified matched, use cached version)

// 400 — Bad Request (malformed input, validation errors)
throw error(400, 'Title must be between 1 and 200 characters');

// 401 — Unauthorized (no valid authentication credentials provided)
throw error(401, 'You must be logged in to access this resource');

// 403 — Forbidden (authenticated but lacks permission)
throw error(403, 'Only administrators can delete tasks');

// 404 — Not Found (resource does not exist)
throw error(404, 'Task not found');

// 409 — Conflict (duplicate entry, state conflict)
throw error(409, 'A task with that title already exists in this project');

// 422 — Unprocessable Entity (syntactically valid but semantically wrong)
throw error(422, 'Due date cannot be in the past');

// 429 — Too Many Requests (rate limit exceeded)
return json({ error: 'Rate limit exceeded' }, {
  status: 429,
  headers: { 'Retry-After': '60' }
});
```

A production war story: I once worked on an API that returned 200 for every response and put the actual status in the JSON body as `{ "success": false, "code": 404 }`. This broke every HTTP client, caching layer, and monitoring tool. Browsers would cache error responses. Retry middleware would not retry. Monitoring dashboards showed 100% success rate while half the API was broken. Use real status codes.

## Standardized Error Response Format

Every error from your API should follow a consistent format. Clients should never have to guess the shape of an error response.

```typescript
// src/lib/server/api-error.ts
import { json } from '@sveltejs/kit';

interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[]>
): Response {
  const body: ApiError = { status, code, message };
  if (details) body.details = details;
  return json(body, { status });
}

// Usage:
// return apiError(400, 'VALIDATION_ERROR', 'Invalid input', {
//   title: ['Title is required', 'Title must be at most 200 characters'],
//   url: ['URL must start with https://']
// });
//
// return apiError(404, 'NOT_FOUND', 'Task with ID 42 does not exist');
// return apiError(409, 'DUPLICATE', 'A bookmark with this URL already exists');
```

The `code` field is a machine-readable string that clients can use in switch statements. The `message` field is human-readable. The `details` object maps field names to arrays of validation errors, which is exactly what form UIs need to display inline errors.

## Request Validation with Zod

Hand-written validation (checking `typeof` and `length` manually) works for trivial cases but becomes a maintenance nightmare as your API grows. Zod gives you runtime validation that produces TypeScript types, so your validation logic and your types are always in sync.

```bash
npm install zod
```

```typescript
// src/lib/server/validators.ts
import { z } from 'zod';

export const createBookmarkSchema = z.object({
  title: z
    .string()
    .min(1, 'Title is required')
    .max(200, 'Title must be 200 characters or fewer')
    .trim(),
  url: z
    .string()
    .url('Must be a valid URL')
    .startsWith('https://', 'URL must use HTTPS'),
  description: z
    .string()
    .max(1000, 'Description must be 1000 characters or fewer')
    .optional()
    .default(''),
  tags: z
    .array(z.string().min(1).max(50))
    .max(10, 'Maximum 10 tags')
    .optional()
    .default([])
});

export const updateBookmarkSchema = createBookmarkSchema.partial().extend({
  id: z.number().int().positive()
});

export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  sort: z.enum(['created_at', 'title', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc')
});

// Type inference — no need to write types separately
export type CreateBookmark = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmark = z.infer<typeof updateBookmarkSchema>;
export type Pagination = z.infer<typeof paginationSchema>;
```

```typescript
// src/lib/server/validate.ts
import type { z } from 'zod';
import { apiError } from './api-error';

export function validateBody<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const result = schema.safeParse(data);

  if (!result.success) {
    const details: Record<string, string[]> = {};

    for (const issue of result.error.issues) {
      const field = issue.path.join('.');
      if (!details[field]) details[field] = [];
      details[field].push(issue.message);
    }

    return {
      success: false,
      response: apiError(400, 'VALIDATION_ERROR', 'Invalid input', details)
    };
  }

  return { success: true, data: result.data };
}

export function validateParams<T extends z.ZodSchema>(
  schema: T,
  searchParams: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; response: Response } {
  const obj = Object.fromEntries(searchParams.entries());
  return validateBody(schema, obj);
}
```

Now your route handlers are concise and every error response has a consistent shape:

```typescript
// src/routes/api/bookmarks/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { desc, asc } from 'drizzle-orm';
import { createBookmarkSchema, paginationSchema } from '$lib/server/validators';
import { validateBody, validateParams } from '$lib/server/validate';
import { apiError } from '$lib/server/api-error';

export const GET: RequestHandler = async ({ url }) => {
  const validated = validateParams(paginationSchema, url.searchParams);
  if (!validated.success) return validated.response;

  const { limit, offset, sort, order } = validated.data;
  const orderFn = order === 'desc' ? desc : asc;

  const results = await db
    .select()
    .from(bookmarks)
    .orderBy(orderFn(bookmarks[sort]))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks);

  return json({
    data: results,
    pagination: {
      total: count,
      limit,
      offset,
      hasMore: offset + limit < count
    }
  });
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return apiError(401, 'UNAUTHORIZED', 'You must be logged in');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const validated = validateBody(createBookmarkSchema, body);
  if (!validated.success) return validated.response;

  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      ...validated.data,
      userId: locals.user.id
    })
    .returning();

  return json(bookmark, { status: 201 });
};
```

## Pagination: Offset vs Cursor

Pagination is not optional for list endpoints. Without it, your API will eventually try to serialize 100,000 rows into a single JSON response and bring down your server.

### Offset Pagination

Offset pagination uses `LIMIT` and `OFFSET` SQL clauses. It is simple and allows jumping to arbitrary pages, but it has a serious flaw: if records are inserted or deleted between page requests, items can be skipped or duplicated.

```typescript
// Offset pagination — simple but has consistency issues
export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const page = Math.max(Number(url.searchParams.get('page')) || 1, 1);
  const offset = (page - 1) * limit;

  const results = await db
    .select()
    .from(bookmarks)
    .orderBy(desc(bookmarks.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(bookmarks);

  return json({
    data: results,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: offset + limit < total,
      hasPrevPage: page > 1
    }
  });
};
```

The problem: if someone adds a bookmark while the client is on page 2, the client will see the last item from page 2 again as the first item on page 3. For many applications this is acceptable. For feeds and timelines, it is not.

### Cursor Pagination

Cursor pagination uses the last item's ID (or timestamp) as a reference point. It is consistent even when data changes, but clients cannot jump to page 5 directly — they must traverse sequentially.

```typescript
// Cursor pagination — consistent, efficient for infinite scroll
export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const cursor = url.searchParams.get('cursor'); // ID of the last item seen

  let query = db
    .select()
    .from(bookmarks)
    .orderBy(desc(bookmarks.id))
    .limit(limit + 1); // Fetch one extra to determine if there are more

  if (cursor) {
    query = query.where(lt(bookmarks.id, Number(cursor)));
  }

  const results = await query;
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return json({
    data: items,
    pagination: {
      nextCursor,
      hasMore
    }
  });
};
```

The trick of fetching `limit + 1` rows is elegant: if you get more rows than the client requested, there are more pages. You slice off the extra row before returning. The client uses `nextCursor` to request the next page.

**When to use which:** Offset for admin panels and search results where users expect page numbers. Cursor for feeds, chat histories, and infinite scroll where consistency matters more than random access.

## Filtering and Sorting with Query Parameters

Design your query parameter conventions once and stick with them across every endpoint.

```typescript
// src/routes/api/bookmarks/+server.ts
import { and, eq, like, gte, lte, desc, asc, sql } from 'drizzle-orm';

const filterSchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  sort: z.enum(['created_at', 'title', 'updated_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.coerce.number().int().positive().optional()
});

export const GET: RequestHandler = async ({ url }) => {
  const validated = validateParams(filterSchema, url.searchParams);
  if (!validated.success) return validated.response;

  const { search, tag, createdAfter, createdBefore, sort, order, limit, cursor } = validated.data;

  // Build WHERE conditions dynamically
  const conditions = [];

  if (search) {
    conditions.push(
      sql`(${bookmarks.title} LIKE ${'%' + search + '%'} OR ${bookmarks.description} LIKE ${'%' + search + '%'})`
    );
  }

  if (tag) {
    conditions.push(sql`${bookmarks.tags} LIKE ${'%' + tag + '%'}`);
  }

  if (createdAfter) {
    conditions.push(gte(bookmarks.createdAt, createdAfter.toISOString()));
  }

  if (createdBefore) {
    conditions.push(lte(bookmarks.createdAt, createdBefore.toISOString()));
  }

  if (cursor) {
    conditions.push(
      order === 'desc'
        ? lt(bookmarks.id, cursor)
        : gt(bookmarks.id, cursor)
    );
  }

  const orderFn = order === 'desc' ? desc : asc;
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const results = await db
    .select()
    .from(bookmarks)
    .where(whereClause)
    .orderBy(orderFn(bookmarks[sort]))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return json({
    data: items,
    pagination: {
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore
    }
  });
};
```

Example requests:

```
GET /api/bookmarks?search=svelte&sort=title&order=asc&limit=10
GET /api/bookmarks?tag=typescript&createdAfter=2024-01-01
GET /api/bookmarks?cursor=150&limit=20
```

## Individual Resource Endpoints

The collection endpoint handles listing and creation. Individual resource endpoints handle read, update, and delete for a single item.

```typescript
// src/routes/api/bookmarks/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { updateBookmarkSchema } from '$lib/server/validators';
import { validateBody } from '$lib/server/validate';
import { apiError } from '$lib/server/api-error';

function parseId(id: string): number | null {
  const parsed = parseInt(id, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export const GET: RequestHandler = async ({ params }) => {
  const id = parseId(params.id);
  if (!id) return apiError(400, 'INVALID_ID', 'ID must be a positive integer');

  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.id, id));

  if (!bookmark) {
    return apiError(404, 'NOT_FOUND', `Bookmark with ID ${id} does not exist`);
  }

  return json(bookmark);
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) {
    return apiError(401, 'UNAUTHORIZED', 'You must be logged in');
  }

  const id = parseId(params.id);
  if (!id) return apiError(400, 'INVALID_ID', 'ID must be a positive integer');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const validated = validateBody(updateBookmarkSchema, body);
  if (!validated.success) return validated.response;

  // Check ownership
  const [existing] = await db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));

  if (!existing) {
    return apiError(404, 'NOT_FOUND', `Bookmark with ID ${id} does not exist`);
  }

  if (existing.userId !== locals.user.id) {
    return apiError(403, 'FORBIDDEN', 'You can only edit your own bookmarks');
  }

  const [updated] = await db
    .update(bookmarks)
    .set({
      ...validated.data,
      updatedAt: new Date().toISOString()
    })
    .where(eq(bookmarks.id, id))
    .returning();

  return json(updated);
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) {
    return apiError(401, 'UNAUTHORIZED', 'You must be logged in');
  }

  const id = parseId(params.id);
  if (!id) return apiError(400, 'INVALID_ID', 'ID must be a positive integer');

  // Check ownership before deleting
  const [existing] = await db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));

  if (!existing) {
    // Return 204 even if not found — idempotent delete
    return new Response(null, { status: 204 });
  }

  if (existing.userId !== locals.user.id) {
    return apiError(403, 'FORBIDDEN', 'You can only delete your own bookmarks');
  }

  await db.delete(bookmarks).where(eq(bookmarks.id, id));
  return new Response(null, { status: 204 });
};
```

Notice the idempotent DELETE: if the resource is already gone, we still return 204. The client asked for the resource to not exist; it does not exist. Mission accomplished.

## API Versioning

APIs change. Fields get renamed, response shapes evolve, deprecated endpoints get removed. You need a strategy for evolving your API without breaking existing clients.

### URL-Based Versioning

The simplest approach. Route different versions to different handlers:

```
src/routes/api/
  v1/
    bookmarks/
      +server.ts          ← Original API
      [id]/+server.ts
  v2/
    bookmarks/
      +server.ts          ← New response format, breaking changes
      [id]/+server.ts
```

```typescript
// src/routes/api/v2/bookmarks/+server.ts
// V2 wraps all responses in a data envelope and uses ISO dates
export const GET: RequestHandler = async ({ url }) => {
  const bookmarks = await fetchBookmarks(url.searchParams);

  return json({
    data: bookmarks.map(b => ({
      ...b,
      createdAt: new Date(b.createdAt).toISOString(),
      links: {
        self: `/api/v2/bookmarks/${b.id}`,
        tags: `/api/v2/bookmarks/${b.id}/tags`
      }
    })),
    meta: { version: 2 }
  });
};
```

URL versioning is explicit and easy to reason about. The downside is code duplication. In practice, you share the business logic and only version the serialization layer.

### Header-Based Versioning

Alternatively, use a custom header:

```typescript
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const apiVersion = event.request.headers.get('X-API-Version') || '1';
  event.locals.apiVersion = parseInt(apiVersion);
  return resolve(event);
};

// In your route handler:
export const GET: RequestHandler = async ({ locals }) => {
  const bookmarks = await fetchBookmarks();

  if (locals.apiVersion >= 2) {
    return json({ data: bookmarks, meta: { version: 2 } });
  }

  return json(bookmarks); // v1 format
};
```

I generally prefer URL versioning for public APIs (it is more discoverable) and header versioning for internal APIs (it avoids route duplication).

## Rate Limiting

Without rate limiting, a single misbehaving client can overwhelm your API. In production, your reverse proxy (Nginx, Cloudflare, Vercel Edge) typically handles rate limiting. But understanding how to implement it yourself teaches you the underlying mechanics.

```typescript
// src/lib/server/rate-limit.ts
const requests = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  identifier: string,
  maxRequests: number = 60,
  windowMs: number = 60_000
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const record = requests.get(identifier);

  if (!record || now > record.resetAt) {
    const resetAt = now + windowMs;
    requests.set(identifier, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  record.count++;

  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt };
  }

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt
  };
}

// Clean up expired entries periodically to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of requests) {
    if (now > value.resetAt) requests.delete(key);
  }
}, 60_000);
```

```typescript
// src/hooks.server.ts — apply rate limiting to all API routes
import { rateLimit } from '$lib/server/rate-limit';

export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api/')) {
    const ip = event.getClientAddress();
    const { allowed, remaining, resetAt } = rateLimit(ip, 100, 60_000);

    if (!allowed) {
      return json(
        { status: 429, code: 'RATE_LIMITED', message: 'Too many requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
            'X-RateLimit-Limit': '100',
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.ceil(resetAt / 1000))
          }
        }
      );
    }

    const response = await resolve(event);

    // Add rate limit headers to all API responses
    response.headers.set('X-RateLimit-Limit', '100');
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    response.headers.set('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));

    return response;
  }

  return resolve(event);
};
```

**Important caveat:** This in-memory rate limiter works for a single server instance. In production with multiple instances, you need a shared store like Redis. Most deployment platforms (Vercel, Cloudflare) provide built-in rate limiting at the edge, which is far more effective because it blocks abusive traffic before it reaches your application.

## CORS in SvelteKit

Cross-Origin Resource Sharing (CORS) controls which domains can call your API from the browser. If your API at `api.example.com` needs to serve requests from `app.example.com`, you must configure CORS headers.

```typescript
// src/hooks.server.ts
const ALLOWED_ORIGINS = [
  'https://app.example.com',
  'https://admin.example.com'
];

if (import.meta.env.DEV) {
  ALLOWED_ORIGINS.push('http://localhost:5173');
}

export const handle: Handle = async ({ event, resolve }) => {
  const origin = event.request.headers.get('origin');

  // Handle preflight OPTIONS requests
  if (event.request.method === 'OPTIONS') {
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
        }
      });
    }

    return new Response(null, { status: 403 });
  }

  const response = await resolve(event);

  // Add CORS headers to actual responses
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
};
```

The `Access-Control-Max-Age` header is an often-overlooked optimization. Without it, browsers send a preflight OPTIONS request before every actual request. Setting it to 86400 (24 hours) means the browser caches the preflight result and skips it for subsequent requests.

## Authentication Middleware for API Routes

Protect your API routes with a reusable authentication check.

```typescript
// src/lib/server/api-auth.ts
import type { RequestEvent } from '@sveltejs/kit';
import { apiError } from './api-error';

export function requireAuth(event: RequestEvent) {
  if (!event.locals.user) {
    return apiError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return null; // null means auth passed
}

export function requireRole(event: RequestEvent, ...roles: string[]) {
  const authError = requireAuth(event);
  if (authError) return authError;

  if (!roles.includes(event.locals.user!.role)) {
    return apiError(403, 'FORBIDDEN', `Requires one of: ${roles.join(', ')}`);
  }
  return null;
}
```

```typescript
// Usage in any API route
export const DELETE: RequestHandler = async (event) => {
  const authError = requireRole(event, 'admin', 'moderator');
  if (authError) return authError;

  // ... delete logic
};
```

## Building a Complete RESTful Bookmarks API

Here is the complete bookmarks API bringing together everything covered in this lesson — validation, pagination, filtering, error handling, and authentication:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description').default(''),
  tags: text('tags').default(''), // comma-separated for simplicity
  userId: integer('user_id').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
});
```

```typescript
// src/routes/api/bookmarks/+server.ts — Collection endpoint
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { desc, asc, sql, and, like, eq, lt, gt } from 'drizzle-orm';
import { createBookmarkSchema } from '$lib/server/validators';
import { validateBody, validateParams } from '$lib/server/validate';
import { apiError } from '$lib/server/api-error';
import { requireAuth } from '$lib/server/api-auth';

export const GET: RequestHandler = async (event) => {
  const { url, locals } = event;
  const authError = requireAuth(event);
  if (authError) return authError;

  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const cursor = url.searchParams.get('cursor');
  const search = url.searchParams.get('search');
  const tag = url.searchParams.get('tag');

  const conditions = [eq(bookmarks.userId, locals.user!.id)];

  if (search) {
    conditions.push(
      sql`(${bookmarks.title} LIKE ${'%' + search + '%'} OR ${bookmarks.description} LIKE ${'%' + search + '%'})`
    );
  }

  if (tag) {
    conditions.push(like(bookmarks.tags, `%${tag}%`));
  }

  if (cursor) {
    conditions.push(lt(bookmarks.id, Number(cursor)));
  }

  const results = await db
    .select()
    .from(bookmarks)
    .where(and(...conditions))
    .orderBy(desc(bookmarks.id))
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return json({
    data: items,
    pagination: {
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore
    }
  });
};

export const POST: RequestHandler = async (event) => {
  const authError = requireAuth(event);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const validated = validateBody(createBookmarkSchema, body);
  if (!validated.success) return validated.response;

  // Check for duplicate URL for this user
  const [existing] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.url, validated.data.url),
        eq(bookmarks.userId, event.locals.user!.id)
      )
    );

  if (existing) {
    return apiError(409, 'DUPLICATE', 'You already have a bookmark with this URL');
  }

  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      ...validated.data,
      tags: validated.data.tags?.join(',') ?? '',
      userId: event.locals.user!.id
    })
    .returning();

  return json(bookmark, { status: 201 });
};
```

```typescript
// src/routes/api/bookmarks/[id]/+server.ts — Individual endpoint
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { eq, and } from 'drizzle-orm';
import { updateBookmarkSchema } from '$lib/server/validators';
import { validateBody } from '$lib/server/validate';
import { apiError } from '$lib/server/api-error';
import { requireAuth } from '$lib/server/api-auth';

export const GET: RequestHandler = async (event) => {
  const authError = requireAuth(event);
  if (authError) return authError;

  const id = parseInt(event.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return apiError(400, 'INVALID_ID', 'ID must be a positive integer');
  }

  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, event.locals.user!.id)
      )
    );

  if (!bookmark) {
    return apiError(404, 'NOT_FOUND', `Bookmark ${id} not found`);
  }

  return json(bookmark);
};

export const PUT: RequestHandler = async (event) => {
  const authError = requireAuth(event);
  if (authError) return authError;

  const id = parseInt(event.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return apiError(400, 'INVALID_ID', 'ID must be a positive integer');
  }

  let body: unknown;
  try {
    body = await event.request.json();
  } catch {
    return apiError(400, 'INVALID_JSON', 'Request body must be valid JSON');
  }

  const validated = validateBody(updateBookmarkSchema, body);
  if (!validated.success) return validated.response;

  const [updated] = await db
    .update(bookmarks)
    .set({
      ...validated.data,
      updatedAt: new Date().toISOString()
    })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, event.locals.user!.id)
      )
    )
    .returning();

  if (!updated) {
    return apiError(404, 'NOT_FOUND', `Bookmark ${id} not found`);
  }

  return json(updated);
};

export const DELETE: RequestHandler = async (event) => {
  const authError = requireAuth(event);
  if (authError) return authError;

  const id = parseInt(event.params.id, 10);
  if (!Number.isFinite(id) || id < 1) {
    return apiError(400, 'INVALID_ID', 'ID must be a positive integer');
  }

  const result = await db
    .delete(bookmarks)
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, event.locals.user!.id)
      )
    );

  return new Response(null, { status: 204 });
};
```

## Try It

1. **Design a complete REST API** for a "notes" resource with these fields: `id`, `title`, `content`, `category`, `isPinned`, `createdAt`, `updatedAt`. Include full CRUD with Zod validation, cursor pagination, filtering by category and search term, and sorting by any field.

2. **Add rate limiting** to your API that allows 30 requests per minute per user. Return proper `429` responses with `Retry-After` headers when the limit is exceeded. Include `X-RateLimit-*` headers on every response.

3. **Implement a "soft delete" pattern** where DELETE does not actually remove the row but sets a `deletedAt` timestamp. Modify your GET endpoints to exclude soft-deleted items by default, but add a `?includeDeleted=true` query parameter for admin users.

## Key Takeaways

- URLs represent resources (nouns), HTTP methods represent actions (verbs) — this separation is what makes REST predictable
- Use two route files per resource: `/api/resource/+server.ts` for collections and `/api/resource/[id]/+server.ts` for individual items
- Validate every request body with Zod to get runtime validation and TypeScript types from a single source of truth
- Offset pagination is simple but inconsistent under concurrent writes; cursor pagination is consistent but cannot jump to arbitrary pages
- Standardize your error response format across every endpoint — clients should never guess the shape of an error
- Rate limiting, CORS, and authentication are cross-cutting concerns best handled in hooks rather than duplicated in every route
- Use correct HTTP status codes: they affect caching, retries, monitoring, and every tool in the HTTP ecosystem
- DELETE should be idempotent — deleting something that is already gone should return 204, not 404
- API versioning (URL or header) lets you evolve your API without breaking existing clients
