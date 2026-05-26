# Layouts

Most websites have elements that appear on every page — a navigation bar, a footer, a sidebar. You could copy that markup into every `+page.svelte` file, but that violates a fundamental engineering principle: don't repeat yourself. When you need to change the nav, you would have to change it in twenty places. SvelteKit solves this with **layouts**.

A layout is a persistent shell that wraps your pages. Think of it like a picture frame: the frame stays the same while you swap different pictures in and out. Navigation between pages only replaces the page content — the layout stays mounted, preserving its state, its scroll position, and any open dropdowns or modals that live in it.

This is not just a DRY convenience. Layouts are an architectural decision. They define the visual and structural skeleton of your application. Understanding how they compose, nest, and share data will shape how you think about your entire app's structure. Bad layout architecture means fighting the framework on every feature. Good layout architecture means the framework does most of the work for you.

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

## How {@render children()} Works

In Svelte 5, layouts receive their page content through a `children` snippet prop. SvelteKit passes the current page component as the `children` snippet automatically. You can explicitly destructure it from `$props()` if you need to reference it alongside other props:

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

You can also use `{@render children()}` without explicitly declaring the prop — SvelteKit injects it automatically. The explicit form is useful when you need TypeScript to understand the prop shape, or when your layout accepts additional snippet props.

### What Children Actually Is

Under the hood, `children` is a Svelte 5 snippet — a function that renders markup. When SvelteKit determines which page to show, it wraps that page component in a snippet and passes it to the layout. This is the same mechanism regular components use for snippet props, but SvelteKit manages it for you.

This means you can conditionally render `children`, wrap it in additional elements, or even render it multiple times (though you should never do that with page content). The snippet approach replaced the Svelte 4 `<slot />` mechanism and is more explicit about what is being rendered.

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let sidebarOpen = $state(true);
</script>

