# Checkout & Authentication

The checkout page is where browsing turns into buying. In this lesson you will build both guest and authenticated checkout flows, an address form with validation, a multi-step checkout wizard, an order summary with discount codes, shipping method selection, tax calculation, and cart merging when a guest user logs in during checkout. Getting this right is critical — a confusing checkout is the number one reason customers abandon their carts.

You will handle two scenarios: customers who have an account and want their address pre-filled, and guests who just want to buy quickly without signing up. The system should nudge guests toward creating an account but never force them.

## Guest vs Authenticated Checkout

Use the session from `hooks.server.ts` to detect whether the user is logged in and customize the experience:

```typescript
// src/routes/(store)/checkout/+page.server.ts
import { db } from '$lib/server/db';
import { users, addresses } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function load({ locals }) {
  if (locals.user) {
    const [profile] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(locals.user.id)))
      .limit(1);

    // Fetch saved addresses for authenticated users
    const savedAddresses = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, Number(locals.user.id)));

    // Find the default address
    const defaultAddress = savedAddresses.find((a) => a.isDefault) ?? savedAddresses[0] ?? null;

    return {
      user: {
        name: profile.name,
        email: profile.email
      },
      savedAddresses,
      defaultAddress,
      isGuest: false
    };
  }

  return { user: null, savedAddresses: [], defaultAddress: null, isGuest: true };
}
```

```svelte
<!-- src/routes/(store)/checkout/+page.svelte -->
<script lang="ts">
  import CheckoutForm from '$lib/components/cart/CheckoutForm.svelte';
  import OrderSummary from '$lib/components/cart/OrderSummary.svelte';
  import { cart } from '$lib/state/cart.svelte';
  import { redirect } from '@sveltejs/kit';

  let { data, form } = $props();
</script>

<div class="max-w-4xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Checkout</h1>

  <!-- Empty cart guard -->
  {#if cart.items.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-500 mb-4">Your cart is empty.</p>
      <a href="/products" class="text-blue-600 hover:underline">Browse products</a>
    </div>
  {:else}
    <!-- Guest checkout prompt -->
    {#if data.isGuest}
      <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p>Checking out as a guest.
          <a href="/auth/login?redirect=/checkout" class="text-blue-600 underline font-medium">
            Sign in
          </a> for faster checkout next time, order tracking, and saved addresses.
        </p>
      </div>
    {/if}

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div class="lg:col-span-2">
        <CheckoutForm
          user={data.user}
          savedAddresses={data.savedAddresses}
          defaultAddress={data.defaultAddress}
          errors={form?.errors ?? {}}
          isGuest={data.isGuest}
        />
      </div>
      <div>
        <OrderSummary />
      </div>
    </div>
  {/if}
</div>
```

## Merging Carts on Login

When a guest adds items to their cart and then logs in during checkout, you need to merge the guest cart (stored in a cookie or localStorage) with any existing cart the user had in the database. This is a tricky but essential UX detail:

```typescript
// src/routes/auth/login/+page.server.ts
import { redirect, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { cartItems as cartItemsTable } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export const actions = {
  default: async ({ request, cookies, locals }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const redirectTo = formData.get('redirect') as string ?? '/';

    // ... authenticate the user (verify credentials, set session) ...

    // After successful login, merge guest cart into user cart
    const guestCartRaw = cookies.get('guest_cart');
    if (guestCartRaw && locals.user) {
      await mergeGuestCart(Number(locals.user.id), guestCartRaw);
      cookies.delete('guest_cart', { path: '/' });
    }

    throw redirect(303, redirectTo);
  }
};

async function mergeGuestCart(userId: number, guestCartRaw: string) {
  let guestItems: Array<{ productId: number; quantity: number }>;
  try {
    guestItems = JSON.parse(guestCartRaw);
  } catch {
    return;
  }

  // Get the user's existing cart items
  const existingItems = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.userId, userId));

  const existingMap = new Map(existingItems.map((item) => [item.productId, item]));

  for (const guestItem of guestItems) {
    const existing = existingMap.get(guestItem.productId);

    if (existing) {
      // Item exists in both carts — take the higher quantity
      const newQuantity = Math.max(existing.quantity, guestItem.quantity);
      await db
        .update(cartItemsTable)
        .set({ quantity: newQuantity })
        .where(eq(cartItemsTable.id, existing.id));
    } else {
      // Item only in guest cart — add it
      await db.insert(cartItemsTable).values({
        userId,
        productId: guestItem.productId,
        quantity: guestItem.quantity
      });
    }
  }
}
```

