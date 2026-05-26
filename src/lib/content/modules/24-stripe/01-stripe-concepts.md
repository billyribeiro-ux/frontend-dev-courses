# Stripe Concepts

Accepting payments on the web is one of those problems that sounds simple until you realize what it actually involves: PCI compliance audits that cost thousands of dollars, fraud detection systems that require machine learning expertise, chargebacks that involve legal processes, support for dozens of payment methods across different countries, currency conversion at real-time exchange rates, 3D Secure authentication mandated by European regulations, sales tax calculation that varies by jurisdiction, and recurring billing with dunning management for failed payments. Building any of this yourself would be a multi-year, multi-team effort — and a single security mistake could expose you to catastrophic financial and legal liability.

**Stripe** exists so you never have to think about any of that. It is a payment infrastructure company that sits between your application and the global financial system. You call their API, they move money. Your server never touches a credit card number. Stripe handles PCI compliance, fraud detection (via their Radar system), international payment methods (Apple Pay, Google Pay, SEPA, iDEAL, Klarna, and dozens more), and regulatory compliance in 46+ countries.

Before writing any code, you need to understand how Stripe's payment architecture works, how its core objects relate to each other, why the flow is designed the way it is, and what happens when things go wrong. This conceptual foundation will save you from an entire class of security mistakes and architectural dead ends.

## The PCI Compliance Burden — Why Architecture Matters

PCI DSS (Payment Card Industry Data Security Standard) is not optional. If your business accepts credit card payments, you must comply. The standard has four levels based on how many transactions you process annually, and *how* card data flows through your systems determines which self-assessment questionnaire (SAQ) you must complete:

**SAQ A** — Card data never touches your server. You use Stripe's hosted payment page or Stripe.js/Elements, which sends card details directly from the browser to Stripe. You fill out a short self-assessment form (22 questions) and you are done.

**SAQ A-EP** — Your server serves the page that contains the payment form, but card data still goes directly to Stripe via JavaScript. More questions (~140) because your server could theoretically be compromised to inject malicious JavaScript that intercepts card data.

**SAQ D** — Card data flows through your server. You must answer 300+ questions, maintain network segmentation, conduct regular penetration testing, and pay for annual audits by a Qualified Security Assessor. This costs tens of thousands of dollars annually for small businesses, and millions for enterprises.

The architectural goal is clear: **keep card data off your server entirely** to stay at SAQ A. This is not just about saving money — it is about reducing your attack surface. If your server is compromised but card data never touches it, the attacker cannot steal payment information.

## The Security Architecture: Two Keys, Two Trust Levels

Stripe uses two API keys with dramatically different trust levels. Understanding the distinction prevents the most dangerous category of payment integration mistakes:

```
Publishable Key (pk_test_...)
├── Safe to expose in browser JavaScript
├── Can ONLY:
│   ├── Create payment tokens (temporary, single-use)
│   ├── Confirm PaymentIntents that your server created
│   ├── Initialize Stripe Elements (the payment form UI)
│   └── Retrieve limited public information
├── CANNOT:
│   ├── Create charges or capture payments
│   ├── Issue refunds
│   ├── Read customer data or payment history
│   ├── Modify subscriptions
│   └── Access any sensitive data
└── Think of it as: "a key that can only ask Stripe to charge,
    never directly charge"

Secret Key (sk_test_...)
├── Must NEVER leave your server — not in logs, not in error messages,
│   not in client-side bundles, not in git repositories
├── Full API access:
│   ├── Create PaymentIntents (set the amount to charge)
│   ├── Create and manage Customers
│   ├── Issue refunds
│   ├── Read complete payment and customer data
│   ├── Manage subscriptions and invoices
│   └── Configure webhooks and products
└── Treat it like: "a master database password that can also
    move money"
```

In SvelteKit, this maps directly to the environment variable system:

```typescript
// Client-side code (browser) — safe to expose
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

// Server-side code ONLY — SvelteKit throws a BUILD ERROR
// if you try to import this in a .svelte component
import { STRIPE_SECRET_KEY } from '$env/static/private';
```

