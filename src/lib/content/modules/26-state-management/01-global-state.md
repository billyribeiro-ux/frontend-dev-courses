# Global State

So far, all the reactive state you have created lives inside individual components. That works until two components in completely different parts of your app need the same data — a shopping cart total in the header and the cart page, an authentication status in the navbar and a settings panel, a theme preference that affects every component. When state needs to be shared across unrelated components, you need **global state**.

In Svelte 5, global state is remarkably simple: define reactive variables in `.svelte.ts` files and export them. Because JavaScript modules are singletons, every component that imports the same file gets the same state. Change it in one place, and every component that reads it updates automatically.

But this simplicity hides important subtleties — especially around reactivity boundaries, SSR safety, memory leaks, and knowing when global state is the wrong tool. Getting these subtleties wrong leads to security vulnerabilities, hydration mismatches, and bugs that only appear in production under load. This lesson unpacks every one of them.

## The Mental Model: Module Singletons as State Containers

Before touching any code, internalize this mental model. It governs everything that follows.

In JavaScript, when you `import` a module for the first time, the runtime executes that module's top-level code exactly once. Every subsequent `import` of the same module receives a reference to the same module namespace — the same variables, the same objects, the same functions. The module is a **singleton**.

```
Module: counter.svelte.ts
┌──────────────────────────────────┐
│  let count = $state(0);         │  ← created ONCE
│                                  │
│  export function getCount() {    │
│    return count;                 │
│  }                               │
└──────────────────────────────────┘
         ▲              ▲
         │              │
   ComponentA.svelte  ComponentB.svelte
   (same count)       (same count)
```

When ComponentA calls `increment()`, the `count` variable in the module changes. When ComponentB calls `getCount()`, it reads the same variable and sees the new value. Svelte's reactivity system ensures that any template expression that calls `getCount()` re-evaluates when `count` changes.

This is fundamentally different from frameworks that require a dedicated state management library (Redux, Vuex, Pinia). In Svelte 5, the language-level reactivity primitives (`$state`, `$derived`) combined with JavaScript's module system give you global state for free. No provider components. No store subscriptions. No boilerplate.

The catch? Module singletons behave differently on the server versus the client, and the reactivity boundary requires specific file extensions. Both of these are explored in detail below.

## When Component-Local State Is Not Enough

Consider an e-commerce app. The "Add to Cart" button lives on a product detail page. The cart icon with a badge showing the item count lives in the header layout. These two components have no parent-child relationship — they are separated by multiple layers of routing.

You *could* pass cart data through props from a root layout, through intermediate layouts, through pages, down to every component. But this is prop drilling at its worst — dozens of components passing data they do not use just to shuttle it to a descendant.

```
// Prop drilling: painful and fragile
+layout.svelte (owns cart state)
  └── +layout.svelte (passes cart through)
       └── +layout.svelte (passes cart through)
            └── +page.svelte (passes cart through)
                 └── ProductDetail.svelte (finally uses cart)

// Every intermediate component needs: let { cart, ...rest } = $props();
// Change the cart type? Update every component in the chain.
```

Global state solves this cleanly: both the product detail and the header import the same module, read the same reactive state, and stay in sync automatically.

But do not reach for global state reflexively. Here is the decision tree:

```
Does only one component use this data?
  → YES: Local $state in the component.

Do a parent and its descendants share this data?
  → YES: Context API (setContext / getContext).

Do multiple unrelated components need the same data?
  → Is it per-user data on the server? → event.locals + load functions
  → Is it scoped to a subtree? → Context API
  → Is it truly app-wide? → Global state (.svelte.ts module)
```

**The rule: if multiple unrelated components need the same data, and that data is app-wide (not scoped to a subtree), use global state.**

## The Reactivity Boundary: Why .svelte.ts Files

Svelte 5 runes (`$state`, `$derived`, `$effect`) are compiled by the Svelte compiler. Regular `.ts` files are processed by TypeScript alone — the Svelte compiler never sees them. If you write `$state(0)` in a plain `.ts` file, it will not compile.

The `.svelte.ts` extension tells Svelte "this file contains runes — compile it." This is the **reactivity boundary**: runes only work in `.svelte` and `.svelte.ts` files.

```
src/lib/state/
  counter.svelte.ts   ← Svelte compiles this, runes work
  counter.ts           ← TypeScript only, $state would be a syntax error
  helpers.ts           ← Plain utilities, no runes needed
```