### Cart Merge Strategy Decisions

There are several strategies for merging carts. The code above uses "take the higher quantity" which is the most user-friendly. Alternatives:

- **Sum quantities:** Add guest quantity to existing quantity. Risk: user ends up with more items than expected.
- **Replace:** Guest cart overwrites the saved cart. Risk: user loses items they saved earlier.
- **Prompt:** Ask the user which items to keep. Better UX but more complex.

The "take the higher" strategy works well because it never removes items and never doubles quantities unexpectedly.

## Address Form with Validation

Build the checkout form with comprehensive Zod validation on the server:

```typescript
// src/lib/server/validators.ts
import { z } from 'zod';

export const checkoutSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().regex(/^\+?[\d\s-()]{10,}$/, 'Please enter a valid phone number').optional().or(z.literal('')),
  address: z.string().min(5, 'Street address is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  state: z.string().length(2, 'Please use 2-letter state code (e.g., CA)'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Please enter a valid ZIP code (e.g., 90210)'),
  shippingMethod: z.enum(['standard', 'express', 'overnight']).default('standard'),
  saveAddress: z.string().optional().transform((v) => v === 'on'),
  discountCode: z.string().optional()
});

export type CheckoutData = z.infer<typeof checkoutSchema>;

// US state validation
const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC'
]);

export const addressRefinement = checkoutSchema.refine(
  (data) => US_STATES.has(data.state.toUpperCase()),
  { message: 'Please enter a valid US state code', path: ['state'] }
);
```

