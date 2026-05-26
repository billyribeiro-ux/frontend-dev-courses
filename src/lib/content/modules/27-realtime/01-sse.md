# Server-Sent Events

Most web communication follows a simple pattern: the browser asks, the server responds. But what if the server needs to push updates to the browser without being asked? A new notification arrives. A long-running task finishes. A stock price changes. The user should not have to refresh the page to find out.

This is the domain of real-time communication, and there are several approaches — each with meaningful tradeoffs. Understanding which tool to reach for is a sign of architectural maturity.

## Real-Time Communication Options

Before diving into SSE, let's map the landscape:

**Polling** — The client sends requests on a timer (e.g., every 5 seconds). Simple to implement, but wasteful: most responses contain no new data, you are burning server resources and battery on empty round-trips. Acceptable for low-frequency updates where simplicity matters more than efficiency.

**Long-polling** — The client sends a request and the server holds it open until there is new data (or a timeout). When the response arrives, the client immediately sends another request. Lower latency than polling, but each "connection" is a full HTTP request/response cycle, and keeping connections open ties up server resources.

**Server-Sent Events (SSE)** — The server pushes messages to the client over a single long-lived HTTP connection. One-directional (server to client only). Built into every browser via the `EventSource` API. Automatic reconnection, event typing, and last-event-ID tracking come free. The simplest real-time solution for most use cases.

**WebSockets** — A full-duplex, bidirectional connection over a single TCP socket. Both client and server can send messages at any time. More powerful than SSE, but more complex: you handle reconnection, heartbeats, and protocol framing yourself. Also requires specific server infrastructure — WebSockets do not work with standard HTTP middleware, load balancers need special configuration, and many serverless platforms do not support them.

**The decision heuristic:** If data flows **server to client** (notifications, feeds, progress updates, dashboards), use SSE. If data flows **both directions in real time** (chat, collaborative editing, multiplayer games), use WebSockets. If updates are infrequent and latency does not matter, polling is fine.

SSE is underrated. Most "real-time" features in web apps are actually server-to-client: notifications, live feeds, progress bars, stock tickers, deployment logs. WebSockets are overkill for these. SSE gives you real-time push over plain HTTP, with automatic reconnection and zero client-side libraries.

## The SSE Protocol

The SSE protocol is remarkably simple. It is plain text over HTTP with a few conventions:

```
data: Hello, world\n\n

data: {"user": "alice", "message": "hi"}\n\n

event: notification\ndata: You have a new message\n\n

id: 42\nevent: update\ndata: {"price": 150.25}\nretry: 5000\n\n
```

The fields:

- **`data:`** — The message payload. Can span multiple lines (each prefixed with `data:`). The message ends with a blank line (`\n\n`).
- **`event:`** — An optional event type. Without it, the `message` event fires. With it, only listeners for that specific event type receive it.
- **`id:`** — An optional event ID. The browser stores this and sends it back as the `Last-Event-ID` header when reconnecting, so the server can resume from where the client left off.
- **`retry:`** — An optional reconnection interval in milliseconds. Tells the browser how long to wait before reconnecting after a disconnect.

That is the entire protocol. No binary framing, no handshake upgrade, no subprotocols. Just UTF-8 text over HTTP.

## Creating an SSE Endpoint in SvelteKit

