# WebSocket Basics

Server-Sent Events are great when the server needs to push data to the client, but what happens when you need **two-way communication**? A chat app, a collaborative editor, or a multiplayer game requires both sides to send and receive messages at any time. That is what WebSockets are for.

WebSockets create a persistent, bi-directional connection between the browser and the server. Once the connection is open, either side can send messages instantly without the overhead of HTTP request/response cycles. The connection stays open until one side explicitly closes it. Unlike HTTP, where the client always initiates communication, a WebSocket server can push data to the client at any time — and the client can push back.

## The WebSocket Protocol

A WebSocket connection starts life as a regular HTTP request. The client sends an `Upgrade` header asking to switch protocols. If the server agrees, it responds with `101 Switching Protocols`, and from that point on, the connection uses the WebSocket frame protocol instead of HTTP.

Here is what the handshake looks like on the wire:

```
Client Request:
GET /ws HTTP/1.1
Host: example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Origin: https://example.com

Server Response:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

The `Sec-WebSocket-Key` is a random value the client generates. The server hashes it with a known GUID and returns the result as `Sec-WebSocket-Accept`. This is not authentication — it is a handshake verification to prevent accidental HTTP connections from being treated as WebSocket connections.

After the handshake, data flows as **frames** — lightweight binary envelopes that carry your messages. Frames can be text, binary, ping/pong (keepalive), or close frames. The protocol is full-duplex: both sides can send frames simultaneously without waiting for a response.

### Why WebSockets Instead of Polling or SSE?

The decision tree is straightforward:

- **Server pushes data to the client only (no client-to-server messages)?** Use Server-Sent Events. Simpler, works over HTTP, automatic reconnection built in.
- **Client sends data to the server only?** Use regular HTTP requests. No persistent connection needed.
- **Both sides need to send messages to each other in real time?** WebSockets. Chat, collaborative editing, multiplayer games, live trading.
- **You need real-time updates but WebSocket infrastructure is too complex?** Consider polling with a short interval (1-5 seconds) for low-frequency updates.

WebSockets are more complex to operate than SSE or polling. They require sticky sessions (or a pub/sub layer) for multi-server setups, they do not work through most HTTP proxies without special configuration, and they consume a persistent TCP connection per client. Use them when the use case genuinely requires bidirectional real-time communication.

## Setting Up a WebSocket Server with SvelteKit

SvelteKit does not have built-in WebSocket support because WebSockets are a server-level concern that varies by adapter and runtime. The approach depends on which adapter you use. Here is the setup for the Node adapter, which is the most common for custom server deployments.

```bash
npm install ws
npm install -D @types/ws
```

Create a custom server entry that hooks into Node's HTTP server:

```typescript
// server.ts — Custom server entry point
import { handler } from './build/handler.js';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';

const app = express();
const server = createServer(app);

// Create WebSocket server attached to the HTTP server
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients with metadata
interface Client {
  ws: WebSocket;
  userId: string | null;
  username: string;
  joinedAt: number;
}

const clients = new Set<Client>();

wss.on('connection', (ws, request) => {
  const client: Client = {
    ws,
    userId: null,
    username: 'Anonymous',
    joinedAt: Date.now()
  };

  clients.add(client);
  console.log(`Client connected. Total: ${clients.size}`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'system',
    text: 'Connected to chat server',
    timestamp: Date.now()
  }));

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      handleMessage(client, message);
    } catch (err) {
      ws.send(JSON.stringify({
        type: 'error',
        text: 'Invalid message format. Expected JSON.'
      }));
    }
  });

  ws.on('close', (code, reason) => {
    clients.delete(client);
    console.log(`Client disconnected (${code}). Total: ${clients.size}`);

    if (client.username !== 'Anonymous') {
      broadcast({
        type: 'system',
        text: `${client.username} left the chat`,
        timestamp: Date.now()
      });
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clients.delete(client);
  });

  // Keepalive ping every 30 seconds
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30_000);
});

