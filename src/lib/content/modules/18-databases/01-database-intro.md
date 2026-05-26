# Introduction to Databases

So far, your applications lose all their data when the server restarts. Variables live in memory, and memory gets wiped clean on every restart, deployment, and crash. A **database** gives your data permanence. When a user creates an account, writes a post, or saves a bookmark, the database ensures that data survives anything short of a disk failure.

But a database is more than just persistence. It is a system for organizing, querying, and protecting your data with guarantees that ad-hoc file storage cannot provide: concurrent access, transaction safety, indexing for fast lookups, and constraints that enforce data integrity. Choosing the right database -- and understanding its trade-offs -- is one of the most consequential architectural decisions in any application. Get it wrong and you spend months migrating data, rewriting queries, or debugging consistency bugs at 3am.

## Why Not Just Use Files?

Before understanding databases, it is worth asking: why not just write JSON to a file? You could store users in `users.json` and read/write it with Node's `fs` module. This approach works for trivial cases but falls apart at scale:

```typescript
// The "just use a file" approach
import { readFileSync, writeFileSync } from 'fs';

function addUser(user: User) {
  const users = JSON.parse(readFileSync('users.json', 'utf-8'));
  users.push(user);
  writeFileSync('users.json', JSON.stringify(users));
}
```

```
# Why this approach fails in production:

1. CONCURRENCY: Two requests read the file simultaneously, both add a user,
   both write back. One user's data is lost (last write wins).

2. PERFORMANCE: Reading the entire file to find one user. With 100,000 users,
   every lookup reads 100,000 records into memory.

3. INTEGRITY: Nothing prevents you from writing invalid data. A bug could
   write { name: null } and you would not know until something crashes.

4. QUERYING: "Find all users who signed up in January and have more than
   5 posts" requires loading everything into memory and filtering in JS.

5. RELATIONSHIPS: Linking users to posts requires manual bookkeeping.
   If you delete a user, orphaned posts persist forever.

6. ATOMICITY: If the server crashes mid-write, the file is corrupted.
   You lose everything, not just the current write.
```

Databases solve all of these problems. They are not just "file storage with extra steps" -- they are fundamentally different tools engineered for data reliability.

## Relational vs Document Databases

You will hear about many types of databases, but two categories dominate web development:

**Relational databases** (PostgreSQL, SQLite, MySQL) store data in **tables** with strict schemas. Every row in a table has the same columns. Relationships between tables are explicit -- a post belongs to a user, a comment belongs to a post. You query them with SQL.

**Document databases** (MongoDB, CouchDB) store data as flexible JSON-like documents. Each document can have a different shape. There are no enforced relationships between collections.

For the vast majority of web applications, **relational databases are the better choice**. Here is why:

- Most application data is inherently relational. Users have posts. Posts have comments. Orders have line items. Relational databases model these connections naturally with foreign keys and joins.
- Schema enforcement catches bugs early. If your code tries to insert a user without an email, the database rejects it immediately -- not three weeks later when some other code tries to read that missing field.
- SQL is a powerful, standardized query language that has been refined over 50 years. Complex reporting, aggregation, and filtering queries that take one line of SQL might require dozens of lines of application code with a document database.

Document databases have their place -- they shine for truly unstructured data, rapid prototyping where the schema is genuinely unknown, or specific use cases like content management systems with highly variable content types. But if you are building a typical web app with users, posts, comments, or products, start with a relational database.

### The "Schema Flexibility" Trap

A common argument for document databases is "we don't know our schema yet." This sounds reasonable but is almost always wrong:

```
# WRONG mental model: "We need flexibility because requirements change"
# Reality: Your application code already assumes a shape. If you expect
# user.email to be a string, that IS your schema -- you just haven't
# written it down. A document database lets you avoid writing it down,
# but the implicit schema still exists in every line of code that reads data.
# When something inserts { emal: "..." } (typo), nothing catches it.

# CORRECT mental model: "Define the schema, evolve it with migrations"
# A relational database forces you to be explicit about your data model.
# When requirements change, you write a migration that evolves the schema.
# The database ensures all existing data conforms to the new shape.
# No "surprise" documents with missing or malformed fields.
```

