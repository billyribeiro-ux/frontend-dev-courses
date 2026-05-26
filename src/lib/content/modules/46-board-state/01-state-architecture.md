# Board State Architecture with Advanced Runes

TeamBoard's Kanban board is the heart of the application. Users drag tasks between columns, filter by assignee, track sprint velocity, and save board layouts — all in real time. This lesson builds the core board state module using every `$state` variant and `$derived.by` for complex computed values. By the end, you will have a single `board.svelte.ts` file that manages the entire board's reactive data.

## Planning the State

Before writing code, map out what kind of data the board manages and how each piece is used:

```
Active board columns and tasks
  - Mutated constantly during drag-and-drop (reordering, moving between columns)
  - Nested objects: columns contain arrays of tasks, tasks have assignees and labels
  - Needs deep reactivity so drag handlers can mutate in place

Full project task list from API
  - Large dataset (hundreds or thousands of tasks across all boards)
  - Replaced wholesale on fetch, never mutated field-by-field
  - Read-only reference for search, filtering, cross-board linking

Serialized snapshots
  - Sent as command payloads to the server
  - Saved to localStorage for offline recovery
  - Logged to console during development

Computed statistics
  - Task counts per column (simple aggregation)
  - Overdue tasks (date comparison with filtering)
  - Sprint velocity (multi-step calculation with history)
```

Each category maps to a different state primitive. That mapping is the architecture.

### The Architecture Decision Framework

The question is never "should I use $state?" — it is "which *variant* of state management fits this data's lifecycle?" Here is the decision tree:

```
Does the data change after initialization?
  ├── No → const or let (plain variable)
  └── Yes → Does the UI need to react to changes?
        ├── No → let (plain variable, mutated for internal bookkeeping)
        └── Yes → Is the data mutated in place or replaced wholesale?
              ├── Mutated in place → $state() (deep proxy)
              └── Replaced wholesale → $state.raw() (no proxy overhead)
```

Every piece of data should pass through this tree. The wrong choice is not catastrophic — your app will still work — but it leads to either wasted proxy overhead (using `$state()` for data you never mutate) or missed reactive updates (using `$state.raw()` for data you mutate in place).

## Deep Reactivity with $state()

The active board data — columns and their tasks — needs deep reactivity. During a drag-and-drop operation, the code mutates a task's `columnId`, splices it out of one array, and inserts it into another. With `$state()`, every nested mutation triggers a UI update automatically:

```typescript
// src/lib/state/board.svelte.ts

import type { Column, Task, BoardMember } from '$lib/types/board';

// ── Active board state (deep reactivity) ──────────────────────
// These are mutated directly during drag-and-drop, inline editing,
// and real-time collaboration updates.

let columns = $state<Column[]>([]);
let activeTask = $state<Task | null>(null);
let boardMembers = $state<BoardMember[]>([]);
```

Deep reactivity means you can write mutation code that reads naturally:

```typescript
function moveTask(taskId: number, fromColumnId: number, toColumnId: number, newPosition: number) {
  const fromColumn = columns.find(c => c.id === fromColumnId);
  const toColumn = columns.find(c => c.id === toColumnId);
  if (!fromColumn || !toColumn) return;

  // Find and remove the task from its current column
  const taskIndex = fromColumn.tasks.findIndex(t => t.id === taskId);
  if (taskIndex === -1) return;
  const [task] = fromColumn.tasks.splice(taskIndex, 1);

  // Update the task's column reference
  task.columnId = toColumnId;

  // Insert at the new position
  toColumn.tasks.splice(newPosition, 0, task);

  // Update positions for all affected tasks
  fromColumn.tasks.forEach((t, i) => t.position = i);
  toColumn.tasks.forEach((t, i) => t.position = i);
}
```

Every line here — `splice`, direct property assignment, `forEach` with mutation — triggers reactive updates because `$state()` wraps the entire nested structure in proxies. The template re-renders the affected columns without you calling any update function.

### WRONG vs CORRECT: Mutation with Deep Reactivity

