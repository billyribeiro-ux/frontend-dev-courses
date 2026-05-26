# Payment with Stripe

This is where your store makes money. In this lesson you will integrate Stripe to process payments, create orders in your database, handle webhooks for reliable payment confirmation, build a confirmation page, implement order history, deal with failed payments and refunds, generate receipts, and send confirmation emails. Stripe handles the hard parts — PCI compliance, card validation, and fraud detection — so you can focus on the user experience.

You will use Stripe Checkout, a hosted payment page that Stripe manages. This is the safest and fastest way to accept payments because sensitive card data never touches your server. No PCI scope, no liability for card data breaches.

## Architecture: How Payment Flows Through Your System

Before writing code, understand the complete payment lifecycle:

1. Customer clicks "Pay" on your payment page.
2. Your server creates a Stripe Checkout Session with line items and metadata.
3. Customer is redirected to Stripe's hosted payment page.
4. Customer enters card details on Stripe's page (never on yours).
5. Stripe processes the payment.
6. On success, Stripe redirects the customer to your confirmation URL.
7. In parallel, Stripe sends a webhook event to your server.
8. Your webhook handler creates the order in your database.
9. Your confirmation page displays the order details.

**Critical design decision:** Create the order in the webhook handler, not in the redirect handler. Why? The redirect is unreliable — the customer can close their browser after paying but before being redirected. The webhook is reliable — Stripe retries it for up to 72 hours if your server does not respond with 200.

## Creating a Stripe Checkout Session

When the customer is ready to pay, create a Checkout Session on the server. This is a form action because it is triggered by a user action (clicking "Pay"):

```typescript
// src/routes/(store)/checkout/payment/+page.server.ts
import Stripe from 'stripe';
import { redirect, error, fail } from '@sveltejs/kit';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_APP_URL } from '$env/static/public';
import { db } from '$lib/server/db';
import { products } from '$lib/server/schema';
import { inArray } from 'drizzle-orm';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function load({ cookies, locals }) {
  const checkoutRaw = cookies.get('checkout_data');
  if (!checkoutRaw) {
    throw redirect(303, '/checkout');
  }

  const checkout = JSON.parse(checkoutRaw);
  return { checkout };
}

export const actions = {
  default: async ({ request, cookies, locals, url }) => {
    const formData = await request.formData();
    const cartItemsRaw = formData.get('cart') as string;
    const checkoutRaw = cookies.get('checkout_data');

    if (!checkoutRaw || !cartItemsRaw) {
      throw error(400, 'Missing checkout data');
    }

    let cartItems: Array<{ productId: number; name: string; quantity: number; price: number; imageUrl?: string }>;
    let checkout: { name: string; email: string; address: string; city: string; state: string; zip: string };

    try {
      cartItems = JSON.parse(cartItemsRaw);
      checkout = JSON.parse(checkoutRaw);
    } catch {
      throw error(400, 'Invalid checkout data');
    }

    if (!cartItems.length) {
      return fail(400, { error: 'Your cart is empty' });
    }

    // CRITICAL: Validate prices against the database.
    // Never trust prices from the client — a user could modify the hidden form field.
    const productIds = cartItems.map((item) => item.productId);
    const dbProducts = await db
      .select({ id: products.id, name: products.name, price: products.price, inStock: products.inStock })
      .from(products)
      .where(inArray(products.id, productIds));

    const productMap = new Map(dbProducts.map((p) => [p.id, p]));

    // Verify every cart item matches database prices and is in stock
    const validatedLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of cartItems) {
      const dbProduct = productMap.get(item.productId);
      if (!dbProduct) {
        return fail(400, { error: `Product "${item.name}" is no longer available` });
      }
      if (!dbProduct.inStock) {
        return fail(400, { error: `"${dbProduct.name}" is out of stock` });
      }

      validatedLineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: dbProduct.name,
            images: item.imageUrl ? [item.imageUrl] : []
          },
          unit_amount: dbProduct.price // Use the DATABASE price, not the client price
        },
        quantity: item.quantity
      });
    }

    // Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: checkout.email,
      line_items: validatedLineItems,

      // Store checkout data as metadata so the webhook can create the order
      metadata: {
        userId: locals.user?.id?.toString() ?? '',
        checkoutData: JSON.stringify(checkout),
        cartItems: JSON.stringify(
          cartItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            priceCents: productMap.get(item.productId)!.price
          }))
        )
      },

      // Collect shipping address via Stripe (optional — you already collected it)
      // shipping_address_collection: { allowed_countries: ['US', 'CA'] },

      success_url: `${PUBLIC_APP_URL}/checkout/confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_APP_URL}/checkout`,

      // Automatically expires after 30 minutes
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60
    });

    throw redirect(303, session.url!);
  }
};
```

