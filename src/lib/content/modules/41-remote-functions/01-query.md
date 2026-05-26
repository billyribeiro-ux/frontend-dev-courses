# Query Functions

SvelteKit's load functions are the primary way to fetch data for pages, but they create a tight coupling between data fetching and routing. Your `+page.server.ts` file must know about every piece of data the page needs upfront, and child components cannot declare their own data dependencies. If a deeply nested component needs data from the server, you must thread it through props from the page level -- through every intermediate component in the tree. This is called prop drilling, and it gets worse as your component tree deepens.

Remote functions solve this architectural problem. They let any component, anywhere in the tree, fetch server data directly. The compiler rewires the calls into HTTP requests behind the scenes, so from the developer's perspective, you are calling a function -- but that function executes on the server. The `query` function from `$app/server` is the read-side of this system. It fetches data, manages loading and error states, provides refresh capabilities, supports batching multiple queries into a single round trip, and can even stream real-time data from server to client.

This lesson covers `query` in depth: how it works under the hood, how to validate arguments, how to manage UI states, and the advanced patterns (batching, live queries, caching) that make it production-ready.

## The Mental Model: Functions That Cross the Network Boundary

When you write a regular function in JavaScript, calling it means "execute this code in the same process, on the same machine." Remote functions change that contract. When you call a remote function from a component, the Svelte compiler has already rewritten that call into an HTTP request. The function body never ships to the browser -- it stays on the server. The arguments are serialized, sent over the network, deserialized on the server, the function executes, and the result travels back.

This means remote functions are not regular functions, even though they look like them. They have network latency, they can fail (network errors, server errors), they are public HTTP endpoints (anyone can call them, not just your UI), and they must validate their inputs because you cannot trust data that arrived over a network.

Understanding this mental model prevents three common mistakes:
1. Passing non-serializable values (DOM elements, functions, class instances) as arguments
2. Trusting arguments without validation (the server must treat all input as untrusted)
3. Ignoring loading and error states (network calls are never instant or guaranteed)

## Enabling Remote Functions

Remote functions are experimental. You must enable two separate settings: the `async` compiler option (which allows async component rendering) and the `remoteFunctions` kit option (which enables the server function infrastructure):

```javascript
// svelte.config.js
const config = {
  compilerOptions: {
    experimental: {
      async: true
    }
  },
  kit: {
    experimental: {
      remoteFunctions: true
    }
  }
};

export default config;
```

### Why Two Settings?

These are separate because they solve separate problems. The `async` compiler option changes how components render -- it allows `await` in the template and top-level `await` in `<script>` blocks. The `remoteFunctions` option creates the HTTP infrastructure for `.remote.ts` files. You could use `async` without remote functions (for other async patterns), but you cannot use remote functions without `async` because the component needs to handle the asynchronous nature of the network call.

### WRONG: Enabling Only One Setting

```javascript
// WRONG -- missing async compiler option
const config = {
  kit: {
    experimental: {
      remoteFunctions: true  // This alone is not enough
    }
  }
};
```

Without the `async` compiler option, your components cannot handle the asynchronous results of remote function calls. You will get a compiler error when trying to use the query result in an `{#await}` block or access `.current` on the returned object.

```javascript
// WRONG -- missing remoteFunctions
const config = {
  compilerOptions: {
    experimental: {
      async: true  // This alone is not enough
    }
  }
};
```

Without `remoteFunctions`, the compiler does not know how to transform imports from `.remote.ts` files. The import will fail because `.remote.ts` is treated as a regular TypeScript file that runs in the browser, and it will try to import server-only modules like `$app/server` on the client.

## Creating a Remote File

Remote functions live in `.remote.ts` files. The `.remote.ts` extension tells the Svelte compiler that this file runs exclusively on the server -- the code is never bundled into the client JavaScript. This is enforced the same way `$lib/server` is enforced: importing from a `.remote.ts` file in client code is rewritten by the compiler into an HTTP call.

