# Shopping Cart

Every e-commerce store needs a shopping cart. In this lesson you will build a production-quality cart: state management with a Svelte 5 `.svelte.ts` module, add/remove/update operations, `localStorage` persistence for guest users, `$derived` totals, quantity validation against stock levels, optimistic updates, a complete cart page UI, and the architectural decisions behind each choice.

The cart is purely client-side state until checkout. Products live in the database, but the cart lives in the browser. This keeps things fast -- no server round-trip every time someone adds an item. At checkout, the server validates everything (prices, stock, availability) before processing payment.

## Cart State Architecture

There are three common approaches to cart state in e-commerce:

```
1. Client-only (localStorage)
   Pros: Fast, no auth required, works for guests
   Cons: Lost on device switch, no server validation until checkout
   Best for: Simple stores, guest-first flows

2. Server-only (database)
   Pros: Persists across devices, validated prices
   Cons: Slow (network round-trip on every action), requires auth
   Best for: B2B, subscription-heavy, high-value products

3. Hybrid (client + server sync)
   Pros: Fast with durability, works for both guests and logged-in users
   Cons: More complex, needs merge strategy
   Best for: Most production stores
```

We will build approach 1 first (client-only), then extend it to approach 3 (hybrid) later in the lesson.

## Cart State with .svelte.ts

Create a reactive cart module using Svelte 5 runes. The module-level `$state` is shared across all components that import it -- it is a singleton:

```typescript
// src/lib/state/cart.svelte.ts
export type CartItem = {
  productId: number;
  name: string;
  slug: string;
  price: number;     // in cents -- always use cents for money
  imageUrl: string;
  quantity: number;
  maxStock: number;   // max available quantity
};

let items = $state<CartItem[]>([]);

// Load from localStorage on initialization
if (typeof window !== 'undefined') {
  try {
    const saved = localStorage.getItem('cart');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate the shape before trusting it
      if (Array.isArray(parsed) && parsed.every(isValidCartItem)) {
        items = parsed;
      } else {
        localStorage.removeItem('cart');
      }
    }
  } catch {
    // Corrupted localStorage -- start fresh
    localStorage.removeItem('cart');
  }
}

function isValidCartItem(item: unknown): item is CartItem {
  if (!item || typeof item !== 'object') return false;
  const i = item as Record<string, unknown>;
  return (
    typeof i.productId === 'number' &&
    typeof i.name === 'string' &&
    typeof i.slug === 'string' &&
    typeof i.price === 'number' &&
    typeof i.quantity === 'number' &&
    i.quantity > 0
  );
}

// Persist to localStorage whenever items change
function persist() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cart', JSON.stringify(items));
  }
}

export const cart = {
  get items() {
    return items;
  },

  get totalItems() {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  },

  get totalCents() {
    return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  },

  get totalDollars() {
    return (this.totalCents / 100).toFixed(2);
  },

  get isEmpty() {
    return items.length === 0;
  },

  /**
   * Add a product to the cart. If it already exists, increment the quantity.
   * Returns { success, message } for UI feedback.
   */
  add(
    product: Omit<CartItem, 'quantity'>,
    quantity = 1
  ): { success: boolean; message: string } {
    if (quantity <= 0) {
      return { success: false, message: 'Quantity must be at least 1' };
    }

    const existing = items.find(i => i.productId === product.productId);

    if (existing) {
      const newQuantity = existing.quantity + quantity;

      // Check stock limit
      if (product.maxStock && newQuantity > product.maxStock) {
        return {
          success: false,
          message: `Only ${product.maxStock} available (${existing.quantity} already in cart)`
        };
      }

      existing.quantity = newQuantity;
    } else {
      if (product.maxStock && quantity > product.maxStock) {
        return {
          success: false,
          message: `Only ${product.maxStock} available`
        };
      }

      items.push({ ...product, quantity });
    }

    persist();
    return { success: true, message: 'Added to cart' };
  },

  /**
   * Remove a product entirely from the cart.
   */
  remove(productId: number) {
    items = items.filter(i => i.productId !== productId);
    persist();
  },

  /**
   * Set the quantity for a specific item.
   * Removes the item if quantity is 0 or less.
   */
  updateQuantity(
    productId: number,
    quantity: number
  ): { success: boolean; message: string } {
    if (quantity <= 0) {
      this.remove(productId);
      return { success: true, message: 'Removed from cart' };
    }

    const item = items.find(i => i.productId === productId);
    if (!item) {
      return { success: false, message: 'Item not found in cart' };
    }

    if (item.maxStock && quantity > item.maxStock) {
      return {
        success: false,
        message: `Only ${item.maxStock} available`
      };
    }

    item.quantity = quantity;
    persist();
    return { success: true, message: 'Quantity updated' };
  },

  /**
   * Clear all items from the cart.
   */
  clear() {
    items = [];
    persist();
  },

  /**
   * Check if a specific product is in the cart.
   */
  has(productId: number): boolean {
    return items.some(i => i.productId === productId);
  },

  /**
   * Get the quantity of a specific product in the cart.
   */
  getQuantity(productId: number): number {
    return items.find(i => i.productId === productId)?.quantity ?? 0;
  }
};
```

