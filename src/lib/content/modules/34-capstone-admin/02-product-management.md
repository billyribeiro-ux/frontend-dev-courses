# Product Management

The admin panel needs full CRUD (Create, Read, Update, Delete) capabilities for products. In this lesson you will build a product listing table with sorting, filtering, and pagination, a product creation and editing form with image upload, product variant management (sizes, colors), inventory tracking, bulk operations (delete, status toggle), and category management. This is the tool that keeps your store stocked.

Every form action validates data server-side with Zod and uses progressive enhancement so the interface works smoothly with or without JavaScript.

## Product Listing Table with Sorting and Filtering

Display all products in a sortable, filterable admin table with pagination:

```typescript
// src/routes/(admin)/admin/products/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { eq, like, sql, asc, desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page') ?? '1');
  const perPage = Number(url.searchParams.get('perPage') ?? '20');
  const search = url.searchParams.get('search') ?? '';
  const categoryId = url.searchParams.get('category') ?? '';
  const sortBy = url.searchParams.get('sort') ?? 'createdAt';
  const sortDir = url.searchParams.get('dir') ?? 'desc';
  const stockFilter = url.searchParams.get('stock') ?? 'all'; // 'all' | 'in' | 'out' | 'low'

  // Build where conditions dynamically
  const conditions = [];

  if (search) {
    conditions.push(like(products.name, `%${search}%`));
  }
  if (categoryId) {
    conditions.push(eq(products.categoryId, Number(categoryId)));
  }
  if (stockFilter === 'in') {
    conditions.push(eq(products.inStock, true));
  } else if (stockFilter === 'out') {
    conditions.push(eq(products.inStock, false));
  } else if (stockFilter === 'low') {
    conditions.push(sql`${products.stockCount} BETWEEN 1 AND 5`);
  }

  const where = conditions.length > 0
    ? sql`${sql.join(conditions, sql` AND `)}`
    : undefined;

  // Sort column mapping
  const sortColumns: Record<string, any> = {
    name: products.name,
    price: products.price,
    createdAt: products.createdAt,
    stockCount: products.stockCount
  };
  const orderColumn = sortColumns[sortBy] ?? products.createdAt;
  const orderFn = sortDir === 'asc' ? asc : desc;

  // Get total count for pagination
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .where(where);

  // Get paginated results
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      price: products.price,
      inStock: products.inStock,
      stockCount: products.stockCount,
      imageUrl: products.imageUrl,
      categoryName: categories.name,
      createdAt: products.createdAt
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(where)
    .orderBy(orderFn(orderColumn))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const allCategories = await db.select({ id: categories.id, name: categories.name }).from(categories);

  return {
    products: allProducts,
    categories: allCategories,
    pagination: {
      page,
      perPage,
      total: totalCount,
      totalPages: Math.ceil(totalCount / perPage)
    },
    filters: { search, categoryId, sortBy, sortDir, stockFilter }
  };
};

// Bulk actions
export const actions = {
  bulkDelete: async ({ request }) => {
    const data = await request.formData();
    const ids = data.getAll('ids').map(Number);

    if (ids.length === 0) return;

    await db.delete(products).where(
      sql`${products.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`
    );
  },

  bulkToggleStock: async ({ request }) => {
    const data = await request.formData();
    const ids = data.getAll('ids').map(Number);
    const newStatus = data.get('status') === 'true';

    if (ids.length === 0) return;

    await db
      .update(products)
      .set({ inStock: newStatus })
      .where(sql`${products.id} IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`);
  }
};
```

```svelte
<!-- src/routes/(admin)/admin/products/+page.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { formatPrice } from '$lib/utils/format';
  import { enhance } from '$app/forms';

  let { data } = $props();
  let selectedIds = $state<Set<number>>(new Set());
  let selectAll = $state(false);

  // Toggle individual selection
  function toggleSelect(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds = next;
    selectAll = next.size === data.products.length;
  }

  // Toggle all selections
  function toggleSelectAll() {
    if (selectAll) {
      selectedIds = new Set();
      selectAll = false;
    } else {
      selectedIds = new Set(data.products.map((p) => p.id));
      selectAll = true;
    }
  }

  // Update URL params for filtering/sorting
  function updateFilter(key: string, value: string) {
    const url = new URL(page.url);
    if (value) {
      url.searchParams.set(key, value);
    } else {
      url.searchParams.delete(key);
    }
    url.searchParams.set('page', '1'); // Reset to first page
    goto(url.toString(), { replaceState: true });
  }

  function sortBy(column: string) {
    const url = new URL(page.url);
    const currentSort = url.searchParams.get('sort');
    const currentDir = url.searchParams.get('dir') ?? 'desc';

    url.searchParams.set('sort', column);
    url.searchParams.set('dir', currentSort === column && currentDir === 'asc' ? 'desc' : 'asc');
    goto(url.toString(), { replaceState: true });
  }

  // Sort indicator
  function sortIndicator(column: string): string {
    if (data.filters.sortBy !== column) return '';
    return data.filters.sortDir === 'asc' ? ' ↑' : ' ↓';
  }
</script>

<div class="flex justify-between items-center mb-6">
  <h1 class="text-2xl font-bold">Products ({data.pagination.total})</h1>
  <a href="/admin/products/new"
     class="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
    Add Product
  </a>
</div>

<!-- Filters Bar -->
<div class="bg-white rounded-lg border p-4 mb-4 flex flex-wrap gap-4 items-center">
  <!-- Search -->
  <div class="flex-1 min-w-48">
    <input
      type="search"
      placeholder="Search products..."
      value={data.filters.search}
      onchange={(e) => updateFilter('search', e.currentTarget.value)}
      class="w-full border rounded-lg px-3 py-2 text-sm"
    />
  </div>

  <!-- Category Filter -->
  <select
    value={data.filters.categoryId}
    onchange={(e) => updateFilter('category', e.currentTarget.value)}
    class="border rounded-lg px-3 py-2 text-sm"
  >
    <option value="">All Categories</option>
    {#each data.categories as cat}
      <option value={cat.id}>{cat.name}</option>
    {/each}
  </select>

  <!-- Stock Filter -->
  <select
    value={data.filters.stockFilter}
    onchange={(e) => updateFilter('stock', e.currentTarget.value)}
    class="border rounded-lg px-3 py-2 text-sm"
  >
    <option value="all">All Stock</option>
    <option value="in">In Stock</option>
    <option value="out">Out of Stock</option>
    <option value="low">Low Stock</option>
  </select>
</div>

<!-- Bulk Actions Bar (shown when items selected) -->
{#if selectedIds.size > 0}
  <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center justify-between">
    <span class="text-sm font-medium text-blue-800">
      {selectedIds.size} product{selectedIds.size > 1 ? 's' : ''} selected
    </span>
    <div class="flex gap-2">
      <form method="POST" action="?/bulkToggleStock" use:enhance>
        {#each [...selectedIds] as id}
          <input type="hidden" name="ids" value={id} />
        {/each}
        <input type="hidden" name="status" value="false" />
        <button type="submit" class="px-3 py-1 text-sm border rounded hover:bg-white">
          Mark Out of Stock
        </button>
      </form>
      <form method="POST" action="?/bulkDelete" use:enhance={() => {
        const confirmed = confirm(`Delete ${selectedIds.size} products? This cannot be undone.`);
        if (!confirmed) return ({ cancel }) => cancel();
        return async ({ update }) => {
          selectedIds = new Set();
          selectAll = false;
          await update();
        };
      }}>
        {#each [...selectedIds] as id}
          <input type="hidden" name="ids" value={id} />
        {/each}
        <button type="submit" class="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700">
          Delete Selected
        </button>
      </form>
    </div>
  </div>
{/if}

<!-- Products Table -->
<div class="bg-white rounded-lg border overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full">
      <thead class="bg-gray-50 text-left text-sm text-gray-500">
        <tr>
          <th class="p-4 w-8">
            <input
              type="checkbox"
              checked={selectAll}
              onchange={toggleSelectAll}
              class="rounded"
            />
          </th>
          <th class="p-4">
            <button onclick={() => sortBy('name')} class="font-semibold hover:text-black">
              Product{sortIndicator('name')}
            </button>
          </th>
          <th class="p-4">Category</th>
          <th class="p-4">
            <button onclick={() => sortBy('price')} class="font-semibold hover:text-black">
              Price{sortIndicator('price')}
            </button>
          </th>
          <th class="p-4">
            <button onclick={() => sortBy('stockCount')} class="font-semibold hover:text-black">
              Stock{sortIndicator('stockCount')}
            </button>
          </th>
          <th class="p-4">Status</th>
          <th class="p-4">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each data.products as product}
          <tr class="border-t hover:bg-gray-50 {selectedIds.has(product.id) ? 'bg-blue-50' : ''}">
            <td class="p-4">
              <input
                type="checkbox"
                checked={selectedIds.has(product.id)}
                onchange={() => toggleSelect(product.id)}
                class="rounded"
              />
            </td>
            <td class="p-4">
              <div class="flex items-center gap-3">
                {#if product.imageUrl}
                  <img src={product.imageUrl} alt="" class="w-10 h-10 object-cover rounded" />
                {:else}
                  <div class="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                    No img
                  </div>
                {/if}
                <span class="font-medium">{product.name}</span>
              </div>
            </td>
            <td class="p-4 text-gray-600">{product.categoryName ?? '—'}</td>
            <td class="p-4">{formatPrice(product.price)}</td>
            <td class="p-4">
              <span class="{product.stockCount < 5 ? 'text-red-600 font-medium' : ''}">
                {product.stockCount ?? '—'}
              </span>
            </td>
            <td class="p-4">
              <span class="px-2 py-1 text-xs rounded-full
                           {product.inStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                {product.inStock ? 'In Stock' : 'Out of Stock'}
              </span>
            </td>
            <td class="p-4">
              <div class="flex items-center gap-2">
                <a href="/admin/products/{product.id}/edit"
                   class="text-blue-600 hover:underline text-sm">Edit</a>
                <a href="/products/{product.slug}" target="_blank"
                   class="text-gray-400 hover:text-gray-600 text-sm">View</a>
              </div>
            </td>
          </tr>
        {/each}

        {#if data.products.length === 0}
          <tr>
            <td colspan="7" class="p-8 text-center text-gray-500">
              {data.filters.search ? `No products matching "${data.filters.search}"` : 'No products yet'}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  <!-- Pagination -->
  {#if data.pagination.totalPages > 1}
    <div class="border-t p-4 flex items-center justify-between">
      <p class="text-sm text-gray-500">
        Showing {(data.pagination.page - 1) * data.pagination.perPage + 1}
        - {Math.min(data.pagination.page * data.pagination.perPage, data.pagination.total)}
        of {data.pagination.total}
      </p>
      <div class="flex gap-1">
        {#each Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1) as p}
          <a
            href="?page={p}&search={data.filters.search}&category={data.filters.categoryId}&sort={data.filters.sortBy}&dir={data.filters.sortDir}&stock={data.filters.stockFilter}"
            class="px-3 py-1 rounded text-sm
                   {p === data.pagination.page ? 'bg-black text-white' : 'hover:bg-gray-100'}"
          >
            {p}
          </a>
        {/each}
      </div>
    </div>
  {/if}
</div>
```

## Product Form (Create and Edit)

Build a reusable form component for both creating and editing products. This single component handles both cases:

```svelte
<!-- src/lib/components/admin/ProductForm.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { product = null, categories, errors = {} } = $props();
  let imagePreview = $state<string | null>(product?.imageUrl ?? null);
  let slug = $state(product?.slug ?? '');

  function generateSlug(name: string) {
    slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }

  function handleImageChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('Image must be smaller than 5MB');
        (e.target as HTMLInputElement).value = '';
        return;
      }

      // Preview
      const reader = new FileReader();
      reader.onload = () => { imagePreview = reader.result as string; };
      reader.readAsDataURL(file);
    }
  }
</script>

<form method="POST" enctype="multipart/form-data" use:enhance class="space-y-6 max-w-3xl">
  <!-- Basic Information -->
  <fieldset class="space-y-4">
    <legend class="text-lg font-semibold mb-2">Basic Information</legend>

    <div>
      <label for="name" class="block text-sm font-medium">Product Name</label>
      <input id="name" name="name" type="text" value={product?.name ?? ''}
             oninput={(e) => !product && generateSlug(e.currentTarget.value)}
             class="mt-1 w-full border rounded-lg px-3 py-2 {errors.name ? 'border-red-500' : ''}"
             required />
      {#if errors.name}<p class="text-red-500 text-sm mt-1">{errors.name}</p>{/if}
    </div>

    <div>
      <label for="slug" class="block text-sm font-medium">URL Slug</label>
      <div class="mt-1 flex items-center gap-2">
        <span class="text-sm text-gray-500">/products/</span>
        <input id="slug" name="slug" type="text" bind:value={slug}
               class="flex-1 border rounded-lg px-3 py-2 font-mono text-sm {errors.slug ? 'border-red-500' : ''}"
               required />
      </div>
      {#if errors.slug}<p class="text-red-500 text-sm mt-1">{errors.slug}</p>{/if}
    </div>

    <div>
      <label for="description" class="block text-sm font-medium">Description</label>
      <textarea id="description" name="description" rows="6"
                class="mt-1 w-full border rounded-lg px-3 py-2">{product?.description ?? ''}</textarea>
      <p class="text-xs text-gray-400 mt-1">Supports plain text. Use line breaks for paragraphs.</p>
    </div>
  </fieldset>

  <!-- Pricing and Inventory -->
  <fieldset class="space-y-4">
    <legend class="text-lg font-semibold mb-2">Pricing & Inventory</legend>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label for="price" class="block text-sm font-medium">Price (USD)</label>
        <div class="mt-1 relative">
          <span class="absolute left-3 top-2 text-gray-400">$</span>
          <input id="price" name="price" type="number" step="0.01" min="0"
                 value={product ? (product.price / 100).toFixed(2) : ''}
                 class="w-full border rounded-lg pl-7 pr-3 py-2 {errors.price ? 'border-red-500' : ''}"
                 required />
        </div>
        {#if errors.price}<p class="text-red-500 text-sm mt-1">{errors.price}</p>{/if}
      </div>

      <div>
        <label for="compareAtPrice" class="block text-sm font-medium">Compare at (optional)</label>
        <div class="mt-1 relative">
          <span class="absolute left-3 top-2 text-gray-400">$</span>
          <input id="compareAtPrice" name="compareAtPrice" type="number" step="0.01" min="0"
                 value={product?.compareAtPrice ? (product.compareAtPrice / 100).toFixed(2) : ''}
                 class="w-full border rounded-lg pl-7 pr-3 py-2" />
        </div>
        <p class="text-xs text-gray-400 mt-1">Shows as strikethrough price</p>
      </div>

      <div>
        <label for="stockCount" class="block text-sm font-medium">Stock Count</label>
        <input id="stockCount" name="stockCount" type="number" min="0"
               value={product?.stockCount ?? ''}
               class="mt-1 w-full border rounded-lg px-3 py-2"
               placeholder="Leave empty for unlimited" />
      </div>
    </div>

    <div class="flex items-center gap-2">
      <input id="inStock" name="inStock" type="checkbox"
             checked={product?.inStock ?? true} class="rounded" />
      <label for="inStock" class="text-sm font-medium">Available for purchase</label>
    </div>
  </fieldset>

  <!-- Category -->
  <fieldset class="space-y-4">
    <legend class="text-lg font-semibold mb-2">Organization</legend>

    <div>
      <label for="categoryId" class="block text-sm font-medium">Category</label>
      <select id="categoryId" name="categoryId"
              class="mt-1 w-full border rounded-lg px-3 py-2">
        <option value="">Uncategorized</option>
        {#each categories as cat}
          <option value={cat.id} selected={product?.categoryId === cat.id}>
            {cat.name}
          </option>
        {/each}
      </select>
    </div>
  </fieldset>

  <!-- Image Upload -->
  <fieldset class="space-y-4">
    <legend class="text-lg font-semibold mb-2">Product Image</legend>

    <div class="flex items-start gap-6">
      <div class="flex-1">
        <label for="image" class="block text-sm font-medium mb-2">Upload Image</label>
        <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp"
               onchange={handleImageChange}
               class="w-full border rounded-lg px-3 py-2 text-sm
                      file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0
                      file:text-sm file:font-medium file:bg-gray-100 file:text-gray-700
                      hover:file:bg-gray-200" />
        <p class="text-xs text-gray-400 mt-1">
          JPEG, PNG, or WebP. Max 5MB. Recommended: 800x800px.
        </p>
      </div>

      {#if imagePreview}
        <div class="relative">
          <img src={imagePreview} alt="Preview"
               class="w-32 h-32 object-cover rounded-lg border" />
          <button type="button" onclick={() => imagePreview = null}
                  class="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white
                         rounded-full text-xs hover:bg-red-600">&times;</button>
        </div>
      {/if}
    </div>
  </fieldset>

  <!-- Submit -->
  <div class="flex items-center gap-4 pt-4 border-t">
    <button type="submit" class="bg-black text-white px-6 py-2 rounded-lg
                                  hover:bg-gray-800 transition-colors">
      {product ? 'Update Product' : 'Create Product'}
    </button>
    <a href="/admin/products" class="text-gray-500 hover:text-black transition-colors">
      Cancel
    </a>
  </div>
</form>
```

## Server Action for Creating Products

Handle form submission, validate, upload image, and save to the database:

```typescript
// src/routes/(admin)/admin/products/new/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { saveImage } from '$lib/server/upload';
import { eq } from 'drizzle-orm';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Slug must be lowercase letters, numbers, and hyphens'),
  description: z.string().default(''),
  price: z.string().transform((v) => {
    const cents = Math.round(parseFloat(v) * 100);
    if (isNaN(cents) || cents < 0) throw new Error('Invalid price');
    return cents;
  }),
  compareAtPrice: z.string().optional().transform((v) => {
    if (!v) return null;
    const cents = Math.round(parseFloat(v) * 100);
    return isNaN(cents) ? null : cents;
  }),
  categoryId: z.string().optional().transform((v) => v ? parseInt(v) : null),
  stockCount: z.string().optional().transform((v) => v ? parseInt(v) : null),
  inStock: z.string().optional().transform((v) => v === 'on')
});

export async function load() {
  const allCategories = await db.select().from(categories);
  return { categories: allCategories };
}

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    const result = productSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      return fail(400, { errors });
    }

    // Check for duplicate slug
    const existingSlug = await db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.slug, result.data.slug))
      .limit(1);

    if (existingSlug.length > 0) {
      return fail(400, { errors: { slug: 'This URL slug is already taken' } });
    }

    // Handle image upload
    const image = formData.get('image') as File;
    let imageUrl: string | null = null;

    if (image && image.size > 0) {
      try {
        imageUrl = await saveImage(image);
      } catch (err) {
        return fail(400, { errors: { image: 'Failed to upload image' } });
      }
    }

    await db.insert(products).values({
      name: result.data.name,
      slug: result.data.slug,
      description: result.data.description,
      price: result.data.price,
      compareAtPrice: result.data.compareAtPrice,
      categoryId: result.data.categoryId,
      stockCount: result.data.stockCount,
      inStock: result.data.inStock,
      imageUrl
    });

    throw redirect(303, '/admin/products');
  }
};
```

## Server Action for Editing Products

The edit page loads the existing product and reuses the same form component:

```typescript
// src/routes/(admin)/admin/products/[id]/edit/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { fail, redirect, error } from '@sveltejs/kit';
import { eq, and, ne } from 'drizzle-orm';
import { z } from 'zod';
import { saveImage } from '$lib/server/upload';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Invalid slug format'),
  description: z.string().default(''),
  price: z.string().transform((v) => Math.round(parseFloat(v) * 100)),
  compareAtPrice: z.string().optional().transform((v) => v ? Math.round(parseFloat(v) * 100) : null),
  categoryId: z.string().optional().transform((v) => v ? parseInt(v) : null),
  stockCount: z.string().optional().transform((v) => v ? parseInt(v) : null),
  inStock: z.string().optional().transform((v) => v === 'on')
});

export async function load({ params }) {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, Number(params.id)))
    .limit(1);

  if (!product) throw error(404, 'Product not found');

  const allCategories = await db.select().from(categories);

  return { product, categories: allCategories };
}

export const actions = {
  default: async ({ params, request }) => {
    const productId = Number(params.id);
    const formData = await request.formData();
    const rawData = Object.fromEntries(formData);
    const result = productSchema.safeParse(rawData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      return fail(400, { errors });
    }

    // Check for duplicate slug (excluding current product)
    const existingSlug = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          eq(products.slug, result.data.slug),
          ne(products.id, productId)
        )
      )
      .limit(1);

    if (existingSlug.length > 0) {
      return fail(400, { errors: { slug: 'This URL slug is already taken' } });
    }

    // Handle image upload
    const image = formData.get('image') as File;
    let imageUrl: string | undefined;

    if (image && image.size > 0) {
      imageUrl = await saveImage(image);
    }

    await db
      .update(products)
      .set({
        name: result.data.name,
        slug: result.data.slug,
        description: result.data.description,
        price: result.data.price,
        compareAtPrice: result.data.compareAtPrice,
        categoryId: result.data.categoryId,
        stockCount: result.data.stockCount,
        inStock: result.data.inStock,
        ...(imageUrl && { imageUrl })
      })
      .where(eq(products.id, productId));

    throw redirect(303, '/admin/products');
  },

  delete: async ({ params }) => {
    await db.delete(products).where(eq(products.id, Number(params.id)));
    throw redirect(303, '/admin/products');
  }
};
```

```svelte
<!-- src/routes/(admin)/admin/products/[id]/edit/+page.svelte -->
<script lang="ts">
  import ProductForm from '$lib/components/admin/ProductForm.svelte';
  import { enhance } from '$app/forms';

  let { data, form } = $props();
</script>

<div class="flex items-center justify-between mb-6">
  <h1 class="text-2xl font-bold">Edit: {data.product.name}</h1>
  <form method="POST" action="?/delete" use:enhance={() => {
    const confirmed = confirm('Delete this product permanently?');
    if (!confirmed) return ({ cancel }) => cancel();
  }}>
    <button type="submit" class="text-red-600 hover:text-red-800 text-sm">
      Delete Product
    </button>
  </form>
</div>

<ProductForm
  product={data.product}
  categories={data.categories}
  errors={form?.errors ?? {}}
/>
```

## Image Upload

Handle file uploads and save images. For development, local filesystem works. For production, use cloud storage:

```typescript
// src/lib/server/upload.ts
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { env } from '$env/dynamic/private';

// Production: use cloud storage
// Development: use local filesystem
const isProduction = env.NODE_ENV === 'production';

export async function saveImage(file: File): Promise<string> {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Allowed: JPEG, PNG, WebP');
  }

  // Validate file size (max 5MB)
  const maxSize = 5 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error('File too large. Maximum size: 5MB');
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  // Generate unique filename
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  if (isProduction && env.S3_BUCKET) {
    // Production: upload to S3 / cloud storage
    return await uploadToS3(buffer, filename, file.type);
  }

  // Development: save to local static directory
  const uploadDir = join('static', 'uploads');
  await mkdir(uploadDir, { recursive: true });
  const path = join(uploadDir, filename);
  await writeFile(path, buffer);

  return `/uploads/${filename}`;
}

async function uploadToS3(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  // This is a placeholder — use the AWS SDK or your cloud provider's SDK
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');

  const client = new S3Client({ region: env.AWS_REGION });
  const key = `products/${filename}`;

  await client.send(new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable'
  }));

  return `https://${env.S3_BUCKET}.s3.${env.AWS_REGION}.amazonaws.com/${key}`;
}
```

## Product Variants

Many products come in multiple sizes, colors, or configurations. Model variants as a separate table:

```typescript
// In your Drizzle schema
export const productVariants = pgTable('product_variants', {
  id: serial('id').primaryKey(),
  productId: integer('product_id').references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),        // e.g., "Small / Red"
  sku: text('sku').notNull().unique(),
  priceCents: integer('price_cents'),   // null = use parent product price
  stockCount: integer('stock_count').default(0),
  options: json('options').$type<Record<string, string>>() // { size: 'S', color: 'Red' }
});
```

```svelte
<!-- src/lib/components/admin/VariantManager.svelte -->
<script lang="ts">
  let { variants = [], productId } = $props();
  let editingIndex = $state<number | null>(null);
  let newVariant = $state({ name: '', sku: '', priceCents: '', stockCount: '0' });

  function addVariant() {
    variants = [...variants, { ...newVariant, id: null }];
    newVariant = { name: '', sku: '', priceCents: '', stockCount: '0' };
  }

  function removeVariant(index: number) {
    variants = variants.filter((_, i) => i !== index);
  }
