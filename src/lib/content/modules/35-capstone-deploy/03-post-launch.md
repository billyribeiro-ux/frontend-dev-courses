# Post-Launch

Your store is live. Congratulations. But launching is not the finish line -- it is the starting line. The difference between a project and a product is what happens after deployment. In this lesson you will set up error monitoring, analytics, performance tracking, feature flags, A/B testing, database maintenance, incident response procedures, continuous deployment pipelines, and a user feedback system. These are the operational practices that separate hobby projects from production applications.

A launched store without monitoring is like a shop with no security cameras and no cash register receipts. You need visibility into what is happening -- and the ability to react when things go wrong.

## Vercel Analytics

Enable Vercel Analytics to track page views, visitor counts, and traffic sources:

```bash
npm install @vercel/analytics
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../app.css';
  import { dev } from '$app/environment';
  import { inject } from '@vercel/analytics';

  let { children } = $props();

  inject({ mode: dev ? 'development' : 'production' });
</script>

{@render children()}
```

Vercel Analytics provides:
- Page views and unique visitors
- Top pages by traffic
- Referral sources
- Country and device breakdowns
- No cookie banner required (privacy-friendly)

Enable it in the Vercel dashboard under your project's Analytics tab. The privacy-friendly aspect is significant -- Vercel Analytics does not use cookies, does not track users across sites, and is GDPR-compliant by default. This means you do not need a cookie consent banner for analytics alone, which improves the user experience.

## Vercel Speed Insights

Track real-user performance metrics with Speed Insights:

```bash
npm install @vercel/speed-insights
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import '../app.css';
  import { inject } from '@vercel/analytics';
  import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
  import { dev } from '$app/environment';

  let { children } = $props();

  inject({ mode: dev ? 'development' : 'production' });
  injectSpeedInsights();
</script>

{@render children()}
```

Speed Insights tracks Core Web Vitals from real users:

```
LCP  (Largest Contentful Paint)  -- How fast the main content loads
INP  (Interaction to Next Paint) -- How quickly the page responds to interaction
CLS  (Cumulative Layout Shift)   -- How much the layout shifts during loading
TTFB (Time to First Byte)        -- How fast the server responds
FCP  (First Contentful Paint)    -- When the first content appears on screen
```

Note: Google replaced FID (First Input Delay) with INP (Interaction to Next Paint) as a Core Web Vital in March 2024. INP measures the latency of all interactions during a page visit, not just the first one. Vercel Speed Insights tracks INP alongside the other metrics.

## Error Tracking with Sentry

Production errors are invisible unless you set up monitoring. Users rarely report bugs -- they just leave. Sentry is the industry standard for error tracking in JavaScript applications, and it has first-class SvelteKit support.

### Setting Up Sentry

```bash
npx @sentry/wizard@latest -i sveltekit
```

This wizard creates the necessary configuration files. If you prefer manual setup:

```bash
npm install @sentry/sveltekit
```

```typescript
// src/hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://your-dsn@o123.ingest.sentry.io/456',
  tracesSampleRate: 0.1,   // Sample 10% of transactions in production
  environment: process.env.NODE_ENV,
  
  // Filter out noise
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection',
    /Loading chunk \d+ failed/
  ],

  beforeSend(event) {
    // Scrub sensitive data before sending to Sentry
    if (event.request?.cookies) {
      delete event.request.cookies;
    }
    return event;
  }
});

export const handleError = Sentry.handleErrorWithSentry();

// Combine with your existing handle hook
export const handle = Sentry.sentryHandle();
```

```typescript
// src/hooks.client.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://your-dsn@o123.ingest.sentry.io/456',
  tracesSampleRate: 0.1,
  
  // Capture user interactions and navigation
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false
    })
  ],

  // Session replay -- capture 10% of sessions, 100% of errored sessions
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0
});

export const handleError = Sentry.handleErrorWithSentry();
```

### Custom Error Context

Enrich error reports with user context and custom metadata:

```typescript
// In your auth hook, after identifying the user
import * as Sentry from '@sentry/sveltekit';

Sentry.setUser({
  id: String(user.id),
  email: user.email
});

// Add custom context to errors
Sentry.setTag('store_plan', user.plan);
Sentry.setContext('cart', {
  itemCount: cart.totalItems,
  totalCents: cart.totalCents
});
```

### Manual Error Reporting

Not all errors are exceptions. Report business logic failures explicitly:

```typescript
// In a form action or API endpoint
import * as Sentry from '@sentry/sveltekit';

try {
  await processPayment(paymentIntent);
} catch (err) {
  Sentry.captureException(err, {
    tags: { flow: 'checkout', step: 'payment' },
    extra: {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      customerId: customer.id
    }
  });

  // Still handle the error for the user
  return fail(500, { error: 'Payment processing failed. Please try again.' });
}
```

### SvelteKit Error Hooks Without Sentry

If you prefer not to use Sentry, SvelteKit's built-in error hooks still give you structured error handling:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  // Structured logging -- ship these to your log aggregator
  console.error(JSON.stringify({
    errorId,
    status,
    message: (error as Error).message,
    stack: (error as Error).stack,
    url: event.url.pathname,
    method: event.request.method,
    userAgent: event.request.headers.get('user-agent'),
    timestamp: new Date().toISOString(),
    userId: event.locals.user?.id
  }));

  return {
    message: 'An unexpected error occurred',
    errorId
  };
};
```

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleClientError: HandleClientError = async ({ error, status, message }) => {
  const errorId = crypto.randomUUID();

  console.error(`[${errorId}]`, error);

  // Send to your own error endpoint
  if (navigator.onLine) {
    fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        errorId,
        message: (error as Error).message,
        stack: (error as Error).stack,
        url: window.location.href,
        timestamp: new Date().toISOString()
      })
    }).catch(() => {
      // Fire and forget -- do not throw inside an error handler
    });
  }

  return {
    message: 'Something went wrong',
    errorId
  };
};
```

## LogRocket for Session Replay

When Sentry tells you **what** broke, LogRocket tells you **how the user got there**. Session replay records user interactions so you can watch exactly what happened before an error:

```bash
npm install logrocket
```

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  let { children } = $props();

  onMount(async () => {
    if (browser) {
      const LogRocket = (await import('logrocket')).default;
      LogRocket.init('your-app-id/your-project');

      // Identify the user if logged in
      // LogRocket.identify(userId, { name, email });
    }
  });
</script>

{@render children()}
```

LogRocket is powerful but expensive at scale. Start with Sentry's built-in session replay (included in the paid plan) before adding LogRocket. Use LogRocket selectively -- enable it only for logged-in users on paid plans, or sample 5-10% of sessions.

## Performance Monitoring

Set up systematic performance monitoring, not just one-off checks. Track performance over time so you can catch regressions.

### Automated Performance Checks

```typescript
// scripts/perf-check.ts
interface PageCheck {
  path: string;
  maxTTFB: number;    // ms
  maxLCP: number;     // ms
  maxPageWeight: number; // bytes
}

const pages: PageCheck[] = [
  { path: '/', maxTTFB: 200, maxLCP: 2500, maxPageWeight: 500_000 },
  { path: '/products', maxTTFB: 300, maxLCP: 3000, maxPageWeight: 800_000 },
  { path: '/products/wireless-headphones', maxTTFB: 250, maxLCP: 2500, maxPageWeight: 600_000 },
  { path: '/cart', maxTTFB: 150, maxLCP: 2000, maxPageWeight: 300_000 }
];

async function checkPerformance(baseUrl: string) {
  const results: Array<{
    path: string;
    ttfb: number;
    status: number;
    size: number;
    pass: boolean;
  }> = [];

  for (const page of pages) {
    const start = performance.now();
    const res = await fetch(`${baseUrl}${page.path}`);
    const ttfb = Math.round(performance.now() - start);
    const body = await res.text();
    const size = new TextEncoder().encode(body).length;

    const pass = ttfb <= page.maxTTFB && size <= page.maxPageWeight;

    results.push({
      path: page.path,
      ttfb,
      status: res.status,
      size,
      pass
    });

    const statusIcon = pass ? 'PASS' : 'FAIL';
    console.log(
      `[${statusIcon}] ${page.path} -- ${ttfb}ms TTFB, ${Math.round(size / 1024)}KB`
    );
  }

  const failures = results.filter(r => !r.pass);
  if (failures.length > 0) {
    console.error(`\n${failures.length} page(s) exceeded performance budgets`);
    process.exit(1);
  }
}

