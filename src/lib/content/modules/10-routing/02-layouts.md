# Layouts

Most websites have elements that appear on every page — a navigation bar, a footer, a sidebar. You could copy that markup into every `+page.svelte` file, but that violates a fundamental engineering principle: don't repeat yourself. When you need to change the nav, you would have to change it in twenty places. SvelteKit solves this with **layouts**.

A layout is a persistent shell that wraps your pages. Think of it like a picture frame: the frame stays the same while you swap different pictures in and out. Navigation between pages only replaces the page content — the layout stays mounted, preserving its state, its scroll position, and any open dropdowns or modals that live in it.

This is not just a DRY convenience. Layouts are an architectural decision. They define the visual and structural skeleton of your application. Understanding how they compose, nest, and share data will shape how you think about your entire app's structure.

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

The `{@render children()}` tag is the crucial piece. It tells SvelteKit "insert the current page content here." When you visit `/about`, the about page appears inside the `<main>` tag, wrapped by the nav and footer. When you navigate to `/blog`, only the content inside `<main>` changes — the nav and footer stay exactly where they are.

## How Layouts Receive Children

In Svelte 5, layouts receive their page content through a `children` snippet prop. You can explicitly destructure it from `$props()` if you need to reference it alongside other props:

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

You can also use `{@render children()}` without explicitly declaring the prop — SvelteKit injects it automatically. The explicit form is useful when you need TypeScript to understand the prop shape, or when your layout accepts additional snippet props for named slots.

## Layout Persistence: Why It Matters

Here is the key insight that separates beginners from experienced SvelteKit developers: **layouts do not re-render when you navigate between pages within the same layout group.** The layout component stays mounted. Only the page content swaps.

This has real consequences:

- **State persists.** A search input in the nav keeps its value as you navigate between pages.
- **Transitions are smooth.** The nav does not flash or re-mount, so CSS transitions on the layout work naturally.
- **Network requests are not repeated.** If the layout loads data via `+layout.server.ts`, that data is not re-fetched when navigating between sibling pages.
- **Web socket connections stay open.** If the layout establishes a connection, it survives page transitions.

This persistence is the reason SvelteKit layouts feel fundamentally different from "just including a header component." A shared header component re-mounts on every page. A layout does not.

## Nested Layouts

Layouts compose automatically based on directory nesting. A layout in a subdirectory wraps pages in that subdirectory, and it is itself wrapped by the parent layout:

```bash
src/routes/
├── +layout.svelte              # Root layout (nav + footer)
├── +page.svelte                # Home page
└── dashboard/
    ├── +layout.svelte          # Dashboard layout (adds sidebar)
    ├── +page.svelte            # /dashboard
    ├── analytics/
    │   └── +page.svelte        # /dashboard/analytics
    └── settings/
        └── +page.svelte        # /dashboard/settings
```

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="dashboard-layout">
  <aside>
    <h3>Dashboard</h3>
    <a href="/dashboard">Overview</a>
    <a href="/dashboard/analytics">Analytics</a>
    <a href="/dashboard/settings">Settings</a>
  </aside>

  <section class="dashboard-content">
    {@render children()}
  </section>
</div>

<style>
  .dashboard-layout {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 2rem;
  }
  aside {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: #f8f8f8;
    border-right: 1px solid #e0e0e0;
  }
</style>
```

When a user visits `/dashboard/analytics`, SvelteKit composes the view like a set of nesting dolls:

1. **Root layout** — renders the site-wide nav and footer, with `{@render children()}` in the middle
2. **Dashboard layout** — fills the root layout's children slot, renders the sidebar and `{@render children()}`
3. **Analytics page** — fills the dashboard layout's children slot

Every level of nesting adds a layer. This composability means you can build complex multi-section applications without any single file becoming unwieldy.

## Layout Data Loading

Layouts can load data just like pages. Create a `+layout.server.ts` file and export a `load` function:

```typescript
// src/routes/dashboard/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  // This data is available to the layout AND all child pages
  return {
    user: {
      name: 'Alice',
      role: 'admin',
      avatar: '/avatars/alice.jpg'
    },
    notifications: 3
  };
};
```

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();
</script>

<div class="dashboard-layout">
  <aside>
    <div class="user-info">
      <img src={data.user.avatar} alt={data.user.name} />
      <span>{data.user.name}</span>
      {#if data.notifications > 0}
        <span class="badge">{data.notifications}</span>
      {/if}
    </div>
    <nav>
      <a href="/dashboard">Overview</a>
      <a href="/dashboard/analytics">Analytics</a>
      <a href="/dashboard/settings">Settings</a>
    </nav>
  </aside>

  <section>
    {@render children()}
  </section>
</div>
```

The data returned from a layout's load function is available to the layout component _and_ to every child page through their own `data` prop. This is how you share common data — like the current user, permissions, or feature flags — across an entire section of your app without prop drilling.

The layout load function runs once and does not re-run as you navigate between child pages. This is efficient by design: the user data does not change just because you moved from `/dashboard` to `/dashboard/settings`.

## Route Groups for Multiple Layouts

Route groups (parenthesized folders) are the primary tool for applying different layouts to different parts of your app without affecting URLs:

```bash
src/routes/
├── (marketing)/
│   ├── +layout.svelte          # Full-width, colorful marketing layout
│   ├── +page.svelte            # / (home page)
│   ├── about/
│   │   └── +page.svelte        # /about
│   └── pricing/
│       └── +page.svelte        # /pricing
├── (app)/
│   ├── +layout.svelte          # Dashboard layout with sidebar
│   ├── dashboard/
│   │   └── +page.svelte        # /dashboard
│   └── settings/
│       └── +page.svelte        # /settings
└── (auth)/
    ├── +layout.svelte          # Minimal centered layout (no nav)
    ├── login/
    │   └── +page.svelte        # /login
    └── register/
        └── +page.svelte        # /register
```

