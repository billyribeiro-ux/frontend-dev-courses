# Building a REST API

Time to put everything together. In this lesson you will build a complete REST API for a **notes application**. The API will support creating, reading, updating, and deleting notes, with proper validation, error handling, and organized file structure.

By the end you will have a fully functional backend that any frontend — Svelte, React, or even a mobile app — could consume. This is the power of building APIs with SvelteKit: you get both the frontend and the backend in one project.

## Project Structure

Organize your API routes cleanly within a dedicated `/api` directory:

```
src/routes/api/
  notes/
    +server.ts          ← GET (list), POST (create)
    [id]/
      +server.ts        ← GET (single), PUT (update), DELETE
src/lib/server/
  db.ts                 ← Database connection
  schema.ts             ← Drizzle schema
  validators.ts         ← Shared validation functions
```

## Defining the Schema

Start with a clear database schema for notes:

```typescript
// src/lib/server/schema.ts
import { pgTable, serial, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const notes = pgTable('notes', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull().default(''),
  pinned: boolean('pinned').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});
```

## Shared Validation

Extract validation into a reusable module:

```typescript
// src/lib/server/validators.ts
import { error } from '@sveltejs/kit';

export function validateNote(body: unknown) {
  if (!body || typeof body !== 'object') {
    throw error(400, 'Request body must be JSON');
  }

  const { title, content, pinned } = body as Record<string, unknown>;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    throw error(400, 'Title is required');
  }

  if (title.length > 100) {
    throw error(400, 'Title cannot exceed 100 characters');
  }

  return {
    title: title.trim(),
    content: typeof content === 'string' ? content : '',
    pinned: pinned === true
  };
}
```

## The Collection Endpoint

Handle listing and creating notes:

```typescript
// src/routes/api/notes/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notes } from '$lib/server/schema';
import { validateNote } from '$lib/server/validators';
import { desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ url }) => {
  const limit = Math.min(Number(url.searchParams.get('limit')) || 20, 100);
  const offset = Number(url.searchParams.get('offset')) || 0;

  const results = await db
    .select()
    .from(notes)
    .orderBy(desc(notes.pinned), desc(notes.createdAt))
    .limit(limit)
    .offset(offset);

  return json(results);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const validated = validateNote(body);

  const [note] = await db.insert(notes).values(validated).returning();
  return json(note, { status: 201 });
};
```

## The Individual Item Endpoint

Handle reading, updating, and deleting a single note:

```typescript
// src/routes/api/notes/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { notes } from '$lib/server/schema';
import { validateNote } from '$lib/server/validators';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
  const [note] = await db.select().from(notes).where(eq(notes.id, Number(params.id)));

  if (!note) throw error(404, 'Note not found');
  return json(note);
};

export const PUT: RequestHandler = async ({ params, request }) => {
  const body = await request.json();
  const validated = validateNote(body);

  const [updated] = await db
    .update(notes)
    .set({ ...validated, updatedAt: new Date() })
    .where(eq(notes.id, Number(params.id)))
    .returning();

  if (!updated) throw error(404, 'Note not found');
  return json(updated);
};

export const DELETE: RequestHandler = async ({ params }) => {
  const [deleted] = await db
    .delete(notes)
    .where(eq(notes.id, Number(params.id)))
    .returning();

  if (!deleted) throw error(404, 'Note not found');
  return new Response(null, { status: 204 });
};
```

## Testing with Fetch

Test your API directly from a Svelte page or the browser console:

```typescript
// Create a note
const res = await fetch('/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'My First Note', content: 'Hello world!' })
});
const note = await res.json();
console.log(note); // { id: 1, title: 'My First Note', ... }

// List all notes
const all = await fetch('/api/notes').then(r => r.json());

// Update a note
await fetch('/api/notes/1', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Updated Title', content: 'New content', pinned: true })
});

// Delete a note
await fetch('/api/notes/1', { method: 'DELETE' });
```

## Try It

Extend the notes API with a `PATCH` endpoint that allows partial updates — updating just the `pinned` field without sending the full note body. Add a search feature to the GET endpoint that filters notes by a `?q=` query parameter, matching against both title and content.

## Key Takeaways

- Organize API routes under `/api` with collection and individual item endpoints
- Extract validation into shared modules in `$lib/server`
- Use `.returning()` with Drizzle to get the created or updated record back
- Test endpoints with `fetch` from the browser console or a Svelte component
- Always check that the record exists before updating or deleting, and return 404 if not found
