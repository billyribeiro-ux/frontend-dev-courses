# Performance Optimization

Performance is not just about speed — it is about user experience and business outcomes. A page that loads in 1 second instead of 3 has measurably higher conversion rates, lower bounce rates, and better search rankings. Google uses Core Web Vitals as a ranking factor, so performance directly impacts how many people find and use your site. Amazon found that every 100ms of additional latency cost them 1% in sales. Pinterest reduced perceived wait times by 40% and saw a 15% increase in search engine traffic.

This lesson covers every practical optimization that matters in a production SvelteKit application: measuring performance correctly, optimizing the assets that dominate load time (images, fonts, JavaScript, CSS), server-side strategies, and building performance budgets into your CI pipeline so regressions never ship undetected.

## Performance Measurement

You cannot optimize what you do not measure. Before changing anything, establish baselines using the right tools.

### Lighthouse

Lighthouse is built into Chrome DevTools and provides a comprehensive audit:

1. Open Chrome DevTools (F12)
2. Go to the **Lighthouse** tab
3. Select **Performance**, **Accessibility**, **Best Practices**, **SEO**
4. Choose **Mobile** (more demanding than Desktop — always test mobile first)
5. Click **Analyze page load**

The key metrics to understand:

| Metric | Good | Needs Improvement | Poor | What It Measures |
|--------|------|-------------------|------|-----------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | 2.5s - 4.0s | > 4.0s | When the main content becomes visible |
| **INP** (Interaction to Next Paint) | < 200ms | 200ms - 500ms | > 500ms | Responsiveness to user input |
| **CLS** (Cumulative Layout Shift) | < 0.1 | 0.1 - 0.25 | > 0.25 | How much the layout shifts during load |
| **FCP** (First Contentful Paint) | < 1.8s | 1.8s - 3.0s | > 3.0s | When the first pixel of content appears |
| **TTFB** (Time to First Byte) | < 800ms | 800ms - 1.8s | > 1.8s | Server response time |

**Critical Lighthouse caveat:** Lighthouse runs in a simulated throttled environment. Your actual users may have faster or slower connections. Use it for relative comparisons (before vs. after), not as absolute truth.

### Chrome DevTools Performance Panel

For deeper analysis, the Performance panel records a timeline of everything the browser does:

1. Open DevTools, go to the **Performance** tab
2. Click the record button, then reload the page
3. Stop recording after the page finishes loading
4. Analyze the flame chart

What to look for:

- **Long tasks** (red flags in the timeline): any task over 50ms blocks the main thread
- **Layout thrashing**: alternating reads and writes to the DOM
- **Excessive JavaScript execution**: large yellow blocks in the flame chart
- **Render-blocking resources**: CSS or JS that delays first paint

### Web Vitals in Production

Lab tools like Lighthouse simulate conditions. Real User Monitoring (RUM) captures what your actual users experience:

```typescript
// src/lib/analytics/web-vitals.ts
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals';

type MetricPayload = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationType: string;
};

function sendToAnalytics(metric: MetricPayload) {
  // Use sendBeacon so the request survives page unload
  const body = JSON.stringify(metric);

  if (navigator.sendBeacon) {
    navigator.sendBeacon('/api/analytics/vitals', body);
  } else {
    fetch('/api/analytics/vitals', {
      method: 'POST',
      body,
      keepalive: true
    });
  }
}

export function initWebVitals() {
  onCLS(({ name, value, rating, navigationType }) => {
    sendToAnalytics({ name, value, rating, navigationType });
  });
  onINP(({ name, value, rating, navigationType }) => {
    sendToAnalytics({ name, value, rating, navigationType });
  });
  onLCP(({ name, value, rating, navigationType }) => {
    sendToAnalytics({ name, value, rating, navigationType });
  });
  onFCP(({ name, value, rating, navigationType }) => {
    sendToAnalytics({ name, value, rating, navigationType });
  });
  onTTFB(({ name, value, rating, navigationType }) => {
    sendToAnalytics({ name, value, rating, navigationType });
  });
}
```