Several design decisions are important here:

**Prices in cents.** Always store and calculate money as integers (cents, not dollars). Floating-point arithmetic is unreliable for money: `0.1 + 0.2 === 0.30000000000000004`. By working in cents, all arithmetic is integer-based and exact. Convert to dollars only for display.

**Validation on every operation.** The `add` and `updateQuantity` methods return `{ success, message }` instead of silently succeeding or throwing. This makes it easy for components to show feedback -- "Only 3 available" -- without try/catch blocks.

**`localStorage` validation.** When loading from `localStorage`, we validate every item before trusting it. Users can have old cart data from a previous version of the site with a different shape. Corrupted data should not crash the app.

**Getter properties for computed values.** `totalItems`, `totalCents`, and `isEmpty` are getters on the `cart` object. Because they read `items` (which is `$state`), Svelte's reactivity system tracks them. Any component that accesses `cart.totalItems` will re-render when items change.

## Adding Products to the Cart

Here is the "Add to Cart" button on a product detail page with quantity selection and stock awareness:

```svelte
<!-- src/lib/components/cart/AddToCartButton.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';

  type Product = {
    id: number;
    name: string;
    slug: string;
    price: number;
    imageUrl: string;
    stock: number;
  };

  let { product }: { product: Product } = $props();

  let quantity = $state(1);
  let feedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);

  let currentInCart = $derived(cart.getQuantity(product.id));
  let maxCanAdd = $derived(product.stock - currentInCart);
  let isOutOfStock = $derived(product.stock <= 0);
  let isMaxedOut = $derived(maxCanAdd <= 0);

  function handleAdd() {
    const result = cart.add(
      {
        productId: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        imageUrl: product.imageUrl,
        maxStock: product.stock
      },
      quantity
    );

    feedback = {
      type: result.success ? 'success' : 'error',
      message: result.message
    };

    if (result.success) {
      quantity = 1; // Reset quantity selector
    }

    setTimeout(() => (feedback = null), 3000);
  }

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }
</script>

<div class="add-to-cart">
  {#if isOutOfStock}
    <button disabled class="w-full py-3 rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed">
      Out of Stock
    </button>
  {:else}
    <div class="flex gap-3 items-center">
      <div class="quantity-selector flex items-center border rounded-lg">
        <button
          onclick={() => quantity = Math.max(1, quantity - 1)}
          disabled={quantity <= 1}
          class="px-3 py-2 text-lg disabled:opacity-30"
        >
          -
        </button>
        <input
          type="number"
          bind:value={quantity}
          min="1"
          max={maxCanAdd}
          class="w-16 text-center border-x py-2"
          onchange={() => {
            quantity = Math.max(1, Math.min(quantity, maxCanAdd));
          }}
        />
        <button
          onclick={() => quantity = Math.min(maxCanAdd, quantity + 1)}
          disabled={quantity >= maxCanAdd}
          class="px-3 py-2 text-lg disabled:opacity-30"
        >
          +
        </button>
      </div>

      <button
        onclick={handleAdd}
        disabled={isMaxedOut}
        class="flex-1 py-3 rounded-lg text-white transition-colors
               {isMaxedOut ? 'bg-gray-400 cursor-not-allowed' : 'bg-black hover:bg-gray-800'}"
      >
        {#if isMaxedOut}
          Max in Cart
        {:else}
          Add to Cart - {formatPrice(product.price * quantity)}
        {/if}
      </button>
    </div>

    {#if currentInCart > 0}
      <p class="text-sm text-gray-500 mt-2">
        {currentInCart} already in cart
        {#if product.stock <= 5}
          -- only {product.stock} left in stock
        {/if}
      </p>
    {/if}
  {/if}

  {#if feedback}
    <p class="mt-2 text-sm {feedback.type === 'success' ? 'text-green-600' : 'text-red-500'}">
      {feedback.message}
    </p>
  {/if}
</div>
```

