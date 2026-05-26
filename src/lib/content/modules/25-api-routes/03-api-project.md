# Building a REST API

Time to put everything together. In this lesson you will build a complete REST API for a **bookmark manager** application. The API will support creating, reading, updating, and deleting bookmarks, with Zod validation, auth middleware, cursor-based pagination, full-text search, rate limiting, structured error handling, and automated testing with Vitest.

By the end you will have a production-grade backend that any frontend -- Svelte, React, a mobile app, or a CLI tool -- could consume. This is the power of building APIs with SvelteKit: you get both the frontend and the backend in one project, sharing types, validation schemas, and utilities across the boundary.

## Project Structure

Organize your API routes cleanly. The key principle is separation of concerns: routes handle HTTP, services handle business logic, and shared modules handle cross-cutting concerns like validation and auth.

```
src/routes/api/
  bookmarks/
    +server.ts              GET (list/search), POST (create)
    [id]/
      +server.ts            GET (single), PATCH (partial update), DELETE
    tags/
      +server.ts            GET (list all tags)
src/lib/server/
  db.ts                     Database connection (Drizzle)
  schema.ts                 Drizzle schema definitions
  validators.ts             Zod schemas for request validation
  auth.ts                   Auth middleware / helpers
  rate-limit.ts             Rate limiting logic
  api-utils.ts              Shared response helpers
```

This structure scales. When you add a new resource -- say, collections or sharing -- you create a new directory under `/api` and a new schema, validator, and service module. The shared infrastructure stays in `$lib/server`.

## Defining the Schema

Start with a clear database schema. Bookmarks have a title, URL, optional description, tags, and belong to a user:

```typescript
// src/lib/server/schema.ts
import { pgTable, serial, text, timestamp, boolean, integer, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

export const bookmarks = pgTable('bookmarks', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  title: text('title').notNull(),
  description: text('description').default(''),
  tags: jsonb('tags').$type<string[]>().default([]),
  pinned: boolean('pinned').notNull().default(false),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});
```

A few architectural decisions worth noting. Tags are stored as a JSONB array rather than a separate join table. For a bookmark manager where tags are simple strings, this is the right tradeoff -- it avoids the complexity of a many-to-many relationship and makes reads fast. If you needed tag metadata (descriptions, colors, follower counts), a separate table would be better. The `onDelete: 'cascade'` on `userId` means deleting a user automatically deletes all their bookmarks -- the database enforces referential integrity.

## Validation with Zod

Replace hand-rolled validation with Zod schemas. Zod gives you type inference, composable schemas, and detailed error messages for free:

```typescript
// src/lib/server/validators.ts
import { z } from 'zod';

// Reusable field schemas
const urlField = z
  .string()
  .url('Must be a valid URL')
  .max(2048, 'URL cannot exceed 2048 characters');

const titleField = z
  .string()
  .min(1, 'Title is required')
  .max(200, 'Title cannot exceed 200 characters')
  .transform(s => s.trim());

const descriptionField = z
  .string()
  .max(1000, 'Description cannot exceed 1000 characters')
  .transform(s => s.trim())
  .optional()
  .default('');

const tagsField = z
  .array(z.string().min(1).max(50).transform(s => s.toLowerCase().trim()))
  .max(20, 'Cannot have more than 20 tags')
  .optional()
  .default([]);

// Full schema for creating a bookmark
export const createBookmarkSchema = z.object({
  url: urlField,
  title: titleField,
  description: descriptionField,
  tags: tagsField,
  pinned: z.boolean().optional().default(false)
});

// Partial schema for PATCH updates -- every field is optional
export const updateBookmarkSchema = z.object({
  url: urlField.optional(),
  title: titleField.optional(),
  description: descriptionField,
  tags: tagsField,
  pinned: z.boolean().optional(),
  archived: z.boolean().optional()
}).refine(
  (data) => Object.values(data).some(v => v !== undefined),
  { message: 'At least one field must be provided for update' }
);

// Query parameters for listing bookmarks
export const listBookmarksSchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  q: z.string().max(200).optional(),
  tag: z.string().max(50).optional(),
  pinned: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  archived: z.enum(['true', 'false']).transform(v => v === 'true').optional().default('false')
});

// Infer TypeScript types from the schemas
export type CreateBookmarkInput = z.infer<typeof createBookmarkSchema>;
export type UpdateBookmarkInput = z.infer<typeof updateBookmarkSchema>;
export type ListBookmarksQuery = z.infer<typeof listBookmarksSchema>;
```

