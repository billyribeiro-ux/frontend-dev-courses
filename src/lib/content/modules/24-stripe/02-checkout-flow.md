# Checkout Flow

Now you will build a complete checkout flow. This lesson covers two approaches: **Stripe Checkout** (Stripe-hosted payment page) and **Stripe Elements** (custom payment form embedded in your site). You will learn when to use each, how to create Payment Intents and Checkout Sessions on the server, handle redirects, verify payments, process webhooks for reliable fulfillment, and build a polished checkout experience.

## The Two Approaches

Stripe offers two fundamentally different checkout experiences:

**Stripe Checkout** is a Stripe-hosted payment page. You redirect the customer to Stripe's domain, they pay there, and Stripe redirects them back. Stripe handles all the UI, validation, error messages, and payment method selection. This is the fastest path to accepting payments and handles edge cases (3D Secure, payment method availability by country, localization) automatically.

**Stripe Elements** embeds Stripe's payment fields directly in your page. You control the layout, styling, and user experience. The payment fields are rendered in secure iframes -- card data never touches your server. This gives you full design control at the cost of more implementation work.

```
Use Stripe Checkout when:
- You want to accept payments with minimal code
- You need to support many payment methods (Apple Pay, Google Pay, Klarna, etc.)
- You want Stripe to handle 3D Secure, localization, and compliance
- You are selling a fixed set of products or subscriptions

Use Stripe Elements when:
- You need the payment form to match your brand exactly
- The checkout flow is complex (multi-step, conditional fields)
- You want the customer to stay on your domain throughout
- You are building a marketplace or platform with custom payment flows
```

## Installing Dependencies

Install both the server SDK and the client library:

```bash
npm install stripe @stripe/stripe-js
```

- `stripe` -- the server-side SDK for creating Payment Intents and Checkout Sessions
- `@stripe/stripe-js` -- the client-side library for rendering payment forms

Set up your environment variables:

```bash
# .env
STRIPE_SECRET_KEY=sk_test_...
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

The secret key stays on the server (never expose it to the client). The publishable key is safe to use in the browser -- it can only be used to create tokens and confirm payments, not to read or modify your Stripe account.

## Approach 1: Stripe Checkout (Redirect)

### Creating a Checkout Session

The server creates a Checkout Session with line items, and the client redirects to Stripe:

```typescript
// src/routes/checkout/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
import { fail, redirect } from '@sveltejs/kit';
import Stripe from 'stripe';
import { db } from '$lib/server/db';
import { cart, products } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const load: PageServerLoad = async ({ locals }) => {
  return {
    publishableKey: PUBLIC_STRIPE_PUBLISHABLE_KEY
  };
};

export const actions: Actions = {
  checkout: async ({ request, locals, url }) => {
    const user = locals.user;
    if (!user) throw redirect(303, '/login');

    // Fetch cart items from the database
    const cartItems = await db
      .select()
      .from(cart)
      .where(eq(cart.userId, user.id));

    if (cartItems.length === 0) {
      return fail(400, { error: 'Cart is empty' });
    }

    // Look up current prices from the database -- never trust client-side prices
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of cartItems) {
      const [product] = await db
        .select()
        .from(products)
        .where(eq(products.id, item.productId))
        .limit(1);

      if (!product) continue;

      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: product.name,
            description: product.description ?? undefined,
            images: product.imageUrl ? [product.imageUrl] : undefined
          },
          unit_amount: product.priceInCents // e.g., 4999 for $49.99
        },
        quantity: item.quantity
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: lineItems,
      customer_email: user.email,

      // Metadata for webhook processing
      metadata: {
        userId: String(user.id)
      },

      // Where to redirect after payment
      success_url: `${url.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/cart`,

      // Collect shipping address
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'DE', 'FR', 'AU']
      },

      // Allow promo codes
      allow_promotion_codes: true,

      // Automatic tax calculation (requires Stripe Tax setup)
      // automatic_tax: { enabled: true },

      // Expires after 30 minutes
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    });

    if (session.url) {
      throw redirect(303, session.url);
    }

    return fail(500, { error: 'Failed to create checkout session' });
  }
};
```

```svelte
<!-- src/routes/checkout/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data, form } = $props();
</script>

<h1>Checkout</h1>