function handleMessage(client: Client, message: any) {
  switch (message.type) {
    case 'join':
      client.username = message.username || 'Anonymous';
      client.userId = message.userId || null;
      broadcast({
        type: 'system',
        text: `${client.username} joined the chat`,
        timestamp: Date.now()
      });
      break;

    case 'chat':
      if (!message.text || typeof message.text !== 'string') return;
      broadcast({
        type: 'chat',
        username: client.username,
        text: message.text.slice(0, 1000), // Limit message length
        timestamp: Date.now()
      });
      break;

    case 'typing':
      broadcastExcept(client, {
        type: 'typing',
        username: client.username
      });
      break;
  }
}

function broadcast(message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client.ws.readyState === client.ws.OPEN) {
      client.ws.send(data);
    }
  }
}

function broadcastExcept(sender: Client, message: object) {
  const data = JSON.stringify(message);
  for (const client of clients) {
    if (client !== sender && client.ws.readyState === client.ws.OPEN) {
      client.ws.send(data);
    }
  }
}

// Let SvelteKit handle all non-WebSocket requests
app.use(handler);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

Update your `package.json` to use the custom server:

```json
{
  "scripts": {
    "start": "node server.js"
  }
}
```

## Connection Lifecycle

Every WebSocket connection moves through a strict state machine:

```
CONNECTING (0) → OPEN (1) → CLOSING (2) → CLOSED (3)
```

1. **CONNECTING** — The HTTP upgrade handshake is in progress. You cannot send messages yet.
2. **OPEN** — The connection is active. Messages can flow in both directions.
3. **CLOSING** — One side has initiated a close. The closing handshake is in progress. You should not send new messages.
4. **CLOSED** — The connection is terminated. The underlying TCP socket is released.

Always check `readyState` before sending:

```typescript
function safeSend(ws: WebSocket, data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(data);
  }
}
```

### Close Codes

WebSocket close frames include a status code that explains why the connection was closed:

```
1000  Normal closure (clean disconnect)
1001  Going away (page navigation, server shutdown)
1002  Protocol error
1003  Unsupported data type
1005  No status code present (abnormal)
1006  Abnormal closure (no close frame received — usually network issue)
1008  Policy violation
1009  Message too large
1011  Server error
1012  Server restart
1013  Try again later
3000-4999  Available for application-specific use
```

Code 1006 is the one you will see most often in production. It means the connection dropped without a proper close handshake — the network went down, the user closed their laptop, or a proxy killed the connection. Your reconnection logic should handle this gracefully.

## Client-Side WebSocket with Svelte

Build a robust client-side connection with automatic reconnection:

```svelte
<!-- src/lib/components/Chat.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  interface ChatMessage {
    type: 'chat' | 'system' | 'error' | 'typing';
    username?: string;
    text?: string;
    timestamp?: number;
  }

  let messages = $state<ChatMessage[]>([]);
  let input = $state('');
  let username = $state('');
  let connected = $state(false);
  let joined = $state(false);
  let typingUsers = $state<Set<string>>(new Set());
  let ws: WebSocket | null = null;
  let reconnectAttempts = 0;
  let reconnectTimeout: ReturnType<typeof setTimeout>;
  let typingTimeout: ReturnType<typeof setTimeout>;
  let messageContainer: HTMLDivElement;

  function connect() {
    if (!browser) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      connected = true;
      reconnectAttempts = 0;
      console.log('WebSocket connected');

      // Re-join if we were previously in the chat
      if (username) {
        ws!.send(JSON.stringify({ type: 'join', username }));
        joined = true;
      }
    };

    ws.onmessage = (event) => {
      const message: ChatMessage = JSON.parse(event.data);

      if (message.type === 'typing') {
        if (message.username) {
          typingUsers.add(message.username);
          typingUsers = new Set(typingUsers); // Trigger reactivity

          // Clear typing indicator after 3 seconds of no updates
          setTimeout(() => {
            typingUsers.delete(message.username!);
            typingUsers = new Set(typingUsers);
          }, 3000);
        }
        return;
      }

      messages = [...messages, message];

      // Auto-scroll to bottom
      requestAnimationFrame(() => {
        if (messageContainer) {
          messageContainer.scrollTop = messageContainer.scrollHeight;
        }
      });
    };

    ws.onclose = (event) => {
      connected = false;
      console.log(`WebSocket closed: ${event.code} ${event.reason}`);

      // Do not reconnect on intentional close
      if (event.code === 1000) return;

      scheduleReconnect();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      // onclose will fire after onerror, so reconnection is handled there
    };
  }

  function scheduleReconnect() {
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    const jitter = Math.random() * baseDelay * 0.5;
    const delay = baseDelay + jitter;

    reconnectAttempts++;
    console.log(`Reconnecting in ${Math.round(delay)}ms (attempt ${reconnectAttempts})`);

    reconnectTimeout = setTimeout(connect, delay);
  }

  function joinChat() {
    if (!username.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: 'join', username: username.trim() }));
    joined = true;
  }

  function sendMessage() {
    if (!input.trim() || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({
      type: 'chat',
      text: input.trim()
    }));
    input = '';
  }

  function sendTypingIndicator() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    clearTimeout(typingTimeout);
    ws.send(JSON.stringify({ type: 'typing' }));

    // Debounce — only send typing indicator every 2 seconds
    typingTimeout = setTimeout(() => {}, 2000);
  }

  function disconnect() {
    if (ws) {
      ws.close(1000, 'User left');
      ws = null;
    }
    clearTimeout(reconnectTimeout);
    connected = false;
    joined = false;
  }

  $effect(() => {
    connect();
    return () => {
      disconnect();
      clearTimeout(reconnectTimeout);
      clearTimeout(typingTimeout);
    };
  });
</script>

{#if !joined}
  <div class="join-form">
    <h2>Join Chat</h2>
    <input
      bind:value={username}
      placeholder="Enter your name"
      onkeydown={(e) => e.key === 'Enter' && joinChat()}
    />
    <button onclick={joinChat} disabled={!connected || !username.trim()}>
      {connected ? 'Join' : 'Connecting...'}
    </button>
  </div>
{:else}
  <div class="chat">
    <div class="status">
      <span class="dot" class:connected></span>
      {connected ? 'Connected' : 'Reconnecting...'}
    </div>

    <div class="messages" bind:this={messageContainer}>
      {#each messages as msg}
        {#if msg.type === 'system'}
          <div class="system-message">{msg.text}</div>
        {:else if msg.type === 'chat'}
          <div class="chat-message">
            <strong>{msg.username}</strong>
            <span class="time">
              {new Date(msg.timestamp!).toLocaleTimeString()}
            </span>
            <p>{msg.text}</p>
          </div>
        {:else if msg.type === 'error'}
          <div class="error-message">{msg.text}</div>
        {/if}
      {/each}
    </div>

    {#if typingUsers.size > 0}
      <div class="typing-indicator">
        {[...typingUsers].join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
      </div>
    {/if}

    <div class="input-area">
      <input
        bind:value={input}
        placeholder="Type a message..."
        oninput={sendTypingIndicator}
        onkeydown={(e) => e.key === 'Enter' && sendMessage()}
        disabled={!connected}
      />
      <button onclick={sendMessage} disabled={!connected || !input.trim()}>
        Send
      </button>
    </div>
  </div>
{/if}

<style>
  .dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    margin-right: 6px;
  }
  .dot.connected {
    background: #22c55e;
  }
  .messages {
    height: 400px;
    overflow-y: auto;
    border: 1px solid #e5e7eb;
    padding: 1rem;
    margin: 1rem 0;
  }
  .system-message {
    color: #6b7280;
    font-style: italic;
    text-align: center;
    margin: 0.5rem 0;
  }
  .typing-indicator {
    color: #6b7280;
    font-size: 0.875rem;
    font-style: italic;
    padding: 0.25rem 0;
  }
  .input-area {
    display: flex;
    gap: 0.5rem;
  }
  .input-area input {
    flex: 1;
  }
</style>
```

## Message Protocol Design

For anything beyond a trivial demo, define a typed message protocol. This prevents the chaos of ad-hoc JSON shapes scattered across your codebase.