checkPerformance(process.argv[2] || 'https://your-store.vercel.app');
```

### Performance Budgets

Define and enforce performance budgets so the site stays fast as you add features:

```
Performance Budgets:
- Time to First Byte (TTFB):       < 200ms
- Largest Contentful Paint (LCP):   < 2.5s
- Interaction to Next Paint (INP):  < 200ms
- Cumulative Layout Shift (CLS):    < 0.1
- Total page weight (HTML):         < 200KB
- Total page weight (with assets):  < 500KB
- JavaScript bundle (initial):      < 150KB gzipped
- Lighthouse Performance score:     > 90
```

Add the performance check to your CI pipeline so you catch regressions before they reach production:

```yaml
# .github/workflows/perf.yml
name: Performance Check
on:
  pull_request:
    branches: [main]

jobs:
  perf:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm run preview &
      - run: sleep 3
      - run: npx tsx scripts/perf-check.ts http://localhost:4173
```

## Feature Flags

Feature flags let you deploy code without releasing it to users. This decouples deployment from release, which is essential for safe continuous deployment. You can deploy the checkout redesign on Monday and enable it for 5% of users on Wednesday.

### Simple Feature Flag Implementation

```typescript
// src/lib/server/feature-flags.ts
import { dev } from '$app/environment';

interface FeatureFlag {
  name: string;
  enabled: boolean;
  percentage?: number;          // 0-100, for gradual rollouts
  allowedUserIds?: number[];    // For internal testing
  description: string;
}

// In production, load this from a database or service like LaunchDarkly
const flags: FeatureFlag[] = [
  {
    name: 'new_checkout',
    enabled: false,
    percentage: 0,
    description: 'Redesigned checkout flow with address autocomplete'
  },
  {
    name: 'product_reviews',
    enabled: true,
    percentage: 100,
    description: 'Allow customers to leave product reviews'
  },
  {
    name: 'ai_recommendations',
    enabled: true,
    percentage: 25,
    allowedUserIds: [1, 2, 3],  // Internal team always sees it
    description: 'AI-powered product recommendations on the homepage'
  }
];

/**
 * Check if a feature is enabled for a given user.
 * In dev mode, all features are enabled.
 */
export function isFeatureEnabled(
  flagName: string,
  userId?: number
): boolean {
  if (dev) return true;

  const flag = flags.find(f => f.name === flagName);
  if (!flag || !flag.enabled) return false;

  // Check explicit allowlist
  if (userId && flag.allowedUserIds?.includes(userId)) return true;

  // Percentage rollout: use userId to deterministically assign a bucket
  if (flag.percentage !== undefined && flag.percentage < 100) {
    if (!userId) return false;
    const bucket = userId % 100;
    return bucket < flag.percentage;
  }

  return true;
}
```

### Using Feature Flags in Load Functions

```typescript
// src/routes/+page.server.ts
import { isFeatureEnabled } from '$lib/server/feature-flags';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  const userId = locals.user?.id;

  return {
    features: {
      newCheckout: isFeatureEnabled('new_checkout', userId),
      productReviews: isFeatureEnabled('product_reviews', userId),
      aiRecommendations: isFeatureEnabled('ai_recommendations', userId)
    }
  };
};
```

```svelte
<!-- src/routes/+page.svelte -->
<script>
  let { data } = $props();
</script>

