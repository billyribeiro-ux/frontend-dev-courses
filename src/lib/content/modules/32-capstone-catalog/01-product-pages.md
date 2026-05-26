# Product Pages

The product catalog is the heart of your e-commerce store. Customers need to browse products, see what is available, and click through to get details before buying. In this lesson you will build the complete product catalog: listing pages with server-side data loading, detail pages with dynamic routes, image galleries, product variants, SEO-optimized markup with structured data, streaming loading states, and error boundaries for fault isolation.

Everything starts with fetching products from your database and rendering them in a clean, browsable layout. But a production catalog goes far beyond "fetch and loop." You need to handle empty results, missing images, slow connections, broken products, and search engine indexing -- all while keeping the page fast.

## Product Listing Load Function

The listing page is the first thing customers see when they browse your store. The load function runs server-side, fetches products with their categories and primary images, and returns typed data that the Svelte component can render immediately.

```typescript
// src/routes/(store)/products/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories, productImages } from '$lib/server/schema';
import { eq, and, asc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // Fetch published, in-stock products with category names
  const allProducts = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      price: products.price,
      compareAtPrice: products.compareAtPrice,
      imageUrl: products.imageUrl,
      categoryName: categories.name,
      categorySlug: categories.slug,
      featured: products.featured
    })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(
      and(
        eq(products.inStock, true),
        eq(products.published, true)
      )
    )
    .orderBy(asc(products.name));

  // Fetch all categories for the filter sidebar
  const allCategories = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      imageUrl: categories.imageUrl
    })
    .from(categories)
    .orderBy(asc(categories.position));

  return {
    products: allProducts,
    categories: allCategories
  };
};
```

A few things to notice about this load function:

**Explicit column selection.** We use `.select({ ... })` with named fields rather than `.select()` which returns everything. This matters for two reasons: it reduces the payload sent to the client (no password hashes, internal IDs, or metadata leaking), and it makes the TypeScript return type self-documenting.

**Double WHERE condition.** Products must be both `inStock` and `published`. A product might be published but out of stock (you could show "sold out" instead of hiding it), or in stock but unpublished (a draft being prepared). For the initial listing, we show only buyable products.

**Categories are fetched separately.** You might be tempted to extract unique categories from the products result, but that misses categories with zero products. Fetching categories separately ensures the filter sidebar shows all options.

## Product Listing Page Component

The page component receives typed data from the load function and renders a responsive grid. Every product card is a link to its detail page.

```svelte
<!-- src/routes/(store)/products/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';
  import ProductCard from '$lib/components/product/ProductCard.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Products | Acme Store</title>
  <meta name="description"
        content="Browse our collection of premium products. Free shipping on orders over $50." />
  <meta property="og:title" content="Products | Acme Store" />
  <meta property="og:description"
        content="Browse our collection of premium products." />
  <meta property="og:type" content="website" />
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
    <div>
      <h1 class="text-3xl font-bold text-gray-900">All Products</h1>
      <p class="mt-1 text-gray-500">
        {data.products.length} {data.products.length === 1 ? 'product' : 'products'}
      </p>
    </div>
  </div>

  {#if data.products.length === 0}
    <div class="text-center py-16">
      <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor"
           viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
      <h2 class="mt-4 text-lg font-medium text-gray-900">No products available</h2>
      <p class="mt-2 text-gray-500">Check back soon -- new items are added regularly.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {#each data.products as product (product.id)}
        <ProductCard {product} />
      {/each}
    </div>
  {/if}
</div>
```

Notice the `(product.id)` keyed each block. Without a key, Svelte reuses DOM nodes by position. If the product list changes (filtering, pagination), keyed blocks ensure each card maps to the correct product, preserving any component state and avoiding visual glitches.

The empty state is not an afterthought. A blank page with no explanation is confusing. Show an icon, a message, and ideally an action the user can take.

## The ProductCard Component

Extract the product card into a reusable component. You will use this card in the listing page, search results, related products, and featured sections.

