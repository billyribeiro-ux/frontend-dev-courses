# Query Functions

SvelteKit's load functions work well, but they create a tight coupling between data fetching and routing. Your `+page.server.ts` file must know about every piece of data the page needs, and child components cannot declare their own data dependencies. If a deeply nested component needs data from the server, you must thread it through props from the page level. Remote functions solve this by letting any component fetch server data directly.

Remote functions run on the server but are called from components as if they were local. The compiler rewires the calls into HTTP requests behind the scenes. The `query` function from `$app/server` is the read-side of this system -- it fetches data and keeps it reactive.

This is a paradigm shift. Instead of "pages own data, components receive props," you get "any component can declare its own server data needs." The framework handles the network boundary transparently.

## Enabling Remote Functions

Remote functions are experimental. Enable them in your SvelteKit config:

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

Both settings are required. The `async` compiler option enables async component rendering (components can `await` directly in their script tag and use `{#await}` implicitly). The `remoteFunctions` option enables the server function infrastructure that rewires `.remote.ts` imports into HTTP calls.

### What Happens Under the Hood

When you import a function from a `.remote.ts` file in a component:

1. The compiler sees the `.remote.ts` import and replaces it with a client-side stub.
2. The stub sends an HTTP request to a generated API endpoint when called.
3. The server-side code runs in the endpoint handler, with full access to server APIs (database, file system, environment variables).
4. The result is serialized and sent back to the client.
5. The client stub deserializes the result and returns it to your component.

This means `.remote.ts` files are never bundled into the client. They run exclusively on the server, just like `+page.server.ts` files. The difference is that they are not tied to a specific route.

## Creating a Remote File

Remote functions live in `.remote.ts` files. These files run exclusively on the server -- the code never ships to the browser:

```typescript
// src/lib/api/products.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';

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

No `+page.server.ts` needed. The component declares its own data dependency. This is especially powerful for reusable components that are used on multiple pages -- the component carries its data-fetching logic with it, rather than relying on each page to provide the right data.

### Organizing Remote Files

A recommended project structure:

```
src/lib/api/
  products.remote.ts      # Product queries
  categories.remote.ts    # Category queries
  users.remote.ts         # User queries
  analytics.remote.ts     # Analytics queries
```

Each file groups related queries. This is analogous to how you might organize API routes, but without the routing boilerplate.

## Argument Validation

Remote functions accept arguments, but since they become HTTP endpoints, you must always validate the input. This is a security requirement, not a suggestion. Without validation, any client-side code (or any HTTP request) can send arbitrary data to your server function.

Use Zod or Valibot to define a schema:

```typescript
// src/lib/api/products.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import { eq, gte, lte, like, and } from 'drizzle-orm';
import * as v from 'valibot';

const SearchSchema = v.object({
  category: v.optional(v.string()),
  minPrice: v.optional(v.number()),
  maxPrice: v.optional(v.number()),
  search: v.optional(v.pipe(v.string(), v.maxLength(200)))
});

export const searchProducts = query(SearchSchema, async (filters) => {
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
  if (filters.search) {
    conditions.push(like(productsTable.name, `%${filters.search}%`));
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(productsTable.name)
    .limit(50);

  return products;
});
```

```svelte
<script lang="ts">
  import { searchProducts } from '$lib/api/products.remote';

  let category = $state('electronics');
  let minPrice = $state(0);
  let maxPrice = $state(1000);
  let search = $state('');

  // Re-runs automatically when any parameter changes
  const results = searchProducts({ category, minPrice, maxPrice, search });
</script>
```

The schema validates input on the server before your handler runs. Invalid arguments return an error rather than executing the query with bad data. This is defense in depth -- even if a malicious client crafts a custom request, the schema rejects invalid input.

### Validation Details

When validation fails, the client receives an error object with details about what went wrong. The schema acts as both documentation and enforcement of the API contract.

```typescript
// Strict schema with transformations
const CreateProductSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
  price: v.pipe(v.number(), v.minValue(0), v.maxValue(999999)),
  description: v.pipe(
    v.string(),
    v.maxLength(5000),
    v.transform((s) => s.trim())
  )
});
```

The schema can also transform input (like trimming whitespace), ensuring your handler receives clean data.

## Reactive Queries

When you pass reactive values (like `$state` variables) as arguments to a query function, the query automatically re-runs when those values change. This is one of the most powerful features of remote functions:

```svelte
<script lang="ts">
  import { searchProducts } from '$lib/api/products.remote';

  let category = $state('all');
  let sortBy = $state('name');
  let page = $state(1);

  // This query re-runs whenever category, sortBy, or page changes
  const products = searchProducts({ category, sortBy, page });
