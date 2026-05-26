# Navigation

In SvelteKit, navigating between pages is deceptively simple — you use standard HTML `<a>` tags. Behind the scenes, SvelteKit intercepts these clicks and performs **client-side navigation**, loading only the data that changes instead of doing a full page reload. This gives your app the speed of a single-page application with the simplicity of plain HTML links.

This is an important architectural decision. Many frameworks require you to import a special `<Link>` component and use it everywhere. SvelteKit does not. You write standard HTML, and the framework enhances it. If JavaScript fails to load, the links still work as regular links. This is progressive enhancement at the routing level.

Understanding how navigation works — when SvelteKit intercepts, when it does not, and the lifecycle hooks that fire along the way — is essential for building applications that feel fast, behave correctly, and handle edge cases gracefully.

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

SvelteKit automatically intercepts clicks on `<a>` tags that point to internal routes. Instead of a full page reload, it fetches the data for the target page, swaps in the new page content, and updates the browser's URL bar. The result: instant, smooth navigation. The layout stays mounted. No white flash. No network waterfall.

This interception happens at the document level. SvelteKit listens for click events on the entire document and checks whether the clicked element (or its ancestor) is an `<a>` tag pointing to a route the app owns. You do not need to opt in — it works automatically for every `<a>` tag in your application.

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

The `data-sveltekit-reload` attribute is useful for pages that need a full server round-trip — perhaps because they are served by a different backend, or because you need to re-initialize some client-side state from scratch. You can put it on a container element to apply it to all links inside:

```svelte
<div data-sveltekit-reload>
  <a href="/old-app/page1">Page 1</a>
  <a href="/old-app/page2">Page 2</a>
  <!-- Both links will cause full page reloads -->
</div>
```

There is also `data-sveltekit-noscroll`, which prevents SvelteKit from scrolling to the top after navigation — useful for tabs or filtering UI where the user's scroll position should not change.

## Programmatic Navigation with goto()

Sometimes you need to navigate from JavaScript code — after a form submission, after authentication, or in response to an event. The `goto()` function from `$app/navigation` is your tool:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  function handleLogin() {
    // Perform login logic...
    goto('/dashboard');
  }

  async function handleFormSubmit() {
    const response = await fetch('/api/submit', { method: 'POST' });

    if (response.ok) {
      goto('/success');
    } else {
      goto('/error');
    }
  }
</script>

<button onclick={handleLogin}>
  Log In
</button>
```

`goto()` returns a Promise that resolves when navigation is complete. This matters when you need to run code _after_ the new page has loaded:

```typescript
await goto('/dashboard');
// The dashboard page is now fully rendered and its load function has completed
console.log('Navigation complete');
```

### goto() Options

`goto()` accepts a second argument with options that control navigation behavior:

```typescript
// Replace the current history entry (back button skips this page)
goto('/dashboard', { replaceState: true });

// Preserve the current scroll position
goto('/results?page=2', { noScroll: true });

// Skip running load functions (use cached data)
goto('/dashboard', { invalidateAll: false });

// Pass state that is not visible in the URL
goto('/checkout', {
  state: { fromCart: true, itemCount: 3 }
});
```

The `replaceState` option is essential for redirect patterns. After a user logs in, you typically want to replace the login page in history so that pressing back does not take them back to the login form. This is a small detail that separates a polished app from a frustrating one.

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

The `navigation` object gives you rich information about what is happening:

```typescript
beforeNavigate(({ from, to, type, cancel }) => {
  // from: the current page (URL, params, route)
  // to: the destination page (null if navigating away from the app)
  // type: 'link' | 'goto' | 'popstate' | 'leave'
  // cancel(): prevent the navigation

  if (type === 'leave') {
    // The user is leaving the site entirely (closing tab, typing a new URL)
    // You cannot cancel this, but you can trigger a browser prompt
  }

  console.log(`Navigating from ${from?.url.pathname} to ${to?.url.pathname}`);
});
```

### afterNavigate

`afterNavigate` fires after the page has transitioned. Use it for analytics, scroll restoration, or focus management:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    // Track page view
    analytics.track('page_view', {
      from: navigation.from?.url.pathname,
      to: navigation.to?.url.pathname
    });

    // Focus the main content for accessibility
    document.getElementById('main-content')?.focus();
  });
</script>
```

`afterNavigate` is the right place for side effects that should happen _after_ the DOM has updated. If you try to do this work in `onMount`, it only runs on the initial page load — not on subsequent client-side navigations. `afterNavigate` runs every time.

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

The `page` object includes:

- **`page.url`** — a `URL` object with `pathname`, `searchParams`, `hash`, etc.
- **`page.params`** — the dynamic route parameters (e.g., `{ slug: 'hello' }`)
- **`page.route.id`** — the route's file path (e.g., `/blog/[slug]`)
- **`page.data`** — the data returned by load functions
- **`page.status`** — the HTTP status code
- **`page.error`** — the error object, if on an error page
- **`page.form`** — form action data returned from a `+page.server.ts` action

Because `page` from `$app/state` is deeply reactive in Svelte 5, you can reference its properties directly in your template and they will update automatically when the URL changes. No need for `$derived` when reading directly in the template — but use `$derived` if you want to compute a value in the script block:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
  let currentSection = $derived(page.url.pathname.split('/')[1] || 'home');
</script>
```

> **Note:** You may also see `page` imported from `$app/stores` in older code. That API uses Svelte stores (with the `$page` syntax). Both work, but `$app/state` is the recommended approach for Svelte 5 projects.

## Prefetching for Speed

SvelteKit can preload page data before the user clicks a link. By default, SvelteKit prefetches data when the user hovers over a link. The data is ready by the time they click, making navigation feel instantaneous.

There are two types of prefetching, and they serve different purposes:

### data-sveltekit-preload-data

Preloads the page's data (runs the `load` function):

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

### data-sveltekit-preload-code

Preloads only the JavaScript code for the page (does not run the `load` function):

```svelte
<!-- Preload the JavaScript module eagerly -->
<a href="/heavy-page" data-sveltekit-preload-code="eager">Heavy Page</a>

<!-- Preload code on hover, but do not run load functions -->
<a href="/heavy-page" data-sveltekit-preload-code="hover">Heavy Page</a>
```

The distinction matters for performance tuning. Preloading code is cheap — you are downloading a JavaScript module. Preloading data runs your server load function, which might involve database queries. For pages the user is _likely_ to visit, preload both. For pages they _might_ visit, preload just the code.

You can set preloading on a container to apply it to all links inside:

```svelte
<nav data-sveltekit-preload-data="hover">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>
```

## Active Link Styling

A common pattern is highlighting the current page in the navigation. Use `$app/state` to check the current URL:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<nav>
  <a href="/" class:active={page.url.pathname === '/'}>
    Home
  </a>
  <a href="/about" class:active={page.url.pathname === '/about'}>
    About
  </a>
  <a
    href="/blog"
    class:active={page.url.pathname.startsWith('/blog')}
  >
    Blog
  </a>
</nav>

<style>
  a {
    text-decoration: none;
    color: #666;
    padding: 0.5rem 1rem;
    border-bottom: 2px solid transparent;
    transition: color 0.2s, border-color 0.2s;
  }
  a.active {
    color: #ff3e00;
    font-weight: bold;
    border-bottom-color: #ff3e00;
  }
</style>
```

The `class:active` directive conditionally applies the `active` class. For the blog link, `startsWith('/blog')` ensures it stays highlighted on all blog subpages like `/blog/my-post` or `/blog/category/svelte`.

For cleaner code, extract this into a reusable pattern:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  const navLinks = [
    { href: '/', label: 'Home', exact: true },
    { href: '/about', label: 'About', exact: true },
    { href: '/blog', label: 'Blog', exact: false },
    { href: '/contact', label: 'Contact', exact: true }
  ];

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return page.url.pathname === href;
    return page.url.pathname.startsWith(href);
  }
</script>

