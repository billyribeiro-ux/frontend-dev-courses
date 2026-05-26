# Database Design

A well-designed database is the foundation of a reliable application. If your schema is wrong, everything built on top of it becomes harder -- queries get complicated, data gets inconsistent, and migrations become painful. In this lesson you will design the complete database schema for an e-commerce SaaS application: users, organizations, products, orders, subscriptions, and everything in between.

We will use **Drizzle ORM** to define the schema in TypeScript, giving you type safety from the database all the way to your Svelte components. Every table, column, relationship, and index will be planned before you write any application code.

## Why Schema Design Comes First

Inexperienced developers jump straight into building UI and invent database tables on the fly. This leads to:

- **Inconsistent naming** -- some tables use plural, others singular, some columns use camelCase, others snake_case.
- **Missing constraints** -- no unique indexes on email, no foreign keys, no NOT NULL where it matters.
- **Expensive refactors** -- adding a relationship later means writing migrations against live data, which is orders of magnitude harder than getting it right upfront.
- **N+1 queries** -- poorly planned relationships force you into nested loops of database calls.

The investment you make in schema design pays back every single day of the project's life. A ten-minute schema conversation saves ten hours of migration debugging.

## Normalization and Denormalization Tradeoffs

Database normalization organizes data to reduce redundancy. There are several normal forms, but in practice you care about the first three.

**First Normal Form (1NF)** -- Every column holds a single atomic value. No arrays or comma-separated lists in a column. If a product has multiple tags, you need a separate `product_tags` table, not a `tags` text column with "electronics,sale,featured".

**Second Normal Form (2NF)** -- Every non-key column depends on the entire primary key. In an `order_items` table, the `product_name` depends on `product_id` alone, not on the composite key of `(order_id, product_id)`. So `product_name` belongs in the `products` table, not in `order_items`.

**Third Normal Form (3NF)** -- No non-key column depends on another non-key column. If you store `city` and `state` and `zip` in the `orders` table, `state` could theoretically be derived from `zip`. Strict 3NF would separate this, but in practice we keep shipping address fields together because the join cost is not worth the normalization gain.

**When to denormalize** -- Normalization optimizes for write consistency. Denormalization optimizes for read performance. In e-commerce, you denormalize in specific, deliberate places:

- **Snapshot the product price in `order_items`** -- The price at time of purchase must be preserved. If you only reference `products.price`, then changing a price retroactively alters historical order totals.
- **Store the product name in `order_items`** -- Same reasoning. If a product is renamed or deleted, old orders should still show what the customer actually bought.
- **Cache computed values** -- An `orders.total_cents` column duplicates what you could compute from `SUM(order_items.price * quantity)`, but it avoids joining and summing on every order list query.

The rule: normalize by default, denormalize with intention, and document why.

## Entity-Relationship Model

Before writing any Drizzle code, sketch the entity-relationship diagram. This is your blueprint.

```
users ──────────── 1:many ──────────── orders
users ──────────── many:1 ──────────── organizations
organizations ─── 1:many ──────────── subscriptions
products ────────── 1:many ──────────── order_items
products ────────── 1:many ──────────── product_images
products ────────── many:many ────────── tags (via product_tags)
categories ──────── 1:many ──────────── products
orders ─────────── 1:many ──────────── order_items
```

Key relationships to internalize:

- A **user** belongs to an **organization** (multi-tenant SaaS model). An organization has many users.
- An **organization** has many **subscriptions** (tracking billing history, plan changes).
- A **product** belongs to one **category** but can have many **tags** through a junction table.
- A **product** has many **product_images** with an ordering column.
- An **order** has many **order_items**. Each order item snapshots the price and product name at purchase time.
- A **user** has many **orders** (nullable for guest checkout).

## The Core Tables in Drizzle

Now translate the diagram into Drizzle ORM schema definitions. We will build every table, explain every decision, and add indexes for query performance.

### Enums

Define constrained value types first. Enums prevent invalid data at the database level, which is far more reliable than application-level validation alone.

```typescript
// src/lib/server/schema.ts
import {
  pgTable, serial, text, integer, boolean,
  timestamp, numeric, pgEnum, uniqueIndex, index
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ── Enums ─────────────────────────────────────────
export const userRoleEnum = pgEnum('user_role', ['customer', 'admin', 'owner']);

export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing', 'active', 'past_due', 'cancelled', 'paused'
]);
```

