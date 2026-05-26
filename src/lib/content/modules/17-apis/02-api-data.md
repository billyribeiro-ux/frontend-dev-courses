# Fetching API Data in SvelteKit

Now that you understand fetch and async/await, it is time to use them inside SvelteKit. But SvelteKit gives you something most frameworks do not: it lets you build **both sides** of the API conversation. You can fetch data from external APIs, and you can create your own API endpoints that your frontend (or external consumers) can call.

This lesson covers two powerful patterns: using `+page.server.ts` load functions to feed data into pages, and using `+server.ts` files to build standalone API endpoints. Understanding when to use each — and why — is a key architectural decision in every SvelteKit application. Get it wrong and you end up with unnecessary network hops, duplicated logic, and security holes. Get it right and your data flows cleanly from database to browser with minimal boilerplate.

## Load Functions: The Preferred Pattern for Page Data

The best place to fetch data for a page is inside a **load function** in `+page.server.ts`. This runs on the server before the page renders, which means:

- API keys and secrets never reach the browser
- You avoid CORS issues entirely (server-to-server requests are not subject to browser CORS policies)
- The page arrives with data already populated — no loading spinner on first paint
- Search engines see fully rendered content
- You can directly query databases, read files, or call internal services — no HTTP overhead

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');

  if (!response.ok) {
    error(response.status, 'Failed to load posts');
  }

  const posts = await response.json();
  return { posts };
};
```

Notice that you destructure `fetch` from the event object — this is SvelteKit's enhanced version. It automatically forwards cookies from the user's browser (critical for authentication), resolves relative URLs against your app's origin, and can even short-circuit calls to your own API endpoints without an actual network request.

### The RequestEvent Object: Your Server-Side Context

Every server-side function in SvelteKit — load functions, actions, API handlers — receives a `RequestEvent`. This is the single most important object in SvelteKit server-side development. Understanding its properties unlocks everything:

```typescript
export const load: PageServerLoad = async (event) => {
  // The incoming Request object (method, headers, body)
  event.request;

  // Route parameters from the URL: /posts/[slug] → { slug: 'hello-world' }
  event.params;

  // URL object with pathname, searchParams, etc.
  event.url;

  // SvelteKit's enhanced fetch — forwards cookies, deduplicates
  event.fetch;

  // Cookie management — get, set, delete
  event.cookies;

  // Shared data set in hooks.server.ts (typically auth state)
  event.locals;

  // The platform-specific context (Cloudflare env, Vercel headers, etc.)
  event.platform;

  // The route ID pattern: /posts/[slug]
  event.route;

  // Set response headers from inside a load function
  event.setHeaders;

  // Check if the request was made by SvelteKit's client-side router
  event.isDataRequest;

  // Check if the app is running in sub-request mode
  event.isSubRequest;
};
```

A production pattern is to attach user data in `hooks.server.ts` and read it everywhere else:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    event.locals.user = await getUserFromSession(sessionId);
  }
  return resolve(event);
};
```

```typescript
// src/routes/dashboard/+page.server.ts
export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    redirect(303, '/login');
  }

  const dashboardData = await getDashboardForUser(locals.user.id);
  return { user: locals.user, ...dashboardData };
};
```

## Displaying Load Function Data

The data returned from your load function flows into the page component through `$props()`:

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Recent Posts</h1>