## SQLite: The Perfect Starting Database

**SQLite** is unique among databases. It is not a separate server you install and configure -- it is a library that reads and writes directly to a single file on disk. Your entire database lives in one file, like `app.db`, sitting right in your project directory.

This simplicity is not a weakness. SQLite is used in production by literally billions of devices -- every iPhone, every Android phone, every copy of Chrome and Firefox, every macOS installation. It handles more database transactions per day than all other databases combined.

For SvelteKit development, SQLite is ideal:

- **Zero configuration.** No installing a database server, no connection strings, no Docker containers. Create a file and go.
- **No separate process.** Your application and database share the same process. No network latency between your app and your data.
- **Easy to version control the schema.** The database file is local, and your schema definitions live right in your project.
- **Great for small-to-medium apps.** SQLite comfortably handles hundreds of concurrent users and databases up to hundreds of gigabytes.
- **Perfect for edge deployments.** Services like Turso and LiteFS let you deploy SQLite to edge locations worldwide.

### SQLite's Architecture: Why It Is Fast

Understanding SQLite's architecture explains why it performs so well for SvelteKit applications:

```
  Traditional Database (PostgreSQL, MySQL):
  ──────────────────────────────────────────
  Application  ─── network ───▶  Database Server  ───▶  Disk
                   (latency)      (separate process)

  SQLite:
  ──────────────────────────────────────────
  Application ──── function call ───▶  Disk
                   (no network, no IPC)
```

Every query in PostgreSQL crosses a network boundary (even on localhost, there is inter-process communication overhead). SQLite queries are function calls -- the database engine is linked directly into your application. For a typical SvelteKit page that runs 3-5 queries, this eliminates 3-5 round trips of latency. The result is noticeably faster page loads.

### SQLite's Limitations (Know Before You Hit Them)

SQLite has real limitations that matter at scale:

```
# Single-writer limitation
SQLite allows multiple concurrent readers but only ONE writer at a time.
If two requests try to write simultaneously, one waits.

# For a SvelteKit app with ~100 concurrent users:   FINE
# For a SvelteKit app with ~1000 concurrent writes:  PROBLEM

# No built-in replication
SQLite does not replicate data to standby servers.
If the disk fails, the database is gone (unless you have backups).

# No network access
SQLite is an embedded database. You cannot connect to it from
a separate server or service. Every process that needs the database
must have direct file system access.
```

These limitations are why PostgreSQL exists. But for development, learning, and many production applications, SQLite is not just "good enough" -- it is the optimal choice.

## PostgreSQL: When You Outgrow SQLite

When your application grows -- hundreds of concurrent writes, multiple server instances, need for replication -- you will move to **PostgreSQL**. It is the industry standard for production web applications, and for good reason:

- **Concurrent access.** Multiple processes and servers can read and write simultaneously without blocking each other. PostgreSQL uses MVCC (Multi-Version Concurrency Control) to let readers and writers coexist.
- **Replication.** Your data can be copied to standby servers for high availability and disaster recovery. If your primary server fails, a standby can take over in seconds.
- **Full-text search.** Built-in support for searching through text content without an external service like Elasticsearch.
- **Advanced types.** JSON columns, arrays, geographic data, custom types, and full-text search vectors.
- **Extensibility.** Extensions like PostGIS (geographic queries), pg_trgm (fuzzy text matching), and pgvector (AI embeddings) add specialized capabilities.

The good news: if you use an ORM like Drizzle, switching from SQLite to PostgreSQL mostly means changing your connection configuration and driver. Your query code stays almost identical.

### The Migration Path: SQLite to PostgreSQL

