# Stripe Concepts

Accepting payments on the web is one of those problems that sounds simple until you realize what it actually involves: PCI compliance audits, fraud detection systems, handling chargebacks, supporting dozens of payment methods across different countries, dealing with currency conversion, tax calculation, 3D Secure authentication, and regulations that vary by jurisdiction. Building any of this yourself would be a multi-year, multi-team effort — and a single security mistake could expose you to catastrophic liability.

**Stripe** exists so you never have to think about any of that. It is a payment infrastructure company that sits between your application and the global financial system. You call their API, they move money. Your server never touches a credit card number. Stripe handles PCI compliance, fraud detection (via Radar), international payment methods, and regulatory compliance in 46+ countries.

Before writing code, you need to understand how Stripe's payment architecture works, how its core objects relate to each other, and why the flow is designed the way it is.

## The Security Architecture: Why Your Server Talks to Stripe, Never the Client

The single most important rule in payment processing: **sensitive payment data never touches your server.** This is not just good practice — it determines your PCI compliance burden.

PCI DSS (Payment Card Industry Data Security Standard) has four compliance levels. If card data flows through your server, you need SAQ D compliance — a 300+ question audit that costs tens of thousands of dollars annually. If card data goes directly from the browser to Stripe (which is how you should always set it up), you only need SAQ A — a simple self-assessment questionnaire.

This is why Stripe uses two different API keys with very different trust levels:

```
Publishable Key (pk_test_...)
├── Safe to expose in browser JavaScript
├── Can only create tokens and confirm payments
├── Cannot read customer data or issue refunds
└── Think of it as a "read-only" key for payment forms

Secret Key (sk_test_...)
├── Must NEVER leave your server
├── Full access: create charges, issue refunds, manage customers
├── Can read all payment data and modify subscriptions
└── Treat it like a database password
```

In SvelteKit, this maps perfectly to the environment variable system:

```typescript
// Client-side (safe to expose in the browser)
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

// Server-side only (SvelteKit will throw a build error
// if you try to import this in a client-side file)
import { STRIPE_SECRET_KEY } from '$env/static/private';
```

SvelteKit enforces this boundary at build time. If you accidentally import from `$env/static/private` in a `.svelte` component, the build fails. This is a genuine safety net — other frameworks rely on naming conventions (like `NEXT_PUBLIC_`), but SvelteKit makes it a hard compile-time error.

```bash
# .env
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

## The Real Architecture: Who Talks to Whom

Understanding the data flow prevents an entire class of mistakes:

```
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│  Browser  │──────▶│ Your Server  │──────▶│  Stripe API  │
│ (Client)  │◀──────│  (SvelteKit) │◀──────│              │
└──────────┘       └──────────────┘       └──────────────┘
     │                     ▲                      │
     │                     │                      │
     │   Card details go   │   Webhook events     │
     │   directly to       │   (POST requests     │
     │   Stripe via        │   from Stripe to     │
     │   Stripe.js         │   your server)       │
     │                     │                      │
     └─────────────────────┼──────────────────────┘
       (Stripe.js /        │
        Stripe Elements)   │
                    ┌──────┴───────┐
                    │   Webhook    │
                    │   Endpoint   │
                    │ /api/webhook │
                    └──────────────┘
```

Three distinct communication paths:

1. **Browser to Stripe** (via Stripe.js): card details go directly to Stripe, never through your server
2. **Your Server to Stripe API**: creating Payment Intents, managing customers, querying subscriptions — all authenticated with your secret key
3. **Stripe to Your Webhook Endpoint**: Stripe pushes event notifications to your server asynchronously

## Core Stripe Objects

Stripe's data model is built around a handful of objects that compose together. Understanding them saves you from the "which API do I call?" confusion:

### Products and Prices

A **Product** is what you sell. A **Price** is how much it costs. They are separate because one product can have multiple prices (monthly vs. annual, different currencies, different tiers).

```typescript
// This runs on your server
import Stripe from 'stripe';
const stripe = new Stripe(STRIPE_SECRET_KEY);

// Create a product (usually done once in the dashboard)
const product = await stripe.products.create({
  name: 'SvelteKit Pro Course',
  description: 'Complete guide to building production SvelteKit apps'
});

// Attach a one-time price
const oneTimePrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 4900,   // $49.00 — always in smallest currency unit
  currency: 'usd'
});

