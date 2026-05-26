# Core Web Vitals

Google uses **Core Web Vitals** as ranking signals — they measure the real-world user experience of your pages. This is not a vague "quality signal" buried among hundreds of factors. Google has explicitly stated that Core Web Vitals affect ranking, and they publish the exact thresholds. Poor scores can push your pages lower in search results, while good scores give you a measurable ranking boost, especially on mobile where competition for the top spots is fierce.

But here is the deeper reason to care: these metrics are proxies for user experience. A page that loads fast, responds instantly, and does not jump around is simply a better product. The SEO benefit is a side effect of building something that does not frustrate people.

Understanding Core Web Vitals at a principal engineer level means knowing not just what the numbers are, but how they are measured, what architectural decisions affect them, and how SvelteKit's design gives you structural advantages that most frameworks cannot match.

## The Three Core Web Vitals

Each metric targets a different phase of the user's experience: seeing content, interacting with it, and trusting it to stay put.

### Largest Contentful Paint (LCP)

LCP measures how long it takes for the **largest visible element** to finish rendering. This is the moment the user perceives the page as "loaded" — even if smaller elements are still trickling in. The largest element is usually a hero image, a heading, or a large block of text.

- **Good:** under 2.5 seconds
- **Needs improvement:** 2.5-4 seconds
- **Poor:** over 4 seconds

What makes LCP slow? Four things, in order of impact:

1. **Slow server response time (TTFB)** — your server takes too long to start sending HTML
2. **Render-blocking resources** — CSS and synchronous JavaScript that block first paint
3. **Slow resource load time** — the hero image or web font takes too long to download
4. **Client-side rendering** — the browser has to download, parse, and execute JavaScript before it can even start rendering content

SvelteKit addresses #1 and #4 by default. Server-side rendering means the HTML arrives ready to display — the browser does not wait for JavaScript to build the DOM. Streaming SSR (`+page.server.ts` with deferred data) goes further: the server sends the shell immediately and streams in data as it resolves.

**The mental model for LCP:** Think of it as a waterfall. The browser cannot paint the largest element until every step before it completes:

```
DNS Lookup → TCP Connect → TLS Handshake → HTTP Request → TTFB → HTML Parse
  → CSS Download → CSS Parse → Render Tree → Layout → Paint LCP Element
  → (if image) Image Request → Image Download → Image Decode → Paint
```

Every millisecond saved in any step reduces LCP. But the highest-leverage steps are TTFB (server response), CSS delivery, and image loading — because they are the longest links in the chain for most pages.

**What counts as the LCP element?** The browser considers these candidates:
- `<img>` elements (including `<img>` inside `<picture>`)
- `<image>` inside `<svg>`
- `<video>` with a poster image
- Elements with `background-image` loaded via CSS
- Block-level text elements (`<h1>`, `<p>`, etc.)

The browser picks whichever of these is largest *at the time it renders*. This can change as the page loads — an initial text heading might be the LCP element, but then a hero image loads and becomes the new LCP element. The final LCP value is the render time of the last largest element.

### Interaction to Next Paint (INP)

INP replaced First Input Delay (FID) in March 2024. Where FID only measured the delay of the *first* interaction, INP measures the responsiveness of *all* interactions throughout the page's lifetime — clicks, taps, and keyboard input. It reports the worst interaction (approximately the 98th percentile), so one sluggish button handler can tank your score.

- **Good:** under 200 milliseconds
- **Needs improvement:** 200-500 milliseconds
- **Poor:** over 500 milliseconds

INP measures the full round trip: from the user's input to the next frame being painted. This includes three phases:

```
Input Delay          Processing Time         Presentation Delay
(waiting for         (your event             (browser calculates
the main thread      handler runs)           layout and paints)
to be free)
─────────────── + ───────────────── + ─────────────────────── = INP
```

**Input Delay** is often the most overlooked phase. If the main thread is busy (a `$derived` chain recalculating, a third-party script running, a timer callback executing), the browser queues the user's click until the thread is free. The user clicks, nothing happens for 300ms, then the handler runs in 20ms. The input delay was 300ms, the processing time was 20ms — the INP is 320ms+, which is "poor."

