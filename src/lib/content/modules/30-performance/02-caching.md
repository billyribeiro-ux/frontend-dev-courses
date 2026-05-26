# Caching Strategies

The fastest network request is the one that never happens. Caching stores copies of responses so they can be reused without hitting the server again. A well-cached site loads instantly on repeat visits, reduces server costs by 80-95%, and keeps working during backend outages. A poorly cached site either serves stale data to users or misses the cache entirely and performs no better than an uncached one.

Caching is deceptively simple on the surface — "just set some headers" — but the real challenge is **cache invalidation**. Phil Karlton famously said there are only two hard things in computer science: cache invalidation and naming things. After fifteen years of building web applications, I can confirm he was right about both.

SvelteKit gives you multiple caching layers: HTTP cache headers, prerendering, CDN caching, SvelteKit's `invalidate()` mechanism, and client-side data caching. Understanding when and how to use each layer is the difference between a site that feels sluggish and one that feels instant.

## HTTP Cache Headers Deep Dive

HTTP caching is built into the protocol itself. Every browser, CDN, and proxy understands it without additional configuration. The `Cache-Control` header is the primary mechanism for controlling cache behavior.

### Cache-Control Directives

```typescript
// src/routes/api/products/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const products = await getProducts();

  return json(products, {
    headers: {
      'Cache-Control': 'public, max-age=300' // Cache for 5 minutes
    }
  });
};
```

Each directive serves a specific purpose. Here is what they actually mean and when to use them:

```
Directive                        What It Does
─────────                        ────────────
public                           Any cache (browser, CDN, proxy) can store this
private                          Only the user's browser can cache (user-specific data)
max-age=N                        Cache is fresh for N seconds from the time of the request
s-maxage=N                       CDN/proxy cache duration (overrides max-age for shared caches)
no-cache                         Cache the response, but ALWAYS revalidate before using it
no-store                         Do NOT cache at all — not even to disk (sensitive data)
must-revalidate                  Once stale, MUST check with server before using cached version
stale-while-revalidate=N         Serve stale content for N seconds while fetching fresh in background
stale-if-error=N                 Serve stale content if server returns 5xx, for up to N seconds
immutable                        Content will NEVER change — do not revalidate, ever
```

A critical misunderstanding: `no-cache` does NOT mean "do not cache." It means "cache it, but always check with the server before using the cached copy." If the server says the content has not changed (via 304 Not Modified), the browser uses the cached version without re-downloading it. The directive that actually prevents caching is `no-store`.

### Practical Cache-Control Recipes

```typescript
// Static assets (JS, CSS, images with hashed filenames)
// These URLs change when the content changes, so they can be cached forever
'Cache-Control': 'public, max-age=31536000, immutable'

// Public page data (product listings, blog posts)
// Fresh for 5 minutes, CDN holds for 1 hour, serve stale for 5 more minutes while refreshing
'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=300'

// User-specific data (dashboard, profile)
// Only browser caches, fresh for 1 minute, must revalidate after
'Cache-Control': 'private, max-age=60, must-revalidate'

// Sensitive data (banking, medical records)
// Never cache anywhere, not even to disk
'Cache-Control': 'no-store'

// Semi-dynamic content (news feed, search results)
// Always revalidate, but use cached version if server confirms it hasn't changed
'Cache-Control': 'public, no-cache'

// API responses during outages
// Fresh for 1 minute, stale-while-revalidate for 5 min, serve stale on errors for 1 hour
'Cache-Control': 'public, max-age=60, stale-while-revalidate=300, stale-if-error=3600'
```

## SvelteKit setHeaders

In SvelteKit, the cleanest way to set cache headers is through load functions using `setHeaders`:

```typescript
// src/routes/products/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ setHeaders }) => {
  setHeaders({
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'
  });

  const products = await db.select().from(productsTable);
  return { products };
};
```

