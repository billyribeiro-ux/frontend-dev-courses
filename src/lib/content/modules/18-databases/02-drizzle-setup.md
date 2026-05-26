# Setting Up Drizzle ORM

Writing raw SQL strings works, but it is error-prone and gives you no type safety. A typo in a column name, a missing WHERE clause, a wrong data type -- all of these become runtime errors that slip through code review and surface in production. **Drizzle ORM** lets you write database queries in TypeScript with full autocompletion and compile-time type checking. It generates the SQL for you while staying close to the SQL you already know.

But Drizzle is more than just "SQL but typed." It occupies a unique position in the ORM landscape: it is a **query builder that provides ORM-level convenience without ORM-level abstraction**. Understanding this distinction -- and how Drizzle's architecture differs from tools like Prisma, TypeORM, and Knex -- will help you make better decisions about schema design, query patterns, and performance.

This lesson walks through the complete setup: installing dependencies, defining your schema, configuring the database client, and writing your first typed queries. By the end, you will have a fully working database layer integrated into your SvelteKit application.

## Installing Drizzle

Drizzle requires three packages, each with a distinct role:

```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

Here is what each one does:

- **`drizzle-orm`** -- the runtime query builder. This is what your application code imports to run queries like `db.select().from(users)`.
- **`better-sqlite3`** -- the database driver that actually talks to SQLite. Drizzle is driver-agnostic -- if you switch to PostgreSQL later, you swap this for `postgres` or `pg` and change your Drizzle dialect.
- **`drizzle-kit`** -- a CLI dev tool for managing your schema. It generates migrations, pushes schema changes, and provides a visual database browser. This is a dev dependency because it is never used at runtime.
- **`@types/better-sqlite3`** -- TypeScript type definitions for the SQLite driver.

### Understanding the Package Architecture

```
  Your Application Code
  ─────────────────────
  drizzle-orm            (query builder -- translates TypeScript to SQL)
  ─────────────────────
  better-sqlite3         (driver -- executes SQL against the database file)
  ─────────────────────
  SQLite (C library)     (database engine -- compiled into better-sqlite3)
  ─────────────────────
  local.db               (single file on disk -- your entire database)
```

This architecture is intentionally layered. Drizzle does not know or care what database engine runs underneath. It generates SQL strings and passes them to the driver. The driver handles the actual communication with the database. This separation is why switching databases is mostly a configuration change -- your Drizzle queries remain the same.

```
# WRONG: Installing drizzle-kit as a runtime dependency
npm install drizzle-kit
# drizzle-kit is 15MB+ and includes CLI tools, code generators,
# and development utilities. None of this belongs in production.

# CORRECT: drizzle-kit is a dev dependency
npm install -D drizzle-kit
# Only drizzle-orm and better-sqlite3 ship to production.
```

## Defining a Schema

Your schema is the **single source of truth** for your data model. It defines what tables exist, what columns each table has, what types those columns hold, and what constraints enforce data integrity. Drizzle generates both the SQL DDL (CREATE TABLE statements) and the TypeScript types from this one definition.

Create a schema file inside `$lib/server` -- this is important, and we will explain why shortly:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  email: text('email').unique().notNull(),
  displayName: text('display_name').notNull(),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').unique().notNull(),
  content: text('content').notNull(),
  published: integer('published', { mode: 'boolean' }).default(false),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  body: text('body').notNull(),
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});
```

### Understanding Every Design Decision

Several things to notice in this schema:

**Column names vs property names.** The first argument to `text('display_name')` is the actual column name in the database (snake_case, as is SQL convention). The TypeScript property name `displayName` is what you use in your code (camelCase, as is JavaScript convention). Drizzle handles the mapping automatically.

```typescript
// In your TypeScript code, you use camelCase:
db.insert(users).values({ displayName: 'Alice' });

// Drizzle generates snake_case SQL:
// INSERT INTO users (display_name) VALUES ('Alice')
```

