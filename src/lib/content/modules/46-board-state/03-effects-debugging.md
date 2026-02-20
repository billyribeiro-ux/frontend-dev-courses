# Effects, Timing & Debugging

TeamBoard's Kanban board is a live, interactive surface. Tasks are dragged between columns, new cards scroll into view, column heights adjust for virtual scrolling, and every change is logged to an activity feed. Each of these behaviors depends on precise control over when code runs relative to DOM updates. This lesson covers the full toolkit: `$effect`, `$effect.pre`, `tick`, `flushSync`, `untrack`, `$effect.tracking()`, and every debugging tool Svelte 5 provides.

## $effect.pre for Pre-Paint Measurement

`$effect.pre` runs before the browser paints the updated DOM. This is the right place to measure layout properties — heights, scroll positions, widths — before the user sees the frame. TeamBoard uses this for virtual scrolling of long task columns.

When a column has 100+ tasks, rendering all of them tanks performance. Virtual scrolling renders only the visible slice. To know which tasks are visible, you need the column's scroll position and height before the browser paints:

```svelte
<!-- src/lib/components/board/VirtualColumn.svelte -->
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  let { column } = $props();

  const board = getBoardContext();
  let containerEl: HTMLDivElement;
  let visibleRange = $state({ start: 0, end: 20 });
  const ITEM_HEIGHT = 72; // Fixed task card height in pixels

  // Runs BEFORE paint — measure DOM, calculate visible range
  $effect.pre(() => {
    // Reading column.tasks.length creates a dependency.
    // This effect re-runs whenever tasks are added or removed.
    const taskCount = column.tasks.length;

    if (!containerEl || taskCount === 0) return;

    const scrollTop = containerEl.scrollTop;
    const containerHeight = containerEl.clientHeight;

    const start = Math.floor(scrollTop / ITEM_HEIGHT);
    const end = Math.min(
      start + Math.ceil(containerHeight / ITEM_HEIGHT) + 2, // 2-item buffer
      taskCount
    );

    visibleRange = { start, end };
  });

  const visibleTasks = $derived(
    column.tasks.slice(visibleRange.start, visibleRange.end)
  );

  const totalHeight = $derived(column.tasks.length * ITEM_HEIGHT);
  const offsetY = $derived(visibleRange.start * ITEM_HEIGHT);
</script>

<div
  class="column-scroll"
  bind:this={containerEl}
  onscroll={() => { /* triggers reactivity through containerEl reads in $effect.pre */ }}
>
  <div class="spacer" style:height="{totalHeight}px">
    <div class="tasks" style:transform="translateY({offsetY}px)">
      {#each visibleTasks as task (task.id)}
        <div class="task-card" style:height="{ITEM_HEIGHT}px">
          {task.title}
        </div>
      {/each}
    </div>
  </div>
</div>
```

The difference between `$effect.pre` and `$effect` matters here. A regular `$effect` runs after paint — the user would see a flash of incorrectly positioned items before the visible range updates. `$effect.pre` runs after state changes but before the browser renders, so the correct slice is calculated in time for the paint.

## $effect with untrack for Activity Logging

Every time the board state changes — a task is moved, a column is reordered, a task is edited — TeamBoard logs the change to an activity feed. The logger needs to read the current state (what changed?) and write to a log array (record it). Without `untrack`, this creates an infinite loop: reading the log makes it a dependency, writing to it triggers a re-run, which reads it again.

```typescript
// src/lib/state/activity.svelte.ts
import { untrack } from 'svelte';
import type { Column } from '$lib/types/board';

export function createActivityLogger() {
  let log = $state<{ timestamp: Date; message: string; snapshot: any }[]>([]);

  function watchBoard(getColumns: () => Column[]) {
    $effect(() => {
      // Read the board state — this IS tracked.
      // The effect re-runs when columns or their tasks change.
      const columns = getColumns();
      const totalTasks = columns.reduce((sum, c) => sum + c.tasks.length, 0);
      const columnSummary = columns.map(c => `${c.name}: ${c.tasks.length}`).join(', ');

      // Write to the log — this must NOT be tracked.
      // Without untrack, reading `log` to push creates a dependency,
      // and the push triggers a re-run, creating an infinite loop.
      untrack(() => {
        log.push({
          timestamp: new Date(),
          message: `Board updated — ${totalTasks} tasks (${columnSummary})`,
          snapshot: null // Could add $state.snapshot() here
        });

        // Keep the log from growing unbounded
        if (log.length > 100) {
          log.splice(0, log.length - 100);
        }
      });
    });
  }

  return {
    get log() { return log; },
    watchBoard
  };
}
```