Create a server route that returns a `ReadableStream` with the `text/event-stream` content type:

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Helper to send an SSE message
      function send(data: unknown, event?: string, id?: string) {
        let message = '';
        if (id) message += `id: ${id}\n`;
        if (event) message += `event: ${event}\n`;
        message += `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      }

      // Set the reconnection interval to 5 seconds
      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      // Send a message every 2 seconds
      let messageId = 0;
      const interval = setInterval(() => {
        messageId++;
        send(
          { time: new Date().toISOString(), message: 'Hello from the server!' },
          undefined,
          String(messageId)
        );
      }, 2000);

      // Clean up when the client disconnects
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // disable nginx buffering
    }
  });
};
```

Key details to note:

- Each message ends with two newlines (`\n\n`) — this signals the end of the event to the browser.
- The `Content-Type` must be `text/event-stream` — this tells the browser to treat the response as an event stream, not a regular download.
- `Cache-Control: no-cache` prevents caching of the stream.
- `X-Accel-Buffering: no` disables buffering in nginx, which would otherwise hold events until the buffer fills. Many reverse proxies buffer by default — this header ensures events stream through immediately.
- We listen for the `abort` signal on the request to clean up when the client disconnects. Without this, your intervals and event listeners leak.

## Consuming SSE with EventSource

On the client side, the `EventSource` API handles connection management automatically:

```svelte
<script lang="ts">
  interface ServerEvent {
    time: string;
    message: string;
  }

  let messages = $state<ServerEvent[]>([]);
  let connected = $state(false);

  $effect(() => {
    const source = new EventSource('/api/events');

    source.onopen = () => {
      connected = true;
    };

    source.onmessage = (event) => {
      const data: ServerEvent = JSON.parse(event.data);
      messages = [...messages, data];

      // Keep only the last 50 messages to prevent memory growth
      if (messages.length > 50) {
        messages = messages.slice(-50);
      }
    };

    source.onerror = () => {
      connected = false;
      // EventSource will automatically reconnect — no manual retry needed
      console.log('Connection lost. EventSource will reconnect automatically.');
    };

    return () => {
      source.close();
      connected = false;
    };
  });
</script>

<p>Status: {connected ? 'Connected' : 'Reconnecting...'}</p>

<h2>Live Events</h2>
{#each messages as msg}
  <p>{msg.time}: {msg.message}</p>
{/each}
```

The beauty of `EventSource` is what you do not have to build: automatic reconnection with configurable backoff, the `Last-Event-ID` header for resuming missed events, and proper connection lifecycle management. Compare this to a WebSocket implementation where you handle all of that yourself.

## Named Events

You can send different event types and listen for them separately:

```typescript
// Server: send named events
controller.enqueue(encoder.encode(`event: notification\ndata: ${JSON.stringify(data)}\n\n`));
controller.enqueue(encoder.encode(`event: alert\ndata: ${alertData}\n\n`));
```

```svelte
<script lang="ts">
  $effect(() => {
    const source = new EventSource('/api/events');

    // Listen for specific event types (not onmessage — that only fires for unnamed events)
    source.addEventListener('notification', (event) => {
      notifications = [...notifications, JSON.parse(event.data)];
    });

    source.addEventListener('alert', (event) => {
      alerts = [...alerts, JSON.parse(event.data)];
    });

    return () => source.close();
  });
</script>
```

This is cleaner than sending everything on the default `message` channel and switching on a `type` field in the data. The SSE protocol gives you event typing for free — use it.

## Connection Management and Heartbeats

Long-lived HTTP connections can silently die. The TCP connection may be closed by a load balancer, proxy, or firewall without either end knowing. To detect dead connections, send periodic **heartbeats**:

```typescript
// Server: send a heartbeat every 30 seconds
const heartbeat = setInterval(() => {
  // SSE comment lines (starting with :) are ignored by EventSource
  // but keep the connection alive through proxies
  controller.enqueue(encoder.encode(': heartbeat\n\n'));
}, 30_000);

request.signal.addEventListener('abort', () => {
  clearInterval(heartbeat);
  clearInterval(dataInterval);
  controller.close();
});
```

SSE comment lines (lines starting with `:`) are the perfect heartbeat mechanism. They keep the TCP connection alive through proxies and load balancers but do not trigger any events on the client. Most intermediate infrastructure closes idle connections after 60-120 seconds, so a 30-second heartbeat keeps you well within the limit.

## Reconnection and Resuming

EventSource reconnects automatically when the connection drops. You control the retry interval from the server with `retry:`. But the real power is in `id:` and `Last-Event-ID`:

```typescript
// Server: include id: with each event
controller.enqueue(encoder.encode(`id: ${eventId}\ndata: ${data}\n\n`));

// On reconnection, the browser sends Last-Event-ID automatically
export const GET: RequestHandler = async ({ request }) => {
  const lastEventId = request.headers.get('Last-Event-ID');
  // If present, send any events the client missed, then continue live
  if (lastEventId) {
    const missed = getEventsSince(Number(lastEventId));
    for (const event of missed) {
      controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event.data)}\n\n`));
    }
  }
};
```

With `id:` and `Last-Event-ID`, you get exactly-once delivery semantics across reconnections without building any retry infrastructure on the client. The browser handles it all.

## Real Example: Live Notification Feed

Here is the client side of a production notification system, combining named events, connection status, `$derived`, and accessible markup:

```svelte
<script lang="ts">
  interface Notification { id: string; title: string; body: string; timestamp: string; read: boolean; }

  let notifications = $state<Notification[]>([]);
  let unreadCount = $derived(notifications.filter(n => !n.read).length);
  let connected = $state(false);

  $effect(() => {
    const source = new EventSource('/api/notifications');
    source.onopen = () => { connected = true; };
    source.addEventListener('notification', (event) => {
      const n: Notification = JSON.parse(event.data);
      notifications = [n, ...notifications].slice(0, 100);
    });
    source.onerror = () => { connected = false; };
    return () => source.close();
  });
