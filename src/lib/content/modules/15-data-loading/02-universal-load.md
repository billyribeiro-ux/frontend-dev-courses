# Universal Load Functions

Server load functions run exclusively on the server. They are perfect for database queries and API secrets, but they come with a cost: every client-side navigation requires a round trip to the server to re-run the load function. **Universal load functions** eliminate that round trip for data that does not require server-only access. They run on the server during SSR (so the first page load is fast and SEO-friendly) and then run directly in the browser on subsequent navigations (so client-side transitions are instant).

Universal load functions live in `+page.ts` files — note the absence of `.server` in the filename. This single difference in naming determines where the code executes. It is a small naming convention with major architectural implications.

The mental model is simple: if your data comes from a public API, does not require secrets, and does not need direct database access, a universal load function is likely the better choice. The data loads faster on client-side navigations because the browser fetches it directly instead of routing through your server as a proxy.

## The Execution Model — Understand This First

Understanding when and where universal load functions run is the single most important concept in this lesson. Get this right and everything else follows:

```
FIRST PAGE LOAD (user types URL or refreshes):
  Browser → Request → Server
  Server runs +page.ts load function
  Server renders component to HTML
  Server sends HTML + serialized data to browser
  Browser displays HTML immediately (fast!)
  Browser hydrates with JavaScript
  Load function does NOT run again during hydration
  
CLIENT-SIDE NAVIGATION (user clicks an internal link):
  Browser runs +page.ts load function directly
  No server round trip!
  Component updates with new data
  
Compare with +page.server.ts:
  Client-side navigation → request to server → server runs load → sends data back
  (Always a round trip)
```

This dual execution means your universal load function code must be compatible with both environments. You cannot use Node.js APIs (they crash in the browser) or browser-only APIs unconditionally (they crash during SSR).

### WRONG vs CORRECT: Environment-Specific Code

```typescript
// WRONG — Node.js API crashes in the browser
import type { PageLoad } from './$types';
import fs from 'fs';  // Crashes during client-side navigation

export const load: PageLoad = async () => {
  const data = fs.readFileSync('data.json', 'utf-8');  // Node-only
  return { data: JSON.parse(data) };
};

// WRONG — Browser API crashes during SSR
export const load: PageLoad = async () => {
  const width = window.innerWidth;  // Crashes on the server
  return { width };
};
```

```typescript
// CORRECT — use the provided fetch (works in both environments)
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/data');
  return { data: await response.json() };
};

// CORRECT — guard browser APIs with a check
import { browser } from '$app/environment';

export const load: PageLoad = async ({ fetch }) => {
  const data = await fetch('/api/data').then(r => r.json());
  const width = browser ? window.innerWidth : 1024;  // Fallback for SSR
  return { data, width };
};
```

## Your First Universal Load Function

Create a `+page.ts` file alongside your `+page.svelte`:

```typescript
// src/routes/projects/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch(
    'https://api.github.com/users/sveltejs/repos?per_page=6&sort=updated'
  );
  const repos = await response.json();

  return {
    repos
  };
};
```

Use the data exactly the same way as server load:

```svelte
<!-- src/routes/projects/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Svelte Repositories</h1>

<div class="grid">
  {#each data.repos as repo}
    <a href={repo.html_url} target="_blank" rel="noopener">
      <h2>{repo.name}</h2>
      <p>{repo.description}</p>
      <span>{repo.stargazers_count} stars</span>
    </a>
  {/each}
</div>
```

The component code is identical whether the load function is server or universal. The `data` prop works the same way. This is intentional — SvelteKit abstracts the execution environment so your page components do not need to know where their data came from.

## The LoadEvent Object

Universal load functions receive a `LoadEvent` with these key properties:

### fetch — The Most Important Property

The SvelteKit-enhanced `fetch` function. This is the most commonly used property and deserves detailed understanding:

```typescript
// src/routes/weather/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  // Relative URLs work during SSR — SvelteKit resolves them against the origin
  const weatherRes = await fetch('/api/weather');

  // Cookies are forwarded automatically during SSR
  // On the client, the browser handles cookies natively
  const userRes = await fetch('/api/user/preferences');

  // External API calls work in both environments
  const forecastRes = await fetch('https://api.weather.example.com/forecast');

  const [weather, preferences, forecast] = await Promise.all([
    weatherRes.json(),
    userRes.json(),
    forecastRes.json()
  ]);

  return { weather, preferences, forecast };
};
```