<nav>
  {#each navLinks as link}
    <a href={link.href} class:active={isActive(link.href, link.exact)}>
      {link.label}
    </a>
  {/each}
</nav>
```

## Real Example: Navigation Bar with Guards and Redirects

Here is a complete navigation system with active states, programmatic redirects, and an unsaved changes guard:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';
  import { goto, beforeNavigate, afterNavigate } from '$app/navigation';

  let { children }: { children: Snippet } = $props();
  let isLoggedIn = $state(false);

  const navLinks = [
    { href: '/', label: 'Home', exact: true },
    { href: '/blog', label: 'Blog', exact: false },
    { href: '/dashboard', label: 'Dashboard', exact: false, requiresAuth: true }
  ];

  function isActive(href: string, exact: boolean): boolean {
    if (exact) return page.url.pathname === href;
    return page.url.pathname.startsWith(href);
  }

  // Track page views
  afterNavigate((nav) => {
    console.log(`Navigated to ${nav.to?.url.pathname}`);
  });

  function handleAuthClick(href: string) {
    if (!isLoggedIn) {
      goto(`/login?redirect=${encodeURIComponent(href)}`);
    } else {
      goto(href);
    }
  }
</script>

<nav data-sveltekit-preload-data="hover">
  {#each navLinks as link}
    {#if link.requiresAuth}
      <a
        href={link.href}
        class:active={isActive(link.href, link.exact)}
        onclick={(e) => {
          if (!isLoggedIn) {
            e.preventDefault();
            handleAuthClick(link.href);
          }
        }}
      >
        {link.label}
      </a>
    {:else}
      <a href={link.href} class:active={isActive(link.href, link.exact)}>
        {link.label}
      </a>
    {/if}
  {/each}
</nav>

<main>
  {@render children()}
</main>

<style>
  nav {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    background: #1a1a2e;
  }
  a {
    color: #a0a0c0;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: background 0.2s, color 0.2s;
  }
  a:hover {
    background: #16213e;
    color: #e0e0ff;
  }
  a.active {
    background: #0f3460;
    color: #fff;
    font-weight: 600;
  }
  main {
    padding: 2rem;
  }
</style>
```

## Common Patterns

### Auth Guards

Protect routes by checking authentication status in `beforeNavigate` or, more robustly, in a layout's `load` function:

```typescript
// src/routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Redirect to login, preserving the intended destination
    throw redirect(303, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }

  return { user: locals.user };
};
```

This is the preferred approach for auth guards. It runs on the server, works with SSR, and prevents the protected page from ever rendering. Client-side guards with `beforeNavigate` are a secondary layer — useful for UX polish, but not a security boundary.

### Unsaved Changes Prompt

Prevent data loss when a user tries to navigate away from a form with unsaved changes:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let formDirty = $state(false);

  beforeNavigate(({ cancel, type }) => {
    if (formDirty && type !== 'leave') {
      if (!confirm('Discard unsaved changes?')) {
        cancel();
      }
    }
  });

  // Also handle the browser's beforeunload event for tab close/refresh
  function handleBeforeUnload(e: BeforeUnloadEvent) {
    if (formDirty) {
      e.preventDefault();
    }
  }
</script>

<svelte:window onbeforeunload={handleBeforeUnload} />

<form>
  <input type="text" oninput={() => formDirty = true} />
  <button type="submit" onclick={() => formDirty = false}>Save</button>
</form>
```

Notice you need both `beforeNavigate` (for client-side navigation within SvelteKit) and `beforeunload` (for tab close, refresh, and navigation away from the app). They cover different scenarios.

### Post-Login Redirect

After a successful login, redirect the user to wherever they were trying to go:

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  async function handleLogin() {
    // ... authenticate user ...

    const redirectTo = page.url.searchParams.get('redirect') || '/dashboard';
    goto(redirectTo, { replaceState: true });
  }
</script>
```

The `replaceState: true` ensures the login page is not in the browser history after redirect. Pressing back from the dashboard will not take the user back to the login form.

## Try It

1. Build a navigation bar with links to at least three pages. Add active link styling using `$app/state`.
2. Add a button on one page that uses `goto()` to navigate programmatically. Try the `replaceState` option and observe the difference when pressing the back button.
3. Add a `beforeNavigate` guard to a page with a text input. Type something, then try to navigate away — confirm the prompt appears.
4. Add `data-sveltekit-preload-data="eager"` to one of your nav links and `"off"` to another. Open the browser Network tab and observe the difference in when data requests fire.
5. Bonus: Implement a post-login redirect flow. Navigate to `/dashboard` while not logged in, get redirected to `/login?redirect=/dashboard`, then "log in" and get sent back to `/dashboard`.

## Key Takeaways

- SvelteKit intercepts `<a>` tag clicks for client-side navigation — no special `<Link>` component needed
- Interception is skipped for external links, `target="_blank"`, middle-clicks, and `data-sveltekit-reload`
- `goto()` from `$app/navigation` provides programmatic navigation with options for `replaceState`, `noScroll`, and state passing
- `beforeNavigate` lets you cancel navigation (unsaved changes prompts, auth guards)
- `afterNavigate` runs after the page transitions (analytics, focus management)
- `page` from `$app/state` gives reactive access to the current URL, params, route, and data
- `data-sveltekit-preload-data` and `data-sveltekit-preload-code` control prefetching granularity for performance tuning
- Style active links by comparing `page.url.pathname` against link hrefs
- Auth guards belong in server `load` functions for security; client-side guards are a UX layer
- Use both `beforeNavigate` and `beforeunload` to fully protect against data loss during navigation
