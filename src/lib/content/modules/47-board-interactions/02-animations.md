# Animations — Flip, Crossfade & Transitions

Moving a task card between columns should feel like sliding a physical card across a desk, not teleporting it. When a user drags a task from "To Do" to "In Progress," the card should fade out of one column and simultaneously appear in the other. When remaining cards shift to fill the gap, they should glide smoothly rather than jump. And when someone creates a new task, it should announce its arrival with a gentle entrance animation.

Svelte provides purpose-built tools for each of these scenarios: `animate:flip` for reordering, `crossfade` for cross-container transitions, built-in transitions for enter/exit, and motion classes for continuous value interpolation. In this lesson you will wire them all into TeamBoard's Kanban board so every interaction feels polished and intentional.

## animate:flip — Smooth Reordering Within Columns

When tasks are reordered within a column — via drag-and-drop or keyboard shortcuts — the `animate:flip` directive ensures every card smoothly slides to its new position instead of jumping. FLIP stands for **F**irst, **L**ast, **I**nvert, **P**lay: Svelte measures each element's position before and after the change, then animates the difference.

```svelte
<script lang="ts">
  import { flip } from 'svelte/animate';

  interface Task {
    id: number;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
  }

  let tasks: Task[] = $state([
    { id: 1, title: 'Set up CI pipeline', priority: 'high' },
    { id: 2, title: 'Write API documentation', priority: 'medium' },
    { id: 3, title: 'Fix login redirect bug', priority: 'urgent' },
    { id: 4, title: 'Add dark mode toggle', priority: 'low' },
    { id: 5, title: 'Refactor auth middleware', priority: 'high' }
  ]);

  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };

  function sortByPriority() {
    tasks = [...tasks].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  function sortByTitle() {
    tasks = [...tasks].sort((a, b) => a.title.localeCompare(b.title));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...tasks];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    tasks = updated;
  }
</script>

<div class="controls">
  <button onclick={sortByPriority}>Sort by Priority</button>
  <button onclick={sortByTitle}>Sort by Title</button>
</div>

<ul class="task-list" role="list">
  {#each tasks as task, index (task.id)}
    <li animate:flip={{ duration: 300 }}>
      <button onclick={() => moveUp(index)} disabled={index === 0} aria-label="Move up">
        &uarr;
      </button>
      <span class="priority-badge {task.priority}">{task.priority}</span>
      <span>{task.title}</span>
    </li>
  {/each}
</ul>
```

Two things are required for `animate:flip` to work:

1. **A keyed each block** — the `(task.id)` tells Svelte which DOM element corresponds to which data item. Without the key, Svelte cannot track which element moved where.
2. **The import** — `flip` comes from `svelte/animate`, not `svelte/transition`. It is a different kind of animation: transitions handle enter/exit, flip handles movement.

The `duration` parameter can be a number (milliseconds) or a function that receives the distance in pixels and returns a duration. This lets far-traveling elements animate slower:

```svelte
<li animate:flip={{ duration: (d) => Math.sqrt(d) * 60 }}>
```

You can also pass `delay` and `easing`:

```svelte
<li animate:flip={{ duration: 300, delay: 0, easing: cubicOut }}>
```

## crossfade — Tasks Moving Between Columns

`animate:flip` handles movement within a single `{#each}` block, but what happens when a task moves from one column to another? The card is removed from one list and inserted into another — that is an exit and an entry, not a position change. This is where `crossfade` shines.

`crossfade` creates a matched pair of transitions: `send` and `receive`. When an element with `out:send` leaves one place and an element with `in:receive` enters another (with the same key), Svelte coordinates them into a single smooth animation — the element appears to fly from its old position to its new one.

