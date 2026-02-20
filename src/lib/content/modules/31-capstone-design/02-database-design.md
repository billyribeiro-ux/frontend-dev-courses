# Database Design

A well-designed database is the foundation of a reliable application. If your schema is wrong, everything built on top of it becomes harder — queries get complicated, data gets inconsistent, and migrations become painful. In this lesson you will design the complete database schema for the e-commerce store.

We will use **Drizzle ORM** to define the schema in TypeScript, giving you type safety from the database all the way to your Svelte components. Every table, column, and relationship will be planned before you write any application code.

## The Core Tables

An e-commerce store needs these fundamental tables:

```
users          → Customer and admin accounts
products       → Items for sale
categories     → Product groupings
orders         → Purchase records
order_items    → Individual items within an order
```

## Designing Relationships

Before writing code, map out how tables connect:

```
users ──────── 1:many ──────── orders
products ───── 1:many ──────── order_items
categories ─── 1:many ──────── products
orders ──────── 1:many ──────── order_items
```

A user has many orders. Each order has many order items. Each order item references a product. Each product belongs to a category.

## Drizzle Schema Definitions

Define each table with Drizzle's schema builder:

```typescript
// src/lib/server/schema.ts
import {
  pgTable, serial, text, integer, boolean,
  timestamp, numeric, pgEnum
} from 'drizzle-orm/pg-core';

// Enums
export const userRoleEnum = pgEnum('user_role', ['customer', 'admin']);
export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'
]);

// Users
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').notNull().default('customer'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Categories
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url')
});

// Products
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  price: integer('price').notNull(), // Store in cents
  imageUrl: text('image_url'),
  categoryId: integer('category_id').references(() => categories.id),
  inStock: boolean('in_stock').notNull().default(true),
  featured: boolean('featured').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

// Orders
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalCents: integer('total_cents').notNull(),
  shippingName: text('shipping_name').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  shippingCity: text('shipping_city').notNull(),
  shippingState: text('shipping_state').notNull(),
  shippingZip: text('shipping_zip').notNull(),
  stripePaymentId: text('stripe_payment_id'),
  createdAt: timestamp('created_at').defaultNow().notNull()
});

// Order Items
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  quantity: integer('quantity').notNull(),
  priceCents: integer('price_cents').notNull() // Price at time of purchase
});
```

## Key Design Decisions

**Store prices in cents** — Never use floating-point numbers for money. `$29.99` is stored as `2999`. This avoids rounding errors.

**Snapshot the price in order_items** — The `priceCents` column in `order_items` captures the price at the time of purchase. If you later change the product's price, existing orders are not affected.

**Use slugs for URLs** — A product named "Blue Running Shoes" gets the slug `blue-running-shoes` for clean URLs like `/products/blue-running-shoes`.

**Soft references for userId** — The `userId` in orders is nullable to support guest checkout in the future.

## Running Migrations

Generate and run migrations with Drizzle Kit:

```bash
# Generate a migration from your schema
npx drizzle-kit generate

# Apply the migration to your database
npx drizzle-kit migrate

# Open Drizzle Studio to browse your database
npx drizzle-kit studio
```

Your `drizzle.config.ts` should point to your schema and database:

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
```

## Seeding Test Data

Create a seed script to populate your database for development:

```typescript
// scripts/seed.ts
import { db } from '../src/lib/server/db';
import { categories, products } from '../src/lib/server/schema';

async function seed() {
  const [electronics] = await db.insert(categories).values({
    name: 'Electronics',
    slug: 'electronics',
    description: 'Gadgets and devices'
  }).returning();

  await db.insert(products).values([
    {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Premium noise-cancelling headphones',
      price: 9999,
      categoryId: electronics.id,
      featured: true
    },
    {
      name: 'USB-C Hub',
      slug: 'usb-c-hub',
      description: '7-in-1 USB-C adapter',
      price: 3499,
      categoryId: electronics.id
    }
  ]);

  console.log('Seeded successfully!');
}

seed();
```

## Try It

Add a `product_images` table to the schema that supports multiple images per product, with a `position` column for ordering and an `isPrimary` boolean. Write the Drizzle schema definition and generate a migration.

## Key Takeaways

- Design your database schema before writing application code
- Store monetary values in cents (integers) to avoid floating-point rounding errors
- Snapshot prices in order items so historical orders are not affected by price changes
- Use enums for constrained values like user roles and order statuses
- Use Drizzle Kit to generate and run migrations from your TypeScript schema
- Seed scripts make development faster by pre-populating your database with test data
