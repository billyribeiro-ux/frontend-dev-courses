# Code Splitting

When a user visits your app, the browser downloads JavaScript before anything interactive can happen. But "downloads" is a misleading simplification. JavaScript is the most expensive resource type on the web, byte for byte, because it goes through a pipeline that no other resource type requires:

1. **Download** — the bytes travel over the network, same as images and CSS
2. **Parse** — the browser's JavaScript engine reads the source text and builds an Abstract Syntax Tree (AST). This is CPU-bound work that blocks the main thread.
3. **Compile** — the engine converts the AST into bytecode (and eventually machine code via JIT compilation). Modern engines like V8 use lazy compilation — they compile functions when first called — but parsing still happens upfront for the entire file.
4. **Execute** — the bytecode runs, which involves allocating memory, creating closures, registering event handlers, and building data structures. Module-level side effects (top-level code outside functions) execute during this phase.

A 200KB image downloads and paints. A 200KB JavaScript file downloads, parses, compiles, and executes — and every step blocks the main thread. On a mid-range Android phone over a 3G connection, a 2MB JavaScript bundle can mean 10+ seconds of blank screen. That is not a performance problem — that is a product problem. Users leave.

**Code splitting** breaks your application into smaller chunks so the browser only downloads what is needed for the current page, at the moment it is needed. The mental model is simple: instead of one massive bundle containing every page, component, and utility in your app, you ship many small bundles and load them on demand.

The great news: SvelteKit does route-based code splitting automatically. Every route gets its own chunk, so visiting the home page does not force users to download the JavaScript for your admin dashboard. But understanding how this works — and how to take it further — is the difference between an app that is fast by accident and one that is fast by design.

## The Cost of JavaScript: Why This Matters More Than You Think

To understand why code splitting is the single highest-impact performance technique, you need to internalize the cost model.

Consider a typical SPA that ships a 500KB JavaScript bundle (gzipped, which decompresses to roughly 1.5MB of source):

| Phase | Desktop (fast) | Mobile (mid-range) |
|-------|---------------|--------------------|
| Download (4G) | ~100ms | ~300ms |
| Parse | ~50ms | ~300ms |
| Compile | ~30ms | ~200ms |
| Execute | ~100ms | ~500ms |
| **Total** | **~280ms** | **~1,300ms** |

On desktop, 280ms is noticeable but tolerable. On mobile, 1.3 seconds of main-thread blocking means no scrolling, no tapping, no interaction. And this is *after* the HTML and CSS have loaded — the user is staring at a painted page that does not respond to touch.

Now consider what happens when you code-split that 500KB bundle into 10 route-level chunks of ~50KB each. The user's first page load downloads only the chunk for the current route (~50KB). The parse/compile/execute cost drops by 90%. The remaining chunks load lazily as the user navigates or on idle.

This is not a micro-optimization. On mobile devices, this is the difference between a usable app and one that feels broken.

### The Main Thread Bottleneck

JavaScript parsing and execution happen on the **main thread** — the same thread that handles user input, CSS calculations, layout, painting, and compositing. While JavaScript is parsing, the browser cannot respond to touch events, render animations, or update the screen. This is why JavaScript is uniquely expensive compared to images (decoded off-thread) and CSS (mostly off-thread in modern browsers).

The `Long Tasks` API (tasks longer than 50ms) directly measures this impact. Every millisecond of JavaScript parsing on the main thread is a millisecond the user cannot interact with the page. Code splitting reduces the size of each parse task, keeping individual chunks below the 50ms threshold.

## How SvelteKit Auto-Splits Code

SvelteKit creates a separate JavaScript bundle for each route. When a user navigates to a page, the browser downloads only the code for that specific route:

```
src/routes/
  +page.svelte        → chunk for "/"
  about/+page.svelte  → chunk for "/about"
  blog/+page.svelte   → chunk for "/blog"
  admin/+page.svelte  → chunk for "/admin" (never loaded for regular users)
```

