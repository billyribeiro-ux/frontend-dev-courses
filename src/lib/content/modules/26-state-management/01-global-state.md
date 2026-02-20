# Global State

So far, all the reactive state you have created lives inside individual components. That works great until two components on different pages need to share the same data — like a user's shopping cart or authentication status. That is where **global state** comes in.

In Svelte 5, you can create global state by defining reactive variables inside `.svelte.ts` files and exporting them. Because JavaScript modules are singletons, every component that imports the same file gets the same state. Change it in one place, and every component that reads it updates automatically.

## Shared State with .svelte.ts Files

Create a file with the `.svelte.ts` extension so that Svelte processes the runes inside it:

```typescript
// src/lib/state/counter.svelte.ts
let count = $state(0);

export function increment() {
  count++;
}

export function decrement() {
  count--;
}

export function getCount() {
  return count;
}
```

Now any component can import and use this shared state:

```svelte
<script>
  import { getCount, increment, decrement } from '$lib/state/counter.svelte';
</script>

<p>Count: {getCount()}</p>
<button onclick={increment}>+</button>
<button onclick={decrement}>-</button>
```

## State Classes

For more complex state, a class pattern keeps everything organized. Svelte 5 runes work inside class fields:

```typescript
// src/lib/state/cart.svelte.ts
class CartState {
  items = $state<Array<{ id: number; name: string; quantity: number }>>([]);

  get totalItems() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  add(product: { id: number; name: string }) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.items.push({ ...product, quantity: 1 });
    }
  }

  remove(id: number) {
    this.items = this.items.filter(i => i.id !== id);
  }

  clear() {
    this.items = [];
  }
}

export const cart = new CartState();
```

```svelte
<script>
  import { cart } from '$lib/state/cart.svelte';
</script>

<span>Cart ({cart.totalItems})</span>
<button onclick={() => cart.add({ id: 1, name: 'Widget' })}>
  Add Widget
</button>
```

## When to Use Global vs Local State

Not everything belongs in global state. Here is a simple decision guide:

| Scenario | Use |
|----------|-----|
| Form input values | Local state (`$state` in component) |
| Modal open/closed | Local state |
| Current user / auth | Global state (`.svelte.ts`) |
| Shopping cart | Global state |
| Theme preference | Global state |
| Data from a loader | Page-level (from `+page.ts`) |

The rule of thumb: if only one component cares about the data, keep it local. If multiple unrelated components need it, make it global.

## Try It

Create a global theme state in `$lib/state/theme.svelte.ts` that tracks a `mode` value of either `"light"` or `"dark"`. Export a `toggle()` function and a `getMode()` getter. Use it from a header component and a settings page to verify they stay in sync.

## Key Takeaways

- Global state lives in `.svelte.ts` files and is shared across all components that import it
- JavaScript module singletons ensure one instance of state exists for the entire app
- Use classes with `$state` fields for complex state with multiple related values and methods
- Keep state local when only one component needs it; go global when multiple components must share data
- Getter functions or class getters are needed to maintain reactivity when exporting primitive state