<ul>
  {#each data.posts as post (post.id)}
    <li>
      <h2>{post.title}</h2>
      <p>{post.body}</p>
    </li>
  {/each}
</ul>
```

The data is available immediately when the page renders. On the initial server-side render, the load function runs on the server. On client-side navigations (clicking a link), SvelteKit calls the load function and streams the data to the client. Either way, your component code is the same.

### Type Safety from Load to Component

One of SvelteKit's best features is automatic type inference from load functions to components. The `PageServerLoad` type generates `PageData` types that flow into your component:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const posts = await fetch('/api/posts').then(r => r.json()) as Post[];
  return {
    posts,
    totalCount: posts.length,
    lastUpdated: new Date().toISOString()
  };
};
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  // data is fully typed: { posts: Post[], totalCount: number, lastUpdated: string }
  let { data } = $props();

  // TypeScript knows data.posts is Post[], data.totalCount is number, etc.
  // If you typo data.postz, the compiler catches it
</script>
```

This works because SvelteKit generates `./$types` files that connect the return type of your load function to the `data` prop of your component. No manual type definitions needed.

## Fetching Multiple APIs in Parallel

When a page needs data from several sources, run the requests concurrently with `Promise.all`. Sequential requests are one of the most common performance mistakes in web development:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  // BAD: sequential — total time is request1 + request2 + request3
  // const users = await (await fetch('/api/users')).json();
  // const posts = await (await fetch('/api/posts')).json();
  // const stats = await (await fetch('/api/stats')).json();
  // Total: 600ms if each takes 200ms

  // GOOD: parallel — total time is max(request1, request2, request3)
  const [usersRes, postsRes, statsRes] = await Promise.all([
    fetch('https://jsonplaceholder.typicode.com/users?_limit=5'),
    fetch('https://jsonplaceholder.typicode.com/posts?_limit=5'),
    fetch('https://jsonplaceholder.typicode.com/comments?_limit=5')
  ]);

  if (!usersRes.ok || !postsRes.ok || !statsRes.ok) {
    error(500, 'Failed to load dashboard data');
  }

  const [users, posts, comments] = await Promise.all([
    usersRes.json(),
    postsRes.json(),
    statsRes.json()
  ]);

  return { users, posts, comments };
};
```

If you have three API calls that each take 200ms, running them sequentially takes 600ms. Running them in parallel takes 200ms. For a dashboard with five data sources, the difference can be over a second — that is the difference between a fast app and a sluggish one.

### Promise.allSettled: When Partial Data Is Acceptable

`Promise.all` fails fast — if any request fails, the entire `await` rejects. Sometimes you want partial results. A dashboard that shows user stats and notifications should not fail entirely just because the notifications API is down:

```typescript
export const load: PageServerLoad = async ({ fetch }) => {
  const results = await Promise.allSettled([
    fetch('/api/stats').then(r => r.ok ? r.json() : null),
    fetch('/api/notifications').then(r => r.ok ? r.json() : null),
    fetch('/api/recent-activity').then(r => r.ok ? r.json() : null)
  ]);

  return {
    stats: results[0].status === 'fulfilled' ? results[0].value : null,
    notifications: results[1].status === 'fulfilled' ? results[1].value : null,
    recentActivity: results[2].status === 'fulfilled' ? results[2].value : null
  };
};
```

The component can then gracefully handle missing sections:

```svelte
{#if data.stats}
  <StatsPanel stats={data.stats} />
{:else}
  <p>Stats temporarily unavailable</p>
{/if}
```

## API Endpoints with +server.ts

While load functions feed data into pages, sometimes you need a standalone API endpoint. Maybe your frontend needs to submit data via a button click. Maybe you are building an API that a mobile app or third-party service will consume. That is what `+server.ts` files are for.

A `+server.ts` file exports functions named after HTTP methods. Each function receives a `RequestEvent` and must return a `Response`:

```typescript
// src/routes/api/todos/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory store for this example (use a database in production)
let todos = [
  { id: 1, title: 'Learn SvelteKit', completed: false },
  { id: 2, title: 'Build an app', completed: false }
];
let nextId = 3;

// GET /api/todos — return all todos
export const GET: RequestHandler = async () => {
  return json(todos);
};
```

The `json()` helper from `@sveltejs/kit` creates a proper `Response` with the `Content-Type: application/json` header already set. You could build the response manually with `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })`, but `json()` saves you from that boilerplate.

### Response Helpers

SvelteKit provides several response helpers:

```typescript
import { json, text, error, redirect } from '@sveltejs/kit';

// JSON response with custom status and headers
return json(data, {
  status: 201,
  headers: {
    'X-Request-Id': crypto.randomUUID(),
    'Cache-Control': 'no-store'
  }
});

// Plain text response
return text('Hello, world!', { status: 200 });

// Error response (throws, does not return)
error(404, 'Resource not found');
error(422, { message: 'Validation failed', errors: { name: 'Required' } });

// Redirect (throws, does not return)
redirect(303, '/login');