{#if data.features.aiRecommendations}
  <section class="recommendations">
    <h2>Recommended for You</h2>
    <!-- AI recommendation component -->
  </section>
{/if}
```

The deterministic bucket assignment (`userId % 100`) is important. It ensures a user always sees the same variant -- they do not flip between the old and new checkout on every visit. This is critical for A/B testing.

## A/B Testing

A/B testing (also called split testing) is feature flags plus measurement. You show different variants to different users and measure which performs better.

```typescript
// src/lib/server/ab-testing.ts
import { db } from '$lib/server/db';

interface Experiment {
  name: string;
  variants: string[];
  // Traffic percentage allocated to this experiment
  trafficPercent: number;
}

const experiments: Experiment[] = [
  {
    name: 'checkout_button_color',
    variants: ['control', 'green', 'blue'],
    trafficPercent: 100
  },
  {
    name: 'homepage_hero',
    variants: ['control', 'video_hero'],
    trafficPercent: 50
  }
];

/**
 * Assign a user to experiment variants deterministically.
 * Returns a map of experiment name -> assigned variant.
 */
export function getExperimentVariants(
  userId: number
): Record<string, string> {
  const assignments: Record<string, string> = {};

  for (const exp of experiments) {
    // Deterministic assignment based on user ID + experiment name
    const hash = simpleHash(`${userId}:${exp.name}`);
    const bucket = hash % 100;

    if (bucket < exp.trafficPercent) {
      const variantIndex = hash % exp.variants.length;
      assignments[exp.name] = exp.variants[variantIndex];
    } else {
      assignments[exp.name] = exp.variants[0]; // control
    }
  }

  return assignments;
}

/** Simple deterministic hash for bucket assignment. */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Track a conversion event for an experiment.
 * In production, send this to your analytics service.
 */
export async function trackConversion(
  userId: number,
  experimentName: string,
  eventName: string,
  value?: number
) {
  console.log(`[A/B] User ${userId} converted in ${experimentName}: ${eventName}`, value);

  // In production: insert into analytics table or send to Mixpanel/Amplitude
  // await db.insert(experimentEvents).values({
  //   userId,
  //   experimentName,
  //   variant: getExperimentVariants(userId)[experimentName],
  //   eventName,
  //   value,
  //   timestamp: new Date()
  // });
}
```

## Database Maintenance

A production database needs ongoing care. Neglected databases get slow, bloated, and eventually cause outages.

### Scheduled Cleanup Jobs

```typescript
// src/lib/server/maintenance.ts
import { db } from '$lib/server/db';
import { sessions, orders } from '$lib/server/schema';
import { lt, and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

/**
 * Clean up expired sessions. Run daily via cron.
 */
export async function cleanExpiredSessions() {
  const result = await db
    .delete(sessions)
    .where(lt(sessions.expiresAt, new Date().toISOString()));

  console.log(`Cleaned up expired sessions`);
}

/**
 * Archive old orders. Move completed orders older than 90 days
 * to an archive table for faster queries on recent data.
 */
export async function archiveOldOrders() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);

  // In production, use a transaction for atomicity
  await db.execute(sql`
    INSERT INTO orders_archive
    SELECT * FROM orders
    WHERE status = 'completed'
      AND created_at < ${cutoff.toISOString()}
  `);

  await db.execute(sql`
    DELETE FROM orders
    WHERE status = 'completed'
      AND created_at < ${cutoff.toISOString()}
  `);
}

/**
 * Check database health metrics.
 */
export async function checkDatabaseHealth() {
  const result = await db.execute(sql`
    SELECT
      pg_database_size(current_database()) as db_size,
      (SELECT count(*) FROM pg_stat_activity) as active_connections,
      (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections
  `);

  const row = result.rows[0] as any;
  const dbSizeMB = Math.round(Number(row.db_size) / 1024 / 1024);

  console.log(`Database size: ${dbSizeMB}MB`);
  console.log(`Active connections: ${row.active_connections}`);
  console.log(`Idle connections: ${row.idle_connections}`);

  // Alert if database is getting large
  if (dbSizeMB > 1000) {
    console.warn('Database exceeds 1GB -- consider archiving old data');
  }
}
```

### Exposing Maintenance via API

Create a protected endpoint for running maintenance tasks (secured with an API key, not user auth):

```typescript
// src/routes/api/admin/maintenance/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ADMIN_API_KEY } from '$env/static/private';
import { cleanExpiredSessions, checkDatabaseHealth } from '$lib/server/maintenance';

export const POST: RequestHandler = async ({ request }) => {
  const apiKey = request.headers.get('x-api-key');
  if (apiKey !== ADMIN_API_KEY) {
    throw error(403, 'Invalid API key');
  }

  const { task } = await request.json();

  switch (task) {
    case 'clean_sessions':
      await cleanExpiredSessions();
      return json({ success: true, task });
    case 'health_check':
      await checkDatabaseHealth();
      return json({ success: true, task });
    default:
      throw error(400, `Unknown maintenance task: ${task}`);
  }
};
```

Trigger it from a cron job (GitHub Actions, Vercel Cron, or similar):

```yaml
# .github/workflows/maintenance.yml
name: Database Maintenance
on:
  schedule:
    - cron: '0 3 * * *'  # 3 AM UTC daily

jobs:
  maintenance:
    runs-on: ubuntu-latest
    steps:
      - name: Clean expired sessions
        run: |
          curl -X POST https://your-store.vercel.app/api/admin/maintenance \
            -H "Content-Type: application/json" \
            -H "x-api-key: ${{ secrets.ADMIN_API_KEY }}" \
            -d '{"task": "clean_sessions"}'
