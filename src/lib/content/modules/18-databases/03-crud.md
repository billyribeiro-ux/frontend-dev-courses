# Full CRUD with Drizzle

CRUD stands for **Create, Read, Update, Delete** — the four fundamental operations for managing data. Nearly every feature you build in a web application maps to one of these operations. A bookmark manager, a task list, a blog, a shopping cart — they all reduce to inserting rows, querying them, modifying them, and removing them.

This lesson builds a complete bookmarks application that performs all four operations using Drizzle ORM and SvelteKit form actions. We go beyond the basics: filtering, joining, ordering, pagination, transactions, bulk operations, error handling, optimistic locking, and building a reusable CRUD module pattern that scales to any resource in your application.

## The Schema

Start with the bookmarks schema. Notice the `updatedAt` field — it is essential for optimistic locking, which we cover later:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique()
});

export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  description: text('description').default(''),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`)
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique()
});

export const bookmarkTags = sqliteTable('bookmark_tags', {
  bookmarkId: integer('bookmark_id')
    .notNull()
    .references(() => bookmarks.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' })
});
```

The `references` with `onDelete: 'cascade'` means that when a user is deleted, all their bookmarks are automatically deleted by the database. Similarly, when a bookmark is deleted, its tag associations in the join table are cleaned up. Without cascading deletes, you would have orphaned rows pointing to records that no longer exist.

## Read: Querying Data

### Basic Select

Load all bookmarks for the current user, ordered by most recent first:

```typescript
// src/routes/bookmarks/+page.server.ts
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';
import { desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
  const allBookmarks = await db
    .select()
    .from(bookmarks)
    .where(eq(bookmarks.userId, locals.user.id))
    .orderBy(desc(bookmarks.createdAt));

  return { bookmarks: allBookmarks };
};
```

The `desc()` function sorts results in descending order so the newest bookmarks appear first. Without an explicit `orderBy`, the database returns rows in whatever order is most efficient — which is effectively random from the application's perspective.

### Selecting Specific Columns

Selecting all columns with `.select()` works, but in production you should select only what you need. This reduces network transfer between your database and your serverless function, which matters when you have many columns or large text fields:

```typescript
const summaries = await db
  .select({
    id: bookmarks.id,
    title: bookmarks.title,
    url: bookmarks.url,
    createdAt: bookmarks.createdAt
  })
  .from(bookmarks)
  .where(eq(bookmarks.userId, locals.user.id))
  .orderBy(desc(bookmarks.createdAt));
```

### Filtering with Multiple Conditions

Combine conditions with `and()` and `or()`:

```typescript
import { and, or, like, eq, gte, lte } from 'drizzle-orm';

// Bookmarks matching a search term in title OR description
const results = await db
  .select()
  .from(bookmarks)
  .where(
    and(
      eq(bookmarks.userId, locals.user.id),
      or(
        like(bookmarks.title, `%${searchTerm}%`),
        like(bookmarks.description, `%${searchTerm}%`)
      )
    )
  );

// Bookmarks created within a date range
const recentBookmarks = await db
  .select()
  .from(bookmarks)
  .where(
    and(
      eq(bookmarks.userId, locals.user.id),
      gte(bookmarks.createdAt, '2024-01-01'),
      lte(bookmarks.createdAt, '2024-12-31')
    )
  );
```

### Dynamic Filter Building

Real applications often have optional filters. Build the where clause dynamically:

```typescript
export const load: PageServerLoad = async ({ locals, url }) => {
  const search = url.searchParams.get('search');
  const sortBy = url.searchParams.get('sort') || 'createdAt';
  const order = url.searchParams.get('order') || 'desc';

  // Start with base condition
  const conditions = [eq(bookmarks.userId, locals.user.id)];

  // Add optional filters
  if (search) {
    conditions.push(
      or(
        like(bookmarks.title, `%${search}%`),
        like(bookmarks.description, `%${search}%`)
      )!
    );
  }

  // Build the query
  const sortColumn = sortBy === 'title' ? bookmarks.title : bookmarks.createdAt;
  const orderFn = order === 'asc' ? asc : desc;

  const results = await db
    .select()
    .from(bookmarks)
    .where(and(...conditions))
    .orderBy(orderFn(sortColumn));

  return { bookmarks: results, search, sortBy, order };
};
```