The most common INP killer is **long tasks** — JavaScript that monopolizes the main thread for 50ms or more, preventing the browser from responding to input. A single `Array.sort()` on a large dataset, a complex Svelte reactivity cascade, or a third-party analytics script can all cause this.

**Why INP matters more than FID:** FID only measured the first interaction, so a page could score "good" on FID even if every subsequent interaction was slow. Users do not just click once — they scroll, type, click buttons, open menus. INP captures the full interactive experience.

### Cumulative Layout Shift (CLS)

CLS measures **visual stability** — how much the page layout shifts unexpectedly while the user is looking at it. You have experienced bad CLS: you are about to tap a button, an ad loads above it, everything shifts down, and you tap the wrong thing.

- **Good:** under 0.1
- **Needs improvement:** 0.1-0.25
- **Poor:** over 0.25

CLS is calculated as: `impact fraction * distance fraction`. The impact fraction is how much of the viewport was affected; the distance fraction is how far elements moved. A small banner pushing everything down 50px might generate a CLS of 0.15 — already in "needs improvement" territory.

Layout shifts are only counted when they are **unexpected**. A shift that happens within 500ms of a user interaction (clicking an accordion, expanding a dropdown) is excluded. The metric targets shifts caused by lazy content loading, not intentional UI transitions.

**Session window model:** CLS uses a "session window" approach. Shifts are grouped into windows of at most 5 seconds, with at most 1 second between shifts. The CLS score is the maximum session window total, not the sum of all shifts. This means a single burst of shifts is worse than many small isolated shifts spread across the page lifecycle.

```
Example: Two shift patterns, same total shift

Pattern A: One big burst
  Time 0.5s: shift 0.08
  Time 0.7s: shift 0.10
  Time 0.9s: shift 0.07
  → Session window total: 0.25 (poor!)

Pattern B: Spread out
  Time 0.5s: shift 0.08
  Time 8.0s: shift 0.10
  Time 15.0s: shift 0.07
  → Max session window: 0.10 (good)
```

This means that if you must have layout shifts, spreading them out is less damaging than having them all happen at once during page load.

## How SvelteKit Helps (and Where You Still Need to Work)

SvelteKit gives you a strong foundation, but it does not automatically guarantee green scores. Here is what you get for free and what requires deliberate effort:

**Free wins from SvelteKit:**

- **SSR = fast LCP**: HTML arrives fully rendered. The browser can paint content before JavaScript even loads. This eliminates the "blank screen while JS loads" problem that plagues client-side-rendered SPAs.
- **Code splitting**: each route only loads the JavaScript it needs. Navigate to `/about` and you do not download the code for `/dashboard`. SvelteKit does this automatically based on your route structure.
- **Link preloading**: SvelteKit preloads linked pages on hover (or with `data-sveltekit-preload-data`), making navigation feel instant. By the time the user clicks, the data is already fetched.
- **Streaming**: `+page.server.ts` can stream deferred data, showing the page shell immediately while slower data loads in. This means the LCP element (usually a heading or hero) renders fast even if secondary data takes longer.
- **Small runtime**: Svelte compiles away the framework. The runtime is 2-5KB gzipped vs. 30-40KB for React. Less JavaScript = faster parse time = better INP.
- **No virtual DOM diffing**: Svelte's compiled reactivity updates only the exact DOM nodes that changed. No diffing overhead during interactions means faster processing time for INP.

**Things you still need to handle:**

- Image optimization (sizes, formats, lazy loading)
- Font loading strategy
- Third-party script management
- Avoiding layout shifts from dynamic content
- Debouncing expensive reactive computations
- Managing long task durations in event handlers

## Optimizing LCP in SvelteKit

The biggest LCP improvements come from three areas: server response time, resource loading, and critical rendering path.

### Preloading Critical Resources

```svelte
<svelte:head>
  <!-- Preload hero image — tells the browser to start downloading
       BEFORE it encounters the <img> tag in the HTML -->
  <link rel="preload" as="image" href="/hero.webp" type="image/webp" />

  <!-- Preload critical font — crossorigin is required for fonts -->
  <link rel="preload" as="font" href="/fonts/inter-var.woff2"
        type="font/woff2" crossorigin="anonymous" />

  <!-- Preconnect to third-party origins you know you'll need -->
  <link rel="preconnect" href="https://cdn.yoursite.com" />
  <link rel="dns-prefetch" href="https://analytics.yoursite.com" />
</svelte:head>

<!-- The hero image: eager load + high fetch priority -->
<img src="/hero.webp" alt="Hero image" width={1200} height={630}
     loading="eager" fetchpriority="high" />
```

