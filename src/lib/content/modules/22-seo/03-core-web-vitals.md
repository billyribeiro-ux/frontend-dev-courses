# Core Web Vitals

Google uses **Core Web Vitals** as ranking signals — they measure the real-world user experience of your pages. This is not a vague "quality signal" buried among hundreds of factors. Google has explicitly stated that Core Web Vitals affect ranking, and they publish the exact thresholds. Poor scores can push your pages lower in search results, while good scores give you a measurable ranking boost, especially on mobile where competition for the top spots is fierce.

But here is the deeper reason to care: these metrics are proxies for user experience. A page that loads fast, responds instantly, and does not jump around is simply a better product. The SEO benefit is a side effect of building something that does not frustrate people.

Understanding Core Web Vitals at the engineering level — how they are calculated, what triggers regressions, and how SvelteKit's architecture naturally addresses many of the bottlenecks — gives you the ability to diagnose and fix performance issues systematically rather than guessing.

## The Three Core Web Vitals

Each metric targets a different phase of the user's experience: seeing content, interacting with it, and trusting it to stay put.

### Largest Contentful Paint (LCP)

LCP measures how long it takes for the **largest visible element** in the viewport to finish rendering. This is the moment the user perceives the page as "loaded" — even if smaller elements are still trickling in. The largest element is determined by the rendered size in the viewport and is typically one of these:

- An `<img>` element (including `<picture>` and images with `background-image: url(...)`)
- A `<video>` element with a poster image
- A block-level element containing text (headings, paragraphs)
- An `<svg>` element

The LCP element can change during page load. If a heading renders first and is the largest element, that is the LCP candidate. If a hero image then loads and is larger, the LCP candidate updates. The final LCP value is reported when the user first interacts with the page (click, tap, scroll, keypress) or when the page is fully loaded.

**Thresholds:**
- **Good:** under 2.5 seconds
- **Needs improvement:** 2.5-4 seconds
- **Poor:** over 4 seconds

### The Four LCP Bottlenecks

LCP is slow because of four distinct bottlenecks, each requiring a different fix. Diagnose which one is your problem before applying solutions:

**Bottleneck 1: Slow Server Response Time (TTFB)**

Time to First Byte is the time between the browser requesting the page and receiving the first byte of the response. If TTFB is 800ms, you have already burned a third of your LCP budget before the browser has any content to work with.

Common causes: slow database queries in your `load` function, cold starts on serverless platforms, no CDN (request travels to origin on every visit), missing `Cache-Control` headers on server-rendered pages.

```typescript
// SLOW: Sequential queries — 450ms TTFB
export const load = async () => {
  const posts = await db.posts.findMany();           // 200ms
  const categories = await db.categories.findMany(); // 150ms
  const author = await db.authors.findFirst();       // 100ms
  return { posts, categories, author };
};

// FAST: Parallel queries — 200ms TTFB
export const load = async () => {
  const [posts, categories, author] = await Promise.all([
    db.posts.findMany(),
    db.categories.findMany(),
    db.authors.findFirst()
  ]);
  return { posts, categories, author };
};
```

**Bottleneck 2: Render-Blocking Resources**

CSS files and synchronous `<script>` tags block rendering. The browser will not paint a single pixel until all render-blocking CSS is downloaded and parsed, and all synchronous scripts are downloaded and executed.

SvelteKit mitigates this automatically — it inlines critical CSS and defers non-critical JavaScript. But third-party scripts (analytics, chat widgets, A/B testing) are often render-blocking:

```svelte
<!-- BAD: This blocks rendering until the script loads -->
<svelte:head>
  <script src="https://analytics.example.com/tracker.js"></script>
</svelte:head>

<!-- GOOD: Load analytics asynchronously -->
<svelte:head>
  <script async src="https://analytics.example.com/tracker.js"></script>
</svelte:head>

<!-- BETTER: Load after the page is interactive -->
<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    // Load analytics after the page is fully interactive
    const script = document.createElement('script');
    script.src = 'https://analytics.example.com/tracker.js';
    script.async = true;
    document.head.appendChild(script);
  });
</script>
```

**Bottleneck 3: Slow Resource Load Time**

The LCP element itself takes too long to download. This is most commonly a hero image that is too large, in the wrong format, or not prioritized by the browser.

