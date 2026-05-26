# Webhooks

The checkout flow handles the happy path, but what if the customer closes the browser before reaching the success page? What about payments that take hours to process (like bank transfers in Europe)? What if the network drops between Stripe confirming the payment and your server recording it? **Webhooks** solve all of this — Stripe sends HTTP requests to your server whenever important events happen, so you can react reliably regardless of what the customer's browser does.

Webhooks are the source of truth for payment status. Never grant access to products based solely on the client-side redirect. The redirect is a convenience for the user experience. The webhook is where business logic executes.

The mental model: think of your checkout flow as two parallel tracks. Track one is the user's browser — they click "Pay," see a spinner, get redirected to a success page. Track two is the webhook — Stripe tells your server the payment succeeded, and your server grants access, sends a receipt, updates inventory. Track two is the one that matters. Track one just makes the user feel good.

## How Webhooks Work

```
1. Customer completes payment on your site (or via Stripe-hosted checkout)
2. Stripe processes the payment with the card network / bank
3. The payment succeeds (or fails, or gets disputed)
4. Stripe sends a POST request to your webhook endpoint
5. Your server verifies the signature to confirm it is really from Stripe
6. Your server processes the event (grant access, send email, update database)
7. Your server responds with 200 OK
8. If your server does not respond with 2xx, Stripe retries with exponential backoff
```

Stripe retries failed webhooks for up to 3 days. The retry schedule is roughly: immediately, then 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, and then every 6 hours up to 3 days. This means your endpoint must be idempotent — processing the same event twice must not create duplicate records or charge the user twice.

## Why Client-Side Redirects Are Unreliable

Consider these failure scenarios that only webhooks handle correctly:

1. **Browser closed:** The customer pays, then immediately closes the tab. Your success page never loads. Without a webhook, you never know the payment succeeded.
2. **Network interruption:** The payment processes but the redirect to your success page fails due to network issues. The customer thinks they were not charged.
3. **Bank transfers/SEPA:** European payment methods like SEPA direct debit, Bancontact, or iDEAL can take days to settle. The customer leaves your site long before the payment confirms.
4. **3D Secure timeout:** Strong Customer Authentication (SCA) opens a bank popup. The customer's bank takes 30 seconds to respond. By the time the popup closes, the session may have expired.
5. **Race conditions:** Your success page tries to check payment status, but the `payment_intent.succeeded` event has not fired yet. The user sees "payment pending" even though the card was already charged.

Webhooks solve all of these because Stripe retries until your server acknowledges the event.

## Creating a Webhook Endpoint

In SvelteKit, webhooks are server routes that handle POST requests. There are several critical requirements:

1. Read the raw body as text (not JSON) — `constructEvent` needs the raw string to verify the signature
2. Verify the signature before processing any event data
3. Return 200 quickly — do heavy work asynchronously if needed
4. Handle events idempotently

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';
import { json, error } from '@sveltejs/kit';
import { handleCheckoutCompleted } from '$lib/server/webhook-handlers';
import { handlePaymentSucceeded } from '$lib/server/webhook-handlers';
import { handlePaymentFailed } from '$lib/server/webhook-handlers';
import { handleChargeRefunded } from '$lib/server/webhook-handlers';
import { handleDisputeCreated } from '$lib/server/webhook-handlers';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const POST: RequestHandler = async ({ request }) => {
  // 1. Read the raw body as text — NOT as JSON
  // Stripe signature verification requires the exact raw bytes
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    console.error('Webhook received without stripe-signature header');
    return json({ error: 'Missing signature' }, { status: 400 });
  }

  // 2. Verify the signature
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Webhook signature verification failed: ${message}`);
    // Return 400 — Stripe will NOT retry 400 responses
    // (retrying a bad signature would be pointless)
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // 3. Log the event for debugging
  console.log(`Webhook received: ${event.type} (${event.id})`);

  // 4. Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      case 'charge.dispute.created':
        await handleDisputeCreated(event.data.object as Stripe.Dispute);
        break;

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Handle subscription lifecycle if applicable
        console.log(`Subscription event: ${event.type}`);
        break;

      default:
        // Log unhandled event types — you may need to add handlers later
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Return 500 — Stripe WILL retry 500 responses
    // This ensures failed processing is retried later
    return json({ error: 'Handler failed' }, { status: 500 });
  }

  // 5. Return 200 quickly
  return json({ received: true });
};
```