Why `owner` in user roles? In a SaaS model, the person who created the organization has elevated privileges (manage billing, delete the org). `admin` can manage products and orders but not billing. `customer` is a buyer account. Three levels cover most SaaS scenarios without over-engineering a full permissions system.

### Organizations

Multi-tenancy starts here. Every store is an organization, and all products, orders, and users are scoped to one.

```typescript
// ── Organizations ─────────────────────────────────
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  logoUrl: text('logo_url'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('org_slug_idx').on(table.slug)
]);
```

The `slug` is used in URLs (`/store/acme-widgets`). The `stripeCustomerId` links the organization to its Stripe billing account. The `updatedAt` column is critical for cache invalidation and debugging -- always include it.

### Users

```typescript
// ── Users ─────────────────────────────────────────
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  avatarUrl: text('avatar_url'),
  role: userRoleEnum('role').notNull().default('customer'),
  organizationId: integer('organization_id').references(() => organizations.id),
  emailVerifiedAt: timestamp('email_verified_at'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('user_email_idx').on(table.email),
  index('user_org_idx').on(table.organizationId)
]);
```

Design decisions worth noting:

- **`emailVerifiedAt`** -- A nullable timestamp is better than a boolean `isVerified`. You know *when* they verified, which helps with security auditing and customer support.
- **`lastLoginAt`** -- Useful for identifying inactive accounts and for admin dashboards.
- **`organizationId` is nullable** -- A customer who signs up to buy does not necessarily belong to an organization. Only store owners and admins do.
- **Index on `organizationId`** -- You will frequently query "all users in this organization," so this index makes that query fast.

### Categories

```typescript
// ── Categories ────────────────────────────────────
export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  imageUrl: text('image_url'),
  parentId: integer('parent_id'),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('category_slug_idx').on(table.slug),
  index('category_parent_idx').on(table.parentId)
]);
```

The `parentId` column enables nested categories (Electronics > Headphones > Wireless). The `position` column controls display order in navigation menus. Without a position column, you are stuck with alphabetical ordering, which rarely matches business needs.

Note that `parentId` references the same table (self-referencing foreign key). We omit the `.references()` call here because Drizzle has specific patterns for self-references that we handle in the relations block.

### Products

```typescript
// ── Products ──────────────────────────────────────
export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  shortDescription: text('short_description'),
  price: integer('price').notNull(),           // cents
  compareAtPrice: integer('compare_at_price'),  // original price for "sale" display
  costPrice: integer('cost_price'),             // what you paid (for margin calculation)
  sku: text('sku'),
  imageUrl: text('image_url'),
  categoryId: integer('category_id').references(() => categories.id),
  inStock: boolean('in_stock').notNull().default(true),
  stockQuantity: integer('stock_quantity').notNull().default(0),
  featured: boolean('featured').notNull().default(false),
  published: boolean('published').notNull().default(false),
  weight: integer('weight'),                    // grams, for shipping calculation
  metadata: text('metadata'),                   // JSON string for flexible extra data
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('product_slug_idx').on(table.slug),
  index('product_category_idx').on(table.categoryId),
  index('product_featured_idx').on(table.featured),
  index('product_published_idx').on(table.published),
  index('product_price_idx').on(table.price)
]);
```

**Store all prices in cents (integers).** Never use floating-point numbers for money. `$29.99` is stored as `2999`. JavaScript floating-point math produces results like `0.1 + 0.2 = 0.30000000000000004`, which is catastrophic in financial calculations. Integers eliminate this entirely.

**`compareAtPrice`** enables "was $49.99, now $29.99" sale pricing. It is nullable because not every product is on sale.

**`costPrice`** tracks your wholesale cost. `price - costPrice = margin`. This number never shows to customers but powers profit reports in the admin panel.

**`published`** separates draft products from live ones. New products start as unpublished so you can set them up without customers seeing half-finished listings.

**Index strategy** -- We index columns that appear in WHERE clauses: `categoryId` (filtering by category), `featured` (homepage featured products query), `published` (every public query filters by `published = true`), `price` (price range filters and sorting).

### Product Images

