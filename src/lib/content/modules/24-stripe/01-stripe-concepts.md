# Stripe Concepts

Accepting payments on the web is one of those problems that sounds simple until you realize what it actually involves: PCI compliance audits, fraud detection systems, handling chargebacks, supporting dozens of payment methods across different countries, dealing with currency conversion, tax calculation, 3D Secure authentication, and regulations that vary by jurisdiction. Building any of this yourself would be a multi-year, multi-team effort — and a single security mistake could expose you to catastrophic liability.

**Stripe** exists so you never have to think about any of that. It is a payment infrastructure company that sits between your application and the global financial system. You call their API, they move money. Your server never touches a credit card number. Stripe handles PCI compliance, fraud detection (via Radar), international payment methods, and regulatory compliance in 46+ countries.

Before writing code, you need to understand how Stripe's payment architecture works, how its core objects relate to each other, and why the flow is designed the way it is. Getting this mental model right prevents an entire class of mistakes that are expensive to fix once real money is flowing.

## The Security Architecture: Why Your Server Talks to Stripe, Never the Client

The single most important rule in payment processing: **sensitive payment data never touches your server.** This is not just good practice — it determines your PCI compliance burden.

PCI DSS (Payment Card Industry Data Security Standard) has four compliance levels. If card data flows through your server, you need SAQ D compliance — a 300+ question audit that costs tens of thousands of dollars annually. If card data goes directly from the browser to Stripe (which is how you should always set it up), you only need SAQ A — a simple self-assessment questionnaire.

This distinction is worth understanding deeply. The moment a raw credit card number appears in your server logs, your database, or even passes through your server's memory temporarily, you are in SAQ D territory. This is why Stripe designed their entire architecture to prevent this from ever happening — and why you should never try to "optimize" by collecting card numbers yourself.

This is why Stripe uses two different API keys with very different trust levels:

```
Publishable Key (pk_test_...)
├── Safe to expose in browser JavaScript
├── Can only create tokens and confirm payments
├── Cannot read customer data or issue refunds
├── Cannot create charges or modify subscriptions
├── Cannot access webhook endpoints or API logs
└── Think of it as a "write-only payment form" key

Secret Key (sk_test_...)
├── Must NEVER leave your server
├── Full access: create charges, issue refunds, manage customers
├── Can read all payment data and modify subscriptions
├── Can create and manage webhook endpoints
├── Can issue coupons, manage products and prices
└── Treat it like a database password — if leaked, rotate immediately
```

In SvelteKit, this maps perfectly to the environment variable system:

```typescript
// Client-side (safe to expose in the browser)
// The PUBLIC_ prefix makes this available in browser-side code
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
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### WRONG vs CORRECT: API Key Handling

```typescript
// WRONG: Importing the secret key in a .svelte component
// This will fail at build time in SvelteKit, but the intent is dangerous
// <script lang="ts">
//   import { STRIPE_SECRET_KEY } from '$env/static/private'; // BUILD ERROR
//   const stripe = new Stripe(STRIPE_SECRET_KEY);
// </script>

// WRONG: Hardcoding keys in source code
const stripe = new Stripe('sk_live_abc123...'); // Committed to git = leaked

// WRONG: Using the secret key in a +page.ts (runs on client AND server)
// src/routes/checkout/+page.ts
import { STRIPE_SECRET_KEY } from '$env/static/private'; // Runs on client too!

// CORRECT: Secret key only in server-side files
// src/routes/api/checkout/+server.ts  (server-only)
// src/routes/checkout/+page.server.ts (server-only)
// src/lib/server/stripe.ts            (server-only by convention AND import path)
import { STRIPE_SECRET_KEY } from '$env/static/private';
```

### The Stripe Server Module Pattern

In production, you want a single Stripe instance shared across all server-side code:

```typescript
// src/lib/server/stripe.ts
// The 'server' directory name is a SvelteKit convention —
// importing from $lib/server/ in client code triggers a build error
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia', // Pin the API version for stability
  typescript: true,
});
```

Pinning the `apiVersion` is critical for production. Without it, Stripe uses whatever version is set in your Dashboard, which can change when someone upgrades. Pinning ensures your code works with the exact API response shapes you tested against.

## The Real Architecture: Who Talks to Whom

Understanding the data flow prevents an entire class of mistakes:

```
Browser ──────▶ Your Server ──────▶ Stripe API
   │                 ▲                   │
   │                 │ Webhook POSTs     │
   │                 └───────────────────┘
   │
   └──── Card details go directly to Stripe via Stripe.js
         (never through your server)
