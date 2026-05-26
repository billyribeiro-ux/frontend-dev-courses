# Pre-Deploy Checklist

You have built an entire e-commerce store. Before pushing it live, you need to make sure nothing embarrassing, insecure, or broken ships to production. In this lesson you will audit environment variables, harden security, verify performance budgets, set up error monitoring, configure analytics, plan your database migration, create health check endpoints, and build an automated pre-deploy script that catches every issue.

Skipping this step is how stores launch with test card numbers in the footer, "Lorem ipsum" on the homepage, admin passwords set to "password123," and Stripe in test mode while processing real orders. Take this seriously — every item in this lesson exists because someone shipped without checking it and paid the price.

## Environment Variables: $env/static vs $env/dynamic

SvelteKit provides two ways to access environment variables, and choosing the wrong one has real consequences.

**`$env/static/private`** and **`$env/static/public`** are inlined at build time. The values are baked into the compiled JavaScript. This means:
- They can be tree-shaken (unused variables are removed)
- They enable dead-code elimination (if `MODE === 'production'`, the dev-only branch is stripped)
- They cannot change without rebuilding the app

**`$env/dynamic/private`** and **`$env/dynamic/public`** are read at runtime. The values come from the process environment when the server handles a request. This means:
- They can change without rebuilding (set a new value and restart the server)
- They work with container orchestration (Docker, Kubernetes) where env vars are injected at deploy time
- They cannot be tree-shaken or dead-code eliminated

```typescript
// Use STATIC for values that never change between deploys
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SITE_URL } from '$env/static/public';

// Use DYNAMIC for values that vary by environment without rebuilding
import { env } from '$env/dynamic/private';
const dbUrl = env.DATABASE_URL; // Read at request time
```

**Decision guide:**
- API keys that are fixed per deployment: `$env/static/private`
- Feature flags that operations toggles without redeploy: `$env/dynamic/private`
- Public site URL, analytics IDs: `$env/static/public`
- Anything you want to change via dashboard/config without a new build: `$env/dynamic/private`

### Environment Variables Audit

Review every environment variable your app uses and make sure production values are ready:

```
Variable                  Dev Value              Production Value         Type
─────────────────────────────────────────────────────────────────────────────────
DATABASE_URL              localhost:5432/...      Your hosted DB URL       dynamic
STRIPE_SECRET_KEY         sk_test_...             sk_live_...              static
STRIPE_WEBHOOK_SECRET     whsec_test_...          whsec_live_...           static
PUBLIC_STRIPE_KEY          pk_test_...             pk_live_...              static
PUBLIC_SITE_URL           http://localhost:5173   https://yoursite.com     static
NODE_ENV                  development             production               auto
SENTRY_DSN                (empty)                 https://xxx@sentry.io    static
```

Create a startup validation script that crashes immediately if required variables are missing — do not let the app start in a broken state:

```typescript
// src/lib/server/env-check.ts
import { building } from '$app/environment';

// Skip during build — env vars may not be set in CI build step
if (!building) {
  const required: Record<string, string | undefined> = {
    DATABASE_URL: process.env.DATABASE_URL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET
  };

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Set them in .env (dev) or your hosting provider's dashboard (production).`
    );
  }

  // Warn if still using test keys in production
  if (process.env.NODE_ENV === 'production') {
    if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
      console.error(
        '╔══════════════════════════════════════════════════════════════╗\n' +
        '║  CRITICAL: Using Stripe TEST key in production!            ║\n' +
        '║  Payments will not be processed. Update STRIPE_SECRET_KEY. ║\n' +
        '╚══════════════════════════════════════════════════════════════╝'
      );
    }

    if (process.env.DATABASE_URL?.includes('localhost')) {
      console.error('WARNING: DATABASE_URL points to localhost in production!');
    }
  }
}
```

Import this file early — in your server hooks or root server layout:

```typescript
// src/hooks.server.ts
import '$lib/server/env-check';
// ... rest of hooks
```

## Build Optimization

Before deploying, verify your build is optimized:

```typescript
// svelte.config.js
import adapter from '@sveltejs/adapter-node'; // or adapter-vercel, adapter-cloudflare
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      // Node adapter options
      precompress: true, // Generate .gz and .br files for static assets
    }),
    // Prerender static pages
    prerender: {
      handleMissingId: 'warn',
      handleHttpError: ({ path, message }) => {
        // Don't fail the build for expected 404s
        if (path.startsWith('/api/')) return;
        throw new Error(message);
      }
    },
    // Content Security Policy nonce for inline scripts
    csp: {
      directives: {
        'script-src': ['self']
      }
    }
  }
};

