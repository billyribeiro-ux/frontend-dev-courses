# Query Functions for Teams & Projects

In Phase 5 you learned to load data with `+page.server.ts` — a load function tied to a specific route that runs before the page renders. That approach works, but it has a structural limitation: every piece of data the page needs must be declared at the route level and threaded down through props. If a deeply nested component needs team data, the page load function must fetch it and pass it through every intermediate component. Sound familiar? It is the same prop drilling problem that context solves for state — except now it is about *data fetching*.

Remote query functions flip this model. Any component can import a query function from a `.remote.ts` file and call it directly. The compiler rewires the call into an HTTP request behind the scenes, the data stays reactive, and the component owns its own data dependency — no load function, no prop threading, no intermediate components handling data they do not care about.

In this lesson you will build the query layer for TeamBoard's teams and projects, understand the compiler transforms that make remote functions work, learn argument validation with Valibot, explore every reactive property on the query result object, use `query.batch` for parallel fetching, implement optimistic updates, handle errors gracefully, and replace what would traditionally be a stack of `+page.server.ts` files with a cleaner, component-driven approach.

## How Remote Functions Work Under the Hood

Before writing any code, understand what the compiler does. This knowledge prevents a class of bugs that seem mysterious without it.

When you write:

```typescript
// src/lib/api/teams.remote.ts
import { query } from '$app/server';

export const getTeams = query(async () => {
  const teams = await db.select().from(teams);
  return teams;
});
```

And import it in a component:

```svelte
<script>
  import { getTeams } from '$lib/api/teams.remote';
  const teams = getTeams();
</script>
```

The compiler performs two transforms:

1. **On the server side**, it registers `getTeams` as a server function endpoint. The code inside the `query()` callback runs exclusively on the server — it never reaches the client bundle. Database imports, secret keys, and server-only logic are safe.

2. **On the client side**, the import is rewritten to a thin stub that makes an HTTP request to the registered endpoint. When the component calls `getTeams()`, the stub sends a fetch request to a SvelteKit-managed URL, the server runs the actual query, and the result is serialized back to the client.

This means `.remote.ts` files are a server/client boundary. The code inside `query()` runs on the server. The component code runs on the client (and during SSR on the server, where it calls the function directly without HTTP). The compiler handles the wiring — you do not write any fetch calls, API routes, or serialization logic.

The practical implication: `.remote.ts` files become **public HTTP endpoints**. Anyone who can reach your server can call them with crafted payloads. This is why argument validation is not optional — it is a security requirement.

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

Two flags, two purposes:

- **`compilerOptions.experimental.async`** enables async component rendering. Components can `await` data during SSR, which means the server waits for query data before sending HTML. Without this, `{#await}` blocks on the server would always show the loading state.

- **`kit.experimental.remoteFunctions`** enables the server function infrastructure. The compiler scans for `.remote.ts` files, registers server endpoints for each exported function, and rewrites client imports into HTTP stubs.

Both are required. Without `async`, components cannot suspend while waiting for query data. Without `remoteFunctions`, the compiler does not know to rewrite imports from `.remote.ts` files.

## The Teams Query File

Create the first remote file for team data. Every line of this file runs exclusively on the server:

```typescript
// src/lib/api/teams.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { teams, teamMembers, users } from '$lib/server/schema';
import { eq, count, desc, sql } from 'drizzle-orm';

// No arguments — returns all teams the current user belongs to
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

// Validated argument — Valibot schema rejects invalid input
const TeamByIdSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1))
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

  // Fetch members with their user profiles in a single query
  const members = await db
    .select({
      id: teamMembers.id,
      userId: teamMembers.userId,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatar: users.avatarUrl
    })
    .from(teamMembers)
    .leftJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, id));

  return { ...team, members };
});

// Search teams by name — demonstrates text search validation
const SearchTeamsSchema = v.object({
  query: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(100)),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(50)), 10)
});

export const searchTeams = query(SearchTeamsSchema, async ({ query: searchQuery, limit }) => {
  const results = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      description: teams.description
    })
    .from(teams)
    .where(sql`${teams.name} ILIKE ${'%' + searchQuery + '%'}`)
    .orderBy(teams.name)
    .limit(limit);

  return results;
});

// Team stats — demonstrates aggregation queries
export const getTeamStats = query(
  v.object({ teamId: v.pipe(v.number(), v.integer()) }),
  async ({ teamId }) => {
    const [stats] = await db
      .select({
        memberCount: count(teamMembers.id),
      })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId));

    return stats;
  }
);
```