```

Three distinct communication paths, each with different trust models:

1. **Browser to Stripe** (via Stripe.js): card details go directly to Stripe, never through your server. This is the path that keeps you in SAQ A compliance. Stripe.js is loaded from Stripe's CDN, and the card input is actually an iframe hosted on Stripe's domain — so your JavaScript cannot even read the card number.

2. **Your Server to Stripe API**: creating Payment Intents, managing customers, querying subscriptions — authenticated with your secret key. This is the control plane. Your server decides *what* to charge and *how much*. The client can never modify these values.

3. **Stripe to Your Webhook Endpoint**: Stripe pushes event notifications to your server asynchronously. This is the truth source — not the redirect back to your success page, not the client-side confirmation callback. The webhook is the only path you should trust for fulfillment.

### Why the Two-Step Flow Exists

The separation between "server creates intent" and "client confirms payment" is not just about security — it is about preventing a specific attack:

```
WRONG approach (insecure):
  Client sends amount to server → Server charges that amount
  Problem: A malicious user can modify the amount to $0.01

CORRECT approach (Stripe's design):
  Server creates PaymentIntent with $49.00 → Sends client_secret to browser
  Browser confirms with card details → Stripe charges the $49.00 the server specified
  The client_secret allows confirmation but NOT modification of the amount
```

The `client_secret` is a clever cryptographic construct: it gives the browser permission to complete *this specific* payment but cannot be used to create new charges, modify the amount, or do anything else. If it leaks (which it will — it is in the browser), the damage is limited to that one transaction.

## Core Stripe Objects

Stripe's data model is built around a handful of objects that compose together. Understanding them saves you from the "which API do I call?" confusion. Here is the relationship map:

```
Product ──── has many ──── Price
                             │
                     used by │
                             ▼
Customer ──── has many ──── Subscription (recurring Price)
    │                           │
    │                    creates │
    │                           ▼
    └──── has many ──── PaymentIntent (one-time)
                             │
                      or via │
                             ▼
                     Checkout Session (hosted or embedded)
                             │
                     triggers │
                             ▼
                        Webhook Event
```

### Products and Prices

A **Product** is what you sell. A **Price** is how much it costs. They are separate because one product can have multiple prices (monthly vs. annual, different currencies, different tiers).

```typescript
import Stripe from 'stripe';
const stripe = new Stripe(STRIPE_SECRET_KEY);

// Create the product (what you sell)
const product = await stripe.products.create({
  name: 'SvelteKit Pro Course',
  description: 'Complete guide to building production SvelteKit apps',
  // Images appear on Stripe Checkout pages and receipts
  images: ['https://yoursite.com/images/course-cover.jpg'],
  // Metadata links Stripe objects to your own data model
  metadata: {
    courseSlug: 'sveltekit-pro',
    category: 'web-development'
  }
});

// One-time price — amounts are always in smallest currency unit (cents for USD)
const oneTimePrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 4900,    // $49.00
  currency: 'usd',
});

// Recurring price for subscriptions
const monthlyPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 1200,    // $12.00/month
  currency: 'usd',
  recurring: { interval: 'month' }
});

// Annual price with a discount incentive
const annualPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 9900,    // $99.00/year (saves $45 vs monthly)
  currency: 'usd',
  recurring: { interval: 'year' }
});
```

**Watch out: Currency Units Are Not Universal**

`4900` in USD = $49.00 (cents), but `4900` in JPY = 4900 yen (no sub-unit). Zero-decimal currencies include JPY, KRW, VND, and others. Check the [Stripe currency docs](https://stripe.com/docs/currencies) for zero-decimal currencies.

```typescript
// WRONG: Assuming all currencies have sub-units
const amount = dollarAmount * 100; // Correct for USD, wrong for JPY

