# Shared State

As your SvelteKit application grows, you will encounter situations where multiple components need access to the same data — a shopping cart visible in the navbar and the checkout page, authentication status checked in the layout and every protected route, or a notification queue rendered by a toast container and triggered from any component. Passing this data through props at every level of the component tree is called **prop drilling**, and it becomes unmaintainable fast.

Svelte 5 provides a clean solution: **shared reactive state** using `.svelte.ts` files. By declaring `$state` in a module file and exporting functions or class instances that read and modify it, you create state that any component can import. Changes are automatically reflected everywhere the state is referenced — no subscription management, no event bubbling, no context providers wrapping your entire app.

This is fundamentally different from stores in Svelte 4. There is no `writable()`, no `$` auto-subscription syntax, no `subscribe` callback. You just use `$state` in a `.svelte.ts` file and export controlled access to it. The reactivity system handles everything else.

## Why .svelte.ts Files

The `.svelte.ts` extension (or `.svelte.js` for JavaScript) tells the Svelte compiler to process the file with rune support. Regular `.ts` files do not understand `$state`, `$derived`, or `$effect`. If you try to use runes in a plain TypeScript file, the compiler ignores them and they behave as regular variables.

This distinction is intentional. Runes are a compiler feature — they transform your code at build time. The `.svelte.ts` extension signals the compiler to apply those transformations.

## The Export Restriction

You cannot export a `$state` variable directly. This is one of the most common mistakes people make with shared state:

```typescript
// src/lib/stores/counter.svelte.ts

// THIS DOES NOT WORK as expected
export let count = $state(0);
// The exported binding loses reactivity because the consumer
// gets the primitive value at import time, not the reactive proxy
```

The reason: when you import a primitive value from a module, JavaScript gives you a snapshot of that value, not a live reference. If `count` is `0` at import time, the importing module gets `0`. When the module later sets `count = 5`, the importing module still has `0`.

The solution is to export functions that close over the `$state` variable, or to export a class instance whose properties are reactive:

```typescript
// src/lib/stores/counter.svelte.ts

// CORRECT: Export functions that access the reactive variable
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

When a component calls `getCount()` inside its template, Svelte tracks the dependency on `count`. When `count` changes (via `increment()`, `decrement()`, or `reset()`), Svelte knows to re-render the parts of the template that called `getCount()`.

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { getCount, increment, decrement, reset } from '$lib/stores/counter.svelte';
</script>

<!-- getCount() is called reactively — the display updates when count changes -->
<h1>Count: {getCount()}</h1>

<button onclick={decrement}>-</button>
<button onclick={increment}>+</button>
<button onclick={reset}>Reset</button>
```

### The Getter/Setter Pattern

An alternative pattern that feels more like a property than a function call:

```typescript
// src/lib/stores/counter.svelte.ts
let _count = $state(0);

export const counter = {
  get value() {
    return _count;
  },
  set value(n: number) {
    _count = n;
  },
  increment() {
    _count += 1;
  },
  decrement() {
    _count -= 1;
  },
  reset() {
    _count = 0;
  }
};
```

```svelte
<script lang="ts">
  import { counter } from '$lib/stores/counter.svelte';
</script>

<h1>Count: {counter.value}</h1>
<button onclick={counter.increment}>+</button>
<button onclick={() => counter.value = 42}>Set to 42</button>
```

This works because JavaScript evaluates `counter.value` by calling the getter function, which reads `_count` and registers the reactive dependency. The getter/setter pattern gives you a property-like API while maintaining reactivity.

## Class-Based Shared State

For state with multiple related values and complex operations, a class is the cleanest approach. Class properties declared with `$state` are reactive, and `$derived` getters compute values automatically:

```typescript
// src/lib/stores/auth.svelte.ts
interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'guest';
  avatarUrl: string;
}

class AuthState {
  user = $state<User | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);

  get isLoggedIn() {
    return this.user !== null;
  }

  get isAdmin() {
    return this.user?.role === 'admin';
  }

  get displayName() {
    return this.user?.name ?? 'Guest';
  }

  async login(email: string, password: string) {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Login failed');
      }

      this.user = await response.json();
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'An error occurred';
      throw err;
    } finally {
      this.isLoading = false;
    }
  }

  logout() {
    this.user = null;
    this.error = null;
  }

  updateProfile(updates: Partial<User>) {
    if (this.user) {
      // Svelte 5 deep reactivity: mutating object properties triggers updates
      Object.assign(this.user, updates);
    }
  }
}

// Export a SINGLE instance — every component shares the same state
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
    <div class="user-menu">
      <img src={auth.user?.avatarUrl} alt="" class="avatar" />
      <span>Welcome, {auth.displayName}</span>
      {#if auth.isAdmin}
        <a href="/admin">Admin Panel</a>
      {/if}
      <button onclick={() => auth.logout()}>Log out</button>
    </div>
  {:else}
    <a href="/login">Log in</a>
    <a href="/register">Sign up</a>
  {/if}
</nav>

{@render children()}
```

```svelte
<!-- src/routes/login/+page.svelte -->
<script lang="ts">
  import { auth } from '$lib/stores/auth.svelte';
  import { goto } from '$app/navigation';

  let email = $state('');
  let password = $state('');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    try {
      await auth.login(email, password);
      goto('/dashboard');
    } catch {
      // Error is already set on auth.error
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <h1>Log In</h1>

  {#if auth.error}
    <div class="error-banner">{auth.error}</div>
  {/if}

  <label>
    Email
    <input type="email" bind:value={email} required />
  </label>

  <label>
    Password
    <input type="password" bind:value={password} required />
  </label>

  <button type="submit" disabled={auth.isLoading}>
    {auth.isLoading ? 'Logging in...' : 'Log in'}
  </button>
</form>
```

## Complete Example: Shopping Cart

Here is a production-quality shopping cart state manager:

```typescript
// src/lib/stores/cart.svelte.ts
interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

class CartState {
  items = $state<CartItem[]>([]);

  get itemCount() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get subtotal() {
    return this.items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }

  get tax() {
    return this.subtotal * 0.08; // 8% tax
  }

  get total() {
    return this.subtotal + this.tax;
  }

  get isEmpty() {
    return this.items.length === 0;
  }

  addItem(product: { id: string; name: string; price: number; image: string }) {
    const existing = this.items.find(item => item.id === product.id);

    if (existing) {
      existing.quantity += 1;
    } else {
      this.items.push({ ...product, quantity: 1 });
    }
  }

  removeItem(id: string) {
    const index = this.items.findIndex(item => item.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  updateQuantity(id: string, quantity: number) {
    const item = this.items.find(item => item.id === id);
    if (item) {
      if (quantity <= 0) {
        this.removeItem(id);
      } else {
        item.quantity = quantity;
      }
    }
  }

  clear() {
    this.items.length = 0;
  }

  hasItem(id: string): boolean {
    return this.items.some(item => item.id === id);
  }

  getQuantity(id: string): number {
    return this.items.find(item => item.id === id)?.quantity ?? 0;
  }
}

export const cart = new CartState();
```

```svelte
<!-- src/lib/components/CartBadge.svelte -->
<script lang="ts">
  import { cart } from '$lib/stores/cart.svelte';
</script>

<a href="/cart" class="cart-badge">
  Cart
  {#if cart.itemCount > 0}
    <span class="badge">{cart.itemCount}</span>
  {/if}
</a>
```