**`fetchpriority="high"`** is critical and often overlooked. Without it, the browser may deprioritize the hero image in favor of other resources it thinks are more important (like scripts). This attribute tells the browser: "this image is the most important visual element on the page — load it first."

### WRONG vs CORRECT: Hero Image Loading

```svelte
<!-- WRONG: Hero image lazy loaded — the most important image loads last! -->
<img src="/hero.png" alt="Hero" loading="lazy" />

<!-- WRONG: Hero image is a 4MB PNG -->
<img src="/hero.png" alt="Hero" width={2400} height={1200}
     loading="eager" fetchpriority="high" />
<!-- Good attributes, but the file is 4MB. Optimize the image itself first. -->

<!-- WRONG: Hero image loaded via CSS background-image -->
<div class="hero" style="background-image: url('/hero.jpg')"></div>
<!-- CSS background images are discovered late in the render pipeline.
     The browser must parse HTML → download CSS → parse CSS → then discover the image.
     An <img> tag is discovered during HTML parsing, much earlier. -->

<!-- CORRECT: Optimized hero image with all the right attributes -->
<img src="/hero.webp" alt="Product dashboard showing real-time analytics"
     width={1200} height={630}
     loading="eager" fetchpriority="high"
     srcset="/hero-800.webp 800w, /hero-1200.webp 1200w, /hero-1600.webp 1600w"
     sizes="(max-width: 768px) 100vw, 1200px" />
```

### Automated Image Optimization

For automated image optimization, use `@sveltejs/enhanced-img` — it generates WebP/AVIF variants, creates multiple sizes for srcset, adds width/height to prevent CLS, and lazy loads by default:

```svelte
<script>
  import heroImage from '$lib/images/hero.jpg?enhanced';
</script>

<!-- enhanced:img generates optimized versions at build time -->
<enhanced:img src={heroImage} alt="Hero image"
  loading="eager" fetchpriority="high" />
```

At build time, this generates multiple sizes and formats (WebP, AVIF) and outputs the appropriate `srcset` and `sizes` attributes. It is the easiest way to get image performance right without manually creating image variants.

### Server Response Time

**Server response time** matters more than people realize. If your server takes 800ms to respond, you have already burned a third of your LCP budget. In SvelteKit, watch your `load` functions:

```typescript
// WRONG: Sequential queries — 450ms total
// Each query waits for the previous one to finish
export const load = async () => {
  const posts = await db.posts.findMany();           // 200ms
  const categories = await db.categories.findMany(); // 150ms — waits for posts
  const author = await db.authors.findFirst();       // 100ms — waits for categories
  return { posts, categories, author };
};

// CORRECT: Parallel queries — 200ms total (limited by slowest query)
export const load = async () => {
  const [posts, categories, author] = await Promise.all([
    db.posts.findMany(),           // 200ms ─┐
    db.categories.findMany(),      // 150ms ─┤ All run simultaneously
    db.authors.findFirst()         // 100ms ─┘
  ]);
  return { posts, categories, author };
};
```

This single change — parallelizing independent queries — often cuts TTFB by 40-60%. It is the single highest-ROI optimization in most SvelteKit applications.

### Streaming for Non-Critical Data

For non-critical data, use SvelteKit's streaming — return promises without `await` and the page shell renders immediately while slower data streams in:

```typescript
// src/routes/blog/[slug]/+page.server.ts
export const load = async ({ params }) => {
  // Awaited: the post is the LCP element, it must be in the initial HTML
  const post = await db.posts.findUnique({ where: { slug: params.slug } });

  if (!post) error(404, 'Post not found');

  return {
    post,
    // NOT awaited: comments stream in after the page shell renders
    // The user sees the post immediately while comments load
    comments: db.comments.findMany({
      where: { postId: post.id },
      orderBy: { createdAt: 'desc' }
    }),
    // NOT awaited: related posts are below the fold anyway
    relatedPosts: db.posts.findMany({
      where: { categoryId: post.categoryId, id: { not: post.id } },
      take: 3
    }),
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<!-- This renders immediately with the awaited post data -->
<article>
  <h1>{data.post.title}</h1>
  <div>{@html data.post.content}</div>
</article>

<!-- Comments stream in — {#await} shows a loading state until they arrive -->
{#await data.comments}
  <p>Loading comments...</p>
{:then comments}
  {#each comments as comment (comment.id)}
    <div class="comment">{comment.body}</div>
  {/each}
{/await}
```