The rule is simple: everything inside `untrack(() => { ... })` is invisible to Svelte's dependency tracker. The effect depends on `getColumns()` (the board state), but not on `log` (the write target). Changes to the board re-run the effect. Changes to the log do not.

A second common use for `untrack` is reading configuration that should not trigger re-runs:

```typescript
$effect(() => {
  const currentTask = activeTask; // tracked — re-run when active task changes

  untrack(() => {
    // Read the user preferences for how to format the log entry.
    // We do not want to re-run this effect when preferences change.
    const format = userPreferences.dateFormat;
    console.log(`Task selected at ${formatDate(new Date(), format)}:`, currentTask?.title);
  });
});
```

## tick for Post-Update DOM Access

When you add a task to a column, the DOM does not update synchronously. Svelte batches state changes and applies them asynchronously. If you need to scroll to the newly added task card, you must wait for the DOM to reflect the new state. That is what `tick` does — it returns a promise that resolves after Svelte applies all pending updates:

```svelte
<!-- src/lib/components/board/Column.svelte -->
<script lang="ts">
  import { tick } from 'svelte';
  import { getBoardContext } from '$lib/context/board';
  import { getNotificationContext } from '$lib/context/notifications';

  let { column } = $props();

  const board = getBoardContext();
  const notifications = getNotificationContext();
  let columnEl: HTMLDivElement;

  async function addTaskAndScroll() {
    const newTask = {
      id: Date.now(),
      columnId: column.id,
      boardId: 1,
      title: 'New Task',
      description: '',
      priority: 'medium' as const,
      position: column.tasks.length,
      assigneeId: null,
      dueDate: null,
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // 1. Update state — adds the task to the reactive array
    board.addTask(column.id, newTask);

    // 2. Wait for Svelte to apply the DOM update
    await tick();

    // 3. Now the new task card exists in the DOM — scroll to it
    const lastCard = columnEl.querySelector('.task-card:last-child');
    lastCard?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    notifications.success('Task added');
  }
</script>

<div class="column" bind:this={columnEl}>
  <div class="column-header">
    <h3>{column.name}</h3>
    <button onclick={addTaskAndScroll}>+ Add</button>
  </div>
  <div class="task-list">
    {#each column.tasks as task (task.id)}
      <div class="task-card">{task.title}</div>
    {/each}
  </div>
</div>
```

Without `await tick()`, the `querySelector` would run before the new `<div class="task-card">` element exists in the DOM. The scroll target would be the previously-last card, or `null` if the column was empty.

## flushSync for Synchronous DOM Updates

`tick` is asynchronous — it waits until the next microtask. Sometimes you need the DOM to update immediately, in the same synchronous execution frame. `flushSync` forces Svelte to apply all pending state changes to the DOM right now. TeamBoard uses this to position the drag preview accurately:

```svelte
<!-- src/lib/components/board/DragPreview.svelte -->
<script lang="ts">
  import { flushSync } from 'svelte';
  import { getBoardContext } from '$lib/context/board';

  const board = getBoardContext();

  let previewEl: HTMLDivElement;
  let previewPosition = $state({ x: 0, y: 0 });
  let previewTask = $state<{ title: string; priority: string } | null>(null);

  function handleDragStart(event: DragEvent, task: { id: number; title: string; priority: string }) {
    // Update the preview state
    previewTask = { title: task.title, priority: task.priority };
    previewPosition = { x: event.clientX, y: event.clientY };

    // Force DOM update NOW — we need the element's dimensions
    // in this same event handler to set the drag image
    flushSync();

    // Now previewEl reflects the updated state
    if (previewEl && event.dataTransfer) {
      const rect = previewEl.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        previewEl,
        rect.width / 2,  // Center horizontally
        rect.height / 2  // Center vertically
      );
    }

    board.setDraggedTask(task.id);
  }
</script>

<div class="drag-preview" bind:this={previewEl}
  style:left="{previewPosition.x}px"
  style:top="{previewPosition.y}px"
>
  {#if previewTask}
    <div class="preview-card">
      <span class="priority-dot priority-{previewTask.priority}"></span>
      {previewTask.title}
    </div>
  {/if}
</div>
```

Without `flushSync`, the preview element would still show the old content (or be empty) when `setDragImage` is called. The DOM update would happen later, after the event handler returns — too late for the browser to capture the drag image.

Use `flushSync` sparingly. It forces synchronous work that Svelte normally batches for performance. Reserve it for cases where you need the DOM to be current within the same synchronous execution frame.