```svelte
<svelte:head>
  <!-- Preload the hero image so the browser starts downloading it immediately -->
  <link
    rel="preload"
    as="image"
    href="/hero.webp"
    type="image/webp"
    fetchpriority="high"
  />
  <!-- Preload critical fonts -->
  <link
    rel="preload"
    as="font"
    href="/fonts/inter-var.woff2"
    type="font/woff2"
    crossorigin="anonymous"
  />
</svelte:head>

<!-- Tell the browser this image is important -->
<img
  src="/hero.webp"
  alt="Hero image"
  width={1200}
  height={630}
  loading="eager"
  fetchpriority="high"
  decoding="async"
/>
```

The `fetchpriority="high"` attribute is critical and often overlooked. Without it, the browser discovers the image in the HTML, adds it to the download queue, but may not prioritize it over stylesheets, fonts, and scripts. With `fetchpriority="high"`, the browser treats it as the highest-priority download after the document itself.

Conversely, images below the fold should use `loading="lazy"` and `fetchpriority="low"` to avoid competing with the hero image for bandwidth:

```svelte
<!-- Below the fold — do not compete with the hero image -->
<img
  src="/secondary.webp"
  alt="Secondary image"
  width={600}
  height={400}
  loading="lazy"
  fetchpriority="low"
  decoding="async"
/>
```

**Bottleneck 4: Client-Side Rendering**

In a traditional SPA (no SSR), the browser downloads HTML (nearly empty), downloads JavaScript, parses it, executes it, fetches data, and then renders content. The LCP element does not exist in the DOM until JavaScript creates it — adding hundreds of milliseconds to seconds of delay.

SvelteKit eliminates this by default with SSR. The HTML arrives with content already rendered. The browser can paint immediately. JavaScript loads and hydrates in the background, making the page interactive. The LCP element is already in the HTML — no JavaScript required to display it.

This is SvelteKit's single biggest LCP advantage over client-side-only frameworks.

### Image Optimization with @sveltejs/enhanced-img

The `@sveltejs/enhanced-img` package automates image optimization at build time:

```bash
npm install -D @sveltejs/enhanced-img
```

```typescript
// vite.config.ts
import { enhancedImages } from '@sveltejs/enhanced-img';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [
    enhancedImages(),
    sveltekit()
  ]
});
```

```svelte
<script>
  import heroImage from '$lib/images/hero.jpg?enhanced';
</script>

<!-- Generates WebP/AVIF variants, multiple sizes, and includes width/height -->
<enhanced:img
  src={heroImage}
  alt="Hero image"
  loading="eager"
  sizes="(min-width: 1024px) 1024px, 100vw"
/>
```

What `enhanced:img` does at build time:
1. Generates multiple sizes (srcset) for responsive images
2. Converts to WebP and AVIF formats (smaller than JPEG/PNG)
3. Adds `width` and `height` attributes automatically (prevents CLS)
4. Sets `loading="lazy"` by default (override with `loading="eager"` for hero images)
5. Includes a blurred placeholder for the loading state

For hero images that are the LCP element, always add `loading="eager"` and `fetchpriority="high"` — the default lazy loading would delay the LCP.

## Interaction to Next Paint (INP)

INP replaced First Input Delay (FID) in March 2024. Where FID only measured the delay of the *first* interaction, INP measures the responsiveness of *all* interactions throughout the page's lifetime — clicks, taps, and keyboard input. It reports the worst interaction (approximately the 98th percentile), so one sluggish button handler can tank your score.

**Thresholds:**
- **Good:** under 200 milliseconds
- **Needs improvement:** 200-500 milliseconds
- **Poor:** over 500 milliseconds

### The Three Phases of INP

INP measures the full round trip from user input to the next frame being painted. Understanding the three phases is essential for diagnosis:

```
Phase 1: Input Delay     Phase 2: Processing Time    Phase 3: Presentation Delay
(waiting for the main    (your event handler runs)    (browser calculates layout
 thread to be free)                                    and paints the result)
────────────────────── + ─────────────────────────── + ──────────────────────────── = INP
```

**Phase 1: Input Delay** is the time between the user's input and the start of your event handler. If the main thread is busy (running JavaScript, parsing a large DOM, handling a previous interaction), the event sits in a queue waiting. This is the most common INP problem and the hardest to diagnose because the delay happens before your code even runs.

