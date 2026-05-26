# Order Management

Orders are the lifeblood of your store. Without order management, a store is just a catalog — customers pay money and you have no way to track what they bought, ship it, or handle problems. This lesson builds a complete admin order management system: a filterable, searchable order listing with pagination, a rich order detail page with line items and customer information, a full order lifecycle with status transitions and audit trails, refund processing, shipping integration patterns, email notifications on status changes, CSV export, and revenue analytics. Every piece is production-grade.

The order management system you build here is the most operationally critical part of the admin panel. Product management and user management can be wrong for a day without disaster. But if orders are lost, misrouted, or their statuses are incorrect, customers do not get their products and your business loses trust. Treat this code with the seriousness it deserves.

## The Order Lifecycle

Before writing any code, understand the state machine that governs every order. An order is not just "placed" or "done" — it moves through a defined lifecycle, and each transition has business rules:

```
                                    ┌─────────────┐
                                    │   REFUNDED   │
                                    └──────▲───────┘
                                           │ (partial or full)
┌─────────┐    ┌────────────┐    ┌─────────┴──┐    ┌───────────┐    ┌───────────┐
│ PENDING  │───▶│ PROCESSING │───▶│  SHIPPED   │───▶│ DELIVERED │───▶│ COMPLETED │
└────┬─────┘    └─────┬──────┘    └────────────┘    └─────┬─────┘    └───────────┘
     │                │                                    │
     │                │                                    │
     ▼                ▼                                    ▼
┌─────────┐    ┌─────────────┐                      ┌───────────┐
│CANCELLED│    │   ON HOLD   │                      │  RETURNED  │
└─────────┘    └─────────────┘                      └───────────┘
```

Each status means something specific:

- **Pending**: Order received, payment confirmed, awaiting admin review. This is the default status after a successful Stripe webhook.
- **Processing**: Admin has acknowledged the order and is preparing it for shipment (picking, packing).
- **On Hold**: Something needs attention — inventory issue, suspicious order, customer requested a change. The order is paused, not cancelled.
- **Shipped**: Package handed to a carrier. A tracking number should be attached at this point.
- **Delivered**: Carrier confirms delivery. In practice this is often updated by tracking webhooks from the carrier, not manually.
- **Completed**: The order is finished — the customer has not returned anything and the return window has closed.
- **Cancelled**: Order cancelled before shipment. Inventory should be restocked and payment refunded.
- **Refunded**: Payment returned to customer (full or partial), after shipment.
- **Returned**: Customer sent the product back. Inventory restock may or may not happen depending on condition.

Not all transitions are valid. You cannot go from "Completed" back to "Pending." You cannot ship a cancelled order. The schema should enforce this:

```typescript
// src/lib/server/order-transitions.ts
type OrderStatus =
  | 'pending'
  | 'processing'
  | 'on_hold'
  | 'shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'returned';

// Valid transitions: from-status -> allowed next statuses
const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending:    ['processing', 'on_hold', 'cancelled'],
  processing: ['shipped', 'on_hold', 'cancelled'],
  on_hold:    ['processing', 'cancelled'],
  shipped:    ['delivered', 'returned'],
  delivered:  ['completed', 'returned', 'refunded'],
  completed:  ['refunded', 'returned'],
  cancelled:  [],         // Terminal state
  refunded:   [],         // Terminal state
  returned:   ['refunded'] // Can refund after return
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function getNextStatuses(current: OrderStatus): OrderStatus[] {
  return VALID_TRANSITIONS[current] ?? [];
}

export function isTerminal(status: OrderStatus): boolean {
  return VALID_TRANSITIONS[status]?.length === 0;
}
```

Why is this a separate module and not inline in the form action? Because you will need these rules in multiple places: the detail page form action, the bulk update action, the API endpoint for carrier webhook integrations, and the admin notification system. A single source of truth for business rules prevents inconsistencies.

## The Database Schema

The order system requires several related tables. Here is the Drizzle schema for the complete order model:

```typescript
// src/lib/server/schema/orders.ts
import { pgTable, serial, text, integer, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const orderStatusEnum = pgEnum('order_status', [
  'pending', 'processing', 'on_hold', 'shipped',
  'delivered', 'completed', 'cancelled', 'refunded', 'returned'
]);

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull().unique(), // Human-readable: ORD-20240115-0042
  customerId: integer('customer_id').notNull(),
  customerEmail: text('customer_email').notNull(),
  status: orderStatusEnum('status').notNull().default('pending'),

  // Shipping address (denormalized — snapshot at time of order)
  shippingName: text('shipping_name').notNull(),
  shippingAddress: text('shipping_address').notNull(),
  shippingCity: text('shipping_city').notNull(),
  shippingState: text('shipping_state').notNull(),
  shippingZip: text('shipping_zip').notNull(),
  shippingCountry: text('shipping_country').notNull().default('US'),

  // Shipping tracking
  trackingNumber: text('tracking_number'),
  trackingCarrier: text('tracking_carrier'), // 'usps' | 'ups' | 'fedex' | 'dhl'
  trackingUrl: text('tracking_url'),

  // Financial
  subtotalCents: integer('subtotal_cents').notNull(),
  shippingCents: integer('shipping_cents').notNull().default(0),
  taxCents: integer('tax_cents').notNull().default(0),
  discountCents: integer('discount_cents').notNull().default(0),
  totalCents: integer('total_cents').notNull(),
  refundedCents: integer('refunded_cents').notNull().default(0),

  // Stripe references
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeCheckoutSessionId: text('stripe_checkout_session_id'),

  // Notes
  adminNotes: text('admin_notes'),
  customerNotes: text('customer_notes'),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  productId: integer('product_id').notNull(),
  variantId: integer('variant_id'),
  productName: text('product_name').notNull(),     // Snapshot — product name could change later
  variantName: text('variant_name'),
  sku: text('sku'),
  quantity: integer('quantity').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  totalPriceCents: integer('total_price_cents').notNull()
});

export const orderStatusHistory = pgTable('order_status_history', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id').notNull().references(() => orders.id),
  fromStatus: orderStatusEnum('from_status'),
  toStatus: orderStatusEnum('to_status').notNull(),
  changedBy: integer('changed_by').notNull(),  // admin user ID
  reason: text('reason'),                       // "Customer requested cancellation"
  metadata: jsonb('metadata'),                  // Arbitrary data: tracking info, refund ID, etc.
  createdAt: timestamp('created_at').notNull().defaultNow()
});
```

Three critical design decisions here:

1. **Denormalized shipping address.** The order stores a snapshot of the address at the time of purchase. If the customer later updates their address, the order still shows where it was shipped.

2. **Denormalized product names in line items.** Same logic — if you rename a product, historical orders should show what the customer actually bought.

3. **Separate status history table.** Every status change is logged with who made it, when, and why. This audit trail is essential for customer service disputes, fraud investigation, and operational accountability.

## Order Listing with Search, Filters, and Pagination