export default config;
```

Analyze your bundle to identify bloat:

```bash
# Generate a bundle analysis
npx vite-bundle-visualizer

# Check for large dependencies
npx depcheck  # Find unused dependencies
```

Remove any packages you are not using. Every unused dependency is dead weight in your `node_modules` and a potential security vulnerability.

## Remove Test Data

Clean up seed data and test records before going live:

```typescript
// scripts/clean-for-production.ts
import { db } from '../src/lib/server/db';
import { orders, orderItems, users } from '../src/lib/server/schema';
import { sql } from 'drizzle-orm';

async function cleanTestData() {
  console.log('Cleaning test data...');

  // Remove test orders and their items
  const testOrders = await db.select({ id: orders.id })
    .from(orders)
    .where(sql`${orders.email} LIKE '%@test.com' OR ${orders.email} LIKE '%@example.com'`);

  if (testOrders.length > 0) {
    const testOrderIds = testOrders.map(o => o.id);
    await db.delete(orderItems).where(sql`${orderItems.orderId} IN (${testOrderIds.join(',')})`);
    await db.delete(orders).where(sql`${orders.id} IN (${testOrderIds.join(',')})`);
    console.log(`  Removed ${testOrders.length} test orders`);
  }

  // Remove test user accounts (keep admin accounts)
  const deleted = await db.execute(
    sql`DELETE FROM users WHERE role = 'customer' AND email LIKE '%@test.com'`
  );
  console.log(`  Removed test user accounts`);

  console.log('Test data cleaned.');
}

cleanTestData().catch(console.error);
```

Search your codebase for common test artifacts:

```bash
# Search for common test artifacts — every match must be addressed
grep -rn "sk_test_" src/
grep -rn "pk_test_" src/
grep -rn "whsec_test_" src/
grep -rn "localhost" src/lib/server/
grep -rn "TODO" src/routes/
grep -rn "FIXME" src/
grep -rn "HACK" src/
grep -rn "console\.log" src/routes/     # Remove debug logging from routes
grep -rn "console\.log" src/lib/server/ # Remove debug logging from server code
grep -rn "debugger" src/
grep -rn "password123" src/
grep -rn "Lorem ipsum" src/
```

Remove or replace every match before deploying.

## Security Audit

### HTTP Security Headers

Configure security headers in your server hooks. These prevent entire categories of attacks:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Prevent clickjacking — disallow embedding in iframes
  response.headers.set('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Control referrer information leaked to external sites
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Opt out of Google FLoC/Topics tracking
  response.headers.set('Permissions-Policy', 'interest-cohort=()');

  // Force HTTPS (set by your CDN/proxy if behind one)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  return response;
};

export const handle: Handle = sequence(securityHeaders, /* ...other hooks */);
```

### Content Security Policy (CSP)

CSP prevents cross-site scripting (XSS) by controlling which resources the browser is allowed to load. It is the single most effective defense against XSS:

```typescript
// src/hooks.server.ts
const cspHeader: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Build CSP based on environment
  const isDev = import.meta.env.DEV;

  const csp = [
    "default-src 'self'",
    // Allow scripts from self and Stripe
    `script-src 'self' https://js.stripe.com ${isDev ? "'unsafe-inline' 'unsafe-eval'" : ''}`,
    // Allow styles from self (SvelteKit inlines scoped styles)
    "style-src 'self' 'unsafe-inline'",
    // Allow images from self, your CDN, and common image hosts
    "img-src 'self' https://res.cloudinary.com https://openweathermap.org data:",
    // Allow fonts from self
    "font-src 'self'",
    // Allow API calls to self and Stripe
    "connect-src 'self' https://api.stripe.com https://*.sentry.io",
    // Allow Stripe iframe for payment elements
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    // Block all object/embed/applet elements
    "object-src 'none'",
    // Restrict form targets
    "form-action 'self'",
    // Block base tag hijacking
    "base-uri 'self'"
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  return response;
};
```

### CORS Configuration

If your API is consumed by other domains, configure CORS explicitly:

```typescript
// src/routes/api/[...path]/+server.ts
import type { RequestHandler } from './$types';