```typescript
// ── Product Images ────────────────────────────────
export const productImages = pgTable('product_images', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, {
    onDelete: 'cascade'
  }).notNull(),
  url: text('url').notNull(),
  altText: text('alt_text'),
  position: integer('position').notNull().default(0),
  isPrimary: boolean('is_primary').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('product_image_product_idx').on(table.productId),
  index('product_image_position_idx').on(table.productId, table.position)
]);
```

**`onDelete: 'cascade'`** means when a product is deleted, all its images are deleted too. Without this, you would have orphaned image records pointing to a product that no longer exists.

The composite index on `(productId, position)` lets the database return images for a given product in the correct order without an extra sort step.

### Tags (Many-to-Many)

Tags demonstrate the many-to-many pattern. A product can have many tags, and a tag can apply to many products. The junction table `productTags` connects them.

```typescript
// ── Tags ──────────────────────────────────────────
export const tags = pgTable('tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique()
});

export const productTags = pgTable('product_tags', {
  productId: integer('product_id').references(() => products.id, {
    onDelete: 'cascade'
  }).notNull(),
  tagId: integer('tag_id').references(() => tags.id, {
    onDelete: 'cascade'
  }).notNull()
}, (table) => [
  // Composite primary key prevents duplicate tag assignments
  uniqueIndex('product_tag_unique').on(table.productId, table.tagId),
  index('product_tag_tag_idx').on(table.tagId)
]);
```

The junction table has no `id` column of its own. Its identity is the combination of `(productId, tagId)`. The unique index enforces that you cannot tag the same product with "sale" twice.

### Orders and Order Items

```typescript
// ── Orders ────────────────────────────────────────
export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(), // human-readable "ORD-2025-0042"
  userId: integer('user_id').references(() => users.id),
  status: orderStatusEnum('status').notNull().default('pending'),
  totalCents: integer('total_cents').notNull(),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxCents: integer('tax_cents').notNull().default(0),
  shippingCents: integer('shipping_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  currency: text('currency').notNull().default('USD'),
  // Shipping address (denormalized -- snapshot at time of order)
  shippingName: text('shipping_name').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  shippingAddress2: text('shipping_address_2'),
  shippingCity: text('shipping_city').notNull(),
  shippingState: text('shipping_state').notNull(),
  shippingZip: text('shipping_zip').notNull(),
  shippingCountry: text('shipping_country').notNull().default('US'),
  // Payment
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  paidAt: timestamp('paid_at'),
  // Tracking
  trackingNumber: text('tracking_number'),
  trackingCarrier: text('tracking_carrier'),
  shippedAt: timestamp('shipped_at'),
  deliveredAt: timestamp('delivered_at'),
  cancelledAt: timestamp('cancelled_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('order_number_idx').on(table.orderNumber),
  index('order_user_idx').on(table.userId),
  index('order_status_idx').on(table.status),
  index('order_created_idx').on(table.createdAt)
]);
```

Why snapshot the shipping address instead of referencing an `addresses` table? Because addresses change. A customer moves, updates their address, and suddenly every old order "shipped to" their new address in the UI. Snapshotting freezes the address at the moment of purchase.

**`orderNumber`** is a human-readable identifier like "ORD-2025-0042" that customers see in confirmation emails. The auto-incrementing `id` is an internal database detail that should never appear in customer-facing UI.

```typescript
// ── Order Items ───────────────────────────────────
export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').references(() => orders.id, {
    onDelete: 'cascade'
  }).notNull(),
  productId: integer('product_id').references(() => products.id).notNull(),
  // Snapshot fields -- these preserve the product state at purchase time
  productName: text('product_name').notNull(),
  productSlug: text('product_slug').notNull(),
  productImageUrl: text('product_image_url'),
  quantity: integer('quantity').notNull(),
  priceCents: integer('price_cents').notNull(),     // unit price at purchase
  totalCents: integer('total_cents').notNull(),       // priceCents * quantity
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('order_item_order_idx').on(table.orderId),
  index('order_item_product_idx').on(table.productId)
]);
```

Every piece of product information that the customer needs to see on their order confirmation is snapshotted here. This is intentional denormalization -- you are trading storage space for data integrity.

### Subscriptions

For SaaS billing, track subscription lifecycle:

```typescript
// ── Subscriptions ─────────────────────────────────
export const subscriptions = pgTable('subscriptions', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id, {
    onDelete: 'cascade'
  }).notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  stripePriceId: text('stripe_price_id').notNull(),
  status: subscriptionStatusEnum('status').notNull().default('trialing'),
  planName: text('plan_name').notNull(),             // "Starter", "Pro", "Enterprise"
  currentPeriodStart: timestamp('current_period_start').notNull(),
  currentPeriodEnd: timestamp('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  cancelledAt: timestamp('cancelled_at'),
  trialEnd: timestamp('trial_end'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
}, (table) => [
  uniqueIndex('sub_stripe_idx').on(table.stripeSubscriptionId),
  index('sub_org_idx').on(table.organizationId),
  index('sub_status_idx').on(table.status)
]);
```

`cancelAtPeriodEnd` is distinct from the `cancelled` status. A user might cancel but still have access until the billing period ends. Stripe uses this same model, so mirroring it in your database keeps your data consistent with Stripe's webhook events.

### Sessions

For authentication, store server-side sessions:

```typescript
// ── Sessions ──────────────────────────────────────
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),                        // random token, not serial
  userId: integer('user_id').references(() => users.id, {
    onDelete: 'cascade'
  }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
}, (table) => [
  index('session_user_idx').on(table.userId),
  index('session_expires_idx').on(table.expiresAt)
]);
```

Session IDs are random strings, not sequential integers. Sequential IDs are guessable -- if your session ID is `42`, an attacker tries `43`. Random tokens (e.g., 32-byte hex strings) eliminate this attack vector.

## Defining Relations in Drizzle

Drizzle separates schema (tables and columns) from relations (how tables connect). Relations power the relational query API, which lets you fetch nested data without writing manual joins.

```typescript
// ── Relations ─────────────────────────────────────
export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id]
  }),
  orders: many(orders),
  sessions: many(sessions)
}));

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  subscriptions: many(subscriptions)
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: 'categoryParent'
  }),
  children: many(categories, { relationName: 'categoryParent' }),
  products: many(products)
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id]
  }),
  images: many(productImages),
  productTags: many(productTags)
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id]
  })
}));

export const productTagsRelations = relations(productTags, ({ one }) => ({
  product: one(products, {
    fields: [productTags.productId],
    references: [products.id]
  }),
  tag: one(tags, {
    fields: [productTags.tagId],
    references: [tags.id]
  })
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  productTags: many(productTags)
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

export const subscriptionsRelations = relations(subscriptions, ({ one }) => ({
  organization: one(organizations, {
    fields: [subscriptions.organizationId],
    references: [organizations.id]
  })
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id]
  })
}));
```

With relations defined, you can use Drizzle's relational query API:

```typescript
// Fetch a product with all its images and tags in one query
const product = await db.query.products.findFirst({
  where: eq(products.slug, 'wireless-headphones'),
  with: {
    images: {
      orderBy: [asc(productImages.position)]
    },
    category: true,
    productTags: {
      with: { tag: true }
    }
  }
});
```

This generates efficient SQL with JOINs rather than N+1 queries. Without the relational API, you would need to write this:

```typescript
// Without relational queries -- more verbose, same result
const product = await db.select().from(products)
  .where(eq(products.slug, 'wireless-headphones'))
  .limit(1);

const images = await db.select().from(productImages)
  .where(eq(productImages.productId, product[0].id))
  .orderBy(asc(productImages.position));

// ...and more queries for tags. This is what N+1 looks like.
```

## Index Strategy for Query Performance

Indexes speed up reads at the cost of slower writes. Every INSERT, UPDATE, and DELETE must update every index on the table. Here is how to think about indexing:

**Index columns that appear in WHERE clauses.** If you query `WHERE category_id = 5`, that column needs an index.

**Index columns used in ORDER BY.** Sorting without an index requires the database to load all matching rows and sort them in memory. With an index, the rows come out pre-sorted.

**Use composite indexes for multi-column queries.** If you always filter by `(published = true AND category_id = 5)`, a composite index on `(published, category_id)` is more efficient than two separate indexes.

**Do not over-index.** A table with 15 indexes has 15 structures to update on every write. For a products table with moderate traffic, 4-6 indexes is reasonable. For an `order_items` table that receives heavy writes during checkout, keep indexes minimal.