### Joins: Loading Related Data

Fetch bookmarks with their tags using a left join through the join table:

```typescript
import { eq } from 'drizzle-orm';

const bookmarksWithTags = await db
  .select({
    bookmark: bookmarks,
    tagName: tags.name
  })
  .from(bookmarks)
  .leftJoin(bookmarkTags, eq(bookmarks.id, bookmarkTags.bookmarkId))
  .leftJoin(tags, eq(bookmarkTags.tagId, tags.id))
  .where(eq(bookmarks.userId, locals.user.id))
  .orderBy(desc(bookmarks.createdAt));

// The result has one row per bookmark-tag combination.
// A bookmark with 3 tags appears 3 times. Group them:
const grouped = new Map<number, {
  bookmark: typeof bookmarks.$inferSelect;
  tags: string[];
}>();

for (const row of bookmarksWithTags) {
  if (!grouped.has(row.bookmark.id)) {
    grouped.set(row.bookmark.id, {
      bookmark: row.bookmark,
      tags: []
    });
  }
  if (row.tagName) {
    grouped.get(row.bookmark.id)!.tags.push(row.tagName);
  }
}

return { bookmarks: [...grouped.values()] };
```

The grouping step is important. SQL joins produce a flat result set — each row is a unique combination of bookmark and tag. A bookmark with 3 tags produces 3 rows, a bookmark with 0 tags produces 1 row with null tag fields (because it is a left join). The JavaScript grouping transforms this flat result into the nested structure your UI expects.

### Pagination

Never return unbounded results. Add limit and offset (or cursor-based) pagination:

```typescript
export const load: PageServerLoad = async ({ locals, url }) => {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const perPage = 20;
  const offset = (page - 1) * perPage;

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.userId, locals.user.id))
      .orderBy(desc(bookmarks.createdAt))
      .limit(perPage)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)` })
      .from(bookmarks)
      .where(eq(bookmarks.userId, locals.user.id))
  ]);

  const total = countResult[0].count;

  return {
    bookmarks: results,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.ceil(total / perPage),
      hasNext: page * perPage < total,
      hasPrev: page > 1
    }
  };
};
```

Running the count query in parallel with the data query using `Promise.all` halves the latency compared to running them sequentially. This is a common optimization that too many developers overlook.

## Create: Inserting Data

### Basic Insert

Add a form action that inserts a new bookmark:

```typescript
// src/routes/bookmarks/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import db from '$lib/server/db';
import { bookmarks, bookmarkTags, tags } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const title = (formData.get('title') as string)?.trim();
    const url = (formData.get('url') as string)?.trim();
    const description = (formData.get('description') as string)?.trim() || '';

    // Validation
    const errors: Record<string, string> = {};

    if (!title) {
      errors.title = 'Title is required';
    } else if (title.length > 200) {
      errors.title = 'Title must be 200 characters or fewer';
    }

    if (!url) {
      errors.url = 'URL is required';
    } else {
      try {
        new URL(url); // Validate URL format
      } catch {
        errors.url = 'Must be a valid URL';
      }
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, {
        errors,
        values: { title, url, description }
      });
    }

    // Check for duplicate URL
    const [existing] = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.url, url),
          eq(bookmarks.userId, locals.user.id)
        )
      );

    if (existing) {
      return fail(409, {
        errors: { url: 'You already have a bookmark for this URL' },
        values: { title, url, description }
      });
    }

    await db.insert(bookmarks).values({
      title,
      url,
      description,
      userId: locals.user.id
    });

    return { success: true };
  }
};
```

### Insert with Returning

The `returning()` clause gives you the inserted row, including auto-generated fields like `id` and `createdAt`:

```typescript
const [newBookmark] = await db
  .insert(bookmarks)
  .values({
    title,
    url,
    description,
    userId: locals.user.id
  })
  .returning();

