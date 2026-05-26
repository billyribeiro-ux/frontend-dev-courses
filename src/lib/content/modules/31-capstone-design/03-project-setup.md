# Project Setup

With requirements defined and the database designed, it is time to scaffold the capstone project. This lesson is not a simple "run these commands" checklist. Every configuration decision you make here -- the plugin order in Vite, the database connection pooling strategy, the folder hierarchy, the environment variable architecture -- ripples through every feature you build for the rest of this course. Getting setup wrong means spending hours debugging mysterious issues later: CSS not loading, database connections exhausting under load, authentication cookies silently failing, or TypeScript giving you `any` everywhere because your type definitions are misconfigured.

This lesson walks through every step in the order a principal engineer would approach it: infrastructure first (database, environment), then tooling (Tailwind, TypeScript, linting), then architecture (folder structure, module boundaries), then verification (migrations, seed data, smoke tests). You will understand not just *what* to configure, but *why* each choice matters and *what breaks* if you get it wrong.

## Scaffolding the SvelteKit Project

Create a new SvelteKit project with TypeScript:

```bash
npx sv create ecommerce-store
cd ecommerce-store
npm install
```

During setup, select:
- TypeScript
- Prettier + ESLint
- Playwright for E2E testing
- Vitest for unit testing

### Why These Choices Matter

**TypeScript** is non-negotiable for a production application. Without it, you lose type safety across the server-client boundary -- load functions return `any`, form actions have no typed validation, and refactoring becomes a game of find-and-pray. SvelteKit's TypeScript integration is deep: it generates type definitions for your routes, load functions, and form actions automatically.

**Prettier + ESLint** prevent entire categories of bugs and style arguments. ESLint catches real errors (unused variables, unreachable code, incorrect Svelte patterns), while Prettier eliminates formatting debates. In a team project, these are the foundation of code consistency.

**Playwright** for end-to-end testing and **Vitest** for unit testing give you two complementary verification layers. Vitest runs fast and tests individual functions and components in isolation. Playwright runs a real browser and tests user flows across pages. You need both.

### What sv create Actually Generates

Let's examine the generated files so nothing is a mystery:

```
ecommerce-store/
├── src/
│   ├── app.d.ts           ← TypeScript declarations for SvelteKit's App namespace
│   ├── app.html           ← The HTML shell that wraps your entire app
│   ├── app.css            ← Global CSS (Tailwind import goes here)
│   ├── lib/               ← Your code library ($lib alias)
│   │   └── index.ts       ← Re-exports from $lib
│   └── routes/
│       └── +page.svelte   ← The home page
├── static/                ← Static assets served as-is (favicon, robots.txt)
├── svelte.config.js       ← SvelteKit configuration
├── vite.config.ts         ← Vite configuration (Svelte + Tailwind plugins)
├── tsconfig.json          ← TypeScript configuration
├── package.json
└── .prettierrc            ← Prettier configuration
```

The `app.html` file is the entry point for every page. It contains `%sveltekit.head%` (where meta tags, links, and scripts are injected) and `%sveltekit.body%` (where your rendered components appear). You rarely edit this file, but when you need to add a global font or analytics script, this is where it goes.

### WRONG: Skipping TypeScript for Speed

```bash
# WRONG — "I'll add TypeScript later"
npx sv create ecommerce-store  # Select JavaScript
```

Adding TypeScript to an existing SvelteKit project is painful. You need to rename every file, add type annotations retroactively, fix hundreds of errors, and manually configure type generation. The five minutes you "save" at scaffold time costs hours later. Always start with TypeScript.

## Installing Dependencies

Install everything you need in one go, grouped by concern:

```bash
# Styling — Tailwind CSS v4 with the Vite plugin
npm install -D tailwindcss @tailwindcss/vite

# Database — Drizzle ORM with SQLite (lightweight, zero config)
npm install drizzle-orm @libsql/client
npm install -D drizzle-kit

# Authentication — bcrypt for password hashing (we build auth ourselves)
npm install bcryptjs
npm install -D @types/bcryptjs

# Payments — Stripe SDK
npm install stripe

# Validation — Zod for runtime type checking
npm install zod
```

### Why SQLite Instead of PostgreSQL

For a capstone project and local development, SQLite has enormous advantages:

1. **Zero configuration.** No Docker, no database server, no connection strings to manage. The database is a single file.
2. **Fast.** For read-heavy workloads (which most web apps are), SQLite is often *faster* than PostgreSQL because there is no network roundtrip.
3. **Portable.** Your database ships with your code. `git clone` + `npm install` + `npm run dev` and everything works. No "did you run the database migration?" questions.
4. **Production-viable.** With Turso (managed SQLite on the edge) or LiteFS, SQLite scales further than most people realize.

When you outgrow SQLite, switching to PostgreSQL with Drizzle is a schema change, not a rewrite. Drizzle's query builder abstracts the dialect differences.

### Why Build Auth from Scratch

The Lucia auth library was a popular choice, but the author deprecated it and now recommends building auth yourself with the underlying primitives. That is exactly what we do -- it is more educational and gives you full control. The pattern we build (cookie-based sessions with a database-backed session table) is the same pattern Lucia used internally.

### Why These Specific Packages

**`@tailwindcss/vite`** is the Tailwind CSS v4 integration. In v4, Tailwind is a Vite plugin, not a PostCSS plugin. This is a fundamental architectural change -- Tailwind now runs as part of the Vite transform pipeline, which means faster builds, better HMR, and no need for a `tailwind.config.js` file. The `@theme` directive in your CSS replaces the old configuration file entirely.

**`drizzle-orm`** paired with **`drizzle-kit`** gives you a type-safe ORM that generates SQL migrations. Drizzle is the right choice here because it produces typed query results that flow through SvelteKit's load functions with full type safety. The `drizzle-kit` dev dependency provides the CLI for generating and running migrations.

**`zod`** provides runtime validation for form inputs, API parameters, and environment variables. TypeScript checks types at compile time, but Zod checks them at runtime -- essential for validating user input that arrives as raw strings from forms and URL parameters.

### WRONG: Installing Dependencies One at a Time During Development

```bash
# WRONG — Installing packages as you discover you need them
# Day 1
npm install drizzle-orm
# Day 3 — "oh, I need the kit too"
npm install -D drizzle-kit
# Day 5 — "authentication is next, let me figure out which package..."
npm install bcryptjs
```

This incremental approach wastes time and leads to version mismatches. Install all known dependencies upfront. You already know what the project needs because you planned it in the requirements phase.

## Setting Up Tailwind CSS v4

Tailwind CSS v4 uses a fundamentally different configuration model than v3. There is no `tailwind.config.js` file. All configuration lives in your CSS using the `@theme` directive.

### Vite Plugin Configuration

```typescript
// vite.config.ts
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
});
```

### WRONG: Plugin Order Matters

```typescript
// WRONG — sveltekit() before tailwindcss()
export default defineConfig({
  plugins: [sveltekit(), tailwindcss()]
});
```

Plugin order in Vite determines the transform pipeline. The `tailwindcss()` plugin must come first so it can process CSS before SvelteKit's Vite plugin handles component styles. If you reverse the order, you may see intermittent styling failures where Tailwind classes are not recognized in scoped component styles.

### CSS Entry Point with @theme

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  /* Custom design tokens — replaces tailwind.config.js */
  --color-brand-50: #eef2ff;
  --color-brand-100: #e0e7ff;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;
  --color-brand-900: #312e81;

  --color-surface: #ffffff;
  --color-surface-alt: #f9fafb;
  --color-border: #e5e7eb;
  --color-text: #111827;
  --color-text-muted: #6b7280;

  --font-sans: 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-dropdown: 0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06);
}

@layer base {
  body {
    font-family: var(--font-sans);
    color: var(--color-text);
    background: var(--color-surface);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  :focus-visible {
    outline: 2px solid var(--color-brand-500);
    outline-offset: 2px;
  }
}
```

### WRONG: Using tailwind.config.js with v4

```javascript
// WRONG — This is the v3 approach, not v4
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        brand: { 500: '#3b82f6' }
      }
    }
  }
};
```

In Tailwind v4, the `@theme` directive in your CSS replaces the JavaScript configuration file entirely. The `content` paths are detected automatically by the Vite plugin -- you do not need to specify them.

### Root Layout Integration

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../app.css';
  let { children } = $props();
</script>

{@render children()}
```

