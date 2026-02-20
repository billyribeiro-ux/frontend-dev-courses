# Product Management

The admin panel needs full CRUD (Create, Read, Update, Delete) capabilities for products. In this lesson you will build a product listing table, a product creation and editing form, image upload handling, and category management. This is the tool that keeps your store stocked.

Every form action will validate data server-side with Zod and use progressive enhancement so the interface works smoothly.

## Product Listing Table

Display all products in a sortable admin table:

```typescript
// src/routes/(admin)/admin/products/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { eq } from 'drizzle-orm';

export async function load() {
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      price: products.price,
      inStock: products.inStock,
      categoryName: categories.name,
      createdAt: products.createdAt
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(products.createdAt);

  return { products: allProducts };
}
```

```svelte
<!-- src/routes/(admin)/admin/products/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();
</script>

<div class="flex justify-between items-center mb-6">
  <h1 class="text-2xl font-bold">Products</h1>
  <a href="/admin/products/new"
     class="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800">
    Add Product
  </a>
</div>

<div class="bg-white rounded-lg border overflow-hidden">
  <table class="w-full">
    <thead class="bg-gray-50 text-left text-sm text-gray-500">
      <tr>
        <th class="p-4">Product</th>
        <th class="p-4">Category</th>
        <th class="p-4">Price</th>
        <th class="p-4">Status</th>
        <th class="p-4">Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.products as product}
        <tr class="border-t hover:bg-gray-50">
          <td class="p-4 font-medium">{product.name}</td>
          <td class="p-4 text-gray-600">{product.categoryName ?? '—'}</td>
          <td class="p-4">{formatPrice(product.price)}</td>
          <td class="p-4">
            <span class="px-2 py-1 text-xs rounded-full
                         {product.inStock ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
              {product.inStock ? 'In Stock' : 'Out of Stock'}
            </span>
          </td>
          <td class="p-4">
            <a href="/admin/products/{product.id}/edit"
               class="text-blue-600 hover:underline text-sm">Edit</a>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

## Product Form (Create and Edit)

Build a reusable form component for both creating and editing products:

```svelte
<!-- src/lib/components/admin/ProductForm.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  let { product, categories, errors = {} } = $props();
</script>

<form method="POST" enctype="multipart/form-data" use:enhance class="space-y-6">
  <div>
    <label for="name" class="block text-sm font-medium">Product Name</label>
    <input id="name" name="name" type="text" value={product?.name ?? ''}
           class="mt-1 w-full border rounded-lg px-3 py-2" required />
    {#if errors.name}<p class="text-red-500 text-sm mt-1">{errors.name}</p>{/if}
  </div>

  <div>
    <label for="description" class="block text-sm font-medium">Description</label>
    <textarea id="description" name="description" rows="4"
              class="mt-1 w-full border rounded-lg px-3 py-2">{product?.description ?? ''}</textarea>
  </div>

  <div class="grid grid-cols-2 gap-4">
    <div>
      <label for="price" class="block text-sm font-medium">Price (in dollars)</label>
      <input id="price" name="price" type="number" step="0.01" min="0"
             value={product ? (product.price / 100).toFixed(2) : ''}
             class="mt-1 w-full border rounded-lg px-3 py-2" required />
      {#if errors.price}<p class="text-red-500 text-sm mt-1">{errors.price}</p>{/if}
    </div>

    <div>
      <label for="categoryId" class="block text-sm font-medium">Category</label>
      <select id="categoryId" name="categoryId"
              class="mt-1 w-full border rounded-lg px-3 py-2">
        <option value="">None</option>
        {#each categories as cat}
          <option value={cat.id} selected={product?.categoryId === cat.id}>
            {cat.name}
          </option>
        {/each}
      </select>
    </div>
  </div>

  <div>
    <label for="image" class="block text-sm font-medium">Product Image</label>
    <input id="image" name="image" type="file" accept="image/*"
           class="mt-1 w-full border rounded-lg px-3 py-2" />
    {#if product?.imageUrl}
      <img src={product.imageUrl} alt="Current" class="mt-2 w-24 h-24 object-cover rounded" />
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <input id="inStock" name="inStock" type="checkbox"
           checked={product?.inStock ?? true} class="rounded" />
    <label for="inStock" class="text-sm font-medium">In Stock</label>
  </div>

  <button type="submit" class="bg-black text-white px-6 py-2 rounded-lg
                                hover:bg-gray-800 transition-colors">
    {product ? 'Update Product' : 'Create Product'}
  </button>
</form>
```

## Server Action for Creating Products

Handle form submission, validate, and save to the database:

```typescript
// src/routes/(admin)/admin/products/new/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';

const productSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().default(''),
  price: z.string().transform((v) => Math.round(parseFloat(v) * 100)),
  categoryId: z.string().optional().transform((v) => v ? parseInt(v) : null),
  inStock: z.string().optional().transform((v) => v === 'on')
});

export async function load() {
  const allCategories = await db.select().from(categories);
  return { categories: allCategories };
}

export const actions = {
  default: async ({ request }) => {
    const formData = Object.fromEntries(await request.formData());
    const result = productSchema.safeParse(formData);

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        errors[issue.path[0] as string] = issue.message;
      });
      return fail(400, { errors });
    }

    const slug = result.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    await db.insert(products).values({
      name: result.data.name,
      slug,
      description: result.data.description,
      price: result.data.price,
      categoryId: result.data.categoryId,
      inStock: result.data.inStock
    });

    throw redirect(303, '/admin/products');
  }
};
```

## Image Upload

Handle file uploads and save images. The example below uses the local filesystem, which works during development but **files in `static/` are lost on every Vercel deployment**. For production, use cloud storage such as Vercel Blob, AWS S3, or Cloudinary instead.

```typescript
// src/lib/server/upload.ts
import { writeFile } from 'fs/promises';
import { join } from 'path';

export async function saveImage(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const filename = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
  const path = join('static', 'uploads', filename);

  await writeFile(path, buffer);

  return `/uploads/${filename}`;
}
```

Use it in your form action:

```typescript
const image = formData.get('image') as File;
let imageUrl = product?.imageUrl ?? null;

if (image && image.size > 0) {
  imageUrl = await saveImage(image);
}
```

## Try It

Build a category management page at `/admin/categories` with a form to add new categories (name, slug, description) and a list of existing categories with edit and delete buttons. Generate the slug automatically from the name using the same slugification logic as products.

## Key Takeaways

- Build reusable form components that work for both creating and editing records
- Always validate form data server-side with Zod, even for admin forms
- Convert dollar amounts to cents during validation so the form is user-friendly but the database stays consistent
- Handle file uploads separately from text form data using `enctype="multipart/form-data"`
- Auto-generate URL slugs from product names with a simple regex transformation
- Use progressive enhancement with `use:enhance` so forms work without JavaScript