```typescript
// WRONG — unnecessary immutable pattern with $state()
// This creates new arrays and objects on every move,
// causing ALL column components to re-render (not just affected ones)
function moveTask(taskId: number, fromId: number, toId: number, pos: number) {
  columns = columns.map(col => {
    if (col.id === fromId) {
      return { ...col, tasks: col.tasks.filter(t => t.id !== taskId) };
    }
    if (col.id === toId) {
      const task = columns.find(c => c.id === fromId)?.tasks.find(t => t.id === taskId);
      if (!task) return col;
      const newTasks = [...col.tasks];
      newTasks.splice(pos, 0, { ...task, columnId: toId });
      return { ...col, tasks: newTasks };
    }
    return col;
  });
}
// This reassigns `columns` entirely, so Svelte must diff the whole structure.
// Deep proxying already tracks nested mutations — use it.

// CORRECT — direct mutation with $state()
function moveTask(taskId: number, fromId: number, toId: number, pos: number) {
  const from = columns.find(c => c.id === fromId);
  const to = columns.find(c => c.id === toId);
  if (!from || !to) return;

  const idx = from.tasks.findIndex(t => t.id === taskId);
  if (idx === -1) return;
  const [task] = from.tasks.splice(idx, 1);
  task.columnId = toId;
  to.tasks.splice(pos, 0, task);
}
// Svelte tracks the splice and property assignment through the proxy.
// Only the affected columns re-render.
```

Compare this to what you would need without deep reactivity: creating new arrays, spreading objects, and reassigning at every level. Deep reactivity eliminates that boilerplate for interactive state.

## Immutable Data with $state.raw()

The full project task list is a different story. When the user opens the board, the app fetches all tasks for the project from the API. This list can contain hundreds of items. It is used for the search panel, cross-board references, and analytics — but it is never mutated in place. When new data arrives, the entire list is replaced.

For this kind of data, `$state.raw()` avoids the overhead of wrapping every nested property in a proxy:

```typescript
// ── Project-wide data (immutable-style) ──────────────────────
// Large dataset replaced on fetch. Never mutated field-by-field.
// $state.raw() avoids proxy overhead for hundreds of task objects.

let allProjectTasks = $state.raw<Task[]>([]);
let projectLabels = $state.raw<{ id: number; name: string; color: string }[]>([]);

async function fetchProjectTasks(projectId: number) {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  const data: Task[] = await response.json();

  // Full reassignment — this triggers reactivity
  allProjectTasks = data;
}

async function fetchLabels(projectId: number) {
  const response = await fetch(`/api/projects/${projectId}/labels`);
  projectLabels = await response.json();
}
```

The performance difference matters. If the API returns 500 task objects, each with 10 properties, `$state()` would create proxies for 5,000+ property accessors. `$state.raw()` stores the plain objects directly — faster to create, less memory, no proxy overhead on property access.

The tradeoff is clear: you cannot mutate `allProjectTasks[0].title = 'New Title'` and expect the UI to update. You must always reassign:

```typescript
// WRONG — mutation does not trigger updates with $state.raw()
allProjectTasks[0].title = 'New Title';
// The UI still shows the old title. The proxy is not there to intercept this.

// CORRECT — create a new array to trigger reactivity
function updateTaskInProjectList(taskId: number, updates: Partial<Task>) {
  allProjectTasks = allProjectTasks.map(task =>
    task.id === taskId ? { ...task, ...updates } : task
  );
}

// ALSO CORRECT — reassign the entire variable
allProjectTasks = [...allProjectTasks];  // Triggers reactivity even without changes
```

### Measuring the Proxy Overhead

For small state (10 items, 5 properties each), the overhead of `$state()` vs `$state.raw()` is negligible — microseconds. Do not optimize prematurely. But here is when to consider `$state.raw()`:

| Dataset Size | Properties per Object | Use `$state.raw()`? |
|-------------|----------------------|---------------------|
| < 50 items | Any | No — use `$state()` for convenience |
| 50-200 items | < 5 | Probably not — still manageable |
| 50-200 items | 10+ | Yes — proxy count gets into thousands |
| 200+ items | Any | Yes — always use raw for large datasets |
| Any size | Never mutated in place | Yes — raw is semantically correct |