// Attach a recurring price for a subscription model
const monthlyPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 1200,   // $12.00/month
  currency: 'usd',
  recurring: { interval: 'month' }
});
```

**Important:** Amounts are always in the smallest currency unit. USD uses cents, so `4900` = $49.00. JPY has no sub-unit, so `4900` = 4900 yen. This catches people off guard — double-check the [Stripe currency docs](https://stripe.com/docs/currencies) for zero-decimal currencies.

### Customers

A **Customer** ties together a person's payment methods, subscriptions, and payment history. You do not strictly need one for a single payment, but creating customers lets Stripe remember payment methods for future purchases.

```typescript
const customer = await stripe.customers.create({
  email: 'student@example.com',
  name: 'Alex Johnson',
  metadata: {
    userId: 'user_abc123'   // Link to your internal user ID
  }
});
```

The `metadata` field is your escape hatch. It is a key-value store (string keys and values) that Stripe carries through the entire payment lifecycle. Use it to link Stripe objects back to your own database records.

### Payment Intents

A **PaymentIntent** represents a single payment attempt. It is the core object for one-time payments and tracks the payment through its lifecycle:

```
Created → Requires Payment Method → Requires Confirmation → Processing → Succeeded
                                                                      ↘ Failed
```

You create a PaymentIntent on your server with the amount and currency, then the client confirms it with the customer's card details. This two-step process ensures your server controls the amount charged — the client can never modify it.

```typescript
// Server: create the PaymentIntent
const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,        // $20.00
  currency: 'usd',
  customer: customer.id,
  metadata: {
    productId: 'course-123',
    userId: 'user_abc123'
  }
});

// Send the client_secret to the browser
// The client_secret lets the browser confirm the payment
// but NOT modify the amount or read sensitive data
return { clientSecret: paymentIntent.client_secret };
```

### Checkout Sessions

While PaymentIntents give you full control, **Checkout Sessions** are the fast path. Stripe hosts the entire payment page for you — a polished, localized, mobile-optimized form that handles dozens of payment methods automatically.

```typescript
// Server: create a Checkout Session
const session = await stripe.checkout.sessions.create({
  mode: 'payment',    // or 'subscription' for recurring
  customer: customer.id,
  line_items: [
    {
      price: oneTimePrice.id,
      quantity: 1
    }
  ],
  success_url: 'https://yoursite.com/success?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://yoursite.com/cancel'
});

// Redirect the customer to Stripe's hosted page
return { url: session.url };
```

The flow looks like this:

```
1. Customer clicks "Buy" on your site
2. Your server creates a Checkout Session
3. Customer is redirected to checkout.stripe.com
4. Customer enters card details on Stripe's page
5. Stripe processes the payment
6. Customer is redirected back to your success_url
7. Your webhook receives the payment confirmation
```

### Subscriptions

A **Subscription** ties a Customer to a recurring Price. Stripe automatically charges the customer on each billing cycle and handles failed payments, retries, and grace periods.

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: monthlyPrice.id }],
  payment_behavior: 'default_incomplete',
  expand: ['latest_invoice.payment_intent']
});
```

## The Checkout Flow: Hosted vs. Embedded

You have two main approaches to collecting payments, each with different tradeoffs:

**Hosted Checkout** (redirect to Stripe): fastest to implement, highest conversion rates (Stripe A/B tests their form constantly), supports the most payment methods. The downside: the customer leaves your site.

**Embedded Checkout** (Stripe Elements on your page): the payment form lives on your site using Stripe Elements — prebuilt UI components that securely collect card details. You get full design control, but you handle more of the UX and support fewer payment methods by default.

```svelte
<!-- Embedded payment form using Stripe Elements -->
<script lang="ts">
  import { loadStripe } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
  import { onMount } from 'svelte';

  let cardElement: any;
  let stripe: any;
  let elements: any;

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
    elements = stripe.elements();
    cardElement = elements.create('card');
    cardElement.mount('#card-element');
  });

  async function handleSubmit() {
    // Fetch clientSecret from your server
    const res = await fetch('/api/create-payment-intent', { method: 'POST' });
    const { clientSecret } = await res.json();

    const { error, paymentIntent } = await stripe.confirmCardPayment(
      clientSecret,
      { payment_method: { card: cardElement } }
    );

    if (error) {
      console.error(error.message);
    } else if (paymentIntent.status === 'succeeded') {
      window.location.href = '/success';
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <div id="card-element"></div>
  <button type="submit">Pay $49.00</button>
</form>
```

For most projects, start with Hosted Checkout. Move to Stripe Elements when you have a specific design requirement that justifies the extra complexity.

## Webhooks: The Critical Piece Most Tutorials Skip

Here is a scenario that will cost you money if you do not handle it: a customer completes payment on Stripe's checkout page, but instead of waiting for the redirect back to your site, they close their browser tab. Your success page never loads. Your server never learns the payment succeeded. The customer paid, but never got the product.

**Webhooks solve this.** A webhook is a POST request that Stripe sends to an endpoint on your server whenever something happens — payment succeeded, subscription cancelled, invoice paid, dispute created. Unlike the redirect flow, webhooks are reliable: Stripe retries failed deliveries with exponential backoff for up to 72 hours.

```typescript
// src/routes/api/webhook/+server.ts
import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function POST({ request }) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    // CRITICAL: Verify the webhook came from Stripe, not an attacker
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      // Grant access to the product
      await grantAccess(session.customer, session.metadata.productId);
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      // Revoke access when subscription ends
      await revokeAccess(subscription.customer);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      // Notify the customer their payment failed
      await notifyPaymentFailed(invoice.customer);
      break;
    }
  }

  // Always return 200 to acknowledge receipt
  return json({ received: true });
}
```