Zod schemas serve triple duty: runtime validation, TypeScript type inference, and self-documenting API contracts. The `.transform()` calls normalize data on the way in -- trimming whitespace and lowercasing tags -- so your business logic does not need to worry about data hygiene.

The `updateBookmarkSchema` uses `.refine()` to ensure the client sends at least one field. Without this, a PATCH request with an empty body would succeed but do nothing -- confusing for API consumers.

## API Utility Helpers

Create shared response helpers to keep your endpoints consistent:

```typescript
// src/lib/server/api-utils.ts
import { json, error } from '@sveltejs/kit';
import type { z } from 'zod';

/**
 * Parse and validate a JSON request body against a Zod schema.
 * Throws a 400 error with structured validation errors on failure.
 */
export async function parseBody<T extends z.ZodType>(
  request: Request,
  schema: T
): Promise<z.infer<T>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw error(400, {
      message: 'Invalid JSON in request body'
    });
  }

  const result = schema.safeParse(body);

  if (!result.success) {
    const fieldErrors = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }));

    throw error(400, {
      message: 'Validation failed',
      errors: fieldErrors
    } as any);
  }

  return result.data;
}

/**
 * Parse URL search params against a Zod schema.
 * Converts the URLSearchParams to a plain object first.
 */
export function parseQuery<T extends z.ZodType>(
  url: URL,
  schema: T
): z.infer<T> {
  const params: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = schema.safeParse(params);

  if (!result.success) {
    const fieldErrors = result.error.issues.map(issue => ({
      field: issue.path.join('.'),
      message: issue.message
    }));

    throw error(400, {
      message: 'Invalid query parameters',
      errors: fieldErrors
    } as any);
  }

  return result.data;
}

/**
 * Standard paginated response envelope.
 */
export function paginatedResponse<T>(
  items: T[],
  nextCursor: number | null,
  total?: number
) {
  return json({
    data: items,
    pagination: {
      nextCursor,
      hasMore: nextCursor !== null,
      ...(total !== undefined && { total })
    }
  });
}
```

These helpers enforce consistency. Every validation error has the same shape -- `{ message, errors: [{ field, message }] }` -- which makes client-side error handling predictable. API consumers can always parse errors the same way regardless of which endpoint they hit.

## Auth Middleware

Protect your API endpoints by extracting a reusable auth check:

```typescript
// src/lib/server/auth.ts
import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Require authentication. Returns the user or throws 401.
 * Use this at the top of any protected endpoint.
 */
export function requireAuth(event: RequestEvent) {
  const user = event.locals.user;

  if (!user) {
    throw error(401, {
      message: 'Authentication required. Include a valid session cookie.'
    });
  }

  return user;
}

/**
 * Optional auth -- returns the user if logged in, null otherwise.
 * Useful for endpoints that behave differently for authenticated users.
 */
export function optionalAuth(event: RequestEvent) {
  return event.locals.user ?? null;
}
```

This assumes your `hooks.server.ts` populates `event.locals.user` from a session cookie (covered in the authentication module). The pattern is simple: call `requireAuth(event)` at the top of any handler that needs a logged-in user. It either returns the user object or throws a 401, short-circuiting the handler.

## Rate Limiting

Protect your API from abuse with a simple in-memory rate limiter. For production, use Redis or a dedicated service, but this pattern demonstrates the concept:

```typescript
// src/lib/server/rate-limit.ts
import { error } from '@sveltejs/kit';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limits = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (entry.resetAt < now) {
      limits.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Check rate limit for a given key (usually IP or user ID).
 * Throws 429 if the limit is exceeded.
 *
 * @param key     - Unique identifier (IP address, user ID)
 * @param max     - Maximum requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export function checkRateLimit(
  key: string,
  max: number = 60,
  windowMs: number = 60_000
) {
  const now = Date.now();
  const entry = limits.get(key);

  if (!entry || entry.resetAt < now) {
    limits.set(key, { count: 1, resetAt: now + windowMs });
    return { remaining: max - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    throw error(429, {
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`
    });
  }

  return { remaining: max - entry.count, resetAt: entry.resetAt };
}

/**
 * Apply rate limit headers to a response.
 */
export function rateLimitHeaders(
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': new Date(resetAt).toISOString()
  };
}
```

An important caveat: in-memory rate limiting only works for single-server deployments. On Vercel or any serverless platform, each invocation is a fresh process, so the `Map` is always empty. For serverless, use Vercel KV, Upstash Redis, or Cloudflare's `RateLimiter` binding. The API surface stays the same -- you swap the storage backend.

## The Collection Endpoint

Handle listing and creating bookmarks. This is where pagination, search, filtering, and auth all come together:

```typescript
// src/routes/api/bookmarks/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { createBookmarkSchema, listBookmarksSchema } from '$lib/server/validators';
import { requireAuth } from '$lib/server/auth';
import { parseBody, parseQuery, paginatedResponse } from '$lib/server/api-utils';
import { checkRateLimit, rateLimitHeaders } from '$lib/server/rate-limit';
import { desc, eq, and, lt, ilike, sql } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
  const user = requireAuth(event);

  // Rate limit: 120 reads per minute
  const { remaining, resetAt } = checkRateLimit(`get:${user.id}`, 120);

  const query = parseQuery(event.url, listBookmarksSchema);

  // Build the WHERE clause dynamically
  const conditions = [eq(bookmarks.userId, user.id)];

  if (query.archived !== undefined) {
    conditions.push(eq(bookmarks.archived, query.archived));
  }

  if (query.pinned !== undefined) {
    conditions.push(eq(bookmarks.pinned, query.pinned));
  }

  if (query.tag) {
    // Query JSONB array for tag containment
    conditions.push(sql`${bookmarks.tags} @> ${JSON.stringify([query.tag])}::jsonb`);
  }

  if (query.q) {
    // Full-text search across title, URL, and description
    const searchTerm = `%${query.q}%`;
    conditions.push(
      sql`(
        ${bookmarks.title} ILIKE ${searchTerm} OR
        ${bookmarks.url} ILIKE ${searchTerm} OR
        ${bookmarks.description} ILIKE ${searchTerm}
      )`
    );
  }

  // Cursor-based pagination: fetch items with id < cursor
  if (query.cursor) {
    conditions.push(lt(bookmarks.id, query.cursor));
  }

  // Fetch one extra to determine if there are more results
  const results = await db
    .select()
    .from(bookmarks)
    .where(and(...conditions))
    .orderBy(desc(bookmarks.pinned), desc(bookmarks.createdAt))
    .limit(query.limit + 1);

  const hasMore = results.length > query.limit;
  const items = hasMore ? results.slice(0, query.limit) : results;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  const response = paginatedResponse(items, nextCursor);

  // Add rate limit headers
  const headers = rateLimitHeaders(remaining, resetAt);
  Object.entries(headers).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
};

