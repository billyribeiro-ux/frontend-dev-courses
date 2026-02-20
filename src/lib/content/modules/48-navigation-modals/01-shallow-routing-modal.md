# Task Detail Modal with Shallow Routing

When a user clicks a task card on the TeamBoard Kanban board, you want to open a detail modal immediately — no loading spinner, no network request, no page transition. The task data is already sitting in memory because you just rendered it on the board. But you also want the URL to change to `/board/[boardId]/task/[taskId]` so the user can share the link, bookmark it, or hit the back button to close the modal.

This is the exact problem shallow routing solves. `pushState` updates the URL and attaches data to the history entry without running any load functions. The page component stays mounted, the board stays visible behind the modal, and the task data flows through `page.state` instead of a load function.

But there is a second scenario: someone receives that shared link and navigates directly to `/board/[boardId]/task/[taskId]`. They do not have the board loaded in memory. For them, a real load function must run, fetch the task from the database, and render a full-page task detail view. You need both paths — the instant modal for users already on the board, and the full-page fallback for direct navigation.

## Opening the Modal with pushState

When the user clicks a task card, call `pushState` with the task URL and the task data as state:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import TaskModal from '$components/board/TaskModal.svelte';
  import TaskCard from '$components/board/TaskCard.svelte';
  import type { Task } from '$lib/types';

  let { data } = $props();

  function openTask(task: Task) {
    pushState(`/board/${data.board.id}/task/${task.id}`, {
      task
    });
  }

  function closeTask() {
    history.back();
  }
</script>

<svelte:head>
  <title>{data.board.name} | TeamBoard</title>
</svelte:head>

<div class="board">
  {#each data.columns as column}
    <div class="column">
      <h3>{column.name}</h3>
      {#each column.tasks as task}
        <TaskCard {task} onclick={() => openTask(task)} />
      {/each}
    </div>
  {/each}
</div>

{#if $page.state.task}
  <TaskModal task={$page.state.task} onclose={closeTask} />
{/if}
```

Notice what happens here. When `openTask` runs, the URL changes to `/board/3/task/42` (for example), but SvelteKit does not navigate. No load function fires. The `+page.svelte` component stays mounted with its existing `data` prop. The only thing that changes is `$page.state`, which now contains the `task` object you passed as the second argument to `pushState`.

The modal reads from `$page.state.task`. When the user clicks the backdrop or presses the back button, `history.back()` pops the state and the URL returns to `/board/3`. Since `$page.state.task` becomes `undefined`, the `{#if}` block removes the modal.

## Typing page.state

SvelteKit uses the `App.PageState` interface to type `$page.state`. You declared this in Module 44 when setting up `app.d.ts`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface PageState {
      task?: import('$lib/types').Task;
      activeTab?: 'description' | 'comments' | 'activity';
    }
  }
}

export {};
```

With this declaration, `$page.state.task` is typed as `Task | undefined` and `$page.state.activeTab` is typed as a string union. TypeScript will catch typos and wrong types at compile time.

## The Full-Page Fallback

If someone navigates directly to `/board/[boardId]/task/[taskId]` — by pasting a shared link, opening a bookmark, or refreshing the page while the modal is open — there is no `page.state` data. The task needs to come from the server.

Create a nested route for this:

```
src/routes/(app)/[teamSlug]/boards/[boardId]/
├── +page.svelte              ← the board (shown above)
├── +page.server.ts           ← loads columns and tasks
└── task/
    └── [taskId]/
        ├── +page.svelte      ← full-page task detail
        └── +page.server.ts   ← loads a single task
```

The task route's load function fetches the task from the database:

```typescript
// src/routes/(app)/[teamSlug]/boards/[boardId]/task/[taskId]/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$server/database';
import { tasks, comments, users, activityLog } from '$server/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ params, locals, depends }) => {
  if (!locals.user) error(401, 'Not authenticated');

  depends('app:tasks');

  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, Number(params.taskId)),
    with: {
      assignee: true,
      column: true
    }
  });

  if (!task) error(404, 'Task not found');

  const taskComments = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      userName: users.name,
      userAvatar: users.avatarUrl
    })
    .from(comments)
    .innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.taskId, task.id))
    .orderBy(desc(comments.createdAt));

  const activity = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.entityId, task.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(20);

  return { task, comments: taskComments, activity };
};
```

The full-page task detail renders the same information but as a standalone page, not a modal overlay:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/task/[taskId]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.task.title} | TeamBoard</title>
</svelte:head>

<div class="task-detail-page">
  <a href="/board/{data.task.boardId}" class="back-link">
    Back to Board
  </a>

  <h1>{data.task.title}</h1>
  <p class="description">{data.task.description ?? 'No description'}</p>

  <section class="comments">
    <h2>Comments ({data.comments.length})</h2>
    {#each data.comments as comment}
      <div class="comment">
        <img src={comment.userAvatar} alt={comment.userName} />
        <div>
          <strong>{comment.userName}</strong>
          <p>{comment.body}</p>
        </div>
      </div>
    {:else}
      <p class="empty">No comments yet.</p>
    {/each}
  </section>

  <section class="activity">
    <h2>Activity</h2>
    {#each data.activity as entry}
      <p class="activity-entry">{entry.action} - {entry.createdAt}</p>
    {/each}
  </section>
</div>
```

