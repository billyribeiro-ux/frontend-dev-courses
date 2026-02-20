# Query Functions for Teams & Projects

In Phase 5 you learned to load data with `+page.server.ts` — a load function tied to a specific route that runs before the page renders. That approach works, but it has a structural limitation: every piece of data the page needs must be declared at the route level and threaded down through props. If a deeply nested component needs team data, the page load function must fetch it and pass it through every intermediate component.

Remote query functions flip this model. Any component can import a query function from a `.remote.ts` file and call it directly. The compiler rewires the call into an HTTP request behind the scenes, the data stays reactive, and the component owns its own data dependency. In this lesson you will build the query layer for TeamBoard's teams and projects, replacing what would traditionally be a stack of `+page.server.ts` files with a cleaner, component-driven approach.

## Enabling Remote Functions in TeamBoard

Module 44 set up the SvelteKit config with adapters, aliases, and environment settings. Now add the two experimental flags that unlock remote functions:

```javascript
// svelte.config.js
import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),

  compilerOptions: {
    experimental: {
      async: true
    }
  },

  kit: {
    adapter: adapter(),

    experimental: {
      remoteFunctions: true
    },

    alias: {
      $components: 'src/lib/components',
      $actions: 'src/lib/actions',
      $state: 'src/lib/state',
      $server: 'src/lib/server'
    }
  }
};

export default config;
```

`compilerOptions.experimental.async` enables async component rendering — components can `await` data during SSR. `kit.experimental.remoteFunctions` enables the server function infrastructure that converts `.remote.ts` imports into HTTP calls. Both are required. Without `async`, components cannot suspend while waiting for query data. Without `remoteFunctions`, the compiler does not know to rewrite imports from `.remote.ts` files.

## The Teams Query File

Create the first remote file for team data. This file runs exclusively on the server — the code never reaches the browser:

```typescript
// src/lib/api/teams.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { teams, teamMembers } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const getTeams = query(async () => {
  const allTeams = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      description: teams.description,
      ownerId: teams.ownerId,
      createdAt: teams.createdAt
    })
    .from(teams)
    .orderBy(teams.name);

  return allTeams;
});

const TeamByIdSchema = v.object({
  id: v.number()
});

export const getTeamById = query(TeamByIdSchema, async ({ id }) => {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, id))
    .limit(1);

  if (!team) {
    throw new Error('Team not found');
  }

  const members = await db
    .select()
    .from(teamMembers)
    .where(eq(teamMembers.teamId, id));

  return { ...team, members };
});
```

`getTeams` takes no arguments — it returns all teams. `getTeamById` takes a validated `id` parameter. The Valibot schema ensures that only a valid number reaches the database query. If someone crafts a malicious HTTP request with `id: "DROP TABLE teams"`, the schema rejects it before your handler runs.

Notice that there is no `+page.server.ts` anywhere. The data fetching logic lives in `$lib/api/` and any component in the app can import it.

## The Projects Query File

Projects belong to teams. Create a second remote file:

```typescript
// src/lib/api/projects.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { boards, tasks, columns } from '$lib/server/schema';
import { eq, count } from 'drizzle-orm';

export const getProjects = query(
  v.object({
    teamId: v.number()
  }),
  async ({ teamId }) => {
    const projectList = await db
      .select({
        id: boards.id,
        name: boards.name,
        description: boards.description,
        createdBy: boards.createdBy,
        createdAt: boards.createdAt
      })
      .from(boards)
      .where(eq(boards.teamId, teamId))
      .orderBy(boards.createdAt);

    return projectList;
  }
);

export const getProjectById = query(
  v.object({
    projectId: v.number()
  }),
  async ({ projectId }) => {
    const [project] = await db
      .select()
      .from(boards)
      .where(eq(boards.id, projectId))
      .limit(1);

    if (!project) {
      throw new Error('Project not found');
    }

    const projectColumns = await db
      .select()
      .from(columns)
      .where(eq(columns.boardId, projectId))
      .orderBy(columns.position);

    const taskCounts = await db
      .select({
        columnId: tasks.columnId,
        total: count()
      })
      .from(tasks)
      .where(eq(tasks.boardId, projectId))
      .groupBy(tasks.columnId);

    return {
      ...project,
      columns: projectColumns.map((col) => ({
        ...col,
        taskCount: taskCounts.find((t) => t.columnId === col.id)?.total ?? 0
      }))
    };
  }
);
```

