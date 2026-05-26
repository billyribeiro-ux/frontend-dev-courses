# Introduction to Databases

So far, your applications lose all their data when the server restarts. Variables live in memory, and memory gets wiped clean on every restart, deployment, and crash. A **database** gives your data permanence. When a user creates an account, writes a post, or saves a bookmark, the database ensures that data survives anything short of a disk failure.

But a database is more than just persistence. It is a system for organizing, querying, and protecting your data with guarantees that ad-hoc file storage cannot provide: concurrent access, transaction safety, indexing for fast lookups, and constraints that enforce data integrity. Choosing the right database — and understanding its trade-offs — is one of the most consequential architectural decisions in any application. Get it wrong and you spend months migrating data, rewriting queries, or debugging consistency bugs at 3am.

## Why Not Just Use Files?

You might wonder: why not just write JSON to a file? It works for small projects. But files fall apart the moment your application faces real-world conditions:

**Concurrent access.** Two users submit data at the exact same time. With files, both processes read the file, modify it in memory, and write it back. One write overwrites the other. Data is lost silently. Databases handle this with locking and transactions.

**Querying.** "Find all users who signed up in March and have not verified their email" requires loading every user into memory, parsing them, and filtering. A database does this with a single indexed query in milliseconds.

**Integrity.** Nothing stops you from writing `{ "user_id": 999 }` to a posts file even if user 999 does not exist. A database with foreign key constraints rejects this automatically.

**Crash recovery.** Your process crashes mid-write. The file is now half-written and corrupted. Databases use write-ahead logs (WAL) to guarantee that either the entire write succeeds or none of it does.

**Scale.** A 500MB JSON file takes seconds to parse on every read. A database with indexes retrieves individual records in microseconds regardless of the total data size.

## Relational vs Document vs Graph Databases

You will hear about many types of databases. Three categories dominate modern development:

### Relational Databases (PostgreSQL, SQLite, MySQL)

Relational databases store data in **tables** with strict schemas. Every row in a table has the same columns. Relationships between tables are explicit — a post belongs to a user, a comment belongs to a post. You query them with SQL.

The relational model was formalized by Edgar Codd in 1970, and it has survived every hype cycle since. The reason is simple: most application data is inherently relational. Users have posts. Posts have comments. Orders have line items. Products have categories. These relationships are not accidental — they are the fundamental structure of your business domain.

**When to choose relational:** Almost always. If your data has structure and relationships (and it almost certainly does), start here.

### Document Databases (MongoDB, CouchDB, DynamoDB)

Document databases store data as flexible JSON-like documents. Each document can have a different shape. There are no enforced relationships between collections.

```json
// MongoDB document — no fixed schema
{
  "_id": "user_123",
  "name": "Alice",
  "addresses": [
    { "type": "home", "city": "Portland" },
    { "type": "work", "city": "Seattle" }
  ],
  "preferences": {
    "theme": "dark",
    "notifications": { "email": true, "push": false }
  }
}
```

Document databases shine in specific scenarios: truly unstructured data (CMS content with wildly variable fields), rapid prototyping where the schema is genuinely unknown, or denormalized read models optimized for a single query pattern.

**The MongoDB trap:** In the early 2010s, MongoDB marketed itself as the easy alternative to relational databases. Thousands of teams chose it for applications that were fundamentally relational — e-commerce, social networks, SaaS apps. They ended up reimplementing joins, transactions, and referential integrity in application code, poorly. The MongoDB documentation now recommends schemas and validation — essentially admitting that structure matters.

**When to choose document:** When your data genuinely varies per record and you do not need cross-document transactions. Content management systems, event logging, and configuration storage are legitimate use cases.

### Graph Databases (Neo4j, Amazon Neptune)

Graph databases model data as nodes and edges, making relationship traversal first-class operations. While a relational database can model relationships with join tables, a graph database makes queries like "find all friends of friends who live in Portland" trivial and fast.

**When to choose graph:** Social networks, recommendation engines, fraud detection, knowledge graphs. If your core queries are about traversing relationships multiple levels deep, a graph database is worth evaluating.

### For This Course

For the vast majority of web applications, **relational databases are the right choice**. Here is why:

- Schema enforcement catches bugs early. If your code tries to insert a user without an email, the database rejects it immediately — not three weeks later when some other code tries to read that missing field.
- SQL is a powerful, standardized query language that has been refined over 50 years. Complex reporting, aggregation, and filtering queries that take one line of SQL might require dozens of lines of application code with a document database.
- Foreign keys and constraints guarantee data integrity at the database level, regardless of bugs in your application code.
- Every hosting platform supports relational databases. Every ORM targets them. Every developer reads SQL.

