# Layouts

Most websites have elements that appear on every page — a navigation bar, a footer, a sidebar. Instead of duplicating that code in every `+page.svelte` file, SvelteKit provides **layouts**. A layout wraps your pages with shared UI so you write it once and it applies everywhere.

Layouts use the special `+layout.svelte` file. Any page in the same directory (or nested directories) automatically gets wrapped by that layout. This keeps your code DRY and your site consistent.

## Your First Layout

Create a `+layout.svelte` file in `src/routes/`:

```svelte
<!-- src/routes/+layout.svelte -->
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>

<main>
  {@render children()}
</main>

<footer>
  <p>&copy; 2025 My Site</p>
</footer>

<style>
  nav {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    background: #f0f0f0;
  }
  main {
    padding: 2rem;
    min-height: 80vh;
  }
</style>
```

The `{@render children()}` tag is where SvelteKit injects the current page content. When you visit `/about`, the about page appears inside the `<main>` tag, wrapped by the nav and footer.

## How Layouts Receive Children

In Svelte 5, layouts receive their page content through a `children` snippet prop:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>

{@render children()}
```

## Nested Layouts

Layouts can be nested. A layout in a subdirectory wraps pages in that subdirectory, and it itself is wrapped by the parent layout:

```bash
src/routes/
├── +layout.svelte              # Root layout (nav + footer)
├── +page.svelte                # Home page
└── blog/
    ├── +layout.svelte          # Blog layout (adds sidebar)
    └── +page.svelte            # Blog index
```

```svelte
<!-- src/routes/blog/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="blog-layout">
  <aside>
    <h3>Categories</h3>
    <a href="/blog?cat=svelte">Svelte</a>
    <a href="/blog?cat=css">CSS</a>
  </aside>

  <article>
    {@render children()}
  </article>
</div>
```

The blog page gets the root nav, the blog sidebar, and then the page content — all nested automatically.

## Route Groups

Sometimes you want different layouts for different sections without affecting the URL. Use **route groups** by wrapping a folder name in parentheses:

```bash
src/routes/
├── (marketing)/
│   ├── +layout.svelte          # Marketing layout
│   ├── +page.svelte            # / (home)
│   └── pricing/
│       └── +page.svelte        # /pricing
└── (app)/
    ├── +layout.svelte          # App layout (dashboard UI)
    └── dashboard/
        └── +page.svelte        # /dashboard
```

The parenthesized folder names do not appear in the URL. `/pricing` still works — but it uses the marketing layout instead of the app layout.

## Try It

Create a root layout with a navigation bar that links to Home, About, and Blog. Then create a nested layout inside `src/routes/blog/` that adds a sidebar. Visit each page and observe how the layouts nest together.

## Key Takeaways

- `+layout.svelte` wraps pages with shared UI like navigation and footers
- Use `{@render children()}` to render the page content inside a layout
- Layouts apply to all pages in the same directory and its subdirectories
- **Nested layouts** stack — child layouts are wrapped by parent layouts
- **Route groups** `(name)` let you use different layouts without changing URLs
- Layouts keep your code DRY and your site visually consistent