```svelte
<!-- src/lib/components/cart/CheckoutForm.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let {
    user,
    savedAddresses = [],
    defaultAddress = null,
    errors = {},
    isGuest = true
  } = $props();

  let selectedAddressId = $state<number | null>(defaultAddress?.id ?? null);
  let useNewAddress = $state(savedAddresses.length === 0);
  let shippingMethod = $state('standard');

  const shippingOptions = [
    { id: 'standard', label: 'Standard Shipping', description: '5-7 business days', price: 0 },
    { id: 'express', label: 'Express Shipping', description: '2-3 business days', price: 999 },
    { id: 'overnight', label: 'Overnight Shipping', description: 'Next business day', price: 2499 }
  ];

  // Pre-fill from selected saved address
  let formData = $derived.by(() => {
    if (!useNewAddress && selectedAddressId) {
      const addr = savedAddresses.find((a) => a.id === selectedAddressId);
      if (addr) {
        return {
          name: user?.name ?? '',
          email: user?.email ?? '',
          address: addr.street,
          address2: addr.street2 ?? '',
          city: addr.city,
          state: addr.state,
          zip: addr.zip
        };
      }
    }
    return {
      name: user?.name ?? '',
      email: user?.email ?? '',
      address: defaultAddress?.street ?? '',
      address2: defaultAddress?.street2 ?? '',
      city: defaultAddress?.city ?? '',
      state: defaultAddress?.state ?? '',
      zip: defaultAddress?.zip ?? ''
    };
  });
</script>

<form method="POST" action="/checkout" use:enhance={() => {
  return async ({ result, update }) => {
    if (result.type === 'failure') {
      errors = result.data?.errors ?? {};
    } else {
      await update();
    }
  };
}}>
  <!-- Saved Addresses (authenticated users only) -->
  {#if savedAddresses.length > 0 && !isGuest}
    <fieldset class="mb-6">
      <legend class="text-lg font-semibold mb-3">Shipping Address</legend>

      <div class="space-y-3 mb-4">
        {#each savedAddresses as addr}
          <label
            class="flex items-start gap-3 p-4 border rounded-lg cursor-pointer
                   {selectedAddressId === addr.id && !useNewAddress
                     ? 'border-black bg-gray-50'
                     : 'hover:border-gray-400'}"
          >
            <input
              type="radio"
              name="savedAddressId"
              value={addr.id}
              checked={selectedAddressId === addr.id && !useNewAddress}
              onchange={() => { selectedAddressId = addr.id; useNewAddress = false; }}
              class="mt-1"
            />
            <div>
              <p class="font-medium">{addr.street}</p>
              {#if addr.street2}<p class="text-gray-600">{addr.street2}</p>{/if}
              <p class="text-gray-600">{addr.city}, {addr.state} {addr.zip}</p>
              {#if addr.isDefault}
                <span class="text-xs text-blue-600 mt-1 inline-block">Default</span>
              {/if}
            </div>
          </label>
        {/each}
      </div>

      <button
        type="button"
        onclick={() => { useNewAddress = true; selectedAddressId = null; }}
        class="text-blue-600 text-sm hover:underline"
      >
        + Use a different address
      </button>
    </fieldset>
  {/if}

  <!-- Contact Information -->
  <fieldset class="space-y-4 mb-6">
    <legend class="text-lg font-semibold mb-3">Contact Information</legend>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="name" class="block text-sm font-medium">Full Name</label>
        <input id="name" name="name" type="text" value={formData.name}
               class="mt-1 w-full border rounded-lg px-3 py-2 {errors.name ? 'border-red-500' : ''}"
               required />
        {#if errors.name}<p class="text-red-500 text-sm mt-1">{errors.name}</p>{/if}
      </div>

      <div>
        <label for="email" class="block text-sm font-medium">Email</label>
        <input id="email" name="email" type="email" value={formData.email}
               class="mt-1 w-full border rounded-lg px-3 py-2 {errors.email ? 'border-red-500' : ''}"
               required />
        {#if errors.email}<p class="text-red-500 text-sm mt-1">{errors.email}</p>{/if}
      </div>
    </div>

    <div>
      <label for="phone" class="block text-sm font-medium">Phone (optional)</label>
      <input id="phone" name="phone" type="tel"
             class="mt-1 w-full border rounded-lg px-3 py-2 {errors.phone ? 'border-red-500' : ''}" />
      {#if errors.phone}<p class="text-red-500 text-sm mt-1">{errors.phone}</p>{/if}
    </div>
  </fieldset>

  <!-- Shipping Address (new address or guest) -->
  {#if useNewAddress || isGuest}
    <fieldset class="space-y-4 mb-6">
      <legend class="text-lg font-semibold mb-3">
        {savedAddresses.length > 0 ? 'New Address' : 'Shipping Address'}
      </legend>

      <div>
        <label for="address" class="block text-sm font-medium">Street Address</label>
        <input id="address" name="address" type="text" value={formData.address}
               class="mt-1 w-full border rounded-lg px-3 py-2 {errors.address ? 'border-red-500' : ''}"
               autocomplete="address-line1" required />
        {#if errors.address}<p class="text-red-500 text-sm mt-1">{errors.address}</p>{/if}
      </div>

      <div>
        <label for="address2" class="block text-sm font-medium">Apt, Suite, etc. (optional)</label>
        <input id="address2" name="address2" type="text" value={formData.address2}
               class="mt-1 w-full border rounded-lg px-3 py-2"
               autocomplete="address-line2" />
      </div>

      <div class="grid grid-cols-6 gap-4">
        <div class="col-span-3">
          <label for="city" class="block text-sm font-medium">City</label>
          <input id="city" name="city" type="text" value={formData.city}
                 class="mt-1 w-full border rounded-lg px-3 py-2 {errors.city ? 'border-red-500' : ''}"
                 autocomplete="address-level2" required />
          {#if errors.city}<p class="text-red-500 text-sm mt-1">{errors.city}</p>{/if}
        </div>
        <div class="col-span-1">
          <label for="state" class="block text-sm font-medium">State</label>
          <input id="state" name="state" type="text" maxlength="2" value={formData.state}
                 class="mt-1 w-full border rounded-lg px-3 py-2 uppercase {errors.state ? 'border-red-500' : ''}"
                 placeholder="CA" autocomplete="address-level1" required />
          {#if errors.state}<p class="text-red-500 text-sm mt-1">{errors.state}</p>{/if}
        </div>
        <div class="col-span-2">
          <label for="zip" class="block text-sm font-medium">ZIP Code</label>
          <input id="zip" name="zip" type="text" maxlength="10" value={formData.zip}
                 class="mt-1 w-full border rounded-lg px-3 py-2 {errors.zip ? 'border-red-500' : ''}"
                 placeholder="90210" autocomplete="postal-code" required />
          {#if errors.zip}<p class="text-red-500 text-sm mt-1">{errors.zip}</p>{/if}
        </div>
      </div>

      <!-- Save address checkbox (authenticated only) -->
      {#if !isGuest}
        <div class="flex items-center gap-2">
          <input id="saveAddress" name="saveAddress" type="checkbox" class="rounded" />
          <label for="saveAddress" class="text-sm">Save this address for future orders</label>
        </div>
      {/if}
    </fieldset>
  {/if}

  <!-- Shipping Method -->
  <fieldset class="mb-6">
    <legend class="text-lg font-semibold mb-3">Shipping Method</legend>
    <div class="space-y-3">
      {#each shippingOptions as option}
        <label
          class="flex items-center justify-between p-4 border rounded-lg cursor-pointer
                 {shippingMethod === option.id ? 'border-black bg-gray-50' : 'hover:border-gray-400'}"
        >
          <div class="flex items-center gap-3">
            <input
              type="radio"
              name="shippingMethod"
              value={option.id}
              checked={shippingMethod === option.id}
              onchange={() => shippingMethod = option.id}
            />
            <div>
              <p class="font-medium">{option.label}</p>
              <p class="text-sm text-gray-500">{option.description}</p>
            </div>
          </div>
          <span class="font-medium">
            {option.price === 0 ? 'Free' : `$${(option.price / 100).toFixed(2)}`}
          </span>
        </label>
      {/each}
    </div>
  </fieldset>

  <!-- Discount Code -->
  <DiscountCode />

  <button type="submit" class="mt-6 w-full bg-black text-white py-3 rounded-lg
                                hover:bg-gray-800 transition-colors text-lg font-semibold">
    Continue to Payment
  </button>
</form>
```

