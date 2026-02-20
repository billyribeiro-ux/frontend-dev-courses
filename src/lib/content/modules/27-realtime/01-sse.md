# Server-Sent Events

Most web communication follows a simple pattern: the browser asks, the server responds. But what if the server needs to push updates to the browser without being asked? That is where **Server-Sent Events (SSE)** come in.

SSE is a simple, built-in browser technology that lets the server send a stream of messages to the client over a single HTTP connection. Unlike WebSockets, SSE is one-directional — the server talks, the client listens. This makes it perfect for notifications, live feeds, progress updates, and dashboards.

## How SSE Works

The browser opens a long-lived HTTP connection using the `EventSource` API. The server sends text messages in a special format, and the browser fires events as each message arrives. If the connection drops, the browser automatically reconnects.

## Creating an SSE Endpoint in SvelteKit

Create a server route that returns a streaming response:

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      // Send a message every 2 seconds
      const interval = setInterval(() => {
        const data = JSON.stringify({
          time: new Date().toISOString(),
          message: 'Hello from the server!'
        });

        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }, 2000);

      // Clean up when the client disconnects
      return () => clearInterval(interval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};
```

The key details: each message starts with `data: ` and ends with two newlines (`\n\n`). The `Content-Type` must be `text/event-stream`.

## Consuming SSE with EventSource

On the client side, the `EventSource` API handles everything:

```svelte
<script>
  let messages = $state<Array<{ time: string; message: string }>>([]);

  $effect(() => {
    const source = new EventSource('/api/events');

    source.onmessage = (event) => {
      const data = JSON.parse(event.data);
      messages = [...messages, data];
    };

    source.onerror = () => {
      console.log('Connection lost. Reconnecting...');
    };

    return () => source.close();
  });
</script>

<h2>Live Events</h2>
{#each messages as msg}
  <p>{msg.time}: {msg.message}</p>
{/each}
```

## Named Events

You can send different event types and listen for them separately:

```typescript
// Server: send a named event
controller.enqueue(encoder.encode(`event: notification\ndata: ${data}\n\n`));
controller.enqueue(encoder.encode(`event: alert\ndata: ${alertData}\n\n`));
```

```js
// Client: listen for specific events
source.addEventListener('notification', (event) => {
  console.log('Notification:', JSON.parse(event.data));
});

source.addEventListener('alert', (event) => {
  console.log('Alert:', JSON.parse(event.data));
});
```

## Reconnection

EventSource reconnects automatically when the connection drops. You can control the retry interval from the server:

```typescript
// Tell the client to retry after 5 seconds
controller.enqueue(encoder.encode(`retry: 5000\n\n`));
```

You can also send an `id` with each event so the browser can tell the server where it left off using the `Last-Event-ID` header:

```typescript
controller.enqueue(encoder.encode(`id: ${messageId}\ndata: ${data}\n\n`));
```

## Try It

Build a live progress tracker: create an SSE endpoint that simulates a long-running task by sending progress updates (0% to 100%) every 500ms. On the client, display a progress bar that fills up as events arrive.

## Key Takeaways

- SSE provides one-way server-to-client streaming over a single HTTP connection
- Messages use the `data: ...\n\n` format with `Content-Type: text/event-stream`
- The `EventSource` API handles connection management and automatic reconnection
- Use named events (`event: type`) to send different categories of updates
- Clean up EventSource connections in `$effect` return functions to prevent memory leaks