`getTeams` takes no arguments — it returns all teams. `getTeamById` takes a validated `id` parameter. The Valibot schema ensures that only a valid positive integer reaches the database query. If someone crafts a malicious HTTP request with `id: "DROP TABLE teams"`, Valibot rejects it before your handler runs. The pipe operators chain validations: `v.number()` ensures it is a number, `v.integer()` ensures no decimals, `v.minValue(1)` ensures it is positive.

Notice that there is no `+page.server.ts` anywhere. The data fetching logic lives in `$lib/api/` and any component in the app can import it.

### Why Valibot and Not Zod?

Both work. Valibot is smaller (tree-shakeable to ~1KB vs Zod's ~13KB) and uses a functional composition style. Since remote functions add to your server bundle and Valibot schemas compile to minimal JavaScript, it is the better choice for this use case. The Valibot pipe syntax — `v.pipe(v.string(), v.trim(), v.minLength(1))` — reads linearly: "it is a string, then trim it, then check min length."

## The Projects Query File

Projects belong to teams. Create a second remote file:

```typescript
// src/lib/api/projects.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { boards, tasks, columns } from '$lib/server/schema';
import { eq, count, desc, sql } from 'drizzle-orm';

export const getProjects = query(
  v.object({
    teamId: v.pipe(v.number(), v.integer(), v.minValue(1))
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
      .orderBy(desc(boards.createdAt));

    return projectList;
  }
);

export const getProjectById = query(
  v.object({
    projectId: v.pipe(v.number(), v.integer(), v.minValue(1))
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

    // Fetch columns and task counts in parallel
    const [projectColumns, taskCounts] = await Promise.all([
      db
        .select()
        .from(columns)
        .where(eq(columns.boardId, projectId))
        .orderBy(columns.position),

      db
        .select({
          columnId: tasks.columnId,
          total: count(),
          completed: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`
        })
        .from(tasks)
        .where(eq(tasks.boardId, projectId))
        .groupBy(tasks.columnId)
    ]);

    return {
      ...project,
      columns: projectColumns.map((col) => {
        const counts = taskCounts.find((t) => t.columnId === col.id);
        return {
          ...col,
          taskCount: counts?.total ?? 0,
          completedCount: counts?.completed ?? 0
        };
      })
    };
  }
);

// Dashboard summary — demonstrates complex aggregation
export const getProjectSummary = query(
  v.object({
    teamId: v.pipe(v.number(), v.integer())
  }),
  async ({ teamId }) => {
    const summary = await db
      .select({
        projectId: boards.id,
        projectName: boards.name,
        totalTasks: sql<number>`count(${tasks.id})::int`,
        completedTasks: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
        overdueTasks: sql<number>`count(*) filter (where ${tasks.dueDate} < now() and ${tasks.status} != 'done')::int`
      })
      .from(boards)
      .leftJoin(tasks, eq(tasks.boardId, boards.id))
      .where(eq(boards.teamId, teamId))
      .groupBy(boards.id, boards.name)
      .orderBy(boards.name);

    return summary;
  }
);
```

`getProjects` requires a `teamId` so it knows which team's boards to fetch. `getProjectById` returns a single board along with its columns and task counts — everything a board overview page needs in one call. Both queries use `Promise.all` for parallel database calls where possible.

## The Query Result Object — Reactive Properties

When you call a query function in a component, the returned object exposes several reactive properties. Understanding each one is critical for building responsive UIs:

```typescript
const teams = getTeams();

// The resolved data (type-inferred from the query return type)
teams.current     // T | undefined — the data, once loaded

// Loading state
teams.loading     // boolean — true during the HTTP request

// Error state
teams.error       // Error | undefined — the error, if the query failed

// Actions
teams.refresh()   // Re-fetches from the server, updates all reactive properties

