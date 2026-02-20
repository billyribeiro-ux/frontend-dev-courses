# Accessibility & Performance Polish

TeamBoard works. Tasks drag between columns, real-time updates stream in, notifications pop up, and the dashboard shows velocity trends. But "works" is not the same as "works for everyone." A keyboard-only user cannot drag a task. A screen reader user cannot tell which column a task landed in. A user on a slow connection waits for data they could have had instantly. This lesson is about closing those gaps — making TeamBoard fast, accessible, and production-worthy before it ships.

## Keyboard Navigation for the Kanban Board

Drag-and-drop with a mouse is intuitive. But many users navigate entirely with the keyboard — users with motor disabilities, power users who prefer keyboard shortcuts, and anyone whose trackpad just died on a deadline. The board needs full keyboard navigation: arrow keys to move focus between columns and tasks, Enter to open task detail, Escape to close modals, and a keyboard shortcut to move tasks between columns.

The approach: track a `focusedColumn` and `focusedTask` index in the board state, and handle key events on `<svelte:window>`:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import { tick } from 'svelte';
  import { board } from '$lib/state/board.svelte';

  let focusedColumnIndex = $state(0);
  let focusedTaskIndex = $state(0);
  let keyboardMode = $state(false);

  function handleKeydown(event: KeyboardEvent) {
    // Only activate keyboard mode when arrow keys are pressed
    // This prevents interfering with typing in input fields
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    const columns = board.columns;
    if (!columns.length) return;

    switch (event.key) {
      case 'ArrowRight': {
        event.preventDefault();
        keyboardMode = true;
        focusedColumnIndex = Math.min(focusedColumnIndex + 1, columns.length - 1);
        focusedTaskIndex = 0;
        focusColumnTask();
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        keyboardMode = true;
        focusedColumnIndex = Math.max(focusedColumnIndex - 1, 0);
        focusedTaskIndex = 0;
        focusColumnTask();
        break;
      }
      case 'ArrowDown': {
        event.preventDefault();
        keyboardMode = true;
        const tasks = columns[focusedColumnIndex]?.tasks ?? [];
        focusedTaskIndex = Math.min(focusedTaskIndex + 1, tasks.length - 1);
        focusColumnTask();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        keyboardMode = true;
        focusedTaskIndex = Math.max(focusedTaskIndex - 1, 0);
        focusColumnTask();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const task = columns[focusedColumnIndex]?.tasks[focusedTaskIndex];
        if (task) {
          board.setActiveTask(task);
        }
        break;
      }
      case 'Escape': {
        event.preventDefault();
        if (board.activeTask) {
          board.setActiveTask(null);
          // Return focus to the task card that opened the modal
          focusColumnTask();
        }
        break;
      }
      case 'm':
      case 'M': {
        // Move task to next column with 'm' key
        if (!event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          moveTaskToNextColumn();
        }
        break;
      }
    }
  }

  async function focusColumnTask() {
    await tick();
    const taskEl = document.querySelector(
      `[data-column-index="${focusedColumnIndex}"] [data-task-index="${focusedTaskIndex}"]`
    ) as HTMLElement | null;
    taskEl?.focus();
  }

  function moveTaskToNextColumn() {
    const columns = board.columns;
    const currentColumn = columns[focusedColumnIndex];
    const nextColumnIndex = focusedColumnIndex + 1;
    if (!currentColumn || nextColumnIndex >= columns.length) return;

    const task = currentColumn.tasks[focusedTaskIndex];
    if (!task) return;

    const nextColumn = columns[nextColumnIndex];
    board.moveTask(task.id, currentColumn.id, nextColumn.id, nextColumn.tasks.length);

    // Announce the move to screen readers
    announceToScreenReader(
      `Moved "${task.title}" from ${currentColumn.name} to ${nextColumn.name}`
    );
  }

  function announceToScreenReader(message: string) {
    const announcement = document.getElementById('sr-announcements');
    if (announcement) {
      announcement.textContent = message;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Live region for screen reader announcements -->
<div
  id="sr-announcements"
  aria-live="assertive"
  aria-atomic="true"
  class="sr-only"
></div>

<!-- Board content -->
<div class="board" role="group" aria-label="Kanban board">
  {#each board.columns as column, colIndex}
    <div
      class="column"
      data-column-index={colIndex}
      role="listbox"
      aria-label="{column.name} — {column.tasks.length} tasks"
    >
      <h2 class="column-header">{column.name} ({column.tasks.length})</h2>

      {#each column.tasks as task, taskIndex}
        <div
          class="task-card"
          class:focused={keyboardMode && colIndex === focusedColumnIndex && taskIndex === focusedTaskIndex}
          data-task-index={taskIndex}
          tabindex={colIndex === focusedColumnIndex && taskIndex === focusedTaskIndex ? 0 : -1}
          role="option"
          aria-selected={colIndex === focusedColumnIndex && taskIndex === focusedTaskIndex}
          aria-label="{task.title}, priority {task.priority}, assigned to {task.assignee?.name ?? 'unassigned'}"
        >
          {task.title}
        </div>
      {/each}
    </div>
  {/each}
</div>
```

A few things to notice. The `tabindex` follows the roving tabindex pattern — only the currently focused task has `tabindex="0"`, all others have `tabindex="-1"`. This means pressing Tab moves focus into the board on the current task, and Tab again moves focus out of the board entirely. Arrow keys handle movement within the board. This matches how native listboxes and grids work.

The `keyboardMode` flag activates visual focus styling only when the user is actually using the keyboard. Mouse users do not see a focus ring wandering around the board.

## ARIA Attributes for Drag-and-Drop

Screen readers cannot see visual drag-and-drop cues. They need explicit ARIA attributes to understand what is happening. The board uses `role="listbox"` on columns and `role="option"` on task cards. During a drag operation, `aria-grabbed` and `aria-dropeffect` communicate the state:

```svelte
<!-- TaskCard.svelte -->
<script lang="ts">
  import type { Task } from '$lib/types/board';
  import { board } from '$lib/state/board.svelte';

  let { task, columnName }: { task: Task; columnName: string } = $props();

  const isGrabbed = $derived(board.draggedTaskId === task.id);
</script>

<div
  class="task-card"
  role="option"
  aria-grabbed={isGrabbed}
  aria-label="{task.title}, in {columnName}, position {task.position + 1}, priority {task.priority}"
  aria-roledescription="draggable task"
>
  <div class="task-title">{task.title}</div>
  <div class="task-meta" aria-hidden="true">
    <span class="priority-badge priority-{task.priority}">{task.priority}</span>
    {#if task.assignee}
      <span class="assignee">{task.assignee.name}</span>
    {/if}
  </div>
</div>
```

And on the column drop targets:

```svelte
<!-- BoardColumn.svelte -->
<script lang="ts">
  import type { Column } from '$lib/types/board';
  import { board } from '$lib/state/board.svelte';

  let { column }: { column: Column } = $props();

  const isDropTarget = $derived(
    board.draggedTaskId !== null &&
    !column.tasks.some(t => t.id === board.draggedTaskId)
  );
</script>

<div
  class="column"
  role="listbox"
  aria-label="{column.name} — {column.tasks.length} tasks"
  aria-dropeffect={isDropTarget ? 'move' : 'none'}
>
  <h2>{column.name}</h2>
  {#each column.tasks as task}
    <TaskCard {task} columnName={column.name} />
  {/each}
</div>
```

The `aria-roledescription="draggable task"` overrides the generic "option" description so screen readers say "draggable task" instead of just "option." The `aria-label` on each task card includes its position and column name, giving full spatial context.

## Focus Management with tick()

Focus management is one of the most commonly broken aspects of web applications. When a modal opens, focus should move into it. When a modal closes, focus should return to the element that opened it. When a new task is created, focus should land on it so the user can immediately start editing. Svelte's `tick()` function is essential here — it lets you wait for the DOM to update before moving focus.

### Focusing a New Task After Creation

```svelte
<!-- NewTaskForm.svelte -->
<script lang="ts">
  import { tick } from 'svelte';
  import { board } from '$lib/state/board.svelte';

  let { columnId }: { columnId: number } = $props();
  let title = $state('');

  async function createTask() {
    if (!title.trim()) return;

    const newTask = {
      id: Date.now(), // temporary ID, replaced by server response
      title: title.trim(),
      columnId,
      position: 0,
      priority: 'medium' as const,
      assignee: null,
      dueDate: null
    };

    board.addTask(columnId, newTask);
    title = '';

    // Wait for Svelte to render the new task card in the DOM
    await tick();

    // Focus the newly created task card
    const newTaskEl = document.querySelector(
      `[data-task-id="${newTask.id}"]`
    ) as HTMLElement | null;
    newTaskEl?.focus();
  }
</script>

<form onsubmit={createTask}>
  <input
    bind:value={title}
    placeholder="Add a task..."
    aria-label="New task title"
  />
  <button type="submit">Add</button>
</form>
```

Without `await tick()`, the `querySelector` would run before Svelte has added the new task card to the DOM. The element would not exist yet, and focus would go nowhere. The `tick()` call returns a promise that resolves after Svelte has applied all pending state changes to the DOM.

### Returning Focus After Modal Close

```svelte
<!-- TaskModal.svelte -->
<script lang="ts">
  import { tick } from 'svelte';
  import { board } from '$lib/state/board.svelte';

  let triggerElement: HTMLElement | null = $state(null);

  // Capture the element that triggered the modal when it opens
  $effect(() => {
    if (board.activeTask) {
      triggerElement = document.activeElement as HTMLElement;

      // Move focus into the modal after it renders
      tick().then(() => {
        const modal = document.querySelector('[role="dialog"]') as HTMLElement;
        modal?.focus();
      });
    }
  });

  function closeModal() {
    board.setActiveTask(null);

    // Return focus to the element that opened the modal
    tick().then(() => {
      triggerElement?.focus();
      triggerElement = null;
    });
  }
</script>

{#if board.activeTask}
  <div
    class="modal-backdrop"
    onclick={closeModal}
    onkeydown={(e) => e.key === 'Escape' && closeModal()}
    role="presentation"
  >
    <div
      class="modal"
      role="dialog"
      aria-labelledby="modal-title"
      aria-modal="true"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <h2 id="modal-title">{board.activeTask.title}</h2>
      <!-- Modal content -->
      <button onclick={closeModal}>Close</button>
    </div>
  </div>
{/if}
```

The pattern is always the same: save a reference to the trigger element, wait for DOM updates with `tick()`, then call `.focus()`. This creates a predictable focus loop that keyboard and screen reader users can follow.

## SSR-Safe Unique IDs with $props.id()

Every form input needs a unique `id` that matches its label's `for` attribute. In a traditional app, you might use `Math.random()` or a counter — but those approaches break during SSR because the server and client generate different IDs, causing a hydration mismatch. Svelte 5's `$props.id()` generates a deterministic ID that is stable across server and client:

```svelte
<!-- TaskCreateForm.svelte -->
<script lang="ts">
  const id = $props.id();
</script>

<form>
  <div class="field">
    <label for="{id}-title">Task Title</label>
    <input id="{id}-title" type="text" name="title" required />
  </div>

  <div class="field">
    <label for="{id}-description">Description</label>
    <textarea id="{id}-description" name="description" rows="4"></textarea>
  </div>

  <div class="field">
    <label for="{id}-priority">Priority</label>
    <select id="{id}-priority" name="priority">
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="urgent">Urgent</option>
    </select>
  </div>

  <div class="field">
    <label for="{id}-assignee">Assignee</label>
    <select id="{id}-assignee" name="assigneeId">
      <option value="">Unassigned</option>
      <!-- team members -->
    </select>
  </div>

  <div class="field">
    <label for="{id}-due">Due Date</label>
    <input id="{id}-due" type="date" name="dueDate" />
  </div>

  <button type="submit">Create Task</button>
</form>
```

And the same pattern in the team settings form:

```svelte
<!-- TeamSettingsForm.svelte -->
<script lang="ts">
  const id = $props.id();
</script>

<form>
  <div class="field">
    <label for="{id}-name">Team Name</label>
    <input id="{id}-name" type="text" name="name" required />
  </div>

  <div class="field">
    <label for="{id}-slug">Team Slug</label>
    <input id="{id}-slug" type="text" name="slug" pattern="[a-z0-9-]+" />
  </div>

  <div class="field">
    <label for="{id}-desc">Description</label>
    <textarea id="{id}-desc" name="description"></textarea>
  </div>
</form>
```

And in the comment form, which may appear multiple times on a page (one per task in a list view):

```svelte
<!-- CommentForm.svelte -->
<script lang="ts">
  const id = $props.id();
  let { taskId }: { taskId: number } = $props();
</script>

<form>
  <label for="{id}-comment">Add a comment</label>
  <textarea id="{id}-comment" name="body" rows="3" required></textarea>
  <input type="hidden" name="taskId" value={taskId} />
  <button type="submit">Post Comment</button>
</form>
```

Each instance of `CommentForm` gets its own unique, SSR-safe ID. No collisions, no hydration mismatches.

## Link Options Audit

SvelteKit gives you fine-grained control over how links behave through `data-sveltekit-*` attributes. A performance audit of TeamBoard's links should add preloading where it helps and prevent scroll jumps where they hurt.

### Preload Data on Hover

When a user hovers over a board link in the dashboard, there is a 100-200ms window before they click. Use that time to start loading the board data:

```svelte
<!-- Dashboard board list -->
<nav aria-label="Your boards">
  <ul>
    {#each data.boards as board}
      <li>
        <a
          href="/{data.team.slug}/boards/{board.id}"
          data-sveltekit-preload-data="hover"
        >
          {board.name}
        </a>
      </li>
    {/each}
  </ul>
</nav>

<!-- Sidebar team links -->
<aside>
  {#each data.teams as team}
    <a
      href="/{team.slug}/dashboard"
      data-sveltekit-preload-data="hover"
    >
      {team.name}
    </a>
  {/each}
</aside>

<!-- Task links within boards -->
{#each column.tasks as task}
  <a
    href="/{teamSlug}/boards/{boardId}/tasks/{task.id}"
    data-sveltekit-preload-data="hover"
  >
    {task.title}
  </a>
{/each}
```

### Prevent Scroll Jumps on Sort and Filter

Sort and filter controls should update the URL (so the state is shareable) but should not scroll the page back to the top:

```svelte
<!-- Board filter controls -->
<div class="filters" role="toolbar" aria-label="Board filters">
  <a
    href="?sort=priority"
    data-sveltekit-noscroll
    class:active={$page.url.searchParams.get('sort') === 'priority'}
  >
    Sort by Priority
  </a>
  <a
    href="?sort=dueDate"
    data-sveltekit-noscroll
    class:active={$page.url.searchParams.get('sort') === 'dueDate'}
  >
    Sort by Due Date
  </a>
  <a
    href="?filter=mine"
    data-sveltekit-noscroll
    class:active={$page.url.searchParams.get('filter') === 'mine'}
  >
    My Tasks
  </a>
  <a
    href="?filter=all"
    data-sveltekit-noscroll
    class:active={$page.url.searchParams.get('filter') === 'all'}
  >
    All Tasks
  </a>
</div>
```

Without `data-sveltekit-noscroll`, clicking "Sort by Priority" would scroll the page to the top, losing the user's scroll position in a long task list. This is a small detail that makes a big difference in usability.

## Performance Review

With the features built, step back and audit the performance decisions across TeamBoard.

### $state.raw() Audit

Check that large, read-only datasets use `$state.raw()` instead of `$state()`:

```typescript
// src/lib/state/board.svelte.ts — CORRECT
let allProjectTasks = $state.raw<Task[]>([]);       // Hundreds of tasks, replaced on fetch
let activityLog = $state.raw<ActivityEntry[]>([]);   // Long log, append-only from server

// WRONG — would create proxy wrappers for every property of every task
// let allProjectTasks = $state<Task[]>([]);
```

The rule is simple: if you never write `allProjectTasks[0].title = 'something'` and always replace the whole array, use `$state.raw()`. The performance savings scale with dataset size.

### Prerender Static Pages

Pages that do not change per-request should be prerendered at build time:

```typescript
// src/routes/(auth)/login/+page.ts
export const prerender = true;

// src/routes/(auth)/signup/+page.ts
export const prerender = true;

// src/routes/about/+page.ts
export const prerender = true;

// src/routes/pricing/+page.ts
export const prerender = true;
```

Prerendered pages are served as static HTML — no server-side rendering on each request. This gives the fastest possible Time to First Byte (TTFB).

### Streaming for Slow Dashboard Data

The dashboard loads fast summary data and slow analytics data. Stream the slow data so the page is interactive immediately:

```typescript
// src/routes/(app)/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Fast — return immediately
  const teams = await getTeams(locals.userId);
  const recentTasks = await getRecentTasks(locals.userId);

  // Slow — return as a promise (streamed to client)
  const analyticsPromise = getAnalytics(locals.userId); // Do NOT await

  return {
    teams,
    recentTasks,
    analytics: analyticsPromise
  };
};
```

```svelte
<!-- Dashboard page -->
<script lang="ts">
  let { data } = $props();
</script>

<!-- Renders immediately -->
<h1>Welcome back</h1>
<RecentTasks tasks={data.recentTasks} />

<!-- Streams in when ready -->
{#await data.analytics}
  <div class="analytics-skeleton" aria-label="Loading analytics...">
    <div class="skeleton-bar"></div>
    <div class="skeleton-bar"></div>
  </div>
{:then analytics}
  <AnalyticsDashboard {analytics} />
{/await}
```

## Page Options Audit

Every route group should have explicit page options. Here is the audit for TeamBoard:

```typescript
// src/routes/(auth)/+layout.ts
// Auth pages can be prerendered — they are the same for everyone
export const prerender = true;

// src/routes/(app)/+layout.server.ts
// App pages require the server (auth check, user data)
export const ssr = true;
export const csr = true;
// prerender is false by default — each request is unique

// src/routes/(app)/[teamSlug]/boards/[boardId]/+page.ts
// Board pages are dynamic and highly interactive
export const ssr = true;    // SEO not critical, but SSR improves perceived performance
export const csr = true;    // Required for drag-and-drop, real-time updates

// src/routes/api/[...path]/+server.ts
// API routes — no SSR or CSR, they return JSON
export const prerender = false;
```

The key questions for each route: Does this page need server-side rendering? Does it need client-side JavaScript? Can it be generated at build time? Answer those three questions and set `ssr`, `csr`, and `prerender` accordingly.

## Lighthouse Audit Walkthrough

Run a Lighthouse audit on TeamBoard and understand what each metric means for this type of application.

**Largest Contentful Paint (LCP)** measures when the largest visible element renders. For TeamBoard's dashboard, that is the board list or the analytics chart. Streaming helps here — the main content renders immediately from the fast data, and the analytics stream in later without blocking LCP.

**Interaction to Next Paint (INP)** measures responsiveness. Every click, keypress, and drag must result in a visual update within 200ms. TeamBoard's architecture supports this: `$state()` mutations trigger synchronous re-renders, and long operations (API calls) happen asynchronously after the optimistic UI update.

**Cumulative Layout Shift (CLS)** measures visual stability. Common sources of CLS in project management apps: images without dimensions, dynamically loaded lists that push content down, and notifications that shift the layout. Fix these:

```svelte
<!-- Always set explicit dimensions on avatars -->
<img
  src={user.avatarUrl}
  alt="{user.name}'s avatar"
  width="32"
  height="32"
  class="avatar"
/>

<!-- Use min-height on skeleton loaders to reserve space -->
<div class="analytics-skeleton" style="min-height: 300px;">
  Loading...
</div>

<!-- Position notifications as fixed overlays, not inline -->
<div class="notification-container" style="position: fixed; top: 1rem; right: 1rem;">
  <!-- Notifications render here without shifting page content -->
</div>
```

The combination of prerendering static pages, streaming slow data, using `$state.raw()` for large datasets, and reserving layout space for dynamic content gives TeamBoard strong Lighthouse scores across all Core Web Vitals.

## Try It

1. Add keyboard navigation to your board. Handle ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Enter, and Escape on `<svelte:window>`. Track `focusedColumnIndex` and `focusedTaskIndex` as `$state` variables. Use `await tick()` to focus the correct task card after each key press.

2. Add ARIA attributes to your columns (`role="listbox"`, `aria-label`) and task cards (`role="option"`, `aria-grabbed`, `aria-label` with position and column name).

3. Create a live region `<div aria-live="assertive">` and announce task moves to screen readers by setting its `textContent`.

4. Add `$props.id()` to your task creation form. Verify that every `<input>` has a matching `<label for="">` and that the IDs do not collide when multiple form instances exist on the page.

5. Audit your app's links: add `data-sveltekit-preload-data="hover"` to board and task links, and `data-sveltekit-noscroll` to filter/sort controls.

6. Check all your `$state()` declarations. If any hold large datasets that are replaced wholesale and never mutated in place, switch them to `$state.raw()`.

7. Run Lighthouse on your app in Chrome DevTools. Identify your LCP element, check your INP score, and look for any CLS issues. Fix at least one issue you find.

## Key Takeaways

- Keyboard navigation uses `<svelte:window onkeydown>` with a roving tabindex pattern — only the focused element has `tabindex="0"`, all others have `tabindex="-1"`
- ARIA attributes like `role="listbox"`, `role="option"`, `aria-grabbed`, and `aria-dropeffect` make drag-and-drop accessible to screen readers
- Live regions (`aria-live="assertive"`) announce dynamic changes (like task moves) that screen readers would otherwise miss
- `tick()` is essential for focus management — always await it before calling `.focus()` on a newly rendered element
- `$props.id()` generates SSR-safe unique IDs for form element label/input pairs, preventing hydration mismatches
- `data-sveltekit-preload-data="hover"` gives users near-instant page transitions by loading data during the hover-to-click window
- `data-sveltekit-noscroll` on filter and sort controls prevents jarring scroll-to-top behavior
- `$state.raw()` should be used for any large dataset that is read-only and replaced wholesale — the performance difference grows with data size
- Streaming slow data with unresolved promises in load functions keeps the page interactive while background data loads
- Lighthouse's Core Web Vitals (LCP, INP, CLS) each map to specific architectural choices — prerendering, synchronous reactivity, and layout stability