</script>

<select bind:value={category}>
  <option value="all">All Categories</option>
  <option value="electronics">Electronics</option>
  <option value="clothing">Clothing</option>
</select>

<select bind:value={sortBy}>
  <option value="name">Name</option>
  <option value="price">Price</option>
  <option value="newest">Newest</option>
</select>

{#if products.loading}
  <p>Loading...</p>
{:else if products.error}
  <p>Error: {products.error.message}</p>
{:else}
  <ul>
    {#each products.current as product}
      <li>{product.name} -- ${product.price}</li>
    {/each}
  </ul>
{/if}

<button disabled={page <= 1} onclick={() => page--}>Previous</button>
<span>Page {page}</span>
<button onclick={() => page++}>Next</button>
```

When the user changes the category dropdown, SvelteKit automatically fires a new request with the updated parameters. The old request is aborted (if still in flight), and the UI shows the loading state while the new data loads.

### Debouncing Reactive Queries

For search inputs where the user types rapidly, you want to debounce the query to avoid firing a request on every keystroke. Since the query re-runs whenever its arguments change, debounce the state update, not the query:

```svelte
<script lang="ts">
  import { searchProducts } from '$lib/api/products.remote';

  let searchInput = $state('');
  let debouncedSearch = $state('');
  let debounceTimer: ReturnType<typeof setTimeout>;

  // Debounce the search input
  $effect(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedSearch = searchInput;
    }, 300);

    return () => clearTimeout(debounceTimer);
  });

  // The query uses the debounced value, not the raw input
  const results = searchProducts({ search: debouncedSearch });
</script>

<input
  type="text"
  bind:value={searchInput}
  placeholder="Search products..."
/>