**Critical detail on response codes:**
- **200-299:** Stripe considers the webhook delivered. It will not retry.
- **400-499:** Stripe considers the request invalid. It will NOT retry (except 408/429).
- **500-599, timeouts, connection errors:** Stripe will retry with exponential backoff.

This means: return 400 for signature failures (retrying would not help), and return 500 for processing errors (retrying might work if the issue was transient).

## Signature Verification Deep Dive

Signature verification prevents anyone from sending fake payment events to your server. Without it, an attacker could send a POST to `/api/webhooks/stripe` with a fabricated `payment_intent.succeeded` event and grant themselves free access.

The signature uses HMAC-SHA256. Stripe signs the payload with your webhook secret and includes the signature in the `Stripe-Signature` header. The header looks like:

```
Stripe-Signature: t=1614556828,v1=abc123...,v0=def456...
```

- `t` is the timestamp (prevents replay attacks)
- `v1` is the HMAC-SHA256 signature
- `v0` is a legacy signature format (ignored)

`stripe.webhooks.constructEvent()` verifies the `v1` signature and checks that the timestamp is within 5 minutes (preventing replay attacks where someone captures a valid webhook and sends it again later).

```typescript
// How constructEvent works internally (simplified):
// 1. Compute HMAC-SHA256 of `${timestamp}.${rawBody}` using your webhook secret
// 2. Compare the computed signature to the v1 value in the header
// 3. Verify the timestamp is within the tolerance window (default 300 seconds)
// 4. If all checks pass, parse the body as JSON and return the typed event

// Your webhook secret comes from:
// - Stripe CLI (for local testing): printed when you run `stripe listen`
// - Stripe Dashboard (for production): Developers > Webhooks > endpoint > Signing secret
```

**Common mistakes that break signature verification:**

1. **Parsing the body as JSON first.** If you call `request.json()` before `request.text()`, the raw body stream is consumed. `constructEvent` needs the exact raw string, byte-for-byte.
2. **Middleware that modifies the body.** Express body parsers, API gateway transforms, or proxy servers that re-encode the body will change the bytes and break the signature.
3. **Using the wrong webhook secret.** The CLI generates a different secret than the dashboard. Use the CLI secret for local dev and the dashboard secret for production.

## Handling Payment Events: Fulfillment Logic

Process successful payments by granting access. This is where your business logic lives:

```typescript
// src/lib/server/webhook-handlers.ts
import type Stripe from 'stripe';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { purchases, users, products } from '$lib/server/db/schema';
import { sendReceiptEmail } from '$lib/server/email';

export async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // For Checkout Sessions, metadata is on the session, not the payment intent
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;

  if (!userId || !productId || !paymentIntentId) {
    console.error('Missing metadata on checkout session:', {
      sessionId: session.id,
      userId,
      productId,
      paymentIntentId
    });
    // Do not throw — this is a data issue, retrying will not help
    return;
  }

  // Idempotency check — has this payment already been processed?
  const existing = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntentId))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Payment ${paymentIntentId} already processed — skipping`);
    return;
  }

  // Grant access
  await db.insert(purchases).values({
    userId: Number(userId),
    productId,
    paymentIntentId,
    amount: session.amount_total ?? 0,
    currency: session.currency ?? 'usd',
    status: 'completed',
    createdAt: new Date().toISOString()
  });

  console.log(`Access granted: user ${userId} purchased ${productId}`);

  // Send receipt email (do not let email failure block the webhook)
  try {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, Number(userId)))
      .limit(1);

    const product = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    if (user[0] && product[0]) {
      await sendReceiptEmail({
        to: user[0].email,
        productName: product[0].name,
        amount: (session.amount_total ?? 0) / 100,
        currency: session.currency ?? 'usd'
      });
    }
  } catch (emailErr) {
    // Log but do not throw — the purchase is already recorded
    console.error('Failed to send receipt email:', emailErr);
  }
}