{#if form?.error}
  <p class="error">{form.error}</p>
{/if}

<form method="POST" action="?/checkout" use:enhance>
  <button type="submit">Proceed to Payment</button>
</form>
```

### Embedded Checkout (No Redirect)

Instead of redirecting to Stripe, you can embed the Checkout form in an iframe on your page:

```svelte
<!-- src/routes/checkout/embedded/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { loadStripe } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

  let { data } = $props();
  let checkoutContainer: HTMLDivElement;

  onMount(async () => {
    const stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
    if (!stripe) return;

    // Fetch a session with mode: 'embedded'
    const res = await fetch('/api/checkout/session', { method: 'POST' });
    const { clientSecret } = await res.json();

    const checkout = await stripe.initEmbeddedCheckout({ clientSecret });
    checkout.mount(checkoutContainer);

    return () => checkout.destroy();
  });
</script>

<h1>Complete Your Purchase</h1>
<div bind:this={checkoutContainer}></div>
```

The server endpoint for embedded checkout:

```typescript
// src/routes/api/checkout/session/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const POST: RequestHandler = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Not authenticated' }, { status: 401 });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ui_mode: 'embedded',   // Key difference from redirect mode
    line_items: [
      // ... same as before
    ],
    return_url: `${url.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`
  });

  return json({ clientSecret: session.client_secret });
};
```

## Approach 2: Stripe Elements (Custom Form)

### Creating a Payment Intent

The server creates a Payment Intent (not a Checkout Session) and returns the `client_secret`:

```typescript
// src/routes/checkout/custom/+page.server.ts
import type { PageServerLoad } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) throw redirect(303, '/login');

  // Always calculate the amount on the server from your database
  // NEVER accept the amount from the client
  const cartTotal = await calculateCartTotal(locals.user.id);

  if (cartTotal === 0) throw redirect(303, '/cart');

  const paymentIntent = await stripe.paymentIntents.create({
    amount: cartTotal,        // Amount in cents
    currency: 'usd',
    automatic_payment_methods: { enabled: true },
    metadata: {
      userId: String(locals.user.id)
    }
  });

  return {
    clientSecret: paymentIntent.client_secret,
    amount: cartTotal
  };
};

async function calculateCartTotal(userId: number): Promise<number> {
  // Query your database for the user's cart items and sum prices
  // This ensures the amount cannot be tampered with on the client
  const items = await db
    .select()
    .from(cart)
    .innerJoin(products, eq(cart.productId, products.id))
    .where(eq(cart.userId, userId));

  return items.reduce((sum, item) => {
    return sum + item.products.priceInCents * item.cart.quantity;
  }, 0);
}
```

### Mounting the Payment Element

```svelte
<!-- src/routes/checkout/custom/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { loadStripe, type Stripe, type StripeElements } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

  let { data } = $props();

  let stripe: Stripe | null = $state(null);
  let elements: StripeElements | null = $state(null);
  let paymentElement: HTMLDivElement;
  let message = $state('');
  let processing = $state(false);
  let ready = $state(false);

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
    if (!stripe) return;

    elements = stripe.elements({
      clientSecret: data.clientSecret,
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0f172a',
          colorBackground: '#ffffff',
          colorText: '#1e293b',
          colorDanger: '#ef4444',
          fontFamily: 'system-ui, sans-serif',
          spacingUnit: '4px',
          borderRadius: '8px'
        },
        rules: {
          '.Input': {
            border: '1px solid #e2e8f0',
            boxShadow: 'none'
          },
          '.Input:focus': {
            border: '1px solid #0f172a',
            boxShadow: '0 0 0 1px #0f172a'
          }
        }
      }
    });

    const payment = elements.create('payment', {
      layout: {
        type: 'tabs',
        defaultCollapsed: false
      }
    });

    payment.mount(paymentElement);

    // Track when the element is ready for interaction
    payment.on('ready', () => {
      ready = true;
    });

    // Track validation changes
    payment.on('change', (event) => {
      if (event.error) {
        message = event.error.message;
      } else {
        message = '';
      }
    });
  });

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();

    if (!stripe || !elements) return;

    processing = true;
    message = '';

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
        receipt_email: data.userEmail
      }
    });

    // This point is only reached if there is an immediate error.
    // On success, the user is redirected to return_url.
    if (error) {
      if (error.type === 'card_error' || error.type === 'validation_error') {
        message = error.message ?? 'Payment failed.';
      } else {
        message = 'An unexpected error occurred. Please try again.';
      }
    }

    processing = false;
  }
</script>