// Manual Response for full control (binary data, streams, etc.)
return new Response(binaryData, {
  headers: {
    'Content-Type': 'application/pdf',
    'Content-Disposition': 'attachment; filename="report.pdf"'
  }
});
```

## When to Use +server.ts vs +page.server.ts

This is an architectural decision that confuses many developers. Here is the rule:

**Use `+page.server.ts`** when the data is for rendering a page. The load function runs before the page component mounts, and the data flows directly into `$props()`. This is the default choice for page data.

**Use `+server.ts`** when you need a standalone API endpoint — for client-side fetch calls triggered by user actions (like a "Save" button), for endpoints consumed by external clients (a mobile app, a webhook), or for operations that do not map to a page (file uploads, search suggestions).

```
Page loads           → +page.server.ts (load function)
Form submissions     → +page.server.ts (form actions — preferred)
User-triggered AJAX  → +server.ts (API endpoint)
External consumers   → +server.ts (API endpoint)
Webhooks             → +server.ts (API endpoint)
File downloads       → +server.ts (API endpoint)
```

In practice, a typical SvelteKit app has many `+page.server.ts` files and a few `+server.ts` files. If you find yourself creating API endpoints just so your load function can fetch from them, stop — put the logic directly in the load function instead.

### The Anti-Pattern: Unnecessary API Routes

This is a mistake I see in nearly every junior developer's SvelteKit codebase:

```typescript
// WRONG: Creating an API route just to call it from a load function

// src/routes/api/posts/+server.ts
export const GET: RequestHandler = async () => {
  const posts = await db.select().from(postsTable);
  return json(posts);
};

// src/routes/posts/+page.server.ts
export const load: PageServerLoad = async ({ fetch }) => {
  const posts = await fetch('/api/posts').then(r => r.json());
  return { posts };
};
```

```typescript
// CORRECT: Put the logic directly in the load function

// src/routes/posts/+page.server.ts
export const load: PageServerLoad = async () => {
  const posts = await db.select().from(postsTable);
  return { posts };
};
```

The load function already runs on the server. There is no need for an HTTP round-trip to yourself. The API route adds latency, boilerplate, and a maintenance burden for zero benefit. Only create `+server.ts` when something other than your own load function needs to call it.

## Building a Complete CRUD API

Here is a production-quality CRUD API with proper validation, auth checks, pagination, and error handling:

```typescript
// src/routes/api/todos/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

// Validation schemas using Zod
const createTodoSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title too long'),
  priority: z.enum(['low', 'medium', 'high']).default('medium')
});

const updateTodoSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  completed: z.boolean().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional()
});

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.enum(['created_at', 'title', 'priority']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  completed: z.enum(['true', 'false', 'all']).default('all')
});

// In-memory store for this example
let todos = [
  { id: 1, title: 'Learn SvelteKit', completed: false, priority: 'high' as const, createdAt: new Date().toISOString() },
  { id: 2, title: 'Build an app', completed: false, priority: 'medium' as const, createdAt: new Date().toISOString() }
];
let nextId = 3;

// Helper: require authentication
function requireAuth(locals: App.Locals) {
  if (!locals.user) {
    error(401, 'Authentication required');
  }
  return locals.user;
}

// GET /api/todos?page=1&limit=20&sort=created_at&order=desc&completed=all
export const GET: RequestHandler = async ({ url, locals }) => {
  const user = requireAuth(locals);

  // Parse and validate query parameters
  const rawParams = Object.fromEntries(url.searchParams);
  const parseResult = paginationSchema.safeParse(rawParams);

  if (!parseResult.success) {
    error(400, {
      message: 'Invalid query parameters',
      errors: parseResult.error.flatten().fieldErrors
    });
  }

  const { page, limit, sort, order, completed } = parseResult.data;

  // Filter
  let filtered = todos;
  if (completed !== 'all') {
    filtered = filtered.filter(t => t.completed === (completed === 'true'));
  }

  // Sort
  filtered.sort((a, b) => {
    const aVal = a[sort as keyof typeof a];
    const bVal = b[sort as keyof typeof b];
    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  return json({
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  });
};

// POST /api/todos — create a new todo
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = requireAuth(locals);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON');
  }

  const parseResult = createTodoSchema.safeParse(body);
  if (!parseResult.success) {
    error(422, {
      message: 'Validation failed',
      errors: parseResult.error.flatten().fieldErrors
    });
  }

  const todo = {
    id: nextId++,
    title: parseResult.data.title,
    completed: false,
    priority: parseResult.data.priority,
    createdAt: new Date().toISOString()
  };

  todos.push(todo);

  return json(todo, { status: 201 });
};
```

```typescript
// src/routes/api/todos/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// GET /api/todos/42 — get a single todo
export const GET: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals);
  const id = parseInt(params.id, 10);

  if (isNaN(id)) {
    error(400, 'Invalid todo ID');
  }

  const todo = todos.find(t => t.id === id);
  if (!todo) {
    error(404, `Todo ${id} not found`);
  }

  return json(todo);
};