The root layout imports `app.css` once, making Tailwind classes available everywhere. The `{@render children()}` snippet is Svelte 5 syntax for rendering child content -- it replaces the `<slot />` element from Svelte 4.

## Setting Up Drizzle ORM

### Database Connection

```typescript
// src/lib/server/db.ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';
import { DATABASE_URL } from '$env/static/private';

const client = createClient({
  url: DATABASE_URL
});

export const db = drizzle(client, { schema });
```

Notice the file is in `src/lib/server/` -- this is critical. SvelteKit prevents anything in `$lib/server` from being imported by client-side code. If you accidentally import the database module in a component, you get a build error instead of leaking your database credentials to the browser.

### WRONG: Using process.env Directly

```typescript
// WRONG — process.env bypasses SvelteKit's env module system
const client = createClient({ url: process.env.DATABASE_URL! });
```

```typescript
// CORRECT — $env/static/private is validated at build time
import { DATABASE_URL } from '$env/static/private';
const client = createClient({ url: DATABASE_URL });
```

Using `process.env` directly has three problems: (1) it is not validated -- a typo in the variable name gives you `undefined` silently, (2) it does not benefit from SvelteKit's build-time inlining, and (3) it does not error if you accidentally try to use a private variable on the client. SvelteKit's `$env` modules solve all three problems.

### Database Schema

Here is the complete e-commerce schema with detailed annotations:

```typescript
// src/lib/server/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

// ========== Users ==========
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['customer', 'admin'] }).default('customer').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// ========== Sessions (for authentication) ==========
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),  // Random token, not auto-increment
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

// ========== Categories ==========
export const categories = sqliteTable('categories', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  sortOrder: integer('sort_order').default(0).notNull()
});

// ========== Products ==========
export const products = sqliteTable('products', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  price: integer('price').notNull(),        // Store in cents to avoid float issues
  compareAtPrice: integer('compare_at_price'),
  imageUrl: text('image_url'),
  inventory: integer('inventory').default(0).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// ========== Orders ==========
export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  status: text('status', {
    enum: ['pending', 'paid', 'shipped', 'delivered', 'cancelled']
  }).default('pending').notNull(),
  totalCents: integer('total_cents').notNull(),
  shippingName: text('shipping_name').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  shippingCity: text('shipping_city').notNull(),
  shippingState: text('shipping_state').notNull(),
  shippingZip: text('shipping_zip').notNull(),
  stripePaymentId: text('stripe_payment_id'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date())
});

// ========== Order Items ==========
export const orderItems = sqliteTable('order_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  quantity: integer('quantity').notNull(),
  priceCents: integer('price_cents').notNull()  // Snapshot of price at purchase time
});

// ========== Relations ==========
export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  orders: many(orders)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products)
}));

export const productsRelations = relations(products, ({ one }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id]
  })
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, {
    fields: [orders.userId],
    references: [users.id]
  }),
  items: many(orderItems)
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id]
  }),
  product: one(products, {
    fields: [orderItems.productId],
    references: [products.id]
  })
}));
```

### Why Store Prices in Cents?

Floating point arithmetic is broken for currency. `0.1 + 0.2 === 0.30000000000000004` in JavaScript. If you store `$29.99` as `29.99`, rounding errors accumulate across additions, multiplications, and tax calculations. Storing `2999` (cents as integers) eliminates this entire class of bug. Format for display with `(priceCents / 100).toFixed(2)`.

### Drizzle Kit Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'file:./data/store.db'
  }
});
```

Note that `drizzle.config.ts` is the one place where `process.env` is correct -- this file runs outside of SvelteKit (it is executed by the `drizzle-kit` CLI), so `$env` modules are not available.

### Running Migrations

```bash
# Generate migration files from your schema
npx drizzle-kit generate