Initialize it in your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  onMount(() => {
    if (browser) {
      import('$lib/analytics/web-vitals').then(({ initWebVitals }) => {
        initWebVitals();
      });
    }
  });

  let { children } = $props();
</script>

{@render children()}
```

The server endpoint to receive vitals:

```typescript
// src/routes/api/analytics/vitals/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
  const metric = await request.json();

  // Log to your preferred analytics service
  // In production: Datadog, New Relic, CloudWatch, or your own database
  console.log(`[Web Vital] ${metric.name}: ${metric.value} (${metric.rating})`);

  // Store in database for dashboards
  // await db.insert(webVitals).values({
  //   metricName: metric.name,
  //   value: metric.value,
  //   rating: metric.rating,
  //   timestamp: new Date()
  // });

  return json({ received: true });
};
```

## Image Optimization

Images are typically 50-70% of a page's total weight. Optimizing them is the single highest-impact change you can make.

### Modern Formats

**AVIF** offers 50% smaller files than JPEG at equivalent quality. **WebP** offers 25-35% savings. Always serve multiple formats with `<picture>` so the browser picks the best one it supports:

```svelte
<picture>
  <source srcset="/hero.avif" type="image/avif" />
  <source srcset="/hero.webp" type="image/webp" />
  <img src="/hero.jpg" alt="Hero banner" width="1200" height="600" />
</picture>
```

The browser evaluates sources top to bottom and uses the first format it supports. The `<img>` tag is the final fallback.

### Responsive Images with srcset

Do not send a 2000px image to a 400px phone screen. Use `srcset` to offer multiple resolutions and `sizes` to tell the browser which one to pick:

```svelte
<img
  src="/product.jpg"
  srcset="
    /product-400.webp   400w,
    /product-800.webp   800w,
    /product-1200.webp 1200w,
    /product-1600.webp 1600w
  "
  sizes="
    (max-width: 640px) 100vw,
    (max-width: 1024px) 50vw,
    33vw
  "
  alt="Blue running shoes"
  width="800"
  height="600"
  loading="lazy"
/>
```

**How `sizes` works:** The browser reads the media conditions left to right. On a 500px viewport, it matches `(max-width: 640px) 100vw`, meaning the image will display at 100% of 500px = 500px. The browser then picks the smallest `srcset` image that covers 500px (accounting for device pixel ratio). On a 2x display, it needs 1000px, so it picks `product-1200.webp`.

### @sveltejs/enhanced-img

For SvelteKit projects, the `@sveltejs/enhanced-img` package automates image optimization at build time:

```bash
npm install -D @sveltejs/enhanced-img
```

```javascript
// vite.config.js
import { sveltekit } from '@sveltejs/kit/vite';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    enhancedImages(),
    sveltekit()
  ]
});
```

Then use the `enhanced:img` element in your components:

```svelte
<enhanced:img
  src="$lib/images/hero.jpg"
  alt="Hero banner"
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

This automatically generates multiple resolutions, converts to AVIF and WebP, sets width/height to prevent CLS, and applies lazy loading. It handles the entire `<picture>` element generation for you.

**Important:** `enhanced:img` only works with static imports — images must exist in your source tree, not fetched from a CMS. For dynamic images (user uploads, CMS content), use a CDN like Cloudinary, Imgix, or Cloudflare Images that provides on-the-fly format conversion and resizing via URL parameters.

### Lazy Loading Strategy

```svelte
<!-- NEVER lazy-load above-the-fold content -->
<img
  src="/hero.jpg"
  alt="Hero"
  width="1200"
  height="600"
  fetchpriority="high"
/>

<!-- Lazy-load everything below the fold -->
<img
  src="/feature.jpg"
  alt="Feature"
  width="600"
  height="400"
  loading="lazy"
  decoding="async"
/>
```

The `fetchpriority="high"` attribute tells the browser to prioritize the hero image over other resources. This is especially important for LCP — the hero image is often the largest contentful paint element.

**Set width and height on every image.** This reserves space in the layout and prevents content from jumping when the image loads. Without dimensions, the browser allocates 0 height until the image arrives, then reflowed the entire page. This is the most common cause of CLS.