When using `setHeaders`, SvelteKit merges headers from parent and child load functions. If a parent layout sets `Cache-Control` and a child page also sets it, the **most restrictive** value wins. This is intentional — a parent that says "cache for 1 hour" should not be overridden by a child that says "cache for 1 year" if the parent has a good reason for the shorter duration.

```typescript
// src/routes/(app)/+layout.server.ts
export const load: LayoutServerLoad = async ({ setHeaders, locals }) => {
  if (locals.user) {
    // User-specific layout data should not be cached publicly
    setHeaders({ 'Cache-Control': 'private, max-age=0' });
  } else {
    setHeaders({ 'Cache-Control': 'public, max-age=3600' });
  }

  return { user: locals.user };
};
```

An important rule: **if a page has both public and private data, the entire page must be treated as private.** You cannot cache the public parts publicly while keeping the private parts private in a single response. If you need different cache policies, split the data into separate API calls — one for public data that can be cached aggressively and one for private data with restricted caching.

## ETag and Conditional Requests

`Cache-Control` tells the browser how long to use a cached response without checking the server. But what happens after that time expires? ETags let the browser ask, "I have version X of this resource — has it changed?" If not, the server responds with `304 Not Modified` (no body), and the browser uses its cached copy. This saves bandwidth even when the cache has expired.

```typescript
// src/routes/api/products/[id]/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'crypto';

export const GET: RequestHandler = async ({ params, request, setHeaders }) => {
  const product = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, Number(params.id)));

  if (!product.length) {
    throw error(404, 'Product not found');
  }

  // Generate ETag from content hash
  const content = JSON.stringify(product[0]);
  const etag = `"${crypto.createHash('md5').update(content).digest('hex')}"`;

  // Check if client has this version already
  const ifNoneMatch = request.headers.get('if-none-match');
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304 });
  }

  setHeaders({
    'ETag': etag,
    'Cache-Control': 'public, no-cache' // Always revalidate, but use ETag
  });

  return json(product[0]);
};
```

### Last-Modified

Similar to ETags but uses timestamps instead of content hashes. Simpler to implement when your data has `updatedAt` fields:

```typescript
export const GET: RequestHandler = async ({ params, request, setHeaders }) => {
  const product = await getProduct(params.id);
  const lastModified = new Date(product.updatedAt).toUTCString();

  const ifModifiedSince = request.headers.get('if-modified-since');
  if (ifModifiedSince === lastModified) {
    return new Response(null, { status: 304 });
  }

  setHeaders({
    'Last-Modified': lastModified,
    'Cache-Control': 'public, no-cache'
  });

  return json(product);
};
```

Use ETags when you can cheaply compute a content hash. Use Last-Modified when your data naturally has timestamps. Both can be used together — the browser will send both `If-None-Match` and `If-Modified-Since` headers, and the server should prioritize ETags.

## CDN Caching

When you deploy to Vercel, Netlify, or Cloudflare, your responses pass through a CDN (Content Delivery Network). CDN nodes around the world cache your responses so users get data from the nearest edge location. The CDN respects your `Cache-Control` headers, with `s-maxage` controlling the CDN specifically.

```typescript
// src/routes/api/posts/+server.ts
export const GET: RequestHandler = async () => {
  const posts = await db.select().from(postsTable);

  return json(posts, {
    headers: {
      // Browser caches for 1 minute, CDN caches for 1 hour
      'Cache-Control': 'public, max-age=60, s-maxage=3600'
    }
  });
};
```

`s-maxage` sets the cache duration specifically for shared caches (CDNs), separate from the browser cache (`max-age`). This lets you keep a short browser cache (so users see relatively fresh data) while the CDN holds onto the response for much longer (so your server handles fewer requests).

### CDN Cache Invalidation

The hardest part of CDN caching is invalidation. When data changes, how do you tell 200 CDN edge nodes around the world to drop their cached copies? Each platform handles this differently:

```typescript
// Vercel: Purge via API
// After updating a product:
await fetch('https://api.vercel.com/v1/edge-config/purge', {
  method: 'POST',
  headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
  body: JSON.stringify({ tags: [`product-${id}`] })
});

// Cloudflare: Purge by URL or tag
await fetch(`https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/purge_cache`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${CF_TOKEN}` },
  body: JSON.stringify({ files: [`https://example.com/api/products/${id}`] })
});
```

In practice, for most applications, using short `max-age` with `stale-while-revalidate` is simpler and more reliable than explicit cache invalidation. The cache auto-refreshes, and users see slightly stale data for a few seconds at worst.

### Surrogate Keys (Cache Tags)

Advanced CDN setups use surrogate keys (also called cache tags) to group related cache entries for bulk invalidation:

```typescript
// Tag every product listing response
return json(products, {
  headers: {
    'Cache-Control': 'public, s-maxage=3600',
    'Surrogate-Key': 'products product-listing',
    'Cache-Tag': 'products, product-listing' // Cloudflare uses Cache-Tag
  }
});

// Tag individual products
return json(product, {
  headers: {
    'Cache-Control': 'public, s-maxage=3600',
    'Surrogate-Key': `product-${product.id} products category-${product.categoryId}`
  }
});

// When product 42 changes, purge everything tagged with product-42
// This invalidates both the individual page AND the listing page
```

## Stale-While-Revalidate

This is the most important caching pattern for user-perceived performance. It serves the cached version immediately (instant load) while fetching a fresh version in the background (data stays current).

```typescript
return json(data, {
  headers: {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
  }
});
```

The timeline:

```
0-60 seconds:   Serve cached version directly. No server request.
60-360 seconds: Serve STALE cached version immediately to the user.
                Simultaneously fetch a fresh version in the background.
                The fresh version replaces the stale one in cache.
After 360 seconds: Cache is too stale. Wait for a fresh response from the server.
```

The user always gets an instant response. The data might be up to 5 minutes behind, but for product listings, blog posts, and most content, that is perfectly acceptable. The user who triggers the background revalidation sees stale data, but the next user sees fresh data.

### stale-if-error

The lesser-known sibling of stale-while-revalidate. If your server returns a 5xx error, serve the stale cached version instead of showing the user an error page:

```typescript
'Cache-Control': 'public, max-age=60, stale-while-revalidate=300, stale-if-error=86400'
```

This means: if the server is down, keep serving the last known good response for up to 24 hours. Your users see slightly stale data instead of an error page. This is particularly valuable for content sites where stale data is vastly preferable to no data.

## SvelteKit Prerendering as a Cache Strategy

Prerendering generates static HTML at build time. It is the ultimate cache — the response is computed once and served as a static file from the CDN forever (or until the next deploy). There is no server processing, no database query, no cold start latency.

```typescript
// src/routes/about/+page.ts
export const prerender = true;
```

Prerender pages that change only when you deploy:

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = async ({ params }) => {
  const post = await getPost(params.slug);
  return { post };
};

// Tell SvelteKit which slugs exist
export function entries() {
  return [
    { slug: 'getting-started' },
    { slug: 'advanced-tips' },
    { slug: 'changelog' }
  ];
}
```

You can also prerender entire sections of your site:

```typescript
// src/routes/(marketing)/+layout.ts
// Prerenders ALL pages under (marketing): /about, /pricing, /terms, etc.
export const prerender = true;
```

### When Prerendering Breaks

Prerendering fails when a page depends on request-time data: cookies, headers, URL search params, or user-specific content. SvelteKit will throw an error during the build if a prerendered page tries to access these.

The mental model: prerendered pages must produce the same HTML for every visitor. If the page needs to vary by user, it cannot be prerendered.

A common hybrid approach: prerender the page shell and load user-specific data client-side:

```typescript
// src/routes/products/[id]/+page.ts
export const prerender = true; // Page shell is prerendered

export const load: PageLoad = async ({ params }) => {
  return { productId: params.id };
};
```