The mental model: **await what the user sees first, stream everything else.** The LCP element (the post title and content) is in the initial HTML response. Comments and related posts arrive via streaming chunks, but the page is already interactive.

## Optimizing INP in SvelteKit

INP improves when you keep the main thread free during interactions. The mental model: every millisecond your JavaScript spends computing is a millisecond the browser cannot spend responding to the user.

### WRONG vs CORRECT: Event Handler Performance

```svelte
<script lang="ts">
  let items = $state<Item[]>([]);
  let loading = $state(false);

  // WRONG: Blocks main thread for 300ms — user sees no feedback
  function handleClick() {
    items = expensiveCalculation(data); // 300ms of synchronous work
    // The browser cannot paint until this function returns
  }

  // BETTER: Show feedback immediately, defer heavy work
  function handleClickBetter() {
    loading = true;
    // requestAnimationFrame lets the browser paint the loading state
    // BEFORE starting the expensive work
    requestAnimationFrame(() => {
      // setTimeout(0) yields to the browser between frames
      setTimeout(() => {
        items = expensiveCalculation(data);
        loading = false;
      }, 0);
    });
  }

  // BEST: Move heavy computation off the main thread entirely
  function handleClickBest() {
    loading = true;
    const worker = new Worker('/workers/compute.js');
    worker.postMessage(data);
    worker.onmessage = (e) => {
      items = e.data;
      loading = false;
      worker.terminate(); // Clean up when done
    };
  }
</script>
```

### Svelte Reactivity Cascades

**Watch out for Svelte reactivity cascades.** If updating one `$state` variable triggers a `$derived` chain that touches hundreds of DOM nodes, the browser has to recalculate layout and repaint — all during the interaction. Keep your reactive dependencies shallow and consider batching updates.

```svelte
<script lang="ts">
  let query = $state('');
  let debouncedQuery = $state('');
  let allItems = $state<Item[]>([]); // 10,000 items
  let debounceTimer: ReturnType<typeof setTimeout>;

  // WRONG: $derived filtering 10,000 items on every keystroke
  // Each keystroke triggers: filter → DOM update → layout → paint
  // If filtering takes 50ms and DOM update takes 100ms, INP is 150ms+
  // let filtered = $derived(allItems.filter(i => i.name.includes(query)));

  // CORRECT: Debounce so filtering runs at most every 150ms
  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debouncedQuery = query; }, 150);
  }

  let filtered = $derived(
    allItems.filter(i => i.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
  );
</script>

<input value={query} oninput={handleInput} placeholder="Search..." />
```

### The Virtualization Pattern

When filtering is not enough — when you have thousands of items and need to render them — virtualization is the answer. Only render the items visible in the viewport:

```svelte
<script lang="ts">
  let items = $state<string[]>(Array.from({ length: 10000 }, (_, i) => `Item ${i}`));
  let scrollTop = $state(0);
  let containerHeight = $state(600);
  const itemHeight = 40;

  let visibleStart = $derived(Math.floor(scrollTop / itemHeight));
  let visibleEnd = $derived(Math.min(
    visibleStart + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  ));
  let visibleItems = $derived(items.slice(visibleStart, visibleEnd));
  let totalHeight = $derived(items.length * itemHeight);
  let offsetY = $derived(visibleStart * itemHeight);
</script>

<div
  class="overflow-auto"
  style="height: {containerHeight}px"
  onscroll={(e) => { scrollTop = (e.target as HTMLElement).scrollTop; }}
>
  <div style="height: {totalHeight}px; position: relative;">
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, i (visibleStart + i)}
        <div style="height: {itemHeight}px;" class="flex items-center px-4">
          {item}
        </div>
      {/each}
    </div>
  </div>
</div>
```