## Font Loading Strategies

Custom fonts can block rendering if loaded incorrectly. The browser will hide text for up to 3 seconds (FOIT — Flash of Invisible Text) while waiting for a font to download. Here is how to prevent that.

### font-display and preloading

```css
/* src/app.css or in <style> */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  /* swap: show fallback font immediately, swap when custom font loads */
  /* optional: use custom font only if it loads fast enough — best for non-critical fonts */
}
```

Preload critical fonts to start downloading them before CSS parsing discovers the `@font-face` rule:

```html
<!-- src/app.html -->
<head>
  <link
    rel="preload"
    href="/fonts/inter-variable.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
</head>
```

The `crossorigin` attribute is required even for same-origin fonts — this is a quirk of the font loading specification.

### Font Subsetting

Most fonts include thousands of characters you never use. Subsetting reduces file size dramatically:

```bash
# Install pyftsubset (part of fonttools)
pip install fonttools brotli

# Subset to Latin characters only (covers English, Spanish, French, etc.)
pyftsubset Inter-Variable.woff2 \
  --output-file=inter-latin.woff2 \
  --flavor=woff2 \
  --layout-features='kern,liga,calt' \
  --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
```

This can reduce a 300KB font to 30KB.

### Minimizing Layout Shift from Font Swap

When the browser swaps from the fallback font to the custom font, text can reflow because the fonts have different metrics. Use `size-adjust` to match the fallback font's dimensions:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

/* Adjust fallback to match Inter's metrics */
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}

body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

Tools like [Fontaine](https://github.com/unjs/fontaine) or the `next/font` approach can calculate these overrides automatically. The goal is zero CLS from font swapping.

### Font Loading Best Practices

- Use **variable fonts** — one file covers all weights and styles
- Stick to **WOFF2** — best compression, supported by all modern browsers
- Limit yourself to **1-2 font families** — each additional font is another HTTP request
- Preload only **critical fonts** (body text, headings). Decorative fonts can load normally
- Use `font-display: optional` for non-essential fonts — the browser will skip them if they take too long

## JavaScript Optimization

### Tree Shaking

Vite and Rollup automatically tree-shake unused exports. But some patterns defeat tree shaking:

```typescript
// BAD: barrel file that re-exports everything
// src/lib/utils/index.ts
export * from './strings';
export * from './dates';
export * from './math';
export * from './formatting';
// Importing { formatDate } from '$lib/utils' may pull in the entire barrel

// GOOD: import directly from the source module
import { formatDate } from '$lib/utils/dates';
```

Check your bundle for unexpected bloat:

```bash
# Analyze your production bundle
npx vite-bundle-visualizer
```

This generates a treemap showing exactly what is in your bundle and how large each module is. Common culprits: moment.js (use `date-fns` instead), lodash (import individual functions: `import debounce from 'lodash/debounce'`), icon libraries (import individual icons, not the entire set).

### Dynamic Imports and Code Splitting

SvelteKit automatically code-splits by route — each page loads only the JavaScript it needs. But you can go further with dynamic imports for heavy components:

```svelte
<script lang="ts">
  let showChart = $state(false);
  let ChartComponent: typeof import('$lib/components/Chart.svelte').default | null = $state(null);

  async function loadChart() {
    showChart = true;
    const module = await import('$lib/components/Chart.svelte');
    ChartComponent = module.default;
  }
</script>

<button onclick={loadChart}>Show Analytics</button>

{#if showChart && ChartComponent}
  <ChartComponent data={analyticsData} />
{:else if showChart}
  <p>Loading chart...</p>
{/if}
```

Dynamic imports are ideal for:
- Heavy visualization libraries (D3, Chart.js) loaded only when the user opens a dashboard
- Rich text editors loaded only when the user clicks "Edit"
- Admin panels loaded only for admin users
- Modals with complex content loaded on demand

### Avoiding Layout Thrashing

Layout thrashing happens when you alternate between reading layout properties and writing to the DOM. Each read forces the browser to recalculate layout:

```typescript
// BAD: layout thrashing — forces layout recalculation on every iteration
function resizeCards(cards: HTMLElement[]) {
  for (const card of cards) {
    const height = card.offsetHeight;  // READ — triggers layout
    card.style.height = `${height + 20}px`;  // WRITE — invalidates layout
    // Next iteration's READ forces another layout calculation
  }
}

// GOOD: batch reads, then batch writes
function resizeCards(cards: HTMLElement[]) {
  // Read phase
  const heights = cards.map(card => card.offsetHeight);

  // Write phase
  cards.forEach((card, i) => {
    card.style.height = `${heights[i] + 20}px`;
  });
}
```

In Svelte components, layout thrashing usually happens in `onMount` or event handlers when you need to measure DOM elements. Always read all measurements first, then apply all changes.

### Debouncing Expensive Operations

For operations that fire rapidly (scroll, resize, input), debounce to avoid overwhelming the main thread:

```svelte
<script lang="ts">
  let searchQuery = $state('');
  let results = $state<string[]>([]);
  let timer: ReturnType<typeof setTimeout>;

  function handleInput(value: string) {
    searchQuery = value;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(value)}`);
      results = await res.json();
    }, 300);  // Wait 300ms after the user stops typing
  }
