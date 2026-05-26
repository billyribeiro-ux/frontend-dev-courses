# Setting Up Drizzle ORM

Writing raw SQL strings works, but it is error-prone and gives you no type safety. A typo in a column name, a missing WHERE clause, a wrong data type — all of these become runtime errors that slip through code review and surface in production. **Drizzle ORM** lets you write database queries in TypeScript with full autocompletion and compile-time type checking. It generates the SQL for you while staying close to the SQL you already know.

This lesson walks through the complete setup: installing dependencies, defining your schema, configuring the database client, and writing your first typed queries. By the end, you will have a fully working database layer integrated into your SvelteKit application.

## Installing Drizzle

Drizzle requires three packages, each with a distinct role:

```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

Here is what each one does:

- **`drizzle-orm`** — the runtime query builder. This is what your application code imports to run queries like `db.select().from(users)`.
- **`better-sqlite3`** — the database driver that actually talks to SQLite. Drizzle is driver-agnostic — if you switch to PostgreSQL later, you swap this for `postgres` or `pg` and change your Drizzle dialect.
- **`drizzle-kit`** — a CLI dev tool for managing your schema. It generates migrations, pushes schema changes, and provides a visual database browser. This is a dev dependency because it is never used at runtime.
- **`@types/better-sqlite3`** — TypeScript type definitions for the SQLite driver.

## Defining a Schema

Your schema is the **single source of truth** for your data model. It defines what tables exist, what columns each table has, what types those columns hold, and what constraints enforce data integrity. Drizzle generates both the SQL DDL (CREATE TABLE statements) and the TypeScript types from this one definition.

Create a schema file inside `$lib/server` — this is important, and we will explain why shortly:

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

Several things to notice:

**Column names vs property names.** The first argument to `text('display_name')` is the actual column name in the database (snake_case, as is SQL convention). The TypeScript property name `displayName` is what you use in your code (camelCase, as is JavaScript convention). Drizzle handles the mapping automatically.

**Foreign keys use arrow functions.** The `.references(() => users.id)` syntax uses a callback so that `users` does not need to be defined before `posts` in the file. This avoids circular reference issues.

**`mode: 'boolean'` on integer columns.** SQLite has no native boolean type, so booleans are stored as 0 and 1. The `mode: 'boolean'` option tells Drizzle to convert these to `true`/`false` in your TypeScript code.

**Constraints chain fluently.** `.unique().notNull()` reads naturally and mirrors the SQL `UNIQUE NOT NULL`. Each constraint method returns the column builder, so you can chain as many as you need.

## Creating the Database Client

The database client is the object your application uses to run queries. Create it in `$lib/server/db/`:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema });

export default db;
```

Passing your `schema` to the `drizzle()` function enables Drizzle's relational query API, which we will use later. Without it, you can still run basic queries, but you lose the ability to do eager-loaded joins with the `db.query` syntax.

### Why $lib/server/?

SvelteKit enforces a critical security boundary: any module inside `$lib/server/` can only be imported by server-side code (`+page.server.ts`, `+server.ts`, hooks). If a component or `+page.ts` file tries to import from `$lib/server/`, SvelteKit throws a build error.

This is not just a convention — it is a compile-time guarantee that your database credentials, connection strings, and query logic never get bundled into the JavaScript that ships to the browser. Your database client lives in `$lib/server/` because leaking it to the client would be a security catastrophe.

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

## Push vs Generate+Migrate: Two Workflows

Drizzle Kit gives you two different workflows for applying schema changes, and understanding when to use each is important.

### `drizzle-kit push` — Development Workflow

```bash
npx drizzle-kit push
```

This reads your schema file, compares it to the current database, and applies changes directly. No migration files are created. It is fast, simple, and perfect for development when you are iterating on your schema and do not care about data preservation.

Think of `push` as "make the database match my schema, right now." If you rename a column, it might drop and recreate it, losing any data in that column. That is fine in development with test data. It would be catastrophic in production.

### `drizzle-kit generate` + `migrate` — Production Workflow

```bash
npx drizzle-kit generate
```

This creates a SQL migration file in a `drizzle/` directory containing the exact SQL to transform the database from its current schema to the new one. You review these files, commit them to version control, and apply them in your application startup:

```typescript
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import db from '$lib/server/db';

migrate(db, { migrationsFolder: './drizzle' });
```

Migration files are reviewable in pull requests, apply in order across all environments, and never silently drop data. **Rule of thumb:** Use `push` during development. Switch to `generate`/`migrate` once you deploy and have real user data.

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

Now for the part you have been waiting for — actually querying the database. Drizzle provides methods that mirror SQL's core operations, with full TypeScript type inference.

All four operations use the `eq`, `desc`, and other helpers imported from `drizzle-orm`:

```typescript
import db from '$lib/server/db';
import { users, posts } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

// SELECT — read data
const allUsers = db.select().from(users).all();
// Type: { id: number; username: string; email: string; displayName: string; createdAt: string | null }[]

const user = db.select().from(users).where(eq(users.id, 1)).get();
// Type: { ... } | undefined  (.get() returns one row or undefined)

const recentPosts = db.select().from(posts).orderBy(desc(posts.createdAt)).limit(10).all();

// INSERT — create data
const newPost = db.insert(posts).values({
  title: 'My First Post',
  slug: 'my-first-post',
  content: 'Hello, world!',
  userId: 1
}).returning().get();
// .returning() gives back the inserted row including auto-generated id and createdAt

// UPDATE — modify data
db.update(posts)
  .set({ title: 'Updated Title', updatedAt: new Date().toISOString() })
  .where(eq(posts.id, 1))
  .run();

// DELETE — remove data
db.delete(posts).where(eq(posts.id, 1)).run();
```

Notice the return types — Drizzle infers them directly from your schema. If you select from `users`, you get back objects with exactly the columns defined in the `users` table. The `.returning()` method tells the database to return the affected row, including auto-generated values like `id` and `createdAt`. Without it, you just get metadata about how many rows were affected.

## Type Inference: Your Schema Drives Everything

One of Drizzle's best features is that your schema definitions produce TypeScript types automatically. You do not need to define separate interfaces:

```typescript
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users } from '$lib/server/db/schema';

// The type of a row when reading from the database
type User = InferSelectModel<typeof users>;
// { id: number; username: string; email: string; displayName: string; createdAt: string | null }

// The type of data when inserting — id and createdAt are optional
type NewUser = InferInsertModel<typeof users>;
// { id?: number; username: string; email: string; displayName: string; createdAt?: string | null }
```

Notice the difference: `InferSelectModel` makes all columns required (they always exist when reading), while `InferInsertModel` makes columns with defaults optional (you do not need to provide `id` or `createdAt` when inserting). This distinction prevents entire categories of bugs.

## Real Example: Using Drizzle in a Load Function

Using the schema and database client defined above, here is a load function that queries notes and a page that displays them:

```typescript
// src/routes/notes/+page.server.ts
import type { PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import db from '$lib/server/db';
import { notes } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const allNotes = db.select().from(notes).orderBy(desc(notes.createdAt)).all();
  return { notes: allNotes };
};

export const actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    if (!title?.trim()) return fail(400, { error: 'Title is required' });

    db.insert(notes).values({ title: title.trim(), content: '' }).run();
    return { success: true };
  },
  delete: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    if (isNaN(id)) return fail(400, { error: 'Invalid ID' });
    db.delete(notes).where(eq(notes.id, id)).run();
  }
};
```

```svelte
<!-- src/routes/notes/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>My Notes</h1>
<form method="POST" action="?/create">
  <input name="title" placeholder="Note title" required />
  <button type="submit">Add</button>
</form>

{#each data.notes as note (note.id)}
  <div>
    <span>{note.title}</span>
    <form method="POST" action="?/delete" style="display:inline">
      <input type="hidden" name="id" value={note.id} />
      <button type="submit">Delete</button>
    </form>
  </div>
{/each}
```

Run `npm run db:push` to create the tables, start your dev server, and you have a working notes app with persistent storage and full type safety.

## Try It

Set up Drizzle in your SvelteKit project following the steps above. Define a `todos` table with `id` (primary key, auto-increment), `title` (text, required), `completed` (integer with boolean mode, default false), and `createdAt` (text with timestamp default). Push the schema. Then build a page that:

1. Loads all todos ordered by creation date
2. Has a form to add new todos with server-side validation
3. Has a toggle action that flips the `completed` status
4. Has a delete action that removes a todo by ID

Use `InferSelectModel` to create a `Todo` type and use it in your component.

## Key Takeaways

- Install `drizzle-orm` and your database driver for runtime, `drizzle-kit` for development tooling
- Define schemas with `sqliteTable`, `text()`, `integer()`, and constraint methods — the schema is your single source of truth
- Use `drizzle-kit push` during development for quick iteration, `generate` + `migrate` in production for safe, reviewable changes
- Place all database code in `$lib/server/` — SvelteKit enforces this boundary at build time to prevent database code from reaching the browser
- The `db` instance provides `.select()`, `.insert()`, `.update()`, and `.delete()` — all with full type inference from your schema
- Use `InferSelectModel` and `InferInsertModel` to derive TypeScript types from your schema without manual type definitions
- `.returning()` gets back the row after an insert, update, or delete — essential for getting auto-generated values like IDs
- Drizzle's SQL-like API means your TypeScript queries closely mirror the SQL they produce — understanding SQL helps you write better Drizzle code
