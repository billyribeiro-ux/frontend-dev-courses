# Setting Up Drizzle ORM

Writing raw SQL strings works, but it is error-prone and gives you no type safety. A typo in a column name, a missing WHERE clause, a wrong data type — all of these become runtime errors that slip through code review and surface in production. **Drizzle ORM** lets you write database queries in TypeScript with full autocompletion and compile-time type checking. It generates the SQL for you while staying close to the SQL you already know.

But Drizzle is more than just "SQL but typed." It occupies a unique position in the ORM landscape: it is a **query builder that provides ORM-level convenience without ORM-level abstraction**. Understanding this distinction — and how Drizzle's architecture differs from tools like Prisma, TypeORM, and Knex — will help you make better decisions about schema design, query patterns, and performance.

This lesson walks through the complete setup: choosing and installing the right driver, designing schemas with real-world constraints and relations, configuring the database client for relational queries, understanding the push-versus-migrate workflow in depth, and writing type-safe queries that take full advantage of Drizzle's inference system. By the end, you will have a production-grade database layer integrated into your SvelteKit application.

## Drizzle's Architecture: Query Builder vs ORM

Before writing any code, it is worth understanding what Drizzle actually is — because it markets itself as an "ORM" but behaves differently from what most developers expect when they hear that word.

**Traditional ORMs** like TypeORM, Sequelize, or Hibernate map database tables to classes. You define entity classes, and the ORM generates SQL behind a thick abstraction layer. The problem is that this abstraction hides performance-critical decisions. When you write `user.posts`, the ORM might execute one query or ten queries depending on lazy-loading settings you forgot to configure. This is the classic "N+1 problem" that has plagued ORMs for decades.

**Query builders** like Knex give you programmatic SQL construction without the class mapping. You get composable query fragments but no type safety — Knex returns `any` unless you manually assert types everywhere.

**Drizzle sits between these two worlds.** It has:
- A **SQL-like query builder** (`db.select().from(users).where(...)`) that maps 1:1 to the SQL it generates — no hidden queries, no lazy loading, no magic
- A **relational query API** (`db.query.users.findMany({ with: { posts: true } })`) that provides ORM-style eager loading, but generates a single SQL query with JOINs, not multiple round-trips
- **Full type inference** from your schema — no separate type definitions, no runtime reflection, no decorators

The mental model: Drizzle is a type-safe SQL builder that happens to also have a convenience layer for common relational patterns. If you know SQL, you already know 80% of Drizzle.

### Why This Matters in Practice

I have shipped three SvelteKit applications with Drizzle. In every case, the "query builder that looks like SQL" aspect was what saved us. When a complex query was slow, I could read the Drizzle code and immediately understand what SQL it would produce. With Prisma (which I used on an earlier project), debugging slow queries meant adding logging middleware, reading generated SQL I didn't write, and tracing back through the abstraction to find the problem. Drizzle's transparency is its killer feature.

## Installing Drizzle

Drizzle requires three packages, each with a distinct role:

```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

Here is what each one does:

- **`drizzle-orm`** — the runtime query builder. This is what your application code imports to run queries like `db.select().from(users)`. It ships zero dependencies and weighs roughly 35KB minified.
- **`better-sqlite3`** — the database driver that actually talks to SQLite. Drizzle is driver-agnostic — if you switch to PostgreSQL later, you swap this for `postgres` or `pg` and change your Drizzle dialect.
- **`drizzle-kit`** — a CLI dev tool for managing your schema. It generates migrations, pushes schema changes, and provides a visual database browser. This is a dev dependency because it is never used at runtime.
- **`@types/better-sqlite3`** — TypeScript type definitions for the SQLite driver.

### Choosing a Database Driver

Drizzle supports multiple databases and multiple drivers for each. The choice depends on your deployment target and performance needs:

**SQLite drivers:**
- **`better-sqlite3`** — synchronous, fast, no async overhead. Perfect for SvelteKit projects using Node adapter. This is what you want for most server-rendered applications.
- **`@libsql/client`** — for Turso/LibSQL (SQLite at the edge). Use this when deploying to edge runtimes that cannot run native Node modules.
- **`bun:sqlite`** — built-in SQLite for Bun runtime. Zero-install if you are already using Bun.

**PostgreSQL drivers:**
- **`postgres`** (postgres.js) — fastest PostgreSQL driver for Node. Uses the extended query protocol for automatic parameterization.
- **`pg`** (node-postgres) — the classic, battle-tested PostgreSQL driver. Heavier but more widely supported.
- **`@neondatabase/serverless`** — for Neon serverless Postgres. Communicates over WebSocket, works in edge runtimes.

**MySQL drivers:**
- **`mysql2`** — standard MySQL/MariaDB driver for Node.
- **`@planetscale/database`** — PlanetScale serverless driver for edge deployments.

The driver choice affects your import path for Drizzle:

```typescript
// SQLite with better-sqlite3
import { drizzle } from 'drizzle-orm/better-sqlite3';