```svelte
<!-- src/lib/components/AddToCartButton.svelte -->
<script lang="ts">
  import { cart } from '$lib/stores/cart.svelte';

  interface Props {
    product: { id: string; name: string; price: number; image: string };
  }

  let { product }: Props = $props();
</script>

{#if cart.hasItem(product.id)}
  <div class="quantity-controls">
    <button onclick={() => cart.updateQuantity(product.id, cart.getQuantity(product.id) - 1)}>
      -
    </button>
    <span>{cart.getQuantity(product.id)}</span>
    <button onclick={() => cart.updateQuantity(product.id, cart.getQuantity(product.id) + 1)}>
      +
    </button>
  </div>
{:else}
  <button onclick={() => cart.addItem(product)}>
    Add to Cart — ${product.price.toFixed(2)}
  </button>
{/if}
```

```svelte
<!-- src/routes/cart/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/stores/cart.svelte';
</script>

<h1>Shopping Cart</h1>

{#if cart.isEmpty}
  <div class="empty-cart">
    <p>Your cart is empty.</p>
    <a href="/products">Browse products</a>
  </div>
{:else}
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th>Price</th>
        <th>Quantity</th>
        <th>Total</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      {#each cart.items as item}
        <tr>
          <td>
            <div class="product-cell">
              <img src={item.image} alt={item.name} />
              <span>{item.name}</span>
            </div>
          </td>
          <td>${item.price.toFixed(2)}</td>
          <td>
            <input
              type="number"
              min="1"
              value={item.quantity}
              onchange={(e) => cart.updateQuantity(
                item.id,
                Number((e.target as HTMLInputElement).value)
              )}
            />
          </td>
          <td>${(item.price * item.quantity).toFixed(2)}</td>
          <td>
            <button onclick={() => cart.removeItem(item.id)}>Remove</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="cart-summary">
    <div class="line">
      <span>Subtotal</span>
      <span>${cart.subtotal.toFixed(2)}</span>
    </div>
    <div class="line">
      <span>Tax (8%)</span>
      <span>${cart.tax.toFixed(2)}</span>
    </div>
    <div class="line total">
      <span>Total</span>
      <span>${cart.total.toFixed(2)}</span>
    </div>

    <button class="checkout-button">Proceed to Checkout</button>
    <button class="clear-button" onclick={() => cart.clear()}>Clear Cart</button>
  </div>
{/if}
```

## Complete Example: Notification Manager

A notification system demonstrates state that is written from anywhere in the app (any component can trigger a notification) and read in one place (the toast container):

```typescript
// src/lib/stores/notifications.svelte.ts
interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration: number;
}

class NotificationManager {
  items = $state<Notification[]>([]);

  private nextId = 0;

  add(
    message: string,
    options: { type?: Notification['type']; duration?: number } = {}
  ) {
    const id = String(this.nextId++);
    const notification: Notification = {
      id,
      message,
      type: options.type ?? 'info',
      duration: options.duration ?? 5000
    };

    this.items.push(notification);

    // Auto-dismiss after duration
    if (notification.duration > 0) {
      setTimeout(() => this.dismiss(id), notification.duration);
    }

    return id;
  }

  // Convenience methods
  success(message: string, duration?: number) {
    return this.add(message, { type: 'success', duration });
  }

  error(message: string, duration?: number) {
    return this.add(message, { type: 'error', duration: duration ?? 8000 });
  }

  warning(message: string, duration?: number) {
    return this.add(message, { type: 'warning', duration });
  }

  info(message: string, duration?: number) {
    return this.add(message, { type: 'info', duration });
  }

  dismiss(id: string) {
    const index = this.items.findIndex(n => n.id === id);
    if (index !== -1) {
      this.items.splice(index, 1);
    }
  }

  clear() {
    this.items.length = 0;
  }
}

export const notifications = new NotificationManager();
```