Instead of rendering 10,000 DOM nodes, you render ~20. Scrolling updates which 20 are visible. INP stays under 50ms regardless of list size.

### Third-Party Scripts: The Silent INP Killer

Third-party scripts (analytics, chat widgets, A/B testing tools) are the most common INP culprit in production. They run on your main thread, and you have no control over their performance.

```svelte
<!-- WRONG: Loading third-party scripts eagerly in the head -->
<svelte:head>
  <script src="https://analytics.example.com/tracker.js"></script>
  <script src="https://chat.example.com/widget.js"></script>
</svelte:head>

<!-- CORRECT: Load third-party scripts after the page is interactive -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  onMount(() => {
    // Delay non-critical third-party scripts
    // requestIdleCallback runs when the browser is idle
    if (browser && 'requestIdleCallback' in window) {
      requestIdleCallback(() => {
        loadAnalytics();
        loadChatWidget();
      });
    } else {
      // Fallback: load after 3 seconds
      setTimeout(() => {
        loadAnalytics();
        loadChatWidget();
      }, 3000);
    }
  });

  function loadAnalytics() {
    const script = document.createElement('script');
    script.src = 'https://analytics.example.com/tracker.js';
    script.async = true;
    document.head.appendChild(script);
  }

  function loadChatWidget() {
    const script = document.createElement('script');
    script.src = 'https://chat.example.com/widget.js';
    script.async = true;
    document.head.appendChild(script);
  }
</script>
```

## Optimizing CLS in SvelteKit

CLS problems almost always come from the same handful of causes. Fix these and you are at 0.0 in most cases.

### The Five Common CLS Causes

```svelte
<!-- CAUSE 1: Images without dimensions -->
<!-- WRONG: Browser allocates 0 height, then jumps when image loads -->
<img src="/photo.jpg" alt="Photo" />

<!-- CORRECT: Browser reserves space based on aspect ratio -->
<img src="/photo.jpg" alt="Photo" width={800} height={600} />

<!-- ALSO CORRECT: CSS aspect ratio reserves the space -->
<img src="/photo.jpg" alt="Photo" class="w-full aspect-video object-cover" />


<!-- CAUSE 2: Embeds without reserved space -->
<!-- WRONG: iframe loads at 0 height, then expands -->
<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" />

<!-- CORRECT: aspect-video reserves the 16:9 space -->
<div class="aspect-video">
  <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"
          class="w-full h-full" loading="lazy"
          title="Video player" />
</div>


<!-- CAUSE 3: Content injected above the fold -->
<!-- WRONG: Banner appears and pushes everything down -->
{#if showBanner}
  <div class="bg-yellow-100 p-4">Special offer!</div>
{/if}
<main>...</main>

<!-- CORRECT: Reserve space so nothing moves -->
<div class="min-h-[48px]">
  {#if showBanner}
    <div class="bg-yellow-100 p-4">Special offer!</div>
  {/if}
</div>
<main>...</main>

<!-- ALSO CORRECT: Use transform/opacity animation instead of layout change -->
<div class="bg-yellow-100 p-4 transition-transform duration-300"
     class:translate-y-0={showBanner}
     class:-translate-y-full={!showBanner}>
  Special offer!
</div>


<!-- CAUSE 4: Dynamic content loaded after initial render -->
<!-- WRONG: Price loads async and shifts the "Add to Cart" button -->
{#await pricePromise}
  <!-- Nothing rendered — 0 height -->
{:then price}
  <p class="text-2xl font-bold">${price}</p>
{/await}

<!-- CORRECT: Skeleton placeholder maintains the layout -->
{#await pricePromise}
  <div class="h-8 w-24 bg-gray-200 rounded animate-pulse"></div>
{:then price}
  <p class="text-2xl font-bold">${price}</p>
{/await}


<!-- CAUSE 5: Web fonts with different metrics than fallback -->
<!-- See font loading section below -->
```

### Font Loading and CLS

**Font loading** is a sneaky CLS source. When a web font replaces the fallback, text reflows because the fonts have different metrics (character widths, line heights). This can shift entire page layouts.