```svelte
<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import { flip } from 'svelte/animate';

  // Create the matched pair — they share internal state
  const [send, receive] = crossfade({
    duration: 400,
    easing: quintOut,

    // Fallback transition for items that do not have a matching partner
    // (e.g., the first time a task appears or the last time it disappears)
    fallback(node) {
      const style = getComputedStyle(node);
      const opacity = +style.opacity;
      return {
        duration: 300,
        css: (t: number) => `opacity: ${t * opacity}`
      };
    }
  });

  interface Task {
    id: number;
    title: string;
  }

  interface Column {
    id: string;
    name: string;
    tasks: Task[];
  }

  let columns: Column[] = $state([
    {
      id: 'todo',
      name: 'To Do',
      tasks: [
        { id: 1, title: 'Design landing page' },
        { id: 2, title: 'Set up database' }
      ]
    },
    {
      id: 'progress',
      name: 'In Progress',
      tasks: [
        { id: 3, title: 'Build auth flow' }
      ]
    },
    {
      id: 'done',
      name: 'Done',
      tasks: [
        { id: 4, title: 'Project setup' }
      ]
    }
  ]);

  function moveTask(taskId: number, toColumnId: string) {
    let movedTask: Task | undefined;

    // Remove from source column
    columns = columns.map((col) => ({
      ...col,
      tasks: col.tasks.filter((t) => {
        if (t.id === taskId) {
          movedTask = t;
          return false;
        }
        return true;
      })
    }));

    // Add to target column
    if (movedTask) {
      columns = columns.map((col) =>
        col.id === toColumnId
          ? { ...col, tasks: [...col.tasks, movedTask!] }
          : col
      );
    }
  }
</script>

<div class="board">
  {#each columns as column (column.id)}
    <div class="column">
      <h3>{column.name}</h3>

      <ul>
        {#each column.tasks as task (task.id)}
          <li
            animate:flip={{ duration: 300 }}
            in:receive={{ key: task.id }}
            out:send={{ key: task.id }}
          >
            <span>{task.title}</span>
            <div class="move-buttons">
              {#each columns.filter(c => c.id !== column.id) as target}
                <button onclick={() => moveTask(task.id, target.id)}>
                  &rarr; {target.name}
                </button>
              {/each}
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/each}
</div>

<style>
  .board {
    display: flex;
    gap: 16px;
  }

  .column {
    flex: 1;
    background: #f1f5f9;
    border-radius: 12px;
    padding: 16px;
    min-height: 300px;
  }

  h3 {
    margin: 0 0 12px;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  li {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px;
  }

  .move-buttons {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }

  .move-buttons button {
    font-size: 0.75rem;
    padding: 4px 8px;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    background: white;
    cursor: pointer;
  }
</style>
```

Here is what happens step by step when you click "-> In Progress" on a task in the "To Do" column:

1. Svelte detects that the task was removed from the "To Do" each block. The `out:send` transition fires with `key: task.id`.
2. Svelte detects that the same task appeared in the "In Progress" each block. The `in:receive` transition fires with the same `key`.
3. Because both transitions share the same crossfade pair and the same key, Svelte coordinates them: the card appears to fly from its old position to its new one.
4. Meanwhile, `animate:flip` on the remaining cards in "To Do" smoothly slides them up to fill the gap, and the existing cards in "In Progress" slide down to make room.

The `fallback` function handles the edge case where a task appears without a matching `send` (e.g., a brand-new task) or disappears without a matching `receive` (e.g., a deleted task). Without it, unmatched items would appear/disappear instantly.

## Built-In Transitions for Task Lifecycle

Beyond reordering and cross-column movement, tasks also need enter and exit animations for creation and deletion:

```svelte
<script lang="ts">
  import { fly, fade, slide } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  interface Task {
    id: number;
    title: string;
    description: string;
  }

  let tasks: Task[] = $state([
    { id: 1, title: 'Review PR #42', description: 'Check the auth refactor branch' },
    { id: 2, title: 'Update deps', description: 'Run npm audit and update packages' }
  ]);

  let nextId = 3;
  let expandedId: number | null = $state(null);

  function addTask() {
    tasks = [
      { id: nextId++, title: `New task ${nextId - 1}`, description: 'Add a description...' },
      ...tasks
    ];
  }

  function deleteTask(id: number) {
    tasks = tasks.filter((t) => t.id !== id);
  }

  function toggleExpand(id: number) {
    expandedId = expandedId === id ? null : id;
  }
</script>

<button onclick={addTask}>+ New Task</button>

<ul>
  {#each tasks as task (task.id)}
    <li
      animate:flip={{ duration: 250 }}
      in:fly={{ x: -200, duration: 400 }}
      out:fade={{ duration: 200 }}
    >
      <div class="task-header">
        <button class="expand" onclick={() => toggleExpand(task.id)}>
          {expandedId === task.id ? '−' : '+'}
        </button>
        <span>{task.title}</span>
        <button class="delete" onclick={() => deleteTask(task.id)}>&times;</button>
      </div>

      {#if expandedId === task.id}
        <div class="task-details" transition:slide={{ duration: 200 }}>
          <p>{task.description}</p>
        </div>
      {/if}
    </li>
  {/each}
</ul>
```

Each transition serves a specific purpose:

- **`in:fly={{ x: -200 }}`** — New tasks slide in from the left, drawing the eye to the addition. The `x` parameter means horizontal movement; `y` would be vertical.
- **`out:fade`** — Deleted tasks gently disappear. A sudden removal would be jarring; a fade gives the brain time to register what happened.
- **`transition:slide`** — Expanding task details slides open like an accordion. Using `transition:` (not `in:`/`out:`) means the same animation plays in both directions.

Notice that `in:fly` and `out:fade` use different transitions for enter and exit. This is intentional — the entrance should feel active and directional, while the exit should be quiet and unobtrusive.

## Tween — Smooth Progress Bar

TeamBoard's board header shows a progress bar indicating what percentage of tasks are in the "Done" column. When a task moves, the bar should glide to its new value, not jump:

```svelte
<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  interface Props {
    totalTasks: number;
    doneTasks: number;
  }

  let { totalTasks, doneTasks }: Props = $props();

  const progress = new Tween(0, {
    duration: 600,
    easing: cubicOut
  });

  // Update the tween target whenever doneTasks or totalTasks changes
  $effect(() => {
    const pct = totalTasks > 0 ? (doneTasks / totalTasks) * 100 : 0;
    progress.set(pct);
  });
</script>

<div class="progress-container">
  <div class="progress-bar">
    <div
      class="progress-fill"
      style="width: {progress.current}%"
      role="progressbar"
      aria-valuenow={Math.round(progress.current)}
      aria-valuemin={0}
      aria-valuemax={100}
    ></div>
  </div>
  <span class="progress-label">
    {Math.round(progress.current)}% complete ({doneTasks}/{totalTasks} tasks)
  </span>
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .progress-bar {
    flex: 1;
    height: 8px;
    background: #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: #22c55e;
    border-radius: 4px;
    transition: none; /* The Tween class handles the animation */
  }

  .progress-label {
    font-size: 0.85rem;
    color: #64748b;
    white-space: nowrap;
  }
</style>
```

Why use `Tween` instead of a CSS transition on the width? Two reasons. First, the displayed percentage text (`{Math.round(progress.current)}%`) also animates smoothly — it counts up/down in sync with the bar. You cannot do that with CSS alone. Second, `Tween` gives you full control over easing and duration from JavaScript, which means you can coordinate it with other animations happening simultaneously.

The `$effect` watches for changes to `doneTasks` and `totalTasks` (both are reactive props) and calls `progress.set()` with the new percentage. The `Tween` instance then smoothly interpolates from the current value to the new one over 600ms, and `progress.current` updates reactively on each frame.

## Spring — Physics-Based Drag Preview

When a user drags a task card, a preview element should follow the cursor with a bouncy, physics-based feel. The `Spring` class from `svelte/motion` provides exactly this — instead of following a fixed easing curve, it simulates a physical spring that overshoots and settles:

```svelte
<script lang="ts">
  import { Spring } from 'svelte/motion';

  let isDragging = $state(false);
  let dragData = $state<{ title: string } | null>(null);

  const previewPosition = new Spring(
    { x: 0, y: 0 },
    {
      stiffness: 0.15,
      damping: 0.7
    }
  );

  function handleDragStart(event: CustomEvent) {
    isDragging = true;
    dragData = event.detail.data;

    // Set immediately (no spring) on start to prevent lag
    previewPosition.set(
      { x: event.detail.x, y: event.detail.y },
      { hard: true }
    );
  }

  function handleDragMove(event: CustomEvent) {
    // Spring follows the cursor with bouncy physics
    previewPosition.set({ x: event.detail.x, y: event.detail.y });
  }

  function handleDragEnd() {
    isDragging = false;
    dragData = null;
  }
</script>

<svelte:document
  ondragstart={handleDragStart}
  ondragmove={handleDragMove}
  ondragend={handleDragEnd}
/>

{#if isDragging && dragData}
  <div
    class="drag-preview"
    style="left: {previewPosition.current.x}px; top: {previewPosition.current.y}px"
  >
    {dragData.title}
  </div>
{/if}

<style>
  .drag-preview {
    position: fixed;
    transform: translate(-50%, -50%) rotate(3deg);
    background: white;
    border: 2px solid #6366f1;
    border-radius: 8px;
    padding: 10px 16px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    z-index: 9999;
    font-weight: 500;
  }
</style>
```

The key to making this feel right is the `{ hard: true }` option on the initial `set()`. Without it, the preview would spring from position (0, 0) to the cursor when the drag starts, creating a jarring lag. With `hard: true`, the first position set is instant, and then the spring physics kick in for subsequent movements.

Tuning `stiffness` and `damping`:

| stiffness | damping | Feel |
|-----------|---------|------|
| 0.05 | 0.3 | Slow and floaty — like dragging through honey |
| 0.15 | 0.7 | Responsive with subtle bounce — good default for UI |
| 0.3 | 0.9 | Snappy, barely any overshoot — almost like a tween |
| 0.1 | 0.1 | Very bouncy — fun but potentially distracting |

For a project management tool, you want something that feels responsive but professional — `stiffness: 0.15, damping: 0.7` is a solid starting point.

## Respecting prefers-reduced-motion

Not everyone wants animations. Some users have vestibular disorders where motion triggers nausea or dizziness. Others simply find animations distracting. The `prefers-reduced-motion` media query lets you detect this system preference and respond appropriately.

Svelte provides a built-in `prefersReducedMotion` rune from `svelte/motion` that tracks the user's preference reactively:

```svelte
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';
  import { Tween, prefersReducedMotion } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  // Derive safe animation durations
  let flipDuration = $derived(prefersReducedMotion.current ? 0 : 300);
  let transitionDuration = $derived(prefersReducedMotion.current ? 0 : 400);

  // Even the Tween instance respects the preference
  const progress = new Tween(0, {
    duration: prefersReducedMotion.current ? 0 : 600,
    easing: cubicOut
  });
</script>
```

Setting `duration: 0` effectively disables the animation — the element still enters/exits the DOM, but the visual transition is instant. This is better than conditionally removing the `transition:` directive because it keeps your template logic simple.

You can extract this into a reusable utility that wraps the built-in `prefersReducedMotion`:

```typescript
// src/lib/state/motion.svelte.ts
import { prefersReducedMotion } from 'svelte/motion';

export function createMotionPreference() {
  return {
    get reduced() { return prefersReducedMotion.current; },
    duration(ms: number) { return prefersReducedMotion.current ? 0 : ms; }
  };
}
```

Then use it across your board components:

```svelte
<script lang="ts">
  import { createMotionPreference } from '$state/motion.svelte';
  const motion = createMotionPreference();
</script>

<li animate:flip={{ duration: motion.duration(300) }}>...</li>
```

## Complete Column Component

Here is a full `BoardColumn` component that brings together flip, crossfade, transitions, and reduced motion handling:

```svelte
<!-- src/lib/components/board/BoardColumn.svelte -->
<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, fade } from 'svelte/transition';
  import { createMotionPreference } from '$state/motion.svelte';
  import type { Task, Column } from '$lib/types/board';

  interface Props {
    column: Column;
    send: (node: Element, params: { key: number }) => any;
    receive: (node: Element, params: { key: number }) => any;
    onmove: (taskId: number, toColumnId: string) => void;
    oncreate: (columnId: string, title: string) => void;
    ondelete: (taskId: number) => void;
  }

  let { column, send, receive, onmove, oncreate, ondelete }: Props = $props();

  const motion = createMotionPreference();

  let isAddingTask = $state(false);
  let newTaskTitle = $state('');

  function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    oncreate(column.id, newTaskTitle.trim());
    newTaskTitle = '';
    isAddingTask = false;
  }
</script>

<div class="column" role="region" aria-label="{column.name} column">
  <div class="column-header">
    <h3>
      <span class="color-dot" style="background: {column.color}"></span>
      {column.name}
      <span class="count">{column.tasks.length}</span>
    </h3>
  </div>

  <ul class="task-list" role="list">
    {#each column.tasks as task (task.id)}
      <li
        animate:flip={{ duration: motion.duration(300) }}
        in:receive={{ key: task.id }}
        out:send={{ key: task.id }}
        class="task-card"
      >
        <div class="task-content">
          <span class="priority-dot {task.priority}"></span>
          <span class="task-title">{task.title}</span>
        </div>

        {#if task.assignee}
          <span class="assignee">{task.assignee.initials}</span>
        {/if}

        <button
          class="delete-btn"
          onclick={() => ondelete(task.id)}
          aria-label="Delete {task.title}"
        >
          &times;
        </button>
      </li>
    {/each}
  </ul>

  {#if isAddingTask}
    <div class="add-form" transition:slide={{ duration: motion.duration(200) }}>
      <input
        type="text"
        bind:value={newTaskTitle}
        placeholder="Task title..."
        onkeydown={(e) => e.key === 'Enter' && handleAddTask()}
      />
      <div class="form-actions">
        <button onclick={handleAddTask}>Add</button>
        <button onclick={() => isAddingTask = false}>Cancel</button>
      </div>
    </div>
  {/if}

  <button class="add-task-btn" onclick={() => isAddingTask = true}>
    + Add Task
  </button>
</div>

<style>
  .column {
    flex: 1;
    min-width: 280px;
    max-width: 360px;
    background: #f1f5f9;
    border-radius: 12px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }

  .column-header h3 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 0.85rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
  }

  .color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }

  .count {
    background: #cbd5e1;
    color: #475569;
    padding: 1px 8px;
    border-radius: 10px;
    font-size: 0.75rem;
    margin-left: auto;
  }

  .task-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
  }

  .task-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: grab;
  }

  .task-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .task-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.9rem;
  }

  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .priority-dot.urgent { background: #ef4444; }
  .priority-dot.high { background: #f97316; }
  .priority-dot.medium { background: #eab308; }
  .priority-dot.low { background: #22c55e; }

  .assignee {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #6366f1;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .delete-btn {
    border: none;
    background: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 1.1rem;
    line-height: 1;
  }

  .delete-btn:hover {
    background: #fee2e2;
    color: #ef4444;
  }

  .add-form {
    padding: 8px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    margin-top: 8px;
  }

  .add-form input {
    width: 100%;
    padding: 8px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    margin-bottom: 8px;
    font-size: 0.9rem;
  }

  .form-actions {
    display: flex;
    gap: 6px;
  }

  .form-actions button {
    padding: 6px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .form-actions button:first-child {
    background: #6366f1;
    color: white;
    border-color: #6366f1;
  }

  .add-task-btn {
    margin-top: 8px;
    width: 100%;
    padding: 8px;
    border: 1px dashed #cbd5e1;
    border-radius: 8px;
    background: transparent;
    color: #64748b;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .add-task-btn:hover {
    background: #e2e8f0;
  }
</style>
```

