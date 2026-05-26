# Navigation

In SvelteKit, navigating between pages is deceptively simple — you use standard HTML `<a>` tags. Behind the scenes, SvelteKit intercepts these clicks and performs **client-side navigation**, loading only the data that changes instead of doing a full page reload. This gives your app the speed of a single-page application with the simplicity of plain HTML links.

This is an important architectural decision. Many frameworks require you to import a special `<Link>` component and use it everywhere. SvelteKit does not. You write standard HTML, and the framework enhances it. If JavaScript fails to load, the links still work as regular links. This is progressive enhancement at the routing level.

Understanding how navigation works — when SvelteKit intercepts, when it does not, how the interception mechanism works under the hood, and the lifecycle hooks that fire along the way — is essential for building applications that feel fast, behave correctly, and handle edge cases gracefully.

## How SvelteKit Intercepts Link Clicks

Before we look at how to use navigation, it is worth understanding the mechanism. SvelteKit uses **event delegation** at the document level. During app initialization, it attaches a single `click` event listener to the document. When any `<a>` tag is clicked anywhere in the page, this listener fires and runs through a series of checks:

1. **Is the event already handled?** — If `event.defaultPrevented` is true, skip.
2. **Is it a primary button click?** — Only left-click (button === 0) is intercepted. Right-click, middle-click are ignored.
3. **Is a modifier key held?** — If Ctrl, Meta, Alt, or Shift is held, the browser's native behavior is used (e.g., Ctrl+Click opens in a new tab).
4. **Does the link have `target="_blank"`?** — If so, let the browser open a new tab.
5. **Does the link have a `download` attribute?** — If so, let the browser download the file.
6. **Is the link same-origin?** — SvelteKit only intercepts links to the same origin. External links (different domain) are left alone.
7. **Does the link (or an ancestor) have `data-sveltekit-reload`?** — If so, force a full page reload.
8. **Does the href match a SvelteKit route?** — If the URL does not match any route in the application, SvelteKit lets the browser handle it natively.

If all checks pass, SvelteKit calls `event.preventDefault()`, then performs client-side navigation: it runs the target page's `load` function, swaps the page component, updates the URL bar, and manages scroll position.

This delegation approach means you never need to import a special link component. Any `<a>` tag anywhere in the DOM — whether rendered by Svelte, injected by a third-party library, or created dynamically — gets intercepted if it meets the criteria.

## Using `<a>` Tags

The simplest and most common way to navigate is with regular anchor tags:

```svelte
<!-- src/routes/+layout.svelte -->
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact</a>
</nav>

{@render children()}
```

SvelteKit automatically intercepts clicks on `<a>` tags that point to internal routes. Instead of a full page reload, it fetches the data for the target page, swaps in the new page content, and updates the browser's URL bar. The layout stays mounted, no white flash, no network waterfall.

### Relative vs Absolute hrefs

SvelteKit handles both relative and absolute paths:

```svelte
<!-- Absolute — always resolves to /about -->
<a href="/about">About</a>

<!-- Relative — resolves based on current route -->
<!-- If current page is /blog/my-post, this goes to /blog/other-post -->
<a href="../other-post">Other Post</a>

<!-- Hash links — scrolls to element on current page -->
<a href="#section-2">Jump to Section 2</a>

<!-- Hash links to other pages -->
<a href="/docs/api#authentication">API Auth Docs</a>
```

Relative links are resolved against the current page's URL, which can be useful for sibling navigation (e.g., within a blog post, linking to the next post). However, absolute paths are generally clearer and less error-prone.

## When SvelteKit Does NOT Intercept

SvelteKit is smart about which clicks to intercept. It leaves these alone:

- **External links** — any `href` pointing to a different origin (`https://google.com`)
- **`target="_blank"`** — links that open in a new tab
- **`download` attribute** — links that trigger a file download
- **Middle-click or Ctrl+click** — the user intends to open in a new tab
- **`data-sveltekit-reload`** — an explicit opt-out that forces a full page reload

