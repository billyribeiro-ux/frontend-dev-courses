# Form & Command Functions for Mutations

Reading data is only half the story. TeamBoard needs to create projects, add tasks, delete items, reorder columns, and toggle task statuses. In the previous lesson, `query()` handled the read side. Now `form()` and `command()` handle writes.

`form()` is for mutations triggered by form submissions — creating a project, editing a task title, inviting a team member. It provides schema validation, field helpers, progressive enhancement, and sensitive field handling. `command()` is for imperative mutations triggered by event handlers — toggling a checkbox, drag-and-drop reordering, deleting an item with a button click. Both live in `.remote.ts` files and run on the server.

## Creating a Project with form()

Start with the most common mutation in TeamBoard: creating a new project (board). Define the form function in the projects remote file:

```typescript
// src/lib/api/projects.remote.ts
import { form, query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { boards } from '$lib/server/schema';

export const getProjects = query(
  v.object({ teamId: v.number() }),
  async ({ teamId }) => {
    return await db
      .select()
      .from(boards)
      .where(eq(boards.teamId, teamId))
      .orderBy(boards.createdAt);
  }
);

export const createProject = form(
  v.object({
    name: v.pipe(
      v.string(),
      v.minLength(2, 'Project name must be at least 2 characters'),
      v.maxLength(50, 'Project name must be under 50 characters')
    ),
    description: v.optional(
      v.pipe(v.string(), v.maxLength(200, 'Description must be under 200 characters'))
    ),
    teamId: v.number()
  }),
  async (data) => {
    const [project] = await db
      .insert(boards)
      .values({
        name: data.name,
        description: data.description ?? null,
        teamId: data.teamId,
        createdBy: 1, // replaced with real user ID from session later
        createdAt: new Date()
      })
      .returning();

    return project;
  }
);
```

The Valibot schema defines validation rules with error messages. The handler receives the validated data and inserts it into the database. If validation fails, the form function returns the errors automatically — your handler never runs with bad data.

## Using the Form in a Component

Spread the form function onto the `<form>` element, and use field helpers to wire up inputs:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/new/+page.svelte -->
<script lang="ts">
  import { createProject } from '$lib/api/projects.remote';

  let { data } = $props();
</script>

<svelte:head>
  <title>New Board — {data.team.name}</title>
</svelte:head>