<!-- You control exactly where and how children renders -->
<div class="layout" class:sidebar-collapsed={!sidebarOpen}>
  <aside>
    <button onclick={() => sidebarOpen = !sidebarOpen}>
      {sidebarOpen ? 'Collapse' : 'Expand'}
    </button>
    {#if sidebarOpen}
      <nav>
        <a href="/dashboard">Dashboard</a>
        <a href="/settings">Settings</a>
      </nav>
    {/if}
  </aside>

  <main>
    {@render children()}
  </main>
</div>
```

## Layout Persistence: Why It Matters

Here is the key insight that separates beginners from experienced SvelteKit developers: **layouts do not re-render when you navigate between pages within the same layout group.** The layout component stays mounted. Only the page content swaps.

This has real consequences:

- **State persists.** A search input in the nav keeps its value as you navigate between pages. A counter in the sidebar does not reset. An audio player in the footer keeps playing.
- **Transitions are smooth.** The nav does not flash or re-mount, so CSS transitions on the layout work naturally.
- **Network requests are not repeated.** If the layout loads data via `+layout.server.ts`, that data is not re-fetched when navigating between sibling pages.
- **Web socket connections stay open.** If the layout establishes a connection, it survives page transitions.
- **Timers and intervals continue.** A countdown timer or polling interval in the layout keeps running across page navigations.
- **`$effect` cleanup does not fire.** Effects in the layout are not torn down when navigating between child pages.

This persistence is the reason SvelteKit layouts feel fundamentally different from "just including a header component." A shared header component re-mounts on every page. A layout does not.

### Proving Persistence with a Counter

Here is a simple experiment to prove layout persistence:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  let count = $state(0);
</script>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <button onclick={() => count++}>Layout counter: {count}</button>
</nav>

<main>
  {@render children()}
</main>
```

Click the button a few times to increment the counter, then navigate to a different page. The counter value survives. It does not reset. The layout component was never unmounted — SvelteKit only swapped the `children` content.

### When Does a Layout Re-mount?

A layout re-mounts only when you navigate to a route that uses a **different** layout. If you go from `/dashboard` (which uses the dashboard layout) to `/login` (which uses the auth layout), the dashboard layout unmounts and the auth layout mounts. Navigating between `/dashboard` and `/dashboard/settings` does NOT re-mount the dashboard layout.

The root layout (`src/routes/+layout.svelte`) almost never re-mounts during client-side navigation. It only re-mounts on a full page reload (Ctrl+R, hard refresh, or navigating from an external site).

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

### Deep Nesting Example

You can nest as deeply as you need:

```bash
src/routes/
├── +layout.svelte                        # Level 0: site chrome
├── admin/
│   ├── +layout.svelte                    # Level 1: admin sidebar
│   ├── users/
│   │   ├── +layout.svelte               # Level 2: user list/detail split
│   │   ├── +page.svelte                 # /admin/users (user list)
│   │   └── [id]/
│   │       ├── +layout.svelte           # Level 3: user detail tabs
│   │       ├── +page.svelte             # /admin/users/123 (profile tab)
│   │       ├── permissions/
│   │       │   └── +page.svelte         # /admin/users/123/permissions
│   │       └── activity/
│   │           └── +page.svelte         # /admin/users/123/activity
```

When visiting `/admin/users/123/permissions`, the layout stack is:
1. Root layout (site chrome)
2. Admin layout (admin sidebar)
3. Users layout (list/detail split view)
4. User detail layout (tabs: Profile, Permissions, Activity)
5. Permissions page

Each level persists independently. Navigating from `/admin/users/123/permissions` to `/admin/users/123/activity` only re-renders level 4's children (swapping the permissions page for the activity page). Levels 0-3 are untouched.

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

### Data Cascading: How Child Pages Inherit Layout Data

The data returned from a layout's load function is available to the layout component AND to every child page through their own `data` prop. This is how you share common data — like the current user, permissions, or feature flags — across an entire section of your app without prop drilling.

```typescript
// src/routes/dashboard/+layout.server.ts
export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user,
    permissions: locals.permissions
  };
};
```

```typescript
// src/routes/dashboard/settings/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  // parent() gives you access to the layout's data
  const layoutData = await parent();

  // You can use layout data in your page load function
  const canEditSettings = layoutData.permissions.includes('admin');

  return {
    canEditSettings,
    settings: await fetchSettings()
  };
};
```

```svelte
<!-- src/routes/dashboard/settings/+page.svelte -->
<script lang="ts">
  // data contains BOTH layout data AND page data, merged
  let { data } = $props();

  // From layout: data.user, data.permissions
  // From page: data.canEditSettings, data.settings
</script>

<h1>Settings</h1>
<p>Logged in as: {data.user.name}</p>

{#if data.canEditSettings}
  <form><!-- settings form --></form>
{:else}
  <p>You do not have permission to edit settings.</p>
{/if}
```

The data merging is automatic: SvelteKit combines the layout's returned data with the page's returned data. If both return a property with the same key, the page's value takes precedence. This is usually a mistake — avoid key collisions between layout and page data.

### When Layout Data Re-runs

The layout load function runs once and does not re-run as you navigate between child pages. This is efficient by design: the user data does not change just because you moved from `/dashboard` to `/dashboard/settings`.

The layout load DOES re-run when:
- The URL parameters that the layout depends on change (via `depends()`)
- You call `invalidate()` or `invalidateAll()` from client code
- A form action with `update()` completes
- The user does a full page reload

You can control this with the `depends` function:

```typescript
// src/routes/dashboard/+layout.server.ts
export const load: LayoutServerLoad = async ({ locals, depends }) => {
  // Re-run this load function when 'app:user' is invalidated
  depends('app:user');

  return { user: locals.user };
};
```

```svelte
<!-- In any child page or component -->
<script>
  import { invalidate } from '$app/navigation';

  async function refreshUser() {
    // This triggers the layout load to re-run
    await invalidate('app:user');
  }
</script>
```

### Universal vs Server Layout Load

Like pages, layouts support both server-only and universal load functions:

```typescript
// +layout.server.ts — runs only on the server
// Can access databases, file system, secrets
export const load: LayoutServerLoad = async ({ locals }) => {
  return { user: locals.user };
};

// +layout.ts — runs on server AND client
// Good for data that does not need server-only resources
export const load: LayoutLoad = async ({ fetch }) => {
  const res = await fetch('/api/config');
  return { config: await res.json() };
};
```

You can have both `+layout.server.ts` and `+layout.ts` for the same layout. The server load runs first, and its data is available to the universal load via `await parent()`.

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

### Why Route Groups Matter Architecturally

Without route groups, you would face a painful choice:

1. **Single layout with conditionals**: One layout that checks `page.url.pathname` to decide what to show. This creates a god-component that grows unmanageable.
2. **URLs dictated by layouts**: Restructuring URLs so that `/app/dashboard` and `/auth/login` get different layouts. But now your URLs reflect your layout architecture instead of your content hierarchy.
3. **No layouts at all**: Using components for shared UI. This loses persistence, data cascading, and the entire layout lifecycle.

Route groups solve all three problems. Your URL architecture and your layout architecture evolve independently.

### Route Group Data Loading

Each route group can have its own `+layout.server.ts`:

```typescript
// src/routes/(app)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Protect all routes in the (app) group
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  return {
    user: locals.user,
    subscription: locals.subscription
  };
};
```

```typescript
// src/routes/(marketing)/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  // Marketing pages might load site-wide config
  return {
    announcement: 'New feature launched! Check it out.',
    showBanner: true
  };
};
```

```typescript
// src/routes/(auth)/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  // Already authenticated? Redirect to dashboard
  if (locals.user) {
    throw redirect(303, '/dashboard');
  }

  return {};
};
```

Each group's load function runs independently. The `(app)` group enforces authentication. The `(auth)` group redirects authenticated users away from login. The `(marketing)` group loads public config. This is declarative security — the authorization check is part of the layout's data loading, not scattered across individual pages.

### Multiple Groups at the Same Level

You can have as many route groups as you need. Here is a more complex example:

```bash
src/routes/
├── +layout.svelte                  # Root: global CSS, error boundary
├── (marketing)/
│   ├── +layout.svelte              # Full-width hero layout
│   └── ...
├── (app)/
│   ├── +layout.svelte              # Sidebar layout
│   ├── +layout.server.ts           # Auth check
│   └── ...
├── (admin)/
│   ├── +layout.svelte              # Admin layout (different sidebar)
│   ├── +layout.server.ts           # Admin role check
│   └── ...
├── (docs)/
│   ├── +layout.svelte              # Docs layout (TOC sidebar)
│   └── ...
└── (auth)/
    ├── +layout.svelte              # Centered card layout
    └── ...
```

Each group is independent. They can have different auth requirements, different data loading, different visual layouts. The root layout wraps all of them, providing global CSS and error handling.

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

### How Layout Resets Work

When SvelteKit encounters `+page@.svelte`, it skips all intermediate layouts and renders the page directly inside the root layout. The layout hierarchy for that page becomes:

```
Root layout → Page (no intermediate layouts)
```

When SvelteKit encounters `+page@(app).svelte`, the hierarchy becomes:

```
Root layout → (app) layout → Page (skipping any deeper layouts)
```

### Practical Use Cases for Layout Resets

**Print-friendly pages**: A receipt or invoice page under `/dashboard/orders/123/receipt` needs a clean layout without the sidebar, header, or footer:

```bash
src/routes/dashboard/orders/[id]/
├── +page.svelte                    # Normal order detail (with sidebar)
└── receipt/
    └── +page@.svelte              # Clean printable receipt (root layout only)
```

**Full-screen modals**: A page that should overlay the entire viewport:

```bash
src/routes/(app)/settings/
├── +page.svelte                    # Normal settings (with sidebar)
└── onboarding/
    └── +page@.svelte              # Full-screen onboarding flow
```

**Embedded views**: A page designed to be loaded in an iframe or widget:

```bash
src/routes/(app)/widgets/
└── [widgetId]/
    └── embed/
        └── +page@.svelte          # Minimal layout for iframe embedding
```

Use layout resets sparingly. They are a powerful escape hatch, but if you find yourself resetting often, it might be a signal that your layout hierarchy needs rethinking.

## Layout-Level Error Boundaries

Layouts can have their own `+error.svelte` files, which act as error boundaries for all pages within that layout:

```bash
src/routes/
├── +layout.svelte
├── +error.svelte                   # Root error boundary
├── (app)/
│   ├── +layout.svelte
│   ├── +error.svelte               # App-specific error page (still has sidebar)
│   ├── dashboard/
│   │   └── +page.svelte
│   └── settings/
│       └── +page.svelte
```

When a page under `(app)` throws an error (either in its `load` function or during rendering), SvelteKit looks for the nearest `+error.svelte` in the layout hierarchy. If `/dashboard`'s load fails, `(app)/+error.svelte` handles it — and the `(app)` layout (with its sidebar) is still rendered. The error page replaces just the page content, not the entire shell.

```svelte
<!-- src/routes/(app)/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error">
  <h1>{page.status}</h1>
  <p>{page.error?.message || 'Something went wrong'}</p>
  <a href="/dashboard">Back to Dashboard</a>
</div>

<style>
  .error {
    text-align: center;
    padding: 3rem;
  }
</style>
```

This means your users still see the navigation sidebar when an error occurs. They can navigate away from the error without reloading the page. This is a much better experience than a full-page error screen that breaks the entire UI.

### Error Boundary Cascading

If the `(app)` error page itself throws an error, SvelteKit looks one level up for the root `+error.svelte`. If that also fails, SvelteKit renders its built-in static error page. The cascading ensures you always have a fallback.

If the layout's `load` function itself throws (not the page's load), then the layout cannot render at all. SvelteKit falls back to the *parent* layout's error boundary. This is why the root layout should be as simple as possible — if it fails, there is nothing to catch the error.