```css
/* The problem: "Inter" has different metrics than Arial.
   When Inter loads and replaces Arial, every line of text
   may change height or width, causing layout shifts. */

/* WRONG: No fallback tuning — large CLS from font swap */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: swap;
}
body { font-family: 'Inter', Arial, sans-serif; }

/* CORRECT: Tuned fallback matches Inter's metrics closely */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107%;
  ascent-override: 90%;
  descent-override: 22%;
  line-gap-override: 0%;
}
body { font-family: 'Inter', 'Inter Fallback', sans-serif; }
```

The `size-adjust` and `*-override` properties tune the fallback font to match the web font's metrics as closely as possible. Tools like [Fontaine](https://github.com/unjs/fontaine) or the [Font Fallback Generator](https://screenspan.net/fallback) can compute these values for any font pair.

**Alternative approach: `font-display: optional`**

```css
/* font-display: optional — no swap, no CLS, but might not show custom font
   on first visit. The browser uses the custom font ONLY if it loads
   within ~100ms. Otherwise it sticks with the fallback for the entire
   page lifetime. On subsequent visits, the font is cached and loads instantly. */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: optional;
}
```

This eliminates CLS from font loading entirely, at the cost of sometimes showing the fallback font on first visit. For most applications, this tradeoff is worth it.

### SvelteKit-Specific CLS Gotcha: Client-Side Navigation

SvelteKit's client-side navigation can cause CLS if your page layouts differ significantly between routes:

```svelte
<!-- WRONG: Different pages have different layout heights,
     causing a flash of wrong-sized content during navigation -->

<!-- CORRECT: Use CSS min-height to prevent layout collapse during navigation -->
<main class="min-h-screen">
  {@render children()}
</main>
```

Also watch for `{#await}` blocks in streamed data. When SvelteKit streams deferred data, the `{#await}` block transitions from the loading state to the resolved state. If these states have different heights, you get CLS:

```svelte
<!-- WRONG: Loading state is shorter than resolved state -->
{#await data.comments}
  <p>Loading...</p>
{:then comments}
  <div class="space-y-4">
    {#each comments as comment}
      <div class="p-4 border rounded">{comment.body}</div>
    {/each}
  </div>
{/await}

<!-- CORRECT: Loading state matches the expected height of resolved content -->
{#await data.comments}
  <div class="space-y-4">
    {#each Array(3) as _}
      <div class="p-4 border rounded h-20 bg-gray-100 animate-pulse"></div>
    {/each}
  </div>
{:then comments}
  <div class="space-y-4">
    {#each comments as comment (comment.id)}
      <div class="p-4 border rounded">{comment.body}</div>
    {/each}
  </div>
{/await}
```

## Measuring Core Web Vitals

You need both **lab data** (synthetic, reproducible, for debugging) and **field data** (real users, noisy, but reflects actual experience). They answer different questions:

| | Lab Data | Field Data |
|---|---|---|
| **Source** | Lighthouse, DevTools | CrUX, web-vitals library |
| **Environment** | Simulated device/network | Real user devices/networks |
| **Best for** | Debugging, pre-deploy checks | Tracking real user impact |
| **Limitation** | Does not reflect real conditions | Hard to reproduce issues |
| **INP** | Cannot measure (no real interactions) | Only source of truth |

**Lab tools:** **Lighthouse** (Chrome DevTools > Lighthouse tab), **PageSpeed Insights** (pagespeed.web.dev — also shows real-user CrUX data), **Chrome DevTools Performance panel** (most detailed, shows every frame and long task).

**Field tools:** **CrUX** (Chrome User Experience Report — aggregated Chrome user data over 28 days, available via BigQuery or PageSpeed Insights), **`web-vitals`** library (measure in your own analytics).

### Adding web-vitals to Your SvelteKit App

The `web-vitals` library is the most actionable for development. Add it to your SvelteKit layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let { children } = $props();

  onMount(async () => {
    if (!browser) return;

    const { onLCP, onINP, onCLS } = await import('web-vitals');

    const report = (metric: any) => {
      // Log to console during development
      const color = metric.rating === 'good' ? 'green'
        : metric.rating === 'needs-improvement' ? 'orange' : 'red';
      console.log(
        `%c${metric.name}: ${metric.value.toFixed(1)} (${metric.rating})`,
        `color: ${color}; font-weight: bold;`
      );

      // Send to your analytics endpoint in production
      if (import.meta.env.PROD) {
        // Use navigator.sendBeacon for reliability —
        // it sends even if the user closes the tab
        navigator.sendBeacon('/api/analytics', JSON.stringify({
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          id: metric.id,       // Deduplicates per page load
          page: window.location.pathname,
          navigationType: metric.navigationType, // 'navigate', 'reload', 'back-forward'
        }));
      }
    };

    onLCP(report);
    onINP(report);
    onCLS(report);
  });