export async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { productId, userId } = paymentIntent.metadata;

  if (!productId || !userId) {
    console.error('Missing metadata on payment intent:', paymentIntent.id);
    return;
  }

  // Idempotency check
  const existing = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(eq(purchases.paymentIntentId, paymentIntent.id))
    .limit(1);

  if (existing.length > 0) {
    console.log(`Payment ${paymentIntent.id} already processed`);
    return;
  }

  await db.insert(purchases).values({
    userId: Number(userId),
    productId,
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    status: 'completed',
    createdAt: new Date().toISOString()
  });

  console.log(`Access granted: user ${userId} purchased ${productId}`);
}

export async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const { userId, productId } = paymentIntent.metadata;

  console.log(`Payment failed: intent ${paymentIntent.id}`, {
    userId,
    productId,
    lastError: paymentIntent.last_payment_error?.message
  });

  // Optionally: send the user an email with a link to retry payment
  // Optionally: update a "payment_attempts" table for analytics
}

export async function handleChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id;

  if (!paymentIntentId) {
    console.error('Refund for charge without payment_intent:', charge.id);
    return;
  }

  // Revoke access
  const result = await db
    .update(purchases)
    .set({ status: 'refunded', refundedAt: new Date().toISOString() })
    .where(eq(purchases.paymentIntentId, paymentIntentId));

  console.log(`Access revoked for payment ${paymentIntentId} — refund processed`);

  // If this is a partial refund, you might want to keep access
  // Check charge.amount_refunded vs charge.amount
  if (charge.amount_refunded < charge.amount) {
    console.log('Partial refund — consider keeping access');
  }
}

export async function handleDisputeCreated(dispute: Stripe.Dispute) {
  const paymentIntentId = typeof dispute.payment_intent === 'string'
    ? dispute.payment_intent
    : dispute.payment_intent?.id;

  console.error('DISPUTE CREATED:', {
    disputeId: dispute.id,
    paymentIntentId,
    amount: dispute.amount,
    reason: dispute.reason,
    // You have 7 days to respond with evidence
    evidenceDueBy: dispute.evidence_details?.due_by
      ? new Date((dispute.evidence_details.due_by as number) * 1000).toISOString()
      : 'unknown'
  });

  // Immediately revoke access — disputes are serious
  if (paymentIntentId) {
    await db
      .update(purchases)
      .set({ status: 'disputed', disputedAt: new Date().toISOString() })
      .where(eq(purchases.paymentIntentId, paymentIntentId));
  }

  // Alert your team — disputes require manual action within 7 days
  // Send Slack notification, email, PagerDuty, etc.
}
```

## Idempotency in Depth

Stripe may send the same webhook event more than once. This happens when:
- Your server returned a 500 error and Stripe retried
- A network timeout occurred and Stripe assumed delivery failed
- Stripe's internal systems duplicated the delivery

Your handler must be **idempotent** — processing the same event twice should produce the same result as processing it once. Here are three strategies:

### Strategy 1: Check for existing records (simplest)

```typescript
// Before inserting, check if the paymentIntentId already exists
const existing = await db
  .select({ id: purchases.id })
  .from(purchases)
  .where(eq(purchases.paymentIntentId, paymentIntent.id))
  .limit(1);

if (existing.length > 0) return; // Already processed
```

### Strategy 2: Event ID tracking (most robust)

```typescript
// Track which event IDs have been processed
// This handles ALL event types, not just purchases

// Create a processed_events table:
// id: text PRIMARY KEY (the Stripe event ID)
// processed_at: timestamp

async function isEventProcessed(eventId: string): Promise<boolean> {
  const existing = await db
    .select({ id: processedEvents.id })
    .from(processedEvents)
    .where(eq(processedEvents.id, eventId))
    .limit(1);
  return existing.length > 0;
}

async function markEventProcessed(eventId: string): Promise<void> {
  await db.insert(processedEvents).values({
    id: eventId,
    processedAt: new Date().toISOString()
  }).onConflictDoNothing(); // Handle race conditions
}