export const POST: RequestHandler = async (event) => {
  const user = requireAuth(event);

  // Rate limit: 30 writes per minute
  const { remaining, resetAt } = checkRateLimit(`post:${user.id}`, 30);

  const data = await parseBody(event.request, createBookmarkSchema);

  // Check for duplicate URL for this user
  const [existing] = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(and(
      eq(bookmarks.userId, user.id),
      eq(bookmarks.url, data.url)
    ))
    .limit(1);

  if (existing) {
    return json(
      { message: 'You already have a bookmark for this URL', existingId: existing.id },
      { status: 409 }
    );
  }

  const [bookmark] = await db
    .insert(bookmarks)
    .values({
      ...data,
      userId: user.id
    })
    .returning();

  return json(bookmark, {
    status: 201,
    headers: {
      Location: `/api/bookmarks/${bookmark.id}`,
      ...rateLimitHeaders(remaining, resetAt)
    }
  });
};
```

Several production patterns are at work here. **Cursor-based pagination** (using `id < cursor`) is superior to offset-based pagination for real-time data. With offset pagination, inserting a new item shifts every subsequent page -- users see duplicates or miss items. Cursors are stable. The "fetch N+1" trick (requesting `limit + 1` items) is the standard way to detect whether more results exist without running a separate COUNT query.

The **duplicate URL check** uses a 409 Conflict status and returns the existing bookmark's ID. This lets the client offer a "go to existing bookmark" action instead of just showing an error.

## The Individual Item Endpoint

Handle reading, updating (with PATCH for partial updates), and deleting a single bookmark:

```typescript
// src/routes/api/bookmarks/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { updateBookmarkSchema } from '$lib/server/validators';
import { requireAuth } from '$lib/server/auth';
import { parseBody } from '$lib/server/api-utils';
import { eq, and } from 'drizzle-orm';

/** Helper: fetch a bookmark by ID, scoped to the current user. */
async function getBookmark(id: number, userId: number) {
  const [bookmark] = await db
    .select()
    .from(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)))
    .limit(1);

  return bookmark ?? null;
}

/** Helper: parse and validate the ID param. */
function parseId(raw: string): number {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw error(400, { message: 'Invalid bookmark ID — must be a positive integer' });
  }
  return id;
}

export const GET: RequestHandler = async (event) => {
  const user = requireAuth(event);
  const id = parseId(event.params.id);

  const bookmark = await getBookmark(id, user.id);
  if (!bookmark) throw error(404, { message: 'Bookmark not found' });

  return json(bookmark);
};

export const PATCH: RequestHandler = async (event) => {
  const user = requireAuth(event);
  const id = parseId(event.params.id);

  // Verify ownership first
  const existing = await getBookmark(id, user.id);
  if (!existing) throw error(404, { message: 'Bookmark not found' });

  const data = await parseBody(event.request, updateBookmarkSchema);

  // If URL is being changed, check for duplicates
  if (data.url && data.url !== existing.url) {
    const [duplicate] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(
        eq(bookmarks.userId, user.id),
        eq(bookmarks.url, data.url)
      ))
      .limit(1);

    if (duplicate) {
      return json(
        { message: 'You already have a bookmark for this URL', existingId: duplicate.id },
        { status: 409 }
      );
    }
  }

  // Build the update object -- only include provided fields
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.url !== undefined) updateData.url = data.url;
  if (data.title !== undefined) updateData.title = data.title;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.tags !== undefined) updateData.tags = data.tags;
  if (data.pinned !== undefined) updateData.pinned = data.pinned;
  if (data.archived !== undefined) updateData.archived = data.archived;

  const [updated] = await db
    .update(bookmarks)
    .set(updateData)
    .where(eq(bookmarks.id, id))
    .returning();

  return json(updated);
};

export const DELETE: RequestHandler = async (event) => {
  const user = requireAuth(event);
  const id = parseId(event.params.id);

  const [deleted] = await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, user.id)))
    .returning();

  if (!deleted) throw error(404, { message: 'Bookmark not found' });

  return new Response(null, { status: 204 });
};
```

The PATCH endpoint uses partial updates -- it only touches the fields the client sends. This is critical for good API design. PUT replaces the entire resource, so the client must send everything or risk nulling out fields. PATCH only modifies what is explicitly provided. The `Object.values(data).some(v => v !== undefined)` check in the Zod schema ensures the client is not sending an empty patch.

Notice the `getBookmark` helper scopes the query to `userId`. This is an authorization check disguised as a data query -- a user can never access or modify another user's bookmarks, even if they guess the ID. This pattern is called "tenant-scoped queries" and it is the most reliable way to enforce data isolation.

## Tags Endpoint

Provide a way to list all tags a user has used, which is useful for autocomplete and filtering UI:

```typescript
// src/routes/api/bookmarks/tags/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { bookmarks } from '$lib/server/schema';
import { requireAuth } from '$lib/server/auth';
import { eq, sql } from 'drizzle-orm';

