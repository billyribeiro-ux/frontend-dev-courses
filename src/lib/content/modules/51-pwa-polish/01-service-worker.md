# Service Worker & Offline Mode

TeamBoard is a project manager for teams — which means people rely on it during meetings, on trains, and in coffee shops with flaky Wi-Fi. If the app goes blank the moment a connection drops, you have failed your users. This lesson builds a service worker that caches the app shell, serves API responses from cache when offline, and queues mutations so nothing is lost.

SvelteKit has first-class service worker support. You do not need to install Workbox or any third-party plugin. Just create `src/service-worker.ts` and SvelteKit gives you everything you need through the `$service-worker` module.

## The $service-worker Module

SvelteKit exposes three values from `$service-worker`:

```typescript
// Available inside src/service-worker.ts
import { build, files, version } from '$service-worker';
```

- **`build`** — an array of URL strings for every generated JS and CSS bundle. These are the hashed output files from Vite (like `/_app/immutable/chunks/Board.abc123.js`). They change every time you redeploy.
- **`files`** — an array of URL strings for everything in your `static/` folder. Favicons, fonts, images, `manifest.json` — anything that does not go through Vite.
- **`version`** — a string that changes on every build. Remember the `version.name: Date.now().toString()` in `svelte.config.js` from Module 44? This is where it shows up. You will use it as the cache key so old caches get cleaned up automatically.

Together, these three values tell the service worker exactly what to precache and when to invalidate.

## The Complete Service Worker

Here is the full `src/service-worker.ts`. Read through it first, then we will break down each section:

```typescript
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `teamboard-v${version}`;

// Everything we want to precache on install
const PRECACHE_ASSETS = [
  ...build,  // JS/CSS bundles
  ...files   // static assets
];

// ----- INSTALL -----
// Precache the app shell so it loads instantly, even offline.
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => {
        // Skip waiting so the new service worker activates immediately
        (self as unknown as ServiceWorkerGlobalScope).skipWaiting();
      })
  );
});

// ----- ACTIVATE -----
// Delete old caches from previous deployments.
self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  // Take control of all open tabs immediately
  (self as unknown as ServiceWorkerGlobalScope).clients.claim();
});

// ----- FETCH -----
// Route requests to the right caching strategy.
self.addEventListener('fetch', (event: FetchEvent) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations go through the offline queue)
  if (request.method !== 'GET') return;

  // Skip requests to other origins
  if (url.origin !== self.location.origin) return;

  // Strategy 1: Cache-first for static assets
  // These URLs contain content hashes — if they are in the cache, they are correct.
  if (PRECACHE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached ?? fetch(request))
    );
    return;
  }

  // Strategy 2: Network-first for API calls and page navigations
  // Try the network. If it fails, fall back to the cache.
  if (url.pathname.startsWith('/api/') || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response before caching — responses can only be read once
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => {
            if (cached) return cached;

            // If this is a navigation request and nothing is cached,
            // serve the offline fallback page
            if (request.headers.get('accept')?.includes('text/html')) {
              return caches.match('/offline') ?? new Response(
                'You are offline.',
                { headers: { 'Content-Type': 'text/html' } }
              );
            }

            return new Response('Offline', { status: 503 });
          })
        )
    );
    return;
  }
});
```

Let's walk through the three events.

### Install: Precache the App Shell

The `install` event fires when the browser detects a new service worker (a new build). `cache.addAll()` downloads every URL in `PRECACHE_ASSETS` and stores them. If any single fetch fails, the entire install fails — this is intentional because a partial cache is worse than no cache.

`skipWaiting()` tells the new service worker to activate immediately rather than waiting for all tabs to close. Combined with `clients.claim()` in the activate event, this ensures users get the latest version without needing to close and reopen the app.

### Activate: Clean Up Old Caches

