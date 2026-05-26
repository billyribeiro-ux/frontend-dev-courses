# Command & Prerender

Not every server interaction fits into a form. Drag-and-drop reordering, inline editing, toggle switches, "add to favorites" buttons, bulk actions, real-time collaboration updates — these are all mutations that happen outside of a `<form>` element. The `command` function handles these imperative mutations. On the other end of the spectrum, some data barely changes — site configuration, navigation menus, content from a CMS, feature flags. The `prerender` function fetches that data at build time so it is available instantly without any server call at runtime.

Together with `query` and `form`, these two functions complete the remote functions toolkit. Understanding when to reach for each one — and why — is what separates a SvelteKit developer who gets things done from one who fights the framework.

## Command — Imperative Mutations

`command` defines a server function that you call explicitly from event handlers. It takes a validation schema and an async handler, just like `form` and `query`:

```typescript
// src/lib/api/todos.remote.ts
import { command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { todosTable } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const toggleTodo = command(
  v.object({
    id: v.number(),
    completed: v.boolean()
  }),
  async ({ id, completed }) => {
    await db
      .update(todosTable)
      .set({ completed })
      .where(eq(todosTable.id, id));
  }
);

export const reorderTodos = command(
  v.object({
    ids: v.array(v.number())
  }),
  async ({ ids }) => {
    // Update positions in a transaction for atomicity
    await db.transaction(async (tx) => {
      for (let i = 0; i < ids.length; i++) {
        await tx
          .update(todosTable)
          .set({ position: i })
          .where(eq(todosTable.id, ids[i]));
      }
    });
  }
);
```

Call commands from event handlers in your component:

```svelte
<script lang="ts">
  import { toggleTodo, reorderTodos } from '$lib/api/todos.remote';
  import { getTodos } from '$lib/api/todos.remote';

  const todos = getTodos();
</script>

{#await todos then items}
  {#each items as todo (todo.id)}
    <label>
      <input
        type="checkbox"
        checked={todo.completed}
        onchange={() => toggleTodo({ id: todo.id, completed: !todo.completed })}
      />
      {todo.title}
    </label>
  {/each}
{/await}
```

### Why Not Just Use form?

The `form` function works through HTML `<form>` elements with progressive enhancement. It is the right choice when users are filling out fields and submitting structured input. But many interactions do not involve forms at all:

| Interaction | Best choice | Why |
|-------------|-------------|-----|
| Toggle checkbox | `command` | No form element, single-click action |
| Drag-and-drop reorder | `command` | Complex gesture, no form submission |
| Inline text edit (blur to save) | `command` | Edit-in-place, no submit button |
| "Add to favorites" heart icon | `command` | Single-click toggle |
| Delete with confirmation dialog | `command` | Button click after modal confirmation |
| Registration form | `form` | Structured input, progressive enhancement |
| Multi-field settings page | `form` | Multiple related inputs, submit button |
| Search with filters | `form` | URL-serializable, bookmarkable |

The mental model: `form` is for when users are consciously filling out and submitting data. `command` is for when users are interacting with the UI and things should happen immediately.

### Commands Cannot Be Called During Render

This is an intentional constraint. Commands represent mutations — side effects that change data on the server. Svelte enforces that mutations only happen in response to explicit user actions:

```svelte
<script lang="ts">
  import { deleteTodo } from '$lib/api/todos.remote';

  // BAD: This would error — cannot call command during render
  // deleteTodo({ id: 5 });

  // BAD: This would also error — $effect runs during render
  // $effect(() => { deleteTodo({ id: 5 }); });

  // GOOD: called from event handler
  function handleDelete(id: number) {
    deleteTodo({ id });
  }
</script>

<button onclick={() => handleDelete(5)}>Delete</button>
```

This prevents accidental mutations from firing during server-side rendering, during hydration, or every time a component re-renders.

## Command Error Handling

Commands can throw errors, and you need to handle them in the UI. The command returns a promise, so you can use `try/catch`:

```svelte
<script lang="ts">
  import { toggleTodo } from '$lib/api/todos.remote';

  let error = $state<string | null>(null);
  let saving = $state(false);

  async function handleToggle(id: number, completed: boolean) {
    error = null;
    saving = true;
    try {
      await toggleTodo({ id, completed });
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to update todo';
      // Optionally revert optimistic UI here
    } finally {
      saving = false;
    }
  }
</script>

{#if error}
  <div class="error" role="alert">
    <p>{error}</p>
    <button onclick={() => error = null}>Dismiss</button>
  </div>
{/if}
```