This happens at three levels:

1. **Route component** — each `+page.svelte` becomes its own chunk
2. **Layout component** — each `+layout.svelte` becomes its own chunk, loaded only when the user enters a route that needs it
3. **Route data** — each `+page.ts` and `+layout.ts` (client-side load functions) becomes its own chunk

Shared code (components, utilities, stores) gets extracted into common chunks that are loaded once and cached across routes. If `Header.svelte` is used on every page, Vite's bundler puts it in a shared chunk rather than duplicating it in every route bundle.

You do not need to configure any of this — it happens automatically through Vite's Rollup-based bundling. But you should understand what it means: **each `+page.svelte`, `+layout.svelte`, and their associated `+page.ts`/`+page.server.ts` files define a code-split boundary.** Organizing your routes well means better code splitting for free.

### How Vite Decides What Goes Where

Vite uses Rollup under the hood, and Rollup's code splitting algorithm works like this:

1. Start with each entry point (route) as a separate chunk
2. Walk the import graph from each entry point
3. If a module is imported by only one entry point, it goes in that entry point's chunk
4. If a module is imported by multiple entry points, it gets extracted into a shared chunk
5. The shared chunk is loaded once and cached by the browser

This means your code organization directly affects bundle efficiency. A utility function imported by every page ends up in a shared chunk (loaded once, cached). A heavy component imported by only one page stays in that page's chunk (loaded only when visiting that page).

```
Route chunks (loaded per-page):
  _page-home-abc123.js     → 12KB (just the home page component)
  _page-about-def456.js    → 8KB  (just the about page)
  _page-admin-ghi789.js    → 45KB (admin page + admin-only components)

Shared chunks (loaded once, cached):
  _shared-jkl012.js        → 15KB (Header, Footer, used by all pages)
  _shared-mno345.js        → 30KB (Svelte runtime)
```

### What Server-Only Code Means for Bundle Size

Anything in `+page.server.ts`, `+server.ts`, or `+layout.server.ts` is **never sent to the client**. SvelteKit guarantees this at the build level — server-only files are processed separately and excluded from the client bundle entirely.

This means your database driver (50-200KB), your email library (100KB), your PDF generator (500KB), and your ML inference library (several MB) contribute exactly zero bytes to what the user downloads. Use this aggressively:

```typescript
// src/routes/dashboard/+page.server.ts
// These imports add 0 bytes to the client bundle
import { parse } from 'csv-parse/sync';       // ~200KB
import PDFDocument from 'pdfkit';               // ~500KB
import { Resend } from 'resend';                // ~50KB
import { PrismaClient } from '@prisma/client';  // ~300KB

export async function load() {
  // All this runs on the server — only the returned data goes to the client
  const raw = await readFile('data.csv', 'utf-8');
  const processed = parse(raw);
  return { summary: summarize(processed) }; // ~2KB of JSON
}
```

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

### How Dynamic Import Creates Split Points

Each `import()` call creates a **split point**. Vite sees the dynamic import at build time and creates a separate chunk for that module and all its unique dependencies. The key word is "unique" — if `RichTextEditor.svelte` imports a utility that is also used by the main page, that utility stays in the shared chunk. Only dependencies exclusive to the editor go into the editor's chunk.

This is why dynamic imports are strictly better than conditional static imports for code splitting. A static `import` — even behind an `if` statement — is always included in the bundle:

```typescript
// WRONG: Static import is always bundled, even if never used
import RichTextEditor from '$lib/components/RichTextEditor.svelte';

// CORRECT: Dynamic import creates a separate chunk
const module = await import('$lib/components/RichTextEditor.svelte');
```

The bundler cannot know at build time whether an `if` condition will be true at runtime, so it must include statically imported modules in the bundle. Dynamic `import()` is an explicit signal: "this code is not needed right away — make it a separate download."

### When to Use Dynamic Imports

Use dynamic imports when a component or library is:

1. **Heavy** (more than ~20KB gzipped) — the savings are worth the complexity
2. **Not needed immediately** — it sits behind a user interaction or below the fold
3. **Not needed by all users** — admin features, premium features, optional tools

Do NOT use dynamic imports for:

1. **Core UI** — header, navigation, layout components that appear on every page
2. **Small components** — the overhead of an additional HTTP request outweighs the savings
3. **Above-the-fold content** — dynamic imports add latency to first render

## Lazy Loading with `{#await}`

Combine dynamic imports with Svelte's `{#await}` block for elegant lazy loading with loading states:

```svelte
<script lang="ts">
  let showChart = $state(false);
  let chartData = $state([/* ... */]);

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

Note the destructuring in `{:then { default: Chart }}` — ES modules export their default as a `default` property. This destructures the module object to extract the component.

### A Reusable Lazy-Loading Wrapper

For a pattern you will use repeatedly, extract it into a reusable component:

```svelte
<!-- src/lib/components/Lazy.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Component } from 'svelte';

  let {
    loader,
    loadingText = 'Loading...',
    ...rest
  }: {
    loader: () => Promise<{ default: Component }>;
    loadingText?: string;
    [key: string]: any;
  } = $props();

  let LoadedComponent: Component | null = $state(null);
  let loading = $state(true);
  let error: Error | null = $state(null);

  onMount(async () => {
    try {
      const module = await loader();
      LoadedComponent = module.default;
    } catch (e) {
      error = e instanceof Error ? e : new Error('Failed to load component');
    } finally {
      loading = false;
    }
  });
</script>