Because `CACHE_NAME` includes `version`, every deployment creates a new cache. The activate event deletes every cache whose name does not match the current `CACHE_NAME`. Without this cleanup, your users would accumulate megabytes of stale bundles.

### Fetch: Route to the Right Strategy

The fetch handler inspects each request and picks a strategy:

- **Cache-first** for `build` and `files` assets. These filenames contain content hashes, so a cached version is guaranteed correct. No network request needed.
- **Network-first** for API calls (`/api/*`) and page navigations. Fresh data is preferred, but if the network fails, serve whatever was cached from the last successful request.
- Non-GET requests (POST, PUT, DELETE) are ignored — those mutations go through the offline queue you will build next.

## The Offline Mutation Queue

When a user creates a task, updates a card title, or moves a task between columns while offline, you cannot just drop that mutation. You need to queue it and replay it when connectivity returns.

Here is a simple queue built with IndexedDB using `idb-keyval` for convenience:

```bash
npm install idb-keyval
```

```typescript
// src/lib/state/offline-queue.svelte.ts
import { get, set, del, keys, entries } from 'idb-keyval';

export interface QueuedMutation {
  id: string;
  url: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body: string;
  timestamp: number;
}

const QUEUE_PREFIX = 'mutation:';

function createOfflineQueue() {
  let pending = $state<QueuedMutation[]>([]);
  let isFlushing = $state(false);

  // Load existing queued mutations on initialization
  async function load() {
    const allKeys = await keys();
    const mutationKeys = allKeys.filter(
      (k) => typeof k === 'string' && k.startsWith(QUEUE_PREFIX)
    );

    const mutations: QueuedMutation[] = [];
    for (const key of mutationKeys) {
      const value = await get(key);
      if (value) mutations.push(value as QueuedMutation);
    }

    // Sort by timestamp so mutations replay in order
    pending = mutations.sort((a, b) => a.timestamp - b.timestamp);
  }

  async function enqueue(mutation: Omit<QueuedMutation, 'id' | 'timestamp'>) {
    const entry: QueuedMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      timestamp: Date.now()
    };

    await set(`${QUEUE_PREFIX}${entry.id}`, entry);
    pending = [...pending, entry];

    return entry.id;
  }

  async function flush() {
    if (isFlushing || pending.length === 0) return;
    isFlushing = true;

    const queue = [...pending];

    for (const mutation of queue) {
      try {
        const response = await fetch(mutation.url, {
          method: mutation.method,
          headers: { 'Content-Type': 'application/json' },
          body: mutation.body
        });

        if (response.ok) {
          // Remove from IndexedDB and local state
          await del(`${QUEUE_PREFIX}${mutation.id}`);
          pending = pending.filter((m) => m.id !== mutation.id);
        } else if (response.status >= 400 && response.status < 500) {
          // Client error — this mutation will never succeed, discard it
          console.error(`Mutation ${mutation.id} failed permanently:`, response.status);
          await del(`${QUEUE_PREFIX}${mutation.id}`);
          pending = pending.filter((m) => m.id !== mutation.id);
        } else {
          // Server error — stop flushing, try again later
          break;
        }
      } catch {
        // Network error — stop flushing, we are probably still offline
        break;
      }
    }

    isFlushing = false;
  }

  // Initialize on creation
  load();

  return {
    get pending() { return pending; },
    get count() { return pending.length; },
    get isFlushing() { return isFlushing; },
    enqueue,
    flush
  };
}

export const offlineQueue = createOfflineQueue();
```

A few things to notice about this design:

- Each mutation gets a UUID and a timestamp so they replay in order.
- The queue persists to IndexedDB, so it survives page reloads and even browser restarts.
- On flush, 4xx errors are discarded (the mutation is invalid and will never succeed). 5xx errors and network failures stop the flush — you will retry later.
- The `pending` array is `$state`, so any component that reads `offlineQueue.count` will reactively update.

## Using the Queue in API Calls

Wrap your existing API call functions so they automatically queue when offline:

```typescript
// src/lib/api/tasks.ts
import { offlineQueue } from '$state/offline-queue.svelte';

export async function createTask(columnId: number, title: string) {
  const body = JSON.stringify({ columnId, title });

  if (!navigator.onLine) {
    await offlineQueue.enqueue({
      url: '/api/tasks',
      method: 'POST',
      body
    });

    // Return an optimistic local task so the UI updates immediately
    return {
      id: crypto.randomUUID(),  // temporary ID
      columnId,
      title,
      _optimistic: true
    };
  }

  const response = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });

  return response.json();
}
```

When the user is offline, the mutation is queued and an optimistic result is returned. The board UI renders the new task immediately with a subtle indicator that it is pending sync.

## Replaying the Queue When Connectivity Returns

This is where Svelte 5 reactivity shines. Use `<svelte:window>` to bind the `online` state and an `$effect` to flush the queue when the user reconnects:

```svelte
<!-- src/lib/components/layout/ConnectionMonitor.svelte -->
<script lang="ts">
  import { offlineQueue } from '$state/offline-queue.svelte';

  let online = $state(true);

  // Flush the offline queue when connectivity returns
  $effect(() => {
    if (online && offlineQueue.count > 0) {
      offlineQueue.flush();
    }
  });
</script>

<svelte:window bind:online />

{#if !online}
  <div
    class="fixed top-0 inset-x-0 z-50 bg-amber-500 text-amber-950
           px-4 py-2 text-center text-sm font-medium
           transition-transform duration-300"
    role="alert"
  >
    You're offline. Changes will sync when you reconnect.
    {#if offlineQueue.count > 0}
      <span class="ml-2 opacity-75">
        ({offlineQueue.count} pending {offlineQueue.count === 1 ? 'change' : 'changes'})
      </span>
    {/if}
  </div>
{/if}

{#if online && offlineQueue.isFlushing}
  <div
    class="fixed top-0 inset-x-0 z-50 bg-blue-500 text-white
           px-4 py-2 text-center text-sm font-medium"
    role="status"
  >
    Syncing {offlineQueue.count} pending {offlineQueue.count === 1 ? 'change' : 'changes'}...
  </div>
{/if}
```

Here is how the pieces fit together:

1. `<svelte:window bind:online />` keeps `online` in sync with `navigator.onLine`. It updates reactively when the browser fires `online` and `offline` events.
2. The `$effect` watches both `online` and `offlineQueue.count`. When the user comes back online and there are queued mutations, it calls `flush()`.
3. The amber banner appears when offline, showing how many mutations are pending. The blue banner appears briefly while the queue is flushing.

## The Offline Fallback Page

When the service worker intercepts a navigation request and the network is down and nothing is cached for that route, it needs something to show. Create a simple offline fallback page:

```svelte
<!-- src/routes/offline/+page.svelte -->
<script lang="ts">
  import { PUBLIC_APP_NAME } from '$env/static/public';
</script>

<svelte:head>
  <title>Offline — {PUBLIC_APP_NAME}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
  <div class="text-center max-w-md">
    <div class="text-6xl mb-4">📡</div>
    <h1 class="text-2xl font-bold mb-2">You're Offline</h1>
    <p class="text-gray-600 dark:text-gray-400 mb-6">
      {PUBLIC_APP_NAME} needs a network connection to load this page.
      Check your connection and try again.
    </p>
    <button
      onclick={() => location.reload()}
      class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
    >
      Try Again
    </button>
  </div>
</div>
```

```typescript
// src/routes/offline/+page.ts
// Prerender the offline page so it is available as a static asset
export const prerender = true;
```

Prerendering is critical here. The offline page must be available in the cache before the user goes offline. Because it is prerendered, it ends up in the `files` array that the service worker precaches during install.

Update the service worker's fallback to serve this page:

```typescript
// In the fetch handler's catch block, replace the inline fallback:
if (request.headers.get('accept')?.includes('text/html')) {
  return caches.match('/offline') ?? new Response(
    '<h1>Offline</h1><p>Please check your connection.</p>',
    { headers: { 'Content-Type': 'text/html' } }
  );
}
```

The `caches.match('/offline')` will find the prerendered page because the service worker precached all `files` during install.

## Putting It All Together

Here is the integration diagram — how the service worker, connection monitor, and offline queue work as a system:

```
User Action (create task)
    │
    ├── Online? ──── YES ──→ fetch('/api/tasks', { method: 'POST' })
    │                              │
    │                              └─→ Server processes, returns result
    │
    └── Offline? ─── YES ──→ offlineQueue.enqueue({ url, method, body })
                                   │
                                   ├─→ Saved to IndexedDB (persists)
                                   └─→ Optimistic result returned to UI


Service Worker (background)
    │
    ├── GET static asset ──→ Cache-first (instant, no network)
    ├── GET /api/* ────────→ Network-first (fresh data preferred)
    └── GET /page ─────────→ Network-first (serve cached if offline)


Browser goes online
    │
    └─→ <svelte:window bind:online> updates
          │
          └─→ $effect detects online + pending queue
                │
                └─→ offlineQueue.flush() replays mutations in order
```

Add the `ConnectionMonitor` to your app layout so it is always active:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import ConnectionMonitor from '$components/layout/ConnectionMonitor.svelte';

  let { data, children } = $props();
</script>

<ConnectionMonitor />

<div class="flex h-screen">
  <aside class="w-64 border-r bg-white dark:bg-gray-800 p-4">
    <!-- sidebar -->
  </aside>

  <main class="flex-1 overflow-auto">
    {@render children()}
  </main>
</div>
```

## Registering the Service Worker

SvelteKit handles service worker registration automatically. When `src/service-worker.ts` (or `.js`) exists, SvelteKit registers it during the client-side hydration. You do not need to write any registration code — it just works.

If you want to know when a new version is available (to show an "Update available" prompt), you can listen for the service worker lifecycle events in `hooks.client.ts`:

```typescript
// src/hooks.client.ts (add to existing hooks)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then((registration) => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'activated') {
          // A new version is active — you could show a toast here
          console.log('New version activated. Refresh for updates.');
        }
      });
    });
  });
}
```

## Try It

1. Add `src/service-worker.ts` with the complete service worker from this lesson
2. Create the `ConnectionMonitor.svelte` component and add it to your app layout
3. Build the offline queue in `src/lib/state/offline-queue.svelte.ts`
4. Run `npm run build && npm run preview` to test with a real service worker (service workers do not run in `dev` mode)
5. Open DevTools > Application > Service Workers — verify the worker is registered and `PRECACHE_ASSETS` are cached
6. Toggle "Offline" in the Network panel — the app should continue working and show the offline banner
7. Create a task while offline — it should appear optimistically in the UI
8. Toggle back to online — watch the sync banner appear and the queued mutation replay
9. Navigate to a route you have not visited before while offline — the `/offline` fallback page should appear

## Key Takeaways

- SvelteKit's `$service-worker` module provides `build`, `files`, and `version` — everything you need to implement caching strategies without third-party tools
- **Cache-first** for hashed static assets (they never change), **network-first** for API calls and navigations (fresh data preferred, cached fallback when offline)
- The install event precaches the app shell; the activate event cleans old caches using the version-based cache name
- An offline mutation queue backed by IndexedDB survives page reloads and replays mutations in order when connectivity returns
- `<svelte:window bind:online>` combined with `$effect` creates a reactive reconnection handler — no manual event listener management needed
- Prerender the offline fallback page so it is available in the cache before the user goes offline
- SvelteKit automatically registers `src/service-worker.ts` — no manual registration code required
- Always test service workers with `npm run build && npm run preview` because they do not run in dev mode
