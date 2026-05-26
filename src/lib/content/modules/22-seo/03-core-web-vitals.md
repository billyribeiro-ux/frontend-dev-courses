# Core Web Vitals

Google uses **Core Web Vitals** as ranking signals — they measure the real-world user experience of your pages. This is not a vague "quality signal" buried among hundreds of factors. Google has explicitly stated that Core Web Vitals affect ranking, and they publish the exact thresholds. Poor scores can push your pages lower in search results, while good scores give you a measurable ranking boost, especially on mobile where competition for the top spots is fierce.

But here is the deeper reason to care: these metrics are proxies for user experience. A page that loads fast, responds instantly, and does not jump around is simply a better product. The SEO benefit is a side effect of building something that does not frustrate people.

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

The most common INP killer is **long tasks** — JavaScript that monopolizes the main thread for 50ms or more, preventing the browser from responding to input. A single `Array.sort()` on a large dataset, a complex Svelte reactivity cascade, or a third-party analytics script can all cause this.

### Cumulative Layout Shift (CLS)

CLS measures **visual stability** — how much the page layout shifts unexpectedly while the user is looking at it. You have experienced bad CLS: you are about to tap a button, an ad loads above it, everything shifts down, and you tap the wrong thing.

- **Good:** under 0.1
- **Needs improvement:** 0.1-0.25
- **Poor:** over 0.25

CLS is calculated as: `impact fraction * distance fraction`. The impact fraction is how much of the viewport was affected; the distance fraction is how far elements moved. A small banner pushing everything down 50px might generate a CLS of 0.15 — already in "needs improvement" territory.

Layout shifts are only counted when they are **unexpected**. A shift that happens within 500ms of a user interaction (clicking an accordion, expanding a dropdown) is excluded. The metric targets shifts caused by lazy content loading, not intentional UI transitions.

## How SvelteKit Helps (and Where You Still Need to Work)

SvelteKit gives you a strong foundation, but it does not automatically guarantee green scores. Here is what you get for free and what requires deliberate effort:

**Free wins from SvelteKit:**

- **SSR = fast LCP**: HTML arrives fully rendered. The browser can paint content before JavaScript even loads.
- **Code splitting**: each route only loads the JavaScript it needs. Navigate to `/about` and you do not download the code for `/dashboard`.
- **Link preloading**: SvelteKit preloads linked pages on hover (or with `data-sveltekit-preload-data`), making navigation feel instant.
- **Streaming**: `+page.server.ts` can stream deferred data, showing the page shell immediately while slower data loads in.

**Things you still need to handle:**

- Image optimization (sizes, formats, lazy loading)
- Font loading strategy
- Third-party script management
- Avoiding layout shifts from dynamic content

## Optimizing LCP in SvelteKit

The biggest LCP improvements come from three areas: server response time, resource loading, and critical rendering path.

```svelte
<svelte:head>
  <!-- Preload hero image and critical font before the browser encounters them -->
  <link rel="preload" as="image" href="/hero.webp" type="image/webp" />
  <link rel="preload" as="font" href="/fonts/inter-var.woff2"
        type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<img src="/hero.webp" alt="Hero image" width={1200} height={630}
     loading="eager" fetchpriority="high" />
```

For automated image optimization, use `@sveltejs/enhanced-img` — it generates WebP/AVIF variants, creates multiple sizes for srcset, adds width/height to prevent CLS, and lazy loads by default:

```svelte
<script>
  import heroImage from '$lib/images/hero.jpg?enhanced';
</script>
<enhanced:img src={heroImage} alt="Hero image" loading="eager" />
```

**Server response time** matters more than people realize. If your server takes 800ms to respond, you have already burned a third of your LCP budget. In SvelteKit, watch your `load` functions:

```typescript
// SLOW: Sequential queries — 450ms total
export const load = async () => {
  const posts = await db.posts.findMany();           // 200ms
  const categories = await db.categories.findMany(); // 150ms
  const author = await db.authors.findFirst();       // 100ms
  return { posts, categories, author };
};

// FAST: Parallel queries — 200ms total
export const load = async () => {
  const [posts, categories, author] = await Promise.all([
    db.posts.findMany(), db.categories.findMany(), db.authors.findFirst()
  ]);
  return { posts, categories, author };
};
```