We will use SQLite for development and discuss PostgreSQL for production. The skills transfer directly.

## ACID Properties: The Guarantees That Matter

Relational databases provide four guarantees known as **ACID**. These are not academic abstractions — they are the reason your bank account balance is correct and your e-commerce orders do not lose items.

**Atomicity** — A transaction is all-or-nothing. If you transfer $100 from Account A to Account B, atomicity guarantees that both the debit and credit happen, or neither does. Without atomicity, a crash between the debit and credit leaves $100 missing from the system.

```sql
-- This is atomic: both statements succeed or both are rolled back
BEGIN TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

**Consistency** — The database moves from one valid state to another. Constraints (NOT NULL, UNIQUE, FOREIGN KEY, CHECK) are enforced at transaction boundaries. You cannot commit a transaction that violates your schema's rules.

**Isolation** — Concurrent transactions do not interfere with each other. If two users buy the last concert ticket at the same time, isolation ensures only one succeeds. The level of isolation is configurable (read uncommitted, read committed, repeatable read, serializable), trading strictness for performance.

**Durability** — Once a transaction is committed, it survives power failures, crashes, and restarts. The database writes to a persistent log before confirming the commit. Even if the process crashes immediately after, the data is recoverable.

Understanding ACID is critical when you start handling money, inventory, or any data where correctness matters more than speed. Most developers do not think about these properties until they have a bug that costs their company money.

## SQLite: The Perfect Starting Database

**SQLite** is unique among databases. It is not a separate server you install and configure — it is a library that reads and writes directly to a single file on disk. Your entire database lives in one file, like `app.db`, sitting right in your project directory.

This simplicity is not a weakness. SQLite is used in production by literally billions of devices — every iPhone, every Android phone, every copy of Chrome and Firefox, every macOS installation. It handles more database transactions per day than all other databases combined.

### SQLite Internals: Why It Is Faster Than You Think

SQLite stores data in a B-tree structure. A B-tree is a self-balancing tree optimized for disk-based storage where each node can contain many keys. Looking up a record by primary key requires traversing at most `log(n)` nodes — for a million records, that is about 20 disk reads. With modern SSDs, this takes under a millisecond.

**WAL mode (Write-Ahead Logging)** is SQLite's secret weapon for concurrent read performance. By default, SQLite uses rollback journals, which lock the entire database during writes. WAL mode instead writes changes to a separate log file, allowing multiple readers to operate simultaneously while a write is in progress. Always enable WAL mode in production:

```typescript
// Enable WAL mode when opening the database
import Database from 'better-sqlite3';

const db = new Database('app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON'); // SQLite disables foreign keys by default!
db.pragma('busy_timeout = 5000'); // Wait up to 5s if database is locked
```

That `foreign_keys = ON` pragma is critical and often missed. SQLite does not enforce foreign key constraints by default — you have to explicitly enable them. Without this, your `REFERENCES` clauses are decoration. I have seen production databases with orphaned records because nobody enabled this pragma.

### SQLite's Limitations

SQLite has real limitations you should understand:

- **Single writer at a time.** WAL mode allows concurrent reads during writes, but only one process can write at a time. For a typical web app serving hundreds of concurrent users with mostly reads and occasional writes, this is fine. For a high-write application (real-time chat, financial trading), it is not.
- **No network access.** SQLite reads a local file. You cannot connect to it from a separate server. This means it does not work in horizontally scaled deployments with multiple app servers (unless you use a distributed SQLite solution like Turso/libSQL).
- **Limited ALTER TABLE.** SQLite does not support dropping columns (before version 3.35.0), changing column types, or adding constraints to existing columns. Migrations sometimes require creating a new table, copying data, and dropping the old one.
- **No built-in user management.** There are no database users, roles, or permissions. Security comes from filesystem permissions on the database file.

For SvelteKit development, SQLite is ideal:

- **Zero configuration.** No installing a database server, no connection strings, no Docker containers. Create a file and go.
- **No separate process.** Your application and database share the same process. No network latency between your app and your data.
- **Easy to version control the schema.** The database file is local, and your schema definitions live right in your project.
- **Great for small-to-medium apps.** SQLite comfortably handles hundreds of concurrent users and databases up to hundreds of gigabytes.

## PostgreSQL: When You Outgrow SQLite

When your application grows — hundreds of concurrent writes, multiple server instances, need for replication — you will move to **PostgreSQL**. It is the industry standard for production web applications, and for good reason:

- **Concurrent access.** Multiple processes and servers can read and write simultaneously using MVCC (Multi-Version Concurrency Control). Each transaction sees a consistent snapshot of the database without blocking other transactions.
- **Replication.** Your data can be copied to standby servers for high availability and disaster recovery. Streaming replication provides real-time copies; logical replication allows selective table sync.
- **Full-text search.** Built-in support for searching through text content without an external service like Elasticsearch. The `tsvector` and `tsquery` types with GIN indexes handle most search needs.
- **Advanced types.** JSON/JSONB columns with indexing, arrays, geometric data, network addresses, UUIDs, ranges, and custom types.
- **Extensions.** PostGIS for geographic data, pg_trgm for fuzzy text matching, pgcrypto for encryption, and hundreds more.

### Connection Pooling: A Production Necessity

PostgreSQL creates a separate process for each connection. Each process uses about 10MB of RAM. If your application opens 100 connections, that is 1GB of RAM just for connection overhead. In a serverless environment where each request might create a connection, you can exhaust the connection limit (default 100) in seconds.

Connection pooling solves this with a proxy (like PgBouncer or Supavisor) that maintains a small pool of database connections and multiplexes application requests across them:

```
Without pooling:
  100 app requests → 100 database connections → 1GB RAM, connection exhaustion

