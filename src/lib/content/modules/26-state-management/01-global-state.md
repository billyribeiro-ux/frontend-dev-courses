# Global State

So far, all the reactive state you have created lives inside individual components. That works until two components in completely different parts of your app need the same data -- a shopping cart total in the header and the cart page, an authentication status in the navbar and a settings panel, a theme preference that affects every component. When state needs to be shared across unrelated components, you need **global state**.

In Svelte 5, global state is remarkably simple: define reactive variables in `.svelte.ts` files and export them. Because JavaScript modules are singletons, every component that imports the same file gets the same state. Change it in one place, and every component that reads it updates automatically.

But this simplicity hides important subtleties -- especially around reactivity boundaries, SSR safety, and knowing when global state is the wrong tool. This lesson covers the exact scenarios where local state breaks down, the two patterns for shared state (functions and classes), the critical SSR pitfall that catches experienced developers, and how to architect state for a production application.

## When Component-Local State Is Not Enough

Consider an e-commerce app. The "Add to Cart" button lives on a product detail page. The cart icon with a badge showing the item count lives in the header layout. These two components have no parent-child relationship -- they are separated by multiple layers of routing.

You *could* pass cart data through props from a root layout, through intermediate layouts, through pages, down to every component. But this is prop drilling at its worst -- dozens of components passing data they do not use just to shuttle it to a descendant.

Global state solves this cleanly: both components import the same module, read the same reactive state, and stay in sync automatically.

### The Five Scenarios Where Global State Is the Right Choice

1. **Cross-cutting UI state.** Theme (light/dark), sidebar open/closed, active locale. These affect many components across the entire app.

2. **Shared application data.** Shopping cart, notification queue, active user profile. Multiple unrelated components need to read and write the same data.

3. **Client-side cache.** Data fetched from the server that multiple components display. Instead of refetching in each component, store it once globally.

4. **Feature flags.** Boolean flags that control which features are enabled. Read from many components, set once.

5. **Optimistic UI state.** When you update the server and immediately reflect the change in the UI before the server responds. The optimistic state needs to be accessible wherever the affected data is displayed.

The rule is straightforward: **if multiple unrelated components need the same data, and that data is app-wide (not scoped to a subtree), use global state.**

## The Reactivity Boundary: Why .svelte.ts Files

Svelte 5 runes (`$state`, `$derived`, `$effect`) are compiled by the Svelte compiler. Regular `.ts` files are processed by TypeScript alone -- the Svelte compiler never sees them. If you write `$state(0)` in a plain `.ts` file, it will not compile.

The `.svelte.ts` extension tells Svelte "this file contains runes -- compile it." This is the **reactivity boundary**: runes only work in `.svelte` and `.svelte.ts` files.

```
src/lib/state/
  counter.svelte.ts   ← Svelte compiles this, runes work
  counter.ts           ← TypeScript only, $state would be a syntax error
```

This is not an arbitrary restriction. The Svelte compiler transforms `$state` into the reactive machinery that tracks reads and writes, triggers updates in components, and participates in the dependency graph. Without the compiler pass, `$state` is just a function call that does not exist at runtime.

### What the Compiler Does to $state

When you write `let count = $state(0)` in a `.svelte.ts` file, the compiler transforms it into something conceptually like:

```javascript
// Simplified conceptual output
let count = createSignal(0);

// When you read count, the compiler generates:
// getSignalValue(count) — which registers a dependency

// When you write count = 5, the compiler generates:
// setSignalValue(count, 5) — which notifies dependents
```

This transformation is why `$state` cannot work in plain `.ts` files -- the read/write interception requires compiler output. In a `.ts` file, `count` is just a variable, and reading or writing it does not trigger any reactive machinery.

### WRONG: Using Runes in Plain .ts Files

```typescript
// WRONG — src/lib/state/counter.ts (no .svelte.ts extension)
let count = $state(0);  // Error: $state is not defined

export function increment() {
  count++;  // Even if this somehow worked, no reactivity
}
```

```typescript
// CORRECT — src/lib/state/counter.svelte.ts
let count = $state(0);  // Compiled to a reactive signal

export function increment() {
  count++;  // Triggers reactive updates in all subscribers
}
```

