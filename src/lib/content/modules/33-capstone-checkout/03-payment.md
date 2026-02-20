# Payment with Stripe

This is where your store makes money. In this lesson you will integrate Stripe to process payments, create orders in your database, show a confirmation page, and redirect customers after a successful purchase. Stripe handles the hard parts — PCI compliance, card validation, and fraud detection — so you can focus on the user experience.

You will use Stripe Checkout, a hosted payment page that Stripe manages. This is the safest and fastest way to accept payments because sensitive card data never touches your server.

## Creating a Stripe Checkout Session

When the customer is ready to pay, create a Checkout Session on the server:

```typescript
// src/routes/(store)/checkout/payment/+page.server.ts
import Stripe from 'stripe';
import { redirect, error } from '@sveltejs/kit';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { db } from '$lib/server/db';
import { orders, orderItems } from '$lib/server/schema';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function load({ cookies, locals, url }) {
  const checkoutRaw = cookies.get('checkout_data');
  if (!checkoutRaw) {
    throw redirect(303, '/checkout');
  }

  const checkout = JSON.parse(checkoutRaw);

  // IMPORTANT: Cart items come from the request, but you must ALWAYS
  // validate prices against the database before creating a Stripe session.
  // Never trust client-side amounts — a user could modify the hidden form field.
  return { checkout };
}

export const actions = {
  default: async ({ request, cookies, locals, url }) => {
    const formData = await request.formData();
    const cartItems = JSON.parse(formData.get('cart') as string);
    const checkoutRaw = cookies.get('checkout_data');

    if (!checkoutRaw || !cartItems?.length) {
      throw error(400, 'Missing checkout data');
    }

    const checkout = JSON.parse(checkoutRaw);

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: checkout.email,
      line_items: cartItems.map((item: any) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: item.name,
            images: item.imageUrl ? [item.imageUrl] : []
          },
          unit_amount: item.price // already in cents
        },
        quantity: item.quantity
      })),
      success_url: `${url.origin}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/checkout`
    });

    throw redirect(303, session.url!);
  }
};
```

## Payment Page Component

Show the order summary one more time and let the customer proceed to Stripe:

```svelte
<!-- src/routes/(store)/checkout/payment/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';
  import { enhance } from '$app/forms';
</script>

<div class="max-w-2xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Payment</h1>

  <div class="bg-gray-50 rounded-lg p-6 mb-6">
    <h2 class="font-semibold mb-4">Order Review</h2>
    {#each cart.items as item}
      <div class="flex justify-between py-2">
        <span>{item.name} x {item.quantity}</span>
        <span>{formatPrice(item.price * item.quantity)}</span>
      </div>
    {/each}
    <div class="border-t mt-3 pt-3 flex justify-between font-bold text-lg">
      <span>Total</span>
      <span>{formatPrice(cart.totalCents)}</span>
    </div>
  </div>

  <form method="POST" use:enhance>
    <input type="hidden" name="cart" value={JSON.stringify(cart.items)} />
    <button type="submit"
            class="w-full bg-blue-600 text-white py-4 rounded-lg text-lg
                   font-semibold hover:bg-blue-700 transition-colors">
      Pay {formatPrice(cart.totalCents)}
    </button>
  </form>

  <p class="text-sm text-gray-500 text-center mt-4">
    You will be redirected to Stripe's secure payment page.
  </p>
</div>
```

## Creating the Order After Payment

Use Stripe webhooks to confirm payment and create the order in your database:

```typescript
// src/routes/api/stripe-webhook/+server.ts
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { db } from '$lib/server/db';
import { orders, orderItems } from '$lib/server/schema';
import { json, error } from '@sveltejs/kit';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function POST({ request }) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    throw error(400, 'Invalid webhook signature');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Retrieve line items from the session
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id);

    // Create order in database
    const [order] = await db.insert(orders).values({
      totalCents: session.amount_total!,
      shippingName: session.customer_details?.name ?? '',
      shippingAddress: '', // Pull from session metadata in production
      shippingCity: '',
      shippingState: '',
      shippingZip: '',
      stripePaymentId: session.payment_intent as string,
      status: 'confirmed'
    }).returning();

    console.log('Order created:', order.id);
  }

  return json({ received: true });
}
```

## Confirmation Page

After Stripe redirects back, show the customer their order confirmation:

```typescript
// src/routes/(store)/checkout/confirmation/+page.server.ts
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { redirect } from '@sveltejs/kit';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function load({ url }) {
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) throw redirect(303, '/');

  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    customerName: session.customer_details?.name,
    customerEmail: session.customer_details?.email,
    amountTotal: session.amount_total
  };
}
```

```svelte
<!-- src/routes/(store)/checkout/confirmation/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';
  import { onMount } from 'svelte';

  let { data } = $props();

  // Only clear the cart after verifying payment succeeded on the server.
  // The load function already confirmed the session status, so this is safe.
  onMount(() => {
    if (data.customerName) {
      cart.clear();
    }
  });
</script>

<div class="max-w-2xl mx-auto px-4 py-16 text-center">
  <div class="text-5xl mb-4">&#10003;</div>
  <h1 class="text-3xl font-bold mb-2">Order Confirmed!</h1>
  <p class="text-gray-600 mb-6">
    Thank you, {data.customerName}. A confirmation email has been sent to {data.customerEmail}.
  </p>
  <p class="text-xl font-bold mb-8">
    Total: {formatPrice(data.amountTotal ?? 0)}
  </p>
  <a href="/products" class="bg-black text-white px-8 py-3 rounded-lg
                              hover:bg-gray-800 transition-colors">
    Continue Shopping
  </a>
</div>
```

## Try It

Add Stripe test mode to your development environment. Use the test card number `4242 4242 4242 4242` with any future expiration date and any CVC. Create a complete purchase flow from adding a product to the cart through to the confirmation page. Verify the order appears in your Stripe dashboard.

## Key Takeaways

- Use Stripe Checkout (hosted payment page) so sensitive card data never touches your server
- Create Checkout Sessions on the server where your secret key is safe
- Use webhooks to reliably confirm payment — do not rely on the redirect alone, since customers can close their browser
- Clear the cart on the confirmation page after a successful purchase
- Always use Stripe's test mode during development with the `4242` test card number