// newBookmark now has { id: 42, title: '...', createdAt: '2024-...', ... }
```

This is essential when you need the new record's ID to create related records (like tag associations) in the same request.

### Insert with Related Data (Tags)

When creating a bookmark with tags, you need multiple inserts that must succeed or fail together. Use a transaction:

```typescript
create: async ({ request, locals }) => {
  const formData = await request.formData();
  const title = (formData.get('title') as string)?.trim();
  const url = (formData.get('url') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || '';
  const tagNames = (formData.get('tags') as string)
    ?.split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean) || [];

  // ... validation ...

  // Transaction: everything inside succeeds or fails together
  await db.transaction(async (tx) => {
    // 1. Insert the bookmark
    const [bookmark] = await tx
      .insert(bookmarks)
      .values({ title, url, description, userId: locals.user.id })
      .returning();

    // 2. Insert or find tags
    for (const name of tagNames) {
      // Insert tag if it doesn't exist (ignore conflict on unique name)
      await tx
        .insert(tags)
        .values({ name })
        .onConflictDoNothing();

      // Get the tag ID
      const [tag] = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name));

      // 3. Create the association
      await tx.insert(bookmarkTags).values({
        bookmarkId: bookmark.id,
        tagId: tag.id
      });
    }
  });

  return { success: true };
}
```

If any insert fails (database error, constraint violation), the entire transaction rolls back. The bookmark is not created without its tags, and tags are not orphaned without a bookmark. Transactions are essential whenever multiple writes must be atomic.

## Update: Modifying Data

### Basic Update

Add an update action that modifies an existing bookmark:

```typescript
update: async ({ request, locals }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));
  const title = (formData.get('title') as string)?.trim();
  const url = (formData.get('url') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || '';

  if (!id || !title || !url) {
    return fail(400, { error: 'ID, title, and URL are required' });
  }

  // Verify ownership before updating
  const [existing] = await db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));

  if (!existing) {
    return fail(404, { error: 'Bookmark not found' });
  }

  if (existing.userId !== locals.user.id) {
    return fail(403, { error: 'You can only edit your own bookmarks' });
  }

  await db
    .update(bookmarks)
    .set({
      title,
      url,
      description,
      updatedAt: sql`(datetime('now'))`
    })
    .where(eq(bookmarks.id, id));

  return { success: true };
},
```

The `eq()` function creates a WHERE clause. `eq(bookmarks.id, id)` translates to `WHERE id = ?`. Always include a WHERE clause on updates — an `update` without `where` modifies every row in the table.

### Optimistic Locking

A subtle but important problem: what happens when two users edit the same bookmark simultaneously? User A loads the bookmark, User B loads the same bookmark, User A saves their changes, then User B saves their changes. User B's save overwrites User A's changes without knowing they existed. This is the "lost update" problem.

Optimistic locking solves this by checking that the record has not changed since it was loaded:

```typescript
update: async ({ request, locals }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));
  const title = (formData.get('title') as string)?.trim();
  const url = (formData.get('url') as string)?.trim();
  const description = (formData.get('description') as string)?.trim() || '';
  // The updatedAt timestamp from when the user loaded the form
  const expectedUpdatedAt = formData.get('updatedAt') as string;

  // Update ONLY if updatedAt matches what the user saw
  const [updated] = await db
    .update(bookmarks)
    .set({
      title,
      url,
      description,
      updatedAt: sql`(datetime('now'))`
    })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, locals.user.id),
        eq(bookmarks.updatedAt, expectedUpdatedAt) // Optimistic lock
      )
    )
    .returning();

  if (!updated) {
    // Either the bookmark doesn't exist, it's not theirs, or it was modified
    const [current] = await db
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.id, id));

    if (!current) {
      return fail(404, { error: 'Bookmark not found' });
    }

    if (current.userId !== locals.user.id) {
      return fail(403, { error: 'Not your bookmark' });
    }

    // The bookmark was modified by someone else since the user loaded it
    return fail(409, {
      error: 'This bookmark was modified by someone else. Please review the current version and try again.',
      currentValues: current
    });
  }

  return { success: true };
}
```

The key line is `eq(bookmarks.updatedAt, expectedUpdatedAt)`. If another user modified the bookmark between when User B loaded it and when User B submitted the form, the `updatedAt` will not match, the WHERE clause finds zero rows, `returning()` returns an empty array, and we know the update was not applied.

The form must include the `updatedAt` value as a hidden field so it can be compared during the update:

```svelte
<form method="POST" action="?/update">
  <input type="hidden" name="id" value={bookmark.id} />
  <input type="hidden" name="updatedAt" value={bookmark.updatedAt} />
  <!-- ... other fields ... -->