Here is what changing databases actually looks like with Drizzle:

```typescript
// SQLite setup
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
const sqlite = new Database('local.db');
const db = drizzle(sqlite, { schema });

// PostgreSQL setup -- same query API, different driver
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
const client = postgres(process.env.DATABASE_URL);
const db = drizzle(client, { schema });

// Your queries stay IDENTICAL:
const users = db.select().from(usersTable).all();
const post = db.insert(postsTable).values({ title: 'Hello' }).returning().get();
```

The schema definitions change slightly (PostgreSQL uses `pgTable` instead of `sqliteTable` and has different column types), but the query layer is the same. This is the power of an ORM with a consistent API across dialects.

## The ORM Mental Model

Writing raw SQL strings in your TypeScript code works, but it has real problems:

```typescript
// Raw SQL -- no type safety, easy to make mistakes
const result = db.prepare('SELECT * FROM users WHERE emial = ?').get(email);
//                                                  ^^^^^ typo! No compiler error.
// The return type is `any` -- TypeScript cannot help you.
```

That typo in `emial` will not be caught until runtime. And the return type of `result` is `any` -- TypeScript cannot help you because it has no idea what columns the query returns.

An **ORM** (Object-Relational Mapper) bridges the gap between your database tables and your TypeScript code. You define your table structure in TypeScript, and the ORM:

1. Generates the correct SQL for you
2. Provides full autocompletion in your editor
3. Catches column name typos at compile time
4. Infers TypeScript types from your schema

```typescript
// With Drizzle ORM -- type-safe, autocomplete, compile-time checks
const result = db.select().from(users).where(eq(users.email, email)).get();
//                                              ^^^^^ autocomplete shows valid columns
// Return type: { id: number; username: string; email: string; ... } | undefined
```

The result is that you write queries in TypeScript instead of SQL, and the compiler catches entire categories of bugs before your code ever runs.

### The ORM Spectrum: Query Builders vs Full ORMs

Not all ORMs are created equal. They exist on a spectrum from "thin SQL wrappers" to "full object-relational mapping":

```
  Raw SQL          Query Builder       Lightweight ORM        Full ORM
  ─────────        ─────────────       ───────────────        ────────
  db.query(        knex('users')       db.select()            User.findAll({
    'SELECT *        .where({            .from(users)           where: {
    FROM users       email: x           .where(                  email: x
    WHERE...'      })                    eq(users.email, x)    },
  )                                    )                       include: ['posts']
                                                              })

  No type safety   Some type safety   Full type safety       Full type safety
  Full SQL control SQL-like API       SQL-like API           Custom query language
  No abstraction   Thin abstraction   Moderate abstraction   Heavy abstraction

  Examples:        Examples:          Examples:              Examples:
  better-sqlite3   Knex               Drizzle, Kysely        Prisma, TypeORM
```

Drizzle sits in the "lightweight ORM" sweet spot: full type safety without hiding the SQL. You always know what query will be generated because the API mirrors SQL syntax. This matters when you need to optimize performance -- you can reason about the generated SQL without diving into framework internals.

## Why Drizzle ORM

There are several ORMs in the TypeScript ecosystem -- Prisma, TypeORM, Kysely, Drizzle. We use **Drizzle** because it hits a sweet spot:

- **SQL-like API.** If you know SQL, Drizzle feels familiar. The query builder mirrors SQL syntax, so you are not learning an entirely new query language.
- **Type-safe from schema to query.** Your TypeScript schema definitions are the single source of truth. Drizzle infers types from them, so `db.select().from(users)` returns properly typed `User[]`.
- **Lightweight.** Drizzle has minimal runtime overhead. It generates SQL and gets out of the way.
- **No code generation step.** Unlike Prisma (which requires running `prisma generate` after schema changes), Drizzle's types come directly from your schema definitions using TypeScript inference.

### Drizzle vs Prisma: An Architectural Comparison