</script>

<fieldset class="space-y-4">
  <legend class="text-lg font-semibold mb-2">Variants</legend>

  {#if variants.length > 0}
    <div class="border rounded-lg overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="p-3 text-left">Variant</th>
            <th class="p-3 text-left">SKU</th>
            <th class="p-3 text-left">Price Override</th>
            <th class="p-3 text-left">Stock</th>
            <th class="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {#each variants as variant, i}
            <tr class="border-t">
              <td class="p-3">
                <input name="variants[{i}].name" value={variant.name}
                       class="w-full border rounded px-2 py-1" />
              </td>
              <td class="p-3">
                <input name="variants[{i}].sku" value={variant.sku}
                       class="w-full border rounded px-2 py-1 font-mono text-xs" />
              </td>
              <td class="p-3">
                <input name="variants[{i}].priceCents" value={variant.priceCents}
                       type="number" step="0.01" placeholder="Use product price"
                       class="w-full border rounded px-2 py-1" />
              </td>
              <td class="p-3">
                <input name="variants[{i}].stockCount" value={variant.stockCount}
                       type="number" min="0" class="w-24 border rounded px-2 py-1" />
              </td>
              <td class="p-3">
                <button type="button" onclick={() => removeVariant(i)}
                        class="text-red-500 hover:text-red-700 text-xs">Remove</button>
              </td>
            </tr>
            {#if variant.id}
              <input type="hidden" name="variants[{i}].id" value={variant.id} />
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <!-- Add new variant -->
  <div class="flex items-end gap-3 p-4 border rounded-lg bg-gray-50">
    <div class="flex-1">
      <label class="text-xs font-medium block mb-1">Name</label>
      <input bind:value={newVariant.name} placeholder="e.g., Large / Blue"
             class="w-full border rounded px-2 py-1 text-sm" />
    </div>
    <div class="w-32">
      <label class="text-xs font-medium block mb-1">SKU</label>
      <input bind:value={newVariant.sku} placeholder="SKU-001"
             class="w-full border rounded px-2 py-1 text-sm font-mono" />
    </div>
    <div class="w-28">
      <label class="text-xs font-medium block mb-1">Stock</label>
      <input bind:value={newVariant.stockCount} type="number" min="0"
             class="w-full border rounded px-2 py-1 text-sm" />
    </div>
    <button type="button" onclick={addVariant}
            disabled={!newVariant.name || !newVariant.sku}
            class="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300
                   disabled:opacity-50 disabled:cursor-not-allowed">
      Add
    </button>
  </div>
</fieldset>
```

## Inventory Tracking

Track stock changes with an audit log so you can understand why inventory levels changed:

```typescript
// src/lib/server/inventory.ts
import { db } from '$lib/server/db';
import { products, inventoryLog } from '$lib/server/schema';
import { eq, sql } from 'drizzle-orm';

type StockChangeReason = 'sale' | 'restock' | 'adjustment' | 'return' | 'damaged';

export async function updateStock(
  productId: number,
  quantityChange: number,
  reason: StockChangeReason,
  userId: number,
  note?: string
) {
  await db.transaction(async (tx) => {
    // Update product stock
    await tx
      .update(products)
      .set({
        stockCount: sql`${products.stockCount} + ${quantityChange}`,
        inStock: sql`CASE WHEN ${products.stockCount} + ${quantityChange} > 0 THEN true ELSE false END`
      })
      .where(eq(products.id, productId));

    // Log the change
    await tx.insert(inventoryLog).values({
      productId,
      quantityChange,
      reason,
      userId,
      note: note ?? null,
      createdAt: new Date()
    });
  });
}
```

```typescript
// src/routes/(admin)/admin/products/[id]/inventory/+page.server.ts
import { db } from '$lib/server/db';
import { products, inventoryLog, users } from '$lib/server/schema';
import { eq, desc } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { updateStock } from '$lib/server/inventory';

export async function load({ params }) {
  const [product] = await db
    .select({ id: products.id, name: products.name, stockCount: products.stockCount })
    .from(products)
    .where(eq(products.id, Number(params.id)));

  const log = await db
    .select({
      id: inventoryLog.id,
      quantityChange: inventoryLog.quantityChange,
      reason: inventoryLog.reason,
      note: inventoryLog.note,
      createdAt: inventoryLog.createdAt,
      userName: users.name
    })
    .from(inventoryLog)
    .leftJoin(users, eq(inventoryLog.userId, users.id))
    .where(eq(inventoryLog.productId, Number(params.id)))
    .orderBy(desc(inventoryLog.createdAt))
    .limit(50);

  return { product, log };
}

export const actions = {
  adjust: async ({ params, request, locals }) => {
    const data = await request.formData();
    const quantity = Number(data.get('quantity'));
    const reason = data.get('reason') as string;
    const note = data.get('note') as string;

    if (!quantity || isNaN(quantity)) {
      return fail(400, { error: 'Invalid quantity' });
    }

    await updateStock(
      Number(params.id),
      quantity,
      reason as any,
      Number(locals.user!.id),
      note
    );
  }
};
```

## Try It

1. Build a category management page at `/admin/categories` with a form to add new categories (name, slug, description) and a list of existing categories with edit and delete buttons. Generate the slug automatically from the name.

2. Add a product variant manager to the product form. Allow adding variants with name, SKU, optional price override, and stock count. Save variants to the database as separate records linked to the parent product.

3. Implement the full filtering and pagination system: add a search bar that filters by product name, a category dropdown filter, an in-stock/out-of-stock filter, and clickable column headers for sorting. Preserve all filters in URL search parameters so they survive page reloads.

4. Build the inventory adjustment page for a single product. Show the current stock count, a form to add or subtract stock with a reason dropdown (restock, damaged, adjustment), and a history log showing all past changes with timestamps, quantities, and who made the change.

## Key Takeaways

- Build reusable form components that work for both creating and editing records — pass the existing record or `null`
- Always validate form data server-side with Zod, even for admin forms — admin users make mistakes too
- Convert dollar amounts to cents during validation so the form is user-friendly but the database stays consistent
- Check for duplicate slugs before inserting/updating, excluding the current record on edits
- Handle file uploads separately from text form data using `enctype="multipart/form-data"`; validate file type and size server-side
- Use local filesystem for dev uploads but cloud storage (S3, Cloudflare R2) in production — files in `static/` are lost on every serverless deployment
- URL-based filtering, sorting, and pagination preserves state across reloads and enables bookmarkable views
- Bulk operations with checkbox selection let admins manage large inventories efficiently
- Track inventory changes with an audit log that records who changed what, when, and why
- Product variants model size/color/config options as separate records with optional price overrides
- Auto-generate URL slugs from product names with a simple regex transformation
- Use progressive enhancement with `use:enhance` so forms work without JavaScript