SvelteKit enforces this boundary at build time — not at runtime. If you accidentally import from `$env/static/private` in a `.svelte` file, the build fails with a clear error. This is a genuine safety net. Other frameworks rely on naming conventions (like Next.js's `NEXT_PUBLIC_` prefix), which are enforced by tooling but easy to circumvent. SvelteKit makes it a hard compile-time error.

```bash
# .env
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**Never commit `.env` to git.** Add it to `.gitignore` immediately. Stripe keys leaked to public repositories are exploited within minutes by automated scanners.

## The Data Flow — Who Talks to Whom and Why

Understanding the three communication paths prevents an entire class of mistakes:

```
┌──────────┐                  ┌──────────────┐                  ┌──────────────┐
│          │   Card details   │              │   API calls      │              │
│  Browser │ ────────────────▶│   Stripe     │◀────────────────▶│  Your Server │
│          │   (via Stripe.js)│   Servers    │   (secret key)   │              │
│          │                  │              │                  │              │
│          │   client_secret  │              │   Webhooks       │              │
│          │◀─────────────────│              │─────────────────▶│              │
└──────────┘  (from server)   └──────────────┘  (POST to your   └──────────────┘
                                                 endpoint)
```

**Path 1: Browser to Stripe (via Stripe.js)**
Card details go directly from the customer's browser to Stripe's PCI-compliant servers. Your server never sees the card number, CVC, or expiration date. This is what keeps you at SAQ A compliance.

**Path 2: Your Server to Stripe API (authenticated with secret key)**
Your server creates PaymentIntents (defining the amount to charge), manages Customers, queries subscription status, and issues refunds. Every call is authenticated with your secret key.

**Path 3: Stripe to Your Webhook Endpoint (asynchronous notifications)**
Stripe pushes event notifications to your server whenever something happens: a payment succeeds, a subscription is cancelled, a dispute is opened. This is the only reliable way to know what happened — the customer's redirect back to your site can fail.

The critical insight: **your server controls the amount** (Path 2), **the browser provides the payment method** (Path 1), and **Stripe confirms what actually happened** (Path 3). No single participant controls the entire flow, which is the security model in action.

## Core Stripe Objects — The Complete Data Model

Stripe's API is built around a handful of objects that compose together. Understanding them prevents the "which API do I call?" confusion.

### Products and Prices

A **Product** is what you sell. A **Price** is how much it costs. They are separate objects because one product can have multiple prices — monthly vs. annual billing, different currencies, tiered pricing, volume discounts:

```typescript
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Create a product (what you sell)
const product = await stripe.products.create({
  name: 'SvelteKit Pro Course',
  description: 'Complete guide to building production SvelteKit apps',
  images: ['https://yoursite.com/course-thumbnail.jpg'],
  metadata: {
    internalId: 'course-svelte-pro',
    category: 'courses'
  }
});

// One-time price — $49.00
// CRITICAL: amounts are ALWAYS in the smallest currency unit
// USD: cents. EUR: cents. GBP: pence. JPY: yen (no sub-unit!)
const oneTimePrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 4900,  // $49.00 in cents
  currency: 'usd'
});

// Recurring price for subscriptions — $12.00/month
const monthlyPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 1200,
  currency: 'usd',
  recurring: { interval: 'month' }
});

// Annual price with a discount — $99.00/year (saves vs $144/year monthly)
const annualPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 9900,
  currency: 'usd',
  recurring: { interval: 'year' }
});
```

**Currency gotcha:** `4900` in USD = $49.00 (cents), but `4900` in JPY = 4900 yen (yen has no sub-unit). Stripe calls these "zero-decimal currencies." If you sell internationally, you must check the [Stripe currency docs](https://stripe.com/docs/currencies). Getting this wrong means charging 100x too much or 100x too little.

**When to create Products and Prices:** For a catalog-based store, create them in the Stripe Dashboard or via a seed script. Do not create them on every purchase — they are meant to be reusable. For custom/dynamic pricing, create Prices on the fly but always use a stable Product.

### Customers

A **Customer** ties together a person's payment methods, subscriptions, and payment history. You do not strictly need one for a single one-off payment, but creating customers provides these benefits:

1. **Saved payment methods** — Returning customers do not re-enter card details
2. **Payment history** — You can look up all charges for a customer
3. **Subscription management** — Required for recurring billing
4. **Invoices** — Stripe generates professional invoices automatically

```typescript
const customer = await stripe.customers.create({
  email: 'student@example.com',
  name: 'Alex Johnson',
  metadata: {
    userId: 'user_abc123'  // YOUR internal user ID
  }
});
```

The `metadata` field is your escape hatch. It is a key-value store (string keys, string values, max 500 characters per value, max 50 keys) that Stripe carries through the entire payment lifecycle. Use it to link Stripe objects back to your own database records. When a webhook fires, the metadata tells you which user or order in your system it relates to.

**Best practice:** Store the Stripe customer ID in your users table (`stripeCustomerId`), and store your user ID in the Stripe customer's metadata. This bidirectional link makes debugging much easier.

```typescript
// In your database schema
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  stripeCustomerId: text('stripe_customer_id').unique(),
  // ...
});
```

### PaymentIntents — The Core Payment Object

A **PaymentIntent** represents a single payment attempt. It is the central object for one-time payments and tracks the payment through its entire lifecycle:

```
Created ──▶ Requires Payment Method ──▶ Requires Confirmation ──▶ Processing
                                                                      │
                                                          ┌───────────┼───────────┐
                                                          ▼           │           ▼
                                                      Succeeded     Requires    Canceled
                                                                    Action
                                                                  (3D Secure)