const ALLOWED_ORIGINS = [
  'https://yoursite.com',
  'https://admin.yoursite.com'
];

export const OPTIONS: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin') ?? '';

  if (!ALLOWED_ORIGINS.includes(origin)) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400' // Cache preflight for 24 hours
    }
  });
};
```

### Rate Limiting

Protect your API from abuse with rate limiting. Without a dedicated rate limiting library, you can implement a simple in-memory limiter:

```typescript
// src/lib/server/rate-limit.ts
type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const store = new Map<string, RateLimitEntry>();

// Clean expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}, 5 * 60 * 1000);

export function rateLimit(
  identifier: string,
  { maxRequests = 60, windowMs = 60_000 } = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(identifier);

  if (!entry || entry.resetAt < now) {
    // New window
    store.set(identifier, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  entry.count++;

  if (entry.count > maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}
```

Apply it in hooks or specific endpoints:

```typescript
// src/hooks.server.ts
import { rateLimit } from '$lib/server/rate-limit';

const rateLimitHook: Handle = async ({ event, resolve }) => {
  // Only rate-limit API routes
  if (event.url.pathname.startsWith('/api/')) {
    const ip = event.getClientAddress();
    const { allowed, remaining, resetAt } = rateLimit(ip, {
      maxRequests: 100,
      windowMs: 60_000
    });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)),
          'X-RateLimit-Remaining': '0'
        }
      });
    }

    const response = await resolve(event);
    response.headers.set('X-RateLimit-Remaining', String(remaining));
    return response;
  }

  return resolve(event);
};
```

**Production note:** In-memory rate limiting does not work with multiple server instances (each instance has its own Map). For multi-instance deployments, use Redis or a managed rate limiting service (Cloudflare, AWS WAF).

### Security Checklist

```
Security Checklist:
[ ] All secrets in environment variables, none hardcoded in source
[ ] .env, .env.local, .env.production are in .gitignore
[ ] Admin routes are protected server-side (not just hidden in the UI)
[ ] All form inputs validated server-side with Zod (client validation is UX, not security)
[ ] SQL injection prevented (Drizzle uses parameterized queries by default)
[ ] CSRF protection enabled (SvelteKit handles this automatically for form actions)
[ ] Stripe webhook signatures are verified before processing
[ ] Session cookies are httpOnly, secure, sameSite: 'lax' in production
[ ] No sensitive data exposed in client-side JavaScript or HTML source
[ ] File uploads validated for type, size, and content (not just extension)
[ ] HTTP security headers configured (X-Frame-Options, CSP, HSTS, etc.)
[ ] Rate limiting on auth endpoints and API routes
[ ] Error messages do not leak implementation details (no stack traces in production)
[ ] Dependencies audited: run npm audit and address critical/high vulnerabilities
```

## Performance Budget Verification

Before deploying, verify your app meets performance targets:

```typescript
// scripts/verify-performance.ts
import { execSync } from 'child_process';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const BUDGETS = {
  totalJsKb: 200,
  totalCssKb: 50,
  maxChunkKb: 50,
  maxImageKb: 300,
  lighthousePerformance: 90,
  lighthouseAccessibility: 95,
  lighthouseSeo: 95
};

function getFileSizes(dir: string, ext: string): { name: string; sizeKb: number }[] {
  const results: { name: string; sizeKb: number }[] = [];
  function walk(d: string) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(ext)) {
        results.push({ name: entry.name, sizeKb: statSync(full).size / 1024 });
      }
    }
  }
  walk(dir);
  return results;
}

console.log('Verifying performance budgets...\n');

const buildDir = 'build/client'; // Adjust for your adapter
let failures = 0;

