# App Navigation

SvelteKit intercepts link clicks and performs client-side navigation automatically, but real applications need far more control than automatic link interception. You might need to navigate after a form submission, warn users about unsaved changes, track page views for analytics, animate transitions between pages, open a modal with a shareable URL, or refresh server data without reloading the entire page. The `$app/navigation` module provides functions for all of these scenarios, and the `$app/state` module gives you reactive access to the current page, navigation status, and app version.

Understanding SvelteKit's navigation system at a deep level is essential because it bridges two worlds: the server-rendered first load and the client-side SPA-like experience afterward. Every architectural decision you make about routing, data loading, and user experience flows through this system.

## How SvelteKit Navigation Works

Before touching any API, you need a mental model of what happens when a user clicks a link in a SvelteKit app.

On the first page load, the server renders the HTML, sends it to the browser, and SvelteKit hydrates the page. From that point forward, SvelteKit intercepts every click on an `<a>` element that points to an internal route. Instead of a full page reload, SvelteKit fetches only the data for the new page (by calling the load functions as JSON endpoints), swaps the component, and updates the URL using the History API. This is client-side navigation.

The key distinction: **server-side navigation** happens on the initial page load and on full page reloads. **Client-side navigation** happens for every subsequent link click within the app. Both run your load functions, but server-side navigation returns full HTML while client-side navigation returns JSON.

This matters because:

1. **Performance**: Client-side navigation only fetches data, not the full HTML shell. The layout components stay mounted.
2. **State preservation**: Component state in parent layouts survives client-side navigation. A music player in the root layout keeps playing.
3. **Animation**: You can animate between pages because the old and new pages exist simultaneously during client-side navigation.
4. **Hook behavior**: `beforeNavigate` and `afterNavigate` only fire during client-side navigation, not the initial server render.

```
First visit to /dashboard:
  Browser → Server: GET /dashboard (full HTML)
  Server → Browser: Complete HTML page
  Browser: Hydrates, SvelteKit takes over

Click link to /settings:
  SvelteKit intercepts click
  SvelteKit → Server: GET /settings/__data.json
  Server → SvelteKit: JSON data from load functions
  SvelteKit: Swaps +page.svelte component, updates URL
  Layout components remain mounted
```

## The page State Object

