# Product Pages

The product catalog is the heart of your e-commerce store. Customers need to browse products, see what is available, and click through to get details before buying. In this lesson you will build the product listing page and product detail page with dynamic routes, image galleries, and proper price formatting.

Everything starts with fetching products from your database and rendering them in a clean, browsable layout.

## Product Listing Page

Create a server load function that fetches all products and a page component that displays them in a grid:

```typescript
// src/routes/(store)/products/+page.server.ts
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
      imageUrl: products.imageUrl,
      categoryName: categories.name
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.inStock, true));

  return { products: allProducts };
}
```

```svelte
<!-- src/routes/(store)/products/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();
</script>

<div class="max-w-7xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">All Products</h1>

  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each data.products as product}
      <a href="/products/{product.slug}" class="group block">
        <div class="aspect-square overflow-hidden rounded-lg bg-gray-100">
          <img
            src={product.imageUrl}
            alt={product.name}
            class="h-full w-full object-cover group-hover:scale-105 transition-transform"
          />
        </div>
        <div class="mt-3">
          <p class="text-sm text-gray-500">{product.categoryName}</p>
          <h2 class="font-semibold">{product.name}</h2>
          <p class="text-lg font-bold">{formatPrice(product.price)}</p>
        </div>
      </a>
    {/each}
  </div>
</div>
```

## Price Formatting

Since prices are stored in cents, you need a utility to format them as currency:

```typescript
// src/lib/utils/format.ts
export function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(cents / 100);
}
```

Import and use this everywhere you display prices. Keeping it in a utility file means you only change the format in one place.

## Product Detail with Dynamic Routes

Create a dynamic route that loads a single product by slug:

```typescript
// src/routes/(store)/products/[slug]/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const [product] = await db
    .select()
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(eq(products.slug, params.slug))
    .limit(1);

  if (!product) {
    throw error(404, 'Product not found');
  }

  return { product };
}
```

```svelte
<!-- src/routes/(store)/products/[slug]/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { data } = $props();
  let selectedImage = $state(0);

  const images = [
    data.product.products.imageUrl,
    // Additional images would come from a product_images table
  ].filter(Boolean);
</script>

<div class="max-w-6xl mx-auto px-4 py-8">
  <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
    <!-- Image Gallery -->
    <div>
      <div class="aspect-square rounded-lg overflow-hidden bg-gray-100">
        <img src={images[selectedImage]} alt={data.product.products.name}
             class="h-full w-full object-cover" />
      </div>
      {#if images.length > 1}
        <div class="flex gap-2 mt-4">
          {#each images as image, i}
            <button onclick={() => selectedImage = i}
                    class="w-20 h-20 rounded border-2"
                    class:border-black={selectedImage === i}
                    class:border-transparent={selectedImage !== i}>
              <img src={image} alt="" class="w-full h-full object-cover rounded" />
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Product Info -->
    <div>
      <h1 class="text-3xl font-bold">{data.product.products.name}</h1>
      <p class="text-2xl font-bold mt-4">
        {formatPrice(data.product.products.price)}
      </p>
      <p class="mt-4 text-gray-600">{data.product.products.description}</p>
      <button class="mt-6 w-full bg-black text-white py-3 rounded-lg
                     hover:bg-gray-800 transition-colors">
        Add to Cart
      </button>
    </div>
  </div>
</div>
```

## Try It

Add a "related products" section below the product detail. Query 4 products from the same category (excluding the current product) and display them in a horizontal row of cards. Use the same `formatPrice` utility for consistency.

## Key Takeaways

- Use server load functions to fetch products from the database so data never leaks to the client bundle
- Dynamic routes with `[slug]` parameters create clean, SEO-friendly product URLs
- Store prices in cents and format them with `Intl.NumberFormat` to avoid floating-point display issues
- An image gallery with `$state` for the selected index gives users a simple interactive experience
- Always handle the 404 case when a product slug does not match any record