```svelte
<!-- src/lib/components/ToastContainer.svelte -->
<script lang="ts">
  import { notifications } from '$lib/stores/notifications.svelte';
</script>

{#if notifications.items.length > 0}
  <div class="toast-container" aria-live="polite">
    {#each notifications.items as notification (notification.id)}
      <div class="toast toast-{notification.type}" role="alert">
        <span class="toast-message">{notification.message}</span>
        <button
          class="toast-dismiss"
          onclick={() => notifications.dismiss(notification.id)}
          aria-label="Dismiss notification"
        >
          X
        </button>
      </div>
    {/each}
  </div>
{/if}
```

```svelte
<!-- src/routes/+layout.svelte — mount the toast container globally -->
<script lang="ts">
  import ToastContainer from '$lib/components/ToastContainer.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
<ToastContainer />
```

```svelte
<!-- Any component can trigger notifications -->
<script lang="ts">
  import { notifications } from '$lib/stores/notifications.svelte';
  import { cart } from '$lib/stores/cart.svelte';

  function handleAddToCart(product: any) {
    cart.addItem(product);
    notifications.success(`${product.name} added to cart!`);
  }

  async function handleSave() {
    try {
      await saveData();
      notifications.success('Changes saved successfully.');
    } catch (err) {
      notifications.error('Failed to save changes. Please try again.');
    }
  }
</script>
```

## The Singleton Pattern and Its SSR Pitfall

When you export a class instance from a `.svelte.ts` module, that instance is a **singleton** — every component that imports it gets the same instance. This is usually what you want. But it creates a dangerous problem during server-side rendering.

### The Problem

On the server, Node.js modules are shared across all incoming requests. If User A adds an item to the cart and User B visits the site a moment later, User B might see User A's cart because they are sharing the same module-level singleton.

```typescript
// DANGEROUS in SSR — shared across all server requests
class CartState {
  items = $state<CartItem[]>([]);
  // ...
}

export const cart = new CartState();
// User A and User B share this instance on the server!
```

### The Solutions

**Solution 1: Client-only shared state.** If the state only matters in the browser (like UI state, client-side cart before checkout), this is safe because each browser has its own JavaScript environment:

```typescript
// src/lib/stores/cart.svelte.ts
import { browser } from '$app/environment';

class CartState {
  items = $state<CartItem[]>([]);
  // ... methods
}

// Safe if you only read this state in the browser
// During SSR, the cart will always appear empty
export const cart = new CartState();
```

**Solution 2: Use SvelteKit's `locals` for request-scoped state.** For state that must exist during SSR (like authenticated user data), use `event.locals` in your hooks and load functions. This is request-scoped by design.

**Solution 3: Context API for component-tree-scoped state.** Use Svelte's `setContext`/`getContext` for state that should be unique per component tree (and therefore per request during SSR):

```typescript
// src/lib/stores/cart.svelte.ts
import { setContext, getContext } from 'svelte';

class CartState {
  items = $state<CartItem[]>([]);
  // ... methods
}

const CART_KEY = Symbol('cart');

export function createCart(): CartState {
  const cart = new CartState();
  setContext(CART_KEY, cart);
  return cart;
}

export function getCart(): CartState {
  return getContext<CartState>(CART_KEY);
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createCart } from '$lib/stores/cart.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // Each SSR request gets its own CartState instance
  const cart = createCart();
</script>

{@render children()}
```

```svelte
<!-- Any child component -->
<script lang="ts">
  import { getCart } from '$lib/stores/cart.svelte';

  const cart = getCart(); // Gets the instance from context
</script>
```

### When Does the Singleton Problem Matter?

The singleton problem only affects state that is **written during SSR**. If your shared state is only written by user interactions (clicks, form submissions) — which only happen in the browser — the singleton pattern is safe. The state starts empty on every SSR render and gets populated only after hydration on the client.

The problem manifests when load functions or server-side rendering logic writes to shared state. If your layout load function writes user data to a module-level singleton, that is a bug. Use `locals` or context instead.

## State Machines for Complex UI Flows

For complex UI states with well-defined transitions — multi-step forms, payment flows, onboarding wizards — a state machine pattern prevents invalid states:

```typescript
// src/lib/stores/checkout.svelte.ts
type CheckoutStep = 'cart' | 'shipping' | 'payment' | 'review' | 'complete';

interface ShippingInfo {
  name: string;
  address: string;
  city: string;
  zip: string;
}

interface PaymentInfo {
  cardLast4: string;
  expiryMonth: number;
  expiryYear: number;
}

class CheckoutState {
  step = $state<CheckoutStep>('cart');
  shipping = $state<ShippingInfo | null>(null);
  payment = $state<PaymentInfo | null>(null);
  isProcessing = $state(false);
  error = $state<string | null>(null);

  // Define valid transitions
  private transitions: Record<CheckoutStep, CheckoutStep[]> = {
    cart: ['shipping'],
    shipping: ['cart', 'payment'],
    payment: ['shipping', 'review'],
    review: ['payment', 'complete'],
    complete: ['cart']  // Start over
  };

  get canGoBack() {
    return this.step !== 'cart' && this.step !== 'complete';
  }

  get progress() {
    const steps: CheckoutStep[] = ['cart', 'shipping', 'payment', 'review', 'complete'];
    return ((steps.indexOf(this.step) + 1) / steps.length) * 100;
  }

  goTo(target: CheckoutStep) {
    const valid = this.transitions[this.step];
    if (!valid.includes(target)) {
      console.error(
        `Invalid transition: ${this.step} → ${target}. ` +
        `Valid targets: ${valid.join(', ')}`
      );
      return false;
    }
    this.step = target;
    this.error = null;
    return true;
  }

  setShipping(info: ShippingInfo) {
    this.shipping = info;
    this.goTo('payment');
  }

  setPayment(info: PaymentInfo) {
    this.payment = info;
    this.goTo('review');
  }

  async placeOrder() {
    if (!this.shipping || !this.payment) {
      this.error = 'Missing required information';
      return;
    }

    this.isProcessing = true;
    this.error = null;

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shipping: this.shipping,
          payment: this.payment
        })
      });

      if (!response.ok) throw new Error('Order failed');

      this.goTo('complete');
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'An error occurred';
    } finally {
      this.isProcessing = false;
    }
  }

  reset() {
    this.step = 'cart';
    this.shipping = null;
    this.payment = null;
    this.isProcessing = false;
    this.error = null;
  }
}

export const checkout = new CheckoutState();
```

```svelte
<!-- src/routes/checkout/+page.svelte -->
<script lang="ts">
  import { checkout } from '$lib/stores/checkout.svelte';
</script>

<div class="checkout">
  <div class="progress-bar" style="width: {checkout.progress}%"></div>

  {#if checkout.error}
    <div class="error-banner">{checkout.error}</div>
  {/if}

  {#if checkout.step === 'cart'}
    <h2>Your Cart</h2>
    <!-- Cart contents -->
    <button onclick={() => checkout.goTo('shipping')}>
      Proceed to Shipping
    </button>
  {:else if checkout.step === 'shipping'}
    <h2>Shipping Information</h2>
    <!-- Shipping form that calls checkout.setShipping(info) -->
  {:else if checkout.step === 'payment'}
    <h2>Payment Method</h2>
    <!-- Payment form that calls checkout.setPayment(info) -->
  {:else if checkout.step === 'review'}
    <h2>Review Order</h2>
    <!-- Order summary -->
    <button
      onclick={() => checkout.placeOrder()}
      disabled={checkout.isProcessing}
    >
      {checkout.isProcessing ? 'Processing...' : 'Place Order'}
    </button>
  {:else if checkout.step === 'complete'}
    <h2>Order Complete!</h2>
    <p>Thank you for your purchase.</p>
    <button onclick={() => checkout.reset()}>Shop Again</button>
  {/if}

  {#if checkout.canGoBack}
    <button onclick={() => checkout.goTo(
      checkout.step === 'payment' ? 'shipping' :
      checkout.step === 'review' ? 'payment' :
      'cart'
    )}>
      Back
    </button>
  {/if}
</div>
```