```svelte
<!-- src/lib/components/product/ProductCard.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  type ProductData = {
    id: number;
    name: string;
    slug: string;
    price: number;
    compareAtPrice?: number | null;
    imageUrl: string | null;
    categoryName: string | null;
    featured?: boolean;
  };

  let { product }: { product: ProductData } = $props();

  const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;
  const discountPercent = isOnSale
    ? Math.round((1 - product.price / product.compareAtPrice!) * 100)
    : 0;
</script>

<a href="/products/{product.slug}"
   class="group block rounded-lg overflow-hidden border border-gray-200
          hover:shadow-lg transition-shadow duration-300 bg-white">
  <div class="aspect-square bg-gray-100 overflow-hidden relative">
    {#if product.imageUrl}
      <img
        src={product.imageUrl}
        alt={product.name}
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover
               group-hover:scale-105 transition-transform duration-500"
      />
    {:else}
      <div class="h-full w-full flex items-center justify-center text-gray-400">
        <svg class="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </div>
    {/if}

    {#if isOnSale}
      <span class="absolute top-2 left-2 bg-red-600 text-white text-xs font-bold
                   px-2 py-1 rounded">
        -{discountPercent}%
      </span>
    {/if}

    {#if product.featured}
      <span class="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold
                   px-2 py-1 rounded">
        Featured
      </span>
    {/if}
  </div>

  <div class="p-4">
    {#if product.categoryName}
      <p class="text-xs text-gray-500 uppercase tracking-wide">
        {product.categoryName}
      </p>
    {/if}
    <h3 class="font-semibold mt-1 text-gray-900 line-clamp-2 min-h-[2.5rem]">
      {product.name}
    </h3>
    <div class="flex items-center gap-2 mt-2">
      <span class="text-lg font-bold text-gray-900">
        {formatPrice(product.price)}
      </span>
      {#if isOnSale}
        <span class="text-sm text-gray-400 line-through">
          {formatPrice(product.compareAtPrice!)}
        </span>
      {/if}
    </div>
  </div>
</a>
```

Key design decisions in this component:

**`loading="lazy"` on images.** The browser defers loading images that are below the viewport fold. For a grid of 20+ products, this prevents the browser from downloading all images at once, which dramatically improves initial page load time.

**`decoding="async"`** tells the browser it can decode the image off the main thread, preventing jank during scrolling.

**Fallback for missing images.** Not every product has an image uploaded yet, especially during data entry. Instead of showing a broken image icon, we show a placeholder SVG.

**`line-clamp-2` with `min-h-[2.5rem]`** prevents long product names from breaking the grid alignment while ensuring cards with short names maintain the same height.

**Sale badge with computed discount.** The discount percentage is derived from `price` and `compareAtPrice`. This is a pure computation with no side effects -- perfect for a `const` declaration in the script block.

## Price Formatting Utility

Since prices are stored in cents throughout the application, you need a single utility that formats them correctly. This function handles currency symbols, decimal places, and locale-specific formatting.

```typescript
// src/lib/utils/format.ts

/**
 * Format a price stored in cents as a currency string.
 * Uses Intl.NumberFormat for locale-aware formatting.
 *
 * @param cents - Price in cents (e.g., 2999 = $29.99)
 * @param currency - ISO 4217 currency code (default: 'USD')
 * @returns Formatted price string (e.g., "$29.99")
 */
export function formatPrice(cents: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(cents / 100);
}

/**
 * Format a price range for display.
 * Used when showing "From $19.99" or "$19.99 - $49.99"
 */
export function formatPriceRange(
  minCents: number,
  maxCents: number,
  currency = 'USD'
): string {
  if (minCents === maxCents) {
    return formatPrice(minCents, currency);
  }
  return `${formatPrice(minCents, currency)} - ${formatPrice(maxCents, currency)}`;
}

/**
 * Format a date for display in the storefront.
 */
export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
}

/**
 * Generate a human-readable order number.
 * Format: ORD-YYYY-XXXXX (e.g., ORD-2025-00042)
 */
export function generateOrderNumber(id: number): string {
  const year = new Date().getFullYear();
  return `ORD-${year}-${String(id).padStart(5, '0')}`;
}
```

Keep all formatting in a single utility file. When the business decides to show prices in EUR or GBP, you change one function.