{#if loading}
  <div class="skeleton" aria-busy="true">{loadingText}</div>
{:else if error}
  <div class="error" role="alert">
    <p>{error.message}</p>
    <button onclick={() => { loading = true; error = null; onMount(() => {}); }}>
      Retry
    </button>
  </div>
{:else if LoadedComponent}
  <LoadedComponent {...rest} />
{/if}
```

Use it anywhere — props are forwarded to the loaded component:

```svelte
<Lazy
  loader={() => import('$lib/components/Chart.svelte')}
  data={chartData}
  loadingText="Loading chart..."
/>
```

## Tree Shaking: Dead Code Elimination

Tree shaking is the bundler's ability to remove code you import but never actually use. The name comes from the mental image of shaking a tree — dead leaves (unused code) fall off, leaving only the living branches (used code).

Tree shaking works because ES modules have **static structure**. Unlike CommonJS (`require()`), which can be called conditionally at runtime, ES `import` and `export` statements must appear at the top level and cannot be dynamic. This means the bundler can analyze the import/export graph at build time and determine which exports are actually referenced.

### How Tree Shaking Works Under the Hood

The process has three steps:

1. **Mark** — Rollup walks the dependency graph starting from each entry point, marking every imported binding that is actually referenced in the code
2. **Sweep** — Any export that was never imported (or imported but never used) is marked as dead code
3. **Eliminate** — Dead code is removed from the final output

```typescript
// math.ts — a library with 4 exports
export function add(a: number, b: number) { return a + b; }
export function subtract(a: number, b: number) { return a - b; }
export function multiply(a: number, b: number) { return a * b; }
export function divide(a: number, b: number) { return a / b; }

// app.ts — only uses add
import { add } from './math';
console.log(add(1, 2));

// Final bundle: only contains add(). subtract, multiply, divide are eliminated.
```

### The Side Effects Problem

Tree shaking breaks down when code has **side effects** — code that does something just by being imported, without being explicitly called. Examples:

```typescript
// This has side effects — it modifies a global when imported
import './polyfill'; // Adds Array.prototype.flat if missing

// This has side effects — the IIFE runs when the module loads
let counter = 0;
export function increment() { return ++counter; }
counter = Math.random(); // Side effect: runs at import time
```

The bundler cannot know whether removing the `counter = Math.random()` line would break something. So it keeps the entire module. Libraries signal whether their code is side-effect-free in `package.json`:

```json
{
  "name": "my-library",
  "sideEffects": false
}
```

When a library declares `"sideEffects": false`, the bundler can safely tree-shake any unused exports. Libraries without this flag are treated conservatively — the bundler keeps everything.

### Practical Tree Shaking Patterns

```typescript
// BAD: Namespace import pulls in everything — bundler keeps the entire library
import * as d3 from 'd3';
d3.select('#chart');

// BETTER: Named import from the main package — tree shakeable IF the library supports it
import { select } from 'd3';
select('#chart');

// BEST: Import from the specific sub-package — smallest possible scope
import { select } from 'd3-selection';
select('#chart');

// BAD: Default import from a library that uses CommonJS internally
import _ from 'lodash'; // ~70KB — entire library
_.debounce(fn, 300);

// BETTER: Import the specific function's module
import debounce from 'lodash/debounce'; // ~2KB — just debounce
debounce(fn, 300);

// BEST: Use lodash-es (ES module build) with named imports
import { debounce } from 'lodash-es'; // Tree shakeable
debounce(fn, 300);

// EVEN BETTER: Write it yourself (debounce is ~10 lines)
function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

### Verifying Tree Shaking

How do you know tree shaking is actually working? Check the bundle output:

```bash
# Build with sourcemaps and inspect the output
npm run build -- --sourcemap

# Or use the vite-plugin-inspect to see what Rollup is doing
npm install -D vite-plugin-inspect
```

In the bundle visualizer (covered below), tree-shaken code disappears completely. If you see a large library in the visualizer but only use one function from it, tree shaking is not working for that library — usually because it uses CommonJS or has undeclared side effects.

## The `$lib/server/` Boundary

SvelteKit enforces a hard boundary: any module under `$lib/server/` is **forbidden from being imported in client-side code**. If you try to import from `$lib/server/` in a `.svelte` component or a `+page.ts` file, SvelteKit throws a build error.

This is a safety net, not just a convention. It prevents accidental inclusion of server-only code (database connections, API keys, heavy libraries) in the client bundle:

```typescript
// $lib/server/db.ts — NEVER reaches the client
import { PrismaClient } from '@prisma/client'; // ~300KB
export const db = new PrismaClient();

// $lib/server/email.ts — NEVER reaches the client
import { Resend } from 'resend'; // ~50KB
export const email = new Resend(process.env.RESEND_API_KEY);

// $lib/server/analytics.ts — NEVER reaches the client
import { BigQuery } from '@google-cloud/bigquery'; // ~2MB
export const bq = new BigQuery();
```

```svelte
<!-- +page.svelte — this would cause a BUILD ERROR -->
<script>
  import { db } from '$lib/server/db'; // ERROR: Cannot import $lib/server in client code
</script>
```

The error message is clear and immediate — you find out at build time, not when a user discovers your database credentials in the browser's network tab.

### The Module Graph Boundary

Why not just use `+page.server.ts` for everything? Because the `$lib/server/` boundary is about the **module graph**, not individual files. If `$lib/utils.ts` imports from `$lib/server/db.ts`, and a component imports from `$lib/utils.ts`, the entire chain is pulled into the client bundle — including the database client. The `$lib/server/` boundary prevents this at the import level:

```typescript
// WRONG: $lib/utils.ts imports from $lib/server
// This infects the entire utility file with server-only code
import { db } from '$lib/server/db';
export function getUser(id: string) { return db.user.findUnique({ where: { id } }); }
export function formatDate(d: Date) { return d.toISOString(); } // innocent but tainted

// CORRECT: Keep server and client utilities separate
// $lib/server/users.ts — server-only
import { db } from '$lib/server/db';
export function getUser(id: string) { return db.user.findUnique({ where: { id } }); }

// $lib/utils.ts — safe for client
export function formatDate(d: Date) { return d.toISOString(); }
```

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
      open: true,           // Auto-open in browser after build
      gzipSize: true,       // Show gzipped sizes (more realistic)
      brotliSize: true,     // Show Brotli sizes too
      filename: 'bundle-analysis.html'
    })
  ]
});
```

Run `npm run build` and an interactive treemap opens showing every module in your bundle, sized by bytes. Look for:

- **Unexpectedly large dependencies** — Is `moment.js` (300KB) hiding in there when you only format one date? Replace it with `Intl.DateTimeFormat` (0KB, built into the browser).
- **Duplicate dependencies** — Two versions of the same library loaded by different packages. Run `npm ls <package>` to find who is pulling in the duplicate.
- **Client-side code that should be server-only** — A PDF generation library imported in a component when it should only run in `+server.ts`.
- **Unshaken tree** — A large library where you only use one function but the entire library is bundled. Check if it supports tree shaking.

This analysis is the single best debugging tool for bundle size issues. Run it after every dependency addition.

### Reading the Treemap

The treemap shows nested rectangles where:
- **Area = file size** (larger = more bytes)
- **Nesting = module hierarchy** (node_modules > library > file)
- **Color = chunk** (each chunk gets a different color)

The most important skill is knowing what **should not be there**. Your `admin/+page.svelte` chunk should not contain your charting library if only the dashboard uses it. Your client bundle should not contain `fs`, `path`, or any Node.js built-in. Any `$lib/server/` code appearing in the client treemap is a bug.

### Automated Bundle Size Tracking

Do not rely on manual inspection. Set up automated tracking:

```typescript
// vite.config.ts — fail build if any chunk exceeds the limit
export default defineConfig({
  build: {
    chunkSizeWarningLimit: 250, // KB — warn if any chunk exceeds this
  }
});
```

For more granular control, use `bundlesize` or `size-limit` in CI:

```json
// package.json
{
  "size-limit": [
    { "path": ".svelte-kit/output/client/_app/immutable/entry/start*.js", "limit": "30 KB" },
    { "path": ".svelte-kit/output/client/_app/immutable/chunks/*.js", "limit": "80 KB" }
  ]
}
```

## Preloading: Making Navigation Feel Instant

SvelteKit preloads the next page's code and data when a user hovers over a link:

```svelte
<!-- SvelteKit preloads this automatically on hover (default behavior) -->
<a href="/products">Products</a>