The error message when you try to use `$state` in a `.ts` file is not always obvious. Depending on your tooling, you might see "Cannot find name '$state'" or "$state is not a function." The fix is always the same: rename the file to `.svelte.ts`.

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

export function reset() {
  count = 0;
}

export function getCount() {
  return count;
}
```

```svelte
<!-- src/lib/components/CounterDisplay.svelte -->
<script>
  import { getCount, increment, decrement, reset } from '$lib/state/counter.svelte';
</script>

<p>Count: {getCount()}</p>
<button onclick={increment}>+</button>
<button onclick={decrement}>-</button>
<button onclick={reset}>Reset</button>
```

```svelte
<!-- src/lib/components/Header.svelte -->
<script>
  import { getCount } from '$lib/state/counter.svelte';
</script>

<!-- This updates automatically when count changes in ANY component -->
<span class="badge">{getCount()}</span>
```

Both components import from the same module. JavaScript modules are singletons -- `counter.svelte.ts` is loaded once, and every import gets the same `count` variable. When `increment()` is called in `CounterDisplay`, the `getCount()` call in `Header` returns the updated value because they share the same underlying signal.

### Why Getter Functions Instead of Exporting the Value Directly

You might wonder: why not `export { count }`? The reason is subtle but important.

When you export a primitive value and another module imports it, Svelte's reactivity depends on reading a `$state` signal through a function call so the compiler can track the dependency at the call site.

```typescript
// BROKEN — components won't react to changes
let count = $state(0);
export { count }; // The imported binding is "live" in ES modules,
                   // but templates can't track reactivity through
                   // a bare imported variable

// WORKS — getter function lets the compiler track the read
export function getCount() {
  return count; // The $state read happens inside the function call
}
```

When a component calls `getCount()` in its template, the Svelte compiler generates code that reads the signal inside the function body, which registers the component as a dependency. With a bare import, the reactivity chain breaks because there is no function call for the compiler to instrument.

**The rule: export getter functions (or use classes with getter properties) for reactive state that crosses module boundaries.**

### The Object Return Pattern

An alternative to separate getter functions is returning an object with getters:

```typescript
// src/lib/state/counter.svelte.ts
let count = $state(0);

export function createCounter() {
  return {
    get count() { return count; },
    increment() { count++; },
    decrement() { count--; },
    reset() { count = 0; }
  };
}
```

```svelte
<script>
  import { createCounter } from '$lib/state/counter.svelte';
  const counter = createCounter();
</script>

<p>Count: {counter.count}</p>
<button onclick={counter.increment}>+</button>
```

The `get count()` getter is called each time the template reads `counter.count`, which triggers the reactive read. This pattern is clean but has a subtlety: every call to `createCounter()` returns a new object, but all objects share the same underlying `count` variable (the module-level `$state`). They are different facades over the same state.

## Class-Based Shared State

For state with multiple related values and methods, a class is the natural container. Svelte 5 runes work inside class fields, giving you encapsulation and a clean API:

```typescript
// src/lib/state/cart.svelte.ts

interface CartItem {
  id: number;
  name: string;
  price: number;
  quantity: number;
}

class CartState {
  items = $state<CartItem[]>([]);