## $effect.tracking() for Conditional Behavior

`$effect.tracking()` returns `true` if the code is running inside a reactive context (a `$derived`, `$effect`, or template expression) and `false` otherwise. This lets you write functions that behave differently depending on whether they are called reactively:

```typescript
// src/lib/utils/logger.ts
import { $effect } from 'svelte';

export function smartLog(label: string, value: unknown) {
  if ($effect.tracking()) {
    // We are inside a reactive context — the caller wants
    // this to re-run when dependencies change.
    // Safe to read reactive values here.
    console.log(`[reactive] ${label}:`, value);
  } else {
    // We are in a plain function call — one-time log.
    console.log(`[static] ${label}:`, value);
  }
}
```

```svelte
<script lang="ts">
  import { smartLog } from '$lib/utils/logger';

  let count = $state(0);

  // Called in reactive context — logs "[reactive] count: 0", then
  // "[reactive] count: 1" after increment
  $effect(() => {
    smartLog('count', count);
  });

  function handleClick() {
    count++;
    // Called outside reactive context — logs "[static] count: 1"
    smartLog('count after click', count);
  }
</script>
```

This is an advanced pattern. You will use it most often when building reusable utility functions that might be called both reactively and imperatively.

## $inspect for Development Logging

`$inspect` is the reactive `console.log`. Place it in a component or `.svelte.ts` module, and it logs the value on initialization and every time it changes. It is stripped from production builds automatically:

```svelte
<!-- src/lib/components/board/BoardDebug.svelte -->
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  const board = getBoardContext();

  // Logs columns array on init and every change
  $inspect(board.columns);

  // Logs with a label-like prefix using the callback
  $inspect(board.totalTasks).with((phase, value) => {
    console.log(`[BoardDebug] totalTasks ${phase}: ${value}`);
  });
</script>
```

## $inspect with console.table

For structured data like board statistics, `console.table` produces a readable table in the browser console:

```svelte
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  const board = getBoardContext();

  // Displays a table with column names and task counts
  const stats = $derived.by(() => {
    return board.columns.map(col => ({
      column: col.name,
      tasks: col.tasks.length,
      highPriority: col.tasks.filter(t => t.priority === 'high' || t.priority === 'urgent').length,
      overdue: col.tasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length
    }));
  });

  $inspect(stats).with(console.table);
</script>
```

Each time a task is moved, added, or removed, the console prints a fresh table:

```
┌─────────┬──────────────┬───────┬──────────────┬─────────┐
│ (index) │   column     │ tasks │ highPriority │ overdue │
├─────────┼──────────────┼───────┼──────────────┼─────────┤
│    0    │ 'To Do'      │   8   │      2       │    1    │
│    1    │ 'In Progress'│   5   │      3       │    0    │
│    2    │ 'Done'       │  12   │      1       │    0    │
└─────────┴──────────────┴───────┴──────────────┴─────────┘
```

## $inspect.trace() for Dependency Tracking

When a `$derived.by` or `$effect` re-runs and you cannot figure out which signal triggered it, `$inspect.trace()` tells you. Place it as the first line inside the reactive block:

```svelte
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  const board = getBoardContext();

  const sprintStats = $derived.by(() => {
    $inspect.trace(); // Shows which signals caused this re-run

    const doneColumn = board.columns.find(c => c.name.toLowerCase() === 'done');
    if (!doneColumn) return { velocity: 0, completed: 0 };

    const completed = doneColumn.tasks.length;
    const total = board.totalTasks;
    const velocity = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { velocity, completed };
  });
</script>

<div class="sprint-stats">
  <p>Velocity: {sprintStats.velocity}%</p>
  <p>Completed: {sprintStats.completed}</p>
</div>
```

When you move a task to the Done column, the console output from `$inspect.trace()` shows exactly which reactive read triggered the recalculation — was it `board.columns`, `board.totalTasks`, or both? This eliminates guesswork when debugging unexpected re-computations.

## {@debug} for Template Breakpoints

The `{@debug}` tag pauses execution in the browser debugger whenever the specified variables change. It works like a reactive breakpoint right in the template:

```svelte
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  const board = getBoardContext();
  const columns = $derived(board.columns);
  const overdueTasks = $derived(board.overdueTasks);
</script>

{@debug columns, overdueTasks}

<div class="board">
  {#each columns as column (column.id)}
    <div class="column">
      <h3>{column.name} ({column.tasks.length})</h3>
      {#each column.tasks as task (task.id)}
        <div class="task-card">{task.title}</div>
      {/each}
    </div>
  {/each}
</div>

{#if overdueTasks.length > 0}
  <div class="overdue-warning">
    {overdueTasks.length} overdue task{overdueTasks.length === 1 ? '' : 's'}
  </div>
{/if}
```