<!-- Preload more eagerly — on viewport intersection (mobile-friendly) -->
<a href="/products" data-sveltekit-preload-data="hover">Products</a>

<!-- Disable preloading for rarely-visited pages -->
<a href="/terms" data-sveltekit-preload-data="off">Terms</a>

<!-- Preload only the code, not the data (for expensive load functions) -->
<a href="/products" data-sveltekit-preload-code="hover">Products</a>
```

The default behavior starts fetching code and data when the user's mouse enters the link. Since there is typically 200-300ms between hovering and clicking, the page is often ready by the time the click happens. This makes your app feel like a native application with zero configuration.

### Preload Strategies

SvelteKit offers two preload attributes with different values:

**`data-sveltekit-preload-data`** preloads both the JavaScript chunk AND runs the load function:
- `"hover"` — start on mouseenter (default for most setups)
- `"tap"` — start on mousedown/touchstart (less aggressive, less data usage)
- `"off"` — disable preloading entirely

**`data-sveltekit-preload-code`** preloads only the JavaScript chunk, NOT the data:
- `"eager"` — preload immediately when the link enters the viewport
- `"viewport"` — preload when the link scrolls into view
- `"hover"` — preload on mouseenter
- `"tap"` — preload on mousedown/touchstart
- `"off"` — disable

For a navigation bar, `data-sveltekit-preload-code="eager"` on all links makes sense — the code is cached and ready when the user clicks. For a long list of blog posts, `"tap"` or `"hover"` avoids preloading dozens of pages the user will never visit.

### Programmatic Preloading

You can also preload programmatically for complex interactions:

```svelte
<script lang="ts">
  import { preloadData, preloadCode } from '$app/navigation';

  // Preload when a specific condition is met
  $effect(() => {
    if (userIsLikelyToNavigate) {
      preloadData('/next-page');
    }
  });

  // Preload on custom interaction
  function handleFocus() {
    preloadCode('/search-results');
  }
