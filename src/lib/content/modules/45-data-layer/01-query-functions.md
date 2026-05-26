# Query Functions for Teams & Projects

In Phase 5 you learned to load data with `+page.server.ts` — a load function tied to a specific route that runs before the page renders. That approach works, but it has a structural limitation: every piece of data the page needs must be declared at the route level and threaded down through props. If a deeply nested component needs team data, the page load function must fetch it and pass it through every intermediate component.

Remote query functions flip this model. Any component can import a query function from a `.remote.ts` file and call it directly. The compiler rewires the call into an HTTP request behind the scenes, the data stays reactive, and the component owns its own data dependency. This is a fundamental shift in how you think about data loading in SvelteKit applications — from route-centric to component-centric.

In this lesson you will build the query layer for TeamBoard's teams and projects, replacing what would traditionally be a stack of `+page.server.ts` files with a cleaner, component-driven approach. Along the way, you will learn the mental model behind remote functions, the security implications of exposing server code as HTTP endpoints, and the performance patterns that separate a smooth application from a waterfall of sequential requests.

## The Mental Model: RPC Over HTTP

Before writing any code, understand what remote functions actually are. When you export a function from a `.remote.ts` file and import it in a component, the Svelte compiler does the following:

1. **At build time:** The compiler strips the server-side implementation from the client bundle and replaces the import with a thin HTTP client stub.
2. **At runtime (client):** Calling the function sends an HTTP POST request to a SvelteKit-managed endpoint, serializing the arguments as the request body.
3. **At runtime (server):** SvelteKit receives the request, validates the arguments, calls your original function, and serializes the return value as the response body.
4. **During SSR:** The function is called directly on the server — no HTTP round trip, no serialization overhead. This is why SSR performance is excellent.

This is Remote Procedure Call (RPC) — a pattern as old as distributed computing itself, but applied here with compile-time type safety and automatic HTTP plumbing. The key insight is that your `.remote.ts` file is a **server module masquerading as a regular import**. The compiler makes the network boundary invisible in your source code, but that boundary absolutely exists at runtime. Forgetting this leads to bugs around serialization, latency, and security.

### What Can Cross the Network Boundary

The arguments you pass and the values you return must be serializable. SvelteKit uses `devalue` for serialization, which handles more types than JSON:

| Type | Supported | Notes |
|------|-----------|-------|
| Primitives (string, number, boolean, null) | Yes | Standard JSON types |
| `Date` | Yes | Serialized and deserialized correctly |
| `Map`, `Set` | Yes | Devalue handles these natively |
| `RegExp` | Yes | Serialized with flags |
| Plain objects, arrays | Yes | Nested structures work |
| Class instances | Partial | Serialized as plain objects; methods are lost |
| Functions | No | Cannot cross the network boundary |
| DOM nodes | No | Cannot be serialized |
| Symbols | No | Not serializable |

```typescript
// WRONG: Returning a class instance — methods are stripped
export const getTeam = query(async () => {
  const team = new Team(data); // Has methods like team.isActive()
  return team; // Client receives a plain object, team.isActive() throws
});

// CORRECT: Return plain data, compute derived values on the server
export const getTeam = query(async () => {
  const team = new Team(data);
  return {
    ...team.toJSON(),
    isActive: team.isActive(), // Pre-compute on the server
    memberCount: team.members.length
  };
});
```

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

### Common Configuration Mistakes

```javascript
// WRONG: Putting remoteFunctions inside compilerOptions
const config = {
  compilerOptions: {
    experimental: {
      async: true,
      remoteFunctions: true // This does not belong here!
    }
  }
};

// WRONG: Putting async inside kit.experimental
const config = {
  kit: {
    experimental: {
      remoteFunctions: true,
      async: true // This does not belong here!
    }
  }
};

// CORRECT: Each flag lives in its own experimental section
const config = {
  compilerOptions: {
    experimental: {
      async: true // Compiler-level flag
    }
  },
  kit: {
    experimental: {
      remoteFunctions: true // Kit-level flag
    }
  }
};
```

This is confusing because there are two `experimental` objects at different nesting levels. The compiler options control Svelte's template compilation. The kit options control SvelteKit's HTTP infrastructure. They are configured separately because they are separate systems.

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

### Why Validation Is Non-Negotiable