// PostgreSQL with postgres.js
import { drizzle } from 'drizzle-orm/postgres-js';

// PostgreSQL with node-postgres
import { drizzle } from 'drizzle-orm/node-postgres';

// MySQL with mysql2
import { drizzle } from 'drizzle-orm/mysql2';
```

The schema definition module also changes: `drizzle-orm/sqlite-core`, `drizzle-orm/pg-core`, or `drizzle-orm/mysql-core`. Once you pick a dialect, the rest of the API is the same. This lesson uses SQLite with `better-sqlite3` because it requires zero external services — everything runs locally in a single file.

## Defining a Schema

Your schema is the **single source of truth** for your data model. It defines what tables exist, what columns each table has, what types those columns hold, and what constraints enforce data integrity. Drizzle generates both the SQL DDL (CREATE TABLE statements) and the TypeScript types from this one definition.

Create a schema file inside `$lib/server` — this is important, and we will explain why shortly:

```typescript
// src/lib/server/db/schema.ts
import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ──────────────────────────────────────────────
// Users table
// ──────────────────────────────────────────────
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').unique().notNull(),
  email: text('email').unique().notNull(),
  displayName: text('display_name').notNull(),
  role: text('role', { enum: ['admin', 'editor', 'viewer'] }).default('viewer').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

// ──────────────────────────────────────────────
// Posts table
// ──────────────────────────────────────────────
export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').unique().notNull(),
  content: text('content').notNull(),
  excerpt: text('excerpt'),
  published: integer('published', { mode: 'boolean' }).default(false),
  viewCount: integer('view_count').default(0),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  categoryId: integer('category_id')
    .references(() => categories.id, { onDelete: 'set null' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').default('CURRENT_TIMESTAMP')
});

// ──────────────────────────────────────────────
// Categories table
// ──────────────────────────────────────────────
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0)
});

// ──────────────────────────────────────────────
// Comments table
// ──────────────────────────────────────────────
export const comments = sqliteTable('comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  body: text('body').notNull(),
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  parentId: integer('parent_id')
    .references(() => comments.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
});

// ──────────────────────────────────────────────
// Tags (many-to-many through post_tags)
// ──────────────────────────────────────────────
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').unique().notNull(),
  slug: text('slug').unique().notNull()
});