## Persistent State Across Navigations

Because layouts persist, they are the natural place for state that should survive page navigation:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setContext } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();

  // This state persists across ALL page navigations within (app)
  let sidebarOpen = $state(true);
  let recentSearches = $state([]);
  let theme = $state('light');

  // Share persistent state with child pages via context
  setContext('app', {
    get sidebarOpen() { return sidebarOpen; },
    set sidebarOpen(v) { sidebarOpen = v; },
    get theme() { return theme; },
    set theme(v) { theme = v; },
    addSearch(query) {
      recentSearches = [query, ...recentSearches.slice(0, 9)];
    }
  });
</script>

<div class="app-shell" class:dark={theme === 'dark'}>
  <aside class:collapsed={!sidebarOpen}>
    <button onclick={() => sidebarOpen = !sidebarOpen}>
      {sidebarOpen ? 'Collapse' : 'Expand'}
    </button>
    {#if sidebarOpen}
      <nav>
        <a href="/dashboard">Dashboard</a>
        <a href="/projects">Projects</a>
      </nav>
      {#if recentSearches.length > 0}
        <div class="recent">
          <h4>Recent Searches</h4>
          {#each recentSearches as search}
            <span>{search}</span>
          {/each}
        </div>
      {/if}
    {/if}
  </aside>

  <main>
    {@render children()}
  </main>
</div>
```

The sidebar collapse state, recent searches, and theme preference all persist as the user navigates between dashboard, projects, and any other page under `(app)`. Child pages can read and modify this shared state through context.

## Complete SaaS Application Layout Architecture

Here is a realistic layout architecture for a production SaaS application with authentication, admin panels, and public pages:

```bash
src/routes/
├── +layout.svelte                          # Root: global CSS, font loading
├── +layout.server.ts                       # Root: optional session check
├── +error.svelte                           # Root: fallback error page
│
├── (marketing)/
│   ├── +layout.svelte                      # Marketing: hero nav, big footer
│   ├── +page.svelte                        # / (landing page)
│   ├── about/
│   │   └── +page.svelte                    # /about
│   ├── pricing/
│   │   └── +page.svelte                    # /pricing
│   └── blog/
│       ├── +layout.svelte                  # Blog-specific layout (TOC sidebar)
│       ├── +page.svelte                    # /blog (post listing)
│       └── [slug]/
│           └── +page.svelte               # /blog/some-post
│
├── (auth)/
│   ├── +layout.svelte                      # Auth: centered card, no nav
│   ├── +layout.server.ts                   # Redirect if already authenticated
│   ├── login/
│   │   └── +page.svelte                    # /login
│   ├── register/
│   │   └── +page.svelte                    # /register
│   └── forgot-password/
│       └── +page.svelte                    # /forgot-password
│
├── (app)/
│   ├── +layout.svelte                      # App: sidebar + header
│   ├── +layout.server.ts                   # Auth guard + user data
│   ├── +error.svelte                       # App-specific error (keeps sidebar)
│   ├── dashboard/
│   │   └── +page.svelte                    # /dashboard
│   ├── projects/
│   │   ├── +page.svelte                    # /projects (list)
│   │   └── [id]/
│   │       ├── +layout.svelte              # Project layout (tabs)
│   │       ├── +page.svelte                # /projects/123 (overview)
│   │       ├── tasks/
│   │       │   └── +page.svelte            # /projects/123/tasks
│   │       └── settings/
│   │           └── +page.svelte            # /projects/123/settings
│   └── account/
│       └── +page.svelte                    # /account
│
└── (admin)/
    ├── +layout.svelte                      # Admin: distinct admin nav
    ├── +layout.server.ts                   # Admin role check
    ├── admin/
    │   ├── +page.svelte                    # /admin (admin dashboard)
    │   ├── users/
    │   │   └── +page.svelte                # /admin/users
    │   └── billing/
    │       └── +page.svelte                # /admin/billing
```

The root layout is intentionally minimal — just global CSS and perhaps a context provider:

```svelte
<!-- src/routes/+layout.svelte (absolute root) -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

The `(app)` layout provides the full application shell:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/state';

  let { data, children }: { data: any; children: Snippet } = $props();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/projects', label: 'Projects', icon: '📁' },
    { href: '/account', label: 'Account', icon: '👤' }
  ];
</script>

<div class="app-shell">
  <header>
    <h1>MyApp</h1>
    <span>Welcome, {data.user.name}</span>
  </header>

  <div class="app-body">
    <nav class="sidebar">
      {#each navItems as item}
        <a
          href={item.href}
          class:active={page.url.pathname.startsWith(item.href)}
        >
          <span>{item.icon}</span>
          {item.label}
        </a>
      {/each}
    </nav>

    <main>{@render children()}</main>
  </div>
</div>

<style>
  .app-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 2rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .app-body {
    display: flex;
    flex: 1;
  }

  .sidebar {
    width: 240px;
    padding: 1rem;
    border-right: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    text-decoration: none;
    color: #374151;
  }

  .sidebar a.active {
    background: #eff6ff;
    color: #2563eb;
    font-weight: 500;
  }

  main {
    flex: 1;
    padding: 2rem;
  }
</style>
```

Every page under `(app)` — dashboard, projects, account — can access `data.user` without fetching it themselves. The layout loaded it once, and it persists across all navigation within that group.

## The Mental Model

Layouts are **persistent shells**, and pages are **swappable content**. When a user navigates from `/dashboard` to `/dashboard/analytics`, SvelteKit does not rebuild the dashboard layout. It unmounts the dashboard overview page, mounts the analytics page, and inserts it into the layout's `{@render children()}` slot. The layout never blinks.

Think of your layout hierarchy as a set of concentric rectangles. The outermost rectangle is your root layout. Each nested layout adds another rectangle inside. Pages fill the innermost rectangle. Navigation within a section only redraws the innermost rectangle — everything outside it stays stable.

This mental model should guide your architectural decisions: put shared navigation in layouts, put per-page content in pages, and use route groups to define which pages share which shells. When in doubt, ask yourself: "Should this UI element survive page navigation?" If yes, it belongs in a layout. If no, it belongs in a page.

## Common Mistakes

**Mistake 1: Putting page-specific logic in layouts**

```svelte
<!-- WRONG — layout should not know about individual page content -->
<!-- src/routes/(app)/+layout.svelte -->
{#if page.url.pathname === '/dashboard'}
  <DashboardSidebar />
{:else if page.url.pathname === '/settings'}
  <SettingsSidebar />
{:else}
  <DefaultSidebar />
{/if}
```

If your layout is checking the URL to render different sidebars, you should probably use nested layouts or route groups instead.

**Mistake 2: Duplicating layout data loading in pages**

```typescript
// WRONG — fetching user data in every page
// src/routes/(app)/dashboard/+page.server.ts
export const load = async ({ locals }) => {
  return { user: locals.user, dashboardData: ... };
};

// src/routes/(app)/settings/+page.server.ts
export const load = async ({ locals }) => {
  return { user: locals.user, settings: ... };
};
```

Fetch shared data once in `+layout.server.ts` and let pages inherit it.

**Mistake 3: Making the root layout too complex**

If the root layout fails to render, there is no error boundary that can save you. Keep it simple: global CSS imports, maybe a context provider, and `{@render children()}`.

## Try It

1. Create a root layout in `src/routes/+layout.svelte` with a navigation bar linking to Home, About, and Blog.
2. Create a nested layout inside `src/routes/blog/` that adds a sidebar with category links.
3. Visit each page and observe how the nav persists while only the page content changes.
4. Add a counter button to your root layout's nav. Navigate between pages and confirm the counter value survives navigation — proving the layout stays mounted.
5. Create a `+layout.server.ts` that loads a user object. Verify that child pages can access the user data through their `data` prop.
6. Create two route groups, `(marketing)` and `(app)`, with different layouts. Verify that `/` uses the marketing layout and `/dashboard` uses the app layout, with clean URLs.
7. Add a `+error.svelte` inside your `(app)` route group. Trigger an error in a page load function and verify the error page renders within the app layout (sidebar still visible).
8. Create a page with a `@` layout reset. Verify it bypasses intermediate layouts.

## Key Takeaways

- `+layout.svelte` wraps pages with shared UI — navigation, sidebars, footers
- `{@render children()}` is the insertion point where SvelteKit renders the current page inside the layout — it is a Svelte 5 snippet prop managed by the framework
- Layouts **persist across navigation** — they do not re-mount when navigating between sibling pages, which preserves state, keeps connections alive, and avoids redundant work
- **Nested layouts** compose automatically based on directory nesting — each level adds another wrapper, and each level persists independently
- `+layout.server.ts` loads data once and shares it with the layout and all child pages through automatic data cascading
- Child pages can access layout data via `await parent()` in their own load functions
- **Route groups** `(name)` let you apply different layouts to different sections without affecting URLs — your layout architecture and URL architecture evolve independently
- **Layout resets** with `+page@.svelte` let a page escape its parent layouts — target a specific ancestor with `+page@(group).svelte`
- **Error boundaries** via `+error.svelte` at the layout level keep the surrounding layout intact when a page error occurs
- Keep the root layout simple — if it fails, there is no recovery
- Layouts are persistent shells, pages are swappable content — this is the fundamental mental model for SvelteKit application architecture