export const GET: RequestHandler = async (event) => {
  const user = requireAuth(event);

  // Extract and count unique tags from the JSONB array
  const result = await db.execute(sql`
    SELECT tag, COUNT(*) as count
    FROM ${bookmarks},
         jsonb_array_elements_text(${bookmarks.tags}) AS tag
    WHERE ${bookmarks.userId} = ${user.id}
      AND ${bookmarks.archived} = false
    GROUP BY tag
    ORDER BY count DESC, tag ASC
  `);

  return json(result.rows);
};
```

This query uses PostgreSQL's `jsonb_array_elements_text` to "unwind" the JSONB array, then aggregates by tag. The result is a list like `[{ tag: "javascript", count: 12 }, { tag: "svelte", count: 8 }]` -- perfect for rendering a tag cloud or autocomplete dropdown.

## Testing API Routes with Vitest

Proper API tests give you confidence to refactor and deploy. SvelteKit API routes are just functions that take a `RequestEvent` and return a `Response`, which makes them straightforward to test:

```typescript
// src/routes/api/bookmarks/+server.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET, POST } from './+server';

// Mock the database
vi.mock('$lib/server/db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn()
  }
}));

// Helper to create a mock RequestEvent
function createMockEvent(overrides: Record<string, unknown> = {}) {
  return {
    url: new URL('http://localhost/api/bookmarks'),
    request: new Request('http://localhost/api/bookmarks'),
    params: {},
    locals: { user: { id: 1, email: 'test@example.com', name: 'Test' } },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn()
    },
    ...overrides
  } as any;
}

describe('GET /api/bookmarks', () => {
  it('returns a paginated list of bookmarks', async () => {
    const { db } = await import('$lib/server/db');
    const mockBookmarks = [
      { id: 2, title: 'Second', url: 'https://b.com', tags: [] },
      { id: 1, title: 'First', url: 'https://a.com', tags: [] }
    ];
    vi.mocked(db.select().from('').where('').orderBy('').limit).mockResolvedValueOnce(mockBookmarks);

    const event = createMockEvent();
    const response = await GET(event);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(false);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const event = createMockEvent({ locals: {} });

    await expect(GET(event)).rejects.toMatchObject({
      status: 401
    });
  });
});

describe('POST /api/bookmarks', () => {
  it('creates a bookmark and returns 201', async () => {
    const { db } = await import('$lib/server/db');
    const newBookmark = {
      id: 1,
      title: 'Svelte Docs',
      url: 'https://svelte.dev',
      tags: ['svelte'],
      pinned: false,
      archived: false
    };

    // Mock duplicate check -- no existing bookmark
    vi.mocked(db.select().from('').where('').limit).mockResolvedValueOnce([]);
    // Mock insert
    vi.mocked(db.insert('').values('').returning).mockResolvedValueOnce([newBookmark]);

    const event = createMockEvent({
      request: new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Svelte Docs',
          url: 'https://svelte.dev',
          tags: ['svelte']
        })
      })
    });

    const response = await POST(event);
    expect(response.status).toBe(201);
    expect(response.headers.get('Location')).toBe('/api/bookmarks/1');
  });

  it('rejects invalid URLs', async () => {
    const event = createMockEvent({
      request: new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Bad Link', url: 'not-a-url' })
      })
    });

    await expect(POST(event)).rejects.toMatchObject({
      status: 400
    });
  });

  it('returns 409 for duplicate URLs', async () => {
    const { db } = await import('$lib/server/db');
    vi.mocked(db.select().from('').where('').limit).mockResolvedValueOnce([{ id: 5 }]);

    const event = createMockEvent({
      request: new Request('http://localhost/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Duplicate',
          url: 'https://already-saved.com'
        })
      })
    });

    const response = await POST(event);
    expect(response.status).toBe(409);

    const body = await response.json();
    expect(body.existingId).toBe(5);
  });
});
```

For integration tests that hit a real database, use a test database and wrap each test in a transaction that you roll back:

```typescript
// src/lib/server/test-utils.ts
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