The semantic argument is as important as the performance argument. Using `$state.raw()` communicates intent: "this data is replaced, not mutated." Future developers reading your code know not to write `allProjectTasks[0].title = 'foo'`.

## Plain Variables for Non-Reactive Data

Not everything needs reactivity. Configuration values, constants, and references that never change after initialization should be plain variables:

```typescript
// ── Non-reactive values ──────────────────────────────────────
// These never change after initialization. No reactivity needed.

let boardId: number | null = null;
let projectId: number | null = null;
const MAX_COLUMNS = 12;
const TASK_POSITION_GAP = 1000; // Gap between task positions for easy reordering
const COLUMN_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'];
```

Using `$state()` or `$state.raw()` for constants wastes resources. Svelte would track reads and prepare for updates that never come. Plain `let` or `const` is the right tool when the value is set once and read many times.

### When `boardId` Changes — A Subtle Case

You might wonder: `boardId` is set during initialization and could be "changed" if the user navigates to a different board. Should it be reactive?

No. When the user navigates to a different board, the entire board layout component is destroyed and recreated. The new component instance calls `initialize()` with a new `boardId`. There is no in-place update of `boardId` — the component lifecycle handles it. Making `boardId` reactive would suggest that the board layout survives navigation, which it does not.

This is an architectural insight: not every "change" requires reactivity. Reactivity is for changes that happen *within* a component's lifetime. Changes that cause the component to be recreated are handled by the component lifecycle.

## Snapshots for Serialization

When the user performs an action — moving a task, editing a title, reordering columns — you need to send the current state to the server. Reactive proxies cannot be serialized directly. `$state.snapshot()` produces a plain JavaScript object that `JSON.stringify`, `fetch`, and `localStorage` can consume:

```typescript
function getColumnSnapshot() {
  return $state.snapshot(columns);
}

function saveToLocalStorage() {
  const snapshot = $state.snapshot(columns);
  localStorage.setItem(`board-${boardId}`, JSON.stringify(snapshot));
}

function sendMoveCommand(taskId: number, toColumnId: number, position: number) {
  const snapshot = $state.snapshot(columns);

  fetch('/api/commands/move-task', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      taskId,
      toColumnId,
      position,
      boardState: snapshot
    })
  });
}

function logBoardState() {
  // Without snapshot: console shows Proxy {} — unreadable
  // With snapshot: console shows the actual data structure
  console.log('Board state:', $state.snapshot(columns));
  console.log('Active task:', $state.snapshot(activeTask));
}
```

The snapshot is a deep clone. Mutating the snapshot does not affect the reactive state, and future state changes do not affect the snapshot. This makes it safe to pass to asynchronous operations.

### WRONG vs CORRECT: Serialization Boundary

```typescript
// WRONG — passing reactive proxy to JSON.stringify
async function saveBoard() {
  await fetch('/api/boards/save', {
    method: 'POST',
    body: JSON.stringify(columns)  // columns is a reactive Proxy
    // JSON.stringify CAN handle proxies in many cases, but:
    // 1. You get no guarantee about internal proxy metadata
    // 2. If the state changes during async serialization, you get inconsistent data
    // 3. Console debugging shows Proxy {} — unreadable
  });
}

// CORRECT — snapshot before serialization
async function saveBoard() {
  const snapshot = $state.snapshot(columns);
  // snapshot is a plain object — safe to serialize, won't change during async ops
  await fetch('/api/boards/save', {
    method: 'POST',
    body: JSON.stringify(snapshot)
  });
}
```

## Complex Derived Values with $derived.by()

Simple derivations use `$derived()` with an inline expression. But board statistics require multiple steps — loops, conditionals, intermediate variables. `$derived.by()` accepts a function body where you can write as much logic as needed:

```typescript
// ── Computed values ──────────────────────────────────────────

// Task counts per column — used in column headers
const columnTaskCounts = $derived.by(() => {
  const counts: Record<number, number> = {};
  for (const column of columns) {
    counts[column.id] = column.tasks.length;
  }
  return counts;
});

// Overdue tasks — shown in a warning badge
const overdueTasks = $derived.by(() => {
  const now = new Date();
  const overdue: Task[] = [];

  for (const column of columns) {
    // Skip "Done" columns — completed tasks are not overdue
    if (column.name.toLowerCase() === 'done') continue;

    for (const task of column.tasks) {
      if (task.dueDate && new Date(task.dueDate) < now) {
        overdue.push(task);
      }
    }
  }

  // Sort by how overdue they are (most overdue first)
  overdue.sort((a, b) => {
    const aDate = new Date(a.dueDate!).getTime();
    const bDate = new Date(b.dueDate!).getTime();
    return aDate - bDate;
  });

  return overdue;
});

// Sprint velocity — requires multi-step calculation
const sprintVelocity = $derived.by(() => {
  // Count completed tasks in the "Done" column
  const doneColumn = columns.find(c => c.name.toLowerCase() === 'done');
  if (!doneColumn) return { completed: 0, rate: 0, trend: 'stable' as const };

  const completed = doneColumn.tasks.length;

  // Calculate tasks completed in the last 7 days
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const recentlyCompleted = doneColumn.tasks.filter(
    t => t.updatedAt && new Date(t.updatedAt) > oneWeekAgo
  ).length;

  // Calculate tasks completed in the prior 7 days for trend
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const previousWeekCompleted = doneColumn.tasks.filter(
    t => t.updatedAt
      && new Date(t.updatedAt) > twoWeeksAgo
      && new Date(t.updatedAt) <= oneWeekAgo
  ).length;

  // Determine trend direction
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (recentlyCompleted > previousWeekCompleted * 1.2) trend = 'up';
  else if (recentlyCompleted < previousWeekCompleted * 0.8) trend = 'down';

  return {
    completed,
    rate: recentlyCompleted,
    trend
  };
});
```

Each `$derived.by()` automatically tracks every piece of reactive state it reads. When a task is moved to the "Done" column, `sprintVelocity` recalculates. When a task's due date passes, `overdueTasks` updates. You never manually declare dependencies — Svelte figures it out from the code you write.

### Performance Consideration: Expensive Derivations

`$derived.by()` runs synchronously every time a dependency changes. If the derivation is expensive and changes frequently, this can cause jank:

```typescript
// POTENTIALLY EXPENSIVE — recalculates on every task move
const analytics = $derived.by(() => {
  // O(n * m) computation over all tasks and members
  const memberStats: Record<number, { assigned: number; completed: number }> = {};

  for (const member of boardMembers) {
    memberStats[member.id] = { assigned: 0, completed: 0 };
    for (const column of columns) {
      for (const task of column.tasks) {
        if (task.assigneeId === member.id) {
          memberStats[member.id].assigned++;
          if (column.name.toLowerCase() === 'done') {
            memberStats[member.id].completed++;
          }
        }
      }
    }
  }

  return memberStats;
});
```

If this runs on every drag-and-drop move (many times per second), it could be slow. Solutions:
1. Separate the drag state from the analytics dependency
2. Use a debounced `$effect` that writes to a `$state` variable instead of `$derived`
3. Move the computation to a web worker

For most board sizes (< 200 tasks), this is not a problem. Profile before optimizing.

## The Complete Module

Here is the full `board.svelte.ts` with exported getters and methods. The module pattern uses closures to keep state private and exposes a clean API through a single exported function:

```typescript
// src/lib/state/board.svelte.ts

import type { Column, Task, BoardMember, Label } from '$lib/types/board';

export function createBoardState() {
  // ── Deep reactive state (mutated during interactions) ──────
  let columns = $state<Column[]>([]);
  let activeTask = $state<Task | null>(null);
  let boardMembers = $state<BoardMember[]>([]);
  let draggedTaskId = $state<number | null>(null);

  // ── Raw state (large datasets, replaced on fetch) ──────────
  let allProjectTasks = $state.raw<Task[]>([]);
  let projectLabels = $state.raw<Label[]>([]);

  // ── Non-reactive configuration ─────────────────────────────
  let boardId: number | null = null;
  let projectId: number | null = null;

  // ── Derived values ─────────────────────────────────────────
  const totalTasks = $derived(columns.reduce((sum, col) => sum + col.tasks.length, 0));

  const columnTaskCounts = $derived.by(() => {
    const counts: Record<number, number> = {};
    for (const column of columns) {
      counts[column.id] = column.tasks.length;
    }
    return counts;
  });

  const overdueTasks = $derived.by(() => {
    const now = new Date();
    const overdue: Task[] = [];

    for (const column of columns) {
      if (column.name.toLowerCase() === 'done') continue;
      for (const task of column.tasks) {
        if (task.dueDate && new Date(task.dueDate) < now) {
          overdue.push(task);
        }
      }
    }

    return overdue.sort((a, b) =>
      new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime()
    );
  });

  const sprintVelocity = $derived.by(() => {
    const doneColumn = columns.find(c => c.name.toLowerCase() === 'done');
    if (!doneColumn) return { completed: 0, rate: 0, trend: 'stable' as const };

    const completed = doneColumn.tasks.length;
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    const recentlyCompleted = doneColumn.tasks.filter(
      t => t.updatedAt && new Date(t.updatedAt) > oneWeekAgo
    ).length;

    const previousWeekCompleted = doneColumn.tasks.filter(
      t => t.updatedAt
        && new Date(t.updatedAt) > twoWeeksAgo
        && new Date(t.updatedAt) <= oneWeekAgo
    ).length;

    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (recentlyCompleted > previousWeekCompleted * 1.2) trend = 'up';
    else if (recentlyCompleted < previousWeekCompleted * 0.8) trend = 'down';

    return { completed, rate: recentlyCompleted, trend };
  });

  // ── Filtered views (derived from columns + filter state) ──
  let filterAssignee = $state<number | null>(null);
  let filterPriority = $state<string | null>(null);
  let searchQuery = $state('');

  const filteredColumns = $derived.by(() => {
    if (!filterAssignee && !filterPriority && !searchQuery) {
      return columns;
    }

    return columns.map(col => ({
      ...col,
      tasks: col.tasks.filter(task => {
        if (filterAssignee && task.assigneeId !== filterAssignee) return false;
        if (filterPriority && task.priority !== filterPriority) return false;
        if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
      })
    }));
  });

  // ── Actions ────────────────────────────────────────────────
  function initialize(id: number, project: number, cols: Column[], members: BoardMember[]) {
    boardId = id;
    projectId = project;
    columns = cols;
    boardMembers = members;
  }

  function moveTask(taskId: number, fromColumnId: number, toColumnId: number, position: number) {
    const fromColumn = columns.find(c => c.id === fromColumnId);
    const toColumn = columns.find(c => c.id === toColumnId);
    if (!fromColumn || !toColumn) return;

    const taskIndex = fromColumn.tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    const [task] = fromColumn.tasks.splice(taskIndex, 1);

    task.columnId = toColumnId;
    toColumn.tasks.splice(position, 0, task);

    fromColumn.tasks.forEach((t, i) => t.position = i);
    toColumn.tasks.forEach((t, i) => t.position = i);
  }

  function addTask(columnId: number, task: Task) {
    const column = columns.find(c => c.id === columnId);
    if (!column) return;
    task.position = column.tasks.length;
    column.tasks.push(task);
  }

  function updateTask(taskId: number, updates: Partial<Task>) {
    for (const column of columns) {
      const task = column.tasks.find(t => t.id === taskId);
      if (task) {
        Object.assign(task, updates);
        break;
      }
    }
  }

  function removeTask(taskId: number) {
    for (const column of columns) {
      const index = column.tasks.findIndex(t => t.id === taskId);
      if (index !== -1) {
        column.tasks.splice(index, 1);
        column.tasks.forEach((t, i) => t.position = i);
        break;
      }
    }
  }

  function addColumn(column: Column) {
    column.position = columns.length;
    columns.push(column);
  }

  function reorderColumns(fromIndex: number, toIndex: number) {
    const [column] = columns.splice(fromIndex, 1);
    columns.splice(toIndex, 0, column);
    columns.forEach((c, i) => c.position = i);
  }

  function setActiveTask(task: Task | null) {
    activeTask = task;
  }

  function setDraggedTask(taskId: number | null) {
    draggedTaskId = taskId;
  }

  function setFilter(assignee: number | null, priority: string | null, search: string) {
    filterAssignee = assignee;
    filterPriority = priority;
    searchQuery = search;
  }

  async function refreshProjectTasks() {
    if (!projectId) return;
    const response = await fetch(`/api/projects/${projectId}/tasks`);
    allProjectTasks = await response.json();
  }

  function getSnapshot() {
    return {
      columns: $state.snapshot(columns),
      activeTask: $state.snapshot(activeTask),
      boardId,
      projectId
    };
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    // Getters (reactive reads)
    get columns() { return columns; },
    get filteredColumns() { return filteredColumns; },
    get activeTask() { return activeTask; },
    get boardMembers() { return boardMembers; },
    get draggedTaskId() { return draggedTaskId; },
    get allProjectTasks() { return allProjectTasks; },
    get projectLabels() { return projectLabels; },
    get totalTasks() { return totalTasks; },
    get columnTaskCounts() { return columnTaskCounts; },
    get overdueTasks() { return overdueTasks; },
    get sprintVelocity() { return sprintVelocity; },
    get filterAssignee() { return filterAssignee; },
    get filterPriority() { return filterPriority; },
    get searchQuery() { return searchQuery; },

    // Actions
    initialize,
    moveTask,
    addTask,
    updateTask,
    removeTask,
    addColumn,
    reorderColumns,
    setActiveTask,
    setDraggedTask,
    setFilter,
    refreshProjectTasks,
    getSnapshot
  };
}
```