## Product Detail Page with Dynamic Routes

The detail page is where customers make buying decisions. It loads a single product by slug, displays all images, shows detailed descriptions, and provides the "Add to Cart" action.

### Server Load Function

```typescript
// src/routes/(store)/products/[slug]/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories, productImages, productTags, tags } from '$lib/server/schema';
import { eq, and, asc, ne } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Use Drizzle relational query for nested data
  const product = await db.query.products.findFirst({
    where: and(
      eq(products.slug, params.slug),
      eq(products.published, true)
    ),
    with: {
      category: true,
      images: {
        orderBy: [asc(productImages.position)]
      },
      productTags: {
        with: {
          tag: true
        }
      }
    }
  });

  if (!product) {
    error(404, {
      message: 'Product not found',
      // Provide a helpful message for the error page
    });
  }

  // Fetch related products from the same category
  const relatedProducts = product.categoryId
    ? await db
        .select({
          id: products.id,
          name: products.name,
          slug: products.slug,
          price: products.price,
          compareAtPrice: products.compareAtPrice,
          imageUrl: products.imageUrl,
          categoryName: categories.name
        })
        .from(products)
        .leftJoin(categories, eq(products.categoryId, categories.id))
        .where(
          and(
            eq(products.categoryId, product.categoryId),
            ne(products.id, product.id),
            eq(products.published, true),
            eq(products.inStock, true)
          )
        )
        .limit(4)
    : [];

  return {
    product,
    relatedProducts
  };
};
```

The relational query with `with` fetches the product, its category, all images in display order, and all tags in a single database round trip. Without this, you would need 4 separate queries -- the classic N+1 problem.

### Product Detail Component