/**
 * Run a test function inside a transaction, then roll back.
 * This keeps each test isolated without needing to seed/tear down data.
 */
export async function withTestTransaction(
  fn: (tx: typeof db) => Promise<void>
) {
  await db.execute(sql`BEGIN`);
  try {
    await fn(db);
  } finally {
    await db.execute(sql`ROLLBACK`);
  }
}
```

## Error Handling Strategy

Consistent error responses are essential for API consumers. Define a standard error shape and use it everywhere:

```typescript
// All error responses follow this shape:
{
  "message": "Human-readable summary",
  "errors": [                           // Only present for validation errors
    { "field": "url", "message": "Must be a valid URL" },
    { "field": "title", "message": "Title is required" }
  ],
  "errorId": "abc-123"                  // Only present for 500 errors
}
```

Handle unexpected errors globally in `hooks.server.ts`:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event }) => {
  const errorId = crypto.randomUUID();

  console.error(`[${errorId}] Unhandled error:`, {
    url: event.url.pathname,
    method: event.request.method,
    error: (error as Error).message,
    stack: (error as Error).stack
  });

  // In production: send to Sentry, Datadog, etc.

  return {
    message: 'An internal server error occurred',
    errorId
  };
};
```

The `errorId` is the bridge between what the user sees and what you see in logs. When a user reports "I got an error," they can give you the error ID and you can search your logs for the full stack trace.

## API Documentation

Document your API so other developers (or your future self) can use it. A simple approach is a dedicated documentation endpoint:

```typescript
// src/routes/api/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({
    name: 'Bookmark Manager API',
    version: '1.0.0',
    endpoints: [
      {
        method: 'GET',
        path: '/api/bookmarks',
        description: 'List bookmarks with pagination, search, and filtering',
        auth: 'required',
        queryParams: {
          cursor: 'number (optional) - Bookmark ID to paginate from',
          limit: 'number (optional, default 20, max 100) - Items per page',
          q: 'string (optional) - Search title, URL, and description',
          tag: 'string (optional) - Filter by tag',
          pinned: '"true" | "false" (optional) - Filter by pinned status',
          archived: '"true" | "false" (optional, default "false") - Include archived'
        }
      },
      {
        method: 'POST',
        path: '/api/bookmarks',
        description: 'Create a new bookmark',
        auth: 'required',
        body: {
          url: 'string (required) - Valid URL',
          title: 'string (required, max 200) - Bookmark title',
          description: 'string (optional, max 1000) - Description',
          tags: 'string[] (optional, max 20) - Array of tag strings',
          pinned: 'boolean (optional, default false)'
        }
      },
      {
        method: 'GET',
        path: '/api/bookmarks/:id',
        description: 'Get a single bookmark by ID',
        auth: 'required'
      },
      {
        method: 'PATCH',
        path: '/api/bookmarks/:id',
        description: 'Partially update a bookmark',
        auth: 'required',
        body: 'Same fields as POST, all optional. At least one required.'
      },
      {
        method: 'DELETE',
        path: '/api/bookmarks/:id',
        description: 'Delete a bookmark',
        auth: 'required',
        response: '204 No Content'
      },
      {
        method: 'GET',
        path: '/api/bookmarks/tags',
        description: 'List all unique tags with bookmark counts',
        auth: 'required'
      }
    ],
    errors: {
      400: 'Validation error — check the errors array for details',
      401: 'Not authenticated — include a valid session cookie',
      404: 'Resource not found',
      409: 'Conflict — resource already exists (e.g. duplicate URL)',
      429: 'Rate limited — check X-RateLimit-Reset header'
    }
  });
};
```

