# Fetch Basics

The `fetch` API is how JavaScript talks to servers. Before we dive into SvelteKit-specific patterns, it is important to understand that `fetch` is a **web standard** — not a framework feature. It works the same way in browsers, Node.js, Deno, Cloudflare Workers, and SvelteKit. When you learn `fetch`, you are learning a skill that transfers everywhere.

This matters more than you might think. Frameworks come and go. Libraries fall out of fashion. But `fetch` is part of the platform. It is defined by the WHATWG specification, implemented by every modern runtime, and it will be here long after today's frameworks are forgotten. Investing in understanding `fetch` deeply pays dividends across your entire career.

Before `fetch`, developers used `XMLHttpRequest` (XHR) — a clunky, callback-based API that required different patterns for different operations. `fetch` replaced it with a clean, Promise-based interface built on two fundamental web platform primitives: `Request` and `Response`. These are not just fetch-specific objects — they are used across the platform in Service Workers, Cache API, and other web APIs. Understanding them deeply means understanding how the modern web works.

## The Request/Response Mental Model

HTTP works on a simple mental model: **you send a request, you get back a response**.

Every HTTP interaction, whether it is loading a web page, submitting a form, or calling an API, follows this pattern. The browser sends a request to a server. The server processes it and sends back a response. `fetch` gives you programmatic control over both sides of this exchange.

A request has two essential pieces:
- **URL** — identifies which resource you want. Think of it as an address: `https://api.example.com/users/42` says "I want user 42 from example.com's API."
- **Method** — indicates your intent. The four most common methods map to CRUD operations:

| Method   | Intent              | Idempotent? | Has Body? | Example                          |
|----------|---------------------|-------------|-----------|----------------------------------|
| `GET`    | Read data           | Yes         | No        | Fetch a user's profile           |
| `POST`   | Create something    | No          | Yes       | Submit a new blog post           |
| `PUT`    | Replace/update      | Yes         | Yes       | Update a user's email address    |
| `PATCH`  | Partial update      | No          | Yes       | Change just the user's name      |
| `DELETE` | Remove something    | Yes         | Optional  | Delete a comment                 |

Idempotency matters more than you might think. An idempotent request produces the same result whether you send it once or ten times. `GET` is idempotent — fetching a user's profile ten times gives you the same profile. `POST` is not — submitting a form ten times might create ten records. This distinction affects retry logic, caching, and how browsers handle back/forward navigation.

When you call `fetch(url)` without specifying a method, it defaults to `GET`. That is by far the most common operation — most of the time you are reading data, not writing it.

## The Request Object in Detail

When you call `fetch(url, options)`, the browser internally constructs a `Request` object. You can also construct one explicitly, which is useful when you need to pass requests around, clone them, or inspect them in Service Workers:

```typescript
// These two are equivalent:
const response1 = await fetch('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Alice' })
});

const request = new Request('https://api.example.com/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Alice' })
});
const response2 = await fetch(request);
```

The `Request` object has several properties worth knowing:

```typescript
const req = new Request('https://api.example.com/users?page=2', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer abc123'
  },
  body: JSON.stringify({ name: 'Alice' })
});

console.log(req.method);      // "POST"
console.log(req.url);         // "https://api.example.com/users?page=2"
console.log(req.headers);     // Headers object
console.log(req.body);        // ReadableStream (the body is a stream!)
console.log(req.bodyUsed);    // false (becomes true after reading)
console.log(req.credentials); // "same-origin" (default cookie behavior)
console.log(req.mode);        // "cors" (default for cross-origin requests)
console.log(req.signal);      // AbortSignal (for cancellation)
```

One thing that trips people up: `req.body` is a `ReadableStream`, not a string. The body can only be consumed once. If you need to read it twice (for example, to log it and then send it), clone the request first:

```typescript
const clone = req.clone();
const bodyText = await clone.text(); // read the clone for logging
console.log('Sending:', bodyText);
const response = await fetch(req);   // send the original
```

## Making Your First Fetch Request

The simplest fetch call takes a URL and returns a `Response` object:

```typescript
async function getPost() {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  const data = await response.json();
  console.log(data);
}

getPost();
```

Two `await` calls happen here, and it is worth understanding why. The first `await` pauses until the server sends back the **response headers** — the status code, content type, and other metadata. At this point the response body (the actual data) may still be streaming over the network. The second `await` on `response.json()` waits for the entire body to arrive and parses it from a JSON string into a JavaScript object.

This two-step design is intentional. It lets you inspect the response headers (is it a 200? a 404?) *before* you spend time and memory parsing the body. For large responses, this distinction matters. You might receive a 10MB JSON response from a misbehaving API — checking the status first lets you bail out before wasting resources parsing garbage.

## The Response Object in Detail

`fetch` always resolves to a `Response` object (unless a network error occurs). The Response gives you several useful properties:

```typescript
const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');

console.log(response.status);     // 200
console.log(response.ok);         // true (status is 200-299)
console.log(response.statusText); // "OK"
console.log(response.type);       // "cors" (or "basic" for same-origin)
console.log(response.url);        // final URL after any redirects
console.log(response.redirected); // true if the request was redirected
console.log(response.headers.get('content-type')); // "application/json; charset=utf-8"
```

The `ok` property is a convenience — it is `true` when the status code is in the 200-299 range. You should **always** check this before parsing the body.

The `type` property tells you the origin of the response:
- `"basic"` — same-origin response, all headers visible
- `"cors"` — cross-origin response, only CORS-safelisted headers visible
- `"opaque"` — cross-origin response from `no-cors` mode, no data accessible

### Parsing the Body

The Response offers different methods depending on the format you expect:

```typescript
// For JSON APIs (most common)
const data = await response.json();

// For plain text, HTML, CSV, etc.
const text = await response.text();

// For binary data like images or files
const blob = await response.blob();

// For raw binary buffers (useful for crypto, image processing)
const buffer = await response.arrayBuffer();

// For form data (rare in API work, common in Service Workers)
const formData = await response.formData();
```

Each of these returns a Promise, and you can only call one of them — the body stream can only be consumed once. If you need to read the body twice (rare), clone the response first with `response.clone()`.

A production pattern: sometimes you need to handle different content types from the same API. Check the `Content-Type` header first:

```typescript
async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  } else if (contentType.includes('text/')) {
    return response.text();
  } else {
    return response.blob();
  }
}
```

## Headers: The Metadata Layer

HTTP headers are metadata attached to requests and responses. They control caching, authentication, content negotiation, security policies, and more. Understanding headers is the difference between "it works on my machine" and "it works in production."

### The Headers Object

Both `Request` and `Response` expose a `Headers` object with a Map-like API:

```typescript
// Creating headers
const headers = new Headers({
  'Content-Type': 'application/json',
  'Authorization': 'Bearer abc123'
});

// Manipulating headers
headers.set('Accept', 'application/json');
headers.append('Accept-Language', 'en-US');
headers.delete('Authorization');
console.log(headers.has('Content-Type')); // true
console.log(headers.get('Content-Type')); // "application/json"

// Iterating over headers
for (const [name, value] of headers) {
  console.log(`${name}: ${value}`);
}
```

### Essential Request Headers

**`Content-Type`** tells the server what format your request body is in. Get this wrong and the server will misinterpret or reject your data:

```typescript
// JSON data (most APIs)
headers: { 'Content-Type': 'application/json' }

// Form data (HTML form submission equivalent)
headers: { 'Content-Type': 'application/x-www-form-urlencoded' }

// File upload (DO NOT set this manually — fetch sets it with the boundary)
// headers: { 'Content-Type': 'multipart/form-data' } // WRONG
const formData = new FormData();
formData.append('file', fileBlob);
await fetch('/upload', { method: 'POST', body: formData });
// fetch sets Content-Type automatically with the correct boundary
```

That last point is a classic gotcha. When uploading files with `FormData`, do NOT set the `Content-Type` header manually. The browser needs to generate a unique boundary string that separates the parts of the multipart message. If you set the header yourself, the boundary will be missing and the server will fail to parse the upload.

