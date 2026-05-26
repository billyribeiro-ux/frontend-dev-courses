# Global State

So far, all the reactive state you have created lives inside individual components. That works until two components in completely different parts of your app need the same data — a shopping cart total in the header and the cart page, an authentication status in the navbar and a settings panel, a theme preference that affects every component. When state needs to be shared across unrelated components, you need **global state**.

In Svelte 5, global state is remarkably simple: define reactive variables in `.svelte.ts` files and export them. Because JavaScript modules are singletons, every component that imports the same file gets the same state. Change it in one place, and every component that reads it updates automatically.

But this simplicity hides important subtleties — especially around reactivity boundaries, SSR safety, and knowing when global state is the wrong tool.

## When Component-Local State Is Not Enough

Consider an e-commerce app. The "Add to Cart" button lives on a product detail page. The cart icon with a badge showing the item count lives in the header layout. These two components have no parent-child relationship — they are separated by multiple layers of routing.

You *could* pass cart data through props from a root layout, through intermediate layouts, through pages, down to every component. But this is prop drilling at its worst — dozens of components passing data they do not use just to shuttle it to a descendant.

Global state solves this cleanly: both components import the same module, read the same reactive state, and stay in sync automatically.

The rule is straightforward: **if multiple unrelated components need the same data, and that data is app-wide (not scoped to a subtree), use global state.**

## The Reactivity Boundary: Why .svelte.ts Files

Svelte 5 runes (`$state`, `$derived`, `$effect`) are compiled by the Svelte compiler. Regular `.ts` files are processed by TypeScript alone — the Svelte compiler never sees them. If you write `$state(0)` in a plain `.ts` file, it will not compile.

The `.svelte.ts` extension tells Svelte "this file contains runes — compile it." This is the **reactivity boundary**: runes only work in `.svelte` and `.svelte.ts` files.

```
src/lib/state/
  counter.svelte.ts   ← Svelte compiles this, runes work
  counter.ts           ← TypeScript only, $state would be a syntax error
```

This is not an arbitrary restriction. The Svelte compiler transforms `$state` into the reactive machinery that tracks reads and writes, triggers updates in components, and participates in the dependency graph. Without the compiler pass, `$state` is just a function call that does not exist at runtime.

## Shared State with Module-Level Functions

The simplest pattern for shared state is a module that exports getter functions:

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

```svelte
<script>
  import { getCount, increment, decrement } from '$lib/state/counter.svelte';
</script>

<p>Count: {getCount()}</p>
<button onclick={increment}>+</button>
<button onclick={decrement}>-</button>
```

### Why Getter Functions Instead of Exporting the Value Directly

You might wonder: why not `export { count }`? The reason is subtle but important.

When you export a primitive value and another module imports it, the import gets the *current value* at import time. Reassigning the original variable does not update the import — JavaScript module bindings for `let` do track reassignment, but Svelte's reactivity depends on reading a `$state` signal through a function call so the compiler can track the dependency.

```typescript
// BROKEN — components won't react to changes
let count = $state(0);
export { count }; // Importing modules get a binding, but templates
                   // can't track reactivity through bare imports

// WORKS — getter function lets the compiler track the read
export function getCount() {
  return count; // The $state read happens inside the function call
}
```

When a component calls `getCount()` in its template, Svelte can trace the reactive read and subscribe to updates. With a bare import, the reactivity chain breaks.

**The rule: export getter functions (or use classes with getter properties) for reactive state that crosses module boundaries.**

## Class-Based Shared State

For state with multiple related values and methods, a class is the natural container. Svelte 5 runes work inside class fields, giving you encapsulation and a clean API:

```typescript
// src/lib/state/cart.svelte.ts
class CartState {
  items = $state<Array<{ id: number; name: string; quantity: number }>>([]);

  get totalItems() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get totalPrice() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  add(product: { id: number; name: string; price: number }) {
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

  updateQuantity(id: number, quantity: number) {
    const item = this.items.find(i => i.id === id);
    if (item) {
      if (quantity <= 0) {
        this.remove(id);
      } else {
        item.quantity = quantity;
      }
    }
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

<span>Cart ({cart.totalItems} items, ${cart.totalPrice.toFixed(2)})</span>
<button onclick={() => cart.add({ id: 1, name: 'Widget', price: 9.99 })}>
  Add Widget
</button>

{#if !cart.isEmpty}
  <button onclick={() => cart.clear()}>Clear Cart</button>
{/if}
```

The class pattern works because `$state` fields on a class instance are reactive, and `get` accessors (like `totalItems`) are automatically derived — they recompute when the underlying `$state` fields change. The class instance is an object, so importing it does not suffer from the primitive reactivity problem.

