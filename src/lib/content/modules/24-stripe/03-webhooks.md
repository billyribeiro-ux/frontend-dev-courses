# Webhooks

The checkout flow handles the happy path, but what if the customer closes the browser before reaching the success page? What about payments that take hours to process (like bank transfers)? **Webhooks** solve this — Stripe sends HTTP requests to your server whenever important events happen, so you can react reliably.

Webhooks are the source of truth for payment status. Never grant access to products based solely on the client-side redirect.

## How Webhooks Work

```
1. A payment succeeds on Stripe
2. Stripe sends a POST request to your webhook endpoint
3. Your server verifies the request is really from Stripe
4. Your server processes the event (e.g., grants course access)
5. Your server responds with 200 OK
```

If your server does not respond with 200, Stripe retries the webhook up to 3 days with exponential backoff.

## Creating a Webhook Endpoint

In SvelteKit, webhooks are server routes that handle POST requests:

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';
import { json } from '@sveltejs/kit';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'No signature' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
      break;
    case 'payment_intent.payment_failed':
      await handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
      break;
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return json({ received: true });
};
```

## Signature Verification

The most critical part of a webhook endpoint is **signature verification**. Without it, anyone could send fake payment events to your server.

Stripe signs every webhook with a secret. You verify the signature using `stripe.webhooks.constructEvent()`:

```typescript
// The webhook secret comes from the Stripe Dashboard or CLI
// Store it in .env
// STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

If the signature does not match, the event was not sent by Stripe — reject it immediately.

## Handling Payment Events

Process successful payments by granting access:

```typescript
import { eq } from 'drizzle-orm';
import db from '$lib/server/db';
import { purchases, users } from '$lib/server/db/schema';

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { productId, userId } = paymentIntent.metadata;

  if (!productId || !userId) {
    console.error('Missing metadata on payment intent');
    return;
  }

  // Check if already processed (idempotency)
  const existing = await db
    .select()
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntent.id))
    .limit(1);

  if (existing.length > 0) {
    console.log('Payment already processed');
    return;
  }

  // Grant access
  await db.insert(purchases).values({
    userId: Number(userId),
    productId,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    createdAt: new Date().toISOString()
  });

  console.log(`Access granted: user ${userId} purchased ${productId}`);
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed for intent: ${paymentIntent.id}`);
  // Optionally notify the user via email
}
```

## Idempotency

Stripe may send the same webhook event more than once. Your handler must be **idempotent** — processing the same event twice should not create duplicate records or charge the user twice.

The pattern above checks for an existing purchase with the same `paymentIntentId` before inserting. If found, it skips processing.

## Testing Webhooks Locally

Use the Stripe CLI to forward webhook events to your local server:

```bash
# Install the Stripe CLI, then:
stripe listen --forward-to localhost:5173/api/webhooks/stripe
```

The CLI prints a webhook signing secret (`whsec_...`). Use this as your `STRIPE_WEBHOOK_SECRET` during development.

Trigger test events:

```bash
stripe trigger payment_intent.succeeded
```

## Setting Up Webhooks in Production

In the Stripe Dashboard:

1. Go to **Developers** > **Webhooks**
2. Click **Add endpoint**
3. Enter your URL: `https://yoursite.com/api/webhooks/stripe`
4. Select events to listen to: `payment_intent.succeeded`, `payment_intent.payment_failed`
5. Copy the signing secret and add it to your production environment variables

## Passing Metadata

Include metadata when creating Payment Intents so your webhook knows what was purchased:

```typescript
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4999,
  currency: 'usd',
  metadata: {
    userId: String(user.id),
    productId: 'svelte-bootcamp',
    productName: 'Svelte 5 Bootcamp'
  }
});
```

Metadata is included in webhook events, connecting the payment to the user and product.

## Try It

Set up a webhook endpoint at `/api/webhooks/stripe`. Install the Stripe CLI and run `stripe listen` to forward events locally. Create a `purchases` table in your database. When a `payment_intent.succeeded` event arrives, verify the signature, check for duplicates, and insert a purchase record. Test with `stripe trigger payment_intent.succeeded` and verify the record appears in your database.

## Key Takeaways

- Webhooks are the reliable way to handle payment events — never rely solely on client redirects
- Always verify webhook signatures with `stripe.webhooks.constructEvent()` to prevent fraud
- Handle `payment_intent.succeeded` to grant access and `payment_intent.payment_failed` for failures
- Make handlers idempotent by checking for existing records before processing
- Use the Stripe CLI (`stripe listen`) to test webhooks during local development
- Pass metadata on Payment Intents to connect payments to users and products