// Check JS bundles
const jsFiles = getFileSizes(buildDir, '.js');
const totalJs = jsFiles.reduce((sum, f) => sum + f.sizeKb, 0);
console.log(`Total JS: ${totalJs.toFixed(1)}KB (budget: ${BUDGETS.totalJsKb}KB)`);
if (totalJs > BUDGETS.totalJsKb) { console.error('  OVER BUDGET'); failures++; }

for (const f of jsFiles) {
  if (f.sizeKb > BUDGETS.maxChunkKb) {
    console.error(`  Chunk ${f.name}: ${f.sizeKb.toFixed(1)}KB exceeds ${BUDGETS.maxChunkKb}KB`);
    failures++;
  }
}

// Check CSS
const cssFiles = getFileSizes(buildDir, '.css');
const totalCss = cssFiles.reduce((sum, f) => sum + f.sizeKb, 0);
console.log(`Total CSS: ${totalCss.toFixed(1)}KB (budget: ${BUDGETS.totalCssKb}KB)`);
if (totalCss > BUDGETS.totalCssKb) { console.error('  OVER BUDGET'); failures++; }

if (failures > 0) {
  console.error(`\n${failures} budget violation(s) found. Fix before deploying.`);
  process.exit(1);
} else {
  console.log('\nAll performance budgets passed.');
}
```

## Error Monitoring with Sentry

In production, `console.error` is invisible. You need a monitoring service to capture errors, group them by cause, and alert you. Sentry is the most widely used option for SvelteKit:

```bash
npx @sentry/wizard@latest -i sveltekit
```

This wizard configures most things automatically. Here is what the manual setup looks like and why each piece matters:

```typescript
// src/hooks.client.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/your-project-id',
  environment: import.meta.env.MODE, // 'production', 'staging', etc.

  // Capture 10% of transactions for performance monitoring
  tracesSampleRate: 0.1,

  // Capture 100% of errors (you want to see every error)
  // Reduce to 0.5 if you have very high traffic
  sampleRate: 1.0,

  // Filter out noise — errors you cannot fix
  beforeSend(event) {
    // Ignore browser extension errors
    if (event.exception?.values?.[0]?.stacktrace?.frames?.some(
      frame => frame.filename?.includes('extension')
    )) {
      return null;
    }
    return event;
  },

  // Add user context for debugging
  integrations: [
    Sentry.replayIntegration({
      // Capture 10% of sessions, 100% of sessions with errors
      maskAllText: true,
      blockAllMedia: true
    })
  ],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
});
```

```typescript
// src/hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/your-project-id',
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.1
});

// Wrap your handle hook with Sentry
export const handle = Sentry.sentryHandle();

// Custom error handler — Sentry captures these automatically
export const handleError = Sentry.handleErrorWithSentry(({ error, event }) => {
  // Log context for debugging
  console.error('Unhandled error:', error);
  console.error('Request:', event.url.pathname);

  return {
    message: 'An unexpected error occurred. Our team has been notified.',
    // Never expose the real error message to users in production
  };
});
```

Add user context so you can identify which customer hit an error:

```typescript
// In your auth hook or layout server load
Sentry.setUser({
  id: user.id,
  email: user.email
  // Do NOT include PII you do not need (full name, address, etc.)
});
```

## Analytics

Track business metrics alongside performance metrics:

```typescript
// src/lib/analytics/events.ts

type AnalyticsEvent =
  | { name: 'page_view'; properties: { path: string; referrer: string } }
  | { name: 'product_viewed'; properties: { productId: string; price: number } }
  | { name: 'add_to_cart'; properties: { productId: string; quantity: number } }
  | { name: 'checkout_started'; properties: { cartTotal: number; itemCount: number } }
  | { name: 'purchase_completed'; properties: { orderId: string; total: number } }
  | { name: 'search'; properties: { query: string; resultCount: number } };

class Analytics {
  #queue: AnalyticsEvent[] = [];
  #flushTimer: ReturnType<typeof setTimeout> | null = null;

  track(event: AnalyticsEvent) {
    this.#queue.push(event);

    // Batch events and send every 5 seconds
    if (!this.#flushTimer) {
      this.#flushTimer = setTimeout(() => this.flush(), 5000);
    }
  }

