# Stripe Concepts

Accepting payments on the web requires a payment processor that handles the security, compliance, and complexity of credit card transactions. **Stripe** is the most popular choice for developers — it provides APIs for everything from one-time payments to subscriptions, all without you ever touching raw credit card numbers.

Before writing code, you need to understand how Stripe's payment flow works and how its dashboard and API keys are organized.

## How Online Payments Work

When a user pays on your site, the flow involves three parties: the customer, your server, and Stripe:

```
1. Customer enters card details in your form
2. Stripe.js securely sends card data directly to Stripe (never to your server)
3. Stripe tokenizes the card and returns a token
4. Your server uses the token to create a Payment Intent
5. Stripe processes the charge with the card network
6. Stripe confirms success or failure
7. Your server grants access to the product
```

Your server never sees the raw card number. Stripe handles PCI compliance so you do not have to.

## The Stripe Dashboard

The Stripe Dashboard at dashboard.stripe.com is your control center. It shows:

- **Payments** — every transaction, successful or failed
- **Customers** — saved customer profiles
- **Products** — items or plans you sell
- **Webhooks** — event notifications from Stripe to your server
- **Developers** — API keys, logs, and event logs

## Test Mode vs. Live Mode

Stripe has two modes, toggled in the dashboard:

- **Test mode** — uses fake money and test card numbers. No real charges happen.
- **Live mode** — processes real payments with real money.

Always develop and test in test mode. Stripe provides test card numbers:

```
Card number:   4242 4242 4242 4242
Expiry:        Any future date (e.g. 12/34)
CVC:           Any 3 digits (e.g. 123)
```

This card always succeeds. Stripe also provides cards that simulate failures:

```
4000 0000 0000 0002  — Card declined
4000 0000 0000 9995  — Insufficient funds
4000 0025 0000 3155  — Requires 3D Secure authentication
```

## API Keys

Stripe uses two API keys:

- **Publishable key** (`pk_test_...`) — safe to use in the browser. It can only create tokens and confirm payments.
- **Secret key** (`sk_test_...`) — must stay on the server. It can create charges, refunds, and manage customers.

Store your keys in environment variables:

```bash
# .env
PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
```

In SvelteKit, use `$env/static/public` for the publishable key (client-safe) and `$env/static/private` for the secret key (server-only):

```typescript
// Client-side (safe)
import { PUBLIC_STRIPE_PUBLISHABLE_KEY } from '$env/static/public';

// Server-side only (secret)
import { STRIPE_SECRET_KEY } from '$env/static/private';
```

## Payment Intents

A **Payment Intent** represents a single payment attempt. It tracks the payment from creation through completion:

```
Created → Requires Payment Method → Requires Confirmation → Processing → Succeeded
```

You create a Payment Intent on your server with the amount and currency, then the client confirms it with the customer's card details. This two-step process ensures your server controls the amount charged.

```typescript
// This runs on your server
import Stripe from 'stripe';

const stripe = new Stripe(STRIPE_SECRET_KEY);

const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,     // $20.00 (amount in cents)
  currency: 'usd',
  metadata: {
    productId: 'course-123'
  }
});
```

Amounts are always in the smallest currency unit (cents for USD, pence for GBP).

## Try It

Create a Stripe account at stripe.com and explore the test mode dashboard. Find your test API keys under Developers > API Keys. Store them in your `.env` file. Install the Stripe SDK with `npm install stripe` and write a simple script that creates a Payment Intent for $10.00 USD and logs the `client_secret` to the console.

## Key Takeaways

- Stripe handles payment processing so your server never touches raw card numbers
- Test mode uses fake money and test card numbers — always develop in test mode
- The publishable key is safe for the browser; the secret key must stay on the server
- Payment Intents represent a single payment attempt and track it through completion
- Amounts are specified in the smallest currency unit (cents for USD)
- Store API keys in environment variables using `$env/static/public` and `$env/static/private`