```

You create a PaymentIntent on your server with the amount and currency, then the client confirms it using the customer's card details. This two-step process is the security model: your server controls the amount charged — the client can never modify it.

```typescript
// SERVER: Create the PaymentIntent — you control the amount
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4900,           // $49.00 — set by YOUR server, not the client
  currency: 'usd',
  customer: customer.id,  // Optional: link to a customer
  automatic_payment_methods: {
    enabled: true          // Stripe auto-enables relevant payment methods
  },
  metadata: {
    orderId: 'order_xyz789',
    productId: 'course-svelte-pro',
    userId: 'user_abc123'
  }
});

// Send ONLY the client_secret to the browser
// The client_secret lets the browser CONFIRM the payment
// but CANNOT modify the amount, currency, or metadata
return { clientSecret: paymentIntent.client_secret };
```

**Why client_secret and not the PaymentIntent ID?** The client_secret is a special token that grants limited permissions — it can confirm the payment with a payment method, but it cannot change the amount or read sensitive data. It is safe to expose to the browser.

### Checkout Sessions — The Fast Path

While PaymentIntents give you full control over the payment UI, **Checkout Sessions** are the fast path. Stripe hosts the entire payment page for you — a polished, localized, mobile-optimized form that handles dozens of payment methods automatically. Stripe A/B tests this page constantly to maximize conversion rates, which means it will almost always convert better than any custom payment form you build.

```typescript
// SERVER: Create a Checkout Session
const session = await stripe.checkout.sessions.create({
  mode: 'payment',  // 'payment' for one-time, 'subscription' for recurring
  customer: customer.id,
  line_items: [
    {
      price: oneTimePrice.id,
      quantity: 1
    }
  ],
  // Where to send the customer after payment
  success_url: 'https://yoursite.com/success?session_id={CHECKOUT_SESSION_ID}',
  cancel_url: 'https://yoursite.com/cancel',

  // Optional: collect shipping address
  shipping_address_collection: {
    allowed_countries: ['US', 'CA', 'GB', 'DE', 'FR']
  },

  // Optional: allow promo codes
  allow_promotion_codes: true,

  // Optional: customize the hosted page
  custom_text: {
    submit: { message: 'Your course access will be activated immediately after payment.' }
  },

  metadata: {
    userId: 'user_abc123',
    source: 'pricing-page'
  }
});