<div class="checkout-layout">
  <div class="order-summary">
    <h2>Order Summary</h2>
    <!-- Cart items here -->
    <div class="total">
      <strong>Total</strong>
      <strong>{formatPrice(data.amount)}</strong>
    </div>
  </div>

  <form onsubmit={handleSubmit} class="payment-form">
    <h2>Payment Details</h2>

    <div bind:this={paymentElement}></div>

    {#if message}
      <p class="error-message" role="alert">{message}</p>
    {/if}

    <button
      type="submit"
      disabled={processing || !ready}
      class="pay-button"
    >
      {#if processing}
        <span class="spinner"></span> Processing...
      {:else}
        Pay {formatPrice(data.amount)}
      {/if}
    </button>
  </form>
</div>

<style>
  .checkout-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    max-width: 900px;
    margin: 2rem auto;
    padding: 0 1rem;
  }

  .error-message {
    color: #ef4444;
    font-size: 0.875rem;
    margin-top: 0.5rem;
  }

  .pay-button {
    width: 100%;
    padding: 0.875rem;
    background: #0f172a;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    margin-top: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .pay-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (max-width: 640px) {
    .checkout-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
```

### The Appearance API

Stripe Elements supports deep customization through the Appearance API. The `theme` option sets a base theme (`'stripe'`, `'night'`, `'flat'`), and `variables` and `rules` let you override specific styles. This is how you match the payment form to your brand without handling sensitive card data.

## Verifying Payment Completion

### Success Page

After payment, Stripe redirects the customer to your success URL with query parameters. Always verify the payment status on the server -- never trust the client-side redirect alone:

```typescript
// src/routes/checkout/success/+page.server.ts
import type { PageServerLoad } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const load: PageServerLoad = async ({ url }) => {
  // For Checkout Sessions
  const sessionId = url.searchParams.get('session_id');
  if (sessionId) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'payment_intent']
    });

    return {
      status: session.payment_status,
      customerEmail: session.customer_details?.email,
      amount: session.amount_total,
      items: session.line_items?.data ?? []
    };
  }

  // For Payment Intents (Elements flow)
  const paymentIntentId = url.searchParams.get('payment_intent');
  if (paymentIntentId) {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    return {
      status: paymentIntent.status === 'succeeded' ? 'paid' : paymentIntent.status,
      amount: paymentIntent.amount
    };
  }

  throw redirect(303, '/');
};
```

```svelte
<!-- src/routes/checkout/success/+page.svelte -->
<script lang="ts">
  let { data } = $props();

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(cents / 100);
  }
</script>

