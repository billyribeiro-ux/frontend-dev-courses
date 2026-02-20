# Full CRUD with Drizzle

CRUD stands for **Create, Read, Update, Delete** — the four fundamental operations for managing data. In this lesson, you will build a complete bookmarks app that performs all four operations using Drizzle ORM and SvelteKit form actions.

## The Schema

Start with the bookmarks schema from the previous lesson:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});
```

## Read: Fetching All Bookmarks

Load all bookmarks in the server load function:

```typescript
// src/routes/bookmarks/+page.server.ts
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const allBookmarks = await db
    .select()
    .from(bookmarks)
    .orderBy(desc(bookmarks.createdAt));

  return { bookmarks: allBookmarks };
};
```

The `desc()` function sorts results in descending order so the newest bookmarks appear first.

## Create: Inserting a Bookmark

Add a form action that inserts a new bookmark:

```typescript
// src/routes/bookmarks/+page.server.ts (add to the same file)
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const url = formData.get('url') as string;
    const description = formData.get('description') as string;

    if (!title || !url) {
      return fail(400, { error: 'Title and URL are required' });
    }

    await db.insert(bookmarks).values({ title, url, description });

    return { success: true };
  }
};
```

## Update: Editing a Bookmark

Add an update action that modifies an existing bookmark:

```typescript
// Add to the actions object
update: async ({ request }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));
  const title = formData.get('title') as string;
  const url = formData.get('url') as string;
  const description = formData.get('description') as string;

  if (!id || !title || !url) {
    return fail(400, { error: 'ID, title, and URL are required' });
  }

  await db
    .update(bookmarks)
    .set({ title, url, description })
    .where(eq(bookmarks.id, id));

  return { success: true };
},
```

The `eq()` function creates a WHERE clause. `eq(bookmarks.id, id)` translates to `WHERE id = ?`.

## Delete: Removing a Bookmark

Add a delete action:

```typescript
// Add to the actions object
delete: async ({ request }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));

  if (!id) {
    return fail(400, { error: 'ID is required' });
  }

  await db.delete(bookmarks).where(eq(bookmarks.id, id));

  return { success: true };
}
```

## The Page Component

Build the UI that connects to all four operations:

```svelte
<!-- src/routes/bookmarks/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>My Bookmarks</h1>

<!-- Create form -->
<form method="POST" action="?/create">
  <input name="title" placeholder="Title" required />
  <input name="url" type="url" placeholder="https://..." required />
  <input name="description" placeholder="Description (optional)" />
  <button type="submit">Add Bookmark</button>
</form>

<!-- List bookmarks -->
{#each data.bookmarks as bookmark}
  <div class="bookmark">
    <a href={bookmark.url} target="_blank">{bookmark.title}</a>
    {#if bookmark.description}
      <p>{bookmark.description}</p>
    {/if}

    <form method="POST" action="?/delete" style="display:inline;">
      <input type="hidden" name="id" value={bookmark.id} />
      <button type="submit">Delete</button>
    </form>
  </div>
{/each}
```

Each delete button is its own form with a hidden `id` field. This works without JavaScript and keeps the UI simple.

## Try It

Extend the bookmarks app with an inline edit feature. When the user clicks "Edit" on a bookmark, show a form pre-filled with the current values. On submit, call the `?/update` action to save changes. Add a "Cancel" button that hides the edit form without submitting.

## Key Takeaways

- CRUD covers all data operations: Create (`db.insert`), Read (`db.select`), Update (`db.update`), Delete (`db.delete`)
- Use `eq()` from `drizzle-orm` to build WHERE clauses for targeting specific rows
- Each form action receives `FormData` and returns success or failure responses
- Hidden input fields pass identifiers like `id` through forms
- Use `fail()` from `@sveltejs/kit` to return validation errors from actions
- Chain `.orderBy()`, `.where()`, and `.limit()` to refine queries