export const postTags = sqliteTable('post_tags', {
  postId: integer('post_id')
    .notNull()
    .references(() => posts.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' })
});
```

Several things to notice about this expanded schema:

### Column Types in SQLite

SQLite has a flexible type system, but Drizzle gives you typed column builders:

- **`text('name')`** — stores strings. Use for anything textual: names, emails, URLs, JSON blobs, ISO date strings.
- **`integer('name')`** — stores whole numbers. Also used for booleans (`{ mode: 'boolean' }`), timestamps (`{ mode: 'timestamp' }`), and foreign keys.
- **`real('name')`** — stores floating-point numbers. Use for prices, coordinates, percentages.
- **`blob('name')`** — stores binary data. Use for files, images, or serialized binary formats.

For PostgreSQL, the column types are far richer: `varchar`, `char`, `text`, `serial`, `bigserial`, `integer`, `smallint`, `bigint`, `boolean`, `timestamp`, `timestamptz`, `date`, `time`, `json`, `jsonb`, `uuid`, `inet`, `cidr`, `macaddr`, arrays, enums, and more. The SQLite column types will cover your needs for local development and small-to-medium production apps.

### Column Names vs Property Names

The first argument to `text('display_name')` is the actual column name in the database (snake_case, as is SQL convention). The TypeScript property name `displayName` is what you use in your code (camelCase, as is JavaScript convention). Drizzle handles the mapping automatically. This matters because SQL conventions and JavaScript conventions differ, and trying to force one into the other creates friction.

### Foreign Keys and Referential Actions

Foreign keys use arrow functions: `.references(() => users.id)`. The callback avoids circular reference issues — `users` does not need to be defined before `posts` in the file. But notice the second argument:

```typescript
.references(() => users.id, { onDelete: 'cascade' })
```

The `onDelete` option tells the database what to do when the referenced row is deleted:
- **`cascade`** — delete this row too. If a user is deleted, delete all their posts.
- **`set null`** — set this column to NULL. If a category is deleted, posts keep existing but lose their category.
- **`restrict`** — prevent the deletion. You cannot delete a user who has posts.
- **`no action`** — similar to restrict but checked at transaction commit time.

Choosing the wrong referential action is a production mistake I have made more than once. On one project, we used `cascade` on a user-to-orders relationship. When an admin accidentally deleted a test user account, it cascaded through orders, order items, payment records, and shipping labels. Hundreds of rows disappeared. The fix was `restrict` on critical business data and `cascade` only on truly dependent data like comments or notifications.

### Enum Columns in SQLite

SQLite has no native ENUM type, but Drizzle's `text` column accepts an `enum` option:

```typescript
role: text('role', { enum: ['admin', 'editor', 'viewer'] }).default('viewer').notNull()
```

This does not create a database-level constraint in SQLite — it is purely a TypeScript-level restriction. The generated type will be `'admin' | 'editor' | 'viewer'` instead of `string`, which gives you compile-time safety. In PostgreSQL, Drizzle can create actual database enums that enforce the constraint at the storage level too.

### Boolean Mode

SQLite has no native boolean type, so booleans are stored as 0 and 1. The `mode: 'boolean'` option tells Drizzle to convert these to `true`/`false` in your TypeScript code:

```typescript
published: integer('published', { mode: 'boolean' }).default(false)
```

Without `mode: 'boolean'`, you would get `0 | 1` in TypeScript, which is correct but annoying to work with in template conditionals.

### Self-Referencing Foreign Keys

The `comments` table demonstrates a self-referencing foreign key — `parentId` references `comments.id`. This is the standard pattern for threaded comments, nested categories, or any tree structure stored in a relational table.

### Many-to-Many Join Tables

The `postTags` table is a join table for the many-to-many relationship between posts and tags. It has no `id` column of its own — its identity is the combination of `postId` and `tagId`. In production, you would also add a composite primary key or unique index, which we cover in the indexes section below.

## Defining Relations for Relational Queries

Foreign key constraints tell the database about relationships, but Drizzle needs a separate `relations` definition to power its relational query API (`db.query`). This is a Drizzle-specific concept — think of it as telling the query builder "how to join these tables" so you can use convenient eager-loading syntax:

```typescript
// src/lib/server/db/schema.ts (continued)
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
  comments: many(comments)
}));

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id]
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id]
  }),
  comments: many(comments),
  postTags: many(postTags)
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  posts: many(posts)
}));

export const commentsRelations = relations(comments, ({ one, many }) => ({
  post: one(posts, {
    fields: [comments.postId],
    references: [posts.id]
  }),
  author: one(users, {
    fields: [comments.userId],
    references: [users.id]
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: 'commentReplies'
  }),
  replies: many(comments, { relationName: 'commentReplies' })
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  postTags: many(postTags)
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, {
    fields: [postTags.postId],
    references: [posts.id]
  }),
  tag: one(tags, {
    fields: [postTags.tagId],
    references: [tags.id]
  })
}));
```

Key points about relations:

**Relations are not database constraints.** They exist only in your TypeScript code for the relational query builder. The actual foreign key constraints live on the columns (`.references()`). You need both: constraints for database integrity, relations for query convenience.

**`one()` requires `fields` and `references`.** This tells Drizzle which columns to use for the JOIN. The `fields` array contains columns from the current table; `references` contains columns from the target table.

**`many()` is the inverse.** A `one()` on posts pointing to users needs a corresponding `many()` on users pointing to posts. Without both sides, relational queries will not work.

**Self-referencing relations need `relationName`.** When a table has two relations pointing to itself (comments having both a `parent` and `replies`), you must disambiguate with a `relationName` string.

## Adding Indexes

For small datasets, every query is fast. For production datasets with thousands or millions of rows, indexes are the difference between 2ms and 2000ms response times:

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  slug: text('slug').unique().notNull(),
  content: text('content').notNull(),
  published: integer('published', { mode: 'boolean' }).default(false),
  userId: integer('user_id').notNull().references(() => users.id),
  createdAt: text('created_at').default('CURRENT_TIMESTAMP')
}, (table) => [
  index('idx_posts_user_id').on(table.userId),
  index('idx_posts_published_created').on(table.published, table.createdAt),
  uniqueIndex('idx_posts_slug').on(table.slug)
]);

export const postTags = sqliteTable('post_tags', {
  postId: integer('post_id').notNull().references(() => posts.id),
  tagId: integer('tag_id').notNull().references(() => tags.id)
}, (table) => [
  uniqueIndex('idx_post_tags_unique').on(table.postId, table.tagId)
]);
```

The third argument to `sqliteTable` is a function that receives the table and returns an array of indexes. Index naming convention: `idx_tablename_columns`.