`getProjects` requires a `teamId` so it knows which team's boards to fetch. `getProjectById` returns a single board along with its columns and task counts — everything a board overview page needs in one call.

## Building the Teams Listing Page

With the query functions defined, build a page that uses them directly. No `+page.server.ts`, no prop threading:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  const teams = getTeams();
</script>

<svelte:head>
  <title>Dashboard — TeamBoard</title>
</svelte:head>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-6">Your Teams</h1>

  {#if teams.loading}
    <div class="space-y-4">
      {#each Array(3) as _}
        <div class="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:else if teams.error}
    <div class="p-4 bg-red-50 text-red-700 rounded-lg">
      <p class="font-medium">Failed to load teams</p>
      <p class="text-sm mt-1">{teams.error.message}</p>
      <button
        onclick={() => teams.refresh()}
        class="mt-2 text-sm text-red-600 underline"
      >
        Try again
      </button>
    </div>
  {:else}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each teams.current as team}
        <a
          href="/{team.slug}/boards"
          class="block p-6 bg-white dark:bg-gray-800 rounded-lg border
                 hover:border-indigo-300 transition-colors"
        >
          <h2 class="text-lg font-semibold">{team.name}</h2>
          {#if team.description}
            <p class="text-sm text-gray-500 mt-1">{team.description}</p>
          {/if}
        </a>
      {/each}
    </div>
  {/if}
</div>
```

The component calls `getTeams()` at the top level. The returned object exposes reactive properties: **`.loading`** (true during the request), **`.error`** (the error if the query failed), **`.current`** (the resolved data), and **`.refresh()`** (re-fetches from the server). No `+page.server.ts` needed — the component declares exactly what it needs.

## Using {#await} for Initial Rendering

The `.loading` / `.error` / `.current` pattern works well, but you can also treat a query function as a promise and use Svelte's `{#await}` block. This is especially useful during SSR when you want the page to wait for data before sending HTML to the browser:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/+page.svelte -->
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';
  import { getProjects } from '$lib/api/projects.remote';

  // Suppose the team ID is resolved from the slug in a layout
  let { data } = $props();

  const projects = getProjects({ teamId: data.team.id });
</script>

<h1 class="text-2xl font-bold p-8">{data.team.name} — Boards</h1>

{#await projects}
  <div class="p-8">
    <p class="text-gray-500">Loading boards...</p>
  </div>
{:then boards}
  <div class="grid gap-4 p-8 sm:grid-cols-2 lg:grid-cols-3">
    {#each boards as board}
      <a
        href="/{data.team.slug}/boards/{board.id}"
        class="block p-6 bg-white dark:bg-gray-800 rounded-lg border
               hover:border-indigo-300 transition-colors"
      >
        <h2 class="font-semibold">{board.name}</h2>
        <p class="text-sm text-gray-500 mt-1">{board.description ?? 'No description'}</p>
      </a>
    {/each}

    {#if boards.length === 0}
      <p class="text-gray-400 col-span-full">No boards yet. Create one to get started.</p>
    {/if}
  </div>
{:catch err}
  <div class="p-8">
    <p class="text-red-600">Error: {err.message}</p>
  </div>
{/await}
```

During SSR, Svelte awaits the promise before sending HTML — no loading spinner on initial page load. On client-side navigations, the `{#await}` block shows the loading state. Use `.loading` / `.current` / `.error` when you want fine-grained control; use `{#await}` when you want SSR to wait for data.

## Batching Multiple Queries

The dashboard might need teams, recent activity, and project counts simultaneously. Without batching, each query creates a separate HTTP request — three round trips to the server. `query.batch` combines them into a single request:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { query } from '$app/server';
  import { getTeams } from '$lib/api/teams.remote';
  import { getProjects } from '$lib/api/projects.remote';

  // Batch both queries into a single HTTP request
  const [teams, engineeringProjects, designProjects] = query.batch(
    getTeams(),
    getProjects({ teamId: 1 }),
    getProjects({ teamId: 2 })
  );
</script>

{#await Promise.all([teams, engineeringProjects, designProjects])}
  <p>Loading dashboard...</p>
{:then [teamList, engProjects, desProjects]}
  <section>
    <h2 class="text-xl font-bold mb-4">Teams ({teamList.length})</h2>
    {#each teamList as team}
      <p>{team.name}</p>
    {/each}
  </section>

  <section class="mt-8">
    <h2 class="text-xl font-bold mb-4">Engineering Boards ({engProjects.length})</h2>
    {#each engProjects as project}
      <p>{project.name}</p>
    {/each}
  </section>

  <section class="mt-8">
    <h2 class="text-xl font-bold mb-4">Design Boards ({desProjects.length})</h2>
    {#each desProjects as project}
      <p>{project.name}</p>
    {/each}
  </section>
{/await}
```

All three queries ship as a single HTTP request. The server executes them in parallel and returns the results together, eliminating the waterfall of sequential round trips.

## Reactive Arguments

When a query function receives reactive state as an argument, it re-runs automatically when that state changes:

```svelte
<script lang="ts">
  import { getProjects } from '$lib/api/projects.remote';

  let selectedTeamId = $state(1);

  // Re-fetches whenever selectedTeamId changes
  const projects = getProjects({ teamId: selectedTeamId });
</script>

<select bind:value={selectedTeamId}>
  <option value={1}>Engineering</option>
  <option value={2}>Design</option>
  <option value={3}>Marketing</option>
</select>

{#if projects.loading}
  <p>Loading projects...</p>
{:else}
  <ul>
    {#each projects.current as project}
      <li>{project.name}</li>
    {/each}
  </ul>
{/if}
```

Changing the dropdown triggers a new server call automatically. No effect, no manual `.refresh()` — the reactivity is built in.

## Query Deduplication

Identical queries on the same page are deduplicated — only one HTTP request fires and both components share the result:

```svelte
<!-- src/lib/components/layout/Sidebar.svelte -->
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  // Same query, same result — no extra HTTP request
  const teams = getTeams();
</script>

{#await teams then teamList}
  <nav>
    {#each teamList as team}
      <a href="/{team.slug}">{team.name}</a>
    {/each}
  </nav>
{/await}
```

Both the dashboard page and the sidebar component call `getTeams()`. SvelteKit recognizes they are the same function with the same arguments and serves the cached response. Call query functions wherever you need the data without worrying about redundant requests.

## When to Use Queries vs Load Functions

You now have two ways to load data. Here is when to use each:

| Scenario | Use |
|----------|-----|
| Data needed by a specific route before rendering | `+page.server.ts` load |
| Data needed by a deeply nested component | `query()` remote function |
| Data shared across multiple pages | `query()` remote function |
| Data that depends on URL parameters only | `+page.server.ts` load |
| Data that depends on interactive state (dropdowns, filters) | `query()` remote function |
| SEO-critical data that must be in initial HTML | Either (both support SSR) |

The two approaches are not mutually exclusive. TeamBoard uses `+layout.server.ts` for the auth guard (it must run before any child renders) and query functions for teams, projects, and tasks (components fetch what they need).

## Try It

Create a `src/lib/api/teams.remote.ts` file with `getTeams` (no arguments) and `getTeamById` (takes `{ id: number }` validated with Valibot). Create a `src/lib/api/projects.remote.ts` file with `getProjects` (takes `{ teamId: number }`). Build a dashboard page that:

1. Calls `getTeams()` and displays them as cards using `.loading`, `.error`, and `.current`
2. Adds a refresh button that calls `.refresh()`
3. When a team card is clicked, navigates to a team detail page that calls `getTeamById` and `getProjects` using `query.batch`
4. Uses `{#await}` on the team detail page so SSR waits for the data

## Key Takeaways

- Remote query functions decouple data fetching from routing — components declare their own server data dependencies
- Enable remote functions with `compilerOptions.experimental.async` and `kit.experimental.remoteFunctions`
- `.remote.ts` files run exclusively on the server; the compiler converts imports into HTTP requests
- Always validate query arguments with Valibot — remote functions become public HTTP endpoints under the hood
- `.current`, `.loading`, `.error`, and `.refresh()` provide reactive UI state without `{#await}`
- `{#await}` makes SSR wait for data before sending HTML, eliminating loading spinners on initial page load
- `query.batch` combines multiple simultaneous queries into a single HTTP request, eliminating waterfalls
- Queries with identical functions and arguments are deduplicated — call them freely without worrying about duplicate requests
- Use `+page.server.ts` for route-level, URL-dependent data; use `query()` for component-level, interactive data