Since Prisma is the other major TypeScript ORM, understanding the differences helps you appreciate Drizzle's design philosophy:

```typescript
// Prisma: Custom query language, code generation required
const posts = await prisma.post.findMany({
  where: { published: true },
  include: { author: true },
  orderBy: { createdAt: 'desc' }
});
// After schema changes, you must run: npx prisma generate

// Drizzle: SQL-like API, no code generation
const posts = db
  .select()
  .from(postsTable)
  .where(eq(postsTable.published, true))
  .leftJoin(usersTable, eq(postsTable.userId, usersTable.id))
  .orderBy(desc(postsTable.createdAt))
  .all();
// Types update instantly when you change the schema file
```

```
# Prisma advantages:
- More intuitive API for developers who do not know SQL
- Built-in migration tooling with interactive workflows
- Large ecosystem and community

# Drizzle advantages:
- No code generation step (faster iteration)
- SQL-like API (transferable SQL knowledge)
- Lighter runtime (smaller bundle, faster startup)
- Easier to predict the generated SQL
- Works better with edge runtimes (Cloudflare Workers, Deno)
```

## Database Schemas: Your Source of Truth

The schema is the contract between your application and your database. It defines what data can exist and what rules it must follow. In a well-designed application, the schema is the **source of truth** for your data model -- it determines what types your application code uses, what validations your forms enforce, and what your API endpoints accept.

### Thinking About Schema Design

Here is how you think about schema design: start with the entities in your application (users, posts, comments) and the relationships between them. Each entity becomes a table. Each property becomes a column. Each relationship becomes a foreign key.

```
# Step 1: Identify entities
Users, Posts, Comments, Tags

# Step 2: Identify relationships
- A User HAS MANY Posts (one-to-many)
- A Post HAS MANY Comments (one-to-many)
- A User HAS MANY Comments (one-to-many)
- A Post HAS MANY Tags, a Tag HAS MANY Posts (many-to-many)

# Step 3: Design tables
users:    id, username, email, created_at
posts:    id, title, content, user_id (FK → users), created_at
comments: id, body, post_id (FK → posts), user_id (FK → users), created_at
tags:     id, name
post_tags: post_id (FK → posts), tag_id (FK → tags)  ← junction table

# Step 4: Add constraints
- username UNIQUE NOT NULL
- email UNIQUE NOT NULL
- title NOT NULL
- body NOT NULL
- Foreign keys enforce referential integrity
```

The many-to-many relationship between posts and tags requires a **junction table** (also called a join table or bridge table). This is a table with two foreign keys and no other data -- it exists solely to link posts and tags. This is a fundamental pattern in relational database design.

## SQL Basics: The Four Core Operations

Before we use an ORM, you should understand the SQL it generates. SQL has four core statements that map to CRUD operations:

### SELECT -- Read Data

```sql
-- Get all columns from every row
SELECT * FROM users;

-- Get specific columns (preferred -- only fetch what you need)
SELECT name, email FROM users;

-- Filter with WHERE
SELECT * FROM users WHERE age > 18;

-- Multiple conditions
SELECT * FROM users WHERE age > 18 AND role = 'admin';

-- Sort and limit
SELECT * FROM users ORDER BY name ASC LIMIT 10;

-- Count rows
SELECT COUNT(*) FROM users WHERE role = 'admin';

-- Join related tables
SELECT posts.title, users.name
FROM posts
JOIN users ON posts.user_id = users.id;

-- Left join (include posts even if user is deleted)
SELECT posts.title, users.name
FROM posts
LEFT JOIN users ON posts.user_id = users.id;
```

```
# WRONG: Always using SELECT *
SELECT * FROM users;
# Fetches every column, including large text fields you might not need.
# Wastes bandwidth and memory. As your table grows, this gets worse.

# CORRECT: Select only the columns you need
SELECT id, username, email FROM users;
# Faster query, less data transferred, clearer intent.
```

### INSERT -- Create Data