The order listing page is the admin's primary workspace. It needs to handle thousands of orders efficiently. That means server-side filtering, search, and pagination — not loading everything into the browser:

```typescript
// src/routes/(admin)/admin/orders/+page.server.ts
import { db } from '$lib/server/db';
import { orders, orderItems } from '$lib/server/schema';
import { eq, desc, sql, and, or, ilike, gte, lte, count } from 'drizzle-orm';
import type { OrderStatus } from '$lib/server/order-transitions';

const PAGE_SIZE = 25;

export async function load({ url }) {
  // Parse all filter parameters from URL
  const statusFilter = url.searchParams.get('status') as OrderStatus | null;
  const search = url.searchParams.get('q')?.trim() || null;
  const dateFrom = url.searchParams.get('from');
  const dateTo = url.searchParams.get('to');
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const sortBy = url.searchParams.get('sort') || 'newest';

  // Build WHERE conditions dynamically
  const conditions = [];

  if (statusFilter) {
    conditions.push(eq(orders.status, statusFilter));
  }

  if (search) {
    // Search across order number, customer name, and email
    conditions.push(
      or(
        ilike(orders.orderNumber, `%${search}%`),
        ilike(orders.shippingName, `%${search}%`),
        ilike(orders.customerEmail, `%${search}%`)
      )!
    );
  }

  if (dateFrom) {
    conditions.push(gte(orders.createdAt, new Date(dateFrom)));
  }

  if (dateTo) {
    // Include the entire "to" day by adding one day
    const toDate = new Date(dateTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(orders.createdAt, toDate));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // Determine sort order
  const orderByClause = sortBy === 'oldest'
    ? orders.createdAt
    : sortBy === 'total-high'
      ? desc(orders.totalCents)
      : sortBy === 'total-low'
        ? orders.totalCents
        : desc(orders.createdAt); // default: newest

  // Execute the query with pagination
  const [allOrders, [{ total }]] = await Promise.all([
    db
      .select()
      .from(orders)
      .where(whereClause)
      .orderBy(orderByClause)
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),

    db
      .select({ total: count() })
      .from(orders)
      .where(whereClause)
  ]);

  // Get counts per status for filter badges (unaffected by current filter)
  const statusCounts = await db
    .select({
      status: orders.status,
      count: sql<number>`count(*)::int`
    })
    .from(orders)
    .groupBy(orders.status);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return {
    orders: allOrders,
    statusCounts,
    pagination: { page, totalPages, total, pageSize: PAGE_SIZE },
    filters: { status: statusFilter, search, dateFrom, dateTo, sort: sortBy }
  };
}
```

Two queries run in parallel using `Promise.all`: the paginated results and the total count. The total count uses the same `whereClause` so the pagination math is accurate for the current filter state. The status counts query runs separately and is *not* filtered — it always shows the global counts so admins can see the overall picture.

Now the component:

```svelte
<!-- src/routes/(admin)/admin/orders/+page.svelte -->
<script lang="ts">
  import { formatPrice, formatDate } from '$lib/utils/format';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  let { data } = $props();

  const statuses = [
    'pending', 'processing', 'on_hold', 'shipped',
    'delivered', 'completed', 'cancelled', 'refunded', 'returned'
  ];

  const statusColors: Record<string, string> = {
    pending:    'bg-yellow-100 text-yellow-700 border-yellow-200',
    processing: 'bg-blue-100 text-blue-700 border-blue-200',
    on_hold:    'bg-orange-100 text-orange-700 border-orange-200',
    shipped:    'bg-purple-100 text-purple-700 border-purple-200',
    delivered:  'bg-green-100 text-green-700 border-green-200',
    completed:  'bg-emerald-100 text-emerald-800 border-emerald-200',
    cancelled:  'bg-red-100 text-red-700 border-red-200',
    refunded:   'bg-gray-100 text-gray-700 border-gray-200',
    returned:   'bg-pink-100 text-pink-700 border-pink-200'
  };

  const statusLabels: Record<string, string> = {
    pending: 'Pending',
    processing: 'Processing',
    on_hold: 'On Hold',
    shipped: 'Shipped',
    delivered: 'Delivered',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    returned: 'Returned'
  };

  function getCount(status: string): number {
    const found = data.statusCounts.find((s) => s.status === status);
    return found?.count ?? 0;
  }

  function getTotalCount(): number {
    return data.statusCounts.reduce((sum, s) => sum + s.count, 0);
  }

  // Search with debounce
  let searchInput = $state(data.filters.search ?? '');
  let searchTimeout: ReturnType<typeof setTimeout>;

  function handleSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const params = new URLSearchParams(page.url.searchParams);
      if (searchInput) {
        params.set('q', searchInput);
      } else {
        params.delete('q');
      }
      params.delete('page'); // Reset to page 1 on new search
      goto(`/admin/orders?${params.toString()}`, { keepFocus: true });
    }, 300);
  }

  // Date range filter
  let dateFrom = $state(data.filters.dateFrom ?? '');
  let dateTo = $state(data.filters.dateTo ?? '');

  function applyDateFilter() {
    const params = new URLSearchParams(page.url.searchParams);
    if (dateFrom) params.set('from', dateFrom); else params.delete('from');
    if (dateTo) params.set('to', dateTo); else params.delete('to');
    params.delete('page');
    goto(`/admin/orders?${params.toString()}`);
  }

  function clearFilters() {
    searchInput = '';
    dateFrom = '';
    dateTo = '';
    goto('/admin/orders');
  }

  // Bulk selection
  let selectedIds = $state<Set<number>>(new Set());
  let selectAll = $state(false);

  function toggleSelectAll() {
    if (selectAll) {
      selectedIds = new Set(data.orders.map((o) => o.id));
    } else {
      selectedIds = new Set();
    }
  }

  function toggleOrder(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    selectedIds = next;
    selectAll = next.size === data.orders.length;
  }

  // Build pagination URL
  function pageUrl(p: number): string {
    const params = new URLSearchParams(page.url.searchParams);
    params.set('page', String(p));
    return `/admin/orders?${params.toString()}`;
  }
</script>

<div class="space-y-6">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-2xl font-bold">Orders</h1>
      <p class="text-sm text-gray-500 mt-1">
        {data.pagination.total} total orders
      </p>
    </div>
    <div class="flex gap-2">
      <a
        href="/admin/orders/export?{page.url.searchParams.toString()}"
        class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50
               transition-colors"
      >
        Export CSV
      </a>
    </div>
  </div>

  <!-- Search and date filters -->
  <div class="flex flex-wrap gap-4 items-end">
    <div class="flex-1 min-w-[200px]">
      <label for="search" class="block text-sm font-medium text-gray-700 mb-1">
        Search
      </label>
      <input
        id="search"
        type="text"
        placeholder="Order number, name, or email..."
        bind:value={searchInput}
        oninput={handleSearch}
        class="w-full border rounded-lg px-3 py-2 text-sm
               focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>

    <div>
      <label for="date-from" class="block text-sm font-medium text-gray-700 mb-1">
        From
      </label>
      <input
        id="date-from"
        type="date"
        bind:value={dateFrom}
        onchange={applyDateFilter}
        class="border rounded-lg px-3 py-2 text-sm"
      />
    </div>

    <div>
      <label for="date-to" class="block text-sm font-medium text-gray-700 mb-1">
        To
      </label>
      <input
        id="date-to"
        type="date"
        bind:value={dateTo}
        onchange={applyDateFilter}
        class="border rounded-lg px-3 py-2 text-sm"
      />
    </div>

    {#if data.filters.search || data.filters.dateFrom || data.filters.dateTo}
      <button
        onclick={clearFilters}
        class="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 underline"
      >
        Clear filters
      </button>
    {/if}
  </div>

  <!-- Status filter tabs -->
  <div class="flex gap-2 flex-wrap">
    <a
      href="/admin/orders"
      class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors
             {!data.filters.status
               ? 'bg-gray-900 text-white border-gray-900'
               : 'hover:bg-gray-100 border-gray-200'}"
    >
      All ({getTotalCount()})
    </a>
    {#each statuses as status}
      {@const count = getCount(status)}
      {#if count > 0 || status === data.filters.status}
        <a
          href="/admin/orders?status={status}"
          class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors
                 {data.filters.status === status
                   ? 'bg-gray-900 text-white border-gray-900'
                   : 'hover:bg-gray-100 border-gray-200'}"
        >
          {statusLabels[status]}
          <span class="ml-1 text-xs opacity-75">({count})</span>
        </a>
      {/if}
    {/each}
  </div>

  <!-- Bulk actions bar (visible when orders are selected) -->
  {#if selectedIds.size > 0}
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-4">
      <span class="text-sm font-medium text-blue-800">
        {selectedIds.size} order{selectedIds.size === 1 ? '' : 's'} selected
      </span>
      <form method="POST" action="?/bulkUpdateStatus" class="flex gap-2">
        <input type="hidden" name="orderIds" value={JSON.stringify([...selectedIds])} />
        <select
          name="status"
          class="border rounded px-2 py-1 text-sm"
        >
          <option value="">Change status to...</option>
          {#each statuses as status}
            <option value={status}>{statusLabels[status]}</option>
          {/each}
        </select>
        <button
          type="submit"
          class="bg-blue-600 text-white px-3 py-1 rounded text-sm
                 hover:bg-blue-700 transition-colors"
        >
          Apply
        </button>
      </form>
      <button
        onclick={() => { selectedIds = new Set(); selectAll = false; }}
        class="text-sm text-blue-600 hover:underline ml-auto"
      >
        Clear selection
      </button>
    </div>
  {/if}

  <!-- Orders table -->
  <div class="bg-white rounded-lg border overflow-hidden">
    <table class="w-full">
      <thead class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
        <tr>
          <th class="p-4 w-8">
            <input
              type="checkbox"
              bind:checked={selectAll}
              onchange={toggleSelectAll}
              class="rounded"
            />
          </th>
          <th class="p-4">Order</th>
          <th class="p-4">Customer</th>
          <th class="p-4">Items</th>
          <th class="p-4">Total</th>
          <th class="p-4">Status</th>
          <th class="p-4">Date</th>
          <th class="p-4">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        {#each data.orders as order (order.id)}
          <tr class="hover:bg-gray-50 transition-colors">
            <td class="p-4">
              <input
                type="checkbox"
                checked={selectedIds.has(order.id)}
                onchange={() => toggleOrder(order.id)}
                class="rounded"
              />
            </td>
            <td class="p-4">
              <a
                href="/admin/orders/{order.id}"
                class="font-medium text-blue-600 hover:underline"
              >
                {order.orderNumber}
              </a>
            </td>
            <td class="p-4">
              <div>
                <p class="text-sm font-medium text-gray-900">{order.shippingName}</p>
                <p class="text-xs text-gray-500">{order.customerEmail}</p>
              </div>
            </td>
            <td class="p-4 text-sm text-gray-500">
              {order.itemCount ?? '—'}
            </td>
            <td class="p-4 font-medium">{formatPrice(order.totalCents)}</td>
            <td class="p-4">
              <span
                class="px-2.5 py-1 text-xs font-medium rounded-full border
                       {statusColors[order.status]}"
              >
                {statusLabels[order.status]}
              </span>
            </td>
            <td class="p-4 text-sm text-gray-500">
              {formatDate(order.createdAt)}
            </td>
            <td class="p-4">
              <a
                href="/admin/orders/{order.id}"
                class="text-sm text-blue-600 hover:underline"
              >
                View
              </a>
            </td>
          </tr>
        {:else}
          <tr>
            <td colspan="8" class="p-8 text-center text-gray-400">
              No orders match your filters.
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if data.pagination.totalPages > 1}
    <nav class="flex items-center justify-between" aria-label="Order pagination">
      <p class="text-sm text-gray-500">
        Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}
        to {Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.total)}
        of {data.pagination.total} orders
      </p>
      <div class="flex gap-1">
        {#if data.pagination.page > 1}
          <a
            href={pageUrl(data.pagination.page - 1)}
            class="px-3 py-1 border rounded text-sm hover:bg-gray-50"
          >
            Previous
          </a>
        {/if}

        {#each Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1) as p}
          {#if p === 1 || p === data.pagination.totalPages || Math.abs(p - data.pagination.page) <= 2}
            <a
              href={pageUrl(p)}
              class="px-3 py-1 border rounded text-sm
                     {p === data.pagination.page
                       ? 'bg-gray-900 text-white border-gray-900'
                       : 'hover:bg-gray-50'}"
            >
              {p}
            </a>
          {:else if Math.abs(p - data.pagination.page) === 3}
            <span class="px-2 py-1 text-gray-400">...</span>
          {/if}
        {/each}

        {#if data.pagination.page < data.pagination.totalPages}
          <a
            href={pageUrl(data.pagination.page + 1)}
            class="px-3 py-1 border rounded text-sm hover:bg-gray-50"
          >
            Next
          </a>
        {/if}
      </div>
    </nav>
  {/if}
</div>
```

Notice the pagination uses ellipsis for large page ranges — showing pages 1, pages near the current page, and the last page. The search uses debounced client-side navigation with `goto()` so the URL always reflects the current filter state, making the state bookmarkable and shareable.

## Bulk Status Update Action

The listing page supports selecting multiple orders and updating their status at once. Here is the server action:

```typescript
// Add to src/routes/(admin)/admin/orders/+page.server.ts
export const actions = {
  bulkUpdateStatus: async ({ request, locals }) => {
    const formData = await request.formData();
    const orderIdsRaw = formData.get('orderIds') as string;
    const newStatus = formData.get('status') as OrderStatus;

    if (!newStatus) {
      return fail(400, { error: 'No status selected' });
    }

    let orderIds: number[];
    try {
      orderIds = JSON.parse(orderIdsRaw);
      if (!Array.isArray(orderIds) || orderIds.some((id) => typeof id !== 'number')) {
        throw new Error();
      }
    } catch {
      return fail(400, { error: 'Invalid order selection' });
    }

    // Fetch all selected orders to validate transitions
    const selectedOrders = await db
      .select({ id: orders.id, status: orders.status })
      .from(orders)
      .where(sql`${orders.id} IN ${orderIds}`);

    const results = { updated: 0, skipped: 0, errors: [] as string[] };

    for (const order of selectedOrders) {
      if (!canTransition(order.status as OrderStatus, newStatus)) {
        results.skipped++;
        results.errors.push(
          `Order #${order.id}: cannot transition from ${order.status} to ${newStatus}`
        );
        continue;
      }

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(orders.id, order.id));

        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          fromStatus: order.status as OrderStatus,
          toStatus: newStatus,
          changedBy: locals.user.id,
          reason: `Bulk update by admin`
        });
      });

      results.updated++;
    }

    return { success: true, ...results };
  }
};
```

Each order is updated inside a transaction so the status change and the audit log entry are atomic. If either fails, neither is committed. Invalid transitions are skipped with an error message, not silently ignored — the admin sees which orders could not be updated and why.

## Order Detail View with Audit Trail

The order detail page is where admins spend most of their time. It shows everything about an order: customer info, line items, payment details, shipping status, the audit trail, and actions to advance the lifecycle:

```typescript
// src/routes/(admin)/admin/orders/[id]/+page.server.ts
import { db } from '$lib/server/db';
import {
  orders, orderItems, orderStatusHistory, products
} from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { error, fail } from '@sveltejs/kit';
import { canTransition, getNextStatuses } from '$lib/server/order-transitions';

export async function load({ params }) {
  const orderId = Number(params.id);
  if (isNaN(orderId)) throw error(400, 'Invalid order ID');

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw error(404, 'Order not found');

  const [items, history] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        totalPriceCents: orderItems.totalPriceCents,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        sku: orderItems.sku,
        productId: orderItems.productId
      })
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId)),

    db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.createdAt))
  ]);

  const nextStatuses = getNextStatuses(order.status as any);

  return { order, items, history, nextStatuses };
}

export const actions = {
  updateStatus: async ({ request, params, locals }) => {
    const formData = await request.formData();
    const newStatus = formData.get('status') as string;
    const reason = (formData.get('reason') as string)?.trim() || null;
    const orderId = Number(params.id);

    // Fetch current order to validate transition
    const [order] = await db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) return fail(404, { error: 'Order not found' });

    if (!canTransition(order.status as any, newStatus as any)) {
      return fail(400, {
        error: `Cannot change status from "${order.status}" to "${newStatus}"`
      });
    }

    // Additional data for specific transitions
    const trackingNumber = formData.get('trackingNumber') as string | null;
    const trackingCarrier = formData.get('trackingCarrier') as string | null;

    await db.transaction(async (tx) => {
      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: new Date()
      };

      // Attach tracking info when shipping
      if (newStatus === 'shipped' && trackingNumber) {
        updateData.trackingNumber = trackingNumber;
        updateData.trackingCarrier = trackingCarrier;
        updateData.trackingUrl = buildTrackingUrl(trackingCarrier, trackingNumber);
      }

      await tx
        .update(orders)
        .set(updateData)
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        orderId,
        fromStatus: order.status as any,
        toStatus: newStatus as any,
        changedBy: locals.user.id,
        reason,
        metadata: trackingNumber ? { trackingNumber, trackingCarrier } : null
      });
    });

    // Trigger async side effects (email, inventory)
    // Do NOT await these — they should not block the response
    triggerStatusChangeEffects(orderId, order.status, newStatus).catch(console.error);

    return { success: true };
  },

  addNote: async ({ request, params, locals }) => {
    const formData = await request.formData();
    const note = (formData.get('note') as string)?.trim();
    const orderId = Number(params.id);

    if (!note) return fail(400, { error: 'Note cannot be empty' });

    // Append to existing notes with timestamp
    const [order] = await db
      .select({ adminNotes: orders.adminNotes })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] ${locals.user.name}: ${note}`;
    const updatedNotes = order?.adminNotes
      ? `${order.adminNotes}\n${entry}`
      : entry;

    await db
      .update(orders)
      .set({ adminNotes: updatedNotes, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    return { success: true };
  }
};

function buildTrackingUrl(
  carrier: string | null,
  trackingNumber: string
): string {
  const urls: Record<string, string> = {
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`
  };
  return carrier ? urls[carrier] ?? '' : '';
}
```

The `triggerStatusChangeEffects` function is deliberately not awaited. Sending emails and updating inventory should not block the admin's UI. If they fail, they fail in the background and get logged — the admin already sees the status change reflected immediately.

Now the detail page component:

```svelte
<!-- src/routes/(admin)/admin/orders/[id]/+page.svelte -->
<script lang="ts">
  import { formatPrice, formatDate, formatDateTime } from '$lib/utils/format';
  import { enhance } from '$app/forms';

  let { data } = $props();

  // Track which action panel is open
  let showShippingFields = $derived(
    data.nextStatuses.includes('shipped')
  );
</script>

