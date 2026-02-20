# Server-Sent Events for Live Board Updates

In Module 27 you learned how SSE works in isolation — a server pushes messages, the browser listens. Now you will wire SSE into a real application. When a teammate creates a task, drags a card to a new column, or edits a title, every connected client should see the change instantly. That is what makes TeamBoard feel alive.

This lesson builds the complete real-time pipeline: an SSE endpoint that broadcasts board events, a client-side connection manager with proper lifecycle handling, an optimistic UI pattern for instant feedback, and error boundaries that keep the board stable even when the connection drops.

## The SSE Endpoint

Every board gets its own event stream. Clients connect to `/api/boards/[boardId]/events` and receive a continuous flow of typed events. The server keeps a set of active connections per board and broadcasts to all of them whenever something changes.

Start with the connection registry — a simple in-memory map that tracks which clients are listening to which board:

```typescript
// src/lib/server/board-events.ts
type Client = {
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

const boardClients = new Map<string, Set<Client>>();

export function addClient(boardId: string, client: Client) {
  if (!boardClients.has(boardId)) {
    boardClients.set(boardId, new Set());
  }
  boardClients.get(boardId)!.add(client);
}

export function removeClient(boardId: string, client: Client) {
  const clients = boardClients.get(boardId);
  if (clients) {
    clients.delete(client);
    if (clients.size === 0) {
      boardClients.delete(boardId);
    }
  }
}

export function broadcast(boardId: string, event: string, data: unknown) {
  const clients = boardClients.get(boardId);
  if (!clients) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  for (const client of clients) {
    try {
      client.controller.enqueue(client.encoder.encode(payload));
    } catch {
      // Client disconnected — clean up on next pass
      clients.delete(client);
    }
  }
}
```

Notice the event format: the `event:` line sets the event type (so the client can listen for specific events), and the `data:` line carries the JSON payload. The double newline `\n\n` terminates the message. This is the SSE protocol — plain text, no binary framing.

Now build the SvelteKit endpoint that creates a stream for each connecting client:

```typescript
// src/routes/api/boards/[boardId]/events/+server.ts
import type { RequestHandler } from './$types';
import { addClient, removeClient } from '$server/board-events';

export const GET: RequestHandler = async ({ params, request }) => {
  const { boardId } = params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const client = { controller, encoder };
      addClient(boardId, client);

      // Send an initial connection event so the client
      // knows the stream is alive
      const welcome = `event: connected\ndata: ${JSON.stringify({
        boardId,
        timestamp: Date.now()
      })}\n\n`;
      controller.enqueue(encoder.encode(welcome));

      // Set the retry interval — if the connection drops,
      // the browser will reconnect after 3 seconds
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      // Clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        removeClient(boardId, client);
        try {
          controller.close();
        } catch {
          // Stream already closed
        }
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
};
```

A few details worth highlighting. The `request.signal` fires `abort` when the client disconnects (closes the tab, navigates away, or the network drops). That is where you remove the client from the registry and close the stream controller. The `X-Accel-Buffering: no` header tells reverse proxies like Nginx not to buffer the response — without it, events might arrive in batches instead of immediately.

When other parts of your application modify board data (form actions, API routes, remote functions), they call `broadcast` to notify all connected clients:

```typescript
// Inside a form action or API route that moves a task
import { broadcast } from '$server/board-events';

// After persisting the change to the database...
broadcast(boardId, 'task-moved', {
  taskId: task.id,
  fromColumnId: previousColumnId,
  toColumnId: newColumnId,
  position: newPosition,
  movedBy: currentUser.name,
  timestamp: Date.now()
});
```

The event types you will use across TeamBoard:

```
task-created    — a new task was added to a column
task-moved      — a task changed columns or position
task-updated    — a task's title, description, or priority changed
task-deleted    — a task was removed
column-created  — a new column was added to the board
column-updated  — a column was renamed or recolored
member-joined   — a new user joined the board's team
```

## Client-Side EventSource with $effect