// CORRECT: Handle zero-decimal currencies explicitly
const ZERO_DECIMAL_CURRENCIES = ['bif','clp','djf','gnf','jpy','kmf',
  'krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf'];

function toStripeAmount(amount: number, currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.includes(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}
```

### Creating Products in Dashboard vs API

For most SvelteKit applications, you should create Products and Prices in the Stripe Dashboard, not via API. The Dashboard gives you a UI for managing descriptions, images, and pricing tiers. Then reference them by ID in your code:

```typescript
// Products and Prices created in Dashboard, referenced by ID in code
const PRICES = {
  monthly: 'price_1234abc',     // Dashboard → Products → Price ID
  annual: 'price_5678def',
  lifetime: 'price_9012ghi',
} as const;

// This is cleaner than creating products on every server start
const session = await stripe.checkout.sessions.create({
  line_items: [{ price: PRICES.monthly, quantity: 1 }],
  // ...
});
```

Use the API for dynamic pricing (per-seat billing, usage-based, custom quotes) where prices are computed at runtime.

### Customers

A **Customer** ties together a person's payment methods, subscriptions, and payment history. You do not strictly need one for a single payment, but creating customers lets Stripe remember payment methods for future purchases, and it is required for subscriptions.

```typescript
const customer = await stripe.customers.create({
  email: 'student@example.com',
  name: 'Alex Johnson',
  metadata: {
    userId: 'user_abc123'   // Link to your internal user ID
  }
});
```

The `metadata` field is your escape hatch. It is a key-value store (string keys and values, max 500 characters per value, max 50 keys) that Stripe carries through the entire payment lifecycle. Use it to link Stripe objects back to your own database records.

**Critical pattern: always store the Stripe customer ID in your database:**

```typescript
// When a user signs up, create a Stripe customer and store the ID
async function onUserSignup(user: { id: string; email: string; name: string }) {
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user.id }
  });

  // Store the Stripe customer ID in YOUR database
  await db.update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, user.id));

  return customer;
}

// Later, when they want to buy something:
async function getOrCreateCustomer(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId)
  });

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId;
  }

  // Fallback: create if missing (migration scenario)
  const customer = await stripe.customers.create({
    email: user!.email,
    metadata: { userId }
  });

  await db.update(users)
    .set({ stripeCustomerId: customer.id })
    .where(eq(users.id, userId));

  return customer.id;
}
```

### Payment Intents

A **PaymentIntent** represents a single payment attempt. It is the core object for one-time payments and tracks the payment through its lifecycle:

```
Created → Requires Payment Method → Requires Confirmation → Processing → Succeeded
                                                                       ↘ Requires Action (3DS)
                                                                       ↘ Failed
                                                                       ↘ Canceled