```

## Scaling Strategies

As your store grows, you will encounter bottlenecks. Here are the most common and how to address them.

### Database Query Optimization

```typescript
// Add indexes for common query patterns
// In your Drizzle migration:
import { index } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  // ... columns
}, (table) => ({
  // Index for listing products by category (most common query)
  categoryIdx: index('idx_products_category').on(table.categoryId),
  // Index for search
  nameIdx: index('idx_products_name').on(table.name),
  // Composite index for filtered listings
  categoryPriceIdx: index('idx_products_category_price')
    .on(table.categoryId, table.price)
}));
```

### Response Caching

```typescript
// src/routes/api/products/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const products = await db.select().from(productsTable);

  return json(products, {
    headers: {
      // Cache for 5 minutes, serve stale for 1 hour while revalidating
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=3600',
      // Vary by cookie so authenticated users do not see cached public responses
      'Vary': 'Cookie'
    }
  });
};
```

### Edge Caching with SvelteKit

```typescript
// src/routes/products/+page.server.ts
import type { PageServerLoad } from './$types';

export const config = {
  // Run this route at the edge for lower latency
  runtime: 'edge'
};

export const load: PageServerLoad = async ({ setHeaders }) => {
  const products = await fetchProducts();

  // Tell the CDN to cache this page
  setHeaders({
    'Cache-Control': 'public, max-age=60, s-maxage=300'
  });

  return { products };
};
```

## Incident Response

When things break in production -- and they will -- having a response plan saves you from panic-driven debugging.

### Incident Response Checklist

```
1. DETECT
   - Sentry alert fires or user reports an issue
   - Check error rate in monitoring dashboard
   - Determine blast radius: how many users are affected?

2. COMMUNICATE
   - Post to your team Slack/Discord: "Investigating elevated error rates on checkout"
   - If customer-facing: add a status banner on the site

3. MITIGATE
   - Can you feature-flag the broken code off?
   - Can you revert the last deployment? (Vercel instant rollback)
   - Can you add a temporary workaround?

4. FIX
   - Reproduce the issue locally
   - Write a failing test
   - Fix the code
   - Verify the test passes
   - Deploy the fix

5. FOLLOW UP
   - Write a brief post-mortem: what broke, why, how you fixed it, how to prevent it
   - Add monitoring for this class of issue
   - Update runbooks
```

### Vercel Instant Rollback

Vercel keeps every deployment. Rolling back is one click in the dashboard or one command:

```bash
# List recent deployments
vercel ls

# Promote a previous deployment to production
vercel promote <deployment-url>
```

This is your most powerful incident response tool. If a deployment breaks production, roll back in seconds while you debug the issue locally.

### Health Check Endpoint

```typescript
// src/routes/api/health/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async () => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database connectivity
  try {
    const start = performance.now();
    await db.execute(sql`SELECT 1`);
    checks.database = {
      status: 'healthy',
      latency: Math.round(performance.now() - start)
    };
  } catch {
    checks.database = { status: 'unhealthy' };
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy');

  return json(
    {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      timestamp: new Date().toISOString()
    },
    { status: allHealthy ? 200 : 503 }
  );
};
```

Point an uptime monitor (UptimeRobot, Better Uptime, or Vercel's built-in monitoring) at `/api/health` to get alerts when the site goes down.

## Continuous Deployment Pipeline

Automate testing and deployment so every push to `main` goes through the same quality gates:

```yaml
# .github/workflows/ci.yml
name: CI/CD
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run check          # svelte-check for type errors
      - run: npm run lint            # ESLint
      - run: npm run test:unit       # Vitest unit tests
      - run: npm run build           # Verify the build succeeds
      - run: npx playwright install --with-deps
      - run: npm run test:e2e        # Playwright end-to-end tests

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

The key principle: every commit to `main` is automatically tested and deployed. Pull requests get preview deployments. If tests fail, the deploy does not happen. This is continuous deployment -- not just continuous integration.

## User Feedback Collection

The best feature ideas come from users. Set up a lightweight feedback system:

```typescript
// src/lib/server/schema.ts (add to existing)
export const feedback = pgTable('feedback', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  page: text('page').notNull(),
  type: text('type').notNull(),       // 'bug' | 'feature' | 'general'
  message: text('message').notNull(),
  metadata: jsonb('metadata'),        // Browser info, screen size, etc.
  createdAt: timestamp('created_at').defaultNow().notNull()
});
```