```typescript
// Example: composite index for the most common product query
// "Show me published products in this category, sorted by price"
index('product_catalog_idx').on(
  table.published,
  table.categoryId,
  table.price
)
```

This single index serves the most common storefront query. The database can use it to filter by `published`, then by `categoryId`, then return results pre-sorted by `price`.

## Database Connection Setup

Configure the database client that your entire application will use:

```typescript
// src/lib/server/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

// Connection pool configuration
const client = postgres(connectionString, {
  max: 10,              // max connections in the pool
  idle_timeout: 20,     // close idle connections after 20 seconds
  connect_timeout: 10   // fail fast if DB is unreachable
});

export const db = drizzle(client, { schema });
```

The `max: 10` pool size is a starting point. In serverless environments (Vercel), each function instance gets its own pool, so keep this low (3-5) to avoid exhausting database connection limits. On a traditional server, you can raise it to 20-50 depending on your database plan.

## Migration Strategy

Drizzle Kit generates SQL migration files from your TypeScript schema. Here is the workflow.

### Development Workflow

```bash
# After changing schema.ts, generate a migration
npx drizzle-kit generate

# Review the generated SQL in drizzle/XXXX_migration_name.sql
# ALWAYS review -- automated tools can generate destructive SQL

# Apply to your local database
npx drizzle-kit migrate

# Visualize your schema in Drizzle Studio
npx drizzle-kit studio
```

### Drizzle Configuration

```typescript
// drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/server/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!
  },
  // Useful options
  verbose: true,  // log generated SQL
  strict: true    // fail on destructive operations
});
```

The `strict: true` option is critical for production safety. It makes Drizzle Kit refuse to generate migrations that drop tables or columns. You must explicitly opt in to destructive changes.

### Production Migration Rules

1. **Never run `drizzle-kit push` in production.** It applies schema changes directly without generating migration files. You lose all audit trail.
2. **Always review generated SQL.** Automated tools can generate `ALTER TABLE ... DROP COLUMN` when you rename a column. They see "old column gone, new column added" rather than "column renamed."
3. **Test migrations on a staging database first.** Clone your production data to staging, run the migration, verify your app still works.
4. **Back up before migrating.** `pg_dump` your production database before every migration. Storage is cheap; lost data is not.
5. **Make migrations additive.** Add columns with defaults. Add tables. Add indexes. Avoid removing or renaming until you have verified no code references the old name.

```bash
# Production migration workflow
# 1. Back up
pg_dump $PRODUCTION_DATABASE_URL > backup-$(date +%Y%m%d-%H%M).sql

# 2. Run migrations
DATABASE_URL=$PRODUCTION_DATABASE_URL npx drizzle-kit migrate

# 3. Verify
DATABASE_URL=$PRODUCTION_DATABASE_URL npx drizzle-kit studio
```

## Comprehensive Seed Script

A seed script populates your database with realistic test data. Good seed data lets you develop and test without manually creating records through the UI every time you reset the database.