</script>

{#if unreadCount > 0}
  <span class="badge" aria-label="{unreadCount} unread notifications">{unreadCount}</span>
{/if}

<!-- role="log" tells screen readers to announce new items without interrupting -->
<div role="log" aria-live="polite" aria-label="Notifications">
  {#if !connected}<p>Reconnecting...</p>{/if}
  {#each notifications as n (n.id)}
    <button class:unread={!n.read} onclick={() => markAsRead(n.id)}>
      <strong>{n.title}</strong>
      <p>{n.body}</p>
      <time>{new Date(n.timestamp).toLocaleTimeString()}</time>
    </button>
  {/each}
</div>
```

The server endpoint follows the same pattern from earlier: a `ReadableStream` subscribing to a notification source for the authenticated user, with `Last-Event-ID` for resuming and a 30-second heartbeat.

## SSE Limitations and Workarounds

SSE has a few constraints to be aware of:

- **Browser connection limit** — Browsers limit the number of simultaneous HTTP/1.1 connections per domain (typically 6). Each SSE connection counts. If you open too many SSE streams, you can block regular HTTP requests. Solution: use HTTP/2 (which multiplexes connections) or consolidate multiple event streams into a single endpoint with named events.
- **No binary data** — SSE is text-only. If you need to stream binary data, use WebSockets or fetch with streaming.
- **One direction only** — The client cannot send messages back over the SSE connection. It can always send data via regular `fetch()` calls.
- **No custom headers on EventSource** — The `EventSource` API does not support custom headers (including `Authorization`). For authenticated endpoints, use cookies, URL-based tokens, or the `fetch()` API with `ReadableStream` as an alternative to `EventSource`.

## Try It

1. Build a live progress tracker: create an SSE endpoint that simulates a long-running task by sending progress updates (0% to 100%) every 500ms. On the client, display a progress bar that fills up as events arrive. Use `id:` fields so the progress can resume after a reconnection.
2. Extend the progress tracker with named events: send `event: progress` for percentage updates and `event: log` for status messages ("Downloading assets...", "Processing images...", "Generating report..."). Display both in the UI.
3. Add a heartbeat to your SSE endpoint and test disconnection by stopping and restarting your dev server.

## Key Takeaways

- SSE provides one-way server-to-client streaming over a single HTTP connection — simpler than WebSockets for most real-time use cases
- Use SSE for notifications, feeds, progress updates, and dashboards; use WebSockets only when you need bidirectional communication
- The SSE protocol is plain text: `data:`, `event:`, `id:`, and `retry:` fields, each message ending with `\n\n`
- The `EventSource` API handles automatic reconnection — you get this for free
- Use `id:` fields and `Last-Event-ID` to resume missed events after reconnection
- Send heartbeats (SSE comments with `:`) every 30 seconds to keep connections alive through proxies
- Clean up server-side resources by listening for the `abort` signal on the request
- `EventSource` does not support custom headers — use cookies or URL tokens for authentication
- Named events let you multiplex different message types over a single connection