The fix: break up long tasks. Any JavaScript execution that takes more than 50ms is a "long task" that can delay input processing. Use `setTimeout` or `requestAnimationFrame` to yield to the browser between chunks of work.

**Phase 2: Processing Time** is how long your event handler takes to execute. A handler that filters 10,000 items, recalculates a complex layout, or triggers a cascade of reactive updates will block the main thread during this phase.

The fix: keep event handlers fast. Move heavy computation to Web Workers. Debounce expensive operations. Minimize reactive cascades.

**Phase 3: Presentation Delay** is the time the browser needs to recalculate styles, layout, paint, and composite after your handler modifies the DOM. Large DOM trees (2,000+ nodes), complex CSS selectors, and animations that trigger layout recalculation all increase this phase.

The fix: minimize DOM mutations in event handlers. Avoid reading layout properties (offsetHeight, getBoundingClientRect) immediately after writing DOM properties — this forces a synchronous layout recalculation called "layout thrashing."

### INP Optimization in SvelteKit

Svelte's fine-grained reactivity is a natural INP advantage — it updates only the specific DOM nodes that changed, not the entire component tree. But you can still create INP problems with expensive reactive chains:

```svelte
<script lang="ts">
  // BAD: $derived filtering 10,000 items on every keystroke
  let query = $state('');
  let allItems = $state<Item[]>([]); // 10,000 items
  let filtered = $derived(allItems.filter(i =>
    i.name.toLowerCase().includes(query.toLowerCase())
  ));
  // Every keystroke: input delay + filtering 10,000 items + re-rendering the list
</script>

<input bind:value={query} />
{#each filtered as item}
  <div>{item.name}</div>
{/each}
```

```svelte
<script lang="ts">
  // GOOD: Debounce so filtering runs at most every 150ms
  let query = $state('');
  let debouncedQuery = $state('');
  let allItems = $state<Item[]>([]); // 10,000 items
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debouncedQuery = query; }, 150);
  }

  let filtered = $derived(
    allItems.filter(i => i.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
  );
</script>

<input value={query} oninput={handleInput} />
{#each filtered as item}
  <div>{item.name}</div>
{/each}
```

```svelte
<script lang="ts">
  // BEST: Debounce + virtualized list (only render visible items)
  let query = $state('');
  let debouncedQuery = $state('');
  let allItems = $state<Item[]>([]); // 10,000 items
  let debounceTimer: ReturnType<typeof setTimeout>;
  let scrollTop = $state(0);
  let containerHeight = $state(500);
  const itemHeight = 40;

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debouncedQuery = query; }, 150);
  }

  let filtered = $derived(
    allItems.filter(i => i.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
  );

  // Only render the visible window of items
  let startIndex = $derived(Math.floor(scrollTop / itemHeight));
  let visibleCount = $derived(Math.ceil(containerHeight / itemHeight) + 2);
  let visibleItems = $derived(filtered.slice(startIndex, startIndex + visibleCount));
  let totalHeight = $derived(filtered.length * itemHeight);
  let offsetY = $derived(startIndex * itemHeight);
</script>

<input value={query} oninput={handleInput} placeholder="Search..." />

<div
  class="list-container"
  style="height: {containerHeight}px; overflow-y: auto;"
  onscroll={(e) => { scrollTop = (e.target as HTMLElement).scrollTop; }}
>
  <div style="height: {totalHeight}px; position: relative;">
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item (item.id)}
        <div class="list-item" style="height: {itemHeight}px;">{item.name}</div>
      {/each}
    </div>
  </div>
</div>
```

The progression: naive (bad INP) -> debounced (acceptable INP) -> debounced + virtualized (excellent INP). Virtualization is the key technique for large lists because it reduces both the processing time (filtering is the same, but rendering touches fewer DOM nodes) and the presentation delay (fewer nodes to lay out and paint).

### Moving Heavy Work Off the Main Thread

For computationally intensive operations that cannot be debounced, use Web Workers:

```typescript
// src/lib/workers/search.ts
self.onmessage = (event: MessageEvent<{ items: Item[]; query: string }>) => {
  const { items, query } = event.data;
  const lowerQuery = query.toLowerCase();
  const results = items.filter(item =>
    item.name.toLowerCase().includes(lowerQuery) ||
    item.description.toLowerCase().includes(lowerQuery)
  );
  self.postMessage(results);
};
```