<div class="max-w-5xl space-y-6">
  <!-- Breadcrumb -->
  <nav class="flex items-center gap-2 text-sm text-gray-500">
    <a href="/admin/orders" class="hover:text-gray-700">Orders</a>
    <span>/</span>
    <span class="text-gray-900 font-medium">{data.order.orderNumber}</span>
  </nav>

  <!-- Header with status and actions -->
  <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
    <div>
      <h1 class="text-2xl font-bold">
        Order {data.order.orderNumber}
      </h1>
      <p class="text-sm text-gray-500 mt-1">
        Placed {formatDateTime(data.order.createdAt)}
      </p>
    </div>

    {#if data.nextStatuses.length > 0}
      <form method="POST" action="?/updateStatus" use:enhance class="space-y-3">
        <div class="flex flex-wrap gap-2 items-end">
          <div>
            <label for="status" class="block text-xs font-medium text-gray-500 mb-1">
              Update Status
            </label>
            <select
              id="status"
              name="status"
              class="border rounded-lg px-3 py-2 text-sm"
            >
              {#each data.nextStatuses as status}
                <option value={status}>{status}</option>
              {/each}
            </select>
          </div>

          <div class="flex-1 min-w-[200px]">
            <label for="reason" class="block text-xs font-medium text-gray-500 mb-1">
              Reason (optional)
            </label>
            <input
              id="reason"
              name="reason"
              type="text"
              placeholder="e.g. Customer requested cancellation"
              class="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            class="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm
                   hover:bg-gray-800 transition-colors"
          >
            Update
          </button>
        </div>

        <!-- Shipping fields (shown when "shipped" is a valid next status) -->
        {#if showShippingFields}
          <div class="flex gap-2 p-3 bg-purple-50 rounded-lg border border-purple-100">
            <div>
              <label for="carrier" class="block text-xs font-medium text-gray-600 mb-1">
                Carrier
              </label>
              <select
                id="carrier"
                name="trackingCarrier"
                class="border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select...</option>
                <option value="usps">USPS</option>
                <option value="ups">UPS</option>
                <option value="fedex">FedEx</option>
                <option value="dhl">DHL</option>
              </select>
            </div>
            <div class="flex-1">
              <label for="tracking" class="block text-xs font-medium text-gray-600 mb-1">
                Tracking Number
              </label>
              <input
                id="tracking"
                name="trackingNumber"
                type="text"
                placeholder="Enter tracking number"
                class="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        {/if}
      </form>
    {/if}
  </div>

  <!-- Two-column layout -->
  <div class="grid gap-6 lg:grid-cols-3">
    <!-- Left: Order details (2 cols) -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Line items -->
      <div class="bg-white rounded-lg border overflow-hidden">
        <div class="px-6 py-4 border-b">
          <h2 class="font-semibold">Items</h2>
        </div>
        <table class="w-full">
          <thead class="bg-gray-50 text-left text-xs font-medium
                        text-gray-500 uppercase">
            <tr>
              <th class="px-6 py-3">Product</th>
              <th class="px-6 py-3">SKU</th>
              <th class="px-6 py-3 text-right">Price</th>
              <th class="px-6 py-3 text-right">Qty</th>
              <th class="px-6 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            {#each data.items as item}
              <tr>
                <td class="px-6 py-4">
                  <p class="font-medium text-sm">{item.productName}</p>
                  {#if item.variantName}
                    <p class="text-xs text-gray-500">{item.variantName}</p>
                  {/if}
                </td>
                <td class="px-6 py-4 text-sm text-gray-500">
                  {item.sku ?? '—'}
                </td>
                <td class="px-6 py-4 text-sm text-right">
                  {formatPrice(item.unitPriceCents)}
                </td>
                <td class="px-6 py-4 text-sm text-right">{item.quantity}</td>
                <td class="px-6 py-4 text-sm font-medium text-right">
                  {formatPrice(item.totalPriceCents)}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot class="border-t bg-gray-50">
            <tr>
              <td colspan="4" class="px-6 py-2 text-sm text-right text-gray-500">
                Subtotal
              </td>
              <td class="px-6 py-2 text-sm text-right">
                {formatPrice(data.order.subtotalCents)}
              </td>
            </tr>
            <tr>
              <td colspan="4" class="px-6 py-2 text-sm text-right text-gray-500">
                Shipping
              </td>
              <td class="px-6 py-2 text-sm text-right">
                {formatPrice(data.order.shippingCents)}
              </td>
            </tr>
            {#if data.order.taxCents > 0}
              <tr>
                <td colspan="4" class="px-6 py-2 text-sm text-right text-gray-500">
                  Tax
                </td>
                <td class="px-6 py-2 text-sm text-right">
                  {formatPrice(data.order.taxCents)}
                </td>
              </tr>
            {/if}
            {#if data.order.discountCents > 0}
              <tr>
                <td colspan="4" class="px-6 py-2 text-sm text-right text-green-600">
                  Discount
                </td>
                <td class="px-6 py-2 text-sm text-right text-green-600">
                  -{formatPrice(data.order.discountCents)}
                </td>
              </tr>
            {/if}
            <tr class="border-t">
              <td colspan="4" class="px-6 py-3 text-right font-bold">Total</td>
              <td class="px-6 py-3 text-right font-bold">
                {formatPrice(data.order.totalCents)}
              </td>
            </tr>
            {#if data.order.refundedCents > 0}
              <tr>
                <td colspan="4" class="px-6 py-2 text-right text-sm text-red-600">
                  Refunded
                </td>
                <td class="px-6 py-2 text-right text-sm text-red-600">
                  -{formatPrice(data.order.refundedCents)}
                </td>
              </tr>
            {/if}
          </tfoot>
        </table>
      </div>

      <!-- Audit trail -->
      <div class="bg-white rounded-lg border overflow-hidden">
        <div class="px-6 py-4 border-b">
          <h2 class="font-semibold">Status History</h2>
        </div>
        <div class="p-6">
          <ol class="relative border-l border-gray-200 ml-3 space-y-6">
            {#each data.history as entry}
              <li class="ml-6">
                <div class="absolute -left-2 w-4 h-4 rounded-full bg-gray-200 border-2
                            border-white"></div>
                <div class="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <span class="text-sm font-medium">
                    {entry.fromStatus ?? 'Created'}
                    &rarr;
                    {entry.toStatus}
                  </span>
                  <span class="text-xs text-gray-400">
                    {formatDateTime(entry.createdAt)}
                  </span>
                </div>
                {#if entry.reason}
                  <p class="text-sm text-gray-600 mt-1">{entry.reason}</p>
                {/if}
              </li>
            {/each}
          </ol>
        </div>
      </div>
    </div>

    <!-- Right sidebar -->
    <div class="space-y-6">
      <!-- Customer info -->
      <div class="bg-white rounded-lg border p-6">
        <h2 class="font-semibold mb-3">Customer</h2>
        <p class="text-sm font-medium">{data.order.shippingName}</p>
        <a
          href="mailto:{data.order.customerEmail}"
          class="text-sm text-blue-600 hover:underline"
        >
          {data.order.customerEmail}
        </a>
      </div>

      <!-- Shipping info -->
      <div class="bg-white rounded-lg border p-6">
        <h2 class="font-semibold mb-3">Shipping Address</h2>
        <div class="text-sm text-gray-600 space-y-0.5">
          <p>{data.order.shippingName}</p>
          <p>{data.order.shippingAddress}</p>
          <p>
            {data.order.shippingCity}, {data.order.shippingState}
            {data.order.shippingZip}
          </p>
          <p>{data.order.shippingCountry}</p>
        </div>
      </div>

      <!-- Tracking -->
      {#if data.order.trackingNumber}
        <div class="bg-white rounded-lg border p-6">
          <h2 class="font-semibold mb-3">Tracking</h2>
          <p class="text-sm text-gray-600">
            {data.order.trackingCarrier?.toUpperCase() ?? 'Carrier'}:
            {data.order.trackingNumber}
          </p>
          {#if data.order.trackingUrl}
            <a
              href={data.order.trackingUrl}
              target="_blank"
              rel="noopener"
              class="text-sm text-blue-600 hover:underline mt-1 inline-block"
            >
              Track package
            </a>
          {/if}
        </div>
      {/if}

      <!-- Payment info -->
      <div class="bg-white rounded-lg border p-6">
        <h2 class="font-semibold mb-3">Payment</h2>
        <div class="text-sm text-gray-600 space-y-1">
          <div class="flex justify-between">
            <span>Stripe Payment</span>
            {#if data.order.stripePaymentIntentId}
              <a
                href="https://dashboard.stripe.com/payments/{data.order.stripePaymentIntentId}"
                target="_blank"
                rel="noopener"
                class="text-blue-600 hover:underline"
              >
                View in Stripe
              </a>
            {/if}
          </div>
        </div>
      </div>

      <!-- Admin notes -->
      <div class="bg-white rounded-lg border p-6">
        <h2 class="font-semibold mb-3">Admin Notes</h2>
        {#if data.order.adminNotes}
          <pre class="text-sm text-gray-600 whitespace-pre-wrap font-sans mb-4">{data.order.adminNotes}</pre>
        {:else}
          <p class="text-sm text-gray-400 mb-4">No notes yet.</p>
        {/if}
        <form method="POST" action="?/addNote" use:enhance>
          <textarea
            name="note"
            rows="2"
            placeholder="Add a note..."
            class="w-full border rounded-lg px-3 py-2 text-sm resize-none"
          ></textarea>
          <button
            type="submit"
            class="mt-2 bg-gray-100 px-3 py-1.5 rounded text-sm
                   hover:bg-gray-200 transition-colors"
          >
            Add note
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
```

## Refund Processing

Refunds need to work with Stripe. You cannot just change a status — you need to actually return money through the payment processor and record what happened:

```typescript
// src/routes/(admin)/admin/orders/[id]/+page.server.ts
// Add this action alongside updateStatus and addNote

import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$env/static/private';

const stripe = new Stripe(STRIPE_SECRET_KEY);

// Inside export const actions = { ... }
  processRefund: async ({ request, params, locals }) => {
    const formData = await request.formData();
    const orderId = Number(params.id);
    const amountStr = formData.get('amount') as string;
    const reason = (formData.get('reason') as string)?.trim() || 'Requested by admin';

    const refundAmountCents = Math.round(parseFloat(amountStr) * 100);
    if (isNaN(refundAmountCents) || refundAmountCents <= 0) {
      return fail(400, { error: 'Invalid refund amount' });
    }

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) return fail(404, { error: 'Order not found' });
    if (!order.stripePaymentIntentId) {
      return fail(400, { error: 'No Stripe payment found for this order' });
    }

    const maxRefundable = order.totalCents - order.refundedCents;
    if (refundAmountCents > maxRefundable) {
      return fail(400, {
        error: `Maximum refundable amount is ${formatPrice(maxRefundable)}`
      });
    }

    // Process refund through Stripe
    try {
      const refund = await stripe.refunds.create({
        payment_intent: order.stripePaymentIntentId,
        amount: refundAmountCents,
        reason: 'requested_by_customer',
        metadata: {
          orderId: String(orderId),
          adminId: String(locals.user.id),
          adminReason: reason
        }
      });

      // Update order in our database
      const isFullRefund =
        order.refundedCents + refundAmountCents >= order.totalCents;

      await db.transaction(async (tx) => {
        await tx
          .update(orders)
          .set({
            refundedCents: order.refundedCents + refundAmountCents,
            status: isFullRefund ? 'refunded' : order.status,
            updatedAt: new Date()
          })
          .where(eq(orders.id, orderId));

        await tx.insert(orderStatusHistory).values({
          orderId,
          fromStatus: order.status as any,
          toStatus: isFullRefund ? 'refunded' : (order.status as any),
          changedBy: locals.user.id,
          reason: `Refund: ${formatPrice(refundAmountCents)} — ${reason}`,
          metadata: { stripeRefundId: refund.id, amountCents: refundAmountCents }
        });
      });

      return { success: true, refundId: refund.id };
    } catch (err) {
      const message = err instanceof Stripe.errors.StripeError
        ? err.message
        : 'Refund failed';
      return fail(500, { error: message });
    }
  }
```

The refund form on the detail page:

```svelte
<!-- Refund panel — add inside the right sidebar -->
{#if data.order.stripePaymentIntentId && !['cancelled', 'refunded'].includes(data.order.status)}
  <div class="bg-white rounded-lg border p-6">
    <h2 class="font-semibold mb-3 text-red-700">Process Refund</h2>
    <form method="POST" action="?/processRefund" use:enhance>
      <div class="space-y-3">
        <div>
          <label for="refund-amount" class="block text-xs font-medium text-gray-600 mb-1">
            Amount ($)
          </label>
          <input
            id="refund-amount"
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            max={(data.order.totalCents - data.order.refundedCents) / 100}
            placeholder={(data.order.totalCents - data.order.refundedCents) / 100 + ''}
            class="w-full border rounded-lg px-3 py-2 text-sm"
            required
          />
          <p class="text-xs text-gray-400 mt-1">
            Max: {formatPrice(data.order.totalCents - data.order.refundedCents)}
          </p>
        </div>
        <div>
          <label for="refund-reason" class="block text-xs font-medium text-gray-600 mb-1">
            Reason
          </label>
          <input
            id="refund-reason"
            name="reason"
            type="text"
            placeholder="Reason for refund"
            class="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          class="w-full bg-red-600 text-white px-4 py-2 rounded-lg text-sm
                 hover:bg-red-700 transition-colors"
          onclick={(e) => {
            if (!confirm('Are you sure you want to process this refund?')) {
              e.preventDefault();
            }
          }}
        >
          Process Refund
        </button>
      </div>
    </form>
  </div>
{/if}
```

## Email Notifications on Status Change

When an order status changes, the customer should be notified. Here is the notification dispatch system:

```typescript
// src/lib/server/order-notifications.ts
import { sendEmail } from '$lib/server/email';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

interface StatusEmailConfig {
  subject: (orderNumber: string) => string;
  template: string;
  includeTracking?: boolean;
}

const STATUS_EMAILS: Partial<Record<string, StatusEmailConfig>> = {
  processing: {
    subject: (num) => `Your order ${num} is being prepared`,
    template: 'order-processing'
  },
  shipped: {
    subject: (num) => `Your order ${num} has shipped!`,
    template: 'order-shipped',
    includeTracking: true
  },
  delivered: {
    subject: (num) => `Your order ${num} has been delivered`,
    template: 'order-delivered'
  },
  cancelled: {
    subject: (num) => `Your order ${num} has been cancelled`,
    template: 'order-cancelled'
  },
  refunded: {
    subject: (num) => `Refund processed for order ${num}`,
    template: 'order-refunded'
  }
};

export async function triggerStatusChangeEffects(
  orderId: number,
  fromStatus: string,
  toStatus: string
) {
  const emailConfig = STATUS_EMAILS[toStatus];
  if (!emailConfig) return; // Not all transitions warrant an email

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) return;

  const templateData: Record<string, unknown> = {
    orderNumber: order.orderNumber,
    customerName: order.shippingName,
    totalFormatted: `$${(order.totalCents / 100).toFixed(2)}`
  };

  if (emailConfig.includeTracking && order.trackingNumber) {
    templateData.trackingNumber = order.trackingNumber;
    templateData.trackingUrl = order.trackingUrl;
    templateData.trackingCarrier = order.trackingCarrier?.toUpperCase();
  }

  await sendEmail({
    to: order.customerEmail,
    subject: emailConfig.subject(order.orderNumber),
    template: emailConfig.template,
    data: templateData
  });
}
```

Not every status change needs an email — "on_hold" is internal. The configuration map explicitly declares which transitions trigger customer communication.

## CSV Export

Admins need to export order data for accounting, tax reporting, and business analysis. The export endpoint respects the same filters as the listing page:

```typescript
// src/routes/(admin)/admin/orders/export/+server.ts
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { desc, eq, and, ilike, gte, lte } from 'drizzle-orm';

export async function GET({ url }) {
  // Reuse the same filter logic as the listing page
  const statusFilter = url.searchParams.get('status');
  const search = url.searchParams.get('q');
  const dateFrom = url.searchParams.get('from');
  const dateTo = url.searchParams.get('to');

  const conditions = [];
  if (statusFilter) conditions.push(eq(orders.status, statusFilter as any));
  if (search) {
    conditions.push(
      ilike(orders.orderNumber, `%${search}%`)
    );
  }
  if (dateFrom) conditions.push(gte(orders.createdAt, new Date(dateFrom)));
  if (dateTo) {
    const toDate = new Date(dateTo);
    toDate.setDate(toDate.getDate() + 1);
    conditions.push(lte(orders.createdAt, toDate));
  }

  const allOrders = await db
    .select()
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt));

  // Build CSV
  const headers = [
    'Order Number', 'Customer', 'Email', 'Status',
    'Subtotal', 'Shipping', 'Tax', 'Discount', 'Total', 'Refunded',
    'Shipping Address', 'City', 'State', 'ZIP', 'Country',
    'Tracking Number', 'Created At'
  ];

  const rows = allOrders.map((o) => [
    o.orderNumber,
    `"${o.shippingName.replace(/"/g, '""')}"`,
    o.customerEmail,
    o.status,
    (o.subtotalCents / 100).toFixed(2),
    (o.shippingCents / 100).toFixed(2),
    (o.taxCents / 100).toFixed(2),
    (o.discountCents / 100).toFixed(2),
    (o.totalCents / 100).toFixed(2),
    (o.refundedCents / 100).toFixed(2),
    `"${o.shippingAddress.replace(/"/g, '""')}"`,
    o.shippingCity,
    o.shippingState,
    o.shippingZip,
    o.shippingCountry,
    o.trackingNumber ?? '',
    o.createdAt.toISOString()
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
}
```

The CSV wraps fields that might contain commas or quotes in double quotes and escapes internal quotes by doubling them. The `Content-Disposition` header tells the browser to download the file rather than display it.

## Revenue Analytics

Add revenue analytics to the admin dashboard so the admin sees business health at a glance:

```typescript
// src/routes/(admin)/admin/+page.server.ts
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { sql, and, gte, ne } from 'drizzle-orm';

export async function load() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const excludeCancelled = ne(orders.status, 'cancelled');

  const [
    dailyRevenue,
    summaryStats,
    previousPeriodStats,
    recentOrders,
    statusBreakdown
  ] = await Promise.all([
    // Revenue by day for chart
    db
      .select({
        date: sql<string>`date(${orders.createdAt})`,
        revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
        orderCount: sql<number>`count(*)::int`
      })
      .from(orders)
      .where(and(gte(orders.createdAt, thirtyDaysAgo), excludeCancelled))
      .groupBy(sql`date(${orders.createdAt})`)
      .orderBy(sql`date(${orders.createdAt})`),

    // Current period totals
    db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
        totalOrders: sql<number>`count(*)::int`,
        avgOrderValue: sql<number>`coalesce(avg(${orders.totalCents}), 0)::int`,
        totalRefunded: sql<number>`coalesce(sum(${orders.refundedCents}), 0)::int`
      })
      .from(orders)
      .where(and(gte(orders.createdAt, thirtyDaysAgo), excludeCancelled)),

    // Previous period for comparison
    db
      .select({
        totalRevenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
        totalOrders: sql<number>`count(*)::int`
      })
      .from(orders)
      .where(
        and(
          gte(orders.createdAt, sixtyDaysAgo),
          sql`${orders.createdAt} < ${thirtyDaysAgo}`,
          excludeCancelled
        )
      ),

    // 5 most recent orders for quick view
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        shippingName: orders.shippingName,
        totalCents: orders.totalCents,
        status: orders.status,
        createdAt: orders.createdAt
      })
      .from(orders)
      .orderBy(sql`${orders.createdAt} desc`)
      .limit(5),

    // Orders by status
    db
      .select({
        status: orders.status,
        count: sql<number>`count(*)::int`
      })
      .from(orders)
      .groupBy(orders.status)
  ]);

  // Calculate period-over-period changes
  const current = summaryStats[0];
  const previous = previousPeriodStats[0];
  const revenueChange = previous.totalRevenue > 0
    ? ((current.totalRevenue - previous.totalRevenue) / previous.totalRevenue) * 100
    : 0;
  const ordersChange = previous.totalOrders > 0
    ? ((current.totalOrders - previous.totalOrders) / previous.totalOrders) * 100
    : 0;

  return {
    dailyRevenue,
    summary: { ...current, revenueChange, ordersChange },
    recentOrders,
    statusBreakdown
  };
}
```

The dashboard component with summary cards and a revenue chart:

```svelte
<!-- src/routes/(admin)/admin/+page.svelte (analytics section) -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();

  const maxRevenue = Math.max(...data.dailyRevenue.map((d) => d.revenue), 1);
</script>

<!-- Summary cards -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  <div class="bg-white rounded-lg border p-6">
    <p class="text-sm text-gray-500">Revenue (30d)</p>
    <p class="text-2xl font-bold mt-1">
      {formatPrice(data.summary.totalRevenue)}
    </p>
    <p class="text-xs mt-1 {data.summary.revenueChange >= 0 ? 'text-green-600' : 'text-red-600'}">
      {data.summary.revenueChange >= 0 ? '+' : ''}{data.summary.revenueChange.toFixed(1)}%
      vs previous period
    </p>
  </div>

  <div class="bg-white rounded-lg border p-6">
    <p class="text-sm text-gray-500">Orders (30d)</p>
    <p class="text-2xl font-bold mt-1">{data.summary.totalOrders}</p>
    <p class="text-xs mt-1 {data.summary.ordersChange >= 0 ? 'text-green-600' : 'text-red-600'}">
      {data.summary.ordersChange >= 0 ? '+' : ''}{data.summary.ordersChange.toFixed(1)}%
      vs previous period
    </p>
  </div>

  <div class="bg-white rounded-lg border p-6">
    <p class="text-sm text-gray-500">Avg Order Value</p>
    <p class="text-2xl font-bold mt-1">
      {formatPrice(data.summary.avgOrderValue)}
    </p>
  </div>

  <div class="bg-white rounded-lg border p-6">
    <p class="text-sm text-gray-500">Refunded (30d)</p>
    <p class="text-2xl font-bold mt-1 text-red-600">
      {formatPrice(data.summary.totalRefunded)}
    </p>
  </div>
</div>

<!-- Revenue chart (simple bar chart) -->
<div class="bg-white rounded-lg border p-6 mb-8">
  <h2 class="font-semibold mb-4">Daily Revenue (Last 30 Days)</h2>
  <div class="flex items-end gap-px h-40">
    {#each data.dailyRevenue as day}
      <div
        class="flex-1 bg-gray-900 rounded-t hover:bg-blue-600 transition-colors
               relative group"
        style="height: {(day.revenue / maxRevenue) * 100}%"
      >
        <!-- Tooltip on hover -->
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2
                    hidden group-hover:block bg-gray-800 text-white text-xs
                    rounded px-2 py-1 whitespace-nowrap z-10">
          {day.date}: {formatPrice(day.revenue)} ({day.orderCount} orders)
        </div>
      </div>
    {/each}
  </div>
  <div class="flex justify-between text-xs text-gray-400 mt-2">
    <span>{data.dailyRevenue[0]?.date ?? ''}</span>
    <span>{data.dailyRevenue.at(-1)?.date ?? ''}</span>
  </div>
</div>

<!-- Recent orders quick view -->
<div class="bg-white rounded-lg border overflow-hidden">
  <div class="px-6 py-4 border-b flex items-center justify-between">
    <h2 class="font-semibold">Recent Orders</h2>
    <a href="/admin/orders" class="text-sm text-blue-600 hover:underline">
      View all
    </a>
  </div>
  <table class="w-full">
    <tbody class="divide-y divide-gray-100">
      {#each data.recentOrders as order}
        <tr class="hover:bg-gray-50">
          <td class="px-6 py-3">
            <a href="/admin/orders/{order.id}" class="text-sm font-medium text-blue-600 hover:underline">
              {order.orderNumber}
            </a>
          </td>
          <td class="px-6 py-3 text-sm">{order.shippingName}</td>
          <td class="px-6 py-3 text-sm font-medium">{formatPrice(order.totalCents)}</td>
          <td class="px-6 py-3">
            <span class="px-2 py-0.5 text-xs rounded-full bg-gray-100">{order.status}</span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## Shipping Integration Patterns

For production stores, you will integrate with a carrier API (EasyPost, ShipStation, Shippo) to generate labels, get real-time rates, and receive tracking updates. Here is the pattern:

```typescript
// src/lib/server/shipping.ts
// This is the integration layer — swap implementations for different carriers

interface ShippingRate {
  carrier: string;
  service: string;
  rateCents: number;
  estimatedDays: number;
}

interface ShipmentResult {
  trackingNumber: string;
  labelUrl: string;
  carrier: string;
}

export async function getRates(
  address: { zip: string; state: string; country: string },
  weightOz: number
): Promise<ShippingRate[]> {
  // Example with EasyPost — the actual API call depends on your provider
  const response = await fetch('https://api.easypost.com/v2/shipments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${EASYPOST_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      shipment: {
        to_address: { zip: address.zip, state: address.state, country: address.country },
        from_address: { /* your warehouse address */ },
        parcel: { weight: weightOz }
      }
    })
  });

  const data = await response.json();
  return data.rates.map((r: any) => ({
    carrier: r.carrier,
    service: r.service,
    rateCents: Math.round(parseFloat(r.rate) * 100),
    estimatedDays: r.est_delivery_days
  }));
}

export async function createShipment(
  rateId: string
): Promise<ShipmentResult> {
  // Buy the selected rate and get a label + tracking number
  const response = await fetch(`https://api.easypost.com/v2/shipments/${rateId}/buy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${EASYPOST_API_KEY}` }
  });

  const data = await response.json();
  return {
    trackingNumber: data.tracking_code,
    labelUrl: data.postage_label.label_url,
    carrier: data.selected_rate.carrier
  };
}
```

The carrier webhook for tracking updates:

```typescript
// src/routes/api/shipping-webhook/+server.ts
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { orders } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function POST({ request }) {
  const event = await request.json();

  // EasyPost sends tracking events
  if (event.description === 'tracker.updated') {
    const tracker = event.result;
    const trackingNumber = tracker.tracking_code;
    const status = tracker.status;

    // Map carrier status to our order status
    const statusMap: Record<string, string> = {
      delivered: 'delivered',
      in_transit: 'shipped',
      out_for_delivery: 'shipped'
    };

    const newStatus = statusMap[status];
    if (newStatus) {
      await db
        .update(orders)
        .set({ status: newStatus as any, updatedAt: new Date() })
        .where(eq(orders.trackingNumber, trackingNumber));
    }
  }

  return json({ received: true });
}
```

## Try It

1. **Status transition validation**: Add a visual indicator on the order detail page that shows which transitions are valid from the current status. Render the invalid transitions as grayed-out, disabled options with a tooltip explaining why they are not available (e.g., "Cannot ship a cancelled order").

2. **Order timeline**: Enhance the audit trail with icons for each transition type (a truck icon for "shipped," a check icon for "delivered," a ban icon for "cancelled"). Use Svelte's `{#if}` blocks to conditionally render different icons.

3. **Bulk export**: Modify the CSV export to include line items — each order row should repeat for every line item, adding product name, quantity, and unit price columns. This "flattened" format is what accountants expect.

4. **Order search autocomplete**: Add a search endpoint that returns matching orders as the admin types, using a debounced fetch. Display results in a dropdown below the search input with order number, customer name, and status. Handle keyboard navigation (arrow keys + Enter).

5. **Dashboard alerts**: Add an "Attention Required" section to the admin dashboard that shows orders in the "pending" status for more than 24 hours and orders in "on_hold" status. Use Drizzle's `lt()` operator with a date comparison.

## Key Takeaways

- Model order statuses as a state machine with explicit valid transitions — never allow arbitrary status changes
- Store every status change in a history table with who, when, and why — this audit trail is essential for customer service and dispute resolution
- Validate transitions server-side using a shared transition map, not just client-side UI constraints
- Use database transactions for status changes so the order update and audit log entry are atomic
- Process refunds through Stripe's API, not just in your database — update both and record the Stripe refund ID
- Build search with debounced client-side navigation and URL search params so filter state is bookmarkable
- Server-side pagination with total counts keeps the listing fast even with thousands of orders
- Email notifications should be fire-and-forget — do not let a failed email block the admin's status update
- CSV export reuses the same filter logic as the listing page so admins export exactly what they see
- Revenue analytics with period-over-period comparison gives admins immediate insight into business trends
- Shipping carrier integrations follow the same webhook pattern as Stripe — verify, process, acknowledge