```sql
-- Insert a single row
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com');

-- Insert multiple rows
INSERT INTO users (name, email) VALUES
  ('Bob', 'bob@example.com'),
  ('Charlie', 'charlie@example.com');

-- Insert and return the created row (SQLite and PostgreSQL)
INSERT INTO users (name, email) VALUES ('Alice', 'alice@example.com')
RETURNING *;
```

### UPDATE -- Modify Data

```sql
-- Update a specific row
UPDATE users SET email = 'new@example.com' WHERE id = 1;

-- Update multiple columns
UPDATE posts SET title = 'New Title', updated_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

Always include a `WHERE` clause when updating. Without it, **every row in the table gets changed**. This is not a theoretical danger -- it is one of the most common catastrophic mistakes in database work.

```sql
-- CATASTROPHIC: Updates every user's email to the same value
UPDATE users SET email = 'oops@example.com';

-- CORRECT: Updates only the intended user
UPDATE users SET email = 'oops@example.com' WHERE id = 1;
```

### DELETE -- Remove Data

```sql
-- Delete a specific row
DELETE FROM users WHERE id = 1;
```

Same warning as UPDATE: without `WHERE`, you delete **everything** in the table.

```
# Production horror story pattern:
# 1. Developer tests DELETE query in development: DELETE FROM users WHERE id = 99
# 2. Developer copies query to production terminal
# 3. Developer forgets to add WHERE clause
# 4. DELETE FROM users
# 5. Every user account is gone

# Prevention: Always write WHERE first, then the rest of the statement.
# Better prevention: Use an ORM that requires explicit conditions.
# Drizzle: db.delete(users).where(eq(users.id, 1)).run()
# Drizzle without where: db.delete(users).run() -- this deletes everything,
# but it is explicit and intentional, not an accident.
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
- `NOT NULL` prevents empty values -- the database rejects inserts that skip required columns.
- `UNIQUE` ensures no two rows share the same value (like email addresses).
- `REFERENCES` creates a foreign key -- `user_id REFERENCES users(id)` means this column must contain a valid user ID. The database enforces referential integrity for you.
- `DEFAULT` provides a value when one is not specified.

These constraints are your safety net. They guarantee data integrity at the database level, regardless of bugs in your application code.

### Constraint Design Philosophy

Constraints embody a principle: **push validation as close to the data as possible**.

```
  Layer 1: UI validation        (client-side -- can be bypassed)
  Layer 2: Server validation    (application code -- can have bugs)
  Layer 3: Database constraints (closest to data -- final safety net)

  A determined attacker can bypass Layer 1 by sending raw HTTP requests.
  A bug in your code can bypass Layer 2.
  Layer 3 cannot be bypassed -- the database WILL reject invalid data.

  This does not mean you skip Layer 1 and 2. Each layer serves a purpose:
  - Layer 1: Instant user feedback (good UX)
  - Layer 2: Business logic validation (complex rules)
  - Layer 3: Data integrity guarantee (safety net)
```

## Indexes: Making Queries Fast

As your tables grow, queries that scan every row become slow. An **index** is a data structure that lets the database find rows quickly without scanning the entire table -- like the index at the back of a textbook.

```sql
-- Without index: database scans every row to find matching emails
SELECT * FROM users WHERE email = 'alice@example.com';
-- With 1,000,000 rows: checks all 1,000,000 rows

-- Create an index on the email column
CREATE INDEX idx_users_email ON users(email);

-- With index: database jumps directly to the matching row
SELECT * FROM users WHERE email = 'alice@example.com';
-- With 1,000,000 rows: checks ~20 rows (B-tree lookup)
```

```
# When to add indexes:
- Columns used in WHERE clauses (filtering)
- Columns used in JOIN conditions (relationships)
- Columns used in ORDER BY (sorting)
- Columns with UNIQUE constraint (automatically indexed)
- Primary keys (automatically indexed)

# When NOT to add indexes:
- Tables with very few rows (scanning is fast enough)
- Columns that are rarely queried
- Columns with very low cardinality (e.g., a boolean column)
- Too many indexes slow down INSERT/UPDATE/DELETE operations
```