  get totalItems() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get totalPrice() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  get formattedTotal() {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(this.totalPrice / 100);
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
<!-- src/lib/components/CartBadge.svelte -->
<script>
  import { cart } from '$lib/state/cart.svelte';
</script>

<span>Cart ({cart.totalItems} items, {cart.formattedTotal})</span>
<button onclick={() => cart.add({ id: 1, name: 'Widget', price: 999 })}>
  Add Widget
</button>

{#if !cart.isEmpty}
  <button onclick={() => cart.clear()}>Clear Cart</button>
{/if}
```

### Why Classes Work Well for This

The class pattern works because `$state` fields on a class instance are reactive, and `get` accessors (like `totalItems`) are automatically derived -- they recompute when the underlying `$state` fields change. The class instance is an object reference, so importing it does not suffer from the primitive reactivity problem.

Classes also provide:

1. **Encapsulation.** The `items` array is a public `$state` field, but you could make it private and only expose it through getters if you want to prevent direct manipulation.

2. **Validation.** Methods like `updateQuantity` can validate input (checking for negative quantities) before modifying state.

3. **Computed properties.** Getters like `totalItems` and `formattedTotal` are derived from `items` and recompute automatically.

4. **Clear API.** Components interact with the cart through a well-defined interface: `add()`, `remove()`, `updateQuantity()`, `clear()`. The internal state management is hidden.

### Class with Private Fields and Validation

For production code, you may want stricter encapsulation:

```typescript
// src/lib/state/cart.svelte.ts

class CartState {
  #items = $state<CartItem[]>([]);
  #maxQuantityPerItem = 99;

  get items(): ReadonlyArray<CartItem> {
    return this.#items;
  }

  get totalItems() {
    return this.#items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get totalPrice() {
    return this.#items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get isEmpty() {
    return this.#items.length === 0;
  }

  add(product: { id: number; name: string; price: number }): boolean {
    const existing = this.#items.find(i => i.id === product.id);

    if (existing) {
      if (existing.quantity >= this.#maxQuantityPerItem) {
        return false; // Cannot add more
      }
      existing.quantity++;
    } else {
      this.#items.push({ ...product, quantity: 1 });
    }

    return true;
  }

  remove(id: number) {
    this.#items = this.#items.filter(i => i.id !== id);
  }

  updateQuantity(id: number, quantity: number) {
    if (quantity < 0 || quantity > this.#maxQuantityPerItem) return;

    const item = this.#items.find(i => i.id === id);
    if (!item) return;

    if (quantity === 0) {
      this.remove(id);
    } else {
      item.quantity = quantity;
    }
  }

  clear() {
    this.#items = [];
  }
}

export const cart = new CartState();
```

Private fields (`#items`) prevent external code from directly mutating the array. Components must go through the public methods, which enforce validation rules. The `items` getter returns `ReadonlyArray` to communicate at the type level that direct mutation is not intended.

**Note:** Private `$state` fields with `#` are supported in Svelte 5. The compiler correctly transforms them into reactive signals even with the private field syntax.

## Real Example: Shared Auth State

Here is a practical example -- an auth state class used across an entire app:

```typescript
// src/lib/state/auth.svelte.ts
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
}

class AuthState {
  #user = $state<User | null>(null);

  get user() {
    return this.#user;
  }

  get isLoggedIn() {
    return this.#user !== null;
  }

  get isAdmin() {
    return this.#user?.role === 'admin';
  }

  get displayName() {
    return this.#user?.name ?? 'Guest';
  }

  /**
   * Called after successful login or when session is restored.
   */
  setUser(userData: User) {
    this.#user = userData;
  }

  /**
   * Called after logout.
   */
  clearUser() {
    this.#user = null;
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
    <span>Welcome, {auth.displayName}</span>
    {#if auth.isAdmin}
      <a href="/admin">Admin Panel</a>
    {/if}
    <button onclick={() => auth.clearUser()}>Log out</button>
  {:else}
    <a href="/login">Log in</a>
  {/if}
</nav>
```

Every component that imports `auth` sees the same state. When a login action calls `auth.setUser(user)`, the navbar, the settings page, and any other component reading `auth.isLoggedIn` all update instantly.

### Initializing Auth State from Server Data

In a SvelteKit application, the user's auth state comes from the server (via `event.locals.user` set in hooks). How do you get this server-side data into the client-side auth state?

The answer is a layout component that bridges the gap:

```svelte
<!-- src/routes/+layout.svelte -->
<script>
  import { auth } from '$lib/state/auth.svelte';

  let { data, children } = $props();

  // Sync server-side user data to client-side auth state
  $effect(() => {
    if (data.user) {
      auth.setUser(data.user);
    } else {
      auth.clearUser();
    }
  });
</script>

{@render children()}
```

```typescript
// src/routes/+layout.server.ts
export const load = async ({ locals }) => {
  return {
    user: locals.user  // Set by hooks.server.ts
  };
};
```

This pattern is essential: the server is the source of truth for auth (it validates the session), and the client-side state is a synchronized copy that components can reactively read.

## Real Example: Notification System

Here is a complete notification toast system as global state:

```typescript
// src/lib/state/notifications.svelte.ts
type NotificationType = 'info' | 'success' | 'warning' | 'error';

interface Notification {
  id: string;
  message: string;
  type: NotificationType;
  createdAt: number;
}

class NotificationState {
  #notifications = $state<Notification[]>([]);
  #maxVisible = 5;
  #defaultDuration = 5000; // ms

  get all() {
    return this.#notifications;
  }

  get visible() {
    return this.#notifications.slice(0, this.#maxVisible);
  }

  get count() {
    return this.#notifications.length;
  }

  add(message: string, type: NotificationType = 'info', duration?: number) {
    const id = crypto.randomUUID();
    const notification: Notification = {
      id,
      message,
      type,
      createdAt: Date.now()
    };

    this.#notifications = [notification, ...this.#notifications];

    // Auto-dismiss after duration
    const timeout = duration ?? this.#defaultDuration;
    if (timeout > 0) {
      setTimeout(() => this.dismiss(id), timeout);
    }

    return id;
  }

  dismiss(id: string) {
    this.#notifications = this.#notifications.filter(n => n.id !== id);
  }

  clear() {
    this.#notifications = [];
  }

  // Convenience methods
  info(message: string) { return this.add(message, 'info'); }
  success(message: string) { return this.add(message, 'success'); }
  warning(message: string) { return this.add(message, 'warning'); }
  error(message: string) { return this.add(message, 'error', 0); } // Errors persist
}

export const notifications = new NotificationState();
```

```svelte
<!-- src/lib/components/ToastContainer.svelte -->
<script>
  import { notifications } from '$lib/state/notifications.svelte';
  import { fly, fade } from 'svelte/transition';
</script>

<div class="toast-container" aria-live="polite">
  {#each notifications.visible as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      in:fly={{ y: -20, duration: 200 }}
      out:fade={{ duration: 150 }}
    >
      <p>{toast.message}</p>
      <button onclick={() => notifications.dismiss(toast.id)} aria-label="Dismiss">
        &times;
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
  }

  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    color: white;
  }

  .toast-info { background: #3b82f6; }
  .toast-success { background: #22c55e; }
  .toast-warning { background: #f59e0b; color: #1a1a1a; }
  .toast-error { background: #ef4444; }

  button {
    background: none;
    border: none;
    color: inherit;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0 4px;
  }
</style>
```

Now any component can trigger a notification:

```svelte
<script>
  import { notifications } from '$lib/state/notifications.svelte';

  async function handleSubmit() {
    const result = await saveData();

    if (result.success) {
      notifications.success('Changes saved successfully!');
    } else {
      notifications.error(`Failed to save: ${result.error}`);
    }
  }
</script>
```

## SSR Considerations: The Shared-State Trap

This is the most important gotcha with global state in SvelteKit, and it catches experienced developers too.

On the server, JavaScript modules are loaded once and shared across all requests. If you create global state at the module level, **every user's request shares the same state object**. User A logs in, and suddenly User B sees User A's data.

```typescript
// DANGEROUS on the server — shared across all requests
export const auth = new AuthState();
// If User A logs in, auth.user is set for EVERY subsequent request
```

This is a **state pollution** bug, and it is a security vulnerability. Let me be extremely clear about how this happens:

1. Server starts. `auth.svelte.ts` is loaded. `auth` is created with `user = null`.
2. User A's request arrives. The root layout's `$effect` calls `auth.setUser(alice)`. Now `auth.user` is Alice.
3. User B's request arrives (a different person, different browser). But the module-level `auth.user` is still Alice from step 2.
4. If any server-rendered component reads `auth.user`, it shows Alice's data to User B.

Wait -- step 2 mentions `$effect`, which does not run on the server. So is this actually a problem?

**Yes, but the danger is more subtle.** The real risk is if you read or write module-level state in server-side code: load functions, form actions, or hooks. If a load function does `auth.setUser(data.user)` (instead of using `$effect` in a client component), that mutation persists across requests on the server.

### The Solution Depends on What the State Represents

**Per-request data** (current user, request-specific settings): Use **`event.locals`** in server-side code and sync to client-side state in a layout. Context is created per component tree, so each request gets its own instance.

**Truly global data** (theme preference, feature flags loaded at startup): Can be module-level, but only if it is the same for every user.

**Client-only state** (shopping cart, UI state): Safe as module-level state because each browser tab runs its own JavaScript instance. But guard against the module running on the server during SSR.

### The Safe Pattern for Client-Only State

```typescript
// src/lib/state/cart.svelte.ts
import { browser } from '$app/environment';

class CartState {
  items = $state<CartItem[]>([]);

  constructor() {
    if (browser) {
      // Restore from localStorage only on the client
      const saved = localStorage.getItem('cart');
      if (saved) {
        try {
          this.items = JSON.parse(saved);
        } catch {
          // Corrupted data — start fresh
        }
      }
    }
  }

  add(product: CartItem) {
    // ... add logic ...
    this.#persist();
  }

  remove(id: number) {
    this.items = this.items.filter(i => i.id !== id);
    this.#persist();
  }

  clear() {
    this.items = [];
    this.#persist();
  }

  #persist() {
    if (browser) {
      localStorage.setItem('cart', JSON.stringify(this.items));
    }
  }
}

// This instance is safe because the cart is client-side only.
// On the server during SSR, it will be empty (which is correct).
export const cart = new CartState();
```

The `browser` check from `$app/environment` ensures localStorage is only accessed on the client. On the server, the cart starts empty, which is correct for SSR -- the actual cart data loads on the client after hydration.

### The Safe Pattern for Per-User State

For per-user data on the server, always use SvelteKit's built-in mechanisms:

```typescript
// CORRECT: Load user data through SvelteKit's load functions
// src/routes/+layout.server.ts
export const load = async ({ locals }) => {
  return {
    user: locals.user  // Per-request, set by hooks
  };
};
```

```svelte
<!-- CORRECT: Sync to client-side state in a layout component -->
<script>
  import { auth } from '$lib/state/auth.svelte';

  let { data, children } = $props();

  // $effect runs only on the client, not during SSR
  $effect(() => {
    if (data.user) {
      auth.setUser(data.user);
    } else {
      auth.clearUser();
    }
  });
</script>

{@render children()}
```

The server provides per-request user data through `event.locals` and load functions. The client syncs that data to the global auth state. This is safe because:
- The server never reads from the `auth` module-level state (it uses `event.locals`)
- The client has its own JavaScript instance per tab
- `$effect` syncs the server data to the client state after hydration

## State Initialization Strategies

### Lazy Initialization

For state that is expensive to compute initially or depends on browser APIs:

```typescript
// src/lib/state/preferences.svelte.ts
import { browser } from '$app/environment';

class PreferencesState {
  #initialized = false;
  #theme = $state<'light' | 'dark'>('light');
  #fontSize = $state<'small' | 'medium' | 'large'>('medium');

  #init() {
    if (this.#initialized || !browser) return;
    this.#initialized = true;

    const saved = localStorage.getItem('preferences');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.#theme = data.theme ?? 'light';
        this.#fontSize = data.fontSize ?? 'medium';
      } catch {
        // Use defaults
      }
    }

    // Respect system theme preference
    if (!saved) {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.#theme = prefersDark ? 'dark' : 'light';
    }
  }

  get theme() {
    this.#init();
    return this.#theme;
  }

  set theme(value: 'light' | 'dark') {
    this.#theme = value;
    this.#persist();
  }

  get isDark() {
    return this.theme === 'dark';
  }

  toggle() {
    this.theme = this.isDark ? 'light' : 'dark';
  }

  #persist() {
    if (!browser) return;
    localStorage.setItem('preferences', JSON.stringify({
      theme: this.#theme,
      fontSize: this.#fontSize
    }));
  }
}

export const preferences = new PreferencesState();
```

The lazy initialization pattern (`#init()` called on first read) avoids accessing `localStorage` until the state is actually needed. This is especially important during SSR, where `localStorage` does not exist.

## Testing Shared State

Global state modules are straightforward to test because they are plain JavaScript with a defined API:

```typescript
// src/lib/state/cart.svelte.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { cart } from './cart.svelte';

describe('CartState', () => {
  beforeEach(() => {
    cart.clear();  // Reset between tests
  });

  it('adds items', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    expect(cart.totalItems).toBe(1);
  });

  it('increments quantity for duplicate items', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    cart.add({ id: 1, name: 'Widget', price: 999 });
    expect(cart.totalItems).toBe(2);
    expect(cart.items.length).toBe(1); // One entry, quantity 2
  });

  it('removes items', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    cart.remove(1);
    expect(cart.isEmpty).toBe(true);
  });

  it('computes total price', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    cart.add({ id: 2, name: 'Gadget', price: 1999 });
    expect(cart.totalPrice).toBe(2998);
  });

  it('validates quantity bounds', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    cart.updateQuantity(1, -5);
    // Negative quantity should be rejected or remove the item
    expect(cart.totalItems).toBeLessThanOrEqual(1);
  });

  it('clears all items', () => {
    cart.add({ id: 1, name: 'Widget', price: 999 });
    cart.add({ id: 2, name: 'Gadget', price: 1999 });
    cart.clear();
    expect(cart.isEmpty).toBe(true);
    expect(cart.totalItems).toBe(0);
    expect(cart.totalPrice).toBe(0);
  });
});
```

**Important:** Because module-level state persists across tests, you must reset the state in `beforeEach`. Without the `cart.clear()` call, items from one test would leak into the next. This is why every state class should have a `clear()` or `reset()` method.

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
| Form submission state | Form actions + `$page.form` |

### The Context vs Global State Decision

The biggest mistake is reaching for global state when context would be better. If the data is scoped to a subtree -- say, a multi-step form wizard where several child components need shared form state -- context keeps that state contained. Global state makes it accessible from anywhere, which is a wider scope than necessary and can lead to harder-to-debug interactions.

```svelte
<!-- Context is better for subtree-scoped state -->
<!-- FormWizard.svelte -->
<script>
  import { setContext } from 'svelte';

  const formState = $state({
    step: 1,
    data: {}
  });

  setContext('wizard', formState);
</script>

<!-- Only descendants of FormWizard can access this state -->
<!-- Other components on the page cannot -->
```

```typescript
// Global state is better for app-wide concerns
// $lib/state/theme.svelte.ts
class ThemeState {
  mode = $state<'light' | 'dark'>('light');

  get isDark() { return this.mode === 'dark'; }

  toggle() {
    this.mode = this.mode === 'light' ? 'dark' : 'light';
  }
}

export const theme = new ThemeState();
// Every component in the app can access this — appropriate scope
```

Another consideration: **can there be multiple instances?** A dashboard page might display multiple embedded widgets, each with its own state. If you use global state, all widgets share one state object -- which is wrong. Context creates separate state per widget subtree.

## Complete Example: Auth + Cart + Notification Architecture

Here is how a production application wires together multiple global state modules:

```typescript
// src/lib/state/auth.svelte.ts — User identity
class AuthState {
  #user = $state<User | null>(null);
  get user() { return this.#user; }
  get isLoggedIn() { return this.#user !== null; }
  get isAdmin() { return this.#user?.role === 'admin'; }
  setUser(user: User) { this.#user = user; }
  clearUser() { this.#user = null; }
}
export const auth = new AuthState();
```

```typescript
// src/lib/state/cart.svelte.ts — Shopping cart
class CartState {
  #items = $state<CartItem[]>([]);
  get items(): ReadonlyArray<CartItem> { return this.#items; }
  get totalItems() { return this.#items.reduce((s, i) => s + i.quantity, 0); }
  get totalPrice() { return this.#items.reduce((s, i) => s + i.price * i.quantity, 0); }
  get isEmpty() { return this.#items.length === 0; }
  add(product: Product) { /* ... */ }
  remove(id: number) { /* ... */ }
  clear() { this.#items = []; }
}
export const cart = new CartState();
```

```typescript
// src/lib/state/notifications.svelte.ts — Toast messages
class NotificationState {
  #items = $state<Notification[]>([]);
  get visible() { return this.#items.slice(0, 5); }
  info(message: string) { /* ... */ }
  success(message: string) { /* ... */ }
  error(message: string) { /* ... */ }
  dismiss(id: string) { /* ... */ }
  clear() { this.#items = []; }
}
export const notifications = new NotificationState();
```

```svelte
<!-- src/routes/+layout.svelte — Wires everything together -->
<script>
  import { auth } from '$lib/state/auth.svelte';
  import NavBar from '$lib/components/NavBar.svelte';
  import Footer from '$lib/components/Footer.svelte';
  import ToastContainer from '$lib/components/ToastContainer.svelte';

  let { data, children } = $props();

  // Sync server auth to client auth state
  $effect(() => {
    data.user ? auth.setUser(data.user) : auth.clearUser();
  });
</script>

<div class="app">
  <NavBar />
  <main>{@render children()}</main>
  <Footer />
  <ToastContainer />
</div>
```

Each state module is independent. Components import only what they need. The navbar imports `auth` and `cart`. The toast container imports `notifications`. Product pages import `cart` and `notifications`. No component needs to know about the others' state -- they interact through the shared modules.

## Try It

1. Create a global theme state in `$lib/state/theme.svelte.ts` using the class pattern. Include a `mode` property (`'light'` or `'dark'`), a `toggle()` method, a derived `isDark` getter, and persistence to localStorage with `$app/environment` checks. Use it from both a header component and a settings page to verify they stay in sync.

2. Create a notification system as a global state class. It should support `add(message, type)` where type is `'info' | 'error' | 'success'`, `dismiss(id)`, auto-dismissal after 5 seconds, and a `visible` getter that returns only the last 5 notifications. Build a ToastContainer component that displays them with Svelte transitions. Use it from a form component (to add notifications) and verify the toasts appear and auto-dismiss.

3. Create a cart state class with private `#` fields, validation (max quantity 99 per item, no negative quantities), computed totals (totalItems, totalPrice, formattedTotal), and a `clear()` method. Write unit tests using Vitest that test adding, removing, quantity validation, duplicate handling, and total computation. Remember to reset the state in `beforeEach`.

4. Think about this: you are building a dashboard with multiple tabs, each loaded lazily. Each tab needs access to the currently selected date range filter. Should this be global state, context, or props? What changes if the dashboard can be embedded multiple times on the same page?

## Key Takeaways

- Global state lives in `.svelte.ts` files and is shared across all components that import it -- JavaScript module singletons guarantee one instance
- The `.svelte.ts` extension is required because the Svelte compiler must process the runes -- plain `.ts` files cannot use `$state`, `$derived`, or `$effect`
- **Export getter functions** (not raw primitive variables) to maintain reactivity across module boundaries -- the compiler needs a function call to instrument the signal read
- **Classes with `$state` fields and `get` accessors** are the cleanest pattern for complex shared state -- they provide encapsulation, validation, computed properties, and a clear API
- **Private `$state` fields** (`#field`) work in Svelte 5 and prevent external code from bypassing validation
- On the server, **module-level state is shared across all requests** -- this is a security risk for per-user data that can leak one user's information to another
- Use `event.locals` + load functions for per-request server data, and sync to client-side global state in a layout component with `$effect`
- The `browser` check from `$app/environment` guards against server-side access to browser-only APIs like `localStorage`
- Use **context** for tree-scoped state (multi-step forms, embedded widgets), **global state** for app-wide state (theme, cart, notifications), and **load functions** for server-loaded data
- Every state class should have a `clear()` or `reset()` method for testing -- module-level state persists across tests in Vitest
- State initialization can be lazy (init on first read) to avoid accessing browser APIs during SSR
- JavaScript module singletons ensure one instance of state exists for the entire client-side app -- but this same singleton behavior is what makes server-side state pollution dangerous
