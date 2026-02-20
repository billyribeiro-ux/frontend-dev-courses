# Order Management

Orders are the lifeblood of your store. In this lesson you will build an order listing page with status filters, an order detail view, the ability to update order statuses, and basic revenue analytics. This gives admins everything they need to fulfill orders and understand business performance.

Without order management, a store is just a catalog. This is where you close the loop between customer purchases and fulfillment.

## Order Listing with Status Filters

Fetch orders with optional status filtering:

```typescript
// src/routes/(admin)/admin/orders/+page.server.ts
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq, desc, sql } from 'drizzle-orm';

export async function load({ url }) {
  const statusFilter = url.searchParams.get('status');

  let query = db
    .select()
    .from(orders)
    .orderBy(desc(orders.createdAt))
    .$dynamic();

  if (statusFilter) {
    query = query.where(eq(orders.status, statusFilter as any));
  }

  const allOrders = await query.limit(50);

  // Get counts per status for filter badges
  const statusCounts = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)`
    })
    .from(orders)
    .groupBy(orders.status);

  return { orders: allOrders, statusCounts, currentFilter: statusFilter };
}
```

```svelte
<!-- src/routes/(admin)/admin/orders/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();

  const statuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    confirmed: 'bg-blue-100 text-blue-700',
    shipped: 'bg-purple-100 text-purple-700',
    delivered: 'bg-green-100 text-green-700',
    cancelled: 'bg-red-100 text-red-700'
  };

  function getCount(status: string): number {
    const found = data.statusCounts.find(s => s.status === status);
    return found?.count ?? 0;
  }
</script>

<h1 class="text-2xl font-bold mb-6">Orders</h1>

<!-- Status filter tabs -->
<div class="flex gap-2 mb-6 flex-wrap">
  <a href="/admin/orders"
     class="px-4 py-2 rounded-lg border
            {!data.currentFilter ? 'bg-black text-white' : 'hover:bg-gray-100'}">
    All
  </a>
  {#each statuses as status}
    <a href="/admin/orders?status={status}"
       class="px-4 py-2 rounded-lg border
              {data.currentFilter === status ? 'bg-black text-white' : 'hover:bg-gray-100'}">
      {status} ({getCount(status)})
    </a>
  {/each}
</div>

<!-- Orders table -->
<div class="bg-white rounded-lg border overflow-hidden">
  <table class="w-full">
    <thead class="bg-gray-50 text-left text-sm text-gray-500">
      <tr>
        <th class="p-4">Order</th>
        <th class="p-4">Customer</th>
        <th class="p-4">Total</th>
        <th class="p-4">Status</th>
        <th class="p-4">Date</th>
        <th class="p-4">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.orders as order}
        <tr class="border-t hover:bg-gray-50">
          <td class="p-4 font-medium">#{order.id}</td>
          <td class="p-4">{order.shippingName}</td>
          <td class="p-4">{formatPrice(order.totalCents)}</td>
          <td class="p-4">
            <span class="px-2 py-1 text-xs rounded-full {statusColors[order.status]}">
              {order.status}
            </span>
          </td>
          <td class="p-4 text-sm text-gray-500">
            {new Date(order.createdAt).toLocaleDateString()}
          </td>
          <td class="p-4">
            <a href="/admin/orders/{order.id}"
               class="text-blue-600 hover:underline text-sm">View</a>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## Order Detail View

Show full order details including line items and allow status updates:

```typescript
// src/routes/(admin)/admin/orders/[id]/+page.server.ts
import { db } from '$lib/server/db';
import { orders, orderItems, products } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';

export async function load({ params }) {
  const orderId = Number(params.id);

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw error(404, 'Order not found');

  const items = await db
    .select({
      quantity: orderItems.quantity,
      priceCents: orderItems.priceCents,
      productName: products.name,
      productSlug: products.slug
    })
    .from(orderItems)
    .leftJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  return { order, items };
}

export const actions = {
  updateStatus: async ({ request, params }) => {
    const formData = await request.formData();
    const status = formData.get('status') as string;
    const orderId = Number(params.id);

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return fail(400, { error: 'Invalid status' });
    }

    await db
      .update(orders)
      .set({ status: status as any })
      .where(eq(orders.id, orderId));

    return { success: true };
  }
};
```