Indexes are not free. Every index must be updated on every INSERT, UPDATE, and DELETE. A table with 10 indexes will have slower writes than a table with 2 indexes. The art is indexing the columns that matter for your query patterns without over-indexing.

## Transactions: All or Nothing

A **transaction** groups multiple operations into an atomic unit. Either all operations succeed, or none of them do. This prevents partial updates that leave your data in an inconsistent state.

```sql
-- Without transaction: if the second INSERT fails, the order exists
-- but has no items. The data is inconsistent.
INSERT INTO orders (user_id, total) VALUES (1, 99.99);
INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 42, 2);
-- What if this ^ fails? Order exists but is empty.

-- With transaction: either both succeed or neither does
BEGIN TRANSACTION;
INSERT INTO orders (user_id, total) VALUES (1, 99.99);
INSERT INTO order_items (order_id, product_id, quantity) VALUES (1, 42, 2);
COMMIT;
-- If anything fails, both operations are rolled back
```

In Drizzle, transactions look like this:

```typescript
db.transaction((tx) => {
  const order = tx.insert(orders)
    .values({ userId: 1, total: 99.99 })
    .returning()
    .get();

  tx.insert(orderItems)
    .values({ orderId: order.id, productId: 42, quantity: 2 })
    .run();
});
// If either insert fails, the entire transaction is rolled back
```

## Migrations: Evolving Your Schema Over Time

In development, you might recreate your database from scratch whenever the schema changes. In production, you cannot do that -- real users have real data. **Migrations** solve this problem.

A migration is a script that transforms your database schema from one version to the next. Migrations are:

- Tracked in version control alongside your application code
- Applied in order (migration 001, then 002, then 003)
- Irreversible in practice (you write a new migration to undo changes, not rollback)

When you deploy, your migration tool checks which migrations have already been applied and runs any new ones. This ensures every environment -- development, staging, production -- has the same schema.

```sql
-- Migration 001: Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Migration 002: Add username column
ALTER TABLE users ADD COLUMN username TEXT;

-- Migration 003: Make username required (backfill first!)
UPDATE users SET username = email WHERE username IS NULL;
-- Then in a new migration, add the NOT NULL constraint
```

```
# WRONG: Editing an existing migration that has already been applied
# The migration tool thinks it has already run. Your change is ignored.
# Production and development now have different schemas.

# CORRECT: Always create a NEW migration for schema changes
# Migration files are immutable once applied.
# This guarantees every environment follows the same sequence.
```

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

-- Indexes for common queries
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_slug ON posts(slug);
CREATE INDEX idx_comments_post_id ON comments(post_id);
```

Notice the design decisions: `slug` is `UNIQUE` because every post needs a unique URL-friendly identifier. `published` is an integer used as a boolean (SQLite does not have a native boolean type -- `0` is false, `1` is true). Every table has `created_at` for auditing. `posts` has `updated_at` to track edits.

This schema enforces that every post has an author, every comment has both a post and an author, and no two users can share an email or username. The database protects your data integrity even if your application code has bugs.

### Cascade Delete: What Happens When You Delete a User?

When you delete a user, what should happen to their posts and comments? This is a design decision encoded in your foreign key constraints:

```sql
-- RESTRICT (default): Prevents deleting a user who has posts
user_id INTEGER NOT NULL REFERENCES users(id)
-- DELETE FROM users WHERE id = 1  → ERROR if user has posts

-- CASCADE: Automatically deletes all posts when user is deleted
user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
-- DELETE FROM users WHERE id = 1  → deletes user AND all their posts