</script>

<input onfocus={handleFocus} placeholder="Search..." />
```

## Real Example: Lazy-Loading Dashboard with Intersection Observer

Here is a complete, production-ready pattern for a dashboard page where multiple heavy components are only loaded when they scroll into view:

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { Component } from 'svelte';

  let { data } = $props();

  // Track which sections are visible
  let visibleSections = $state<Set<string>>(new Set());

  // Create an intersection observer for lazy loading
  function lazyLoad(node: HTMLElement, id: string) {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          visibleSections = new Set([...visibleSections, id]);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' } // Start loading 200px before visible
    );

    observer.observe(node);

    return {
      destroy() {
        observer.disconnect();
      }
    };
  }

  // Define dashboard widgets with their loaders
  interface Widget {
    id: string;
    title: string;
    loader: () => Promise<{ default: Component }>;
    props: Record<string, unknown>;
    minHeight: string; // Reserve space to prevent CLS
  }

  const widgets: Widget[] = [
    {
      id: 'revenue',
      title: 'Revenue Overview',
      loader: () => import('$lib/components/RevenueChart.svelte'),
      props: { data: data.revenue },
      minHeight: '400px'
    },
    {
      id: 'users',
      title: 'User Activity',
      loader: () => import('$lib/components/UserActivityHeatmap.svelte'),
      props: { data: data.activity },
      minHeight: '300px'
    },
    {
      id: 'map',
      title: 'Geographic Distribution',
      loader: () => import('$lib/components/WorldMap.svelte'),
      props: { data: data.locations },
      minHeight: '500px'
    }
  ];
</script>

<!-- Above the fold: loads immediately, no lazy loading -->
<h1>Dashboard</h1>
<div class="summary-cards">
  <div class="card">
    <h3>Total Revenue</h3>
    <p class="metric">${data.revenue.total.toLocaleString()}</p>
  </div>
  <div class="card">
    <h3>Active Users</h3>
    <p class="metric">{data.users.active.toLocaleString()}</p>
  </div>
  <div class="card">
    <h3>Conversion Rate</h3>
    <p class="metric">{data.conversion.rate}%</p>
  </div>
</div>

<!-- Below the fold: each widget loads only when scrolled into view -->
{#each widgets as widget (widget.id)}
  <section
    use:lazyLoad={widget.id}
    style="min-height: {widget.minHeight}"
    class="widget-container"
  >
    <h2>{widget.title}</h2>

    {#if visibleSections.has(widget.id)}
      {#await widget.loader()}
        <div class="skeleton" aria-busy="true" style="height: {widget.minHeight}">
          Loading {widget.title}...
        </div>
      {:then { default: WidgetComponent }}
        <WidgetComponent {...widget.props} />
      {:catch error}
        <div class="error-state" role="alert">
          <p>Failed to load {widget.title}</p>
          <button onclick={() => {
            visibleSections = new Set([...visibleSections].filter(id => id !== widget.id));
            // Re-triggering will cause the intersection observer to fire again
            setTimeout(() => {
              visibleSections = new Set([...visibleSections, widget.id]);
            }, 100);
          }}>
            Retry
          </button>
        </div>
      {/await}
    {:else}
      <div class="placeholder" aria-hidden="true" style="height: {widget.minHeight}">
        <!-- Empty space — widget loads when scrolled into view -->
      </div>
    {/if}
  </section>
{/each}

<style>
  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .widget-container {
    margin-bottom: 2rem;
    border-radius: 8px;
    background: var(--surface);
    padding: 1.5rem;
  }

  .skeleton {
    background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #999;
  }

  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
</style>
```