  flush() {
    if (this.#queue.length === 0) return;

    const events = [...this.#queue];
    this.#queue = [];
    this.#flushTimer = null;

    // Use sendBeacon so events survive page navigation
    const body = JSON.stringify({ events, timestamp: Date.now() });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/analytics/events', body);
    } else {
      fetch('/api/analytics/events', { method: 'POST', body, keepalive: true });
    }
  }
}

export const analytics = new Analytics();
```

Track page views automatically in the root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { analytics } from '$lib/analytics/events';
  import { browser } from '$app/environment';

  let { children } = $props();

  $effect(() => {
    if (browser) {
      analytics.track({
        name: 'page_view',
        properties: {
          path: page.url.pathname,
          referrer: document.referrer
        }
      });
    }
  });
</script>

{@render children()}
```

## Database Migration Strategy

Your production database needs the same schema as development. A botched migration can take your store offline and lose data. Plan carefully.

```bash
# 1. Generate migrations from your current schema
npx drizzle-kit generate

# 2. Review the generated SQL files in the drizzle/ folder
#    READ EVERY LINE. Check for:
#    - DROP TABLE or DROP COLUMN (data loss!)
#    - Column type changes that might truncate data
#    - NOT NULL constraints on columns that have existing NULL values

# 3. Test against a staging database with production-like data
DATABASE_URL=$STAGING_DATABASE_URL npx drizzle-kit migrate

# 4. Verify the staging database looks correct
# Run your app against staging and click through every feature

# 5. Back up production before migrating — this is non-negotiable
pg_dump $PRODUCTION_DATABASE_URL > backup-$(date +%Y%m%d-%H%M%S).sql

# 6. Run migrations on production during low-traffic hours
DATABASE_URL=$PRODUCTION_DATABASE_URL npx drizzle-kit migrate
```

**Zero-downtime migration strategy** for when you cannot afford even a minute of downtime:

1. **Add new columns/tables first** (non-breaking)
2. **Deploy code that writes to both old and new columns** (dual-write)
3. **Backfill the new columns** with data from the old columns
4. **Deploy code that reads from new columns** (switch read path)
5. **Deploy code that stops writing to old columns** (remove dual-write)
6. **Drop old columns in a future migration** (cleanup)

This process takes 3-4 deploys but ensures zero downtime and zero data loss.

## Health Check Endpoints

Health check endpoints let your load balancer, monitoring service, and deployment pipeline verify the app is running correctly:

```typescript
// src/routes/api/health/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
  const checks: Record<string, { status: 'ok' | 'error'; latencyMs?: number; error?: string }> = {};

  // Check database connectivity
  const dbStart = performance.now();
  try {
    await db.execute(sql`SELECT 1`);
    checks.database = { status: 'ok', latencyMs: Math.round(performance.now() - dbStart) };
  } catch (err) {
    checks.database = {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check Stripe connectivity
  const stripeStart = performance.now();
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` }
    });
    checks.stripe = {
      status: res.ok ? 'ok' : 'error',
      latencyMs: Math.round(performance.now() - stripeStart)
    };
  } catch (err) {
    checks.stripe = {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error'
    };
  }

  // Check disk space / memory (basic)
  checks.memory = {
    status: 'ok',
    latencyMs: 0
  };

  const allHealthy = Object.values(checks).every(c => c.status === 'ok');

  return json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? 'unknown',
      checks
    },
    { status: allHealthy ? 200 : 503 }
  );
};
```

A simpler liveness check for load balancers that just need a 200 OK:

```typescript
// src/routes/api/health/live/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return new Response('OK', { status: 200 });
};
```

Configure your hosting provider to hit `/api/health/live` every 30 seconds. If it returns non-200 three times in a row, the instance is unhealthy and should be replaced.

## SEO Check

Verify that your pages are search-engine friendly:

```svelte
<!-- src/routes/(store)/products/[slug]/+page.svelte -->
<svelte:head>
  <title>{data.product.products.name} | Your Store</title>
  <meta name="description"
        content={data.product.products.description.slice(0, 160)} />

  <!-- Open Graph for social sharing -->
  <meta property="og:type" content="product" />
  <meta property="og:title" content={data.product.products.name} />
  <meta property="og:description" content={data.product.products.description} />
  <meta property="og:image" content={data.product.products.imageUrl} />
  <meta property="og:url" content={`https://yourstore.com/products/${data.product.products.slug}`} />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.product.products.name} />

  <!-- Canonical URL to avoid duplicate content -->
  <link rel="canonical" href={`https://yourstore.com/products/${data.product.products.slug}`} />

  <!-- Structured data for rich search results -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": data.product.products.name,
    "description": data.product.products.description,
    "image": data.product.products.imageUrl,
    "offers": {
      "@type": "Offer",
      "price": (data.product.products.priceInCents / 100).toFixed(2),
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  })}</script>`}
</svelte:head>
```