-- SET NULL: Sets user_id to NULL when user is deleted
user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
-- DELETE FROM users WHERE id = 1  → posts remain, user_id becomes NULL
```

Each option has legitimate use cases. CASCADE is convenient but dangerous -- a single DELETE can wipe out massive amounts of data. RESTRICT is safer because it forces you to handle dependent data explicitly. SET NULL is useful for preserving content while dissociating it from the deleted user.

## N+1 Query Problem: The Most Common Performance Pitfall

The N+1 query problem is the single most common database performance issue in web applications. Understanding it now saves debugging time later:

```sql
-- You want to display 10 blog posts with their author names.

-- N+1 approach (WRONG -- 11 queries):
SELECT * FROM posts LIMIT 10;              -- 1 query for posts
SELECT * FROM users WHERE id = 1;           -- 1 query per post author
SELECT * FROM users WHERE id = 2;           --   (10 more queries)
SELECT * FROM users WHERE id = 3;
-- ... 7 more queries
-- Total: 11 queries. With 100 posts, that is 101 queries.

-- JOIN approach (CORRECT -- 1 query):
SELECT posts.*, users.username
FROM posts
JOIN users ON posts.user_id = users.id
LIMIT 10;
-- Total: 1 query. Always 1 query, regardless of how many posts.
```

```
# Why N+1 happens:
# Your code loops through posts and fetches each author individually.
# It feels natural but is catastrophic for performance.
# Each query has overhead, even if the query itself is fast.
# 1000 queries x 1ms each = 1 second of database overhead alone.

# How to prevent it:
# Always use JOINs when you need data from related tables.
# ORMs like Drizzle make this easy with the relational query API.
# Watch for loops that execute queries -- they are N+1 in disguise.
```

With Drizzle, the relational query API prevents N+1 problems:

```typescript
// Drizzle generates a single efficient query
const postsWithAuthors = db.query.posts.findMany({
  with: { author: true },
  limit: 10,
});
```

## Data Types: Choosing the Right Column Type

Choosing the right data type matters for storage efficiency, query performance, and data integrity:

```sql
-- SQLite data types (simpler than PostgreSQL)
TEXT       -- Strings of any length
INTEGER    -- Whole numbers (also used for booleans: 0/1)
REAL       -- Floating-point numbers
BLOB       -- Binary data (files, images -- rarely used directly)

-- Common patterns
id          INTEGER PRIMARY KEY AUTOINCREMENT  -- Unique identifier
username    TEXT NOT NULL                       -- Required string
email       TEXT UNIQUE NOT NULL               -- Required, unique string
age         INTEGER                            -- Optional number
price       REAL                               -- Decimal number
is_active   INTEGER DEFAULT 1                  -- Boolean (0 or 1)
created_at  TEXT DEFAULT CURRENT_TIMESTAMP     -- ISO timestamp as text
metadata    TEXT                               -- JSON stored as text
```

```
# WRONG: Storing dates as integers (Unix timestamps)
created_at INTEGER DEFAULT (strftime('%s', 'now'))
# Hard to read in queries, hard to debug, timezone confusion

# CORRECT: Storing dates as ISO 8601 text
created_at TEXT DEFAULT CURRENT_TIMESTAMP
# Human-readable: '2024-03-15 14:30:00'
# Sortable as text (ISO 8601 sorts correctly)
# Easy to parse in JavaScript: new Date(created_at)
```

## Soft Deletes: An Alternative to DELETE

In production systems, deleting data permanently is often a bad idea. You might need to recover it, audit it, or comply with data retention requirements. **Soft deletes** add a `deleted_at` column instead of removing the row:

```sql
-- Soft delete: mark as deleted without removing data
UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = 1;

-- Query only active users
SELECT * FROM users WHERE deleted_at IS NULL;