With browser dev tools open, the debugger pauses every time `columns` or `overdueTasks` changes. You can inspect the full component state, step through the rendering logic, and examine the DOM at the exact moment of the update. This only works in development mode — it is a no-op in production.

A bare `{@debug}` without arguments pauses on every template re-render, useful for counting how often a component updates.

## Common Pitfalls

### Reading State After await

Svelte tracks reactive reads synchronously. Once execution crosses an `await` boundary, any reads after it are not tracked — the effect will not re-run when those values change:

```svelte
<script lang="ts">
  let boardId = $state(1);
  let filter = $state('all');

  // BAD: filter is read after await — not tracked
  $effect(() => {
    const response = await fetch(`/api/boards/${boardId}/tasks`);
    const tasks = await response.json();
    // Changing filter will NOT re-run this effect
    const filtered = tasks.filter(t => filter === 'all' || t.status === filter);
    console.log(filtered);
  });

  // GOOD: read all dependencies before the first await
  $effect(() => {
    const currentBoardId = boardId;   // tracked
    const currentFilter = filter;      // tracked

    fetch(`/api/boards/${currentBoardId}/tasks`)
      .then(res => res.json())
      .then(tasks => {
        const filtered = tasks.filter(
          t => currentFilter === 'all' || t.status === currentFilter
        );
        console.log(filtered);
      });
  });
</script>
```

The fix is simple: read every reactive dependency into a local variable before the first `await` or `.then()`. The local variables capture the current values, and Svelte tracks the reads that produced them.

### Infinite Loops from Reading + Writing Same State

An `$effect` that reads and writes the same state variable re-triggers itself endlessly:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';

  let tasks = $state([
    { id: 1, title: 'Task A', status: 'todo' },
    { id: 2, title: 'Task B', status: 'done' }
  ]);

  let statusCounts = $state<Record<string, number>>({});

  // BAD: reads tasks (tracked), writes statusCounts (triggers re-run),
  // which reads statusCounts implicitly through the proxy...
  $effect(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    statusCounts = counts; // Writing state inside $effect — dangerous
  });

  // BETTER: use $derived.by instead — no side effect needed
  const statusCounts2 = $derived.by(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      counts[task.status] = (counts[task.status] ?? 0) + 1;
    }
    return counts;
  });
</script>
```

If you genuinely need to write state inside an `$effect` (for example, syncing to an external system), use `untrack` around the write:

```svelte
<script lang="ts">
  import { untrack } from 'svelte';

  let tasks = $state([{ id: 1, title: 'A', status: 'todo' }]);
  let externalLog = $state<string[]>([]);

  $effect(() => {
    // Read tasks — tracked
    const summary = tasks.map(t => `${t.title}: ${t.status}`).join(', ');

    // Write to log — untracked to prevent loop
    untrack(() => {
      externalLog.push(`Board state: ${summary}`);
    });
  });
</script>
```

### Mutating $state.raw Without Reassignment

This is a silent bug — the code runs without errors, but the UI never updates:

```svelte
<script lang="ts">
  let allTasks = $state.raw([
    { id: 1, title: 'Task A' },
    { id: 2, title: 'Task B' }
  ]);

  function updateTitle(id: number, newTitle: string) {
    // BAD: mutation on raw state — no reactivity triggered
    const task = allTasks.find(t => t.id === id);
    if (task) task.title = newTitle;

    // GOOD: create a new array and reassign
    allTasks = allTasks.map(t =>
      t.id === id ? { ...t, title: newTitle } : t
    );
  }