**Foreign keys use arrow functions.** The `.references(() => users.id)` syntax uses a callback so that `users` does not need to be defined before `posts` in the file. This avoids circular reference issues.

```typescript
// WRONG: Direct reference -- fails if users is defined after posts
userId: integer('user_id').references(users.id)

// CORRECT: Arrow function -- defers resolution
userId: integer('user_id').references(() => users.id)
```

**`mode: 'boolean'` on integer columns.** SQLite has no native boolean type, so booleans are stored as 0 and 1. The `mode: 'boolean'` option tells Drizzle to convert these to `true`/`false` in your TypeScript code.

```typescript
// Without mode: 'boolean'
published: integer('published')
// TypeScript type: number
// You write: .values({ published: 1 })

// With mode: 'boolean'
published: integer('published', { mode: 'boolean' })
// TypeScript type: boolean
// You write: .values({ published: true })
```

**Constraints chain fluently.** `.unique().notNull()` reads naturally and mirrors the SQL `UNIQUE NOT NULL`. Each constraint method returns the column builder, so you can chain as many as you need.

### Schema Design Patterns for Real Applications

Beyond the basics, here are patterns you will use in production schemas:

```typescript
// Timestamps with proper defaults
export const posts = sqliteTable('posts', {
  // ... other columns
  createdAt: text('created_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: text('updated_at')
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// Enum-like columns using text with TypeScript unions
export const users = sqliteTable('users', {
  // ... other columns
  role: text('role', { enum: ['admin', 'editor', 'viewer'] })
    .default('viewer')
    .notNull(),
});
// TypeScript type for role: 'admin' | 'editor' | 'viewer'

// Composite unique constraints
import { uniqueIndex } from 'drizzle-orm/sqlite-core';

export const postTags = sqliteTable('post_tags', {
  postId: integer('post_id').notNull().references(() => posts.id),
  tagId: integer('tag_id').notNull().references(() => tags.id),
}, (table) => ({
  // A post can only have each tag once
  pk: uniqueIndex('post_tag_unique').on(table.postId, table.tagId),
}));
```

```
# WRONG: Defining roles as a separate table for simple enums
# Over-engineering. A text column with enum validation is simpler
# and performs better for small, fixed sets of values.

# CORRECT: Use text enum for small fixed sets, a table for dynamic sets
# If users can create new roles, use a roles table with a foreign key.
# If roles are fixed (admin/editor/viewer), use a text enum.
```

### Relations: Declaring How Tables Connect

Drizzle lets you declare relationships between tables for use with the relational query API:

```typescript
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments),
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  comments: many(comments),
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id],
  }),
  author: one(users, {
    fields: [comments.userId],
    references: [users.id],
  }),
}));
```

These relation declarations do not create any database constraints -- they are purely for Drizzle's relational query API. The actual foreign key constraints are defined in the schema with `.references()`. Relations tell Drizzle how to join tables when you use `db.query`:

```typescript
// With relations defined, you can do eager loading:
const postsWithAuthors = db.query.posts.findMany({
  with: {
    author: true,
    comments: {
      with: { author: true }
    }
  }
});
// Returns posts with nested author objects and comments with their authors
```

## Creating the Database Client

The database client is the object your application uses to run queries. Create it in `$lib/server/db/`:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('local.db');

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

// Enable foreign key enforcement (SQLite disables it by default!)
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

export default db;
```

### Critical: Enable Foreign Keys

SQLite does not enforce foreign key constraints by default. This is a notorious gotcha that catches developers off guard:

```typescript
// Without pragma('foreign_keys = ON'):
db.insert(posts).values({
  title: 'Test',
  slug: 'test',
  content: 'Hello',
  userId: 999 // This user does not exist!
}).run();
// SILENTLY SUCCEEDS -- your data integrity is broken