# Apply migrations to the database
npx drizzle-kit migrate
```

Always generate migrations before applying them. The `generate` step compares your schema file to the previous migration state and produces a SQL migration file in the `drizzle/` directory. Review this file before running `migrate` -- it shows you exactly what SQL will execute against your database. Never blindly run migrations in production without reviewing the generated SQL.

### WRONG: Using drizzle-kit push in Production

```bash
# WRONG — push modifies the database directly without migration files
npx drizzle-kit push
```

The `push` command is convenient during early development because it applies schema changes directly without generating migration files. But in production, you must use `generate` + `migrate` so you have a versioned history of every schema change.

## Setting Up Authentication

We build session-based authentication from scratch. The flow is:

1. User submits email + password
2. Server verifies credentials, creates a session row in the database
3. Server sets a session cookie with the session ID
4. On each request, the hooks middleware reads the cookie, looks up the session, and attaches the user to `event.locals`

### Password Hashing and Session Management

```typescript
// src/lib/server/auth.ts
import { db } from './db';
import { sessions, users } from './schema';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const SESSION_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION);

  await db.insert(sessions).values({
    id: token,
    userId,
    expiresAt
  });

  return token;
}

export async function validateSession(token: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, token))
    .limit(1);

  if (!session) return { session: null, user: null };

  if (session.expiresAt < new Date()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return { session: null, user: null };
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role
    })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return { session: null, user: null };

  // Sliding window: extend session if more than halfway expired
  const halfLife = SESSION_DURATION / 2;
  if (session.expiresAt.getTime() - Date.now() < halfLife) {
    const newExpiry = new Date(Date.now() + SESSION_DURATION);
    await db.update(sessions)
      .set({ expiresAt: newExpiry })
      .where(eq(sessions.id, token));
  }

  return { session, user };
}

export async function invalidateSession(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, token));
}
```

### Session Validation Hook

```typescript
// src/hooks.server.ts
import { validateSession } from '$lib/server/auth';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionToken = event.cookies.get('session');

  if (!sessionToken) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await validateSession(sessionToken);

  if (session) {
    event.cookies.set('session', session.id, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60
    });
  }

  event.locals.user = user;
  event.locals.session = session;
  return resolve(event);
};
```

### The Session Flow, Step by Step

Understanding this flow is critical because it runs on every single request:

1. **Cookie extraction**: `event.cookies.get()` reads the session cookie. If the user has never logged in or their cookie expired, this returns `undefined`.

2. **Database validation**: `validateSession()` looks up the session in your database, checks if it has expired, and returns the associated user data. This is a database query on every request -- which is why session tables should have an index on the session ID column.

3. **Sliding window renewal**: If a session is more than halfway through its lifetime, it gets a new expiration date. This means active users never get logged out unexpectedly.

4. **Cookie refresh**: The cookie is re-set on each request with the full `maxAge`, effectively resetting the browser's cookie timer.

5. **Locals attachment**: `event.locals` is the per-request data bag that flows from hooks to every load function, form action, and API route. By setting `user` here, any downstream code can check authentication with `event.locals.user`.

## Environment Variables

### The .env File

```bash
# .env — local development only, NEVER committed to git

# Database — SQLite file path
DATABASE_URL=file:./data/store.db

# Session secret
SESSION_SECRET=change-me-to-a-random-64-char-hex-string

# Stripe (optional)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_STRIPE_KEY=pk_test_...
```

**Critical:** Add `.env` and the database file to `.gitignore`:

```gitignore
# .gitignore — MUST include these
.env
.env.*
data/
```

### Type Definitions for Locals

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: {
        id: number;
        email: string;
        name: string;
        role: 'customer' | 'admin';
      } | null;
      session: {
        id: string;
        userId: number;
        expiresAt: Date;
      } | null;
    }

    interface Error {
      message: string;
      errorId?: string;
    }
  }
}

export {};
```

This file tells TypeScript about the shape of `event.locals`. Without it, every access to `event.locals.user` would require a type assertion. This is not optional in a production application -- it is the type contract between your hooks (which set `locals`) and your load functions (which read `locals`).

## Folder Structure: Organizing for Scale

The folder structure is not arbitrary. Each directory serves a specific architectural purpose, and the boundaries between them enforce important separation of concerns.

