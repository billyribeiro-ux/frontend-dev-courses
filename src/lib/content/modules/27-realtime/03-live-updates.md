# Live Updates

You now know the building blocks -- SSE for one-way streaming and WebSockets for two-way communication. In this lesson we combine these with production UI patterns to build real-time features that feel instant and work reliably: a live notification system, cursor/presence tracking, a collaborative todo list with real-time sync, offline support, state reconciliation, throttling for rapid updates, and virtual scrolling for large update streams.

Real-time features are not just about the connection. They require careful thought about what happens when the network is slow, when updates conflict, when multiple users edit the same data, and how to keep the UI responsive while processing a stream of events.

## Building a Live Notification System

Start with the server-side notification stream using SSE:

```typescript
// src/routes/api/notifications/+server.ts
import type { RequestHandler } from './$types';

interface Client {
  controller: ReadableStreamDefaultController;
  userId: number;
}

const clients = new Set<Client>();

export function broadcastNotification(notification: {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
}, targetUserIds?: number[]) {
  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(notification)}\n\n`;

  clients.forEach((client) => {
    // If targetUserIds is specified, only send to those users
    if (targetUserIds && !targetUserIds.includes(client.userId)) return;

    try {
      client.controller.enqueue(encoder.encode(data));
    } catch {
      clients.delete(client);
    }
  });
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const userId = locals.user.id;

  const stream = new ReadableStream({
    start(controller) {
      const client: Client = { controller, userId };
      clients.add(client);

      // Send a heartbeat every 30 seconds to keep the connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          clients.delete(client);
        }
      }, 30_000);

      // Clean up on close
      const cleanup = () => {
        clearInterval(heartbeat);
        clients.delete(client);
      };

      // Store cleanup for the cancel handler
      (controller as any).__cleanup = cleanup;
    },
    cancel(controller) {
      (controller as any).__cleanup?.();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    }
  });
};
```

The heartbeat is critical. Without it, proxies (Nginx, Cloudflare, load balancers) will close idle connections after their timeout period (typically 60-120 seconds). The heartbeat keeps the connection alive. SSE comments (lines starting with `:`) are ignored by the client but count as activity for the connection.

The `X-Accel-Buffering: no` header tells Nginx to stream the response instead of buffering it. Without this, notifications queue up in the proxy buffer and arrive in batches instead of in real time.

## Client-Side Notification State

Create a reactive state class that manages notifications with auto-dismiss and persistence:

```typescript
// src/lib/state/notifications.svelte.ts
interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  receivedAt: number;
  dismissAt?: number; // Auto-dismiss timestamp
}

class NotificationStore {
  items = $state<Notification[]>([]);
  unreadCount = $derived(this.items.filter(n => !n.read).length);
  hasUnread = $derived(this.unreadCount > 0);

  private maxItems = 50;
  private autoDismissTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor() {
    // Load persisted notifications
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('notifications');
        if (saved) this.items = JSON.parse(saved);
      } catch {
        localStorage.removeItem('notifications');
      }
    }
  }

  add(notification: Omit<Notification, 'read' | 'receivedAt'>, autoDismissMs?: number) {
    // Prevent duplicates
    if (this.items.some(n => n.id === notification.id)) return;

    const newItem: Notification = {
      ...notification,
      read: false,
      receivedAt: Date.now()
    };

    this.items = [newItem, ...this.items].slice(0, this.maxItems);
    this.persist();

    // Auto-dismiss after timeout
    if (autoDismissMs) {
      const timer = setTimeout(() => {
        this.dismiss(notification.id);
      }, autoDismissMs);
      this.autoDismissTimers.set(notification.id, timer);
    }
  }

  markRead(id: string) {
    const item = this.items.find(n => n.id === id);
    if (item) {
      item.read = true;
      this.persist();
    }
  }

  markAllRead() {
    this.items.forEach(n => (n.read = true));
    this.persist();
  }

  dismiss(id: string) {
    const timer = this.autoDismissTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.autoDismissTimers.delete(id);
    }
    this.items = this.items.filter(n => n.id !== id);
    this.persist();
  }

  clear() {
    this.autoDismissTimers.forEach(t => clearTimeout(t));
    this.autoDismissTimers.clear();
    this.items = [];
    this.persist();
  }

  private persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('notifications', JSON.stringify(this.items));
    }
  }
}

