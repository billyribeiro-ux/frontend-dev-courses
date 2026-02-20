# Navigation Guards, Invalidation & App Modules

SvelteKit ships several `$app/*` modules that provide everything from programmatic navigation to environment detection to deployment tracking. You have already used a few of these — `goto`, `pushState`, `beforeNavigate` — but there is a whole toolkit you have not touched yet. This lesson covers the complete set and wires each one into TeamBoard.

By the end, you will know how to navigate programmatically after mutations, selectively refresh data without reloading the page, detect whether code is running in the browser or during a build, construct type-safe URLs, alert users to new deployments, and fine-tune link behavior with data attributes.

## Programmatic Navigation with goto

After a user creates a new task, you want to redirect them to the board where the task now lives. `goto` handles this, and its options object gives you precise control over what happens:

```svelte
<!-- src/lib/components/board/CreateTaskForm.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { invalidate } from '$app/navigation';

  let { boardId }: { boardId: number } = $props();

  let title = $state('');
  let description = $state('');
  let submitting = $state(false);

  async function createTask() {
    submitting = true;

    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boardId, title, description })
    });

    const { task } = await response.json();

    // Navigate to the board and refresh all data
    await goto(`/board/${boardId}`, {
      replaceState: true,   // Don't stack the creation form in history
      invalidateAll: true    // Re-run every load function to pick up the new task
    });
  }
</script>

<form onsubmit|preventDefault={createTask}>
  <input
    bind:value={title}
    placeholder="Task title"
    required
    disabled={submitting}
  />
  <textarea
    bind:value={description}
    placeholder="Description (optional)"
    disabled={submitting}
  ></textarea>
  <button type="submit" disabled={submitting}>
    {submitting ? 'Creating...' : 'Create Task'}
  </button>
</form>
```

The `goto` options explained:

- **`replaceState: true`** — The creation form URL is replaced in history instead of pushed. When the user presses back from the board, they skip past the form and go to whatever page they were on before. This prevents the annoying "back takes me to the form I already submitted" problem.
- **`invalidateAll: true`** — After navigating, SvelteKit re-runs every load function on the destination page. The board's load function fetches fresh data from the database, which now includes the new task.
- **`noScroll: true`** (not used here, but available) — Prevents the page from scrolling to the top after navigation. Useful for filter changes where you want the user to stay in the same scroll position.
- **`keepFocus: true`** (not used here, but available) — Keeps focus on the currently focused element. Useful for search inputs where navigation updates results but should not steal focus.

## Selective Invalidation with depends and invalidate

`invalidateAll` is a blunt instrument. It re-runs every load function on the page — the layout load, the page load, any parent load functions. If the board layout loads team data and the page loads board data, `invalidateAll` refetches both, even if only the tasks changed.

For targeted refreshes, use `depends` in your load function and `invalidate` in your component:

```typescript
// src/routes/(app)/[teamSlug]/boards/[boardId]/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$server/database';
import { columns, tasks } from '$server/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, depends }) => {
  // Register a custom dependency key
  depends('app:tasks');
  depends('app:board');

  const boardColumns = await db.query.columns.findMany({
    where: eq(columns.boardId, Number(params.boardId)),
    with: { tasks: { with: { assignee: true } } },
    orderBy: columns.position
  });

  return {
    board: { id: Number(params.boardId) },
    columns: boardColumns
  };
};
```

```typescript
// src/routes/(app)/[teamSlug]/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ params, depends, locals }) => {
  depends('app:team');

  const team = await db.query.teams.findFirst({
    where: eq(teams.slug, params.teamSlug),
    with: { members: { with: { user: true } } }
  });

  return { team };
};
```

Now when a task is moved between columns, you only need to refresh the task data:

```svelte
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  async function moveTask(taskId: number, newColumnId: number) {
    await fetch(`/api/tasks/${taskId}/move`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ columnId: newColumnId })
    });

    // Only re-run load functions that called depends('app:tasks')
    // The layout load (which depends on 'app:team') is NOT re-run
    await invalidate('app:tasks');
  }

  async function updateBoardSettings() {
    await fetch(`/api/boards/${boardId}/settings`, {
      method: 'PUT',
      body: JSON.stringify({ name: newName })
    });

    // Re-run both board and task loads, but not the team layout
    await invalidate('app:board');
  }

  async function nuclearRefresh() {
    // When all else fails — re-run EVERY load function
    await invalidateAll();
  }
</script>
```

