# Server-Sent Events

Most web communication follows a simple pattern: the browser asks, the server responds. But modern applications need the server to push data to the client without being asked. A stock price changes. A deployment finishes. A teammate posts a comment. A background job completes. The user should see these things the moment they happen, not the next time they hit refresh.

There are several ways to accomplish server-to-client push, and choosing the wrong one is one of the most common architectural mistakes in frontend engineering. This lesson covers Server-Sent Events (SSE) in full production depth -- the most underrated and underused real-time technology on the web.

## The Real-Time Communication Spectrum

Before diving into SSE, you need a mental model of the entire real-time landscape. Each technology occupies a specific point on the complexity-capability spectrum, and understanding the tradeoffs prevents you from reaching for a cannon when a slingshot would do.

**Short polling** is the simplest approach: the client sends a request every N seconds and checks for new data. It is trivial to implement and works everywhere. But it wastes bandwidth when nothing has changed, introduces latency equal to the polling interval, and hammers your server with requests. If you have 10,000 connected users polling every 5 seconds, that is 2,000 requests per second doing nothing useful. Each request carries the full overhead of HTTP headers, TLS handshake (if connections are not reused), and server-side request parsing. Short polling is acceptable for dashboards that update every 30-60 seconds and where freshness is not critical -- think an admin panel showing daily order counts.

**Long polling** improves on this: the client sends a request, and the server holds the connection open until it has new data or a timeout expires. The client immediately sends another request when it gets a response. This reduces wasted requests dramatically and delivers near-instant updates. But it is awkward to implement correctly -- you need timeout handling, reconnection logic, and careful server-side connection management. Each held connection consumes a server thread or connection slot. Long polling was the workhorse of real-time web apps before SSE and WebSockets were widely supported (Gmail used it for years). It is largely obsolete now except for environments where SSE is blocked or unavailable.

**Server-Sent Events (SSE)** is a browser-native API built specifically for one-directional server-to-client streaming. The browser opens a single HTTP connection, and the server pushes text messages down it as they become available. The browser handles reconnection automatically. SSE is perfect for notifications, live feeds, progress updates, dashboards, and any scenario where the server is the primary source of new information. Because SSE uses plain HTTP, it works through every proxy, load balancer, and CDN that supports streaming responses. It is dramatically simpler than WebSockets for unidirectional flows.

**WebSockets** provide full-duplex, bidirectional communication over a single TCP connection. Both client and server can send messages at any time. This is necessary for chat applications, collaborative editing, multiplayer games, and any scenario with frequent bidirectional traffic. WebSockets are more complex to set up, harder to scale (they require sticky sessions or a pub/sub backplane), and require special handling in load balancers. They bypass the HTTP layer after the initial handshake, which means you lose standard HTTP features like cookies on each message, caching headers, and middleware. They are overkill for server-push-only scenarios.

**WebTransport** is the newest entry, built on HTTP/3 and QUIC. It supports bidirectional streams, unidirectional streams, and unreliable datagrams -- all multiplexed over a single connection without head-of-line blocking. WebTransport is the future for latency-sensitive applications like cloud gaming, live video editing, and real-time sensor telemetry. Browser support is still maturing and server-side tooling is limited. Do not reach for WebTransport unless you specifically need its advantages over WebSockets: unreliable delivery for data where dropping a frame is better than waiting for retransmission, stream multiplexing to avoid head-of-line blocking across independent data channels, or 0-RTT connection establishment.

**The decision rule is simple: use the least powerful technology that meets your requirements.** If data flows only from server to client, SSE is almost always the right choice. If data flows in both directions frequently and with low latency requirements, use WebSockets. If you are not sure, start with SSE. You can always upgrade later, and SSE's operational simplicity pays enormous dividends in production.

## The SSE Protocol Deep Dive

SSE is not a separate protocol -- it is a convention on top of HTTP. The server responds with `Content-Type: text/event-stream`, and the body is a stream of UTF-8 text following a simple format. Understanding the wire format at a byte level is essential for debugging and building production endpoints.

### The `text/event-stream` Format

An SSE response body is composed of **blocks** separated by two newlines (`\n\n`). Each block contains one or more **fields**, each on its own line. A field is a name, a colon, an optional space, and a value:

```
field-name: field-value\n
```

There are exactly four recognized field names:

**`data:`** carries the event payload. This is the only required field for an event to dispatch. Multiple `data:` lines in a single block are concatenated with newlines between them:

```
data: This is a simple message

```

Multi-line data works by repeating the `data:` prefix:

```
data: line one
data: line two
data: line three

```

The client receives `"line one\nline two\nline three"` as the event data. In practice, you almost always send a single `data:` line with JSON:

```
data: {"user": "alice", "action": "login", "timestamp": 1700000000}

```

**`event:`** names the event type. Without it, the browser fires the generic `message` event on the `EventSource` object. With it, the browser fires a named event that you listen for with `addEventListener`. This gives you multiplexing over a single connection:

```
event: user-joined
data: {"userId": "abc123", "name": "Alice"}

```

**`id:`** sets the last event ID. The browser stores this internally and sends it back as the `Last-Event-ID` HTTP header when it reconnects after a connection loss. This is the foundation of reliable delivery in SSE:

```
id: 42
data: {"price": 152.30}

```

**`retry:`** tells the browser how many milliseconds to wait before reconnecting after a connection loss. The default varies by browser (Chrome uses around 3 seconds), but you should set this explicitly:

```
retry: 5000

```

Lines starting with a colon (`:`) are **comments**. They are ignored by the client but keep the connection alive -- this is how you implement heartbeats:

```
: heartbeat

```

Here is a complete SSE stream showing all features:

```
retry: 10000

: this is a comment, used as a heartbeat

id: 1
event: notification
data: {"title": "Welcome", "body": "You are connected"}

id: 2
event: price-update
data: {"symbol": "AAPL", "price": 187.44}

id: 3
data: This is a generic message event (no event: field)

: another heartbeat

id: 4
event: notification
data: {"title": "Alert", "body": "Server maintenance in 30 minutes"}

```