// PUT /api/todos/42 — full replacement
export const PUT: RequestHandler = async ({ params, request, locals }) => {
  requireAuth(locals);
  const id = parseInt(params.id, 10);
  const index = todos.findIndex(t => t.id === id);

  if (index === -1) {
    error(404, `Todo ${id} not found`);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON');
  }

  const parseResult = createTodoSchema.safeParse(body);
  if (!parseResult.success) {
    error(422, {
      message: 'Validation failed',
      errors: parseResult.error.flatten().fieldErrors
    });
  }

  todos[index] = {
    ...todos[index],
    title: parseResult.data.title,
    priority: parseResult.data.priority
  };

  return json(todos[index]);
};

// PATCH /api/todos/42 — partial update
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  requireAuth(locals);
  const id = parseInt(params.id, 10);
  const index = todos.findIndex(t => t.id === id);

  if (index === -1) {
    error(404, `Todo ${id} not found`);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    error(400, 'Request body must be valid JSON');
  }

  const parseResult = updateTodoSchema.safeParse(body);
  if (!parseResult.success) {
    error(422, {
      message: 'Validation failed',
      errors: parseResult.error.flatten().fieldErrors
    });
  }

  todos[index] = { ...todos[index], ...parseResult.data };
  return json(todos[index]);
};

// DELETE /api/todos/42
export const DELETE: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals);
  const id = parseInt(params.id, 10);
  const index = todos.findIndex(t => t.id === id);

  if (index === -1) {
    error(404, `Todo ${id} not found`);
  }

  todos.splice(index, 1);
  return new Response(null, { status: 204 });
};
```

### Key Design Principles

Several production principles are at work in this code:

**Input validation is non-negotiable.** The client could be a malicious user with curl, not your nice UI. Zod parses and validates in one step — if validation fails, you get structured error messages. `safeParse` returns a result object instead of throwing, which gives you control over the error response format.

**Why Zod for validation:** Raw manual checks like `if (!body.title || typeof body.title !== 'string')` work for one or two fields but become unmaintainable as schemas grow. Zod gives you: type inference (the parsed value is typed), composition (combine schemas), transformation (`.trim()`, `.default()`), and structured error messages — all in one line of schema definition.

**Status codes communicate meaning.** Use them precisely:
- `200` — success (GET, PUT, PATCH)
- `201` — resource created (POST)
- `204` — success with no body (DELETE)
- `400` — malformed request (bad JSON, invalid ID format)
- `401` — not authenticated (missing or invalid session)
- `403` — not authorized (authenticated but lacking permission)
- `404` — resource not found
- `422` — validation failed (well-formed request, but data violates business rules)

The difference between `400` and `422` matters. `400` means the request is syntactically broken (invalid JSON, missing required headers). `422` means the request is well-formed but semantically invalid (email already taken, title too long). This distinction helps API consumers write better error handling.

**Pagination is not optional for list endpoints.** Without pagination, a GET endpoint that returns all records will eventually bring down your server when the dataset grows. Always paginate, even if you think the dataset will stay small. Returning pagination metadata (`total`, `hasNext`, `hasPrev`) lets clients build proper pagination UIs.

## API Middleware Patterns

Real APIs need cross-cutting concerns: logging, rate limiting, CORS headers, request timing. SvelteKit does not have a formal middleware system, but you can compose these using handles in `hooks.server.ts` or utility functions:

### Request Timing and Logging

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const start = performance.now();
  const requestId = crypto.randomUUID();

  // Attach to locals so it is available in handlers
  event.locals.requestId = requestId;

  const response = await resolve(event);

  const duration = Math.round(performance.now() - start);

  // Log API requests (skip static assets)
  if (event.url.pathname.startsWith('/api')) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      method: event.request.method,
      path: event.url.pathname,
      status: response.status,
      duration: `${duration}ms`,
      userAgent: event.request.headers.get('user-agent')
    }));
  }

  // Add timing header for debugging
  response.headers.set('X-Request-Id', requestId);
  response.headers.set('Server-Timing', `total;dur=${duration}`);

  return response;
};
```