</form>
```

## Delete: Removing Data

### Basic Delete

```typescript
delete: async ({ request, locals }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));

  if (!id) {
    return fail(400, { error: 'ID is required' });
  }

  // Verify ownership before deleting
  const [existing] = await db
    .select({ userId: bookmarks.userId })
    .from(bookmarks)
    .where(eq(bookmarks.id, id));

  if (!existing) {
    return fail(404, { error: 'Bookmark not found' });
  }

  if (existing.userId !== locals.user.id) {
    return fail(403, { error: 'You can only delete your own bookmarks' });
  }

  await db.delete(bookmarks).where(eq(bookmarks.id, id));

  return { success: true };
}
```

### Cascade Considerations

When you delete a bookmark, what happens to its tag associations in the `bookmarkTags` join table? Because we defined `onDelete: 'cascade'` in the schema, the database automatically deletes the associated rows. Without cascading deletes, you would need to manually delete the associations first:

```typescript
// If you did NOT use onDelete: 'cascade' in the schema:
await db.transaction(async (tx) => {
  // Delete tag associations first (child rows)
  await tx.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));

  // Then delete the bookmark (parent row)
  await tx.delete(bookmarks).where(eq(bookmarks.id, id));
});
```

The order matters. If you delete the bookmark first and the tag association delete fails, you have orphaned rows in the join table. The transaction ensures both succeed or both roll back.

**When NOT to cascade:** Some relationships should not cascade. If a user deletes their account, you might want to keep their orders (for accounting) but remove their personal information. In that case, use `onDelete: 'set null'` instead of `cascade`:

```typescript
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  // When the user is deleted, userId becomes null but the order remains
  total: integer('total').notNull()
});
```

### Soft Delete

In many applications, deleting data is irrecoverable and risky. A "soft delete" marks the record as deleted without removing it from the database. You can always restore it or use it for audit trails.

```typescript
// Add a deletedAt column to your schema
export const bookmarks = sqliteTable('bookmarks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  url: text('url').notNull(),
  // ... other fields ...
  deletedAt: text('deleted_at') // null means active, timestamp means deleted
});

// "Delete" = set the timestamp
softDelete: async ({ request, locals }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));

  await db
    .update(bookmarks)
    .set({ deletedAt: sql`(datetime('now'))` })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, locals.user.id)
      )
    );

  return { success: true };
},

// Restore a soft-deleted bookmark
restore: async ({ request, locals }) => {
  const formData = await request.formData();
  const id = Number(formData.get('id'));

  await db
    .update(bookmarks)
    .set({ deletedAt: null })
    .where(
      and(
        eq(bookmarks.id, id),
        eq(bookmarks.userId, locals.user.id)
      )
    );

  return { success: true };
}

