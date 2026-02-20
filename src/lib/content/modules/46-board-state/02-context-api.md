# Context API for Component Trees

TeamBoard's board page has a deep component tree. The `BoardLayout` contains `Column` components, which contain `TaskCard` components, which open `TaskDetail` modals. Every level needs access to the board state, the current user's permissions, the theme, and the notification system. Passing all of this through props at every level would be exhausting and fragile. Context solves this by providing data once at the top and making it available to every descendant.

This lesson builds three context systems for TeamBoard — board state, theme, and notifications — using typed Symbol keys, reactive getters, and the full Context API including `hasContext` and `getAllContexts`.

## Why Context for TeamBoard

Consider the component tree for a board page:

```
BoardLayout
  ├── BoardHeader
  │     ├── BoardTitle
  │     ├── MemberAvatars
  │     └── FilterBar
  ├── ColumnList
  │     ├── Column (To Do)
  │     │     ├── ColumnHeader
  │     │     ├── TaskCard
  │     │     ├── TaskCard
  │     │     └── AddTaskButton
  │     ├── Column (In Progress)
  │     │     ├── ColumnHeader
  │     │     └── TaskCard
  │     └── Column (Done)
  │           ├── ColumnHeader
  │           └── TaskCard
  ├── TaskDetailModal (portal)
  │     ├── TaskForm
  │     ├── CommentList
  │     └── ActivityLog
  └── NotificationToast
```

`TaskCard` needs the board state to handle drag-and-drop. `ColumnHeader` needs it for task counts. `AddTaskButton` needs user permissions to know if the current user can create tasks. `TaskDetailModal` needs all of the above plus the notification context for success toasts. Without context, you would thread these through 4-5 levels of props.

## Board Context with Typed Symbol Keys

String keys are fragile — a typo returns `undefined` silently, and two libraries could collide on the same string. Symbol keys are unique by definition. Wrapping them in typed helper functions gives you compile-time safety:

```typescript
// src/lib/context/board.ts
import { setContext, getContext } from 'svelte';
import type { createBoardState } from '$lib/state/board.svelte';

// The Symbol ensures no other context can accidentally collide
const BOARD_KEY = Symbol('board-context');

// The type represents the return value of createBoardState()
type BoardState = ReturnType<typeof createBoardState>;

export function setBoardContext(state: BoardState) {
  setContext(BOARD_KEY, state);
}

export function getBoardContext(): BoardState {
  return getContext<BoardState>(BOARD_KEY);
}
```

The parent layout creates the board state and provides it:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+layout.svelte -->
<script lang="ts">
  import { createBoardState } from '$lib/state/board.svelte';
  import { setBoardContext } from '$lib/context/board';

  let { data, children } = $props();

  const board = createBoardState();
  board.initialize(data.boardId, data.projectId, data.columns, data.members);

  // Every descendant can now call getBoardContext()
  setBoardContext(board);
</script>

{@render children()}
```

Any descendant — no matter how deeply nested — accesses the board state with a single import:

```svelte
<!-- src/lib/components/board/TaskCard.svelte -->
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';

  let { task } = $props();

  const board = getBoardContext();

  function handleDragStart() {
    board.setDraggedTask(task.id);
  }

  function handleDragEnd() {
    board.setDraggedTask(null);
  }
</script>

<div
  class="task-card"
  class:dragging={board.draggedTaskId === task.id}
  draggable="true"
  ondragstart={handleDragStart}
  ondragend={handleDragEnd}
>
  <h4>{task.title}</h4>
  <span class="priority priority-{task.priority}">{task.priority}</span>
</div>
```

No props were threaded through `ColumnList` or `Column` to reach `TaskCard`. The board context travels directly from the layout to any descendant that asks for it.

## User Permissions Context

TeamBoard has role-based permissions: owner, admin, member, and viewer. Different components show or hide UI based on what the current user can do. A separate permissions context keeps this concern isolated from the board state:

```typescript
// src/lib/context/permissions.ts
import { setContext, getContext } from 'svelte';

export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export interface Permissions {
  readonly role: Role;
  readonly canEditTasks: boolean;
  readonly canManageColumns: boolean;
  readonly canInviteMembers: boolean;
  readonly canDeleteBoard: boolean;
}

const PERMISSIONS_KEY = Symbol('permissions-context');