Now both paths work. Board users get the instant modal. Link visitors get the full page. Same URL, two presentation modes.

## Tab Switching with replaceState

Inside the task modal, you might have tabs: Description, Comments, Activity. Switching between tabs should not add history entries — pressing back should close the modal, not cycle through tabs. Use `replaceState` to update the URL without pushing a new history entry:

```svelte
<!-- src/lib/components/board/TaskModal.svelte -->
<script lang="ts">
  import { replaceState, beforeNavigate, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { Task } from '$lib/types';

  let { task, onclose }: { task: Task; onclose: () => void } = $props();

  let activeTab = $derived($page.state.activeTab ?? 'description');

  function switchTab(tab: 'description' | 'comments' | 'activity') {
    // Replace the current history entry — no new entry added
    replaceState(`/board/${task.boardId}/task/${task.id}`, {
      task,
      activeTab: tab
    });
  }

  let isEditing = $state(false);
  let editTitle = $state(task.title);
  let editDescription = $state(task.description ?? '');
  let hasUnsavedChanges = $derived(
    editTitle !== task.title || editDescription !== (task.description ?? '')
  );

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true">
  <div class="modal-content">
    <header class="modal-header">
      {#if isEditing}
        <input bind:value={editTitle} class="edit-title" />
      {:else}
        <h2>{task.title}</h2>
      {/if}
      <button onclick={onclose} aria-label="Close modal">X</button>
    </header>

    <nav class="tabs">
      <button
        class:active={activeTab === 'description'}
        onclick={() => switchTab('description')}
      >
        Description
      </button>
      <button
        class:active={activeTab === 'comments'}
        onclick={() => switchTab('comments')}
      >
        Comments
      </button>
      <button
        class:active={activeTab === 'activity'}
        onclick={() => switchTab('activity')}
      >
        Activity
      </button>
    </nav>

    <div class="tab-content">
      {#if activeTab === 'description'}
        {#if isEditing}
          <textarea bind:value={editDescription} rows="8"></textarea>
          <div class="edit-actions">
            <button onclick={() => isEditing = false}>Cancel</button>
            <button onclick={saveTask}>Save</button>
          </div>
        {:else}
          <p>{task.description ?? 'No description yet.'}</p>
          <button onclick={() => isEditing = true}>Edit</button>
        {/if}

      {:else if activeTab === 'comments'}
        <p>Comments will load here...</p>

      {:else if activeTab === 'activity'}
        <p>Activity log will load here...</p>
      {/if}
    </div>
  </div>
</div>
```

When the user clicks "Comments", `replaceState` overwrites the current history entry. The URL stays at `/board/3/task/42`, but `$page.state.activeTab` changes to `'comments'`. When the user presses the back button, the entire modal state is popped and the board URL is restored. No tab history to wade through.

## Protecting Unsaved Edits with beforeNavigate

If the user starts editing a task's title or description and then navigates away — by pressing back, clicking a board link, or closing the modal — you should warn them. Use `beforeNavigate` to intercept the navigation:

```svelte
<!-- Add this inside TaskModal.svelte's <script> block -->
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  beforeNavigate((navigation) => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes to this task. Discard them?')) {
        navigation.cancel();
      }
    }
  });
</script>
```