## Discount Code Component

Let customers apply promotional codes:

```svelte
<!-- src/lib/components/cart/DiscountCode.svelte -->
<script lang="ts">
  let code = $state('');
  let status = $state<'idle' | 'loading' | 'valid' | 'invalid'>('idle');
  let discount = $state<{ code: string; percent: number } | null>(null);

  async function validateCode() {
    if (!code.trim()) return;
    status = 'loading';

    const response = await fetch('/api/discount/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim().toUpperCase() })
    });

    if (response.ok) {
      discount = await response.json();
      status = 'valid';
    } else {
      discount = null;
      status = 'invalid';
    }
  }

  function removeDiscount() {
    code = '';
    discount = null;
    status = 'idle';
  }
</script>

<div class="mb-6">
  <label class="text-sm font-medium block mb-2">Discount Code</label>

  {#if discount}
    <div class="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
      <div>
        <span class="font-mono font-medium text-green-800">{discount.code}</span>
        <span class="text-green-600 text-sm ml-2">- {discount.percent}% off</span>
      </div>
      <button type="button" onclick={removeDiscount} class="text-red-500 text-sm hover:underline">
        Remove
      </button>
    </div>
    <input type="hidden" name="discountCode" value={discount.code} />
  {:else}
    <div class="flex gap-2">
      <input
        type="text"
        bind:value={code}
        placeholder="Enter code"
        class="flex-1 border rounded-lg px-3 py-2 uppercase {status === 'invalid' ? 'border-red-500' : ''}"
      />
      <button
        type="button"
        onclick={validateCode}
        disabled={status === 'loading' || !code.trim()}
        class="px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors
               disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'loading' ? 'Checking...' : 'Apply'}
      </button>
    </div>
    {#if status === 'invalid'}
      <p class="text-red-500 text-sm mt-1">Invalid or expired discount code</p>
    {/if}
  {/if}
</div>
```