Why use the provided `fetch` instead of the global `fetch`?

1. **Relative URL resolution during SSR.** When the load function runs on the server, there is no `window.location.origin`. The global `fetch('/api/weather')` would fail because `/api/weather` is not a valid absolute URL. SvelteKit's `fetch` automatically resolves relative URLs against the request's origin.

2. **Cookie forwarding.** During SSR, the browser's cookies are not available because there is no browser. SvelteKit's `fetch` automatically includes the incoming request's cookies in outgoing requests, so authenticated API calls work transparently.

3. **Request deduplication.** If you call `fetch('/api/data')` in both a layout load and a page load during SSR, SvelteKit makes only one actual HTTP request. The second call gets the cached response.

4. **Tracking dependencies.** SvelteKit records which URLs your load function fetches. When you call `invalidate('/api/weather')` from the client, SvelteKit re-runs any load function that fetched from that URL.

5. **Internal routing during SSR.** When you `fetch` a URL that matches one of your own API routes during SSR, SvelteKit does not make an actual HTTP request. It calls the API route's handler function directly — faster, no network overhead.

### WRONG vs CORRECT: Using Fetch

```typescript
// WRONG — using global fetch instead of provided fetch
export const load: PageLoad = async () => {
  // During SSR: fails because '/api/data' is not absolute
  // During client nav: works but loses deduplication and dependency tracking
  const response = await fetch('/api/data');
  return { data: await response.json() };
};

// CORRECT — always use the provided fetch
export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/data');
  return { data: await response.json() };
};
```

### data — Merging Server and Universal Load

When you have both `+page.server.ts` and `+page.ts` for the same route, the server load runs first and its return value is passed to the universal load function via the `data` property:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';
import { ANALYTICS_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ locals }) => {
  // Server-only work: database query and secret usage
  const metrics = await db.metrics.findMany({
    where: { userId: locals.user.id }
  });

  return {
    metrics,
    analyticsEndpoint: `https://analytics.example.com/v2?key=${ANALYTICS_KEY}`
  };
};
```

```typescript
// src/routes/dashboard/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, fetch }) => {
  // `data` contains everything returned from +page.server.ts
  // Now we can enrich it with client-side-safe logic

  const chartData = data.metrics.map(m => ({
    label: new Date(m.date).toLocaleDateString(),
    value: m.count
  }));

  // Fetch additional data from the analytics endpoint
  // (The URL was constructed on the server with the secret key)
  const analyticsRes = await fetch(data.analyticsEndpoint);
  const analytics = await analyticsRes.json();

  return {
    ...data,
    chartData,
    analytics
  };
};
```

This pattern is useful when you need server-only data access (secrets, database) but also want to transform data or fetch additional public data that benefits from client-side execution.

**Important:** When you return `...data` (spreading the server data), you must include everything the page needs. The page component's `data` prop only contains what the universal load returns — it does not automatically merge with the server load's return value.

### url and params

Work identically to their server load counterparts:

```typescript
// src/routes/search/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ url, fetch }) => {
  const query = url.searchParams.get('q') ?? '';
  const page = Number(url.searchParams.get('page')) || 1;
  const sort = url.searchParams.get('sort') ?? 'relevance';

  if (!query) {
    return { results: [], query, page, sort, totalPages: 0 };
  }

  const params = new URLSearchParams({
    q: query,
    page: String(page),
    sort,
    limit: '20'
  });

  const response = await fetch(
    `https://api.search.example.com/search?${params}`
  );
  const { results, totalResults } = await response.json();

  return {
    results,
    query,
    page,
    sort,
    totalPages: Math.ceil(totalResults / 20)
  };
};
```

### depends — Custom Invalidation Keys

Register custom dependency keys so you can manually trigger re-runs:

```typescript
// src/routes/feed/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, depends }) => {
  depends('app:feed');  // Register a custom key

  const response = await fetch('https://api.example.com/feed');
  const items = await response.json();

  return { items };
};
```

```svelte
<!-- In a component -->
<script lang="ts">
  import { invalidate } from '$app/navigation';

  // Re-run any load function that called depends('app:feed')
  function refreshFeed() {
    invalidate('app:feed');
  }
</script>