```svelte
<!-- SvelteKit intercepts this (internal route) -->
<a href="/about">About</a>

<!-- SvelteKit does NOT intercept these -->
<a href="https://github.com">GitHub</a>
<a href="/about" target="_blank">About (new tab)</a>
<a href="/report.pdf" download>Download Report</a>

<!-- Force a full reload even for internal routes -->
<a href="/legacy-page" data-sveltekit-reload>Legacy Page</a>
```

### The data-sveltekit-* Attributes

SvelteKit provides several `data-sveltekit-*` attributes for fine-grained control over navigation behavior. These can be placed on individual links or on container elements (they cascade to all links inside):

| Attribute | Effect |
|-----------|--------|
| `data-sveltekit-reload` | Forces a full page reload instead of client-side navigation |
| `data-sveltekit-noscroll` | Prevents scrolling to top after navigation |
| `data-sveltekit-replacestate` | Replaces the current history entry instead of pushing a new one |
| `data-sveltekit-keepfocus` | Keeps focus on the current element after navigation |
| `data-sveltekit-preload-data` | Controls when data preloading happens: `"hover"`, `"tap"`, `"eager"`, `"off"` |
| `data-sveltekit-preload-code` | Controls when code preloading happens: `"hover"`, `"tap"`, `"eager"`, `"viewport"`, `"off"` |

```svelte
<!-- Apply to a container — all links inside inherit the behavior -->
<nav data-sveltekit-preload-data="hover" data-sveltekit-noscroll>
  <a href="/tab-1">Tab 1</a>
  <a href="/tab-2">Tab 2</a>
  <a href="/tab-3">Tab 3</a>
</nav>

<!-- Override on individual links -->
<nav data-sveltekit-preload-data="hover">
  <a href="/about">About</a>
  <a href="/expensive-page" data-sveltekit-preload-data="tap">Expensive Page</a>
</nav>
```

`data-sveltekit-noscroll` is particularly useful for tabs and filtering UIs where navigation changes the page content but the user should stay at the same scroll position. `data-sveltekit-replacestate` is useful for filter parameters where you do not want every filter change to create a new history entry.

## Programmatic Navigation with goto()

Sometimes you need to navigate from JavaScript code — after a form submission, after authentication, or in response to an event. The `goto()` function from `$app/navigation` is your tool:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  async function handleLogin() {
    // Perform login logic...
    await goto('/dashboard');
    // Navigation is complete — the dashboard is now rendered
  }
</script>

<button onclick={handleLogin}>Log In</button>
```

`goto()` returns a Promise that resolves when navigation is complete, so you can `await` it when you need to run code after the new page has loaded.

### goto() Options Deep Dive

`goto()` accepts a second argument with options that control navigation behavior:

```typescript
import { goto } from '$app/navigation';

// Replace the current history entry (back button skips this page)
goto('/dashboard', { replaceState: true });

// Preserve the current scroll position
goto('/results?page=2', { noScroll: true });

// Keep focus on the current element (useful for search/filter UIs)
goto('/search?q=svelte', { keepFocus: true });

// Pass state that is not visible in the URL
goto('/checkout', { state: { fromCart: true, cartId: 'abc123' } });

// Force a full page reload
goto('/legacy', { invalidateAll: true });
```

Let me break down when to use each option:

**`replaceState: true`** — The most commonly used option. Essential for redirect patterns. After a user logs in, you want to replace the login page in history so pressing back does not return to the login form. Also useful for search/filter UIs where you do not want every keystroke creating a new history entry.

**`noScroll: true`** — Prevents SvelteKit from scrolling to the top of the page after navigation. Use this for pagination, tabs, or any UI where scrolling to the top would be disorienting.

**`keepFocus: true`** — Normally, SvelteKit resets focus to the `<body>` after navigation. This option keeps focus where it is — essential for search inputs where you want the user to keep typing while results update via URL changes.

**`state`** — Passes opaque state through the History API. The state is not visible in the URL, not bookmarkable, and lost on page reload. Use it for transient context like "which button did the user click to get here" or "should we show a welcome animation on arrival." Access it via `$app/state`:

```svelte
<script>
  import { page } from '$app/state';

  // state passed via goto('/checkout', { state: { fromCart: true } })
  let cameFromCart = $derived(page.state?.fromCart ?? false);
</script>

