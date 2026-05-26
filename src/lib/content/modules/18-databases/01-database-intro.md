# Introduction to Databases

So far, your applications lose all their data when the server restarts. Variables live in memory, and memory gets wiped clean on every restart, deployment, and crash. A **database** gives your data permanence. When a user creates an account, writes a post, or saves a bookmark, the database ensures that data survives anything short of a disk failure.

But a database is more than just persistence. It is a system for organizing, querying, and protecting your data with guarantees that ad-hoc file storage cannot provide: concurrent access, transaction safety, indexing for fast lookups, and constraints that enforce data integrity. Choosing the right database — and understanding its trade-offs — is one of the most consequential architectural decisions in any application.

## Relational vs Document Databases

You will hear about many types of databases, but two categories dominate web development:

**Relational databases** (PostgreSQL, SQLite, MySQL) store data in **tables** with strict schemas. Every row in a table has the same columns. Relationships between tables are explicit — a post belongs to a user, a comment belongs to a post. You query them with SQL.

**Document databases** (MongoDB, CouchDB) store data as flexible JSON-like documents. Each document can have a different shape. There are no enforced relationships between collections.

For the vast majority of web applications, **relational databases are the better choice**. Here is why:

- Most application data is inherently relational. Users have posts. Posts have comments. Orders have line items. Relational databases model these connections naturally with foreign keys and joins.
- Schema enforcement catches bugs early. If your code tries to insert a user without an email, the database rejects it immediately — not three weeks later when some other code tries to read that missing field.
- SQL is a powerful, standardized query language that has been refined over 50 years. Complex reporting, aggregation, and filtering queries that take one line of SQL might require dozens of lines of application code with a document database.

Document databases have their place — they shine for truly unstructured data, rapid prototyping where the schema is genuinely unknown, or specific use cases like content management systems with highly variable content types. But if you are building a typical web app with users, posts, comments, or products, start with a relational database.

## SQLite: The Perfect Starting Database

**SQLite** is unique among databases. It is not a separate server you install and configure — it is a library that reads and writes directly to a single file on disk. Your entire database lives in one file, like `app.db`, sitting right in your project directory.

This simplicity is not a weakness. SQLite is used in production by literally billions of devices — every iPhone, every Android phone, every copy of Chrome and Firefox, every macOS installation. It handles more database transactions per day than all other databases combined.

For SvelteKit development, SQLite is ideal:

- **Zero configuration.** No installing a database server, no connection strings, no Docker containers. Create a file and go.
- **No separate process.** Your application and database share the same process. No network latency between your app and your data.
- **Easy to version control the schema.** The database file is local, and your schema definitions live right in your project.
- **Great for small-to-medium apps.** SQLite comfortably handles hundreds of concurrent users and databases up to hundreds of gigabytes.

## PostgreSQL: When You Outgrow SQLite

When your application grows — hundreds of concurrent writes, multiple server instances, need for replication — you will move to **PostgreSQL**. It is the industry standard for production web applications, and for good reason:

- **Concurrent access.** Multiple processes and servers can read and write simultaneously without blocking each other.
- **Replication.** Your data can be copied to standby servers for high availability and disaster recovery.
- **Full-text search.** Built-in support for searching through text content without an external service like Elasticsearch.
- **Advanced types.** JSON columns, arrays, geographic data, and custom types.

The good news: if you use an ORM like Drizzle, switching from SQLite to PostgreSQL mostly means changing your connection configuration and driver. Your query code stays almost identical.

## The ORM Mental Model

Writing raw SQL strings in your TypeScript code works, but it has real problems:

```typescript
// Raw SQL — no type safety, easy to make mistakes
const result = db.prepare('SELECT * FROM users WHERE emial = ?').get(email);
//                                                  ^^^^^ typo! No compiler error.
```

That typo in `emial` will not be caught until runtime. And the return type of `result` is `any` — TypeScript cannot help you because it has no idea what columns the query returns.

An **ORM** (Object-Relational Mapper) bridges the gap between your database tables and your TypeScript code. You define your table structure in TypeScript, and the ORM:

1. Generates the correct SQL for you
2. Provides full autocompletion in your editor
3. Catches column name typos at compile time
4. Infers TypeScript types from your schema

The result is that you write queries in TypeScript instead of SQL, and the compiler catches entire categories of bugs before your code ever runs.

## Why Drizzle ORM

There are several ORMs in the TypeScript ecosystem — Prisma, TypeORM, Kysely, Drizzle. We use **Drizzle** because it hits a sweet spot:

- **SQL-like API.** If you know SQL, Drizzle feels familiar. The query builder mirrors SQL syntax, so you are not learning an entirely new query language.
- **Type-safe from schema to query.** Your TypeScript schema definitions are the single source of truth. Drizzle infers types from them, so `db.select().from(users)` returns properly typed `User[]`.
- **Lightweight.** Drizzle has minimal runtime overhead. It generates SQL and gets out of the way.
- **No code generation step.** Unlike Prisma (which requires running `prisma generate` after schema changes), Drizzle's types come directly from your schema definitions using TypeScript inference.