// Redirect the customer to Stripe's hosted page
return { url: session.url };
```

The flow: Customer clicks "Buy" on your site -> your server creates a Checkout Session -> customer is redirected to checkout.stripe.com -> enters card details -> Stripe processes payment -> customer is redirected back to your `success_url` -> **your webhook receives the payment confirmation** (this is the reliable path, not the redirect).

**The `{CHECKOUT_SESSION_ID}` template:** Stripe replaces this placeholder with the actual session ID in the redirect URL. Your success page can then use this to display order details — but never use the redirect to *grant access*. Always use the webhook.

### Subscriptions — Recurring Billing

A **Subscription** ties a Customer to a recurring Price. Stripe automatically charges the customer on each billing cycle and handles failed payments, retries, and grace periods:

```typescript
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: monthlyPrice.id }],
  payment_behavior: 'default_incomplete',
  payment_settings: {
    save_default_payment_method: 'on_subscription'
  },
  expand: ['latest_invoice.payment_intent'],
  metadata: {
    userId: 'user_abc123',
    plan: 'pro'
  }
});
```

The subscription lifecycle involves several webhook events:

- `customer.subscription.created` — Subscription exists but may not be paid yet
- `invoice.payment_succeeded` — A billing cycle payment succeeded
- `invoice.payment_failed` — Payment failed (Stripe will retry)
- `customer.subscription.updated` — Plan changed, cancelled at period end, etc.
- `customer.subscription.deleted` — Subscription ended (after cancellation period)

**Dunning:** When a payment fails, Stripe does not immediately cancel the subscription. It enters a retry cycle (configurable in your Dashboard under Billing > Retry schedule). You can also configure Stripe to send emails to the customer asking them to update their payment method. This recovery system is called "dunning" and it saves a surprising amount of revenue — typically 5-15% of failed payments are recovered.

### Invoices

Every subscription payment generates an **Invoice**. For one-time payments, you can optionally create invoices too. Invoices provide:

- Professional PDF receipts your customers can download
- Line item breakdowns
- Tax calculations
- A hosted invoice page where customers can pay
- Revenue recognition data for accounting

## Hosted Checkout vs. Embedded (Stripe Elements)

You have two approaches to collecting payments. The choice affects your development time, UI flexibility, and conversion rates:

### Hosted Checkout (redirect to Stripe)

**Pros:** Fastest to implement (30 minutes), highest conversion rates (Stripe A/B tests constantly), supports the most payment methods automatically (Apple Pay, Google Pay, SEPA, Klarna, etc.), handles 3D Secure, works on mobile, collects shipping addresses.

**Cons:** The customer leaves your site. The redirect can feel jarring. You have limited control over the visual design.

**Use when:** You are starting out, you do not have strong design requirements for the payment page, you want maximum payment method coverage, or you want to ship fast.

### Embedded Checkout (Stripe Elements)

**Pros:** The payment form lives on your site. You get full design control. The customer never leaves your domain.

**Cons:** More code to write. You handle more of the UX (loading states, error messages, 3D Secure redirects). Fewer payment methods enabled by default. Lower conversion rates unless you invest heavily in UX.

```svelte
<!-- Embedded payment form using Stripe Elements -->
<script lang="ts">
  import { loadStripe } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
  import { onMount } from 'svelte';

  let cardElement: any;
  let stripe: any;
  let elements: any;
  let error = $state('');
  let processing = $state(false);

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);
    if (!stripe) {
      error = 'Failed to load Stripe. Please refresh the page.';
      return;
    }

    elements = stripe.elements({
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#1a1a2e',
          borderRadius: '8px'
        }
      }
    });

    cardElement = elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#1a1a2e',
          '::placeholder': { color: '#9ca3af' }
        }
      }
    });
    cardElement.mount('#card-element');

    // Listen for validation errors from Stripe
    cardElement.on('change', (event: any) => {
      error = event.error?.message ?? '';
    });
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (processing) return;

    processing = true;
    error = '';

    try {
      // Step 1: Create PaymentIntent on your server
      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'course-svelte-pro' })
      });

      if (!res.ok) throw new Error('Failed to create payment');
      const { clientSecret } = await res.json();

      // Step 2: Confirm the payment with the card element
      const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (stripeError) {
        // Show error to user — card declined, expired, etc.
        error = stripeError.message ?? 'Payment failed';
      } else if (paymentIntent.status === 'succeeded') {
        // Payment confirmed! Redirect to success page.
        // But DON'T grant access here — wait for the webhook.
        window.location.href = '/success';
      } else if (paymentIntent.status === 'requires_action') {
        // 3D Secure authentication needed — Stripe handles the modal
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Something went wrong';
    } finally {
      processing = false;
    }
  }
</script>