```typescript
// scripts/seed.ts
import { db } from '../src/lib/server/db';
import {
  organizations, users, categories, products,
  productImages, tags, productTags
} from '../src/lib/server/schema';
import { hash } from '@node-rs/argon2';

async function seed() {
  console.log('Seeding database...');

  // ── Organization ──────────────────────────────
  const [org] = await db.insert(organizations).values({
    name: 'Acme Store',
    slug: 'acme-store'
  }).returning();
  console.log(`Created organization: ${org.name}`);

  // ── Users ─────────────────────────────────────
  const passwordHash = await hash('password123');

  const [admin] = await db.insert(users).values({
    email: 'admin@acme.com',
    name: 'Alice Admin',
    passwordHash,
    role: 'owner',
    organizationId: org.id
  }).returning();

  await db.insert(users).values([
    {
      email: 'bob@customer.com',
      name: 'Bob Customer',
      passwordHash,
      role: 'customer'
    },
    {
      email: 'carol@customer.com',
      name: 'Carol Shopper',
      passwordHash,
      role: 'customer'
    }
  ]);
  console.log('Created users');

  // ── Categories ────────────────────────────────
  const categoryData = [
    { name: 'Electronics', slug: 'electronics', description: 'Gadgets and devices' },
    { name: 'Clothing', slug: 'clothing', description: 'Apparel and accessories' },
    { name: 'Home & Kitchen', slug: 'home-kitchen', description: 'Home goods' },
    { name: 'Books', slug: 'books', description: 'Physical and digital books' }
  ];

  const insertedCategories = await db.insert(categories)
    .values(categoryData)
    .returning();
  console.log(`Created ${insertedCategories.length} categories`);

  const catMap = Object.fromEntries(
    insertedCategories.map(c => [c.slug, c.id])
  );

  // ── Tags ──────────────────────────────────────
  const tagData = [
    { name: 'Sale', slug: 'sale' },
    { name: 'New Arrival', slug: 'new-arrival' },
    { name: 'Best Seller', slug: 'best-seller' },
    { name: 'Eco-Friendly', slug: 'eco-friendly' }
  ];

  const insertedTags = await db.insert(tags)
    .values(tagData)
    .returning();

  const tagMap = Object.fromEntries(
    insertedTags.map(t => [t.slug, t.id])
  );

  // ── Products ──────────────────────────────────
  const productData = [
    {
      name: 'Wireless Headphones',
      slug: 'wireless-headphones',
      description: 'Premium noise-cancelling Bluetooth headphones with 30-hour battery life.',
      shortDescription: 'Noise-cancelling Bluetooth headphones',
      price: 9999,
      compareAtPrice: 12999,
      costPrice: 4500,
      sku: 'ELEC-WH-001',
      categoryId: catMap['electronics'],
      featured: true,
      published: true,
      stockQuantity: 150,
      inStock: true,
      weight: 250
    },
    {
      name: 'USB-C Hub',
      slug: 'usb-c-hub',
      description: '7-in-1 USB-C adapter with HDMI, USB 3.0, SD card reader, and 100W PD.',
      shortDescription: '7-in-1 USB-C adapter',
      price: 3499,
      costPrice: 1200,
      sku: 'ELEC-UC-001',
      categoryId: catMap['electronics'],
      published: true,
      stockQuantity: 300,
      inStock: true,
      weight: 85
    },
    {
      name: 'Merino Wool Sweater',
      slug: 'merino-wool-sweater',
      description: 'Lightweight merino wool crew neck sweater. Temperature regulating and odor resistant.',
      shortDescription: 'Merino wool crew neck',
      price: 8900,
      compareAtPrice: 11900,
      costPrice: 3200,
      sku: 'CLO-MW-001',
      categoryId: catMap['clothing'],
      featured: true,
      published: true,
      stockQuantity: 75,
      inStock: true,
      weight: 300
    },
    {
      name: 'Cast Iron Skillet',
      slug: 'cast-iron-skillet',
      description: 'Pre-seasoned 12-inch cast iron skillet. Oven safe to 500 degrees.',
      shortDescription: '12-inch pre-seasoned skillet',
      price: 4499,
      costPrice: 1800,
      sku: 'HOME-CI-001',
      categoryId: catMap['home-kitchen'],
      published: true,
      stockQuantity: 200,
      inStock: true,
      weight: 3600
    },
    {
      name: 'TypeScript Design Patterns',
      slug: 'typescript-design-patterns',
      description: 'Comprehensive guide to design patterns implemented in modern TypeScript.',
      shortDescription: 'Design patterns in TypeScript',
      price: 3999,
      costPrice: 500,
      sku: 'BOOK-TS-001',
      categoryId: catMap['books'],
      published: true,
      stockQuantity: 999,
      inStock: true,
      weight: 450
    }
  ];

  const insertedProducts = await db.insert(products)
    .values(productData)
    .returning();
  console.log(`Created ${insertedProducts.length} products`);

  // ── Product Images ────────────────────────────
  for (const product of insertedProducts) {
    await db.insert(productImages).values([
      {
        productId: product.id,
        url: `https://placehold.co/800x800?text=${encodeURIComponent(product.name)}`,
        altText: product.name,
        position: 0,
        isPrimary: true
      },
      {
        productId: product.id,
        url: `https://placehold.co/800x800?text=${encodeURIComponent(product.name)}+Side`,
        altText: `${product.name} - side view`,
        position: 1,
        isPrimary: false
      }
    ]);
  }
  console.log('Created product images');

  // ── Product Tags ──────────────────────────────
  const productMap = Object.fromEntries(
    insertedProducts.map(p => [p.slug, p.id])
  );

  await db.insert(productTags).values([
    { productId: productMap['wireless-headphones'], tagId: tagMap['best-seller'] },
    { productId: productMap['wireless-headphones'], tagId: tagMap['sale'] },
    { productId: productMap['merino-wool-sweater'], tagId: tagMap['new-arrival'] },
    { productId: productMap['merino-wool-sweater'], tagId: tagMap['eco-friendly'] },
    { productId: productMap['cast-iron-skillet'], tagId: tagMap['best-seller'] },
    { productId: productMap['typescript-design-patterns'], tagId: tagMap['new-arrival'] }
  ]);
  console.log('Created product tags');

  console.log('\nSeed complete!');
  console.log(`  Admin login: admin@acme.com / password123`);
  console.log(`  Customer login: bob@customer.com / password123`);
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
```

Add the seed command to your `package.json`:

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio",
    "db:seed": "tsx scripts/seed.ts",
    "db:reset": "tsx scripts/reset.ts && npm run db:migrate && npm run db:seed"
  }
}
```

