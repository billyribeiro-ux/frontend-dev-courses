# Introduction to Databases

So far, your applications lose all their data when the server restarts. A **database** is a structured system for storing data permanently. When a user creates an account, writes a post, or saves a bookmark, the database keeps that information safe across restarts, deployments, and crashes.

There are many types of databases, but the most common category is the **relational database**. Relational databases store data in tables with rows and columns — similar to a spreadsheet. You interact with them using **SQL** (Structured Query Language).

## What is SQLite?

**SQLite** is a file-based relational database. Unlike PostgreSQL or MySQL, it does not need a separate server process. Your entire database lives in a single file on disk. This makes it perfect for learning, prototyping, and small-to-medium applications.

SvelteKit projects work beautifully with SQLite because the database file sits right inside your project folder.

## SQL Basics: Reading Data

The `SELECT` statement reads data from a table:

```sql
-- Get all columns from every row in the users table
SELECT * FROM users;

-- Get only specific columns
SELECT name, email FROM users;

-- Filter rows with WHERE
SELECT * FROM users WHERE age > 18;

-- Sort results
SELECT * FROM users ORDER BY name ASC;

-- Limit the number of results
SELECT * FROM users LIMIT 10;
```

## SQL Basics: Creating Data

The `INSERT` statement adds new rows:

```sql
-- Insert a single row
INSERT INTO users (name, email, age) VALUES ('Alice', 'alice@example.com', 25);

-- Insert multiple rows
INSERT INTO users (name, email, age) VALUES
  ('Bob', 'bob@example.com', 30),
  ('Charlie', 'charlie@example.com', 22);
```

## SQL Basics: Updating Data

The `UPDATE` statement modifies existing rows:

```sql
-- Update a specific user
UPDATE users SET email = 'newalice@example.com' WHERE id = 1;

-- Update multiple columns
UPDATE users SET name = 'Alice Smith', age = 26 WHERE id = 1;
```

Always include a `WHERE` clause when updating. Without it, every row in the table gets changed.

## SQL Basics: Deleting Data

The `DELETE` statement removes rows:

```sql
-- Delete a specific user
DELETE FROM users WHERE id = 1;

-- Delete all users older than 100 (careful!)
DELETE FROM users WHERE age > 100;
```

Like `UPDATE`, always use `WHERE` with `DELETE` to avoid removing all rows.

## Creating Tables

Before you can store data, you need to define a table structure:

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  age INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

Each column has a name, a type (`TEXT`, `INTEGER`, `REAL`), and optional constraints like `NOT NULL`, `UNIQUE`, or `DEFAULT`.

## Try It

Write SQL statements to create a `books` table with columns for `id`, `title`, `author`, `year`, and `is_read` (integer, 0 or 1). Then write an INSERT to add three books, a SELECT to find all unread books, an UPDATE to mark one book as read, and a DELETE to remove a book by its id.

## Key Takeaways

- A database stores data permanently, surviving restarts and deployments
- Relational databases organize data in tables with rows and columns
- SQLite is a file-based database that requires no separate server
- SQL has four core operations: SELECT (read), INSERT (create), UPDATE (modify), DELETE (remove)
- Always use WHERE clauses with UPDATE and DELETE to target specific rows
- Tables are defined with column names, types, and constraints
