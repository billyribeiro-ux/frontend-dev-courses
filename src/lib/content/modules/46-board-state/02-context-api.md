# Context API for Component Trees

TeamBoard's board page has a deep component tree. The `BoardLayout` contains `Column` components, which contain `TaskCard` components, which open `TaskDetail` modals. Every level needs access to the board state, the current user's permissions, the theme, and the notification system. Passing all of this through props at every level would be exhausting and fragile. Context solves this by providing data once at the top and making it available to every descendant.

This lesson builds three context systems for TeamBoard — board state, theme, and notifications — using typed Symbol keys, reactive getters, and the full Context API including `hasContext` and `getAllContexts`.

## The Prop Drilling Problem

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

### Why Prop Drilling Breaks Down

```svelte
<!-- WITHOUT CONTEXT — prop drilling through every level -->

<!-- BoardLayout.svelte -->
<ColumnList board={board} permissions={permissions} theme={theme} notifications={notifications} />

<!-- ColumnList.svelte (does not use most of these — just passes them through) -->
<Column {board} {permissions} {theme} {notifications} />

<!-- Column.svelte (still passing through) -->
<TaskCard {board} {permissions} {theme} {notifications} task={task} />

<!-- TaskCard.svelte (finally uses board and permissions) -->
```

The problem is twofold. First, `ColumnList` and `Column` accept and pass props they never read — this is noise that obscures their actual API. Second, adding a new piece of shared data (say, a keyboard shortcut handler) requires modifying every intermediate component. Prop drilling violates the open/closed principle: adding a new feature should not require changing unrelated components.

## Board Context with Typed Symbol Keys

> **Tip:** Svelte now provides `createContext()` as a newer alternative to `setContext`/`getContext`. It returns a `[get, set]` pair and handles Symbol keys automatically, reducing boilerplate. For example: `const [getBoard, setBoard] = createContext<BoardState>()`. The `setContext`/`getContext` pattern shown below remains fully supported.

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

### WRONG vs CORRECT: Context Key Design

```typescript
// WRONG — string keys collide and typos are silent
setContext('board', state);
const board = getContext('bord');  // Typo → returns undefined → crash later
// If a third-party library also uses 'board' as a key, data is overwritten.

// WRONG — exporting the key for consumers to use directly
export const BOARD_KEY = Symbol('board');
// Consumers must import the key AND know the type: getContext<BoardState>(BOARD_KEY)
// No type safety — they could pass the wrong generic.

// CORRECT — Symbol key with typed helper functions
const BOARD_KEY = Symbol('board-context');

export function setBoardContext(state: BoardState) {
  setContext(BOARD_KEY, state);
}

export function getBoardContext(): BoardState {
  return getContext<BoardState>(BOARD_KEY);
  // The return type is enforced — consumers get full autocomplete
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

## Context Rules — When It Works and When It Does Not

Context has specific rules. Violating them causes confusing bugs:

### Rule 1: setContext Must Be Called During Component Initialization

```svelte
<script lang="ts">
  // CORRECT — called during initialization (top-level script)
  setBoardContext(board);

  // WRONG — called inside an event handler (after initialization)
  function handleClick() {
    setBoardContext(board);  // Error or undefined behavior
    // setContext only works during the synchronous initialization phase
  }

  // WRONG — called inside $effect (after initialization)
  $effect(() => {
    setBoardContext(board);  // Does not work
  });
</script>
```

### Rule 2: getContext Must Be Called During Component Initialization

```svelte
<script lang="ts">
  // CORRECT — called at the top level
  const board = getBoardContext();

  // WRONG — called inside an event handler
  function handleClick() {
    const board = getBoardContext();  // Error: no context found
    // getContext must be called during component initialization
  }

  // CORRECT — call getContext at the top level, use the result anywhere
  const board = getBoardContext();

  function handleClick() {
    board.moveTask(taskId, fromId, toId, 0);  // Use the stored reference
  }