```
src/
  lib/
    components/          ← Reusable UI components
      ui/                ← Generic: Button, Input, Card, Modal, Toast
      layout/            ← Structural: Header, Footer, Sidebar
      product/           ← Domain: ProductCard, ProductGrid
      cart/              ← Domain: CartItem, CartSummary
    server/              ← Server-only code (never ships to browser)
      db.ts              ← Database connection
      schema.ts          ← Drizzle schema
      auth.ts            ← Session management
      stripe.ts          ← Stripe SDK initialization
    state/               ← Global reactive state (.svelte.ts files)
      cart.svelte.ts     ← Cart state with $state runes
      toast.svelte.ts    ← Toast notification state
    utils/               ← Pure utility functions
      format.ts          ← Currency formatting, date formatting
  routes/
    (store)/             ← Public store layout group
      +layout.svelte     ← Store layout (header, nav, footer)
      +layout.server.ts  ← Load user data for store pages
      +page.svelte       ← Homepage
      products/
        +page.svelte     ← Product listing
        +page.server.ts  ← Load products from database
        [slug]/
          +page.svelte   ← Product detail
          +page.server.ts← Load single product
      cart/
        +page.svelte     ← Cart page
      checkout/
        +page.svelte     ← Checkout flow
        +page.server.ts  ← Process payment
    (admin)/             ← Admin layout group
      admin/
        +layout.svelte   ← Admin layout (sidebar)
        +layout.server.ts← Auth guard — redirect non-admins
        +page.svelte     ← Admin dashboard
        products/        ← Product management
        orders/          ← Order management
    (auth)/              ← Auth layout group (minimal UI)
      login/
        +page.svelte
        +page.server.ts
      signup/
        +page.svelte
        +page.server.ts
    api/                 ← API routes (JSON endpoints)
      webhooks/
        stripe/
          +server.ts
```

### Why Route Groups Matter

Route groups `(store)`, `(admin)`, and `(auth)` are directories wrapped in parentheses. They share layouts without affecting the URL structure:

```
(store)/products/[slug] → /products/my-widget   (not /store/products/my-widget)
(admin)/admin/products  → /admin/products       (not /admin/admin/products)
(auth)/login            → /login                (not /auth/login)
```

Each group has its own `+layout.svelte`, so the store gets a full header with navigation and cart icon, the admin gets a sidebar with management links, and the auth pages get a minimal centered layout. Without groups, you would need conditional logic in a single root layout to show different UI based on the current route -- which is fragile and hard to maintain.

### Why $lib/server Is Special

SvelteKit treats `$lib/server` as a server-only boundary. If any client-side code (a `.svelte` component, a `.svelte.ts` module, or a `+page.ts` load function) tries to import from `$lib/server`, the build fails with an explicit error. This is a hard guarantee -- it is enforced by the compiler, not by convention.

This matters because your `$lib/server` directory contains database credentials, password hashing functions, and session management code. If any of this leaked to the client bundle, it would be a critical security vulnerability.

### The .svelte.ts Convention for Reactive State

Files in `state/` use the `.svelte.ts` extension, which tells the Svelte compiler to process them with rune support. This lets you use `$state`, `$derived`, and `$effect` outside of `.svelte` components:

```typescript
// WRONG — cart.ts (without .svelte.ts extension)
// $state is a syntax error in plain .ts files
let items = $state<CartItem[]>([]);  // Error: $state is not defined
```

```typescript
// CORRECT — cart.svelte.ts
// The Svelte compiler processes this file, so runes work
let items = $state<CartItem[]>([]);  // Works
```

## Base Layout with Navigation

```svelte
<!-- src/routes/(store)/+layout.svelte -->
<script>
  import '../../app.css';
  let { data, children } = $props();
</script>

<div class="min-h-screen flex flex-col">
  <header class="border-b border-border bg-surface">
    <nav class="max-w-7xl mx-auto px-6 flex items-center justify-between h-16">
      <a href="/" class="text-xl font-bold text-brand-600">Store</a>

      <div class="flex items-center gap-6">
        <a href="/products" class="text-text-muted hover:text-text">Products</a>

        {#if data.user}
          <span class="text-sm text-text-muted">Hi, {data.user.name}</span>
          {#if data.user.role === 'admin'}
            <a href="/admin" class="text-sm text-brand-600">Admin</a>
          {/if}
          <form method="POST" action="/logout">
            <button class="text-sm text-text-muted hover:text-text">Log out</button>
          </form>
        {:else}
          <a href="/login" class="text-sm text-text-muted hover:text-text">Log in</a>
          <a href="/signup"
            class="text-sm bg-brand-600 text-white px-4 py-2 rounded-md hover:bg-brand-700">
            Sign up
          </a>
        {/if}

        <a href="/cart" class="relative">Cart</a>
      </div>
    </nav>
  </header>

  <main class="flex-1">
    {@render children()}
  </main>

  <footer class="border-t border-border py-8">
    <div class="max-w-7xl mx-auto px-6 text-center text-sm text-text-muted">
      <p>&copy; {new Date().getFullYear()} Store. All rights reserved.</p>
    </div>
  </footer>
</div>
```