With pooling (PgBouncer):
  100 app requests → PgBouncer → 10 database connections → 100MB RAM
```

In SvelteKit, when deploying to serverless platforms (Vercel, Cloudflare), always use a connection pooler or a managed database service that includes one.

### SQLite to PostgreSQL Migration Path

The good news: if you use an ORM like Drizzle, switching from SQLite to PostgreSQL mostly means changing your connection configuration and driver. Your query code stays almost identical:

```typescript
// SQLite configuration
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('app.db');
export const db = drizzle(sqlite);
```

```typescript
// PostgreSQL configuration — same Drizzle API, different driver
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL);
export const db = drizzle(client);
```

The query code (`db.select().from(users).where(eq(users.id, 1))`) is identical for both. This is the primary value of using an ORM — database portability.

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

## Drizzle vs Prisma vs Kysely: Making the Right Choice

There are several ORMs in the TypeScript ecosystem. Each makes different tradeoffs:

### Prisma

Prisma is the most popular TypeScript ORM. It uses its own schema language (`.prisma` files), a code generation step, and provides an exceptionally polished query API.

```prisma
// schema.prisma — Prisma's custom schema language
model User {
  id    Int     @id @default(autoincrement())
  name  String
  email String  @unique
  posts Post[]
}

model Post {
  id     Int    @id @default(autoincrement())
  title  String
  author User   @relation(fields: [authorId], references: [id])
  authorId Int
}
```

```typescript
// Query API — very clean, but requires running `prisma generate`
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: { posts: true }
});
// user is fully typed, including the nested posts
```

**Pros:** Excellent developer experience, great documentation, powerful migration system, introspection of existing databases, studio UI for data browsing.

**Cons:** Code generation step (`prisma generate`) runs on every schema change. Custom schema language is another thing to learn. Generated client can be large (10MB+ in node_modules). The query engine is a separate Rust binary, which can cause issues in serverless/edge environments. Query API is its own abstraction — does not resemble SQL.

### Kysely

Kysely is a type-safe SQL query builder. It sits closer to raw SQL than Prisma or Drizzle, giving you maximum control over the generated queries.

```typescript
const user = await db
  .selectFrom('users')
  .select(['id', 'name', 'email'])
  .where('id', '=', 1)
  .executeTakeFirst();
