# Checkout Flow

Now you will build a complete checkout flow: the server creates a Payment Intent, the client renders Stripe's payment form, and the customer confirms the payment. Stripe's **Elements** library provides pre-built, secure UI components so you never handle card data directly.

## Installing Dependencies

Install both the server SDK and the client library:

```bash
npm install stripe @stripe/stripe-js
```

- `stripe` — the server-side SDK for creating Payment Intents
- `@stripe/stripe-js` — the client-side library for rendering payment forms

## Creating a Payment Intent on the Server

The server creates the Payment Intent and returns the `client_secret` to the page:

```typescript
// src/routes/checkout/+page.server.ts
import type { PageServerLoad } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const load: PageServerLoad = async () => {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: 4999,       // $49.99
    currency: 'usd',
    automatic_payment_methods: {
      enabled: true
    }
  });

  return {
    clientSecret: paymentIntent.client_secret
  };
};
```

The `client_secret` lets the client confirm the payment without exposing your secret key. The `automatic_payment_methods` option enables all relevant payment methods for the customer's region.

## Setting Up the Client

Load Stripe.js and create the Elements provider:

```svelte
<!-- src/routes/checkout/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

  let { data } = $props();

  let stripe: Stripe | null = $state(null);
  let elements: StripeElements | null = $state(null);
  let paymentElement: HTMLDivElement;
  let message = $state('');
  let processing = $state(false);

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);

    if (!stripe) return;

    elements = stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe'
      }
    });

    const payment = elements.create('payment');
    payment.mount(paymentElement);
  });
</script>
```

## The Payment Form

Build the checkout UI around the Stripe payment element:

```svelte
<h1>Checkout</h1>

<div class="checkout-container">
  <div class="order-summary">
    <h2>Order Summary</h2>
    <div class="item">
      <span>Svelte Bootcamp Course</span>
      <span>$49.99</span>
    </div>
    <div class="total">
      <strong>Total</strong>
      <strong>$49.99</strong>
    </div>
  </div>

  <form onsubmit={handleSubmit}>
    <div bind:this={paymentElement}></div>

    {#if message}
      <p class="message">{message}</p>
    {/if}

    <button type="submit" disabled={processing || !stripe}>
      {processing ? 'Processing...' : 'Pay $49.99'}
    </button>
  </form>
</div>
```

## Confirming the Payment

Handle the form submission to confirm the payment with Stripe:

```svelte
<script lang="ts">
  // ... (previous script content)

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (!stripe || !elements) return;

    processing = true;
    message = '';

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`
      }
    });

    // This point is only reached if there is an immediate error
    // (e.g. card declined). On success, the user is redirected.
    if (error) {
      if (error.type === 'card_error' || error.type === 'validation_error') {
        message = error.message ?? 'An error occurred.';
      } else {
        message = 'An unexpected error occurred.';
      }
    }

    processing = false;
  }
</script>
```

On success, Stripe redirects the customer to your `return_url` with a `payment_intent` query parameter.

## Success Page

Create a page that verifies the payment status:

```typescript
// src/routes/checkout/success/+page.server.ts
import type { PageServerLoad } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const load: PageServerLoad = async ({ url }) => {
  const paymentIntentId = url.searchParams.get('payment_intent');

  if (!paymentIntentId) {
    throw redirect(303, '/checkout');
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  return {
    status: paymentIntent.status,
    amount: paymentIntent.amount
  };
};
```

```svelte
<!-- src/routes/checkout/success/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

{#if data.status === 'succeeded'}
  <h1>Payment Successful!</h1>
  <p>Thank you for your purchase of ${(data.amount / 100).toFixed(2)}.</p>
  <a href="/dashboard">Go to Dashboard</a>
{:else}
  <h1>Payment Status: {data.status}</h1>
  <p>Your payment is being processed. You will receive confirmation shortly.</p>
{/if}
```

## Try It

Build a complete checkout page for a product of your choice. Create the Payment Intent in a server load function, mount the Stripe PaymentElement, handle form submission with error messages, and create a success page that verifies the payment status. Test with the `4242 4242 4242 4242` card and the `4000 0000 0000 0002` declined card.

## Key Takeaways

- Create Payment Intents on the server and pass the `client_secret` to the client
- Use `@stripe/stripe-js` to load Stripe and create Elements with the client secret
- The `payment` element renders a complete, secure payment form automatically
- Call `stripe.confirmPayment()` to process the payment and redirect on success
- Always verify payment status on the server using `paymentIntents.retrieve()`
- `automatic_payment_methods` enables cards, wallets, and regional methods automatically