This pattern combines IntersectionObserver with dynamic imports: each widget's code is not even fetched until the user scrolls near it. On a dashboard where most users glance at the summary cards and leave, you have saved them from downloading a charting library, a heatmap renderer, and a map component they never needed.

### Performance Impact

For a dashboard with a charting library (~150KB), heatmap (~80KB), and map component (~200KB), lazy loading saves:

- **Without lazy loading:** 430KB additional JavaScript parsed on page load
- **With lazy loading:** 0KB additional JavaScript until user scrolls
- **On mid-range mobile:** ~2 seconds of main thread time saved on initial load

## Advanced: Route-Level Code Splitting Strategies

### Feature-Based Route Organization

Your file structure directly affects code splitting. Organize by feature to ensure each feature's code stays in its own chunk:

```
src/routes/
  (marketing)/           → Public pages: landing, pricing, about
    +layout.svelte       → Light layout, no dashboard code
    +page.svelte
    pricing/+page.svelte

  (app)/                 → Authenticated app
    +layout.svelte       → App shell with navigation
    dashboard/           → Dashboard feature
      +page.svelte
    settings/            → Settings feature
      +page.svelte
    admin/               → Admin-only feature
      +layout.server.ts  → Admin auth guard
      +page.svelte
```

Each layout group creates a code-split boundary. The marketing pages never load the dashboard code. The dashboard never loads the admin code. A user who only visits the marketing site downloads zero bytes of application JavaScript.

### Dynamic Route Splitting

For routes with many similar pages (blog posts, product pages), SvelteKit shares the component code but splits the data:

```
src/routes/blog/[slug]/
  +page.svelte          → One component chunk (shared across all posts)
  +page.server.ts       → Data loaded per-post (server-only, not bundled)
```

This means navigating between blog posts only loads new data, not new JavaScript — the component is already cached.

## Performance Budgets in CI

Measuring once is useful. Measuring continuously prevents regressions. A **performance budget** sets limits you enforce on every pull request:

```json
// .size-limit.json
[
  {
    "name": "Initial JS",
    "path": ".svelte-kit/output/client/_app/immutable/entry/start*.js",
    "limit": "35 KB",
    "gzip": true
  },
  {
    "name": "Largest route chunk",
    "path": ".svelte-kit/output/client/_app/immutable/nodes/*.js",
    "limit": "80 KB",
    "gzip": true
  },
  {
    "name": "Total JS",
    "path": ".svelte-kit/output/client/**/*.js",
    "limit": "300 KB",
    "gzip": true
  }
]
```

```yaml
# .github/workflows/bundle-check.yml
name: Bundle Size Check
on: [pull_request]
jobs:
  size:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build
      - uses: andresz1/size-limit-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

Now every pull request that regresses bundle size gets a comment showing the change. Developers see the impact of their changes before merging.

## Common Pitfalls and How to Avoid Them

### Pitfall 1: Barrel File Imports

Barrel files (`index.ts` that re-export everything) defeat tree shaking because the bundler cannot be sure which re-exports have side effects:

```typescript
// $lib/components/index.ts — barrel file
export { default as Header } from './Header.svelte';
export { default as Footer } from './Footer.svelte';
export { default as Chart } from './Chart.svelte';       // 150KB
export { default as DataGrid } from './DataGrid.svelte'; // 200KB

// Importing just Header pulls in the barrel, which may pull in Chart and DataGrid
import { Header } from '$lib/components';