```typescript
// src/routes/(store)/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user
  };
};
```

## Seed Data Script

An empty database is useless for development. Create a seed script that populates your tables with realistic data:

```typescript
// scripts/seed.ts
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { categories, products, users } from '../src/lib/server/schema';
import bcrypt from 'bcryptjs';

const client = createClient({ url: 'file:./data/store.db' });
const db = drizzle(client);

async function seed() {
  console.log('Seeding database...');

  // Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const [admin] = await db.insert(users).values({
    email: 'admin@store.com',
    name: 'Admin User',
    passwordHash,
    role: 'admin',
    createdAt: new Date()
  }).returning();

  console.log(`Created admin user: ${admin.email}`);

  // Create categories
  const categoryData = [
    { name: 'Electronics', slug: 'electronics', description: 'Gadgets and devices', sortOrder: 1 },
    { name: 'Clothing', slug: 'clothing', description: 'Apparel and accessories', sortOrder: 2 },
    { name: 'Books', slug: 'books', description: 'Fiction and non-fiction', sortOrder: 3 },
    { name: 'Home & Garden', slug: 'home-garden', description: 'For your living space', sortOrder: 4 }
  ];

  const insertedCategories = await db.insert(categories).values(categoryData).returning();
  console.log(`Created ${insertedCategories.length} categories`);

  // Create products
  const productData = [
    { categoryId: insertedCategories[0].id, name: 'Wireless Headphones', slug: 'wireless-headphones', description: 'Premium noise-cancelling headphones with 30-hour battery life.', price: 14999, compareAtPrice: 19999, inventory: 50, isActive: true },
    { categoryId: insertedCategories[0].id, name: 'USB-C Hub', slug: 'usb-c-hub', description: '7-in-1 adapter with HDMI, USB-A, and SD card slots.', price: 4999, inventory: 120, isActive: true },
    { categoryId: insertedCategories[0].id, name: 'Mechanical Keyboard', slug: 'mechanical-keyboard', description: 'Hot-swappable switches, RGB backlight, aluminum frame.', price: 12999, inventory: 30, isActive: true },
    { categoryId: insertedCategories[1].id, name: 'Cotton T-Shirt', slug: 'cotton-tshirt', description: '100% organic cotton, available in 6 colors.', price: 2499, inventory: 200, isActive: true },
    { categoryId: insertedCategories[1].id, name: 'Denim Jacket', slug: 'denim-jacket', description: 'Classic fit with vintage wash.', price: 7999, compareAtPrice: 9999, inventory: 40, isActive: true },
    { categoryId: insertedCategories[2].id, name: 'The Pragmatic Programmer', slug: 'pragmatic-programmer', description: 'Your journey to mastery. 20th Anniversary Edition.', price: 3999, inventory: 80, isActive: true },
    { categoryId: insertedCategories[2].id, name: 'Clean Code', slug: 'clean-code', description: 'A handbook of agile software craftsmanship.', price: 3499, inventory: 60, isActive: true },
    { categoryId: insertedCategories[2].id, name: 'Svelte and SvelteKit', slug: 'svelte-sveltekit', description: 'Build modern web apps with the fastest framework.', price: 4499, inventory: 100, isActive: true },
    { categoryId: insertedCategories[3].id, name: 'Plant Pot Set', slug: 'plant-pot-set', description: 'Set of 3 ceramic pots in earth tones.', price: 3499, inventory: 45, isActive: true },
    { categoryId: insertedCategories[3].id, name: 'LED Desk Lamp', slug: 'led-desk-lamp', description: 'Adjustable brightness, USB charging port.', price: 5999, inventory: 70, isActive: true },
  ];

  const insertedProducts = await db.insert(products).values(
    productData.map(p => ({
      ...p,
      createdAt: new Date(),
      updatedAt: new Date()
    }))
  ).returning();

  console.log(`Created ${insertedProducts.length} products`);
  console.log('Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "test:unit": "vitest",
    "test:e2e": "playwright test",
    "seed": "npx tsx scripts/seed.ts",
    "db:generate": "npx drizzle-kit generate",
    "db:migrate": "npx drizzle-kit migrate",
    "db:studio": "npx drizzle-kit studio",
    "db:reset": "rm -rf data/store.db && npm run db:migrate && npm run seed",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

Install tsx for running TypeScript scripts directly:

```bash
npm install -D tsx
```

### Running the Complete Setup

```bash
# Create the data directory
mkdir -p data