</script>

{@render children()}
```

### Building an Analytics Endpoint

```typescript
// src/routes/api/analytics/+server.ts
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const metrics = await request.json();

  // Store in your database, or forward to an analytics service
  console.log('Web Vitals:', metrics);

  // Example: store in a time-series database for dashboarding
  // await db.insert(webVitals).values({
  //   metricName: metrics.name,
  //   metricValue: metrics.value,
  //   metricRating: metrics.rating,
  //   page: metrics.page,
  //   navigationType: metrics.navigationType,
  //   timestamp: new Date(),
  //   userAgent: request.headers.get('user-agent'),
  // });

  return new Response(null, { status: 204 });
};
```

### Using Chrome DevTools Performance Panel

The Performance panel is the most powerful debugging tool for Core Web Vitals. Here is how to use it effectively:

1. Open DevTools > Performance tab
2. Enable "Screenshots" and "Web Vitals" checkboxes
3. Check "Slow 3G" or "Fast 3G" network throttling (matches real user conditions)
4. Check "4x slowdown" CPU throttling (matches mobile devices)
5. Click Record, reload the page, wait for full load, stop recording

**What to look for:**
- **LCP marker**: A blue diamond in the Web Vitals lane. Click it to see which element was the LCP element. If it is late, trace back through the waterfall to find what delayed it.
- **CLS markers**: Red squares in the Web Vitals lane. Click to see which elements shifted and by how much. The "Layout Shift" section shows the exact elements.
- **Long tasks**: Red bars across the top of the main thread. Any task over 50ms is marked. These are your INP risks. Click to see the call stack.
- **Input events**: Look for click/keydown events and measure the time from the event to the next paint. This is your INP for that interaction.

## The Performance Budget Mental Model

Measuring once is useful. Measuring continuously prevents regressions. A **performance budget** sets limits you enforce in CI:

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
  ]
}]
```

Now every pull request that regresses performance fails CI. No more "we will fix it later."

### Integrating Lighthouse CI

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
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - name: Run Lighthouse
        uses: treosh/lighthouse-ci-action@v11
        with:
          urls: |
            http://localhost:4173/
            http://localhost:4173/blog
          budgetPath: ./lighthouse-budget.json
          uploadArtifacts: true
```

## Real Example: Before and After

Here is a real optimization of a SvelteKit blog page, showing the systematic approach:

**Before:**
```
LCP:  3.8s  (poor — hero image was 2MB PNG, loaded lazily)
INP:  320ms (poor — search filter re-rendered 500 items on every keystroke)
CLS:  0.24  (poor — web font swap shifted the entire page)
```

**Investigation process:**

1. **Lighthouse audit** identified the hero image as the LCP element (3.8s render time)
2. **Performance panel** showed a 300ms long task on every keystroke in the search box
3. **CLS debugging** revealed two shift sources: font swap (0.14) and late-loading ad banner (0.10)

**Changes made:**

1. **LCP fix**: Converted hero image to WebP (2MB -> 180KB), added `fetchpriority="high"` and `loading="eager"`, preloaded it in `<svelte:head>`, added `srcset` for responsive sizes
2. **INP fix**: Debounced the search input to 150ms, virtualized the list to only render visible items (15 items instead of 500), moved fuzzy-search scoring to a Web Worker
3. **CLS fix**: Added `width`/`height` to all images, added `size-adjust` to the font fallback, reserved space for the ad banner with `min-height`, switched to `font-display: optional`

**After:**
```
LCP:  1.2s  (good — 68% improvement)
INP:  85ms  (good — 73% improvement)
CLS:  0.01  (good — 96% improvement)
```

The largest single win was the hero image: converting to WebP and preloading it cut LCP by over a second. The lesson: **always start with the biggest bottleneck, not the most interesting optimization.** One image fix often outweighs ten JavaScript micro-optimizations.

### The Optimization Priority Order

When you have limited time, optimize in this order:

1. **Images** (LCP + CLS): format, size, loading strategy, dimensions — usually the single biggest win
2. **Server response** (LCP): parallelize load functions, add caching headers, use streaming
3. **Font loading** (CLS): font-display, fallback metrics, preload
4. **JavaScript** (INP): debounce, virtualize, defer third-party scripts
5. **CSS** (LCP): inline critical CSS, defer non-critical (SvelteKit handles most of this)

## Advanced: Content Visibility for Long Pages

For pages with a lot of below-the-fold content (documentation, long blog posts), `content-visibility: auto` can dramatically reduce initial rendering cost:

```css
/* Each section below the fold is not rendered until it's near the viewport.
   This reduces initial layout and paint time, improving LCP. */
