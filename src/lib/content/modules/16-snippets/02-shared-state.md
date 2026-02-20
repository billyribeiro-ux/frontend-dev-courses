# Shared State

As your SvelteKit application grows, you will encounter situations where multiple components need access to the same data — a shopping cart, user authentication status, or UI settings like sidebar open/closed state. Passing this data through props at every level gets tedious fast. Svelte 5 provides a clean solution: **shared reactive state** using `.svelte.ts` files.

By exporting `$state` from a `.svelte.ts` module, you create reactive state that any component can import and use. Changes are automatically reflected everywhere the state is referenced, with no prop drilling or event bubbling required.

## Creating Shared State

Create a `.svelte.ts` file in `src/lib/` (the `.svelte.ts` extension tells the compiler to enable Svelte runes in this file):

```typescript
// src/lib/stores/counter.svelte.ts
let count = $state(0);

export function getCount() {
  return count;
}

export function increment() {
  count += 1;
}

export function decrement() {
  count -= 1;
}

export function reset() {
  count = 0;
}
```

Now any component can import and use this state:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { getCount, increment, decrement, reset } from '$lib/stores/counter.svelte';
</script>

<h1>Count: {getCount()}</h1>

<button onclick={decrement}>-</button>
<button onclick={increment}>+</button>
<button onclick={reset}>Reset</button>
```

## A More Complete Example: Cart Store

Here is a realistic shared state module for a shopping cart:

```typescript
// src/lib/stores/cart.svelte.ts
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

let items = $state<CartItem[]>([]);

export function getItems() {
  return items;
}

export function getTotal() {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function getItemCount() {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function addItem(product: { id: string; name: string; price: number }) {
  const existing = items.find((item) => item.id === product.id);

  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ ...product, quantity: 1 });
  }
}

export function removeItem(id: string) {
  const index = items.findIndex((item) => item.id === id);
  if (index !== -1) {
    items.splice(index, 1);
  }
}

export function clearCart() {
  items.length = 0;
}
```

Use it across multiple components:

```svelte
<!-- src/lib/components/CartBadge.svelte -->
<script lang="ts">
  import { getItemCount } from '$lib/stores/cart.svelte';
</script>

<span class="badge">
  {getItemCount()} items
</span>
```

```svelte
<!-- src/lib/components/AddToCartButton.svelte -->
<script lang="ts">
  import { addItem } from '$lib/stores/cart.svelte';

  interface Props {
    product: { id: string; name: string; price: number };
  }

  let { product }: Props = $props();
</script>

<button onclick={() => addItem(product)}>
  Add to Cart
</button>
```

## Class-Based Shared State

For more complex state, you can use a class pattern:

```typescript
// src/lib/stores/auth.svelte.ts
interface User {
  id: string;
  name: string;
  email: string;
}

class AuthState {
  user = $state<User | null>(null);
  isLoading = $state(false);

  get isLoggedIn() {
    return this.user !== null;
  }

  login(userData: User) {
    this.user = userData;
  }

  logout() {
    this.user = null;
  }
}

export const auth = new AuthState();
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<nav>
  {#if auth.isLoggedIn}
    <span>Welcome, {auth.user?.name}</span>
    <button onclick={() => auth.logout()}>Log out</button>
  {:else}
    <a href="/login">Log in</a>
  {/if}
</nav>

{@render children()}
```

## When to Use Shared State vs Props

**Use props when:**
- Data flows from parent to child (one direction, one level)
- The data is specific to a single component relationship
- You want explicit, traceable data flow

**Use shared state when:**
- Multiple unrelated components need the same data
- Data needs to persist across page navigations
- Prop drilling would require passing data through 3+ levels

## Try It

Create a `cart.svelte.ts` shared state module with `addItem`, `removeItem`, and `getItems` functions. Build a product listing page where each product has an "Add to Cart" button. Build a cart badge in the navbar that shows the item count. Verify that adding items on the product page immediately updates the badge.

## Key Takeaways

- `.svelte.ts` files enable Svelte runes (`$state`, `$derived`) outside of components
- Export functions that read and modify `$state` to create shared reactive state
- Any component that imports from a `.svelte.ts` file sees updates reactively
- Use the class pattern for complex state with multiple related values and methods
- Shared state eliminates prop drilling for data needed by many components
- Prefer props for simple parent-child communication; use shared state for app-wide concerns