**Index the columns you filter and sort by.** If you frequently query `WHERE user_id = ? ORDER BY created_at DESC`, create a composite index on `(user_id, created_at)`. The database can satisfy the entire query from the index without scanning the table.

**Unique indexes enforce uniqueness at the database level** — even if your application code has a bug that tries to insert a duplicate, the database will reject it. The `postTags` composite unique index prevents the same tag from being added to the same post twice.

## Creating the Database Client

The database client is the object your application uses to run queries. Create it in `$lib/server/db/`:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';

// Create the SQLite database connection
const sqlite = new Database('local.db');

// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

// Enable foreign key enforcement (off by default in SQLite!)
sqlite.pragma('foreign_keys = ON');

// Create the Drizzle client with schema for relational queries
const db = drizzle(sqlite, { schema });

export default db;
```

Several important details here:

**Passing `schema` to `drizzle()` enables relational queries.** Without it, you can still use `db.select().from(users)`, but you lose `db.query.users.findMany({ with: { posts: true } })`. Always pass the schema unless you have a reason not to.

**WAL mode is essential for SvelteKit.** By default, SQLite uses rollback journaling, which locks the entire database during writes. WAL (Write-Ahead Logging) allows concurrent reads during writes — critical when your SvelteKit server handles multiple requests simultaneously. Without WAL, a slow write blocks all reads, causing timeouts under load.

**SQLite disables foreign keys by default.** This is a surprise to most developers. Without `foreign_keys = ON`, your `.references()` constraints are decorative — the database will happily let you insert orphaned rows. Always enable this pragma.

### Environment-Based Configuration

In production, you will want to read the database path from an environment variable:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const DB_PATH = env.DATABASE_URL || 'local.db';
const sqlite = new Database(DB_PATH);

sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

export default db;
```

Using `$env/dynamic/private` ensures the environment variable is read at runtime, not baked in at build time. This is important for deployments where the database path differs between environments.

### Why $lib/server/?

SvelteKit enforces a critical security boundary: any module inside `$lib/server/` can only be imported by server-side code (`+page.server.ts`, `+server.ts`, hooks). If a component or `+page.ts` file tries to import from `$lib/server/`, SvelteKit throws a build error.

This is not just a convention — it is a compile-time guarantee that your database credentials, connection strings, and query logic never get bundled into the JavaScript that ships to the browser. Your database client lives in `$lib/server/` because leaking it to the client would be a security catastrophe.

```typescript
// WRONG: This file can be imported by client code!
// src/lib/db/index.ts       <-- NO! Accessible from components!

// CORRECT: Only server code can import this
// src/lib/server/db/index.ts <-- YES! SvelteKit enforces the boundary
```

I once reviewed a PR where someone put the database client in `$lib/utils/db.ts`. The app worked fine in development. In production, the Vite bundler included the database module in the client bundle, which crashed the browser trying to load `better-sqlite3` (a native Node module). The error was cryptic. Moving it to `$lib/server/` fixed it instantly — and would have prevented the mistake entirely if done from the start.

## Configuring Drizzle Kit

Create a configuration file at the project root that tells Drizzle Kit where to find your schema and database:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/lib/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: './local.db'
  },
  // Print the SQL that will be executed (useful for debugging)
  verbose: true,
  // Ask for confirmation before running destructive operations
  strict: true
});
```

Configuration fields explained:
- **`dialect`** — which database engine: `'sqlite'`, `'postgresql'`, or `'mysql'`.
- **`schema`** — path to your schema file(s). Can be a glob: `'./src/lib/server/db/schema/*.ts'`.
- **`out`** — directory for generated migration files.
- **`dbCredentials`** — connection info. For SQLite, just the file path. For PostgreSQL, a connection string.
- **`verbose`** — prints the SQL Drizzle Kit will execute. Invaluable for understanding what changes are being made.
- **`strict`** — prompts for confirmation before destructive operations like dropping columns.

## Push vs Generate+Migrate: Two Workflows in Depth

Drizzle Kit gives you two different workflows for applying schema changes. Choosing the wrong one at the wrong time causes real pain.

### `drizzle-kit push` — Development Workflow

```bash
npx drizzle-kit push
```

This reads your schema file, compares it to the current database, and applies changes directly. No migration files are created. It is fast, simple, and perfect for development when you are iterating on your schema and do not care about data preservation.

Think of `push` as "make the database match my schema, right now." Under the hood, Drizzle Kit:

1. Reads your TypeScript schema and generates the target DDL
2. Inspects the current database schema using SQLite's `sqlite_master` table (or PostgreSQL's `information_schema`)
3. Computes a diff between the two
4. Generates and executes the necessary ALTER TABLE, CREATE TABLE, or DROP statements

The problem: if you rename a column, Drizzle Kit cannot tell the difference between "column `name` was renamed to `displayName`" and "column `name` was deleted and a new column `displayName` was added." It picks the second interpretation, which means any data in the old column is lost.

**When to use push:**
- Active development with test data you do not mind losing
- Prototyping a new feature before committing to a schema
- After cloning a project fresh and needing to set up a local database
- In CI for running integration tests against a fresh database

### `drizzle-kit generate` + `drizzle-kit migrate` — Production Workflow

```bash
# Step 1: Generate a migration file
npx drizzle-kit generate