// BETTER: Import directly
import Header from '$lib/components/Header.svelte';
```

Modern bundlers handle barrel files better than they used to, but direct imports are always safer for bundle size.

### Pitfall 2: Dynamic Import Inside a Loop

```svelte
<!-- WRONG: Creates a new chunk request for each iteration -->
{#each tabs as tab}
  {#await import(`$lib/tabs/${tab.name}.svelte`)}
    <p>Loading...</p>
  {:then { default: Tab }}
    <Tab />
  {/await}
{/each}

<!-- CORRECT: Import map outside the loop -->
<script>
  const tabLoaders: Record<string, () => Promise<{ default: Component }>> = {
    overview: () => import('$lib/tabs/Overview.svelte'),
    analytics: () => import('$lib/tabs/Analytics.svelte'),
    settings: () => import('$lib/tabs/Settings.svelte')
  };
</script>
```

Dynamic expressions inside `import()` (template literals, variables) create a **glob import** — Vite bundles every possible match. An explicit object map gives you precise control over which chunks are created.

### Pitfall 3: Importing Types at Runtime

TypeScript types are erased at build time, so they never affect bundle size. But sometimes an import of a type inadvertently pulls in the module's runtime code:

```typescript
// This import might pull in the library's runtime code
import { SomeType, someFunction } from 'heavy-library';

// If you only need the type, use type-only imports
import type { SomeType } from 'heavy-library';
import { someFunction } from 'heavy-library'; // Separate import for runtime code
```

Use `import type` whenever you only need types. TypeScript's `verbatimModuleSyntax` compiler option enforces this.

## Try It

1. **Analyze your bundle.** Install `rollup-plugin-visualizer`, run `npm run build`, and open the treemap. Identify the three largest dependencies in your client bundle. For each one, determine if it can be dynamically imported, replaced with a smaller alternative, or moved to server-only code. Write down your findings.

2. **Lazy-load a heavy component.** Take a page with a heavy component (a form builder, chart, or rich editor) and convert it to lazy-load using `{#await import(...)}`. Add a loading skeleton with the `aria-busy` attribute and an error state with a retry button. Measure the page's initial JavaScript load before and after.

3. **Fix tree shaking.** Find an import in your codebase that pulls in an entire library (`import _ from 'lodash'`, `import * as d3 from 'd3'`) and refactor it to import only the specific functions you use. Run the bundle visualizer before and after to measure the difference.

4. **Build a lazy dashboard.** Create a dashboard page with three widget sections. Each widget should lazy-load using IntersectionObserver when it scrolls into view. Reserve space with `min-height` to prevent CLS. Include loading skeletons and error states with retry.

5. **Set up a performance budget.** Add `size-limit` to your project. Set budgets for your initial JavaScript chunk (35KB), largest route chunk (80KB), and total JavaScript (300KB). Make the build fail if any budget is exceeded.

## Key Takeaways

- JavaScript is uniquely expensive: it must be downloaded, parsed, compiled, and executed on the main thread — every step blocks user interaction
- The cost multiplier on mobile is 3-5x compared to desktop — a 500KB bundle costs ~280ms on desktop but ~1,300ms on a mid-range phone
- SvelteKit automatically code-splits by route: each `+page.svelte`, `+layout.svelte`, and associated data files define a split boundary
- Shared code is automatically extracted into common chunks — Vite's Rollup bundler deduplicates modules used across multiple routes
- Use dynamic `import()` for heavy components not needed on initial render — each `import()` creates a split point in the bundle
- Combine `{#await}` with dynamic imports for lazy loading with proper loading and error states
- Tree shaking eliminates dead code but only works with ES module imports, specific named exports, and libraries that declare `"sideEffects": false`
- `$lib/server/` is a hard boundary — imports from there are forbidden in client code, preventing accidental bundling of server-only libraries
- Audit your bundle with `rollup-plugin-visualizer` to find unexpectedly large dependencies — you cannot optimize what you cannot see
- Move heavy processing to `+server.ts` or `+page.server.ts` to keep it off the client entirely — these files contribute zero bytes to the client bundle
- SvelteKit preloads linked pages on hover, making navigation feel instant with zero configuration — customize with `data-sveltekit-preload-data` and `data-sveltekit-preload-code`
- Barrel file imports can defeat tree shaking — prefer direct imports from specific module files
- Set performance budgets in CI with `size-limit` to catch bundle regressions before they reach production
- The performance mental model: measure first, optimize what matters, verify the improvement, automate the check
