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

SvelteKit automatically intercepts clicks on `<a>` tags that point to internal routes. Instead of a full page reload, it fetches the data for the target page, swaps in the new page content, and updates the browser's URL bar. The layout stays mounted, no white flash, no network waterfall. This interception happens at the document level — you do not need to opt in.

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

The `data-sveltekit-reload` attribute is useful for pages served by a different backend or when you need full re-initialization. You can put it on a container element to apply it to all links inside. There is also `data-sveltekit-noscroll`, which prevents SvelteKit from scrolling to the top after navigation — useful for tabs or filtering UI.

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

### goto() Options

`goto()` accepts a second argument with options that control navigation behavior:

```typescript
// Replace the current history entry (back button skips this page)
goto('/dashboard', { replaceState: true });

// Preserve the current scroll position
goto('/results?page=2', { noScroll: true });

// Pass state that is not visible in the URL
goto('/checkout', { state: { fromCart: true } });
```

The `replaceState` option is essential for redirect patterns. After a user logs in, you want to replace the login page in history so pressing back does not return to the login form.

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

The `navigation` object provides `from`, `to`, `type` (one of `'link'`, `'goto'`, `'popstate'`, `'leave'`), and `cancel()`. This gives you full context about what triggered the navigation and where the user is going.

### afterNavigate

`afterNavigate` fires after the page has transitioned. Use it for analytics, scroll restoration, or focus management:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    analytics.track('page_view', {
      path: navigation.to?.url.pathname
    });
  });
</script>
```

`afterNavigate` is the right place for side effects that should happen _after_ the DOM has updated. Unlike `onMount`, which only runs on the initial page load, `afterNavigate` runs on every client-side navigation.

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
- **`page.error`** — the error object, if on an error page

Because `page` from `$app/state` is deeply reactive in Svelte 5, you can reference its properties directly in your template and they update automatically when the URL changes. Use `$derived` when you need to compute a value in the script block:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let isAdmin = $derived(page.url.pathname.startsWith('/admin'));
  let currentSection = $derived(page.url.pathname.split('/')[1] || 'home');
</script>
```

> **Note:** Older code may import `page` from `$app/stores` using the `$page` syntax. Both work, but `$app/state` is the recommended approach for Svelte 5 projects.

## Prefetching for Speed

SvelteKit can preload page data before the user clicks a link. By default, SvelteKit prefetches data when the user hovers over a link. The data is ready by the time they click, making navigation feel instantaneous.

Use `data-sveltekit-preload-data` to control when data is fetched:

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

There is also `data-sveltekit-preload-code`, which preloads only the JavaScript module without running the `load` function. This is cheaper than preloading data (no database queries), making it useful for pages the user _might_ visit. For pages they are _likely_ to visit, preload data too.

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

  const navLinks = [
    { href: '/', label: 'Home', exact: true },
    { href: '/about', label: 'About', exact: true },
    { href: '/blog', label: 'Blog', exact: false }
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

<style>
  a {
    text-decoration: none;
    color: #666;
    padding: 0.5rem 1rem;
    border-bottom: 2px solid transparent;
  }
  a.active {
    color: #ff3e00;
    font-weight: bold;
    border-bottom-color: #ff3e00;
  }
</style>
```

The `class:active` directive conditionally applies the `active` class. For the blog link, `startsWith('/blog')` ensures it stays highlighted on subpages like `/blog/my-post`. Using `exact: true` for the home link prevents `/` from matching every path.

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

### Unsaved Changes Prompt

You need _two_ mechanisms: `beforeNavigate` for client-side navigation within SvelteKit, and `beforeunload` for tab close, refresh, and external navigation:

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
</script>

<svelte:window onbeforeunload={(e) => { if (formDirty) e.preventDefault(); }} />
```

### Post-Login Redirect

After login, send the user to their intended destination using `replaceState` so the login page does not stay in browser history:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  async function handleLogin() {
    const redirectTo = page.url.searchParams.get('redirect') || '/dashboard';
    goto(redirectTo, { replaceState: true });
  }
</script>
```

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