</script>

<input
  type="text"
  value={searchQuery}
  oninput={(e) => handleInput(e.currentTarget.value)}
  placeholder="Search..."
/>
```

## CSS Optimization

### Critical CSS and content-visibility

SvelteKit scopes CSS by default (each component's styles are scoped), which naturally avoids shipping unused styles. But for very long pages, you can optimize further with `content-visibility`:

```css
/* Tell the browser to skip rendering off-screen sections */
.below-fold-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 500px; /* Estimated height for scroll calculations */
}
```

`content-visibility: auto` tells the browser to skip layout, paint, and style calculations for elements that are off-screen. When the user scrolls near them, the browser renders them. The `contain-intrinsic-size` provides an estimated height so the scrollbar stays accurate.

**Performance impact:** On pages with many sections (landing pages, product listings), `content-visibility: auto` can reduce initial render time by 50% or more because the browser only renders what is visible.

### Reducing CSS Bundle Size

```css
/* Avoid deeply nested selectors — they are slower to match */
/* BAD */
.page .content .sidebar .widget .title { color: red; }

/* GOOD */
.widget-title { color: red; }

/* Use CSS layers for better organization without specificity wars */
@layer base, components, utilities;

@layer base {
  /* Reset and typography */
}

@layer components {
  /* Component styles */
}
```

### CSS containment

For components that are visually independent (cards, widgets, list items), CSS containment tells the browser that changes inside the element cannot affect layout outside it:

```css
.card {
  contain: layout style paint;
  /* layout: changes inside cannot affect external layout */
  /* style: counter increments and similar are scoped */
  /* paint: descendants cannot paint outside this box */
}
```

This allows the browser to optimize rendering — when a card's content changes, only that card is re-laid-out, not the entire page.

## Reducing Cumulative Layout Shift (CLS)

CLS measures how much content moves around as the page loads. High CLS frustrates users — they try to click a button and it jumps away. Common causes and fixes:

```svelte
<!-- Problem: image without dimensions causes layout shift -->
<img src="/photo.jpg" alt="Landscape" />

<!-- Fix: always include width and height -->
<img src="/photo.jpg" alt="Landscape" width="800" height="600" />
```

```css
/* Problem: dynamic content pushes layout down */
.ad-slot {
  /* No height reserved */
}

/* Fix: reserve space for dynamic content */
.ad-slot {
  min-height: 250px;
  aspect-ratio: 728 / 90;
}
```

```css
/* Use aspect-ratio for responsive media containers */
.video-container {
  aspect-ratio: 16 / 9;
  width: 100%;
}