<form onsubmit={handleSubmit} class="max-w-md mx-auto space-y-4">
  <div>
    <label for="card-element" class="block text-sm font-medium text-gray-700 mb-2">
      Card Details
    </label>
    <div id="card-element" class="border rounded-lg p-3 bg-white"></div>
  </div>

  {#if error}
    <p class="text-sm text-red-600">{error}</p>
  {/if}

  <button
    type="submit"
    disabled={processing}
    class="w-full bg-gray-900 text-white py-3 rounded-lg font-medium
           hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
           transition-colors"
  >
    {processing ? 'Processing...' : 'Pay $49.00'}
  </button>
</form>
```

**For most projects, start with Hosted Checkout.** Move to Elements when you have a specific design requirement that justifies the extra complexity and lower baseline conversion rate.

## The Payment Element — The Modern Embedded Approach

Stripe's newer **Payment Element** replaces the `card` element with a unified component that automatically shows relevant payment methods:

```svelte
<script lang="ts">
  import { loadStripe } from '@stripe/stripe-js';
  import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';
  import { onMount } from 'svelte';

  let stripe: any;
  let elements: any;
  let paymentElement: any;
  let processing = $state(false);
  let error = $state('');

  onMount(async () => {
    stripe = await loadStripe(PUBLIC_STRIPE_PUBLISHABLE_KEY);

    // Create PaymentIntent first to get client_secret
    const res = await fetch('/api/create-payment-intent', { method: 'POST' });
    const { clientSecret } = await res.json();

    elements = stripe.elements({
      clientSecret,  // Required for Payment Element
      appearance: { theme: 'stripe' }
    });

    paymentElement = elements.create('payment', {
      layout: 'accordion',  // or 'tabs'
    });
    paymentElement.mount('#payment-element');
  });

  async function handleSubmit(e: Event) {
    e.preventDefault();
    processing = true;

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/success`
      }
    });

    // This code only runs if there is an error
    // (successful payments redirect to return_url)
    if (submitError) {
      error = submitError.message ?? 'Payment failed';
    }
    processing = false;
  }
</script>

<form onsubmit={handleSubmit}>
  <div id="payment-element"></div>
  {#if error}
    <p class="text-red-600 text-sm mt-2">{error}</p>
  {/if}
  <button type="submit" disabled={processing}
          class="w-full bg-gray-900 text-white py-3 rounded-lg mt-4">
    {processing ? 'Processing...' : 'Pay'}
  </button>
</form>
```

The Payment Element automatically shows cards, Apple Pay, Google Pay, and other methods based on the customer's location and the payment methods enabled in your Stripe Dashboard. It handles 3D Secure automatically by redirecting to the `return_url` after authentication.

## Webhooks — The Critical Piece Most Tutorials Skip

Here is a scenario that will cost you money if you do not handle it correctly:

1. Customer completes payment on Stripe's checkout page
2. Stripe redirects the customer back to your `success_url`
3. **The customer's internet connection drops during the redirect**
4. Your success page never loads
5. Your server never learns the payment succeeded
6. The customer paid, but never got the product

Another scenario:

1. Customer completes payment
2. Redirect succeeds, success page loads
3. Your success page grants access based on the URL parameter
4. **An attacker crafts a fake success URL with a made-up session ID**
5. They get access without paying

**Webhooks solve both problems.** A webhook is a POST request that Stripe sends to an endpoint on your server whenever something happens — payment succeeded, subscription cancelled, invoice paid, dispute created. Unlike the redirect flow, webhooks are reliable: Stripe retries failed deliveries with exponential backoff for up to 72 hours.

```typescript
// src/routes/api/webhook/+server.ts
import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function POST({ request }) {
  // Step 1: Read the raw body (NOT parsed JSON)
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return json({ error: 'No signature' }, { status: 400 });
  }

  // Step 2: Verify the webhook came from Stripe
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Step 3: Handle the event
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

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreated(dispute);
        break;
      }

      default:
        // Unhandled event type — log but do not error
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err);
    // Return 500 so Stripe retries
    return json({ error: 'Handler failed' }, { status: 500 });
  }

  // Step 4: Always return 200 to acknowledge receipt
  return json({ received: true });
}
```

### Why Signature Verification is Non-Negotiable

Without signature verification, anyone could POST to your webhook endpoint and fake a "payment succeeded" event. The `STRIPE_WEBHOOK_SECRET` (from your Dashboard under Developers > Webhooks) is used to cryptographically verify that the request was actually sent by Stripe and has not been tampered with.

The verification process:
1. Stripe signs the webhook payload using HMAC-SHA256 with your webhook secret
2. Stripe sends the signature in the `stripe-signature` header
3. `stripe.webhooks.constructEvent()` recomputes the signature and compares it
4. If they do not match, an error is thrown — the request is either forged or corrupted

**Critical:** You must read the body as `request.text()`, not `request.json()`. JSON parsing and re-serialization can change the byte-level representation (whitespace, key ordering), which invalidates the signature.

### The Webhook Must Return Quickly

Stripe expects a response within 20 seconds. If your handler takes longer (because it is sending emails, making multiple database calls, or calling external APIs), Stripe treats it as a failure and retries.

The solution: acknowledge the webhook immediately and process slow side effects asynchronously:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session;
  
  // Do the critical database update synchronously
  await grantAccess(session);
  
  // Do the slow stuff asynchronously — don't block the response
  sendWelcomeEmail(session).catch(console.error);
  notifySlack(session).catch(console.error);
  
  break;
}
```

## Idempotency — Webhooks Can Fire More Than Once

Stripe guarantees **at-least-once delivery** of webhook events — meaning the same event might be delivered two, three, or more times. Network timeouts, Stripe retries, and infrastructure issues can all cause duplicates. If your handler grants access to a course, running it twice must not grant access twice or charge the customer again.

Your webhook handler must be **idempotent**: safe to run multiple times with the same input, producing the same result.

```typescript
async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.userId;
  const productId = session.metadata?.productId;
  if (!userId || !productId) {
    console.error('Missing metadata on checkout session', session.id);
    return;
  }

  // Idempotency: check if we already processed this session
  const existing = await db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        eq(enrollments.productId, productId),
        eq(enrollments.stripeSessionId, session.id)
      )
    )
    .limit(1);

  // Already processed — do nothing
  if (existing.length > 0) {
    console.log(`Already processed session ${session.id}`);
    return;
  }

  // First time processing — grant access
  await db.insert(enrollments).values({
    userId,
    productId,
    stripeSessionId: session.id,
    enrolledAt: new Date()
  });
}
```

The pattern: check if the action was already performed before performing it. Use unique constraints in your database as a secondary safety net:

```typescript
try {
  await db.insert(enrollments).values({ /* ... */ });
} catch (err) {
  // Unique constraint violation = already processed
  if (err.code === '23505') return; // PostgreSQL unique violation
  throw err; // Re-throw unexpected errors
}
```

## Stripe Idempotency Keys for API Calls

When *you* call the Stripe API, network issues can cause the same request to be sent twice. Stripe supports idempotency keys to prevent double charges:

```typescript
// If this request fails due to a network error and you retry,
// Stripe recognizes the idempotency key and returns the original result
const paymentIntent = await stripe.paymentIntents.create({
  amount: 4900,
  currency: 'usd',
  customer: customer.id
}, {
  idempotencyKey: `order_${orderId}_payment`
});
```

The idempotency key is a string unique to this specific operation. If Stripe receives two requests with the same key, it returns the result of the first request without processing the second. Keys expire after 24 hours.

## Test Mode — Develop Safely

Stripe's test environment mirrors production exactly but processes no real money. Every API call, webhook, and Dashboard page works identically. Always develop in test mode until you are ready to go live.

Stripe provides test card numbers that simulate different scenarios:

```
Successful payment:         4242 4242 4242 4242
Successful (Visa Debit):    4000 0560 0000 0604
Card declined:              4000 0000 0000 0002
Insufficient funds:         4000 0000 0000 9995
Incorrect CVC:              4000 0000 0000 0127
Expired card:               4000 0000 0000 0069
Processing error:           4000 0000 0000 0119
Requires 3D Secure:         4000 0025 0000 3155
Always succeeds 3DS:        4000 0000 0000 3220
Dispute (fraudulent):       4000 0000 0000 0259
```

For all test cards: use any future expiry date (e.g., 12/34), any 3-digit CVC (e.g., 123), and any 5-digit ZIP.

### The Stripe CLI — Essential for Local Development

Testing webhooks locally is the hardest part of Stripe development without the CLI. The Stripe CLI creates a tunnel from Stripe's servers to your local machine:

```bash
# Install the CLI
# macOS: brew install stripe/stripe-cli/stripe
# Linux: see https://stripe.com/docs/stripe-cli