```typescript
// src/lib/api/products.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import { productsTable } from '$lib/server/schema';

export const getProducts = query(async () => {
  const products = await db.select().from(productsTable);
  return products;
});
```

Import and call the function from any component:

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

{#await products}
  <p>Loading products...</p>
{:then items}
  <ul>
    {#each items as product}
      <li>{product.name} -- ${product.price}</li>
    {/each}
  </ul>
{/await}
```

No `+page.server.ts` needed. The component declares its own data dependency. This is the fundamental shift: data fetching moves from the route level to the component level.

### How the Compiler Transforms the Import

When the Svelte compiler processes the component, it sees the import from a `.remote.ts` file and transforms it. The original import:

```typescript
import { getProducts } from '$lib/api/products.remote';
```

becomes something like:

```typescript
// Compiler-generated client-side stub
const getProducts = (...args) =>
  __svelte_remote_call('/api/_remote/products/getProducts', args);
```

The actual function body (`db.select().from(productsTable)`) stays on the server. The client only gets a thin stub that makes an HTTP request. This is why the approach is secure -- your database queries, secrets, and server-side logic never appear in the client bundle.

### WRONG: Putting Query Functions in Regular .ts Files

```typescript
// WRONG -- src/lib/api/products.ts (not .remote.ts)
// This file will be bundled into the client!
import { query } from '$app/server';  // Error: $app/server is server-only
import { db } from '$lib/server/database';  // Error: $lib/server is server-only
```

The `.remote.ts` extension is not a suggestion -- it is the mechanism that tells the compiler to keep this code on the server. Without it, the file is treated as regular client-side code, and importing server-only modules will fail.

## Argument Validation

Since remote functions become HTTP endpoints, anyone can call them -- not just your UI. A malicious user could craft requests with arbitrary arguments. You must always validate input using a schema library like Zod or Valibot.

```typescript
// src/lib/api/products.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import { productsTable } from '$lib/server/schema';
import { eq, gte, lte, and } from 'drizzle-orm';
import * as v from 'valibot';

const SearchSchema = v.object({
  category: v.optional(v.string()),
  minPrice: v.optional(v.pipe(v.number(), v.minValue(0))),
  maxPrice: v.optional(v.pipe(v.number(), v.maxValue(1_000_000))),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)))
});

export const searchProducts = query(SearchSchema, async (filters) => {
  // 'filters' is fully typed and validated at this point.
  // Invalid input (negative prices, limit > 100, etc.) never reaches this code.
  const conditions = [];

  if (filters.category) {
    conditions.push(eq(productsTable.category, filters.category));
  }
  if (filters.minPrice !== undefined) {
    conditions.push(gte(productsTable.price, filters.minPrice));
  }
  if (filters.maxPrice !== undefined) {
    conditions.push(lte(productsTable.price, filters.maxPrice));
  }

  const page = filters.page ?? 1;
  const limit = filters.limit ?? 20;

  const results = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset((page - 1) * limit);

  return results;
});
```

```svelte
<script lang="ts">
  import { searchProducts } from '$lib/api/products.remote';

  let category = $state('electronics');
  let minPrice = $state(0);

  // The query re-runs automatically when category or minPrice changes
  const results = searchProducts({ category, minPrice });