### Discount Validation Endpoint

```typescript
// src/routes/api/discount/validate/+server.ts
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { discounts } from '$lib/server/schema';
import { eq, and, gte } from 'drizzle-orm';

export async function POST({ request }) {
  const { code } = await request.json();

  if (!code) throw error(400, 'Code is required');

  const [discount] = await db
    .select()
    .from(discounts)
    .where(
      and(
        eq(discounts.code, code.toUpperCase()),
        eq(discounts.active, true),
        gte(discounts.expiresAt, new Date())
      )
    )
    .limit(1);

  if (!discount) {
    throw error(404, 'Invalid or expired code');
  }

  // Check usage limits
  if (discount.maxUses && discount.usedCount >= discount.maxUses) {
    throw error(404, 'Code has reached its usage limit');
  }

  return json({
    code: discount.code,
    percent: discount.percentOff,
    maxDiscountCents: discount.maxDiscountCents
  });
}
```

## Order Summary with Dynamic Pricing

Display what the customer is about to buy, including shipping, discounts, and tax:

```svelte
<!-- src/lib/components/cart/OrderSummary.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';

  let { shippingCents = 0, discountPercent = 0, taxRate = 0 } = $props();

  let subtotal = $derived(cart.totalCents);
  let discountAmount = $derived(Math.round(subtotal * (discountPercent / 100)));
  let afterDiscount = $derived(subtotal - discountAmount);
  let taxAmount = $derived(Math.round(afterDiscount * taxRate));
  let total = $derived(afterDiscount + shippingCents + taxAmount);
</script>

<div class="bg-gray-50 rounded-lg p-6 sticky top-4">
  <h2 class="text-lg font-semibold mb-4">Order Summary</h2>

  <div class="space-y-3">
    {#each cart.items as item}
      <div class="flex justify-between text-sm">
        <div class="flex items-center gap-2">
          {#if item.imageUrl}
            <img src={item.imageUrl} alt="" class="w-8 h-8 object-cover rounded" />
          {/if}
          <span>{item.name} x {item.quantity}</span>
        </div>
        <span>{formatPrice(item.price * item.quantity)}</span>
      </div>
    {/each}
  </div>

  <div class="border-t mt-4 pt-4 space-y-2">
    <div class="flex justify-between text-sm">
      <span>Subtotal</span>
      <span>{formatPrice(subtotal)}</span>
    </div>

    {#if discountAmount > 0}
      <div class="flex justify-between text-sm text-green-600">
        <span>Discount ({discountPercent}%)</span>
        <span>-{formatPrice(discountAmount)}</span>
      </div>
    {/if}

    <div class="flex justify-between text-sm">
      <span>Shipping</span>
      <span>{shippingCents === 0 ? 'Free' : formatPrice(shippingCents)}</span>
    </div>

    {#if taxAmount > 0}
      <div class="flex justify-between text-sm">
        <span>Tax ({(taxRate * 100).toFixed(1)}%)</span>
        <span>{formatPrice(taxAmount)}</span>
      </div>
    {/if}

    <div class="flex justify-between font-bold text-lg border-t pt-2">
      <span>Total</span>
      <span>{formatPrice(total)}</span>
    </div>
  </div>
</div>
```

## Tax Calculation