```

You create a PaymentIntent on your server with the amount and currency, then the client confirms it with the customer's card details. This two-step process ensures your server controls the amount charged — the client can never modify it.

```typescript
// src/routes/api/create-payment-intent/+server.ts
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = await getOrCreateCustomer(locals.user.id);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: 4900,            // $49.00 — server controls this, not the client
    currency: 'usd',
    customer: customerId,
    // Automatic payment methods lets Stripe show the best options
    // for the customer's country and device
    automatic_payment_methods: { enabled: true },
    metadata: {
      productId: 'course-sveltekit-pro',
      userId: locals.user.id
    }
  });

  // client_secret lets the browser confirm but NOT modify the amount
  return json({ clientSecret: paymentIntent.client_secret });
};
```

### Checkout Sessions

While PaymentIntents give you full control, **Checkout Sessions** are the fast path. Stripe hosts the entire payment page for you — a polished, localized, mobile-optimized form that handles dozens of payment methods automatically.

```typescript
// src/routes/api/checkout/+server.ts
import { json } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const customerId = await getOrCreateCustomer(locals.user.id);

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',  // or 'subscription' for recurring
    customer: customerId,
    line_items: [{ price: 'price_1234abc', quantity: 1 }],

    // {CHECKOUT_SESSION_ID} is a Stripe template variable — it gets replaced
    // with the actual session ID when the customer is redirected
    success_url: `${url.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${url.origin}/checkout/cancel`,

    // Collect billing address for tax purposes
    billing_address_collection: 'required',

    // Allow promo codes
    allow_promotion_codes: true,

    metadata: {
      userId: locals.user.id,
      productSlug: 'sveltekit-pro'
    }
  });

  return json({ url: session.url });
};
```

The flow: Customer clicks "Buy" on your site -> your server creates a Checkout Session -> customer is redirected to checkout.stripe.com -> enters card details -> Stripe processes payment -> customer is redirected back to your `success_url` -> your webhook receives the payment confirmation.

**Important: the success URL redirect is NOT your source of truth.** The customer might close the tab before the redirect completes. Always use webhooks for fulfillment.

### Subscriptions

A **Subscription** ties a Customer to a recurring Price. Stripe automatically charges the customer on each billing cycle and handles failed payments, retries, and grace periods.

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: 'price_monthly_1234' }],
  // 'default_incomplete' means the subscription starts only after
  // the first payment is confirmed — prevents access without payment
  payment_behavior: 'default_incomplete',
  // Expand nested objects so you get the PaymentIntent in the response
  // instead of just its ID
  expand: ['latest_invoice.payment_intent'],
  metadata: {
    userId: locals.user.id,
    plan: 'pro'
  }
});
```

**Subscription lifecycle events you must handle:**

```
customer.subscription.created     → Record subscription start
customer.subscription.updated     → Handle plan changes, status changes
customer.subscription.deleted     → Revoke access
invoice.payment_succeeded         → Extend access, send receipt
invoice.payment_failed            → Notify user, start dunning
customer.subscription.trial_will_end → Send "trial ending" email (3 days before)
```

## Hosted Checkout vs. Embedded (Stripe Elements)

You have two approaches to collecting payments, and the choice has significant architectural implications:

### Hosted Checkout (Redirect to Stripe)

**Pros:** Fastest to implement. Highest conversion rates (Stripe A/B tests their form constantly). Supports the most payment methods (Apple Pay, Google Pay, bank transfers, Buy Now Pay Later — all automatic). PCI compliance is trivial. Handles 3D Secure, address collection, and tax calculation.

**Cons:** The customer leaves your site. You have limited design control. The redirect adds latency to the flow.