<div class="max-w-lg mx-auto p-8">
  <h1 class="text-2xl font-bold mb-6">Create a New Board</h1>

  <form {...createProject} class="space-y-4">
    <!-- Hidden field for teamId -->
    <input type="hidden" name="teamId" value={data.team.id} />

    <div>
      <label for="name" class="block text-sm font-medium mb-1">Board Name</label>
      <input
        {...createProject.fields.name.as('text')}
        id="name"
        placeholder="e.g. Sprint 42"
        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
      />
      {#each createProject.fields.name.issues() as issue}
        <p class="text-sm text-red-600 mt-1">{issue}</p>
      {/each}
    </div>

    <div>
      <label for="description" class="block text-sm font-medium mb-1">
        Description <span class="text-gray-400">(optional)</span>
      </label>
      <textarea
        {...createProject.fields.description.as('textarea')}
        id="description"
        rows="3"
        placeholder="What is this board for?"
        class="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
      ></textarea>
      {#each createProject.fields.description.issues() as issue}
        <p class="text-sm text-red-600 mt-1">{issue}</p>
      {/each}
    </div>

    <button
      type="submit"
      class="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
    >
      Create Board
    </button>
  </form>
</div>
```

The key parts: `{...createProject}` on the `<form>` sets up `action`, `method`, and `enctype` automatically. `.fields.name.as('text')` returns spread attributes (`name`, `type`, `value`) for the input — after a failed submission, the field repopulates with the user's previous input. `.issues()` returns validation error messages for that specific field.

## Field Helper Reference

Each field provides four methods. Here they are in action:

```svelte
<script lang="ts">
  import { createProject } from '$lib/api/projects.remote';
</script>

<!-- .as(type) — spread attributes for text, email, textarea, select, checkbox, etc. -->
<input {...createProject.fields.name.as('text')} />
<textarea {...createProject.fields.description.as('textarea')}></textarea>

<!-- .value() — read the current field value -->
<p>You typed: {createProject.fields.name.value()}</p>

<!-- .set(value) — programmatically update the field -->
<button type="button" onclick={() => createProject.fields.name.set('Untitled Board')}>
  Reset Name
</button>

<!-- .issues() — validation error messages -->
{#each createProject.fields.name.issues() as message}
  <p class="error">{message}</p>
{/each}
```

## Adding enhance for Toast Notifications

The `.enhance` method customizes what happens during and after submission. TeamBoard shows a toast notification on success and redirects to the new board:

```svelte
<script lang="ts">
  import { createProject } from '$lib/api/projects.remote';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/components/ui/toast';

  let { data } = $props();
</script>

<form
  {...createProject}
  use:createProject.enhance={() => {
    toast.info('Creating board...');

    return async ({ result }) => {
      if (result.type === 'success') {
        toast.success('Board created!');
        goto(`/${data.team.slug}/boards/${result.data.id}`);
      } else if (result.type === 'failure') {
        toast.error('Please fix the errors below.');
      } else {
        toast.error('Something went wrong. Please try again.');
      }
    };
  }}
  class="space-y-4"
>
  <!-- fields -->
</form>
```

The outer function runs when the form submits — a good place for "saving..." indicators. The returned async function runs when the server responds. `result.type` is `'success'`, `'failure'` (validation error), or `'error'` (unexpected server error).

## Client-Side Preflight Validation

By default, validation runs on the server after form submission. The user fills out the form, clicks submit, waits for the server round-trip, and then sees errors. Preflight validation adds instant client-side checks:

```svelte
<script lang="ts">
  import { createProject } from '$lib/api/projects.remote';
  import * as v from 'valibot';

  const projectForm = createProject.preflight(
    v.object({
      name: v.pipe(v.string(), v.minLength(2, 'Project name must be at least 2 characters')),
      description: v.optional(v.pipe(v.string(), v.maxLength(200, 'Too long'))),
      teamId: v.number()
    })
  );
</script>

<form {...projectForm} class="space-y-4">
  <div>
    <label for="name" class="block text-sm font-medium mb-1">Board Name</label>
    <input
      {...projectForm.fields.name.as('text')}
      id="name"
      class="w-full px-3 py-2 border rounded-lg"
    />
    <!-- Errors appear instantly as the user types — no server round-trip -->
    {#each projectForm.fields.name.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded-lg">
    Create Board
  </button>
</form>
```

Preflight runs in the browser. Errors appear instantly without a server round-trip. When preflight passes, the form still submits to the server for validation — defense in depth.

## Deleting a Project with command()

Deleting a project is not a form submission — it is a button click. Use `command()` for this:

```typescript
// src/lib/api/projects.remote.ts (continued)
import { command } from '$app/server';

export const deleteProject = command(
  v.object({
    projectId: v.number()
  }),
  async ({ projectId }) => {
    await db.delete(boards).where(eq(boards.id, projectId));
  }
).updates(getProjects);
```

The `.updates(getProjects)` chain tells SvelteKit to automatically re-fetch the `getProjects` query after the deletion completes. Any component currently displaying project data will update without a manual refresh call.

Use it from a component:

```svelte
<script lang="ts">
  import { deleteProject } from '$lib/api/projects.remote';
  import { getProjects } from '$lib/api/projects.remote';

  let { data } = $props();

  const projects = getProjects({ teamId: data.team.id });
</script>

{#await projects then boards}
  {#each boards as board}
    <div class="flex items-center justify-between p-4 border rounded-lg">
      <div>
        <h3 class="font-semibold">{board.name}</h3>
        <p class="text-sm text-gray-500">{board.description}</p>
      </div>
      <button
        onclick={() => deleteProject({ projectId: board.id })}
        class="text-red-600 hover:text-red-800 text-sm"
      >
        Delete
      </button>
    </div>
  {/each}
{/await}
```

Click "Delete", the command fires, the server deletes the row, and `getProjects` re-fetches automatically. The board disappears from the list.

## Task Mutations: The Complete Flow

TeamBoard's core interactions are task-based. Here is the full set of task mutations — defined in a `.remote.ts` file, imported in components, used in templates:

```typescript
// src/lib/api/tasks.remote.ts
import { form, command, query } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';
import { tasks } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const getTasksByBoard = query(
  v.object({ boardId: v.number() }),
  async ({ boardId }) => {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.boardId, boardId))
      .orderBy(tasks.position);
  }
);

export const createTask = form(
  v.object({
    title: v.pipe(v.string(), v.minLength(1, 'Title is required')),
    description: v.optional(v.string()),
    columnId: v.number(),
    boardId: v.number(),
    priority: v.picklist(['low', 'medium', 'high', 'urgent'])
  }),
  async (data) => {
    const maxPosition = await db
      .select({ max: count() })
      .from(tasks)
      .where(eq(tasks.columnId, data.columnId));

    const [task] = await db
      .insert(tasks)
      .values({
        title: data.title,
        description: data.description ?? null,
        columnId: data.columnId,
        boardId: data.boardId,
        priority: data.priority,
        position: (maxPosition[0]?.max ?? 0) + 1,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    return task;
  }
);

export const toggleTaskStatus = command(
  v.object({
    taskId: v.number(),
    columnId: v.number()
  }),
  async ({ taskId, columnId }) => {
    await db
      .update(tasks)
      .set({ columnId, updatedAt: new Date() })
      .where(eq(tasks.id, taskId));
  }
).updates(getTasksByBoard);

export const reorderTasks = command(
  v.object({
    taskIds: v.array(v.number())
  }),
  async ({ taskIds }) => {
    for (let i = 0; i < taskIds.length; i++) {
      await db
        .update(tasks)
        .set({ position: i, updatedAt: new Date() })
        .where(eq(tasks.id, taskIds[i]));
    }
  }
).updates(getTasksByBoard);
```

The pattern is consistent: define in `.remote.ts`, validate with Valibot, execute on the server, chain `.updates()` to keep queries fresh.

## Using Task Mutations in a Kanban Column

```svelte
<!-- src/lib/components/board/KanbanColumn.svelte -->
<script lang="ts">
  import { createTask, toggleTaskStatus } from '$lib/api/tasks.remote';
  import { toast } from '$lib/components/ui/toast';

  let { column, tasks, boardId } = $props();
</script>

<div class="w-80 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
  <h3 class="font-semibold mb-4 flex items-center gap-2">
    <span class="w-3 h-3 rounded-full" style:background-color={column.color}></span>
    {column.name}
    <span class="text-xs text-gray-400">({tasks.length})</span>
  </h3>

  <!-- Task cards -->
  {#each tasks as task}
    <div class="bg-white dark:bg-gray-800 p-3 rounded-lg border mb-2 shadow-sm">
      <p class="text-sm font-medium">{task.title}</p>
      {#if task.description}
        <p class="text-xs text-gray-500 mt-1">{task.description}</p>
      {/if}
    </div>
  {/each}

  <!-- Quick add form -->
  <form
    {...createTask}
    use:createTask.enhance={() => {
      return async ({ result }) => {
        if (result.type === 'success') {
          toast.success('Task added');
        }
      };
    }}
    class="mt-2"
  >
    <input type="hidden" name="columnId" value={column.id} />
    <input type="hidden" name="boardId" value={boardId} />
    <input type="hidden" name="priority" value="medium" />

    <input
      {...createTask.fields.title.as('text')}
      placeholder="Add a task..."
      class="w-full px-3 py-2 text-sm border rounded-lg"
    />
    {#each createTask.fields.title.issues() as issue}
      <p class="text-xs text-red-600 mt-1">{issue}</p>
    {/each}
  </form>
</div>
```

The component encapsulates its own mutation logic. The quick-add form uses hidden fields for `columnId`, `boardId`, and a default `priority`. Type a task title, press Enter, and the task is created on the server.

## Sensitive Fields with _ Prefix

TeamBoard's invite flow includes a sensitive token. Fields prefixed with underscore are not repopulated after a failed submission:

```typescript
// src/lib/api/teams.remote.ts (continued)
export const inviteMember = form(
  v.object({
    email: v.pipe(v.string(), v.email('Please enter a valid email')),
    role: v.picklist(['admin', 'member', 'viewer']),
    _inviteToken: v.pipe(v.string(), v.minLength(1, 'Token is required')),
    teamId: v.number()
  }),
  async (data) => {
    // Verify the invite token is valid
    const valid = await verifyInviteToken(data._inviteToken, data.teamId);
    if (!valid) {
      throw new Error('Invalid or expired invite token');
    }

    await sendInviteEmail(data.email, data.role, data.teamId);
  }
);
```

```svelte
<form {...inviteMember} class="space-y-4">
  <input type="hidden" name="_inviteToken" value={token} />
  <input type="hidden" name="teamId" value={team.id} />

  <div>
    <label for="email" class="block text-sm font-medium mb-1">Email</label>
    <input {...inviteMember.fields.email.as('email')} id="email" class="w-full px-3 py-2 border rounded-lg" />
    {#each inviteMember.fields.email.issues() as issue}
      <p class="text-sm text-red-600 mt-1">{issue}</p>
    {/each}
  </div>

  <div>
    <label for="role" class="block text-sm font-medium mb-1">Role</label>
    <select {...inviteMember.fields.role.as('select')} id="role" class="w-full px-3 py-2 border rounded-lg">
      <option value="member">Member</option>
      <option value="admin">Admin</option>
      <option value="viewer">Viewer</option>
    </select>
  </div>

  <button type="submit" class="w-full py-2 bg-indigo-600 text-white rounded-lg">
    Send Invite
  </button>
</form>
```

If email validation fails, the `email` field repopulates with the user's input, but `_inviteToken` is cleared. Use the `_` prefix for passwords, tokens, API keys, and any value that should not round-trip through the client.

## The Complete Flow: Define, Import, Use

Every mutation in TeamBoard follows the same three-step pattern:

**Step 1 — Define in `.remote.ts`:**

```typescript
// src/lib/api/tasks.remote.ts
export const createTask = form(schema, handler);
export const toggleTaskStatus = command(schema, handler).updates(getTasksByBoard);
```

**Step 2 — Import in component:**

```svelte
<script lang="ts">
  import { createTask, toggleTaskStatus } from '$lib/api/tasks.remote';
</script>
```

**Step 3 — Use in template:**

```svelte
<!-- form() spreads onto <form> elements -->
<form {...createTask}>
  <input {...createTask.fields.title.as('text')} />
  <button type="submit">Add</button>
</form>

<!-- command() calls from event handlers -->
<button onclick={() => toggleTaskStatus({ taskId: 1, columnId: 2 })}>
  Move to Done
</button>
```

`form()` uses spread syntax on elements. `command()` uses direct function calls in event handlers. Both validate on the server with Valibot. Both can chain `.updates()` to keep query data fresh.

## form() vs command() Decision Guide

| Need | Use |
|------|-----|
| User fills out fields and submits | `form()` |
| Works without JavaScript (progressive enhancement) | `form()` |
| Need field helpers (`.as()`, `.value()`, `.issues()`) | `form()` |
| Button click, toggle, drag-and-drop | `command()` |
| No visible form element | `command()` |
| Need to pass computed data from JavaScript | `command()` |

If the user is typing into inputs and clicking "Submit", use `form()`. If the user is clicking a button or performing a gesture, use `command()`. When in doubt, ask: "Is there a `<form>` element?" If yes, `form()`. If no, `command()`.

## Try It

Build the complete mutation layer for TeamBoard tasks:

1. Create a `createTask` form function in `src/lib/api/tasks.remote.ts` with Valibot validation for `title` (required, min 1 char), `description` (optional), `columnId`, `boardId`, and `priority` (picklist)
2. Create a `toggleTaskStatus` command that moves a task to a different column, chained with `.updates(getTasksByBoard)`
3. Create a `reorderTasks` command that accepts an array of task IDs and updates their positions
4. Build a component that uses `createTask` with a quick-add form (spread syntax, field helpers, `.issues()` for errors)
5. Add `.enhance` to show a toast on success and `.preflight` for instant validation
6. Wire up `toggleTaskStatus` to a status dropdown in a task card component

## Key Takeaways

- `form()` provides declarative form handling with schema validation, field helpers, and progressive enhancement
- Spread `{...formFunction}` on `<form>` to wire up action, method, and encoding automatically
- Field helpers `.as()`, `.value()`, `.set()`, and `.issues()` simplify building form UIs and displaying validation errors
- `.enhance` customizes submission behavior for toasts, redirects, and optimistic UI
- `.preflight` adds instant client-side validation before the server round-trip — defense in depth
- Fields prefixed with `_` (like `_inviteToken`) are sensitive and will not be repopulated on validation failure
- `command()` handles imperative mutations from event handlers — toggles, drag-and-drop, button clicks
- Chain `.updates(queryFn)` on a command to automatically re-fetch stale queries after a mutation
- The complete flow is always: define in `.remote.ts`, import in component, use in template
- Use `form()` when there is a `<form>` element; use `command()` for everything else