### Composing Multiple Hooks with sequence

When you have multiple concerns, use SvelteKit's `sequence` helper to chain handles:

```typescript
// src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';

const timing: Handle = async ({ event, resolve }) => {
  const start = performance.now();
  const response = await resolve(event);
  const duration = Math.round(performance.now() - start);
  response.headers.set('Server-Timing', `total;dur=${duration}`);
  return response;
};

const auth: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    event.locals.user = await validateSession(sessionId);
  }
  return resolve(event);
};

const rateLimit: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/api')) {
    const ip = event.getClientAddress();
    const key = `${ip}:${event.url.pathname}`;

    if (isRateLimited(key)) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': '60'
        }
      });
    }

    trackRequest(key);
  }

  return resolve(event);
};

export const handle = sequence(timing, auth, rateLimit);
```

## CORS Configuration for External API Consumers

If your API endpoints need to be called from other domains (a separate frontend, a mobile app's web view, a partner integration), you need CORS headers. SvelteKit does not add them automatically because most SvelteKit APIs are consumed by the same app.

```typescript
// src/routes/api/public/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_ORIGINS = [
  'https://partner-app.example.com',
  'https://mobile.example.com'
];

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {};

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Max-Age'] = '86400'; // Cache preflight for 24h
  }

  return headers;
}

// Handle CORS preflight
export const OPTIONS: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin)
  });
};

export const GET: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  const data = await getPublicData();

  return json(data, {
    headers: corsHeaders(origin)
  });
};
```

**Do not use `Access-Control-Allow-Origin: *` with credentials.** If your API requires cookies or Authorization headers, you must specify the exact origin. The wildcard is only safe for truly public, unauthenticated endpoints.

## Streaming Responses

For large datasets, report generation, or AI-style token-by-token output, streaming is more efficient than buffering the entire response in memory:

```typescript
// src/routes/api/export/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals);

  const stream = new ReadableStream({
    async start(controller) {
      // Write CSV header
      controller.enqueue(new TextEncoder().encode('id,name,email,created_at\n'));

      // Stream rows from database in batches
      let offset = 0;
      const batchSize = 1000;

      while (true) {
        const users = await db.select().from(usersTable)
          .limit(batchSize)
          .offset(offset);

        if (users.length === 0) break;

        for (const user of users) {
          const row = `${user.id},"${user.name}","${user.email}",${user.createdAt}\n`;
          controller.enqueue(new TextEncoder().encode(row));
        }

        offset += batchSize;
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="users-export.csv"',
      'Transfer-Encoding': 'chunked'
    }
  });
};
```

### Server-Sent Events (SSE)

SSE is a simple protocol for server-to-client streaming, built on HTTP. It is simpler than WebSockets and works through proxies and load balancers without special configuration:

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
  requireAuth(locals);

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send a heartbeat every 30 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      }, 30000);

      // Subscribe to events (your pub/sub system)
      const unsubscribe = eventBus.subscribe((event) => {
        const data = JSON.stringify(event);
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${data}\n\n`));
      });

      // Clean up when the client disconnects
      return () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
    },
    cancel() {
      // Called when the client closes the connection
      console.log('SSE client disconnected');
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

Consuming SSE on the client:

```svelte
<script lang="ts">
  let messages = $state<string[]>([]);

  $effect(() => {
    const source = new EventSource('/api/events');

    source.addEventListener('notification', (event) => {
      messages.push(JSON.parse(event.data));
    });

    source.onerror = () => {
      console.log('SSE connection lost, reconnecting...');
      // EventSource automatically reconnects
    };

    return () => source.close();
  });
</script>

{#each messages as msg}
  <div>{msg}</div>
{/each}
```

## File Downloads and Uploads

### File Downloads

```typescript
// src/routes/api/reports/[id]/download/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  requireAuth(locals);

  const report = await getReport(params.id);
  if (!report) error(404, 'Report not found');

  const pdfBuffer = await generatePdf(report);

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-${report.id}.pdf"`,
      'Content-Length': pdfBuffer.byteLength.toString()
    }
  });
};
```

### File Uploads

```typescript
// src/routes/api/upload/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { writeFile } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const POST: RequestHandler = async ({ request, locals }) => {
  requireAuth(locals);

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    error(400, 'No file uploaded');
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    error(422, `File type ${file.type} not allowed. Use JPEG, PNG, or WebP.`);
  }

  if (file.size > MAX_FILE_SIZE) {
    error(422, `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.`);
  }

  // Generate a safe filename
  const ext = file.name.split('.').pop();
  const filename = `${crypto.randomUUID()}.${ext}`;
  const uploadPath = path.join('static', 'uploads', filename);

  // Write file to disk (in production, use S3/R2/Cloud Storage)
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(uploadPath, buffer);

  return json({
    url: `/uploads/${filename}`,
    filename: file.name,
    size: file.size,
    type: file.type
  }, { status: 201 });
};
```

## Calling Your API from a Component

Here is how the component side looks when calling an API endpoint:

```svelte
<!-- src/routes/todos/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  let newTitle = $state('');
  let todos = $state(data.todos);
  let isSubmitting = $state(false);
  let errorMessage = $state('');

  async function addTodo() {
    if (!newTitle.trim()) return;
    isSubmitting = true;
    errorMessage = '';

    try {
      const response = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle })
      });

      if (!response.ok) {
        const error = await response.json();
        errorMessage = error.message || 'Failed to add todo';
        return;
      }

      const todo = await response.json();
      todos.push(todo);
      newTitle = '';
    } catch {
      errorMessage = 'Network error — please try again';
    } finally {
      isSubmitting = false;
    }
  }

  async function toggleTodo(id: number, completed: boolean) {
    // Optimistic update: change the UI immediately
    const index = todos.findIndex(t => t.id === id);
    const previousState = todos[index].completed;
    todos[index].completed = completed;

    try {
      const response = await fetch(`/api/todos/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
      });

      if (!response.ok) {
        // Revert on failure
        todos[index].completed = previousState;
        errorMessage = 'Failed to update todo';
      }
    } catch {
      // Revert on network error
      todos[index].completed = previousState;
      errorMessage = 'Network error — please try again';
    }
  }

  async function deleteTodo(id: number) {
    const confirmed = confirm('Delete this todo?');
    if (!confirmed) return;

    const response = await fetch(`/api/todos/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      todos = todos.filter((t) => t.id !== id);
    }
  }
</script>

<h1>My Todos</h1>

{#if errorMessage}
  <div role="alert" class="error">{errorMessage}</div>
{/if}

<form onsubmit={(e) => { e.preventDefault(); addTodo(); }}>
  <input
    bind:value={newTitle}
    placeholder="What needs doing?"
    disabled={isSubmitting}
  />
  <button type="submit" disabled={isSubmitting}>
    {isSubmitting ? 'Adding...' : 'Add'}
  </button>
</form>

<ul>
  {#each todos as todo (todo.id)}
    <li>
      <label>
        <input
          type="checkbox"
          checked={todo.completed}
          onchange={() => toggleTodo(todo.id, !todo.completed)}
        />
        <span class:completed={todo.completed}>{todo.title}</span>
      </label>
      <button onclick={() => deleteTodo(todo.id)}>Delete</button>
    </li>
  {/each}
</ul>

<style>
  .completed { text-decoration: line-through; opacity: 0.6; }
  .error { color: red; padding: 0.5rem; border: 1px solid red; border-radius: 4px; }
</style>
```

Notice the **optimistic update** pattern in `toggleTodo`. The UI updates instantly, making the app feel responsive. If the server request fails, we revert to the previous state. This is how production apps maintain perceived performance — users should never wait for a round-trip just to see a checkbox toggle.

## Error Handling in Load Functions

When something goes wrong in a load function, use the `error()` helper to trigger SvelteKit's error page:

```typescript
// src/routes/posts/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const response = await fetch(`https://jsonplaceholder.typicode.com/posts/${params.id}`);

  if (response.status === 404) {
    error(404, 'Post not found');
  }

  if (!response.ok) {
    error(500, 'Something went wrong loading this post');
  }

  const post = await response.json();
  return { post };
};
```

SvelteKit renders the nearest `+error.svelte` component in the route hierarchy:

```svelte
<!-- src/routes/posts/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>{page.status}: {page.error?.message}</h1>
<a href="/">Back to home</a>
```

### Unexpected Errors vs Expected Errors

SvelteKit distinguishes between expected errors (thrown with the `error()` helper) and unexpected errors (runtime exceptions). Expected errors show your `+error.svelte` component with the status and message you provided. Unexpected errors are caught by SvelteKit, logged server-side, and shown to the user as a generic "Internal Error" (to avoid leaking stack traces).

You can customize how unexpected errors are presented using the `handleError` hook:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  // Log the full error for debugging (server-side only)
  console.error(`[${errorId}]`, error);

  // Report to error tracking (Sentry, Datadog, etc.)
  await reportToSentry(error, { errorId, path: event.url.pathname });

  // Return a safe message to the client
  return {
    message: 'An unexpected error occurred. Please try again.',
    errorId // include this so users can reference it in support tickets
  };
};
```

## Setting Response Headers from Load Functions

Load functions can set response headers using `setHeaders`. This is critical for caching:

```typescript
export const load: PageServerLoad = async ({ fetch, setHeaders }) => {
  const response = await fetch('/api/posts');
  const posts = await response.json();

  // Cache this page for 60 seconds on the CDN
  setHeaders({
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'Vary': 'Accept-Language'
  });

  return { posts };
};
```

The `Vary` header is important but often forgotten. It tells caches that the response varies by a specific request header. If your page shows different content based on the `Accept-Language` header, you need `Vary: Accept-Language` or English users might see cached French content.

## Try It

1. **Basic**: Build a `/users` page. Create a `+page.server.ts` load function that fetches users from `https://jsonplaceholder.typicode.com/users`. Display each user's name, email, and company name. Add error handling with the `error()` helper.

2. **Intermediate**: Create a `/api/todos` endpoint with `+server.ts` that supports GET (list all with pagination), POST (create new), PATCH (toggle completed), and DELETE. Validate all input with Zod. Return proper status codes. Build a component that calls these endpoints with optimistic updates.

3. **Advanced**: Build a file upload endpoint that accepts images, validates file type and size, generates a unique filename, and returns the URL. Create a component with a drag-and-drop zone that uploads files and shows a progress indicator. Handle errors gracefully — show validation messages for wrong file types and network errors for upload failures.

4. **Expert**: Implement a Server-Sent Events endpoint that streams real-time notifications. The endpoint should authenticate the user, subscribe to a notification channel, send heartbeat pings every 30 seconds, and clean up when the client disconnects. Build a Svelte component that consumes the stream using `EventSource` and shows a notification toast for each event. Handle reconnection gracefully.

## Key Takeaways

- Use `+page.server.ts` load functions for page data — it runs on the server, keeps secrets safe, and avoids CORS issues
- Destructure `fetch` from the load function event — SvelteKit's fetch forwards cookies, resolves relative URLs, and deduplicates identical requests
- `+server.ts` files create standalone API endpoints — export `GET`, `POST`, `PUT`, `PATCH`, `DELETE` handler functions
- Each handler receives a `RequestEvent` and must return a `Response` — use the `json()` helper for JSON responses
- Do not create API routes just to call them from load functions — put the logic directly in the load function
- Always validate input on the server with a schema library like Zod — never trust data from the client
- Use semantic HTTP status codes precisely: `200`, `201`, `204`, `400`, `401`, `403`, `404`, `422`
- The `RequestEvent` object gives you access to `request`, `params`, `url`, `cookies`, `locals`, `fetch`, and `setHeaders`
- Use `Promise.all` for parallel fetching and `Promise.allSettled` when partial data is acceptable
- Implement optimistic updates for user actions — update the UI immediately, revert on failure
- Use `sequence()` from `@sveltejs/kit/hooks` to compose multiple middleware-like handles
- The `error()` helper triggers `+error.svelte`; unexpected errors are handled by `handleError` hook
- Set `Cache-Control` headers from load functions with `setHeaders` for CDN caching
- Stream large responses with `ReadableStream` instead of buffering everything in memory
- CORS headers are only needed for API endpoints consumed by external domains
