# App Modules

SvelteKit provides several built-in modules under the `$app/` namespace that give you access to runtime information about the current page, the navigation state, the environment, and the app's paths. These modules are the glue between your components and the framework — they tell you where the user is, whether JavaScript is available, how to build correct URLs, and how to interact with forms. Understanding every module at a deep level is essential because they define the boundaries between server and client, between build time and runtime, and between safe-to-expose and private.

This lesson is a complete reference for all `$app/*` modules: `$app/state`, `$app/navigation`, `$app/environment`, `$app/paths`, `$app/forms`, and `$app/server`.

## $app/state

The `$app/state` module provides three reactive objects: `page`, `navigating`, and `updated`. These use Svelte 5's fine-grained reactivity (`$state` under the hood), so they update automatically and trigger minimal re-renders.

### page

The `page` object contains everything about the current page. It is the single most important piece of runtime data in SvelteKit:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<p>Current URL: {page.url.pathname}</p>
<p>Route ID: {page.route.id}</p>
<p>Status: {page.status}</p>
```

Here is every property and its purpose:

- **`url`** — a `URL` object for the current page. Access `pathname`, `searchParams`, `hash`, `origin`, etc. During SSR, this is the URL of the incoming request.
- **`params`** — the dynamic route parameters. For `/blog/[slug]`, this is `{ slug: 'hello-world' }`. For `/shop/[category]/[id]`, this is `{ category: 'electronics', id: '42' }`.
- **`route`** — route metadata. `route.id` is the route pattern (e.g., `/blog/[slug]`). This is `null` for error pages that do not correspond to a specific route.
- **`status`** — the HTTP status code. `200` on normal pages, `404`/`500`/etc. on error pages.
- **`error`** — the error object on error pages, `null` otherwise. The shape depends on what your `handleError` hook returns.
- **`data`** — the merged data from all load functions in the route hierarchy (page + all parent layouts). You rarely access this directly in page components (use `$props()` instead), but it is essential for shared components.
- **`state`** — the state object from `pushState()` or `replaceState()`. Enables shallow routing.
- **`form`** — the return value from a form action after submission. `null` unless a form action just returned or failed.

A practical example using multiple properties:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let isAdminSection = $derived(page.url.pathname.startsWith('/admin'));
  let searchTerm = $derived(page.url.searchParams.get('q') ?? '');
</script>

<nav>
  <a href="/" class:active={page.url.pathname === '/'}>Home</a>
  <a href="/blog" class:active={page.url.pathname.startsWith('/blog')}>Blog</a>
  <a href="/admin" class:active={isAdminSection}>Admin</a>
</nav>

{#if page.params.slug}
  <p>Reading article: {page.params.slug}</p>
{/if}

{#if searchTerm}
  <p>Searching for: {searchTerm}</p>
{/if}

{#if page.form?.error}
  <p class="error">{page.form.error}</p>
{/if}
```

### navigating

The `navigating` object is `null` when idle and populated during active navigation. Use it to build loading indicators:

```svelte
<script lang="ts">
  import { navigating } from '$app/state';
</script>

{#if navigating}
  <div class="loading-bar" role="progressbar">
    <p>Loading {navigating.to?.url.pathname}...</p>
  </div>
{/if}
```

The navigating object contains:

- **`from`** — the page being left (`{ url, params, route }`)
- **`to`** — the destination page
- **`type`** — `'link'`, `'goto'`, `'popstate'`, or `'form'`
- **`willUnload`** — `true` when navigating to an external URL
- **`complete`** — a `Promise<void>` that resolves when navigation finishes
- **`delta`** — for `popstate` navigations, how many history entries were traversed

A production pattern — show the loading bar only for slow navigations to avoid flickering:

```svelte
<script lang="ts">
  import { navigating } from '$app/state';

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout>;

  $effect(() => {
    clearTimeout(timer);
    if (navigating) {
      // Delay showing the bar by 150ms — most navigations are faster
      timer = setTimeout(() => { visible = true; }, 150);
      navigating.complete.then(() => {
        clearTimeout(timer);
        // Brief delay before hiding so the bar does not vanish instantly
        setTimeout(() => { visible = false; }, 200);
      });
    } else {
      visible = false;
    }
  });
</script>

{#if visible}
  <div class="navigation-bar" aria-live="polite">
    <div class="bar-inner"></div>
  </div>
{/if}

<style>
  .navigation-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 9999;
  }
  .bar-inner {
    height: 100%;
    background: #3b82f6;
    animation: progress 2s ease-in-out infinite;
  }
  @keyframes progress {
    0% { width: 0%; }
    50% { width: 70%; }
    100% { width: 100%; }
  }
</style>
```