```typescript
// src/lib/types/ws-messages.ts

// Client → Server messages
type ClientMessage =
  | { type: 'join'; username: string; token?: string }
  | { type: 'chat'; text: string; replyTo?: string }
  | { type: 'typing' }
  | { type: 'read'; messageId: string }
  | { type: 'ping' };

// Server → Client messages
type ServerMessage =
  | { type: 'system'; text: string; timestamp: number }
  | { type: 'chat'; id: string; username: string; text: string; timestamp: number; replyTo?: string }
  | { type: 'typing'; username: string }
  | { type: 'presence'; users: string[] }
  | { type: 'error'; code: string; text: string }
  | { type: 'pong' };

// Validate incoming messages on the server
function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !data.type) return null;

    switch (data.type) {
      case 'join':
        if (typeof data.username !== 'string' || data.username.length === 0) return null;
        if (data.username.length > 50) return null;
        return data;
      case 'chat':
        if (typeof data.text !== 'string' || data.text.length === 0) return null;
        if (data.text.length > 2000) return null;
        return data;
      case 'typing':
      case 'ping':
        return data;
      case 'read':
        if (typeof data.messageId !== 'string') return null;
        return data;
      default:
        return null;
    }
  } catch {
    return null;
  }
}
```

The protocol is intentionally simple: every message has a `type` field that determines its shape. This makes it easy to switch on the type and handle each case. Resist the temptation to add envelopes, version fields, or correlation IDs until you actually need them — most chat and notification applications never do.

## Reconnection with Exponential Backoff and Jitter

When a WebSocket connection drops, naive reconnection (retry immediately every second) can create a **thundering herd**: if your server restarts and 10,000 clients all reconnect simultaneously, they overwhelm the server before it can recover.

Exponential backoff solves this by increasing the delay between retries: 1 second, 2 seconds, 4 seconds, 8 seconds, up to a maximum. Jitter adds randomness to spread the retries across time, preventing all clients from retrying at exactly the same moment.

```typescript
// src/lib/utils/reconnecting-websocket.ts

interface ReconnectingWebSocketOptions {
  url: string;
  maxRetries?: number;
  maxDelay?: number;
  onMessage: (data: any) => void;
  onStatusChange: (connected: boolean) => void;
}

export function createReconnectingWebSocket(options: ReconnectingWebSocketOptions) {
  const { url, maxRetries = 10, maxDelay = 30_000, onMessage, onStatusChange } = options;
  let ws: WebSocket | null = null;
  let attempts = 0;
  let intentionallyClosed = false;
  let timeout: ReturnType<typeof setTimeout>;

  function connect() {
    ws = new WebSocket(url);

    ws.onopen = () => {
      attempts = 0;
      onStatusChange(true);
    };

    ws.onmessage = (event) => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        console.error('Failed to parse WebSocket message');
      }
    };

    ws.onclose = (event) => {
      onStatusChange(false);

      if (intentionallyClosed) return;
      if (event.code === 1000) return; // Clean close

      if (attempts >= maxRetries) {
        console.error(`WebSocket: Max retries (${maxRetries}) exceeded. Giving up.`);
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at maxDelay
      const baseDelay = Math.min(1000 * Math.pow(2, attempts), maxDelay);
      // Jitter: add 0-50% random delay to spread reconnections across time
      const jitter = Math.random() * baseDelay * 0.5;
      const delay = baseDelay + jitter;

      attempts++;
      console.log(`WebSocket reconnecting in ${Math.round(delay)}ms (attempt ${attempts}/${maxRetries})`);
      timeout = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose fires after onerror — reconnection handled there
    };
  }

  function send(data: object) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  function close() {
    intentionallyClosed = true;
    clearTimeout(timeout);
    ws?.close(1000, 'Client closed');
  }

  connect();

  return { send, close };
}
```

```svelte
<script lang="ts">
  import { createReconnectingWebSocket } from '$lib/utils/reconnecting-websocket';
  import { browser } from '$app/environment';

  let messages = $state<any[]>([]);
  let connected = $state(false);

  let socket: ReturnType<typeof createReconnectingWebSocket>;

  $effect(() => {
    if (!browser) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = createReconnectingWebSocket({
      url: `${protocol}//${window.location.host}/ws`,
      maxRetries: 15,
      onMessage: (data) => {
        messages = [...messages, data];
      },
      onStatusChange: (status) => {
        connected = status;
      }
    });

    return () => socket.close();
  });