## Database Schemas: Your Source of Truth

The schema is the contract between your application and your database. It defines what data can exist and what rules it must follow. In a well-designed application, the schema is the **source of truth** for your data model — it determines what types your application code uses, what validations your forms enforce, and what your API endpoints accept.

Here is how you think about schema design: start with the entities in your application (users, posts, comments) and the relationships between them. Each entity becomes a table. Each property becomes a column. Each relationship becomes a foreign key.

## SQL Basics: The Four Core Operations

Before we use an ORM, you should understand the SQL it generates. SQL has four core statements that map to CRUD operations:

### SELECT — Read Data

```sql
-- Get all columns from every row
SELECT * FROM users;

-- Get specific columns
SELECT name, email FROM users;

-- Filter with WHERE
SELECT * FROM users WHERE age > 18;

-- Sort and limit
SELECT * FROM users ORDER BY name ASC LIMIT 10;

-- Join related tables
SELECT posts.title, users.name
FROM posts
JOIN users ON posts.user_id = users.id;
```

### INSERT — Create Data

```sql
-- Insert a single row
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');

-- Insert multiple rows
INSERT INTO users (name, email) VALUES
  ('Bob', 'bob@example.com'),
  ('Charlie', 'charlie@example.com');
```

### UPDATE — Modify Data

```sql
-- Update a specific row
UPDATE users SET email = 'new@example.com' WHERE id = 1;
```

Always include a `WHERE` clause when updating. Without it, **every row in the table gets changed**. This is not a theoretical danger — it is one of the most common catastrophic mistakes in database work.

### DELETE — Remove Data

```sql
-- Delete a specific row
DELETE FROM users WHERE id = 1;
```

Same warning as UPDATE: without `WHERE`, you delete **everything** in the table.

## Creating Tables

Before storing data, you define a table structure:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Notice the **constraints** at work:

- `PRIMARY KEY` uniquely identifies each row. `AUTOINCREMENT` means the database assigns IDs automatically.
- `NOT NULL` prevents empty values — the database rejects inserts that skip required columns.
- `UNIQUE` ensures no two rows share the same value (like email addresses).
- `REFERENCES` creates a foreign key — `user_id REFERENCES users(id)` means this column must contain a valid user ID. The database enforces referential integrity for you.
- `DEFAULT` provides a value when one is not specified.

These constraints are your safety net. They guarantee data integrity at the database level, regardless of bugs in your application code.

## Migrations: Evolving Your Schema Over Time

In development, you might recreate your database from scratch whenever the schema changes. In production, you cannot do that — real users have real data. **Migrations** solve this problem.

A migration is a script that transforms your database schema from one version to the next. Migrations are:

- Tracked in version control alongside your application code
- Applied in order (migration 001, then 002, then 003)
- Irreversible in practice (you write a new migration to undo changes, not rollback)

When you deploy, your migration tool checks which migrations have already been applied and runs any new ones. This ensures every environment — development, staging, production — has the same schema.

With Drizzle, you use `drizzle-kit generate` to create migration files from your schema changes, and `drizzle-kit migrate` to apply them. We will set this up in the next lesson.

## Real Example: Modeling a Blog

Here is how a simple blog maps to a relational schema with users, posts, and comments:

```sql
-- A user writes posts and comments
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- A post belongs to a user
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  published INTEGER DEFAULT 0,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- A comment belongs to a post and a user
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Notice the design decisions: `slug` is `UNIQUE` because every post needs a unique URL-friendly identifier. `published` is an integer used as a boolean (SQLite does not have a native boolean type — `0` is false, `1` is true). Every table has `created_at` for auditing. `posts` has `updated_at` to track edits.

This schema enforces that every post has an author, every comment has both a post and an author, and no two users can share an email or username. The database protects your data integrity even if your application code has bugs.

## Try It

Write SQL statements to create a `books` table with columns for `id` (primary key, auto-increment), `title` (text, required), `author` (text, required), `year` (integer), and `is_read` (integer, default 0). Then write an INSERT to add three books, a SELECT to find all unread books, an UPDATE to mark one book as read, and a DELETE to remove a book by its id. Finally, create a `reviews` table with a foreign key referencing `books(id)`, and write a JOIN query that returns all reviews with their book titles.

## Key Takeaways

- Databases provide permanent storage, concurrent access, and data integrity guarantees
- Relational databases are the right choice for most web applications — data is inherently relational
- SQLite needs no server, stores everything in one file, and is perfect for development and small-to-medium apps
- PostgreSQL is the production standard for concurrent access, replication, and advanced features
- ORMs like Drizzle map tables to TypeScript objects, providing type safety and catching bugs at compile time
- Schema design starts with entities and relationships — each entity is a table, each relationship is a foreign key
- Constraints (NOT NULL, UNIQUE, REFERENCES) enforce data integrity at the database level
- Migrations track schema changes in version control and apply them in order across environments
- SQL has four core operations: SELECT (read), INSERT (create), UPDATE (modify), DELETE (remove)
- Always use WHERE with UPDATE and DELETE — without it, you affect every row in the table