</script>
```

`$state.raw()` does not wrap objects in proxies. Only reassignment of the variable itself triggers updates. If you find yourself needing to mutate individual properties frequently, switch to `$state()` instead.

## Putting It All Together

Here is a component that uses every timing and debugging tool in one place, annotated with comments explaining which tool solves which problem:

```svelte
<!-- src/lib/components/board/Board.svelte -->
<script lang="ts">
  import { tick, flushSync, untrack } from 'svelte';
  import { getBoardContext } from '$lib/context/board';
  import { getNotificationContext } from '$lib/context/notifications';

  const board = getBoardContext();
  const notifications = getNotificationContext();

  let boardEl: HTMLDivElement;

  // ── $inspect: development-time reactive logging ──────────
  $inspect(board.columns).with((phase, cols) => {
    if (phase === 'update') {
      console.log(`Columns updated: ${cols.length} columns`);
    }
  });

  $inspect(board.sprintVelocity).with(console.table);

  // ── $effect.pre: measure before paint ────────────────────
  $effect.pre(() => {
    const columnCount = board.columns.length;
    if (!boardEl) return;

    // Measure total board width before paint to decide
    // whether to show horizontal scroll indicators
    const boardWidth = boardEl.scrollWidth;
    const viewportWidth = boardEl.clientWidth;
    const needsScroll = boardWidth > viewportWidth;

    // Use the measurement (e.g., toggle a CSS class)
    boardEl.classList.toggle('has-scroll', needsScroll);
  });

  // ── $effect with untrack: log without dependency loops ───
  $effect(() => {
    const overdueCount = board.overdueTasks.length; // tracked

    untrack(() => {
      if (overdueCount > 0) {
        console.warn(`Warning: ${overdueCount} overdue tasks`);
      }
    });
  });

  // ── tick: scroll after DOM update ────────────────────────
  async function addColumnAndScroll(name: string) {
    board.addColumn({
      id: Date.now(),
      boardId: 1,
      name,
      position: board.columns.length,
      color: '#6366f1',
      tasks: []
    });

    await tick();

    const lastColumn = boardEl.querySelector('.column:last-child');
    lastColumn?.scrollIntoView({ behavior: 'smooth', inline: 'end' });
    notifications.success(`Column "${name}" added`);
  }

  // ── flushSync: synchronous update for measurement ────────
  function handleColumnResize(columnIndex: number, newWidth: number) {
    board.columns[columnIndex].width = newWidth;

    flushSync();

    // DOM is now updated — read the new layout
    const columnEl = boardEl.querySelectorAll('.column')[columnIndex];
    const actualWidth = columnEl?.getBoundingClientRect().width;
    console.log(`Column resized to ${actualWidth}px`);
  }
</script>

<!-- ── {@debug}: reactive breakpoints in template ─────────── -->
{@debug board.columns}

<div class="board" bind:this={boardEl}>
  {#each board.columns as column (column.id)}
    <div class="column">
      <h3>{column.name}</h3>
      {#each column.tasks as task (task.id)}
        <div class="task-card">{task.title}</div>
      {/each}
    </div>
  {/each}
</div>
```

## Try It

Build a debug-instrumented task board:

1. Create a simple board with two columns and a few tasks. Add `$inspect` to watch the columns array and use `.with(console.table)` to display task counts.
2. Add an `$effect.pre` that measures the total height of a column's task list before paint. Log the measurement to see it update as you add tasks.
3. Create an activity log using `$effect` and `untrack`. The effect should track columns (re-run on changes) but write to a log array without creating a dependency loop. Display the log below the board.
4. Add an "Add Task" button that creates a new task, waits with `await tick()`, then scrolls to the new task card. Verify the scroll target exists by logging the element.
5. Create a drag preview scenario: use `flushSync` to force a DOM update, then read the preview element's dimensions in the same synchronous frame.
6. Add `$inspect.trace()` inside a `$derived.by` that computes board statistics. Move a task and check the console to see which dependency triggered the recomputation.
7. Add `{@debug columns}` to your template and open browser dev tools. Move a task and verify the debugger pauses at the right moment.

## Key Takeaways

- `$effect.pre` runs before paint — use it for DOM measurement that must happen before the browser renders the frame
- `$effect` with `untrack` lets you read state for logging or syncing without creating dependency loops on the write target
- `tick` returns a promise that resolves after Svelte applies pending DOM updates — use it to access newly rendered elements
- `flushSync` forces synchronous DOM updates — use it when you need measurements in the same event handler, but use it sparingly as it defeats Svelte's batching optimizations
- `$effect.tracking()` detects whether code is running in a reactive context, useful for library functions that behave differently reactively vs. imperatively
- `$inspect(value)` logs reactively and is stripped from production; `.with(console.table)` formats structured data; `.with(console.trace)` shows call stacks
- `$inspect.trace()` inside `$derived.by` or `$effect` reveals which specific signals triggered the re-run
- `{@debug variables}` pauses the browser debugger on reactive changes — a breakpoint that fires on state updates
- Always read reactive dependencies before `await` — post-await reads are not tracked
- Avoid reading and writing the same state in `$effect` — use `$derived` for computed values or `untrack` for the write when a side effect is genuinely needed
- Never mutate `$state.raw()` values in place — only full reassignment triggers reactivity