</script>
```

The `intentionallyClosed` flag is important: when the user navigates away from the page, the cleanup function calls `close()`, and you do not want the reconnection logic to fight against the intentional disconnect.

## Authentication During the WebSocket Upgrade

WebSocket connections do not support custom headers in browser APIs. You cannot send an `Authorization: Bearer <token>` header with a WebSocket connection from JavaScript. There are three approaches to authentication:

### 1. Token in the URL (simple, works for most cases)

```typescript
// Client
const token = getAuthToken();
const ws = new WebSocket(`wss://example.com/ws?token=${token}`);

// Server
wss.on('connection', (ws, request) => {
  const url = new URL(request.url, 'http://localhost');
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }

  try {
    const user = verifyToken(token);
    // Associate user with this connection
    ws.userId = user.id;
    ws.username = user.name;
  } catch {
    ws.close(1008, 'Invalid token');
    return;
  }
});
```

This is the most common approach. The token appears in the URL, which means it shows up in server logs. For most applications this is acceptable since WebSocket URLs are not shared or bookmarked. If your security requirements prohibit tokens in URLs, use approach 2 or 3.

### 2. Cookie-Based (leverages existing session)

```typescript
// Server — parse cookies from the upgrade request
import { parse } from 'cookie';

wss.on('connection', async (ws, request) => {
  const cookies = parse(request.headers.cookie || '');
  const sessionId = cookies.session;

  if (!sessionId) {
    ws.close(1008, 'No session cookie');
    return;
  }

  const session = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session.length) {
    ws.close(1008, 'Invalid session');
    return;
  }

  // Connection is authenticated
  ws.userId = session[0].userId;
});
```

Cookie-based auth is the cleanest when your application already uses cookie-based sessions (as most SvelteKit apps do). The browser automatically sends cookies during the WebSocket handshake.

### 3. First-Message Authentication

```typescript
// Client sends auth as the first message after connection
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'auth', token: getAuthToken() }));
};

// Server requires auth before accepting other messages
wss.on('connection', (ws) => {
  let authenticated = false;
  const authTimeout = setTimeout(() => {
    if (!authenticated) ws.close(1008, 'Auth timeout');
  }, 5000);

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    if (!authenticated) {
      if (message.type === 'auth') {
        try {
          const user = verifyToken(message.token);
          authenticated = true;
          clearTimeout(authTimeout);
          ws.userId = user.id;
          ws.send(JSON.stringify({ type: 'auth_success' }));
        } catch {
          ws.close(1008, 'Invalid credentials');
        }
      }
      return; // Ignore non-auth messages until authenticated
    }

    // Handle authenticated messages
    handleMessage(ws, message);
  });
});
```

## Chat Rooms and Channels

Most real applications need multiple channels or rooms. Here is a room-based architecture:

```typescript
// src/lib/server/ws/rooms.ts

interface Room {
  name: string;
  clients: Set<Client>;
  history: Array<{ username: string; text: string; timestamp: number }>;
  maxHistory: number;
}

class RoomManager {
  private rooms = new Map<string, Room>();

  getOrCreate(name: string): Room {
    let room = this.rooms.get(name);
    if (!room) {
      room = {
        name,
        clients: new Set(),
        history: [],
        maxHistory: 100
      };
      this.rooms.set(name, room);
    }
    return room;
  }

  join(roomName: string, client: Client) {
    const room = this.getOrCreate(roomName);
    room.clients.add(client);

    // Send recent history to the joining client
    client.ws.send(JSON.stringify({
      type: 'history',
      room: roomName,
      messages: room.history
    }));

    // Notify others
    this.broadcastToRoom(roomName, {
      type: 'system',
      text: `${client.username} joined #${roomName}`,
      timestamp: Date.now()
    }, client);

    // Send updated user list
    this.broadcastToRoom(roomName, {
      type: 'presence',
      room: roomName,
      users: [...room.clients].map(c => c.username)
    });
  }

  leave(roomName: string, client: Client) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    room.clients.delete(client);

    this.broadcastToRoom(roomName, {
      type: 'system',
      text: `${client.username} left #${roomName}`,
      timestamp: Date.now()
    });