### Why Getters Are Required for Reactive Reads

The `return` block uses getters for reactive values. When a component reads `board.columns`, the getter calls `return columns`, which reads the `$state` proxy and establishes a reactive dependency. Without getters, the component would receive the initial value and never update.

```typescript
// WRONG — returning the value directly
return {
  columns: columns,  // This captures the INITIAL value of columns
  // When columns changes later, board.columns still returns the old array
};

// CORRECT — returning through a getter
return {
  get columns() { return columns; },
  // Each time board.columns is read, the getter runs,
  // reading the reactive proxy and establishing a dependency
};
```

This is a critical pattern for `.svelte.ts` modules. Forgetting the getter is the most common bug when building state modules — the state updates internally but consumers never see the new value.

## When to Use Each State Variant

Here is the decision guide for TeamBoard and any application like it:

| Data | Variant | Reason |
|------|---------|--------|
| Board columns and tasks | `$state()` | Mutated constantly during drag-and-drop. Deep reactivity eliminates manual immutable updates. |
| Active task being edited | `$state()` | Properties changed directly through form bindings. |
| Drag state (dragged task ID) | `$state()` | Changes rapidly during drag gestures. Simple primitive. |
| Filter state | `$state()` | Changed by user interaction, needs to trigger derived recomputation. |
| Full project task list | `$state.raw()` | Hundreds of objects, replaced on every API fetch, never mutated in place. |
| Project labels | `$state.raw()` | Read-only reference data. Replaced when labels are updated server-side. |
| Board ID, project ID | Plain variable | Set once during initialization, never triggers UI updates. |
| Constants (max columns, position gap) | `const` | Never changes. No reactivity needed. |
| Column task counts | `$derived.by()` | Computed from columns, auto-updates when tasks move. |
| Overdue tasks | `$derived.by()` | Filtered view of columns, auto-updates when tasks change. |
| Sprint velocity | `$derived.by()` | Multi-step computation over completed tasks. |
| Serialized board state | `$state.snapshot()` | Needed for fetch body, localStorage, console logging — anywhere data leaves the reactive boundary. |

The pattern generalizes: use `$state()` for data that is mutated interactively, `$state.raw()` for large data that is replaced wholesale, plain variables for configuration, `$derived`/`$derived.by()` for computed views, and `$state.snapshot()` at the boundary where reactive data meets the outside world.

