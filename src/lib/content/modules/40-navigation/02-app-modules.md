# App Modules

SvelteKit provides several built-in modules under the `$app/` namespace that give you access to runtime information about the current page, the navigation state, the environment, and the app's paths. These modules are the glue between your components and the framework — they tell you where the user is, whether JavaScript is available, and how to build correct URLs.

This lesson covers the three most important app modules: `$app/stores`, `$app/environment`, and `$app/paths`.

## $app/stores — page

The `page` store contains everything about the current page. It is the single most useful store in SvelteKit:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
</script>

<p>Current URL: {$page.url.pathname}</p>
<p>Route ID: {$page.route.id}</p>
<p>Status: {$page.status}</p>
```

The `page` store includes these properties:

- **`url`** — the current `URL` object (pathname, search params, hash)
- **`params`** — the dynamic route parameters (e.g., `{ slug: 'hello' }`)
- **`route`** — the route metadata including `id` (e.g., `/blog/[slug]`)
- **`status`** — the HTTP status code (200, 404, etc.)
- **`error`** — the error object if the page is an error page
- **`data`** — the merged data from all load functions (page + layout)
- **`state`** — the state object from `pushState` or `replaceState`
- **`form`** — the data returned from a form action submission

A practical example using several properties at once:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
</script>

<nav>
  <a href="/" class:active={$page.url.pathname === '/'}>Home</a>
  <a href="/blog" class:active={$page.url.pathname.startsWith('/blog')}>Blog</a>
</nav>

{#if $page.params.slug}
  <p>Reading: {$page.params.slug}</p>
{/if}

{#if $page.url.searchParams.has('q')}
  <p>Searching for: {$page.url.searchParams.get('q')}</p>
{/if}
```

## $app/stores — navigating

The `navigating` store is `null` when idle and populated during an active navigation. Use it to build loading indicators:

```svelte
<script lang="ts">
  import { navigating } from '$app/stores';
</script>

{#if $navigating}
  <div class="loading-bar">
    <p>Loading {$navigating.to?.url.pathname}...</p>
  </div>
{/if}
```

The navigating object contains `from`, `to`, `type` (link, goto, popstate), `willUnload`, and `complete` (a promise that resolves when navigation finishes).

## $app/stores — updated

The `updated` store tells you when a new version of your app has been deployed. This is useful for prompting users to reload:

```svelte
<script lang="ts">
  import { updated } from '$app/stores';
</script>

{#if $updated}
  <div class="update-banner">
    A new version is available.
    <button onclick={() => location.reload()}>Reload</button>
  </div>
{/if}
```

You can also call `updated.check()` manually — for instance, on a timer or after returning from a background tab — to poll for new deployments. Version detection requires `version.pollInterval` to be set in your SvelteKit config.

## $app/environment — browser

The `browser` constant is `true` when code runs in the browser and `false` during SSR. This is essential for guarding DOM access and browser-only APIs:

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  let windowWidth = $state(0);

  $effect(() => {
    if (browser) {
      windowWidth = window.innerWidth;
    }
  });
</script>

{#if browser}
  <p>Window width: {windowWidth}px</p>
{:else}
  <p>Measuring window...</p>
{/if}
```

Without this check, accessing `window` during SSR would throw an error.

## $app/environment — dev, building, version

Three additional exports cover the rest of your environment needs:

```typescript
import { dev, building, version } from '$app/environment';

if (dev) {
  console.log('Running in development mode');
}

if (building) {
  // Code is executing during the build step (prerendering, etc.)
}

console.log(`App version: ${version}`);
```

`dev` is true when running `vite dev`. `building` is true during `vite build`. `version` is the string from `config.kit.version.name` — useful for cache busting and deployment tracking.

## $app/paths — base and assets

If your app is not served from the root of a domain (e.g., it lives at `example.com/my-app`), you need `base` to build correct links:

```svelte
<script lang="ts">
  import { base, assets } from '$app/paths';
</script>

<nav>
  <a href="{base}/">Home</a>
  <a href="{base}/about">About</a>
</nav>

<img src="{assets}/images/logo.png" alt="Logo" />
```

`base` is the base path configured in `svelte.config.js` (e.g., `/my-app`). `assets` is the path to your static assets, which can point to a CDN in production.

## $app/paths — resolveRoute

`resolveRoute` generates type-safe URLs from route IDs and parameters. This prevents broken links when route structures change:

```typescript
import { resolveRoute } from '$app/paths';

// Type-safe URL generation
const blogUrl = resolveRoute('/blog/[slug]', { slug: 'hello-world' });
// Result: "/blog/hello-world"

const productUrl = resolveRoute('/shop/[category]/[id]', {
  category: 'electronics',
  id: '42'
});
// Result: "/shop/electronics/42"
```

If you rename a route parameter, TypeScript will flag every `resolveRoute` call that needs updating.

## Try It

Build a layout component that includes: a navigation bar with active link styling using `$page`, a global loading indicator using `$navigating`, and an update banner using `$updated`. Guard any browser-only code with the `browser` check from `$app/environment`. Use `base` from `$app/paths` in all your link `href` values so the app works when deployed to a subpath.

## Key Takeaways

- The `page` store provides the current URL, params, route, status, error, data, state, and form data
- The `navigating` store is non-null during active navigations — use it for loading indicators
- The `updated` store detects new app deployments and supports manual polling with `check()`
- `browser` from `$app/environment` guards code that must not run during SSR
- `dev`, `building`, and `version` help you adapt behavior across environments
- `base` and `assets` from `$app/paths` ensure correct URLs when your app is deployed to a subpath or uses a CDN
- `resolveRoute` generates type-safe URLs from route IDs and parameter objects