# Step 2: Review the generated file in drizzle/ directory

# Step 3: Apply the migration
npx drizzle-kit migrate
```

The `generate` command creates a timestamped SQL migration file in the `drizzle/` directory:

```
drizzle/
  0000_init.sql
  0001_add_categories.sql
  0002_add_view_count_to_posts.sql
  meta/
    _journal.json
    0000_snapshot.json
    0001_snapshot.json
    0002_snapshot.json
```

Each migration file contains the exact SQL to transform the database from one schema version to the next. The `meta/` directory contains snapshots of the schema at each point, which Drizzle Kit uses to compute future diffs.

You can also apply migrations programmatically at application startup:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import Database from 'better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('local.db');
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

const db = drizzle(sqlite, { schema });

// Run pending migrations on startup
migrate(db, { migrationsFolder: './drizzle' });

export default db;
```

Migration files are reviewable in pull requests, apply in order across all environments, and never silently drop data.

**When to use generate+migrate:**
- Once you deploy and have real user data
- When working on a team where schema changes need code review
- When you need to write custom data transformations (renaming columns, backfilling data)
- In any environment where data loss is unacceptable

### Custom Migration Logic

Sometimes the generated SQL is not enough. You may need to backfill data, transform existing values, or run a complex multi-step migration. Drizzle Kit's generated migration files are plain SQL — you can edit them before applying:

```sql
-- drizzle/0003_add_excerpt_to_posts.sql

-- Add the new column
ALTER TABLE posts ADD COLUMN excerpt TEXT;

-- Backfill: extract first 200 characters of content as excerpt
UPDATE posts SET excerpt = SUBSTR(content, 1, 200) WHERE excerpt IS NULL;
```

**Rule of thumb:** Use `push` during development. Switch to `generate`/`migrate` once you deploy and have real user data. Never use `push` in production.

## Adding Helper Scripts

Add these scripts to your `package.json` to save typing:

```json
{
  "scripts": {
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx src/lib/server/db/seed.ts"
  }
}
```

`drizzle-kit studio` opens a visual database browser at `https://local.drizzle.studio` where you can view, edit, and query your data directly. It is invaluable during development for verifying that your queries are doing what you think they are doing.

The `db:seed` script runs a seed file to populate your database with test data — we will cover that after CRUD operations.

## Type Inference: Your Schema Drives Everything

One of Drizzle's best features is that your schema definitions produce TypeScript types automatically. You do not need to define separate interfaces:

```typescript
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { users, posts, comments } from '$lib/server/db/schema';

// The type of a row when reading from the database
type User = InferSelectModel<typeof users>;
// { id: number; username: string; email: string; displayName: string;
//   role: 'admin' | 'editor' | 'viewer'; avatarUrl: string | null;
//   createdAt: string | null; updatedAt: string | null }

// The type of data when inserting — columns with defaults become optional
type NewUser = InferInsertModel<typeof users>;
// { id?: number; username: string; email: string; displayName: string;
//   role?: 'admin' | 'editor' | 'viewer'; avatarUrl?: string | null;
//   createdAt?: string | null; updatedAt?: string | null }

type Post = InferSelectModel<typeof posts>;
type NewPost = InferInsertModel<typeof posts>;
type Comment = InferSelectModel<typeof comments>;
type NewComment = InferInsertModel<typeof comments>;
```

Notice the critical difference: `InferSelectModel` makes all columns required (they always exist when reading), while `InferInsertModel` makes columns with defaults optional (you do not need to provide `id` or `createdAt` when inserting). The `role` field is required in select (always has a value) but optional in insert (defaults to `'viewer'`).

This distinction prevents entire categories of bugs. Without it, you either make everything optional (and check for `undefined` everywhere) or make everything required (and provide unnecessary values on insert).

### Exporting Types from Your Schema File

A clean pattern is to export derived types alongside your table definitions:

```typescript
// At the bottom of src/lib/server/db/schema.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Post = InferSelectModel<typeof posts>;
export type NewPost = InferInsertModel<typeof posts>;
export type Comment = InferSelectModel<typeof comments>;
export type NewComment = InferInsertModel<typeof comments>;
export type Category = InferSelectModel<typeof categories>;
export type Tag = InferSelectModel<typeof tags>;
```