**`Authorization`** sends credentials — typically a bearer token for authenticated APIs:

```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

**`Accept`** tells the server what format you want in the response. Most JSON APIs assume JSON, but being explicit avoids surprises:

```typescript
headers: {
  'Accept': 'application/json'
}
```

**`Cache-Control`** controls how the response should be cached. This is critical for performance and data freshness:

```typescript
// No caching at all — every request hits the server
headers: { 'Cache-Control': 'no-store' }

// Cache but revalidate with the server on every request
headers: { 'Cache-Control': 'no-cache' }

// Cache for 5 minutes, then revalidate
headers: { 'Cache-Control': 'max-age=300' }
```

### Essential Response Headers

When building API endpoints (which you will do in `+server.ts`), setting the right response headers matters:

```typescript
// In a SvelteKit +server.ts endpoint
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60, s-maxage=300',
    'X-Request-Id': crypto.randomUUID() // useful for debugging
  }
});
```

The `Cache-Control` header is especially important. `s-maxage` controls CDN caching separately from browser caching. You might want the CDN to cache for 5 minutes (`s-maxage=300`) but the browser to revalidate every minute (`max-age=60`). Getting this right can reduce your server load by 90% for read-heavy APIs.

## Two Kinds of Errors: The Critical Distinction

This is the most important concept in this lesson — the one that separates production-quality code from tutorial code. **`fetch` has two completely different failure modes**, and you need to handle both.

**Network errors** happen when the request never reaches the server — the user is offline, DNS fails, the server is down, a CORS preflight is rejected, or the connection times out. These cause `fetch` to reject its promise, which means `await` will throw. You catch these with `try/catch`.

**HTTP errors** happen when the request reaches the server but something goes wrong on its end — a `404 Not Found`, `401 Unauthorized`, `422 Unprocessable Entity`, or `500 Internal Server Error`. Here is the counterintuitive part: `fetch` considers these **successful** requests. The promise resolves normally. You get a Response object back. You have to check `response.ok` yourself.

This design decision confuses everyone at first, but it makes sense: the network operation succeeded — data went to the server and came back. The HTTP error is application-level, not transport-level. The Response object contains useful information (error messages, validation details) that you might want to read.

### WRONG: Only handling one failure mode

```typescript
// WRONG: Catches network errors but silently ignores HTTP errors
async function getUser(id: number) {
  try {
    const response = await fetch(`/api/users/${id}`);
    return await response.json(); // Happily parses a 404 error page as JSON!
  } catch (error) {
    console.error('Network error:', error);
    return null;
  }
}
```

This code has a subtle, terrible bug. If the server returns a 404, `response.json()` will try to parse the error response body. If the body happens to be JSON (like `{"error": "Not found"}`), it silently succeeds and your code treats an error object as user data. If the body is HTML (like a 404 error page), `response.json()` throws a `SyntaxError` that gets caught by the `catch` block — now you are logging "Network error" for what is actually a 404. Either way, the real problem is masked.

### CORRECT: Handling both failure modes

```typescript
async function getUser(id: number) {
  try {
    const response = await fetch(`/api/users/${id}`);

    if (!response.ok) {
      // Try to extract error details from the response body
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      try {
        const errorBody = await response.json();
        if (errorBody.message) {
          errorMessage = errorBody.message;
        }
      } catch {
        // Response body was not JSON — use the status text
      }
      throw new Error(errorMessage);
    }

    return await response.json();
  } catch (error) {
    if (error instanceof TypeError) {
      // TypeError indicates a network failure (offline, DNS, CORS, etc.)
      console.error('Network error — check your connection:', error.message);
    } else {
      // Application error (HTTP 4xx/5xx or JSON parse error)
      console.error('Request failed:', error);
    }
    return null;
  }
}
```

Notice the `instanceof TypeError` check. Network failures from `fetch` always throw a `TypeError`. This lets you distinguish between "the user is offline" (show a retry button) and "the server returned an error" (show the error message).

### Production Error Handling Pattern

In a real application, you want a structured approach. Here is a pattern I have used across multiple production apps:

```typescript
// src/lib/api-error.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNotFound() { return this.status === 404; }
  get isUnauthorized() { return this.status === 401; }
  get isForbidden() { return this.status === 403; }
  get isValidationError() { return this.status === 422; }
  get isServerError() { return this.status >= 500; }
}