// All read queries must exclude soft-deleted records
const activeBookmarks = await db
  .select()
  .from(bookmarks)
  .where(
    and(
      eq(bookmarks.userId, locals.user.id),
      isNull(bookmarks.deletedAt) // Only active records
    )
  );
```

## Bulk Operations

### Bulk Insert

Insert multiple records in a single query:

```typescript
const bookmarksToImport = [
  { title: 'SvelteKit Docs', url: 'https://kit.svelte.dev', userId: 1 },
  { title: 'Drizzle ORM', url: 'https://orm.drizzle.team', userId: 1 },
  { title: 'TypeScript', url: 'https://typescriptlang.org', userId: 1 }
];

await db.insert(bookmarks).values(bookmarksToImport);
```

A single insert with multiple values is dramatically faster than multiple individual inserts because the database only needs to parse the query once and can batch the disk writes.

### Bulk Update

Update multiple records matching a condition:

```typescript
// Mark all bookmarks as read
await db
  .update(bookmarks)
  .set({ isRead: true })
  .where(eq(bookmarks.userId, locals.user.id));

// Bulk delete by condition
await db
  .delete(bookmarks)
  .where(
    and(
      eq(bookmarks.userId, locals.user.id),
      lte(bookmarks.createdAt, '2023-01-01') // Delete bookmarks older than 2023
    )
  );
```

### Bulk Delete with Confirmation

For destructive bulk operations, add a confirmation step:

```typescript
bulkDelete: async ({ request, locals }) => {
  const formData = await request.formData();
  const ids = (formData.get('ids') as string)
    .split(',')
    .map(Number)
    .filter(Number.isFinite);

  if (ids.length === 0) {
    return fail(400, { error: 'No bookmarks selected' });
  }

  if (ids.length > 100) {
    return fail(400, { error: 'Cannot delete more than 100 bookmarks at once' });
  }

  // Verify all bookmarks belong to this user
  const owned = await db
    .select({ id: bookmarks.id })
    .from(bookmarks)
    .where(
      and(
        inArray(bookmarks.id, ids),
        eq(bookmarks.userId, locals.user.id)
      )
    );

  if (owned.length !== ids.length) {
    return fail(403, { error: 'Some bookmarks do not belong to you' });
  }

  await db
    .delete(bookmarks)
    .where(inArray(bookmarks.id, ids));

  return { success: true, deleted: ids.length };
}
```

## Error Handling

Database operations can fail in many ways. Handle each type specifically:

```typescript
import { fail } from '@sveltejs/kit';

create: async ({ request, locals }) => {
  const formData = await request.formData();
  // ... parse form data ...

  try {
    await db.insert(bookmarks).values({ title, url, userId: locals.user.id });
    return { success: true };
  } catch (err: unknown) {
    // SQLite unique constraint violation
    if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
      return fail(409, {
        errors: { url: 'A bookmark with this URL already exists' },
        values: { title, url, description }
      });
    }

    // Foreign key constraint (e.g., invalid userId)
    if (err instanceof Error && err.message.includes('FOREIGN KEY constraint failed')) {
      return fail(400, {
        errors: { general: 'Invalid reference. Please try again.' }
      });
    }

    // Unknown database error
    console.error('Database error:', err);
    return fail(500, {
      errors: { general: 'Something went wrong. Please try again.' }
    });
  }
}
```

Notice the pattern: return `fail()` with form-compatible error objects that include the submitted values. This lets the form re-render with error messages AND the user's input preserved — they do not have to retype everything.

## The Page Component

Build the UI that connects to all four operations:

```svelte
<!-- src/routes/bookmarks/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let editingId = $state<number | null>(null);
  let selectedIds = $state<Set<number>>(new Set());

  function toggleEdit(id: number) {
    editingId = editingId === id ? null : id;
  }

  function toggleSelect(id: number) {
    if (selectedIds.has(id)) {
      selectedIds.delete(id);
    } else {
      selectedIds.add(id);
    }
    selectedIds = new Set(selectedIds); // Trigger reactivity
  }