Three completely different visual experiences, clean URLs, zero duplication. The marketing site has a big hero layout. The app has a sidebar navigation. The auth pages have a minimal centered card. Each group has its own `+layout.svelte`, and the parenthesized folder names never appear in the URL.

This is one of SvelteKit's most powerful organizational tools. Without route groups, you would either need all these sections to share a single layout (and fill it with conditional logic), or restructure your URLs around your layout needs. Route groups let your layout architecture and your URL architecture evolve independently.

## Breaking Out of Layouts with Layout Resets

Sometimes a page needs to escape its parent layout entirely. A common example: a `/dashboard/settings/billing` page that needs a full-width layout instead of the sidebar. Use the `@` syntax in the filename:

```bash
src/routes/dashboard/
├── +layout.svelte              # Dashboard layout (sidebar)
├── +page.svelte                # /dashboard — uses dashboard layout
└── print/
    └── +page@.svelte           # /dashboard/print — uses ROOT layout only
```

The `@` followed by nothing means "reset all the way to the root layout." You can also target a specific ancestor layout:

```bash
+page@(app).svelte              # Reset to the (app) group's layout
+page@dashboard.svelte          # Reset to the dashboard layout
```

Use layout resets sparingly. They are a powerful escape hatch, but if you find yourself resetting often, it might be a signal that your layout hierarchy needs rethinking.

## Real Example: Full Application Layout Structure

Here is a layout architecture for a SaaS application with a marketing site, an authenticated dashboard, and auth pages:

```bash
src/routes/
├── +layout.svelte                 # Absolute root: fonts, CSS reset, providers
├── (marketing)/
│   ├── +layout.svelte             # Marketing: full-width nav, hero areas, footer
│   ├── +page.svelte               # /
│   ├── features/
│   │   └── +page.svelte           # /features
│   └── pricing/
│       └── +page.svelte           # /pricing
├── (app)/
│   ├── +layout.svelte             # App shell: sidebar, top bar, notifications
│   ├── +layout.server.ts          # Load user, permissions, feature flags
│   ├── dashboard/
│   │   └── +page.svelte           # /dashboard
│   ├── projects/
│   │   ├── +page.svelte           # /projects (list)
│   │   └── [id]/
│   │       ├── +page.svelte       # /projects/abc-123 (detail)
│   │       └── settings/
│   │           └── +page.svelte   # /projects/abc-123/settings
│   └── account/
│       └── +page.svelte           # /account
└── (auth)/
    ├── +layout.svelte             # Auth: centered card, no nav
    ├── login/
    │   └── +page.svelte           # /login
    └── register/
        └── +page.svelte           # /register
```

```svelte
<!-- src/routes/+layout.svelte (absolute root) -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();
</script>

<div class="app-shell">
  <header class="top-bar">
    <h1>MyApp</h1>
    <span>Welcome, {data.user.name}</span>
  </header>

  <div class="app-body">
    <nav class="sidebar">
      <a href="/dashboard">Dashboard</a>
      <a href="/projects">Projects</a>
      <a href="/account">Account</a>
    </nav>

    <main>
      {@render children()}
    </main>
  </div>
</div>
```

The root layout is intentionally minimal — just global styles and providers. Each route group's layout defines the visual structure for its section. The `(app)` layout loads user data in `+layout.server.ts`, and every page under it (dashboard, projects, account) can access that data without fetching it themselves.

## The Mental Model

Layouts are **persistent shells**, and pages are **swappable content**. When a user navigates from `/dashboard` to `/dashboard/analytics`, SvelteKit does not rebuild the dashboard layout. It unmounts the dashboard overview page, mounts the analytics page, and inserts it into the layout's `{@render children()}` slot. The layout never blinks.

Think of your layout hierarchy as a set of concentric rectangles. The outermost rectangle is your root layout. Each nested layout adds another rectangle inside. Pages fill the innermost rectangle. Navigation within a section only redraws the innermost rectangle — everything outside it stays stable.

This mental model should guide your architectural decisions: put shared navigation in layouts, put per-page content in pages, and use route groups to define which pages share which shells.

## Try It

1. Create a root layout in `src/routes/+layout.svelte` with a navigation bar linking to Home, About, and Blog.
2. Create a nested layout inside `src/routes/blog/` that adds a sidebar with category links.
3. Visit each page and observe how the nav persists while only the page content changes.
4. Add a counter button to your root layout's nav. Navigate between pages and confirm the counter value survives navigation — proving the layout stays mounted.
5. Bonus: Create two route groups, `(marketing)` and `(app)`, with different layouts. Verify that `/` uses the marketing layout and `/dashboard` uses the app layout, with clean URLs.

## Key Takeaways

- `+layout.svelte` wraps pages with shared UI — navigation, sidebars, footers
- `{@render children()}` is the insertion point where SvelteKit renders the current page inside the layout
- Layouts **persist across navigation** — they do not re-mount when navigating between sibling pages, which preserves state and avoids redundant work
- **Nested layouts** compose automatically based on directory nesting — each level adds another wrapper
- `+layout.server.ts` loads data once and shares it with the layout and all child pages
- **Route groups** `(name)` let you apply different layouts to different sections without affecting URLs
- **Layout resets** with `+page@.svelte` let a page escape its parent layouts when needed
- Layouts are persistent shells, pages are swappable content — this is the fundamental mental model