Calculate sales tax based on the shipping state. This is a simplified approach — production stores typically use a tax API like TaxJar or Avalara:

```typescript
// src/lib/server/tax.ts
// Simplified state sales tax rates (2024 approximations)
const STATE_TAX_RATES: Record<string, number> = {
  CA: 0.0725,
  NY: 0.08,
  TX: 0.0625,
  FL: 0.06,
  WA: 0.065,
  // ... add all states
  OR: 0,      // No sales tax
  MT: 0,      // No sales tax
  NH: 0,      // No sales tax
  DE: 0,      // No sales tax
};

export function getStateTaxRate(state: string): number {
  return STATE_TAX_RATES[state.toUpperCase()] ?? 0;
}

export function calculateTax(subtotalCents: number, state: string): number {
  const rate = getStateTaxRate(state);
  return Math.round(subtotalCents * rate);
}
```

## Server-Side Validation and Checkout Action

Validate the form data, apply discount codes, calculate tax, and store everything for the payment step:

```typescript
// src/routes/(store)/checkout/+page.server.ts (add actions)
import { checkoutSchema } from '$lib/server/validators';
import { fail, redirect } from '@sveltejs/kit';
import { calculateTax, getStateTaxRate } from '$lib/server/tax';
import { db } from '$lib/server/db';
import { addresses, discounts } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export const actions = {
  default: async ({ request, cookies, locals }) => {
    const rawData = Object.fromEntries(await request.formData());
    const result = checkoutSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      return fail(400, { errors, values: rawData });
    }

    const data = result.data;

    // Validate discount code if provided
    let discountPercent = 0;
    if (data.discountCode) {
      const [discount] = await db
        .select()
        .from(discounts)
        .where(
          and(
            eq(discounts.code, data.discountCode.toUpperCase()),
            eq(discounts.active, true)
          )
        )
        .limit(1);

      if (discount) {
        discountPercent = discount.percentOff;

        // Increment usage count
        await db
          .update(discounts)
          .set({ usedCount: discount.usedCount + 1 })
          .where(eq(discounts.id, discount.id));
      }
    }

    // Calculate shipping cost
    const shippingCosts: Record<string, number> = {
      standard: 0,
      express: 999,
      overnight: 2499
    };
    const shippingCents = shippingCosts[data.shippingMethod] ?? 0;

    // Calculate tax
    const taxRate = getStateTaxRate(data.state);

    // Save address if requested (authenticated users only)
    if (data.saveAddress && locals.user) {
      await db.insert(addresses).values({
        userId: Number(locals.user.id),
        street: data.address,
        street2: data.address2 ?? null,
        city: data.city,
        state: data.state.toUpperCase(),
        zip: data.zip,
        isDefault: false
      });
    }

    // Store validated checkout data in a secure, httpOnly cookie
    cookies.set('checkout_data', JSON.stringify({
      ...data,
      state: data.state.toUpperCase(),
      shippingCents,
      discountPercent,
      taxRate
    }), {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 30 // 30 minutes
    });

    throw redirect(303, '/checkout/payment');
  }
};
```

## Multi-Step Checkout Wizard

For a more polished experience, break checkout into discrete steps with a progress indicator:

```svelte
<!-- src/lib/components/cart/CheckoutWizard.svelte -->
<script lang="ts">
  let { currentStep = 1 } = $props();

  const steps = [
    { number: 1, label: 'Contact', href: '/checkout' },
    { number: 2, label: 'Shipping', href: '/checkout' },
    { number: 3, label: 'Payment', href: '/checkout/payment' },
    { number: 4, label: 'Confirmation', href: '#' }
  ];
</script>

<nav aria-label="Checkout progress" class="mb-8">
  <ol class="flex items-center justify-center gap-2">
    {#each steps as step, i}
      <li class="flex items-center">
        <div
          class="flex items-center gap-2 px-3 py-1 rounded-full text-sm
                 {step.number === currentStep
                   ? 'bg-black text-white font-medium'
                   : step.number < currentStep
                     ? 'bg-green-100 text-green-700'
                     : 'bg-gray-100 text-gray-400'}"
        >
          {#if step.number < currentStep}
            <span>&#10003;</span>
          {:else}
            <span>{step.number}</span>
          {/if}
          <span class="hidden sm:inline">{step.label}</span>
        </div>
        {#if i < steps.length - 1}
          <div class="w-8 h-px bg-gray-300 mx-1"></div>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
```