-- "Undelete" a user
UPDATE users SET deleted_at = NULL WHERE id = 1;
```

This pattern is common in production applications where data recovery, audit trails, or compliance matters. The tradeoff is that every query must include `WHERE deleted_at IS NULL`, and your database grows over time. But the ability to recover accidentally deleted data is worth it.

## WAL Mode: Unlocking SQLite Concurrency

By default, SQLite uses a rollback journal for transaction safety. This means readers block writers and writers block readers. **Write-Ahead Logging (WAL)** mode changes this behavior dramatically:

```sql
-- Enable WAL mode (run once, persists across restarts)
PRAGMA journal_mode = WAL;
```

```
# Rollback journal (default):
  Writer locks the ENTIRE database. No reads during writes.
  Readers lock out writers. Only one operation at a time.

# WAL mode:
  Writes go to a separate log file.
  Readers continue reading the old data while writes happen.
  Multiple readers + one writer can operate simultaneously.

  Result: 10-50x improvement in concurrent access patterns.
  SvelteKit apps should ALWAYS enable WAL mode for SQLite.
```

In Drizzle, you enable WAL mode immediately after creating the connection:

```typescript
import Database from 'better-sqlite3';

const sqlite = new Database('app.db');
sqlite.pragma('journal_mode = WAL');      // Enable WAL
sqlite.pragma('busy_timeout = 5000');     // Wait 5s instead of failing on lock
sqlite.pragma('synchronous = NORMAL');    // Good balance of speed and safety
sqlite.pragma('foreign_keys = ON');       // Enforce foreign key constraints
```

That `foreign_keys = ON` pragma deserves special attention. SQLite does **not** enforce foreign key constraints by default -- they are parsed but ignored. You must explicitly enable them on every connection. Forgetting this means your `REFERENCES` constraints are decorative, not functional. Drizzle does not enable this for you automatically.

## Try It

Write SQL statements to create a `books` table with columns for `id` (primary key, auto-increment), `title` (text, required), `author` (text, required), `year` (integer), and `is_read` (integer, default 0). Add an index on `author` for fast lookups. Then:

1. Write an INSERT to add three books with different authors and years
2. Write a SELECT to find all unread books ordered by year
3. Write an UPDATE to mark one book as read, using a WHERE clause
4. Write a DELETE to remove a book by its id
5. Create a `reviews` table with a foreign key referencing `books(id)` and a CASCADE delete rule
6. Write a JOIN query that returns all reviews with their book titles
7. Write a transaction that inserts a book and its first review atomically

Then think about this: what constraints would you add to prevent a book from having an empty title? What index would you add if your most common query is "find all books by a specific author published after 2020"? Write those constraints and the composite index.

## Key Takeaways

- Databases provide permanent storage, concurrent access, and data integrity guarantees -- they solve problems that file-based storage cannot
- **Relational databases** are the right choice for most web applications -- data is inherently relational, and schema enforcement catches bugs early
- **SQLite** needs no server, stores everything in one file, and is perfect for development and small-to-medium apps -- it eliminates network latency entirely
- **PostgreSQL** is the production standard for concurrent access, replication, and advanced features -- migrate when you need multi-server writes or high availability
- **ORMs like Drizzle** map tables to TypeScript objects, providing type safety and catching bugs at compile time -- Drizzle stays close to SQL so your knowledge transfers
- Schema design starts with entities and relationships -- each entity is a table, each relationship is a foreign key, many-to-many relationships use junction tables
- **Constraints** (NOT NULL, UNIQUE, REFERENCES) enforce data integrity at the database level -- push validation as close to the data as possible
- **Indexes** make queries fast but slow down writes -- index columns used in WHERE, JOIN, and ORDER BY clauses
- **Transactions** group operations into atomic units -- either all succeed or none do, preventing inconsistent data
- **Migrations** track schema changes in version control and apply them in order across environments -- never edit an applied migration
- SQL has four core operations: SELECT (read), INSERT (create), UPDATE (modify), DELETE (remove) -- always use WHERE with UPDATE and DELETE
- Consider **soft deletes** for production data where recovery, auditing, or compliance matters
