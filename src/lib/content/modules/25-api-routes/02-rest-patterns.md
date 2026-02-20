# REST API Patterns

REST (Representational State Transfer) is a set of conventions for designing APIs that use HTTP methods to perform operations on resources. When you follow REST patterns, your API becomes predictable — other developers (and your future self) can guess how endpoints work without reading documentation.

The core idea is simple: URLs represent **resources** (nouns), and HTTP methods represent **actions** (verbs). A resource like "tasks" maps to `/api/tasks`, and you use GET to read, POST to create, PUT to update, and DELETE to remove.

## RESTful URL Conventions

Design your routes around resources, not actions:

```
Good (RESTful):
GET    /api/tasks        → List all tasks
POST   /api/tasks        → Create a task
GET    /api/tasks/42     → Get task with id 42
PUT    /api/tasks/42     → Update task 42
DELETE /api/tasks/42     → Delete task 42

Bad (not RESTful):
GET    /api/getTasks
POST   /api/createTask
POST   /api/deleteTask/42
```

## Implementing CRUD Endpoints

Set up two route files — one for the collection and one for individual items:

```typescript
// src/routes/api/tasks/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const limit = Number(url.searchParams.get('limit')) || 20;
  const offset = Number(url.searchParams.get('offset')) || 0;

  const tasks = await db.select().from(tasksTable).limit(limit).offset(offset);
  return json(tasks);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  if (!body.title || typeof body.title !== 'string') {
    throw error(400, 'Title is required and must be a string');
  }

  const [task] = await db.insert(tasksTable).values({
    title: body.title.trim(),
    completed: false
  }).returning();

  return json(task, { status: 201 });
};
```

```typescript
// src/routes/api/tasks/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
  const task = await db.select().from(tasksTable).where(eq(tasksTable.id, Number(params.id)));

  if (!task.length) {
    throw error(404, 'Task not found');
  }

  return json(task[0]);
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const [updated] = await db.update(tasksTable)
    .set({ title: body.title, completed: body.completed })
    .where(eq(tasksTable.id, Number(params.id)))
    .returning();

  if (!updated) {
    throw error(404, 'Task not found');
  }

  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  await db.delete(tasksTable).where(eq(tasksTable.id, Number(params.id)));
  return new Response(null, { status: 204 });
};
```

## Request Validation

Always validate incoming data before touching your database:

```typescript
function validateTask(body: unknown): { title: string; completed?: boolean } {
  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be a JSON object');
  }

  const { title, completed } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw error(400, 'Title is required');
  }

  if (title.length > 200) {
    throw error(400, 'Title must be 200 characters or fewer');
  }

  return { title: title.trim(), completed: completed === true };
}
```

## Error Responses with Proper Status Codes

Use the right status code for each situation:

```typescript
// 400 — Bad Request (invalid input)
throw error(400, 'Invalid email format');

// 401 — Unauthorized (not logged in)
throw error(401, 'You must be logged in');

// 403 — Forbidden (logged in, but not allowed)
throw error(403, 'You do not have permission');

// 404 — Not Found
throw error(404, 'Resource not found');

// 409 — Conflict (duplicate entry)
throw error(409, 'A task with that name already exists');
```

## Try It

Design a RESTful API for a "bookmarks" resource. Create the route files with full CRUD operations, proper validation for the `url` and `title` fields, and appropriate error responses for missing or invalid data.

## Key Takeaways

- URLs should represent resources (nouns), HTTP methods represent actions (verbs)
- Use two route files: `/api/resource/+server.ts` for collections and `/api/resource/[id]/+server.ts` for individuals
- Always validate request bodies before writing to the database
- Use correct HTTP status codes: 201 for created, 204 for deleted, 400 for bad input, 404 for not found
- Pagination with `limit` and `offset` query parameters keeps list endpoints efficient