For non-critical data, use SvelteKit's streaming — return promises without `await` and the page shell renders immediately while slower data streams in:

```typescript
export const load = async () => {
  const post = await db.posts.findUnique({ where: { slug } });  // Awaited: critical
  return {
    post,
    comments: db.comments.findMany({ where: { postId: post.id } }),  // Not awaited: streamed
  };
};
```

## Optimizing INP in SvelteKit

INP improves when you keep the main thread free during interactions. The mental model: every millisecond your JavaScript spends computing is a millisecond the browser cannot spend responding to the user.

```svelte
<script lang="ts">
  // BAD: blocks main thread for 300ms
  function handleClick() {
    items = expensiveCalculation(data);
  }

  // BETTER: show feedback immediately, defer heavy work
  function handleClickBetter() {
    loading = true;
    setTimeout(() => {
      items = expensiveCalculation(data);
      loading = false;
    }, 0);
  }

  // BEST: move heavy computation off the main thread
  function handleClickBest() {
    loading = true;
    const worker = new Worker('/workers/compute.js');
    worker.postMessage(data);
    worker.onmessage = (e) => { items = e.data; loading = false; };
  }
</script>
```

**Watch out for Svelte reactivity cascades.** If updating one `$state` variable triggers a `$derived` chain that touches hundreds of DOM nodes, the browser has to recalculate layout and repaint — all during the interaction. Keep your reactive dependencies shallow and consider batching updates.

```svelte
<script lang="ts">
  let query = $state('');
  let debouncedQuery = $state('');
  let allItems = $state<Item[]>([]); // 10,000 items
  let debounceTimer: ReturnType<typeof setTimeout>;

  // BAD: $derived filtering 10,000 items on every keystroke
  // let filtered = $derived(allItems.filter(i => i.name.includes(query)));

  // GOOD: Debounce so filtering runs at most every 150ms
  function handleInput(e: Event) {
    query = (e.target as HTMLInputElement).value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { debouncedQuery = query; }, 150);
  }

  let filtered = $derived(
    allItems.filter(i => i.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
  );
</script>
```

## Optimizing CLS in SvelteKit

CLS problems almost always come from the same handful of causes. Fix these and you are at 0.0 in most cases:

```svelte
<!-- CAUSE 1: Images without dimensions -->
<img src="/photo.jpg" alt="Photo" />                           <!-- BAD -->
<img src="/photo.jpg" alt="Photo" width={800} height={600} />  <!-- GOOD -->
<img src="/photo.jpg" alt="Photo" class="w-full aspect-video object-cover" /> <!-- ALSO GOOD -->

<!-- CAUSE 2: Embeds without reserved space -->
<iframe src="https://www.youtube.com/embed/..." />  <!-- BAD: loads at 0 height -->
<div class="aspect-video">                          <!-- GOOD: reserves space -->
  <iframe src="https://www.youtube.com/embed/..." class="w-full h-full" loading="lazy" />
</div>

<!-- CAUSE 3: Content injected above the fold -->
{#if showBanner}                          <!-- BAD: pushes everything down -->
  <div class="banner">Special offer!</div>
{/if}

<div class="min-h-[48px]">               <!-- GOOD: reserves space -->
  {#if showBanner}
    <div class="banner">Special offer!</div>
  {/if}
</div>
```