And the parent `Board` component that creates the crossfade pair and passes `send`/`receive` down to each column:

```svelte
<!-- src/lib/components/board/Board.svelte -->
<script lang="ts">
  import { crossfade } from 'svelte/transition';
  import { quintOut } from 'svelte/easing';
  import BoardColumn from './BoardColumn.svelte';
  import type { Column } from '$lib/types/board';

  interface Props {
    columns: Column[];
  }

  let { columns = $bindable() }: Props = $props();

  const [send, receive] = crossfade({
    duration: 400,
    easing: quintOut,
    fallback(node) {
      const style = getComputedStyle(node);
      const opacity = +style.opacity;
      return {
        duration: 200,
        css: (t: number) => `opacity: ${t * opacity}`
      };
    }
  });

  function moveTask(taskId: number, toColumnId: string) {
    // ... same move logic as earlier
  }

  function createTask(columnId: string, title: string) {
    // ... add task to the column
  }

  function deleteTask(taskId: number) {
    // ... remove task from its column
  }
</script>

<div class="board">
  {#each columns as column (column.id)}
    <BoardColumn
      {column}
      {send}
      {receive}
      onmove={moveTask}
      oncreate={createTask}
      ondelete={deleteTask}
    />
  {/each}
</div>

<style>
  .board {
    display: flex;
    gap: 16px;
    padding: 16px;
    overflow-x: auto;
    align-items: flex-start;
  }
</style>
```

The crossfade pair is created once in the parent and passed to all child columns. This is essential — if each column created its own crossfade pair, the `send` from column A would not be able to match with the `receive` from column B. They must share the same crossfade instance.

## Try It

Build an animated notification toast system for TeamBoard:

1. Create a `ToastContainer.svelte` component that renders a list of toast notifications.
2. New toasts should fly in from the right with `in:fly={{ x: 300, duration: 300 }}`.
3. Dismissed toasts should fade out with `out:fade={{ duration: 200 }}`.
4. When a toast is dismissed and removed from the middle of the list, remaining toasts should smoothly slide to fill the gap using `animate:flip`.
5. Add a `Tween` progress bar on each toast that counts down from 100% to 0% over the toast's duration (e.g., 5 seconds), then auto-dismisses.
6. Wrap all animation durations with a `prefers-reduced-motion` check using the `createMotionPreference` utility from this lesson.

## Key Takeaways

- `animate:flip` from `svelte/animate` smoothly animates elements to new positions when a keyed `{#each}` block reorders — it requires a key expression like `(item.id)`
- `crossfade` from `svelte/transition` creates matched `send`/`receive` transitions for elements moving between different `{#each}` blocks — the pair must be created once and shared across all containers
- Use `in:fly` for directional entrances, `out:fade` for quiet exits, and `transition:slide` for expand/collapse — mixing different enter and exit transitions gives each action a distinct visual character
- `Tween` from `svelte/motion` smoothly interpolates numeric values over time — ideal for progress bars and counters where both the visual and the displayed number should animate; access the interpolated value via `.current`
- `Spring` from `svelte/motion` uses physics simulation with `stiffness` and `damping` — perfect for drag previews that should feel tactile and responsive; access the interpolated value via `.current`
- Always respect `prefers-reduced-motion` by using the built-in `prefersReducedMotion` from `svelte/motion` and setting animation durations to 0 — extract this into a reusable utility so every component stays consistent
- Create the crossfade pair in the parent component and pass `send`/`receive` as props to child components — they must share the same instance to coordinate animations across containers