The `navigation` object tells you everything about what is happening:
- `navigation.from` — the current page URL
- `navigation.to` — where the user is trying to go
- `navigation.type` — `'link'`, `'goto'`, `'popstate'` (back/forward), or `'leave'`
- `navigation.willUnload` — `true` if navigating to an external site

When `willUnload` is `true`, you cannot redirect — you can only cancel. For internal navigations, you could also call `navigation.cancel()` and then use `goto` to redirect somewhere else.

## Analytics Tracking with afterNavigate

Every time a task modal opens (or the full-page detail loads), you want to track the view. `afterNavigate` fires after the navigation completes and the DOM is updated:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    const taskMatch = navigation.to?.url.pathname.match(/\/task\/(\d+)/);

    if (taskMatch) {
      analytics.track('task_viewed', {
        taskId: taskMatch[1],
        source: navigation.from ? 'board_click' : 'direct_link',
        path: navigation.to?.url.pathname
      });
    }
  });
</script>
```

`afterNavigate` also fires after shallow routing with `pushState`, so both the modal path and the direct navigation path get tracked. The `navigation.from` value helps you distinguish between users clicking from the board (where `from` is the board URL) and direct link visitors (where `from` may be `null` on initial page load).

## Preserving Form State with Snapshots

Here is a frustrating scenario: a user starts editing a task description in the modal, clicks a link to check something on another page, realizes they want to go back, and hits the browser back button. Without snapshots, the form state is gone — the edit they were working on vanishes.

SvelteKit's `snapshot` feature captures component state before navigation and restores it when the user returns via back/forward buttons:

```svelte
<!-- src/lib/components/board/TaskEditForm.svelte -->
<script lang="ts">
  import type { Snapshot } from '@sveltejs/kit';
  import type { Task } from '$lib/types';

  let { task }: { task: Task } = $props();

  let title = $state(task.title);
  let description = $state(task.description ?? '');
  let priority = $state(task.priority);

  // Export snapshot to preserve form state across navigations
  export const snapshot: Snapshot<{
    title: string;
    description: string;
    priority: string;
  }> = {
    capture: () => ({
      title,
      description,
      priority
    }),
    restore: (value) => {
      title = value.title;
      description = value.description;
      priority = value.priority;
    }
  };
</script>

<form method="POST" action="?/updateTask">
  <label>
    Title
    <input name="title" bind:value={title} />
  </label>

  <label>
    Description
    <textarea name="description" bind:value={description} rows="6"></textarea>
  </label>

  <label>
    Priority
    <select name="priority" bind:value={priority}>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="urgent">Urgent</option>
    </select>
  </label>

  <button type="submit">Save Changes</button>
</form>
```

The `capture` function runs before navigation. SvelteKit serializes the returned value and stores it in the browser's session history. The `restore` function runs when the user navigates back, receiving the previously captured value.

Important constraints: the snapshot data must be serializable with `devalue` (the same serializer SvelteKit uses for load data). That means plain objects, arrays, strings, numbers, dates, maps, sets, and a few other built-in types. No class instances, no functions, no DOM elements.

The `snapshot` export must live in a `+page.svelte` or `+layout.svelte` file — it does not work in arbitrary components. If your form is in a child component, lift the snapshot to the page level:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/task/[taskId]/+page.svelte -->
<script lang="ts">
  import type { Snapshot } from '@sveltejs/kit';
  import TaskEditForm from '$components/board/TaskEditForm.svelte';

  let { data } = $props();

  let formState = $state({
    title: data.task.title,
    description: data.task.description ?? '',
    priority: data.task.priority
  });

  export const snapshot: Snapshot<typeof formState> = {
    capture: () => formState,
    restore: (value) => { formState = value; }
  };
</script>

<TaskEditForm task={data.task} bind:formState />
```

## Putting It All Together

