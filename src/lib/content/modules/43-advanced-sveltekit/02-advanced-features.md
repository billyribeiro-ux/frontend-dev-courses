# Advanced Features

SvelteKit ships a set of features that separate a competent application from a production-grade one. Page options give you surgical control over rendering strategy on a per-route basis. Shallow routing lets you update the URL without running load functions, which is essential for modals, tabs, and gallery views. Streaming lets you send fast data immediately while slow data arrives in the background. Error pages let you present contextual, branded error experiences instead of generic white screens. Snapshots preserve scroll position and form state across navigations. Link preloading makes the app feel instant. Together, these features let you build applications that are fast, resilient, and polished.

This lesson covers each feature in depth, with production patterns, edge cases, and architectural reasoning.

## Page Options: ssr, csr, prerender, trailingSlash

SvelteKit exposes four page-level options that control how a route is rendered and served. These options can be set in `+page.ts`, `+page.server.ts`, or `+layout.ts`, and they cascade from layouts to child pages. A child can always override a parent's setting.

### Understanding Each Option

**`ssr`** controls whether the page is rendered on the server. When `true` (the default), SvelteKit generates HTML on the server and sends it to the browser. When `false`, SvelteKit sends a minimal HTML shell and renders everything in the browser. Disabling SSR is useful for pages that rely heavily on browser APIs (canvas, WebGL, certain charting libraries) that crash in a Node.js environment.

**`csr`** controls whether SvelteKit hydrates the page on the client. When `true` (the default), SvelteKit loads JavaScript and makes the page interactive. When `false`, no JavaScript is sent — the page is purely static HTML. This is useful for content pages that need no interactivity: legal pages, privacy policies, changelogs.

**`prerender`** controls whether the page is generated at build time instead of on each request. When `true`, SvelteKit crawls the page during `vite build`, renders the HTML, and writes it to disk. The result is served as a static file with no server-side computation. When `false`, the page is rendered on each request. When `'auto'`, SvelteKit prerenders the page if it detects no dynamic dependencies.

**`trailingSlash`** controls whether URLs end with a slash. `'never'` removes trailing slashes (redirecting `/about/` to `/about`). `'always'` adds them (redirecting `/about` to `/about/`). `'ignore'` accepts both forms. This matters for SEO (duplicate content) and for relative link resolution in HTML.

```typescript
// src/routes/+layout.ts
// Set sensible defaults for the entire application
export const ssr = true;
export const csr = true;
export const trailingSlash = 'never';
```

```typescript
// src/routes/marketing/+layout.ts
// Marketing pages are static content — prerender them all
export const prerender = true;
export const csr = false; // No JavaScript needed for static pages
```

```typescript
// src/routes/marketing/pricing/+page.ts
// Pricing page needs live data from Stripe API
export const prerender = false;
export const csr = true; // Re-enable interactivity for pricing toggle
```

```typescript
// src/routes/app/+layout.ts
// The app section is a full SPA — never prerender
export const prerender = false;
export const ssr = true;
export const csr = true;
```

```typescript
// src/routes/app/canvas-editor/+page.ts
// Canvas editor uses browser APIs that crash in Node.js
export const ssr = false;
```

### Cascading and Override Rules

Options cascade from parent layouts to child pages. The most specific setting wins. Here is the resolution order:

1. `+page.ts` (or `+page.server.ts`) — highest priority
2. The nearest `+layout.ts` in the same directory
3. Parent `+layout.ts` files, walking up the route tree
4. The root `+layout.ts`

This lets you set a default at the root and make targeted exceptions. A common pattern: prerender the entire marketing site, but disable prerender for the one page that needs server data.

### Dangerous Combinations

Setting `ssr = false` and `csr = false` together makes no sense — nothing renders. SvelteKit will warn you. Setting `ssr = false` and `prerender = true` also does not work — prerendering requires server-side rendering at build time.

Setting `csr = false` disables all JavaScript, which means no client-side navigation, no form enhancement, no reactive state. Only use this for truly static pages where interactivity is not needed.

```typescript
// src/routes/legal/+layout.ts
// Legal pages: server-render the HTML, send zero JavaScript
export const csr = false;
export const prerender = true;
// Result: static HTML files with no JS bundle, served from CDN
```

### prerender Crawling and Entry Points

When `prerender = true`, SvelteKit starts from configured entry points and follows links to discover pages. By default, it starts from `*` (all non-dynamic routes). You can customize this in `svelte.config.js`:

```javascript
// svelte.config.js
const config = {
  kit: {
    prerender: {
      entries: ['*', '/blog/popular-post', '/products/featured'],
      crawl: true,
      handleHttpError: 'warn', // 'fail' | 'warn' | 'ignore'
      handleMissingId: 'warn'
    }
  }
};
```

Dynamic routes like `/blog/[slug]` are not automatically discovered. You must either link to them from a prerendered page (so the crawler finds them) or list them explicitly in `entries`. Another option is to export an `entries` function from the page's `+page.server.ts`:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import { db } from '$lib/server/db';
import { posts } from '$lib/server/schema';

export async function entries() {
  const allPosts = await db.select({ slug: posts.slug }).from(posts);
  return allPosts.map((post) => ({ slug: post.slug }));
}

export const prerender = true;
```

## Shallow Routing

Sometimes you want to update the URL — for a modal, a tab, or a gallery view — without triggering a full navigation that runs load functions. SvelteKit's `pushState` and `replaceState` from `$app/navigation` do exactly this:

```svelte
<!-- src/routes/photos/+page.svelte -->
<script lang="ts">
  import { pushState } from '$app/navigation';
  import { page } from '$app/state';

  let { data } = $props();

  function openPhoto(photo: { id: string; url: string; title: string }) {
    pushState(`/photos/${photo.id}`, {
      selectedPhoto: photo
    });
  }

  function closeModal() {
    history.back();
  }
</script>