```svelte
<!-- src/routes/(store)/products/[slug]/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';
  import ProductCard from '$lib/components/product/ProductCard.svelte';
  import ImageGallery from '$lib/components/product/ImageGallery.svelte';
  import AddToCartButton from '$lib/components/cart/AddToCartButton.svelte';
  import Breadcrumbs from '$lib/components/ui/Breadcrumbs.svelte';

  let { data } = $props();

  const product = data.product;
  const isOnSale = product.compareAtPrice && product.compareAtPrice > product.price;

  // Build image array: product_images table first, fallback to main imageUrl
  const images = product.images.length > 0
    ? product.images.map(img => ({ url: img.url, alt: img.altText || product.name }))
    : product.imageUrl
      ? [{ url: product.imageUrl, alt: product.name }]
      : [];

  // Extract tag names for display
  const tagNames = product.productTags.map(pt => pt.tag.name);

  // Structured data for SEO
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: images.map(img => img.url),
    sku: product.sku,
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      ...(isOnSale ? {
        priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString().split('T')[0]
      } : {})
    }
  };
</script>

<svelte:head>
  <title>{product.name} | Acme Store</title>
  <meta name="description" content={product.shortDescription || product.description.slice(0, 160)} />

  <!-- Open Graph -->
  <meta property="og:title" content={product.name} />
  <meta property="og:description" content={product.shortDescription || product.description.slice(0, 160)} />
  <meta property="og:type" content="product" />
  {#if images[0]}
    <meta property="og:image" content={images[0].url} />
  {/if}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={product.name} />
  <meta name="twitter:description" content={product.shortDescription || product.description.slice(0, 160)} />

  <!-- Structured Data for search engines -->
  {@html `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`}
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Breadcrumbs -->
  <Breadcrumbs crumbs={[
    { label: 'Products', href: '/products' },
    ...(product.category
      ? [{ label: product.category.name, href: `/products?category=${product.category.slug}` }]
      : []),
    { label: product.name }
  ]} />

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
    <!-- Image Gallery -->
    <ImageGallery {images} productName={product.name} />

    <!-- Product Information -->
    <div class="flex flex-col">
      {#if product.category}
        <a href="/products?category={product.category.slug}"
           class="text-sm text-gray-500 hover:text-gray-700 uppercase tracking-wide">
          {product.category.name}
        </a>
      {/if}

      <h1 class="text-3xl font-bold text-gray-900 mt-1">{product.name}</h1>

      <!-- Price -->
      <div class="mt-4 flex items-baseline gap-3">
        <span class="text-3xl font-bold text-gray-900">
          {formatPrice(product.price)}
        </span>
        {#if isOnSale}
          <span class="text-xl text-gray-400 line-through">
            {formatPrice(product.compareAtPrice!)}
          </span>
          <span class="text-sm font-semibold text-red-600 bg-red-50 px-2 py-1 rounded">
            Save {formatPrice(product.compareAtPrice! - product.price)}
          </span>
        {/if}
      </div>

      <!-- Stock Status -->
      <div class="mt-4">
        {#if product.inStock}
          <div class="flex items-center gap-2 text-green-700">
            <div class="w-2 h-2 rounded-full bg-green-500"></div>
            <span class="text-sm font-medium">In Stock</span>
            {#if product.stockQuantity <= 10}
              <span class="text-sm text-amber-600">
                - Only {product.stockQuantity} left
              </span>
            {/if}
          </div>
        {:else}
          <div class="flex items-center gap-2 text-red-600">
            <div class="w-2 h-2 rounded-full bg-red-500"></div>
            <span class="text-sm font-medium">Out of Stock</span>
          </div>
        {/if}
      </div>

      <!-- Tags -->
      {#if tagNames.length > 0}
        <div class="mt-4 flex flex-wrap gap-2">
          {#each tagNames as tag}
            <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
              {tag}
            </span>
          {/each}
        </div>
      {/if}

      <!-- Description -->
      <div class="mt-6 prose prose-gray max-w-none">
        <p class="text-gray-600 leading-relaxed">{product.description}</p>
      </div>

      <!-- Add to Cart -->
      <div class="mt-8">
        <AddToCartButton product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price,
          imageUrl: images[0]?.url || ''
        }} disabled={!product.inStock} />
      </div>

      <!-- Product Details -->
      {#if product.sku || product.weight}
        <div class="mt-8 border-t pt-6">
          <h3 class="text-sm font-semibold uppercase tracking-wide text-gray-900">
            Product Details
          </h3>
          <dl class="mt-3 space-y-2 text-sm">
            {#if product.sku}
              <div class="flex justify-between">
                <dt class="text-gray-500">SKU</dt>
                <dd class="text-gray-900">{product.sku}</dd>
              </div>
            {/if}
            {#if product.weight}
              <div class="flex justify-between">
                <dt class="text-gray-500">Weight</dt>
                <dd class="text-gray-900">
                  {product.weight >= 1000
                    ? `${(product.weight / 1000).toFixed(1)} kg`
                    : `${product.weight} g`}
                </dd>
              </div>
            {/if}
          </dl>
        </div>
      {/if}
    </div>
  </div>

  <!-- Related Products -->
  {#if data.relatedProducts.length > 0}
    <section class="mt-16 border-t pt-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">You might also like</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {#each data.relatedProducts as relatedProduct (relatedProduct.id)}
          <ProductCard product={relatedProduct} />
        {/each}
      </div>
    </section>
  {/if}
</div>
```

### The Image Gallery Component

A production image gallery needs keyboard navigation, touch swipe support, and smooth transitions:

```svelte
<!-- src/lib/components/product/ImageGallery.svelte -->
<script lang="ts">
  type GalleryImage = {
    url: string;
    alt: string;
  };

  let { images, productName }: {
    images: GalleryImage[];
    productName: string;
  } = $props();

  let selectedIndex = $state(0);
  let isZoomed = $state(false);

  // Keyboard navigation
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      selectedIndex = Math.max(0, selectedIndex - 1);
    } else if (event.key === 'ArrowRight') {
      selectedIndex = Math.min(images.length - 1, selectedIndex + 1);
    } else if (event.key === 'Escape') {
      isZoomed = false;
    }
  }

  function selectImage(index: number) {
    selectedIndex = index;
  }

  function toggleZoom() {
    isZoomed = !isZoomed;
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
  <!-- Main Image -->
  <div class="aspect-square rounded-lg overflow-hidden bg-gray-100 relative group">
    {#if images.length > 0}
      {#key selectedIndex}
        <button
          onclick={toggleZoom}
          class="w-full h-full cursor-zoom-in focus:outline-none"
          aria-label="Zoom image"
        >
          <img
            src={images[selectedIndex].url}
            alt={images[selectedIndex].alt}
            class="h-full w-full object-cover transition-transform duration-300
                   {isZoomed ? 'scale-150 cursor-zoom-out' : ''}"
          />
        </button>
      {/key}

      <!-- Navigation arrows (visible on hover) -->
      {#if images.length > 1}
        <div class="absolute inset-0 flex items-center justify-between px-2
                    opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <button
            onclick={() => selectImage(Math.max(0, selectedIndex - 1))}
            disabled={selectedIndex === 0}
            class="pointer-events-auto w-10 h-10 bg-white/80 rounded-full flex items-center
                   justify-center shadow-md hover:bg-white disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors"
            aria-label="Previous image"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onclick={() => selectImage(Math.min(images.length - 1, selectedIndex + 1))}
            disabled={selectedIndex === images.length - 1}
            class="pointer-events-auto w-10 h-10 bg-white/80 rounded-full flex items-center
                   justify-center shadow-md hover:bg-white disabled:opacity-30
                   disabled:cursor-not-allowed transition-colors"
            aria-label="Next image"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <!-- Image counter -->
        <div class="absolute bottom-2 right-2 bg-black/60 text-white text-xs
                    px-2 py-1 rounded-full">
          {selectedIndex + 1} / {images.length}
        </div>
      {/if}
    {:else}
      <div class="h-full w-full flex items-center justify-center text-gray-400">
        <div class="text-center">
          <svg class="mx-auto w-24 h-24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="mt-2 text-sm">No images available</p>
        </div>
      </div>
    {/if}
  </div>

  <!-- Thumbnail Strip -->
  {#if images.length > 1}
    <div class="flex gap-2 overflow-x-auto pb-2" role="tablist"
         aria-label="Product images">
      {#each images as image, i}
        <button
          onclick={() => selectImage(i)}
          role="tab"
          aria-selected={selectedIndex === i}
          aria-label="View image {i + 1} of {images.length}"
          class="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2
                 transition-all duration-200 focus:outline-none focus:ring-2
                 focus:ring-offset-2 focus:ring-black
                 {selectedIndex === i
                   ? 'border-black ring-1 ring-black'
                   : 'border-gray-200 hover:border-gray-400 opacity-70 hover:opacity-100'}"
        >
          <img src={image.url} alt="" class="w-full h-full object-cover" />
        </button>
      {/each}
    </div>
  {/if}
</div>
```

Accessibility matters here. The thumbnail strip uses `role="tablist"` and `role="tab"` with `aria-selected` so screen readers understand it is a selection interface. The arrow buttons have descriptive `aria-label` attributes. Keyboard users can navigate with arrow keys via the `svelte:window` keydown handler.

## SEO: Structured Data Deep Dive

Search engines use structured data to display rich results -- star ratings, prices, and stock status right in the search listing. The `application/ld+json` script we added to the detail page tells Google exactly what this page is about.

Here is a more complete Product schema:

```typescript
// src/lib/utils/structured-data.ts

type ProductStructuredData = {
  name: string;
  description: string;
  images: string[];
  sku?: string | null;
  price: number;          // cents
  compareAtPrice?: number | null;
  inStock: boolean;
  brandName?: string;
  reviewCount?: number;
  averageRating?: number;
};

export function buildProductSchema(product: ProductStructuredData) {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.images,
    offers: {
      '@type': 'Offer',
      price: (product.price / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: product.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: typeof window !== 'undefined' ? window.location.href : undefined
    }
  };

  if (product.sku) {
    schema.sku = product.sku;
  }

  if (product.brandName) {
    schema.brand = {
      '@type': 'Brand',
      name: product.brandName
    };
  }

  if (product.reviewCount && product.averageRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.averageRating.toFixed(1),
      reviewCount: product.reviewCount
    };
  }

  return schema;
}
```

Use this in the page component instead of inline object construction:

```svelte
<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(
    buildProductSchema({
      name: product.name,
      description: product.description,
      images: images.map(i => i.url),
      sku: product.sku,
      price: product.price,
      compareAtPrice: product.compareAtPrice,
      inStock: product.inStock
    })
  )}</script>`}
</svelte:head>
```

Test your structured data with Google's Rich Results Test tool. Invalid structured data is silently ignored -- you will not know it is broken unless you explicitly test it.

## Loading States with Streaming

For expensive queries (products with dozens of images, reviews, and related items), you can use SvelteKit's streaming to show the core product data immediately while secondary data loads in the background.

```typescript
// src/routes/(store)/products/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  // Core product data -- await immediately (blocks rendering)
  const product = await db.query.products.findFirst({
    where: and(eq(products.slug, params.slug), eq(products.published, true)),
    with: {
      category: true,
      images: { orderBy: [asc(productImages.position)] }
    }
  });

  if (!product) {
    error(404, { message: 'Product not found' });
  }

  // Secondary data -- stream in (does not block rendering)
  const relatedProducts = db
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
    .where(
      and(
        eq(products.categoryId, product.categoryId!),
        ne(products.id, product.id),
        eq(products.published, true)
      )
    )
    .limit(4);

  return {
    product,
    // Not awaited -- this streams to the client
    streamed: {
      relatedProducts
    }
  };
};
```

In the component, use `{#await}` for the streamed data:

```svelte
<!-- Related Products section with streaming -->
{#await data.streamed.relatedProducts}
  <section class="mt-16 border-t pt-12">
    <h2 class="text-2xl font-bold text-gray-900 mb-6">You might also like</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {#each Array(4) as _}
        <div class="rounded-lg border border-gray-200 overflow-hidden animate-pulse">
          <div class="aspect-square bg-gray-200"></div>
          <div class="p-4 space-y-3">
            <div class="h-3 bg-gray-200 rounded w-1/3"></div>
            <div class="h-4 bg-gray-200 rounded w-3/4"></div>
            <div class="h-5 bg-gray-200 rounded w-1/4"></div>
          </div>
        </div>
      {/each}
    </div>
  </section>
{:then relatedProducts}
  {#if relatedProducts.length > 0}
    <section class="mt-16 border-t pt-12">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">You might also like</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {#each relatedProducts as rp (rp.id)}
          <ProductCard product={rp} />
        {/each}
      </div>
    </section>
  {/if}
{:catch}
  <!-- Silently fail on related products -- not critical -->
{/await}
```

The product detail renders immediately. The related products section shows skeleton cards while the secondary query runs, then swaps in real data. If the related products query fails, we catch the error silently because it is not critical -- the customer can still buy the product.

## Error Boundary for Individual Products

SvelteKit provides a `+error.svelte` page for route-level errors. Create one specifically for the product detail route:

```svelte
<!-- src/routes/(store)/products/[slug]/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="max-w-xl mx-auto px-4 py-16 text-center">
  {#if $page.status === 404}
    <h1 class="text-6xl font-bold text-gray-200">404</h1>
    <h2 class="mt-4 text-xl font-semibold text-gray-900">Product not found</h2>
    <p class="mt-2 text-gray-500">
      The product you are looking for may have been removed or the URL might be incorrect.
    </p>
    <div class="mt-8 flex gap-4 justify-center">
      <a href="/products" class="bg-black text-white px-6 py-3 rounded-lg
                                  hover:bg-gray-800 transition-colors">
        Browse Products
      </a>
      <a href="/" class="border border-gray-300 px-6 py-3 rounded-lg
                          hover:bg-gray-50 transition-colors">
        Go Home
      </a>
    </div>
  {:else}
    <h1 class="text-6xl font-bold text-gray-200">{$page.status}</h1>
    <h2 class="mt-4 text-xl font-semibold text-gray-900">Something went wrong</h2>
    <p class="mt-2 text-gray-500">{$page.error?.message}</p>
    <a href="/products" class="mt-8 inline-block bg-black text-white px-6 py-3
                                rounded-lg hover:bg-gray-800 transition-colors">
      Back to Products
    </a>
  {/if}
</div>
```

This error page is scoped to the `[slug]` route. A 404 for a missing product shows a helpful message and navigation options instead of a generic error page. The rest of the store layout (header, footer) still renders because the error boundary is nested inside the `(store)` layout group.

## Product Variants Pattern

Many products come in variants -- sizes, colors, materials. While a full variant system is complex (it requires a separate `product_variants` table with its own prices and stock levels), here is a simplified approach for when products have a single variant axis like size:

```svelte
<!-- src/lib/components/product/VariantSelector.svelte -->
<script lang="ts">
  type Variant = {
    id: number;
    label: string;
    available: boolean;
    priceModifier?: number;  // additional cents (e.g., 500 = +$5.00)
  };

  let {
    variants,
    selected = $bindable<number | null>(null),
    label = 'Size'
  }: {
    variants: Variant[];
    selected: number | null;
    label?: string;
  } = $props();
</script>

<fieldset>
  <legend class="text-sm font-semibold text-gray-900">{label}</legend>
  <div class="mt-2 flex flex-wrap gap-2">
    {#each variants as variant}
      <button
        type="button"
        onclick={() => { selected = variant.id; }}
        disabled={!variant.available}
        class="px-4 py-2 rounded-lg border text-sm font-medium transition-all
               {selected === variant.id
                 ? 'border-black bg-black text-white'
                 : variant.available
                   ? 'border-gray-300 text-gray-700 hover:border-gray-500'
                   : 'border-gray-200 text-gray-300 cursor-not-allowed line-through'}"
        aria-pressed={selected === variant.id}
        aria-label="{label}: {variant.label}{variant.available ? '' : ' (unavailable)'}"
      >
        {variant.label}
      </button>
    {/each}
  </div>
  {#if variants.every(v => !v.available)}
    <p class="mt-2 text-sm text-red-600">All sizes are currently unavailable.</p>
  {/if}
</fieldset>
```

Use it on the product detail page:

```svelte
<script lang="ts">
  let selectedSize = $state<number | null>(null);

  const sizes = [
    { id: 1, label: 'S', available: true },
    { id: 2, label: 'M', available: true },
    { id: 3, label: 'L', available: false },
    { id: 4, label: 'XL', available: true }
  ];
</script>

<VariantSelector
  variants={sizes}
  bind:selected={selectedSize}
  label="Size"
/>
```

The `$bindable` pattern lets the parent component read which variant is selected and include it in the add-to-cart payload.

## Try It

1. Add a "recently viewed" feature. Create a `.svelte.ts` module that maintains a list of the last 5 viewed product slugs in `localStorage`. On the product detail page, add the current product to the list when the page loads. Display a "Recently Viewed" section below the related products, fetching those products from the server.

2. Enhance the product listing page with a "Featured Products" hero section at the top that displays the first 3 featured products in a larger card format (spanning 2 columns), followed by the regular product grid below.

3. Add a color swatch variant selector. Instead of text buttons, render small colored circles (using the variant's hex color code as the background). Show a checkmark inside the selected swatch.

## Key Takeaways

- Use server load functions with explicit column selection to fetch only the data the client needs, preventing data leakage and reducing payload size
- Dynamic routes with `[slug]` parameters create clean, SEO-friendly product URLs that are meaningful to both users and search engines
- Store prices in cents and format them with `Intl.NumberFormat` to avoid floating-point display issues across all locales
- Implement structured data (JSON-LD) on product pages so search engines can display rich results with prices and stock status
- Use Drizzle's relational query API with `with` to fetch nested data (images, tags, categories) in a single database round trip
- Stream secondary data (related products, reviews) to render the core product detail immediately without blocking on less critical queries
- Build accessible image galleries with keyboard navigation, ARIA attributes, and meaningful alt text
- Always handle edge cases: missing images, out-of-stock products, 404 errors, and empty related products
- Extract reusable components (ProductCard, ImageGallery, VariantSelector) that work across listing, detail, search, and admin pages
- Test structured data with Google's Rich Results Test -- invalid markup is silently ignored and you will never know it is broken without explicit testing