</script>

<h1 class="text-2xl font-bold mb-6">My Bookmarks</h1>

<!-- Success/error messages -->
{#if form?.success}
  <div class="bg-green-50 text-green-800 p-3 rounded mb-4">
    Bookmark saved successfully.
  </div>
{/if}

{#if form?.errors?.general}
  <div class="bg-red-50 text-red-800 p-3 rounded mb-4">
    {form.errors.general}
  </div>
{/if}

<!-- Create form -->
<form method="POST" action="?/create" use:enhance class="space-y-3 mb-8">
  <div>
    <input
      name="title"
      placeholder="Title"
      value={form?.values?.title || ''}
      required
      class="w-full border rounded px-3 py-2"
      class:border-red-500={form?.errors?.title}
    />
    {#if form?.errors?.title}
      <p class="text-red-600 text-sm mt-1">{form.errors.title}</p>
    {/if}
  </div>

  <div>
    <input
      name="url"
      type="url"
      placeholder="https://..."
      value={form?.values?.url || ''}
      required
      class="w-full border rounded px-3 py-2"
      class:border-red-500={form?.errors?.url}
    />
    {#if form?.errors?.url}
      <p class="text-red-600 text-sm mt-1">{form.errors.url}</p>
    {/if}
  </div>

  <input
    name="description"
    placeholder="Description (optional)"
    value={form?.values?.description || ''}
    class="w-full border rounded px-3 py-2"
  />

  <button type="submit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
    Add Bookmark
  </button>
</form>

<!-- Bulk actions -->
{#if selectedIds.size > 0}
  <div class="bg-gray-50 p-3 rounded mb-4 flex items-center gap-4">
    <span>{selectedIds.size} selected</span>
    <form method="POST" action="?/bulkDelete" use:enhance>
      <input type="hidden" name="ids" value={[...selectedIds].join(',')} />
      <button
        type="submit"
        class="text-red-600 hover:text-red-800 text-sm"
        onclick={(e) => {
          if (!confirm(`Delete ${selectedIds.size} bookmarks?`)) {
            e.preventDefault();
          }
        }}
      >
        Delete Selected
      </button>
    </form>
  </div>
{/if}

<!-- List bookmarks -->
{#each data.bookmarks as bookmark (bookmark.id)}
  <div class="border rounded-lg p-4 mb-3">
    {#if editingId === bookmark.id}
      <!-- Edit mode -->
      <form method="POST" action="?/update" use:enhance
            onsubmit={() => { editingId = null; }}>
        <input type="hidden" name="id" value={bookmark.id} />
        <input type="hidden" name="updatedAt" value={bookmark.updatedAt} />

        <input name="title" value={bookmark.title} required
               class="w-full border rounded px-3 py-2 mb-2" />
        <input name="url" value={bookmark.url} required
               class="w-full border rounded px-3 py-2 mb-2" />
        <input name="description" value={bookmark.description || ''}
               class="w-full border rounded px-3 py-2 mb-2" />

        <div class="flex gap-2">
          <button type="submit"
                  class="bg-green-600 text-white px-3 py-1 rounded text-sm">
            Save
          </button>
          <button type="button" onclick={() => toggleEdit(bookmark.id)}
                  class="bg-gray-200 px-3 py-1 rounded text-sm">
            Cancel
          </button>
        </div>
      </form>
    {:else}
      <!-- View mode -->
      <div class="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selectedIds.has(bookmark.id)}
          onchange={() => toggleSelect(bookmark.id)}
          class="mt-1"
        />
        <div class="flex-1">
          <a href={bookmark.url} target="_blank"
             class="text-blue-600 hover:underline font-medium">
            {bookmark.title}
          </a>
          {#if bookmark.description}
            <p class="text-gray-600 text-sm mt-1">{bookmark.description}</p>
          {/if}
          <p class="text-gray-400 text-xs mt-1">
            Added {new Date(bookmark.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div class="flex gap-2">
          <button onclick={() => toggleEdit(bookmark.id)}
                  class="text-gray-500 hover:text-gray-700 text-sm">
            Edit
          </button>
          <form method="POST" action="?/delete" use:enhance class="inline">
            <input type="hidden" name="id" value={bookmark.id} />
            <button type="submit" class="text-red-500 hover:text-red-700 text-sm">
              Delete
            </button>
          </form>
        </div>
      </div>
    {/if}
  </div>
{:else}
  <p class="text-gray-500 text-center py-8">
    No bookmarks yet. Add your first one above.
  </p>
{/each}

<!-- Pagination -->
{#if data.pagination}
  <nav class="flex justify-center gap-2 mt-8">
    {#if data.pagination.hasPrev}
      <a href="?page={data.pagination.page - 1}"
         class="px-3 py-1 border rounded hover:bg-gray-50">
        Previous
      </a>
    {/if}

    <span class="px-3 py-1 text-gray-600">
      Page {data.pagination.page} of {data.pagination.totalPages}
    </span>

    {#if data.pagination.hasNext}
      <a href="?page={data.pagination.page + 1}"
         class="px-3 py-1 border rounded hover:bg-gray-50">
        Next
      </a>
    {/if}
  </nav>
{/if}
```

Each delete button is its own form with a hidden `id` field. This works without JavaScript and keeps the UI simple. The `use:enhance` directive adds progressive enhancement — form submissions happen via fetch without a full page reload, and the page data refreshes automatically after each action.

The `(bookmark.id)` keyed each block ensures Svelte correctly tracks which DOM elements correspond to which bookmarks when the list changes.

## Try It

1. **Extend the bookmarks app with tags.** Add a text input for comma-separated tags on the create form. Store tags in the `tags` table and associations in `bookmarkTags`. Display tags as colored pills next to each bookmark. Add a filter dropdown that shows bookmarks for a selected tag.

2. **Implement optimistic locking.** Add an `updatedAt` hidden field to the edit form. In the update action, check that `updatedAt` matches the current database value. If it does not match, return a 409 error with the current values and a message explaining the conflict. Open two browser tabs, edit the same bookmark in both, save from one tab, then try to save from the other — you should see the conflict error.

3. **Build a "trash" system.** Add a `deletedAt` column. Change delete to soft-delete. Add a `/bookmarks/trash` page that shows soft-deleted bookmarks with "Restore" and "Permanently Delete" buttons. Add a "View Trash" link on the main page.

4. **Add import/export.** Add an "Export" button that downloads all bookmarks as a JSON file. Add an "Import" form that accepts a JSON file and bulk-inserts the bookmarks using a transaction. Handle duplicates gracefully (skip or update existing).

## Key Takeaways

- CRUD covers all data operations: Create (`db.insert`), Read (`db.select`), Update (`db.update`), Delete (`db.delete`)
- Use `eq()` from `drizzle-orm` to build WHERE clauses — always include a WHERE on updates and deletes to avoid modifying all rows
- Transactions (`db.transaction`) ensure multiple related writes either all succeed or all roll back — essential for maintaining data integrity
- Join related tables with `.leftJoin()` and group the flat result set in JavaScript to create nested data structures
- Optimistic locking with `updatedAt` comparison prevents lost updates when multiple users edit the same record
- Use `returning()` after inserts to get the auto-generated ID and timestamps without a separate query
- Form actions return `fail()` with error details AND submitted values so users do not lose their input when validation fails
- Soft delete (setting `deletedAt` instead of removing the row) is safer for important data and enables undo functionality
- Cascade delete (`onDelete: 'cascade'`) automatically cleans up child records — but use `set null` when you need to preserve the child records
- Run count queries in parallel with data queries using `Promise.all` — it halves the latency for paginated endpoints
- Bulk operations (insert/update/delete with arrays) are dramatically faster than individual operations because the database batches disk writes