```svelte
<!-- src/routes/(admin)/admin/orders/[id]/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';
  import { enhance } from '$app/forms';

  let { data } = $props();
</script>

<div class="max-w-4xl">
  <a href="/admin/orders" class="text-sm text-gray-500 hover:text-black mb-4 block">
    &larr; Back to Orders
  </a>

  <div class="flex justify-between items-start mb-6">
    <h1 class="text-2xl font-bold">Order #{data.order.id}</h1>

    <form method="POST" action="?/updateStatus" use:enhance>
      <div class="flex gap-2">
        <select name="status" class="border rounded-lg px-3 py-2">
          {#each ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'] as status}
            <option value={status} selected={data.order.status === status}>
              {status}
            </option>
          {/each}
        </select>
        <button type="submit" class="bg-black text-white px-4 py-2 rounded-lg">
          Update
        </button>
      </div>
    </form>
  </div>

  <!-- Shipping Info -->
  <div class="bg-white rounded-lg border p-6 mb-6">
    <h2 class="font-semibold mb-3">Shipping Information</h2>
    <p>{data.order.shippingName}</p>
    <p>{data.order.shippingAddress}</p>
    <p>{data.order.shippingCity}, {data.order.shippingState} {data.order.shippingZip}</p>
  </div>

  <!-- Order Items -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <table class="w-full">
      <thead class="bg-gray-50 text-left text-sm text-gray-500">
        <tr>
          <th class="p-4">Product</th>
          <th class="p-4">Qty</th>
          <th class="p-4">Price</th>
          <th class="p-4">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {#each data.items as item}
          <tr class="border-t">
            <td class="p-4">{item.productName}</td>
            <td class="p-4">{item.quantity}</td>
            <td class="p-4">{formatPrice(item.priceCents)}</td>
            <td class="p-4">{formatPrice(item.priceCents * item.quantity)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot class="border-t">
        <tr>
          <td colspan="3" class="p-4 text-right font-bold">Total</td>
          <td class="p-4 font-bold">{formatPrice(data.order.totalCents)}</td>
        </tr>
      </tfoot>
    </table>
  </div>
</div>
```

## Basic Analytics

Add a simple revenue summary to the dashboard:

```typescript
// Revenue by day for the last 30 days
const dailyRevenue = await db
  .select({
    date: sql<string>`date(${orders.createdAt})`,
    revenue: sql<number>`sum(${orders.totalCents})`,
    orderCount: sql<number>`count(*)`
  })
  .from(orders)
  .where(sql`${orders.createdAt} > now() - interval '30 days'`)
  .groupBy(sql`date(${orders.createdAt})`)
  .orderBy(sql`date(${orders.createdAt})`);
```

Display it as a simple table or use a charting library:

```svelte
<div class="bg-white rounded-lg border p-6">
  <h2 class="font-semibold mb-4">Revenue (Last 30 Days)</h2>
  <div class="space-y-2">
    {#each data.dailyRevenue as day}
      <div class="flex items-center gap-4">
        <span class="text-sm text-gray-500 w-24">{day.date}</span>
        <div class="flex-1 bg-gray-100 rounded-full h-4">
          <div class="bg-black rounded-full h-4"
               style="width: {(day.revenue / maxRevenue) * 100}%"></div>
        </div>
        <span class="text-sm font-medium w-20 text-right">
          {formatPrice(day.revenue)}
        </span>
      </div>
    {/each}
  </div>
</div>
```

## Try It

Add a "bulk status update" feature to the orders listing page. Add checkboxes next to each order and a dropdown at the top that updates all selected orders to the chosen status with a single form submission. Validate that the selected status is valid on the server side.

## Key Takeaways

- Filter orders by status using URL search parameters, consistent with the catalog filtering pattern
- Show status counts as badges on filter tabs so admins can see at a glance what needs attention
- Use named form actions (`?/updateStatus`) to handle status updates on the order detail page
- Always validate status transitions server-side — never trust that the client sent a valid status
- Basic analytics with SQL aggregations (`sum`, `count`, `group by`) provide actionable business insights
- Color-coded status badges make order states instantly recognizable