{#if cameFromCart}
  <p>Reviewing your cart items before checkout...</p>
{/if}
```

### goto() vs window.location

Do not use `window.location.href = '/somewhere'` for internal navigation. It forces a full page reload, destroying all client-side state, killing layout persistence, and triggering a full SSR cycle. Use `goto()` for internal navigation and let SvelteKit handle the client-side routing.

```typescript
// WRONG — full page reload, loses all state
window.location.href = '/dashboard';

// CORRECT — client-side navigation, layouts persist
goto('/dashboard');

// WRONG — also a full reload
window.location.assign('/dashboard');

// CORRECT — only use window.location for true external navigation
window.location.href = 'https://external-service.com/callback';
```

## Navigation Lifecycle Hooks

SvelteKit provides lifecycle hooks that fire before and after navigation. These are critical for building navigation guards, analytics tracking, loading indicators, and unsaved changes prompts.

### beforeNavigate

`beforeNavigate` fires before the user leaves the current page. You can cancel the navigation:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let hasUnsavedChanges = $state(false);

  beforeNavigate((navigation) => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Leave anyway?')) {
        navigation.cancel();
      }
    }
  });
</script>

<textarea oninput={() => hasUnsavedChanges = true}></textarea>
<button onclick={() => hasUnsavedChanges = false}>Save</button>
```

The `navigation` object provides comprehensive context:

```typescript
interface Navigation {
  from: {
    url: URL;
    route: { id: string | null };
    params: Record<string, string>;
  } | null;
  to: {
    url: URL;
    route: { id: string | null };
    params: Record<string, string>;
  } | null;
  type: 'link' | 'goto' | 'popstate' | 'leave';
  willUnload: boolean;
  delta?: number;   // For popstate: number of history steps
  complete: Promise<void>;
  cancel(): void;
}
```

The `type` field tells you what triggered the navigation:
- `'link'` — user clicked an `<a>` tag
- `'goto'` — code called `goto()`
- `'popstate'` — user pressed back/forward button
- `'leave'` — user is leaving the site entirely (closing tab, navigating to external URL)

The `willUnload` boolean is true when the page is about to be unloaded (external navigation, tab close). When `willUnload` is true, `cancel()` has no effect — you cannot prevent a user from closing their browser tab. Use `beforeunload` for that.

### afterNavigate

`afterNavigate` fires after the page has transitioned. Use it for analytics, scroll restoration, or focus management:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    // Analytics tracking
    analytics.track('page_view', {
      path: navigation.to?.url.pathname,
      from: navigation.from?.url.pathname
    });

    // Focus the main content for accessibility
    document.querySelector('main')?.focus();
  });