## Combining Shared State with Snippets

Shared state and snippets are complementary patterns. Shared state manages the data layer; snippets manage the presentation layer:

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/stores/cart.svelte';

  let { data } = $props();
</script>

{#snippet productCard(product: { id: string; name: string; price: number; image: string })}
  <div class="product-card">
    <img src={product.image} alt={product.name} />
    <h3>{product.name}</h3>
    <p class="price">${product.price.toFixed(2)}</p>

    {#if cart.hasItem(product.id)}
      <span class="in-cart">In cart ({cart.getQuantity(product.id)})</span>
    {/if}

    <button onclick={() => cart.addItem(product)}>
      Add to Cart
    </button>
  </div>
{/snippet}

<h1>Products</h1>

<div class="product-grid">
  {#each data.products as product}
    {@render productCard(product)}
  {/each}
</div>
```

The snippet accesses the shared `cart` state to show whether each product is already in the cart. Clicking "Add to Cart" updates the shared state, which reactively updates every snippet instance that references the cart.

## When to Use Shared State vs Props

**Use props when:**
- Data flows from parent to child (one direction, one or two levels)
- The data is specific to a single component relationship
- You want explicit, traceable data flow that is easy to follow in code review
- The component is a reusable library component that should not depend on app-level state

**Use shared state when:**
- Multiple unrelated components need the same data (cart in navbar and checkout page)
- Data needs to persist across page navigations (user preferences, auth status)
- Prop drilling would require passing data through 3 or more levels
- The state represents an app-wide concern (auth, cart, notifications, theme)

**Use context when:**
- State is scoped to a subtree of components (not truly global)
- You need SSR safety (no singleton sharing between requests)
- You are building a component library where state should be isolated per instance

## Try It

### Exercise 1: Shopping Cart
Create a `cart.svelte.ts` shared state module using the class pattern with `addItem`, `removeItem`, `updateQuantity`, and computed `total` and `itemCount` getters. Build a product listing page where each product has an "Add to Cart" button. Build a cart badge in the navbar that shows the item count. Build a full cart page with quantity editing and a running total.

### Exercise 2: Authentication State
Create an `auth.svelte.ts` module with a class that manages `user`, `isLoading`, `error`, and computed `isLoggedIn` and `isAdmin` getters. Build a login form that uses `auth.login()`, a navbar that shows different content based on `auth.isLoggedIn`, and a protected page that redirects if not logged in.

### Exercise 3: Notification System
Build a `notifications.svelte.ts` module with `success()`, `error()`, `warning()`, and `info()` methods. Create a `ToastContainer` component that renders active notifications. Trigger notifications from various actions (form submit, add to cart, API error) and verify they appear and auto-dismiss.

### Exercise 4: SSR-Safe State
Refactor your cart state to use the context API pattern so it is safe during SSR. Create the cart instance in your root layout, set it in context, and access it via `getCart()` in child components. Verify that it works correctly during server-side rendering.

## Key Takeaways

- `.svelte.ts` files enable Svelte runes (`$state`, `$derived`, `$effect`) outside of components
- You cannot export `$state` variables directly — export functions or class instances that access the reactive variable
- The getter/setter pattern provides a property-like API while maintaining reactivity
- Class-based state managers group related state and operations into a clean, typed interface
- Module-level singletons are shared across all SSR requests — this is a bug if state is written during SSR
- Use the context API (`setContext`/`getContext`) for SSR-safe shared state that is unique per request
- State machines prevent invalid states in complex flows like checkout, onboarding, and multi-step forms
- Shared state and snippets are complementary — state manages data, snippets manage presentation
- Prefer props for simple parent-child data flow; use shared state for app-wide concerns
- Computed values (`get` accessors in classes, or `$derived` in modules) keep derived data in sync automatically