{#if data.status === 'paid' || data.status === 'succeeded'}
  <div class="success-container">
    <div class="success-icon">&#10003;</div>
    <h1>Payment Successful!</h1>
    <p>Thank you for your purchase of {formatPrice(data.amount ?? 0)}.</p>
    {#if data.customerEmail}
      <p>A confirmation email has been sent to {data.customerEmail}.</p>
    {/if}
    <a href="/orders">View Your Orders</a>
  </div>
{:else if data.status === 'processing'}
  <div class="processing-container">
    <h1>Payment Processing</h1>
    <p>Your payment is being processed. We will email you when it is confirmed.</p>
  </div>
{:else}
  <div class="error-container">
    <h1>Payment Issue</h1>
    <p>Something went wrong with your payment. Status: {data.status}</p>
    <a href="/checkout">Try Again</a>
  </div>
{/if}
```

## Webhooks: The Reliable Path

The success page redirect is not reliable for order fulfillment. The customer might close their browser before the redirect. Their network might drop. The redirect URL might fail to load. **Webhooks are the only reliable way to know a payment succeeded.**

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';
import { db } from '$lib/server/db';
import { orders, cart } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    throw error(400, 'Missing stripe-signature header');
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw error(400, 'Invalid signature');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      await handlePaymentSuccess(paymentIntent);
      break;
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.error(`Payment failed for PI ${paymentIntent.id}:`,
        paymentIntent.last_payment_error?.message);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge;
      await handleRefund(charge);
      break;
    }

    default:
      console.log(`Unhandled webhook event: ${event.type}`);
  }

  // Always return 200 quickly -- Stripe retries on failure
  return json({ received: true });
};

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = Number(session.metadata?.userId);
  if (!userId) return;

  // Check idempotency -- do not process the same session twice
  const [existing] = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, session.id))
    .limit(1);

  if (existing) return; // Already processed

  // Create the order
  await db.insert(orders).values({
    userId,
    stripeSessionId: session.id,
    status: 'paid',
    totalCents: session.amount_total ?? 0,
    shippingAddress: JSON.stringify(session.shipping_details?.address),
    createdAt: new Date()
  });

  // Clear the user's cart
  await db.delete(cart).where(eq(cart.userId, userId));

  // Send confirmation email (fire and forget)
  // await sendOrderConfirmation(userId, session.id);
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const userId = Number(paymentIntent.metadata?.userId);
  if (!userId) return;

  // Similar to checkout complete -- create order, clear cart
  console.log(`Payment ${paymentIntent.id} succeeded for user ${userId}`);
}

async function handleRefund(charge: Stripe.Charge) {
  console.log(`Charge ${charge.id} refunded: ${charge.amount_refunded} cents`);
  // Update order status in your database
}
```

### Webhook Security

Three critical details:

1. **Signature verification** -- The `constructEvent` call verifies that the webhook came from Stripe, not an attacker. Never skip this.

2. **Idempotency** -- Stripe may send the same event multiple times (network retries, manual resends from the dashboard). Always check if you have already processed the event before taking action.

3. **Raw body** -- You must use `request.text()`, not `request.json()`. The signature is computed over the raw request body. Parsing and re-stringifying JSON changes the byte representation, breaking the signature.

### Testing Webhooks Locally

Use the Stripe CLI to forward webhook events to your local development server:

```bash
# Install the Stripe CLI, then:
stripe listen --forward-to localhost:5173/api/webhooks/stripe

# In another terminal, trigger test events:
stripe trigger checkout.session.completed
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
```

The CLI prints the webhook signing secret (`whsec_...`) when it starts -- use this as your `STRIPE_WEBHOOK_SECRET` during local development.

## Handling 3D Secure and Authentication

Some payments require additional authentication (3D Secure, bank redirects). Stripe handles this automatically when you use `automatic_payment_methods: { enabled: true }`:

```typescript
// The confirmPayment call handles 3D Secure automatically.
// If authentication is required, Stripe shows a modal in the browser.
// Your code does not need to do anything special.
const { error } = await stripe.confirmPayment({
  elements,
  confirmParams: {
    return_url: `${window.location.origin}/checkout/success`
  }
});

// If the customer cancels 3D Secure or their bank rejects it,
// the error will be a card_error with a descriptive message.
```

For Payment Intents that require action after creation (server-side confirmation), check the status:

```typescript
// After creating the PaymentIntent on the server
if (paymentIntent.status === 'requires_action') {
  // Pass the client_secret to the client and let them handle it
  return { clientSecret: paymentIntent.client_secret, requiresAction: true };
}
```

## Test Cards

Stripe provides test card numbers for every scenario:

```
Successful payment:     4242 4242 4242 4242
Declined:               4000 0000 0000 0002
Requires authentication: 4000 0025 0000 3155
Insufficient funds:     4000 0000 0000 9995
Processing error:       4000 0000 0000 0119
Expired card:           4000 0000 0000 0069

Any future expiry date works (e.g., 12/34)
Any 3-digit CVC works (e.g., 123)
Any 5-digit ZIP works (e.g., 12345)
```

Always test the error flows, not just the happy path. A checkout that handles failures gracefully is more important than one that handles success.

## Complete Checkout Flow Architecture

Here is how all the pieces fit together:

```
Customer clicks "Checkout"
    |
    v
Server creates Payment Intent or Checkout Session
    |
    v
Client renders payment form (Elements) or redirects (Checkout)
    |
    v
Customer enters payment details
    |
    v
stripe.confirmPayment() or Stripe Checkout handles payment
    |
    +--> Success: Customer redirected to success page
    |              Webhook fires: checkout.session.completed
    |              Server creates order, clears cart, sends email
    |
    +--> Failure: Error displayed in payment form
    |              Customer corrects and retries
    |
    +--> 3D Secure: Stripe shows authentication modal
                    After auth: success or failure flow above
```

## Try It

1. Build a complete checkout page using Stripe Elements. Create the Payment Intent in a server load function, mount the PaymentElement with custom appearance variables that match your site's design, handle form submission with proper error messages for declined cards and validation errors, and create a success page that verifies the payment status.

2. Implement the Stripe Checkout (redirect) flow for a product listing page. Create Checkout Sessions with `price_data` for dynamic products (not pre-configured Stripe prices). Include shipping address collection and allow promotion codes.

3. Set up a webhook endpoint that handles `checkout.session.completed`. Include signature verification, idempotency checks, and order creation. Test it locally with the Stripe CLI.

4. Test with all the error cards: declined, insufficient funds, expired, and 3D Secure required. Verify that each error produces a clear, user-friendly message.

## Key Takeaways

- Stripe Checkout (redirect) is the fastest path to accepting payments -- Stripe handles the entire UI and compliance
- Stripe Elements (custom form) gives you full design control while keeping card data secure in Stripe-hosted iframes
- Create Payment Intents (for Elements) or Checkout Sessions (for Checkout) on the server -- never trust client-side amounts
- The `client_secret` lets the client confirm the payment without exposing your secret key
- Webhooks are the only reliable way to know a payment succeeded -- the success page redirect can fail
- Always verify webhook signatures with `constructEvent` to prevent spoofed events
- Make webhook handlers idempotent -- check if you have already processed the event before taking action
- Use `request.text()` (not `request.json()`) in webhook endpoints to preserve the raw body for signature verification
- `automatic_payment_methods: { enabled: true }` handles 3D Secure, regional payment methods, and wallets automatically
- Test every failure mode (declined, expired, insufficient funds, 3D Secure) -- error handling is more important than happy path
- The Stripe CLI's `stripe listen --forward-to` command lets you test webhooks locally during development