This point deserves emphasis because it is a security concern, not just a best practice. When you export a function from a `.remote.ts` file, the compiler creates a real HTTP endpoint for it. Anyone with browser dev tools can see the endpoint URL and craft arbitrary requests. Your query function's arguments come from the network — they are untrusted input, exactly like form submissions or API request bodies.

```typescript
// WRONG: No validation — trusting client-provided data
export const getTeamById = query(async (args: { id: number }) => {
  // args.id could be ANYTHING the client sends: a string, an object,
  // a number much larger than your database supports
  const [team] = await db.select().from(teams).where(eq(teams.id, args.id));
  return team;
});

// CORRECT: Validate with Valibot before touching the database
const TeamByIdSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1))
});

export const getTeamById = query(TeamByIdSchema, async ({ id }) => {
  // id is guaranteed to be a positive integer
  const [team] = await db.select().from(teams).where(eq(teams.id, id));
  if (!team) throw new Error('Team not found');
  return team;
});
```

The Valibot schema is your first line of defense. Use `v.pipe()` to chain validators — `v.number()` ensures the type, `v.integer()` rejects decimals, and `v.minValue(1)` rejects zero and negative IDs. This stops an entire class of bugs and attacks before they reach your database layer.

### Structuring Your Remote Files

As your application grows, you need a strategy for organizing remote files. There are two common approaches:

**By domain entity** (recommended for most apps):

```
src/lib/api/
  teams.remote.ts      # getTeams, getTeamById, getTeamMembers
  projects.remote.ts   # getProjects, getProjectById
  tasks.remote.ts      # getTasks, getTasksByColumn, getTaskById
  users.remote.ts      # getCurrentUser, getUserProfile
```

**By feature area** (better for large apps with clear boundaries):

```
src/lib/api/
  dashboard.remote.ts  # getDashboardStats, getRecentActivity
  board.remote.ts      # getBoardData, getBoardColumns, getBoardTasks
  settings.remote.ts   # getTeamSettings, getUserPreferences
```

The domain-entity approach maps cleanly to your database schema. The feature-area approach maps to your UI structure. Pick one and be consistent — mixing both leads to confusion about where to find or add a query.

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
      .orderBy(boards.createdAt);

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

### The N+1 Query Problem in Remote Functions

Notice that `getProjectById` runs three database queries sequentially — one for the project, one for columns, one for task counts. In a traditional REST API, this would be the project endpoint, and you might accept the sequential queries because they are fast individual lookups. But in a remote function context, this pattern can become problematic:

```typescript
// WRONG: Sequential queries when parallel is possible
export const getProjectById = query(schema, async ({ projectId }) => {
  const [project] = await db.select().from(boards).where(eq(boards.id, projectId)).limit(1);
  if (!project) throw new Error('Project not found');

  // These two queries don't depend on each other — run them in parallel!
  const projectColumns = await db.select().from(columns).where(eq(columns.boardId, projectId));
  const taskCounts = await db.select({ columnId: tasks.columnId, total: count() })
    .from(tasks).where(eq(tasks.boardId, projectId)).groupBy(tasks.columnId);

  return { ...project, columns: projectColumns, taskCounts };
});

// CORRECT: Parallel queries with Promise.all
export const getProjectById = query(schema, async ({ projectId }) => {
  const [project] = await db.select().from(boards).where(eq(boards.id, projectId)).limit(1);
  if (!project) throw new Error('Project not found');

  // Run independent queries in parallel
  const [projectColumns, taskCounts] = await Promise.all([
    db.select().from(columns)
      .where(eq(columns.boardId, projectId))
      .orderBy(columns.position),
    db.select({ columnId: tasks.columnId, total: count() })
      .from(tasks)
      .where(eq(tasks.boardId, projectId))
      .groupBy(tasks.columnId)
  ]);

  return {
    ...project,
    columns: projectColumns.map((col) => ({
      ...col,
      taskCount: taskCounts.find((t) => t.columnId === col.id)?.total ?? 0
    }))
  };
});
```

The first query for the project must complete before the others (because we need to know if the project exists). But the columns and task counts queries are independent — they only need the `projectId`, which we already have. Running them in parallel saves one full database round trip.

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

### Understanding the Reactive Return Object

The object returned by a query function is deeply reactive. Here is what each property does and when it changes:

| Property | Type | When it updates |
|----------|------|-----------------|
| `.current` | `T \| undefined` | Set when the query resolves successfully |
| `.loading` | `boolean` | `true` when a request is in flight, `false` otherwise |
| `.error` | `Error \| null` | Set when the query rejects; cleared on successful refresh |
| `.refresh()` | `() => void` | Triggers a new request; updates `.loading`, then `.current` or `.error` |

A critical subtlety: `.current` retains its previous value while a refresh is in progress. This means you can show stale data with a loading indicator overlay, rather than replacing content with a spinner:

```svelte
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';

  const teams = getTeams();
</script>

<!-- Show existing data with an overlay during refresh -->
<div class="relative">
  {#if teams.loading && teams.current}
    <div class="absolute inset-0 bg-white/50 flex items-center justify-center z-10">
      <span class="text-gray-500">Refreshing...</span>
    </div>
  {/if}

  {#if teams.current}
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each teams.current as team}
        <div class="p-6 bg-white rounded-lg border">
          <h2 class="text-lg font-semibold">{team.name}</h2>
        </div>
      {/each}
    </div>
  {:else if teams.loading}
    <p>Loading for the first time...</p>
  {:else if teams.error}
    <p>Error: {teams.error.message}</p>
  {/if}
</div>
```

This stale-while-revalidate pattern avoids the jarring flash of a loading spinner when the user already has data on screen.

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

During SSR, Svelte awaits the promise before sending HTML — no loading spinner on initial page load. On client-side navigations, the `{#await}` block shows the loading state.

### When to Use Which Pattern

The choice between `.loading`/`.current`/`.error` and `{#await}` is about UX, not functionality:

| Pattern | Best for | SSR behavior |
|---------|----------|-------------|
| `.loading` / `.current` / `.error` | Interactive dashboards, stale-while-revalidate, fine-grained loading states | Component suspends during SSR |
| `{#await}` | Content pages, initial renders, sequential data dependencies | Page waits for data before sending HTML |

```svelte
<!-- WRONG: Using {#await} for a dashboard with refresh capability -->
<!-- The user cannot refresh without losing the entire UI state -->
{#await getTeams()}
  <p>Loading...</p>
{:then teams}
  <!-- How do you add a refresh button here? -->
  <!-- The promise is resolved; you cannot re-trigger it -->
  {#each teams as team}
    <p>{team.name}</p>
  {/each}
{/await}

<!-- CORRECT: Use the reactive object for interactive scenarios -->
<script lang="ts">
  const teams = getTeams();
</script>

<button onclick={() => teams.refresh()}>Refresh</button>

{#if teams.current}
  {#each teams.current as team}
    <p>{team.name}</p>
  {/each}
{/if}
```

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

### Batch vs. Parallel Requests: When Batching Hurts

Batching is not always faster. A single batched request waits for the slowest query in the batch before returning any results. If one query takes 50ms and another takes 2000ms, both results arrive after 2000ms. Without batching, the fast query's UI would update in 50ms.

```svelte
<!-- When one query is much slower than others, batching hurts perceived performance -->
<script lang="ts">
  import { query } from '$app/server';
  import { getTeams } from '$lib/api/teams.remote';
  import { getAnalyticsReport } from '$lib/api/analytics.remote'; // Slow!

  // WRONG: Fast data waits for slow data
  const [teams, analytics] = query.batch(
    getTeams(),              // 50ms
    getAnalyticsReport()     // 2000ms — blocks everything
  );
</script>
```

```svelte
<!-- CORRECT: Let fast and slow data load independently -->
<script lang="ts">
  import { getTeams } from '$lib/api/teams.remote';
  import { getAnalyticsReport } from '$lib/api/analytics.remote';

  // Two separate requests — teams shows immediately
  const teams = getTeams();
  const analytics = getAnalyticsReport();
</script>

<!-- Teams grid appears in ~50ms -->
{#if teams.current}
  <div class="grid gap-4">
    {#each teams.current as team}
      <p>{team.name}</p>
    {/each}
  </div>
{/if}

<!-- Analytics loads independently, shows when ready -->
{#if analytics.loading}
  <p>Calculating analytics...</p>
{:else if analytics.current}
  <AnalyticsChart data={analytics.current} />
{/if}
```

**Batch** when all queries are roughly the same speed and the UI needs all of them before it can render anything meaningful. **Keep separate** when queries have different speeds and you want progressive rendering.

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