# Generate migration SQL, apply it, and seed data
npm run db:migrate
npm run seed
```

Verify with Drizzle Studio:

```bash
npm run db:studio
```

## Utility Functions

Create common utilities that you will use throughout the project:

```typescript
// src/lib/utils/format.ts
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date);
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
```

## Verification Checklist

Before writing any feature code, verify that every piece of the foundation works:

```bash
# 1. Verify the dev server starts without errors
npm run dev

# 2. Verify Tailwind is working
# Add <p class="text-brand-500 text-2xl font-bold">Tailwind works!</p> to +page.svelte

# 3. Verify database connection
npx drizzle-kit studio  # Browse your tables

# 4. Verify migrations ran
npx drizzle-kit migrate  # Should say "nothing to migrate"

# 5. Verify seed data
npm run seed  # Should output product counts

# 6. Verify TypeScript types
npx tsc --noEmit  # Should produce zero errors
```

### WRONG: Skipping Verification

The most common setup failure is not verifying each layer independently. Developers scaffold the project, install dependencies, write configuration files, and then immediately start building features. When something breaks three days later, they cannot tell if the bug is in their feature code or in a misconfigured foundation. Verify each layer before building on top of it.

## Try It

Complete the full project setup on your machine:

1. Scaffold a new SvelteKit project with TypeScript, Prettier, ESLint, Vitest, and Playwright
2. Install all dependencies (Tailwind v4, Drizzle with SQLite, bcryptjs, Zod)
3. Configure Tailwind v4 with the Vite plugin and a custom `@theme` block containing brand colors and fonts
4. Set up Drizzle with a SQLite database connection
5. Create the complete schema with users, sessions, categories, products, orders, and order items
6. Build the auth module with password hashing, session creation, and session validation
7. Create the hooks middleware for session validation
8. Create the folder structure with route groups for `(store)`, `(admin)`, and `(auth)`
9. Create and populate a `.env` file (and verify it is in `.gitignore`)
10. Fill in `app.d.ts` with types for `Locals` and `Error`
11. Generate and run your first migration
12. Write a seed script that creates an admin user, 4 categories, and 10 products
13. Build the store layout with header navigation showing auth state
14. Run through the verification checklist: dev server, Tailwind rendering, Drizzle Studio, TypeScript check

## Key Takeaways

- **Install all known dependencies upfront** -- incremental installation wastes time and causes version mismatches
- **Tailwind v4 uses the `@theme` directive** in CSS, not `tailwind.config.js` -- all design tokens live in your CSS file
- **Plugin order matters in Vite** -- `tailwindcss()` must come before `sveltekit()` in the plugins array
- **Use `$env/static/private`** for database URLs and secrets, never `process.env` directly (except in `drizzle.config.ts` which runs outside SvelteKit)
- **SQLite is production-viable** and eliminates database server configuration -- switch to PostgreSQL later if needed without rewriting queries
- **The `$lib/server` boundary is compiler-enforced** -- it prevents server-only code from leaking to the client bundle
- **Route groups** `(store)`, `(admin)`, `(auth)` share layouts without affecting URLs -- essential for applications with multiple UI contexts
- **Reactive state files use `.svelte.ts`** extension -- without it, `$state` and `$derived` runes are not recognized
- **Store prices as integers (cents)** to avoid floating-point precision errors in financial calculations
- **Build auth from scratch** with bcrypt + session cookies + database-backed sessions -- the same pattern production auth libraries use internally
- **Create a seed script early** -- developing against an empty database wastes time and hides bugs
- **Verify each foundation layer independently** before building features on top of it