export class NetworkError extends Error {
  constructor(message: string = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}
```

```typescript
// src/lib/api-client.ts
import { ApiError, NetworkError } from './api-error';

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    // 204 No Content has no body
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  // Try to parse error details from the response body
  let details: Record<string, unknown> | undefined;
  try {
    details = await response.json();
  } catch {
    // Response body was not JSON
  }

  const message = (details as { message?: string })?.message
    ?? `Request failed with status ${response.status}`;

  throw new ApiError(response.status, message, details);
}

export async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, options);
    return await handleResponse<T>(response);
  } catch (error) {
    if (error instanceof ApiError) throw error; // re-throw our custom errors
    if (error instanceof TypeError) {
      throw new NetworkError(error.message);
    }
    throw error; // unknown error
  }
}
```

Now calling code can handle errors precisely:

```typescript
import { apiFetch } from '$lib/api-client';
import { ApiError, NetworkError } from '$lib/api-error';

try {
  const user = await apiFetch<User>(`/api/users/${id}`);
  // use user...
} catch (error) {
  if (error instanceof NetworkError) {
    showToast('You appear to be offline. Please check your connection.');
  } else if (error instanceof ApiError) {
    if (error.isNotFound) {
      goto('/404');
    } else if (error.isUnauthorized) {
      goto('/login');
    } else if (error.isValidationError) {
      showValidationErrors(error.details);
    } else {
      showToast(`Something went wrong: ${error.message}`);
    }
  }
}
```

## AbortController: Cancellation and Timeouts

`fetch` has no built-in timeout. If a server takes 30 seconds to respond, your `await` hangs for 30 seconds. In production, this is unacceptable — users see frozen UIs, loading spinners that never resolve, and they rage-quit your app.

`AbortController` solves this. It is a web standard (not fetch-specific) that provides a signal mechanism for cancelling asynchronous operations:

```typescript
// Basic timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
```

### Cancelling Requests in Svelte Components

AbortController is essential for search-as-you-type and other user-interaction-driven fetches. Without cancellation, if the user types "svel" and then "svelte", you have five in-flight requests and the results might arrive out of order — the response for "sv" could arrive after "svelte" and overwrite the correct results:

```svelte
<script lang="ts">
  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let controller: AbortController | null = null;

  async function search(term: string) {
    // Cancel the previous request if it is still in flight
    controller?.abort();
    controller = new AbortController();

    if (!term.trim()) {
      results = [];
      return;
    }

    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
        signal: controller.signal
      });

      if (!response.ok) throw new Error('Search failed');

      results = await response.json();
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Request was cancelled — this is expected, not an error
        return;
      }
      console.error('Search error:', error);
    }
  }

  // Debounce: wait 300ms after the user stops typing
  let debounceTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(query), 300);

    return () => clearTimeout(debounceTimer);
  });
</script>

<input type="search" bind:value={query} placeholder="Search..." />

{#each results as result (result.id)}
  <div>{result.title}</div>
{/each}
```

This pattern combines three techniques: **debouncing** (waiting for the user to stop typing), **cancellation** (aborting the previous request), and **error filtering** (ignoring `AbortError`). You need all three for a correct search implementation.

### Using AbortSignal.timeout (Modern Alternative)

Modern runtimes support `AbortSignal.timeout()`, which simplifies the timeout pattern:

```typescript
// Clean timeout — no manual AbortController needed
const response = await fetch('https://api.example.com/data', {
  signal: AbortSignal.timeout(5000) // throws after 5 seconds
});
```

You can also combine multiple abort signals with `AbortSignal.any()`:

```typescript
// Cancel on either timeout OR user action
const userController = new AbortController();

const response = await fetch('/api/data', {
  signal: AbortSignal.any([
    AbortSignal.timeout(10000),        // 10-second timeout
    userController.signal              // user clicks "Cancel"
  ])
});

// In a cancel button handler:
// userController.abort();
```

## Streaming Responses with ReadableStream

The body of a `Response` is a `ReadableStream`. Most of the time you consume it all at once with `.json()` or `.text()`, but you can also read it incrementally. This is critical for large responses, server-sent events, or AI-style token-by-token streaming.

```typescript
async function streamResponse(url: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error('Failed to start stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    // value is a Uint8Array — decode it to a string
    const chunk = decoder.decode(value, { stream: true });
    result += chunk;
    console.log('Received chunk:', chunk);
  }

  return result;
}
```

### Progress Tracking for Large Downloads

Streaming unlocks download progress indicators — something you cannot do with `.json()` or `.text()`:

```typescript
async function fetchWithProgress(
  url: string,
  onProgress: (loaded: number, total: number | null) => void
): Promise<Blob> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : null;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }

  return new Blob(chunks);
}