// The result is also a Promise (for {#await} blocks)
await teams       // Resolves to the data
```

These properties are reactive — when they change, any component reading them re-renders. This means you can build loading, error, and success states declaratively:

```svelte
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  const teams = getTeams();
</script>

{#if teams.loading}
  <!-- Skeleton loading state -->
  <div class="space-y-4">
    {#each Array(3) as _}
      <div class="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
    {/each}
  </div>
{:else if teams.error}
  <!-- Error state with retry -->
  <div class="p-4 bg-red-50 text-red-700 rounded-lg">
    <p class="font-medium">Failed to load teams</p>
    <p class="text-sm mt-1">{teams.error.message}</p>
    <button
      onclick={() => teams.refresh()}
      class="mt-2 text-sm text-red-600 underline hover:text-red-800"
    >
      Try again
    </button>
  </div>
{:else if teams.current}
  <!-- Success state -->
  <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each teams.current as team (team.id)}
      <a
        href="/{team.slug}/boards"
        class="block p-6 bg-white dark:bg-gray-800 rounded-lg border
               hover:border-indigo-300 transition-colors"
      >
        <h2 class="text-lg font-semibold">{team.name}</h2>
        {#if team.description}
          <p class="text-sm text-gray-500 mt-1 line-clamp-2">{team.description}</p>
        {/if}
        <p class="text-xs text-gray-400 mt-3">
          Created {new Date(team.createdAt).toLocaleDateString()}
        </p>
      </a>
    {/each}
  </div>
{:else}
  <!-- Empty state -->
  <div class="text-center py-12">
    <p class="text-gray-400">No teams yet. Create one to get started.</p>
  </div>
{/if}
```

### The `.current` vs `await` Decision

You have two ways to consume query data:

**`.loading` / `.current` / `.error`** — Fine-grained control over each state. The component renders immediately with a loading state. Best for client-side navigations where you want to show a skeleton while data loads.

**`{#await}`** — The component suspends. During SSR, the server waits for data before sending HTML (no loading spinner on initial page load). Best for SEO-critical pages where you want the server-rendered HTML to include the data.

```svelte
<!-- Option A: .loading / .current / .error — shows loading spinner -->
{#if teams.loading}
  <Spinner />
{:else}
  {#each teams.current as team}
    <p>{team.name}</p>
  {/each}
{/if}

<!-- Option B: {#await} — SSR waits for data, no spinner on initial load -->
{#await teams}
  <Spinner />
{:then teamList}
  {#each teamList as team}
    <p>{team.name}</p>
  {/each}
{:catch err}
  <p>Error: {err.message}</p>
{/await}
```

During SSR, both approaches result in the same HTML (the data is included). The difference is on client-side navigations: `.loading` shows a skeleton immediately, while `{#await}` delays rendering until data arrives. Choose based on the user experience you want.

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
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-bold">Your Teams</h1>
    <button
      onclick={() => teams.refresh()}
      class="text-sm text-gray-500 hover:text-gray-700"
      disabled={teams.loading}
    >
      {teams.loading ? 'Refreshing...' : 'Refresh'}
    </button>
  </div>

  {#if teams.loading && !teams.current}
    <!-- Initial load — show skeletons -->
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
      {#each teams.current ?? [] as team (team.id)}
        <a
          href="/{team.slug}/boards"
          class="block p-6 bg-white dark:bg-gray-800 rounded-lg border
                 hover:border-indigo-300 transition-colors group"
        >
          <h2 class="text-lg font-semibold group-hover:text-indigo-600 transition-colors">
            {team.name}
          </h2>
          {#if team.description}
            <p class="text-sm text-gray-500 mt-1 line-clamp-2">{team.description}</p>
          {/if}
        </a>
      {/each}
    </div>

    {#if teams.current?.length === 0}
      <div class="text-center py-16">
        <p class="text-gray-400 mb-4">You are not part of any teams yet.</p>
        <a href="/teams/new" class="text-indigo-600 hover:underline">Create your first team</a>
      </div>
    {/if}
  {/if}
</div>
```

Notice the subtle detail: `teams.loading && !teams.current` distinguishes between the initial load (no data yet, show skeletons) and a refresh (data exists, show it while refreshing in the background). This prevents the UI from flashing back to a skeleton state when the user hits refresh.

## Using {#await} for SSR-Optimized Pages

On the team detail page, we want the server to wait for data before sending HTML — the team name should be in the page title for SEO and social sharing:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/+page.svelte -->
<script lang="ts">
  import { getProjects } from '$lib/api/projects.remote';

  let { data } = $props();

  const projects = getProjects({ teamId: data.team.id });
</script>

<svelte:head>
  <title>{data.team.name} — Boards — TeamBoard</title>
</svelte:head>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-6">{data.team.name} — Boards</h1>

  {#await projects}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(4) as _}
        <div class="h-32 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse"></div>
      {/each}
    </div>
  {:then boards}
    {#if boards.length === 0}
      <div class="text-center py-16">
        <p class="text-gray-400 mb-4">No boards yet. Create one to get started.</p>
        <a href="/{data.team.slug}/boards/new"
           class="inline-flex items-center gap-2 bg-indigo-600 text-white
                  px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          Create Board
        </a>
      </div>
    {:else}
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each boards as board (board.id)}
          <a
            href="/{data.team.slug}/boards/{board.id}"
            class="block p-6 bg-white dark:bg-gray-800 rounded-lg border
                   hover:border-indigo-300 transition-colors group"
          >
            <h2 class="font-semibold group-hover:text-indigo-600 transition-colors">
              {board.name}
            </h2>
            <p class="text-sm text-gray-500 mt-1">
              {board.description ?? 'No description'}
            </p>
            <div class="flex items-center gap-3 mt-4 text-xs text-gray-400">
              <span>{board.columns?.length ?? 0} columns</span>
              <span>{board.columns?.reduce((sum, c) => sum + c.taskCount, 0) ?? 0} tasks</span>
            </div>
          </a>
        {/each}
      </div>
    {/if}
  {:catch err}
    <div class="p-4 bg-red-50 text-red-700 rounded-lg">
      <p class="font-medium">Failed to load boards</p>
      <p class="text-sm">{err.message}</p>
    </div>
  {/await}
</div>
```

During SSR, Svelte awaits the promise before sending HTML — the board names, descriptions, and task counts are all in the initial server-rendered HTML. On client-side navigations, the `{#await}` block shows the skeleton state while data loads.

## Batching Multiple Queries

The dashboard might need teams, project summaries, and recent activity simultaneously. Without batching, each query creates a separate HTTP request — three round trips to the server. `query.batch` combines them into a single request:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { query } from '$app/server';
  import { getTeams } from '$lib/api/teams.remote';
  import { getProjects } from '$lib/api/projects.remote';

  // Batch all queries into a single HTTP request
  const [teams, engineeringProjects, designProjects] = query.batch(
    getTeams(),
    getProjects({ teamId: 1 }),
    getProjects({ teamId: 2 })
  );
</script>

{#await Promise.all([teams, engineeringProjects, designProjects])}
  <div class="p-8">
    <div class="h-8 w-48 bg-gray-200 rounded animate-pulse mb-6"></div>
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(6) as _}
        <div class="h-24 bg-gray-100 rounded-lg animate-pulse"></div>
      {/each}
    </div>
  </div>
{:then [teamList, engProjects, desProjects]}
  <div class="p-8 space-y-10">
    <section>
      <h2 class="text-xl font-bold mb-4">Teams ({teamList.length})</h2>
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {#each teamList as team (team.id)}
          <a href="/{team.slug}" class="block p-4 border rounded-lg hover:bg-gray-50
                                         transition-colors">
            <p class="font-semibold">{team.name}</p>
          </a>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold mb-4">Engineering ({engProjects.length} boards)</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each engProjects as project (project.id)}
          <div class="p-4 border rounded-lg">
            <p class="font-medium">{project.name}</p>
            <p class="text-sm text-gray-500">{project.description ?? 'No description'}</p>
          </div>
        {/each}
      </div>
    </section>

    <section>
      <h2 class="text-xl font-bold mb-4">Design ({desProjects.length} boards)</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        {#each desProjects as project (project.id)}
          <div class="p-4 border rounded-lg">
            <p class="font-medium">{project.name}</p>
            <p class="text-sm text-gray-500">{project.description ?? 'No description'}</p>
          </div>
        {/each}
      </div>
    </section>
  </div>
{/await}
```

All three queries ship as a single HTTP request. The server executes them in parallel (using `Promise.all` internally) and returns the results together, eliminating the waterfall of sequential round trips. On a page that needs five queries, this is the difference between five sequential HTTP requests (potentially 500ms+) and one parallel batch (under 100ms).

### When to Batch vs. Not

Batch queries that you need at the *same time* — data that appears together on the page. Do not batch queries that load at different times (e.g., an initial load and a user-triggered search). The batch call is a single atomic operation — all queries succeed or the error handling needs to account for partial failure.

## Reactive Arguments — Automatic Re-fetching

When a query function receives reactive state as an argument, it re-runs automatically when that state changes:

```svelte
<script lang="ts">
  import { getProjects } from '$lib/api/projects.remote';

  let selectedTeamId = $state(1);

  // Re-fetches AUTOMATICALLY whenever selectedTeamId changes
  const projects = getProjects({ teamId: selectedTeamId });
</script>

<div class="p-8">
  <div class="flex items-center gap-4 mb-6">
    <label for="team-select" class="font-medium">Team:</label>
    <select
      id="team-select"
      bind:value={selectedTeamId}
      class="border rounded-lg px-3 py-2"
    >
      <option value={1}>Engineering</option>
      <option value={2}>Design</option>
      <option value={3}>Marketing</option>
    </select>

    {#if projects.loading}
      <span class="text-sm text-gray-400 animate-pulse">Loading...</span>
    {/if}
  </div>

  {#if projects.current}
    <ul class="space-y-2">
      {#each projects.current as project (project.id)}
        <li class="p-3 border rounded-lg">
          <p class="font-medium">{project.name}</p>
        </li>
      {:else}
        <li class="text-gray-400 py-8 text-center">No projects for this team.</li>
      {/each}
    </ul>
  {/if}
</div>
```

Changing the dropdown triggers a new server call automatically. No `$effect`, no manual `.refresh()`, no watcher — the reactivity is built into the query system. The compiler tracks which arguments are reactive and sets up the re-fetching subscription automatically.

This is a fundamental advantage over `+page.server.ts` load functions, which only re-run when URL parameters change. Query functions re-run when *any reactive argument* changes, including component state, form inputs, and derived values.

### Debouncing Reactive Arguments

For search inputs, you want to debounce the query to avoid firing on every keystroke:

```svelte
<script lang="ts">
  import { searchTeams } from '$lib/api/teams.remote';

  let searchInput = $state('');
  let debouncedQuery = $state('');

  let debounceTimer: ReturnType<typeof setTimeout>;

  // Debounce the search input
  $effect(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = searchInput;
    }, 300);
  });

  // Query uses the debounced value — only fires 300ms after last keystroke
  const results = searchTeams({ query: debouncedQuery || 'a' });
</script>

<input
  type="text"
  placeholder="Search teams..."
  bind:value={searchInput}
  class="border rounded-lg px-3 py-2 w-full"
/>

{#if results.loading}
  <p class="text-sm text-gray-400 mt-2">Searching...</p>
{:else if results.current}
  <ul class="mt-2 space-y-1">
    {#each results.current as team (team.id)}
      <li class="p-2 hover:bg-gray-50 rounded">{team.name}</li>
    {/each}
  </ul>
{/if}
```

## Query Deduplication

Identical queries on the same page are deduplicated automatically — only one HTTP request fires and both components share the result:

```svelte
<!-- src/lib/components/layout/Sidebar.svelte -->
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  // Same query as the dashboard page — no extra HTTP request
  const teams = getTeams();
</script>

{#await teams then teamList}
  <nav class="space-y-1">
    {#each teamList as team (team.id)}
      <a
        href="/{team.slug}"
        class="block px-3 py-2 rounded-lg text-sm hover:bg-gray-100
               transition-colors"
      >
        {team.name}
      </a>
    {/each}
  </nav>
{/await}
```

Both the dashboard page and the sidebar component call `getTeams()`. SvelteKit recognizes they are the same function with the same arguments and serves the cached response. The deduplication is based on the function identity and a serialized comparison of the arguments — same function + same args = same result.

This means you can call query functions wherever you need the data without worrying about redundant requests. Each component declares its own data dependency, and the framework handles optimization.

## Error Recovery Patterns

Queries can fail for many reasons: network errors, server errors, invalid data, authentication issues. Good error handling distinguishes between recoverable and unrecoverable errors:

```svelte
<script lang="ts">
  import { getTeamById } from '$lib/api/teams.remote';

  let { teamId }: { teamId: number } = $props();

  const team = getTeamById({ id: teamId });

  let retryCount = $state(0);

  function handleRetry() {
    retryCount++;
    team.refresh();
  }
</script>

{#if team.error}
  <div class="p-6 rounded-lg border-2 border-red-200 bg-red-50">
    <h3 class="font-semibold text-red-800">
      {team.error.message === 'Team not found'
        ? 'Team Not Found'
        : 'Connection Error'}
    </h3>

    {#if team.error.message === 'Team not found'}
      <!-- Unrecoverable: the team does not exist -->
      <p class="text-sm text-red-600 mt-2">
        This team may have been deleted or you may not have access.
      </p>
      <a href="/dashboard" class="text-sm text-red-700 underline mt-3 inline-block">
        Back to Dashboard
      </a>
    {:else}
      <!-- Recoverable: network or server issue -->
      <p class="text-sm text-red-600 mt-2">
        {retryCount > 2
          ? 'Still having trouble. The server might be down.'
          : 'Check your connection and try again.'}
      </p>
      <button
        onclick={handleRetry}
        class="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg text-sm
               hover:bg-red-700 transition-colors"
        disabled={team.loading}
      >
        {team.loading ? 'Retrying...' : 'Retry'}
      </button>
    {/if}
  </div>
{/if}
```

### QueryBoundary — Reusable Error and Loading Wrapper

For consistent error and loading states across your app, build a reusable boundary component:

```svelte
<!-- src/lib/components/QueryBoundary.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    loading: boolean;
    error: Error | undefined;
    onRetry?: () => void;
    children: Snippet;
    fallback?: Snippet;
  }

  let { loading, error, onRetry, children, fallback }: Props = $props();
</script>

{#if error}
  <div class="p-4 bg-red-50 text-red-700 rounded-lg">
    <p class="font-medium">Something went wrong</p>
    <p class="text-sm mt-1">{error.message}</p>
    {#if onRetry}
      <button onclick={onRetry} class="mt-2 text-sm underline">Try again</button>
    {/if}
  </div>
{:else if loading}
  {#if fallback}
    {@render fallback()}
  {:else}
    <div class="animate-pulse space-y-4">
      <div class="h-4 bg-gray-200 rounded w-3/4"></div>
      <div class="h-4 bg-gray-200 rounded w-1/2"></div>
    </div>
  {/if}
{:else}
  {@render children()}
{/if}
```

Usage:

```svelte
<QueryBoundary
  loading={teams.loading}
  error={teams.error}
  onRetry={() => teams.refresh()}
>
  {#each teams.current ?? [] as team}
    <p>{team.name}</p>
  {/each}
</QueryBoundary>
```

## Invalidation and Optimistic Updates

After a mutation (creating a team, updating a project), you need to refresh the queries that show that data. The simplest approach: call `.refresh()` on the relevant queries after the mutation completes:

```svelte
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';
  import { enhance } from '$app/forms';

  const teams = getTeams();
</script>

<form
  method="POST"
  action="?/createTeam"
  use:enhance={() => {
    return async ({ update }) => {
      await update();
      // After the form action completes, refresh the teams query
      teams.refresh();
    };
  }}
>
  <input name="name" placeholder="Team name" required class="border rounded px-3 py-2" />
  <button type="submit" class="bg-indigo-600 text-white px-4 py-2 rounded">
    Create Team
  </button>
</form>
```

For a snappier UI, update the local data immediately and reconcile with the server:

```svelte
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  const teams = getTeams();

  async function renameTeam(teamId: number, newName: string) {
    // Optimistic: update local data immediately
    const previousData = teams.current;
    if (teams.current) {
      teams.current = teams.current.map((t) =>
        t.id === teamId ? { ...t, name: newName } : t
      );
    }

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: newName }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!res.ok) throw new Error('Failed to rename team');

      // Refresh to get canonical server data
      teams.refresh();
    } catch (err) {
      // Rollback on failure
      if (previousData) {
        teams.current = previousData;
      }
      console.error('Rename failed:', err);
    }
  }
</script>
```

The user sees the name change immediately. If the server rejects the change, the UI rolls back to the previous state. This provides perceived performance that makes the app feel instant.

## Complete Data-Driven Dashboard

Putting everything together — a dashboard that uses multiple queries, reactive filters, and error handling:

```svelte
<!-- src/routes/(app)/dashboard/+page.svelte -->
<script lang="ts">
  import { getTeams, getTeamStats } from '$lib/api/teams.remote';
  import { getProjectSummary } from '$lib/api/projects.remote';
  import QueryBoundary from '$components/QueryBoundary.svelte';

  const teams = getTeams();

  let selectedTeamId = $state<number | null>(null);

  // These re-fetch when selectedTeamId changes
  const teamStats = $derived(
    selectedTeamId ? getTeamStats({ teamId: selectedTeamId }) : null
  );
  const projectSummary = $derived(
    selectedTeamId ? getProjectSummary({ teamId: selectedTeamId }) : null
  );
</script>

<svelte:head>
  <title>Dashboard — TeamBoard</title>
</svelte:head>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-6">Dashboard</h1>

  <div class="grid gap-8 lg:grid-cols-[1fr_2fr]">
    <!-- Teams sidebar -->
    <div>
      <h2 class="text-sm font-medium text-gray-500 uppercase tracking-wider mb-3">
        Your Teams
      </h2>

      <QueryBoundary
        loading={teams.loading && !teams.current}
        error={teams.error}
        onRetry={() => teams.refresh()}
      >
        <div class="space-y-1">
          {#each teams.current ?? [] as team (team.id)}
            <button
              onclick={() => selectedTeamId = team.id}
              class="w-full text-left px-4 py-3 rounded-lg transition-colors
                     {selectedTeamId === team.id
                       ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                       : 'hover:bg-gray-50'}"
            >
              <p class="font-medium">{team.name}</p>
              {#if team.description}
                <p class="text-sm text-gray-500 line-clamp-1">{team.description}</p>
              {/if}
            </button>
          {/each}
        </div>
      </QueryBoundary>
    </div>

    <!-- Detail panel -->
    <div>
      {#if !selectedTeamId}
        <div class="flex items-center justify-center h-64 text-gray-400
                    border-2 border-dashed rounded-lg">
          Select a team to view details
        </div>
      {:else}
        <div class="space-y-6">
          {#if teamStats}
            <div class="grid grid-cols-3 gap-4">
              {#if teamStats.loading}
                {#each Array(3) as _}
                  <div class="h-20 bg-gray-100 rounded-lg animate-pulse"></div>
                {/each}
              {:else if teamStats.current}
                <div class="p-4 bg-white border rounded-lg">
                  <p class="text-sm text-gray-500">Members</p>
                  <p class="text-2xl font-bold">{teamStats.current.memberCount}</p>
                </div>
              {/if}
            </div>
          {/if}

          {#if projectSummary}
            <div>
              <h3 class="font-semibold mb-3">Projects</h3>
              {#if projectSummary.loading}
                <div class="space-y-2">
                  {#each Array(3) as _}
                    <div class="h-16 bg-gray-100 rounded-lg animate-pulse"></div>
                  {/each}
                </div>
              {:else if projectSummary.current}
                <div class="space-y-2">
                  {#each projectSummary.current as project (project.projectId)}
                    <div class="p-4 bg-white border rounded-lg">
                      <div class="flex items-center justify-between">
                        <p class="font-medium">{project.projectName}</p>
                        <div class="flex items-center gap-3 text-sm">
                          <span class="text-gray-500">
                            {project.completedTasks}/{project.totalTasks} tasks
                          </span>
                          {#if project.overdueTasks > 0}
                            <span class="text-red-600 font-medium">
                              {project.overdueTasks} overdue
                            </span>
                          {/if}
                        </div>
                      </div>
                      {#if project.totalTasks > 0}
                        <div class="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            class="h-full bg-indigo-600 rounded-full transition-all duration-500"
                            style="width: {(project.completedTasks / project.totalTasks) * 100}%"
                          ></div>
                        </div>
                      {/if}
                    </div>
                  {:else}
                    <p class="text-gray-400 py-4">No projects yet.</p>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
```

This dashboard demonstrates the power of query functions: clicking a team in the sidebar updates `selectedTeamId`, which automatically triggers new queries for that team's stats and project summary. No manual fetch calls, no effect hooks, no event listeners — the reactivity is built into the query system.

## When to Use Queries vs Load Functions

You now have two ways to load data. They are not competing tools — they solve different problems:

| Scenario | Use |
|----------|-----|
| Data needed by a specific route before rendering | `+page.server.ts` load |
| Data needed by a deeply nested component | `query()` remote function |
| Data shared across multiple unrelated pages | `query()` remote function |
| Data that depends only on URL parameters | `+page.server.ts` load |
| Data that depends on interactive state (dropdowns, filters, tabs) | `query()` remote function |
| Auth guard / redirect before any child renders | `+layout.server.ts` load |
| SEO-critical data that must be in initial HTML | Either (both support SSR) |
| Data that needs to refresh when component state changes | `query()` remote function |

The two approaches are not mutually exclusive. TeamBoard uses `+layout.server.ts` for the auth guard (it must run before any child renders) and query functions for teams, projects, and tasks (components fetch what they need). The auth guard is *structural* — it determines whether the page renders at all. The data queries are *content* — they fill in the details.

## Try It

Build the complete TeamBoard query layer:

1. Create `src/lib/api/teams.remote.ts` with `getTeams` (no arguments) and `getTeamById` (takes `{ id: number }` validated with Valibot). The Valibot schema should enforce that `id` is a positive integer.

2. Create `src/lib/api/projects.remote.ts` with `getProjects` (takes `{ teamId: number }`) and `getProjectById` (takes `{ projectId: number }`).

3. Build a dashboard page that calls `getTeams()` and displays teams as cards using `.loading`, `.error`, and `.current`. Add a refresh button that calls `.refresh()`. Handle the loading, error, and empty states distinctly.

4. When a team card is clicked, navigate to a team detail page that calls `getTeamById` and `getProjects` using `query.batch`. Use `{#await}` on the team detail page so SSR waits for the data.

5. Add a team selector dropdown on the boards page that uses reactive arguments — changing the dropdown re-fetches projects automatically without any manual refresh calls.

6. Build a `QueryBoundary` component that accepts `loading`, `error`, `onRetry`, `children`, and an optional `fallback` snippet. Use it to wrap all your query-dependent UI for consistent error and loading states.

## Key Takeaways

- Remote query functions decouple data fetching from routing — components declare their own server data dependencies instead of relying on page-level load functions
- Enable remote functions with `compilerOptions.experimental.async` and `kit.experimental.remoteFunctions` in `svelte.config.js`
- `.remote.ts` files run exclusively on the server; the compiler converts client imports into HTTP requests automatically
- **Always validate query arguments with Valibot** — remote functions become public HTTP endpoints under the hood, and unvalidated input is a security vulnerability
- `.current`, `.loading`, `.error`, and `.refresh()` provide reactive UI state for fine-grained control over loading, error, and success states
- `{#await}` makes SSR wait for data before sending HTML, eliminating loading spinners on initial page load — use it for SEO-critical content
- `query.batch` combines multiple simultaneous queries into a single HTTP request, eliminating request waterfalls
- Queries with identical functions and arguments are **deduplicated** — call them freely from any component without worrying about redundant requests
- Reactive arguments trigger automatic re-fetching — change a dropdown value and the query re-runs without manual intervention
- Use `+page.server.ts` for route-level, URL-dependent data and auth guards; use `query()` for component-level, interactive, state-dependent data
- Optimistic updates provide instant perceived performance — update the UI immediately, reconcile with the server, and roll back on failure
- Build `QueryBoundary` components for consistent error and loading state handling across your application
