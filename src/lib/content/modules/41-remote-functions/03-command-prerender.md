# Command & Prerender

Not every server interaction fits into a form. Drag-and-drop reordering, inline editing, toggle switches, and "add to favorites" buttons are all mutations that happen outside of a `<form>` element. The `command` function handles these imperative mutations. On the other end of the spectrum, some data barely changes — site configuration, navigation menus, or content from a CMS. The `prerender` function fetches that data at build time so it is available instantly without any server call.

Together with `query` and `form`, these two functions complete the remote functions toolkit.

## Command — Imperative Mutations

`command` defines a server function that you call explicitly from event handlers. It takes a validation schema and an async handler, just like `form` and `query`:

```typescript
// src/lib/api/todos.remote.ts
import { command } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';

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
    for (let i = 0; i < ids.length; i++) {
      await db
        .update(todosTable)
        .set({ position: i })
        .where(eq(todosTable.id, ids[i]));
    }
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
  {#each items as todo}
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

Commands cannot be called during render — only from user interactions or effects. This is intentional: mutations should be triggered by explicit user actions.

## Invalidating Queries After a Command

After a mutation, your cached query data is stale. Use `.updates` to tell SvelteKit which queries to refresh:

```typescript
// src/lib/api/todos.remote.ts
import { command, query } from '$app/server';
import * as v from 'valibot';

export const getTodos = query(async () => {
  return await db.select().from(todosTable).orderBy(todosTable.position);
});

export const deleteTodo = command(
  v.object({ id: v.number() }),
  async ({ id }) => {
    await db.delete(todosTable).where(eq(todosTable.id, id));
  }
).updates(getTodos);
```

When `deleteTodo` completes, SvelteKit automatically re-fetches `getTodos`. The UI updates without a manual refresh call. You can chain `.updates` with multiple query functions if a single mutation affects several data sources.

## Prerender — Build-Time Data

`prerender` executes a function at build time and caches the result. The data is served statically — no server round-trip at runtime:

```typescript
// src/lib/api/config.remote.ts
import { prerender } from '$app/server';

export const getSiteConfig = prerender(async () => {
  const res = await fetch('https://cms.example.com/api/config');
  return res.json();
});

export const getNavigation = prerender(async () => {
  const res = await fetch('https://cms.example.com/api/navigation');
  return res.json();
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
  <header>{site.title}</header>
{/await}
```

The CMS is queried once during `vite build`. Every visitor receives the cached result instantly.

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
    return res.json();
  },
  {
    inputs: [
      { slug: 'about' },
      { slug: 'contact' },
      { slug: 'privacy' }
    ]
  }
);
```

At build time, SvelteKit calls `getPage` three times — once for each input — and caches all three results.

## Dynamic Fallback

What if a new page is added to the CMS after the build? Enable `dynamic: true` to fall back to a runtime server call for values not in the prerendered set:

```typescript
export const getPage = prerender(
  v.object({ slug: v.string() }),
  async ({ slug }) => {
    const res = await fetch(`https://cms.example.com/api/pages/${slug}`);
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

Requests for `/about` and `/contact` are served from the build cache. A request for `/faq` triggers a live server call. The result is then cached via the Cache API and cleared automatically on new deployments.

## Decision Guide

With five ways to communicate with the server, choosing the right one matters:

| Function | Purpose | Example |
|----------|---------|---------|
| `query` | Read data at runtime | Product listings, user profiles, search results |
| `form` | User input with progressive enhancement | Registration, checkout, contact forms |
| `command` | JavaScript-only mutations | Toggle switches, drag-drop, inline edits |
| `prerender` | Build-time static data | Site config, navigation menus, CMS content |
| `+server.ts` | Public APIs, webhooks, third-party integrations | Stripe webhooks, OAuth callbacks, REST API |

The key distinctions: `query` is for reading, `form` and `command` are for writing (forms vs imperative), `prerender` is for data that rarely changes, and `+server.ts` is for endpoints that external systems call. Remote functions (`query`, `form`, `command`, `prerender`) are internal to your app — they are not meant to be called by third-party services. Use `+server.ts` when you need a stable public URL that external systems can hit.

## Try It

Build a task management interface with these features: a `getTasks` query that fetches all tasks, a `toggleComplete` command that marks a task as done or undone (with `.updates(getTasks)` to refresh the list), and a `getSiteSettings` prerender function that loads the app name from a CMS at build time. Display the settings in the layout and the task list on the main page with checkboxes wired to the toggle command.

## Key Takeaways

- `command` handles imperative mutations triggered by user interactions outside of forms
- Chain `.updates(queryFn)` to automatically refresh cached queries after a command completes
- Commands cannot be called during render — only from event handlers or effects
- `prerender` executes at build time and serves cached results with zero runtime cost
- Use `inputs` to prerender multiple argument combinations and `dynamic: true` for runtime fallback
- Prerendered data is cached via the Cache API and cleared on each new deployment
- Choose `query` for reads, `form` for user input, `command` for imperative mutations, `prerender` for static data, and `+server.ts` for external-facing APIs