```svelte
<!-- src/lib/components/FeedbackWidget.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  let open = $state(false);
  let type = $state<'bug' | 'feature' | 'general'>('general');
  let message = $state('');
  let submitted = $state(false);
  let sending = $state(false);

  async function submit() {
    if (!message.trim()) return;
    sending = true;

    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        page: page.url.pathname,
        type,
        message,
        metadata: {
          screenWidth: window.innerWidth,
          screenHeight: window.innerHeight,
          userAgent: navigator.userAgent
        }
      })
    });

    sending = false;
    submitted = true;
    setTimeout(() => {
      open = false;
      submitted = false;
      message = '';
    }, 2000);
  }
</script>

{#if !open}
  <button
    onclick={() => open = true}
    class="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg
           hover:bg-blue-700 transition-colors z-50"
  >
    Feedback
  </button>
{:else}
  <div class="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-xl border p-4 z-50">
    {#if submitted}
      <p class="text-green-600 font-medium">Thank you for your feedback!</p>
    {:else}
      <div class="flex justify-between items-center mb-3">
        <h3 class="font-semibold">Send Feedback</h3>
        <button onclick={() => open = false} class="text-gray-400">&times;</button>
      </div>

      <div class="flex gap-2 mb-3">
        {#each ['bug', 'feature', 'general'] as t}
          <button
            onclick={() => type = t}
            class="px-3 py-1 rounded text-sm {type === t
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600'}"
          >
            {t}
          </button>
        {/each}
      </div>

      <textarea
        bind:value={message}
        placeholder="Tell us what you think..."
        rows="3"
        class="w-full border rounded p-2 text-sm"
      ></textarea>

      <button
        onclick={submit}
        disabled={sending || !message.trim()}
        class="mt-2 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700
               disabled:opacity-50 transition-colors"
      >
        {sending ? 'Sending...' : 'Send'}
      </button>
    {/if}
  </div>
{/if}
```

## Next Steps Roadmap

Your capstone project is complete, but there is always more to build. Prioritize based on what your analytics and feedback tell you:

```
High-Impact Features (build these first):
1. Email notifications -- Order confirmation, shipping updates (use Resend or SendGrid)
2. Product reviews -- Let customers leave ratings; social proof drives conversions
3. Discount codes -- Coupon codes at checkout for promotions
4. Inventory tracking -- Decrement stock on purchase, show "low stock" warnings

Medium-Impact Features:
5. Wishlist -- Save products for later; captures purchase intent
6. Full-text search -- PostgreSQL tsvector or Algolia for fast, typo-tolerant search
7. Order history -- Let customers view past orders and reorder
8. Email marketing -- Capture emails and send product announcements

Long-Term Features:
9. Internationalization -- Multiple languages and currencies (use Paraglide)
10. Progressive Web App -- Offline support and installability
11. A/B testing -- Test layouts and copy to optimize conversions
12. Affiliate/referral system -- Let customers earn credit for referrals
```

## Try It

1. Set up Vercel Analytics and Speed Insights on your deployed store. Browse the site for a few minutes to generate data, then check the analytics dashboard. Identify the slowest page by LCP and investigate what is causing it.

2. Create a health check endpoint at `/api/health` that tests database connectivity and returns a structured JSON response. Set up a free UptimeRobot monitor that pings it every 5 minutes.

3. Implement a simple feature flag system. Create a flag for a "holiday sale banner" that is enabled for 50% of users. Use the flag in your homepage load function and render a conditional banner.

4. Build the feedback widget from this lesson and deploy it. Submit a few test feedback entries and verify they appear in your database.

## Key Takeaways

- Vercel Analytics provides privacy-friendly traffic insights without requiring cookie consent
- Speed Insights tracks Core Web Vitals from real users, including the newer INP metric
- Sentry provides comprehensive error tracking with session replay to understand how users trigger bugs
- Use `handleError` hooks in both server and client to catch and report errors with unique IDs
- Feature flags decouple deployment from release -- deploy code safely and enable it gradually
- A/B testing is feature flags plus measurement -- deterministic bucket assignment ensures consistent user experience
- Database maintenance (session cleanup, archiving, index monitoring) prevents gradual performance degradation
- Incident response is a process: detect, communicate, mitigate, fix, follow up
- Continuous deployment pipelines (test, build, deploy) automate quality gates for every commit
- User feedback widgets turn users into collaborators who help you prioritize the right features
- Launching is the beginning -- plan your feature roadmap and iterate based on real user data and analytics
- You built a complete, deployed e-commerce store from scratch -- that is a portfolio-worthy accomplishment