</script>
```

### Rule 3: Context Is Scoped to the Component Tree

Context set in component A is only available to descendants of A — not siblings, not ancestors, not components in other trees:

```
Layout (setBoardContext)
  ├── BoardPage (getBoardContext ✓ — descendant)
  │     └── TaskCard (getBoardContext ✓ — descendant)
  └── SettingsPage (getBoardContext ✓ — descendant)

LoginPage (getBoardContext ✗ — NOT a descendant of Layout)
```

This tree-scoping is a feature. Different subtrees can have different contexts. A user viewing two boards in different tabs has two independent board contexts.

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
  return permissions;
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

### Why Getters Are Required for Reactive Context

The `get mode()` getter returns the live `$state` value each time it is read. When a component accesses `theme.mode` inside its template, Svelte establishes a reactive dependency. When `toggle()` flips the mode, every component reading `theme.mode` or `theme.colors` re-renders.

```typescript
// WRONG — passing the value directly (static, never updates)
export function setThemeContext(initial: ThemeMode = 'light') {
  let mode = $state<ThemeMode>(initial);

  const theme = {
    mode: mode,  // Captures the INITIAL value ('light')
    // When mode changes to 'dark', theme.mode is still 'light'
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; }
  };

  setContext(THEME_KEY, theme);
}

// CORRECT — using getters (reactive, updates when state changes)
export function setThemeContext(initial: ThemeMode = 'light') {
  let mode = $state<ThemeMode>(initial);

  const theme = {
    get mode() { return mode; },  // Reads the CURRENT value every time
    get colors() { return palettes[mode]; },  // Derived from current mode
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; }
  };

  setContext(THEME_KEY, theme);
}
```

Without the getter — if you passed `{ mode: mode }` directly — descendants would receive the initial value (`'light'`) and never see updates. The getter is what makes context reactive. **This is the most important pattern in this lesson.**

```svelte
<!-- src/lib/components/layout/ThemeToggle.svelte -->
<script lang="ts">
  import { getThemeContext } from '$lib/context/theme';

  const theme = getThemeContext();
</script>

<button onclick={theme.toggle} aria-label="Toggle theme">
  {theme.mode === 'light' ? 'Switch to Dark' : 'Switch to Light'}
</button>

<!-- This text updates reactively because theme.mode is a getter -->
<p>Current theme: {theme.mode}</p>
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

### Why Centralized Initialization Matters

When all contexts are set in one file, you get three benefits:

1. **Discoverability** — A new developer asks "where is the board state initialized?" The answer is always the board layout.
2. **Ordering** — If context B depends on context A, the initialization order is explicit and visible.
3. **Testing** — In tests, you can mount a test version of the layout with mock contexts.

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

Without `hasContext`, calling `getContext` for a key that was never set would throw an error in Svelte 5. `hasContext` lets you check first, enabling components that gracefully degrade when optional contexts are missing.

### Pattern: Components That Work Inside and Outside Context

```svelte
<!-- MemberActions.svelte — works with or without team context -->
<script lang="ts">
  import { hasContext } from 'svelte';
  import { getPermissionsContext } from '$lib/context/permissions';

  let { member } = $props();

  // Safely check for context
  const PERM_KEY = Symbol.for('permissions'); // Must match the key used in set
  const permissions = hasContext(PERM_KEY) ? getPermissionsContext() : null;
  const canManage = permissions?.canManageColumns ?? false;
</script>

{#if canManage}
  <button>Change Role</button>
{:else}
  <span class="text-gray-400">{member.role}</span>
{/if}
```

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
  import type { Snippet } from 'svelte';

  let { contexts, children }: {
    contexts: Map<any, any>;
    children: Snippet;
  } = $props();

  // Re-provide every context from the original tree position
  for (const [key, value] of contexts) {
    setContext(key, value);
  }
</script>