</script>
```

### How Reactive Arguments Work

When you pass reactive state as arguments (like `{ category }` where `category` is `$state`), the query function tracks those dependencies. When `category` changes, the query automatically re-fetches with the new arguments. This is the same push-pull reactivity model that `$derived` uses -- the query is re-evaluated when its inputs change.

### WRONG: Skipping Validation

```typescript
// WRONG -- trusting raw input from the network
export const searchProducts = query(
  async (filters: { category: string; limit: number }) => {
    // A malicious user could send limit: 999999999 and dump your entire database
    // Or send category: "'; DROP TABLE products; --" for SQL injection
    const results = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.category, filters.category))
      .limit(filters.limit);

    return results;
  }
);
```

Without schema validation, you are trusting that the client sends well-formed data. This is a security vulnerability. Always validate with a schema that constrains every field -- string length, number ranges, enum values, required vs optional.

### WRONG: Validating Inside the Handler Instead of via Schema

```typescript
// WRONG -- manual validation inside the handler
export const searchProducts = query(async (filters: any) => {
  if (typeof filters.category !== 'string') {
    throw new Error('Invalid category');
  }
  if (filters.limit && (filters.limit < 1 || filters.limit > 100)) {
    throw new Error('Invalid limit');
  }
  // ... 20 more lines of manual validation
});
```

```typescript
// CORRECT -- schema-based validation
export const searchProducts = query(SearchSchema, async (filters) => {
  // 'filters' is already validated and typed
  // No manual checks needed
});
```

The schema-based approach is superior for three reasons: (1) the error messages are standardized and informative, (2) the TypeScript type of `filters` is automatically inferred from the schema, and (3) the validation runs before your handler, so you never need to handle invalid state inside your business logic.

## Refresh, Loading, and Error States

The object returned by `query` is not a simple promise -- it is a reactive state container that provides everything you need to build loading/error/success UI:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

{#if products.pending}
  <div class="skeleton-grid">
    {#each Array(6) as _}
      <div class="skeleton-card animate-pulse"></div>
    {/each}
  </div>
{:else if products.error}
  <div class="error-banner" role="alert">
    <p>Failed to load products: {products.error.message}</p>
    <button onclick={() => products.refresh()}>Try Again</button>
  </div>
{:else}
  <ul>
    {#each products.current as product}
      <li>{product.name}</li>
    {/each}
  </ul>

  <button onclick={() => products.refresh()}>
    Refresh
  </button>
{/if}
```

### The Returned Object's Properties

- **`.current`** -- the most recent successfully resolved data, or `undefined` if the query has not completed yet. After a refresh, `.current` retains the previous data until the new data arrives (stale-while-revalidate pattern).
- **`.pending`** -- `true` while the HTTP request is in flight. For initial loads, this is `true` until data arrives. For refreshes, this is `true` while fetching new data, but `.current` still holds the old data.
- **`.error`** -- the error object if the query failed, or `undefined` if it succeeded. This is an `Error` instance with a `.message` property.
- **`.refresh()`** -- re-fetches the data from the server. Returns a promise that resolves when the new data arrives.

### Building a Reusable Query Wrapper Component

Since loading/error/success is a universal pattern, you can build a wrapper component:

```svelte
<!-- src/lib/components/QueryResult.svelte -->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    query: {
      current: T | undefined;
      pending: boolean;
      error: Error | undefined;
      refresh: () => void;
    };
    children: Snippet<[T]>;
    loading?: Snippet;
    error?: Snippet<[Error, () => void]>;
  }

  let { query, children, loading, error }: Props = $props();
</script>

{#if query.pending && !query.current}
  {#if loading}
    {@render loading()}
  {:else}
    <p>Loading...</p>
  {/if}
{:else if query.error && !query.current}
  {#if error}
    {@render error(query.error, query.refresh)}
  {:else}
    <p>Error: {query.error.message}</p>
  {/if}
{:else if query.current}
  {@render children(query.current)}
{/if}
```

Usage:

```svelte
<script lang="ts">
  import QueryResult from '$lib/components/QueryResult.svelte';
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

<QueryResult query={products}>
  {#snippet children(items)}
    <ul>
      {#each items as product}
        <li>{product.name}</li>
      {/each}
    </ul>
  {/snippet}

  {#snippet loading()}
    <div class="skeleton-grid">Loading products...</div>
  {/snippet}

  {#snippet error(err, retry)}
    <p>Failed: {err.message}</p>
    <button onclick={retry}>Retry</button>
  {/snippet}
</QueryResult>
```

## Using {#await} vs .current/.pending/.error

You have two ways to handle query results in the template. The `{#await}` block treats the query as a promise:

```svelte
{#await products}
  <p>Loading...</p>
{:then items}
  {#each items as product}
    <li>{product.name}</li>
  {/each}
{:catch error}
  <p>Error: {error.message}</p>
{/await}
```

The `.current`/`.pending`/`.error` approach gives you more control, especially for stale-while-revalidate patterns:

```svelte
<!-- Show stale data with a loading indicator during refresh -->
{#if products.pending}
  <div class="refresh-indicator">Refreshing...</div>
{/if}

{#if products.current}
  <ul class:opacity-50={products.pending}>
    {#each products.current as product}
      <li>{product.name}</li>
    {/each}
  </ul>
{/if}
```

### WRONG: Showing a Full Loading Screen on Refresh

```svelte
<!-- WRONG -- replaces existing content with a loading spinner on refresh -->
{#if products.pending}
  <Spinner />
{:else if products.current}
  <ProductGrid products={products.current} />
{/if}
```

When the user clicks "Refresh," the entire product grid disappears and a spinner replaces it. This is jarring. Use the stale-while-revalidate pattern: keep showing the old data (dimmed or with a small indicator) while fresh data loads in the background.

## Batching Queries

When multiple queries fire simultaneously, `query.batch` combines them into a single HTTP request. Without batching, four components each fetching data would create four separate round trips, each with its own TCP connection setup, HTTP overhead, and server processing:

```typescript
// src/lib/api/weather.remote.ts
import { query } from '$app/server';
import * as v from 'valibot';

const CitySchema = v.object({
  city: v.string()
});

export const getWeather = query(CitySchema, async ({ city }) => {
  const res = await fetch(`https://api.weather.example/${city}`);
  return res.json();
});
```

```svelte
<script lang="ts">
  import { query } from '$app/server';
  import { getWeather } from '$lib/api/weather.remote';

  const cities = ['London', 'Paris', 'Tokyo', 'New York'];

  // All four requests are batched into a single HTTP call
  const weatherData = query.batch(
    cities.map((city) => getWeather({ city }))
  );
</script>