<button onclick={refreshFeed}>Refresh Feed</button>
```

### The Invalidation Hierarchy

SvelteKit provides several ways to trigger load function re-runs:

```typescript
import { invalidate, invalidateAll } from '$app/navigation';

// Re-run loads that fetched this URL
invalidate('/api/data');

// Re-run loads that called depends('app:feed')
invalidate('app:feed');

// Re-run loads matching a function predicate
invalidate((url) => url.pathname.startsWith('/api/products'));

// Re-run ALL load functions for the current page
invalidateAll();
```

Use the most specific invalidation possible. `invalidateAll()` re-runs every load function in the current page's hierarchy — layout loads, page loads, all of them. If only one piece of data changed, invalidating just that URL or custom key is more efficient.

## Server Load vs Universal Load: Decision Guide

This decision comes up for every route you build. Here is a comprehensive comparison:

| Criterion | `+page.server.ts` | `+page.ts` |
|---|---|---|
| Runs on | Server only | Server (SSR) + Client (navigation) |
| Can access databases directly | Yes | No |
| Can use `$env/static/private` | Yes | No |
| Can use Node.js APIs (fs, crypto) | Yes | No |
| Can use browser APIs | No | Yes (guard with `if (browser)`) |
| Client-side navigation speed | Slower (server round trip) | Faster (runs in browser) |
| Can return non-serializable data | No (still serialized for SSR) | Yes (on client navigations only) |
| Code visible in browser bundle | Never | Yes |
| `fetch` cookie handling | Automatic | Automatic during SSR, native on client |
| Data freshness on navigation | Always fresh (server re-run) | May use cached/stale data if not invalidated |

**Choose `+page.server.ts` when:**
- You query a database directly
- You use private API keys or environment variables
- You access internal services that should not be exposed to the client
- Your load logic contains business rules that should remain server-side
- You read from the file system
- You need data that is always fresh on every navigation

**Choose `+page.ts` when:**
- You call public APIs that do not require secrets
- You want the fastest possible client-side navigation
- You need to use browser APIs (with SSR guards)
- The data transformation logic benefits from running in the browser
- You need to return non-serializable values (class instances, functions) during client-side navigation

**Use both when:**
- You need server-only access (secrets, DB) but also want to transform or enrich the data with logic that benefits from client-side execution
- You need to combine private server data with public API data

### The "Proxy Problem" — When Server Load Adds Unnecessary Latency

Consider this architecture:

```
Client → Your Server → External Public API → Your Server → Client
         (+page.server.ts)

vs.

Client → External Public API → Client (on client-side nav)
         (+page.ts)