# Login to your Stripe account
stripe login

# Forward webhooks to your local dev server
stripe listen --forward-to localhost:5173/api/webhook
# Output: Ready! Your webhook signing secret is whsec_abc123...
# Use this whsec_ value as STRIPE_WEBHOOK_SECRET in your .env

# In another terminal: trigger test events manually
stripe trigger checkout.session.completed
stripe trigger invoice.payment_succeeded
stripe trigger customer.subscription.deleted

# Tail recent events (useful for debugging)
stripe events list --limit 10

# Open the Dashboard event log for a specific event
stripe events retrieve evt_1234567890
```

The CLI is indispensable during development. Without it, you would need to deploy your webhook endpoint to a public URL just to test it. With it, events flow directly to `localhost`.

## The Stripe Dashboard — Your Control Center

The Stripe Dashboard at dashboard.stripe.com is where you manage everything that is not in code:

- **Payments** — Every payment attempt, successful or failed, with full event timeline
- **Customers** — Customer list with payment history, subscriptions, and saved methods
- **Products** — Product catalog with prices (you can create these via Dashboard instead of API)
- **Subscriptions** — Active, trialing, past due, and cancelled subscriptions
- **Invoices** — All invoices with PDF download
- **Webhooks** — Endpoint configuration, delivery logs, and manual re-delivery
- **Developers > API Keys** — Your publishable and secret keys
- **Developers > Events** — Every event Stripe generated, with request/response logs
- **Developers > Logs** — Every API request your server made, with timing data

**When something goes wrong, start with Developers > Events.** Every API call and webhook delivery is logged with the full request body, response body, and HTTP status code. You can see exactly what your server sent, what Stripe returned, and whether the webhook was delivered successfully.

## The Subscription Billing Model — How It Actually Works

Subscriptions involve more moving parts than one-time payments. Here is the complete mental model:

```
Customer subscribes (chooses plan)
  │
  ▼