```svelte
<!-- src/routes/products/[id]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  let userReview = $state(null);

  // User-specific data loaded client-side after hydration
  $effect(() => {
    fetch(`/api/products/${data.productId}/my-review`)
      .then(r => r.json())
      .then(r => { userReview = r; });
  });
</script>

<!-- Static product info (prerendered) -->
<h1>{data.product.name}</h1>
<p>{data.product.description}</p>

<!-- User-specific content (loaded client-side) -->
{#if userReview}
  <div>Your review: {userReview.text}</div>
{/if}
```

## SvelteKit invalidate() and invalidateAll()

SvelteKit has its own client-side caching mechanism for load function data. When you navigate between pages, SvelteKit caches the load function results and reuses them. The `invalidate()` and `invalidateAll()` functions let you force a refresh.

```typescript
// src/routes/products/+page.server.ts
export const load: PageServerLoad = async ({ depends }) => {
  // Register a dependency identifier
  depends('app:products');

  const products = await db.select().from(productsTable);
  return { products };
};
```

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  let { data } = $props();

  async function refreshProducts() {
    // Invalidate only load functions that depend on 'app:products'
    await invalidate('app:products');
  }

  async function refreshEverything() {
    // Re-run ALL load functions for the current page
    await invalidateAll();
  }

  async function deleteProduct(id: number) {
    await fetch(`/api/products/${id}`, { method: 'DELETE' });
    // After mutation, refresh the product list
    await invalidate('app:products');
  }
</script>
```

You can also invalidate by URL pattern:

```typescript
// Invalidate any load function that fetches from /api/products
await invalidate((url) => url.pathname.startsWith('/api/products'));

// Invalidate by exact URL
await invalidate('/api/products');
```

### How SvelteKit's Internal Cache Works

When you navigate from `/products` to `/products/42` and back, SvelteKit does not re-run the load function for `/products` — it uses the cached result. This cache is invalidated when:

1. You call `invalidate()` or `invalidateAll()`
2. A form action completes (SvelteKit calls `invalidateAll()` automatically after form submissions)
3. The URL changes in a way that would produce different load function arguments
4. You call `goto()` with `invalidateAll: true`

This means form actions and `invalidate()` work together seamlessly: submit a form to create a product, and the product list automatically refreshes because SvelteKit invalidates all load functions after the action completes.

## Service Worker Caching Strategies

Service workers intercept network requests and can serve cached responses even when the user is offline. SvelteKit generates a service worker file that you can customize.

```typescript
// src/service-worker.ts
/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE_NAME = `app-cache-${version}`;
const ASSETS = [...build, ...files]; // All built assets + static files

// Install: cache all static assets
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: remove old caches
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
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', (event: FetchEvent) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Static assets: cache-first (they have hashed filenames)
  if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  // API requests: network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Clone the response before caching (response bodies can only be read once)
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(event.request).then((cached) => {
            return cached || new Response('Offline', { status: 503 });
          });
        })
    );
    return;
  }

  // HTML pages: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });

      return cached || networkFetch;
    })
  );
});
```

### Service Worker Caching Strategies Explained

There are four main strategies, each suited to different content types:

**Cache-First (Cache Falling Back to Network):** Check the cache first. If it is there, use it. If not, fetch from the network and cache the result. Best for static assets with hashed filenames — they never change, so the cache is always correct.

**Network-First (Network Falling Back to Cache):** Try the network first. If the network fails (offline, timeout), use the cached version. Best for API data and HTML where freshness matters but offline support is also desirable.

**Stale-While-Revalidate:** Serve the cached version immediately, then fetch a fresh version in the background for next time. Best for content that changes but where a slight delay in seeing the latest version is acceptable.

**Cache-Only / Network-Only:** Extremes for specific use cases. Cache-only for fully offline apps. Network-only for real-time data that must never be stale (stock prices, live scores).

## Client-Side Data Caching

For data that is expensive to fetch but changes infrequently, cache it in memory during the user's session:

```typescript
// src/lib/utils/cache.ts
interface CacheEntry<T> {
  data: T;
  expires: number;
  etag?: string;
}

class ClientCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T, ttlMs: number, etag?: string): void {
    this.store.set(key, {
      data,
      expires: Date.now() + ttlMs,
      etag
    });
  }

  invalidate(pattern?: string): void {
    if (!pattern) {
      this.store.clear();
      return;
    }
    for (const key of this.store.keys()) {
      if (key.includes(pattern)) {
        this.store.delete(key);
      }
    }
  }

  getEtag(key: string): string | undefined {
    return this.store.get(key)?.etag;
  }
}

export const cache = new ClientCache();

export async function cachedFetch<T>(
  url: string,
  ttlMs = 60_000
): Promise<T> {
  // Check in-memory cache first
  const cached = cache.get<T>(url);
  if (cached) return cached;

  // Check ETag for conditional request
  const headers: HeadersInit = {};
  const etag = cache.getEtag(url);
  if (etag) {
    headers['If-None-Match'] = etag;
  }

  const res = await fetch(url, { headers });

  if (res.status === 304) {
    // Server confirmed our cached version is still valid
    const existing = cache.get<T>(url);
    if (existing) return existing;
  }

  const data = await res.json();
  const responseEtag = res.headers.get('etag') ?? undefined;
  cache.set(url, data, ttlMs, responseEtag);
  return data as T;
}
```

```svelte
<script lang="ts">
  import { cachedFetch, cache } from '$lib/utils/cache';

  let categories = $state([]);

  $effect(() => {
    // Cache categories for 5 minutes — they rarely change
    cachedFetch('/api/categories', 300_000).then(data => {
      categories = data;
    });
  });

  async function addCategory(name: string) {
    await fetch('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
      headers: { 'Content-Type': 'application/json' }
    });

    // Invalidate the cache after mutation
    cache.invalidate('/api/categories');

    // Re-fetch fresh data
    categories = await cachedFetch('/api/categories', 300_000);
  }
</script>
```

## A Complete Caching Strategy for Production

Here is a real-world caching architecture for an e-commerce site. Each layer serves a specific purpose:

```typescript
// === Layer 1: Static Assets ===
// Handled by Vite's build output with content hashes
// Cache-Control: public, max-age=31536000, immutable
// (configured automatically by your deployment platform)

// === Layer 2: Prerendered Pages ===
// src/routes/(marketing)/+layout.ts
export const prerender = true;
// About, pricing, terms, blog posts — generated at build time
// Served as static files from the CDN

// === Layer 3: Server-Rendered Pages with HTTP Caching ===
// src/routes/products/+page.server.ts
export const load: PageServerLoad = async ({ setHeaders, depends }) => {
  depends('app:products');

  setHeaders({
    'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600'
  });

  const products = await db.select().from(productsTable);
  return { products };
};

// === Layer 4: User-Specific Data (No Shared Caching) ===
// src/routes/dashboard/+page.server.ts
export const load: PageServerLoad = async ({ locals, setHeaders }) => {
  setHeaders({
    'Cache-Control': 'private, max-age=0, must-revalidate'
  });

  const orders = await getUserOrders(locals.user.id);
  return { orders };
};

// === Layer 5: API Routes with Fine-Grained Caching ===
// src/routes/api/products/+server.ts
export const GET: RequestHandler = async ({ url, setHeaders }) => {
  const products = await getProducts(url.searchParams);

  // Dynamic ETag based on the data itself
  const hash = crypto.createHash('md5').update(JSON.stringify(products)).digest('hex');

  setHeaders({
    'Cache-Control': 'public, max-age=30, s-maxage=300, stale-while-revalidate=600',
    'ETag': `"${hash}"`,
    'Vary': 'Accept-Encoding' // Cache different versions for gzipped vs plain
  });

  return json(products);
};