<div class="gallery">
  {#each data.photos as photo}
    <button onclick={() => openPhoto(photo)}>
      <img src={photo.url} alt={photo.title} />
    </button>
  {/each}
</div>

{#if page.state.selectedPhoto}
  <div class="modal-backdrop" role="dialog" aria-modal="true">
    <div class="modal-content">
      <img src={page.state.selectedPhoto.url} alt={page.state.selectedPhoto.title} />
      <h2>{page.state.selectedPhoto.title}</h2>
      <button onclick={closeModal} aria-label="Close">Close</button>
    </div>
  </div>
{/if}
```

The URL changes to `/photos/abc123`, so the user can share it or bookmark it. But no load function runs — the data for the modal comes from the state you passed to `pushState`. If someone navigates directly to `/photos/abc123`, SvelteKit runs the normal load function for that route, so the page still works.

### pushState vs replaceState

Use `replaceState` instead of `pushState` when you do not want to add a new history entry. Common use cases: updating a tab selection, toggling a filter, updating sort order. These are state changes the user should not "go back" through one at a time.

```svelte
<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';

  let activeTab = $derived(page.state.tab ?? 'overview');

  function selectTab(tab: string) {
    replaceState(`?tab=${tab}`, { tab });
  }
</script>

<div class="tabs" role="tablist">
  <button role="tab" aria-selected={activeTab === 'overview'}
          onclick={() => selectTab('overview')}>Overview</button>
  <button role="tab" aria-selected={activeTab === 'analytics'}
          onclick={() => selectTab('analytics')}>Analytics</button>
  <button role="tab" aria-selected={activeTab === 'settings'}
          onclick={() => selectTab('settings')}>Settings</button>
</div>
```

### Handling Direct Navigation to Shallow URLs

A critical pattern: shallow routing only works for in-app navigation. If a user bookmarks `/photos/abc123` and opens it later (or shares it), SvelteKit will run the normal load function for that route. You must make sure the route works in both cases:

```typescript
// src/routes/photos/[id]/+page.server.ts
// This load function handles direct navigation
export async function load({ params }) {
  const photo = await db.select().from(photos).where(eq(photos.id, params.id)).limit(1);
  if (!photo.length) throw error(404, 'Photo not found');
  return { photo: photo[0] };
}
```

```svelte
<!-- src/routes/photos/[id]/+page.svelte -->
<!-- This page renders for direct navigation -->
<script lang="ts">
  let { data } = $props();
</script>

<img src={data.photo.url} alt={data.photo.title} />
<h1>{data.photo.title}</h1>
```

The shallow route shows a modal overlay on the gallery page. The direct route shows a full page. Same URL, two different rendering paths, both functional.

### Type-Safe Shallow State

Define the shape of your shallow state using the `App.PageState` interface so TypeScript catches errors:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface PageState {
      selectedPhoto?: { id: string; url: string; title: string };
      tab?: string;
      modalOpen?: boolean;
    }
  }
}
export {};
```

Now `page.state.selectedPhoto` is fully typed, and attempts to push invalid state produce compile-time errors.

## Streaming with Promises

When a page depends on multiple data sources and some are slower than others, you can stream the slow ones. Return unresolved promises from your load function, and SvelteKit sends the fast data immediately while streaming the rest as it resolves:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Fast: return immediately (< 50ms)
  const user = await getUser();

  // Slow: do NOT await — return the promises directly
  const analyticsPromise = getAnalytics();        // ~800ms
  const recentOrdersPromise = getRecentOrders();  // ~400ms
  const recommendationsPromise = getRecommendations(); // ~1200ms

  return {
    user,
    analytics: analyticsPromise,
    recentOrders: recentOrdersPromise,
    recommendations: recommendationsPromise
  };
};
```

In your page component, use `{#await}` blocks for the streamed data:

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Welcome, {data.user.name}</h1>

<!-- Each section streams independently -->
{#await data.analytics}
  <section class="skeleton" aria-busy="true">
    <div class="h-32 bg-gray-200 animate-pulse rounded-lg"></div>
  </section>
{:then analytics}
  <section>
    <h2>Analytics</h2>
    <div class="grid grid-cols-3 gap-4">
      <div class="stat-card">
        <span class="label">Page views</span>
        <span class="value">{analytics.views.toLocaleString()}</span>
      </div>
      <div class="stat-card">
        <span class="label">Bounce rate</span>
        <span class="value">{analytics.bounceRate}%</span>
      </div>
      <div class="stat-card">
        <span class="label">Avg. session</span>
        <span class="value">{analytics.avgSessionMinutes}m</span>
      </div>
    </div>
  </section>
{:catch error}
  <section class="error-card">
    <p>Failed to load analytics: {error.message}</p>
    <button onclick={() => invalidateAll()}>Retry</button>
  </section>
{/await}

{#await data.recentOrders}
  <p aria-busy="true">Loading recent orders...</p>
{:then orders}
  <ul>
    {#each orders as order}
      <li>{order.id}: ${order.total}</li>
    {/each}
  </ul>
{/await}

{#await data.recommendations}
  <p aria-busy="true">Loading recommendations...</p>
{:then recs}
  <div class="recommendations-grid">
    {#each recs as item}
      <a href="/products/{item.slug}" class="rec-card">
        <img src={item.imageUrl} alt={item.name} />
        <span>{item.name}</span>
      </a>
    {/each}
  </div>
{/await}
```

The user sees the greeting and skeleton states immediately. As each promise resolves, its section fills in independently. The page is interactive from the moment the first byte arrives.

### Streaming and Error Boundaries

A streamed promise that rejects does not crash the entire page. The `{:catch}` block handles it gracefully. This is a major advantage over awaiting everything in the load function — one failing API does not block the entire page.

### When NOT to Stream

Do not stream data that is needed for the page layout or SEO. If you stream the page title, search engines will index the loading skeleton. If you stream navigation data, the layout jumps around as it loads. Stream supplementary content: charts, recommendations, activity feeds, notifications.

### Parallel Data Loading

SvelteKit runs load functions for a page and its layouts in parallel. If your page has a `+layout.server.ts` and a `+page.server.ts`, both load functions run simultaneously:

```typescript
// src/routes/dashboard/+layout.server.ts
export async function load({ locals }) {
  // This runs in parallel with the page's load
  const user = await getUser(locals.userId);
  return { user };
}
```

```typescript
// src/routes/dashboard/+page.server.ts
export async function load() {
  // This runs in parallel with the layout's load
  const [stats, recentActivity] = await Promise.all([
    getStats(),
    getRecentActivity()
  ]);
  return { stats, recentActivity };
}
```

Both load functions start at the same time. The page renders when all awaited data is ready. Combine parallel layout/page loading with streaming for maximum performance: await the critical data, stream the rest.

## Form Actions and Load Function Interaction

After a form action completes (successfully or with a failure), SvelteKit automatically re-runs all load functions for the current page. This keeps displayed data in sync with server state without any manual invalidation.

```typescript
// src/routes/todos/+page.server.ts
export async function load() {
  const todos = await db.select().from(todosTable);
  return { todos };
}

export const actions = {
  add: async ({ request }) => {
    const data = await request.formData();
    const text = data.get('text') as string;
    if (!text) return fail(400, { error: 'Text required' });

    await db.insert(todosTable).values({ text, done: false });
    // After this action completes, load() re-runs automatically.
    // The page will show the new todo without any manual invalidation.
  },

  toggle: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    const current = await db.select().from(todosTable).where(eq(todosTable.id, id));
    await db.update(todosTable)
      .set({ done: !current[0].done })
      .where(eq(todosTable.id, id));
  },

  delete: async ({ request }) => {
    const data = await request.formData();
    const id = Number(data.get('id'));
    await db.delete(todosTable).where(eq(todosTable.id, id));
  }
};
```

```svelte
<!-- src/routes/todos/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  let { data } = $props();
</script>

<form method="POST" action="?/add" use:enhance>
  <input name="text" placeholder="New todo" required />
  <button type="submit">Add</button>
</form>

<ul>
  {#each data.todos as todo}
    <li>
      <form method="POST" action="?/toggle" use:enhance>
        <input type="hidden" name="id" value={todo.id} />
        <button type="submit" class:done={todo.done}>{todo.text}</button>
      </form>
      <form method="POST" action="?/delete" use:enhance>
        <input type="hidden" name="id" value={todo.id} />
        <button type="submit" aria-label="Delete">x</button>
      </form>
    </li>
  {/each}
</ul>
```

The key insight: `use:enhance` prevents a full page reload, submits the form via fetch, and after the action completes, re-runs the page's load function to get fresh data. The UI updates seamlessly.

### Custom enhance Callbacks

You can customize what happens before and after form submission:

```svelte
<form method="POST" action="?/delete" use:enhance={() => {
  // Before submission: show optimistic UI
  const confirmed = confirm('Are you sure?');
  if (!confirmed) return ({ cancel }) => cancel();

  return async ({ result, update }) => {
    if (result.type === 'success') {
      // Custom success handling
      toast.success('Item deleted');
    }
    await update(); // Re-run load functions and update the page
  };
}}>
```

## Link Preloading

SvelteKit preloads pages before the user clicks, making navigation feel instant. By default, SvelteKit preloads a link when the user hovers over it (on desktop) or touches it (on mobile). You can customize this behavior:

```svelte
<!-- Preload on hover (default) -->
<a href="/products" data-sveltekit-preload-data="hover">Products</a>

<!-- Preload when the link enters the viewport -->
<a href="/products" data-sveltekit-preload-data="viewport">Products</a>

<!-- Only preload the code, not the data -->
<a href="/products" data-sveltekit-preload-code="viewport">Products</a>

<!-- Disable preloading for this link -->
<a href="/external-site" data-sveltekit-preload-data="off">External</a>
```

You can set preloading at the layout level to apply it to all links within a section:

```svelte
<!-- src/routes/+layout.svelte -->
<div data-sveltekit-preload-data="hover">
  {@render children()}
</div>
```

### Preloading Strategy for Different Sections

```svelte
<!-- Marketing pages: preload aggressively, they are cheap -->
<nav data-sveltekit-preload-data="viewport">
  <a href="/features">Features</a>
  <a href="/pricing">Pricing</a>
  <a href="/about">About</a>
</nav>

<!-- App pages: preload on hover, data might be expensive -->
<nav data-sveltekit-preload-data="hover">
  <a href="/dashboard">Dashboard</a>
  <a href="/settings">Settings</a>
</nav>

<!-- External links or heavy pages: no preloading -->
<a href="/reports/generate" data-sveltekit-preload-data="off">
  Generate Report
</a>
```

The difference between `preload-data` and `preload-code` matters: `preload-data` runs the load function and fetches data. `preload-code` only downloads the JavaScript module for the page. Use `preload-code` for pages with expensive or user-specific data that should not be fetched speculatively.

## Snapshots

When a user navigates away from a page and comes back, form inputs are reset and scroll positions are lost. Snapshots fix this by capturing and restoring arbitrary state:

```svelte
<!-- src/routes/search/+page.svelte -->
<script lang="ts">
  import type { Snapshot } from './$types';

  let query = $state('');
  let filters = $state({ category: 'all', minPrice: 0, maxPrice: 1000 });
  let results = $state<any[]>([]);

  export const snapshot: Snapshot<{
    query: string;
    filters: typeof filters;
    scrollY: number;
  }> = {
    capture: () => ({
      query,
      filters: { ...filters },
      scrollY: window.scrollY
    }),
    restore: (value) => {
      query = value.query;
      filters = value.filters;
      // Restore scroll after the DOM updates
      requestAnimationFrame(() => {
        window.scrollTo(0, value.scrollY);
      });
    }
  };
</script>

<input bind:value={query} placeholder="Search products..." />

<select bind:value={filters.category}>
  <option value="all">All Categories</option>
  <option value="electronics">Electronics</option>
  <option value="clothing">Clothing</option>
</select>

<div class="results">
  {#each results as result}
    <a href="/products/{result.slug}" class="result-card">
      <h3>{result.name}</h3>
      <p>{result.description}</p>
    </a>
  {/each}
</div>
```

Snapshots are stored in the browser's session history (via `history.state`), so they work with the browser's back/forward buttons. They are not persisted across browser sessions.

### What to Snapshot

Snapshot form state, scroll positions, expanded/collapsed UI state, selected tabs, and filter values. Do not snapshot fetched data (the load function handles that) or sensitive information (it goes into `history.state` which can be read by other code on the page).

### Snapshot Serialization

Snapshot values must be serializable with `JSON.stringify`. You cannot snapshot DOM nodes, functions, class instances, Maps, Sets, or Dates. Convert these to plain objects before capturing:

```svelte
<script lang="ts">
  import type { Snapshot } from './$types';

  let selectedDate = $state(new Date());

  export const snapshot: Snapshot<{ selectedDate: string }> = {
    capture: () => ({
      selectedDate: selectedDate.toISOString()
    }),
    restore: (value) => {
      selectedDate = new Date(value.selectedDate);
    }
  };
</script>
```

## Error Pages

SvelteKit renders `+error.svelte` when something goes wrong. You can place error pages at different levels of your route tree for contextual error experiences:

```svelte
<!-- src/routes/+error.svelte (root error page) -->
<script>
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>{page.status}</h1>
  {#if page.status === 404}
    <p>This page does not exist.</p>
    <a href="/">Go home</a>
  {:else if page.status === 500}
    <p>Something went wrong on our end. We have been notified.</p>
  {:else}
    <p>{page.error?.message}</p>
  {/if}
</div>
```

```svelte
<!-- src/routes/(admin)/admin/+error.svelte (admin-specific error page) -->
<script>
  import { page } from '$app/state';
</script>

<div class="admin-error">
  <h1>Admin Error {page.status}</h1>
  <p>{page.error?.message}</p>
  <div class="actions">
    <a href="/admin">Back to admin dashboard</a>
    <button onclick={() => location.reload()}>Retry</button>
  </div>
</div>
```

### Error Boundary Resolution

SvelteKit walks up the route tree to find the nearest `+error.svelte`. An error in `/admin/users/123` first looks for `/admin/users/+error.svelte`, then `/admin/+error.svelte`, then the root `/+error.svelte`.

Critical nuance: a `+layout.svelte` error is caught by the *parent* layout's error boundary, not the error page in the same directory. If your root `+layout.svelte` throws, the error is caught by the fallback `src/error.html` — which is a static HTML file with no Svelte, no layouts, no styles (unless you inline them).

```html
<!-- src/error.html — fallback for root layout errors -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Error</title>
  <style>
    body { font-family: system-ui; display: grid; place-items: center; min-height: 100vh; margin: 0; }
    .error { text-align: center; }
  </style>
</head>
<body>
  <div class="error">
    <h1>%sveltekit.status%</h1>
    <p>%sveltekit.error.message%</p>
  </div>
</body>
</html>
```

### Expected vs Unexpected Errors

SvelteKit distinguishes between expected errors (thrown with the `error()` helper) and unexpected errors (unhandled exceptions). Expected errors expose their message to the client. Unexpected errors show a generic "Internal Error" message for security — you do not want stack traces or database error messages leaking to users.

```typescript
// src/routes/products/[slug]/+page.server.ts
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const product = await db.select().from(products)
    .where(eq(products.slug, params.slug))
    .limit(1);

  if (!product.length) {
    // Expected error — message is safe to show to the user
    throw error(404, 'Product not found');
  }

  // If db.select() throws an unhandled exception,
  // SvelteKit shows "Internal Error" (not the actual error message)
  return { product: product[0] };
}
```

### Custom Error Handling with handleError

To log unexpected errors, report them to a service, or customize the error object, use the `handleError` hook:

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();

  // Log the full error server-side
  console.error(`Error ${errorId}:`, error);

  // Report to error tracking service
  await reportToSentry(error, { errorId, url: event.url.pathname });

  // Return a safe error object for the client
  return {
    message: 'An unexpected error occurred',
    errorId // Include this so support can look up the full error
  };
};
```

## Service Workers

SvelteKit supports service workers through `src/service-worker.ts`. A service worker intercepts network requests, enabling offline support and custom caching strategies:

```typescript
// src/service-worker.ts
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `cache-${version}`;
const ASSETS = [...build, ...files];

// Install: cache all static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
});

// Fetch: cache-first for assets, network-first for pages
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isAsset = ASSETS.includes(url.pathname);

  event.respondWith(
    isAsset ? cacheFirst(event.request) : networkFirst(event.request)
  );
});

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request);
  return cached ?? fetch(request);
}

async function networkFirst(request: Request): Promise<Response> {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Offline', { status: 503 });
  }
}
```

SvelteKit provides `build` (generated JS/CSS), `files` (static assets), and `version` (changes on each build) through the `$service-worker` module.

## Instrumentation

The `src/instrumentation.server.ts` file integrates with OpenTelemetry for request tracing and performance monitoring. SvelteKit calls the `init` function at server startup:

```typescript
// src/instrumentation.server.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export async function init() {
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: 'https://otel-collector.example.com/v1/traces'
    }),
    instrumentations: [getNodeAutoInstrumentations()]
  });

  sdk.start();
}
```

This gives you distributed tracing across your load functions, actions, and API routes — invaluable for diagnosing performance issues in production.

## $props.id() — SSR-Safe Unique IDs

Generating unique IDs in components that render on both server and client is tricky. If the server generates one ID and the client generates a different one, you get a hydration mismatch. `$props.id()` solves this by producing the same ID on both sides:

```svelte
<script lang="ts">
  const id = $props.id();
</script>

<label for="{id}-email">Email</label>
<input id="{id}-email" type="email" />

<label for="{id}-password">Password</label>
<input id="{id}-password" type="password" />
```

Each component instance gets a unique ID that stays consistent between server-side rendering and client-side hydration. This is essential for accessible forms with `for`/`id` pairs, ARIA attributes, and any case where DOM elements need unique identifiers.

### Using $props.id() in Reusable Components

```svelte
<!-- src/lib/components/FormField.svelte -->
<script lang="ts">
  let { label, name, type = 'text', value = '', error = '' } = $props();
  const id = $props.id();
</script>

<div class="form-field">
  <label for="{id}-{name}">{label}</label>
  <input
    id="{id}-{name}"
    {name}
    {type}
    {value}
    aria-describedby={error ? `${id}-${name}-error` : undefined}
    aria-invalid={!!error}
  />
  {#if error}
    <p id="{id}-{name}-error" class="error" role="alert">{error}</p>
  {/if}
</div>
```

Multiple instances of this component on the same page each get unique, hydration-safe IDs for their label/input pairs and ARIA associations.

## Try It

1. Build a product catalog page at `/products` that prerenders at build time. Add an `entries()` function that generates pages for every product slug. Then build a dashboard at `/app/dashboard` that streams analytics data (slow) while showing the user greeting immediately (fast). Include skeleton loading states in the `{#await}` blocks.

2. Add shallow routing to the product catalog: clicking a product opens a modal with product details (using `pushState`), while directly navigating to `/products/[slug]` renders a full product page. Define `App.PageState` in `app.d.ts` for type safety.

3. Implement snapshots on a search page that preserves the search query, applied filters, and scroll position when the user navigates to a product detail page and comes back.

## Key Takeaways

- Page options (`ssr`, `csr`, `prerender`, `trailingSlash`) cascade from layouts to pages — the most specific setting wins
- Set `csr = false` for zero-JavaScript static pages; set `ssr = false` only when browser APIs would crash on the server
- `pushState` and `replaceState` update the URL without running load functions — ideal for modals, tabs, and filters
- Access shallow state via `page.state` and handle direct navigation with normal load functions
- Return unresolved promises from load functions to stream data — fast content shows immediately while slow content arrives
- Use `{#await}` blocks in templates to handle pending, resolved, and rejected states for streamed data
- Snapshots capture form state, scroll position, and UI state across navigations via `history.state`
- Error pages cascade up the route tree; root layout errors fall through to the static `src/error.html`
- Expected errors (thrown with `error()`) expose their message; unexpected errors show "Internal Error" for security
- Link preloading with `data-sveltekit-preload-data` makes navigation feel instant; use `"viewport"` for cheap pages, `"hover"` for expensive ones
- SvelteKit re-runs load functions after form actions complete, keeping displayed data in sync automatically
- `$props.id()` generates unique IDs that are consistent between SSR and client hydration
- Service workers in `src/service-worker.ts` enable offline support with cache-first and network-first strategies
- `instrumentation.server.ts` integrates OpenTelemetry for production observability and tracing