### Server-Side Validation Errors

The validation schema runs on the server before your handler executes. If validation fails, Svelte throws a structured error:

```typescript
export const updateProfile = command(
  v.object({
    name: v.pipe(v.string(), v.minLength(2, 'Name must be at least 2 characters')),
    email: v.pipe(v.string(), v.email('Invalid email address')),
    bio: v.pipe(v.string(), v.maxLength(500, 'Bio must be 500 characters or less'))
  }),
  async ({ name, email, bio }) => {
    await db.update(usersTable).set({ name, email, bio }).where(eq(usersTable.id, currentUserId));
  }
);
```

If the user sends `{ name: 'A', email: 'invalid' }`, the command throws before the handler runs. The validation error includes which fields failed and why.

### Redirects After Commands

Some commands need to redirect the user after completing. Use SvelteKit's `redirect` inside the handler:

```typescript
import { command } from '$app/server';
import { redirect } from '@sveltejs/kit';
import * as v from 'valibot';

export const deleteAccount = command(
  v.object({ confirmText: v.literal('DELETE') }),
  async ({ confirmText }) => {
    await db.delete(usersTable).where(eq(usersTable.id, currentUserId));

    // Clear session, then redirect to home
    throw redirect(303, '/');
  }
);
```

The `throw redirect(...)` pattern works the same way it does in `load` functions and form actions. The browser receives a redirect response and navigates to the target URL.

## Invalidating Queries After a Command

After a mutation, your cached query data is stale. Use `.updates` to tell SvelteKit which queries to refresh:

```typescript
// src/lib/api/todos.remote.ts
import { command, query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { todosTable } from '$lib/server/schema';
import { eq, asc } from 'drizzle-orm';

export const getTodos = query(async () => {
  return await db.select().from(todosTable).orderBy(asc(todosTable.position));
});

export const deleteTodo = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(todosTable).where(eq(todosTable.id, id));
  }
).updates(getTodos);
```

When `deleteTodo` completes, SvelteKit automatically re-fetches `getTodos`. The UI updates without a manual refresh call.

### Updating Multiple Queries

A single mutation can affect several data sources. Chain multiple query references:

```typescript
export const archiveProject = command(
  v.object({ projectId: v.number() }),
  async ({ projectId }) => {
    await db.update(projectsTable)
      .set({ archived: true })
      .where(eq(projectsTable.id, projectId));
  }
).updates(getProjects, getProjectStats, getRecentActivity);
```

After `archiveProject` completes, all three queries re-fetch. The project list updates, the statistics dashboard recalculates, and the activity feed shows the archive action.

### When Updates Are Not Enough: Return Values

Sometimes you want the command to return a value for immediate use — for example, the ID of a newly created record:

```typescript
export const createTodo = command(
  v.object({
    title: v.pipe(v.string(), v.minLength(1)),
    listId: v.number()
  }),
  async ({ title, listId }) => {
    const [todo] = await db.insert(todosTable)
      .values({ title, listId, completed: false, position: 0 })
      .returning();

    return { id: todo.id };
  }
).updates(getTodos);
```

```svelte
<script lang="ts">
  import { createTodo } from '$lib/api/todos.remote';

  async function handleAdd() {
    const result = await createTodo({ title: 'New task', listId: 1 });
    console.log('Created todo with ID:', result.id);
    // Maybe focus the new item, scroll to it, etc.
  }
</script>
```

## Optimistic Updates with Commands

For snappy UIs, you do not want to wait for the server to respond before showing the change. Optimistic updates show the result immediately and roll back if the server rejects it:

```svelte
<script lang="ts">
  import { toggleTodo, getTodos } from '$lib/api/todos.remote';

  const todosResource = getTodos();
  let optimisticOverrides = $state<Map<number, boolean>>(new Map());

  async function handleToggle(id: number, currentCompleted: boolean) {
    const newCompleted = !currentCompleted;

    // Step 1: Optimistically update the UI
    optimisticOverrides.set(id, newCompleted);
    optimisticOverrides = new Map(optimisticOverrides); // Trigger reactivity

    try {
      // Step 2: Send to server
      await toggleTodo({ id, completed: newCompleted });

      // Step 3: Server confirmed — remove override (real data will arrive via .updates)
      optimisticOverrides.delete(id);
      optimisticOverrides = new Map(optimisticOverrides);
    } catch {
      // Step 4: Server rejected — roll back
      optimisticOverrides.delete(id);
      optimisticOverrides = new Map(optimisticOverrides);
      // Optionally show error toast
    }
  }
</script>

{#await todosResource then todos}
  {#each todos as todo (todo.id)}
    {@const isCompleted = optimisticOverrides.has(todo.id)
      ? optimisticOverrides.get(todo.id)
      : todo.completed}
    <label class:optimistic={optimisticOverrides.has(todo.id)}>
      <input
        type="checkbox"
        checked={isCompleted}
        onchange={() => handleToggle(todo.id, todo.completed)}
      />
      <span class:completed={isCompleted}>{todo.title}</span>
    </label>
  {/each}
{/await}

<style>
  .optimistic { opacity: 0.7; }
  .completed { text-decoration: line-through; color: #999; }
</style>
```

The pattern is: (1) immediately show the expected result, (2) send the mutation to the server, (3) on success, let the query invalidation replace the optimistic data with real data, (4) on failure, revert the optimistic change and show an error.

## Prerender — Build-Time Data

`prerender` executes a function at build time and caches the result. The data is served statically — no server round-trip at runtime:

```typescript
// src/lib/api/config.remote.ts
import { prerender } from '$app/server';

export const getSiteConfig = prerender(async () => {
  const res = await fetch('https://cms.example.com/api/config');
  return res.json() as Promise<{
    title: string;
    description: string;
    logo: string;
    socialLinks: { platform: string; url: string }[];
  }>;
});

export const getNavigation = prerender(async () => {
  const res = await fetch('https://cms.example.com/api/navigation');
  return res.json() as Promise<{
    items: { label: string; href: string; children?: { label: string; href: string }[] }[];
  }>;
});
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { getSiteConfig, getNavigation } from '$lib/api/config.remote';

  const config = getSiteConfig();
  const nav = getNavigation();
</script>

{#await config then site}
  <header>
    <img src={site.logo} alt={site.title} />
    <h1>{site.title}</h1>
  </header>
{/await}

{#await nav then navigation}
  <nav>
    {#each navigation.items as item}
      <a href={item.href}>{item.label}</a>
    {/each}
  </nav>
{/await}
```

The CMS is queried once during `vite build`. Every visitor receives the cached result instantly. No serverless function invocation, no database query, no CMS API call. The data is embedded in the build output as static JSON.

### When to Use Prerender

Prerender is for data that:
- Changes rarely (site config, navigation, feature flags)
- Is the same for every visitor (not personalized)
- Is acceptable to be stale until the next deployment
- Comes from external services you want to decouple from at runtime (CMS, configuration APIs)

Prerender is NOT for:
- User-specific data (profiles, carts, dashboards)
- Frequently changing data (stock prices, live scores)
- Data that must be real-time (chat messages, notifications)

## Prerender with Inputs

When the function accepts arguments, use the `inputs` option to specify which argument combinations to prerender:

```typescript
// src/lib/api/content.remote.ts
import { prerender } from '$app/server';
import * as v from 'valibot';

export const getPage = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const res = await fetch(`https://cms.example.com/api/pages/${slug}`);
    if (!res.ok) throw new Error(`Page not found: ${slug}`);
    return res.json() as Promise<{
      title: string;
      body: string;
      lastUpdated: string;
    }>;
  },
  {
    inputs: [
      { slug: 'about' },
      { slug: 'contact' },
      { slug: 'privacy' },
      { slug: 'terms' },
      { slug: 'faq' }
    ]
  }
);
```

At build time, SvelteKit calls `getPage` five times — once for each input — and caches all five results. When a user visits `/about`, the prerendered data is served without any server call.

### Generating Inputs Dynamically

You do not have to hardcode the input list. You can fetch it from an API or database at build time:

```typescript
export const getBlogPost = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const res = await fetch(`https://cms.example.com/api/posts/${slug}`);
    return res.json();
  },
  {
    inputs: async () => {
      // This runs at build time to discover which slugs to prerender
      const res = await fetch('https://cms.example.com/api/posts?fields=slug');
      const posts = await res.json();
      return posts.map((p: { slug: string }) => ({ slug: p.slug }));
    }
  }
);
```

This pattern is analogous to static site generators that query a CMS for all pages at build time, but it integrates natively with SvelteKit's runtime architecture.

## Dynamic Fallback

What if a new page is added to the CMS after the build? Enable `dynamic: true` to fall back to a runtime server call for values not in the prerendered set:

```typescript
export const getPage = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const res = await fetch(`https://cms.example.com/api/pages/${slug}`);
    if (!res.ok) throw new Error(`Page not found: ${slug}`);
    return res.json();
  },
  {
    inputs: [
      { slug: 'about' },
      { slug: 'contact' }
    ],
    dynamic: true
  }
);
```

The behavior:
- Requests for `/about` and `/contact` are served from the build cache — instant, no server involved.
- A request for `/faq` (not in the prerendered set) triggers a live server call. The function runs on the server, fetches from the CMS, and returns the result.
- The dynamically fetched result is then cached via the Cache API and cleared automatically on new deployments.

This is SvelteKit's version of Incremental Static Regeneration (ISR). It gives you the performance of static generation with the flexibility of dynamic rendering for new content.

### Cache Control for Dynamic Fallback

You can control how long dynamically fetched results are cached:

```typescript
export const getPage = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const res = await fetch(`https://cms.example.com/api/pages/${slug}`);
    return res.json();
  },
  {
    inputs: [{ slug: 'about' }],
    dynamic: true,
    // Cache dynamic results for 1 hour
    ttl: 60 * 60
  }
);
```

After 1 hour, the next request for that slug triggers a fresh fetch from the CMS. The stale result can optionally be served while the fresh one is being fetched (stale-while-revalidate pattern).

## Command vs Form Actions — Decision Framework

With multiple ways to handle mutations, here is a precise decision framework:

```
Is this triggered by a <form> submit?
├── Yes → Does it need to work without JavaScript?
│   ├── Yes → Use `form` (progressive enhancement)
│   └── No → Use `form` anyway (it's still the best fit for form submissions)
└── No → Is this an imperative action from a gesture/click/interaction?
    ├── Yes → Use `command`
    └── No → You probably don't need a mutation
```

Concrete examples:

```typescript
// FORM: User fills out fields and clicks Submit
export const updateProfile = form(
  v.object({ name: v.string(), bio: v.string() }),
  async (data) => { /* ... */ }
);

// COMMAND: User clicks a toggle switch
export const toggleNotifications = command(
  v.object({ enabled: v.boolean() }),
  async ({ enabled }) => { /* ... */ }
);

// COMMAND: User drags an item to a new position
export const reorderItems = command(
  v.object({ itemId: v.number(), newIndex: v.number() }),
  async ({ itemId, newIndex }) => { /* ... */ }
);

// FORM: User types a search query and submits
// (Actually, queries might be better here — search is a read, not a write)
```

## Complete CRUD with Command and Query

Here is a full task management system using `query` for reads and `command` for writes:

```typescript
// src/lib/api/tasks.remote.ts
import { query, command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { tasksTable } from '$lib/server/schema';
import { eq, asc, desc } from 'drizzle-orm';

// === READS ===

export const getTasks = query(
  v.object({
    status: v.optional(v.picklist(['all', 'active', 'completed'])),
    sort: v.optional(v.picklist(['newest', 'oldest', 'position']))
  }),
  async ({ status = 'all', sort = 'position' }) => {
    let q = db.select().from(tasksTable).$dynamic();

    if (status === 'active') q = q.where(eq(tasksTable.completed, false));
    if (status === 'completed') q = q.where(eq(tasksTable.completed, true));

    if (sort === 'newest') q = q.orderBy(desc(tasksTable.createdAt));
    else if (sort === 'oldest') q = q.orderBy(asc(tasksTable.createdAt));
    else q = q.orderBy(asc(tasksTable.position));

    return await q;
  }
);

export const getTaskStats = query(async () => {
  const all = await db.select().from(tasksTable);
  return {
    total: all.length,
    active: all.filter(t => !t.completed).length,
    completed: all.filter(t => t.completed).length
  };
});

// === WRITES ===

export const createTask = command(
  v.object({
    title: v.pipe(v.string(), v.trim(), v.minLength(1, 'Title is required')),
    description: v.optional(v.string())
  }),
  async ({ title, description }) => {
    const maxPos = await db.select({ max: sql`MAX(position)` }).from(tasksTable);
    const position = (maxPos[0]?.max as number ?? -1) + 1;

    const [task] = await db.insert(tasksTable)
      .values({ title, description, completed: false, position })
      .returning();

    return { id: task.id };
  }
).updates(getTasks, getTaskStats);

export const updateTask = command(
  v.object({
    id: v.number(),
    title: v.optional(v.pipe(v.string(), v.trim(), v.minLength(1))),
    description: v.optional(v.string()),
    completed: v.optional(v.boolean())
  }),
  async ({ id, ...updates }) => {
    // Remove undefined values
    const data = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    await db.update(tasksTable).set(data).where(eq(tasksTable.id, id));
  }
).updates(getTasks, getTaskStats);

export const deleteTask = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(tasksTable).where(eq(tasksTable.id, id));
  }
).updates(getTasks, getTaskStats);