### Debouncing Reactive Arguments

Reactive re-fetching is powerful but dangerous with fast-changing inputs. A text input that triggers a search query on every keystroke fires a request for every character. The server gets hammered, responses arrive out of order, and the UI flickers:

```svelte
<!-- WRONG: Every keystroke fires a server request -->
<script lang="ts">
  import { searchTeams } from '$lib/api/teams.remote';

  let searchQuery = $state('');
  const results = searchTeams({ q: searchQuery }); // Fires on every keystroke!
</script>

<input bind:value={searchQuery} placeholder="Search teams..." />
```

```svelte
<!-- CORRECT: Debounce the input before sending to the query -->
<script lang="ts">
  import { searchTeams } from '$lib/api/teams.remote';

  let searchInput = $state('');
  let debouncedQuery = $state('');

  // Debounce: wait 300ms after the user stops typing
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedQuery = searchInput;
    }, 300);

    return () => clearTimeout(debounceTimer);
  });

  // Only re-fetches when debouncedQuery changes, not on every keystroke
  const results = searchTeams({ q: debouncedQuery });
</script>

<input bind:value={searchInput} placeholder="Search teams..." />

{#if results.loading}
  <p class="text-gray-400">Searching...</p>
{:else if results.current}
  {#each results.current as team}
    <p>{team.name}</p>
  {/each}
{/if}
```

The debounce effect waits 300ms after the last keystroke before updating `debouncedQuery`. The query function watches `debouncedQuery`, not `searchInput`, so it only fires after the user pauses. The cleanup function (`return () => clearTimeout(debounceTimer)`) prevents stale timers when the component is destroyed.

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

### How Deduplication Works Under the Hood

Deduplication is based on function identity and argument equality. Two calls are considered identical when:

1. They reference the same exported query function (same module, same export name)
2. Their arguments are structurally equal (deep comparison, not reference equality)

This means:

```typescript
// These ARE deduplicated (same function, same args)
getTeamById({ id: 1 });
getTeamById({ id: 1 });

// These are NOT deduplicated (different args)
getTeamById({ id: 1 });
getTeamById({ id: 2 });

// These are NOT deduplicated (different functions, even if they do the same thing)
getTeamById({ id: 1 });
getTeamBySlug({ slug: 'engineering' }); // Different function
```

Deduplication happens per render cycle. If component A and component B both call `getTeams()` during the same SSR pass or the same client navigation, they share one request. If component A refreshes later with `teams.refresh()`, that is a new request and does not deduplicate against the original.

## Error Handling Strategies

Remote functions can fail for many reasons: network errors, database timeouts, validation failures, authorization errors. Your error handling strategy should distinguish between recoverable and unrecoverable failures:

```svelte
<script lang="ts">
  import { getTeamById } from '$lib/api/teams.remote';

  let { teamId } = $props();
  const team = getTeamById({ id: teamId });
</script>

{#if team.error}
  {#if team.error.message === 'Team not found'}
    <!-- Unrecoverable: the team does not exist -->
    <div class="p-8 text-center">
      <h2 class="text-xl font-bold text-gray-700">Team Not Found</h2>
      <p class="text-gray-500 mt-2">This team may have been deleted.</p>
      <a href="/dashboard" class="text-indigo-600 underline mt-4 inline-block">
        Back to Dashboard
      </a>
    </div>
  {:else}
    <!-- Recoverable: network error, timeout, etc. -->
    <div class="p-4 bg-red-50 text-red-700 rounded-lg">
      <p class="font-medium">Failed to load team</p>
      <p class="text-sm mt-1">{team.error.message}</p>
      <button
        onclick={() => team.refresh()}
        class="mt-2 px-4 py-2 bg-red-100 rounded text-sm"
      >
        Retry
      </button>
    </div>
  {/if}
{:else if team.current}
  <h1>{team.current.name}</h1>
  <!-- ... rest of the UI -->
{/if}
```

For a more structured approach, throw typed errors from your query functions:

```typescript
// src/lib/api/errors.ts
export class NotFoundError extends Error {
  constructor(entity: string, id: number | string) {
    super(`${entity} not found: ${id}`);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to access this resource') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

// src/lib/api/teams.remote.ts
import { NotFoundError, ForbiddenError } from '$lib/api/errors';

export const getTeamById = query(TeamByIdSchema, async ({ id }) => {
  const [team] = await db.select().from(teams).where(eq(teams.id, id)).limit(1);

  if (!team) throw new NotFoundError('Team', id);

  // Check authorization
  const userId = getCurrentUserId();
  const isMember = await db.select().from(teamMembers)
    .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, userId)))
    .limit(1);

  if (!isMember.length) throw new ForbiddenError();

  return team;
});
```