### Why Metadata Matters

The `metadata` field stores your application data on the Stripe session. When the webhook fires, you retrieve this metadata to create the order. This avoids the need to maintain server-side session state or temporary database records between the checkout and webhook steps.

## Payment Page Component

Show the order summary one more time and let the customer proceed to Stripe. This is the last chance to review before committing:

```svelte
<!-- src/routes/(store)/checkout/payment/+page.svelte -->
<script lang="ts">
  import { cart } from '$lib/state/cart.svelte';
  import { formatPrice } from '$lib/utils/format';
  import { enhance } from '$app/forms';

  let { data, form } = $props();
  let submitting = $state(false);
</script>

<div class="max-w-2xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Payment</h1>

  {#if form?.error}
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6" role="alert">
      <p class="text-red-800">{form.error}</p>
    </div>
  {/if}

  <!-- Shipping Summary -->
  <div class="bg-gray-50 rounded-lg p-6 mb-6">
    <div class="flex justify-between items-center mb-4">
      <h2 class="font-semibold">Shipping To</h2>
      <a href="/checkout" class="text-sm text-blue-600 hover:underline">Edit</a>
    </div>
    <p>{data.checkout.name}</p>
    <p class="text-gray-600">{data.checkout.address}</p>
    <p class="text-gray-600">{data.checkout.city}, {data.checkout.state} {data.checkout.zip}</p>
    <p class="text-gray-600">{data.checkout.email}</p>
  </div>

  <!-- Order Review -->
  <div class="bg-gray-50 rounded-lg p-6 mb-6">
    <h2 class="font-semibold mb-4">Order Review</h2>
    {#each cart.items as item}
      <div class="flex justify-between py-2 border-b last:border-0">
        <div class="flex items-center gap-3">
          {#if item.imageUrl}
            <img src={item.imageUrl} alt="" class="w-12 h-12 object-cover rounded" />
          {/if}
          <div>
            <p class="font-medium">{item.name}</p>
            <p class="text-sm text-gray-500">Qty: {item.quantity}</p>
          </div>
        </div>
        <span class="font-medium">{formatPrice(item.price * item.quantity)}</span>
      </div>
    {/each}
    <div class="border-t mt-3 pt-3 flex justify-between font-bold text-lg">
      <span>Total</span>
      <span>{formatPrice(cart.totalCents)}</span>
    </div>
  </div>

  <form method="POST" use:enhance={() => {
    submitting = true;
    return async ({ update }) => {
      submitting = false;
      await update();
    };
  }}>
    <input type="hidden" name="cart" value={JSON.stringify(cart.items)} />
    <button
      type="submit"
      disabled={submitting}
      class="w-full bg-blue-600 text-white py-4 rounded-lg text-lg
             font-semibold hover:bg-blue-700 transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {submitting ? 'Redirecting to Stripe...' : `Pay ${formatPrice(cart.totalCents)}`}
    </button>
  </form>

  <p class="text-sm text-gray-500 text-center mt-4">
    You will be redirected to Stripe's secure payment page.
    Your card details never touch our servers.
  </p>
</div>
```

## Webhook Integration: Reliable Payment Confirmation

Webhooks are the backbone of reliable payment processing. Stripe sends a POST request to your webhook endpoint when events occur. The most important event is `checkout.session.completed`:

```typescript
// src/routes/api/stripe-webhook/+server.ts
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from '$env/static/private';
import { db } from '$lib/server/db';
import { orders, orderItems, products } from '$lib/server/schema';
import { json, error } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { sendOrderConfirmation } from '$lib/server/email';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function POST({ request }) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    throw error(400, 'Missing stripe-signature header');
  }

  // Step 1: Verify the webhook signature
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    throw error(400, 'Invalid webhook signature');
  }

  // Step 2: Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;
    }

    case 'charge.refunded': {
      await handleRefund(event.data.object as Stripe.Charge);
      break;
    }

    case 'payment_intent.payment_failed': {
      await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // Idempotency check: has this session already been processed?
  const existingOrder = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.stripeSessionId, session.id))
    .limit(1);

  if (existingOrder.length > 0) {
    console.log(`Order for session ${session.id} already exists, skipping`);
    return;
  }

  // Parse metadata
  const checkoutData = JSON.parse(session.metadata?.checkoutData ?? '{}');
  const cartItems = JSON.parse(session.metadata?.cartItems ?? '[]');
  const userId = session.metadata?.userId ? Number(session.metadata.userId) : null;

  // Create the order in a transaction
  await db.transaction(async (tx) => {
    // Insert the order
    const [order] = await tx.insert(orders).values({
      userId,
      totalCents: session.amount_total!,
      shippingName: checkoutData.name ?? session.customer_details?.name ?? '',
      shippingEmail: checkoutData.email ?? session.customer_details?.email ?? '',
      shippingAddress: checkoutData.address ?? '',
      shippingCity: checkoutData.city ?? '',
      shippingState: checkoutData.state ?? '',
      shippingZip: checkoutData.zip ?? '',
      stripeSessionId: session.id,
      stripePaymentId: session.payment_intent as string,
      status: 'confirmed'
    }).returning();

    // Insert order items
    for (const item of cartItems) {
      await tx.insert(orderItems).values({
        orderId: order.id,
        productId: item.productId,
        quantity: item.quantity,
        priceCents: item.priceCents
      });

      // Decrement stock
      await tx
        .update(products)
        .set({
          stockCount: sql`${products.stockCount} - ${item.quantity}`,
          inStock: sql`CASE WHEN ${products.stockCount} - ${item.quantity} > 0 THEN true ELSE false END`
        })
        .where(eq(products.id, item.productId));
    }

    // Send confirmation email
    await sendOrderConfirmation({
      orderId: order.id,
      email: checkoutData.email ?? session.customer_details?.email!,
      name: checkoutData.name ?? session.customer_details?.name!,
      totalCents: session.amount_total!,
      items: cartItems
    });
  });

  console.log(`Order created for session ${session.id}`);
}

async function handleRefund(charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;

  await db
    .update(orders)
    .set({
      status: charge.amount_refunded === charge.amount ? 'refunded' : 'partially_refunded',
      refundedAmountCents: charge.amount_refunded
    })
    .where(eq(orders.stripePaymentId, paymentIntentId));

  console.log(`Refund processed for payment ${paymentIntentId}`);
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.error(
    `Payment failed for ${paymentIntent.id}: ${paymentIntent.last_payment_error?.message}`
  );
  // Optionally notify the team, log to error tracking, etc.
}
```

### Webhook Security and Idempotency

Two critical patterns in the webhook handler above:

1. **Signature verification.** Always verify the webhook signature. Without this, anyone could POST fake events to your endpoint and create orders without paying.

2. **Idempotency.** Stripe may send the same event multiple times (retries, network issues). The `existingOrder` check ensures you do not create duplicate orders. Always make webhook handlers idempotent.

### Setting Up Webhooks in Development

Use the Stripe CLI to forward webhooks to your local server:

```bash
# Install Stripe CLI and login
stripe login

# Forward webhooks to your local server
stripe listen --forward-to localhost:5173/api/stripe-webhook

# The CLI outputs a webhook signing secret — use it as STRIPE_WEBHOOK_SECRET
# Example: whsec_1234567890abcdef...
```

In production, configure the webhook endpoint in the Stripe Dashboard under Developers > Webhooks. Select the events you want to receive: `checkout.session.completed`, `charge.refunded`, `payment_intent.payment_failed`.

## Confirmation Page

After Stripe redirects back, show the customer their order confirmation:

```typescript
// src/routes/(store)/checkout/confirmation/+page.server.ts
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems, products } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export async function load({ url }) {
  const sessionId = url.searchParams.get('session_id');
  if (!sessionId) throw redirect(303, '/');

  // Retrieve the Stripe session
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  if (session.payment_status !== 'paid') {
    throw redirect(303, '/checkout');
  }

  // Try to find the order (webhook may have already created it)
  const order = await db
    .select()
    .from(orders)
    .where(eq(orders.stripeSessionId, sessionId))
    .limit(1);

  let items: Array<{ name: string; quantity: number; priceCents: number }> = [];

  if (order.length > 0) {
    // Order exists — get the items from our database
    const dbItems = await db
      .select({
        name: products.name,
        quantity: orderItems.quantity,
        priceCents: orderItems.priceCents
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, order[0].id));

    items = dbItems;
  } else {
    // Order not created yet (webhook is slow) — use Stripe line items
    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId);
    items = lineItems.data.map((item) => ({
      name: item.description ?? 'Product',
      quantity: item.quantity ?? 1,
      priceCents: item.amount_total
    }));
  }

  return {
    orderId: order[0]?.id ?? null,
    customerName: session.customer_details?.name,
    customerEmail: session.customer_details?.email,
    amountTotal: session.amount_total,
    items
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

  // Clear the cart after confirming payment succeeded.
  // The load function already verified payment_status === 'paid'.
  onMount(() => {
    if (data.customerName) {
      cart.clear();
    }
  });
</script>

<div class="max-w-2xl mx-auto px-4 py-16">
  <div class="text-center mb-8">
    <div class="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
      <span class="text-3xl text-green-600">&#10003;</span>
    </div>
    <h1 class="text-3xl font-bold mb-2">Order Confirmed!</h1>
    <p class="text-gray-600">
      Thank you, {data.customerName}. A confirmation email has been sent to {data.customerEmail}.
    </p>
    {#if data.orderId}
      <p class="text-sm text-gray-500 mt-2">Order #{data.orderId}</p>
    {/if}
  </div>

  <!-- Order Summary -->
  <div class="bg-gray-50 rounded-lg p-6 mb-8">
    <h2 class="font-semibold mb-4">Order Summary</h2>
    {#each data.items as item}
      <div class="flex justify-between py-2 border-b last:border-0">
        <span>{item.name} x {item.quantity}</span>
        <span>{formatPrice(item.priceCents)}</span>
      </div>
    {/each}
    <div class="border-t mt-3 pt-3 flex justify-between font-bold text-lg">
      <span>Total Paid</span>
      <span>{formatPrice(data.amountTotal ?? 0)}</span>
    </div>
  </div>

  <!-- Next Steps -->
  <div class="bg-blue-50 rounded-lg p-6 mb-8">
    <h2 class="font-semibold text-blue-800 mb-2">What happens next?</h2>
    <ol class="list-decimal list-inside space-y-2 text-blue-700">
      <li>You will receive a confirmation email shortly</li>
      <li>We will prepare your order for shipping</li>
      <li>You will receive tracking information when your order ships</li>
    </ol>
  </div>

  <div class="flex gap-4 justify-center">
    <a href="/products" class="bg-black text-white px-8 py-3 rounded-lg
                                hover:bg-gray-800 transition-colors">
      Continue Shopping
    </a>
    {#if data.orderId}
      <a href="/orders/{data.orderId}" class="border border-gray-300 px-8 py-3 rounded-lg
                                               hover:bg-gray-50 transition-colors">
        View Order
      </a>
    {/if}
  </div>
</div>
```

## Order History

Let authenticated users view their past orders:

```typescript
// src/routes/(store)/orders/+page.server.ts
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';

export async function load({ locals }) {
  if (!locals.user) {
    throw redirect(303, '/auth/login?redirect=/orders');
  }

  const userOrders = await db
    .select({
      id: orders.id,
      totalCents: orders.totalCents,
      status: orders.status,
      createdAt: orders.createdAt
    })
    .from(orders)
    .where(eq(orders.userId, Number(locals.user.id)))
    .orderBy(desc(orders.createdAt));

  return { orders: userOrders };
}
```

```svelte
<!-- src/routes/(store)/orders/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();
</script>

<div class="max-w-4xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Order History</h1>

  {#if data.orders.length === 0}
    <div class="text-center py-12">
      <p class="text-gray-500 mb-4">You have not placed any orders yet.</p>
      <a href="/products" class="text-blue-600 hover:underline">Browse products</a>
    </div>
  {:else}
    <div class="space-y-4">
      {#each data.orders as order}
        <a
          href="/orders/{order.id}"
          class="block bg-white border rounded-lg p-6 hover:shadow-md transition-shadow"
        >
          <div class="flex justify-between items-start">
            <div>
              <p class="font-semibold">Order #{order.id}</p>
              <p class="text-sm text-gray-500 mt-1">
                {new Date(order.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </p>
            </div>
            <div class="text-right">
              <p class="font-bold">{formatPrice(order.totalCents)}</p>
              <span class="inline-block mt-1 px-2 py-1 text-xs rounded-full
                           {order.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'delivered' ? 'bg-gray-100 text-gray-700' :
                            order.status === 'refunded' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'}">
                {order.status}
              </span>
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
```

