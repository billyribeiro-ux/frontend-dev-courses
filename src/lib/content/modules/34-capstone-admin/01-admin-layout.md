# Admin Layout

Every store needs a back office. In this lesson you will build protected admin routes that only authorized users can access, a sidebar navigation layout, role-based access control, and a dashboard overview page with key business metrics.

The admin panel is a completely separate experience from the storefront. It has its own layout, its own navigation, and its own security requirements. SvelteKit's route groups make this clean to implement.

## Protected Admin Routes

Use a layout server load function to guard every route under the admin group:

```typescript
// src/routes/(admin)/admin/+layout.server.ts
import { redirect } from '@sveltejs/kit';

export async function load({ locals }) {
  if (!locals.user) {
    throw redirect(303, '/auth/login?redirect=/admin');
  }

  if (locals.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  return {
    user: {
      name: locals.user.name,
      email: locals.user.email,
      role: locals.user.role
    }
  };
}
```

This runs before every admin page loads. If the user is not logged in, they go to the login page. If they are logged in but not an admin, they go to the homepage. No admin content ever reaches unauthorized users.

## Admin Sidebar Layout

Build a layout with a persistent sidebar and a content area:

```svelte
<!-- src/routes/(admin)/admin/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  let { data, children } = $props();

  const navItems = [
    { label: 'Dashboard', href: '/admin', icon: 'chart' },
    { label: 'Products', href: '/admin/products', icon: 'box' },
    { label: 'Orders', href: '/admin/orders', icon: 'receipt' },
    { label: 'Categories', href: '/admin/categories', icon: 'tag' }
  ];

  function isActive(href: string): boolean {
    if (href === '/admin') return $page.url.pathname === '/admin';
    return $page.url.pathname.startsWith(href);
  }
</script>

<div class="flex h-screen bg-gray-100">
  <!-- Sidebar -->
  <aside class="w-64 bg-white border-r flex flex-col">
    <div class="p-6 border-b">
      <h1 class="text-xl font-bold">Store Admin</h1>
      <p class="text-sm text-gray-500 mt-1">{data.user.name}</p>
    </div>

    <nav class="flex-1 p-4 space-y-1">
      {#each navItems as item}
        <a href={item.href}
           class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors
                  {isActive(item.href) ? 'bg-black text-white' : 'hover:bg-gray-100'}">
          {item.label}
        </a>
      {/each}
    </nav>

    <div class="p-4 border-t">
      <a href="/" class="text-sm text-gray-500 hover:text-black">
        Back to Store
      </a>
    </div>
  </aside>

  <!-- Main Content -->
  <main class="flex-1 overflow-y-auto">
    <div class="p-8">
      {@render children()}
    </div>
  </main>
</div>
```

## Role-Based Access in the Database

Your `users` table already has a `role` column from the database design lesson. Here is how to promote a user to admin:

```typescript
// scripts/make-admin.ts
import { db } from '../src/lib/server/db';
import { users } from '../src/lib/server/schema';
import { eq } from 'drizzle-orm';

async function makeAdmin(email: string) {
  await db
    .update(users)
    .set({ role: 'admin' })
    .where(eq(users.email, email));

  console.log(`${email} is now an admin`);
}

makeAdmin('your-email@example.com');
```

Run this script during development. In production, you would typically seed the first admin account during deployment and build an admin user management page later.

## Dashboard Overview

Show key metrics on the admin home page:

```typescript
// src/routes/(admin)/admin/+page.server.ts
import { db } from '$lib/server/db';
import { orders, products, users } from '$lib/server/schema';
import { sql, eq } from 'drizzle-orm';

export async function load() {
  const [stats] = await db.select({
    totalRevenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
    totalOrders: sql<number>`count(${orders.id})`,
  }).from(orders);

  const [productCount] = await db.select({
    count: sql<number>`count(*)`
  }).from(products);

  const [customerCount] = await db.select({
    count: sql<number>`count(*)`
  }).from(users).where(eq(users.role, 'customer'));

  const recentOrders = await db
    .select()
    .from(orders)
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(5);

  return {
    stats: {
      revenue: stats.totalRevenue,
      orders: stats.totalOrders,
      products: productCount.count,
      customers: customerCount.count
    },
    recentOrders
  };
}
```

```svelte
<!-- src/routes/(admin)/admin/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();
</script>

<h1 class="text-2xl font-bold mb-6">Dashboard</h1>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Total Revenue</p>
    <p class="text-2xl font-bold mt-1">{formatPrice(data.stats.revenue)}</p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Orders</p>
    <p class="text-2xl font-bold mt-1">{data.stats.orders}</p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Products</p>
    <p class="text-2xl font-bold mt-1">{data.stats.products}</p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Customers</p>
    <p class="text-2xl font-bold mt-1">{data.stats.customers}</p>
  </div>
</div>

<div class="bg-white rounded-lg border">
  <div class="p-4 border-b">
    <h2 class="font-semibold">Recent Orders</h2>
  </div>
  <table class="w-full">
    <thead class="bg-gray-50 text-left text-sm text-gray-500">
      <tr>
        <th class="p-4">Order ID</th>
        <th class="p-4">Customer</th>
        <th class="p-4">Total</th>
        <th class="p-4">Status</th>
      </tr>
    </thead>
    <tbody>
      {#each data.recentOrders as order}
        <tr class="border-t">
          <td class="p-4">#{order.id}</td>
          <td class="p-4">{order.shippingName}</td>
          <td class="p-4">{formatPrice(order.totalCents)}</td>
          <td class="p-4">
            <span class="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
              {order.status}
            </span>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## Try It

Add a "quick actions" section to the dashboard with buttons for "Add New Product," "View All Orders," and "Manage Categories." Each button should link to its respective admin page. Style them as prominent action cards, not plain text links.

## Key Takeaways

- Protect admin routes with a layout server load function that checks both authentication and authorization
- Role-based access uses the `role` column in your users table — check it server-side, never client-side only
- SvelteKit route groups `(admin)` let you have a completely separate layout without affecting URLs
- The admin sidebar layout uses flexbox with a fixed-width sidebar and a scrollable content area
- Dashboard metrics give admins an at-a-glance view of business health using aggregate SQL queries
