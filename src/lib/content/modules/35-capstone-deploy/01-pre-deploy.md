# Pre-Deploy Checklist

You have built an entire e-commerce store. Before pushing it live, you need to make sure nothing embarrassing, insecure, or broken ships to production. In this lesson you will audit environment variables, remove test data, plan your database migration, check SEO fundamentals, and review security.

Skipping this step is how stores launch with test card numbers in the footer, "Lorem ipsum" on the homepage, and admin passwords set to "password123." Take this seriously.

## Environment Variables Audit

Review every environment variable your app uses and make sure production values are ready:

```
Variable                  Dev Value              Production Value
─────────────────────────────────────────────────────────────────
DATABASE_URL              localhost:5432/...      Your hosted DB URL
STRIPE_SECRET_KEY         sk_test_...             sk_live_...
STRIPE_WEBHOOK_SECRET     whsec_test_...          whsec_live_...
PUBLIC_STRIPE_KEY          pk_test_...             pk_live_...
NODE_ENV                  development             production
```

Check these common mistakes:

```typescript
// src/lib/server/env-check.ts
// Run this during build or app startup

const required = [
  'DATABASE_URL',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

// Warn if still using test keys in production
if (process.env.NODE_ENV === 'production') {
  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    console.warn('WARNING: Using Stripe test key in production!');
  }
}
```

## Remove Test Data

Clean up seed data and test records before going live:

```typescript
// scripts/clean-for-production.ts
import { db } from '../src/lib/server/db';
import { orders, orderItems, users } from '../src/lib/server/schema';
import { sql } from 'drizzle-orm';

async function cleanTestData() {
  // Remove test orders
  await db.delete(orderItems);
  await db.delete(orders);

  // Remove test user accounts (keep admin)
  await db.execute(
    sql`DELETE FROM users WHERE role = 'customer' AND email LIKE '%@test.com'`
  );

  console.log('Test data cleaned');
}

cleanTestData();
```

Also check for hardcoded test values in your code:

```bash
# Search for common test artifacts
grep -r "sk_test_" src/
grep -r "localhost" src/lib/server/
grep -r "TODO" src/
grep -r "console.log" src/routes/
```

Remove or replace every match before deploying.

## Database Migration Plan

Your production database needs the same schema as development. Plan the migration carefully:

```bash
# 1. Generate migrations from your current schema
npx drizzle-kit generate

# 2. Review the generated SQL files in the drizzle/ folder
# Make sure no destructive changes (DROP TABLE, DROP COLUMN) are present

# 3. Test migrations against a staging database first
DATABASE_URL=your_staging_url npx drizzle-kit migrate

# 4. Back up your production database before migrating
pg_dump $PRODUCTION_DATABASE_URL > backup-$(date +%Y%m%d).sql

# 5. Run migrations on production
DATABASE_URL=$PRODUCTION_DATABASE_URL npx drizzle-kit migrate
```

## SEO Check

Verify that your pages are search-engine friendly:

```svelte
<!-- src/routes/(store)/products/[slug]/+page.svelte -->
<svelte:head>
  <title>{data.product.products.name} | Your Store</title>
  <meta name="description"
        content={data.product.products.description.slice(0, 160)} />
  <meta property="og:title" content={data.product.products.name} />
  <meta property="og:description" content={data.product.products.description} />
  <meta property="og:image" content={data.product.products.imageUrl} />
</svelte:head>
```

Check every page has:

```
SEO Checklist:
[ ] Unique <title> tag on every page
[ ] <meta name="description"> on every page
[ ] Open Graph tags for social sharing
[ ] Semantic HTML (h1, nav, main, footer)
[ ] Alt text on every image
[ ] Clean URLs with slugs, not IDs
[ ] A robots.txt file
[ ] A sitemap (optional but recommended)
```

## Security Review

Run through this security checklist before launch:

```
Security Checklist:
[ ] All secrets in environment variables, none hardcoded
[ ] .env is in .gitignore
[ ] Admin routes are protected server-side
[ ] Forms validate server-side with Zod
[ ] SQL injection prevented (Drizzle uses parameterized queries)
[ ] CSRF protection enabled (SvelteKit handles this by default)
[ ] Stripe webhook signature is verified
[ ] Session cookies are httpOnly and secure in production
[ ] No sensitive data in client-side JavaScript
[ ] File uploads are validated (type and size limits)
```

Verify your `.gitignore` includes everything sensitive:

```
# .gitignore
.env
.env.local
.env.production
node_modules/
static/uploads/
.DS_Store
```

## Try It

Create a pre-deploy script that automates the checks from this lesson. It should verify all required environment variables exist, search the codebase for common test artifacts (localhost URLs, TODO comments, console.log statements), run the TypeScript compiler to check for type errors, and output a pass/fail report. Run it with `npm run pre-deploy`.

## Key Takeaways

- Audit every environment variable and verify production values are set before deploying
- Remove all test data, seed records, and debug logging from your production build
- Always test database migrations against a staging database before running them in production
- Every public page needs proper title tags, meta descriptions, and Open Graph tags for SEO
- Security is not optional — verify admin protection, input validation, and secret handling before launch
- Automate your pre-deploy checks so they cannot be accidentally skipped