### updated

The `updated` object detects when a new version of your app has been deployed. It exposes `current` (a boolean) and `check()` (a method that polls the server):

```svelte
<script lang="ts">
  import { updated } from '$app/state';
</script>

{#if updated.current}
  <div class="update-banner" role="alert">
    A new version is available.
    <button onclick={() => location.reload()}>Reload</button>
  </div>
{/if}
```

Version detection requires configuration in `svelte.config.js`:

```javascript
const config = {
  kit: {
    version: {
      name: Date.now().toString(), // Unique per build
      pollInterval: 60000           // Check every 60 seconds
    }
  }
};
```

You can also call `updated.check()` manually, for instance when the user returns from a background tab:

```svelte
<script lang="ts">
  import { updated } from '$app/state';
  import { browser } from '$app/environment';

  if (browser) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updated.check();
      }
    });
  }
</script>
```

This pattern is important for long-lived tabs — a user who has not refreshed in hours could be running stale code. Checking on tab focus ensures they see the update prompt promptly.

## $app/navigation

The `$app/navigation` module provides functions for programmatic navigation, navigation lifecycle hooks, URL manipulation, data invalidation, and preloading. These functions only work in the browser — they run inside components, actions, or event handlers, never in server load functions.

### goto(url, opts?)

Navigates to a URL programmatically. Returns a promise that resolves when navigation completes:

```typescript
import { goto } from '$app/navigation';

// Basic navigation
await goto('/dashboard');

// Replace history entry (back button skips this page)
await goto('/order-confirmation', { replaceState: true });

// Keep scroll position and focus
await goto('/search?q=svelte', { noScroll: true, keepFocus: true });

// Force all load functions to re-run
await goto('/dashboard', { invalidateAll: true });

// Attach state to the history entry
await goto('/products/42', {
  state: { fromList: true, scrollPosition: window.scrollY }
});
```

Full options reference:

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `replaceState` | `boolean` | `false` | Replace current history entry |
| `noScroll` | `boolean` | `false` | Do not scroll to top |
| `keepFocus` | `boolean` | `false` | Keep focus on current element |
| `invalidateAll` | `boolean` | `false` | Re-run all load functions |
| `state` | `App.PageState` | `{}` | Data attached to history entry |

### invalidate(url | key | fn) and invalidateAll()

Re-run load functions without navigating. `invalidate` targets specific load functions; `invalidateAll` re-runs every load function on the current page:

```svelte
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  async function handleDelete(id: string) {
    await fetch(`/api/items/${id}`, { method: 'DELETE' });

    // Re-run load functions that fetched from matching URLs
    invalidate('/api/items');
  }

  async function handleBulkUpdate() {
    await fetch('/api/bulk-update', { method: 'POST' });

    // Re-run ALL load functions (page + layouts)
    invalidateAll();
  }
</script>
```

`invalidate` supports three argument types:

```typescript
// 1. URL string — matches load functions that fetched this URL
invalidate('/api/notifications');

// 2. Custom key — matches load functions that called depends('app:notifications')
invalidate('app:notifications');

// 3. Function — matches by URL predicate
invalidate((url) => url.pathname.startsWith('/api/'));
```

In your load function, declare custom dependencies with `depends()`:

```typescript
// +page.server.ts
export const load = async ({ depends, fetch }) => {
  depends('app:user-profile');
  const user = await fetch('/api/user').then(r => r.json());
  return { user };
};
```

Now `invalidate('app:user-profile')` from anywhere in the app re-runs this load function.

### beforeNavigate, afterNavigate, onNavigate

These lifecycle hooks are covered in depth in the previous lesson. A quick reference:

```typescript
import { beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';

// Before navigation — cancel or redirect
beforeNavigate(({ cancel, to, from, type, willUnload }) => {
  if (hasUnsavedChanges && !willUnload) {
    if (!confirm('Discard changes?')) cancel();
  }
});

// After navigation — analytics, cleanup
afterNavigate(({ from, to, type }) => {
  analytics.track('pageview', { path: to?.url.pathname });
});

// During navigation — View Transitions API integration
onNavigate((navigation) => {
  if (!document.startViewTransition) return;
  return new Promise((resolve) => {
    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });
  });
});
```

### pushState(url, state) and replaceState(url, state)