This is not an arbitrary restriction. The Svelte compiler transforms `$state` into the reactive machinery that tracks reads and writes, triggers updates in components, and participates in the dependency graph. Without the compiler pass, `$state` is just a function call that does not exist at runtime.

### What the Compiler Actually Does

When you write `let count = $state(0)` in a `.svelte.ts` file, the compiler transforms it into something conceptually like:

```javascript
// Conceptual output (simplified)
import { source, get, set } from 'svelte/internal/client';

const count = source(0);

// When you READ count:  get(count) → subscribes the current effect
// When you WRITE count: set(count, newValue) → notifies all subscribers
```

The `source()` function creates a reactive signal. Every `get()` call during a component render registers a dependency. Every `set()` call triggers re-evaluation of all dependent expressions. This is the signal-based reactivity that powers Svelte 5.

In a plain `.ts` file, none of this transformation happens. `$state(0)` would be a runtime function call that does not exist, crashing your app.

### Common Mistake: Wrong File Extension

```typescript
// WRONG: src/lib/state/counter.ts (plain TypeScript file)
let count = $state(0);  // ERROR: $state is not defined

export function increment() { count++; }
export function getCount() { return count; }
```

```typescript
// CORRECT: src/lib/state/counter.svelte.ts (Svelte-compiled file)
let count = $state(0);  // Works — the Svelte compiler processes this

export function increment() { count++; }
export function getCount() { return count; }
```

The error message you get from the wrong extension is often confusing — it might say `$state is not a function` or `Cannot find name '$state'`. If you see either, check the file extension first.

## Pattern 1: Module-Level Functions

The simplest pattern for shared state. Export getter functions so the reactivity chain stays intact:

```typescript
// src/lib/state/counter.svelte.ts
let count = $state(0);

export function increment() {
  count++;
}

export function decrement() {
  if (count > 0) count--;  // Guard against negative values
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

### Why Getter Functions Instead of Exporting the Value Directly

You might wonder: why not `export { count }`? The reason is subtle but critical to understand.

When you export a primitive value and another module imports it, the import gets the *current value* at import time. Reassigning the original variable does not update the import — JavaScript module bindings for `let` do track reassignment at the binding level, but Svelte's reactivity depends on reading a `$state` signal through a function call so the compiler can track the dependency.

```typescript
// WRONG — components won't react to changes
let count = $state(0);
export { count }; // Importing modules get a binding, but templates
                   // can't track reactivity through bare imports

// CORRECT — getter function lets the compiler track the read
export function getCount() {
  return count; // The $state read happens inside the function call
}
```

When a component calls `getCount()` in its template, Svelte can trace the reactive read and subscribe to updates. With a bare import, the reactivity chain breaks because the template sees a static value, not a reactive signal access.

**The rule: export getter functions (or use classes with getter properties) for reactive state that crosses module boundaries.**

### When This Pattern Works Best

The module-level function pattern is ideal for:
- Simple, single-purpose state (a counter, a toggle, a single value)
- State with 1-3 related values
- Quick prototyping before you know the full shape of the state

It breaks down when you have many related values, complex derived computations, or need to group state and behavior into a cohesive unit. That is when you reach for classes.

## Pattern 2: Class-Based Shared State

For state with multiple related values and methods, a class is the natural container. Svelte 5 runes work inside class fields, giving you encapsulation and a clean API:

```typescript
// src/lib/state/cart.svelte.ts

type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

class CartState {
  items = $state<CartItem[]>([]);