The `page` object from `$app/state` is the single most important piece of runtime information in SvelteKit. It contains everything about the current page as reactive state (using Svelte 5's fine-grained reactivity via `$state`):

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<p>Current URL: {page.url.pathname}</p>
<p>Route ID: {page.route.id}</p>
<p>Status: {page.status}</p>
```

Here is every property on the `page` object and when you would use each:

### page.url

A full `URL` object for the current page. This gives you access to the pathname, search parameters, hash, origin, and everything else on the standard `URL` interface:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  // Reactive derivations from the URL
  let searchQuery = $derived(page.url.searchParams.get('q') ?? '');
  let currentTab = $derived(page.url.searchParams.get('tab') ?? 'overview');
  let isActive = $derived((path: string) => page.url.pathname === path);
</script>

<nav>
  <a href="/" class:active={isActive('/')}>Home</a>
  <a href="/blog" class:active={page.url.pathname.startsWith('/blog')}>Blog</a>
</nav>

{#if searchQuery}
  <p>Showing results for "{searchQuery}"</p>
{/if}
```

One subtlety: `page.url` during SSR contains the full URL including the origin. In the browser, it also has the full URL. But be careful — if you serialize `page.url` to a string, the origin differs between server and client when using a reverse proxy.

### page.params

The dynamic route parameters extracted from the URL. For a route like `/blog/[slug]`, `page.params` is `{ slug: 'my-post' }`:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<!-- Route: /products/[category]/[id] -->
<p>Category: {page.params.category}</p>
<p>Product ID: {page.params.id}</p>
```

### page.route

Contains the route metadata. The `id` property is the route pattern — the filesystem path without the `src/routes` prefix:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<!-- page.route.id examples: -->
<!-- /blog/[slug]         for /blog/hello-world -->
<!-- /products/[id=integer] for /products/42 -->
<!-- /(app)/dashboard     for /dashboard (with route group) -->

<p>Route: {page.route.id}</p>
```

### page.status, page.error

The HTTP status code and error object. On normal pages, `status` is `200` and `error` is `null`. On error pages, these reflect what went wrong:

```svelte
<!-- +error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

{#if page.status === 404}
  <h1>Page not found</h1>
  <p>The page you are looking for does not exist.</p>
{:else if page.status >= 500}
  <h1>Server error</h1>
  <p>Something went wrong on our end. Please try again later.</p>
{:else}
  <h1>Error {page.status}</h1>
{/if}

{#if page.error?.message}
  <p class="error-detail">{page.error.message}</p>
{/if}
```

### page.data

The merged data from all load functions in the current route hierarchy. This includes data from the page's own load function and all parent layout load functions. You rarely access `page.data` directly in page components (you use `$props()` instead), but it is invaluable in components that live outside the route hierarchy, like a global navigation:

```svelte
<!-- src/lib/components/UserMenu.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  // Access user data set by the root layout's load function
  let user = $derived(page.data.user);
</script>

{#if user}
  <span>Welcome, {user.name}</span>
{:else}
  <a href="/login">Sign in</a>
{/if}
```

### page.form

Contains the data returned from a form action after submission. This is `null` unless a form action just returned data (via `return { ... }` or `fail(400, { ... })`):

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

{#if page.form?.error}
  <p class="error">{page.form.error}</p>
{/if}

{#if page.form?.success}
  <p class="success">Saved successfully!</p>
{/if}
```

### page.state

The state object passed to `pushState()` or `replaceState()`. This enables shallow routing — changing the URL without running load functions. We cover this in detail later in the lesson.

## The navigating State

The `navigating` object from `$app/state` is `null` when the app is idle and populated during an active navigation. It provides rich information about what is happening:

```svelte
<script lang="ts">
  import { navigating } from '$app/state';
</script>

{#if navigating}
  <div class="global-loading-bar" role="progressbar">
    <p>
      Navigating from {navigating.from?.url.pathname}
      to {navigating.to?.url.pathname}...
    </p>
  </div>
{/if}
```

The `navigating` object contains:

- **`from`** — the page being left (with `url`, `params`, `route`)
- **`to`** — the page being navigated to
- **`type`** — how the navigation was triggered: `'link'`, `'goto'`, `'popstate'` (back/forward), or `'form'`
- **`willUnload`** — `true` when navigating to an external URL (the page will be destroyed)
- **`complete`** — a `Promise` that resolves when the navigation finishes

Here is a production-grade global loading indicator:

```svelte
<!-- src/lib/components/NavigationProgress.svelte -->
<script lang="ts">
  import { navigating } from '$app/state';

  let showBar = $state(false);
  let progress = $state(0);
  let timeout: ReturnType<typeof setTimeout>;

  // Only show the bar if navigation takes more than 200ms
  // This prevents a flash for fast navigations
  $effect(() => {
    if (navigating) {
      clearTimeout(timeout);
      progress = 0;

      timeout = setTimeout(() => {
        showBar = true;
        progress = 70; // Start at 70% — feels fast
      }, 200);

      // When navigation completes, fill to 100% and fade out
      navigating.complete.then(() => {
        clearTimeout(timeout);
        progress = 100;
        setTimeout(() => {
          showBar = false;
          progress = 0;
        }, 300);
      });
    }
  });
</script>

{#if showBar}
  <div
    class="progress-bar"
    style="width: {progress}%; transition: width 0.3s ease"
    role="progressbar"
    aria-valuenow={progress}
  ></div>
{/if}

<style>
  .progress-bar {
    position: fixed;
    top: 0;
    left: 0;
    height: 3px;
    background: var(--color-primary, #3b82f6);
    z-index: 9999;
  }
</style>
```

The 200ms delay prevents the loading bar from flashing on fast navigations — a detail that separates polished apps from prototypes.

## The updated State

The `updated` object from `$app/state` tells you when a new version of your app has been deployed. It exposes a boolean `current` and a `check()` method:

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

You can also poll manually. For example, check for updates when the user returns to the tab:

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

Version detection requires `version.pollInterval` in your SvelteKit config:

```javascript
// svelte.config.js
const config = {
  kit: {
    version: {
      name: Date.now().toString(),
      pollInterval: 60000 // Check every 60 seconds
    }
  }
};
```

## Programmatic Navigation with goto

The `goto` function navigates to a URL from JavaScript. It returns a `Promise` that resolves when navigation completes, which makes it composable with async workflows:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  async function handleCheckout() {
    const order = await submitOrder();

    // Replace history entry so "Back" skips the checkout page
    await goto(`/orders/${order.id}`, { replaceState: true });
  }

  function openSettings() {
    // Prevent scroll reset after navigation
    goto('/settings', { noScroll: true });
  }

  function refreshDashboard() {
    // Navigate and re-run all load functions
    goto('/dashboard', { invalidateAll: true });
  }
</script>
```

### goto Options Reference

The full set of options controls history, scrolling, focus, and data:

```typescript
goto(url: string | URL, opts?: {
  replaceState?: boolean;  // Replace current history entry (default: false)
  noScroll?: boolean;      // Keep current scroll position (default: false)
  keepFocus?: boolean;     // Keep focus on current element (default: false)
  invalidateAll?: boolean; // Re-run all load functions (default: false)
  state?: App.PageState;   // Attach state to history entry
});
```

**`replaceState`**: Use after form submissions, login redirects, or wizard steps where the user should not be able to go "back" to the intermediate state.

**`noScroll`**: Use when navigating within tabbed interfaces or search results where scrolling to the top would be disorienting.

**`keepFocus`**: Use in search interfaces where the user is typing and you are updating the URL to reflect the query. Without this, the input loses focus on each navigation.

**`invalidateAll`**: Forces all load functions on the target page to re-run, even if SvelteKit thinks the data has not changed. Use after mutations that affect multiple data sources.

**`state`**: Attaches arbitrary data to the browser history entry. Read it back via `page.state`. The data must be serializable (no functions, no class instances).

### Advanced goto Patterns

Using `goto` with `state` for preserving context across navigation:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  // Navigate to a detail page but remember where we came from
  function viewProduct(productId: string) {
    goto(`/products/${productId}`, {
      state: {
        returnTo: page.url.pathname,
        scrollY: window.scrollY,
        filters: Object.fromEntries(page.url.searchParams)
      }
    });
  }
</script>
```

Then on the detail page, you can provide a "back" button that restores the exact previous state:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  function goBack() {
    const returnTo = page.state?.returnTo ?? '/products';
    goto(returnTo, {
      noScroll: true,
      state: { scrollY: page.state?.scrollY }
    });
  }
</script>
```

## Intercepting Navigation with beforeNavigate

`beforeNavigate` runs before the user leaves the current page. You can cancel the navigation, redirect elsewhere, or perform cleanup. This is the foundation for protecting unsaved form data:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let hasUnsavedChanges = $state(false);

  beforeNavigate((navigation) => {
    if (hasUnsavedChanges && !navigation.willUnload) {
      if (!confirm('You have unsaved changes. Leave this page?')) {
        navigation.cancel();
      }
    }
  });
</script>

<form>
  <input oninput={() => hasUnsavedChanges = true} />
  <button type="submit">Save</button>
</form>
```

### The navigation Object

The callback receives a `navigation` object with these properties:

- **`from`** — the current page (`{ url, params, route }`) or `null` on initial load
- **`to`** — the target page or `null` when navigating externally
- **`type`** — `'link'`, `'goto'`, `'popstate'`, `'form'`, or `'leave'`
- **`willUnload`** — `true` when navigating to an external URL or a full page reload
- **`cancel()`** — cancels the navigation (no-op when `willUnload` is true for external navigations)
- **`delta`** — for `popstate` navigations, the number of history entries traversed (negative for back)

### Edge Cases and Gotchas

**External navigation**: When `willUnload` is true and the navigation goes to an external site, calling `cancel()` still works (it prevents the browser from leaving). But you cannot redirect — the only option is to stay or leave. When `type` is `'leave'` (tab close, browser close), `cancel()` is the only option and the browser may show its own confirmation dialog:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let isDirty = $state(false);

  beforeNavigate(({ willUnload, cancel, type }) => {
    if (!isDirty) return;

    if (type === 'leave') {
      // Browser handles this — shows its own "Leave site?" dialog
      // We cannot customize the message
      cancel();
      return;
    }

    if (willUnload) {
      // Navigating to external URL — we can still cancel
      if (!confirm('You have unsaved changes. Leave this site?')) {
        cancel();
      }
      return;
    }

    // Internal navigation — we have full control
    if (!confirm('Discard unsaved changes?')) {
      cancel();
    }
  });
</script>
```

**Multiple beforeNavigate callbacks**: If multiple components register `beforeNavigate` callbacks, they all run. If any one of them calls `cancel()`, the navigation is cancelled. This is useful for composing guards:

```svelte
<!-- FormGuard.svelte — reusable unsaved changes guard -->
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let { dirty = false, message = 'You have unsaved changes.' }: {
    dirty: boolean;
    message?: string;
  } = $props();

  beforeNavigate((nav) => {
    if (dirty && !nav.willUnload) {
      if (!confirm(message)) {
        nav.cancel();
      }
    }
  });
</script>
```

Usage:

```svelte
<script lang="ts">
  import FormGuard from '$lib/components/FormGuard.svelte';

  let formDirty = $state(false);
</script>

<FormGuard dirty={formDirty} message="Your edits will be lost. Continue?" />

<form>
  <textarea oninput={() => formDirty = true}></textarea>
</form>
```

## Running Code After Navigation with afterNavigate

`afterNavigate` fires after a navigation completes and the new page is rendered in the DOM. It also fires once after the initial page hydration, making it useful for one-time setup:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    // Track page views
    analytics.track('pageview', {
      from: navigation.from?.url.pathname,
      to: navigation.to?.url.pathname,
      type: navigation.type
    });

    // Close any open mobile menus
    mobileMenuOpen = false;

    // Reset scroll position in a specific container
    document.querySelector('.content-area')?.scrollTo(0, 0);
  });
</script>
```

The `navigation` object is similar to `beforeNavigate` but includes a `type` value of `'enter'` for the initial page load (after hydration).

### Distinguishing Navigation Types

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((nav) => {
    if (nav.type === 'enter') {
      // Initial page load — run one-time setup
      initializeThirdPartyWidget();
    } else if (nav.type === 'popstate') {
      // User pressed back/forward — maybe restore scroll
      const savedScroll = nav.to?.url.searchParams.get('scroll');
      if (savedScroll) {
        window.scrollTo(0, parseInt(savedScroll));
      }
    } else {
      // Regular navigation (link, goto, form)
      window.scrollTo(0, 0);
    }
  });
</script>
```

## View Transitions with onNavigate

`onNavigate` runs during navigation and can return a promise. If it returns a promise, SvelteKit waits for that promise to resolve before completing the navigation. This makes it the integration point for the View Transitions API:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  onNavigate((navigation) => {
    // Skip if View Transitions API is not supported
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve(); // Tell SvelteKit to proceed with the DOM update
        await navigation.complete; // Wait for the new page to render
      });
    });
  });