The dependency key is just a string — `'app:tasks'`, `'app:board'`, `'app:team'`. When you call `invalidate('app:tasks')`, SvelteKit finds every load function that called `depends('app:tasks')` and re-runs only those. Load functions that depend on different keys (or no custom keys) are untouched.

You can also invalidate by URL. If a load function fetches from `/api/tasks`, calling `invalidate('/api/tasks')` will re-run it. The custom string approach with `depends` is usually cleaner because it decouples the invalidation signal from the implementation detail of which URL was fetched.

## The $app/environment Module

The `$app/environment` module tells you where your code is running. It exports three values:

```typescript
import { browser, building, version } from '$app/environment';
```

### browser — Is This the Client?

`browser` is `true` when code runs in the browser and `false` during server-side rendering or during the build. Use it to guard browser-only APIs:

```svelte
<!-- src/lib/components/board/TaskEditor.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  // localStorage is not available on the server
  let draftKey = `task-draft-${taskId}`;

  let draft = $state('');

  // Load draft from localStorage on mount (browser only)
  $effect(() => {
    if (browser) {
      const saved = localStorage.getItem(draftKey);
      if (saved) draft = saved;
    }
  });

  // Auto-save draft to localStorage as the user types
  $effect(() => {
    if (browser && draft) {
      localStorage.setItem(draftKey, draft);
    }
  });
</script>

<textarea bind:value={draft} placeholder="Write your description..."></textarea>
```

Without the `browser` guard, the `localStorage` calls would throw during SSR because `localStorage` does not exist on the server. The `$effect` approach already runs only in the browser (effects do not run during SSR), but the explicit `browser` check is good practice when using browser APIs in non-effect contexts, like top-level module code in `.ts` files:

```typescript
// src/lib/state/preferences.svelte.ts
import { browser } from '$app/environment';

let theme = $state(browser ? localStorage.getItem('theme') ?? 'light' : 'light');

export function getTheme() {
  return theme;
}

export function setTheme(value: 'light' | 'dark') {
  theme = value;
  if (browser) {
    localStorage.setItem('theme', value);
  }
}
```

### building — Is This the Build Step?

`building` is `true` only during `vite build` (or `svelte-kit build`). It is `false` during development and at runtime. This is rare but useful for conditional logic in prerendered pages:

```typescript
// src/routes/(marketing)/features/+page.ts
import { building } from '$app/environment';

export const prerender = true;

export async function load({ fetch }) {
  if (building) {
    // During build: fetch from a local fixture for reproducible builds
    const res = await fetch('/api/features/fixture');
    return { features: await res.json() };
  }

  // At runtime: fetch live data
  const res = await fetch('/api/features');
  return { features: await res.json() };
}
```

### version — Deployment Tracking

`version` is the string you set in `svelte.config.js` under `kit.version.name`. In Module 44, you configured it as `Date.now().toString()`, which means it changes on every build. You can use this to log which deployment a user is running:

```typescript
import { version } from '$app/environment';

console.log(`TeamBoard version: ${version}`);
// "TeamBoard version: 1708372845123"
```

This pairs with the `updated` store (covered below) to detect when a newer deployment is available.

## The $app/paths Module

The `$app/paths` module provides URL helpers for apps deployed under a subpath or using a CDN for static assets.

```typescript
import { base, assets, resolveRoute } from '$app/paths';
```

### base — Subpath-Safe URLs

If TeamBoard is deployed at `https://company.com/tools/teamboard` instead of the root, `base` returns `'/tools/teamboard'`. Use it to construct absolute URLs:

```svelte
<script lang="ts">
  import { base } from '$app/paths';
</script>

<!-- Without base: breaks if deployed under a subpath -->
<a href="/dashboard">Dashboard</a>

<!-- With base: works everywhere -->
<a href="{base}/dashboard">Dashboard</a>

<!-- Navigation links in the sidebar -->
<nav>
  <a href="{base}/dashboard">Dashboard</a>
  <a href="{base}/{teamSlug}/boards">Boards</a>
  <a href="{base}/{teamSlug}/settings">Settings</a>
  <a href="{base}/{teamSlug}/activity">Activity</a>
</nav>
```