The `$derived` values (`currentInCart`, `maxCanAdd`, `isOutOfStock`, `isMaxedOut`) automatically update when the cart changes. If the user adds 2 of this product to the cart, `currentInCart` becomes 2, `maxCanAdd` decreases by 2, and the UI updates -- the quantity selector's max adjusts and the "already in cart" message appears.

## Cart Page

Build a full cart page where customers review, modify, and proceed to checkout:

```svelte
<!-- src/routes/(store)/cart/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';

  let removingId = $state<number | null>(null);
  let message = $state('');

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  function handleQuantityChange(productId: number, newQuantity: number) {
    const result = cart.updateQuantity(productId, newQuantity);
    if (!result.success) {
      message = result.message;
      setTimeout(() => (message = ''), 3000);
    }
  }

  async function handleRemove(productId: number) {
    removingId = productId;
    // Small delay for animation
    await new Promise(r => setTimeout(r, 200));
    cart.remove(productId);
    removingId = null;
  }

  // Derived values for the summary
  let subtotal = $derived(cart.totalCents);
  let estimatedTax = $derived(Math.round(subtotal * 0.08)); // 8% estimate
  let estimatedTotal = $derived(subtotal + estimatedTax);
  let freeShippingThreshold = 5000; // $50 in cents
  let amountToFreeShipping = $derived(
    Math.max(0, freeShippingThreshold - subtotal)
  );
  let qualifiesForFreeShipping = $derived(subtotal >= freeShippingThreshold);
</script>

<svelte:head>
  <title>Shopping Cart ({cart.totalItems} items)</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-2">Shopping Cart</h1>
  <p class="text-gray-500 mb-8">{cart.totalItems} {cart.totalItems === 1 ? 'item' : 'items'}</p>

  {#if message}
    <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-4">
      {message}
    </div>
  {/if}

  {#if cart.isEmpty}
    <div class="text-center py-16">
      <svg class="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 3c-.3.4 0 1 .5 1h11.8M16 16a2 2 0 100 4 2 2 0 000-4zm-8 0a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
      <p class="text-gray-500 text-lg mb-4">Your cart is empty.</p>
      <a href="/products" class="inline-block bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 transition-colors">
        Continue Shopping
      </a>
    </div>
  {:else}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Cart Items -->
      <div class="lg:col-span-2 space-y-4">
        {#each cart.items as item (item.productId)}
          <div
            class="flex gap-4 p-4 border rounded-lg transition-opacity
                   {removingId === item.productId ? 'opacity-30' : 'opacity-100'}"
          >
            <a href="/products/{item.slug}">
              <img
                src={item.imageUrl}
                alt={item.name}
                class="w-24 h-24 object-cover rounded"
                loading="lazy"
              />
            </a>

            <div class="flex-1 min-w-0">
              <a href="/products/{item.slug}" class="font-semibold hover:underline truncate block">
                {item.name}
              </a>
              <p class="text-gray-600">{formatPrice(item.price)} each</p>

              <div class="flex items-center gap-2 mt-3">
                <label class="sr-only" for="qty-{item.productId}">Quantity</label>
                <select
                  id="qty-{item.productId}"
                  value={item.quantity}
                  onchange={(e) => handleQuantityChange(
                    item.productId,
                    Number(e.currentTarget.value)
                  )}
                  class="border rounded px-2 py-1 text-sm"
                >
                  {#each Array.from({ length: Math.min(item.maxStock || 10, 10) }, (_, i) => i + 1) as qty}
                    <option value={qty}>{qty}</option>
                  {/each}
                </select>

                <button
                  onclick={() => handleRemove(item.productId)}
                  class="text-sm text-red-500 hover:text-red-700 ml-2"
                >
                  Remove
                </button>
              </div>
            </div>

            <div class="text-right font-bold whitespace-nowrap">
              {formatPrice(item.price * item.quantity)}
            </div>
          </div>
        {/each}

        <div class="flex justify-between pt-4">
          <button
            onclick={() => {
              if (confirm('Remove all items from your cart?')) cart.clear();
            }}
            class="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear Cart
          </button>
          <a href="/products" class="text-sm text-blue-600 hover:text-blue-700">
            Continue Shopping
          </a>
        </div>
      </div>

      <!-- Order Summary Sidebar -->
      <div class="lg:col-span-1">
        <div class="border rounded-lg p-6 sticky top-4">
          <h2 class="text-lg font-bold mb-4">Order Summary</h2>

          <div class="space-y-2 text-sm">
            <div class="flex justify-between">
              <span>Subtotal ({cart.totalItems} items)</span>
              <span>{formatPrice(subtotal)}</span>
            </div>
            <div class="flex justify-between text-gray-500">
              <span>Estimated Tax</span>
              <span>{formatPrice(estimatedTax)}</span>
            </div>
            <div class="flex justify-between text-gray-500">
              <span>Shipping</span>
              <span>{qualifiesForFreeShipping ? 'Free' : 'Calculated at checkout'}</span>
            </div>
          </div>

          {#if !qualifiesForFreeShipping}
            <div class="mt-3 p-3 bg-blue-50 rounded text-sm text-blue-700">
              Add {formatPrice(amountToFreeShipping)} more for free shipping!
            </div>
          {/if}

          <div class="border-t mt-4 pt-4 flex justify-between font-bold text-lg">
            <span>Estimated Total</span>
            <span>{formatPrice(estimatedTotal)}</span>
          </div>

          <a
            href="/checkout"
            class="block mt-4 bg-black text-white text-center px-6 py-3 rounded-lg
                   hover:bg-gray-800 transition-colors font-semibold"
          >
            Proceed to Checkout
          </a>

          <p class="text-xs text-gray-400 mt-3 text-center">
            Tax and shipping calculated at checkout
          </p>
        </div>
      </div>
    </div>
  {/if}
</div>
```