```

**Pros:** Full SQL power with type safety. No code generation. Minimal runtime overhead. Excellent for complex queries.

**Cons:** More verbose than Prisma/Drizzle for simple operations. No built-in migration system. You define types manually or generate them from your database.

### Drizzle (Our Choice)

We use **Drizzle** because it hits a sweet spot:

- **SQL-like API.** If you know SQL, Drizzle feels familiar. The query builder mirrors SQL syntax, so you are not learning an entirely new query language.
- **Type-safe from schema to query.** Your TypeScript schema definitions are the single source of truth. Drizzle infers types from them, so `db.select().from(users)` returns properly typed `User[]`.
- **Lightweight.** Drizzle has minimal runtime overhead — about 50KB minified. It generates SQL and gets out of the way. No Rust binary, no separate process.
- **No code generation step.** Unlike Prisma (which requires running `prisma generate` after schema changes), Drizzle's types come directly from your schema definitions using TypeScript inference.
- **Edge-compatible.** Works in Cloudflare Workers, Deno Deploy, Vercel Edge, and other constrained environments where Prisma's Rust engine cannot run.

```typescript
// Drizzle schema — pure TypeScript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  email: text('email').notNull().unique()
});

// Query — mirrors SQL syntax
const allUsers = await db.select().from(users);
// allUsers is typed as { id: number; name: string; email: string }[]

const alice = await db.select().from(users).where(eq(users.email, 'alice@example.com'));
```

## Schema Design Principles

The schema is the contract between your application and your database. It defines what data can exist and what rules it must follow. In a well-designed application, the schema is the **source of truth** for your data model — it determines what types your application code uses, what validations your forms enforce, and what your API endpoints accept.

### Normalization: The Art of Structuring Data

Normalization is the process of organizing your tables to minimize data redundancy and dependency. There are multiple "normal forms," but in practice, you need to understand three:

**First Normal Form (1NF):** Each column contains a single value, not a list. Instead of storing `tags: "javascript,svelte,typescript"` in a string column, create a separate `tags` table with one row per tag.

**Second Normal Form (2NF):** Every non-key column depends on the entire primary key. If you have an `order_items` table with `(order_id, product_id)` as the composite key, the `product_name` column depends only on `product_id`, not the full key. Move it to the `products` table.

**Third Normal Form (3NF):** No non-key column depends on another non-key column. If your `users` table has `city` and `state`, and `state` depends on `city` (Portland is always in Oregon), you have a transitive dependency. In practice, this level of normalization is often relaxed for convenience.

### When to Denormalize

Normalization reduces redundancy but increases join complexity. Sometimes denormalization is the right choice:

```sql
-- Fully normalized: requires a JOIN on every post query
SELECT posts.title, users.name as author_name
FROM posts
JOIN users ON posts.user_id = users.id;

-- Denormalized: author_name stored directly on posts
-- Faster reads, but author_name can become stale if the user changes their name
SELECT title, author_name FROM posts;
```

Denormalize when: the data rarely changes, the join is expensive and frequent, and you can tolerate stale data. Blog post author names, product category labels, and order total amounts are common denormalization candidates.

### Indexes: Making Queries Fast

Without an index, a query like `SELECT * FROM users WHERE email = 'alice@example.com'` must scan every row in the table (a "full table scan"). An index creates a sorted data structure that allows the database to find the row directly:

```sql
-- Create an index on email for fast lookups
CREATE INDEX idx_users_email ON users(email);

-- Composite index for queries that filter on multiple columns
CREATE INDEX idx_posts_user_date ON posts(user_id, created_at);
```

**Index guidelines:**
- Always index columns used in `WHERE`, `JOIN`, and `ORDER BY` clauses
- `UNIQUE` constraints automatically create indexes
- Composite indexes work left-to-right: `(user_id, created_at)` helps queries filtering on `user_id` alone or `user_id AND created_at`, but NOT `created_at` alone
- Each index slows down writes (the index must be updated on every INSERT/UPDATE/DELETE)
- Do not index columns with low cardinality (like boolean columns with only true/false — the index does not help)

### Constraints: Your Safety Net

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                          -- cannot be empty
  email TEXT UNIQUE NOT NULL,                  -- unique + required
  age INTEGER CHECK(age >= 0 AND age <= 150),  -- range validation
  role TEXT DEFAULT 'user',                    -- default value
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- ON DELETE CASCADE: when a user is deleted, their posts are automatically deleted
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

The `ON DELETE` behavior for foreign keys is a critical design decision:

- `CASCADE` — delete related records automatically (user deleted → their posts deleted)
- `SET NULL` — set the foreign key to NULL (comment author deleted → comment remains, author shows as "deleted user")
- `RESTRICT` (default) — prevent deletion if related records exist (cannot delete a user who has posts)

Choose carefully. `CASCADE` is convenient but dangerous — deleting a user might cascade through posts, comments, likes, and notifications, removing far more data than intended. `RESTRICT` is safer for most relationships.

## SQL Basics: The Four Core Operations

Before we use an ORM, you should understand the SQL it generates. SQL has four core statements that map to CRUD operations:

### SELECT — Read Data

```sql
-- Get all columns from every row
SELECT * FROM users;

