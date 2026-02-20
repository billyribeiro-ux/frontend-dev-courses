# Post-Launch

Your store is live. Congratulations. But launching is not the finish line — it is the starting line. In this lesson you will set up Vercel Analytics to understand your traffic, add error tracking so you know when things break, monitor performance to keep the site fast, and plan your next steps for growth.

A launched store without monitoring is like a shop with no security cameras and no cash register receipts. You need visibility into what is happening.

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

Enable it in the Vercel dashboard under your project's Analytics tab.

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
LCP  (Largest Contentful Paint)  — How fast the main content loads
FID  (First Input Delay)         — How quickly the page responds to interaction
CLS  (Cumulative Layout Shift)   — How much the layout shifts during loading
TTFB (Time to First Byte)        — How fast the server responds
```

## Error Tracking

Catch and log errors so you know when something breaks in production. Use SvelteKit's error hooks:

```typescript
// src/hooks.server.ts (add to your existing handle)
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event }) => {
  const errorId = crypto.randomUUID();

  // Log the error with context
  console.error(`[${errorId}]`, {
    message: (error as Error).message,
    stack: (error as Error).stack,
    url: event.url.pathname,
    method: event.request.method,
    timestamp: new Date().toISOString()
  });

  // In production, send to an error tracking service
  // await sendToErrorService({ errorId, error, url: event.url.pathname });

  return {
    message: 'An unexpected error occurred',
    errorId
  };
};
```

```typescript
// src/hooks.client.ts
import type { HandleClientError } from '@sveltejs/kit';

export const handleClientError: HandleClientError = async ({ error }) => {
  const errorId = crypto.randomUUID();

  console.error(`[${errorId}]`, error);

  return {
    message: 'Something went wrong',
    errorId
  };
};
```

For more robust error tracking, consider a service like Sentry:

```bash
npm install @sentry/sveltekit
```

```typescript
// src/hooks.server.ts
import * as Sentry from '@sentry/sveltekit';

Sentry.init({
  dsn: 'https://your-dsn@sentry.io/project',
  tracesSampleRate: 1.0
});

export const handleError = Sentry.handleErrorWithSentry();
```

## Performance Monitoring

Set up a simple performance check you can run periodically:

```typescript
// scripts/perf-check.ts
const pages = [
  '/',
  '/products',
  '/products/wireless-headphones',
  '/cart'
];

async function checkPerformance(baseUrl: string) {
  for (const path of pages) {
    const start = performance.now();
    const res = await fetch(`${baseUrl}${path}`);
    const duration = Math.round(performance.now() - start);

    console.log(
      `${res.status} ${path} — ${duration}ms`,
      duration > 1000 ? '(SLOW)' : ''
    );
  }
}

checkPerformance('https://your-store.vercel.app');
```

Key performance targets for an e-commerce store:

```
Target Metrics:
- Time to First Byte (TTFB):       < 200ms
- Largest Contentful Paint (LCP):   < 2.5s
- First Input Delay (FID):          < 100ms
- Cumulative Layout Shift (CLS):    < 0.1
- Total page weight:                < 500KB
- Lighthouse score:                 > 90
```

## Next Steps

Your capstone project is complete, but there is always more to build. Here are high-value features to add next:

```
Feature Roadmap:
1. Email notifications — Order confirmation, shipping updates (use Resend or SendGrid)
2. Product reviews — Let customers leave ratings and written reviews
3. Wishlist — Save products for later with a heart icon
4. Inventory tracking — Decrement stock on purchase, show "low stock" warnings
5. Discount codes — Apply coupon codes at checkout for percentage or fixed discounts
6. Full-text search — Use PostgreSQL's built-in text search or Algolia
7. Internationalization — Support multiple languages and currencies
8. Progressive Web App — Add offline support and installability
9. A/B testing — Test different layouts and copy to optimize conversions
10. CI/CD pipeline — Automated tests on every pull request
```

## Try It

Set up Vercel Analytics and Speed Insights on your deployed store. Browse the site for a few minutes to generate data, then check the analytics dashboard. Identify the slowest page by LCP and investigate what is causing it. Optimize it by adding lazy loading for images, reducing the initial data payload, or implementing caching headers.

## Key Takeaways

- Vercel Analytics provides privacy-friendly traffic insights without requiring cookie consent
- Speed Insights tracks Core Web Vitals from real users so you see actual performance, not just lab scores
- Error tracking with `handleError` hooks catches both server and client errors with unique IDs for debugging
- Monitor key metrics (TTFB, LCP, CLS) and set performance budgets to keep the site fast over time
- Launching is the beginning — plan your feature roadmap and iterate based on real user data
- You built a complete, deployed e-commerce store from scratch — that is a portfolio-worthy accomplishment