If you deploy at the root (the common case), `base` is an empty string and the URLs look normal. But if you ever need to deploy under a subpath — say, embedding TeamBoard inside a larger portal — everything works without changing a single link.

### assets — Static File URLs

`assets` points to the location of your static files. If you use a CDN, this might be a different domain:

```svelte
<script lang="ts">
  import { assets } from '$app/paths';
</script>

<img src="{assets}/images/logo.svg" alt="TeamBoard logo" />
<link rel="icon" href="{assets}/favicon.png" />
```

### resolveRoute — Type-Safe URL Generation

`resolveRoute` generates URLs from route IDs and parameters. This is the type-safe alternative to string concatenation:

```typescript
import { resolveRoute } from '$app/paths';

// Instead of manually building: `/acme/boards/5`
const url = resolveRoute('/[teamSlug]/boards/[boardId]', {
  teamSlug: 'acme',
  boardId: '5'
});
// Result: '/acme/boards/5'

// TypeScript will error if you misspell a parameter
const bad = resolveRoute('/[teamSlug]/boards/[boardId]', {
  teamSlug: 'acme',
  boradId: '5'  // Typo caught at compile time!
});
```

Use `resolveRoute` in utility functions, API clients, and anywhere you build URLs outside of templates:

```typescript
// src/lib/utils/urls.ts
import { resolveRoute } from '$app/paths';
import { base } from '$app/paths';

export function boardUrl(teamSlug: string, boardId: number) {
  return base + resolveRoute('/[teamSlug]/boards/[boardId]', {
    teamSlug,
    boardId: String(boardId)
  });
}

export function taskUrl(teamSlug: string, boardId: number, taskId: number) {
  return base + resolveRoute('/[teamSlug]/boards/[boardId]/task/[taskId]', {
    teamSlug,
    boardId: String(boardId),
    taskId: String(taskId)
  });
}
```

## The updated Store — New Version Banner

The `updated` store from `$app/stores` tells you when a new version of the app has been deployed. Combined with the `version` config, this enables a "New version available" banner:

```svelte
<!-- src/lib/components/ui/UpdateBanner.svelte -->
<script lang="ts">
  import { updated } from '$app/stores';
  import { onMount } from 'svelte';

  let dismissed = $state(false);

  // Poll for updates every 5 minutes
  onMount(() => {
    const interval = setInterval(() => {
      updated.check();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  });
</script>

{#if $updated && !dismissed}
  <div class="update-banner" role="alert">
    <p>A new version of TeamBoard is available.</p>
    <div class="update-actions">
      <button onclick={() => location.reload()}>
        Reload Now
      </button>
      <button onclick={() => dismissed = true}>
        Later
      </button>
    </div>
  </div>
{/if}

<style>
  .update-banner {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.5rem;
    background: #1e293b;
    color: #f8fafc;
    border-radius: 0.75rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  }

  .update-actions {
    display: flex;
    gap: 0.5rem;
  }

  .update-actions button:first-child {
    background: #6366f1;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
  }

  .update-actions button:last-child {
    background: transparent;
    color: #94a3b8;
    border: 1px solid #334155;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
  }
</style>
```

How this works behind the scenes: SvelteKit stores the `version.name` value in a metadata file at build time. When you call `updated.check()`, SvelteKit fetches that metadata file and compares it to the version baked into the current client bundle. If they differ, `$updated` becomes `true`.

The `location.reload()` call forces a full page refresh, which loads the new client bundle. The "Later" button lets the user dismiss the banner and continue working — they will get the update on their next full page load.

Place the `UpdateBanner` component in your root layout so it appears on every page:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import UpdateBanner from '$components/ui/UpdateBanner.svelte';
  import { onNavigate } from '$app/navigation';

  let { children } = $props();

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

{@render children()}
<UpdateBanner />
```

## Link Options with data Attributes

SvelteKit provides several `data-sveltekit-*` attributes that change how links and forms behave. These are powerful optimizations that you apply directly to HTML elements — no JavaScript required.

### Preloading Data on Hover

When the user hovers over a board link, start loading that board's data immediately. By the time they click, the data is already fetched:

```svelte
<!-- src/lib/components/layout/Sidebar.svelte -->
<script lang="ts">
  import { base } from '$app/paths';

  let { boards, teamSlug }: {
    boards: { id: number; name: string }[];
    teamSlug: string;
  } = $props();