Stripe creates Subscription + first Invoice
  │
  ▼
Invoice is paid (initial charge)
  │                                              Billing cycle repeats
  ▼                                                     │
subscription.status = 'active'                          │
  │                                                     │
  │  ◄──────── (interval passes: month/year) ──────────┘
  │
  ▼
Stripe creates new Invoice for next period
  │
  ├──▶ Payment succeeds ──▶ Invoice marked 'paid', subscription stays 'active'
  │
  └──▶ Payment fails ──▶ Stripe retries (configurable schedule)
                              │
                              ├──▶ Retry succeeds ──▶ Back to 'active'
                              │
                              └──▶ All retries fail ──▶ subscription.status = 'past_due'
                                                              │
                                                              ▼
                                                       Eventually: 'canceled' or 'unpaid'
                                                       (configurable in Dashboard)
```

Key webhook events for subscriptions:
- `customer.subscription.created` — Set up the subscription in your database
- `invoice.payment_succeeded` — Renew access for the billing period
- `invoice.payment_failed` — Warn the user, potentially limit access
- `customer.subscription.updated` — Plan change, cancellation scheduled, or resumed
- `customer.subscription.deleted` — Revoke access (subscription fully ended)

**Cancellation timing:** When a customer cancels, you typically cancel at the end of the billing period (so they keep access until they have "used up" what they paid for):

```typescript
// Cancel at end of current period (most common)
await stripe.subscriptions.update(subscription.id, {
  cancel_at_period_end: true
});

// Cancel immediately (refund prorated amount)
await stripe.subscriptions.cancel(subscription.id, {
  prorate: true
});
```

## Complete Payment Architecture — Putting It Together

Here is how all the pieces connect in a SvelteKit application:

```typescript
// src/lib/server/stripe.ts — Shared Stripe instance
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

export const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',  // Pin to a specific API version
  typescript: true
});
```

```typescript
// src/routes/api/checkout/+server.ts — Create Checkout Session
import { json, error } from '@sveltejs/kit';
import { stripe } from '$lib/server/stripe';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function POST({ request, locals }) {
  if (!locals.user) throw error(401, 'Not authenticated');

  const { priceId } = await request.json();
  if (!priceId) throw error(400, 'Missing priceId');

  // Get or create Stripe customer
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, locals.user.id))
    .limit(1);

  let customerId = user.stripeCustomerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: String(user.id) }
    });
    customerId = customer.id;

    await db
      .update(users)
      .set({ stripeCustomerId: customerId })
      .where(eq(users.id, user.id));
  }

  // Create the Checkout Session
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${request.headers.get('origin')}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${request.headers.get('origin')}/pricing`,
    metadata: {
      userId: String(user.id)
    }
  });

  return json({ url: session.url });
}
```