Notice the `$derived` values for the order summary. `subtotal`, `estimatedTax`, `estimatedTotal`, and `amountToFreeShipping` all chain from `cart.totalCents`. When the user changes any quantity, the entire summary recalculates instantly. No manual update calls needed.

## Cart Icon in Header

Show the item count in the site header with an animated badge:

```svelte
<!-- src/lib/components/CartIcon.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';

  let prevCount = $state(0);
  let bounce = $state(false);

  // Animate the badge when count changes
  $effect(() => {
    const current = cart.totalItems;
    if (current > prevCount) {
      bounce = true;
      setTimeout(() => (bounce = false), 300);
    }
    prevCount = current;
  });
</script>

<a href="/cart" class="relative p-2" aria-label="Shopping cart, {cart.totalItems} items">
  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3
             3c-.3.4 0 1 .5 1h11.8M16 16a2 2 0 100 4 2 2 0 000-4zm-8
             0a2 2 0 100 4 2 2 0 000-4z" />
  </svg>
  {#if cart.totalItems > 0}
    <span
      class="absolute -top-1 -right-1 bg-red-500 text-white
             text-xs min-w-[20px] h-5 rounded-full flex items-center justify-center
             font-medium {bounce ? 'scale-125' : 'scale-100'} transition-transform"
    >
      {cart.totalItems > 99 ? '99+' : cart.totalItems}
    </span>
  {/if}
</a>
```

## Persistence: localStorage for Guests, Database for Auth Users

For a production store, guest users keep their cart in `localStorage`, but logged-in users sync to the database. When a guest logs in, their local cart merges with their saved cart:

```typescript
// src/lib/state/cart.svelte.ts (extended for hybrid persistence)

/**
 * Sync the local cart to the server for authenticated users.
 * Call this after any cart mutation when the user is logged in.
 */
async function syncToServer() {
  try {
    await fetch('/api/cart', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items })
    });
  } catch {
    // Sync failed -- local state is still correct
    // The next sync will catch up
    console.warn('Cart sync failed -- will retry on next mutation');
  }
}

/**
 * Load the cart from the server (for logged-in users).
 * Merges with any existing local cart items.
 */
export async function loadServerCart() {
  try {
    const res = await fetch('/api/cart');
    if (!res.ok) return;

    const serverCart = await res.json();

    if (items.length === 0) {
      // No local cart -- use server cart as-is
      items = serverCart.items;
    } else if (serverCart.items.length === 0) {
      // No server cart -- push local cart to server
      await syncToServer();
    } else {
      // Both exist -- merge them
      mergeCart(serverCart.items);
      await syncToServer();
    }

    persist();
  } catch {
    // Server unavailable -- continue with local cart
  }
}

/**
 * Merge server cart items into the local cart.
 * For duplicate products, take the higher quantity.
 */
function mergeCart(serverItems: CartItem[]) {
  for (const serverItem of serverItems) {
    const localItem = items.find(i => i.productId === serverItem.productId);
    if (localItem) {
      // Take the higher quantity
      localItem.quantity = Math.max(localItem.quantity, serverItem.quantity);
    } else {
      items.push(serverItem);
    }
  }
}
```

The server endpoint for cart persistence:

```typescript
// src/routes/api/cart/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { carts } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) throw error(401, 'Not authenticated');

  const [cart] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, locals.user.id))
    .limit(1);

  return json({ items: cart?.items ?? [] });
};

export const PUT: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401, 'Not authenticated');

  const { items } = await request.json();

  // Upsert: insert or update the cart
  await db
    .insert(carts)
    .values({ userId: locals.user.id, items, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: carts.userId,
      set: { items, updatedAt: new Date() }
    });

  return json({ success: true });
};
```

Call `loadServerCart()` in your layout when the user logs in:

```svelte
<!-- src/routes/(store)/+layout.svelte -->
<script>
  import { loadServerCart } from '$lib/state/cart.svelte';

  let { data, children } = $props();

  $effect(() => {
    if (data.user) {
      loadServerCart();
    }
  });
</script>

{@render children()}
```

## Optimistic Updates with Rollback

For operations that require server validation (like stock checks at checkout), use optimistic updates:

```svelte
<script>
  import { cart } from '$lib/state/cart.svelte';

  let validating = $state(false);
  let errors = $state<string[]>([]);

  /**
   * Validate the cart against current stock before proceeding to checkout.
   * This is the "trust but verify" step -- the client cart is fast,
   * but we need to confirm prices and stock are still valid.
   */
  async function validateAndCheckout() {
    validating = true;
    errors = [];

    try {
      const res = await fetch('/api/cart/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cart.items })
      });

      const result = await res.json();

      if (result.adjustments?.length > 0) {
        // Server says some items changed
        for (const adj of result.adjustments) {
          if (adj.type === 'out_of_stock') {
            cart.remove(adj.productId);
            errors.push(`"${adj.name}" is no longer available and was removed.`);
          } else if (adj.type === 'quantity_reduced') {
            cart.updateQuantity(adj.productId, adj.newQuantity);
            errors.push(`"${adj.name}" quantity reduced to ${adj.newQuantity} (limited stock).`);
          } else if (adj.type === 'price_changed') {
            // Update the price in the cart
            const item = cart.items.find(i => i.productId === adj.productId);
            if (item) item.price = adj.newPrice;
            errors.push(`"${adj.name}" price updated to ${formatPrice(adj.newPrice)}.`);
          }
        }
      } else {
        // Cart is valid -- proceed to checkout
        window.location.href = '/checkout';
      }
    } catch {
      errors.push('Could not validate cart. Please try again.');
    } finally {
      validating = false;
    }
  }
</script>

{#if errors.length > 0}
  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
    <h3 class="font-semibold text-yellow-800 mb-2">Cart Updated</h3>
    <ul class="text-sm text-yellow-700 space-y-1">
      {#each errors as error}
        <li>{error}</li>
      {/each}
    </ul>
    <p class="text-sm text-yellow-600 mt-2">Please review your cart and try again.</p>
  </div>
{/if}

<button
  onclick={validateAndCheckout}
  disabled={validating || cart.isEmpty}
  class="w-full bg-black text-white py-3 rounded-lg font-semibold
         disabled:opacity-50 transition-colors hover:bg-gray-800"
>
  {validating ? 'Validating...' : 'Proceed to Checkout'}
</button>
```