// With pragma('foreign_keys = ON'):
db.insert(posts).values({
  title: 'Test',
  slug: 'test',
  content: 'Hello',
  userId: 999
}).run();
// THROWS ERROR: FOREIGN KEY constraint failed
```

```
# WRONG: Skipping the foreign_keys pragma
# Your REFERENCES constraints are decorative -- they exist in the schema
# but are never enforced. You can insert orphaned rows, delete referenced
# rows, and corrupt your data with no warnings.

# CORRECT: Always enable foreign keys
sqlite.pragma('foreign_keys = ON');
# Now the database enforces every REFERENCES constraint.
# Invalid foreign keys are rejected with a clear error.
```

### WAL Mode: Why It Matters

WAL (Write-Ahead Logging) mode changes how SQLite handles concurrent access:

```
# Default journal mode:
- Writers block readers and readers block writers
- Only one operation at a time
- Simple but slow under load

# WAL mode:
- Writers do not block readers
- Multiple concurrent reads while writing
- Significantly better performance for web applications
- Slightly more disk usage (WAL file alongside the database)
```

For any web application, WAL mode is a clear win. Enable it once and forget about it.

Passing your `schema` to the `drizzle()` function enables Drizzle's relational query API, which we will use later. Without it, you can still run basic queries, but you lose the ability to do eager-loaded joins with the `db.query` syntax.

### Why $lib/server/?

SvelteKit enforces a critical security boundary: any module inside `$lib/server/` can only be imported by server-side code (`+page.server.ts`, `+server.ts`, hooks). If a component or `+page.ts` file tries to import from `$lib/server/`, SvelteKit throws a build error.

This is not just a convention -- it is a compile-time guarantee that your database credentials, connection strings, and query logic never get bundled into the JavaScript that ships to the browser. Your database client lives in `$lib/server/` because leaking it to the client would be a security catastrophe.

```
# WRONG: Putting the database client in $lib/db/index.ts
# A careless import in a .svelte file bundles better-sqlite3 into
# the client JavaScript. This exposes your database path, breaks
# the build (better-sqlite3 is a native Node module), and signals
# that your codebase has no server/client boundary enforcement.

# CORRECT: Putting the database client in $lib/server/db/index.ts
# SvelteKit refuses to compile if client code imports from $lib/server/.
# The security boundary is enforced by the build tool, not by hope.
```

## Configuring Drizzle Kit

Create a configuration file at the project root that tells Drizzle Kit where to find your schema and database:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/schema.ts',
  dbCredentials: {
    url: 'local.db'
  }
});
```

This configuration tells Drizzle Kit three things: you are using SQLite, your schema lives at the specified path, and the database file is `local.db` in the project root.

### Production Configuration with Environment Variables

For production, you should read the database path from an environment variable:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',           // Where migration files are generated
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'local.db'
  }
});
```

The `out` directory is where Drizzle Kit generates migration SQL files. These files should be committed to version control so every environment applies the same migrations.

## Push vs Generate+Migrate: Two Workflows

Drizzle Kit gives you two different workflows for applying schema changes, and understanding when to use each is important.

### `drizzle-kit push` -- Development Workflow

```bash
npx drizzle-kit push
```

This reads your schema file, compares it to the current database, and applies changes directly. No migration files are created. It is fast, simple, and perfect for development when you are iterating on your schema and do not care about data preservation.

Think of `push` as "make the database match my schema, right now." If you rename a column, it might drop and recreate it, losing any data in that column. That is fine in development with test data. It would be catastrophic in production.

### `drizzle-kit generate` + `migrate` -- Production Workflow

```bash
npx drizzle-kit generate
```

This creates a SQL migration file in a `drizzle/` directory containing the exact SQL to transform the database from its current schema to the new one:

```sql
-- drizzle/0001_create_users.sql
CREATE TABLE `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `username` text NOT NULL,
  `email` text NOT NULL,
  `display_name` text NOT NULL,
  `created_at` text DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
```

You review these files, commit them to version control, and apply them in your application startup:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import db from '$lib/server/db';