{#await weatherData}
  <p>Loading weather data...</p>
{:then results}
  {#each results as weather, i}
    <div class="weather-card">
      <h3>{cities[i]}</h3>
      <p>{weather.temp} C -- {weather.condition}</p>
    </div>
  {/each}
{/await}
```

### How Batching Works Under the Hood

Without batching, four calls to `getWeather()` would produce four HTTP requests:

```
POST /api/_remote/weather/getWeather  { city: "London" }
POST /api/_remote/weather/getWeather  { city: "Paris" }
POST /api/_remote/weather/getWeather  { city: "Tokyo" }
POST /api/_remote/weather/getWeather  { city: "New York" }
```

With `query.batch`, the runtime combines them into a single request:

```
POST /api/_remote/_batch  [
  { fn: "weather/getWeather", args: { city: "London" } },
  { fn: "weather/getWeather", args: { city: "Paris" } },
  { fn: "weather/getWeather", args: { city: "Tokyo" } },
  { fn: "weather/getWeather", args: { city: "New York" } }
]
```

The server executes all four functions (potentially in parallel), collects the results, and sends them back in a single response. This reduces network overhead dramatically -- especially on high-latency connections (mobile networks, users far from the server).

### When to Use Batching

Use `query.batch` when:
- A page renders multiple instances of the same component, each fetching different data
- A dashboard displays data from multiple sources simultaneously
- A list view pre-fetches details for visible items

Do not use batching when:
- Queries depend on each other (one query's result determines another query's arguments)
- Queries have vastly different response times (a fast query is held back by a slow one)
- You want independent error handling per query (a batch either succeeds or fails as a unit)

## Live Queries

`query.live` enables real-time data streaming from server to client. Instead of returning a single result, the server function uses an async generator to yield values over time, and the client receives each update reactively:

```typescript
// src/lib/api/notifications.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import { notificationsTable } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';

export const getNotifications = query.live(async function* (userId: string) {
  while (true) {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);

    yield notifications;

    // Wait 3 seconds before polling again
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
});
```

On the client side, the returned object updates automatically as the server yields new values:

```svelte
<script lang="ts">
  import { getNotifications } from '$lib/api/notifications.remote';
  import { userId } from '$lib/auth';

  const notifications = getNotifications(userId);
</script>

<div class="notification-header">
  {#if notifications.connected}
    <span class="status-dot bg-green-500"></span>
    <span>Live</span>
  {:else}
    <span class="status-dot bg-red-500"></span>
    <span>Disconnected</span>
    <button onclick={() => notifications.reconnect()}>Reconnect</button>
  {/if}
</div>

{#each notifications.current ?? [] as note}
  <div class="notification">
    <p>{note.message}</p>
    <time>{note.createdAt}</time>
  </div>
{/each}
```

### Live Query Properties

The object returned by `query.live` includes two additional properties beyond the standard query result:

- **`.connected`** -- a reactive boolean that is `true` while the streaming connection is active. It becomes `false` when the connection drops (network failure, server restart, tab backgrounded).
- **`.reconnect()`** -- re-establishes the connection after a disconnection. Call this from a "Reconnect" button or from a `$effect` that watches `.connected`.

### How Live Queries Work Under the Hood

Live queries use Server-Sent Events (SSE) under the hood. When the client calls a live query function, the runtime opens an SSE connection to the server. The server executes the async generator, and each `yield` sends an SSE event to the client with the serialized data. The client runtime deserializes the data and updates `.current`.

This means live queries have the same characteristics as SSE:
- Unidirectional (server to client only)
- Automatic reconnection by the browser if the connection drops
- Works through most proxies and firewalls (unlike WebSockets)
- Text-based, so binary data must be base64-encoded

### WRONG: Polling with setInterval Instead of Live Queries

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { getNotifications } from '$lib/api/notifications.remote';

  let notifications = $state([]);

  // WRONG -- manual polling is fragile and wasteful
  onMount(() => {
    const interval = setInterval(async () => {
      try {
        const result = await getNotifications(userId);
        notifications = result;
      } catch (e) {
        // Error handling? Reconnection logic? Backoff?
      }
    }, 3000);

    return () => clearInterval(interval);
  });
</script>
```

Manual polling requires you to build your own error handling, reconnection logic, and exponential backoff. `query.live` handles all of this for you, plus it uses SSE's built-in reconnection, and the server controls the yield frequency so you can tune it without changing client code.

### When to Use Live Queries

Live queries are ideal for:
- **Notification feeds** -- new notifications appear without page refresh
- **Dashboard metrics** -- charts and numbers update in real time
- **Collaborative indicators** -- "3 people viewing this board"
- **Activity logs** -- new entries appear as they happen
- **Status monitoring** -- server health, deployment progress, CI/CD pipelines

Live queries are not ideal for:
- **Chat messages** -- WebSockets provide lower latency and bidirectional communication
- **Collaborative editing** -- CRDTs or OT require bidirectional real-time sync
- **High-frequency data** -- stock tickers at 60fps are better served by WebSockets

## Caching and Deduplication

Queries are deduplicated within a single page render. If two components on the same page call `getProducts()` with the same arguments, they receive the same object -- not two separate server requests:

```svelte
<!-- ProductHeader.svelte -->
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  const products = getProducts();
  // Uses the first request's result
</script>

<!-- ProductGrid.svelte -->
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  const products = getProducts();
  // Same call, same arguments = same request, same object
</script>
```

### How Deduplication Works

The runtime tracks active queries by a key derived from the function name and the serialized arguments. When a second call matches an existing key, the runtime returns the same reactive object instead of making a new HTTP request. This means:

1. Both components share the same `.current`, `.pending`, and `.error` state
2. If one component calls `.refresh()`, both components see the updated data
3. The server processes only one request, not two

### WRONG: Trying to Prevent Duplicate Queries Manually

```svelte
<script lang="ts">
  // WRONG -- manual dedup adds complexity with no benefit
  import { getContext, setContext } from 'svelte';
  import { getProducts } from '$lib/api/products.remote';

  // Check if parent already fetched products
  let products = getContext('products');
  if (!products) {
    products = getProducts();
    setContext('products', products);
  }
</script>
```

You do not need to build deduplication yourself. The runtime handles it automatically. Calling `getProducts()` in twenty components results in one HTTP request. Trust the framework.

## Organizing Remote Functions

As your application grows, organizing `.remote.ts` files by domain keeps the codebase navigable:

```
src/lib/api/
  products.remote.ts      -- getProducts, searchProducts, getProductBySlug
  categories.remote.ts    -- getCategories, getCategoryTree
  orders.remote.ts        -- getOrders, getOrderById, getOrderStatus
  users.remote.ts         -- getCurrentUser, getUserProfile
  analytics.remote.ts     -- getDashboardStats, getRevenueChart
  notifications.remote.ts -- getNotifications (live query)
```

Each file corresponds to a domain entity or feature area. This mirrors how you would organize API routes in a traditional REST backend -- but without the boilerplate of defining routes, controllers, and serializers.

### WRONG: One Giant Remote File

```typescript
// WRONG -- src/lib/api/all.remote.ts
// 500 lines with every query in the application
export const getProducts = query(async () => { /* ... */ });
export const getCategories = query(async () => { /* ... */ });
export const getOrders = query(async () => { /* ... */ });
export const getUsers = query(async () => { /* ... */ });
// ... 30 more functions
```

This becomes unmaintainable quickly. Each function has different dependencies, different validation schemas, and different error handling. Group related functions together so a developer looking for "how products are fetched" knows to look in `products.remote.ts`.

## Try It

Build a product browser with remote functions:

1. Create a `categories.remote.ts` file that exports `getCategories()` -- a query with no arguments that returns all categories from the database

2. Create a `products.remote.ts` file that exports `getProductsByCategory()` -- a query that accepts a `{ category: string }` argument validated with Valibot, and returns matching products

3. Build a page that:
   - Displays a list of categories from `getCategories()`
   - When a category is selected, fetches and displays products using `getProductsByCategory({ category })`
   - Shows skeleton loading states using `.pending`
   - Shows error messages using `.error` with a retry button calling `.refresh()`
   - Uses the stale-while-revalidate pattern: dims existing products while refreshing instead of replacing them with a spinner

4. Add a `getProductCount()` live query that streams the total product count every 5 seconds, displayed in the page header as a live counter

5. Verify that selecting the same category twice does not trigger a duplicate request (check the Network tab in DevTools)

## Key Takeaways

- **Remote functions decouple data fetching from routing** -- any component can declare its own server data needs without prop drilling from the page level
- **Enable remote functions with two settings**: `experimental.remoteFunctions` in kit config and `experimental.async` in compiler options -- both are required
- **`.remote.ts` files run exclusively on the server** -- the compiler converts client-side calls into HTTP requests, keeping your database queries and secrets out of the browser bundle
- **Always validate arguments with a schema** (Valibot or Zod) -- remote functions are public HTTP endpoints, and unvalidated input is a security vulnerability
- **Use `.current`, `.pending`, and `.error`** for fine-grained UI control, or `{#await}` for simpler cases -- prefer stale-while-revalidate over full loading screens on refresh
- **`.refresh()` re-fetches data** while keeping the old data visible -- this is the production pattern for "pull to refresh" and refresh buttons
- **`query.batch` combines multiple queries** into a single HTTP round trip -- use it when a page renders many components that each need server data
- **`query.live` streams real-time data** using async generators and SSE -- the returned object provides `.connected` and `.reconnect()` for connection management
- **Identical queries on the same page are deduplicated automatically** -- calling the same function with the same arguments from multiple components results in one HTTP request
- **Organize `.remote.ts` files by domain** -- one file per entity or feature area, mirroring how you would structure API routes in a traditional backend
