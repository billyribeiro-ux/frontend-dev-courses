# Caching Strategies

The fastest network request is the one that never happens. **Caching** stores copies of responses so they can be reused without hitting the server again. A well-cached site loads instantly on repeat visits and reduces server costs dramatically.

SvelteKit gives you multiple layers of caching: HTTP cache headers, prerendering, and CDN caching. Understanding when and how to use each one is the difference between a site that feels sluggish and one that feels instant.

## HTTP Cache Headers

Cache headers tell browsers and CDNs how long to keep a response. Set them in your server load functions or API routes:

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

Common `Cache-Control` directives:

```
public, max-age=3600         → Cache for 1 hour, shared caches can store it
private, max-age=3600        → Cache for 1 hour, only the user's browser
no-cache                     → Always revalidate with the server
no-store                     → Never cache (sensitive data like banking)
max-age=0, must-revalidate   → Expired immediately, must check server
```

## SvelteKit Prerendering

Prerendering generates static HTML files at build time. The page loads instantly because there is no server processing — the CDN just serves a file:

```typescript
// src/routes/about/+page.ts
export const prerender = true;
```

Prerender pages that rarely change:

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const prerender = true;

export const load: PageLoad = async ({ params }) => {
  const post = await getPost(params.slug);
  return { post };
};

// Tell SvelteKit which slugs to prerender
export function entries() {
  return [
    { slug: 'getting-started' },
    { slug: 'advanced-tips' },
    { slug: 'changelog' }
  ];
}
```

## CDN Caching

When you deploy to Vercel, Netlify, or Cloudflare, your responses pass through a CDN (Content Delivery Network). CDN nodes around the world cache your responses so users get data from the nearest server:

```typescript
// src/routes/api/posts/+server.ts
export const GET: RequestHandler = async () => {
  const posts = await db.select().from(postsTable);

  return json(posts, {
    headers: {
      // Browser caches for 1 minute
      // CDN caches for 1 hour
      'Cache-Control': 'public, max-age=60, s-maxage=3600'
    }
  });
};
```

`s-maxage` sets the cache duration specifically for shared caches (CDNs), separate from the browser cache (`max-age`).

## Stale-While-Revalidate

This powerful pattern serves cached content immediately while fetching a fresh version in the background:

```typescript
return json(data, {
  headers: {
    'Cache-Control': 'public, max-age=60, stale-while-revalidate=300'
  }
});
```

This means: serve the cached version for up to 60 seconds. After 60 seconds, still serve the stale version but fetch a new one in the background. After 300 seconds of being stale, stop serving it entirely.

The user always gets an instant response. The data might be slightly behind, but for most content that is perfectly acceptable.

## Caching API Responses Client-Side

Cache fetch results in memory to avoid redundant requests during a session:

```typescript
// src/lib/utils/cache.ts
const cache = new Map<string, { data: unknown; expires: number }>();

export async function cachedFetch<T>(url: string, ttlMs = 60000): Promise<T> {
  const cached = cache.get(url);

  if (cached && cached.expires > Date.now()) {
    return cached.data as T;
  }

  const res = await fetch(url);
  const data = await res.json();

  cache.set(url, { data, expires: Date.now() + ttlMs });
  return data as T;
}
```

```svelte
<script>
  import { cachedFetch } from '$lib/utils/cache';

  let categories = $state([]);

  $effect(() => {
    cachedFetch('/api/categories', 300000).then(data => {
      categories = data;
    });
  });
</script>
```

## Try It

Add caching headers to three different endpoints in your app: a public product listing (cache for 5 minutes with stale-while-revalidate), a user profile (private, cache for 1 minute), and a health check (no cache). Prerender your about and terms pages.

## Key Takeaways

- HTTP cache headers control how browsers and CDNs store responses
- Use `public` for shared content and `private` for user-specific data
- Prerendering generates static HTML at build time for pages that rarely change
- `s-maxage` sets CDN cache duration independently from browser cache
- `stale-while-revalidate` serves cached content instantly while fetching updates in the background
- Client-side caching with a simple Map avoids redundant API calls during a user session