{#if results.loading}
  <p>Searching...</p>
{:else if results.current}
  <p>{results.current.length} results</p>
  {#each results.current as product}
    <div>{product.name}</div>
  {/each}
{/if}
```

The query only fires when `debouncedSearch` changes, which is 300ms after the user stops typing. The raw `searchInput` updates on every keystroke (for immediate visual feedback in the input), but the expensive server query waits.

## Refresh, Loading, and Error States

The object returned by `query` provides reactive properties for managing UI state without `{#await}`:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

{#if products.loading}
  <div class="skeleton-grid">
    {#each Array(6) as _}
      <div class="skeleton-card">
        <div class="skeleton-line" style="width: 80%; height: 1.2rem;"></div>
        <div class="skeleton-line" style="width: 40%; height: 1rem;"></div>
      </div>
    {/each}
  </div>
{:else if products.error}
  <div class="error-card">
    <h3>Failed to load products</h3>
    <p>{products.error.message}</p>
    <button onclick={() => products.refresh()}>Try Again</button>
  </div>
{:else}
  <ul>
    {#each products.current as product}
      <li>{product.name} -- ${product.price}</li>
    {/each}
  </ul>
{/if}

<button onclick={() => products.refresh()} disabled={products.loading}>
  {products.loading ? 'Refreshing...' : 'Refresh'}
</button>
```

The four properties:

- **`.current`** -- the resolved data (or `undefined` while loading for the first time). After the first load, `.current` retains the previous data during a refresh, so you can show stale data with a loading indicator.
- **`.loading`** -- `true` while a request is in flight. This is true both during the initial load and during refreshes.
- **`.error`** -- the error object if the query failed. It is `null` when the query succeeds.
- **`.refresh()`** -- re-fetches the data from the server. Useful for "try again" buttons, pull-to-refresh, or periodic updates.

### Stale-While-Revalidate Pattern

A key UX insight: during a `.refresh()`, `.current` still holds the previous data. You can show the stale data with a subtle loading indicator, rather than replacing the content with a spinner:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

<div class:refreshing={products.loading && products.current}>
  {#if products.current}
    <ul>
      {#each products.current as product}
        <li>{product.name}</li>
      {/each}
    </ul>
  {:else if products.loading}
    <p>Loading...</p>
  {/if}
</div>

{#if products.loading && products.current}
  <div class="refresh-indicator">Updating...</div>
{/if}

<style>
  .refreshing { opacity: 0.6; pointer-events: none; }
  .refresh-indicator {
    position: fixed; top: 0; left: 50%; transform: translateX(-50%);
    background: #3b82f6; color: white; padding: 4px 16px;
    border-radius: 0 0 8px 8px; font-size: 0.85rem;
  }
</style>
```

The first load shows a spinner. Subsequent refreshes show the old data at reduced opacity with a "Updating..." banner. This is the stale-while-revalidate pattern that makes apps feel fast.

## Batching Queries

When multiple queries fire simultaneously, `query.batch` combines them into a single HTTP request. This solves the waterfall problem where multiple components each make their own server call:

```typescript
// src/lib/api/dashboard.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';

export const getRevenueStats = query(async () => {
  const result = await db.select({
    totalRevenue: sql`SUM(amount)`,
    orderCount: sql`COUNT(*)`,
    averageOrder: sql`AVG(amount)`
  }).from(ordersTable);
  return result[0];
});

export const getTopProducts = query(async () => {
  return await db
    .select({
      name: productsTable.name,
      totalSold: sql`SUM(${orderItemsTable.quantity})`,
      revenue: sql`SUM(${orderItemsTable.quantity} * ${orderItemsTable.price})`
    })
    .from(orderItemsTable)
    .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
    .groupBy(productsTable.name)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(10);
});

export const getRecentOrders = query(async () => {
  return await db
    .select()
    .from(ordersTable)
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);
});
```

```svelte
<script lang="ts">
  import { query } from '$app/server';
  import { getRevenueStats, getTopProducts, getRecentOrders } from '$lib/api/dashboard.remote';

  // All three queries are batched into a single HTTP request
  const [stats, topProducts, orders] = query.batch([
    getRevenueStats(),
    getTopProducts(),
    getRecentOrders()
  ]);
</script>

{#await Promise.all([stats, topProducts, orders])}
  <p>Loading dashboard...</p>
{:then [revenue, products, recentOrders]}
  <div class="dashboard-grid">
    <div class="stat-card">
      <h3>Revenue</h3>
      <p class="stat-value">${revenue.totalRevenue.toLocaleString()}</p>
      <p class="stat-label">{revenue.orderCount} orders (avg ${revenue.averageOrder.toFixed(2)})</p>
    </div>

    <div class="top-products">
      <h3>Top Products</h3>
      <ol>
        {#each products as product}
          <li>
            <span>{product.name}</span>
            <span>{product.totalSold} sold (${product.revenue.toLocaleString()})</span>
          </li>
        {/each}
      </ol>
    </div>

    <div class="recent-orders">
      <h3>Recent Orders</h3>
      <table>
        <thead><tr><th>Order</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody>
          {#each recentOrders as order}
            <tr>
              <td>#{order.id}</td>
              <td>${order.amount.toFixed(2)}</td>
              <td>{new Date(order.createdAt).toLocaleDateString()}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
{/await}
```

Without batching, three components fetching data would make three separate round trips to the server. With `query.batch`, they share a single request. The server receives all three queries in one HTTP call, executes them (potentially in parallel), and returns all results in a single response.

### When Batching Matters

Batching is most impactful when:

1. **Multiple components on the same page each need server data.** Without batching, each component makes its own request, creating a waterfall of sequential HTTP calls.
2. **The server is geographically distant.** Each round trip adds latency. Batching reduces the number of round trips.
3. **The queries are independent.** Batched queries run in parallel on the server, so the total time is the time of the slowest query, not the sum of all queries.

Batching is automatic within a single page render. If you do not call `query.batch` explicitly, queries that fire during the same render cycle may still be batched automatically by the framework.

## Live Queries

`query.live` enables real-time data streaming from server to client. Instead of returning a single result, the server function uses an async generator to yield values over time, and the client receives each update reactively:

```typescript
// src/lib/api/notifications.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';

export const getNotifications = query.live(async function* (userId: string) {
  while (true) {
    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(20);

    yield notifications;

    // Wait before checking for new data
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

{#if notifications.connected}
  <span class="status live">Live</span>
{:else}
  <span class="status offline">Disconnected</span>
  <button onclick={() => notifications.reconnect()}>Reconnect</button>
{/if}

{#each notifications.current ?? [] as note}
  <div class="notification" class:unread={!note.read}>
    <p>{note.message}</p>
    <time>{new Date(note.createdAt).toLocaleString()}</time>
  </div>
{:else}
  <p>No notifications yet.</p>
{/each}

<style>
  .status { padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; }
  .live { background: #d1fae5; color: #065f46; }
  .offline { background: #fef2f2; color: #991b1b; }
  .notification { padding: 12px; border-bottom: 1px solid #e5e7eb; }
  .unread { background: #f0f9ff; }
</style>
```

The object returned by `query.live` includes two properties for connection management:

- **`.connected`** -- a reactive boolean that is `true` while the streaming connection is active
- **`.reconnect()`** -- re-establishes the connection after a disconnection or network interruption

### Live Query Architecture

Under the hood, `query.live` uses server-sent events (SSE) or a similar streaming protocol. The server holds the connection open and pushes data whenever the generator yields. The client-side stub receives each chunk and updates `.current` reactively.

The server controls the yield frequency, so you can tune how often updates are pushed without changing client code. For a stock ticker, you might yield every 100ms. For notifications, every 3-5 seconds is sufficient.

### Real-Time Dashboard Example

A complete live dashboard card with auto-updating metrics:

```typescript
// src/lib/api/metrics.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';

export const getLiveMetrics = query.live(async function* () {
  while (true) {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60_000);
    const oneHourAgo = new Date(now.getTime() - 3_600_000);

    const [minuteStats] = await db.select({
      requestCount: sql`COUNT(*)`,
      errorCount: sql`COUNT(*) FILTER (WHERE status >= 400)`,
      avgResponseTime: sql`AVG(response_time_ms)`
    })
    .from(requestLogsTable)
    .where(gte(requestLogsTable.timestamp, oneMinuteAgo));

    const [hourStats] = await db.select({
      totalRequests: sql`COUNT(*)`,
      uniqueUsers: sql`COUNT(DISTINCT user_id)`,
      revenue: sql`COALESCE(SUM(amount), 0)`
    })
    .from(requestLogsTable)
    .leftJoin(ordersTable, eq(requestLogsTable.orderId, ordersTable.id))
    .where(gte(requestLogsTable.timestamp, oneHourAgo));

    yield {
      timestamp: now.toISOString(),
      requestsPerMinute: minuteStats.requestCount,
      errorsPerMinute: minuteStats.errorCount,
      avgResponseTimeMs: Math.round(minuteStats.avgResponseTime ?? 0),
      totalRequestsHour: hourStats.totalRequests,
      uniqueUsersHour: hourStats.uniqueUsers,
      revenueHour: hourStats.revenue
    };

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
});
```

```svelte
<script lang="ts">
  import { getLiveMetrics } from '$lib/api/metrics.remote';

  const metrics = getLiveMetrics();

  // Track previous values for trend indicators
  let previousRPM = $state(0);
  let rpmTrend = $derived.by(() => {
    const current = metrics.current?.requestsPerMinute ?? 0;
    const trend = current > previousRPM ? 'up' : current < previousRPM ? 'down' : 'stable';
    // Update previous for next comparison (side effect, so use $effect instead in production)
    return trend;
  });
</script>

<div class="metrics-grid">
  {#if metrics.current}
    {@const m = metrics.current}

    <div class="metric-card">
      <span class="metric-label">Requests/min</span>
      <span class="metric-value">{m.requestsPerMinute}</span>
    </div>

    <div class="metric-card" class:danger={m.errorsPerMinute > 5}>
      <span class="metric-label">Errors/min</span>
      <span class="metric-value">{m.errorsPerMinute}</span>
    </div>

    <div class="metric-card" class:warning={m.avgResponseTimeMs > 500}>
      <span class="metric-label">Avg Response</span>
      <span class="metric-value">{m.avgResponseTimeMs}ms</span>
    </div>

    <div class="metric-card">
      <span class="metric-label">Users (1hr)</span>
      <span class="metric-value">{m.uniqueUsersHour}</span>
    </div>

    <div class="metric-card">
      <span class="metric-label">Revenue (1hr)</span>
      <span class="metric-value">${Number(m.revenueHour).toLocaleString()}</span>
    </div>

    <p class="last-update">
      Last update: {new Date(m.timestamp).toLocaleTimeString()}
      {#if metrics.connected}
        <span class="live-dot"></span>
      {/if}
    </p>
  {:else}
    <p>Loading metrics...</p>
  {/if}
</div>

{#if !metrics.connected}
  <div class="reconnect-banner">
    Connection lost.
    <button onclick={() => metrics.reconnect()}>Reconnect</button>
  </div>
{/if}

<style>
  .metrics-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
  }
  .metric-card {
    padding: 16px; background: #f8fafc;
    border-radius: 8px; text-align: center;
  }
  .metric-label { font-size: 0.8rem; color: #64748b; display: block; }
  .metric-value { font-size: 1.8rem; font-weight: 700; color: #1e293b; }
  .danger .metric-value { color: #dc2626; }
  .warning .metric-value { color: #d97706; }
  .live-dot {
    display: inline-block; width: 8px; height: 8px;
    background: #22c55e; border-radius: 50;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
  .reconnect-banner {
    background: #fef2f2; color: #991b1b; padding: 8px 16px;
    border-radius: 8px; text-align: center; margin-top: 16px;
  }
</style>
```

### When to Use Live Queries

Live queries are appropriate for:

- **Dashboards** -- metrics, analytics, system health
- **Notification feeds** -- new messages, alerts, status updates
- **Collaborative features** -- who is online, typing indicators, shared cursors
- **Order/shipping tracking** -- real-time status updates
- **Chat applications** -- message streams

They are not appropriate for:

- **Infrequently changing data** -- use regular queries with manual refresh
- **User-initiated data** -- forms, searches (use regular queries triggered by user action)
- **Large datasets** -- streaming thousands of records per second is expensive

## Caching and Deduplication

Queries are deduplicated within a single page render. If two components on the same page call `getProducts()` with the same arguments, they receive the same object -- not two separate server requests:

```svelte
<!-- ProductList.svelte -->
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  const products = getProducts(); // Request #1
</script>

<!-- ProductCount.svelte (sibling component on same page) -->
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  const products = getProducts(); // Same object as #1, no new request
</script>
```

This means you can call query functions freely without worrying about redundant fetches. Each component declares its own data needs, and the framework deduplicates behind the scenes.

### Cache Behavior Details

1. **Same arguments = same query.** The deduplication key is the function reference plus the serialized arguments. `getProducts()` and `getProducts({ category: 'all' })` are different queries.
2. **Cache lifetime.** By default, the cache lives for the duration of the page render. Navigating to a new page clears it.
3. **Manual invalidation.** Calling `.refresh()` bypasses the cache and fetches fresh data.
4. **Server-side caching.** You can add caching on the server side too -- either in-memory (for development) or with Redis/Memcached (for production).

### Server-Side Caching Pattern

For expensive queries, add a caching layer on the server:

```typescript
// src/lib/api/analytics.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';

// Simple in-memory cache with TTL
const cache = new Map<string, { data: any; expiresAt: number }>();

function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data);
  }

  return fn().then((data) => {
    cache.set(key, { data, expiresAt: Date.now() + ttlMs });
    return data;
  });
}

export const getMonthlyRevenue = query(async () => {
  return withCache('monthly-revenue', 60_000, async () => {
    // This expensive query runs at most once per minute
    return await db.select({
      month: sql`DATE_TRUNC('month', created_at)`,
      revenue: sql`SUM(amount)`,
      orders: sql`COUNT(*)`
    })
    .from(ordersTable)
    .groupBy(sql`DATE_TRUNC('month', created_at)`)
    .orderBy(sql`DATE_TRUNC('month', created_at) DESC`)
    .limit(12);
  });
});
```

This is a server-side optimization that reduces database load. The client-side deduplication handles the case where multiple components want the same data simultaneously. The server-side cache handles the case where the same query is called repeatedly over time.

## Complete Data Dashboard

Here is a complete example that combines regular queries, batched queries, live queries, and all the UI patterns:

```typescript
// src/lib/api/dashboard.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import * as v from 'valibot';

// Regular queries with validation
const DateRangeSchema = v.object({
  startDate: v.pipe(v.string(), v.isoDate()),
  endDate: v.pipe(v.string(), v.isoDate())
});

export const getRevenueTrend = query(DateRangeSchema, async ({ startDate, endDate }) => {
  return await db.select({
    date: sql`DATE(created_at)`,
    revenue: sql`SUM(amount)`,
    orders: sql`COUNT(*)`
  })
  .from(ordersTable)
  .where(
    and(
      gte(ordersTable.createdAt, new Date(startDate)),
      lte(ordersTable.createdAt, new Date(endDate))
    )
  )
  .groupBy(sql`DATE(created_at)`)
  .orderBy(sql`DATE(created_at)`);
});

export const getTopCategories = query(async () => {
  return await db.select({
    category: productsTable.category,
    totalRevenue: sql`SUM(${orderItemsTable.price} * ${orderItemsTable.quantity})`,
    itemsSold: sql`SUM(${orderItemsTable.quantity})`
  })
  .from(orderItemsTable)
  .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
  .groupBy(productsTable.category)
  .orderBy(sql`SUM(${orderItemsTable.price} * ${orderItemsTable.quantity}) DESC`)
  .limit(5);
});

// Live query for real-time data
export const getLiveOrderCount = query.live(async function* () {
  while (true) {
    const [result] = await db.select({
      count: sql`COUNT(*)`
    })
    .from(ordersTable)
    .where(gte(ordersTable.createdAt, sql`NOW() - INTERVAL '24 hours'`));

    yield { count: result.count, timestamp: new Date().toISOString() };
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
});
```

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import {
    getRevenueTrend,
    getTopCategories,
    getLiveOrderCount
  } from '$lib/api/dashboard.remote';
  import { query } from '$app/server';

  // Date range state
  let startDate = $state(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  let endDate = $state(
    new Date().toISOString().split('T')[0]
  );

  // Regular query with reactive parameters
  const revenue = getRevenueTrend({ startDate, endDate });

  // Static query
  const categories = getTopCategories();

  // Live query
  const liveOrders = getLiveOrderCount();
</script>

<h1>Dashboard</h1>

<!-- Live counter -->
<div class="live-counter">
  {#if liveOrders.current}
    <span class="counter-value">{liveOrders.current.count}</span>
    <span class="counter-label">orders in the last 24h</span>
    {#if liveOrders.connected}
      <span class="live-badge">LIVE</span>
    {/if}
  {:else}
    <span class="counter-value">--</span>
    <span class="counter-label">Loading...</span>
  {/if}
</div>

<!-- Date range picker -->
<div class="date-range">
  <input type="date" bind:value={startDate} />
  <span>to</span>
  <input type="date" bind:value={endDate} />
  <button onclick={() => revenue.refresh()} disabled={revenue.loading}>
    Refresh
  </button>
</div>

<!-- Revenue trend -->
<section>
  <h2>Revenue Trend</h2>
  {#if revenue.loading && !revenue.current}
    <div class="skeleton" style="height: 200px;"></div>
  {:else if revenue.error}
    <p class="error">Failed to load revenue data: {revenue.error.message}</p>
  {:else if revenue.current}
    <div class="chart" class:loading={revenue.loading}>
      <table>
        <thead><tr><th>Date</th><th>Revenue</th><th>Orders</th></tr></thead>
        <tbody>
          {#each revenue.current as day}
            <tr>
              <td>{new Date(day.date).toLocaleDateString()}</td>
              <td>${Number(day.revenue).toLocaleString()}</td>
              <td>{day.orders}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<!-- Top categories -->
<section>
  <h2>Top Categories</h2>
  {#if categories.loading}
    <p>Loading...</p>
  {:else if categories.current}
    {#each categories.current as cat, i}
      <div class="category-bar">
        <span class="category-name">{i + 1}. {cat.category}</span>
        <span class="category-revenue">${Number(cat.totalRevenue).toLocaleString()}</span>
        <span class="category-items">({cat.itemsSold} items)</span>
      </div>
    {/each}
  {/if}
</section>

<style>
  .live-counter {
    text-align: center; padding: 24px;
    background: linear-gradient(135deg, #1e293b, #334155);
    color: white; border-radius: 12px; margin-bottom: 24px;
  }
  .counter-value { font-size: 3rem; font-weight: 800; display: block; }
  .counter-label { font-size: 0.9rem; opacity: 0.8; }
  .live-badge {
    display: inline-block; padding: 2px 8px;
    background: #22c55e; color: white; border-radius: 12px;
    font-size: 0.7rem; font-weight: 700; margin-left: 8px;
    animation: pulse 2s infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  .date-range {
    display: flex; gap: 8px; align-items: center;
    margin-bottom: 24px;
  }
  .chart { transition: opacity 0.2s; }
  .chart.loading { opacity: 0.5; }
  .skeleton {
    background: linear-gradient(90deg, #f1f5f9, #e2e8f0, #f1f5f9);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 8px;
  }
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  .category-bar {
    display: flex; gap: 8px; padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
  }
  .category-name { flex: 1; font-weight: 600; }
  .category-revenue { font-weight: 500; }
  .category-items { color: #64748b; font-size: 0.85rem; }
  .error { color: #dc2626; padding: 12px; background: #fef2f2; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
  th { background: #f8fafc; font-size: 0.85rem; color: #64748b; }
</style>
```

## query vs Load Functions: When to Use Which

| Feature | Load Functions | Query Functions |
|---------|---------------|-----------------|
| Data ownership | Page owns all data | Components own their data |
| Coupling | Tight to route | Loose, reusable |
| SSR | Full SSR support | SSR with async components |
| Waterfall prevention | `Promise.all` in load | `query.batch` |
| Real-time data | Not built-in | `query.live` |
| Caching | SvelteKit handles | Manual + dedup |
| Maturity | Stable, battle-tested | Experimental |

**Use load functions when:**
- The page has a clear, well-defined set of data requirements
- You need rock-solid SSR without experimental features
- You want to leverage SvelteKit's built-in caching and invalidation

**Use query functions when:**
- Components need to declare their own data dependencies
- You have deeply nested components that would require extensive prop drilling
- You need real-time data with `query.live`
- You want to share data-fetching logic across multiple pages

The two approaches are not mutually exclusive. A page can use a load function for its primary data and query functions for supplementary data in nested components.

## Try It

Build a data dashboard page with the following:

1. Create a `.remote.ts` file that exports:
   - `getCategories()` -- no arguments, returns a list of categories
   - `getProductsByCategory(category)` -- accepts a category string validated with Valibot, returns products
   - `getProductStats()` -- no arguments, returns total products, average price, and out-of-stock count
   - `getLiveInventory()` -- a live query that yields total inventory count every 5 seconds

2. Build the page:
   - A category sidebar that loads categories and highlights the selected one
   - A product grid that updates when a category is selected
   - A stats card at the top showing product statistics
   - A live inventory counter using `query.live`
   - Loading states using `.loading` with skeleton UIs
   - Error states using `.error` with retry buttons
   - A refresh button that calls `.refresh()` on the product grid

3. Implement debounced search within the selected category

## Key Takeaways

- Remote functions decouple data fetching from routing -- any component can declare its own server data needs
- Enable remote functions with `experimental.remoteFunctions` in kit config and `experimental.async` in compiler options
- `.remote.ts` files run exclusively on the server; the compiler converts calls into HTTP requests. They are never bundled into the client.
- Always validate arguments with a Zod or Valibot schema -- remote functions are public HTTP endpoints that anyone can call
- Reactive queries re-run automatically when `$state` arguments change. Debounce user input to avoid excessive requests.
- `.current` retains previous data during refresh, enabling stale-while-revalidate UX patterns
- `.refresh()` re-fetches data; `.loading`, `.error`, and `.current` provide reactive UI state
- `query.batch` combines multiple simultaneous queries into a single HTTP request, eliminating waterfall latency
- `query.live` streams real-time data using async generators; the returned object exposes `.connected` and `.reconnect()` for connection management
- Identical queries on the same page are deduplicated automatically -- components can freely declare their data needs
- Add server-side caching for expensive queries to reduce database load
- Query functions and load functions complement each other -- use load for primary page data, queries for component-level data and real-time features