    // Clean up empty rooms
    if (room.clients.size === 0) {
      this.rooms.delete(roomName);
    }
  }

  sendToRoom(roomName: string, message: object) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    // Store in history
    if ((message as any).type === 'chat') {
      room.history.push(message as any);
      if (room.history.length > room.maxHistory) {
        room.history.shift(); // Remove oldest
      }
    }

    this.broadcastToRoom(roomName, message);
  }

  private broadcastToRoom(roomName: string, message: object, exclude?: Client) {
    const room = this.rooms.get(roomName);
    if (!room) return;

    const data = JSON.stringify(message);
    for (const client of room.clients) {
      if (client !== exclude && client.ws.readyState === client.ws.OPEN) {
        client.ws.send(data);
      }
    }
  }

  disconnectClient(client: Client) {
    for (const [name, room] of this.rooms) {
      if (room.clients.has(client)) {
        this.leave(name, client);
      }
    }
  }
}

export const roomManager = new RoomManager();
```

## Scaling WebSockets: The Multi-Server Problem

A single WebSocket server works fine for development and small deployments. But the moment you run multiple server instances (for reliability or to handle more connections), you hit a fundamental problem: Client A is connected to Server 1, and Client B is connected to Server 2. When Client A sends a message, Server 1 has no way to deliver it to Client B on Server 2.

### Solution 1: Sticky Sessions

Force all connections from the same user to the same server. Your load balancer routes based on a cookie or IP hash. This is the simplest solution but has drawbacks: if a server goes down, all its clients must reconnect to a different server and lose their context.

### Solution 2: Redis Pub/Sub

Every server subscribes to a Redis channel. When a message arrives at any server, it publishes to Redis, and all servers receive it. This is the standard production architecture:

```typescript
// src/lib/server/ws/redis-pubsub.ts
import { createClient } from 'redis';

const publisher = createClient({ url: process.env.REDIS_URL });
const subscriber = createClient({ url: process.env.REDIS_URL });

await publisher.connect();
await subscriber.connect();

// When a message arrives from a client on THIS server,
// publish it to Redis so ALL servers see it
export async function publishMessage(channel: string, message: object) {
  await publisher.publish(channel, JSON.stringify(message));
}

// Subscribe to messages from ALL servers
export async function subscribeToChannel(
  channel: string,
  handler: (message: object) => void
) {
  await subscriber.subscribe(channel, (data) => {
    try {
      handler(JSON.parse(data));
    } catch (err) {
      console.error('Failed to parse Redis message:', err);
    }
  });
}
```

```typescript
// In your WebSocket server setup:
import { publishMessage, subscribeToChannel } from './redis-pubsub';

// Subscribe to the chat channel — receive messages from ALL servers
subscribeToChannel('chat:general', (message) => {
  // Broadcast to all clients connected to THIS server
  broadcast(message);
});

// When a client sends a message, publish to Redis (not directly to local clients)
ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'chat') {
    publishMessage('chat:general', {
      type: 'chat',
      username: client.username,
      text: message.text,
      timestamp: Date.now()
    });
  }
});
```

### Solution 3: Managed Services

For production applications where WebSocket infrastructure is not your core competency, use a managed service:

- **PartyKit** — Purpose-built for real-time multiplayer. Runs on Cloudflare Workers. Handles rooms, state, and hibernation automatically.
- **Ably / Pusher** — Managed pub/sub with client libraries. You publish from your server; they deliver to connected clients.
- **Supabase Realtime** — Built on Phoenix Channels. If you already use Supabase, this is the simplest option.

```typescript
// PartyKit example — server.ts
import type * as Party from "partykit/server";

export default class ChatRoom implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    conn.send(JSON.stringify({
      type: 'system',
      text: `Welcome! ${this.room.getConnections().length} users online.`
    }));
  }

  onMessage(message: string, sender: Party.Connection) {
    // PartyKit handles broadcasting to all connections in the room
    this.room.broadcast(message, [sender.id]);
  }

  onClose(conn: Party.Connection) {
    this.room.broadcast(JSON.stringify({
      type: 'system',
      text: 'A user left the chat'
    }));
  }
}
```

PartyKit is worth serious consideration. It eliminates the entire scaling problem — no sticky sessions, no Redis, no connection state management. Each "party" (room) runs as an isolated Durable Object with its own state, and Cloudflare handles routing connections to the right instance globally.

## Heartbeat and Dead Connection Detection

Network connections can die silently. The client's laptop goes to sleep, a NAT timeout kills the connection, or a proxy drops the socket. Without heartbeats, the server keeps the dead connection in memory indefinitely.

```typescript
// Server-side heartbeat
const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const HEARTBEAT_TIMEOUT = 10_000;  // 10 seconds to respond