```
SEO Checklist:
[ ] Unique <title> tag on every page (50-60 characters)
[ ] <meta name="description"> on every page (150-160 characters)
[ ] Open Graph tags for social sharing (og:title, og:description, og:image)
[ ] Twitter Card meta tags
[ ] Canonical URLs on all pages
[ ] Structured data (JSON-LD) for products and articles
[ ] Semantic HTML (h1 once per page, nav, main, footer)
[ ] Alt text on every image (descriptive, not keyword-stuffed)
[ ] Clean URLs with slugs, not IDs (/products/blue-widget, not /products/42)
[ ] A robots.txt file at the root
[ ] A sitemap.xml (auto-generate from your routes)
[ ] No broken links — run a link checker before launch
```

## Complete Pre-Deploy Script

Automate every check into a single script:

```typescript
// scripts/pre-deploy.ts
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';

type CheckResult = { name: string; status: 'pass' | 'fail' | 'warn'; message: string };
const results: CheckResult[] = [];

function check(name: string, fn: () => string | null) {
  try {
    const warning = fn();
    if (warning) {
      results.push({ name, status: 'warn', message: warning });
    } else {
      results.push({ name, status: 'pass', message: '' });
    }
  } catch (err) {
    results.push({
      name,
      status: 'fail',
      message: err instanceof Error ? err.message : String(err)
    });
  }
}

// 1. TypeScript compilation
check('TypeScript', () => {
  execSync('npx svelte-check --threshold error', { stdio: 'pipe' });
  return null;
});

// 2. Required environment variables
check('Environment Variables', () => {
  const required = ['DATABASE_URL', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const missing = required.filter(k => !process.env[k]);
  if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`);

  if (process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
    return 'Using Stripe TEST key — switch to live before real launch';
  }
  return null;
});

// 3. Test artifacts
check('Test Artifacts', () => {
  const patterns = [
    { pattern: 'sk_test_', label: 'Stripe test keys' },
    { pattern: 'localhost', label: 'localhost references' },
    { pattern: 'TODO', label: 'TODO comments' },
    { pattern: 'console\\.log', label: 'console.log statements' },
    { pattern: 'debugger', label: 'debugger statements' }
  ];

  const warnings: string[] = [];
  for (const { pattern, label } of patterns) {
    try {
      const output = execSync(
        `grep -rn "${pattern}" src/routes/ src/lib/server/ --include="*.ts" --include="*.svelte" 2>/dev/null || true`,
        { encoding: 'utf-8' }
      );
      if (output.trim()) {
        const count = output.trim().split('\n').length;
        warnings.push(`${count} ${label} found`);
      }
    } catch { /* grep returns 1 when no matches — that is fine */ }
  }

  if (warnings.length > 0) return warnings.join(', ');
  return null;
});

// 4. .gitignore includes sensitive files
check('.gitignore', () => {
  if (!existsSync('.gitignore')) throw new Error('.gitignore file missing');
  const content = readFileSync('.gitignore', 'utf-8');
  const required = ['.env', 'node_modules'];
  const missing = required.filter(f => !content.includes(f));
  if (missing.length > 0) throw new Error(`Missing from .gitignore: ${missing.join(', ')}`);
  return null;
});