On the client, you need to open an `EventSource` connection when a board page mounts, listen for events, and close the connection when the component unmounts or the user navigates to a different board. Svelte 5's `$effect` is purpose-built for this kind of side effect with cleanup.

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';
  import BoardView from '$components/board/BoardView.svelte';
  import ConnectionStatus from '$components/board/ConnectionStatus.svelte';

  let { data }: { data: PageData } = $props();

  // Reactive board state — we mutate this when SSE events arrive
  let columns = $state(data.columns);
  let tasks = $state(data.tasks);

  // Connection status for the UI indicator
  let connectionStatus = $state<'connecting' | 'connected' | 'disconnected'>('connecting');

  // The effect re-runs whenever data.boardId changes (e.g., navigating
  // between boards). The cleanup function closes the old connection
  // before a new one opens.
  $effect(() => {
    const boardId = data.boardId;
    connectionStatus = 'connecting';

    const source = new EventSource(`/api/boards/${boardId}/events`);

    source.addEventListener('connected', () => {
      connectionStatus = 'connected';
    });

    source.addEventListener('task-created', (e) => {
      const task = JSON.parse(e.data);
      tasks = [...tasks, task];
    });

    source.addEventListener('task-moved', (e) => {
      const { taskId, toColumnId, position } = JSON.parse(e.data);
      tasks = tasks.map(t =>
        t.id === taskId
          ? { ...t, columnId: toColumnId, position }
          : t
      );
    });

    source.addEventListener('task-updated', (e) => {
      const updated = JSON.parse(e.data);
      tasks = tasks.map(t =>
        t.id === updated.taskId
          ? { ...t, ...updated.changes }
          : t
      );
    });

    source.addEventListener('task-deleted', (e) => {
      const { taskId } = JSON.parse(e.data);
      tasks = tasks.filter(t => t.id !== taskId);
    });

    source.onerror = () => {
      connectionStatus = 'disconnected';
      // EventSource automatically reconnects — the retry: 3000
      // we sent from the server controls the delay
    };

    // Cleanup: close the connection when the effect re-runs
    // (boardId changed) or when the component unmounts
    return () => {
      source.close();
      connectionStatus = 'disconnected';
    };
  });
</script>

<ConnectionStatus status={connectionStatus} />
<BoardView {columns} {tasks} boardId={data.boardId} />
```

The key insight here is `$effect`'s dependency tracking. Because the effect body reads `data.boardId`, Svelte knows to re-run the effect whenever the board ID changes. The return function fires first, closing the old `EventSource`, and then the effect body runs again, opening a new connection to the new board. You get automatic resource cleanup without manually tracking anything.

## Optimistic UI Pattern

Real-time updates from the server are great, but they are not enough. When a user drags a task to a new column, the card should move *instantly* — not after a network round-trip. This is the optimistic UI pattern: update local state immediately, send the change to the server in the background, and roll back if the server rejects it.

Here is the full flow for moving a task:

```typescript
// src/lib/state/board-actions.svelte.ts
import { command } from '$lib/api/tasks.remote';

type Task = {
  id: number;
  columnId: number;
  position: number;
  title: string;
  [key: string]: unknown;
};

export function createBoardActions(
  tasks: { value: Task[] }
) {
  async function moveTask(
    taskId: number,
    toColumnId: number,
    newPosition: number
  ) {
    // 1. Capture the current state for potential rollback
    const previousTasks = tasks.value.map(t => ({ ...t }));

    // 2. Optimistically update local state — the UI moves instantly
    tasks.value = tasks.value.map(t =>
      t.id === taskId
        ? { ...t, columnId: toColumnId, position: newPosition }
        : t
    );

    try {
      // 3. Persist the change to the server
      await command('moveTask', {
        taskId,
        toColumnId,
        position: newPosition
      });

      // 4. Success! The server will also broadcast an SSE event,
      // but since our local state already reflects the change,
      // we can ignore the duplicate update (or use a timestamp
      // to deduplicate — see the note below).
    } catch (error) {
      // 5. Server rejected the change — roll back to the
      // previous state so the UI matches reality
      console.error('Failed to move task:', error);
      tasks.value = previousTasks;
    }
  }

  return { moveTask };
}
```

The tricky part is deduplication. When you move a task, your local state updates immediately. Then the server broadcasts a `task-moved` event to *all* clients, including you. Without deduplication, you would process the event and redundantly update the task a second time — which is harmless for moves but can cause flickering for other operations.

A simple approach is to tag your optimistic updates with the current user's ID and ignore SSE events that match:

```typescript
source.addEventListener('task-moved', (e) => {
  const event = JSON.parse(e.data);

  // Skip events triggered by the current user —
  // we already applied this change optimistically
  if (event.movedBy === currentUser.id) return;

  tasks = tasks.map(t =>
    t.id === event.taskId
      ? { ...t, columnId: event.toColumnId, position: event.position }
      : t
  );
});
```

## $state.raw() for the Event History Buffer

It helps to keep a log of recent SSE events for debugging and for showing a "recent activity" sidebar. This log is a large array that gets replaced (not mutated element by element) every time events arrive. That makes it a perfect fit for `$state.raw()`:

```svelte
<script lang="ts">
  type BoardEvent = {
    id: string;
    type: string;
    data: unknown;
    receivedAt: number;
  };

  // raw() because we never mutate individual events —
  // we replace the entire array each time
  let eventHistory = $state.raw<BoardEvent[]>([]);

  let eventCounter = 0;
  const MAX_HISTORY = 100;

  function recordEvent(type: string, data: unknown) {
    const newEvent: BoardEvent = {
      id: `evt-${++eventCounter}`,
      type,
      data,
      receivedAt: Date.now()
    };

    // Replace the entire array — this triggers reactivity
    // with $state.raw(). Slice to keep only the last 100 events.
    eventHistory = [newEvent, ...eventHistory].slice(0, MAX_HISTORY);
  }

  // Inside each SSE event listener, call recordEvent:
  // source.addEventListener('task-moved', (e) => {
  //   const data = JSON.parse(e.data);
  //   recordEvent('task-moved', data);
  //   // ...update board state
  // });