## Order Detail with Receipt

Show the full order detail and provide a printable receipt:

```typescript
// src/routes/(store)/orders/[id]/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders, orderItems, products } from '$lib/server/schema';
import { eq, and } from 'drizzle-orm';

export async function load({ params, locals }) {
  if (!locals.user) {
    throw redirect(303, '/auth/login');
  }

  const [order] = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, Number(params.id)),
        eq(orders.userId, Number(locals.user.id))
      )
    )
    .limit(1);

  if (!order) {
    throw error(404, 'Order not found');
  }

  const items = await db
    .select({
      name: products.name,
      quantity: orderItems.quantity,
      priceCents: orderItems.priceCents,
      imageUrl: products.imageUrl
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, order.id));

  return { order, items };
}
```

```svelte
<!-- src/routes/(store)/orders/[id]/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();

  function printReceipt() {
    window.print();
  }
</script>

<svelte:head>
  <style>
    @media print {
      nav, footer, .no-print { display: none !important; }
      body { background: white !important; }
    }
  </style>
</svelte:head>

<div class="max-w-3xl mx-auto px-4 py-8">
  <div class="flex justify-between items-center mb-8 no-print">
    <a href="/orders" class="text-blue-600 hover:underline">&larr; All Orders</a>
    <button
      onclick={printReceipt}
      class="border px-4 py-2 rounded-lg hover:bg-gray-50 text-sm"
    >
      Print Receipt
    </button>
  </div>

  <!-- Receipt Header -->
  <div class="border-b pb-6 mb-6">
    <h1 class="text-2xl font-bold">Order #{data.order.id}</h1>
    <p class="text-gray-500 mt-1">
      Placed on {new Date(data.order.createdAt).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })}
    </p>
    <span class="inline-block mt-2 px-3 py-1 text-sm rounded-full
                 {data.order.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                  data.order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'}">
      {data.order.status}
    </span>
  </div>

  <!-- Shipping Address -->
  <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
    <div>
      <h2 class="font-semibold mb-2">Shipping Address</h2>
      <p>{data.order.shippingName}</p>
      <p class="text-gray-600">{data.order.shippingAddress}</p>
      <p class="text-gray-600">
        {data.order.shippingCity}, {data.order.shippingState} {data.order.shippingZip}
      </p>
    </div>
    <div>
      <h2 class="font-semibold mb-2">Payment</h2>
      <p class="text-gray-600">Stripe Payment ID:</p>
      <p class="text-sm font-mono text-gray-500">{data.order.stripePaymentId}</p>
    </div>
  </div>

  <!-- Order Items -->
  <div class="bg-gray-50 rounded-lg overflow-hidden mb-6">
    <table class="w-full">
      <thead class="bg-gray-100 text-left text-sm text-gray-600">
        <tr>
          <th class="p-4">Product</th>
          <th class="p-4 text-center">Qty</th>
          <th class="p-4 text-right">Price</th>
          <th class="p-4 text-right">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {#each data.items as item}
          <tr class="border-t">
            <td class="p-4">
              <div class="flex items-center gap-3">
                {#if item.imageUrl}
                  <img src={item.imageUrl} alt="" class="w-10 h-10 object-cover rounded" />
                {/if}
                <span>{item.name}</span>
              </div>
            </td>
            <td class="p-4 text-center">{item.quantity}</td>
            <td class="p-4 text-right">{formatPrice(item.priceCents)}</td>
            <td class="p-4 text-right font-medium">
              {formatPrice(item.priceCents * item.quantity)}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Total -->
  <div class="flex justify-end">
    <div class="w-64">
      <div class="flex justify-between py-2 text-lg font-bold border-t-2">
        <span>Total</span>
        <span>{formatPrice(data.order.totalCents)}</span>
      </div>
    </div>
  </div>
</div>
```

## Email Confirmation

Send a transactional email when an order is placed:

```typescript
// src/lib/server/email.ts
import nodemailer from 'nodemailer';
import { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } from '$env/static/private';
import { PUBLIC_APP_NAME } from '$env/static/public';
import { formatPrice } from '$lib/utils/format';

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
});

interface OrderEmailData {
  orderId: number;
  email: string;
  name: string;
  totalCents: number;
  items: Array<{ productId: number; quantity: number; priceCents: number }>;
}

export async function sendOrderConfirmation(data: OrderEmailData) {
  const itemsHtml = data.items
    .map((item) => `<tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">Product #${item.productId}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatPrice(item.priceCents * item.quantity)}</td>
    </tr>`)
    .join('');

  await transporter.sendMail({
    from: `"${PUBLIC_APP_NAME}" <orders@example.com>`,
    to: data.email,
    subject: `Order Confirmation #${data.orderId}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Order Confirmed!</h1>
        <p>Hi ${data.name},</p>
        <p>Thank you for your order. Here is your summary:</p>

        <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 8px; text-align: left;">Item</th>
              <th style="padding: 8px; text-align: center;">Qty</th>
              <th style="padding: 8px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>

        <p style="font-size: 18px; font-weight: bold;">
          Total: ${formatPrice(data.totalCents)}
        </p>

        <p style="color: #666; margin-top: 20px;">
          You can view your order at any time by visiting your order history.
        </p>
      </div>
    `
  });
}
```

## Refunds from Admin

Handle refunds through the admin panel:

```typescript
// src/routes/(admin)/admin/orders/[id]/+page.server.ts
import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { fail, error } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/permissions';

const stripe = new Stripe(STRIPE_SECRET_KEY);

export const actions = {
  refund: async ({ params, request, parent }) => {
    const { user } = await parent();
    if (!hasPermission(user.role, 'orders:refund')) {
      throw error(403, 'You do not have permission to issue refunds');
    }

    const data = await request.formData();
    const amountDollars = parseFloat(data.get('amount') as string);
    const reason = data.get('reason') as string;

    if (!amountDollars || amountDollars <= 0) {
      return fail(400, { error: 'Invalid refund amount' });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, Number(params.id)))
      .limit(1);

    if (!order) throw error(404, 'Order not found');
    if (!order.stripePaymentId) throw error(400, 'No payment to refund');

    const amountCents = Math.round(amountDollars * 100);
    const maxRefundable = order.totalCents - (order.refundedAmountCents ?? 0);

    if (amountCents > maxRefundable) {
      return fail(400, {
        error: `Maximum refundable amount is ${formatPrice(maxRefundable)}`
      });
    }

    try {
      await stripe.refunds.create({
        payment_intent: order.stripePaymentId,
        amount: amountCents,
        reason: reason === 'duplicate' ? 'duplicate' :
                reason === 'fraudulent' ? 'fraudulent' :
                'requested_by_customer'
      });
      // The webhook will update the order status
    } catch (err) {
      return fail(500, { error: 'Refund failed. Please try again.' });
    }
  }
};
```

## Try It

1. Add Stripe test mode to your development environment. Use the Stripe CLI to forward webhooks to localhost. Use the test card number `4242 4242 4242 4242` with any future expiration date and any CVC. Create a complete purchase flow from adding a product to the cart through to the confirmation page. Verify the order appears in both your database and your Stripe dashboard.

2. Test the failed payment flow: use Stripe test card `4000 0000 0000 0002` (always declines). Verify that the user is returned to the checkout page and sees an appropriate error message.

3. Build the order history page for authenticated users. Include status badges, formatted dates, and a link to the full order detail with receipt. Add a "Print Receipt" button that uses `window.print()` with print-specific CSS.

4. Set up the webhook endpoint and test idempotency: trigger the same `checkout.session.completed` event twice (using `stripe trigger`) and verify that only one order is created in your database.

## Key Takeaways

- Use Stripe Checkout (hosted payment page) so sensitive card data never touches your server — zero PCI scope
- Always validate prices against the database before creating a Stripe session — never trust client-side amounts
- Store checkout metadata on the Stripe session so the webhook handler has everything it needs to create the order
- Create orders in the webhook handler, not the redirect handler — webhooks are reliable, redirects are not (users close browsers)
- Always verify webhook signatures to prevent fake events from creating fraudulent orders
- Make webhook handlers idempotent — Stripe may send the same event multiple times
- Use database transactions when creating orders with line items and updating stock counts
- Clear the cart on the confirmation page only after verifying payment succeeded server-side
- Use the Stripe CLI during development to forward webhooks and trigger test events
- Process refunds through the Stripe API and let the refund webhook update your order status
- Send confirmation emails from the webhook handler to ensure they are sent even if the user closes their browser