// 5. Build succeeds
check('Build', () => {
  execSync('npm run build', { stdio: 'pipe' });
  return null;
});

// 6. Tests pass
check('Tests', () => {
  try {
    execSync('npm test -- --run', { stdio: 'pipe' });
  } catch {
    throw new Error('Tests failed — fix before deploying');
  }
  return null;
});

// 7. Dependency audit
check('Security Audit', () => {
  try {
    execSync('npm audit --audit-level=high', { stdio: 'pipe' });
  } catch {
    return 'npm audit found high-severity vulnerabilities — review before deploying';
  }
  return null;
});

// Print results
console.log('\n╔══════════════════════════════════════════╗');
console.log('║         PRE-DEPLOY CHECK RESULTS         ║');
console.log('╚══════════════════════════════════════════╝\n');

for (const r of results) {
  const icon = r.status === 'pass' ? 'PASS' : r.status === 'warn' ? 'WARN' : 'FAIL';
  const color = r.status === 'pass' ? '\x1b[32m' : r.status === 'warn' ? '\x1b[33m' : '\x1b[31m';
  console.log(`${color}[${icon}]\x1b[0m ${r.name}${r.message ? ` — ${r.message}` : ''}`);
}

const failures = results.filter(r => r.status === 'fail');
const warnings = results.filter(r => r.status === 'warn');

console.log(`\n${results.length} checks: ${results.length - failures.length - warnings.length} passed, ${warnings.length} warnings, ${failures.length} failures`);

if (failures.length > 0) {
  console.error('\nDeploy blocked — fix failures before proceeding.');
  process.exit(1);
} else if (warnings.length > 0) {
  console.warn('\nDeploy allowed with warnings — review before proceeding.');
} else {
  console.log('\nAll checks passed. Safe to deploy.');
}
```

Add it to your package.json:

```json
{
  "scripts": {
    "pre-deploy": "tsx scripts/pre-deploy.ts",
    "deploy": "npm run pre-deploy && npm run build && npm run deploy:push"
  }
}
```

## Verify Your .gitignore

```
# .gitignore
.env
.env.*
!.env.example

node_modules/
build/
.svelte-kit/

# Uploaded files (should be in cloud storage, not git)
static/uploads/

# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/settings.json
.idea/

# Sentry auth token
.sentryclirc
```

## Try It

Create a comprehensive pre-deploy script that automates every check from this lesson. It should:

1. Verify all required environment variables exist and are not using test values
2. Search the codebase for test artifacts (localhost URLs, TODO comments, console.log statements, debugger keywords)
3. Run the TypeScript compiler to check for type errors
4. Run the test suite
5. Run `npm audit` for security vulnerabilities
6. Verify `.gitignore` includes `.env` and `node_modules`
7. Build the project and check that the build succeeds
8. Output a pass/fail report with color-coded results

Wire it up as `npm run pre-deploy` and run it. Fix every failure and warning it finds. Then set up a basic Sentry integration (free tier) and verify that errors are captured by intentionally throwing an error on a test page.

## Key Takeaways

- **`$env/static`** is inlined at build time (enables tree shaking); **`$env/dynamic`** is read at runtime (enables runtime configuration without rebuilds)
- **Audit every environment variable** — verify production values are set, test keys are replaced, and missing variables crash the app at startup rather than failing silently at runtime
- **Remove all test data**, seed records, debug logging, and TODO markers from the production codebase
- **Security headers** (CSP, HSTS, X-Frame-Options) prevent entire categories of attacks. Rate limiting protects against abuse. Configure both in server hooks
- **Database migrations** must be tested against staging first, production databases must be backed up before migration, and zero-downtime migrations use the add/dual-write/backfill/switch/cleanup pattern
- **Error monitoring** (Sentry) captures production errors with context, user info, and session replays. Without it, you are blind to what breaks after deploy
- **Health check endpoints** let your infrastructure verify the app is running and its dependencies (database, Stripe) are reachable
- **Every page needs proper SEO** — title, description, Open Graph tags, canonical URLs, and structured data for rich search results
- **Automate the checklist** — a `pre-deploy` script that runs every check ensures nothing is accidentally skipped, no matter how urgent the deploy
