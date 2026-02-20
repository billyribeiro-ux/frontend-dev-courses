# Checkout & Authentication

The checkout page is where browsing turns into buying. In this lesson you will build both guest and authenticated checkout flows, an address form with validation, and an order summary. Getting this right is critical — a confusing checkout is the number one reason customers abandon their carts.

You will handle two scenarios: customers who have an account and want their address pre-filled, and guests who just want to buy quickly without signing up.

## Guest vs Authenticated Checkout

Use the session from `hooks.server.ts` to detect whether the user is logged in and customize the experience:

```typescript
// src/routes/(store)/checkout/+page.server.ts
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function load({ locals }) {
  if (locals.user) {
    const [profile] = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(locals.user.id)))
      .limit(1);

    return {
      user: {
        name: profile.name,
        email: profile.email
      },
      isGuest: false
    };
  }

  return { user: null, isGuest: true };
}
```

```svelte
<!-- src/routes/(store)/checkout/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<div class="max-w-4xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Checkout</h1>

  {#if data.isGuest}
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <p>Checking out as a guest.
        <a href="/auth/login?redirect=/checkout" class="text-blue-600 underline">
          Sign in
        </a> for faster checkout next time.
      </p>
    </div>
  {/if}

  <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
    <div class="lg:col-span-2">
      <CheckoutForm user={data.user} />
    </div>
    <div>
      <OrderSummary />
    </div>
  </div>
</div>
```

## Address Form with Validation

Build the checkout form with Zod validation on the server:

```typescript
// src/lib/server/validators.ts
import { z } from 'zod';

export const checkoutSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email is required'),
  address: z.string().min(5, 'Address is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().min(2, 'State is required'),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/, 'Valid ZIP code is required')
});

export type CheckoutData = z.infer<typeof checkoutSchema>;
```

```svelte
<!-- src/lib/components/cart/CheckoutForm.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { user } = $props();
  let errors = $state<Record<string, string>>({});
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
  <fieldset class="space-y-4">
    <legend class="text-xl font-semibold mb-4">Shipping Information</legend>

    <div>
      <label for="name" class="block text-sm font-medium">Full Name</label>
      <input id="name" name="name" type="text" value={user?.name ?? ''}
             class="mt-1 w-full border rounded-lg px-3 py-2" />
      {#if errors.name}<p class="text-red-500 text-sm mt-1">{errors.name}</p>{/if}
    </div>

    <div>
      <label for="email" class="block text-sm font-medium">Email</label>
      <input id="email" name="email" type="email" value={user?.email ?? ''}
             class="mt-1 w-full border rounded-lg px-3 py-2" />
      {#if errors.email}<p class="text-red-500 text-sm mt-1">{errors.email}</p>{/if}
    </div>

    <div>
      <label for="address" class="block text-sm font-medium">Address</label>
      <input id="address" name="address" type="text"
             class="mt-1 w-full border rounded-lg px-3 py-2" />
      {#if errors.address}<p class="text-red-500 text-sm mt-1">{errors.address}</p>{/if}
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div>
        <label for="city" class="block text-sm font-medium">City</label>
        <input id="city" name="city" type="text"
               class="mt-1 w-full border rounded-lg px-3 py-2" />
        {#if errors.city}<p class="text-red-500 text-sm mt-1">{errors.city}</p>{/if}
      </div>
      <div>
        <label for="state" class="block text-sm font-medium">State</label>
        <input id="state" name="state" type="text"
               class="mt-1 w-full border rounded-lg px-3 py-2" />
        {#if errors.state}<p class="text-red-500 text-sm mt-1">{errors.state}</p>{/if}
      </div>
      <div>
        <label for="zip" class="block text-sm font-medium">ZIP</label>
        <input id="zip" name="zip" type="text"
               class="mt-1 w-full border rounded-lg px-3 py-2" />
        {#if errors.zip}<p class="text-red-500 text-sm mt-1">{errors.zip}</p>{/if}
      </div>
    </div>
  </fieldset>

  <button type="submit" class="mt-6 w-full bg-black text-white py-3 rounded-lg
                                hover:bg-gray-800 transition-colors">
    Continue to Payment
  </button>
</form>
```

## Order Summary

Display what the customer is about to buy:

```svelte
<!-- src/lib/components/cart/OrderSummary.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';
</script>

<div class="bg-gray-50 rounded-lg p-6 sticky top-4">
  <h2 class="text-lg font-semibold mb-4">Order Summary</h2>

  <div class="space-y-3">
    {#each cart.items as item}
      <div class="flex justify-between text-sm">
        <span>{item.name} x {item.quantity}</span>
        <span>{formatPrice(item.price * item.quantity)}</span>
      </div>
    {/each}
  </div>

  <div class="border-t mt-4 pt-4 space-y-2">
    <div class="flex justify-between text-sm">
      <span>Subtotal</span>
      <span>{formatPrice(cart.totalCents)}</span>
    </div>
    <div class="flex justify-between text-sm">
      <span>Shipping</span>
      <span>Free</span>
    </div>
    <div class="flex justify-between font-bold text-lg border-t pt-2">
      <span>Total</span>
      <span>{formatPrice(cart.totalCents)}</span>
    </div>
  </div>
</div>
```

## Server-Side Validation Action

Validate the form data on the server before proceeding to payment:

```typescript
// src/routes/(store)/checkout/+page.server.ts (add actions)
import { checkoutSchema } from '$lib/server/validators';
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  default: async ({ request, cookies }) => {
    const formData = Object.fromEntries(await request.formData());
    const result = checkoutSchema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      return fail(400, { errors });
    }

    // Store validated data in a cookie or session for the payment step
    cookies.set('checkout_data', JSON.stringify(result.data), {
      path: '/',
      httpOnly: true,
      maxAge: 60 * 30 // 30 minutes
    });

    throw redirect(303, '/checkout/payment');
  }
};
```

## Try It

Add a "Save this address" checkbox to the checkout form that only appears for authenticated users. When checked, save the address to the user's profile in the database using an additional form action. Pre-fill the address fields from the saved profile on future checkouts.

## Key Takeaways

- Support both guest and authenticated checkout to maximize conversions
- Pre-fill form fields for logged-in users to reduce friction
- Validate all form data server-side with Zod even if you also validate client-side
- Use `use:enhance` for progressive enhancement so the form works with and without JavaScript
- Store checkout data in an httpOnly cookie or server session so it is available during the payment step