// Usage in a Svelte component:
let progress = $state(0);

const blob = await fetchWithProgress('/api/export/large-report.csv', (loaded, total) => {
  progress = total ? Math.round((loaded / total) * 100) : 0;
});
```

## Retry Strategies with Exponential Backoff

Network requests fail. Servers have transient errors. Connections drop. A robust application retries failed requests intelligently. The key is **exponential backoff with jitter** — each retry waits longer than the last, plus a random component to prevent all clients from retrying at the same instant (the "thundering herd" problem):

```typescript
interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableStatuses?: number[];
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retryOptions: RetryOptions = {}
): Promise<Response> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    retryableStatuses = [408, 429, 500, 502, 503, 504]
  } = retryOptions;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Only retry on specific status codes
      if (!response.ok && retryableStatuses.includes(response.status)) {
        // Check for Retry-After header (rate limiting)
        const retryAfter = response.headers.get('retry-after');
        if (retryAfter && attempt < maxRetries) {
          const delaySeconds = parseInt(retryAfter, 10);
          if (!isNaN(delaySeconds)) {
            await sleep(delaySeconds * 1000);
            continue;
          }
        }

        if (attempt < maxRetries) {
          await sleepWithBackoff(attempt, baseDelayMs, maxDelayMs);
          continue;
        }
      }

      return response; // Success or non-retryable error
    } catch (error) {
      // Network error — retry if we have attempts left
      lastError = error as Error;
      if (attempt < maxRetries) {
        await sleepWithBackoff(attempt, baseDelayMs, maxDelayMs);
        continue;
      }
    }
  }

  throw lastError ?? new Error('Request failed after retries');
}