export const reorderTask = command(
  v.object({
    id: v.number(),
    newPosition: v.number()
  }),
  async ({ id, newPosition }) => {
    await db.transaction(async (tx) => {
      const [task] = await tx.select().from(tasksTable).where(eq(tasksTable.id, id));
      if (!task) throw new Error('Task not found');

      const oldPosition = task.position;

      if (newPosition > oldPosition) {
        // Moving down: shift items between old+1 and new up by 1
        await tx.execute(sql`
          UPDATE tasks SET position = position - 1
          WHERE position > ${oldPosition} AND position <= ${newPosition}
        `);
      } else {
        // Moving up: shift items between new and old-1 down by 1
        await tx.execute(sql`
          UPDATE tasks SET position = position + 1
          WHERE position >= ${newPosition} AND position < ${oldPosition}
        `);
      }

      await tx.update(tasksTable).set({ position: newPosition }).where(eq(tasksTable.id, id));
    });
  }
).updates(getTasks);

export const bulkComplete = command(
  v.object({ ids: v.array(v.number()) }),
  async ({ ids }) => {
    await db.update(tasksTable)
      .set({ completed: true })
      .where(sql`id = ANY(${ids})`);
  }
).updates(getTasks, getTaskStats);

export const clearCompleted = command(
  v.undefined_(),
  async () => {
    await db.delete(tasksTable).where(eq(tasksTable.completed, true));
  }
).updates(getTasks, getTaskStats);
```

The component that uses this API:

```svelte
<!-- src/routes/tasks/+page.svelte -->
<script lang="ts">
  import {
    getTasks, getTaskStats,
    createTask, updateTask, deleteTask,
    clearCompleted, bulkComplete
  } from '$lib/api/tasks.remote';

  let filter = $state<'all' | 'active' | 'completed'>('all');
  let newTitle = $state('');
  let editingId = $state<number | null>(null);

  const tasks = $derived(getTasks({ status: filter, sort: 'position' }));
  const stats = getTaskStats();

  async function handleAdd() {
    if (!newTitle.trim()) return;
    await createTask({ title: newTitle });
    newTitle = '';
  }

  async function handleToggle(id: number, currentCompleted: boolean) {
    await updateTask({ id, completed: !currentCompleted });
  }

  async function handleDelete(id: number) {
    if (confirm('Delete this task?')) {
      await deleteTask({ id });
    }
  }

  async function handleInlineEdit(id: number, newTitle: string) {
    await updateTask({ id, title: newTitle });
    editingId = null;
  }
</script>