**Why signature verification matters:** without it, anyone could POST to your webhook endpoint and fake a "payment succeeded" event to get free access. The `STRIPE_WEBHOOK_SECRET` (found in your Stripe Dashboard under Webhooks) lets you cryptographically verify that the request actually came from Stripe.

## Idempotency: Webhooks Can Fire More Than Once

Stripe guarantees **at-least-once delivery** of webhook events — meaning the same event might be delivered two, three, or more times. Network issues, timeouts, or Stripe retries can all cause duplicates. If your handler grants access to a course, running it twice should not grant access twice or charge the customer again.

Your webhook handler must be **idempotent**: safe to run multiple times with the same input.

```typescript
async function grantAccess(customerId: string, productId: string) {
  // Use the Stripe event ID or checkout session ID as an idempotency key
  const existing = await db.enrollment.findUnique({
    where: {
      customerId_productId: { customerId, productId }
    }
  });

  // If already granted, do nothing (idempotent!)
  if (existing) return;

  await db.enrollment.create({
    data: { customerId, productId, enrolledAt: new Date() }
  });
}
```

The pattern is simple: check if the action was already performed before performing it. Use unique constraints in your database as a safety net — if a duplicate insert hits a unique constraint violation, catch it and move on.

## Test Mode: Develop Safely

Stripe provides a complete test environment that mirrors production. Test mode uses different API keys (prefixed with `pk_test_` and `sk_test_`) and processes no real money. Always develop and test against test mode.

Stripe provides test card numbers that simulate different scenarios:

```
Successful payment:      4242 4242 4242 4242
Card declined:           4000 0000 0000 0002
Insufficient funds:      4000 0000 0000 9995
Requires 3D Secure:      4000 0025 0000 3155
Expired card:            4000 0000 0000 0069
Processing error:        4000 0000 0000 0119
```

For all test cards, use any future expiry date (e.g., 12/34) and any 3-digit CVC (e.g., 123).

For testing webhooks locally, use the **Stripe CLI**:

```bash
# Install the Stripe CLI, then:
stripe listen --forward-to localhost:5173/api/webhook

# This gives you a webhook signing secret for local development:
# whsec_... (use this as STRIPE_WEBHOOK_SECRET in your .env)
```

The Stripe CLI forwards webhook events from Stripe's test environment to your local SvelteKit dev server. You can also trigger test events manually:

```bash
stripe trigger checkout.session.completed
stripe trigger customer.subscription.deleted
```

## The Stripe Dashboard

The Stripe Dashboard at dashboard.stripe.com is your control center. Spend time exploring it — it shows:

- **Payments** — every transaction, successful or failed, with full event logs
- **Customers** — saved customer profiles and their payment history
- **Products** — items or plans you sell, with their associated prices
- **Subscriptions** — active, past-due, and cancelled subscriptions
- **Webhooks** — event deliveries with status, payload, and retry history
- **Developers** — API keys, request logs, event logs, and webhook endpoints

The event logs under Developers are especially useful for debugging. Every API call and webhook delivery is logged with the full request and response. When something goes wrong, start there.

## Try It

1. **Set up Stripe**: Create a Stripe account at stripe.com. Find your test API keys under Developers > API Keys. Store them in your `.env` file.

2. **Create a PaymentIntent**: Install the Stripe SDK with `npm install stripe`. Write a server-side script that creates a PaymentIntent for $49.00 USD and logs the `client_secret` to the console.

3. **Explore the Dashboard**: After creating the PaymentIntent, find it in your Stripe Dashboard under Payments. Click into it and examine the event timeline — notice how Stripe tracks every state change.

4. **Set up local webhooks**: Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), run `stripe listen --forward-to localhost:5173/api/webhook`, and trigger a test event with `stripe trigger checkout.session.completed`. Create a basic webhook endpoint in SvelteKit that logs the event type.

5. **Test idempotency**: Trigger the same webhook event twice and verify your handler produces the same result both times without duplicating data.

## Key Takeaways

- Stripe handles PCI compliance, fraud detection, and international regulations — so your server never touches raw card numbers
- The publishable key is safe for the browser; the secret key must never leave your server — SvelteKit enforces this at build time
- Core objects (Products, Prices, Customers, PaymentIntents, Checkout Sessions, Subscriptions) compose together to model any payment flow
- Hosted Checkout is the fastest path: redirect to Stripe's page, get a polished payment form with no frontend work
- Webhooks are non-negotiable: they are the only reliable way to know a payment succeeded (the redirect back can fail)
- Webhook handlers must be idempotent because Stripe guarantees at-least-once delivery, not exactly-once
- Always develop in test mode with test card numbers, and use the Stripe CLI for local webhook testing
- Use `metadata` to link Stripe objects back to your own database records
