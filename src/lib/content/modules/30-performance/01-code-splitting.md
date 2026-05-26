# Code Splitting

When a user visits your app, the browser downloads JavaScript before anything interactive can happen. Parse it, compile it, execute it — all before the user can click a single button. Ship a 2MB bundle and a user on a mid-range phone over 3G waits 10+ seconds staring at a blank screen. That is not a performance problem — that is a product problem. Users leave.

**Code splitting** breaks your application into smaller chunks so the browser only downloads what is needed for the current page, at the moment it is needed. The mental model is simple: instead of one massive bundle containing every page, component, and utility in your app, you ship many small bundles and load them on demand.

The great news: SvelteKit does route-based code splitting automatically. Every route gets its own chunk, so visiting the home page does not force users to download the JavaScript for your admin dashboard. But understanding how this works — and how to take it further — is the difference between an app that is fast by accident and one that is fast by design.

## The Performance Mental Model

Before diving into techniques, internalize this mental model:

1. **Measure first** — Do not guess what is slow. Use browser DevTools, Lighthouse, and bundle analysis to find the actual bottlenecks.
2. **Optimize what matters** — A 50KB savings on a page nobody visits is wasted effort. Focus on the critical path: what loads on first visit.
3. **Verify the improvement** — After every optimization, measure again. Performance work without measurement is just superstition.

The biggest performance lever for most SPAs is reducing the amount of JavaScript on the critical path. Everything else — image optimization, caching, CDN — matters, but JavaScript is uniquely expensive because it must be downloaded, parsed, compiled, and executed before it does anything useful.

## How SvelteKit Auto-Splits Code

SvelteKit creates a separate JavaScript bundle for each route. When a user navigates to a page, the browser downloads only the code for that specific route:

```
src/routes/
  +page.svelte        → chunk for "/"
  about/+page.svelte  → chunk for "/about"
  blog/+page.svelte   → chunk for "/blog"
  admin/+page.svelte  → chunk for "/admin" (never loaded for regular users)
```

Shared code (components, utilities, stores) gets extracted into common chunks that are loaded once and cached across routes. If `Header.svelte` is used on every page, Vite's bundler puts it in a shared chunk rather than duplicating it in every route bundle.

You do not need to configure any of this — it happens automatically through Vite's bundling. But you should understand what it means: **each `+page.svelte`, `+layout.svelte`, and their associated `+page.ts`/`+page.server.ts` files define a code-split boundary.** Organizing your routes well means better code splitting for free.

## Dynamic Imports for Component-Level Splitting

Route-level splitting handles page boundaries, but sometimes a single page has heavy components that are not needed immediately. A rich text editor, a data visualization chart, a map widget — these can be hundreds of kilobytes each, and the user might never interact with them.

Use dynamic `import()` to load them on demand:

```svelte
<script lang="ts">
  let showEditor = $state(false);
  let EditorComponent: any = $state(null);

  async function openEditor() {
    if (!EditorComponent) {
      const module = await import('$lib/components/RichTextEditor.svelte');
      EditorComponent = module.default;
    }
    showEditor = true;
  }
</script>

<button onclick={openEditor}>Open Editor</button>

{#if showEditor && EditorComponent}
  <EditorComponent />
{/if}
```

The `RichTextEditor` bundle is not downloaded until the user clicks the button. This is perfect for heavy components that sit behind a user interaction — editors, charts, maps, PDF viewers, and code highlighters.

The key insight: each `import()` call creates a **split point**. Vite sees the dynamic import and creates a separate chunk for that module and all its dependencies. You are telling the bundler: "this code is not needed right away — make it a separate download."

## Lazy Loading with `{#await}`

Combine dynamic imports with Svelte's `{#await}` block for elegant lazy loading with loading states:

```svelte
<script lang="ts">
  let showChart = $state(false);
  let chartData = $state([/* ... */]);

  // The import only happens when this function is called
  function loadChart() {
    showChart = true;
  }
</script>

<button onclick={loadChart}>Show Analytics</button>

{#if showChart}
  {#await import('$lib/components/Chart.svelte')}
    <div class="skeleton" aria-busy="true">Loading chart...</div>
  {:then { default: Chart }}
    <Chart data={chartData} />
  {:catch error}
    <p>Failed to load chart: {error.message}</p>
  {/await}
{/if}
```

This pattern gives you loading states, error handling, and code splitting in a single readable block. The chart module is only fetched when `showChart` becomes true.

## A Reusable Lazy-Loading Wrapper

For a pattern you will use repeatedly, extract it into a reusable component:

```svelte
<!-- src/lib/components/Lazy.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let { loader, ...rest }: { loader: () => Promise<any>; [key: string]: any } = $props();
  let Component: any = $state(null);
  let loading = $state(true);
  let error: Error | null = $state(null);

  onMount(async () => {
    try {
      const module = await loader();
      Component = module.default;
    } catch (e) {
      error = e instanceof Error ? e : new Error('Failed to load component');
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="skeleton" aria-busy="true">Loading...</div>
{:else if error}
  <div class="error" role="alert">{error.message}</div>
{:else if Component}
  <Component {...rest} />
{/if}
```

Use it anywhere — props are forwarded to the loaded component:

```svelte
<Lazy loader={() => import('$lib/components/Chart.svelte')} data={chartData} />
```

## Tree Shaking: Dead Code Elimination

Tree shaking is the bundler's ability to remove code you import but never actually use. It works because ES modules have static structure — the bundler can analyze `import` and `export` statements at build time and determine which exports are actually referenced.

```typescript
// Bad: imports the entire library — bundler may not be able to tree-shake
import _ from 'lodash';
_.debounce(fn, 300);

// Good: import only what you need — clearly tree-shakeable
import debounce from 'lodash/debounce';
debounce(fn, 300);

// Best: write it yourself (debounce is ~10 lines of code)
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

Tree shaking works best when:

- Libraries use ES module exports (not CommonJS `module.exports`)
- You import specific named exports rather than the default/namespace
- The code has no side effects (the library marks itself with `"sideEffects": false` in `package.json`)

If a library is not tree-shakeable, every `import` pulls in the entire package. This is why importing a single function from some older libraries adds 50KB+ to your bundle.

## Bundle Analysis: See What You Are Shipping

You cannot optimize what you cannot see. Use the Vite bundle analyzer to visualize exactly what is in your JavaScript bundles:

```bash
npm install -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    visualizer({
      open: true,
      gzipSize: true,
      filename: 'bundle-analysis.html'
    })
  ]
});
```

Run `npm run build` and an interactive treemap opens showing every module in your bundle, sized by bytes. Look for:

- **Unexpectedly large dependencies** — Is `moment.js` (300KB) hiding in there when you only format one date? Replace it with `Intl.DateTimeFormat` (0KB, built into the browser).
- **Duplicate dependencies** — Two versions of the same library loaded by different packages.
- **Client-side code that should be server-only** — A PDF generation library imported in a component when it should only run in `+server.ts`.

This analysis is the single best debugging tool for bundle size issues. Run it after every dependency addition.

## Moving Heavy Code Server-Side

If a library is only used in `+page.server.ts`, `+server.ts`, or server-only load functions, it is never bundled for the client. This is one of SvelteKit's most powerful performance features:

```typescript
// src/routes/api/pdf/+server.ts
// This code only runs on the server — zero bytes shipped to the browser
import PDFDocument from 'pdfkit';
import sharp from 'sharp';

export async function POST({ request }) {
  const data = await request.json();
  // Generate PDF server-side...
}
```

```typescript
// src/routes/dashboard/+page.server.ts
// Heavy data processing stays on the server
import { parse } from 'csv-parse/sync';
import { complex_ml_inference } from '$lib/server/ml';

