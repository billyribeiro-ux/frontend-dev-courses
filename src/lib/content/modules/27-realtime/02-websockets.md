# WebSocket Basics

Server-Sent Events are great when the server needs to push data to the client, but what happens when you need **two-way communication**? A chat app, a collaborative editor, or a multiplayer game requires both sides to send and receive messages at any time. That is what WebSockets are for.

WebSockets create a persistent, bi-directional connection between the browser and the server. Once the connection is open, either side can send messages instantly without the overhead of HTTP request/response cycles. The connection stays open until one side explicitly closes it.

## The WebSocket Protocol

A WebSocket connection starts as a regular HTTP request that gets "upgraded" to the WebSocket protocol. After the handshake, the connection switches from HTTP to a lightweight binary frame protocol that is much faster for real-time messaging.

## Setting Up a WebSocket Server

SvelteKit does not have built-in WebSocket support, so you add it to your server using the `ws` library. Install it first:

```bash
npm install ws
npm install -D @types/ws
```

Then create a custom server plugin:

```typescript
// src/hooks.server.ts
import { WebSocketServer } from 'ws';
import type { Handle } from '@sveltejs/kit';

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (data) => {
    const message = data.toString();
    console.log('Received:', message);

    // Broadcast to all connected clients
    wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(message);
      }
    });
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

export const handle: Handle = async ({ event, resolve }) => {
  return resolve(event);
};
```

> **Note:** WebSocket setup varies by adapter. For the Node adapter, you hook into the HTTP server's `upgrade` event. Check the SvelteKit docs for your specific adapter.

## Connection Lifecycle

Every WebSocket connection goes through these stages:

1. **Connecting** — The handshake is in progress
2. **Open** — The connection is active, messages can flow
3. **Closing** — One side has initiated a close
4. **Closed** — The connection is terminated

## Client-Side WebSocket

Connect from a Svelte component:

```svelte
<script>
  let messages = $state<string[]>([]);
  let input = $state('');
  let ws: WebSocket;

  $effect(() => {
    ws = new WebSocket(`ws://${window.location.host}/ws`);

    ws.onopen = () => {
      console.log('Connected to WebSocket');
    };

    ws.onmessage = (event) => {
      messages = [...messages, event.data];
    };

    ws.onclose = () => {
      console.log('Disconnected');
    };

    return () => ws.close();
  });

  function send() {
    if (input.trim() && ws.readyState === WebSocket.OPEN) {
      ws.send(input);
      input = '';
    }
  }
</script>

<div>
  {#each messages as msg}
    <p>{msg}</p>
  {/each}
</div>

<input bind:value={input} onkeydown={(e) => e.key === 'Enter' && send()} />
<button onclick={send}>Send</button>
```

## Sending and Receiving JSON

For structured data, serialize messages as JSON:

```typescript
// Server side
ws.on('message', (data) => {
  const parsed = JSON.parse(data.toString());

  const response = JSON.stringify({
    type: 'chat',
    user: parsed.user,
    text: parsed.text,
    timestamp: Date.now()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(response);
  });
});
```

```js
// Client side
ws.send(JSON.stringify({ user: 'Alice', text: 'Hello!' }));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'chat') {
    messages = [...messages, data];
  }
};
```

## Try It

Build a simple chat room. Set up a WebSocket server that broadcasts messages to all connected clients. On the client, show a message list and an input field. Include the sender's name and a timestamp with each message.

## Key Takeaways

- WebSockets provide bi-directional, persistent connections between client and server
- The connection starts as HTTP and gets upgraded to the WebSocket protocol
- Use the `ws` library on the server since SvelteKit does not include WebSocket support natively
- Always clean up WebSocket connections in `$effect` return functions
- Serialize structured data as JSON when sending complex messages
- Handle all lifecycle events: `onopen`, `onmessage`, `onerror`, and `onclose`
