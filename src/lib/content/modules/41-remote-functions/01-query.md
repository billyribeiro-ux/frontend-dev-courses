# Query Functions

SvelteKit's load functions work well, but they create a tight coupling between data fetching and routing. Your `+page.server.ts` file must know about every piece of data the page needs, and child components cannot declare their own data dependencies. If a deeply nested component needs data from the server, you must thread it through props from the page level. Remote functions solve this by letting any component fetch server data directly.

Remote functions run on the server but are called from components as if they were local. The compiler rewires the calls into HTTP requests behind the scenes. The `query` function from `$app/server` is the read-side of this system — it fetches data and keeps it reactive.

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

Both settings are required. The `async` compiler option enables async component rendering, and `remoteFunctions` enables the server function infrastructure.

## Creating a Remote File

Remote functions live in `.remote.ts` files. These files run exclusively on the server — the code never ships to the browser:

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
      <li>{product.name} — ${product.price}</li>
    {/each}
  </ul>
{/await}
```

No `+page.server.ts` needed. The component declares its own data dependency.

## Argument Validation

Remote functions accept arguments, but since they become HTTP endpoints, you must always validate the input. Use Zod or Valibot to define a schema:

```typescript
// src/lib/api/products.remote.ts
import { query } from '$app/server';
import { db } from '$lib/server/database';
import * as v from 'valibot';

const SearchSchema = v.object({
  category: v.optional(v.string()),
  minPrice: v.optional(v.number()),
  maxPrice: v.optional(v.number())
});

export const searchProducts = query(SearchSchema, async (filters) => {
  let q = db.select().from(productsTable);

  if (filters.category) {
    q = q.where(eq(productsTable.category, filters.category));
  }

  return await q;
});
```

```svelte
<script lang="ts">
  import { searchProducts } from '$lib/api/products.remote';

  let category = $state('electronics');

  // Re-runs automatically when category changes
  const results = searchProducts({ category });
</script>
```

The schema validates input on the server before your handler runs. Invalid arguments return an error rather than executing the query with bad data.

## Refresh, Loading, and Error States

The object returned by `query` provides reactive properties for managing UI state without `{#await}`:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';

  const products = getProducts();
</script>

{#if products.loading}
  <p>Loading...</p>
{:else if products.error}
  <p>Error: {products.error.message}</p>
{:else}
  <ul>
    {#each products.current as product}
      <li>{product.name}</li>
    {/each}
  </ul>
{/if}

<button onclick={() => products.refresh()}>
  Refresh
</button>
```

- **`.current`** — the resolved data (or `undefined` while loading)
- **`.loading`** — true while a request is in flight
- **`.error`** — the error object if the query failed
- **`.refresh()`** — re-fetches the data from the server

## Batching Queries

When multiple queries fire simultaneously, `query.batch` combines them into a single HTTP request. This solves the waterfall problem where multiple components each make their own server call:

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
    <div>
      <h3>{cities[i]}</h3>
      <p>{weather.temp}°C — {weather.condition}</p>
    </div>
  {/each}
{/await}
```

Without batching, four components fetching weather data would make four separate round trips. With `query.batch`, they share a single request.

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
  <span class="status">Live</span>
{:else}
  <span class="status">Disconnected</span>
  <button onclick={() => notifications.reconnect()}>Reconnect</button>
{/if}

{#each notifications.current ?? [] as note}
  <div class="notification">
    <p>{note.message}</p>
    <time>{note.createdAt}</time>
  </div>
{/each}
```

The object returned by `query.live` includes two properties for connection management:

- **`.connected`** — a reactive boolean that is `true` while the streaming connection is active
- **`.reconnect()`** — re-establishes the connection after a disconnection or network interruption

Live queries are useful for real-time dashboards, notification feeds, collaborative editing indicators, and any feature where the UI must reflect server-side changes as they happen. Because the server controls the yield frequency, you can tune how often updates are pushed without changing client code.

## Caching Behavior

Queries are deduplicated within a single page render. If two components on the same page call `getProducts()` with the same arguments, they receive the same object — not two separate server requests. This means you can call query functions freely without worrying about redundant fetches.

## Try It

Create a `.remote.ts` file that exports two query functions: `getCategories` (no arguments) and `getProductsByCategory` (accepts a `category` string validated with Valibot). Build a page that displays a category list and, when one is selected, fetches and displays the matching products. Use `.loading` and `.error` for loading and error states. Add a refresh button that calls `.refresh()`.

## Key Takeaways

- Remote functions decouple data fetching from routing — any component can declare its own server data needs
- Enable remote functions with `experimental.remoteFunctions` in kit config and `experimental.async` in compiler options
- `.remote.ts` files run exclusively on the server; the compiler converts calls into HTTP requests
- Always validate arguments with a Zod or Valibot schema — remote functions are public HTTP endpoints
- `.refresh()` re-fetches data; `.loading`, `.error`, and `.current` provide reactive UI state
- `query.batch` combines multiple simultaneous queries into a single HTTP request
- `query.live` streams real-time data using async generators; the returned object exposes `.connected` and `.reconnect()` for connection management
- Identical queries on the same page are deduplicated automatically
