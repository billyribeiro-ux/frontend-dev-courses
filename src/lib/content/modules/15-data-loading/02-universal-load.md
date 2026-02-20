# Universal Load Functions

While server load functions (`+page.server.ts`) run only on the server, **universal load functions** (`+page.ts`) run on both the server and the client. On the first page load, they run on the server for SSR. On subsequent navigations, they run in the browser. This makes them ideal for fetching data from public APIs and performing logic that does not require server-only secrets.

Understanding the difference between server and universal load functions lets you choose the right one for each situation, keeping your application fast and secure.

## Universal Load Functions

Create a `+page.ts` file (note: no `.server` in the name):

```typescript
// src/routes/projects/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('https://api.github.com/users/sveltejs/repos?per_page=6');
  const repos = await response.json();

  return {
    repos
  };
};
```

Use the data the same way as server load:

```svelte
<!-- src/routes/projects/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Svelte Repositories</h1>

<div class="grid">
  {#each data.repos as repo}
    <a href={repo.html_url} target="_blank" rel="noopener">
      <h2>{repo.name}</h2>
      <p>{repo.description}</p>
      <span>{repo.stargazers_count} stars</span>
    </a>
  {/each}
</div>
```

## Server Load vs Universal Load

Here is when to use each:

| Feature | `+page.server.ts` | `+page.ts` |
|---|---|---|
| Runs on | Server only | Server + Client |
| Can access databases | Yes | No |
| Can use private env vars | Yes | No |
| Can use `fetch` | Yes | Yes |
| Runs on client navigation | No (always server) | Yes (runs in browser) |
| Best for | Private data, DB queries | Public APIs, shared logic |

**Rule of thumb:** If you need secrets or database access, use `+page.server.ts`. For everything else, `+page.ts` works great and can be faster on client-side navigations.

## The SvelteKit fetch

Both load function types receive a special `fetch` function. Use it instead of the global `fetch`:

```typescript
// src/routes/weather/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  // Use the provided fetch — it handles cookies, relative URLs,
  // and avoids duplicate requests during SSR
  const response = await fetch('/api/weather');
  const weather = await response.json();

  return { weather };
};
```

The SvelteKit `fetch` has benefits over the global one:
- It can make relative requests during SSR (like `/api/weather`)
- It carries cookies automatically
- It deduplicates identical requests

## Shared Data with Layout Load

When multiple pages need the same data (like a user profile or site settings), use a layout load function. Data returned from `+layout.server.ts` or `+layout.ts` is available to all child pages:

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  // This data is available to EVERY page
  return {
    siteTitle: 'My SvelteKit App',
    navItems: [
      { label: 'Home', href: '/' },
      { label: 'Blog', href: '/blog' },
      { label: 'About', href: '/about' }
    ]
  };
};
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();
</script>

<nav>
  {#each data.navItems as item}
    <a href={item.href}>{item.label}</a>
  {/each}
</nav>

{@render children()}
```

Child pages inherit layout data and can add their own:

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  // data includes both layout data (navItems) and page data
</script>

<h1>About {data.siteTitle}</h1>
```

## Combining Server and Universal Load

You can have both `+page.server.ts` and `+page.ts` for the same route. The server load runs first, and its data is passed to the universal load via `data`:

```typescript
// src/routes/dashboard/+page.server.ts
export const load = async () => {
  return { secretMetric: 42 };
};

// src/routes/dashboard/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
  return {
    ...data,
    calculatedValue: data.secretMetric * 2
  };
};
```

## Try It

Create a `/projects` page that uses a universal load function to fetch repositories from the GitHub API. Then create a `+layout.server.ts` at the root that provides navigation data to all pages. Access both the layout data and page data in your components.

## Key Takeaways

- `+page.ts` creates **universal load functions** that run on both server and client
- Use universal load for public APIs; use server load for private data and databases
- The SvelteKit `fetch` handles cookies, relative URLs, and deduplication
- `+layout.server.ts` shares data across all child pages via layout load
- Child pages inherit data from parent layout load functions
- You can combine server and universal load for the same route when needed