```

If the external API is public and requires no secrets, using `+page.server.ts` makes your server an unnecessary proxy. Every client-side navigation adds your server's latency on top of the API's latency. With `+page.ts`, the client fetches directly from the API, eliminating the proxy hop.

This is particularly impactful when:
- Your server is in `us-east-1` but the user is in Tokyo
- The external API has a CDN but your server does not
- Your server is under load and adds queuing delay

## Layout Load Functions

Universal layout load functions work in `+layout.ts` files and share data with all child pages:

```typescript
// src/routes/+layout.ts
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ fetch }) => {
  const response = await fetch('/api/site-config');
  const config = await response.json();

  return {
    siteTitle: config.title,
    navItems: config.navigation,
    footerLinks: config.footer
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();
</script>

<header>
  <h1>{data.siteTitle}</h1>
  <nav>
    {#each data.navItems as item}
      <a href={item.href}>{item.label}</a>
    {/each}
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer>
  {#each data.footerLinks as link}
    <a href={link.href}>{link.label}</a>
  {/each}
</footer>
```

### Layout Load Revalidation

A key performance optimization: SvelteKit does not re-run a layout load function when navigating between child pages unless the layout load's dependencies change. If your root layout fetches site configuration, that fetch happens once during SSR and is not repeated when the user navigates between pages. This is automatic — SvelteKit tracks which inputs (params, url, dependencies) each load function uses and only re-runs it when those inputs change.

```typescript
// This layout load depends on url.pathname
export const load: LayoutLoad = async ({ url, fetch }) => {
  // Re-runs when the user navigates to a different path
  const response = await fetch(`/api/breadcrumbs?path=${url.pathname}`);
  return { breadcrumbs: await response.json() };
};

// This layout load has NO tracked dependencies (depends on nothing dynamic)
export const load: LayoutLoad = async ({ fetch }) => {
  // Runs ONCE during SSR, never re-runs on navigation
  const response = await fetch('/api/site-config');
  return { config: await response.json() };
};
```

### Data Inheritance in the Layout Hierarchy

Child pages inherit layout data. In the page component, `data` contains both the layout's data and the page's own data, merged together:

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  // data.siteTitle — from root layout
  // data.navItems — from root layout
  // data.aboutContent — from this page's own load function
</script>

<h1>About {data.siteTitle}</h1>
```

If a layout load and a page load return the same key, the page's value wins. This is intentional — it lets pages override layout-level defaults.

## Combining Server and Universal Load

You can have both `+page.server.ts` and `+page.ts` for the same route. The server load runs first, and its data passes to the universal load:

```typescript
// src/routes/product/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  const product = await db.product.findUnique({
    where: { id: params.id },
    include: { variants: true }
  });

  if (!product) {
    throw error(404, 'Product not found');
  }

  return { product };
};
```

```typescript
// src/routes/product/[id]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data, fetch }) => {
  // data.product comes from the server load
  // Now fetch public review data from a third-party API
  const reviewsRes = await fetch(
    `https://reviews.example.com/api/products/${data.product.id}/reviews`
  );
  const reviews = await reviewsRes.json();

  // Calculate a derived value
  const averageRating = reviews.length > 0
    ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
    : 0;

  return {
    ...data,       // Include the server data
    reviews,
    averageRating
  };
};
```

**How this works during SSR:** SvelteKit runs the server load, gets the product from the database. Then it runs the universal load with the server data, fetches reviews, calculates the average rating. The page renders with all data.

**How this works on client-side navigation:** SvelteKit makes an internal request to get the server load data (this hits your server). Then it runs the universal load in the browser, which fetches reviews directly from the third-party API (no server proxy needed). This is faster because the review fetch happens from the browser directly.

## Returning Non-Serializable Data

One advantage of universal load functions is that during client-side navigation, the return value does not need to be serialized. You can return class instances, functions, component constructors, or other non-serializable values:

```typescript
// src/routes/editor/+page.ts
import type { PageLoad } from './$types';
import { EditorState } from '$lib/editor';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/document/1');
  const documentData = await response.json();

  return {
    // During client-side nav, this class instance is passed directly
    // During SSR, SvelteKit serializes it (only serializable properties survive)
    editorState: new EditorState(documentData)
  };
};
```

### The SSR Serialization Gotcha

Be careful with this pattern — during SSR, the data must still be serializable because it is embedded in the HTML for hydration. Non-serializable values only work fully on client-side navigations:

```typescript
// WRONG — function cannot be serialized during SSR
export const load: PageLoad = async () => {
  return {
    format: (date: Date) => date.toLocaleDateString()
    // During SSR, this function is lost in serialization
    // data.format will be undefined on first page load
  };
};

// CORRECT — conditionally return non-serializable data
import { browser } from '$app/environment';

export const load: PageLoad = async ({ fetch }) => {
  const rawData = await fetch('/api/data').then(r => r.json());

  return {
    rawData,
    // Only return the class instance during client-side nav
    ...(browser ? { processor: new DataProcessor(rawData) } : {})
  };
};
```

## Type Safety with PageData

SvelteKit generates types automatically. The `PageData` type reflects the merged result of all load functions for a given route:

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

// PageLoad is typed to know:
// - params has a 'slug' property (from the route)
// - data contains the server load return type (if +page.server.ts exists)
export const load: PageLoad = async ({ params, data, fetch }) => {
  // params.slug is typed as string
  // data is typed based on what +page.server.ts returns

  return {
    ...data,
    relatedPosts: await fetch(`/api/related/${params.slug}`).then(r => r.json())
  };
};
```

In the page component, the `data` prop is automatically typed with the union of all load function return types:

```svelte
<script lang="ts">
  // data is fully typed — your editor knows every property
  let { data } = $props();
  // data.post — from server load
  // data.relatedPosts — from universal load
</script>
```

### Typing Gotcha: `satisfies` vs Type Annotation

```typescript
// WRONG — type annotation narrows the return type for consumers
export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/data');
  const data: ApiResponse = await response.json();
  return { data };
  // The inferred PageData type knows 'data' is ApiResponse
};

// ALSO WRONG — returning 'any' loses type safety for the page
export const load: PageLoad = async ({ fetch }) => {
  const data = await fetch('/api/data').then(r => r.json());
  // data is 'any' — PageData inherits 'any', no autocomplete in the page
  return { data };
};

// CORRECT — type the response, let SvelteKit infer the rest
export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/data');
  const data: ApiResponse = await response.json();
  return { data };
  // SvelteKit infers PageData = { data: ApiResponse }
  // The page component gets full autocomplete
};
```

## Error Handling in Universal Load

Universal load functions use the same `error` and `redirect` helpers as server load:

```typescript
import type { PageLoad } from './$types';
import { error, redirect } from '@sveltejs/kit';

export const load: PageLoad = async ({ fetch, url }) => {
  const response = await fetch('https://api.example.com/data');

  if (response.status === 401) {
    // Redirect to login with a return URL
    redirect(302, `/login?returnTo=${url.pathname}`);
  }

  if (!response.ok) {
    // Throw an error that renders the nearest +error.svelte
    error(response.status, {
      message: 'Failed to load data',
      details: await response.text()
    });
  }

  return { data: await response.json() };
};
```

### Handling Network Failures Gracefully

During client-side navigation, the browser might be offline or the API might be down. Handle fetch failures explicitly:

```typescript
export const load: PageLoad = async ({ fetch }) => {
  try {
    const response = await fetch('https://api.example.com/data');
    if (!response.ok) {
      error(response.status, 'API error');
    }
    return { data: await response.json() };
  } catch (err) {
    // Network failure — fetch itself threw
    error(503, 'Unable to reach the API. Check your connection.');
  }
};
```

## Try It

### Exercise 1: Public API Integration
Create a `/projects` page with a universal load function that fetches repositories from the GitHub API (`https://api.github.com/users/sveltejs/repos`). Display the repo name, description, star count, and language. Add sorting via `?sort=stars` or `?sort=updated` query parameters. Navigate between sorting options using `<a>` tags with query strings and verify the load function re-runs.

### Exercise 2: Server + Universal Combination
Create a product page at `/products/[id]`. Use `+page.server.ts` to fetch the product from a database (use a mock object). Use `+page.ts` to fetch reviews from a public API (use a mock fetch). Merge both data sources and display them in the page component. Verify type safety — your editor should autocomplete `data.product` and `data.reviews`.

### Exercise 3: Layout Data Sharing
Create a `+layout.ts` at the root that fetches site configuration (title, navigation items). Verify that all child pages can access the layout data through their `data` prop. Navigate between pages and confirm that the layout load does not re-run (check the network tab).

### Exercise 4: Search with URL Parameters
Build a search page at `/search` that reads `q`, `page`, and `sort` from `url.searchParams`. Use a universal load function to fetch results from a mock API. Show how changing query parameters triggers the load function to re-run with updated data. Add a "Refresh" button that calls `invalidate('app:search')` and confirm it re-runs the load.

### Exercise 5: Error Handling
Create a `/profile/[username]` page with a universal load function. Return a 404 error for unknown usernames and a 302 redirect for deprecated usernames. Verify that the error page renders correctly and the redirect works.

## Key Takeaways

- `+page.ts` creates universal load functions that run on the server during SSR and in the browser on client-side navigations
- Universal load functions execute faster on client navigations because they skip the server round trip — use them for public APIs
- Use universal load for public APIs and shared logic; use server load for private data, secrets, and databases
- The SvelteKit `fetch` handles relative URLs during SSR, forwards cookies, deduplicates requests, calls same-origin API routes internally, and tracks URL dependencies for invalidation — always use the provided `fetch`, not the global one
- Layout load functions in `+layout.ts` share data with all child pages and only re-run when their dependencies change
- Combine `+page.server.ts` and `+page.ts` to mix server-only data access with client-side data enrichment — the server data passes through the `data` property
- Universal load functions must work in both Node.js and browser environments — avoid environment-specific APIs without guards from `$app/environment`
- Non-serializable return values (class instances, functions) only work during client-side navigation — during SSR, data must be serializable
- Use `depends('app:key')` and `invalidate('app:key')` for manual re-run control — prefer specific invalidation over `invalidateAll()`
- Type safety is automatic through the `$types` import — type your API responses and let SvelteKit infer `PageData`
- Handle network failures explicitly in universal load — during client-side navigation, the browser might be offline
- Avoid the "proxy problem" — do not route public API calls through your server when the client can fetch directly