```typescript
// Server: Create a Checkout Session and redirect
// src/routes/buy/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import type { Actions } from './$types';

export const actions: Actions = {
  checkout: async ({ locals, url }) => {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: locals.user.stripeCustomerId,
      line_items: [{ price: 'price_1234abc', quantity: 1 }],
      success_url: `${url.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${url.origin}/pricing`,
    });

    redirect(303, session.url!);
  }
};
```

```svelte
<!-- src/routes/buy/+page.svelte -->
<form method="POST" action="?/checkout">
  <button type="submit">Buy Course — $49</button>
</form>
```

### Embedded Checkout (Stripe Elements)

**Pros:** The payment form lives on your site. Full design control. No redirect away. Can embed into complex multi-step flows.

**Cons:** More code. Fewer automatic payment methods. You handle more of the UX (loading states, error messages, 3D Secure modals).

```svelte
<!-- src/routes/checkout/+page.svelte -->
<script lang="ts">
  import { loadStripe } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
  import { onMount } from 'svelte';

  let cardElement: any;
  let stripe: any;
  let elements: any;
  let processing = $state(false);
  let error = $state('');

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
    elements = stripe!.elements();
    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1a1a2e',
          '::placeholder': { color: '#a0aec0' }
        },
        invalid: { color: '#e53e3e' }
      }
    });
    cardElement.mount('#card-element');

    // Listen for validation errors from the card element
    cardElement.on('change', (event: any) => {
      error = event.error ? event.error.message : '';
    });
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (processing) return;
    processing = true;
    error = '';

    try {
      // Step 1: Create PaymentIntent on your server
      const res = await fetch('/api/create-payment-intent', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create payment intent');
      const { clientSecret } = await res.json();

      // Step 2: Confirm with the card details (sent directly to Stripe)
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (stripeError) {
        error = stripeError.message ?? 'Payment failed';
      } else if (paymentIntent.status === 'succeeded') {
        window.location.href = '/checkout/success';
      } else if (paymentIntent.status === 'requires_action') {
        // 3D Secure — Stripe handles the modal automatically
        // The promise resolves after the user completes authentication
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      processing = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="max-w-md mx-auto space-y-4">
  <div id="card-element" class="p-3 border rounded-lg"></div>

  {#if error}
    <p class="text-red-600 text-sm">{error}</p>
  {/if}

  <button
    type="submit"
    disabled={processing}
    class="w-full py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50"
  >
    {processing ? 'Processing...' : 'Pay $49.00'}
  </button>
</form>
```

**For most projects, start with Hosted Checkout.** Move to Elements when you have a specific design requirement that justifies the extra complexity. Common reasons to switch: multi-step checkout flow, embedded in a modal, custom donation amounts, or branding requirements that demand the form match your site exactly.

## Webhooks: The Critical Piece Most Tutorials Skip

Here is a scenario that will cost you money if you do not handle it: a customer completes payment on Stripe's checkout page, but instead of waiting for the redirect back to your site, they close their browser tab. Your success page never loads. Your server never learns the payment succeeded. The customer paid, but never got the product.

**Webhooks solve this.** A webhook is a POST request that Stripe sends to an endpoint on your server whenever something happens — payment succeeded, subscription cancelled, invoice paid, dispute created. Unlike the redirect flow, webhooks are reliable: Stripe retries failed deliveries with exponential backoff for up to 72 hours.

```typescript
// src/routes/api/webhook/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const POST: RequestHandler = async ({ request }) => {
  // IMPORTANT: Read the raw body as text, NOT as JSON
  // Stripe needs the exact bytes to verify the signature
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    // Verify the webhook came from Stripe, not an attacker
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Handle the event based on type
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutComplete(session);
        break;
      }
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Return 500 so Stripe retries this event
    return json({ error: 'Handler failed' }, { status: 500 });
  }

  // Always return 200 to acknowledge receipt
  return json({ received: true });
};
```

**Why signature verification matters:** without it, anyone could POST to your webhook endpoint and fake a "payment succeeded" event. The `STRIPE_WEBHOOK_SECRET` (from your Dashboard under Webhooks) cryptographically verifies the request came from Stripe. Every byte of the request body is included in the HMAC — which is why you must read the body as `text()`, not `json()`. Parsing as JSON and re-serializing might change whitespace or key ordering, breaking the signature.

### WRONG vs CORRECT: Webhook Body Parsing

```typescript
// WRONG: Parsing as JSON first breaks the signature
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();  // This re-serializes differently
  const signature = request.headers.get('stripe-signature')!;
  // constructEvent will FAIL because the bytes don't match
  const event = stripe.webhooks.constructEvent(
    JSON.stringify(body), signature, STRIPE_WEBHOOK_SECRET
  );
};

// CORRECT: Read raw text, then verify
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.text();  // Raw bytes preserved
  const signature = request.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
};
```

### Webhook Handler Architecture for Production

In a real application, your webhook handlers should be in separate modules:

```typescript
// src/lib/server/stripe/handlers.ts
import { db } from '$lib/server/database';
import { enrollments, users } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';
import type Stripe from 'stripe';

export async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const productSlug = session.metadata?.productSlug;

  if (!userId || !productSlug) {
    console.error('Missing metadata on checkout session', session.id);
    return; // Don't throw — retrying won't fix missing metadata
  }

  // Idempotent: use upsert or check-then-insert
  await db.insert(enrollments)
    .values({
      userId,
      productSlug,
      stripeSessionId: session.id,
      enrolledAt: new Date(),
    })
    .onConflictDoNothing(); // Unique constraint on (userId, productSlug)
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const userId = subscription.metadata?.userId;
  if (!userId) return;

  await db.update(users)
    .set({
      subscriptionStatus: 'canceled',
      subscriptionEndDate: new Date(subscription.current_period_end * 1000),
    })
    .where(eq(users.id, userId));
}

export async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;

  const [user] = await db.select()
    .from(users)
    .where(eq(users.stripeCustomerId, customerId))
    .limit(1);

  if (user) {
    await sendEmail(user.email, 'payment-failed', {
      invoiceUrl: invoice.hosted_invoice_url,
      attemptCount: invoice.attempt_count,
    });
  }
}
```

## Idempotency: Webhooks Can Fire More Than Once

Stripe guarantees **at-least-once delivery** of webhook events — meaning the same event might be delivered two, three, or more times. Network issues, timeouts, or Stripe retries can all cause duplicates. If your handler grants access to a course, running it twice should not grant access twice or charge the customer again.

Your webhook handler must be **idempotent**: safe to run multiple times with the same input.

```typescript
// WRONG: Not idempotent — creates duplicate enrollments
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  await db.insert(enrollments).values({
    userId: session.metadata!.userId,
    productSlug: session.metadata!.productSlug,
    enrolledAt: new Date(),
  });
  // If this webhook fires twice, you get TWO enrollment rows
}

// CORRECT: Idempotent — check before acting
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata!.userId;
  const productSlug = session.metadata!.productSlug;

  // Check if already enrolled
  const existing = await db.query.enrollments.findFirst({
    where: and(
      eq(enrollments.userId, userId),
      eq(enrollments.productSlug, productSlug)
    )
  });

  if (existing) return; // Already handled — idempotent!

  await db.insert(enrollments).values({
    userId, productSlug, enrolledAt: new Date()
  });
}

// ALSO CORRECT: Database-level idempotency with unique constraints
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  await db.insert(enrollments)
    .values({
      userId: session.metadata!.userId,
      productSlug: session.metadata!.productSlug,
      enrolledAt: new Date(),
    })
    .onConflictDoNothing(); // Unique constraint catches duplicates
}
```

The database-level approach (unique constraint + `onConflictDoNothing`) is preferred because it handles race conditions. If two webhook deliveries arrive simultaneously, both pass the "check if exists" step, but only one insert succeeds — the other hits the unique constraint and is silently ignored.

### Idempotency Keys for API Calls

When your server calls Stripe's API (not webhooks — your outbound calls), use idempotency keys to prevent duplicate charges from retries:

```typescript
// WRONG: Network timeout → retry → customer charged twice
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4900, currency: 'usd', customer: customerId
});

// CORRECT: Same idempotency key = same result, no matter how many retries
const paymentIntent = await stripe.paymentIntents.create(
  { amount: 4900, currency: 'usd', customer: customerId },
  { idempotencyKey: `pi_${userId}_${productSlug}_${Date.now()}` }
);
```

## The Success Page Pattern

After a Checkout Session completes, the customer is redirected to your success URL. But remember: this redirect is NOT your source of truth. The webhook is. The success page should just show a confirmation message and optionally verify the session status:

```typescript
// src/routes/checkout/success/+page.server.ts
import { stripe } from '$lib/server/stripe';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const sessionId = url.searchParams.get('session_id');

  if (!sessionId) {
    error(400, 'Missing session ID');
  }

  // Optional: verify the session exists and is paid
  // This is for display purposes only — fulfillment happens via webhook
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  return {
    customerEmail: session.customer_details?.email,
    amountTotal: session.amount_total,
    currency: session.currency,
    status: session.payment_status,
  };
};
```

```svelte
<!-- src/routes/checkout/success/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<div class="max-w-md mx-auto text-center py-16">
  {#if data.status === 'paid'}
    <h1 class="text-2xl font-bold text-green-600">Payment Successful!</h1>
    <p class="mt-2 text-gray-600">
      A confirmation email has been sent to {data.customerEmail}.
    </p>
    <p class="mt-1 text-gray-500">
      Amount: {(data.amountTotal! / 100).toFixed(2)} {data.currency?.toUpperCase()}
    </p>
  {:else}
    <h1 class="text-2xl font-bold">Processing...</h1>
    <p class="mt-2 text-gray-600">
      Your payment is being processed. You will receive a confirmation email shortly.
    </p>
  {/if}

  <a href="/dashboard" class="inline-block mt-6 text-indigo-600 hover:underline">
    Go to Dashboard
  </a>
</div>
```

## Test Mode: Develop Safely

Stripe's test environment mirrors production but processes no real money. Always develop in test mode. Stripe provides test card numbers that simulate different scenarios:

```
Successful payment:      4242 4242 4242 4242
Card declined:           4000 0000 0000 0002
Insufficient funds:      4000 0000 0000 9995
Requires 3D Secure:      4000 0025 0000 3155
Expired card:            4000 0000 0000 0069
Processing error:        4000 0000 0000 0119
Fraudulent (Radar):      4100 0000 0000 0019
Dispute after charge:    4000 0000 0000 0259
```

For all test cards, use any future expiry date (e.g., 12/34) and any 3-digit CVC (e.g., 123).

### Testing Webhooks Locally

For testing webhooks locally, use the **Stripe CLI** to forward events to your dev server:

```bash
# Install the Stripe CLI (macOS)
brew install stripe/stripe-cli/stripe

# Login to your Stripe account
stripe login

# Forward webhooks to your local dev server
stripe listen --forward-to localhost:5173/api/webhook
# Gives you a local webhook signing secret (whsec_...)
# Use this as STRIPE_WEBHOOK_SECRET in your .env for development

# Trigger test events manually:
stripe trigger checkout.session.completed
stripe trigger customer.subscription.created
stripe trigger invoice.payment_failed
```

### WRONG vs CORRECT: Test vs Production Keys

```typescript
// WRONG: Checking NODE_ENV to choose keys
const stripe = new Stripe(
  process.env.NODE_ENV === 'production' ? LIVE_KEY : TEST_KEY
);

// CORRECT: Use the same env var name, different values per environment
// .env.development → STRIPE_SECRET_KEY=sk_test_...
// .env.production  → STRIPE_SECRET_KEY=sk_live_...
const stripe = new Stripe(STRIPE_SECRET_KEY);
// SvelteKit loads the right .env file for the environment
```

## The Stripe Dashboard

The Stripe Dashboard at dashboard.stripe.com is your control center: Payments, Customers, Products, Subscriptions, Webhooks, and Developers (API keys, request logs, event logs). The event logs under Developers are especially useful for debugging — every API call and webhook delivery is logged with the full request and response. When something goes wrong, start there.

Key Dashboard areas for developers:

- **Developers > API Keys**: Your publishable and secret keys (test and live)
- **Developers > Webhooks**: Configure endpoint URLs, see delivery attempts and failures
- **Developers > Events**: Every event Stripe generated, with full payloads
- **Developers > Logs**: Every API request your server made, with request/response bodies
- **Products**: Create and manage products and prices in the UI
- **Customers**: See all customer records, their payment methods, and history

## Common Gotchas and Edge Cases

### Currency and Amount Mistakes

```typescript
// GOTCHA 1: Floating point math with currency
const price = 19.99;
const tax = price * 0.08;  // 1.5992000000000002
const total = price + tax;  // 21.5892 — not $21.59!

// Fix: Always work in cents (integers) internally
const priceInCents = 1999;
const taxInCents = Math.round(priceInCents * 0.08); // 160
const totalInCents = priceInCents + taxInCents;      // 2159 = $21.59
```

### Webhook Timeout

```typescript
// GOTCHA 2: Webhook handler takes too long
// Stripe waits only 20 seconds for a 2xx response. If your handler
// does slow work (sending emails, generating PDFs), you risk a timeout
// and Stripe retries the event.

// WRONG: Doing slow work in the webhook handler
export const POST: RequestHandler = async ({ request }) => {
  // ... verify signature ...
  await generateAndEmailPDF(session);  // Takes 15 seconds!
  await updateCRM(session);             // Another 5 seconds!
  return json({ received: true });      // 20+ seconds total → timeout
};

// CORRECT: Acknowledge immediately, process asynchronously
export const POST: RequestHandler = async ({ request }) => {
  // ... verify signature ...
  // Queue the work for async processing
  await db.insert(webhookQueue).values({
    eventId: event.id,
    eventType: event.type,
    payload: JSON.stringify(event.data.object),
    processedAt: null
  });
  return json({ received: true });  // 50ms response time
};
// A background worker processes the queue separately
```

### Mode Mismatch

```typescript
// GOTCHA 3: Mixing test and live mode objects
// A customer created in test mode (cus_test_...) cannot be used
// with a live-mode secret key. You will get a "No such customer" error.
// Test and live modes are completely separate databases in Stripe.
```

## Try It

1. **Set up Stripe**: Create a Stripe account at stripe.com. Find your test API keys under Developers > API Keys. Store them in your `.env` file as `PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.

2. **Create a product**: In the Stripe Dashboard, create a Product with a one-time Price of $49.00. Note the Price ID (`price_...`). Then create a server endpoint in SvelteKit that creates a Checkout Session using that Price ID and redirects the customer to the Stripe-hosted checkout page.

3. **Create a PaymentIntent**: Install the Stripe SDK with `npm install stripe @stripe/stripe-js`. Write a `+server.ts` endpoint that creates a PaymentIntent for $49.00 USD and returns the `client_secret`. Find the PaymentIntent in the Dashboard under Payments and examine its event timeline.

4. **Set up local webhooks**: Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), run `stripe listen --forward-to localhost:5173/api/webhook`, and trigger a test event with `stripe trigger checkout.session.completed`. Create a webhook endpoint in SvelteKit that logs the event type and verifies the signature.

5. **Test idempotency**: Trigger the same webhook event twice and verify your handler produces the same result both times without duplicating data. Add a unique constraint to your database table and use `onConflictDoNothing` to guarantee idempotency.

6. **Test error scenarios**: Use the test card `4000 0000 0000 0002` (decline) and `4000 0025 0000 3155` (3D Secure required) to verify your error handling works correctly. Check the Stripe Dashboard logs to see the full request/response for each attempt.

## Key Takeaways

- Stripe handles PCI compliance, fraud detection, and international regulations — so your server never touches raw card numbers and stays in SAQ A compliance territory
- The publishable key is safe for the browser; the secret key must never leave your server — SvelteKit enforces this at build time via `$env/static/private`
- Pin your Stripe API version in the constructor to prevent breaking changes when Dashboard settings change
- Core objects (Products, Prices, Customers, PaymentIntents, Checkout Sessions, Subscriptions) compose together to model any payment flow — Products and Prices are usually created in the Dashboard, not via API
- Hosted Checkout is the fastest path: redirect to Stripe's page, get a polished payment form with no frontend work — switch to Elements only when you have a specific design requirement
- The two-step flow (server creates intent, client confirms) exists to prevent amount tampering — the `client_secret` allows confirmation but not modification
- Webhooks are non-negotiable: they are the only reliable way to know a payment succeeded (the redirect back can fail if the user closes the tab)
- Read the webhook body as `text()`, never `json()` — signature verification requires the exact original bytes
- Webhook handlers must be idempotent because Stripe guarantees at-least-once delivery, not exactly-once — use database unique constraints as your safety net
- Keep webhook handlers fast (under 20 seconds) — acknowledge receipt immediately and process slow work asynchronously via a job queue
- Always develop in test mode with test card numbers, and use the Stripe CLI for local webhook testing — test and live modes are completely separate databases
- Store Stripe customer IDs in your database and use `metadata` to link Stripe objects back to your own data model
- Use `metadata` on every Stripe object (sessions, intents, subscriptions) — it is the bridge between Stripe's world and yours