.video-container iframe {
  width: 100%;
  height: 100%;
}
```

Other CLS fixes:

- Place dynamic banners and alerts at the top of content so they push nothing already on screen
- Use CSS `aspect-ratio` for all media containers
- Avoid inserting content above existing content after load
- Match fallback font metrics to custom font metrics (see Font Loading section)
- Reserve space for skeleton loaders that match the final content dimensions

## Server-Side Optimization

### Streaming with SvelteKit

SvelteKit supports streaming, which sends the HTML shell immediately while data loads. The user sees the page layout instantly, and content fills in as it arrives:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  // Fast data — returned immediately in the initial HTML
  const user = await fetch('/api/user').then(r => r.json());

  // Slow data — streamed in after initial render
  // Do NOT await this — return the promise directly
  const analyticsPromise = fetch('/api/analytics').then(r => r.json());
  const recentOrdersPromise = fetch('/api/orders/recent').then(r => r.json());

  return {
    user,
    streamed: {
      analytics: analyticsPromise,
      recentOrders: recentOrdersPromise
    }
  };
};
```

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<!-- This renders immediately -->
<h1>Welcome, {data.user.name}</h1>

<!-- This shows a loading state, then fills in when data arrives -->
{#await data.streamed.analytics}
  <div class="skeleton analytics-skeleton"></div>
{:then analytics}
  <div class="analytics-panel">
    <p>Revenue: ${analytics.revenue.toLocaleString()}</p>
    <p>Orders: {analytics.orderCount}</p>
  </div>
{:catch error}
  <p class="error">Failed to load analytics</p>
{/await}

{#await data.streamed.recentOrders}
  <div class="skeleton orders-skeleton"></div>
{:then orders}
  <ul>
    {#each orders as order}
      <li>Order #{order.id} — ${order.total}</li>
    {/each}
  </ul>
{:catch}
  <p class="error">Failed to load recent orders</p>
{/await}
```

**Why streaming matters:** Without streaming, the user stares at a blank page until the slowest API call finishes. With streaming, they see the page layout and fast data immediately. The slow data fills in as it arrives, often within a second or two. This can cut perceived load time in half.

### Prerendering Static Pages

Pages that do not change per-request should be prerendered at build time:

```typescript
// src/routes/about/+page.ts
export const prerender = true;
```

```typescript
// src/routes/blog/[slug]/+page.ts
import type { EntryGenerator } from './$types';

export const prerender = true;

// Tell SvelteKit which slugs to prerender
export const entries: EntryGenerator = async () => {
  const posts = await fetch('https://api.example.com/posts').then(r => r.json());
  return posts.map((post: { slug: string }) => ({ slug: post.slug }));
};
```

Prerendered pages are served as static HTML with zero server processing time — TTFB drops to whatever your CDN's edge latency is (typically 5-20ms).

### Cache Headers

Set appropriate cache headers on API responses and pages:

```typescript
// src/routes/api/products/+server.ts
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ setHeaders }) => {
  const products = await getProducts();

  setHeaders({
    // Cache for 5 minutes on CDN, serve stale for 1 hour while revalidating
    'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600'
  });

  return json(products);
};
```

```typescript
// src/routes/products/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders, fetch }) => {
  setHeaders({
    'Cache-Control': 'public, max-age=60, s-maxage=300'
  });

  const products = await fetch('/api/products').then(r => r.json());
  return { products };
};
```

Cache strategy guide:
- **Static assets** (images, fonts, JS, CSS): `max-age=31536000, immutable` (1 year — Vite adds hashes to filenames)
- **API data that rarely changes** (product catalog): `s-maxage=300, stale-while-revalidate=3600`
- **Personalized data** (cart, user profile): `private, no-cache` or no caching
- **Real-time data** (stock prices, chat): `no-store`

### Edge Functions

Deploy SvelteKit to edge runtimes (Cloudflare Workers, Vercel Edge, Netlify Edge) to run server code close to the user. TTFB drops from 100-300ms (single region) to 10-50ms (nearest edge).

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-cloudflare';

export default {
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: ['<all>']
      }
    })
  }
};
```

Edge functions have constraints: no Node.js APIs, no filesystem access, limited execution time. Most SvelteKit apps work on the edge without changes because SvelteKit uses Web Platform APIs (fetch, Request, Response) by default.

## Performance Monitoring

Set up continuous monitoring so you catch regressions before users do:

```typescript
// src/lib/analytics/performance-monitor.ts

export class PerformanceMonitor {
  #marks = new Map<string, number>();

  // Mark the start of an operation
  start(label: string) {
    this.#marks.set(label, performance.now());
  }

  // Mark the end and log the duration
  end(label: string) {
    const start = this.#marks.get(label);
    if (!start) return;
    const duration = performance.now() - start;
    this.#marks.delete(label);

    // Log slow operations
    if (duration > 100) {
      console.warn(`[Perf] ${label}: ${duration.toFixed(1)}ms (SLOW)`);
    }

    return duration;
  }

  // Measure long tasks (tasks that block the main thread for >50ms)
  observeLongTasks() {
    if (typeof PerformanceObserver === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        console.warn(`[Long Task] ${entry.duration.toFixed(1)}ms`, entry);
      }
    });

    observer.observe({ type: 'longtask', buffered: true });
    return observer;
  }

  // Monitor resource loading times
  observeResources() {
    if (typeof PerformanceObserver === 'undefined') return;

    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        if (resource.duration > 1000) {
          console.warn(
            `[Slow Resource] ${resource.name}: ${resource.duration.toFixed(0)}ms`
          );
        }
      }
    });

    observer.observe({ type: 'resource', buffered: true });
    return observer;
  }
}

export const perfMonitor = new PerformanceMonitor();
```

## Performance Budgets in CI

A performance budget is a threshold that fails your build if exceeded. This prevents accidental regressions:

```json
// package.json
{
  "scripts": {
    "build": "vite build",
    "check:bundle": "node scripts/check-bundle-size.js",
    "postbuild": "npm run check:bundle"
  }
}
```

```javascript
// scripts/check-bundle-size.js
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const BUDGETS = {
  // Max size for individual JS chunks (gzipped)
  jsChunkMax: 50 * 1024,      // 50KB
  // Max total JS size
  jsTotalMax: 200 * 1024,     // 200KB
  // Max total CSS size
  cssTotalMax: 50 * 1024,     // 50KB
  // Max individual image size
  imageMax: 200 * 1024        // 200KB
};

function getFileSizes(dir, extension) {
  const files = [];
  function walk(d) {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const fullPath = join(d, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.name.endsWith(extension)) {
        files.push({ name: entry.name, size: statSync(fullPath).size });
      }
    }
  }
  walk(dir);
  return files;
}

const buildDir = 'build'; // or '.svelte-kit/output'

const jsFiles = getFileSizes(buildDir, '.js');
const cssFiles = getFileSizes(buildDir, '.css');

let failed = false;

// Check individual JS chunks
for (const file of jsFiles) {
  if (file.size > BUDGETS.jsChunkMax) {
    console.error(`BUDGET EXCEEDED: ${file.name} is ${(file.size / 1024).toFixed(1)}KB (max: ${BUDGETS.jsChunkMax / 1024}KB)`);
    failed = true;
  }
}

// Check total JS
const totalJS = jsFiles.reduce((sum, f) => sum + f.size, 0);
if (totalJS > BUDGETS.jsTotalMax) {
  console.error(`BUDGET EXCEEDED: Total JS is ${(totalJS / 1024).toFixed(1)}KB (max: ${BUDGETS.jsTotalMax / 1024}KB)`);
  failed = true;
}

// Check total CSS
const totalCSS = cssFiles.reduce((sum, f) => sum + f.size, 0);
if (totalCSS > BUDGETS.cssTotalMax) {
  console.error(`BUDGET EXCEEDED: Total CSS is ${(totalCSS / 1024).toFixed(1)}KB (max: ${BUDGETS.cssTotalMax / 1024}KB)`);
  failed = true;
}

if (failed) {
  console.error('\nPerformance budget check FAILED.');
  process.exit(1);
} else {
  console.log(`Bundle sizes OK. JS: ${(totalJS / 1024).toFixed(1)}KB, CSS: ${(totalCSS / 1024).toFixed(1)}KB`);
}
```