The `db:reset` command is a development convenience that drops all tables, re-runs migrations, and re-seeds. Never run this against production.

## Type Inference from Schema

One of Drizzle's best features is inferring TypeScript types directly from your schema. These types flow through your entire application, from server load functions to Svelte components.

```typescript
// src/lib/types.ts
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type {
  users, products, orders, orderItems,
  categories, productImages, organizations
} from '$lib/server/schema';

// Select types (what you get when reading from the database)
export type User = InferSelectModel<typeof users>;
export type Product = InferSelectModel<typeof products>;
export type Order = InferSelectModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type Category = InferSelectModel<typeof categories>;
export type ProductImage = InferSelectModel<typeof productImages>;
export type Organization = InferSelectModel<typeof organizations>;

// Insert types (what you provide when writing to the database)
export type NewUser = InferInsertModel<typeof users>;
export type NewProduct = InferInsertModel<typeof products>;
export type NewOrder = InferInsertModel<typeof orders>;

// Composite types for common queries
export type ProductWithCategory = Product & {
  category: Category | null;
};

export type ProductWithDetails = Product & {
  category: Category | null;
  images: ProductImage[];
  tags: { tag: { name: string; slug: string } }[];
};

export type OrderWithItems = Order & {
  items: OrderItem[];
};
```

These types eliminate an entire class of bugs. When your load function returns a `ProductWithCategory`, the Svelte component knows exactly what fields are available. No guessing, no runtime errors from accessing `product.categoryName` when the field is actually called `category.name`.

## Try It

1. Add a `reviews` table to the schema that stores customer product reviews. Include columns for `rating` (1-5), `title`, `body`, `userId`, `productId`, `isVerified` (whether the reviewer actually purchased the product), and `createdAt`. Add proper foreign keys, an index on `productId` for fetching all reviews for a product, and a unique constraint preventing the same user from reviewing the same product twice. Define the Drizzle relations for this table.

2. Add a `coupons` table with columns for `code` (unique), `discountType` (enum: 'percentage' or 'fixed'), `discountValue` (integer), `minOrderCents` (minimum order amount to apply), `maxUses` (nullable -- null means unlimited), `currentUses`, `expiresAt`, and `isActive`. Think about which columns need indexes.

3. Update the seed script to insert 3 sample reviews and 2 sample coupon codes.

## Key Takeaways

- Design your database schema before writing application code -- the upfront investment prevents expensive refactors later
- Normalize by default and denormalize with intention, documenting every denormalization decision
- Store all monetary values in cents (integers) to avoid floating-point rounding errors that corrupt financial data
- Snapshot mutable data in order records -- prices, names, and addresses must be frozen at the time of purchase
- Use enums for constrained values like user roles and order statuses to enforce data integrity at the database level
- Index columns that appear in WHERE and ORDER BY clauses, but do not over-index write-heavy tables
- Define Drizzle relations to power the relational query API and avoid N+1 query patterns
- Use `InferSelectModel` and `InferInsertModel` to derive TypeScript types directly from your schema
- Treat migrations as production artifacts -- review generated SQL, test on staging, back up before applying
- Build comprehensive seed scripts that create realistic test data for every table and relationship
