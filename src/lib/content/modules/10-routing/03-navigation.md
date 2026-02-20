# Navigation

In SvelteKit, navigating between pages is deceptively simple — you use standard HTML `<a>` tags. Behind the scenes, SvelteKit intercepts these clicks and performs **client-side navigation**, loading only the data that changes instead of doing a full page reload. This gives your app the speed of a single-page application with the simplicity of plain HTML links.

Understanding how navigation works in SvelteKit helps you build faster, more responsive applications. This lesson covers links, programmatic navigation, prefetching, and active link styling.

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

SvelteKit automatically intercepts clicks on `<a>` tags that point to internal routes. Instead of a full page reload, it fetches only the new page content and swaps it in. The result is instant, smooth navigation.

## Programmatic Navigation with goto()

Sometimes you need to navigate from JavaScript — after a form submission, a timer, or a button click. Use the `goto()` function from `$app/navigation`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  function handleLogin() {
    // Perform login logic...
    goto('/dashboard');
  }

  function handleSearch(event: Event) {
    const form = event.target as HTMLFormElement;
    const query = new FormData(form).get('q');
    goto(`/search?q=${query}`);
  }
</script>

<button onclick={handleLogin}>
  Log In
</button>
```

`goto()` returns a Promise, so you can `await` it if you need to wait for navigation to complete.

## Prefetching

SvelteKit can preload page data before the user clicks a link. By default, SvelteKit prefetches links when the user hovers over them (using `data-sveltekit-preload-data="hover"`). You can configure this behavior:

```svelte
<!-- Preload on hover (default behavior) -->
<a href="/about">About</a>

<!-- Preload immediately when link is visible -->
<a href="/about" data-sveltekit-preload-data="eager">About</a>

<!-- Disable preloading for this link -->
<a href="/external-site" data-sveltekit-preload-data="off">External</a>
```

You can also set preloading for all links inside an element:

```svelte
<nav data-sveltekit-preload-data="hover">
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>
```

## Active Link Styling

A common pattern is highlighting the current page in the navigation. Use the `$page` store to check the current URL:

```svelte
<script lang="ts">
  import { page } from '$app/stores';
</script>

<nav>
  <a href="/" class:active={$page.url.pathname === '/'}>
    Home
  </a>
  <a href="/about" class:active={$page.url.pathname === '/about'}>
    About
  </a>
  <a href="/blog" class:active={$page.url.pathname.startsWith('/blog')}>
    Blog
  </a>
</nav>

<style>
  a {
    text-decoration: none;
    color: #666;
    padding: 0.5rem 1rem;
  }
  a.active {
    color: #ff3e00;
    font-weight: bold;
    border-bottom: 2px solid #ff3e00;
  }
</style>
```

The `class:active` directive conditionally applies the `active` class. For the blog link, `startsWith('/blog')` ensures it stays highlighted on all blog subpages.

## Try It

Build a navigation bar component with links to at least three pages. Add active link styling using the `$page` store. Then add a button on one page that uses `goto()` to navigate to another page programmatically. Observe how navigation feels instant compared to a full page reload.

## Key Takeaways

- Use standard `<a>` tags for navigation — SvelteKit handles client-side routing automatically
- `goto()` from `$app/navigation` provides programmatic navigation from JavaScript
- SvelteKit **prefetches** link data on hover by default for faster page transitions
- Use `data-sveltekit-preload-data` to control prefetch behavior per link or per container
- Style active links using the `$page` store and `class:active` directive
- Client-side navigation loads only changed content, avoiding full page reloads