-- Get specific columns (more efficient — avoids sending unused data)
SELECT name, email FROM users;

-- Filter with WHERE
SELECT * FROM users WHERE age > 18;

-- Multiple conditions
SELECT * FROM users WHERE age > 18 AND role = 'admin';

-- Sort and limit
SELECT * FROM users ORDER BY name ASC LIMIT 10;

-- Pagination: skip the first 20, then take 10
SELECT * FROM users ORDER BY created_at DESC LIMIT 10 OFFSET 20;

-- Aggregate functions
SELECT COUNT(*) as total_users FROM users;
SELECT role, COUNT(*) as count FROM users GROUP BY role;

-- Join related tables
SELECT posts.title, users.name as author
FROM posts
JOIN users ON posts.user_id = users.id;

-- Left join: include posts even if the author was deleted
SELECT posts.title, users.name as author
FROM posts
LEFT JOIN users ON posts.user_id = users.id;

-- Subquery: find users who have posts
SELECT * FROM users WHERE id IN (SELECT DISTINCT user_id FROM posts);
```

### INSERT — Create Data

```sql
-- Insert a single row
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');

-- Insert multiple rows
INSERT INTO users (name, email) VALUES
  ('Bob', 'bob@example.com'),
  ('Charlie', 'charlie@example.com');

-- Insert and return the new row (PostgreSQL)
INSERT INTO users (name, email)
VALUES ('Alice', 'alice@example.com')
RETURNING *;

-- Insert or ignore duplicate (SQLite — useful for idempotent operations)
INSERT OR IGNORE INTO users (name, email) VALUES ('Alice', 'alice@example.com');
```

### UPDATE — Modify Data

```sql
-- Update a specific row
UPDATE users SET email = 'new@example.com' WHERE id = 1;

-- Update multiple columns
UPDATE users SET name = 'Alice Smith', email = 'alice.smith@example.com' WHERE id = 1;

-- Conditional update
UPDATE posts SET published = 1 WHERE user_id = 1 AND published = 0;
```

Always include a `WHERE` clause when updating. Without it, **every row in the table gets changed**. This is not a theoretical danger — it is one of the most common catastrophic mistakes in database work. I have personally witnessed a production incident where `UPDATE users SET role = 'admin'` (missing `WHERE id = 42`) promoted every user to admin.

### DELETE — Remove Data

```sql
-- Delete a specific row
DELETE FROM users WHERE id = 1;

-- Delete with a condition
DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP;
```

Same warning as UPDATE: without `WHERE`, you delete **everything** in the table. Many production databases protect against this with triggers or require explicit confirmation.

### Soft Deletes: An Alternative to DELETE

In production, you often want to "delete" data without actually removing it — for audit trails, undo functionality, or regulatory compliance:

```sql
-- Add a soft delete column
ALTER TABLE users ADD COLUMN deleted_at TEXT;

-- "Delete" by setting the timestamp
UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1;

-- Query only active users
SELECT * FROM users WHERE deleted_at IS NULL;
```

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

## Migrations: Version Control for Your Database

In development, you might recreate your database from scratch whenever the schema changes. In production, you cannot do that — real users have real data. **Migrations** solve this problem.

A migration is a script that transforms your database schema from one version to the next. Think of migrations as git commits for your database schema — each one is a discrete, ordered change that moves the schema forward.

### How Migrations Work

```
Migration 001: Create users table
Migration 002: Create posts table
Migration 003: Add 'role' column to users
Migration 004: Create comments table
Migration 005: Add index on posts.user_id
```

When you deploy, your migration tool checks which migrations have already been applied (tracked in a `_migrations` table) and runs any new ones. This ensures every environment — development, staging, production — has the same schema.

### Migration Best Practices

**Migrations are append-only.** Never edit a migration that has been applied to staging or production. If you need to change something, write a new migration. Editing applied migrations causes the migration tool to lose track of the schema state.

**Make migrations reversible when possible.** For every `CREATE TABLE`, you should conceptually know how to drop it. For every `ADD COLUMN`, you should know how to remove it. Some migration tools support explicit `up` and `down` functions; even if yours does not, think about rollback.

**Test migrations on a copy of production data.** A migration that works on your empty development database might fail on production where 50,000 users have edge-case data. Test with realistic data.

**Keep migrations small and focused.** One migration per change. "Add email verification columns" is a good migration. "Restructure the entire user system" is not — break it into smaller steps.

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
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'user' CHECK(role IN ('user', 'editor', 'admin')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- A post belongs to a user
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  published INTEGER DEFAULT 0,
  published_at TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Tags use a many-to-many relationship via a junction table
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- A comment belongs to a post and a user
CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  body TEXT NOT NULL,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  parent_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Performance indexes
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_published ON posts(published, published_at);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_comments_user_id ON comments(user_id);
```