### Critical Protocol Details

A few details that cause real bugs in production:

The character encoding must be UTF-8. Binary data cannot be sent directly -- you must base64-encode it into the `data:` field, which increases payload size by about 33%. If you need to stream binary data, SSE is the wrong tool.

A blank line (just `\n`) terminates the current event and dispatches it. You must have `\n\n` after the last field of each event. A common bug is sending `\n` instead of `\n\n`, which causes events to accumulate in the browser's buffer without ever dispatching.

The `id` field must not contain null characters (`\0`). Browsers silently ignore IDs with nulls, which breaks your reconnection logic without any error message. Use string or integer IDs only.

If the server sends an `id:` line with an empty value (`id:\n`), it resets the last event ID to empty, disabling `Last-Event-ID` on reconnect. This is sometimes done intentionally for events you explicitly do not want to replay (e.g., transient UI hints).

The `retry:` value is global for the connection, not per-event. The last `retry:` value the browser received is used for all subsequent reconnections. Sending `retry:` on every event is wasteful -- send it once at the start of the stream.

If a field name is not one of the four recognized names, the line is silently ignored. This means typos like `dta:` or `events:` produce no error -- your event just vanishes.

## Building a SvelteKit SSE Endpoint

Let us build a production-ready SSE endpoint in SvelteKit, step by step. We will start with the naive version and then address every problem that arises in production.

### The Naive Version

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();

      const interval = setInterval(() => {
        const data = JSON.stringify({
          time: new Date().toISOString(),
          message: 'Hello from the server!'
        });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      }, 2000);

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

This works for demos but will fail in production: no cleanup when the client disconnects (the `return` from `start` is not a cleanup mechanism -- `ReadableStream` ignores it), no heartbeat to survive proxy timeouts, no event IDs for reliable delivery, no error handling when writes fail, and no way for other parts of your application to push events into the stream.

### The Production Version

```typescript
// src/routes/api/events/+server.ts
import type { RequestHandler } from './$types';

// A registry of all active SSE connections. This lets any part of your
// server code push events to connected clients.
const connections = new Map<
  string,
  { controller: ReadableStreamDefaultController; userId: string | null }
>();
let eventCounter = 0;

// Call this from anywhere in your server code to push events.
// The optional filter callback lets you target specific connections
// (e.g., only send to the user who owns a given resource).
export function broadcast(
  eventType: string,
  data: unknown,
  filter?: (connectionId: string, userId: string | null) => boolean
) {
  const encoder = new TextEncoder();
  const id = ++eventCounter;
  const payload = `id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  const encoded = encoder.encode(payload);

  for (const [connId, conn] of connections) {
    if (filter && !filter(connId, conn.userId)) continue;
    try {
      conn.controller.enqueue(encoded);
    } catch {
      // Controller is closed or errored -- clean it up
      connections.delete(connId);
    }
  }
}

// Send to a specific user (all their connections across tabs)
export function sendToUser(userId: string, eventType: string, data: unknown) {
  broadcast(eventType, data, (_connId, uid) => uid === userId);
}