<div class="task-manager">
  <!-- Stats bar -->
  {#await stats then s}
    <div class="stats">
      <span>{s.total} total</span>
      <span>{s.active} active</span>
      <span>{s.completed} completed</span>
    </div>
  {/await}

  <!-- Add form -->
  <form onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
    <input
      bind:value={newTitle}
      placeholder="What needs to be done?"
      aria-label="New task title"
    />
    <button type="submit" disabled={!newTitle.trim()}>Add</button>
  </form>

  <!-- Filter tabs -->
  <div class="filters" role="tablist">
    {#each ['all', 'active', 'completed'] as f}
      <button
        role="tab"
        aria-selected={filter === f}
        onclick={() => filter = f as typeof filter}
      >
        {f.charAt(0).toUpperCase() + f.slice(1)}
      </button>
    {/each}
  </div>

  <!-- Task list -->
  {#await tasks}
    <p>Loading tasks...</p>
  {:then items}
    <ul class="task-list">
      {#each items as task (task.id)}
        <li class:completed={task.completed}>
          <input
            type="checkbox"
            checked={task.completed}
            onchange={() => handleToggle(task.id, task.completed)}
          />
          {#if editingId === task.id}
            <input
              type="text"
              value={task.title}
              onblur={(e) => handleInlineEdit(task.id, e.currentTarget.value)}
              onkeydown={(e) => {
                if (e.key === 'Enter') handleInlineEdit(task.id, e.currentTarget.value);
                if (e.key === 'Escape') editingId = null;
              }}
            />
          {:else}
            <span ondblclick={() => editingId = task.id}>{task.title}</span>
          {/if}
          <button onclick={() => handleDelete(task.id)} aria-label="Delete task">
            &times;
          </button>
        </li>
      {:else}
        <li class="empty">No tasks. Add one above!</li>
      {/each}
    </ul>

    <!-- Bulk actions -->
    {#if items.some(t => t.completed)}
      <button onclick={() => clearCompleted()}>Clear Completed</button>
    {/if}
  {:catch error}
    <p class="error">Error loading tasks: {error.message}</p>
  {/await}
</div>
```

## Decision Guide

With five ways to communicate with the server, choosing the right one matters:

| Function | Purpose | Runs on | Example |
|----------|---------|---------|---------|
| `query` | Read data at runtime | Server (per request) | Product listings, user profiles, search results |
| `form` | User input with progressive enhancement | Server (form submission) | Registration, checkout, contact forms |
| `command` | JavaScript-only mutations | Server (event handler call) | Toggle switches, drag-drop, inline edits, bulk actions |
| `prerender` | Build-time static data | Build machine (once) | Site config, navigation menus, CMS content |
| `+server.ts` | Public APIs, webhooks, third-party integrations | Server (HTTP endpoint) | Stripe webhooks, OAuth callbacks, REST API |

The key distinctions:
- **`query`** is for reading data. It runs on the server, caches results, and re-fetches when invalidated.
- **`form`** is for writing data from HTML forms. It works without JavaScript (progressive enhancement) and handles file uploads natively.
- **`command`** is for writing data from JavaScript. It requires JavaScript, cannot be called during render, and is for imperative interactions.
- **`prerender`** is for data that barely changes. It runs once at build time and serves cached results with zero runtime cost.
- **`+server.ts`** is for endpoints that external systems call. Stripe, GitHub, Slack — anything outside your app that needs a stable URL to send requests to.

Remote functions (`query`, `form`, `command`, `prerender`) are internal to your app — they are not meant to be called by third-party services. Use `+server.ts` when you need a stable public URL that external systems can hit.

## Try It

Build a task management interface with these features:

1. A `getTasks` query that fetches all tasks, with optional `status` filter parameter
2. A `createTask` command for adding new tasks
3. A `toggleComplete` command that marks a task as done or undone, with `.updates(getTasks)` to refresh the list
4. A `deleteTask` command with a confirmation step
5. A `getSiteSettings` prerender function that loads the app name from a CMS at build time
6. Display the prerendered settings in the layout and the task list on the main page with checkboxes wired to the toggle command
7. Add optimistic updates to the toggle so it feels instant
8. Add inline editing with a `updateTask` command that fires on blur

## Key Takeaways

- `command` handles imperative mutations triggered by user interactions outside of forms — toggles, drag-drop, inline edits, bulk actions
- Commands cannot be called during render — only from event handlers — enforcing that mutations are explicit user actions
- Chain `.updates(queryFn)` to automatically refresh cached queries after a command completes — chain multiple for mutations affecting several data sources
- Commands return promises, so use `try/catch` for error handling and implement optimistic updates for responsive UIs
- Commands can return values (like newly created IDs) and throw `redirect()` for navigation after mutation
- `prerender` executes at build time and serves cached results with zero runtime cost — ideal for site config, navigation, and CMS content
- Use `inputs` to prerender multiple argument combinations; use a function to generate inputs dynamically from an API
- Enable `dynamic: true` for runtime fallback when prerendered inputs do not cover all cases — SvelteKit's version of Incremental Static Regeneration
- Choose `query` for reads, `form` for user input, `command` for imperative mutations, `prerender` for static data, and `+server.ts` for external-facing APIs