migrate(db, { migrationsFolder: './drizzle' });
```

Migration files are reviewable in pull requests, apply in order across all environments, and never silently drop data.

```
# WRONG: Using push in production
npx drizzle-kit push
# "Let me just push this column rename real quick..."
# The push drops the old column and creates a new one.
# All data in that column is gone. In production. With real users.

# CORRECT: Using generate + migrate in production
npx drizzle-kit generate
# Review the generated SQL: does it ALTER or DROP+CREATE?
# If it drops data, write a custom migration that preserves it.
# Commit the migration file. Deploy. Run migrate.
```

**Rule of thumb:** Use `push` during development. Switch to `generate`/`migrate` once you deploy and have real user data.

### Reviewing Generated Migrations

Always review generated migration files before applying them:

```sql
-- SAFE migration (ALTER adds a column):
ALTER TABLE `users` ADD COLUMN `bio` text;

-- DANGEROUS migration (DROP + CREATE loses data):
DROP TABLE `users`;
CREATE TABLE `users` ( ... );

-- When you see DROP, ask yourself:
-- 1. Is there data in this table/column that matters?
-- 2. Can I write a custom migration that preserves data?
-- 3. If I must drop, have I backed up the database?
```

## Adding Helper Scripts

Add these scripts to your `package.json` to save typing:

```json
{
  "scripts": {
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

`drizzle-kit studio` opens a visual database browser at `https://local.drizzle.studio` where you can view, edit, and query your data directly. It is invaluable during development for verifying that your queries are doing what you think they are doing.

## Basic CRUD with Drizzle

Now for the part you have been waiting for -- actually querying the database. Drizzle provides methods that mirror SQL's core operations, with full TypeScript type inference.

All four operations use the `eq`, `desc`, and other helpers imported from `drizzle-orm`:

```typescript
import db from '$lib/server/db';
import { users, posts } from '$lib/server/db/schema';
import { eq, desc, and, like, gte, sql } from 'drizzle-orm';
```

### SELECT -- Read Data

```typescript
// Get all users
const allUsers = db.select().from(users).all();
// Type: { id: number; username: string; email: string; displayName: string; createdAt: string | null }[]

// Get a single user by ID
const user = db.select().from(users).where(eq(users.id, 1)).get();
// Type: { ... } | undefined  (.get() returns one row or undefined)

// Select specific columns
const userNames = db.select({ 
  id: users.id, 
  name: users.username 
}).from(users).all();
// Type: { id: number; name: string }[]

// Complex filtering
const recentAdminPosts = db
  .select()
  .from(posts)
  .where(
    and(
      eq(posts.published, true),
      gte(posts.createdAt, '2024-01-01')
    )
  )
  .orderBy(desc(posts.createdAt))
  .limit(10)
  .all();

// Search with LIKE
const matchingUsers = db
  .select()
  .from(users)
  .where(like(users.username, '%alice%'))
  .all();
```

```
# WRONG: Using .all() when you expect one result
const user = db.select().from(users).where(eq(users.id, 1)).all();
// Returns an array: [{ id: 1, ... }]
// You then do user[0] -- but what if the array is empty? user[0] is undefined.

# CORRECT: Using .get() for single results
const user = db.select().from(users).where(eq(users.id, 1)).get();
// Returns the row directly or undefined
// TypeScript knows to check: if (user) { ... }
```

### INSERT -- Create Data

```typescript
// Insert a single row
db.insert(users).values({
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice'
}).run();

// Insert and get back the created row
const newPost = db.insert(posts).values({
  title: 'My First Post',
  slug: 'my-first-post',
  content: 'Hello, world!',
  userId: 1
}).returning().get();
// newPost includes the auto-generated id and createdAt

// Insert multiple rows
db.insert(users).values([
  { username: 'bob', email: 'bob@example.com', displayName: 'Bob' },
  { username: 'charlie', email: 'charlie@example.com', displayName: 'Charlie' }
]).run();
```

The `.returning()` method tells the database to return the affected row, including auto-generated values like `id` and `createdAt`. Without it, you just get metadata about how many rows were affected.

### UPDATE -- Modify Data

```typescript
// Update a specific row
db.update(posts)
  .set({ title: 'Updated Title', updatedAt: new Date().toISOString() })
  .where(eq(posts.id, 1))
  .run();

// Update and get the modified row back
const updated = db.update(posts)
  .set({ published: true })
  .where(eq(posts.id, 1))
  .returning()
  .get();

// Conditional update (only unpublished posts)
db.update(posts)
  .set({ published: true })
  .where(
    and(
      eq(posts.userId, currentUserId),
      eq(posts.published, false)
    )
  )
  .run();
```

### DELETE -- Remove Data

```typescript
// Delete a specific row
db.delete(posts).where(eq(posts.id, 1)).run();

// Delete with returning (get the deleted row)
const deleted = db.delete(posts)
  .where(eq(posts.id, 1))
  .returning()
  .get();

// Delete all comments for a post
db.delete(comments).where(eq(comments.postId, 1)).run();
```

### Joins

```typescript
// Inner join: posts with their authors
const postsWithAuthors = db
  .select({
    postTitle: posts.title,
    authorName: users.username,
  })
  .from(posts)
  .innerJoin(users, eq(posts.userId, users.id))
  .all();

// Left join: all users, even those without posts
const usersWithPostCount = db
  .select({
    username: users.username,
    postCount: sql<number>`count(${posts.id})`,
  })
  .from(users)
  .leftJoin(posts, eq(users.id, posts.userId))
  .groupBy(users.id)
  .all();
```

## Type Inference: Your Schema Drives Everything

One of Drizzle's best features is that your schema definitions produce TypeScript types automatically. You do not need to define separate interfaces:

```typescript
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';

// The type of a row when reading from the database
type User = InferSelectModel<typeof users>;
// { id: number; username: string; email: string; displayName: string; createdAt: string | null }

// The type of data when inserting -- id and createdAt are optional
type NewUser = InferInsertModel<typeof users>;
// { id?: number; username: string; email: string; displayName: string; createdAt?: string | null }
```

Notice the difference: `InferSelectModel` makes all columns required (they always exist when reading), while `InferInsertModel` makes columns with defaults optional (you do not need to provide `id` or `createdAt` when inserting). This distinction prevents entire categories of bugs.

```
# WRONG: Manually defining types that duplicate your schema
interface User {
  id: number;
  username: string;
  email: string;
  displayName: string;
  createdAt: string | null;
}
// When you add a column to the schema, you must remember to update
// this interface too. If you forget, your types lie about your data.

# CORRECT: Inferring types from the schema
type User = InferSelectModel<typeof users>;
// When you add a column to the schema, the type updates automatically.
// Your types are always in sync with your database. Zero maintenance.
```

### Using Inferred Types Across Your Application

These inferred types flow through your entire application:

```typescript
// src/lib/server/db/schema.ts
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;

// src/routes/users/+page.server.ts
import type { User } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
  const allUsers: User[] = db.select().from(users).all();
  return { users: allUsers };
};

// src/routes/users/+page.svelte
<script lang="ts">
  // The type flows through from the server to the client
  let { data } = $props();
  // data.users is typed as User[] automatically
</script>
```

## Transactions in Drizzle

For operations that must succeed or fail together:

```typescript
// Transfer a post from one user to another
db.transaction((tx) => {
  // Verify the post exists and belongs to the source user
  const post = tx.select()
    .from(posts)
    .where(and(
      eq(posts.id, postId),
      eq(posts.userId, sourceUserId)
    ))
    .get();

  if (!post) throw new Error('Post not found or not owned by user');

  // Update the post's owner
  tx.update(posts)
    .set({ userId: targetUserId })
    .where(eq(posts.id, postId))
    .run();

  // Log the transfer
  tx.insert(auditLog)
    .values({
      action: 'transfer_post',
      postId,
      fromUserId: sourceUserId,
      toUserId: targetUserId,
    })
    .run();
});
// If any step fails, ALL changes are rolled back
```

## Real Example: Using Drizzle in a SvelteKit Application

Using the schema and database client defined above, here is a complete notes application with load functions, form actions, and type-safe queries:

```typescript
// src/lib/server/db/schema.ts (simplified for this example)
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const notes = sqliteTable('notes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  content: text('content').default(''),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
});

export type Note = InferSelectModel<typeof notes>;
```

```typescript
// src/routes/notes/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import db from '$lib/server/db';
import { notes } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const allNotes = db.select().from(notes).orderBy(desc(notes.createdAt)).all();
  return { notes: allNotes };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title');

    // Server-side validation
    if (typeof title !== 'string' || !title.trim()) {
      return fail(400, { error: 'Title is required', title: '' });
    }

    if (title.length > 200) {
      return fail(400, { error: 'Title must be 200 characters or less', title });
    }

    try {
      db.insert(notes).values({ title: title.trim(), content: '' }).run();
    } catch (error) {
      return fail(500, { error: 'Failed to create note', title });
    }

    return { success: true };
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const id = Number(formData.get('id'));
    const title = formData.get('title');
    const content = formData.get('content');

    if (isNaN(id)) return fail(400, { error: 'Invalid ID' });
    if (typeof title !== 'string' || !title.trim()) {
      return fail(400, { error: 'Title is required' });
    }

    db.update(notes)
      .set({
        title: title.trim(),
        content: typeof content === 'string' ? content : '',
      })
      .where(eq(notes.id, id))
      .run();

    return { success: true };
  },

  delete: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    if (isNaN(id)) return fail(400, { error: 'Invalid ID' });

    const deleted = db.delete(notes).where(eq(notes.id, id)).returning().get();
    if (!deleted) return fail(404, { error: 'Note not found' });
  }
};
```

```svelte
<!-- src/routes/notes/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
</script>

<h1>My Notes</h1>

{#if form?.error}
  <p class="text-red-600">{form.error}</p>
{/if}

<form method="POST" action="?/create" use:enhance>
  <input
    name="title"
    placeholder="Note title"
    value={form?.title ?? ''}
    required
  />
  <button type="submit">Add Note</button>
</form>

{#each data.notes as note (note.id)}
  <div class="flex items-center gap-2 p-2 border-b">
    <span class="flex-1">{note.title}</span>
    <span class="text-sm text-gray-500">
      {new Date(note.createdAt ?? '').toLocaleDateString()}
    </span>
    <form method="POST" action="?/delete" use:enhance>
      <input type="hidden" name="id" value={note.id} />
      <button type="submit" class="text-red-600">Delete</button>
    </form>
  </div>
{:else}
  <p class="text-gray-500">No notes yet. Create one above!</p>
{/each}
```

Run `npm run db:push` to create the tables, start your dev server, and you have a working notes app with persistent storage and full type safety.

### Error Handling Patterns

Database operations can fail. Handle errors gracefully:

```typescript
// WRONG: No error handling
export const actions: Actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    db.insert(users).values({
      username: data.get('username') as string,
      email: data.get('email') as string,
    }).run();
    // If username is duplicate, this crashes with an unhandled error
  }
};

// CORRECT: Catch constraint violations
export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const username = formData.get('username');
    const email = formData.get('email');

    if (typeof username !== 'string' || !username.trim()) {
      return fail(400, { error: 'Username is required' });
    }

    try {
      const user = db.insert(users).values({
        username: username.trim(),
        email: email as string,
        displayName: username.trim(),
      }).returning().get();

      return { success: true, user };
    } catch (error: unknown) {
      // SQLite unique constraint error
      if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
        return fail(409, { error: 'Username or email already taken' });
      }
      return fail(500, { error: 'Something went wrong' });
    }
  }
};
```

## Database File Management

A few practical considerations for working with SQLite files:

```bash
# Add the database file to .gitignore
echo "local.db" >> .gitignore
echo "local.db-wal" >> .gitignore
echo "local.db-shm" >> .gitignore

# The WAL and SHM files are SQLite's journal files.
# They appear when WAL mode is enabled.
# Never delete them while the database is open.
```

```
# WRONG: Committing local.db to git
# Binary files do not diff well, the repo grows with every commit,
# and every developer overwrites each other's test data.

# CORRECT: Commit the schema and migrations, gitignore the database file
# Every developer runs db:push or db:migrate to create their own local database.
# Test data is created by seed scripts, not by sharing database files.
```

### Seed Scripts for Development Data

Create a seed script to populate your development database with test data:

```typescript
// scripts/seed.ts
import db from '../src/lib/server/db';
import { users, posts } from '../src/lib/server/db/schema';

// Clear existing data
db.delete(posts).run();
db.delete(users).run();

// Insert test users
const alice = db.insert(users).values({
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Johnson',
}).returning().get();

const bob = db.insert(users).values({
  username: 'bob',
  email: 'bob@example.com',
  displayName: 'Bob Smith',
}).returning().get();

// Insert test posts
db.insert(posts).values([
  { title: 'First Post', slug: 'first-post', content: 'Hello world!', userId: alice.id, published: true },
  { title: 'Draft Post', slug: 'draft-post', content: 'Work in progress...', userId: alice.id, published: false },
  { title: 'Bob\'s Post', slug: 'bobs-post', content: 'Hi from Bob!', userId: bob.id, published: true },
]).run();

console.log('Database seeded successfully!');
```

Add a script to `package.json`:

```json
{
  "scripts": {
    "db:seed": "tsx scripts/seed.ts"
  }
}
```

## Try It

Set up Drizzle in your SvelteKit project following the steps above. Define a `todos` table with `id` (primary key, auto-increment), `title` (text, required), `completed` (integer with boolean mode, default false), and `createdAt` (text with timestamp default). Push the schema. Then build a page that:

1. Loads all todos ordered by creation date (newest first)
2. Has a form to add new todos with server-side validation (title required, max 200 chars)
3. Has a toggle action that flips the `completed` status using `.returning()` to get the updated row
4. Has a delete action that removes a todo by ID and returns a 404 if the todo does not exist
5. Uses `enhance` for progressive enhancement so the forms work without JavaScript
6. Displays completed todos with a strikethrough style
7. Shows a count of completed vs total todos using `$derived`

Use `InferSelectModel` to create a `Todo` type and export it from your schema file.

## Key Takeaways

- Install `drizzle-orm` and your database driver for runtime, `drizzle-kit` as a dev dependency for schema tooling
- Define schemas with `sqliteTable`, `text()`, `integer()`, and constraint methods -- the schema is your single source of truth for both SQL and TypeScript types
- **Always enable `foreign_keys = ON`** in SQLite -- without it, your REFERENCES constraints are decorative and unenforced
- **Enable WAL mode** for better concurrent read performance in web applications
- Use `drizzle-kit push` during development for quick iteration, `generate` + `migrate` in production for safe, reviewable changes -- always review generated migration SQL before applying
- Place all database code in `$lib/server/` -- SvelteKit enforces this boundary at build time to prevent database code from reaching the browser
- The `db` instance provides `.select()`, `.insert()`, `.update()`, and `.delete()` -- all with full type inference from your schema
- Use `.get()` for single results and `.all()` for lists -- `.get()` returns the row or undefined, `.all()` returns an array
- Use `InferSelectModel` and `InferInsertModel` to derive TypeScript types from your schema without manual type definitions
- `.returning()` gets back the row after an insert, update, or delete -- essential for getting auto-generated values like IDs
- Define `relations()` to enable Drizzle's relational query API with `db.query` and eager loading via `with`
- Use transactions for operations that must succeed or fail together
- Handle database errors gracefully -- catch constraint violations and return meaningful error messages
- Gitignore the database file, commit migrations and schema -- use seed scripts for development data
