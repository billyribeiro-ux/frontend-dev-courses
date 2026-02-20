# Template Tags

Svelte's template language goes beyond `{#if}` and `{#each}`. There are several specialized template tags that solve common problems: handling asynchronous data, forcing re-renders, creating block-scoped variables, and debugging reactive state.

## Await Blocks

The `{#await}` block lets you handle promises directly in your template — showing loading, success, and error states without extra flag variables:

```svelte
<script lang="ts">
  async function loadUser(id: number) {
    const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);
    if (!res.ok) throw new Error('Failed to load user');
    return res.json() as Promise<{ name: string; email: string }>;
  }

  let userId = $state(1);
  let userPromise = $derived(loadUser(userId));
</script>

<label>User ID: <input type="number" min={1} max={10} bind:value={userId} /></label>

{#await userPromise}
  <p>Loading user...</p>
{:then user}
  <div class="user-card">
    <h2>{user.name}</h2>
    <p>{user.email}</p>
  </div>
{:catch error}
  <p class="error">Error: {error.message}</p>
{/await}
```

The three sections are: `{#await promise}` (pending), `{:then value}` (resolved), and `{:catch error}` (rejected).

If you do not need a loading state, use the short form:

```svelte
{#await configPromise then config}
  <p>App version: {config.version}</p>
{/await}
```

## Key Blocks

The `{#key}` block destroys and recreates its contents whenever the expression changes. This forces components to reset their internal state and retriggers intro animations:

```svelte
<script lang="ts">
  let currentTab = $state('profile');
</script>

<nav>
  <button onclick={() => currentTab = 'profile'}>Profile</button>
  <button onclick={() => currentTab = 'settings'}>Settings</button>
</nav>

{#key currentTab}
  <div class="tab-panel" style="animation: fadeIn 0.3s ease">
    <h2>{currentTab}</h2>
    <p>Content for the {currentTab} tab.</p>
  </div>
{/key}
```

Every time `currentTab` changes, the DOM element is torn down and rebuilt, so the CSS animation replays. This is also powerful for resetting component state:

```svelte
<script lang="ts">
  import EditForm from '$lib/components/EditForm.svelte';
  let selectedId = $state(1);
</script>

<select bind:value={selectedId}>
  <option value={1}>Item 1</option>
  <option value={2}>Item 2</option>
</select>

{#key selectedId}
  <EditForm id={selectedId} />
{/key}
```

When `selectedId` changes, the old `EditForm` is destroyed (clearing its internal state) and a new one is created.

## Block-Scoped Constants with @const

The `{@const}` tag creates a read-only variable scoped to the nearest block (`{#if}`, `{#each}`, `{#snippet}`). This keeps derived calculations close to where they are used:

```svelte
<script lang="ts">
  let products = $state([
    { name: 'Widget', price: 9.99, quantity: 3 },
    { name: 'Gadget', price: 24.99, quantity: 1 },
    { name: 'Doohickey', price: 4.99, quantity: 10 }
  ]);
</script>

<ul>
  {#each products as product}
    {@const total = product.price * product.quantity}
    {@const isExpensive = total > 20}
    <li class:expensive={isExpensive}>
      {product.name}: ${total.toFixed(2)} {isExpensive ? '(high value)' : ''}
    </li>
  {/each}
</ul>

<style>
  .expensive { color: #e74c3c; font-weight: bold; }
</style>
```

Without `{@const}`, you would either repeat `product.price * product.quantity` in multiple places or move it to a `$derived` value in the script, which is awkward for per-item calculations.

## Debugging with @debug

The `{@debug}` tag pauses the browser debugger when any of the listed variables change. It only works in development mode and is stripped from production builds:

```svelte
<script lang="ts">
  let count = $state(0);
  let name = $state('Alice');
</script>

{@debug count, name}

<button onclick={() => count++}>Increment: {count}</button>
<input bind:value={name} />
```

When `count` or `name` changes, the browser pauses execution (if DevTools is open). This is far more convenient than scattering `console.log` calls through your code. Remove `{@debug}` tags before deploying.

## The Each-Else Pattern

The `{#each}` block has a `{:else}` clause that renders when the array is empty:

```svelte
<script lang="ts">
  let notifications = $state<{ id: number; text: string }[]>([]);
</script>

<button onclick={() => notifications.push({ id: Date.now(), text: `New alert` })}>
  Add Notification
</button>
<button onclick={() => notifications = []}>Clear All</button>

<ul>
  {#each notifications as note (note.id)}
    <li>{note.text}</li>
  {:else}
    <li class="empty">No notifications. You are all caught up!</li>
  {/each}
</ul>
```

This is cleaner than wrapping the list in an `{#if items.length > 0}` check.

## Try It

Build a "Post Viewer" that fetches posts from `https://jsonplaceholder.typicode.com/posts?_limit=5`. Use `{#await}` for loading/error states. Display posts with `{#each}` and use `{@const}` to create a `preview` variable truncating each body to 80 characters. Add `{:else}` for the empty state. Wrap the list in `{#key}` that re-fetches when a "Refresh" button increments a counter.

## Key Takeaways

- `{#await promise}` handles loading, success, and error states for promises directly in templates
- The short form `{#await promise then value}` skips the loading state when not needed
- `{#key expression}` destroys and recreates contents when the expression changes — useful for resetting state and retriggering animations
- `{@const}` creates block-scoped constants inside `{#each}`, `{#if}`, and other blocks for cleaner per-item calculations
- `{@debug}` pauses the debugger in development when watched variables change — stripped in production
- `{:else}` on `{#each}` blocks provides a clean empty-state pattern without extra conditional logic