wss.on('connection', (ws) => {
  let isAlive = true;

  ws.on('pong', () => {
    isAlive = true;
  });

  const heartbeat = setInterval(() => {
    if (!isAlive) {
      console.log('Client did not respond to heartbeat, terminating');
      clearInterval(heartbeat);
      ws.terminate(); // Forcefully close — do not wait for close handshake
      return;
    }

    isAlive = false;
    ws.ping(); // Client must respond with pong
  }, HEARTBEAT_INTERVAL);

  ws.on('close', () => {
    clearInterval(heartbeat);
  });
});
```

The WebSocket protocol has built-in ping/pong frames. The server sends a ping, and the client's WebSocket implementation automatically responds with a pong (no application code needed on the client side). If no pong arrives within the timeout, the connection is dead and should be terminated.

## Security Considerations

WebSocket connections bypass many of the browser's built-in security mechanisms. Here are the key concerns:

```typescript
// 1. Always validate the Origin header during upgrade
server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  const allowedOrigins = ['https://yourdomain.com', 'https://www.yourdomain.com'];

  if (!origin || !allowedOrigins.includes(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// 2. Rate limit messages per connection
const MESSAGE_RATE_LIMIT = 10; // messages per second
const messageTimestamps = new Map<WebSocket, number[]>();

function isRateLimited(ws: WebSocket): boolean {
  const now = Date.now();
  const timestamps = messageTimestamps.get(ws) || [];
  const recent = timestamps.filter(t => now - t < 1000);

  if (recent.length >= MESSAGE_RATE_LIMIT) {
    return true;
  }

  recent.push(now);
  messageTimestamps.set(ws, recent);
  return false;
}

// 3. Limit message size (prevent memory exhaustion)
const wss = new WebSocketServer({
  server,
  maxPayload: 64 * 1024 // 64 KB max message size
});

// 4. Sanitize all user-generated content before broadcasting
// Never broadcast raw user input — it could contain script injections
import { escape } from 'html-escaper';

function sanitizeMessage(text: string): string {
  return escape(text.trim().slice(0, 2000));
}
```

## Try It

1. **Build a complete chat application** with the following features:
   - Join with a username
   - Multiple chat rooms (join/leave rooms with `/join #room-name`)
   - Message history (last 50 messages shown when joining a room)
   - Typing indicators that disappear after 3 seconds
   - Online user list for each room
   - Automatic reconnection with exponential backoff and jitter
   - Connection status indicator (green dot when connected, red when disconnected)

2. **Add authentication** to your WebSocket server using cookie-based sessions. Parse the session cookie during the upgrade handshake, validate it against your database, and reject unauthenticated connections with close code 1008.

3. **Implement a "live cursor" feature** where each user's cursor position is broadcast to all other users in the same room. Send cursor positions at most 15 times per second (throttle on the client), and display other users' cursors as colored dots with their username.

## Key Takeaways

- WebSockets provide persistent, bi-directional connections — use them when both client and server need to send messages to each other in real time
- The connection starts as an HTTP upgrade request and switches to the lightweight WebSocket frame protocol after the handshake
- SvelteKit does not include WebSocket support natively — you hook into the underlying Node HTTP server with the `ws` library
- Always implement reconnection with exponential backoff and jitter to prevent thundering herd problems when servers restart
- Define a typed message protocol with a `type` discriminator field — ad-hoc JSON shapes become unmanageable quickly
- Authenticate during the upgrade handshake (via URL token or cookie), not after the connection opens
- For multi-server deployments, use Redis pub/sub or a managed service like PartyKit to relay messages between server instances
- Heartbeat pings detect dead connections that would otherwise leak server memory
- Rate limit messages per connection and cap message size to prevent abuse
- Always clean up WebSocket connections in Svelte's `$effect` cleanup function to prevent memory leaks and zombie connections