## Testing the State Module

One benefit of the module pattern is testability. The `createBoardState()` function is a plain function that returns an object — no component rendering required for unit tests:

```typescript
// src/lib/state/board.test.ts
import { describe, it, expect } from 'vitest';
import { createBoardState } from './board.svelte';

describe('board state', () => {
  it('moves a task between columns', () => {
    const board = createBoardState();
    board.initialize(1, 1, [
      { id: 1, name: 'To Do', position: 0, boardId: 1, tasks: [
        { id: 10, title: 'Task A', columnId: 1, position: 0 }
      ]},
      { id: 2, name: 'Done', position: 1, boardId: 1, tasks: [] }
    ], []);

    board.moveTask(10, 1, 2, 0);

    expect(board.columns[0].tasks).toHaveLength(0);
    expect(board.columns[1].tasks).toHaveLength(1);
    expect(board.columns[1].tasks[0].columnId).toBe(2);
  });

  it('computes overdue tasks correctly', () => {
    const board = createBoardState();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    board.initialize(1, 1, [
      { id: 1, name: 'To Do', position: 0, boardId: 1, tasks: [
        { id: 10, title: 'Overdue', columnId: 1, position: 0, dueDate: yesterday.toISOString() },
        { id: 11, title: 'No due date', columnId: 1, position: 1, dueDate: null }
      ]},
      { id: 2, name: 'Done', position: 1, boardId: 1, tasks: [
        { id: 12, title: 'Done & overdue', columnId: 2, position: 0, dueDate: yesterday.toISOString() }
      ]}
    ], []);

    // Only task 10 is overdue — task 12 is in "Done" so it is excluded
    expect(board.overdueTasks).toHaveLength(1);
    expect(board.overdueTasks[0].id).toBe(10);
  });
});
```

## Try It

Build a simplified version of the board state module:

1. Create a `board.svelte.ts` file with `$state()` for two columns ("To Do" and "Done"), each containing an array of task objects with `id`, `title`, `priority`, and `dueDate` fields.
2. Add a `$state.raw()` variable for a mock "all tasks" list with at least 10 tasks. Write a function that replaces this list (simulating an API fetch).
3. Write a `moveTask` function that splices a task from one column and inserts it into another. Verify that the UI updates after the splice.
4. Add a `$derived.by()` that computes the number of high-priority tasks in each column, returning a `Record<string, number>`.
5. Add a second `$derived.by()` that filters overdue tasks across all columns and sorts them by due date.
6. Add filter state (`$state`) for assignee and priority. Add a `filteredColumns` derived value that applies the filters.
7. Add a `getSnapshot()` function that returns a `$state.snapshot()` of the columns. Log it to the console and verify it is a plain object, not a proxy.
8. Build a simple Svelte component that imports the module, displays the columns and task counts, and has buttons to move tasks and log the snapshot.
9. Write at least two unit tests using Vitest: one for `moveTask` and one for the overdue tasks derivation.

## Key Takeaways

- Use `$state()` for interactive data that is mutated in place — drag-and-drop, inline editing, real-time updates all benefit from deep reactivity
- Use `$state.raw()` for large, read-only datasets that are replaced wholesale on fetch — it avoids proxy overhead for hundreds of objects
- Use `$state.snapshot()` whenever reactive data leaves the Svelte boundary — serialization, fetch payloads, localStorage, console logging
- Use plain `let` or `const` for configuration and constants that never trigger UI updates
- `$derived.by()` handles multi-step computed values with loops, conditionals, and intermediate variables — Svelte tracks dependencies automatically
- Export getters from `.svelte.ts` modules so consumers establish reactive dependencies when they read values — forgetting the getter is the most common module bug
- The module pattern (closure with returned API) keeps state private and exposes a clean, testable interface
- Choose state variants based on the data's lifecycle: mutated in place vs replaced wholesale vs never changes
- Direct mutation with `$state()` is both more readable and more performant than unnecessary immutable patterns — the proxy already tracks mutations
- State modules are plain functions — unit test them without rendering components
