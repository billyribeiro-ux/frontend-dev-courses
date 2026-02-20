# Error Boundaries & Instrumentation

A single uncaught error in a React app takes down the entire page. Svelte 5 gives you a better option: `<svelte:boundary>`. Wrap a section of your UI in a boundary, and if any component inside throws, only that section shows an error — the rest of the page keeps working.

For TeamBoard, this is essential. The Kanban board has columns, a sidebar, an activity feed, a notification dropdown, and a real-time connection widget. If the WebSocket connection widget throws because the server is down, you still want the user to see their cached board data. If one column has a rendering bug, the other columns should remain interactive.

This lesson builds a layered error boundary system, adds server-side instrumentation, optimizes performance-critical components, and finishes with a `$inspect` debugging session.

## svelte:boundary Basics

The `<svelte:boundary>` element catches runtime errors thrown by its children. It takes an `onerror` callback and a `failed` snippet:

```svelte
<svelte:boundary onerror={(error, reset) => {
  console.error('Caught:', error);
}}>
  <ComponentThatMightFail />

  {#snippet failed(error, reset)}
    <div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
      <h3 class="font-medium text-red-800 dark:text-red-200">Something went wrong</h3>
      <p class="text-sm text-red-600 dark:text-red-400 mt-1">{error.message}</p>
      <button
        onclick={reset}
        class="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700"
      >
        Try Again
      </button>
    </div>
  {/snippet}
</svelte:boundary>
```

When a child component throws:

1. The **`onerror`** callback fires — use this for logging, error reporting, or analytics.
2. The children are unmounted and replaced with the **`failed`** snippet.
3. The `failed` snippet receives the `error` object and a `reset` function. Calling `reset()` remounts the children from scratch, giving them a fresh start.

The `reset` function is powerful. It does not try to patch the broken state — it completely destroys and recreates the child component tree. This is often enough to recover from transient errors like a failed API call during rendering.

## Wrapping Board Sections

In TeamBoard, each major section of the board page gets its own boundary. Here is the board layout with boundaries around each section:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import BoardColumns from '$components/board/BoardColumns.svelte';
  import BoardSidebar from '$components/board/BoardSidebar.svelte';
  import ActivityFeed from '$components/board/ActivityFeed.svelte';
  import NotificationDropdown from '$components/ui/NotificationDropdown.svelte';
  import RealtimeStatus from '$components/board/RealtimeStatus.svelte';
  import ErrorPanel from '$components/ui/ErrorPanel.svelte';

  let { data } = $props();

  function logError(section: string, error: Error) {
    console.error(`[${section}]`, error);
    // In production, send to your error reporting service:
    // reportError({ section, error, boardId: data.board.id });
  }
</script>