.content-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 500px; /* Estimated height for scroll bar accuracy */
}
```

This tells the browser: "skip rendering this section until the user scrolls near it." The browser still knows the element exists (for find-on-page and accessibility), but does not compute layout or paint until needed. The `contain-intrinsic-size` provides an estimated height so the scrollbar does not jump.

## Try It

1. **Measure your baseline**: Run Lighthouse on one of your SvelteKit pages (Chrome DevTools > Lighthouse tab). Note the LCP, INP, and CLS scores. Screenshot the results. Also check PageSpeed Insights (pagespeed.web.dev) for real-user CrUX data if your site is public.

2. **Fix images**: Add `width` and `height` to every `<img>` tag in your project. Convert at least one image to WebP using an online converter or Sharp. For your hero image, add `fetchpriority="high"` and `loading="eager"`, and preload it in `<svelte:head>`.

3. **Parallelize load functions**: Find a `load` function that makes sequential database or API calls. Refactor to use `Promise.all()` for independent queries. Measure the TTFB improvement.

4. **Add `web-vitals` tracking**: Install `web-vitals` (`npm install web-vitals`) and add the measurement code to your root `+layout.svelte`. Watch the metrics log in the browser console as you interact with the page. Color-code the output (green/orange/red) based on the rating.

5. **Hunt for layout shifts**: In Chrome DevTools Performance panel, enable "Screenshots" and "Web Vitals", record a page load, and look for the red CLS markers. Click them to see which elements shifted. Fix at least one shift source.

6. **Test INP**: In the Performance panel, record yourself interacting with a page — click buttons, type in inputs, open dropdowns. Look for long tasks (red bars) that coincide with your interactions. If any interaction takes over 200ms, optimize it with debouncing or requestAnimationFrame.

7. **Measure again**: Run Lighthouse after your fixes and compare. Aim for all three metrics in the green zone.

## Key Takeaways

- Core Web Vitals (LCP, INP, CLS) are explicit Google ranking signals that measure real user experience — not theoretical performance
- LCP measures perceived load speed — optimize server response time (parallelize load functions), preload critical resources, use modern image formats (WebP/AVIF), and lean on SvelteKit's SSR to avoid the client-rendering delay
- INP measures responsiveness of all interactions (it replaced FID) — keep event handlers fast, debounce expensive reactive computations, virtualize long lists, and defer third-party scripts with `requestIdleCallback`
- CLS measures visual stability — always set image dimensions, reserve space for dynamic content with skeleton placeholders, tune font fallback metrics with `size-adjust`, and use `content-visibility: auto` for long pages
- CLS uses session windows: a burst of shifts is worse than the same shifts spread out — if shifts are unavoidable, spread them across time
- SvelteKit gives you structural advantages (SSR, code splitting, small runtime, compiled reactivity, link preloading, streaming), but image optimization, font loading, and third-party script management are still your responsibility
- Measure with both lab tools (Lighthouse, DevTools Performance panel) and field tools (web-vitals library, CrUX) — lab tools help debug, field tools reflect reality. INP can only be measured with field data.
- Set a performance budget and enforce it in CI with Lighthouse CI so regressions are caught before they reach production
- The optimization priority order is: images > server response > fonts > JavaScript > CSS — start with the biggest bottleneck, not the most interesting optimization
- Use `navigator.sendBeacon` to report web vitals — it survives tab closes and does not block the main thread
