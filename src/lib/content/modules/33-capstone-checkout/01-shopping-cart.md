# Shopping Cart

Every e-commerce store needs a shopping cart. In this lesson you will build cart state management using a Svelte 5 `.svelte.ts` module, handle adding, removing, and updating quantities, and persist the cart to `localStorage` so it survives page refreshes.

The cart is purely client-side state. Products live in the database, but the cart lives in the browser until the customer checks out. This keeps things fast — no server round-trip every time someone adds an item.

## Cart State with .svelte.ts

Create a reactive cart module using Svelte 5 runes:

```typescript
// src/lib/state/cart.svelte.ts
export type CartItem = {
  productId: number;
  name: string;
  slug: string;
  price: number; // in cents
  imageUrl: string;
  quantity: number;
};

let items = $state<CartItem[]>([]);

// Load from localStorage on initialization
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('cart');
  if (saved) {
    items = JSON.parse(saved);
  }
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

  add(product: Omit<CartItem, 'quantity'>, quantity = 1) {
    const existing = items.find(i => i.productId === product.productId);

    if (existing) {
      existing.quantity += quantity;
    } else {
      items.push({ ...product, quantity });
    }
    persist();
  },

  remove(productId: number) {
    items = items.filter(i => i.productId !== productId);
    persist();
  },

  updateQuantity(productId: number, quantity: number) {
    if (quantity <= 0) {
      this.remove(productId);
      return;
    }

    const item = items.find(i => i.productId === productId);
    if (item) {
      item.quantity = quantity;
      persist();
    }
  },

  clear() {
    items = [];
    persist();
  }
};
```

## Adding Products to the Cart

Use the cart module from any component. Here is the "Add to Cart" button on the product detail page:

```svelte
<!-- src/lib/components/cart/AddToCartButton.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';

  let { product } = $props();
  let added = $state(false);

  function handleAdd() {
    cart.add({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      imageUrl: product.imageUrl
    });

    added = true;
    setTimeout(() => (added = false), 2000);
  }
</script>

<button onclick={handleAdd}
        class="w-full py-3 rounded-lg text-white transition-colors
               {added ? 'bg-green-600' : 'bg-black hover:bg-gray-800'}">
  {added ? 'Added!' : 'Add to Cart'}
</button>
```

## Cart Page

Build a full cart page where customers review their items:

```svelte
<!-- src/routes/(store)/cart/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';
</script>

<div class="max-w-3xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Shopping Cart</h1>

  {#if cart.items.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-500 mb-4">Your cart is empty.</p>
      <a href="/products" class="text-blue-600 underline">Continue Shopping</a>
    </div>
  {:else}
    <div class="space-y-4">
      {#each cart.items as item}
        <div class="flex gap-4 p-4 border rounded-lg">
          <img src={item.imageUrl} alt={item.name}
               class="w-24 h-24 object-cover rounded" />

          <div class="flex-1">
            <a href="/products/{item.slug}" class="font-semibold hover:underline">
              {item.name}
            </a>
            <p class="text-gray-600">{formatPrice(item.price)}</p>

            <div class="flex items-center gap-2 mt-2">
              <button onclick={() => cart.updateQuantity(item.productId, item.quantity - 1)}
                      class="w-8 h-8 border rounded">-</button>
              <span class="w-8 text-center">{item.quantity}</span>
              <button onclick={() => cart.updateQuantity(item.productId, item.quantity + 1)}
                      class="w-8 h-8 border rounded">+</button>
            </div>
          </div>

          <div class="text-right">
            <p class="font-bold">{formatPrice(item.price * item.quantity)}</p>
            <button onclick={() => cart.remove(item.productId)}
                    class="text-sm text-red-500 mt-2">Remove</button>
          </div>
        </div>
      {/each}
    </div>

    <div class="border-t mt-6 pt-6 flex justify-between items-center">
      <span class="text-xl font-bold">Total: {formatPrice(cart.totalCents)}</span>
      <a href="/checkout" class="bg-black text-white px-8 py-3 rounded-lg
                                 hover:bg-gray-800 transition-colors">
        Checkout
      </a>
    </div>
  {/if}
</div>
```

## Cart Icon in Header

Show the item count in the site header:

```svelte
<!-- Inside your header/nav component -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
</script>

<a href="/cart" class="relative">
  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3
             3c-.3.4 0 1 .5 1h11.8M16 16a2 2 0 100 4 2 2 0 000-4zm-8
             0a2 2 0 100 4 2 2 0 000-4z" />
  </svg>
  {#if cart.totalItems > 0}
    <span class="absolute -top-2 -right-2 bg-red-500 text-white
                 text-xs w-5 h-5 rounded-full flex items-center justify-center">
      {cart.totalItems}
    </span>
  {/if}
</a>
```

## Try It

Add a "quantity selector" to the Add to Cart button on the product detail page. Let the user pick a quantity (1-10) before adding to cart. Use a number input or a dropdown, and pass the selected quantity to `cart.add()`.

## Key Takeaways

- A `.svelte.ts` module with `$state` creates shared reactive state that any component can import
- Persisting to `localStorage` keeps the cart alive across page refreshes and navigation
- Always check `typeof window !== 'undefined'` before accessing browser APIs in code that may run on the server
- Computed getters like `totalItems` and `totalCents` stay automatically in sync with the items array
- The cart is client-side only until checkout, avoiding unnecessary server round-trips while browsing