export const GET: RequestHandler = async ({ request, locals }) => {
  const connectionId = crypto.randomUUID();
  const userId = locals.user?.id ?? null;
  const encoder = new TextEncoder();

  // Check for Last-Event-ID to handle reconnection
  const lastEventId = request.headers.get('Last-Event-ID');

  const stream = new ReadableStream({
    start(controller) {
      connections.set(connectionId, { controller, userId });

      // 1. Set the reconnection interval
      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      // 2. Replay missed events if this is a reconnection
      if (lastEventId) {
        const missedEvents = getEventsSince(parseInt(lastEventId, 10));
        if (missedEvents === null) {
          // Event log has rolled over -- client needs a full resync
          controller.enqueue(
            encoder.encode(
              `event: resync\ndata: ${JSON.stringify({ reason: 'log_overflow' })}\n\n`
            )
          );
        } else {
          for (const event of missedEvents) {
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\nevent: ${event.type}\ndata: ${event.data}\n\n`
              )
            );
          }
        }
      }

      // 3. Send a welcome event so the client knows it is connected
      const welcomeId = ++eventCounter;
      controller.enqueue(
        encoder.encode(
          `id: ${welcomeId}\nevent: connected\ndata: ${JSON.stringify({
            connectionId,
            connectedAt: Date.now(),
            activeConnections: connections.size
          })}\n\n`
        )
      );

      // 4. Heartbeat every 25 seconds to survive proxy timeouts.
      // AWS ALB: 60s default. Nginx proxy_read_timeout: 60s default.
      // Cloudflare: 100s. A 25s heartbeat keeps us well within all of these.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          connections.delete(connectionId);
        }
      }, 25_000);

      // 5. Clean up when the client disconnects.
      // The AbortSignal fires when the HTTP connection closes.
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        connections.delete(connectionId);
        try {
          controller.close();
        } catch {
          // Already closed -- ignore
        }
      });
    },
    cancel() {
      // Called when the readable side is cancelled (e.g., by the runtime)
      connections.delete(connectionId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx response buffering
    }
  });
};
```

Several things are worth discussing about this production version:

**The connection registry** (`connections` Map) is the architectural keystone. It lets any part of your server push events to connected clients. Your form action handler, your webhook receiver, your cron job, your database trigger handler -- anything can call `broadcast()` or `sendToUser()`. The `userId` field in each connection enables per-user targeting. In a multi-process deployment, you would replace this in-memory Map with Redis pub/sub or a similar shared channel.

**The heartbeat** sends a comment line every 25 seconds. This is critical and its absence is the number one cause of "my SSE just stops working in production." AWS ALB kills idle connections after 60 seconds by default. Nginx's `proxy_read_timeout` defaults to 60 seconds. Cloudflare times out at 100 seconds. Without a heartbeat, your SSE connections will silently die behind any reverse proxy, and neither the server nor the client will know -- the client will just stop receiving events and eventually the browser will try to reconnect.

**The `X-Accel-Buffering: no` header** tells Nginx to stream the response immediately rather than buffering it. Without this header, Nginx accumulates SSE events in a buffer and delivers them in batches -- sometimes holding events for minutes. If you use Apache, you may need to disable `mod_deflate` for the SSE route because gzip compression also buffers output. If you use Cloudflare, SSE generally works without special headers, but you should disable Brotli compression for the SSE endpoint.

**The `request.signal` abort listener** is how you detect client disconnection in SvelteKit. When the client closes the connection (navigates away, closes the tab, or the network drops), the request's `AbortSignal` fires. You clean up the interval, remove the connection from the registry, and close the controller. Without this, you leak connections and the heartbeat interval runs forever, eventually exhausting memory.

**The `cancel()` callback** on the `ReadableStream` is a fallback cleanup path. It fires when the runtime cancels the stream from the readable side, which can happen during server shutdown or when SvelteKit's response handling encounters an error.

### The Event Log

The production endpoint references `getEventsSince()`. Here is a simple in-memory implementation. In production, you would use Redis Streams, a database table, or a message queue:

```typescript
// src/lib/server/event-log.ts
interface LoggedEvent {
  id: number;
  type: string;
  data: string;
  timestamp: number;
}

const MAX_LOG_SIZE = 10_000;
const eventLog: LoggedEvent[] = [];

export function logEvent(id: number, type: string, data: string) {
  eventLog.push({ id, type, data, timestamp: Date.now() });
  // Trim old events to prevent unbounded memory growth
  if (eventLog.length > MAX_LOG_SIZE) {
    eventLog.splice(0, eventLog.length - MAX_LOG_SIZE);
  }
}

export function getEventsSince(lastEventId: number): LoggedEvent[] | null {
  if (eventLog.length === 0) return [];

  // If the requested ID is older than our oldest event,
  // the log has rolled over and we cannot replay
  if (lastEventId < eventLog[0].id) return null;

  const startIndex = eventLog.findIndex((e) => e.id > lastEventId);
  if (startIndex === -1) return []; // Client is fully caught up
  return eventLog.slice(startIndex);
}
```

Now modify the `broadcast` function to also log events:

```typescript
import { logEvent } from '$lib/server/event-log';

export function broadcast(eventType: string, data: unknown, filter?: ...) {
  const id = ++eventCounter;
  const serialized = JSON.stringify(data);

  // Log the event for replay on reconnection
  logEvent(id, eventType, serialized);

  const payload = `id: ${id}\nevent: ${eventType}\ndata: ${serialized}\n\n`;
  const encoded = encoder.encode(payload);

  for (const [connId, conn] of connections) {
    if (filter && !filter(connId, conn.userId)) continue;
    try {
      conn.controller.enqueue(encoded);
    } catch {
      connections.delete(connId);
    }
  }
}
```

## The EventSource API

On the client side, the browser provides the `EventSource` API. It is deceptively simple, but understanding its full behavior is critical for production use.

### Constructor and Basic Usage

```svelte
<script lang="ts">
  interface ServerEvent {
    time: string;
    message: string;
  }

  let messages = $state<ServerEvent[]>([]);
  let connectionStatus = $state<'connecting' | 'open' | 'closed'>('connecting');

  $effect(() => {
    const source = new EventSource('/api/events');

    // Fires when the connection is established
    source.onopen = () => {
      connectionStatus = 'open';
    };

    // Fires for events without an event: field
    source.onmessage = (event: MessageEvent) => {
      const data: ServerEvent = JSON.parse(event.data);
      messages = [...messages, data].slice(-100); // Keep last 100
    };

    // Fires on any connection error
    source.onerror = () => {
      // readyState tells you what happened:
      // 0 = CONNECTING (reconnecting automatically)
      // 1 = OPEN (should not happen in onerror)
      // 2 = CLOSED (gave up -- server sent a non-200 or non-event-stream response)
      if (source.readyState === EventSource.CLOSED) {
        connectionStatus = 'closed';
      } else {
        connectionStatus = 'connecting';
      }
    };

    return () => {
      source.close();
      connectionStatus = 'closed';
    };
  });
</script>

<div class="connection-indicator" class:connected={connectionStatus === 'open'}>
  {connectionStatus === 'open'
    ? 'Connected'
    : connectionStatus === 'connecting'
      ? 'Reconnecting...'
      : 'Disconnected'}
</div>

<div class="events">
  {#each messages as msg}
    <p>{msg.time}: {msg.message}</p>
  {/each}
</div>
```

### readyState and Error Behavior

The `readyState` property has three values, and understanding the distinction between `CONNECTING` and `CLOSED` is essential:

- **`EventSource.CONNECTING` (0)** -- The connection is being established or re-established after a drop. The browser will keep retrying automatically.
- **`EventSource.OPEN` (1)** -- The connection is active and receiving events.
- **`EventSource.CLOSED` (2)** -- The connection is permanently closed. This happens when you call `source.close()` or when the server responds with a non-200 status code or a `Content-Type` that is not `text/event-stream`. The browser will NOT retry in this case.

This distinction matters for authentication. If the user's session expires and your SSE endpoint returns a 401, the `EventSource` will enter the `CLOSED` state and stop retrying. You need to detect this and redirect the user to login, not just show "Reconnecting..." forever.

### Named Events

When the server sends events with an `event:` field, you must use `addEventListener` to receive them. The `onmessage` handler only fires for unnamed events (events without an `event:` field):

```svelte
<script lang="ts">
  interface Notification {
    id: string;
    title: string;
    body: string;
    type: 'info' | 'warning' | 'error';
  }

  interface PriceUpdate {
    symbol: string;
    price: number;
    change: number;
  }

  let notifications = $state<Notification[]>([]);
  let prices = $state<Map<string, PriceUpdate>>(new Map());

  $effect(() => {
    const source = new EventSource('/api/events');

    const handleNotification = (event: MessageEvent) => {
      const data: Notification = JSON.parse(event.data);
      // Deduplicate by ID -- important when events are replayed on reconnection
      if (!notifications.some((n) => n.id === data.id)) {
        notifications = [data, ...notifications].slice(0, 100);
      }
    };

    const handlePrice = (event: MessageEvent) => {
      const data: PriceUpdate = JSON.parse(event.data);
      prices = new Map(prices).set(data.symbol, data);
    };

    source.addEventListener('notification', handleNotification);
    source.addEventListener('price-update', handlePrice);

    return () => {
      source.removeEventListener('notification', handleNotification);
      source.removeEventListener('price-update', handlePrice);
      source.close();
    };
  });
</script>
```

Using named events is cleaner than sending everything on the default `message` channel and switching on a `type` field in the data. The SSE protocol gives you event typing for free -- use it. Named events also make debugging easier because you can see the event type in browser DevTools without parsing the JSON payload.

### Automatic Reconnection and `Last-Event-ID`

When the connection drops, the browser automatically reconnects after the `retry` interval. On reconnection, it sends the `Last-Event-ID` header with the `id` of the last event it received. Your server uses this to replay missed events. This is the foundation of reliable delivery in SSE.

Here is a key subtlety: the `Last-Event-ID` header is sent on the reconnection HTTP request, not as part of the event stream. Some reverse proxies strip custom headers or do not forward them correctly. If you find that `Last-Event-ID` is not arriving at your server, you can work around it by also sending the last event ID as a query parameter:

```typescript
// Client-side workaround for proxies that strip Last-Event-ID
function createReliableEventSource(baseUrl: string) {
  let lastId: string | null = null;
  let source: EventSource;

  function connect() {
    const url = lastId ? `${baseUrl}?lastEventId=${encodeURIComponent(lastId)}` : baseUrl;
    source = new EventSource(url);

    source.onmessage = (event) => {
      if (event.lastEventId) lastId = event.lastEventId;
      // ... handle event
    };

    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) {
        // Server rejected us -- reconnect manually with the last ID
        setTimeout(connect, 5000);
      }
      // Otherwise EventSource reconnects automatically with Last-Event-ID
    };
  }

  connect();
  return {
    close: () => source?.close(),
    get source() { return source; }
  };
}
```

On the server, check both the header and the query parameter:

```typescript
const lastEventId =
  request.headers.get('Last-Event-ID') ??
  new URL(request.url).searchParams.get('lastEventId');
```

## Connection Management

### Heartbeats and Dead Connection Detection

In production, connections die silently in many ways. The TCP connection might still be alive at the OS level but the client's tab is closed. A proxy might have killed the connection but the server has not received the TCP RST packet. A mobile user might have walked into a tunnel. You need both heartbeats (to keep proxies from killing idle connections) and detection (to clean up server-side resources).

The heartbeat comment pattern keeps proxies happy. Dead connection detection relies on two mechanisms: the `AbortSignal` from the request (fires when the HTTP connection closes) and write failures (the `controller.enqueue()` call throws when the stream is no longer writable):

```typescript
function safeSend(
  controller: ReadableStreamDefaultController,
  data: Uint8Array
): boolean {
  try {
    controller.enqueue(data);
    return true;
  } catch {
    return false; // Stream is closed -- connection is dead
  }
}

// In the heartbeat interval:
const heartbeat = setInterval(() => {
  if (!safeSend(controller, encoder.encode(': heartbeat\n\n'))) {
    clearInterval(heartbeat);
    connections.delete(connectionId);
  }
}, 25_000);
```

### Sharing SSE Connections Across Components

If multiple components need SSE data, do not create multiple EventSource connections. Create a single connection and share it. In Svelte 5, a module-level reactive singleton works well:

```typescript
// src/lib/sse.svelte.ts
type EventHandler = (data: unknown) => void;

let source: EventSource | null = null;
let refCount = 0;
let connectionStatus = $state<'connecting' | 'open' | 'closed'>('closed');
const eventHandlers = new Map<string, Set<EventHandler>>();

function ensureConnection(url: string) {
  if (source) return;

  connectionStatus = 'connecting';
  source = new EventSource(url);

  source.onopen = () => {
    connectionStatus = 'open';
  };

  source.onerror = () => {
    connectionStatus =
      source?.readyState === EventSource.CLOSED ? 'closed' : 'connecting';
  };
}

function attachListener(eventType: string, handler: EventHandler) {
  if (!eventHandlers.has(eventType)) {
    eventHandlers.set(eventType, new Set());
    // Attach to the EventSource
    source?.addEventListener(eventType, ((e: MessageEvent) => {
      const data = JSON.parse(e.data);
      eventHandlers.get(eventType)?.forEach((h) => h(data));
    }) as EventListener);
  }
  eventHandlers.get(eventType)!.add(handler);
}

export function useSSE(url: string) {
  $effect(() => {
    refCount++;
    ensureConnection(url);

    return () => {
      refCount--;
      if (refCount === 0 && source) {
        source.close();
        source = null;
        connectionStatus = 'closed';
        eventHandlers.clear();
      }
    };
  });

  return {
    get status() { return connectionStatus; },
    on(eventType: string, handler: EventHandler) {
      $effect(() => {
        attachListener(eventType, handler);
        return () => {
          eventHandlers.get(eventType)?.delete(handler);
        };
      });
    }
  };
}
```

Usage in components:

```svelte
<script lang="ts">
  import { useSSE } from '$lib/sse.svelte';

  const sse = useSSE('/api/events');

  let notifications: Notification[] = $state([]);

  // This subscribes when the component mounts and unsubscribes when it unmounts.
  // If this is the last component using the SSE connection, the connection closes.
  sse.on('notification', (data) => {
    notifications = [data as Notification, ...notifications];
  });
</script>

<p>Connection: {sse.status}</p>
```

## Scaling SSE

### Browser Connection Limits

The most important scaling constraint for SSE in HTTP/1.1 is the **per-domain connection limit of 6**. Each tab with an SSE connection consumes one of those 6 slots. Open 6 tabs to your app, and every other request to your domain -- API calls, image loads, page navigations -- is blocked until an SSE connection closes. This is not a theoretical concern; it has caused production outages.

HTTP/2 solves this entirely. HTTP/2 multiplexes all requests over a single TCP connection, so SSE connections do not consume a "slot." The practical limit becomes the HTTP/2 stream count, which defaults to 100 in most servers. As long as your server supports HTTP/2 (and in 2025, it absolutely should), the browser connection limit is not a practical concern for SSE.

If you must support HTTP/1.1 clients, you can share a single SSE connection across tabs using `BroadcastChannel`:

```typescript
// src/lib/sse-cross-tab.ts
const channel = new BroadcastChannel('sse-events');
let isLeader = false;
let leaderSource: EventSource | null = null;

// Simple leader election: the first tab to claim leadership wins.
// If the leader tab closes, another tab takes over.
async function electLeader() {
  return new Promise<boolean>((resolve) => {
    const id = crypto.randomUUID();
    channel.postMessage({ type: 'leader-check', id });

    const timeout = setTimeout(() => {
      // No one responded -- we are the leader
      isLeader = true;
      channel.postMessage({ type: 'leader-claim', id });
      resolve(true);
    }, 200);

    const handler = (event: MessageEvent) => {
      if (event.data.type === 'leader-exists') {
        clearTimeout(timeout);
        channel.removeEventListener('message', handler);
        resolve(false);
      }
    };
    channel.addEventListener('message', handler);
  });
}

// In the leader tab:
function startLeaderSSE(url: string) {
  leaderSource = new EventSource(url);
  leaderSource.onmessage = (event) => {
    channel.postMessage({
      type: 'sse-event',
      data: event.data,
      lastEventId: event.lastEventId
    });
  };
}

// In all tabs (including the leader):
channel.onmessage = (event) => {
  if (event.data.type === 'sse-event') {
    handleSSEEvent(JSON.parse(event.data.data));
  }
  if (event.data.type === 'leader-check' && isLeader) {
    channel.postMessage({ type: 'leader-exists' });
  }
};
```

### Server-Side Connection Limits

On the server side, each SSE connection consumes a file descriptor and a small amount of memory (the connection object, the stream controller, and your application-level metadata). A Node.js server can handle tens of thousands of concurrent SSE connections on modest hardware because SSE connections are idle most of the time -- they only use CPU when sending an event.

But you need to tune your OS for high connection counts:

```bash
# /etc/security/limits.conf -- increase file descriptor limits
* soft nofile 65535
* hard nofile 65535

# Or at runtime for the current process
ulimit -n 65535
```

Monitor your connection count. Add a health check endpoint:

```typescript
// src/routes/api/health/+server.ts
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return new Response(
    JSON.stringify({
      sseConnections: connections.size,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
```

### Load Balancer Configuration

SSE has specific load balancer requirements that differ from regular HTTP:

```nginx
# Nginx configuration for SSE endpoints
location /api/events {
    proxy_pass http://backend;
    proxy_http_version 1.1;

    # CRITICAL: Disable response buffering.
    # Without this, Nginx holds events in a buffer and delivers them in batches.
    proxy_buffering off;
    proxy_cache off;

    # Set a high read timeout. The heartbeat keeps the connection alive;
    # this timeout is a safety net for truly dead connections.
    proxy_read_timeout 86400s; # 24 hours

    # Required for SSE: do not set Connection: close
    proxy_set_header Connection '';

    # Disable chunked transfer encoding -- it interferes with SSE in some configs
    chunked_transfer_encoding off;

    # Disable gzip -- it buffers output waiting for enough data to compress
    gzip off;
}
```

A major operational advantage of SSE over WebSockets: **sticky sessions are not required.** When an SSE connection drops and the client reconnects, it can connect to any server in your pool. The `Last-Event-ID` header tells the new server where the client left off. If you use a shared event log (Redis Streams, Kafka, a database), the new server can replay missed events. With WebSockets, losing a connection means losing all server-side state associated with that connection unless you use sticky sessions or a shared state layer.

## Error Recovery

### Exponential Backoff with Jitter

The browser's built-in reconnection uses a fixed interval (the `retry` value). This is fine for single-user scenarios but creates a thundering herd problem at scale: if your server restarts and 10,000 clients all have `retry: 5000`, they all reconnect at exactly the same moment 5 seconds later, potentially crashing the server again.

For production systems, implement exponential backoff with jitter on the client side instead of relying on EventSource's built-in reconnection:

```typescript
// src/lib/resilient-sse.svelte.ts
interface ResilientSSEOptions {
  maxRetryDelay?: number;   // Maximum delay between retries (default: 30s)
  initialDelay?: number;    // First retry delay (default: 1s)
  jitterFactor?: number;    // Jitter as fraction of delay (default: 0.5)
  maxRetries?: number;      // Give up after N retries (default: Infinity)
  onMaxRetriesReached?: () => void;
}

export function createResilientSSE(url: string, options: ResilientSSEOptions = {}) {
  const {
    maxRetryDelay = 30_000,
    initialDelay = 1_000,
    jitterFactor = 0.5,
    maxRetries = Infinity,
    onMaxRetriesReached
  } = options;

  let source: EventSource | null = null;
  let attempt = 0;
  let connected = $state(false);
  let lastEventId: string | null = null;
  let destroyed = false;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  const handlers = new Map<string, Set<(data: unknown) => void>>();

  function connect() {
    if (destroyed) return;

    // Include lastEventId as a query parameter as a fallback
    // for proxies that strip the Last-Event-ID header
    const connectUrl = lastEventId
      ? `${url}${url.includes('?') ? '&' : '?'}lastEventId=${encodeURIComponent(lastEventId)}`
      : url;

    source = new EventSource(connectUrl);

    source.onopen = () => {
      connected = true;
      attempt = 0; // Reset backoff on successful connection
    };

    source.onerror = () => {
      connected = false;

      // EventSource will try to reconnect automatically with a fixed delay.
      // We close it and manage reconnection ourselves for better backoff.
      source?.close();
      source = null;

      if (attempt >= maxRetries) {
        onMaxRetriesReached?.();
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, ...
      const baseDelay = Math.min(initialDelay * Math.pow(2, attempt), maxRetryDelay);
      // Add jitter: randomize within [baseDelay * (1 - jitter), baseDelay * (1 + jitter)]
      const jitter = baseDelay * jitterFactor * (2 * Math.random() - 1);
      const delay = Math.max(0, baseDelay + jitter);
      attempt++;

      retryTimeout = setTimeout(connect, delay);
    };

    // Attach all registered handlers to the new EventSource
    for (const [type, handlerSet] of handlers) {
      const listener = ((e: MessageEvent) => {
        if (e.lastEventId) lastEventId = e.lastEventId;
        try {
          const data = JSON.parse(e.data);
          handlerSet.forEach((h) => h(data));
        } catch {
          // Non-JSON data -- pass raw string
          handlerSet.forEach((h) => h(e.data));
        }
      }) as EventListener;

      if (type === 'message') {
        source.onmessage = listener as any;
      } else {
        source.addEventListener(type, listener);
      }
    }
  }

  function on(type: string, handler: (data: unknown) => void) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type)!.add(handler);

    // If already connected, add the listener to the live EventSource
    if (source && type !== 'message') {
      source.addEventListener(type, ((e: MessageEvent) => {
        if (e.lastEventId) lastEventId = e.lastEventId;
        try {
          handler(JSON.parse(e.data));
        } catch {
          handler(e.data);
        }
      }) as EventListener);
    }
  }

  function off(type: string, handler: (data: unknown) => void) {
    handlers.get(type)?.delete(handler);
  }

  function close() {
    destroyed = true;
    if (retryTimeout) clearTimeout(retryTimeout);
    source?.close();
    source = null;
    connected = false;
    handlers.clear();
  }

  connect();

  return {
    get connected() { return connected; },
    on,
    off,
    close
  };
}
```

The jitter is important. Without it, if your server restarts and 10,000 clients all compute a 4-second backoff, they all reconnect at exactly the same moment and potentially crash the server again. Jitter spreads the reconnections uniformly over a time window, turning a spike into a ramp.

### Missed Event Detection and Full Resync

Even with `Last-Event-ID`, you can miss events if the event log rolls over before the client reconnects (e.g., the server restarted and lost its in-memory log, or the client was offline for hours). Detect this case and trigger a full state resync:

```svelte
<script lang="ts">
  import { createResilientSSE } from '$lib/resilient-sse.svelte';

  interface Item {
    id: string;
    text: string;
    updatedAt: number;
  }

  let items = $state<Item[]>([]);
  const sse = createResilientSSE('/api/events');

  // Normal incremental updates
  sse.on('item-created', (data) => {
    const item = data as Item;
    if (!items.some((i) => i.id === item.id)) {
      items = [...items, item];
    }
  });

  sse.on('item-updated', (data) => {
    const update = data as Item;
    items = items.map((i) => (i.id === update.id ? update : i));
  });

  sse.on('item-deleted', (data) => {
    const { id } = data as { id: string };
    items = items.filter((i) => i.id !== id);
  });

  // Full resync when the server cannot replay missed events
  sse.on('resync', async () => {
    const response = await fetch('/api/items');
    items = await response.json();
  });

  $effect(() => {
    return () => sse.close();
  });
</script>
```

This pattern -- incremental updates for the normal case, full resync as a fallback -- is robust against every failure mode: short disconnections, long disconnections, server restarts, and event log overflow.

## Building a Complete Notification System

Let us put everything together into a fully functional, production-quality notification system.

### Server: Notification Broadcaster

```typescript
// src/lib/server/notifications.ts
interface StoredEvent {
  id: number;
  type: string;
  data: string;
  timestamp: number;
}

class NotificationBroadcaster {
  private connections = new Map<
    string,
    { controller: ReadableStreamDefaultController; userId: string }
  >();
  private eventLog: StoredEvent[] = [];
  private counter = 0;
  private encoder = new TextEncoder();

  // Send a notification to a specific user
  send(userId: string, type: string, payload: unknown) {
    const id = ++this.counter;
    const data = JSON.stringify(payload);
    this.eventLog.push({ id, type, data, timestamp: Date.now() });
    if (this.eventLog.length > 5000) {
      this.eventLog = this.eventLog.slice(-5000);
    }

    const message = this.encoder.encode(
      `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`
    );

    for (const [connId, conn] of this.connections) {
      if (conn.userId !== userId) continue;
      try {
        conn.controller.enqueue(message);
      } catch {
        this.connections.delete(connId);
      }
    }
  }

  // Send a notification to all connected users
  broadcast(type: string, payload: unknown) {
    const id = ++this.counter;
    const data = JSON.stringify(payload);
    this.eventLog.push({ id, type, data, timestamp: Date.now() });
    if (this.eventLog.length > 5000) {
      this.eventLog = this.eventLog.slice(-5000);
    }

    const message = this.encoder.encode(
      `id: ${id}\nevent: ${type}\ndata: ${data}\n\n`
    );

    for (const [connId, conn] of this.connections) {
      try {
        conn.controller.enqueue(message);
      } catch {
        this.connections.delete(connId);
      }
    }
  }

  addConnection(
    connectionId: string,
    userId: string,
    controller: ReadableStreamDefaultController
  ) {
    this.connections.set(connectionId, { controller, userId });
  }

  removeConnection(connectionId: string) {
    this.connections.delete(connectionId);
  }

  replayFrom(lastId: number): StoredEvent[] | null {
    if (this.eventLog.length === 0) return [];
    if (lastId < this.eventLog[0].id) return null; // Log rolled over
    return this.eventLog.filter((e) => e.id > lastId);
  }

  get connectionCount() {
    return this.connections.size;
  }
}

export const notifications = new NotificationBroadcaster();
```

### Server: SSE Endpoint

```typescript
// src/routes/api/notifications/stream/+server.ts
import type { RequestHandler } from './$types';
import { notifications } from '$lib/server/notifications';

export const GET: RequestHandler = async ({ request, locals }) => {
  const userId = locals.user?.id;
  if (!userId) {
    return new Response('Unauthorized', { status: 401 });
  }

  const connectionId = crypto.randomUUID();
  const encoder = new TextEncoder();
  const lastEventId = request.headers.get('Last-Event-ID')
    ?? new URL(request.url).searchParams.get('lastEventId');

  const stream = new ReadableStream({
    start(controller) {
      notifications.addConnection(connectionId, userId, controller);

      controller.enqueue(encoder.encode('retry: 5000\n\n'));

      // Replay missed events on reconnection
      if (lastEventId) {
        const missed = notifications.replayFrom(parseInt(lastEventId, 10));
        if (missed === null) {
          controller.enqueue(
            encoder.encode(
              `event: resync\ndata: ${JSON.stringify({ reason: 'log_overflow' })}\n\n`
            )
          );
        } else {
          for (const event of missed) {
            controller.enqueue(
              encoder.encode(
                `id: ${event.id}\nevent: ${event.type}\ndata: ${event.data}\n\n`
              )
            );
          }
        }
      }

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          clearInterval(heartbeat);
          notifications.removeConnection(connectionId);
        }
      }, 25_000);

      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        notifications.removeConnection(connectionId);
        try { controller.close(); } catch { /* already closed */ }
      });
    },
    cancel() {
      notifications.removeConnection(connectionId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Accel-Buffering': 'no'
    }
  });
};
```

### Client: Notification Center Component

```svelte
<!-- src/lib/components/NotificationCenter.svelte -->
<script lang="ts">
  import { createResilientSSE } from '$lib/resilient-sse.svelte';

  interface Notification {
    id: string;
    title: string;
    body: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: number;
  }

  let items = $state<Notification[]>([]);
  let showPanel = $state(false);
  let readIds = $state(new Set<string>());
  let unreadCount = $derived(items.filter((n) => !readIds.has(n.id)).length);

  const sse = createResilientSSE('/api/notifications/stream');

  sse.on('notification', (data) => {
    const notification = data as Notification;
    // Deduplicate by ID (important on reconnection replay)
    if (!items.some((n) => n.id === notification.id)) {
      items = [notification, ...items].slice(0, 200);
    }
  });

  sse.on('resync', async () => {
    const response = await fetch('/api/notifications');
    items = await response.json();
  });

  $effect(() => {
    return () => sse.close();
  });

  function markRead(id: string) {
    readIds = new Set(readIds).add(id);
    fetch(`/api/notifications/${id}/read`, { method: 'POST' });
  }

  function markAllRead() {
    items.forEach((n) => readIds.add(n.id));
    readIds = new Set(readIds);
    fetch('/api/notifications/read-all', { method: 'POST' });
  }

  function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
</script>

<div class="notification-center">
  <button
    class="bell"
    onclick={() => (showPanel = !showPanel)}
    aria-label="Notifications ({unreadCount} unread)"
  >
    Notifications
    {#if unreadCount > 0}
      <span class="badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
    {/if}
  </button>

  {#if showPanel}
    <div class="panel" role="dialog" aria-label="Notifications panel">
      <div class="panel-header">
        <h3>Notifications</h3>
        {#if unreadCount > 0}
          <button onclick={markAllRead}>Mark all read</button>
        {/if}
      </div>

      {#if items.length === 0}
        <p class="empty">No notifications yet</p>
      {:else}
        <ul role="log" aria-live="polite">
          {#each items as notification (notification.id)}
            <li
              class="notification-item {notification.type}"
              class:unread={!readIds.has(notification.id)}
            >
              <button onclick={() => markRead(notification.id)}>
                <strong>{notification.title}</strong>
                <p>{notification.body}</p>
                <time>{timeAgo(notification.timestamp)}</time>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <div class="connection-status">
        {sse.connected ? 'Live' : 'Reconnecting...'}
      </div>
    </div>
  {/if}
</div>
```

## SSE vs WebSockets Decision Matrix

| Scenario | SSE | WebSocket | Why |
|---|---|---|---|
| News feed / social timeline | Best | Overkill | Server pushes updates; client rarely sends data |
| Stock ticker / price updates | Best | Acceptable | One-way data stream, high frequency |
| Notification system | Best | Overkill | Server-to-client only |
| Progress bar / build status | Best | Overkill | Server reports progress; client only watches |
| Server log streaming | Best | Overkill | One-way tail of log output |
| Chat application | Poor fit | Best | Both sides send messages frequently |
| Collaborative editing | Poor fit | Best | Cursors, selections, and edits flow both ways constantly |
| Multiplayer game | Poor fit | Best | Bidirectional, low-latency input and state sync |
| IoT sensor dashboard | Best | Acceptable | Sensors push data; dashboard displays it |
| File upload progress | Best | Acceptable | Server reports progress on each chunk |
| Live search / autocomplete | Neither | Neither | Use regular HTTP with debouncing |
| Form submissions | Neither | Neither | Standard request/response is correct |

The key insight: **SSE handles 80% of real-time use cases with 20% of the complexity.** Most "real-time" features are actually server-to-client push. Reaching for WebSockets when SSE would suffice adds operational burden -- WebSocket connections require sticky sessions or a shared state layer, they need special load balancer configuration, they bypass the HTTP layer (losing cookies, caching, and middleware), and they require you to implement reconnection logic that SSE gives you for free.

## Testing SSE Endpoints

SSE endpoints are just HTTP endpoints that return a streaming response. You can test them with standard tools.

### Unit Testing the Endpoint

```typescript
// src/routes/api/events/+server.test.ts
import { describe, it, expect } from 'vitest';
import { GET } from './+server';

describe('SSE endpoint', () => {
  it('returns correct headers', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost/api/events', {
      signal: controller.signal
    });

    const response = await GET({
      request,
      locals: { user: { id: 'test-user' } }
    } as any);

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toContain('no-cache');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    controller.abort(); // Clean up the stream
  });

  it('streams events in correct SSE format', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost/api/events', {
      signal: controller.signal
    });

    const response = await GET({
      request,
      locals: { user: { id: 'test-user' } }
    } as any);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    // Read the first chunk (should contain retry + welcome event)
    const { value } = await reader.read();
    const text = decoder.decode(value);

    // Verify SSE format
    expect(text).toContain('retry:');
    expect(text).toContain('event: connected');
    expect(text).toContain('data:');

    // Every event block must end with \n\n
    const blocks = text.split('\n\n').filter(Boolean);
    expect(blocks.length).toBeGreaterThanOrEqual(2); // retry + welcome

    controller.abort();
  });

  it('replays missed events on reconnection', async () => {
    // First, broadcast some events to populate the log
    const { broadcast } = await import('./+server');
    broadcast('test-event', { value: 1 });
    broadcast('test-event', { value: 2 });
    broadcast('test-event', { value: 3 });

    // Connect with a Last-Event-ID to simulate reconnection
    const controller = new AbortController();
    const request = new Request('http://localhost/api/events', {
      headers: { 'Last-Event-ID': '0' },
      signal: controller.signal
    });

    const response = await GET({
      request,
      locals: { user: { id: 'test-user' } }
    } as any);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('"value":1');
    expect(text).toContain('"value":2');
    expect(text).toContain('"value":3');

    controller.abort();
  });

  it('rejects unauthenticated requests', async () => {
    const request = new Request('http://localhost/api/events', {
      signal: AbortSignal.timeout(100)
    });

    const response = await GET({
      request,
      locals: { user: null }
    } as any);

    expect(response.status).toBe(401);
  });
});
```

### Testing SSE Event Format

Write a helper to parse SSE text into structured events for easier assertions:

```typescript
// src/lib/test-utils/parse-sse.ts
interface ParsedSSEEvent {
  id?: string;
  event?: string;
  data?: string;
  retry?: number;
  comment?: boolean;
}

export function parseSSEText(text: string): ParsedSSEEvent[] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const event: ParsedSSEEvent = {};
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) {
          event.comment = true;
        } else if (line.startsWith('id: ')) {
          event.id = line.slice(4);
        } else if (line.startsWith('event: ')) {
          event.event = line.slice(7);
        } else if (line.startsWith('data: ')) {
          event.data = line.slice(6);
        } else if (line.startsWith('retry: ')) {
          event.retry = parseInt(line.slice(7), 10);
        }
      }
      return event;
    });
}
```

```typescript
// Usage in tests:
const events = parseSSEText(responseText);
const welcome = events.find((e) => e.event === 'connected');
expect(welcome).toBeDefined();
expect(JSON.parse(welcome!.data!)).toHaveProperty('connectionId');
```

## Try It

### Exercise 1: Live Progress Tracker

Build an SSE endpoint that simulates a multi-step deployment pipeline. The endpoint should:

1. Send named events: `step-start`, `step-progress`, `step-complete`, and `pipeline-complete`
2. Include event IDs so the client can resume if disconnected mid-pipeline
3. Send heartbeat comments every 5 seconds
4. Simulate 4 steps: "Installing dependencies", "Running tests", "Building artifacts", "Deploying to production"

On the client, display a list of pipeline steps with status indicators (pending, running, complete), a progress bar for the currently running step, and a connection status indicator. If disconnected and reconnected mid-pipeline, the client should resume from where it left off.

### Exercise 2: Multi-Channel Event Feed

Create an SSE endpoint that emits three named event types: `order`, `inventory`, and `alert`. Build a Svelte component with three columns, one for each event type. Each column shows the last 20 events of its type. Include a connection status indicator, a "pause" button that stops adding events to the UI while keeping the connection open, and a "resume" button that shows events accumulated while paused.

### Exercise 3: SSE with Authentication

`EventSource` does not support custom headers, which means you cannot send an `Authorization: Bearer ...` header. Implement cookie-based authentication for your SSE endpoint: the SvelteKit auth hook sets an HTTP-only session cookie, the SSE endpoint reads it from `locals.user`, and unauthenticated requests receive a 401 that causes `EventSource` to enter the `CLOSED` state. Add a client-side check: if the connection enters `CLOSED`, redirect the user to the login page.

## Key Takeaways

- SSE provides one-way server-to-client streaming over a single HTTP connection and handles 80% of real-time use cases with far less complexity than WebSockets
- The `text/event-stream` format has four fields: `data:`, `event:`, `id:`, and `retry:` -- comment lines (`: ...`) serve as heartbeats to keep connections alive through proxies
- The `EventSource` API handles automatic reconnection and sends `Last-Event-ID` to enable reliable delivery across reconnections
- Production SSE endpoints need heartbeats (to survive proxy idle timeouts), connection registries (to broadcast from any server code), event logs (to replay on reconnect), and `AbortSignal` cleanup (to prevent memory leaks)
- HTTP/1.1 limits you to 6 SSE connections per domain -- use HTTP/2 (which multiplexes over a single TCP connection) or `BroadcastChannel` to share connections across tabs
- Use exponential backoff with jitter for reconnection to prevent thundering herd problems when servers restart with many connected clients
- Always disable response buffering in your reverse proxy (`X-Accel-Buffering: no` for Nginx, `proxy_buffering off`)
- Sticky sessions are NOT required for SSE, unlike WebSockets -- any server can replay missed events using `Last-Event-ID` and a shared event log
- When `EventSource.readyState` is `CLOSED` (2), the browser has permanently given up -- this happens on non-200 responses and indicates an auth or server error, not a temporary network issue
- Test SSE endpoints like any HTTP endpoint: read from the `ReadableStream`, parse the text format, and verify event structure