Now components and load functions import types from the same file as the schema. Single source of truth, zero drift.

## Basic CRUD with Drizzle

Now for the part you have been waiting for — actually querying the database. Drizzle provides methods that mirror SQL's core operations, with full TypeScript type inference.

### SELECT — Reading Data

```typescript
import db from '$lib/server/db';
import { users, posts, comments } from '$lib/server/db/schema';
import { eq, ne, gt, gte, lt, lte, like, and, or, desc, asc, count, sql } from 'drizzle-orm';

// Get all users
const allUsers = db.select().from(users).all();
// Type: User[]

// Get one user by ID (.get() returns one row or undefined)
const user = db.select().from(users).where(eq(users.id, 1)).get();
// Type: User | undefined

// Multiple conditions with and()
const adminUsers = db.select().from(users)
  .where(and(
    eq(users.role, 'admin'),
    like(users.email, '%@company.com')
  ))
  .all();

// OR conditions
const recentOrPopular = db.select().from(posts)
  .where(or(
    gt(posts.viewCount, 1000),
    gte(posts.createdAt, '2024-01-01')
  ))
  .all();

// Select specific columns (partial select)
const userPreviews = db.select({
  id: users.id,
  name: users.displayName,
  email: users.email
}).from(users).all();
// Type: { id: number; name: string; email: string }[]
// Note: property names come from the keys you provide, not the column names

// Order and limit
const recentPosts = db.select().from(posts)
  .orderBy(desc(posts.createdAt))
  .limit(10)
  .offset(20)  // pagination: skip first 20 rows
  .all();

// Count rows
const [{ total }] = db.select({ total: count() }).from(posts)
  .where(eq(posts.published, true))
  .all();
// total: number
```

### Chaining `.where()` Conditions

Drizzle's `.where()` accepts operator functions from `drizzle-orm`. The key operators:

| Operator | SQL | Example |
|----------|-----|---------|
| `eq(col, val)` | `=` | `eq(users.id, 1)` |
| `ne(col, val)` | `<>` | `ne(users.role, 'admin')` |
| `gt(col, val)` | `>` | `gt(posts.viewCount, 100)` |
| `gte(col, val)` | `>=` | `gte(posts.createdAt, date)` |
| `lt(col, val)` | `<` | `lt(posts.viewCount, 10)` |
| `lte(col, val)` | `<=` | `lte(users.createdAt, cutoff)` |
| `like(col, pattern)` | `LIKE` | `like(users.email, '%@gmail.com')` |
| `isNull(col)` | `IS NULL` | `isNull(posts.categoryId)` |
| `isNotNull(col)` | `IS NOT NULL` | `isNotNull(users.avatarUrl)` |
| `inArray(col, vals)` | `IN` | `inArray(users.role, ['admin', 'editor'])` |
| `and(...conditions)` | `AND` | `and(eq(...), gt(...))` |
| `or(...conditions)` | `OR` | `or(eq(...), eq(...))` |

### INSERT — Creating Data

```typescript
// Insert one row
const newUser = db.insert(users).values({
  username: 'alice',
  email: 'alice@example.com',
  displayName: 'Alice Chen'
}).returning().get();
// Returns the full row including auto-generated id and createdAt

// Insert multiple rows
db.insert(posts).values([
  { title: 'First Post', slug: 'first-post', content: 'Hello!', userId: newUser.id },
  { title: 'Second Post', slug: 'second-post', content: 'World!', userId: newUser.id }
]).run();

// Insert with conflict handling (upsert)
db.insert(users)
  .values({ username: 'alice', email: 'alice@new.com', displayName: 'Alice' })
  .onConflictDoUpdate({
    target: users.username,
    set: { email: 'alice@new.com' }
  })
  .run();

// Insert and ignore conflicts
db.insert(tags)
  .values({ name: 'svelte', slug: 'svelte' })
  .onConflictDoNothing()
  .run();
```

The `.returning()` method tells the database to return the affected row, including auto-generated values like `id` and `createdAt`. Without it, you just get metadata about how many rows were affected. **Always use `.returning()` when you need the inserted row.**

### UPDATE — Modifying Data

```typescript
// Update a single row
db.update(posts)
  .set({
    title: 'Updated Title',
    updatedAt: new Date().toISOString()
  })
  .where(eq(posts.id, 1))
  .run();

// Update with returning
const updated = db.update(posts)
  .set({ published: true })
  .where(eq(posts.id, 1))
  .returning()
  .get();

// Increment a counter
db.update(posts)
  .set({ viewCount: sql`${posts.viewCount} + 1` })
  .where(eq(posts.id, 1))
  .run();
```