```svelte
<script lang="ts">
  let query = $state('');
  let results = $state<Item[]>([]);
  let searching = $state(false);
  let worker: Worker;

  import { onMount } from 'svelte';

  onMount(() => {
    worker = new Worker(new URL('$lib/workers/search.ts', import.meta.url), {
      type: 'module'
    });
    worker.onmessage = (e) => {
      results = e.data;
      searching = false;
    };
    return () => worker.terminate();
  });

  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    if (query.length > 0) {
      searching = true;
      worker.postMessage({ items: allItems, query });
    } else {
      results = [];
    }
  }
</script>

<input value={query} oninput={handleInput} />
{#if searching}
  <p aria-live="polite">Searching...</p>
{/if}
{#each results as item}
  <div>{item.name}</div>
{/each}
```

The search runs on a separate thread. The main thread stays free to handle input — INP stays low even on massive datasets.

### Third-Party Script Impact on INP

Third-party scripts are the #1 cause of INP regressions that developers do not control. Analytics, A/B testing, chat widgets, and ad scripts all execute on the main thread and can delay your event handlers.

Audit your third-party scripts:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  onMount(() => {
    // Load non-critical third-party scripts AFTER the page is interactive
    // Use requestIdleCallback to load during idle periods
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        loadAnalytics();
        loadChatWidget();
      });
    } else {
      setTimeout(() => {
        loadAnalytics();
        loadChatWidget();
      }, 2000);
    }
  });

  function loadAnalytics() {
    const s = document.createElement('script');
    s.src = 'https://analytics.example.com/tracker.js';
    s.async = true;
    document.head.appendChild(s);
  }

  function loadChatWidget() {
    const s = document.createElement('script');
    s.src = 'https://chat.example.com/widget.js';
    s.async = true;
    document.head.appendChild(s);
  }
</script>
```

## Cumulative Layout Shift (CLS)

CLS measures **visual stability** — how much the page layout shifts unexpectedly while the user is looking at it. You have experienced bad CLS: you are about to tap a button, an ad loads above it, everything shifts down, and you tap the wrong thing.

**Thresholds:**
- **Good:** under 0.1
- **Needs improvement:** 0.1-0.25
- **Poor:** over 0.25

### How CLS Is Calculated

CLS is not a simple pixel measurement. Each unexpected layout shift generates a **layout shift score** calculated as:

```
layout shift score = impact fraction x distance fraction
```

**Impact fraction** = the percentage of the viewport area that was affected by the shift. If an element shifts and the combined area of its old and new position covers 60% of the viewport, the impact fraction is 0.6.

**Distance fraction** = how far the element moved, as a fraction of the viewport. If an element moved 150px on a 900px viewport, the distance fraction is 150/900 = 0.167.

**Example:** A banner loads at the top of the page, pushing everything down by 100px on a 900px viewport. The affected area spans the full viewport width and from the top to the bottom (100% of the viewport). Impact fraction = 1.0. Distance fraction = 100/900 = 0.111. Layout shift score = 1.0 x 0.111 = **0.111** — already in the "needs improvement" range from a single shift.

### Session Windows

CLS does not simply sum all layout shifts on the page. Instead, it uses **session windows** — groups of layout shifts that occur in rapid succession. A session window starts with the first layout shift and ends when there is a 1-second gap with no shifts, or the window reaches 5 seconds total. CLS reports the largest session window as the final score.

This means a page that has one burst of shifts during load and then stabilizes gets a lower CLS than a page that has small shifts throughout its lifetime. Layout shifts that happen within 500ms of a user interaction (clicking, tapping, typing) are excluded — they are considered "expected" shifts.

### The Five CLS Culprits and Their Fixes

**Culprit 1: Images Without Dimensions**

When an image loads without `width` and `height` attributes, the browser initially renders it at 0x0 and then shifts the layout when the image data arrives:

```svelte
<!-- BAD: No dimensions — browser does not know how much space to reserve -->
<img src="/photo.jpg" alt="Photo" />

<!-- GOOD: Explicit dimensions — browser reserves space before the image loads -->
<img src="/photo.jpg" alt="Photo" width={800} height={600} />

<!-- ALSO GOOD: CSS aspect ratio — responsive and prevents CLS -->
<img src="/photo.jpg" alt="Photo" class="w-full aspect-video object-cover" />

