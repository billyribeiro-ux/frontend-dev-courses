# Setting Up Drizzle ORM

Writing raw SQL strings works, but it is error-prone and gives you no type safety. **Drizzle ORM** lets you write database queries in TypeScript with full autocompletion and type checking. It generates the SQL for you while staying close to the SQL you already know.

Drizzle works perfectly with SQLite and SvelteKit. You define your tables as TypeScript schemas, push them to the database, and use a typed client to query data.

## Installing Drizzle

Install Drizzle ORM and its SQLite driver:

```bash
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3
```

- `drizzle-orm` — the query builder and ORM
- `better-sqlite3` — the SQLite driver for Node.js
- `drizzle-kit` — CLI tool for managing your database schema

## Defining a Schema

Create a schema file inside `$lib/server` so it is only available on the server:

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

The `sqliteTable` function defines a table. Each column uses a type function like `text()` or `integer()` with chained constraints.

## Creating the Database Connection

Set up the database client that your application will use:

```typescript
// src/lib/server/db/index.ts
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('local.db');
const db = drizzle(sqlite);

export default db;
```

This creates a SQLite database file called `local.db` in your project root. The `drizzle()` wrapper adds the typed query API on top.

## Configuring Drizzle Kit

Create a configuration file for Drizzle Kit at the project root:

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

## Pushing the Schema to the Database

Use Drizzle Kit to create the tables in your database:

```bash
npx drizzle-kit push
```

This reads your schema file and creates (or updates) the corresponding tables in `local.db`. Run this command whenever you change your schema.

## Adding Helper Scripts

Add convenient scripts to your `package.json`:

```json
{
  "scripts": {
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

`drizzle-kit studio` opens a visual browser for your database where you can view and edit data directly.

## Using the Database in a Load Function

Now query the database from a server load function:

```typescript
// src/routes/bookmarks/+page.server.ts
import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import { bookmarks } from '$lib/server/db/schema';

export const load: PageServerLoad = async () => {
  const allBookmarks = await db.select().from(bookmarks);

  return {
    bookmarks: allBookmarks
  };
};
```

## Try It

Set up Drizzle in your SvelteKit project following the steps above. Define a `notes` table with `id`, `title`, `content`, and `createdAt` columns. Push the schema, then create a load function that queries all notes and displays them on a page.

## Key Takeaways

- Drizzle ORM provides type-safe database queries in TypeScript
- Define schemas with `sqliteTable`, `text()`, `integer()`, and constraint methods
- Place database code in `$lib/server` so it never reaches the browser
- Use `drizzle-kit push` to sync your schema to the database file
- The `db` object provides `.select()`, `.insert()`, `.update()`, and `.delete()` methods
- `drizzle-kit studio` gives you a visual database browser for development