For larger APIs, consider generating OpenAPI/Swagger specs from your Zod schemas using libraries like `zod-to-openapi`. This gives you interactive documentation and client SDK generation for free.

## Consuming the API from Svelte

Here is how a Svelte page consumes the bookmarks API, demonstrating search, pagination, and optimistic deletes:

```svelte
<!-- src/routes/bookmarks/+page.svelte -->
<script lang="ts">
  let bookmarks = $state<any[]>([]);
  let nextCursor = $state<number | null>(null);
  let loading = $state(false);
  let searchQuery = $state('');
  let selectedTag = $state('');

  async function fetchBookmarks(cursor?: number) {
    loading = true;

    const params = new URLSearchParams();
    if (cursor) params.set('cursor', String(cursor));
    if (searchQuery) params.set('q', searchQuery);
    if (selectedTag) params.set('tag', selectedTag);

    const res = await fetch(`/api/bookmarks?${params}`);
    const body = await res.json();

    if (cursor) {
      // Append for "load more"
      bookmarks = [...bookmarks, ...body.data];
    } else {
      // Replace for new search
      bookmarks = body.data;
    }

    nextCursor = body.pagination.nextCursor;
    loading = false;
  }

  // Re-fetch when search or tag changes
  $effect(() => {
    // Access both so Svelte tracks them as dependencies
    searchQuery;
    selectedTag;

    // Debounce would be better in production
    fetchBookmarks();
  });

  async function deleteBookmark(id: number) {
    // Optimistic removal
    const removed = bookmarks.find(b => b.id === id);
    bookmarks = bookmarks.filter(b => b.id !== id);

    const res = await fetch(`/api/bookmarks/${id}`, { method: 'DELETE' });

    if (!res.ok) {
      // Roll back on failure
      if (removed) bookmarks = [...bookmarks, removed];
    }
  }
</script>

<input
  type="search"
  placeholder="Search bookmarks..."
  bind:value={searchQuery}
/>

{#each bookmarks as bookmark (bookmark.id)}
  <article>
    <a href={bookmark.url} target="_blank">{bookmark.title}</a>
    <p>{bookmark.description}</p>
    <div>
      {#each bookmark.tags as tag}
        <button onclick={() => selectedTag = tag}>#{tag}</button>
      {/each}
    </div>
    <button onclick={() => deleteBookmark(bookmark.id)}>Delete</button>
  </article>
{/each}

{#if nextCursor}
  <button onclick={() => fetchBookmarks(nextCursor)} disabled={loading}>
    {loading ? 'Loading...' : 'Load More'}
  </button>
{/if}
```

## Try It

1. Add a `PUT /api/bookmarks/[id]` endpoint that replaces the entire bookmark (as opposed to PATCH which does partial updates). Validate that all required fields are present.

2. Add a `POST /api/bookmarks/import` endpoint that accepts an array of bookmarks (up to 100) and inserts them in a single database transaction. Return the count of successfully imported bookmarks and any that failed validation.

3. Add a search feature that uses PostgreSQL's `ts_vector` and `ts_query` for proper full-text search instead of ILIKE, and return results ranked by relevance.

4. Write a Vitest integration test that creates a bookmark, updates it with PATCH, verifies the update, then deletes it and confirms the 404.

## Key Takeaways

- Organize API routes under `/api` with collection endpoints (GET list, POST create) and item endpoints (GET one, PATCH update, DELETE)
- Use Zod for validation -- it gives you runtime checks, TypeScript types, and data normalization in one schema
- Extract auth checks, rate limiting, and validation into reusable modules in `$lib/server`
- Use cursor-based pagination for stable, real-time-friendly paging
- PATCH for partial updates, PUT for full replacement -- they serve different purposes
- Return consistent error shapes with status codes (400, 401, 404, 409, 429, 500) and structured error details
- Test API routes with Vitest by mocking the database or using transaction-wrapped integration tests
- Scope all queries to the authenticated user's ID to enforce data isolation
- Rate limit write endpoints more aggressively than read endpoints
- Document your API with a root endpoint or OpenAPI spec so consumers know what is available