Notice the design decisions:

- `slug` is `UNIQUE` because every post needs a unique URL-friendly identifier.
- `published` is an integer used as a boolean (SQLite does not have a native boolean type — `0` is false, `1` is true).
- Every table has `created_at` for auditing. `posts` and `users` have `updated_at` to track edits.
- The `post_tags` junction table models the many-to-many relationship between posts and tags using a composite primary key.
- Comments have an optional `parent_id` for threaded replies — a self-referential foreign key.
- The `role` column uses a `CHECK` constraint to limit values to a predefined set.
- Comments use `ON DELETE SET NULL` for `user_id` (deleted users' comments remain visible) but `ON DELETE CASCADE` for `post_id` (if a post is deleted, its comments go too).
- Indexes are created on columns used in `WHERE` clauses and joins — `slug` for URL lookups, `user_id` for "posts by this user," and `published` for filtering published posts.

This schema enforces that every post has an author, every comment has both a post and an author, and no two users can share an email or username. The database protects your data integrity even if your application code has bugs.

## Try It

1. **Basic**: Write SQL statements to create a `books` table with columns for `id` (primary key, auto-increment), `title` (text, required), `author` (text, required), `year` (integer), and `is_read` (integer, default 0). Then write an INSERT to add three books, a SELECT to find all unread books, an UPDATE to mark one book as read, and a DELETE to remove a book by its id.

2. **Intermediate**: Create a `reviews` table with a foreign key referencing `books(id)` and an `ON DELETE CASCADE` constraint. Write a JOIN query that returns all reviews with their book titles. Then write a query that returns each book with its average rating, using GROUP BY and a LEFT JOIN (so books without reviews still appear).

3. **Advanced**: Design a schema for a task management app with `users`, `projects`, `tasks`, and `task_assignments` (many-to-many). Include proper constraints, indexes, and a CHECK constraint to limit task priority to 'low', 'medium', 'high', and 'critical'. Write queries for: (a) all tasks assigned to a specific user, sorted by priority, (b) the number of open tasks per project, (c) users who have no assigned tasks.

4. **Expert**: Take the blog schema from the real example and write the Drizzle ORM schema definition in TypeScript. Define all tables, columns, constraints, and relationships. Then write Drizzle queries for: (a) get a post by slug with its author and tags, (b) get the 10 most recent published posts with comment counts, (c) insert a new post with tags using a transaction.

## Key Takeaways

- Databases provide permanent storage, concurrent access, transaction safety, and data integrity guarantees that file storage cannot
- ACID properties (Atomicity, Consistency, Isolation, Durability) are the guarantees that make databases trustworthy for critical data
- Relational databases are the right choice for most web applications — data is inherently relational
- Document databases have their place but are often misused for relational data — understand the tradeoffs
- SQLite needs no server, stores everything in one file, and is perfect for development and small-to-medium apps — always enable WAL mode and foreign keys
- PostgreSQL is the production standard for concurrent writes, replication, full-text search, and advanced types — always use connection pooling
- ORMs like Drizzle map tables to TypeScript objects, providing type safety and catching bugs at compile time
- Drizzle is lightweight, SQL-like, requires no code generation, and works at the edge — Prisma is more polished but heavier
- Schema design starts with entities and relationships — each entity is a table, each relationship is a foreign key
- Normalization reduces redundancy; denormalization improves read performance — choose based on your access patterns
- Indexes make reads fast but slow writes — index columns used in WHERE, JOIN, and ORDER BY
- Constraints (NOT NULL, UNIQUE, REFERENCES, CHECK) enforce data integrity at the database level — they are your safety net
- Migrations track schema changes in version control and apply them in order across environments — never edit applied migrations
- SQL has four core operations: SELECT (read), INSERT (create), UPDATE (modify), DELETE (remove)
- Always use WHERE with UPDATE and DELETE — without it, you affect every row in the table