For CI integration with Lighthouse:

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI
on: [pull_request]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm run preview &
      - name: Run Lighthouse
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: |
            http://localhost:4173/
            http://localhost:4173/products
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```

```json
// lighthouse-budget.json
[
  {
    "path": "/*",
    "timings": [
      { "metric": "interactive", "budget": 3000 },
      { "metric": "first-contentful-paint", "budget": 1500 }
    ],
    "resourceSizes": [
      { "resourceType": "script", "budget": 200 },
      { "resourceType": "stylesheet", "budget": 50 },
      { "resourceType": "image", "budget": 500 },
      { "resourceType": "total", "budget": 800 }
    ]
  }
]
```

## Achieving 95+ Lighthouse Scores

A comprehensive checklist for hitting top Lighthouse scores:

```
Performance:
  [ ] Images: WebP/AVIF, srcset, loading="lazy" (except hero), width/height set
  [ ] Fonts: WOFF2, font-display: swap, preload critical, subset to needed characters
  [ ] JS: Code-split by route, dynamic imports for heavy components, no unused dependencies
  [ ] CSS: Scoped styles, content-visibility for long pages, no unused selectors
  [ ] Server: Prerender static pages, cache headers, streaming for slow data
  [ ] LCP: Ensure hero image/text is in initial HTML, fetchpriority="high"
  [ ] CLS: Dimensions on all media, fallback font metrics, no late-injected content
  [ ] INP: No long tasks (>50ms), debounce rapid events, use requestAnimationFrame for DOM updates

Accessibility:
  [ ] Semantic HTML with proper heading order (h1 > h2 > h3)
  [ ] All images have descriptive alt text
  [ ] Color contrast meets WCAG AA (4.5:1 for text, 3:1 for large text)
  [ ] All form inputs have associated labels
  [ ] Focus indicators visible on all interactive elements
  [ ] Skip navigation link for keyboard users

Best Practices:
  [ ] HTTPS everywhere, no mixed content
  [ ] No console errors in production
  [ ] No deprecated APIs
  [ ] CSP headers configured

SEO:
  [ ] Unique <title> and <meta description> on every page
  [ ] Open Graph and Twitter Card meta tags
  [ ] Valid robots.txt and sitemap.xml
  [ ] Canonical URLs for duplicate content
  [ ] Structured data (JSON-LD) for products, articles, etc.
```

## Try It

Run a Lighthouse audit on your project in mobile mode. Note your current scores for all four categories. Then implement the following optimizations in order:

1. Install `@sveltejs/enhanced-img` and convert your three largest images to use `enhanced:img`
2. Add `font-display: swap` to your custom fonts and preload the primary body font in `app.html`
3. Add `width` and `height` attributes to every `<img>` tag in your project
4. Add `content-visibility: auto` to any below-fold sections on your homepage
5. Set up the `web-vitals` library and create a `/api/analytics/vitals` endpoint to collect real user metrics
6. Create a bundle size check script that runs after each build

Run Lighthouse again and compare the improvement. You should see meaningful gains in LCP and CLS. Track the web-vitals endpoint over a week to see how real users experience your site versus the lab results.

## Key Takeaways

- **Measure before optimizing** — use Lighthouse for lab data, web-vitals for real user data. Never optimize blindly
- **Images are the biggest bottleneck** — use AVIF/WebP, srcset with sizes, lazy loading below the fold, and `fetchpriority="high"` for the LCP image
- **Font loading** requires `font-display: swap`, preloading, subsetting, and fallback font metric matching to prevent both FOIT and CLS
- **JavaScript optimization** means tree shaking (avoid barrel files), code splitting (dynamic imports for heavy components), and avoiding layout thrashing
- **CSS containment** (`content-visibility`, `contain`) lets the browser skip rendering off-screen content, dramatically reducing initial render time
- **Server-side streaming** sends the HTML shell immediately while slow data loads, cutting perceived load time in half
- **Cache headers** and prerendering eliminate server processing time for static and semi-static content
- **Edge functions** bring your server code close to the user, reducing TTFB to 10-50ms
- **Performance budgets in CI** prevent regressions by failing the build when bundle sizes or timing thresholds are exceeded
- **CLS** is prevented by always setting dimensions on media, reserving space for dynamic content, and matching fallback font metrics