export const notifications = new NotificationStore();
```

## Connecting with Auto-Reconnect

Wire up the EventSource to the notification store with automatic reconnection and exponential backoff:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { notifications } from '$lib/state/notifications.svelte';
  import { browser } from '$app/environment';

  let { data, children } = $props();

  $effect(() => {
    if (!browser || !data.user) return;

    let source: EventSource | null = null;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let destroyed = false;

    function connect() {
      if (destroyed) return;

      source = new EventSource('/api/notifications');

      source.onopen = () => {
        console.log('Notification stream connected');
        reconnectAttempts = 0; // Reset on successful connection
      };

      source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          notifications.add(data, 10_000); // Auto-dismiss after 10s
        } catch {
          console.error('Failed to parse notification:', event.data);
        }
      };

      source.onerror = () => {
        source?.close();
        source = null;

        if (destroyed) return;

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30_000);
        reconnectAttempts++;

        console.log(`Notification stream disconnected. Reconnecting in ${delay}ms...`);
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      clearTimeout(reconnectTimer);
      source?.close();
    };
  });
</script>

{@render children()}
```

Exponential backoff is essential. Without it, a server outage would cause thousands of clients to reconnect simultaneously, creating a "thundering herd" that overwhelms the server the moment it comes back up. Backoff spreads the reconnection attempts over time.

## Toast Notification Component

Display notifications as toast popups that slide in and auto-dismiss:

```svelte
<!-- src/lib/components/ToastContainer.svelte -->
<script lang="ts">
  import { notifications } from '$lib/state/notifications.svelte';
  import { fly, fade } from 'svelte/transition';

  // Only show unread notifications as toasts
  let toasts = $derived(
    notifications.items
      .filter(n => !n.read)
      .slice(0, 5) // Max 5 toasts visible at once
  );

  const typeStyles: Record<string, string> = {
    info: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-500 text-black',
    error: 'bg-red-600'
  };
</script>

<div class="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div
      class="rounded-lg shadow-lg p-4 text-white {typeStyles[toast.type] || typeStyles.info}
             cursor-pointer"
      role="alert"
      in:fly={{ x: 300, duration: 300 }}
      out:fade={{ duration: 200 }}
      onclick={() => {
        notifications.markRead(toast.id);
        notifications.dismiss(toast.id);
      }}
    >
      <div class="flex justify-between items-start gap-2">
        <div>
          <p class="font-semibold text-sm">{toast.title}</p>
          <p class="text-sm opacity-90 mt-0.5">{toast.body}</p>
        </div>
        <button
          onclick|stopPropagation={() => notifications.dismiss(toast.id)}
          class="opacity-70 hover:opacity-100 text-lg leading-none"
          aria-label="Dismiss notification"
        >
          &times;
        </button>
      </div>
    </div>
  {/each}
</div>
```

## Cursor and Presence Tracking

Show where other users are on the page in real time -- popular in collaborative tools like Figma and Google Docs:

```typescript
// src/lib/state/presence.svelte.ts
interface UserPresence {
  userId: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  lastSeen: number;
}

class PresenceStore {
  users = $state<Map<string, UserPresence>>(new Map());
  activeUsers = $derived(
    Array.from(this.users.values()).filter(u => Date.now() - u.lastSeen < 30_000)
  );

  private ws: WebSocket | null = null;
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingCursor: { x: number; y: number } | null = null;

  connect(roomId: string, user: { id: string; name: string }) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/api/presence/${roomId}`);

    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({
        type: 'join',
        userId: user.id,
        name: user.name
      }));
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'cursor': {
          const existing = this.users.get(msg.userId);
          if (existing) {
            existing.cursor = msg.cursor;
            existing.lastSeen = Date.now();
          } else {
            this.users.set(msg.userId, {
              userId: msg.userId,
              name: msg.name,
              color: this.assignColor(msg.userId),
              cursor: msg.cursor,
              lastSeen: Date.now()
            });
          }
          break;
        }

        case 'join': {
          this.users.set(msg.userId, {
            userId: msg.userId,
            name: msg.name,
            color: this.assignColor(msg.userId),
            cursor: null,
            lastSeen: Date.now()
          });
          break;
        }

        case 'leave': {
          this.users.delete(msg.userId);
          break;
        }
      }
    };

    // Periodically clean up stale users
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [id, user] of this.users) {
        if (now - user.lastSeen > 30_000) {
          this.users.delete(id);
        }
      }
    }, 10_000);

    this.ws.onclose = () => {
      clearInterval(cleanup);
    };
  }

  /**
   * Send cursor position, throttled to 50ms (20fps).
   * Without throttling, mousemove fires 60+ times/second -- far too much network traffic.
   */
  sendCursor(x: number, y: number) {
    this.pendingCursor = { x, y };

    if (this.throttleTimer) return; // Already scheduled

    this.throttleTimer = setTimeout(() => {
      if (this.pendingCursor && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'cursor',
          cursor: this.pendingCursor
        }));
      }
      this.pendingCursor = null;
      this.throttleTimer = null;
    }, 50);
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
    this.users.clear();
  }

  private assignColor(userId: string): string {
    const colors = [
      '#ef4444', '#f97316', '#eab308', '#22c55e',
      '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
    ];
    let hash = 0;
    for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) & 0x7fffffff;
    return colors[hash % colors.length];
  }
}