Use the wizard component at the top of each checkout page:

```svelte
<!-- In checkout/+page.svelte -->
<CheckoutWizard currentStep={1} />

<!-- In checkout/payment/+page.svelte -->
<CheckoutWizard currentStep={3} />

<!-- In checkout/confirmation/+page.svelte -->
<CheckoutWizard currentStep={4} />
```

## Address Autocomplete (Optional Enhancement)

For a premium checkout experience, integrate address autocomplete. This example shows the pattern using a generic geocoding API:

```svelte
<!-- src/lib/components/cart/AddressAutocomplete.svelte -->
<script lang="ts">
  let { onSelect, value = '' } = $props();

  let query = $state(value);
  let suggestions = $state<Array<{ formatted: string; components: any }>>([]);
  let showSuggestions = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  async function search(q: string) {
    if (q.length < 3) {
      suggestions = [];
      return;
    }

    const res = await fetch(`/api/address/autocomplete?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      suggestions = await res.json();
      showSuggestions = suggestions.length > 0;
    }
  }

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => search(query), 300);
  }

  function select(suggestion: typeof suggestions[0]) {
    query = suggestion.components.street;
    showSuggestions = false;
    onSelect(suggestion.components);
  }
</script>

<div class="relative">
  <input
    type="text"
    bind:value={query}
    oninput={handleInput}
    onfocus={() => showSuggestions = suggestions.length > 0}
    class="w-full border rounded-lg px-3 py-2"
    placeholder="Start typing your address..."
    autocomplete="off"
  />

  {#if showSuggestions}
    <ul class="absolute z-10 w-full bg-white border rounded-lg mt-1 shadow-lg max-h-48 overflow-y-auto">
      {#each suggestions as suggestion}
        <li>
          <button
            type="button"
            class="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
            onclick={() => select(suggestion)}
          >
            {suggestion.formatted}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>
```

## Try It

1. Add a "Save this address" checkbox to the checkout form that only appears for authenticated users. When checked, save the address to the user's profile in the database using the form action. Pre-fill the address fields from the saved profile on future checkouts.

2. Implement the discount code feature end-to-end: create a `discounts` table in your database with columns for `code`, `percentOff`, `maxUses`, `usedCount`, `active`, and `expiresAt`. Build the validation endpoint and the frontend component. Test with codes like `SAVE10` (10% off) and `WELCOME20` (20% off for new customers).

3. Build the cart merge logic: create a guest cart using localStorage, then log in and verify that guest items merge with the user's saved cart. Test the edge case where the same product exists in both carts.

4. Add the multi-step progress indicator to all checkout pages and verify that it correctly reflects the current step and marks completed steps with a checkmark.

## Key Takeaways

- Support both guest and authenticated checkout to maximize conversions — never force account creation
- Pre-fill form fields for logged-in users to reduce friction and offer saved address selection
- Merge guest carts with user carts on login using a "take the higher quantity" strategy
- Validate all form data server-side with Zod even if you also validate client-side — client validation is for UX, server validation is for security
- Use HTML `autocomplete` attributes on address fields so browsers can auto-fill addresses
- Offer multiple shipping methods with clear pricing and delivery estimates
- Calculate sales tax based on the shipping state — use a tax API in production for accuracy
- Validate discount codes server-side and enforce usage limits and expiration dates
- Store checkout data in an httpOnly, secure cookie so it is available during the payment step but not accessible to client-side JavaScript
- Use `use:enhance` for progressive enhancement so the form works with and without JavaScript
- A multi-step progress indicator helps users understand where they are in the checkout process