function sleepWithBackoff(attempt: number, baseMs: number, maxMs: number): Promise<void> {
  // Exponential backoff: 1s, 2s, 4s, 8s... capped at maxMs
  const exponentialDelay = baseMs * Math.pow(2, attempt);
  // Add jitter: random value between 0 and the delay
  const jitter = Math.random() * exponentialDelay;
  const delay = Math.min(exponentialDelay + jitter, maxMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

Notice the `retryableStatuses` list. You should NOT retry `400 Bad Request` (the client sent invalid data — retrying won't help), `401 Unauthorized` (credentials are wrong), or `403 Forbidden` (you lack permissions). You SHOULD retry `429 Too Many Requests` (respecting the `Retry-After` header), `502/503/504` (gateway errors indicating temporary infrastructure issues), and `500` (the server might recover).

**Never retry POST requests without additional safeguards.** Retrying a `POST /api/orders` might create duplicate orders. Use idempotency keys to make retries safe:

```typescript
async function safePost(url: string, data: unknown) {
  const idempotencyKey = crypto.randomUUID();

  return fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey // server uses this to deduplicate
    },
    body: JSON.stringify(data)
  });
}
```

## Sending Data with POST Requests

Fetch can send data to a server by specifying the method, headers, and body:

```typescript
async function createPost(title: string, body: string) {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body, userId: 1 })
    });

    if (!response.ok) {
      throw new Error(`Failed to create post: ${response.status}`);
    }

    const newPost = await response.json();
    return newPost;
  } catch (error) {
    console.error('Failed to create post:', error);
    return null;
  }
}
```

Notice that `body` must be a string — `JSON.stringify()` converts your JavaScript object into JSON text. The `Content-Type: application/json` header tells the server how to interpret that string. These two always go together. Forgetting the header is a common source of "why is the server ignoring my data?" bugs.

### Other Body Formats

JSON is the most common, but `fetch` supports several body types:

```typescript
// URL-encoded form data (like a traditional HTML form)
const response = await fetch('/api/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: 'alice@example.com', password: 'secret' })
});

// FormData (for file uploads — DO NOT set Content-Type manually)
const formData = new FormData();
formData.append('avatar', fileInput.files[0]);
formData.append('name', 'Alice');
const response2 = await fetch('/api/profile', {
  method: 'POST',
  body: formData
  // No Content-Type header! The browser sets it with the boundary.
});

// Plain text
const response3 = await fetch('/api/notes', {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: 'This is a plain text note.'
});

// Binary data (Blob or ArrayBuffer)
const audioBlob = await recorder.stop();
const response4 = await fetch('/api/audio', {
  method: 'POST',
  headers: { 'Content-Type': 'audio/webm' },
  body: audioBlob
});
```

## Fetch in SvelteKit: Two Contexts

In SvelteKit, you will use `fetch` in two different contexts, and they behave slightly differently.

**In components** (client-side), `fetch` is the standard browser `fetch`. You use it for user-triggered actions like form submissions, search-as-you-type, or loading more data on scroll.

**In load functions** (`+page.server.ts`), SvelteKit provides an augmented `fetch` through the event object. This enhanced version does several things the standard `fetch` cannot:

```typescript
// src/routes/posts/+page.server.ts
export const load = async ({ fetch }) => {
  // This fetch is special — it:
  // 1. Forwards cookies from the browser (for authentication)
  // 2. Resolves relative URLs against the app's origin
  // 3. Can call your own API routes without a network round-trip
  // 4. Deduplicates identical requests within the same render cycle
  const response = await fetch('/api/posts');
  const posts = await response.json();
  return { posts };
};
```

Always destructure `fetch` from the load function's parameter object. If you use the global `fetch` instead, you lose cookie forwarding and the relative URL resolution — and your authenticated API calls will mysteriously fail.

### Why SvelteKit's Fetch Matters: A War Story

I once spent four hours debugging a load function where authentication worked in development but failed in production. The load function called `fetch('/api/user')` — but it used the global `fetch`, not the one from the event object. In development, the browser and server run on the same origin, so cookies were sent automatically. In production behind a reverse proxy, the global `fetch` did not know about the user's cookies. The fix was changing one line: destructuring `{ fetch }` from the event parameter. Four hours, one character of difference.

### Request Deduplication

SvelteKit's enhanced `fetch` deduplicates identical requests within a render cycle. If your `+layout.server.ts` and `+page.server.ts` both call `fetch('/api/user')`, only one HTTP request is made. This prevents wasted bandwidth when multiple load functions need the same data:

```typescript
// +layout.server.ts
export const load = async ({ fetch }) => {
  const user = await fetch('/api/user').then(r => r.json());
  return { user };
};

// +page.server.ts
export const load = async ({ fetch }) => {
  // This does NOT make a second HTTP request — SvelteKit deduplicates
  const user = await fetch('/api/user').then(r => r.json());
  const posts = await fetch(`/api/users/${user.id}/posts`).then(r => r.json());
  return { posts };
};
```

Deduplication only applies to GET requests with identical URLs within the same render cycle. POST requests are never deduplicated (for obvious reasons).

## Building a Complete API Client

In any non-trivial application, you end up making dozens of fetch calls. Wrapping them in a typed API client reduces boilerplate, centralizes error handling, and makes your codebase dramatically easier to maintain:

```typescript
// src/lib/api.ts
import { ApiError, NetworkError } from './api-error';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ApiClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  fetch?: typeof globalThis.fetch; // Accept SvelteKit's enhanced fetch
}

export function createApiClient(options: ApiClientOptions = {}) {
  const {
    baseUrl = '',
    headers: defaultHeaders = {},
    timeout = 10000,
    fetch: fetchFn = globalThis.fetch
  } = options;

  async function request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      ...defaultHeaders,
      ...extraHeaders
    };

    const init: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(timeout)
    };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    try {
      const response = await fetchFn(url, init);

      if (!response.ok) {
        let details: Record<string, unknown> | undefined;
        try { details = await response.json(); } catch {}
        const message = (details as { message?: string })?.message
          ?? `Request failed: ${response.status}`;
        throw new ApiError(response.status, message, details);
      }

      if (response.status === 204) return undefined as T;
      return await response.json() as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new NetworkError(`Request timed out after ${timeout}ms`);
      }
      if (error instanceof TypeError) {
        throw new NetworkError(error.message);
      }
      throw error;
    }
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('GET', path, undefined, headers),

    post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('POST', path, body, headers),

    put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('PUT', path, body, headers),

    patch: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
      request<T>('PATCH', path, body, headers),

    delete: <T>(path: string, headers?: Record<string, string>) =>
      request<T>('DELETE', path, undefined, headers)
  };
}
```

Usage across your app:

```typescript
// src/lib/server/api.ts — server-side client
import { createApiClient } from '$lib/api';
import { EXTERNAL_API_KEY } from '$env/static/private';

export function createServerApi(fetch: typeof globalThis.fetch) {
  return createApiClient({
    baseUrl: 'https://api.example.com',
    headers: { 'X-API-Key': EXTERNAL_API_KEY },
    fetch
  });
}
```

```typescript
// src/routes/dashboard/+page.server.ts
import { createServerApi } from '$lib/server/api';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const api = createServerApi(fetch);

  const [users, stats] = await Promise.all([
    api.get<User[]>('/users'),
    api.get<DashboardStats>('/stats')
  ]);

  return { users, stats };
};
```

```typescript
// src/lib/client-api.ts — client-side for user-triggered actions
import { createApiClient } from '$lib/api';

export const api = createApiClient({ baseUrl: '/api' });

// In a component:
// const user = await api.post<User>('/users', { name: 'Alice', email: 'alice@example.com' });
```

This pattern — a single `createApiClient` function that accepts SvelteKit's enhanced `fetch` on the server and uses global `fetch` on the client — is the cleanest way to share API logic between server and client contexts.

## Real Example: Fetching and Displaying Data

Here is a complete example that fetches data from a public API and handles all the edge cases:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5');

  if (!response.ok) {
    error(response.status, 'Could not load posts from the API');
  }

  const posts: { id: number; title: string; body: string }[] = await response.json();

  return { posts };
};
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Recent Posts</h1>

{#each data.posts as post (post.id)}
  <article>
    <h2>{post.title}</h2>
    <p>{post.body}</p>
  </article>
{/each}
```

Note the `(post.id)` key in the `#each` block. When Svelte re-renders the list (say, after a client-side navigation), it uses the key to match old DOM elements with new data instead of recreating everything. This is a performance detail, but it is the kind of thing that separates careless code from solid code.

## Credentials and CORS: The Cross-Origin Story

When your frontend and API live on different origins (different domains, ports, or protocols), you enter the world of CORS (Cross-Origin Resource Sharing). This is the source of more developer frustration than almost any other web concept. Understanding it prevents hours of debugging.

**Same-origin requests** (your frontend and API share the same origin) just work. Cookies are sent automatically, all headers are visible, and there are no preflight requests.

**Cross-origin requests** trigger CORS. The browser sends a preflight `OPTIONS` request to ask the server if it allows the cross-origin request. The server must respond with the correct `Access-Control-Allow-*` headers.

```typescript
// Cross-origin request with credentials (cookies)
const response = await fetch('https://api.different-domain.com/data', {
  credentials: 'include', // Send cookies cross-origin
  headers: {
    'Content-Type': 'application/json'
  }
});
```

The `credentials` option has three values:
- `"same-origin"` (default) — only send cookies for same-origin requests
- `"include"` — always send cookies, even cross-origin
- `"omit"` — never send cookies

In SvelteKit, you rarely need to worry about CORS for your own API routes because SvelteKit's enhanced `fetch` in load functions short-circuits to the handler directly — no HTTP request is made, so there is no cross-origin issue. But when calling external APIs or making client-side fetch calls to a different origin, CORS matters.

## Performance Implications

The way you use `fetch` directly impacts your app's performance:

1. **Parallel vs Sequential**: Use `Promise.all` for independent requests. Two 200ms requests in parallel take 200ms total; sequential takes 400ms.

2. **Keep-Alive**: Modern browsers maintain persistent connections. Multiple requests to the same origin reuse the TCP/TLS connection, which saves the 100-300ms handshake overhead.

3. **Response Size**: Consider pagination for large datasets. Fetching 10,000 records when the user sees 20 wastes bandwidth and memory. Request only what you need.

4. **Caching**: Set appropriate `Cache-Control` headers. A cached response takes 0ms. Even a 5-minute cache (`max-age=300`) can eliminate 90% of repeat requests.

5. **Body Parsing**: `.json()` is synchronous-blocking on the main thread for large payloads. If you are parsing multi-megabyte JSON, consider using a Web Worker or streaming the response.

6. **Connection Limits**: Browsers limit concurrent connections per origin (6 in Chrome). If you fire 20 requests at once, 14 queue up. Consider batching or a BFF (Backend For Frontend) pattern.

## Try It

1. **Basic**: Write an async function called `fetchTodos` that fetches the first five todos from `https://jsonplaceholder.typicode.com/todos?_limit=5`. Use `try/catch` to handle network errors. Check `response.ok` before parsing. If the response is not OK, throw an error with the status code. If the fetch succeeds, log each todo's `title` and whether it is `completed`. Then wrap this in a SvelteKit load function that returns the todos as page data.

2. **Intermediate**: Build a `fetchWithTimeout` function that accepts a URL, options, and a timeout in milliseconds. Use `AbortController` to cancel the request if it exceeds the timeout. Test it by fetching a URL with a 1ms timeout (it should always fail) and a 10000ms timeout (it should succeed).

3. **Advanced**: Create a complete API client class using the `createApiClient` pattern shown above. Add support for: (a) automatic retry with exponential backoff for 5xx errors, (b) request/response interceptors for logging, (c) a `cancel()` method that aborts all in-flight requests. Use it in a SvelteKit load function to fetch data from a public API.

4. **Expert**: Implement a streaming fetch that reads an NDJSON (newline-delimited JSON) endpoint line by line, parsing each line as a separate JSON object and calling a callback for each one. This simulates consuming a real-time event stream. Handle partial lines correctly (a chunk might split a line in the middle).

## Key Takeaways

- `fetch` is a web standard — it works in browsers, Node.js, and SvelteKit with the same core API
- `Request` and `Response` are platform primitives used across the web, not just in `fetch`
- URLs identify resources, HTTP methods indicate intent: GET reads, POST creates, PUT replaces, PATCH updates, DELETE removes
- `await fetch(url)` returns a Response object — always check `response.ok` before parsing the body
- `response.json()` and `response.text()` both return promises — the body is parsed asynchronously and can only be consumed once
- Network errors (try/catch via TypeError) and HTTP errors (status codes) are different failure modes — handle both
- Headers are the metadata layer: `Content-Type`, `Authorization`, `Accept`, and `Cache-Control` are the ones you use most
- AbortController provides cancellation and timeout — essential for search-as-you-type and preventing hung requests
- Response bodies are `ReadableStream`s — you can read them incrementally for progress tracking or streaming
- Retry with exponential backoff and jitter for transient failures, but never retry non-idempotent requests without idempotency keys
- In SvelteKit load functions, use the provided `fetch` from the event object — it forwards cookies, resolves relative URLs, deduplicates requests, and short-circuits calls to your own API routes
- `JSON.stringify()` converts objects to JSON strings for request bodies; `response.json()` parses JSON response bodies back into objects
- Never set `Content-Type` manually when using `FormData` — the browser needs to set it with the multipart boundary
- Build a typed API client to centralize error handling, timeouts, and headers across your application