The `sql` template tag lets you write raw SQL expressions when Drizzle's builder does not cover your use case. The `${posts.viewCount}` is safely interpolated as a column reference, not a string literal.

### DELETE — Removing Data

```typescript
// Delete one row
db.delete(posts).where(eq(posts.id, 1)).run();

// Delete with conditions
db.delete(comments)
  .where(and(
    eq(comments.postId, 1),
    lt(comments.createdAt, '2024-01-01')
  ))
  .run();

// Delete with returning (get the deleted row back)
const deleted = db.delete(posts)
  .where(eq(posts.id, 1))
  .returning()
  .get();
```

**Never forget the `.where()` clause on UPDATE and DELETE.** Drizzle will not stop you from running `db.delete(posts).run()` — that deletes every row in the table. In one production incident I witnessed, a missing `.where()` on an UPDATE set every user's `role` to `'viewer'`, including all admins. The fix took 20 minutes; the trust repair took months.

## Relational Queries: The `db.query` API

When you pass `schema` to the Drizzle constructor, you unlock the relational query API — a more declarative way to fetch related data:

```typescript
// Find all posts with their author and comments
const postsWithRelations = db.query.posts.findMany({
  where: eq(posts.published, true),
  orderBy: [desc(posts.createdAt)],
  limit: 10,
  with: {
    author: true,       // includes the full user object
    comments: {
      with: {
        author: true    // nested: comment authors too
      },
      orderBy: [desc(comments.createdAt)],
      limit: 5
    }
  }
});

// Find one post by slug with all relations
const post = db.query.posts.findFirst({
  where: eq(posts.slug, 'my-first-post'),
  with: {
    author: {
      columns: { id: true, displayName: true, avatarUrl: true }
    },
    comments: {
      with: { author: true }
    },
    postTags: {
      with: { tag: true }
    }
  }
});

// Select specific columns
const postPreviews = db.query.posts.findMany({
  columns: {
    id: true,
    title: true,
    slug: true,
    excerpt: true,
    createdAt: true
  },
  with: {
    author: {
      columns: { displayName: true }
    }
  },
  where: eq(posts.published, true),
  orderBy: [desc(posts.createdAt)]
});
```

The relational query API generates a single SQL query with JOINs and subqueries — not multiple round trips. It is the best of both worlds: ORM-level convenience with query-builder-level performance.

## Seeding the Database

A seed file populates your database with test data for development:

```typescript
// src/lib/server/db/seed.ts
import db from './index';
import { users, posts, categories, comments, tags, postTags } from './schema';

// Clear existing data (order matters due to foreign keys)
db.delete(postTags).run();
db.delete(comments).run();
db.delete(posts).run();
db.delete(categories).run();
db.delete(tags).run();
db.delete(users).run();

// Seed users
const [alice, bob] = db.insert(users).values([
  { username: 'alice', email: 'alice@example.com', displayName: 'Alice Chen', role: 'admin' },
  { username: 'bob', email: 'bob@example.com', displayName: 'Bob Smith', role: 'editor' }
]).returning().all();

// Seed categories
const [tutorial, opinion] = db.insert(categories).values([
  { name: 'Tutorials', slug: 'tutorials', description: 'Step-by-step guides' },
  { name: 'Opinion', slug: 'opinion', description: 'Hot takes and thoughts' }
]).returning().all();

// Seed tags
const [svelte, typescript, css] = db.insert(tags).values([
  { name: 'Svelte', slug: 'svelte' },
  { name: 'TypeScript', slug: 'typescript' },
  { name: 'CSS', slug: 'css' }
]).returning().all();

// Seed posts
const [post1] = db.insert(posts).values([
  {
    title: 'Getting Started with Svelte 5',
    slug: 'getting-started-svelte-5',
    content: 'Svelte 5 introduces runes, a new way to handle reactivity...',
    excerpt: 'Learn the fundamentals of Svelte 5 runes.',
    published: true,
    userId: alice.id,
    categoryId: tutorial.id
  }
]).returning().all();

// Seed post tags
db.insert(postTags).values([
  { postId: post1.id, tagId: svelte.id },
  { postId: post1.id, tagId: typescript.id }
]).run();

// Seed comments
db.insert(comments).values([
  { body: 'Great tutorial!', postId: post1.id, userId: bob.id },
  { body: 'Thanks for sharing.', postId: post1.id, userId: alice.id }
]).run();

console.log('Database seeded successfully!');
```

Run with `npm run db:seed` after pushing or migrating the schema.