// === Layer 6: Client-Side Caching for Session Data ===
// Categories, user preferences, feature flags — data fetched once
// and reused across navigations within the same session
```

### The Vary Header

The `Vary` header tells caches to store different versions of a response based on request headers. This is critical for correctness:

```typescript
// If your API returns different data based on the Accept-Language header,
// the CDN must cache a separate version for each language
setHeaders({
  'Cache-Control': 'public, max-age=3600',
  'Vary': 'Accept-Language'
});

// If your page returns different HTML for authenticated vs anonymous users,
// you MUST add Vary: Cookie — otherwise the CDN might serve
// an authenticated user's page to an anonymous visitor
setHeaders({
  'Cache-Control': 'public, max-age=300',
  'Vary': 'Cookie'
});
// But be careful: Vary: Cookie effectively disables CDN caching because
// every user has different cookies. Better to use 'private' for user-specific content.
```

## Cache Debugging

When caching goes wrong, you need to know which layer caused the problem. Here are the tools:

```
Browser DevTools → Network tab → check response headers:
  - Cache-Control: what the server told the browser
  - Age: how many seconds the CDN has held this response
  - X-Cache: HIT or MISS (Vercel, CloudFront)
  - CF-Cache-Status: HIT, MISS, EXPIRED, REVALIDATED (Cloudflare)

curl -I https://example.com/api/products
  Shows response headers without downloading the body

curl -H "Cache-Control: no-cache" https://example.com/api/products
  Bypasses the CDN cache to see fresh server response
```

A production war story: we once had a bug where user A could see user B's dashboard. The root cause was a `public` Cache-Control header on a page that contained user-specific data. The CDN cached user A's dashboard and served it to user B. The fix was changing `public` to `private`. This is why you must be extremely careful with `public` on any page that varies by user. When in doubt, use `private`.

## Try It

1. **Implement a three-tier caching strategy** for an application with these endpoints:
   - `/api/products` — public product listing (cache 5 minutes, CDN 1 hour, stale-while-revalidate 10 minutes)
   - `/api/products/[id]` — individual product with ETag validation
   - `/api/user/profile` — private user data (cache 1 minute, must-revalidate)
   - `/api/health` — health check (no cache whatsoever)

2. **Add `invalidate()` calls** to your product management page. When a product is created, updated, or deleted via a form action, the product list should refresh automatically. Use the `depends('app:products')` pattern.

3. **Build a client-side cache** with ETag support. When the cache expires, make a conditional request using `If-None-Match`. If the server returns 304, reuse the cached data without re-parsing the response body.

4. **Prerender your marketing pages** (about, pricing, terms, privacy) using a layout-level `prerender = true`. Keep your dynamic pages (dashboard, search) server-rendered with appropriate cache headers.

## Key Takeaways

- HTTP cache headers control how browsers and CDNs store responses — getting them right has a bigger performance impact than any code optimization
- `no-cache` means "always revalidate," not "do not cache" — `no-store` is the one that prevents caching entirely
- `s-maxage` sets CDN cache duration independently from browser cache, letting you have short browser caches with long CDN caches
- ETags and Last-Modified enable conditional requests that return 304 Not Modified, saving bandwidth without sacrificing freshness
- `stale-while-revalidate` is the most user-friendly caching pattern — the user always gets an instant response, and fresh data arrives in the background
- Prerendering is the ultimate cache: zero server processing, zero database queries, static file served from CDN edge
- SvelteKit's `invalidate()` and `invalidateAll()` control the client-side load function cache and integrate seamlessly with form actions
- Service workers enable offline caching with four strategies: cache-first, network-first, stale-while-revalidate, and cache-only
- Never use `public` cache headers on pages that contain user-specific data — the CDN will serve one user's content to another
- The `Vary` header tells caches to store separate versions based on request headers like `Accept-Language` or `Cookie`