Update the URL without running load functions. Used for shallow routing (modals, tabs, filters):

```typescript
import { pushState, replaceState } from '$app/navigation';

// Add new history entry with state
pushState('/photos/42', { selectedPhoto: photoData });

// Replace current entry (no new history step)
replaceState('?tab=settings', { activeTab: 'settings' });
```

### preloadData(href) and preloadCode(href)

Warm the cache for likely navigations:

```typescript
import { preloadData, preloadCode } from '$app/navigation';

// Preload both code AND data — use when navigation is very likely
const result = await preloadData('/dashboard');
// result.type is 'loaded' or 'redirect'

// Preload only the JavaScript module — cheaper, for "maybe" navigations
await preloadCode('/settings');
```

## $app/environment

The `$app/environment` module exports four constants that describe the runtime context. These are essential for writing code that behaves correctly across server, client, development, and production.

### browser

`true` when running in the browser, `false` during SSR. This is the most commonly used check in SvelteKit applications:

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  let windowWidth = $state(0);

  $effect(() => {
    if (browser) {
      const handleResize = () => { windowWidth = window.innerWidth; };
      handleResize();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  });
</script>

{#if browser}
  <p>Window width: {windowWidth}px</p>
{:else}
  <p>Measuring window...</p>
{/if}
```

Without the `browser` check, accessing `window` during SSR throws a `ReferenceError`. Common use cases:

- Accessing `window`, `document`, `navigator`, `localStorage`, `sessionStorage`
- Initializing browser-only libraries (charts, maps, editors)
- Setting up event listeners
- Checking media queries

**Performance note**: Prefer using `browser` checks inside `$effect` rather than in top-level `<script>` blocks. Effects only run in the browser, so they naturally guard against SSR issues. But `browser` is still needed for conditional rendering in templates and for top-level code that sets initial state.

### dev

`true` when running `vite dev`, `false` in production. Use for development-only logging, debug panels, and mock data:

```typescript
import { dev } from '$app/environment';

if (dev) {
  console.log('Debug: load function called with', params);
}

// Enable detailed error messages in dev
export function formatError(error: unknown): string {
  if (dev && error instanceof Error) {
    return `${error.message}\n\n${error.stack}`;
  }
  return 'Something went wrong. Please try again.';
}
```

```svelte
<script lang="ts">
  import { dev } from '$app/environment';
  import { page } from '$app/state';
</script>

{#if dev}
  <div class="debug-panel">
    <details>
      <summary>Debug Info</summary>
      <pre>{JSON.stringify(page.data, null, 2)}</pre>
      <p>Route: {page.route.id}</p>
      <p>Status: {page.status}</p>
    </details>
  </div>
{/if}
```

The `dev` constant is statically replaced at build time, so the debug panel code is completely tree-shaken from production builds.

### building

`true` during `vite build` — specifically, when SvelteKit is prerendering pages or running build-time code. This is rarely used, but essential when you need to skip logic that should not run during the build step:

```typescript
import { building } from '$app/environment';

// Skip database connection during prerendering
if (!building) {
  await db.connect();
}

// Use mock data during prerender
export const load = async () => {
  if (building) {
    return { products: getMockProducts() };
  }
  return { products: await db.query('SELECT * FROM products') };
};
```

### version

A string from `config.kit.version.name`. Useful for cache busting, deployment tracking, and the `updated` store:

```typescript
import { version } from '$app/environment';

// Include in error reports
reportError({ version, error: e });

// Cache busting for API calls
fetch(`/api/data?v=${version}`);
```

```svelte
<script lang="ts">
  import { version } from '$app/environment';
</script>

<footer>
  <small>Version: {version}</small>
</footer>
```

## $app/forms

The `$app/forms` module provides three functions for working with SvelteKit form actions on the client side.

### enhance

The `enhance` function progressively enhances a form to use client-side submission instead of a full page reload. Import it and apply it as a Svelte action:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
</script>

<form method="POST" action="?/login" use:enhance>
  <input name="email" type="email" required />
  <input name="password" type="password" required />
  <button>Log in</button>
</form>
```

With `use:enhance`, the form submits via `fetch` instead of a full page navigation. SvelteKit automatically:

1. Calls the form action via `fetch`
2. Updates `$page.form` with the returned data
3. Invalidates all load functions (calls `invalidateAll()`)
4. Handles redirects
5. Handles errors by rendering the nearest `+error.svelte`

You can customize the behavior by providing a callback:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let submitting = $state(false);
</script>

<form
  method="POST"
  action="?/save"
  use:enhance={() => {
    submitting = true;

    return async ({ result, update }) => {
      submitting = false;

      if (result.type === 'success') {
        showToast('Saved successfully!');
      }

      // Call update() to apply the default behavior
      // Pass { reset: false } to keep form values after submission
      await update({ reset: false });
    };
  }}
>
  <textarea name="content"></textarea>
  <button disabled={submitting}>
    {submitting ? 'Saving...' : 'Save'}
  </button>
</form>
```

The callback you pass to `enhance` is called when the form is submitted. It receives an object with `formElement`, `formData`, `action`, `cancel`, and `submitter`. It should return an async function that handles the result.

The result callback receives `{ result, update }` where `result` is an `ActionResult` — one of `{ type: 'success', data }`, `{ type: 'failure', data }`, `{ type: 'redirect', location }`, or `{ type: 'error', error }`.

### deserialize

Converts a serialized `ActionResult` from a `fetch` response back into a typed object. Use this when you call form actions manually (not through `use:enhance`):

```typescript
import { deserialize } from '$app/forms';

async function submitManually(formData: FormData) {
  const response = await fetch('?/save', {
    method: 'POST',
    body: formData
  });

  const result = deserialize(await response.text());

  if (result.type === 'success') {
    console.log('Saved:', result.data);
  } else if (result.type === 'redirect') {
    goto(result.location);
  } else if (result.type === 'failure') {
    console.error('Validation error:', result.data);
  }
}
```

### applyAction

Applies an `ActionResult` to the page — updating `$page.form`, `$page.status`, etc. This is what `use:enhance` calls internally:

```typescript
import { applyAction, deserialize } from '$app/forms';
import { invalidateAll } from '$app/navigation';

async function handleCustomSubmit(formData: FormData) {
  const response = await fetch('?/save', {
    method: 'POST',
    body: formData
  });

  const result = deserialize(await response.text());

  if (result.type === 'success') {
    // Re-run load functions before updating the page
    await invalidateAll();
  }

  // Apply the result to the page (updates $page.form, etc.)
  await applyAction(result);
}
```

This is useful when you need full control over the submission lifecycle — for example, running animations between the server response and the page update.

## $app/paths

The `$app/paths` module handles URL construction for apps deployed to subpaths or using CDNs.

### base

The base path configured in `svelte.config.js`. If your app is deployed at `example.com/my-app`, `base` is `/my-app`. Use it in all link `href` values:

```svelte
<script lang="ts">
  import { base } from '$app/paths';
</script>

<nav>
  <a href="{base}/">Home</a>
  <a href="{base}/about">About</a>
  <a href="{base}/blog">Blog</a>
</nav>
```

Without `base`, your links would break when the app is deployed to a subpath. The `base` value is an empty string when the app is at the root domain.

**Important**: Always use `{base}/path`, not `{base}path`. The `base` value does not include a trailing slash.

### assets

The path to static assets. This can be the same as `base` or point to a CDN:

```svelte
<script lang="ts">
  import { assets } from '$app/paths';
</script>

<img src="{assets}/images/logo.png" alt="Logo" />
<link rel="icon" href="{assets}/favicon.ico" />
```

Configure the assets path in `svelte.config.js`:

```javascript
const config = {
  kit: {
    paths: {
      base: '/my-app',
      assets: 'https://cdn.example.com/my-app' // Serve statics from CDN
    }
  }
};
```

### resolveRoute

Generates type-safe URLs from route IDs and parameters. This prevents broken links when route structures change:

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

// Works with rest parameters
const docsUrl = resolveRoute('/docs/[...path]', { path: 'api/routing' });
// Result: "/docs/api/routing"
```

If you rename a route parameter, TypeScript flags every `resolveRoute` call that needs updating. This is much safer than string concatenation:

```typescript
// Bad — breaks silently if route changes
const url = `/blog/${slug}`;

// Good — TypeScript catches route mismatches
const url = resolveRoute('/blog/[slug]', { slug });
```

## $app/server

The `$app/server` module provides server-only utilities. It is only available in server-side code (`+server.ts`, `+page.server.ts`, `+layout.server.ts`, `hooks.server.ts`).

### read

The `read` function reads a file that was imported with `?url` or from the `static` directory. This is useful for serving files with custom headers or processing them before sending:

```typescript
// src/routes/resume/+server.ts
import { read } from '$app/server';
import resume from '$lib/assets/resume.pdf?url';

export async function GET() {
  const file = await read(resume);

  return new Response(file.body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="resume.pdf"'
    }
  });
}
```

The `read` function returns a `Response` object, so you can access its `body`, `arrayBuffer()`, `text()`, etc. This is primarily useful in adapter environments that do not have filesystem access (like Cloudflare Workers).

## Module Usage Patterns

### Combining Modules for a Complete Layout

Here is a layout component that uses every module effectively:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { page, navigating, updated } from '$app/state';
  import { afterNavigate, onNavigate } from '$app/navigation';
  import { browser, dev, version } from '$app/environment';
  import { base } from '$app/paths';

  let { children } = $props();
  let mobileMenuOpen = $state(false);

  // View transitions
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // Close mobile menu on navigation
  afterNavigate(() => {
    mobileMenuOpen = false;
  });

  // Check for updates when returning to tab
  if (browser) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updated.check();
      }
    });
  }