## Real Example: Using Drizzle in a Load Function

Here is a complete load function and form actions for a blog post page:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';
import db from '$lib/server/db';
import { posts, type Post } from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async () => {
  const allPosts = db.query.posts.findMany({
    where: eq(posts.published, true),
    orderBy: [desc(posts.createdAt)],
    columns: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      viewCount: true,
      createdAt: true
    },
    with: {
      author: {
        columns: { displayName: true, avatarUrl: true }
      },
      category: {
        columns: { name: true, slug: true }
      }
    }
  });

  return { posts: allPosts };
};

export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const content = formData.get('content') as string;
    const userId = Number(formData.get('userId'));

    if (!title?.trim()) return fail(400, { error: 'Title is required' });
    if (!content?.trim()) return fail(400, { error: 'Content is required' });
    if (isNaN(userId)) return fail(400, { error: 'Invalid user ID' });

    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    try {
      const newPost = db.insert(posts).values({
        title: title.trim(),
        slug,
        content: content.trim(),
        excerpt: content.trim().substring(0, 200),
        userId
      }).returning().get();

      return { success: true, post: newPost };
    } catch (err) {
      if (err instanceof Error && err.message.includes('UNIQUE constraint failed')) {
        return fail(400, { error: 'A post with this title already exists' });
      }
      return fail(500, { error: 'Failed to create post' });
    }
  },

  delete: async ({ request }) => {
    const id = Number((await request.formData()).get('id'));
    if (isNaN(id)) return fail(400, { error: 'Invalid ID' });
    db.delete(posts).where(eq(posts.id, id)).run();
    return { success: true };
  }
};
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Published Posts</h1>

{#each data.posts as post (post.id)}
  <article>
    <h2><a href="/posts/{post.slug}">{post.title}</a></h2>
    {#if post.excerpt}
      <p>{post.excerpt}</p>
    {/if}
    <footer>
      <span>By {post.author.displayName}</span>
      {#if post.category}
        <span> in {post.category.name}</span>
      {/if}
      <span> | {post.viewCount} views</span>
    </footer>
  </article>
{/each}
```

## Try It

Set up Drizzle in your SvelteKit project following the steps above. Define a complete schema for a "Task Board" application with these tables:

1. **`users`** — id, username (unique), email (unique), displayName, role (enum: admin/member), createdAt
2. **`boards`** — id, name, description, ownerId (references users with cascade), createdAt
3. **`columns`** — id, name, boardId (references boards with cascade), sortOrder, createdAt
4. **`tasks`** — id, title, description, columnId (references columns with cascade), assigneeId (references users with set null), priority (enum: low/medium/high/urgent), completed (boolean), createdAt, updatedAt

Define relations for all tables. Add indexes on foreign key columns and on `tasks.priority`. Push the schema with `npm run db:push`.

Then build a page that:
1. Loads all boards with their owner using the relational query API
2. Has a form to create a new board with server-side validation
3. Handles unique constraint violations gracefully
4. Uses `InferSelectModel` to create a `Board` type and uses it in the component

## Key Takeaways

- **Drizzle is a type-safe query builder, not a traditional ORM** — its SQL-like API means no hidden queries and full transparency over what SQL executes
- Install `drizzle-orm` and your database driver for runtime, `drizzle-kit` for development tooling — the driver choice (`better-sqlite3`, `postgres`, `mysql2`) determines your import paths
- Define schemas with `sqliteTable`, column builders, and constraint chains — the schema is your single source of truth for both SQL DDL and TypeScript types
- **Define relations separately** from foreign keys — constraints enforce integrity at the database level, relations enable the `db.query` relational API
- Always enable `foreign_keys = ON` and `journal_mode = WAL` for SQLite — these are off by default and their absence causes subtle bugs under load
- Use `drizzle-kit push` during development for quick iteration, `generate` + `migrate` in production for safe, reviewable, reversible changes
- Place all database code in `$lib/server/` — SvelteKit enforces this boundary at build time to prevent database code from reaching the browser
- Use `InferSelectModel` and `InferInsertModel` to derive TypeScript types — select types have all columns required, insert types have columns with defaults optional
- Chain `.where()` conditions with `eq`, `and`, `or`, `gt`, `like` and other operators from `drizzle-orm` — they compose naturally and generate parameterized SQL
- The relational query API (`db.query.users.findMany({ with: ... })`) generates efficient JOINs in a single query — pass `schema` to the `drizzle()` constructor to enable it
- **Never omit `.where()` on UPDATE or DELETE** — Drizzle will not stop you from modifying every row in the table
- `.returning()` gets back the row after an insert, update, or delete — essential for getting auto-generated values like IDs and timestamps