## When to Use Queries vs Load Functions

You now have two ways to load data. Here is when to use each:

| Scenario | Use | Why |
|----------|-----|-----|
| Data needed by a specific route before rendering | `+page.server.ts` load | Route-level preloading, URL parameter parsing |
| Data needed by a deeply nested component | `query()` remote function | No prop drilling, component owns its data |
| Data shared across multiple pages | `query()` remote function | Deduplication handles sharing automatically |
| Data that depends on URL parameters only | `+page.server.ts` load | Cleaner, more conventional pattern |
| Data that depends on interactive state (dropdowns, filters) | `query()` remote function | Reactive arguments re-fetch automatically |
| SEO-critical data that must be in initial HTML | Either | Both support SSR, both await during server rendering |
| Auth guards and redirects | `+layout.server.ts` load | Must run before any child renders |
| Data for prefetching on hover/focus | `+page.server.ts` load | SvelteKit's link preloading uses load functions |

The two approaches are not mutually exclusive. TeamBoard uses `+layout.server.ts` for the auth guard (it must run before any child renders) and query functions for teams, projects, and tasks (components fetch what they need). The general principle: use load functions for route-level concerns (auth, redirects, URL parameters) and query functions for data-level concerns (fetching, filtering, pagination).

## Try It

Create a `src/lib/api/teams.remote.ts` file with `getTeams` (no arguments) and `getTeamById` (takes `{ id: number }` validated with Valibot using `v.pipe(v.number(), v.integer(), v.minValue(1))`). Create a `src/lib/api/projects.remote.ts` file with `getProjects` (takes `{ teamId: number }`). Build a dashboard page that:

1. Calls `getTeams()` and displays them as cards using `.loading`, `.error`, and `.current` — include skeleton loading states (three animated placeholder cards)
2. Shows the previous data with a semi-transparent overlay during refreshes (stale-while-revalidate pattern)
3. Adds a refresh button that calls `.refresh()` and is disabled while `.loading` is true
4. When a team card is clicked, navigates to a team detail page that calls `getTeamById` and `getProjects` using `query.batch` — show all results together
5. Uses `{#await}` on the team detail page so SSR waits for the data before sending HTML
6. Handles errors with different UI for "not found" (show a "back to dashboard" link) vs. network errors (show a retry button)
7. Adds a search input above the teams list that filters teams by name — debounce the input by 300ms before triggering a new query

## Key Takeaways

- Remote query functions decouple data fetching from routing — components declare their own server data dependencies without prop drilling
- Enable remote functions with `compilerOptions.experimental.async` (compiler-level) and `kit.experimental.remoteFunctions` (kit-level) — they are separate settings at different nesting levels
- `.remote.ts` files run exclusively on the server; the compiler converts imports into HTTP requests on the client and direct calls during SSR
- Remote functions are real HTTP endpoints under the hood — always validate arguments with Valibot because they receive untrusted input from the network
- Use `v.pipe()` to chain validators for defense in depth: type checking, range validation, and format validation in one schema
- `.current`, `.loading`, `.error`, and `.refresh()` provide reactive UI state; `.current` retains previous data during refresh for stale-while-revalidate patterns
- `{#await}` makes SSR wait for data before sending HTML, eliminating loading spinners on initial page load — use it for content pages, not interactive dashboards
- `query.batch` combines multiple simultaneous queries into a single HTTP request — but only use it when queries have similar response times; mismatched speeds delay fast queries
- Queries with identical functions and arguments are deduplicated within a render cycle — call them freely without worrying about duplicate requests
- Debounce reactive arguments from fast-changing inputs (text fields, sliders) to avoid hammering the server with requests
- Use `Promise.all` inside query functions to parallelize independent database queries, avoiding sequential round trips
- Use `+page.server.ts` for route-level concerns (auth, redirects, URL parameters); use `query()` for data-level concerns (fetching, filtering, pagination, component-owned data)
- Return plain serializable data from queries — class instances lose their methods when crossing the network boundary