{@render children()}
```

This pattern ensures the modal has access to `getBoardContext()`, `getThemeContext()`, `getNotificationContext()`, and every other context — even though it is rendered outside the normal component hierarchy.

### When You Need a Context Bridge

| Scenario | Needs Bridge? | Why |
|----------|---------------|-----|
| Modal rendered with `{#if}` inside the tree | No | Still a descendant, inherits context |
| Modal teleported to `<body>` via portal | Yes | Outside the component tree |
| Tooltip rendered in a floating layer | Depends | If using a portal library, yes |
| Component in a different route | No | It has its own layout context |

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

```
Is the consumer a direct child?
  └── Yes → Props (explicit, type-safe, compile-time checked)

Is the data needed by many descendants in one subtree?
  └── Yes → Context (avoids prop drilling, scoped to the subtree)

Is the data needed across unrelated pages/subtrees?
  └── Yes → Shared state in a .svelte.ts file (global, not tree-scoped)

Is the data a one-time configuration (never changes)?
  └── Yes → Context with a plain object (no getters needed)

Does the data change over time?
  └── Yes → Context with $state-backed getters (reactive)
```

### Anti-Pattern: Using Context for Everything

```typescript
// WRONG — putting everything in context
setContext('task', task);           // Task is a direct prop — use props
setContext('onClose', onClose);     // Callback is a direct prop — use props
setContext('className', 'large');   // Style variant is a direct prop — use props
```

Context is for **tree-wide** data that many descendants need. If only one child uses a value, pass it as a prop. Props are more explicit, more type-safe, and easier to understand.

### Anti-Pattern: Using Shared State for Everything

```typescript
// WRONG — putting board state in a global .svelte.ts file
// src/lib/state/global-board.svelte.ts
export const board = createBoardState();

// This is global — there is only ONE board state for the entire app.
// If the user opens two boards in different tabs, they share state.
// Context is better because each board layout creates its own instance.
```

## Try It

Build a mini TeamBoard context system:

1. Create a `BoardContext` with a Symbol key that provides a board state object containing columns (an array) and a `moveTask` method. Write typed `setBoardContext()` and `getBoardContext()` helpers.
2. Create a `ThemeContext` with reactive getters for `mode` (`'light'` or `'dark'`) and a `toggle()` method. Verify that child components update when the theme is toggled by checking that the UI changes in real time.
3. Create a `NotificationContext` with `success()` and `error()` methods that push messages into a reactive array. Build a simple `ToastContainer` that renders and auto-dismisses notifications after 3 seconds.
4. Build a parent `BoardLayout` component that calls all three `set*Context()` functions. Build child `Column` and `TaskCard` components that consume them without any prop drilling.
5. Add a feature flag check using `hasContext` — if no features context exists, hide a "Time Tracking" section in the `TaskCard`. Test it by rendering the card both with and without the features context.
6. Simulate a portal: capture all contexts with `getAllContexts()`, create a `ContextBridge` component, and render a `TaskDetailModal` through it. Verify the modal can access all three contexts.
7. Demonstrate the getter gotcha: create a version of the theme context that passes `mode` directly (without a getter) and verify that toggle does not update child components. Then fix it with a getter and verify it works.

## Key Takeaways

- Use `Symbol` keys with typed helper functions (`setBoardContext` / `getBoardContext`) to prevent collisions and enforce type safety at compile time
- Context must be set and retrieved during component initialization — not inside event handlers, effects, or timeouts
- Make context reactive by passing objects with `$state`-backed getters — without getters, descendants receive a static snapshot that never updates. **This is the most common context bug.**
- `hasContext` checks for optional contexts, enabling components that adapt to feature availability without crashing
- `getAllContexts` captures the full context map for forwarding to portals and dynamically mounted components outside the normal tree
- Set all contexts in a single parent layout to keep initialization centralized and discoverable
- Context is tree-scoped by design — a value set in one layout branch is invisible to components in other branches, preventing accidental coupling
- Use props for direct parent-child data (explicit, type-safe), context for subtree-scoped data (avoids drilling), and shared `.svelte.ts` state for truly global data
- Do not use context for data that only one child needs — that is what props are for
- Do not use shared `.svelte.ts` state for data that should be scoped to a subtree — context provides natural scoping