Here is the complete board page with every technique wired up — shallow routing, modal rendering, unsaved changes protection, analytics tracking, and snapshot support:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import { pushState, beforeNavigate, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';
  import type { Snapshot } from '@sveltejs/kit';
  import TaskModal from '$components/board/TaskModal.svelte';
  import TaskCard from '$components/board/TaskCard.svelte';
  import type { Task } from '$lib/types';

  let { data } = $props();

  // --- Shallow Routing ---
  function openTask(task: Task) {
    pushState(`/board/${data.board.id}/task/${task.id}`, { task });
  }

  function closeTask() {
    history.back();
  }

  // --- Unsaved Changes Guard ---
  let modalHasUnsavedChanges = $state(false);

  beforeNavigate((navigation) => {
    if (modalHasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) {
        navigation.cancel();
      }
    }
  });

  // --- Analytics ---
  afterNavigate((navigation) => {
    const dest = navigation.to?.url.pathname;
    if (dest) {
      analytics.track('page_view', { path: dest });
    }
  });

  // --- Snapshot for any board-level state ---
  let searchFilter = $state('');

  export const snapshot: Snapshot<{ searchFilter: string }> = {
    capture: () => ({ searchFilter }),
    restore: (value) => { searchFilter = value.searchFilter; }
  };
</script>

<svelte:head>
  <title>{data.board.name} | TeamBoard</title>
</svelte:head>

<div class="board-toolbar">
  <h1>{data.board.name}</h1>
  <input
    type="search"
    placeholder="Filter tasks..."
    bind:value={searchFilter}
  />
</div>

<div class="board-columns">
  {#each data.columns as column}
    <div class="column">
      <h3 class="column-header" style:border-color={column.color}>
        {column.name}
        <span class="count">{column.tasks.length}</span>
      </h3>

      <div class="card-list">
        {#each column.tasks as task}
          <TaskCard
            {task}
            onclick={() => openTask(task)}
            highlighted={searchFilter
              ? task.title.toLowerCase().includes(searchFilter.toLowerCase())
              : false}
          />
        {:else}
          <p class="empty-column">No tasks</p>
        {/each}
      </div>
    </div>
  {/each}
</div>

<!-- Modal overlay — only renders when page.state.task exists -->
{#if $page.state.task}
  <TaskModal
    task={$page.state.task}
    onclose={closeTask}
    bind:hasUnsavedChanges={modalHasUnsavedChanges}
  />
{/if}
```

The flow works like this:

1. User clicks a task card. `openTask` calls `pushState` — the URL changes, `$page.state.task` is set, and the modal appears.
2. User switches tabs inside the modal. `replaceState` updates `activeTab` without adding history entries.
3. User edits the task description. `hasUnsavedChanges` becomes true. If they try to navigate away, `beforeNavigate` shows a confirmation dialog.
4. User presses the back button. `history.back()` pops the state, `$page.state.task` becomes undefined, and the modal disappears.
5. User navigates away and comes back with the back button. The `snapshot` restores the search filter value.
6. Someone pastes the `/board/3/task/42` link in their browser. SvelteKit runs the load function in `task/[taskId]/+page.server.ts` and renders the full-page task detail — no modal, no board behind it.

## Try It

Build a board page with at least two columns and a few task cards. Implement the following:

1. Clicking a task card opens a modal using `pushState` with the task data as state.
2. The modal reads from `$page.state.task` and displays the task title and description.
3. Add three tab buttons (Description, Comments, Activity) that use `replaceState` to switch tabs without adding history entries.
4. Add a `beforeNavigate` guard that warns about unsaved changes when the user edits the description.
5. Create the full-page fallback route at `task/[taskId]/+page.svelte` with a server load function.
6. Verify that the back button closes the modal (not just switches tabs), and that direct URL navigation loads the full page.

## Key Takeaways

- `pushState(url, state)` changes the URL and sets `$page.state` without running load functions — perfect for modals that overlay existing content
- `replaceState(url, state)` overwrites the current history entry — use it for tab switches, filters, and other state changes that should not create new history entries
- Type `$page.state` through the `App.PageState` interface in `app.d.ts` for compile-time safety
- Always build a full-page fallback for shallow-routed URLs so shared links and direct navigation work correctly
- `beforeNavigate` can cancel navigation — use it to warn about unsaved form data before the modal closes
- `afterNavigate` fires after both full navigations and shallow state changes — ideal for analytics tracking
- `export const snapshot` on `+page.svelte` preserves form state across back/forward browser navigation — the data must be serializable
- The modal pattern (shallow route for in-app users, full page for direct links) gives you the best of both worlds: instant interaction and shareable URLs