</script>

<aside class="activity-sidebar">
  <h3>Recent Activity</h3>
  {#each eventHistory as event (event.id)}
    <div class="event-item">
      <span class="event-type">{event.type}</span>
      <span class="event-time">
        {new Date(event.receivedAt).toLocaleTimeString()}
      </span>
    </div>
  {/each}
</aside>
```

Why `$state.raw()` instead of `$state()`? Two reasons. First, performance: with `$state()`, Svelte would wrap all 100 event objects in deep reactive proxies. That is wasted work because you never reach into an event and mutate `event.type = 'something-else'`. You only ever replace the whole array. Second, clarity: `$state.raw()` signals to anyone reading the code that this data follows an immutable-replace pattern, not a mutate-in-place pattern.

## Error Boundaries with svelte:boundary

An SSE connection can fail for many reasons: the server restarts, the network drops, or a bug in an event handler throws an error. You do not want any of these to crash the entire board. Svelte 5's `<svelte:boundary>` lets you catch errors at the component level and show a recovery UI.

Wrap the connection status indicator in a boundary so that if anything inside it throws, you get a reconnect button instead of a white screen:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import ConnectionStatus from '$components/board/ConnectionStatus.svelte';
  import BoardView from '$components/board/BoardView.svelte';

  let { data } = $props();
  // ... board state and SSE setup from above
</script>

<svelte:boundary>
  <ConnectionStatus status={connectionStatus} />

  {#snippet failed(error, reset)}
    <div class="connection-error">
      <p>Real-time connection error: {error.message}</p>
      <button onclick={reset}>
        Reconnect
      </button>
    </div>
  {/snippet}
</svelte:boundary>

<!-- The board itself is outside the boundary — even if the
     connection indicator crashes, the board stays visible -->
<BoardView {columns} {tasks} boardId={data.boardId} />

<style>
  .connection-error {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    color: #991b1b;
    font-size: 0.875rem;
  }

  .connection-error button {
    padding: 4px 12px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
  }
</style>
```

The `{#snippet failed(error, reset)}` block receives the thrown error and a `reset` function. Calling `reset` remounts the component inside the boundary, which re-triggers the `$effect` and opens a fresh `EventSource` connection. The board view sits outside the boundary so it remains fully interactive regardless of connection status.

## Connection Lifecycle: Reconnect with Exponential Backoff

The built-in `EventSource` reconnection is fine for brief network hiccups, but for longer outages you want smarter behavior. Here is a connection manager that implements exponential backoff with a maximum delay:

```typescript
// src/lib/state/sse-connection.svelte.ts
export function createSSEConnection(boardId: string) {
  let status = $state<'connecting' | 'connected' | 'disconnected'>('disconnected');
  let retryCount = $state(0);
  let source: EventSource | null = null;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Map<string, (data: unknown) => void>();

  function connect() {
    // Clean up any existing connection
    disconnect();
    status = 'connecting';

    source = new EventSource(`/api/boards/${boardId}/events`);

    source.addEventListener('connected', () => {
      status = 'connected';
      retryCount = 0; // Reset backoff on successful connection
    });

    source.onerror = () => {
      status = 'disconnected';
      source?.close();
      source = null;
      scheduleReconnect();
    };

    // Register all listeners on the new EventSource
    for (const [event, handler] of listeners) {
      source.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  function scheduleReconnect() {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const baseDelay = 1000;
    const maxDelay = 30000;
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);

    retryCount++;

    retryTimeout = setTimeout(() => {
      connect();
    }, delay);
  }

  function disconnect() {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }
    if (source) {
      source.close();
      source = null;
    }
    status = 'disconnected';
  }

  function on(event: string, handler: (data: unknown) => void) {
    listeners.set(event, handler);
    // If already connected, add the listener immediately
    if (source) {
      source.addEventListener(event, (e: MessageEvent) => {
        handler(JSON.parse(e.data));
      });
    }
  }

  return {
    get status() { return status; },
    get retryCount() { return retryCount; },
    connect,
    disconnect,
    on
  };
}
```

Use this connection manager inside your board page:

```svelte
<script lang="ts">
  import { createSSEConnection } from '$lib/state/sse-connection.svelte';

  let { data } = $props();

  // Connection re-creates when boardId changes thanks to $effect
  $effect(() => {
    const sse = createSSEConnection(data.boardId);

    sse.on('task-created', (task) => {
      tasks = [...tasks, task as Task];
    });

    sse.on('task-moved', (event) => {
      const { taskId, toColumnId, position } = event as TaskMovedEvent;
      tasks = tasks.map(t =>
        t.id === taskId ? { ...t, columnId: toColumnId, position } : t
      );
    });

    sse.on('task-updated', (event) => {
      const { taskId, changes } = event as TaskUpdatedEvent;
      tasks = tasks.map(t =>
        t.id === taskId ? { ...t, ...changes } : t
      );
    });

    sse.on('task-deleted', (event) => {
      const { taskId } = event as TaskDeletedEvent;
      tasks = tasks.filter(t => t.id !== taskId);
    });

    sse.connect();

    return () => sse.disconnect();
  });
</script>
```

The backoff sequence works like this: after the first failure, wait 1 second. After the second, 2 seconds. Then 4, 8, 16, and finally cap at 30 seconds. As soon as a connection succeeds, the counter resets to zero. This prevents hammering the server during an outage while still recovering quickly from brief interruptions.

## Putting It All Together

Here is the complete data flow in one picture:

```
User drags task to "In Progress" column
           |
           v
  Optimistic UI update (local $state mutation — instant)
           |
           v
  command('moveTask', { ... }) fires to the server
           |
           v
  Server persists change in database
           |
           v
  Server calls broadcast(boardId, 'task-moved', { ... })
           |
           v
  All connected EventSource clients receive the event
           |
           v
  Current user: skip (already applied optimistically)
  Other users: update local $state with new task position
           |
           v
  Event recorded in $state.raw() history buffer
```

Every part of this flow has been covered in this lesson: the SSE endpoint, the client-side `$effect` lifecycle, the optimistic update with rollback, the raw state for the event log, and the error boundary for resilience.

## Try It

Build an "Activity Pulse" indicator for the board header. It should:

1. Track the number of SSE events received in the last 60 seconds using a `$state.raw()` array of timestamps.
2. Display a small pulsing dot that changes color based on activity level: green for more than 10 events/minute, yellow for 1-10, gray for 0.
3. Use a `$derived` to compute the event count from the timestamp array (filter timestamps older than 60 seconds).
4. Wrap the indicator in a `<svelte:boundary>` so that if it errors, it shows "Activity unavailable" instead of crashing the header.
5. Add an `$effect` with a 10-second interval that prunes old timestamps from the array (reassign, do not mutate, since it is raw state).

## Key Takeaways

- SSE endpoints in SvelteKit use `ReadableStream` with `Content-Type: text/event-stream` — each message needs `event:` and `data:` lines terminated by `\n\n`
- Manage `EventSource` connections inside `$effect` — the cleanup return function closes the connection when the component unmounts or dependencies change
- Optimistic UI updates local `$state` immediately, then persists with a server call — roll back on failure to keep the UI consistent with reality
- Use `$state.raw()` for large arrays that you replace rather than mutate — like event history buffers — to avoid unnecessary deep proxy overhead
- `<svelte:boundary>` with `{#snippet failed(error, reset)}` prevents connection errors from crashing the entire board — the reset function remounts the component and retries
- Exponential backoff (1s, 2s, 4s ... 30s max) prevents hammering the server during outages while recovering quickly from brief disconnections
- Deduplicate SSE events for the current user by tagging optimistic updates with the user ID and skipping matching server events