</script>

<nav>
  <h3>Boards</h3>
  <ul>
    {#each boards as board}
      <li>
        <!-- Preload data when the user hovers — navigation feels instant -->
        <a
          href="{base}/{teamSlug}/boards/{board.id}"
          data-sveltekit-preload-data="hover"
        >
          {board.name}
        </a>
      </li>
    {/each}
  </ul>
</nav>
```

The `data-sveltekit-preload-data="hover"` attribute tells SvelteKit to start running the target page's load function when the user hovers over the link. Most users hover for 100-300ms before clicking, which is enough time to fetch data. The result: near-instant navigation.

The available values are:
- `"hover"` — preload on mouseenter (with a small delay) or touchstart
- `"tap"` — preload on mousedown or touchstart (less aggressive, still faster than waiting for click)
- `"off"` — disable preloading for this link

You can also set `data-sveltekit-preload-code="hover"` to preload only the JavaScript module (not the data). This is useful for pages where the data changes frequently but the code is stable.

### Preventing Scroll Reset

When the user applies a filter or changes the sort order, the page should not scroll to the top. Use `data-sveltekit-noscroll`:

```svelte
<!-- src/lib/components/board/BoardFilters.svelte -->
<script lang="ts">
  let { currentFilter, teamSlug, boardId }: {
    currentFilter: string;
    teamSlug: string;
    boardId: number;
  } = $props();

  const filters = ['all', 'assigned-to-me', 'high-priority', 'due-soon'];
</script>

<div class="filters" data-sveltekit-noscroll>
  {#each filters as filter}
    <a
      href="/{teamSlug}/boards/{boardId}?filter={filter}"
      class:active={currentFilter === filter}
    >
      {filter.replace(/-/g, ' ')}
    </a>
  {/each}
</div>
```

By placing `data-sveltekit-noscroll` on the parent `div`, every link inside inherits the behavior. The attribute cascades down to child elements.

### Keeping Focus on the Active Element

When search results update via navigation (e.g., server-side search), the search input should keep focus. Use `data-sveltekit-keepfocus`:

```svelte
<!-- src/lib/components/board/TaskSearch.svelte -->
<script lang="ts">
  let { query, teamSlug, boardId }: {
    query: string;
    teamSlug: string;
    boardId: number;
  } = $props();
</script>

<form
  method="GET"
  action="/{teamSlug}/boards/{boardId}"
  data-sveltekit-keepfocus
  data-sveltekit-noscroll
  data-sveltekit-replacestate
>
  <input
    type="search"
    name="q"
    value={query}
    placeholder="Search tasks..."
  />
</form>
```

Three attributes work together here:
- `data-sveltekit-keepfocus` — the search input stays focused after the form submits and the page re-renders with results
- `data-sveltekit-noscroll` — the page does not scroll to the top when results update
- `data-sveltekit-replacestate` — each search does not create a new history entry, so the back button does not cycle through every keystroke

## Integrating Everything into TeamBoard

Here is the complete header component that ties together navigation, paths, environment, and link options:

```svelte
<!-- src/lib/components/layout/Header.svelte -->
<script lang="ts">
  import { goto, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import { base } from '$app/paths';
  import { version } from '$app/environment';

  let {
    user,
    onOpenPalette
  }: {
    user: { name: string; avatarUrl?: string };
    onOpenPalette: () => void;
  } = $props();

  // Track breadcrumbs from the current URL
  let breadcrumbs = $derived.by(() => {
    const path = $page.url.pathname;
    const segments = path.split('/').filter(Boolean);
    return segments.map((segment, i) => ({
      label: segment.replace(/-/g, ' '),
      href: base + '/' + segments.slice(0, i + 1).join('/')
    }));
  });

  afterNavigate(() => {
    // Log page view with version for debugging
    console.log(`[v${version}] Navigated to ${$page.url.pathname}`);
  });
</script>

<header class="app-header">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <a href="{base}/dashboard" data-sveltekit-preload-data="hover">
      Home
    </a>
    {#each breadcrumbs as crumb, i}
      <span class="separator">/</span>
      {#if i === breadcrumbs.length - 1}
        <span class="current">{crumb.label}</span>
      {:else}
        <a href={crumb.href} data-sveltekit-preload-data="hover">
          {crumb.label}
        </a>
      {/if}
    {/each}
  </nav>

  <div class="header-actions">
    <button class="palette-trigger" onclick={onOpenPalette}>
      Search
      <kbd>Cmd+K</kbd>
    </button>

    <div class="user-menu">
      {#if user.avatarUrl}
        <img src={user.avatarUrl} alt={user.name} class="avatar" />
      {/if}
      <span>{user.name}</span>
    </div>
  </div>
</header>
```

And the sidebar that uses preloading and `$app/paths`:

```svelte
<!-- src/lib/components/layout/Sidebar.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { base } from '$app/paths';

  let {
    open,
    compact,
    onToggle
  }: {
    open: boolean;
    compact: boolean;
    onToggle: () => void;
  } = $props();

  let teamSlug = $derived($page.params.teamSlug ?? '');
  let currentPath = $derived($page.url.pathname);
</script>

<aside class="sidebar" class:open class:compact>
  <button class="sidebar-toggle" onclick={onToggle}>
    {open ? 'Collapse' : 'Expand'}
  </button>

  <nav data-sveltekit-preload-data="hover">
    <a
      href="{base}/dashboard"
      class:active={currentPath === `${base}/dashboard`}
    >
      Dashboard
    </a>

    {#if teamSlug}
      <a
        href="{base}/{teamSlug}/boards"
        class:active={currentPath.includes('/boards')}
      >
        Boards
      </a>
      <a
        href="{base}/{teamSlug}/activity"
        class:active={currentPath.includes('/activity')}
      >
        Activity
      </a>
      <a
        href="{base}/{teamSlug}/settings"
        class:active={currentPath.includes('/settings')}
      >
        Settings
      </a>
    {/if}
  </nav>
</aside>
```

Notice that `data-sveltekit-preload-data="hover"` is placed on the `<nav>` element. All child links inherit the preloading behavior. When the user hovers over "Boards", SvelteKit starts fetching the boards data before the click. Combined with the streaming and caching from earlier modules, navigation feels instantaneous.

## Try It

Build a TeamBoard header, sidebar, and update banner that demonstrate these features:

1. After creating a task via a form, use `goto` with `replaceState: true` and `invalidateAll: true` to navigate to the board.
2. In the board's load function, add `depends('app:tasks')`. After moving a task, call `invalidate('app:tasks')` instead of `invalidateAll()`.
3. Use `browser` from `$app/environment` to guard a `localStorage`-based draft save feature.
4. Use `base` from `$app/paths` in all sidebar navigation links.
5. Use `resolveRoute` to build a type-safe task URL in a utility function.
6. Wire up the `updated` store to show a "New version available" banner that polls every 5 minutes.
7. Add `data-sveltekit-preload-data="hover"` to your sidebar links.
8. Add `data-sveltekit-noscroll` and `data-sveltekit-keepfocus` to a search/filter form.

Verify that `invalidate('app:tasks')` re-runs the board load but not the layout load.

## Key Takeaways

- `goto(url, opts)` accepts `replaceState`, `invalidateAll`, `noScroll`, and `keepFocus` options — combine them for precise post-mutation navigation
- `depends('app:key')` in load functions and `invalidate('app:key')` in components enable surgical data refreshes — far more efficient than `invalidateAll()`
- `invalidateAll()` is the nuclear option: it re-runs every load function on the current page, including parent layouts
- `browser` from `$app/environment` guards browser-only APIs like `localStorage` and `window` — essential for code that runs during SSR
- `building` is `true` only during `vite build` — use it for build-time conditional logic in prerendered pages
- `version` from `$app/environment` returns the `kit.version.name` config value — pair it with the `updated` store for deployment detection
- `base` from `$app/paths` ensures links work when the app is deployed under a subpath — always use it in navigation components
- `resolveRoute` generates URLs from route IDs and parameters with type safety — catches typos at compile time
- `$updated` becomes `true` when a new deployment is detected — call `updated.check()` on an interval to poll for updates
- `data-sveltekit-preload-data="hover"` on links makes navigation feel instant by loading data while the user's cursor moves toward the link
- `data-sveltekit-noscroll` and `data-sveltekit-keepfocus` prevent disorienting scroll jumps and focus loss during filter/search navigations
- These attributes cascade to child elements — place them on a parent `nav` or `form` to apply to all contained links