export async function load() {
  // Process data on the server, send only the results to the client
  const raw = await readFile('data.csv', 'utf-8');
  const processed = parse(raw);
  return { summary: summarize(processed) }; // small JSON, not the library
}
```

The mental model: anything inside `+server.ts`, `+page.server.ts`, or `$lib/server/` is guaranteed to never reach the client bundle. Use this aggressively.

## Preloading: Making Navigation Feel Instant

SvelteKit preloads the next page's code and data when a user hovers over a link:

```svelte
<!-- SvelteKit preloads this automatically on hover (default behavior) -->
<a href="/products">Products</a>

<!-- Disable preloading for rarely-visited pages -->
<a href="/terms" data-sveltekit-preload-data="off">Terms</a>
```

The default behavior starts fetching code and data when the user's mouse enters the link. Since there is typically 200-300ms between hovering and clicking, the page is often ready by the time the click happens. This makes your app feel like a native application with zero configuration. You can also set `data-sveltekit-preload-data="hover"` on a layout wrapper to apply the behavior to all links within it.

## Real Example: Lazy-Loading a Chart Below the Fold

Here is a complete, production-ready pattern for a page where a heavy chart component is only needed if the user scrolls down:

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  let chartVisible = $state(false);
  let sentinel: HTMLDivElement;

  // Use IntersectionObserver to detect when the chart area enters the viewport
  $effect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          chartVisible = true;
          observer.disconnect(); // only need to load once
        }
      },
      { rootMargin: '200px' } // start loading 200px before it's visible
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  });
</script>

<!-- Above the fold: loads immediately -->
<h1>Dashboard</h1>
<div class="summary-cards">
  <p>Total Revenue: {data.revenue}</p>
  <p>Active Users: {data.users}</p>
</div>

<!-- Below the fold: loads only when scrolled into view -->
<div bind:this={sentinel}>
  {#if chartVisible}
    {#await import('$lib/components/RevenueChart.svelte')}
      <div class="chart-skeleton" aria-busy="true">
        Loading chart...
      </div>
    {:then { default: RevenueChart }}
      <RevenueChart data={data.chartPoints} />
    {:catch}
      <p>Failed to load chart. <button onclick={() => chartVisible = false}>Retry</button></p>
    {/await}
  {:else}
    <div class="chart-placeholder" aria-hidden="true">
      <!-- Empty space where the chart will appear -->
    </div>
  {/if}
</div>
```

This pattern combines IntersectionObserver with dynamic imports: the chart code is not even fetched until the user scrolls near it. On a dashboard where most users glance at the summary cards and leave, you have saved them from downloading a charting library they never needed.

## Try It

1. Run the bundle visualizer on your project. Identify the three largest dependencies in your client bundle. For each one, determine if it can be dynamically imported, replaced with a smaller alternative, or moved to server-only code.
2. Take a page with a heavy component (a form builder, chart, or rich editor) and convert it to lazy-load using `{#await import(...)}`. Add a loading skeleton and error state.
3. Find an import in your codebase that pulls in an entire library (`import _ from 'lodash'`, `import * as d3 from 'd3'`) and refactor it to import only the specific functions you use. Run the bundle visualizer before and after to measure the difference.

## Key Takeaways

- JavaScript is uniquely expensive: it must be downloaded, parsed, compiled, and executed — reduce what you ship on the critical path
- SvelteKit automatically code-splits by route, so each page only loads its own JavaScript and shared dependencies
- Use dynamic `import()` for heavy components not needed on initial render — each `import()` creates a split point
- Combine `{#await}` with dynamic imports for lazy loading with proper loading and error states
- Tree shaking eliminates dead code, but only works well with ES module imports of specific named exports
- Audit your bundle with `rollup-plugin-visualizer` to find unexpectedly large dependencies — you cannot optimize what you cannot see
- Move heavy processing to `+server.ts` or `+page.server.ts` to keep it off the client entirely
- SvelteKit preloads linked pages on hover, making navigation feel instant with zero configuration
- The performance mental model: measure first, optimize what matters, verify the improvement