## Real Example: Shared Auth State

Here is a practical example — an auth state class used across an entire app:

```typescript
// src/lib/state/auth.svelte.ts
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

class AuthState {
  user = $state<User | null>(null);

  get isLoggedIn() {
    return this.user !== null;
  }

  get isAdmin() {
    return this.user?.role === 'admin';
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
<!-- src/lib/components/NavBar.svelte -->
<script>
  import { auth } from '$lib/state/auth.svelte';
</script>

<nav>
  {#if auth.isLoggedIn}
    <span>Welcome, {auth.user!.name}</span>
    {#if auth.isAdmin}
      <a href="/admin">Admin Panel</a>
    {/if}
    <button onclick={() => auth.logout()}>Log out</button>
  {:else}
    <a href="/login">Log in</a>
  {/if}
</nav>
```

Every component that imports `auth` sees the same state. When a login action calls `auth.login(user)`, the navbar, the settings page, and any other component reading `auth.isLoggedIn` all update instantly.

## SSR Considerations: The Shared-State Trap

This is the most important gotcha with global state in SvelteKit, and it catches experienced developers too.

On the server, JavaScript modules are loaded once and shared across all requests. If you create global state at the module level, **every user's request shares the same state object**. User A logs in, and suddenly User B sees User A's data.

```typescript
// DANGEROUS on the server — shared across all requests
export const auth = new AuthState();
// If User A logs in, auth.user is set for EVERY subsequent request
```

This is a **state pollution** bug, and it is a security vulnerability.

The solution depends on what the state represents:

- **Per-request data** (current user, request-specific settings): Use **context** (see the Context API module) or `event.locals` in server-side code. Context is created per component tree, so each request gets its own instance.
- **Truly global data** (theme preference, feature flags loaded at startup): Can be module-level, but only if it is the same for every user.
- **Client-only state** (shopping cart, UI state): Safe as module-level state because each browser tab runs its own JavaScript instance. But guard against the module running on the server during SSR.

```typescript
// Safe pattern: only initialize on the client
import { browser } from '$app/environment';

class CartState {
  items = $state<CartItem[]>([]);
  // ...
}

// This instance is safe because the cart is client-side only.
// On the server during SSR, it will be empty (which is correct).
export const cart = new CartState();
```

For per-user data on the server, always use SvelteKit's built-in mechanisms: load data in `+page.server.ts` or `+layout.server.ts`, pass it through `event.locals`, or use the Context API.

## When NOT to Use Global State

Global state is not always the answer. Here is a decision framework:

| Scenario | Right tool |
|----------|-----------|
| Only one component uses this data | Local `$state` in the component |
| Parent and its descendants share data | Context API (`setContext` / `getContext`) |
| Multiple unrelated components, client-side | Global state (`.svelte.ts` module) |
| Per-request server data (current user) | `event.locals` + load functions |
| Data from the URL | `$page.params` or `$page.url` |
| Data loaded from the server | Load functions (`+page.ts` / `+page.server.ts`) |

The biggest mistake is reaching for global state when context would be better. If the data is scoped to a subtree — say, a multi-step form wizard where several child components need shared form state — context keeps that state contained. Global state makes it accessible from anywhere, which is a wider scope than necessary and can lead to harder-to-debug interactions.

## Try It

1. Create a global theme state in `$lib/state/theme.svelte.ts` using the class pattern. Include a `mode` property (`'light'` or `'dark'`), a `toggle()` method, and a derived `isDark` getter. Use it from both a header component and a settings page to verify they stay in sync.

2. Create a notification system as a global state class. It should support `add(message, type)` where type is `'info' | 'error' | 'success'`, `dismiss(id)`, and a `recent` getter that returns only the last 5 notifications. Use it from a form component (to add notifications) and a toast container (to display them).

3. Think about this: you are building a dashboard with multiple tabs, each loaded lazily. Each tab needs access to the currently selected date range filter. Should this be global state, context, or props? What changes if the dashboard can be embedded multiple times on the same page?

## Key Takeaways

- Global state lives in `.svelte.ts` files and is shared across all components that import it
- The `.svelte.ts` extension is required because the Svelte compiler must process the runes — plain `.ts` files cannot use `$state`
- Export getter functions (not raw primitive variables) to maintain reactivity across module boundaries
- Classes with `$state` fields and `get` accessors are the cleanest pattern for complex shared state
- On the server, module-level state is shared across all requests — this is a security risk for per-user data
- Use context for tree-scoped state, global state for app-wide state, and load functions for server-loaded data
- JavaScript module singletons ensure one instance of state exists for the entire client-side app