**Font loading** is a sneaky CLS source. When a web font replaces the fallback, text reflows because the fonts have different metrics. Use `font-display: swap` combined with `size-adjust` on the fallback:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-var.woff2') format('woff2');
  font-display: swap;
}
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial');
  size-adjust: 107%; ascent-override: 90%;
  descent-override: 22%; line-gap-override: 0%;
}
body { font-family: 'Inter', 'Inter Fallback', sans-serif; }
```

## Measuring Core Web Vitals

You need both **lab data** (synthetic, reproducible) and **field data** (real users, noisy). Lab tools: **Lighthouse** (Chrome DevTools), **PageSpeed Insights** (pagespeed.web.dev — also shows real-user CrUX data), **Chrome DevTools Performance panel**. Field tools: **CrUX** (aggregated Chrome user data over 28 days), **`web-vitals`** library (measure in your own analytics).

The `web-vitals` library is the most actionable for development. Add it to your SvelteKit layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  onMount(async () => {
    const { onLCP, onINP, onCLS } = await import('web-vitals');

    const report = (metric: any) => {
      console.log(`${metric.name}:`, metric.value);
      // Send to your analytics — metric.id deduplicates per page load
      fetch('/api/analytics', {
        method: 'POST',
        body: JSON.stringify({
          name: metric.name, value: metric.value,
          id: metric.id, page: window.location.pathname
        })
      });
    };

    onLCP(report);
    onINP(report);
    onCLS(report);
  });
</script>
```

## The Performance Budget Mental Model

Measuring once is useful. Measuring continuously prevents regressions. A **performance budget** sets limits you enforce: LCP < 2.0s, INP < 150ms, CLS < 0.05, total JS < 200KB, hero image < 150KB. Enforce in CI with Lighthouse CI and a budget file:

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
    { "resourceType": "total", "budget": 500 }
  ]
}]
```

Now every pull request that regresses performance fails CI. No more "we will fix it later."

## Real Example: Before and After

Here is a real optimization of a SvelteKit blog page:

**Before:**
```
LCP:  3.8s  (poor — hero image was 2MB PNG, loaded lazily)
INP:  320ms (poor — search filter re-rendered 500 items on every keystroke)
CLS:  0.24  (poor — web font swap shifted the entire page)
```

**Changes made:**
1. Converted hero image to WebP (2MB -> 180KB), added `fetchpriority="high"` and `loading="eager"`, preloaded it in `<svelte:head>`
2. Debounced the search input to 150ms, virtualized the list to only render visible items
3. Added `width`/`height` to all images, added `size-adjust` to the font fallback, reserved space for the ad banner

**After:**
```
LCP:  1.2s  (good — 68% improvement)
INP:  85ms  (good — 73% improvement)
CLS:  0.01  (good — 96% improvement)
```

The largest single win was the hero image: converting to WebP and preloading it cut LCP by over a second. The lesson: always start with the biggest bottleneck, not the most interesting optimization.

## Try It

1. **Measure your baseline**: Run Lighthouse on one of your SvelteKit pages. Note the LCP, INP, and CLS scores. Screenshot the results.

2. **Fix images**: Add `width` and `height` to every `<img>` tag. Convert at least one image to WebP. For your hero image, add `fetchpriority="high"` and `loading="eager"`, and preload it in `<svelte:head>`.

3. **Add `web-vitals` tracking**: Install `web-vitals` and add the measurement code to your root `+layout.svelte`. Watch the metrics log in the browser console as you interact with the page.

4. **Check for layout shifts**: In Chrome DevTools Performance panel, enable "Screenshots" and "Web Vitals", record a page load, and look for the red CLS markers. Click them to see which elements shifted.

5. **Measure again**: Run Lighthouse after your fixes and compare. Aim for all three metrics in the green zone.

## Key Takeaways

- Core Web Vitals (LCP, INP, CLS) are explicit Google ranking signals that measure real user experience — not theoretical performance
- LCP measures perceived load speed — optimize server response time, preload critical resources, use modern image formats, and lean on SvelteKit's SSR
- INP measures responsiveness of all interactions (it replaced FID) — keep event handlers fast, debounce expensive computations, move heavy work to Web Workers
- CLS measures visual stability — always set image dimensions, reserve space for dynamic content, and tune font fallback metrics
- SvelteKit gives you free wins (SSR, code splitting, link preloading, streaming), but image optimization, font loading, and third-party scripts are still your responsibility
- Measure with both lab tools (Lighthouse, DevTools) and field tools (web-vitals library, CrUX) — they answer different questions
- Set a performance budget and enforce it in CI so regressions are caught before they reach production
- Start with the biggest bottleneck, not the most interesting optimization — one image fix often outweighs ten JavaScript micro-optimizations