  // Derived values via getters — these recompute automatically
  get totalItems(): number {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get totalPrice(): number {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get formattedTotal(): string {
    return `$${this.totalPrice.toFixed(2)}`;
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

  has(id: number): boolean {
    return this.items.some(i => i.id === id);
  }
}

export const cart = new CartState();
```

```svelte
<!-- src/lib/components/CartBadge.svelte -->
<script>
  import { cart } from '$lib/state/cart.svelte';
</script>

<span class="badge">
  Cart ({cart.totalItems} items, {cart.formattedTotal})
</span>
```

```svelte
<!-- src/routes/products/[id]/+page.svelte -->
<script>
  import { cart } from '$lib/state/cart.svelte';
  let { data } = $props();
</script>

<h1>{data.product.name}</h1>
<p>{data.product.description}</p>

{#if cart.has(data.product.id)}
  <button onclick={() => cart.remove(data.product.id)}>
    Remove from Cart
  </button>
{:else}
  <button onclick={() => cart.add(data.product)}>
    Add to Cart
  </button>
{/if}
```

### Why Classes Work So Well for Global State

The class pattern works because of three properties that align perfectly with Svelte's reactivity:

1. **`$state` fields on a class instance are reactive.** When you mutate `this.items`, any template reading `cart.items` re-renders.

2. **`get` accessors behave like `$derived`.** They recompute automatically when the underlying `$state` fields change. `cart.totalItems` always reflects the current items — you never need to manually update it.

3. **Class instances are objects, not primitives.** Importing `cart` from another module gives you a reference to the same object. Unlike primitive exports, object references do not suffer from the "snapshot at import time" problem.

### WRONG vs CORRECT: Exporting Classes

```typescript
// WRONG: Exporting the class instead of an instance
export class CartState {
  items = $state<CartItem[]>([]);
  // ...
}
// Each component would need: const cart = new CartState()
// That creates SEPARATE instances — not shared state!

// CORRECT: Export a singleton instance
class CartState {
  items = $state<CartItem[]>([]);
  // ...
}
export const cart = new CartState();
// Every import gets the SAME instance
```

```typescript
// ALSO WRONG: Exporting a factory function without memoization
export function createCart() {
  return new CartState();
}
// Each call creates a new instance — not shared!

// CORRECT if you need lazy initialization:
let _cart: CartState | null = null;
export function getCart() {
  if (!_cart) _cart = new CartState();
  return _cart;
}
```

## Pattern 3: Private Fields for Encapsulation

For state that components should read but never directly mutate, use TypeScript private fields:

```typescript
// src/lib/state/auth.svelte.ts

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  avatarUrl?: string;
}

class AuthState {
  // Private — only methods on this class can change the user
  #user = $state<User | null>(null);
  #loading = $state(false);
  #error = $state<string | null>(null);

  // Public read-only access via getters
  get user(): User | null {
    return this.#user;
  }

  get isLoggedIn(): boolean {
    return this.#user !== null;
  }

  get isAdmin(): boolean {
    return this.#user?.role === 'admin';
  }

  get isModerator(): boolean {
    return this.#user?.role === 'moderator' || this.isAdmin;
  }

  get loading(): boolean {
    return this.#loading;
  }

  get error(): string | null {
    return this.#error;
  }

  get displayName(): string {
    return this.#user?.name ?? 'Guest';
  }

  async login(email: string, password: string): Promise<boolean> {
    this.#loading = true;
    this.#error = null;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const data = await response.json();
        this.#error = data.message ?? 'Login failed';
        return false;
      }

      this.#user = await response.json();
      return true;
    } catch (err) {
      this.#error = 'Network error — please try again';
      return false;
    } finally {
      this.#loading = false;
    }
  }

  logout() {
    this.#user = null;
    this.#error = null;
  }

  clearError() {
    this.#error = null;
  }
}

export const auth = new AuthState();
```

```svelte
<!-- src/lib/components/NavBar.svelte -->
<script>
  import { auth } from '$lib/state/auth.svelte';
</script>

<nav class="flex items-center gap-4 p-4 bg-gray-900 text-white">
  <a href="/" class="font-bold text-lg">MyApp</a>