```svelte
<!-- src/routes/pricing/+page.svelte — Pricing page with checkout -->
<script lang="ts">
  interface Plan {
    name: string;
    priceId: string;
    amount: string;
    features: string[];
  }

  const plans: Plan[] = [
    {
      name: 'Starter',
      priceId: 'price_starter_id',
      amount: '$29',
      features: ['10 projects', 'Basic support', '1 GB storage']
    },
    {
      name: 'Pro',
      priceId: 'price_pro_id',
      amount: '$49',
      features: ['Unlimited projects', 'Priority support', '50 GB storage']
    }
  ];

  let loading = $state<string | null>(null);

  async function checkout(priceId: string) {
    loading = priceId;
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId })
      });

      if (!res.ok) throw new Error('Failed to create checkout session');

      const { url } = await res.json();
      window.location.href = url;  // Redirect to Stripe
    } catch (err) {
      console.error(err);
      loading = null;
    }
  }
</script>

<div class="max-w-4xl mx-auto py-16 px-4">
  <h1 class="text-3xl font-bold text-center mb-12">Choose Your Plan</h1>
  <div class="grid md:grid-cols-2 gap-8">
    {#each plans as plan}
      <div class="border rounded-xl p-8 flex flex-col">
        <h2 class="text-xl font-semibold">{plan.name}</h2>
        <p class="text-3xl font-bold mt-2">{plan.amount}</p>
        <ul class="mt-6 space-y-2 flex-1">
          {#each plan.features as feature}
            <li class="flex items-center gap-2 text-sm text-gray-600">
              <span class="text-green-500">&#10003;</span> {feature}
            </li>
          {/each}
        </ul>
        <button
          onclick={() => checkout(plan.priceId)}
          disabled={loading === plan.priceId}
          class="mt-8 w-full bg-gray-900 text-white py-3 rounded-lg font-medium
                 hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {loading === plan.priceId ? 'Redirecting...' : `Get ${plan.name}`}
        </button>
      </div>
    {/each}
  </div>
</div>
```

## Try It

1. **Set up Stripe**: Create a Stripe account at stripe.com. Find your test API keys under Developers > API Keys. Store them in your `.env` file as `PUBLIC_STRIPE_PUBLISHABLE_KEY` and `STRIPE_SECRET_KEY`.

2. **Create Products and Prices**: Using the Stripe Dashboard (Products > Add Product), create a product with both a one-time price ($49) and a monthly recurring price ($12/month). Note the price IDs (`price_...`).

3. **Build a Checkout Session**: Write a SvelteKit API route (`src/routes/api/checkout/+server.ts`) that creates a Checkout Session for the one-time price. Redirect the customer to the Stripe-hosted page. Test with card number `4242 4242 4242 4242`. After payment, check the Stripe Dashboard under Payments to see the completed payment.

4. **Set up local webhooks**: Install the [Stripe CLI](https://stripe.com/docs/stripe-cli), run `stripe listen --forward-to localhost:5173/api/webhook`, and use the provided `whsec_` secret. Create a webhook handler at `src/routes/api/webhook/+server.ts` that verifies signatures and logs event types.

5. **Test idempotency**: Trigger `stripe trigger checkout.session.completed` twice and verify your handler produces the same result both times without duplicating data. Add a unique constraint to your database as a secondary safeguard.

6. **Test failure cases**: Use test card `4000 0000 0000 0002` (always declined) to verify your error handling. Use `4000 0025 0000 3155` (requires 3D Secure) to verify your 3D Secure flow works.

## Key Takeaways

- Stripe handles PCI compliance, fraud detection, and international regulations — your server never touches raw card numbers, which keeps you at SAQ A (the simplest compliance level)
- The publishable key is safe for the browser; the secret key must never leave your server — SvelteKit enforces this with a compile-time error for private environment variables
- Core objects (Products, Prices, Customers, PaymentIntents, Checkout Sessions, Subscriptions, Invoices) compose together to model any payment flow from one-time purchases to complex subscription tiers
- Amounts are always in the smallest currency unit (cents for USD) — watch out for zero-decimal currencies like JPY
- Hosted Checkout is the fastest, highest-conversion path: redirect to Stripe's page, get a polished payment form with no frontend work. Use Stripe Elements when you need custom UI.
- Webhooks are non-negotiable: they are the **only reliable** way to know a payment succeeded — the redirect back to your site can fail, and URL parameters can be forged
- Webhook signature verification prevents attackers from faking payment confirmations — always use `constructEvent` with your webhook secret
- Webhook handlers must be **idempotent** because Stripe guarantees at-least-once delivery, not exactly-once — use database unique constraints as a safety net
- Always develop in test mode with test card numbers, and use the Stripe CLI (`stripe listen`) for local webhook testing
- Use `metadata` to link Stripe objects back to your own database records — it is carried through the entire lifecycle and available in webhooks
- Pin your Stripe API version to prevent breaking changes when Stripe updates their API
- For subscriptions, handle the full lifecycle: created, renewed (invoice.paid), failed payment, updated, and deleted — each maps to a specific action in your database