The server-side validation endpoint:

```typescript
// src/routes/api/cart/validate/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { products } from '$lib/server/schema';
import { inArray } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
  const { items } = await request.json();
  const adjustments: any[] = [];

  // Fetch current product data
  const productIds = items.map((i: any) => i.productId);
  const currentProducts = await db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));

  for (const item of items) {
    const product = currentProducts.find(p => p.id === item.productId);

    if (!product || !product.active) {
      adjustments.push({
        type: 'out_of_stock',
        productId: item.productId,
        name: item.name
      });
      continue;
    }

    if (product.stock < item.quantity) {
      if (product.stock === 0) {
        adjustments.push({
          type: 'out_of_stock',
          productId: item.productId,
          name: product.name
        });
      } else {
        adjustments.push({
          type: 'quantity_reduced',
          productId: item.productId,
          name: product.name,
          newQuantity: product.stock
        });
      }
    }

    if (product.priceInCents !== item.price) {
      adjustments.push({
        type: 'price_changed',
        productId: item.productId,
        name: product.name,
        newPrice: product.priceInCents
      });
    }
  }

  return json({ valid: adjustments.length === 0, adjustments });
};
```

## Cart Expiry and Abandonment

Carts that sit too long can have stale data. Add an expiry mechanism:

```typescript
// In cart.svelte.ts
const CART_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// When loading from localStorage, check expiry
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('cart');
  const savedAt = localStorage.getItem('cart_updated');

  if (saved && savedAt) {
    const age = Date.now() - Number(savedAt);
    if (age > CART_TTL) {
      // Cart is too old -- clear it
      localStorage.removeItem('cart');
      localStorage.removeItem('cart_updated');
    } else {
      // Cart is fresh -- load it
      items = JSON.parse(saved);
    }
  }
}

function persist() {
  if (typeof window !== 'undefined') {
    localStorage.setItem('cart', JSON.stringify(items));
    localStorage.setItem('cart_updated', String(Date.now()));
  }
}
```

## Try It

1. Add a "Save for Later" feature. Items moved to "saved for later" are removed from the cart but stored in a separate list (also in `localStorage`). The user can move them back to the cart with one click. Use a separate `.svelte.ts` module for the saved items.

2. Add a "quantity selector" to the Add to Cart button on the product detail page with a dropdown that goes from 1 to 10 (or to the max stock, whichever is lower). Pass the selected quantity to `cart.add()`.

3. Implement a shipping calculator in the order summary sidebar. If the subtotal is below $50, show a $5.99 flat rate. If above $50, show "Free." If above $100, show "Free + Priority" and calculate an earlier delivery estimate.

4. Build a "Recently Viewed" feature alongside the cart. Store the last 10 viewed products in `localStorage` and display them below the cart as "You might also like" suggestions.

## Key Takeaways

- A `.svelte.ts` module with `$state` creates shared reactive state that any component can import -- it is a singleton
- Always use cents (integers) for money calculations to avoid floating-point errors
- Persisting to `localStorage` keeps the cart alive across page refreshes, but validate the shape when loading
- Always check `typeof window !== 'undefined'` before accessing browser APIs in code that may run on the server
- Computed getters like `totalItems` and `totalCents` stay automatically in sync with the items array via Svelte's reactivity
- Stock validation should happen both on the client (for UX) and on the server (for correctness) before checkout
- Optimistic updates keep the UI fast -- make changes locally, then reconcile with the server
- For production stores, use a hybrid approach: `localStorage` for guests, database for authenticated users, with a merge strategy at login
- Cart validation before checkout catches stale prices, out-of-stock items, and quantity limits -- always verify on the server before processing payment