</script>
```

`afterNavigate` is the right place for side effects that should happen _after_ the DOM has updated. Unlike `onMount`, which only runs on the initial page load, `afterNavigate` runs on every client-side navigation.

### onNavigate — View Transitions API

`onNavigate` is the newest hook, designed specifically for the View Transitions API. It fires after `beforeNavigate` but before the DOM is updated, giving you a chance to set up a view transition:

```svelte
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  onNavigate((navigation) => {
    // Check if the browser supports view transitions
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>
```

This integrates with the browser's native View Transitions API to create smooth cross-page animations. The pattern works like this:

1. `onNavigate` fires and returns a Promise.
2. SvelteKit waits for this Promise to resolve before updating the DOM.
3. Inside the Promise, you call `document.startViewTransition()`, which captures a screenshot of the current DOM.
4. You resolve the outer Promise, which lets SvelteKit update the DOM.
5. `navigation.complete` resolves after the DOM is updated.
6. The View Transitions API crossfades between the old screenshot and the new DOM.

Add CSS to control which elements transition:

```css
/* Default crossfade for the whole page */
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 200ms;
}

/* Named transition for the main content area */
main {
  view-transition-name: main-content;
}

::view-transition-old(main-content) {
  animation: slide-out 200ms ease-in;
}

::view-transition-new(main-content) {
  animation: slide-in 200ms ease-out;
}

@keyframes slide-out {
  to { transform: translateX(-100%); opacity: 0; }
}

@keyframes slide-in {
  from { transform: translateX(100%); opacity: 0; }
}
```

View transitions are progressive enhancement — if the browser does not support them, the page navigates normally without animation.

### Combining All Hooks for a Complete Navigation System

Here is a comprehensive example showing all navigation hooks working together:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';

  let navigating = $state(false);
  let loadingPath = $state('');

  // 1. Before navigation — show loading state, guard routes
  beforeNavigate((navigation) => {
    navigating = true;
    loadingPath = navigation.to?.url.pathname || '';
  });

  // 2. View transitions — smooth page animations
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  // 3. After navigation — cleanup, analytics, accessibility
  afterNavigate((navigation) => {
    navigating = false;
    loadingPath = '';

    // Track page view
    if (typeof gtag !== 'undefined') {
      gtag('event', 'page_view', {
        page_path: navigation.to?.url.pathname
      });
    }

    // Announce to screen readers
    const heading = document.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  });
</script>

{#if navigating}
  <div class="loading-bar" aria-hidden="true">
    <div class="loading-progress"></div>
  </div>
{/if}

<nav>
  <a href="/">Home</a>
  <a href="/about" class:loading={loadingPath === '/about'}>About</a>
  <a href="/blog" class:loading={loadingPath.startsWith('/blog')}>Blog</a>
</nav>

{@render children()}

<style>
  .loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 9999;
  }

  .loading-progress {
    height: 100%;
    background: #3b82f6;
    animation: loading 1s ease-in-out infinite;
  }

  @keyframes loading {
    0% { width: 0; }
    50% { width: 70%; }
    100% { width: 100%; }
  }

  a.loading {
    opacity: 0.6;
  }
</style>
```

## Accessing Page State with $app/state

The modern Svelte 5 way to access information about the current page is through `$app/state`. This module exposes a reactive `page` object:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<p>Current URL: {page.url.pathname}</p>
<p>Search params: {page.url.searchParams.toString()}</p>
<p>Route params: {JSON.stringify(page.params)}</p>
<p>Route ID: {page.route.id}</p>
```

### The Page Object Anatomy

The `page` object includes:

| Property | Type | Description |
|----------|------|-------------|
| `page.url` | `URL` | Full URL object with `pathname`, `searchParams`, `hash`, `origin`, etc. |
| `page.params` | `Record<string, string>` | Dynamic route parameters (e.g., `{ slug: 'hello' }` for `/blog/[slug]`) |
| `page.route.id` | `string \| null` | The route's file path (e.g., `/blog/[slug]`), null on error pages |
| `page.data` | `object` | Combined data from all load functions (page + layout) |
| `page.status` | `number` | HTTP status code (200, 404, 500, etc.) |
| `page.error` | `App.Error \| null` | Error object if on an error page, null otherwise |
| `page.form` | `object \| null` | Data returned from a form action after submission |
| `page.state` | `object` | State passed via `goto()` or `pushState()` |

Because `page` from `$app/state` is deeply reactive in Svelte 5, you can reference its properties directly in your template and they update automatically when the URL changes. Use `$derived` when you need to compute a value in the script block:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
  let currentSection = $derived(page.url.pathname.split('/')[1] || 'home');
  let pageTitle = $derived(
    page.data?.title || page.route.id?.split('/').pop() || 'Home'
  );

  // Access search parameters reactively
  let searchQuery = $derived(page.url.searchParams.get('q') || '');
  let currentPage = $derived(
    parseInt(page.url.searchParams.get('page') || '1', 10)
  );
</script>

<svelte:head>
  <title>{pageTitle} | MyApp</title>
</svelte:head>
```

### $app/state vs $app/stores

Older code imports `page` from `$app/stores` and uses the `$page` syntax. Both work, but they have different characteristics:

```svelte
<script>
  // Modern (Svelte 5) — deeply reactive, no $ prefix needed
  import { page } from '$app/state';
  let path = $derived(page.url.pathname);

  // Legacy (still works) — Svelte store, requires $ prefix
  import { page as pageStore } from '$app/stores';
  // $pageStore.url.pathname
</script>
```

Use `$app/state` for new Svelte 5 projects. It integrates with the runes system (`$derived`, `$effect`) and does not require the `$` auto-subscription syntax.

### Using page.state for Shallow Routing

The `page.state` object enables a pattern called "shallow routing" — updating the history state without changing the URL. This is useful for modals or panels that should be dismissible with the back button:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { pushState } from '$app/navigation';

  function openModal(itemId) {
    pushState('', { showModal: true, itemId });
  }

  let showModal = $derived(page.state?.showModal ?? false);
  let selectedId = $derived(page.state?.itemId);
</script>

{#each items as item}
  <button onclick={() => openModal(item.id)}>{item.name}</button>
{/each}

{#if showModal}
  <div class="modal-overlay" onclick={() => history.back()}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <p>Viewing item {selectedId}</p>
      <button onclick={() => history.back()}>Close</button>
    </div>
  </div>
{/if}
```

When the user presses the back button, the browser pops the state and the modal disappears — no navigation occurs, just a state change. This is a much better UX than modals that break the back button.

## Prefetching for Speed

SvelteKit can preload page data before the user clicks a link. By default, SvelteKit prefetches data when the user hovers over a link. The data is ready by the time they click, making navigation feel instantaneous.

### data-sveltekit-preload-data

Controls when the `load` function for the target page runs:

```svelte
<!-- Preload on hover (default behavior) -->
<a href="/about">About</a>

<!-- Preload eagerly when the link enters the viewport -->
<a href="/about" data-sveltekit-preload-data="eager">About</a>

<!-- Preload on tap/mousedown (slightly faster than click) -->
<a href="/about" data-sveltekit-preload-data="tap">About</a>

<!-- Disable data preloading -->
<a href="/about" data-sveltekit-preload-data="off">About</a>
```

**Hover** (default): On desktop, the data starts loading when the user moves their cursor over the link. There is typically 200-300ms between hover and click — enough time to fetch small datasets. On mobile, hover is not possible, so it falls back to tap behavior.

**Tap**: Data starts loading on `mousedown` (desktop) or `touchstart` (mobile). There is typically 100-200ms between mousedown and click. Less time than hover, but avoids preloading data for links the user merely hovers over.

**Eager**: Data starts loading as soon as the link enters the viewport. This is aggressive — it runs the `load` function for pages the user might never visit. Use it for links the user is very likely to click (main navigation items).

**Off**: Disables preloading entirely. The `load` function runs only after the user clicks. Use this for expensive load functions or pages behind authentication that should not be prefetched.

### data-sveltekit-preload-code

Controls when the JavaScript module for the target page is downloaded:

```svelte
<!-- Preload code on hover (default) -->
<a href="/about" data-sveltekit-preload-code="hover">About</a>

<!-- Preload code when the link enters the viewport -->
<a href="/about" data-sveltekit-preload-code="viewport">About</a>

<!-- Preload code eagerly (immediately) -->
<a href="/about" data-sveltekit-preload-code="eager">About</a>

<!-- Disable code preloading -->
<a href="/about" data-sveltekit-preload-code="off">About</a>
```

Code preloading is cheaper than data preloading — it downloads the page component's JavaScript but does not run the `load` function (no database queries, no API calls). The `viewport` option is a good balance: preload the JS when the link scrolls into view, but wait for hover/tap to run the `load` function.

### Applying Preloading to Containers

You can set preloading on a container to apply it to all links inside:

```svelte
<nav data-sveltekit-preload-data="hover">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>

<!-- Or globally in your root layout -->
<div data-sveltekit-preload-code="viewport" data-sveltekit-preload-data="hover">
  {@render children()}
</div>
```

### Programmatic Preloading

You can trigger preloading from JavaScript using `preloadData` and `preloadCode`:

```typescript
import { preloadData, preloadCode } from '$app/navigation';

// Preload both code and data for a route
await preloadData('/dashboard');

// Preload only the code module
await preloadCode('/settings');

// Useful for conditional preloading
if (user.isAdmin) {
  preloadCode('/admin');
}
```

This is useful for preloading routes that are likely targets based on application logic rather than user hover behavior. For example, after a user logs in, you might preload the dashboard code while showing a brief welcome animation.

## Active Link Styling

A common pattern is highlighting the current page in the navigation. Use `$app/state` to check the current URL:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  const navLinks = [
    { href: '/', label: 'Home', exact: true },
    { href: '/about', label: 'About', exact: true },
    { href: '/blog', label: 'Blog', exact: false },
    { href: '/docs', label: 'Docs', exact: false }
  ];

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return page.url.pathname === href;
    return page.url.pathname.startsWith(href);
  }
</script>

<nav>
  {#each navLinks as link}
    <a
      href={link.href}
      class:active={isActive(link.href, link.exact)}
      aria-current={isActive(link.href, link.exact) ? 'page' : undefined}
    >
      {link.label}
    </a>
  {/each}
</nav>

<style>
  nav {
    display: flex;
    gap: 4px;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  a {
    text-decoration: none;
    color: #666;
    padding: 8px 16px;
    border-radius: 6px;
    transition: background 150ms, color 150ms;
  }

  a:hover {
    background: #e5e7eb;
  }

  a.active {
    color: #2563eb;
    background: #eff6ff;
    font-weight: 600;
  }
</style>
```

The `class:active` directive conditionally applies the `active` class. For the blog link, `startsWith('/blog')` ensures it stays highlighted on subpages like `/blog/my-post`. Using `exact: true` for the home link prevents `/` from matching every path.

The `aria-current="page"` attribute is important for accessibility. Screen readers use it to announce which page the user is currently on. It should only be present on the active link.

### Active Link Component

For projects with many navigation menus, extract active link logic into a reusable component:

```svelte
<!-- src/lib/components/NavLink.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  let { href, exact = false, children, ...rest } = $props();

  let active = $derived(
    exact ? page.url.pathname === href : page.url.pathname.startsWith(href)
  );
</script>

<a
  {href}
  class:active
  aria-current={active ? 'page' : undefined}
  {...rest}
>
  {@render children()}
</a>

<style>
  a {
    text-decoration: none;
    color: #666;
    padding: 8px 16px;
    border-radius: 6px;
  }

  a.active {
    color: #2563eb;
    background: #eff6ff;
    font-weight: 600;
  }
</style>
```

```svelte
<!-- Usage -->
<script>
  import NavLink from '$lib/components/NavLink.svelte';
</script>

<nav>
  <NavLink href="/" exact>Home</NavLink>
  <NavLink href="/blog">Blog</NavLink>
  <NavLink href="/docs">Docs</NavLink>
</nav>
```

## Common Patterns

### Auth Guards

The most robust way to protect routes is in a layout's server `load` function:

```typescript
// src/routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return { user: locals.user };
};
```

This runs on the server, works with SSR, and prevents the protected page from ever rendering. Client-side guards with `beforeNavigate` are a secondary layer — useful for UX polish, but not a security boundary.

### Role-Based Route Protection

For more granular access control, combine layout data with page-level checks:

```typescript
// src/routes/(admin)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  if (locals.user.role !== 'admin') {
    throw error(403, 'You do not have permission to access this area.');
  }

  return { user: locals.user };
};
```

### Unsaved Changes Prompt

You need _two_ mechanisms: `beforeNavigate` for client-side navigation within SvelteKit, and `beforeunload` for tab close, refresh, and external navigation:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let formDirty = $state(false);
  let originalData = $state('');
  let currentData = $state('');

  // Track if form has actually changed (not just been touched)
  let hasRealChanges = $derived(currentData !== originalData);

  beforeNavigate(({ cancel, type }) => {
    if (hasRealChanges && type !== 'leave') {
      if (!confirm('Discard unsaved changes?')) {
        cancel();
      }
    }
  });

  function handleSave() {
    originalData = currentData;
    // Save to server...
  }
</script>

<svelte:window onbeforeunload={(e) => {
  if (hasRealChanges) e.preventDefault();
}} />

<textarea bind:value={currentData}></textarea>
<button onclick={handleSave} disabled={!hasRealChanges}>Save</button>
```

Note the distinction between `type !== 'leave'` check: when `type` is `'leave'`, the user is navigating to an external site or closing the tab. Calling `cancel()` has no effect for `'leave'` type, so we skip the confirm dialog and rely on `beforeunload` instead.

### Post-Login Redirect

After login, send the user to their intended destination using `replaceState` so the login page does not stay in browser history:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let email = $state('');
  let password = $state('');
  let error = $state('');

  async function handleLogin() {
    const response = await fetch('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      error = 'Invalid credentials';
      return;
    }

    // Redirect to the page they originally wanted, or dashboard
    const redirectTo = page.url.searchParams.get('redirect') || '/dashboard';

    // replaceState ensures back button does not go to login
    await goto(redirectTo, { replaceState: true });
  }
</script>

{#if error}
  <p class="error">{error}</p>
{/if}

<form onsubmit|preventDefault={handleLogin}>
  <input type="email" bind:value={email} placeholder="Email" />
  <input type="password" bind:value={password} placeholder="Password" />
  <button type="submit">Log In</button>
</form>
```

### Scroll-to-Top on Navigation

SvelteKit automatically scrolls to the top after navigation by default. But for SPAs with complex layouts, you might need custom scroll behavior:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate(() => {
    // Scroll the main content area, not the whole page
    const main = document.querySelector('main');
    if (main) {
      main.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
</script>
```

### Breadcrumb Navigation

Build breadcrumbs reactively from the current URL:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let breadcrumbs = $derived.by(() => {
    const segments = page.url.pathname.split('/').filter(Boolean);
    return segments.map((segment, index) => ({
      label: segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' '),
      href: '/' + segments.slice(0, index + 1).join('/')
    }));
  });
</script>

<nav aria-label="Breadcrumb">
  <ol>
    <li><a href="/">Home</a></li>
    {#each breadcrumbs as crumb, i}
      <li>
        {#if i === breadcrumbs.length - 1}
          <span aria-current="page">{crumb.label}</span>
        {:else}
          <a href={crumb.href}>{crumb.label}</a>
        {/if}
      </li>
    {/each}
  </ol>
</nav>

<style>
  ol {
    display: flex;
    list-style: none;
    padding: 0;
    gap: 4px;
  }

  li + li::before {
    content: '/';
    margin-right: 4px;
    color: #9ca3af;
  }

  span {
    color: #374151;
    font-weight: 500;
  }

  a {
    color: #6b7280;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }
</style>
```

## Complete Navigation System Example

Here is a comprehensive navigation system combining active links, preloading, loading indicators, auth guards, and keyboard shortcuts:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { goto, beforeNavigate, afterNavigate, onNavigate } from '$app/navigation';

  let { data, children }: { data: any; children: Snippet } = $props();

  // Loading state
  let isNavigating = $state(false);

  beforeNavigate(() => {
    isNavigating = true;
  });

  afterNavigate(() => {
    isNavigating = false;
  });

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

  // Keyboard navigation (Cmd+K to focus search)
  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      document.querySelector('#search-input')?.focus();
    }
  }

  // Navigation items
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', exact: true },
    { href: '/projects', label: 'Projects', exact: false },
    { href: '/team', label: 'Team', exact: false },
    { href: '/settings', label: 'Settings', exact: true }
  ];

  function isActive(href, exact) {
    if (exact) return page.url.pathname === href;
    return page.url.pathname.startsWith(href);
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isNavigating}
  <div class="loading-bar" aria-label="Loading">
    <div class="loading-progress"></div>
  </div>
{/if}

<div class="app">
  <header>
    <a href="/dashboard" class="logo">MyApp</a>
    <input
      id="search-input"
      type="search"
      placeholder="Search... (Cmd+K)"
      onkeydown={(e) => {
        if (e.key === 'Enter') {
          goto(`/search?q=${encodeURIComponent(e.currentTarget.value)}`, {
            keepFocus: false
          });
        }
      }}
    />
    <span class="user">{data.user.name}</span>
  </header>

  <div class="body">
    <nav data-sveltekit-preload-data="hover">
      {#each navItems as item}
        <a
          href={item.href}
          class:active={isActive(item.href, item.exact)}
          aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
        >
          {item.label}
        </a>
      {/each}
    </nav>

    <main>
      {@render children()}
    </main>
  </div>
</div>

<style>
  .loading-bar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    z-index: 9999;
    background: transparent;
  }

  .loading-progress {
    height: 100%;
    background: linear-gradient(90deg, #3b82f6, #8b5cf6);
    animation: loading 800ms ease-in-out infinite;
  }

  @keyframes loading {
    0% { width: 0; margin-left: 0; }
    50% { width: 60%; margin-left: 20%; }
    100% { width: 0; margin-left: 100%; }
  }

  .app { display: flex; flex-direction: column; min-height: 100vh; }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 24px;
    border-bottom: 1px solid #e5e7eb;
  }

  .logo {
    font-weight: bold;
    font-size: 1.2rem;
    text-decoration: none;
    color: #1e293b;
  }

  input[type="search"] {
    flex: 1;
    max-width: 400px;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .user {
    margin-left: auto;
    color: #64748b;
  }

  .body { display: flex; flex: 1; }

  nav {
    width: 200px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-right: 1px solid #e5e7eb;
  }

  nav a {
    padding: 8px 12px;
    border-radius: 6px;
    text-decoration: none;
    color: #64748b;
    font-size: 0.9rem;
    transition: background 100ms;
  }

  nav a:hover { background: #f1f5f9; }

  nav a.active {
    background: #eff6ff;
    color: #2563eb;
    font-weight: 600;
  }

  main {
    flex: 1;
    padding: 24px;
  }
</style>
```

## Try It

1. Build a navigation bar with links to at least three pages. Add active link styling using `$app/state`, including `aria-current` for accessibility.
2. Add a button on one page that uses `goto()` to navigate programmatically. Try the `replaceState` option and observe the difference when pressing the back button.
3. Add a `beforeNavigate` guard to a page with a text input. Type something, then try to navigate away — confirm the prompt appears. Also add `beforeunload` for the tab close case.
4. Add `data-sveltekit-preload-data="eager"` to one of your nav links and `"off"` to another. Open the browser Network tab and observe the difference in when data requests fire.
5. Implement an `onNavigate` hook with the View Transitions API. Add CSS rules for `::view-transition-old` and `::view-transition-new` and observe the crossfade effect.
6. Build breadcrumb navigation that updates reactively based on `page.url.pathname`.
7. Implement a search input with `goto()` that uses `keepFocus: true` and `noScroll: true` to update search params without disrupting the user's typing.
8. Bonus: Implement a post-login redirect flow. Navigate to `/dashboard` while not logged in, get redirected to `/login?redirect=/dashboard`, then "log in" and get sent back to `/dashboard` with `replaceState`.

## Key Takeaways

- SvelteKit intercepts `<a>` tag clicks for client-side navigation using event delegation at the document level — no special `<Link>` component needed
- Interception is skipped for external links, `target="_blank"`, modifier keys (Ctrl/Meta), middle-clicks, `download` attribute, and `data-sveltekit-reload`
- `goto()` from `$app/navigation` provides programmatic navigation with options for `replaceState`, `noScroll`, `keepFocus`, and `state` — it returns a Promise that resolves when navigation completes
- `beforeNavigate` lets you cancel navigation and provides full context about the navigation type (`link`, `goto`, `popstate`, `leave`)
- `afterNavigate` runs after the page transitions — use it for analytics, focus management, and scroll behavior
- `onNavigate` integrates with the View Transitions API for smooth cross-page animations as progressive enhancement
- `page` from `$app/state` gives deeply reactive access to the current URL, params, route, data, status, error, form result, and navigation state
- `data-sveltekit-preload-data` controls when load functions run (`hover`, `tap`, `eager`, `off`); `data-sveltekit-preload-code` controls when JS modules download (`hover`, `tap`, `eager`, `viewport`, `off`)
- Style active links by comparing `page.url.pathname` against link hrefs — include `aria-current="page"` for accessibility
- Auth guards belong in server `load` functions for security; client-side guards with `beforeNavigate` are a UX layer, not a security boundary
- Use both `beforeNavigate` and `beforeunload` to fully protect against data loss during navigation
- `pushState` enables shallow routing for modals and overlays that should be dismissible with the back button
- Use `replaceState: true` in `goto()` after login redirects, form submissions, and other terminal navigations where the back button should skip the current page