function derivePermissions(role: Role): Permissions {
  return {
    role,
    canEditTasks: role !== 'viewer',
    canManageColumns: role === 'owner' || role === 'admin',
    canInviteMembers: role === 'owner' || role === 'admin',
    canDeleteBoard: role === 'owner'
  };
}

export function setPermissionsContext(role: Role) {
  const permissions = derivePermissions(role);
  setContext(PERMISSIONS_KEY, permissions);
}

export function getPermissionsContext(): Permissions {
  return getContext<Permissions>(PERMISSIONS_KEY);
}
```

Components use permissions to conditionally render UI:

```svelte
<!-- src/lib/components/board/ColumnHeader.svelte -->
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';
  import { getPermissionsContext } from '$lib/context/permissions';

  let { column } = $props();

  const board = getBoardContext();
  const permissions = getPermissionsContext();
</script>

<div class="column-header">
  <h3>{column.name}</h3>
  <span class="count">{board.columnTaskCounts[column.id] ?? 0}</span>

  {#if permissions.canManageColumns}
    <button class="icon-btn" onclick={() => board.reorderColumns(column.position, column.position - 1)}>
      Move Left
    </button>
  {/if}
</div>
```

## Theme Context with Reactive Getters

Context values are set once during component initialization. To make a context value that changes over time — like a theme toggle — you pass an object with reactive getters backed by `$state`:

```typescript
// src/lib/context/theme.ts
import { setContext, getContext } from 'svelte';

type ThemeMode = 'light' | 'dark';

interface ThemeContext {
  readonly mode: ThemeMode;
  readonly colors: {
    readonly bg: string;
    readonly surface: string;
    readonly text: string;
    readonly accent: string;
  };
  toggle: () => void;
}

const THEME_KEY = Symbol('theme-context');

const palettes = {
  light: { bg: '#ffffff', surface: '#f8fafc', text: '#0f172a', accent: '#6366f1' },
  dark:  { bg: '#0f172a', surface: '#1e293b', text: '#f8fafc', accent: '#818cf8' }
} as const;

export function setThemeContext(initial: ThemeMode = 'light') {
  let mode = $state<ThemeMode>(initial);

  const theme: ThemeContext = {
    get mode() { return mode; },
    get colors() { return palettes[mode]; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; }
  };

  setContext(THEME_KEY, theme);
  return theme;
}

export function getThemeContext(): ThemeContext {
  return getContext<ThemeContext>(THEME_KEY);
}
```

The `get mode()` getter returns the live `$state` value each time it is read. When a component accesses `theme.mode` inside its template, Svelte establishes a reactive dependency. When `toggle()` flips the mode, every component reading `theme.mode` or `theme.colors` re-renders.

Without the getter — if you passed `{ mode: mode }` directly — descendants would receive the initial value (`'light'`) and never see updates. The getter is what makes context reactive.

```svelte
<!-- src/lib/components/layout/ThemeToggle.svelte -->
<script lang="ts">
  import { getThemeContext } from '$lib/context/theme';

  const theme = getThemeContext();
</script>

<button onclick={theme.toggle}>
  {theme.mode === 'light' ? 'Switch to Dark' : 'Switch to Light'}
</button>
```

## Notification Context for Toast Management

The notification system manages a queue of toast messages. Any component in the tree can push a notification, and the `NotificationToast` component at the top of the tree renders them:

```typescript
// src/lib/context/notifications.ts
import { setContext, getContext } from 'svelte';

export interface Notification {
  id: number;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration: number;
}

interface NotificationContext {
  readonly items: Notification[];
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
  dismiss: (id: number) => void;
}

const NOTIFICATION_KEY = Symbol('notification-context');

export function setNotificationContext() {
  let items = $state<Notification[]>([]);
  let nextId = 0;

  function add(type: Notification['type'], message: string, duration = 4000) {
    const id = nextId++;
    items.push({ id, type, message, duration });

    // Auto-dismiss after duration
    setTimeout(() => dismiss(id), duration);
  }

  function dismiss(id: number) {
    const index = items.findIndex(n => n.id === id);
    if (index !== -1) items.splice(index, 1);
  }

  const context: NotificationContext = {
    get items() { return items; },
    success: (msg) => add('success', msg),
    error: (msg) => add('error', msg, 6000),
    info: (msg) => add('info', msg),
    warning: (msg) => add('warning', msg, 5000),
    dismiss
  };

  setContext(NOTIFICATION_KEY, context);
  return context;
}

export function getNotificationContext(): NotificationContext {
  return getContext<NotificationContext>(NOTIFICATION_KEY);
}
```

Now any component can send a toast without knowing anything about the notification UI:

```svelte
<!-- src/lib/components/board/AddTaskButton.svelte -->
<script lang="ts">
  import { getBoardContext } from '$lib/context/board';
  import { getPermissionsContext } from '$lib/context/permissions';
  import { getNotificationContext } from '$lib/context/notifications';

  let { columnId } = $props();

  const board = getBoardContext();
  const permissions = getPermissionsContext();
  const notifications = getNotificationContext();

  async function addTask() {
    if (!permissions.canEditTasks) {
      notifications.warning('You do not have permission to add tasks.');
      return;
    }

    const newTask = {
      id: Date.now(),
      columnId,
      boardId: 1,
      title: 'New Task',
      description: '',
      priority: 'medium' as const,
      position: 0,
      assigneeId: null,
      dueDate: null,
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    board.addTask(columnId, newTask);
    notifications.success('Task created successfully.');
  }
</script>

{#if permissions.canEditTasks}
  <button class="add-task" onclick={addTask}>+ Add Task</button>
{/if}
```

## Setting Up All Contexts in the Board Layout

The parent layout is the single place where all board-related contexts are created. This keeps initialization centralized and easy to find:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+layout.svelte -->
<script lang="ts">
  import { createBoardState } from '$lib/state/board.svelte';
  import { setBoardContext } from '$lib/context/board';
  import { setPermissionsContext } from '$lib/context/permissions';
  import { setThemeContext } from '$lib/context/theme';
  import { setNotificationContext } from '$lib/context/notifications';
  import NotificationToast from '$lib/components/ui/NotificationToast.svelte';

  let { data, children } = $props();

  // Board state
  const board = createBoardState();
  board.initialize(data.boardId, data.projectId, data.columns, data.members);
  setBoardContext(board);

  // Permissions based on current user's role
  setPermissionsContext(data.currentUserRole);

  // Theme with user preference
  const theme = setThemeContext(data.userPreferences.theme);

  // Notification system
  const notifications = setNotificationContext();
</script>

<div class="board-layout" data-theme={theme.mode}>
  {@render children()}
  <NotificationToast />
</div>
```

## hasContext for Optional Feature Flags

Some teams have access to advanced features (time tracking, custom fields, automations) and some do not. Components can adapt their UI using `hasContext` to check if a feature context has been provided:

```typescript
// src/lib/context/features.ts
import { setContext, getContext, hasContext } from 'svelte';

interface AdvancedFeatures {
  readonly timeTracking: boolean;
  readonly customFields: boolean;
  readonly automations: boolean;
}

const FEATURES_KEY = Symbol('features-context');

export function setFeaturesContext(features: AdvancedFeatures) {
  setContext(FEATURES_KEY, features);
}

export function getFeaturesContext(): AdvancedFeatures | null {
  if (!hasContext(FEATURES_KEY)) return null;
  return getContext<AdvancedFeatures>(FEATURES_KEY);
}
```

```svelte
<!-- src/lib/components/board/TaskCard.svelte -->
<script lang="ts">
  import { getFeaturesContext } from '$lib/context/features';

  let { task } = $props();

  const features = getFeaturesContext();
</script>

<div class="task-card">
  <h4>{task.title}</h4>
  <span class="priority">{task.priority}</span>

  {#if features?.timeTracking}
    <div class="time-estimate">
      Est: {task.timeEstimate ?? '—'}h
    </div>
  {/if}

  {#if features?.customFields}
    {#each task.customFields ?? [] as field}
      <span class="custom-field">{field.label}: {field.value}</span>
    {/each}
  {/if}
</div>
```

Without `hasContext`, calling `getContext` for a key that was never set would return `undefined`, and you would have no way to distinguish "context not provided" from "context provided with a falsy value."

## getAllContexts for Portals and Modals

The `TaskDetailModal` renders as a portal — it is mounted outside the normal component tree (often appended to `<body>`). Because it is not a descendant of `BoardLayout` in the DOM, it does not inherit context automatically. `getAllContexts` captures context at the point where the modal is triggered, and the modal wrapper re-provides it:

```svelte
<!-- src/lib/components/board/TaskCardWrapper.svelte -->
<script lang="ts">
  import { getAllContexts } from 'svelte';
  import TaskDetailModal from '$lib/components/board/TaskDetailModal.svelte';

  let { task } = $props();
  let showModal = $state(false);

  // Capture all context while we are inside the tree
  const allContexts = getAllContexts();
</script>

<button onclick={() => showModal = true}>
  {task.title}
</button>

{#if showModal}
  <!-- ContextBridge re-provides all captured contexts -->
  <ContextBridge contexts={allContexts}>
    <TaskDetailModal {task} onclose={() => showModal = false} />
  </ContextBridge>
{/if}
```

```svelte
<!-- src/lib/components/ui/ContextBridge.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let { contexts, children } = $props<{
    contexts: Map<any, any>;
    children: any;
  }>();

  // Re-provide every context from the original tree position
  for (const [key, value] of contexts) {
    setContext(key, value);
  }
</script>

{@render children()}
```

This pattern ensures the modal has access to `getBoardContext()`, `getThemeContext()`, `getNotificationContext()`, and every other context — even though it is rendered outside the normal component hierarchy.

## Context vs Props vs Shared State Decision Guide

TeamBoard uses all three mechanisms. Here is when to use each:

| Data | Mechanism | Reasoning |
|------|-----------|-----------|
| Task data to TaskCard | **Props** | Direct parent-child relationship. `Column` renders `TaskCard` and passes the task object. Explicit, type-checked at compile time. |
| Board state to all board components | **Context** | Needed by many descendants (ColumnHeader, TaskCard, FilterBar, TaskDetail). Scoped to the board layout — other pages do not need it. |
| Theme mode | **Context** | Tree-scoped: components under the board layout share the board's theme. A different layout could provide a different theme. |
| Permissions | **Context** | Derived from the current user's role for this board. Different boards could have different permissions for the same user. |
| Notification toasts | **Context** | Any descendant can push a toast. The queue is scoped to the layout that renders the toast container. |
| Current authenticated user | **Shared state (.svelte.ts)** | Needed across all pages — dashboard, settings, board, profile. Not scoped to any one subtree. |
| Feature flags from API | **Context** | Set per-team. Different teams have different features enabled. Context scoping matches this naturally. |

The decision tree:

1. Is the consumer a direct child? **Props.** They are explicit and type-safe.
2. Is the data needed by many descendants in one subtree? **Context.** It avoids prop drilling and is scoped to the subtree.
3. Is the data needed across unrelated pages? **Shared state** in a `.svelte.ts` file. It is global and not tied to any component tree.

## Try It

Build a mini TeamBoard context system:

1. Create a `BoardContext` with a Symbol key that provides a board state object containing columns (an array) and a `moveTask` method. Write typed `setBoardContext()` and `getBoardContext()` helpers.
2. Create a `ThemeContext` with reactive getters for `mode` (`'light'` or `'dark'`) and a `toggle()` method. Verify that child components update when the theme is toggled.
3. Create a `NotificationContext` with `success()` and `error()` methods that push messages into a reactive array. Build a simple `ToastContainer` that renders and auto-dismisses notifications.
4. Build a parent `BoardLayout` component that calls all three `set*Context()` functions. Build child `Column` and `TaskCard` components that consume them without any prop drilling.
5. Add a feature flag check using `hasContext` — if no features context exists, hide a "Time Tracking" section in the `TaskCard`.
6. Simulate a portal: capture all contexts with `getAllContexts()`, create a `ContextBridge` component, and render a `TaskDetailModal` through it. Verify the modal can access all three contexts.

## Key Takeaways

- Use `Symbol` keys with typed helper functions (`setBoardContext` / `getBoardContext`) to prevent collisions and enforce type safety at compile time
- Make context reactive by passing objects with `$state`-backed getters — without getters, descendants receive a static snapshot that never updates
- `hasContext` checks for optional contexts, enabling components that adapt to feature availability without crashing
- `getAllContexts` captures the full context map for forwarding to portals and dynamically mounted components outside the normal tree
- Set all contexts in a single parent layout to keep initialization centralized and discoverable
- Use props for direct parent-child data, context for subtree-scoped data, and shared `.svelte.ts` state for truly global data
- Context is tree-scoped by design — a value set in one layout branch is invisible to components in other branches, preventing accidental coupling