  <div class="ml-auto flex items-center gap-4">
    {#if auth.isLoggedIn}
      <span>Welcome, {auth.displayName}</span>
      {#if auth.isAdmin}
        <a href="/admin" class="text-yellow-300">Admin</a>
      {/if}
      <button onclick={() => auth.logout()} class="text-red-300">
        Log out
      </button>
    {:else}
      <a href="/login">Log in</a>
    {/if}
  </div>
</nav>
```

### Why Private Fields Matter

Without private fields, any component could do `auth.user = someObject` and set the user to arbitrary data, bypassing validation. Private fields enforce that all state transitions flow through the class methods, which can validate input, handle errors, and maintain invariants.

```typescript
// Without private fields — any component can corrupt state
class AuthState {
  user = $state<User | null>(null);
}
export const auth = new AuthState();
// Component can do: auth.user = { id: 'fake', role: 'admin' } — no validation!

// With private fields — all changes go through methods
class AuthState {
  #user = $state<User | null>(null);
  get user() { return this.#user; }
  // Only login() and logout() can change #user
}
```

This is especially important for state that has security implications (authentication, authorization) or complex invariants (a shopping cart where quantities must be positive).

## SSR Considerations: The Shared-State Trap

This is the most important gotcha with global state in SvelteKit, and it catches experienced developers too.

On the server, JavaScript modules are loaded once and shared across all requests. If you create global state at the module level, **every user's request shares the same state object**. User A logs in, and suddenly User B sees User A's data.

```typescript
// DANGEROUS on the server — shared across all requests
export const auth = new AuthState();
// Request 1: auth.login(userA) → auth.user = User A
// Request 2: auth.user is STILL User A — a security vulnerability!
```

This is a **state pollution** bug, and it is a security vulnerability. It can also cause data leaks between users — imagine User A's shopping cart items appearing for User B.

### Understanding Why This Happens

```
SERVER PROCESS (single Node.js instance)
┌─────────────────────────────────────────┐
│  Module: auth.svelte.ts                 │
│  ┌─────────────────────┐                │
│  │ auth = new AuthState()│  ← ONE instance│
│  └─────────────────────┘                │
│        ▲          ▲          ▲          │
│        │          │          │          │
│   Request A   Request B   Request C    │
│   (User 1)   (User 2)   (User 3)      │
│   ALL SEE THE SAME auth OBJECT         │
└─────────────────────────────────────────┘

CLIENT (each browser tab is a separate JS runtime)
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Tab 1        │  │ Tab 2        │  │ Tab 3        │
│ auth = new() │  │ auth = new() │  │ auth = new() │
│ (isolated)   │  │ (isolated)   │  │ (isolated)   │
└──────────────┘  └──────────────┘  └──────────────┘
```

On the client, each browser tab runs its own JavaScript runtime, so module singletons are naturally isolated per user. On the server, a single Node.js process handles many requests, and modules are loaded once and cached. This asymmetry is the root of the problem.

### The Solution: Categorize Your State

The solution depends on what the state represents:

**Per-request data (current user, request-specific settings):**
Use **context** or `event.locals` in server-side code. Context is created per component tree, so each request gets its own instance.

```typescript
// src/hooks.server.ts — per-request, never polluted
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const session = event.cookies.get('session');
  if (session) {
    event.locals.user = await getUserFromSession(session);
  }
  return resolve(event);
};
```

```typescript
// src/routes/+layout.server.ts — pass user to pages via load
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return { user: locals.user ?? null };
};
```

**Truly global data (theme, feature flags, configuration):**
Can be module-level, but only if it is the same for every user. A dark mode preference that defaults to "light" and is customized client-side is safe. A feature flag loaded from a server config file is safe.

**Client-only state (shopping cart, UI preferences, form drafts):**
Safe as module-level state because each browser tab runs its own JavaScript instance. But guard against the module running on the server during SSR.

```typescript
// Safe pattern: state that is inherently client-only
import { browser } from '$app/environment';

class CartState {
  items = $state<CartItem[]>([]);

  constructor() {
    // Restore from localStorage on the client
    if (browser) {
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

  add(item: CartItem) {
    this.items.push(item);
    this.#persist();
  }

  #persist() {
    if (browser) {
      localStorage.setItem('cart', JSON.stringify(this.items));
    }
  }
}

// On the server during SSR, the cart will be empty (which is correct —
// the client will hydrate with the real cart from localStorage)
export const cart = new CartState();
```

### WRONG vs CORRECT: Per-User State

```typescript
// WRONG: Per-user state as a module singleton
// src/lib/state/user-preferences.svelte.ts
class UserPreferences {
  fontSize = $state(16);
  language = $state('en');
  notifications = $state(true);
}
export const prefs = new UserPreferences();
// On the server, User A sets language='fr',
// then User B sees language='fr' too!

// CORRECT: Use load functions for per-user data
// src/routes/+layout.server.ts
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  const prefs = await getUserPreferences(locals.user?.id);
  return { prefs };
};

// Then in the component:
// let { data } = $props();
// let fontSize = $state(data.prefs.fontSize);
```

## Persistence: Syncing State with localStorage

Global state in memory is lost on page refresh. For state that should persist across sessions, sync with `localStorage`:

```typescript
// src/lib/state/theme.svelte.ts
import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'system';

class ThemeState {
  #mode = $state<Theme>('system');

  constructor() {
    if (browser) {
      const saved = localStorage.getItem('theme') as Theme | null;
      if (saved && ['light', 'dark', 'system'].includes(saved)) {
        this.#mode = saved;
      }
    }
  }

  get mode(): Theme {
    return this.#mode;
  }

  get isDark(): boolean {
    if (this.#mode === 'system') {
      return browser
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false;
    }
    return this.#mode === 'dark';
  }

  get cssClass(): string {
    return this.isDark ? 'dark' : 'light';
  }

  set(theme: Theme) {
    this.#mode = theme;
    if (browser) {
      localStorage.setItem('theme', theme);
      document.documentElement.classList.toggle('dark', this.isDark);
    }
  }

  toggle() {
    this.set(this.#mode === 'dark' ? 'light' : 'dark');
  }

  cycle() {
    const order: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(this.#mode);
    this.set(order[(currentIndex + 1) % order.length]);
  }
}

export const theme = new ThemeState();
```

### Gotcha: Hydration Flash

When you restore state from `localStorage` in the constructor, the server renders with the default value (e.g., "system" / light theme), but the client may hydrate with "dark". This causes a flash of wrong content — the page briefly appears in light mode before switching to dark.

```typescript
// WRONG: Causes a hydration flash
class ThemeState {
  #mode = $state<Theme>('light'); // Server renders "light"
  constructor() {
    if (browser) {
      this.#mode = localStorage.getItem('theme') as Theme ?? 'light';
      // Client switches to "dark" — flash!
    }
  }
}

// BETTER: Use a cookie so the server knows the theme
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('theme') ?? 'light';
  return resolve(event, {
    transformPageChunk: ({ html }) =>
      html.replace('%sveltekit.body%', `<div class="${theme}">%sveltekit.body%</div>`)
  });
};
```

The cookie approach lets the server know the user's theme preference and render the correct class from the first byte, eliminating the flash entirely.

## Derived State Across Modules

Sometimes global state depends on other global state. Use `$derived` at the module level in `.svelte.ts` files:

```typescript
// src/lib/state/cart.svelte.ts
class CartState {
  items = $state<CartItem[]>([]);
  get totalPrice() {
    return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  }
}
export const cart = new CartState();

// src/lib/state/checkout.svelte.ts
import { cart } from './cart.svelte';

class CheckoutState {
  #shippingMethod = $state<'standard' | 'express'>('standard');
  #couponDiscount = $state(0);

  get shippingMethod() { return this.#shippingMethod; }

  get shippingCost(): number {
    return this.#shippingMethod === 'express' ? 15.99 : 5.99;
  }

  get subtotal(): number {
    return cart.totalPrice;
  }

  get discount(): number {
    return this.#couponDiscount;
  }

  get total(): number {
    return Math.max(0, this.subtotal + this.shippingCost - this.#couponDiscount);
  }

  setShipping(method: 'standard' | 'express') {
    this.#shippingMethod = method;
  }

  applyCoupon(discount: number) {
    this.#couponDiscount = Math.max(0, discount);
  }

  removeCoupon() {
    this.#couponDiscount = 0;
  }
}

export const checkout = new CheckoutState();
```

The `checkout.total` getter reads `cart.totalPrice`, which reads `cart.items`. Svelte's reactivity graph tracks this entire chain. When you add an item to the cart, `checkout.total` automatically reflects the new price. No manual wiring, no subscriptions, no event emitters.

### Gotcha: Circular Dependencies

Be careful not to create circular imports between state modules. If `cart.svelte.ts` imports from `checkout.svelte.ts` and `checkout.svelte.ts` imports from `cart.svelte.ts`, you will get undefined values at module initialization time.

```typescript
// WRONG: Circular dependency
// cart.svelte.ts
import { checkout } from './checkout.svelte'; // checkout imports cart too!

// CORRECT: One-directional dependency
// checkout.svelte.ts imports from cart.svelte.ts, but NOT the reverse.
// If both need shared data, extract it to a third module.
```

## Resettable State for Testing

Global state is persistent — it survives across component mounts and page navigations. This is usually what you want, but it makes testing tricky. Each test needs a clean slate.

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
  #items = $state<Notification[]>([]);
  #nextId = 0;

  get all(): Notification[] {
    return this.#items;
  }

  get recent(): Notification[] {
    return this.#items.slice(-5);
  }

  get count(): number {
    return this.#items.length;
  }

  get hasErrors(): boolean {
    return this.#items.some(n => n.type === 'error');
  }

  add(message: string, type: NotificationType = 'info') {
    const notification: Notification = {
      id: `notif-${this.#nextId++}`,
      message,
      type,
      createdAt: Date.now()
    };
    this.#items.push(notification);

    // Auto-dismiss non-error notifications after 5 seconds
    if (type !== 'error') {
      setTimeout(() => this.dismiss(notification.id), 5000);
    }
  }

  dismiss(id: string) {
    this.#items = this.#items.filter(n => n.id !== id);
  }

  dismissAll() {
    this.#items = [];
  }

  // Critical for testing — reset to initial state
  _reset() {
    this.#items = [];
    this.#nextId = 0;
  }
}

export const notifications = new NotificationState();
```

```typescript
// In your test file:
import { notifications } from '$lib/state/notifications.svelte';
import { beforeEach, describe, it, expect } from 'vitest';

describe('NotificationState', () => {
  beforeEach(() => {
    notifications._reset(); // Clean slate for each test
  });

  it('adds a notification', () => {
    notifications.add('Hello', 'info');
    expect(notifications.count).toBe(1);
  });

  it('starts empty (not affected by previous test)', () => {
    expect(notifications.count).toBe(0);
  });
});
```

The underscore prefix on `_reset()` is a convention signaling "this is for testing, not for production use." TypeScript cannot enforce this at the type level, but the naming makes the intent clear.

## When NOT to Use Global State

Global state is not always the answer. Here is a comprehensive decision framework:

| Scenario | Right tool | Why |
|----------|-----------|-----|
| Only one component uses this data | Local `$state` in the component | Simplest solution; no indirection |
| Parent and its descendants share data | Context API (`setContext` / `getContext`) | Scoped to a subtree; won't pollute other trees |
| Multiple unrelated components, client-side | Global state (`.svelte.ts` module) | Shared singleton is the right abstraction |
| Per-request server data (current user) | `event.locals` + load functions | Safe from cross-request pollution |
| Data from the URL | `page.params` or `page.url` from `$app/state` | Already reactive; no duplication needed |
| Data loaded from the server | Load functions (`+page.ts` / `+page.server.ts`) | SSR-compatible; proper caching |
| Data that multiple subtrees need independently | Context with factory | Each subtree gets its own instance |
| Form state for a multi-step wizard | Context or local state in the wizard root | Scoped to the wizard's lifetime |
| Server-to-client real-time data | SSE/WebSocket + local state | Global state cannot subscribe to external sources on its own |

### The Biggest Mistake: Global State Instead of Context

The biggest mistake is reaching for global state when context would be better. If the data is scoped to a subtree — say, a multi-step form wizard where several child components need shared form state — context keeps that state contained. Global state makes it accessible from anywhere, which is a wider scope than necessary and can lead to harder-to-debug interactions.

```svelte
<!-- WRONG: Global state for a form wizard -->
<script>
  // Any component anywhere can read/write wizard state
  import { wizard } from '$lib/state/wizard.svelte';
</script>

<!-- CORRECT: Context scoped to the wizard subtree -->
<script>
  import { getContext } from 'svelte';
  // Only components inside the wizard tree can access this
  const wizard = getContext('wizard');
</script>
```

Context also solves the "multiple instances" problem. If your page has two independent form wizards, context gives each its own state automatically. Global state would require manual instance management.

## Real-World Architecture: State Organization

For a production app, organize your global state modules by domain:

```
src/lib/state/
├── auth.svelte.ts          # Authentication state
├── cart.svelte.ts           # Shopping cart
├── checkout.svelte.ts       # Checkout flow (imports cart)
├── notifications.svelte.ts  # Toast notifications
├── theme.svelte.ts          # Light/dark/system theme
└── feature-flags.svelte.ts  # Feature toggle state
```

Each module is independent and focused on one domain. Cross-module dependencies are one-directional (checkout depends on cart, not the reverse). Each module exports a single class instance.

### Performance: How Much Global State Is Too Much?

Svelte's signal-based reactivity is fine-grained. Reading `cart.totalItems` in a template subscribes only to that specific computation. Changing `theme.mode` does not re-render components that only read `cart.totalItems`. There is no "re-render the world" problem.

That said, avoid storing large, frequently-changing data in global state:

```typescript
// WRONG: Storing the full mouse position globally
// Updates 60+ times per second, every component reading it re-evaluates
class MouseState {
  x = $state(0);
  y = $state(0);
}
export const mouse = new MouseState();

// CORRECT: Mouse position is usually local to one component
// If you truly need it globally, debounce or throttle updates
```

The performance impact depends on how many components subscribe to the changing value. One component reading `mouse.x` is fine. Fifty components all re-rendering on every mouse move is a problem.

## Debugging Global State

When state behaves unexpectedly, add temporary `$effect` blocks to trace reads and writes:

```typescript
// Temporary debugging — remove before shipping!
$effect(() => {
  console.log('Cart items changed:', cart.items.length, cart.items);
});

$effect(() => {
  console.log('Auth state changed:', auth.isLoggedIn, auth.user?.email);
});
```

For more structured debugging, add a `toJSON()` method to your state classes:

```typescript
class CartState {
  items = $state<CartItem[]>([]);

  // ... other methods ...

  toJSON() {
    return {
      items: this.items,
      totalItems: this.totalItems,
      totalPrice: this.totalPrice,
      isEmpty: this.isEmpty
    };
  }
}

// In the browser console:
// JSON.stringify(cart.toJSON(), null, 2)
```

## Try It

1. Create a global theme state in `$lib/state/theme.svelte.ts` using the class pattern. Include a private `#mode` property (`'light' | 'dark' | 'system'`), a `toggle()` method, a `cycle()` method that rotates through all three modes, and a derived `isDark` getter that checks `window.matchMedia` for system mode. Persist the choice to `localStorage`. Use it from both a header component and a settings page to verify they stay in sync.

2. Create a notification system as a global state class. It should support `add(message, type)` where type is `'info' | 'error' | 'success' | 'warning'`, `dismiss(id)`, auto-dismissal after 5 seconds for non-error notifications, and a `recent` getter that returns only the last 5 notifications. Include a `_reset()` method for testing. Use it from a form component (to add notifications on submit) and a toast container component (to display and dismiss them).

3. Build a global `FavoritesState` class that tracks favorited product IDs. Include `toggle(id)`, `isFavorited(id)`, and a `count` getter. Persist to `localStorage`. Use it from a product card component (to toggle the heart icon) and a favorites page (to list all favorites).

4. Think about this: you are building a dashboard with multiple tabs, each loaded lazily. Each tab needs access to the currently selected date range filter. Should this be global state, context, or props? What changes if the dashboard can be embedded multiple times on the same page? Write out the reasoning for each scenario.

5. Refactor scenario: you have a global `formState` used by a multi-step wizard. Two independent wizards on the same page are conflicting because they share the same state. Redesign using context so each wizard gets its own state instance. What changes in the component code?

## Key Takeaways

- Global state lives in `.svelte.ts` files and is shared across all components that import it — JavaScript module singletons are the mechanism
- The `.svelte.ts` extension is required because the Svelte compiler must process the runes — plain `.ts` files cannot use `$state`, `$derived`, or `$effect`
- Export getter functions (not raw primitive variables) to maintain reactivity across module boundaries — the compiler needs a function call to track the dependency
- Classes with `$state` fields, private fields (`#`), and `get` accessors are the cleanest pattern for complex shared state — they provide encapsulation, derived values, and a cohesive API
- On the server, module-level state is shared across all requests — this is a security vulnerability for per-user data; use `event.locals` and load functions instead
- Client-only state (cart, theme, favorites) is safe as module singletons because each browser tab runs its own JavaScript runtime
- Persist state to `localStorage` when it should survive page refreshes, but guard with `browser` checks and handle corrupted data
- Watch for hydration flashes when restoring state from `localStorage` — consider using cookies so the server can render the correct initial state
- Use context for tree-scoped state, global state for app-wide state, and load functions for server-loaded data
- Avoid circular dependencies between state modules — keep the dependency graph one-directional
- Include `_reset()` methods on state classes to enable clean test isolation
- Svelte's fine-grained reactivity means global state is performant — reading `cart.totalItems` does not re-render components that only read `theme.mode`
