# Advanced Routing

SvelteKit's file-based router handles far more than simple pages. You can control whether pages render on the server or client, stream slow data while showing the rest of the page instantly, validate route parameters with custom matchers, create dedicated error pages, and fine-tune how links behave. These advanced routing features let you optimize every page for its specific needs.

## Page Options

Every `+page.ts`, `+page.server.ts`, or `+layout.ts` file can export constants that control how SvelteKit handles that route:

```typescript
// src/routes/dashboard/+page.ts

// Disable server-side rendering (client-only page)
export const ssr = false;

// Enable client-side rendering (default is true)
export const csr = true;

// Prerender this page at build time
export const prerender = true;

// Control trailing slashes: 'never', 'always', or 'ignore'
export const trailingSlash = 'always';
```

Set `ssr = false` for pages that depend heavily on browser APIs like `canvas` or `localStorage`. Set `prerender = true` for static pages like marketing content or documentation. When set in a layout file, these options apply to every child page.

## Custom Error Pages

When something goes wrong, SvelteKit renders the nearest `+error.svelte` file. You can create error pages at different levels for tailored error experiences:

```svelte
<!-- src/routes/+error.svelte (root error page) -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<h1>{$page.status}</h1>
<p>{$page.error?.message}</p>
<a href="/">Go home</a>
```

Nest error pages for specific sections of your app:

```svelte
<!-- src/routes/admin/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="admin-error">
  <h1>Admin Error {$page.status}</h1>
  <p>{$page.error?.message}</p>
  <a href="/admin">Back to admin dashboard</a>
</div>
```

SvelteKit walks up the route tree to find the closest `+error.svelte`. An error in `/admin/users/123` first looks for `/admin/users/+error.svelte`, then `/admin/+error.svelte`, then the root `/+error.svelte`.

## Link Options

SvelteKit provides `data-sveltekit-*` attributes to control how individual links (or groups of links) behave:

```svelte
<!-- Preload data when hovering (default) -->
<a href="/products" data-sveltekit-preload-data="hover">Products</a>

<!-- Preload code only (not data) on hover -->
<a href="/about" data-sveltekit-preload-code="hover">About</a>

<!-- Force a full page reload instead of client-side navigation -->
<a href="/legacy-page" data-sveltekit-reload>Legacy Page</a>

<!-- Prevent scroll reset after navigation -->
<a href="/tabs/settings" data-sveltekit-noscroll>Settings</a>

<!-- Keep the current element focused after navigation -->
<a href="/search?page=2" data-sveltekit-keepfocus>Next Page</a>
```

Apply these to a container element to affect all links inside it:

```svelte
<nav data-sveltekit-preload-data="hover">
  <a href="/">Home</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact</a>
</nav>
```

## Streaming with Promises

When a load function returns an unresolved promise, SvelteKit streams the page. The shell renders immediately while the slow data loads in the background:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Fast data — returned immediately
  const user = await getUser();

  // Slow data — returned as a promise (NOT awaited)
  const analytics = getAnalytics(); // no await!

  return {
    user,
    analytics
  };
};
```

In the component, use `{#await}` to show a loading state for the streamed data:

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Welcome, {data.user.name}</h1>

{#await data.analytics}
  <p>Loading analytics...</p>
{:then analytics}
  <p>Page views: {analytics.views}</p>
  <p>Visitors: {analytics.visitors}</p>
{:catch error}
  <p>Failed to load analytics: {error.message}</p>
{/await}
```

The user sees the greeting immediately while the analytics section shows a loading state. This pattern dramatically improves perceived performance.

## Route Matchers

Route matchers validate dynamic parameters before the route is matched. Create a matcher file in `src/params/`:

```typescript
// src/params/integer.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^\d+$/.test(param);
};
```

Reference the matcher in your route directory name using the `=matcher` syntax:

```
src/routes/products/[id=integer]/+page.svelte
```

Now `/products/42` matches, but `/products/abc` does not — SvelteKit will continue looking for other routes or fall through to a 404. This keeps your load functions clean by guaranteeing valid parameter formats.

## Rest and Optional Parameters

Rest parameters capture multiple path segments. They use the `[...rest]` syntax:

```
src/routes/docs/[...path]/+page.svelte
```

This matches `/docs/getting-started`, `/docs/api/routing`, and `/docs/api/routing/advanced`. The `path` parameter contains the full remaining path as a string:

```typescript
// src/routes/docs/[...path]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // params.path = "api/routing/advanced"
  const segments = params.path.split('/');
  return { segments };
};
```

Optional parameters use double brackets `[[param]]` and match routes with or without that segment:

```
src/routes/[[lang]]/about/+page.svelte
```

This matches both `/about` and `/en/about`. When the segment is missing, the parameter is `undefined`.

## Try It

Create a product catalog with these advanced routing features: a route matcher at `src/params/integer.ts` that validates product IDs, a `/products/[id=integer]` route that uses it, a custom `+error.svelte` inside the products directory, and a dashboard page that streams slow analytics data alongside fast user data using `{#await}`. Add `data-sveltekit-preload-data="hover"` to your product listing links.

## Key Takeaways

- Page options (`ssr`, `csr`, `prerender`, `trailingSlash`) control rendering behavior per route or layout
- `+error.svelte` files provide custom error pages — SvelteKit uses the nearest one in the route tree
- Link options like `data-sveltekit-preload-data` and `data-sveltekit-reload` fine-tune navigation behavior
- Returning unresolved promises from load functions enables streaming — the page renders instantly while slow data loads
- Route matchers in `src/params/` validate dynamic segments before matching, preventing invalid data from reaching load functions
- Rest parameters `[...rest]` capture multiple path segments; optional parameters `[[param]]` make segments optional