</script>
```

Place this in your root `+layout.svelte` to enable view transitions across your entire app. The browser captures a screenshot of the old page, SvelteKit updates the DOM, and the browser cross-fades to the new content.

### Customizing Transitions Per Route

You can create different animations for different navigation patterns:

```svelte
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    // Determine transition type based on routes
    const from = navigation.from?.route.id;
    const to = navigation.to?.route.id;

    let transitionClass = 'fade';

    if (from?.startsWith('/blog') && to === '/blog/[slug]') {
      transitionClass = 'slide-in';
    } else if (from === '/blog/[slug]' && to?.startsWith('/blog')) {
      transitionClass = 'slide-out';
    }

    document.documentElement.dataset.transition = transitionClass;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<style>
  :global([data-transition="slide-in"])::view-transition-new(root) {
    animation: slide-from-right 0.3s ease;
  }

  :global([data-transition="slide-out"])::view-transition-new(root) {
    animation: slide-from-left 0.3s ease;
  }

  @keyframes slide-from-right {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  @keyframes slide-from-left {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
</style>
```

## Shallow Routing with pushState and replaceState

Sometimes you want to change the URL without triggering a full navigation — for example, opening a modal that should have its own shareable URL, switching tabs, or updating filters:

```svelte
<script lang="ts">
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/state';

  interface Photo {
    id: string;
    url: string;
    title: string;
  }

  let { data } = $props();

  function openPhoto(photo: Photo) {
    pushState(`/photos/${photo.id}`, { selectedPhoto: photo });
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
  <div class="modal-overlay" onclick={closeModal} role="dialog" aria-modal="true">
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <img src={page.state.selectedPhoto.url} alt={page.state.selectedPhoto.title} />
      <h2>{page.state.selectedPhoto.title}</h2>
      <button onclick={closeModal}>Close</button>
    </div>
  </div>
{/if}
```

The URL changes to `/photos/abc123`, so the user can share it. But no load function runs — the modal data comes from the state you passed to `pushState`. If someone navigates directly to `/photos/abc123`, SvelteKit runs the normal load function for that route.

### pushState vs replaceState

**`pushState(url, state)`** adds a new entry to the browser's history stack. The user can press "back" to return to the previous state.

**`replaceState(url, state)`** overwrites the current history entry. Use this for changes that should not create a new history step — for example, updating a filter or tab selection:

```svelte
<script lang="ts">
  import { replaceState } from '$app/navigation';
  import { page } from '$app/state';

  function setTab(tab: string) {
    const url = new URL(page.url);
    url.searchParams.set('tab', tab);
    replaceState(url, { activeTab: tab });
  }
</script>

<div class="tabs">
  <button
    class:active={page.state.activeTab === 'overview'}
    onclick={() => setTab('overview')}
  >Overview</button>
  <button
    class:active={page.state.activeTab === 'analytics'}
    onclick={() => setTab('analytics')}
  >Analytics</button>
</div>
```

### Type Safety for Page State

Declare your page state types in `app.d.ts`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface PageState {
      selectedPhoto?: { id: string; url: string; title: string };
      activeTab?: string;
      scrollY?: number;
    }
  }
}
export {};
```

Now `page.state.selectedPhoto` is fully typed, and TypeScript will catch typos and incorrect shapes.

## Refreshing Data with invalidate and invalidateAll

When data changes on the server — after a mutation, a webhook, or a timer — you can re-run load functions without a full navigation:

```svelte
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  async function markAsRead(notificationId: string) {
    await fetch(`/api/notifications/${notificationId}`, { method: 'PATCH' });

    // Re-run load functions that depend on this URL
    invalidate('/api/notifications');
  }

  async function refreshEverything() {
    // Re-run ALL load functions on the current page
    invalidateAll();
  }
</script>
```

### How invalidate Matching Works

`invalidate` matches load functions in two ways:

1. **URL matching**: If a load function called `fetch('/api/notifications')`, calling `invalidate('/api/notifications')` re-runs that load function. The matching is by URL string comparison.

2. **Custom dependency keys**: Load functions can declare dependencies with `depends()`:

```typescript
// +page.server.ts
export const load = async ({ depends, fetch }) => {
  depends('app:notifications');

  const res = await fetch('/api/notifications');
  return { notifications: await res.json() };
};
```

```svelte
<script lang="ts">
  import { invalidate } from '$app/navigation';

  // Re-run any load function that called depends('app:notifications')
  invalidate('app:notifications');
</script>
```

Custom keys use a URI-like format. The prefix before the colon is arbitrary but conventionally `app:` for application-specific dependencies.

### Function-based invalidation

`invalidate` also accepts a function for flexible matching:

```svelte
<script lang="ts">
  import { invalidate } from '$app/navigation';

  // Re-run load functions that fetched any URL containing "notifications"
  invalidate((url) => url.href.includes('notifications'));

  // Re-run load functions that fetched from a specific domain
  invalidate((url) => url.hostname === 'api.example.com');
</script>
```

## Preloading Data and Code

SvelteKit preloads pages automatically when a user hovers over a link (configurable). You can also trigger preloading programmatically:

```svelte
<script lang="ts">
  import { preloadData, preloadCode } from '$app/navigation';

  // Preload both the code AND data for a page
  // Use when you are confident the user will navigate next
  function onUserIntent(href: string) {
    preloadData(href);
  }

  // Preload only the code (JavaScript module), not the data
  // Cheaper than preloadData — good for "maybe" navigations
  function onMaybeNavigate(href: string) {
    preloadCode(href);
  }
</script>

<!-- Preload the dashboard when the user focuses the input -->
<input
  type="search"
  onfocus={() => preloadCode('/search')}
  placeholder="Search..."
/>

<!-- Preload on mouse enter for a card grid -->
{#each items as item}
  <a
    href="/items/{item.id}"
    onmouseenter={() => preloadData(`/items/${item.id}`)}
  >
    {item.name}
  </a>
{/each}
```

`preloadData` returns a promise with the result, which you can use to check for redirect responses before navigating:

```svelte
<script lang="ts">
  import { preloadData, goto } from '$app/navigation';

  async function navigateWithPreload(href: string) {
    const result = await preloadData(href);

    if (result.type === 'redirect') {
      goto(result.location);
    } else {
      goto(href);
    }
  }
</script>
```

## Link Options (data-sveltekit-*)

SvelteKit provides HTML attributes to control navigation behavior on individual links or groups of links:

```svelte
<!-- Preload data on hover (this is the default) -->
<a href="/products" data-sveltekit-preload-data="hover">Products</a>

<!-- Preload data immediately when the link enters the viewport -->
<a href="/about" data-sveltekit-preload-data="tap">About</a>

<!-- Preload only code (not data) on hover -->
<a href="/settings" data-sveltekit-preload-code="hover">Settings</a>

<!-- Force a full page reload (bypass client-side navigation) -->
<a href="/legacy" data-sveltekit-reload>Legacy Page</a>

<!-- Prevent scroll reset after navigation -->
<a href="/tabs/settings" data-sveltekit-noscroll>Settings Tab</a>

<!-- Keep focus on the triggering element after navigation -->
<a href="/search?page=2" data-sveltekit-keepfocus>Next Page</a>

<!-- Replace the current history entry instead of adding a new one -->
<a href="/step-2" data-sveltekit-replacestate>Next Step</a>
```

Apply attributes to a container to affect all links inside:

```svelte
<nav data-sveltekit-preload-data="hover">
  <!-- All links in this nav preload on hover -->
  <a href="/">Home</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact</a>
</nav>

<!-- Disable preloading for a specific link inside a preloaded container -->
<div data-sveltekit-preload-data="hover">
  <a href="/cheap-page">Fast Page</a>
  <a href="/expensive-page" data-sveltekit-preload-data="off">Expensive Page</a>
</div>
```

## Building a Breadcrumb System

Here is a practical example that ties together `page.url`, `page.params`, and `page.route`:

```svelte
<!-- src/lib/components/Breadcrumbs.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { base } from '$app/paths';

  interface Crumb {
    label: string;
    href: string;
  }

  const labelMap: Record<string, string> = {
    'products': 'Products',
    'settings': 'Settings',
    'users': 'Users',
    'admin': 'Admin'
  };

  let crumbs = $derived.by(() => {
    const segments = page.url.pathname.split('/').filter(Boolean);
    const result: Crumb[] = [{ label: 'Home', href: `${base}/` }];

    let path = '';
    for (const segment of segments) {
      path += `/${segment}`;

      // Check if this segment is a dynamic param value
      const paramValues = Object.values(page.params);
      const isDynamicParam = paramValues.includes(segment);

      const label = isDynamicParam
        ? segment // Show the actual value for dynamic params
        : labelMap[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1);

      result.push({ label, href: `${base}${path}` });
    }

    return result;
  });
</script>

<nav aria-label="Breadcrumb">
  <ol>
    {#each crumbs as crumb, i}
      <li>
        {#if i < crumbs.length - 1}
          <a href={crumb.href}>{crumb.label}</a>
          <span aria-hidden="true">/</span>
        {:else}
          <span aria-current="page">{crumb.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  ol {
    display: flex;
    gap: 0.5rem;
    list-style: none;
    padding: 0;
    font-size: 0.875rem;
  }

  a {
    color: var(--color-link);
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  [aria-current="page"] {
    font-weight: 600;
  }
</style>
```

## Complete Navigation Management Example

Here is a comprehensive layout that demonstrates all the navigation concepts working together:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { page, navigating, updated } from '$app/state';
  import { beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';
  import { browser } from '$app/environment';
  import Breadcrumbs from '$lib/components/Breadcrumbs.svelte';
  import NavigationProgress from '$lib/components/NavigationProgress.svelte';

  let { children } = $props();
  let mobileMenuOpen = $state(false);

  // --- View Transitions ---
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // --- Analytics tracking ---
  afterNavigate((nav) => {
    if (nav.type !== 'enter') {
      // Do not track the initial page load (analytics snippet handles that)
      analytics.track('pageview', { path: nav.to?.url.pathname });
    }
    // Close mobile menu on any navigation
    mobileMenuOpen = false;
  });

  // --- Check for updates when returning to tab ---
  if (browser) {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        updated.check();
      }
    });
  }
</script>

<!-- Update banner -->
{#if updated.current}
  <div class="update-banner" role="alert">
    A new version is available.
    <button onclick={() => location.reload()}>Reload</button>
  </div>
{/if}

<!-- Loading progress bar -->
<NavigationProgress />

<!-- Navigation -->
<header>
  <nav>
    <a href="/" class:active={page.url.pathname === '/'}>Home</a>
    <a href="/blog" class:active={page.url.pathname.startsWith('/blog')}>Blog</a>
    <a href="/products" class:active={page.url.pathname.startsWith('/products')}>Products</a>

    {#if page.data.user}
      <a href="/dashboard">Dashboard</a>
      <span>Hello, {page.data.user.name}</span>
    {:else}
      <a href="/login">Sign in</a>
    {/if}
  </nav>
</header>

<Breadcrumbs />

<main>
  {@render children()}
</main>
```

## Try It

Build a multi-step form wizard with three steps. Each step is a different component, and the current step is tracked via `pushState` so the URL reflects the current step (e.g., `/wizard?step=2`).

Requirements:
1. Use `goto` with `replaceState` to navigate between steps so that the browser back button goes to the page before the wizard, not the previous step.
2. Add a `beforeNavigate` guard that warns the user if they try to leave mid-wizard with a custom `FormGuard` component.
3. After the final step, navigate to a confirmation page and use `afterNavigate` to log the completed flow to analytics.
4. Add a global `NavigationProgress` component that only shows if navigation takes longer than 200ms.
5. Implement view transitions using `onNavigate` so each step animates smoothly.
6. Add an update banner using `updated` that checks for new versions when the user returns from a background tab.

## Key Takeaways

- SvelteKit automatically intercepts link clicks for client-side navigation, preserving layout component state and fetching only JSON data
- The `page` state object provides reactive access to `url`, `params`, `route`, `status`, `error`, `data`, `form`, and `state` — the single source of truth for the current page
- `navigating` is non-null during active navigation and includes `from`, `to`, `type`, `willUnload`, and a `complete` promise
- `updated.current` detects new deployments; call `updated.check()` to poll manually (requires `version.pollInterval` in config)
- `goto(url, opts)` provides programmatic navigation with options for `replaceState`, `noScroll`, `keepFocus`, `invalidateAll`, and `state`
- `beforeNavigate` intercepts navigation before it happens — use it for unsaved changes warnings via `cancel()`
- `afterNavigate` runs after the new page renders — ideal for analytics, menu closing, and DOM interactions
- `onNavigate` integrates with the View Transitions API by returning a promise that wraps `document.startViewTransition`
- `pushState` and `replaceState` update the URL without running load functions — use for modals, tabs, and filters
- `invalidate(url | key | fn)` selectively re-runs load functions; `invalidateAll()` re-runs every load function on the current page
- `preloadData` and `preloadCode` let you programmatically warm the cache for likely navigations
- Link options (`data-sveltekit-preload-data`, `data-sveltekit-reload`, etc.) control behavior on individual links or containers