<div class="flex h-full">
  <!-- Main board area -->
  <div class="flex-1 overflow-auto p-6">
    <div class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold">{data.board.name}</h1>

      <!-- Real-time connection status -->
      <svelte:boundary onerror={(error) => logError('realtime', error)}>
        <RealtimeStatus boardId={data.board.id} />

        {#snippet failed(error, reset)}
          <ErrorPanel
            title="Connection widget failed"
            message={error.message}
            onretry={reset}
            compact
          />
        {/snippet}
      </svelte:boundary>
    </div>

    <!-- Board columns — the core of the page -->
    <svelte:boundary onerror={(error) => logError('columns', error)}>
      <BoardColumns board={data.board} columns={data.columns} />

      {#snippet failed(error, reset)}
        <ErrorPanel
          title="Could not render board columns"
          message={error.message}
          onretry={reset}
        />
      {/snippet}
    </svelte:boundary>
  </div>

  <!-- Sidebar with activity and notifications -->
  <aside class="w-80 border-l bg-gray-50 dark:bg-gray-800/50 p-4">
    <svelte:boundary onerror={(error) => logError('notifications', error)}>
      <NotificationDropdown userId={data.user.id} />

      {#snippet failed(error, reset)}
        <ErrorPanel
          title="Notifications unavailable"
          message={error.message}
          onretry={reset}
          compact
        />
      {/snippet}
    </svelte:boundary>

    <svelte:boundary onerror={(error) => logError('activity', error)}>
      <ActivityFeed boardId={data.board.id} />

      {#snippet failed(error, reset)}
        <ErrorPanel
          title="Activity feed unavailable"
          message={error.message}
          onretry={reset}
        />
      {/snippet}
    </svelte:boundary>
  </aside>
</div>
```

If `RealtimeStatus` throws because the WebSocket server is unreachable, the user sees a small error panel in the top-right corner. The board columns, sidebar, activity feed, and notifications all continue working. The user can still view and edit their tasks.

Here is the reusable `ErrorPanel` component:

```svelte
<!-- src/lib/components/ui/ErrorPanel.svelte -->
<script lang="ts">
  let {
    title,
    message,
    onretry,
    compact = false
  }: {
    title: string;
    message: string;
    onretry: () => void;
    compact?: boolean;
  } = $props();
</script>

<div
  class="rounded-lg border border-red-200 dark:border-red-800
         bg-red-50 dark:bg-red-900/20"
  class:p-3={compact}
  class:p-6={!compact}
  role="alert"
>
  <h3 class="font-medium text-red-800 dark:text-red-200"
      class:text-sm={compact}
  >
    {title}
  </h3>
  <p class="text-red-600 dark:text-red-400 mt-1"
     class:text-xs={compact}
     class:text-sm={!compact}
  >
    {message}
  </p>
  <button
    onclick={onretry}
    class="mt-3 px-3 py-1.5 text-sm bg-red-600 text-white rounded
           hover:bg-red-700 transition-colors"
  >
    Try Again
  </button>
</div>
```

## Nested Error Boundaries

Error boundaries can be nested, and errors bubble up just like DOM events. An inner boundary catches first. If the inner boundary's `onerror` callback rethrows the error, the outer boundary catches it.

This is useful for the board columns. You want a boundary around the entire columns section (catching layout-level errors) and individual boundaries around each column (catching per-column rendering errors):

```svelte
<!-- src/lib/components/board/BoardColumns.svelte -->
<script lang="ts">
  import Column from './Column.svelte';
  import ErrorPanel from '$components/ui/ErrorPanel.svelte';

  let { board, columns } = $props();
</script>

<!-- Outer boundary: catches errors from the columns container itself -->
<svelte:boundary onerror={(error) => {
  console.error('[board-columns]', error);
}}>
  <div class="flex gap-4 min-h-[400px]">
    {#each columns as column (column.id)}
      <!-- Inner boundary: catches errors from individual columns -->
      <svelte:boundary onerror={(error) => {
        console.error(`[column-${column.id}]`, error);
        // Do NOT rethrow — this column failed, but other columns are fine
      }}>
        <Column {column} boardId={board.id} />

        {#snippet failed(error, reset)}
          <div class="w-72 shrink-0">
            <ErrorPanel
              title="{column.name} failed to render"
              message={error.message}
              onretry={reset}
            />
          </div>
        {/snippet}
      </svelte:boundary>
    {/each}
  </div>

  {#snippet failed(error, reset)}
    <ErrorPanel
      title="Board columns failed to load"
      message={error.message}
      onretry={reset}
    />
  {/snippet}
</svelte:boundary>
```

The error flow works like this:

```
Column "In Progress" throws an error
    │
    ├─→ Inner boundary (column-level) catches it
    │     ├─→ onerror logs: "[column-3] TypeError: ..."
    │     └─→ failed snippet shows error panel for just that column
    │
    │   Other columns ("To Do", "Done") continue working normally
    │
    └─→ If inner onerror RETHROWS: throw error
          │
          └─→ Outer boundary (board-level) catches it
                ├─→ onerror logs: "[board-columns] TypeError: ..."
                └─→ failed snippet replaces ALL columns with a single error panel
```

In most cases, you do not rethrow. A single broken column should not take down the whole board. But if you detect a critical error (like corrupted board data that would affect all columns), rethrowing lets the outer boundary handle it with a more appropriate message.

## Global Error Boundary in Root Layout

As a last resort, add an error boundary in the root `+layout.svelte`. This catches anything that escapes the page-level boundaries:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { createThemeContext } from '$state/theme.svelte';
  import ConnectionMonitor from '$components/layout/ConnectionMonitor.svelte';
  import { PUBLIC_APP_NAME } from '$env/static/public';

  let { children } = $props();

  const theme = createThemeContext();

  // ... theme effects from lesson 2 ...

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;
    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  function handleGlobalError(error: Error) {
    console.error('[global-boundary]', error);
    // Send to error reporting service
    // reportError({ section: 'global', error });
  }
</script>

<svelte:head>
  <meta name="theme-color" content={theme.isDark ? '#1f2937' : '#ffffff'} />
</svelte:head>

<ConnectionMonitor />

<svelte:boundary onerror={(error) => handleGlobalError(error)}>
  {@render children()}

  {#snippet failed(error, reset)}
    <div class="min-h-screen flex items-center justify-center p-8">
      <div class="max-w-md text-center">
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {PUBLIC_APP_NAME} encountered an error
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          {error.message}
        </p>
        <div class="mt-6 flex gap-3 justify-center">
          <button
            onclick={reset}
            class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Try Again
          </button>
          <a
            href="/"
            class="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg
                   hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            Go Home
          </a>
        </div>
      </div>
    </div>
  {/snippet}
</svelte:boundary>
```

This global boundary sits outside the app shell layout, so if the sidebar or header components throw, the user still gets a usable error screen with a retry button and a link home.

Note the difference between `<svelte:boundary>` and SvelteKit's `+error.svelte` pages. Error boundaries catch **runtime rendering errors** — a component throws during `$effect`, `$derived`, or rendering. `+error.svelte` pages handle **HTTP errors** — load functions that throw or return error responses. You need both.

## Server Instrumentation

SvelteKit provides `src/instrumentation.server.ts` as a hook that runs once when the server starts, before any request is handled. This is the right place to initialize monitoring, tracing, or database connection pools.

```typescript
// src/instrumentation.server.ts

export async function init() {
  console.log('Server starting — initializing instrumentation');

  // Example: OpenTelemetry setup
  // In production, you would configure a real exporter (Jaeger, Honeycomb, etc.)
  if (process.env.NODE_ENV === 'production') {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import(
      '@opentelemetry/auto-instrumentations-node'
    );
    const { OTLPTraceExporter } = await import(
      '@opentelemetry/exporter-trace-otlp-http'
    );

    const sdk = new NodeSDK({
      traceExporter: new OTLPTraceExporter({
        url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318/v1/traces'
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          '@opentelemetry/instrumentation-fs': { enabled: false }
        })
      ]
    });

    sdk.start();
    console.log('OpenTelemetry tracing initialized');
  }
}
```

Key points about `instrumentation.server.ts`:

- It exports a single `init` function that can be `async`.
- It runs **once** when the server starts — not per request, not per deployment. Just once.
- Use it for one-time setup: tracing, metrics, database pool creation, warming caches.
- It runs **before** any request is handled, so your instrumentation is in place from the first request.
- Dynamically import heavy dependencies (like OpenTelemetry) so they do not affect startup time in development.

This file is separate from `hooks.server.ts`. Hooks run on every request. Instrumentation runs once at startup. If you need per-request tracing spans, set up the SDK in instrumentation and create spans in your hooks.

## svelte:options for Performance

TeamBoard's task list can have hundreds of items. Svelte's reactivity system checks for changes by comparing values deeply. For components that receive immutable data, you can skip this diffing with `<svelte:options>`:

```svelte
<!-- src/lib/components/board/TaskListItem.svelte -->
<svelte:options immutable />

<script lang="ts">
  let { task } = $props();
</script>

<div class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
  <span class="w-2 h-2 rounded-full"
        class:bg-green-500={task.priority === 'low'}
        class:bg-blue-500={task.priority === 'medium'}
        class:bg-orange-500={task.priority === 'high'}
        class:bg-red-500={task.priority === 'urgent'}
  ></span>
  <span class="flex-1 truncate">{task.title}</span>
  {#if task.assignee}
    <img
      src={task.assignee.avatarUrl}
      alt={task.assignee.name}
      class="w-6 h-6 rounded-full"
    />
  {/if}
</div>
```

When `immutable` is set, Svelte assumes that if the reference to `task` has not changed, the data inside it has not changed either. It skips deep comparison and only checks referential equality. This is safe when your data comes from `$state.raw()` or from a server response that creates new objects on each update:

```typescript
// In the board state module
// $state.raw() creates non-deeply-reactive state —
// Svelte tracks the array reference, not individual item properties
let tasks = $state.raw<Task[]>([]);

// When updating, always replace the entire array or item
function updateTask(id: number, updates: Partial<Task>) {
  tasks = tasks.map((t) =>
    t.id === id ? { ...t, ...updates } : t
  );
}
```

Because `$state.raw()` does not make nested properties reactive and `updateTask` creates a new object with the spread operator, referential equality is a reliable check. The `immutable` option tells Svelte to trust that.

Do not use `immutable` on components that receive deeply reactive `$state` objects — the component would miss updates to nested properties because the reference stays the same while the contents change.

## Debugging with $inspect

`$inspect` is Svelte 5's built-in reactivity debugger. It logs a value to the console whenever it changes, letting you trace exactly when and why reactive updates happen. It only runs in development — the compiler strips it completely from production builds.

### Basic Usage

```svelte
<script lang="ts">
  let boardState = $state({
    columns: [],
    selectedTask: null,
    filter: 'all'
  });

  // Logs the entire board state whenever any property changes
  $inspect(boardState);
</script>
```

Every time `boardState` (or any nested property) changes, the console shows the current value along with whether it was an `init` (first read) or `update` (subsequent change).

### Custom Formatting with .with()

The default console output can be hard to read for complex objects. The `.with()` method lets you customize the logging:

```svelte
<script lang="ts">
  import type { Task } from '$lib/types';

  let tasks = $state<Task[]>([]);
  let stats = $state({
    total: 0,
    completed: 0,
    overdue: 0,
    byPriority: { low: 0, medium: 0, high: 0, urgent: 0 }
  });

  // Use console.table for a readable tabular format
  $inspect(stats).with(console.table);

  // Custom logging function for tasks
  $inspect(tasks).with((type, value) => {
    if (type === 'update') {
      console.group(`Tasks updated (${value.length} total)`);
      console.log('Titles:', value.map((t: Task) => t.title));
      console.log('By status:', Object.groupBy(value, (t: Task) => t.status));
      console.groupEnd();
    }
  });
</script>
```

`$inspect(stats).with(console.table)` formats the stats object as a table — much easier to scan than a nested object dump.

The custom `.with()` callback receives two arguments: `type` (either `'init'` or `'update'`) and `value` (the current value). You can filter, format, or conditionally log however you want.

### Tracing the Reactive Graph

Use multiple `$inspect` calls to trace how changes propagate through your reactive graph:

```svelte
<script lang="ts">
  let filter = $state('all');
  let tasks = $state<Task[]>([]);

  let filteredTasks = $derived(
    filter === 'all'
      ? tasks
      : tasks.filter((t) => t.priority === filter)
  );

  let taskCount = $derived(filteredTasks.length);

  // Trace the reactive chain
  $inspect(filter).with((type, val) =>
    console.log(`1. filter ${type}:`, val)
  );
  $inspect(filteredTasks).with((type, val) =>
    console.log(`2. filteredTasks ${type}: ${val.length} items`)
  );
  $inspect(taskCount).with((type, val) =>
    console.log(`3. taskCount ${type}:`, val)
  );
</script>
```

When the user changes the filter dropdown, you see the cascade in the console:

```
1. filter update: "high"
2. filteredTasks update: 3 items
3. taskCount update: 3
```

This is invaluable for debugging "why did this component re-render?" questions. If you see `filteredTasks` updating when you did not expect it to, trace backward to find which dependency changed.

### Finding Unnecessary Reactivity

`$inspect` can also help you find performance issues — reactive values that update more often than they should:

```svelte
<script lang="ts">
  let board = $state(/* ... */);

  // If this logs more than you expect, something is triggering
  // unnecessary updates to the board state
  $inspect(board).with((type) => {
    if (type === 'update') {
      console.trace('Board state updated — stack trace:');
    }
  });
</script>
```

Using `console.trace()` inside the `.with()` callback prints a stack trace showing exactly what code triggered the update. If you see the same update firing twice, or an update that should not happen at all, the stack trace points you to the culprit.

### Production Safety

You do not need to manually remove `$inspect` calls before deploying. The Svelte compiler automatically strips all `$inspect` calls in production builds. They have zero runtime cost in production — no console output, no performance overhead, nothing. Treat them like `console.log` statements that you never have to clean up.

## Combining It All: The Resilient Board Page

Here is how all three concepts — error boundaries, performance optimization, and debugging — come together in the complete board page:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import BoardColumns from '$components/board/BoardColumns.svelte';
  import BoardSidebar from '$components/board/BoardSidebar.svelte';
  import RealtimeStatus from '$components/board/RealtimeStatus.svelte';
  import ErrorPanel from '$components/ui/ErrorPanel.svelte';

  let { data } = $props();

  // Debug: trace board data changes in development
  $inspect(data.board).with((type, val) => {
    if (type === 'update') {
      console.log('Board data updated:', val.name, '—', val.columns?.length, 'columns');
    }
  });

  function logError(section: string, error: Error) {
    console.error(`[${section}]`, error);
  }
</script>

<div class="flex h-full">
  <div class="flex-1 overflow-auto p-6">
    <header class="flex items-center justify-between mb-4">
      <h1 class="text-xl font-bold">{data.board.name}</h1>

      <svelte:boundary onerror={(error) => logError('realtime', error)}>
        <RealtimeStatus boardId={data.board.id} />
        {#snippet failed(error, reset)}
          <ErrorPanel title="Live status unavailable" message={error.message} onretry={reset} compact />
        {/snippet}
      </svelte:boundary>
    </header>

    <svelte:boundary onerror={(error) => logError('board', error)}>
      <BoardColumns board={data.board} columns={data.columns} />
      {#snippet failed(error, reset)}
        <ErrorPanel title="Board failed to render" message={error.message} onretry={reset} />
      {/snippet}
    </svelte:boundary>
  </div>

  <svelte:boundary onerror={(error) => logError('sidebar', error)}>
    <BoardSidebar board={data.board} user={data.user} />
    {#snippet failed(error, reset)}
      <aside class="w-80 border-l p-4">
        <ErrorPanel title="Sidebar unavailable" message={error.message} onretry={reset} />
      </aside>
    {/snippet}
  </svelte:boundary>
</div>
```

Each section is independently resilient. The `$inspect` call helps you debug data flow during development and disappears in production. Task list items use `<svelte:options immutable />` for optimal rendering performance. And the server instrumentation ensures you have tracing data from the very first request.

## Try It

1. Add `<svelte:boundary>` around the board columns, sidebar, activity feed, and notification dropdown in your board page
2. Create the reusable `ErrorPanel` component with `title`, `message`, `onretry`, and `compact` props
3. Test error boundaries: temporarily add `throw new Error('test')` inside one column component — verify that only that column shows an error while others work normally
4. Add nested boundaries: an outer boundary around all columns and inner boundaries around each individual column — test that an inner error does not affect sibling columns
5. Add a global boundary in `+layout.svelte` as the last-resort fallback
6. Create `src/instrumentation.server.ts` with the `init` function stub
7. Add `<svelte:options immutable />` to your `TaskListItem` component and ensure you are using `$state.raw()` for the task list data
8. Add `$inspect(boardState)` and `$inspect(stats).with(console.table)` to your board page — observe the reactive updates in the console as you interact with the board
9. Use `$inspect(...).with(console.trace)` to find an unexpected re-render, then fix it

## Key Takeaways

- `<svelte:boundary>` catches runtime rendering errors in its children — only the wrapped section fails, not the entire page
- Each boundary gets an `onerror` callback for logging and a `{#snippet failed(error, reset)}` block for the fallback UI
- Calling `reset()` completely destroys and recreates the child tree — a clean restart, not a patch
- Nested boundaries catch errors at different granularity levels — inner catches first, rethrow to bubble up
- A global boundary in the root layout acts as a last-resort safety net, separate from SvelteKit's `+error.svelte` (which handles HTTP errors, not rendering errors)
- `src/instrumentation.server.ts` runs once at server startup — use it for tracing, metrics, and one-time initialization
- `<svelte:options immutable />` skips deep diffing for components that receive immutable data from `$state.raw()` — a meaningful performance win for large lists
- `$inspect` traces reactive changes in development and is automatically stripped from production builds — use it freely without cleanup concerns
- `$inspect(value).with(console.table)` and custom `.with()` callbacks give you formatted, filterable debug output