// In your webhook handler:
export const POST: RequestHandler = async ({ request }) => {
  // ... signature verification ...

  if (await isEventProcessed(event.id)) {
    console.log(`Event ${event.id} already processed — skipping`);
    return json({ received: true });
  }

  // ... handle the event ...

  await markEventProcessed(event.id);
  return json({ received: true });
};
```

### Strategy 3: Database constraints (defense in depth)

```sql
-- Add a unique constraint on paymentIntentId
ALTER TABLE purchases ADD CONSTRAINT unique_payment_intent
  UNIQUE (payment_intent_id);
```

```typescript
// The database rejects duplicate inserts
try {
  await db.insert(purchases).values({ ... });
} catch (err) {
  if (err.code === '23505') { // PostgreSQL unique violation
    console.log('Duplicate payment — already processed');
    return;
  }
  throw err; // Re-throw unexpected errors
}
```

In production, use all three strategies together for defense in depth.

## Retry Behavior and Error Handling

Understanding Stripe's retry behavior helps you write resilient handlers:

```typescript
// Stripe's retry schedule (approximate):
// Attempt 1: Immediately
// Attempt 2: ~5 minutes later
// Attempt 3: ~30 minutes later
// Attempt 4: ~2 hours later
// Attempt 5: ~5 hours later
// Attempt 6: ~10 hours later
// Attempt 7+: Every ~6 hours for up to 3 days

// Your handler should:
// 1. Return 200 quickly for successfully processed events
// 2. Return 200 for duplicate events (already processed)
// 3. Return 500 for transient errors (database temporarily down, etc.)
//    Stripe will retry and the error may resolve
// 4. Return 400 for permanent errors (bad signature, missing data)
//    Stripe will NOT retry — there is no point

// Practical example with error classification:
export const POST: RequestHandler = async ({ request }) => {
  // ... signature verification (returns 400 on failure) ...

  try {
    await processEvent(event);
    return json({ received: true }); // 200
  } catch (err) {
    if (err instanceof PermanentError) {
      // Missing metadata, invalid data — retrying will not help
      console.error(`Permanent error for ${event.type}: ${err.message}`);
      return json({ error: err.message }, { status: 400 });
    }

    // Transient errors (database, network) — Stripe should retry
    console.error(`Transient error for ${event.type}:`, err);
    return json({ error: 'Internal error' }, { status: 500 });
  }
};

class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}
```

## Error Handling and Logging

Production webhook handlers need structured logging for debugging payment issues:

```typescript
// src/lib/server/webhook-logger.ts

type WebhookLog = {
  eventId: string;
  eventType: string;
  timestamp: string;
  status: 'received' | 'processed' | 'skipped' | 'failed';
  metadata?: Record<string, string>;
  error?: string;
  durationMs?: number;
};

export function logWebhookEvent(log: WebhookLog) {
  // Structured JSON logging — your log aggregator (Datadog, etc.) can parse this
  console.log(JSON.stringify({
    level: log.status === 'failed' ? 'error' : 'info',
    service: 'stripe-webhooks',
    ...log
  }));
}

// Usage in your webhook handler:
const startTime = Date.now();

try {
  await processEvent(event);

  logWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    timestamp: new Date().toISOString(),
    status: 'processed',
    durationMs: Date.now() - startTime,
    metadata: (event.data.object as any).metadata
  });
} catch (err) {
  logWebhookEvent({
    eventId: event.id,
    eventType: event.type,
    timestamp: new Date().toISOString(),
    status: 'failed',
    durationMs: Date.now() - startTime,
    error: err instanceof Error ? err.message : String(err)
  });
  throw err; // Re-throw so the endpoint returns 500
}
```

## Testing Webhooks Locally

Use the Stripe CLI to forward webhook events to your local development server:

```bash
# Install the Stripe CLI
# macOS: brew install stripe/stripe-cli/stripe
# Linux: see https://stripe.com/docs/stripe-cli

# Log in to your Stripe account
stripe login

# Forward events to your local server
stripe listen --forward-to localhost:5173/api/webhooks/stripe
```

The CLI prints a webhook signing secret (`whsec_...`). Use this as your `STRIPE_WEBHOOK_SECRET` in your `.env` file during development. This secret is different from your production webhook secret.

Trigger test events to verify your handler:

```bash
# Trigger a single event
stripe trigger payment_intent.succeeded

# Trigger with specific data
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.userId=42 \
  --add checkout_session:metadata.productId=svelte-bootcamp