<!-- ALSO GOOD: Container with aspect ratio -->
<div class="relative aspect-[4/3]">
  <img src="/photo.jpg" alt="Photo" class="absolute inset-0 w-full h-full object-cover" />
</div>
```

The `aspect-ratio` CSS property is the modern solution for responsive images. It tells the browser the image's proportions before any image data arrives, allowing it to reserve the correct space at any width.

**Culprit 2: Web Font Loading**

When a web font replaces the fallback font, text reflows because the fonts have different metrics (character widths, line heights, spacing). This is the "Flash of Unstyled Text" (FOUT) problem, and it causes CLS.

The fix requires two parts: `font-display: swap` (so content is visible immediately) and `size-adjust` on the fallback font (so the swap does not cause a layout shift):

```css
/* The web font */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: swap; /* Show fallback immediately, swap when font loads */
}

/* A tuned fallback that matches Inter's metrics closely */
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107.64%;       /* Scale fallback to match Inter's width */
  ascent-override: 90.49%;    /* Match the ascent (height above baseline) */
  descent-override: 22.48%;   /* Match the descent (depth below baseline) */
  line-gap-override: 0%;      /* Match the line gap */
}

body {
  font-family: 'Inter', 'Inter Fallback', sans-serif;
}
```

How to find the right `size-adjust` and `ascent-override` values? Use the [Font Fallback Calculator](https://screenspan.net/fallback) or the `@capsizecss/metrics` package. These tools compare the metrics of your web font against common system fonts and compute the override values.

The result: when Inter loads and replaces Arial, the text stays in exactly the same position because the fallback metrics were tuned to match.

**Culprit 3: Dynamic Content Inserted Above the Viewport**

Banners, notifications, cookie consent dialogs, and ads that load at the top of the page push everything down:

```svelte
<!-- BAD: Banner appears and pushes everything down -->
{#if showBanner}
  <div class="banner">Special offer!</div>
{/if}
<main>Content...</main>

<!-- GOOD: Reserve space for the banner -->
<div class="min-h-[48px]">
  {#if showBanner}
    <div class="banner">Special offer!</div>
  {/if}
</div>
<main>Content...</main>

<!-- BETTER: Use CSS transform (does not cause layout shift) -->
<div
  class="banner"
  style="transform: translateY({showBanner ? 0 : -100}%); transition: transform 0.3s;"
>
  Special offer!
</div>
<main>Content...</main>
```

The `transform` approach is ideal because CSS transforms do not trigger layout recalculation — they operate in the compositor layer. The banner slides in without moving any other content.

**Culprit 4: Embeds and Iframes Without Reserved Space**

YouTube embeds, Twitter cards, and other third-party embeds load at zero height and expand when their content arrives:

```svelte
<!-- BAD: iframe loads at 0 height, then expands -->
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" />

<!-- GOOD: Container with fixed aspect ratio reserves the exact space -->
<div class="aspect-video w-full">
  <iframe
    src="https://www.youtube.com/embed/dQw4w9WgXcQ"
    class="w-full h-full"
    loading="lazy"
    title="Video player"
  />
</div>
```

**Culprit 5: Late-Loading Content That Pushes Down Existing Content**

Skeleton screens that are shorter than the actual content, async data that changes the page height, and tab switches that change content height:

```svelte
<!-- BAD: Skeleton is 100px, actual content is 400px — 300px shift -->
{#if loading}
  <div class="skeleton" style="height: 100px;">Loading...</div>
{:else}
  <div class="content">{/* 400px of content */}</div>
{/if}

<!-- GOOD: Skeleton matches actual content height -->
{#if loading}
  <div class="skeleton" style="min-height: 400px;">Loading...</div>
{:else}
  <div class="content" style="min-height: 400px;">{/* content */}</div>
{/if}
```

## How SvelteKit Helps (and Where You Still Need to Work)

SvelteKit gives you a strong foundation, but it does not automatically guarantee green scores. Here is what you get for free and what requires deliberate effort:

**Free wins from SvelteKit:**

- **SSR = fast LCP**: HTML arrives fully rendered. The browser can paint content before JavaScript even loads. This eliminates the biggest LCP bottleneck (client-side rendering) by default.
- **Code splitting**: each route only loads the JavaScript it needs. Navigate to `/about` and you do not download the code for `/dashboard`. Less JavaScript = less main thread blocking = better INP.
- **Link preloading**: SvelteKit preloads linked pages on hover (or with `data-sveltekit-preload-data`), making navigation feel instant and reducing perceived load time.
- **Streaming SSR**: `+page.server.ts` can stream deferred data, showing the page shell immediately while slower data loads in. The LCP element appears in the first flush.
- **No full-page reloads**: Client-side navigation avoids the CLS that comes from full page reloads (white flash, re-rendering everything from scratch).
- **CSS scoping**: Svelte's scoped styles are inlined per component, reducing render-blocking CSS and eliminating unused style delivery.

**Things you still need to handle:**

- Image optimization (sizes, formats, lazy loading, fetchpriority)
- Font loading strategy (size-adjust, preload, font-display)
- Third-party script management (defer, async, lazy load)
- Avoiding layout shifts from dynamic content (reserve space, use transforms)
- Keeping event handlers fast (debounce, Web Workers, virtualization)

## Measuring Core Web Vitals

You need both **lab data** (synthetic, reproducible) and **field data** (real users, noisy but truthful). They answer different questions:

| | Lab Data | Field Data |
|---|---|---|
| **When** | During development | After deployment |
| **Who** | Your machine, your network | Real users, real devices, real networks |
| **Reproducible?** | Yes | No |
| **Represents real users?** | No (your machine is fast) | Yes |
| **Tools** | Lighthouse, DevTools, WebPageTest | CrUX, web-vitals library, your analytics |
| **Use for** | Diagnosing problems | Measuring impact |

### Lab Tools

**Lighthouse** (Chrome DevTools > Lighthouse tab): Run an audit on any page. It simulates a mid-tier mobile device on a slow connection and reports all three Core Web Vitals plus additional metrics. Run it in Incognito mode to avoid browser extension interference.

**Chrome DevTools Performance Panel**: Record a page load or interaction. The timeline shows:
- Long tasks (red bars) — potential INP problems
- Layout shifts (pink bars) — CLS culprits
- LCP marker — when the largest element was painted

Enable "Web Vitals" in the Performance panel to see LCP, CLS, and INP markers directly on the timeline.

**WebPageTest** (webpagetest.org): Run tests from real devices in real locations. The filmstrip view shows exactly when each element appears, making LCP diagnosis visual and intuitive.

### Field Tools: The web-vitals Library

The `web-vitals` library is the most actionable tool for development. It measures actual Core Web Vitals on real user devices and sends them to your analytics:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  onMount(async () => {
    if (!browser) return;

    const { onLCP, onINP, onCLS } = await import('web-vitals');

    function reportMetric(metric: { name: string; value: number; id: string; rating: string }) {
      // Log to console in development
      const color = metric.rating === 'good' ? 'green' : metric.rating === 'needs-improvement' ? 'orange' : 'red';
      console.log(
        `%c${metric.name}: ${metric.value.toFixed(1)}ms (${metric.rating})`,
        `color: ${color}; font-weight: bold;`
      );

      // Send to your analytics backend
      if (import.meta.env.PROD) {
        fetch('/api/analytics/vitals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: metric.name,
            value: metric.value,
            rating: metric.rating,
            id: metric.id,
            page: window.location.pathname,
            userAgent: navigator.userAgent,
            connectionType: (navigator as any).connection?.effectiveType ?? 'unknown',
            timestamp: Date.now()
          }),
          // Use keepalive so the request completes even if the user navigates away
          keepalive: true
        });
      }
    }

    onLCP(reportMetric);
    onINP(reportMetric);
    onCLS(reportMetric);
  });
</script>
```

The `web-vitals` library is dynamically imported — it adds zero bytes to your initial bundle. The `keepalive` option on `fetch` ensures the beacon is sent even if the user navigates away or closes the tab.

### Building an Analytics Endpoint

```typescript
// src/routes/api/analytics/vitals/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const metric = await request.json();

  // In production, write to a time-series database or analytics service
  console.log(`[Web Vital] ${metric.name}: ${metric.value} (${metric.rating}) on ${metric.page}`);

  // You could batch these and write to:
  // - InfluxDB / TimescaleDB for time-series analysis
  // - BigQuery for large-scale analytics
  // - Datadog / New Relic for monitoring dashboards
  // - A simple SQLite/Postgres table for smaller apps

  return json({ received: true });
};
```

### Chrome User Experience Report (CrUX)

CrUX is Google's dataset of real-world Core Web Vitals data collected from Chrome users. It powers the data in PageSpeed Insights and Google Search Console. Key details:

- Data is aggregated over a **28-day rolling window**
- Only pages with sufficient traffic appear in the dataset
- It reports the **75th percentile** (p75) — the experience of the worst-performing 25% of page loads
- It is the data Google actually uses for ranking signals

Check your site's CrUX data at [pagespeed.web.dev](https://pagespeed.web.dev) or in Google Search Console under "Core Web Vitals."

## Performance Budgets and Lighthouse CI

Measuring once is useful. Measuring continuously prevents regressions. A **performance budget** sets limits you enforce in CI:

```json
// lighthouserc.json
{
  "ci": {
    "collect": {
      "url": ["http://localhost:4173/", "http://localhost:4173/blog"],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "interactive": ["error", { "maxNumericValue": 3500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }],
        "total-byte-weight": ["warning", { "maxNumericValue": 500000 }]
      }
    }
  }
}
```

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
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - run: npm run preview &
      - name: Run Lighthouse CI
        run: |
          npm install -g @lhci/cli
          lhci autorun
```

Now every pull request that regresses performance fails CI. No more "we will fix it later."

### Resource-Level Budgets

Beyond timing-based budgets, set limits on resource sizes:

```json
// lighthouse-budget.json
[{
  "path": "/*",
  "timings": [
    { "metric": "largest-contentful-paint", "budget": 2000 },
    { "metric": "interactive", "budget": 3500 },
    { "metric": "cumulative-layout-shift", "budget": 0.05 }
  ],
  "resourceSizes": [
    { "resourceType": "script", "budget": 200 },
    { "resourceType": "image", "budget": 300 },
    { "resourceType": "font", "budget": 100 },
    { "resourceType": "total", "budget": 500 }
  ],
  "resourceCounts": [
    { "resourceType": "third-party", "budget": 5 },
    { "resourceType": "script", "budget": 15 }
  ]
}]
```

## Real Example: Before and After Optimization

Here is a real optimization of a SvelteKit blog page, demonstrating how systematic diagnosis leads to targeted fixes:

### Before (Baseline Measurement)

```
LCP:  3.8s  (POOR)
  Root cause: hero image was 2MB PNG, loaded lazily, no preload
  Breakdown: TTFB 200ms + CSS 150ms + image download 2800ms + paint 650ms

INP:  320ms (POOR)
  Root cause: search filter re-rendered 500 items on every keystroke
  Breakdown: input delay 30ms + filter 180ms + re-render 110ms

CLS:  0.24  (POOR)
  Root cause: web font swap shifted entire page, images without dimensions
  Breakdown: font swap 0.15 + hero image 0.06 + ad banner 0.03
```

### Changes Made

**LCP fixes (3.8s -> 1.2s):**

1. Converted hero image: PNG (2MB) -> WebP (180KB) = 91% reduction
2. Added `fetchpriority="high"` and `loading="eager"` to hero image
3. Added `<link rel="preload">` for hero image in `<svelte:head>`
4. Parallelized database queries in `load` function (450ms -> 200ms)
5. Added `Cache-Control: public, s-maxage=3600` to the load function's response

**INP fixes (320ms -> 85ms):**

1. Debounced search input to 150ms
2. Virtualized the list — only render 20 visible items instead of 500
3. Moved search filtering to a Web Worker for queries matching > 100 items
4. Deferred analytics script loading to `requestIdleCallback`

**CLS fixes (0.24 -> 0.01):**

1. Added `width` and `height` to all `<img>` tags
2. Added `size-adjust: 107%` and `ascent-override: 90%` to font fallback
3. Reserved space for the ad banner with `min-height: 90px`
4. Changed cookie consent banner to use CSS `transform` instead of DOM insertion

### After

```
LCP:  1.2s  (GOOD — 68% improvement)
  Breakdown: TTFB 180ms + CSS 100ms + image download 420ms + paint 500ms

INP:  85ms  (GOOD — 73% improvement)
  Breakdown: input delay 5ms + filter 40ms (debounced) + re-render 40ms (virtualized)

CLS:  0.01  (GOOD — 96% improvement)
  Breakdown: font swap 0.01 (size-adjust) + no other shifts
```

The largest single win was the hero image: converting to WebP and preloading it cut LCP by over 1.5 seconds. The lesson: always start with the biggest bottleneck, not the most interesting optimization.

### The Performance Diagnosis Checklist

When investigating poor Core Web Vitals, follow this checklist:

1. **Run Lighthouse** — get baseline scores and identify which metric is worst
2. **LCP: Check the "Largest Contentful Paint element"** section in Lighthouse — it tells you exactly which element is the LCP
3. **LCP: Check TTFB** — if > 600ms, your server/load function is the bottleneck
4. **LCP: Check the LCP element's resource** — is it preloaded? Using fetchpriority? In the right format?
5. **INP: Open the Performance panel** and interact with the page. Look for long tasks (red bars). Click on them to see the call stack.
6. **INP: Check third-party scripts** — block them with Chrome DevTools' Request Blocking and re-test. If INP improves dramatically, the third-party is the problem.
7. **CLS: Enable "Layout Shift Regions"** in DevTools Rendering panel. Reload and watch for blue highlighted regions — those are the shifts.
8. **CLS: Check all images** for `width`/`height` attributes
9. **CLS: Check font loading** — does the page jump when fonts swap?
10. **Record 3 runs** of each test — performance varies between runs, so use the median

## Try It

1. **Measure your baseline**: Run Lighthouse on one of your SvelteKit pages in Incognito mode. Note the LCP, INP, and CLS scores. Identify the LCP element (Lighthouse tells you which element it is). Screenshot the results.

2. **Fix the LCP element**: If it is an image, convert to WebP, add `fetchpriority="high"` and `loading="eager"`, preload it in `<svelte:head>`, and add `width`/`height`. If it is text, check TTFB and font loading.

3. **Fix CLS**: Add `width` and `height` to every `<img>` tag. For web fonts, add a tuned fallback with `size-adjust` and `ascent-override`. Reserve space for any dynamic content that loads after initial render.

4. **Add web-vitals tracking**: Install `web-vitals` and add the measurement code to your root `+layout.svelte`. Watch the metrics log in the browser console as you interact with the page. Note that INP is only reported when the user navigates away or the page is hidden.

5. **Test INP**: Add a search filter to a page with a list. First, implement it with `$derived` that filters on every keystroke. Then add debouncing. Then add list virtualization. Measure INP at each stage using the Performance panel.

6. **Set up Lighthouse CI**: Add `lighthouserc.json` to your project with budgets for LCP (< 2.0s), CLS (< 0.05), and performance score (> 0.9). Run it locally with `lhci autorun`.

7. **Measure again**: Run Lighthouse after your fixes and compare. Aim for all three metrics in the green zone. Document the before/after numbers — these make great PR descriptions.

## Key Takeaways

- Core Web Vitals (LCP, INP, CLS) are explicit Google ranking signals that measure real user experience — not theoretical performance
- LCP measures perceived load speed with four bottlenecks: TTFB, render-blocking resources, slow resource loading, and client-side rendering — SvelteKit's SSR eliminates the fourth by default
- Preload the LCP element with `<link rel="preload">`, use `fetchpriority="high"`, convert images to WebP/AVIF, and parallelize load function queries
- INP measures responsiveness across three phases: input delay (main thread busy), processing time (your handler), and presentation delay (browser layout/paint) — total must be under 200ms
- Debounce expensive reactive computations, virtualize long lists, and move heavy work to Web Workers to keep INP low
- CLS is calculated as impact fraction x distance fraction, grouped into session windows — the largest window is reported
- Always set image dimensions (`width`/`height` or `aspect-ratio`), tune font fallback metrics with `size-adjust` and `ascent-override`, and reserve space for dynamic content
- Use CSS `transform` for animations and content insertion — transforms do not trigger layout shifts
- Third-party scripts are the #1 uncontrolled INP/LCP regression source — load them asynchronously, defer them to idle time, or remove them
- SvelteKit gives you free wins (SSR, code splitting, link preloading, streaming), but image optimization, font loading, and third-party scripts are still your responsibility
- Measure with both lab tools (Lighthouse, DevTools) and field tools (web-vitals library, CrUX) — lab tools diagnose, field tools measure real impact
- Set performance budgets in CI with Lighthouse CI so regressions are caught before they reach production
- Start with the biggest bottleneck, not the most interesting optimization — one image fix often outweighs ten JavaScript micro-optimizations
- The 75th percentile (p75) is what Google uses — optimizing for the median misses the users who are struggling the most
