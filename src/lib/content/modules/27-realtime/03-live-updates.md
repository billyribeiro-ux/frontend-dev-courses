# Live Updates

You now know the building blocks — SSE for one-way streaming and WebSockets for two-way communication. In this lesson we combine these with smart UI patterns to build a **live notification system** that feels instant and reliable.

Real-time features are not just about the connection. They require careful thought about what happens when the network is slow, when updates conflict, and how to keep the UI responsive while waiting for the server.

## Building a Live Notification System

Start with the server-side notification stream using SSE:

```typescript
// src/routes/api/notifications/+server.ts
import type { RequestHandler } from './$types';

const clients = new Set<ReadableStreamDefaultController>();

export function broadcastNotification(notification: {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning';
}) {
  const encoder = new TextEncoder();
  const data = `data: ${JSON.stringify(notification)}\n\n`;

  clients.forEach((controller) => {
    try {
      controller.enqueue(encoder.encode(data));
    } catch {
      clients.delete(controller);
    }
  });
}

export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller);
    },
    cancel(controller) {
      clients.delete(controller);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache'
    }
  });
};
```

## Client-Side Notification State

Create a reactive state class that manages notifications:

```typescript
// src/lib/state/notifications.svelte.ts
interface Notification {
  id: string;
  title: string;
  body: string;
  type: 'info' | 'success' | 'warning';
  read: boolean;
  receivedAt: number;
}

class NotificationStore {
  items = $state<Notification[]>([]);
  unreadCount = $derived(this.items.filter(n => !n.read).length);

  add(notification: Omit<Notification, 'read' | 'receivedAt'>) {
    this.items = [
      { ...notification, read: false, receivedAt: Date.now() },
      ...this.items
    ].slice(0, 50); // Keep last 50
  }

  markRead(id: string) {
    const item = this.items.find(n => n.id === id);
    if (item) item.read = true;
  }

  markAllRead() {
    this.items.forEach(n => (n.read = true));
  }

  dismiss(id: string) {
    this.items = this.items.filter(n => n.id !== id);
  }
}

export const notifications = new NotificationStore();
```

## Connecting Stream to State

Wire up the EventSource to the notification store inside your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { notifications } from '$lib/state/notifications.svelte';

  $effect(() => {
    const source = new EventSource('/api/notifications');

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      notifications.add(data);
    };

    return () => source.close();
  });
</script>

<slot />
```

## Optimistic UI

When a user takes an action, update the UI before the server confirms it. Show the result immediately and handle failures gracefully:

```svelte
<script>
  let items = $state<Array<{ id: number; text: string }>>([]);
  let newText = $state('');

  async function addItem() {
    const text = newText.trim();
    if (!text) return;

    // Create a temporary item with a placeholder ID
    const tempId = -Date.now();
    items = [...items, { id: tempId, text }];
    newText = '';

    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const created = await res.json();

      // Replace the temp item with the real one
      items = items.map(i => (i.id === tempId ? created : i));
    } catch {
      // Remove the temp item on failure
      items = items.filter(i => i.id !== tempId);
    }
  }
</script>
```

## Debouncing Updates

When events arrive rapidly, batch them to avoid overwhelming the UI:

```typescript
// src/lib/utils/debounce.ts
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): T {
  let timer: ReturnType<typeof setTimeout>;
  return ((...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  }) as T;
}
```

```svelte
<script>
  import { debounce } from '$lib/utils/debounce';

  let searchResults = $state([]);

  const search = debounce(async (query: string) => {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    searchResults = await res.json();
  }, 300);
</script>

<input oninput={(e) => search(e.currentTarget.value)} placeholder="Search..." />
```

## Real-Time Data Syncing

For data that multiple users edit simultaneously, keep a local copy and merge server updates:

```typescript
class SyncedList {
  items = $state<Array<{ id: number; text: string; updatedAt: number }>>([]);

  applyServerUpdate(serverItems: typeof this.items) {
    serverItems.forEach((serverItem) => {
      const local = this.items.find(i => i.id === serverItem.id);
      if (!local) {
        this.items.push(serverItem);
      } else if (serverItem.updatedAt > local.updatedAt) {
        Object.assign(local, serverItem);
      }
    });
  }
}
```

## Try It

Extend the notification system with a toast component that slides in from the corner when a new notification arrives, automatically dismisses after 5 seconds, and lets the user click to dismiss early. Track which notifications have been seen using the `read` flag.

## Key Takeaways

- Use SSE for server-to-client push notifications and WebSockets when the client also needs to send messages
- Manage real-time data with a dedicated state class that handles add, read, and dismiss operations
- Optimistic updates show results instantly and roll back on failure for a snappy user experience
- Debounce rapid updates to avoid excessive re-renders and network requests
- Always clean up connections (EventSource, WebSocket) when components unmount