# Trigger a full payment flow (creates a PaymentIntent, confirms it, etc.)
stripe trigger payment_intent.succeeded --stripe-account acct_xxx

# List all available trigger events
stripe trigger --help
```

### Automated Testing

Write integration tests for your webhook handler:

```typescript
// src/routes/api/webhooks/stripe/webhook.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Stripe from 'stripe';

// Mock the stripe module
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      webhooks: {
        constructEvent: vi.fn()
      }
    }))
  };
});

describe('Stripe Webhook Handler', () => {
  it('returns 400 without a signature', async () => {
    const response = await fetch('/api/webhooks/stripe', {
      method: 'POST',
      body: JSON.stringify({ type: 'payment_intent.succeeded' })
    });
    expect(response.status).toBe(400);
  });

  it('processes payment_intent.succeeded idempotently', async () => {
    // First call should insert a purchase
    const event = createMockEvent('payment_intent.succeeded', {
      id: 'pi_test_123',
      metadata: { userId: '42', productId: 'test-product' },
      amount: 4999
    });

    // Process the same event twice
    await handlePaymentSucceeded(event.data.object);
    await handlePaymentSucceeded(event.data.object);

    // Should only have one purchase record
    const purchases = await db.select().from(purchasesTable)
      .where(eq(purchasesTable.paymentIntentId, 'pi_test_123'));
    expect(purchases).toHaveLength(1);
  });
});
```

## Setting Up Webhooks in Production

In the Stripe Dashboard:

1. Go to **Developers** > **Webhooks**
2. Click **Add endpoint**
3. Enter your production URL: `https://yoursite.com/api/webhooks/stripe`
4. Select the events to listen to:
   - `checkout.session.completed` — customer finished checkout
   - `payment_intent.succeeded` — payment confirmed
   - `payment_intent.payment_failed` — payment failed
   - `charge.refunded` — a refund was issued
   - `charge.dispute.created` — customer filed a dispute (chargeback)
   - `customer.subscription.created` — if you have subscriptions
   - `customer.subscription.updated` — subscription changed
   - `customer.subscription.deleted` — subscription canceled
5. Copy the signing secret and add it to your production environment variables
6. Verify the endpoint is receiving events by clicking "Send test webhook" in the dashboard

**Production checklist for webhooks:**
- Endpoint URL uses HTTPS (Stripe rejects HTTP in production)
- Signing secret is stored in environment variables, not in code
- Endpoint responds within 30 seconds (Stripe times out after 30s)
- Handler is idempotent (safe to process the same event twice)
- Heavy processing is done asynchronously if needed (email sending, etc.)
- Failed events are logged with enough context to debug
- You monitor the webhook delivery success rate in the Stripe dashboard

## Passing Metadata

Include metadata when creating Payment Intents or Checkout Sessions so your webhook knows what was purchased and who purchased it:

```typescript
// When using Payment Intents directly
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4999,
  currency: 'usd',
  metadata: {
    userId: String(user.id),
    productId: 'svelte-bootcamp',
    productName: 'Svelte 5 Bootcamp',  // For human-readable logging
    purchaseType: 'one-time'
  }
});

// When using Checkout Sessions
const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: `${siteUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${siteUrl}/cancel`,
  metadata: {
    userId: String(user.id),
    productId: 'svelte-bootcamp'
  },
  // Also set metadata on the payment intent itself
  payment_intent_data: {
    metadata: {
      userId: String(user.id),
      productId: 'svelte-bootcamp'
    }
  }
});
```

**Important:** Set metadata on BOTH the session and the `payment_intent_data`. The `checkout.session.completed` event carries session metadata, while `payment_intent.succeeded` carries payment intent metadata. If you only set one, the other handler cannot find the user/product information.

Metadata constraints:
- Maximum 50 keys
- Keys: up to 40 characters
- Values: up to 500 characters
- Values must be strings (convert numbers with `String()`)

## Complete Webhook Handler

Here is the complete, production-ready webhook handler with all the patterns combined:

```typescript
// src/routes/api/webhooks/stripe/+server.ts
import type { RequestHandler } from './$types';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import Stripe from 'stripe';
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { purchases, processedEvents } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(STRIPE_SECRET_KEY);

async function isProcessed(eventId: string): Promise<boolean> {
  const rows = await db
    .select({ id: processedEvents.id })
    .from(processedEvents)
    .where(eq(processedEvents.id, eventId))
    .limit(1);
  return rows.length > 0;
}

async function markProcessed(eventId: string): Promise<void> {
  await db.insert(processedEvents)
    .values({ id: eventId, processedAt: new Date().toISOString() })
    .onConflictDoNothing();
}

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Global idempotency check
  if (await isProcessed(event.id)) {
    return json({ received: true, note: 'already processed' });
  }

  const startTime = Date.now();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const productId = session.metadata?.productId;
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent : session.payment_intent?.id;

        if (!userId || !productId || !paymentIntentId) {
          console.error(`Missing metadata on session ${session.id}`);
          break; // Do not throw — retrying will not add metadata
        }

        await db.insert(purchases).values({
          userId: Number(userId),
          productId,
          paymentIntentId,
          amount: session.amount_total ?? 0,
          currency: session.currency ?? 'usd',
          status: 'completed',
          createdAt: new Date().toISOString()
        }).onConflictDoNothing(); // Defense in depth

        console.log(`Purchase recorded: user=${userId} product=${productId}`);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        const piId = typeof charge.payment_intent === 'string'
          ? charge.payment_intent : charge.payment_intent?.id;

        if (piId) {
          await db.update(purchases)
            .set({ status: 'refunded', refundedAt: new Date().toISOString() })
            .where(eq(purchases.paymentIntentId, piId));
          console.log(`Refund processed for payment ${piId}`);
        }
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        console.error(`DISPUTE: ${dispute.id} — reason: ${dispute.reason}`);
        // Alert your team immediately
        break;
      }

      default:
        console.log(`Unhandled: ${event.type}`);
    }

    await markProcessed(event.id);
    const duration = Date.now() - startTime;
    console.log(`Processed ${event.type} in ${duration}ms`);

    return json({ received: true });
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`Failed ${event.type} after ${duration}ms:`, err);
    return json({ error: 'Processing failed' }, { status: 500 });
  }
};
```

## Try It

Set up a complete webhook flow:

1. Create a webhook endpoint at `/api/webhooks/stripe` following the pattern above
2. Create a `processed_events` table in your database with columns `id` (text, primary key) and `processed_at` (timestamp)
3. Install the Stripe CLI and run `stripe listen --forward-to localhost:5173/api/webhooks/stripe`
4. Copy the CLI's webhook secret to your `.env` file
5. Trigger a payment event: `stripe trigger checkout.session.completed`
6. Verify the event appears in your server logs with the correct event type and ID
7. Trigger the same event again and verify your idempotency check prevents duplicate processing
8. Intentionally throw an error in your handler and verify Stripe retries (watch the CLI output)
9. Add handlers for `charge.refunded` and `charge.dispute.created`
10. Write a test that verifies your handler returns 400 without a valid signature

## Key Takeaways

- **Webhooks are the source of truth** for payment status — never rely solely on client-side redirects because the browser can close, the network can drop, and bank transfers take days
- **Always verify webhook signatures** with `stripe.webhooks.constructEvent()` — read the body as raw text (not JSON) to preserve the exact bytes for signature verification
- **Response codes determine retry behavior:** return 200 for success, 400 for permanent errors (no retry), 500 for transient errors (Stripe retries for up to 3 days)
- **Idempotency is mandatory** — Stripe may deliver the same event multiple times. Use event ID tracking, database unique constraints, and existence checks as defense in depth
- **Set metadata on both Checkout Sessions and Payment Intents** so your handlers can identify the user and product regardless of which event type fires first
- **Handle the full payment lifecycle:** `checkout.session.completed` for granting access, `charge.refunded` for revoking access, `charge.dispute.created` for alerting your team
- **Use the Stripe CLI** (`stripe listen`, `stripe trigger`) for local development and automated testing
- **Log structured webhook events** with event ID, type, duration, and metadata for debugging payment issues in production
- **Separate permanent and transient errors** — do not retry failures caused by missing metadata (they will never succeed), but do retry failures caused by database timeouts (they may succeed later)
