# Admin Layout

Every store needs a back office. In this lesson you will build protected admin routes that only authorized users can access, a responsive sidebar navigation layout with collapsible behavior, breadcrumb navigation, role-based access control with multiple permission levels, layout groups that separate admin from storefront, and a dashboard overview page with key business metrics and quick actions.

The admin panel is a completely separate experience from the storefront. It has its own layout, its own navigation, and its own security requirements. SvelteKit's route groups make this clean to implement. The mental model: the storefront is a public-facing showroom. The admin panel is the locked office behind the counter.

## Route Groups and File Structure

SvelteKit route groups let you apply different layouts to different sections of your app without affecting URLs. The `(admin)` group wraps admin routes in a sidebar layout, while the `(store)` group uses the storefront layout. Neither group name appears in the URL.

```
src/routes/
  (store)/
    +layout.svelte          ← storefront layout (header, footer)
    +page.svelte            ← homepage
    products/
      +page.svelte          ← product listing
  (admin)/
    admin/
      +layout.server.ts     ← auth guard (runs before every admin page)
      +layout.svelte        ← sidebar layout
      +page.svelte          ← dashboard
      products/
        +page.svelte        ← product listing
        new/+page.svelte    ← create product
        [id]/
          edit/+page.svelte ← edit product
      orders/
        +page.svelte        ← order listing
        [id]/+page.svelte   ← order detail
      categories/
        +page.svelte        ← category management
      settings/
        +page.svelte        ← admin settings
```

The URL `/admin/products` uses the admin sidebar layout. The URL `/products` uses the storefront layout. Both can exist without conflict because they live in different route groups.

## Protected Admin Routes

Use a layout server load function to guard every route under the admin group. This is the single security checkpoint — every admin page must pass through it:

```typescript
// src/routes/(admin)/admin/+layout.server.ts
import { redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function load({ locals }) {
  // Step 1: Check if the user is authenticated at all
  if (!locals.user) {
    throw redirect(303, '/auth/login?redirect=/admin');
  }

  // Step 2: Check if the user has admin privileges
  if (locals.user.role !== 'admin' && locals.user.role !== 'super_admin') {
    throw redirect(303, '/');
  }

  // Step 3: Fetch full user profile for the admin layout
  const [profile] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      avatarUrl: users.avatarUrl
    })
    .from(users)
    .where(eq(users.id, Number(locals.user.id)))
    .limit(1);

  return {
    user: {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      avatarUrl: profile.avatarUrl
    }
  };
}
```

This runs before every admin page loads. If the user is not logged in, they go to the login page with a redirect parameter so they come back to the admin after authentication. If they are logged in but not an admin, they go to the homepage. No admin content ever reaches unauthorized users.

### Why a Layout Load Function, Not a Hook

You could put the admin check in `hooks.server.ts` by checking the URL path. But a layout load function is better because:

1. It is colocated with the routes it protects — you see the guard right next to the routes it applies to.
2. It returns data (the admin user profile) that the layout component needs.
3. It does not run for non-admin routes, so there is no performance overhead for the storefront.
4. If you ever move the admin section to a different path, the guard moves with it.

## Admin Sidebar Layout

Build a layout with a persistent sidebar that collapses on mobile. This is the shell that wraps every admin page:

```svelte
<!-- src/routes/(admin)/admin/+layout.svelte -->
<script lang="ts">
  import { page } from '$app/state';
  import { fly } from 'svelte/transition';

  let { data, children } = $props();
  let sidebarOpen = $state(false);

  const navSections = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', href: '/admin', icon: 'chart-bar' },
        { label: 'Orders', href: '/admin/orders', icon: 'shopping-bag' },
        { label: 'Products', href: '/admin/products', icon: 'cube' },
        { label: 'Categories', href: '/admin/categories', icon: 'tag' }
      ]
    },
    {
      label: 'Management',
      items: [
        { label: 'Customers', href: '/admin/customers', icon: 'users' },
        { label: 'Discounts', href: '/admin/discounts', icon: 'ticket' },
        { label: 'Settings', href: '/admin/settings', icon: 'cog' }
      ]
    }
  ];

  function isActive(href: string): boolean {
    if (href === '/admin') return page.url.pathname === '/admin';
    return page.url.pathname.startsWith(href);
  }

  // Close sidebar when navigating on mobile
  $effect(() => {
    page.url.pathname;
    sidebarOpen = false;
  });
</script>

<div class="flex h-screen bg-gray-100">
  <!-- Mobile overlay -->
  {#if sidebarOpen}
    <div
      class="fixed inset-0 bg-black/50 z-30 lg:hidden"
      role="button"
      tabindex="-1"
      aria-label="Close sidebar"
      onclick={() => sidebarOpen = false}
      onkeydown={(e) => e.key === 'Escape' && (sidebarOpen = false)}
      transition:fly={{ duration: 200 }}
    ></div>
  {/if}

  <!-- Sidebar -->
  <aside
    class="fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white border-r
           flex flex-col transform transition-transform duration-200
           {sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
    aria-label="Admin navigation"
  >
    <!-- Brand / Logo -->
    <div class="p-6 border-b flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold">Store Admin</h1>
        <p class="text-sm text-gray-500 mt-1">{data.user.name}</p>
      </div>
      <button
        class="lg:hidden p-1 hover:bg-gray-100 rounded"
        onclick={() => sidebarOpen = false}
        aria-label="Close sidebar"
      >
        <span aria-hidden="true" class="text-xl">&times;</span>
      </button>
    </div>

    <!-- Navigation Sections -->
    <nav class="flex-1 overflow-y-auto p-4 space-y-6">
      {#each navSections as section}
        <div>
          <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3">
            {section.label}
          </h2>
          <div class="space-y-1">
            {#each section.items as item}
              <a
                href={item.href}
                class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                       {isActive(item.href)
                         ? 'bg-black text-white'
                         : 'text-gray-700 hover:bg-gray-100'}"
                aria-current={isActive(item.href) ? 'page' : undefined}
              >
                <span class="w-5 h-5 flex-shrink-0" aria-hidden="true">
                  <!-- Icon placeholder — replace with your icon component -->
                  &#9679;
                </span>
                {item.label}
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </nav>

    <!-- Sidebar Footer -->
    <div class="p-4 border-t space-y-2">
      <div class="flex items-center gap-3 px-3 py-2">
        {#if data.user.avatarUrl}
          <img
            src={data.user.avatarUrl}
            alt=""
            class="w-8 h-8 rounded-full object-cover"
          />
        {:else}
          <div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-sm font-bold">
            {data.user.name.charAt(0).toUpperCase()}
          </div>
        {/if}
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">{data.user.name}</p>
          <p class="text-xs text-gray-500 truncate">{data.user.email}</p>
        </div>
      </div>
      <a
        href="/"
        class="flex items-center gap-3 px-3 py-2 text-sm text-gray-500
               hover:text-black hover:bg-gray-100 rounded-lg transition-colors"
      >
        <span aria-hidden="true">&larr;</span>
        Back to Store
      </a>
    </div>
  </aside>

  <!-- Main Content Area -->
  <div class="flex-1 flex flex-col min-w-0">
    <!-- Top Bar -->
    <header class="bg-white border-b px-4 lg:px-8 py-4 flex items-center gap-4">
      <button
        class="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
        onclick={() => sidebarOpen = true}
        aria-label="Open sidebar"
      >
        <span aria-hidden="true" class="text-xl">&#9776;</span>
      </button>

      <!-- Breadcrumbs -->
      <Breadcrumbs />
    </header>

    <!-- Page Content -->
    <main class="flex-1 overflow-y-auto p-4 lg:p-8">
      {@render children()}
    </main>
  </div>
</div>
```

### Key Architecture Decisions

1. **Fixed sidebar on desktop, overlay on mobile.** The sidebar is `position: fixed` on small screens and `position: static` on large screens (`lg:static`). On mobile, it slides in from the left with a backdrop overlay.

2. **Auto-close on navigation.** The `$effect` watches `page.url.pathname` and closes the sidebar whenever the user navigates. Without this, the mobile sidebar stays open after clicking a link.

3. **Grouped navigation.** Navigation items are organized into sections with labels. This scales to admin panels with many sections without creating an unmanageable flat list.

4. **aria-current for active state.** Screen readers announce `aria-current="page"` so visually impaired users know which page they are on.

## Breadcrumb Navigation

Breadcrumbs help admin users understand where they are in the hierarchy. Derive breadcrumbs from the current URL:

```svelte
<!-- src/lib/components/admin/Breadcrumbs.svelte -->
<script lang="ts">
  import { page } from '$app/state';

  // Map URL segments to human-readable labels
  const labelMap: Record<string, string> = {
    admin: 'Dashboard',
    products: 'Products',
    orders: 'Orders',
    categories: 'Categories',
    customers: 'Customers',
    settings: 'Settings',
    discounts: 'Discounts',
    new: 'New',
    edit: 'Edit'
  };

  let crumbs = $derived.by(() => {
    const segments = page.url.pathname.split('/').filter(Boolean);
    const items: Array<{ label: string; href: string }> = [];

    let path = '';
    for (const segment of segments) {
      path += `/${segment}`;
      // Skip numeric IDs in the breadcrumb labels
      const label = labelMap[segment] ?? (
        /^\d+$/.test(segment) ? `#${segment}` : segment
      );
      items.push({ label, href: path });
    }

    return items;
  });
</script>

<nav aria-label="Breadcrumb">
  <ol class="flex items-center gap-2 text-sm text-gray-500">
    {#each crumbs as crumb, i}
      {#if i > 0}
        <li aria-hidden="true" class="text-gray-300">/</li>
      {/if}
      <li>
        {#if i === crumbs.length - 1}
          <span class="text-gray-900 font-medium" aria-current="page">
            {crumb.label}
          </span>
        {:else}
          <a href={crumb.href} class="hover:text-gray-900 transition-colors">
            {crumb.label}
          </a>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
```

The last breadcrumb is the current page, displayed as plain text with `aria-current="page"`. All other breadcrumbs are links. Numeric segments (like product IDs) are prefixed with `#` for readability.

## Role-Based Access Control

A simple admin/not-admin check works for small stores, but production applications often need finer-grained permissions. Define a role hierarchy with specific capabilities:

```typescript
// src/lib/server/permissions.ts
export const roles = {
  super_admin: {
    label: 'Super Admin',
    permissions: [
      'products:read', 'products:write', 'products:delete',
      'orders:read', 'orders:write', 'orders:refund',
      'categories:read', 'categories:write', 'categories:delete',
      'customers:read', 'customers:write',
      'discounts:read', 'discounts:write', 'discounts:delete',
      'settings:read', 'settings:write',
      'users:read', 'users:write', 'users:promote'
    ]
  },
  admin: {
    label: 'Admin',
    permissions: [
      'products:read', 'products:write',
      'orders:read', 'orders:write', 'orders:refund',
      'categories:read', 'categories:write',
      'customers:read',
      'discounts:read', 'discounts:write',
      'settings:read'
    ]
  },
  editor: {
    label: 'Editor',
    permissions: [
      'products:read', 'products:write',
      'categories:read', 'categories:write',
      'orders:read'
    ]
  }
} as const;

export type Role = keyof typeof roles;
export type Permission = (typeof roles)[Role]['permissions'][number];

export function hasPermission(role: Role, permission: Permission): boolean {
  return (roles[role]?.permissions as readonly string[])?.includes(permission) ?? false;
}

export function requirePermission(role: string, permission: Permission): void {
  if (!hasPermission(role as Role, permission)) {
    throw new Error(`Role "${role}" does not have permission "${permission}"`);
  }
}
```

### Server-Side Permission Checks

Check permissions in load functions and form actions:

```typescript
// src/routes/(admin)/admin/products/new/+page.server.ts
import { error } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/permissions';

export async function load({ parent }) {
  const { user } = await parent();

  if (!hasPermission(user.role, 'products:write')) {
    throw error(403, 'You do not have permission to create products');
  }

  const categories = await db.select().from(categoriesTable);
  return { categories };
}
```

### Client-Side Permission-Based UI

Pass the user's role to the layout and conditionally render UI elements. This is a UX optimization — the server-side check is the real security boundary:

```svelte
<!-- In the admin layout or a child page -->
<script lang="ts">
  import { hasPermission, type Permission } from '$lib/server/permissions';

  let { data } = $props();

  function can(permission: Permission): boolean {
    return hasPermission(data.user.role, permission);
  }
</script>

<!-- Only show the "Add Product" button if the user can create products -->
{#if can('products:write')}
  <a href="/admin/products/new" class="btn-primary">Add Product</a>
{/if}

<!-- Only show the delete button if the user can delete products -->
{#if can('products:delete')}
  <form method="POST" action="?/delete">
    <button type="submit" class="btn-danger">Delete</button>
  </form>
{/if}

<!-- Show settings link only if readable -->
{#if can('settings:read')}
  <a href="/admin/settings">Settings</a>
{/if}
```

Important: never rely solely on hiding UI elements for security. A user can always submit a form directly or call an API endpoint. The server-side permission check in the form action or load function is what actually enforces access control.

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

Run this script during development. In production, you would typically seed the first admin account during deployment and build an admin user management page for subsequent promotions.

### Admin User Management Page

For super admins to manage other admin users:

```typescript
// src/routes/(admin)/admin/settings/users/+page.server.ts
import { db } from '$lib/server/db';
import { users } from '$lib/server/schema';
import { error, fail } from '@sveltejs/kit';
import { hasPermission } from '$lib/server/permissions';
import { eq } from 'drizzle-orm';

export async function load({ parent }) {
  const { user } = await parent();
  if (!hasPermission(user.role, 'users:read')) {
    throw error(403, 'Insufficient permissions');
  }

  const adminUsers = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt
    })
    .from(users)
    .where(
      // Only show users who have an admin role
      sql`${users.role} IN ('admin', 'editor', 'super_admin')`
    );

  return { adminUsers };
}

export const actions = {
  updateRole: async ({ request, locals, parent }) => {
    const { user } = await parent();
    if (!hasPermission(user.role, 'users:promote')) {
      throw error(403, 'Insufficient permissions');
    }

    const data = await request.formData();
    const userId = Number(data.get('userId'));
    const newRole = data.get('role') as string;

    // Prevent demoting yourself
    if (userId === user.id) {
      return fail(400, { error: 'You cannot change your own role' });
    }

    // Prevent creating super_admins unless you are one
    if (newRole === 'super_admin' && user.role !== 'super_admin') {
      return fail(400, { error: 'Only super admins can promote to super admin' });
    }

    await db.update(users).set({ role: newRole }).where(eq(users.id, userId));
  }
};
```

## Dashboard Overview

Show key metrics on the admin home page. This is the first thing admins see when they log in — it should give them an at-a-glance understanding of business health:

```typescript
// src/routes/(admin)/admin/+page.server.ts
import { db } from '$lib/server/db';
import { orders, products, users, orderItems } from '$lib/server/schema';
import { sql, eq, gte, and } from 'drizzle-orm';

export async function load() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Overall stats
  const [overallStats] = await db.select({
    totalRevenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
    totalOrders: sql<number>`count(${orders.id})`,
  }).from(orders);

  // Last 30 days stats (for trend comparison)
  const [monthStats] = await db.select({
    revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
    orderCount: sql<number>`count(${orders.id})`,
  }).from(orders).where(gte(orders.createdAt, thirtyDaysAgo));

  // Last 7 days stats
  const [weekStats] = await db.select({
    revenue: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
    orderCount: sql<number>`count(${orders.id})`,
  }).from(orders).where(gte(orders.createdAt, sevenDaysAgo));

  const [productCount] = await db.select({
    total: sql<number>`count(*)`,
    inStock: sql<number>`count(*) filter (where ${products.inStock} = true)`,
    outOfStock: sql<number>`count(*) filter (where ${products.inStock} = false)`
  }).from(products);

  const [customerCount] = await db.select({
    count: sql<number>`count(*)`
  }).from(users).where(eq(users.role, 'customer'));

  const recentOrders = await db
    .select()
    .from(orders)
    .orderBy(sql`${orders.createdAt} desc`)
    .limit(10);

  // Low stock alert: products with fewer than 5 items
  const lowStockProducts = await db
    .select({
      id: products.id,
      name: products.name,
      stock: products.stockCount
    })
    .from(products)
    .where(
      and(
        eq(products.inStock, true),
        sql`${products.stockCount} < 5`
      )
    )
    .limit(5);

  return {
    stats: {
      revenue: overallStats.totalRevenue,
      orders: overallStats.totalOrders,
      products: productCount.total,
      inStock: productCount.inStock,
      outOfStock: productCount.outOfStock,
      customers: customerCount.count,
      monthRevenue: monthStats.revenue,
      monthOrders: monthStats.orderCount,
      weekRevenue: weekStats.revenue,
      weekOrders: weekStats.orderCount
    },
    recentOrders,
    lowStockProducts
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

<!-- Key Metrics -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Total Revenue</p>
    <p class="text-2xl font-bold mt-1">{formatPrice(data.stats.revenue)}</p>
    <p class="text-xs text-green-600 mt-2">
      {formatPrice(data.stats.monthRevenue)} this month
    </p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Orders</p>
    <p class="text-2xl font-bold mt-1">{data.stats.orders}</p>
    <p class="text-xs text-gray-500 mt-2">
      {data.stats.weekOrders} this week
    </p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Products</p>
    <p class="text-2xl font-bold mt-1">{data.stats.products}</p>
    <p class="text-xs mt-2">
      <span class="text-green-600">{data.stats.inStock} in stock</span>
      {#if data.stats.outOfStock > 0}
        <span class="text-red-600 ml-2">{data.stats.outOfStock} out</span>
      {/if}
    </p>
  </div>
  <div class="bg-white p-6 rounded-lg border">
    <p class="text-sm text-gray-500">Customers</p>
    <p class="text-2xl font-bold mt-1">{data.stats.customers}</p>
  </div>
</div>

<!-- Quick Actions -->
<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
  <a
    href="/admin/products/new"
    class="bg-white border-2 border-dashed border-gray-300 p-6 rounded-lg
           text-center hover:border-black hover:bg-gray-50 transition-colors group"
  >
    <span class="text-3xl block mb-2 group-hover:scale-110 transition-transform">+</span>
    <span class="font-semibold">Add New Product</span>
    <span class="text-sm text-gray-500 block mt-1">Create a new product listing</span>
  </a>
  <a
    href="/admin/orders"
    class="bg-white border-2 border-dashed border-gray-300 p-6 rounded-lg
           text-center hover:border-black hover:bg-gray-50 transition-colors group"
  >
    <span class="text-3xl block mb-2">&#128230;</span>
    <span class="font-semibold">View All Orders</span>
    <span class="text-sm text-gray-500 block mt-1">Manage and fulfill orders</span>
  </a>
  <a
    href="/admin/categories"
    class="bg-white border-2 border-dashed border-gray-300 p-6 rounded-lg
           text-center hover:border-black hover:bg-gray-50 transition-colors group"
  >
    <span class="text-3xl block mb-2">&#127991;</span>
    <span class="font-semibold">Manage Categories</span>
    <span class="text-sm text-gray-500 block mt-1">Organize your product catalog</span>
  </a>
</div>

<!-- Low Stock Alerts -->
{#if data.lowStockProducts.length > 0}
  <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-8">
    <h2 class="font-semibold text-yellow-800 mb-2">Low Stock Alert</h2>
    <ul class="space-y-1">
      {#each data.lowStockProducts as product}
        <li class="flex justify-between text-sm">
          <a href="/admin/products/{product.id}/edit"
             class="text-yellow-800 hover:underline">
            {product.name}
          </a>
          <span class="text-yellow-600 font-medium">{product.stock} remaining</span>
        </li>
      {/each}
    </ul>
  </div>
{/if}

<!-- Recent Orders Table -->
<div class="bg-white rounded-lg border">
  <div class="p-4 border-b flex items-center justify-between">
    <h2 class="font-semibold">Recent Orders</h2>
    <a href="/admin/orders" class="text-sm text-blue-600 hover:underline">
      View all &rarr;
    </a>
  </div>
  <div class="overflow-x-auto">
    <table class="w-full">
      <thead class="bg-gray-50 text-left text-sm text-gray-500">
        <tr>
          <th class="p-4">Order ID</th>
          <th class="p-4">Customer</th>
          <th class="p-4">Total</th>
          <th class="p-4">Status</th>
          <th class="p-4">Date</th>
        </tr>
      </thead>
      <tbody>
        {#each data.recentOrders as order}
          <tr class="border-t hover:bg-gray-50">
            <td class="p-4">
              <a href="/admin/orders/{order.id}" class="text-blue-600 hover:underline">
                #{order.id}
              </a>
            </td>
            <td class="p-4">{order.shippingName}</td>
            <td class="p-4">{formatPrice(order.totalCents)}</td>
            <td class="p-4">
              <span class="px-2 py-1 text-xs rounded-full
                           {order.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            order.status === 'shipped' ? 'bg-blue-100 text-blue-700' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'}">
                {order.status}
              </span>
            </td>
            <td class="p-4 text-sm text-gray-500">
              {new Date(order.createdAt).toLocaleDateString()}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>
```

## Responsive Sidebar: Collapsible Mode

For desktop users who want more screen real estate, add a collapsed mode that shows only icons:

```svelte
<!-- Enhanced sidebar with collapse toggle -->
<script lang="ts">
  let collapsed = $state(false);

  function toggleCollapse() {
    collapsed = !collapsed;
  }
</script>

<aside
  class="fixed lg:static inset-y-0 left-0 z-40 bg-white border-r flex flex-col
         transition-all duration-200
         {collapsed ? 'w-16' : 'w-64'}
         {sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}"
>
  <!-- Collapse toggle (desktop only) -->
  <button
    class="hidden lg:block absolute -right-3 top-6 w-6 h-6 bg-white border
           rounded-full shadow-sm flex items-center justify-center
           hover:bg-gray-50 transition-colors"
    onclick={toggleCollapse}
    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
  >
    <span class="text-xs">{collapsed ? '>' : '<'}</span>
  </button>

  <nav class="flex-1 overflow-y-auto p-2 space-y-1">
    {#each navSections as section}
      {#if !collapsed}
        <h2 class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-3 mt-4">
          {section.label}
        </h2>
      {/if}
      {#each section.items as item}
        <a
          href={item.href}
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                 {collapsed ? 'justify-center' : ''}
                 {isActive(item.href) ? 'bg-black text-white' : 'text-gray-700 hover:bg-gray-100'}"
          title={collapsed ? item.label : undefined}
          aria-current={isActive(item.href) ? 'page' : undefined}
        >
          <span class="w-5 h-5 flex-shrink-0" aria-hidden="true">&#9679;</span>
          {#if !collapsed}
            <span>{item.label}</span>
          {/if}
        </a>
      {/each}
    {/each}
  </nav>
</aside>
```

When collapsed, the sidebar shrinks to 64px and shows only icons. Hovering over an icon shows a tooltip with the page name. The content area automatically expands to fill the freed space because the sidebar width transition is applied via CSS.

## Page Title Management

Each admin page should set a descriptive title. Use `<svelte:head>` in each page:

```svelte
<!-- src/routes/(admin)/admin/products/+page.svelte -->
<svelte:head>
  <title>Products - Store Admin</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Products</h1>
<!-- ... -->
```

For a more systematic approach, derive the title from the breadcrumb data:

```svelte
<!-- In +layout.svelte -->
<svelte:head>
  <title>
    {page.url.pathname === '/admin'
      ? 'Dashboard'
      : page.url.pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ')
    } - Store Admin
  </title>
</svelte:head>
```

## Try It

1. Add a "quick actions" section to the dashboard with buttons for "Add New Product," "View All Orders," and "Manage Categories." Each button should link to its respective admin page. Style them as prominent action cards, not plain text links.

2. Build a notification badge on the "Orders" sidebar link that shows the count of pending orders. Fetch this count in the layout's load function. When a new order comes in and the admin navigates, the badge updates automatically.

3. Add keyboard shortcut support to the admin sidebar: pressing `Ctrl+B` toggles the collapsed state, and pressing `Escape` closes the mobile sidebar. Use a Svelte action or `$effect` to listen for keydown events on `document`.

## Key Takeaways

- Protect admin routes with a layout server load function that checks both authentication and authorization before any page content loads
- Role-based access uses a permissions system checked server-side — never rely on hiding UI elements alone for security
- SvelteKit route groups `(admin)` let you have a completely separate layout without affecting URLs
- The admin sidebar layout uses flexbox with a fixed-width sidebar and a scrollable content area, collapsing to an overlay on mobile
- Auto-close the mobile sidebar on navigation using an `$effect` that watches `page.url.pathname`
- Breadcrumbs derive from the URL path segments and provide both navigation context and accessible landmarks
- Dashboard metrics give admins an at-a-glance view of business health using aggregate SQL queries with time-period comparisons
- A collapsible sidebar gives power users more screen real estate while keeping navigation accessible via icon tooltips
- Quick actions and low-stock alerts on the dashboard surface actionable information immediately