export const presence = new PresenceStore();
```

The cursor component renders each user's cursor with a label:

```svelte
<!-- src/lib/components/CursorOverlay.svelte -->
<script lang="ts">
  import { presence } from '$lib/state/presence.svelte';

  let { currentUserId }: { currentUserId: string } = $props();

  // Filter out the current user's own cursor
  let otherUsers = $derived(
    presence.activeUsers.filter(u => u.userId !== currentUserId && u.cursor)
  );
</script>

<svelte:window onpointermove={(e) => presence.sendCursor(e.clientX, e.clientY)} />

{#each otherUsers as user (user.userId)}
  {#if user.cursor}
    <div
      class="pointer-events-none fixed z-[9999] transition-all duration-75"
      style="left: {user.cursor.x}px; top: {user.cursor.y}px;"
    >
      <!-- Cursor arrow SVG -->
      <svg width="16" height="16" viewBox="0 0 16 16" fill={user.color}>
        <path d="M0 0 L16 6 L6 16 Z" />
      </svg>
      <!-- User label -->
      <span
        class="absolute left-4 top-4 text-xs text-white px-1.5 py-0.5 rounded whitespace-nowrap"
        style="background: {user.color}"
      >
        {user.name}
      </span>
    </div>
  {/if}
{/each}
```

## Collaborative Todo List with Real-Time Sync

Here is a complete collaborative todo list where changes sync across all connected clients:

```typescript
// src/lib/state/collaborative-todos.svelte.ts
interface Todo {
  id: string;
  text: string;
  done: boolean;
  createdBy: string;
  updatedAt: number;
}

interface TodoOperation {
  type: 'add' | 'toggle' | 'delete' | 'update';
  todo?: Partial<Todo> & { id: string };
  id?: string;
  timestamp: number;
  userId: string;
}

class CollaborativeTodoList {
  todos = $state<Todo[]>([]);
  connected = $state(false);
  pendingOps = $state<TodoOperation[]>([]);

  private ws: WebSocket | null = null;
  private userId = '';

  connect(roomId: string, userId: string) {
    this.userId = userId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${window.location.host}/api/todos/${roomId}`);

    this.ws.onopen = () => {
      this.connected = true;
      // Flush any pending operations from offline
      this.flushPendingOps();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'sync':
          // Full state sync from server
          this.todos = msg.todos;
          break;

        case 'add':
          if (!this.todos.some(t => t.id === msg.todo.id)) {
            this.todos = [...this.todos, msg.todo];
          }
          break;

        case 'toggle':
          this.applyToggle(msg.id, msg.done, msg.timestamp);
          break;

        case 'delete':
          this.todos = this.todos.filter(t => t.id !== msg.id);
          break;

        case 'update':
          this.applyUpdate(msg.todo, msg.timestamp);
          break;
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      // Reconnect after delay
      setTimeout(() => this.connect(roomId, userId), 2000);
    };
  }

  /**
   * Add a todo. Applies locally immediately (optimistic),
   * then sends to server for broadcast.
   */
  addTodo(text: string) {
    const todo: Todo = {
      id: crypto.randomUUID(),
      text,
      done: false,
      createdBy: this.userId,
      updatedAt: Date.now()
    };

    // Optimistic local update
    this.todos = [...this.todos, todo];

    // Send to server
    this.sendOrQueue({ type: 'add', todo, timestamp: Date.now(), userId: this.userId });
  }

  /**
   * Toggle a todo's done state. Uses "last writer wins" for conflict resolution.
   */
  toggleTodo(id: string) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    // Optimistic toggle
    todo.done = !todo.done;
    todo.updatedAt = Date.now();

    this.sendOrQueue({
      type: 'toggle',
      id,
      todo: { id, done: todo.done },
      timestamp: Date.now(),
      userId: this.userId
    });
  }

  /**
   * Delete a todo. No conflict resolution needed -- deletes always win.
   */
  deleteTodo(id: string) {
    this.todos = this.todos.filter(t => t.id !== id);
    this.sendOrQueue({ type: 'delete', id, timestamp: Date.now(), userId: this.userId });
  }

  private sendOrQueue(op: TodoOperation) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(op));
    } else {
      // Offline -- queue the operation
      this.pendingOps = [...this.pendingOps, op];
      this.persistPendingOps();
    }
  }

  private flushPendingOps() {
    if (this.pendingOps.length === 0) return;

    for (const op of this.pendingOps) {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(op));
      }
    }

    this.pendingOps = [];
    this.persistPendingOps();
  }

  /**
   * Apply a toggle from the server, using "last writer wins".
   * If the server's timestamp is newer, accept it.
   */
  private applyToggle(id: string, done: boolean, serverTimestamp: number) {
    const todo = this.todos.find(t => t.id === id);
    if (!todo) return;

    if (serverTimestamp >= todo.updatedAt) {
      todo.done = done;
      todo.updatedAt = serverTimestamp;
    }
    // If our local update is newer, ignore the server update (our next sync will fix it)
  }

  private applyUpdate(serverTodo: Partial<Todo> & { id: string }, serverTimestamp: number) {
    const local = this.todos.find(t => t.id === serverTodo.id);
    if (!local) return;

    if (serverTimestamp >= local.updatedAt) {
      Object.assign(local, serverTodo);
      local.updatedAt = serverTimestamp;
    }
  }

  private persistPendingOps() {
    if (typeof window !== 'undefined') {
      if (this.pendingOps.length > 0) {
        localStorage.setItem('pending-todo-ops', JSON.stringify(this.pendingOps));
      } else {
        localStorage.removeItem('pending-todo-ops');
      }
    }
  }

  disconnect() {
    this.ws?.close();
    this.ws = null;
  }
}

export const todoList = new CollaborativeTodoList();
```

The collaborative todo component:

```svelte
<!-- src/routes/todos/[roomId]/+page.svelte -->
<script lang="ts">
  import { todoList } from '$lib/state/collaborative-todos.svelte';
  import { presence } from '$lib/state/presence.svelte';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';

  let { data } = $props();
  let newTodoText = $state('');

  let remaining = $derived(todoList.todos.filter(t => !t.done).length);
  let completed = $derived(todoList.todos.filter(t => t.done).length);

  onMount(() => {
    todoList.connect(data.roomId, data.user.id);
    presence.connect(data.roomId, data.user);

    return () => {
      todoList.disconnect();
      presence.disconnect();
    };
  });

  function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;

    todoList.addTodo(text);
    newTodoText = '';
  }
</script>

<div class="max-w-lg mx-auto p-6">
  <div class="flex justify-between items-center mb-6">
    <h1 class="text-2xl font-bold">Collaborative Todos</h1>
    <div class="flex items-center gap-2">
      <span
        class="w-2 h-2 rounded-full {todoList.connected ? 'bg-green-500' : 'bg-red-500'}"
      ></span>
      <span class="text-sm text-gray-500">
        {todoList.connected ? 'Connected' : 'Reconnecting...'}
      </span>
    </div>
  </div>

  <!-- Active users -->
  {#if presence.activeUsers.length > 0}
    <div class="flex items-center gap-1 mb-4">
      <span class="text-sm text-gray-500">Online:</span>
      {#each presence.activeUsers as user (user.userId)}
        <span
          class="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
          style="background: {user.color}"
          title={user.name}
        >
          {user.name.charAt(0).toUpperCase()}
        </span>
      {/each}
    </div>
  {/if}

  <!-- Pending operations indicator -->
  {#if todoList.pendingOps.length > 0}
    <div class="bg-yellow-50 border border-yellow-200 text-yellow-700 px-3 py-2 rounded text-sm mb-4">
      {todoList.pendingOps.length} change(s) waiting to sync
    </div>
  {/if}

  <!-- Add form -->
  <form onsubmit={handleSubmit} class="flex gap-2 mb-6">
    <input
      type="text"
      bind:value={newTodoText}
      placeholder="Add a todo..."
      class="flex-1 border rounded px-3 py-2"
    />
    <button
      type="submit"
      disabled={!newTodoText.trim()}
      class="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
    >
      Add
    </button>
  </form>

  <!-- Todo list -->
  <ul class="space-y-2">
    {#each todoList.todos as todo (todo.id)}
      <li
        class="flex items-center gap-3 p-3 border rounded-lg group"
        transition:fade={{ duration: 150 }}
      >
        <input
          type="checkbox"
          checked={todo.done}
          onchange={() => todoList.toggleTodo(todo.id)}
          class="w-5 h-5 rounded"
        />
        <span class="flex-1 {todo.done ? 'line-through text-gray-400' : ''}">
          {todo.text}
        </span>
        <button
          onclick={() => todoList.deleteTodo(todo.id)}
          class="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Delete
        </button>
      </li>
    {/each}
  </ul>

  <!-- Summary -->
  {#if todoList.todos.length > 0}
    <p class="text-sm text-gray-500 mt-4">
      {remaining} remaining, {completed} completed
    </p>
  {/if}
</div>
```

## State Reconciliation Strategies

When multiple users edit the same data simultaneously, conflicts arise. Here are the three main strategies:

```
1. Last Writer Wins (LWW)
   - Each update has a timestamp
   - The update with the latest timestamp wins
   - Simple, but can lose data
   - Best for: toggles, status changes, non-critical fields

2. Operational Transform (OT)
   - Transforms concurrent operations against each other
   - Preserves intent of all operations
   - Complex to implement correctly
   - Best for: text editing (Google Docs style)

3. Conflict-free Replicated Data Types (CRDTs)
   - Data structures that merge automatically without conflicts
   - Mathematically guaranteed convergence
   - Higher memory overhead
   - Best for: counters, sets, registers, offline-first apps
```

For the collaborative todo list, we use LWW for toggles and "delete wins" for deletions. This is good enough for most applications. If you need OT or CRDTs, look at libraries like Yjs or Automerge.

## Offline Support

Queue operations when offline and replay them when the connection is restored:

```typescript
// src/lib/utils/offline-queue.svelte.ts
interface QueuedOperation {
  id: string;
  operation: Record<string, unknown>;
  timestamp: number;
  retries: number;
}

class OfflineQueue {
  queue = $state<QueuedOperation[]>([]);
  isOnline = $state(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor() {
    if (typeof window === 'undefined') return;

    // Load persisted queue
    const saved = localStorage.getItem('offline-queue');
    if (saved) {
      try { this.queue = JSON.parse(saved); } catch { /* ignore */ }
    }

    // Track online/offline status
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.flush();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  enqueue(operation: Record<string, unknown>) {
    this.queue.push({
      id: crypto.randomUUID(),
      operation,
      timestamp: Date.now(),
      retries: 0
    });
    this.persist();

    if (this.isOnline) {
      this.flush();
    }
  }

  async flush() {
    const toProcess = [...this.queue];

    for (const item of toProcess) {
      try {
        await this.sendOperation(item.operation);
        this.queue = this.queue.filter(q => q.id !== item.id);
      } catch {
        item.retries++;
        if (item.retries >= 5) {
          // Give up after 5 retries
          this.queue = this.queue.filter(q => q.id !== item.id);
          console.error('Dropping operation after 5 retries:', item.operation);
        }
      }
    }

    this.persist();
  }

  private async sendOperation(op: Record<string, unknown>) {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op)
    });

    if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
  }

  private persist() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('offline-queue', JSON.stringify(this.queue));
    }
  }
}

export const offlineQueue = new OfflineQueue();
```

## Throttling and Debouncing for Rapid Updates

When events arrive faster than the UI can render, batch them:

```typescript
// src/lib/utils/throttle.ts

/**
 * Throttle: execute at most once per interval.
 * Good for: cursor tracking, scroll events, resize events.
 */
export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  intervalMs: number
): T {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T>;

  return ((...args: Parameters<T>) => {
    lastArgs = args;
    const now = Date.now();
    const remaining = intervalMs - (now - lastRun);

    if (remaining <= 0) {
      if (timer) { clearTimeout(timer); timer = null; }
      lastRun = now;
      fn(...args);
    } else if (!timer) {
      // Schedule a trailing call
      timer = setTimeout(() => {
        lastRun = Date.now();
        timer = null;
        fn(...lastArgs);
      }, remaining);
    }
  }) as T;
}

/**
 * Debounce: wait until activity stops, then execute once.
 * Good for: search input, form validation, save triggers.
 */
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delayMs: number
): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;

  const debounced = ((...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delayMs);
  }) as T & { cancel: () => void };

  debounced.cancel = () => clearTimeout(timer);

  return debounced;
}
```

Use throttling for real-time cursor updates and debouncing for search:

```svelte
<script>
  import { throttle, debounce } from '$lib/utils/throttle';
  import { presence } from '$lib/state/presence.svelte';

  // Cursor: throttled to 50ms (20 updates/second)
  const handleMouseMove = throttle((e: PointerEvent) => {
    presence.sendCursor(e.clientX, e.clientY);
  }, 50);

  // Search: debounced to 300ms
  let searchResults = $state([]);
  const search = debounce(async (query: string) => {
    if (!query.trim()) { searchResults = []; return; }
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    searchResults = await res.json();
  }, 300);
</script>

<svelte:window onpointermove={handleMouseMove} />

<input oninput={(e) => search(e.currentTarget.value)} placeholder="Search..." />
```

## Virtual Scrolling for Update Streams

When you have hundreds or thousands of real-time updates (logs, chat messages, activity feeds), rendering them all kills performance. Virtual scrolling renders only the visible items:

```svelte
<!-- src/lib/components/VirtualList.svelte -->
<script lang="ts">
  let {
    items,
    itemHeight = 40,
    containerHeight = 400
  }: {
    items: any[];
    itemHeight?: number;
    containerHeight?: number;
  } = $props();

  let scrollTop = $state(0);

  let visibleStart = $derived(Math.floor(scrollTop / itemHeight));
  let visibleEnd = $derived(
    Math.min(visibleStart + Math.ceil(containerHeight / itemHeight) + 1, items.length)
  );
  let visibleItems = $derived(items.slice(visibleStart, visibleEnd));
  let totalHeight = $derived(items.length * itemHeight);
  let offsetY = $derived(visibleStart * itemHeight);
</script>

<div
  class="overflow-auto"
  style="height: {containerHeight}px"
  onscroll={(e) => scrollTop = e.currentTarget.scrollTop}
>
  <div style="height: {totalHeight}px; position: relative;">
    <div style="transform: translateY({offsetY}px);">
      {#each visibleItems as item, i (item.id ?? visibleStart + i)}
        <div style="height: {itemHeight}px;" class="flex items-center px-4 border-b">
          <slot {item} index={visibleStart + i} />
        </div>
      {/each}
    </div>
  </div>
</div>
```

Usage with a live activity feed:

```svelte
<script>
  import VirtualList from '$lib/components/VirtualList.svelte';

  let activities = $state([]);
  // ... populate from SSE stream
</script>

<VirtualList items={activities} itemHeight={48} containerHeight={500}>
  {#snippet children({ item })}
    <span class="text-sm">
      <strong>{item.user}</strong> {item.action} --
      <time class="text-gray-400">{new Date(item.timestamp).toLocaleTimeString()}</time>
    </span>
  {/snippet}
</VirtualList>
```

## Try It

1. Extend the notification system with a notification bell dropdown. Show the unread count as a badge, list recent notifications in a dropdown panel, and let the user mark individual items as read or dismiss them.

2. Build a collaborative whiteboard where users can see each other's cursors and draw simple shapes (rectangles, circles). Use the presence system for cursors and WebSockets for shape data.

3. Add offline support to the collaborative todo list. When the user goes offline, queue operations in `localStorage`. When they come back online, replay the queued operations. Show an "offline" indicator in the UI.

4. Implement a live chat component with virtual scrolling. Messages should appear instantly for the sender (optimistic) and within a second for other participants. Support 1000+ messages without performance degradation.

## Key Takeaways

- Use SSE for server-to-client push notifications and WebSockets when the client also needs to send messages
- Always include heartbeats in SSE streams to keep connections alive through proxies
- Exponential backoff on reconnection prevents thundering herd problems after server outages
- Manage real-time data with dedicated state classes that handle add, read, dismiss, and persistence
- Throttle cursor/pointer events to 50ms (20fps) -- higher rates waste bandwidth without visible improvement
- Optimistic updates show results instantly; roll back on failure for a snappy user experience
- "Last writer wins" with timestamps is sufficient for most collaborative features; use CRDTs or OT only when data loss is unacceptable
- Queue operations offline and replay them on reconnection -- persist the queue in `localStorage`
- Virtual scrolling renders only visible items, enabling smooth performance with thousands of real-time updates
- Always clean up connections (EventSource, WebSocket) when components unmount via the `$effect` cleanup function
