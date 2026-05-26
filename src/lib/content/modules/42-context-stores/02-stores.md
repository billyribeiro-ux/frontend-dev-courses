# Svelte Stores

Before Svelte 5 introduced runes, **stores** were the primary way to manage reactive state outside components. Stores still exist in Svelte 5, they are fully supported, and many libraries — including SvelteKit itself — expose stores as part of their API. Understanding stores is essential for working with the broader Svelte ecosystem.

A store is any object with a `subscribe` method that follows the Svelte store contract. The `svelte/store` module provides three built-in store creators: `writable`, `readable`, and `derived`.

## Writable Stores

A `writable` store holds a value that can be read and updated from anywhere:

```typescript
// src/lib/stores/counter.ts
import { writable } from 'svelte/store';

export const count = writable(0);
```

Writable stores expose three methods:

```typescript
import { count } from '$lib/stores/counter';

count.set(10);           // Replace the value
count.update(n => n + 1); // Transform the current value
count.subscribe(value => {
  console.log('Count is now:', value);
}); // Listen for changes — returns an unsubscribe function
```

In components, the `$` prefix auto-subscribes to the store and auto-unsubscribes when the component is destroyed:

```svelte
<script>
  import { count } from '$lib/stores/counter';
</script>

<p>Count: {$count}</p>
<button onclick={() => $count++}>Increment</button>
```

Writing `$count++` is shorthand for `count.update(n => n + 1)`. The `$` prefix works for both reading and writing.

## Readable Stores

A `readable` store cannot be set from outside — only its internal logic can update the value. This is perfect for values that come from external sources:

```typescript
// src/lib/stores/time.ts
import { readable } from 'svelte/store';

export const currentTime = readable(new Date(), (set) => {
  const interval = setInterval(() => {
    set(new Date());
  }, 1000);

  // Return a cleanup function
  return () => clearInterval(interval);
});
```

The second argument is a `start` function that runs when the first subscriber arrives. It receives `set` to update the value. The function it returns runs when the last subscriber leaves — perfect for cleanup.

```svelte
<script>
  import { currentTime } from '$lib/stores/time';
</script>

<p>The time is {$currentTime.toLocaleTimeString()}</p>
```

## Derived Stores

A `derived` store computes its value from one or more source stores. It updates automatically whenever any source changes:

```typescript
// src/lib/stores/cart.ts
import { writable, derived } from 'svelte/store';

interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

export const cartItems = writable<CartItem[]>([]);

export const totalPrice = derived(cartItems, ($items) =>
  $items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

export const itemCount = derived(cartItems, ($items) =>
  $items.reduce((sum, item) => sum + item.quantity, 0)
);
```

Derived stores can depend on multiple sources:

```typescript
import { derived } from 'svelte/store';

const fullName = derived(
  [firstName, lastName],
  ([$first, $last]) => `${$first} ${$last}`
);
```

## Getting a Store Value Synchronously

The `get` function reads a store's current value without subscribing. Use it sparingly — it subscribes, reads, and immediately unsubscribes, so it is inefficient in hot paths:

```typescript
import { get } from 'svelte/store';
import { count } from '$lib/stores/counter';

function logCurrentCount() {
  console.log('Count right now:', get(count));
}
```

This is most useful in non-reactive code like server-side utilities or one-off event handlers where you need a snapshot of the value.

## Custom Stores

A custom store wraps a `writable` and exposes a limited, domain-specific API. The only requirement is that the returned object has a `subscribe` method:

```typescript
// src/lib/stores/counter-custom.ts
import { writable } from 'svelte/store';

function createCounter(initial = 0) {
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    increment: () => update(n => n + 1),
    decrement: () => update(n => n - 1),
    reset: () => set(initial)
  };
}

export const counter = createCounter(0);
```

```svelte
<script>
  import { counter } from '$lib/stores/counter-custom';
</script>

<p>{$counter}</p>
<button onclick={counter.increment}>+</button>
<button onclick={counter.decrement}>-</button>
<button onclick={counter.reset}>Reset</button>
```

Consumers can read the value with `$counter` but can only modify it through the exposed methods. There is no `set` or `update` in the public API.

## When to Use Stores vs Runes vs Context

| Mechanism | When to Use |
|-----------|-------------|
| Runes (`$state`) | The default for new code. Use in `.svelte` and `.svelte.ts` files. |
| Stores | When using libraries that expose stores (SvelteKit's `page` store, third-party packages), or for interop with non-Svelte code that follows the store contract. |
| Context | When state is tree-scoped and should not be globally accessible. |

SvelteKit's own `$app/stores` module exposes `page`, `navigating`, and `updated` as stores. You will encounter these frequently. The `$` auto-subscription syntax makes them seamless to use.

## Migration: Stores to Runes

> **Note on Motion Stores:** The store-based `tweened()` and `spring()` functions from `svelte/motion` are deprecated in Svelte 5. They are replaced by the class-based `Tween` and `Spring` APIs, which use a `.current` property instead of the `$` prefix auto-subscription. When migrating from stores to runes, remember to migrate motion stores as well — replace `tweened(0)` with `new Tween(0)` and `spring(0)` with `new Spring(0)`, then access values via `.current` instead of `$storeName`.

If you have existing store-based code, converting to runes is straightforward:

```typescript
// BEFORE: store-based (src/lib/stores/user.ts)
import { writable, derived } from 'svelte/store';

export const user = writable({ name: '', email: '' });
export const greeting = derived(user, ($u) => `Hello, ${$u.name}`);
```

```typescript
// AFTER: runes-based (src/lib/state/user.svelte.ts)
let user = $state({ name: '', email: '' });
let greeting = $derived(`Hello, ${user.name}`);

export function getUser() { return user; }
export function getGreeting() { return greeting; }
export function setUser(data: { name: string; email: string }) {
  user = data;
}
```

Key differences in the migration: `writable` becomes `$state`, `derived` becomes `$derived`, the file extension changes to `.svelte.ts` so the Svelte compiler processes the runes, and you use getter functions or class getters to export reactive primitives.

## Try It

Create a custom store called `createTodoStore` that wraps a writable array of todo objects. Expose only `subscribe`, `add(text)`, `toggle(id)`, and `removeCompleted()` methods. Use a `derived` store to compute the number of remaining items. Use the store in a component with `$` auto-subscription.

## Key Takeaways

- Stores are Svelte's original reactivity primitive — they pre-date runes but are still fully supported
- `writable` creates a read/write store; `readable` creates a read-only store; `derived` computes from other stores
- The `$` prefix in components auto-subscribes and auto-unsubscribes, preventing memory leaks
- Custom stores expose a `subscribe` method plus domain-specific methods, hiding `set` and `update`
- Use `get(store)` sparingly for synchronous one-off reads outside reactive contexts
- For new code, prefer runes (`$state`, `$derived`). Use stores when interacting with libraries that expect them
- Migration from stores to runes: `writable` becomes `$state`, `derived` becomes `$derived`, file becomes `.svelte.ts`