</script>

{#if updated.current}
  <div class="update-banner" role="alert">
    A new version is available.
    <button onclick={() => location.reload()}>Update</button>
  </div>
{/if}

{#if navigating}
  <div class="loading-bar"></div>
{/if}

<header>
  <nav>
    <a href="{base}/" class:active={page.url.pathname === '/'}>Home</a>
    <a href="{base}/docs" class:active={page.url.pathname.startsWith('/docs')}>Docs</a>
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer>
  <small>v{version}</small>
</footer>

{#if dev}
  <aside class="debug">
    <pre>Route: {page.route.id}</pre>
    <pre>Params: {JSON.stringify(page.params)}</pre>
  </aside>
{/if}
```

### Using $app/forms for Optimistic Updates

Combine `enhance` with local state for instant UI feedback:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  let optimisticTodos = $state(data.todos);
  let pendingIds = $state<Set<string>>(new Set());

  // Sync with server data when it changes
  $effect(() => {
    optimisticTodos = data.todos;
  });
</script>

{#each optimisticTodos as todo}
  <form
    method="POST"
    action="?/toggleTodo"
    use:enhance={() => {
      // Optimistic update — toggle immediately
      const index = optimisticTodos.findIndex(t => t.id === todo.id);
      optimisticTodos[index] = {
        ...optimisticTodos[index],
        done: !optimisticTodos[index].done
      };
      pendingIds.add(todo.id);

      return async ({ update }) => {
        pendingIds.delete(todo.id);
        await update({ reset: false });
      };
    }}
  >
    <input type="hidden" name="id" value={todo.id} />
    <label class:pending={pendingIds.has(todo.id)}>
      <input type="checkbox" checked={todo.done} />
      {todo.text}
    </label>
    <button>Toggle</button>
  </form>
{/each}
```

## Try It

Build a complete layout component that includes:

1. A navigation bar with active link styling using `page` from `$app/state`. Use `base` from `$app/paths` in all `href` values.
2. A global loading indicator using `navigating` that only appears for navigations taking longer than 200ms.
3. An update banner using `updated` that checks for new versions when the tab regains focus.
4. A debug panel (visible only in development using `dev`) that shows the current route ID, params, and status.
5. A form with `use:enhance` that performs an optimistic update and shows a submitting state.
6. Guard any browser-only code with the `browser` check from `$app/environment`.
7. Use `resolveRoute` from `$app/paths` to generate at least one type-safe URL.

## Key Takeaways

- `$app/state` provides `page` (current URL, params, route, data, form, state), `navigating` (active navigation info), and `updated` (new deployment detection) as reactive Svelte 5 state objects
- `$app/navigation` provides `goto`, `invalidate`, `invalidateAll`, `beforeNavigate`, `afterNavigate`, `onNavigate`, `pushState`, `replaceState`, `preloadData`, and `preloadCode`
- `$app/environment` exports `browser` (SSR guard), `dev` (development mode), `building` (build step), and `version` (app version string) — all statically replaced at build time for tree-shaking
- `$app/forms` provides `enhance` (progressive form enhancement), `deserialize` (parse action responses), and `applyAction` (apply results to page state)
- `$app/paths` provides `base` (subpath prefix), `assets` (static file path / CDN), and `resolveRoute` (type-safe URL generation)
- `$app/server` provides `read` for accessing imported files in server-side code
- `updated.check()` can be called on tab focus via `visibilitychange` to detect stale deployments
- `enhance` callbacks receive the form submission context and should return an async function to handle the `ActionResult`
- `resolveRoute` catches broken links at compile time when route structures change — always prefer it over string concatenation
