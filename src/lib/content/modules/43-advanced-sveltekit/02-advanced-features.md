# Advanced Features

SvelteKit has several powerful features that go beyond basic routing and data loading. Shallow routing lets you change the URL without a full navigation. Streaming lets you show fast data immediately while slower data loads in the background. Service workers give you offline support and fine-grained caching. These features turn a good app into a great one.

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
  <div class="modal" role="dialog">
    <img src={page.state.selectedPhoto.url} alt={page.state.selectedPhoto.title} />
    <h2>{page.state.selectedPhoto.title}</h2>
    <button onclick={closeModal}>Close</button>
  </div>
{/if}
```

The URL changes to `/photos/abc123`, so the user can share it or bookmark it. But no load function runs — the data for the modal comes from the state you passed to `pushState`. If someone navigates directly to `/photos/abc123`, SvelteKit runs the normal load function for that route, so the page still works.

Use `replaceState` instead of `pushState` when you do not want to add a new history entry — for example, updating a tab selection without stacking history.

## Streaming with Promises

When a page depends on multiple data sources and some are slower than others, you can stream the slow ones. Return unresolved promises from your load function, and SvelteKit sends the fast data immediately while streaming the rest as it resolves:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Fast: return immediately
  const user = await getUser();

  // Slow: do NOT await — return the promise
  const analyticsPromise = getAnalytics();
  const recentOrdersPromise = getRecentOrders();

  return {
    user,
    analytics: analyticsPromise,
    recentOrders: recentOrdersPromise
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

{#await data.analytics}
  <section class="skeleton">Loading analytics...</section>
{:then analytics}
  <section>
    <h2>Analytics</h2>
    <p>Page views: {analytics.views}</p>
    <p>Bounce rate: {analytics.bounceRate}%</p>
  </section>
{:catch error}
  <section class="error">Failed to load analytics</section>
{/await}

{#await data.recentOrders}
  <p>Loading recent orders...</p>
{:then orders}
  <ul>
    {#each orders as order}
      <li>{order.id}: ${order.total}</li>
    {/each}
  </ul>
{/await}
```

The user sees the greeting and skeleton states immediately. As each promise resolves, its section fills in — no loading spinners for the entire page.

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

## Try It

Build a photo gallery page that uses shallow routing for a modal view. Clicking a thumbnail should call `pushState` with the photo data and update the URL. The modal should display the full image and close with `history.back()`. Add a load function that streams a slow "related photos" promise while showing the main gallery immediately.

## Key Takeaways

- `pushState` and `replaceState` update the URL without running load functions — ideal for modals and tabs
- Access shallow state via `page.state` and handle direct navigation with normal load functions
- Return unresolved promises from load functions to stream data — fast content shows immediately
- Use `{#await}` blocks in templates to handle pending, resolved, and rejected states for streamed data
- Service workers in `src/service-worker.ts` enable offline support with cache-first and network-first strategies
- `instrumentation.server.ts` integrates OpenTelemetry for production observability and tracing
- `$props.id()` generates unique IDs that are consistent between SSR and client hydration
