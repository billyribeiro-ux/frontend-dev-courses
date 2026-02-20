# Catalog Polish

A functional catalog is good. A polished catalog sells products. In this lesson you will add scroll animations with GSAP, responsive product cards, breadcrumb navigation, and loading skeletons. These details separate a student project from a production storefront.

None of these features change the core functionality, but they dramatically improve the user experience. Polish is what makes customers trust your store enough to enter their credit card.

## GSAP Scroll Animations

Animate product cards as they scroll into view using GSAP and ScrollTrigger:

```bash
npm install gsap
```

```svelte
<!-- src/lib/components/product/AnimatedProductGrid.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  let { products } = $props();
  let grid: HTMLDivElement;

  onMount(() => {
    gsap.registerPlugin(ScrollTrigger);

    const cards = grid.querySelectorAll('.product-card');

    gsap.set(cards, { opacity: 0, y: 40 });

    cards.forEach((card, i) => {
      gsap.to(card, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        delay: i * 0.08,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: card,
          start: 'top 90%',
          toggleActions: 'play none none none'
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach(t => t.kill());
  });
</script>

<div bind:this={grid}
     class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {#each products as product}
    <div class="product-card">
      <slot {product} />
    </div>
  {/each}
</div>
```

## Responsive Product Cards

Build cards that look good at every screen size:

```svelte
<!-- src/lib/components/product/ProductCard.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';

  let { product } = $props();
</script>

<a href="/products/{product.slug}"
   class="group block rounded-lg overflow-hidden border border-gray-200
          hover:shadow-lg transition-shadow duration-300">
  <div class="aspect-square bg-gray-100 overflow-hidden">
    <img src={product.imageUrl} alt={product.name}
         class="h-full w-full object-cover
                group-hover:scale-105 transition-transform duration-500" />
  </div>

  <div class="p-4">
    <p class="text-xs text-gray-500 uppercase tracking-wide">
      {product.categoryName ?? 'Uncategorized'}
    </p>
    <h3 class="font-semibold mt-1 truncate">{product.name}</h3>
    <div class="flex items-center justify-between mt-2">
      <span class="text-lg font-bold">{formatPrice(product.price)}</span>
      <span class="text-sm text-green-600">In Stock</span>
    </div>
  </div>
</a>
```

## Breadcrumb Navigation

Help users understand where they are in the store hierarchy:

```svelte
<!-- src/lib/components/ui/Breadcrumbs.svelte -->
<script lang="ts">
  type Crumb = { label: string; href?: string };
  let { crumbs }: { crumbs: Crumb[] } = $props();
</script>

<nav class="text-sm text-gray-500 mb-6">
  <ol class="flex items-center gap-2">
    <li><a href="/" class="hover:text-black">Home</a></li>
    {#each crumbs as crumb, i}
      <li class="flex items-center gap-2">
        <span>/</span>
        {#if crumb.href && i < crumbs.length - 1}
          <a href={crumb.href} class="hover:text-black">{crumb.label}</a>
        {:else}
          <span class="text-black font-medium">{crumb.label}</span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
```

Use it on the product detail page:

```svelte
<Breadcrumbs crumbs={[
  { label: 'Products', href: '/products' },
  { label: data.product.categories.name,
    href: `/products?category=${data.product.categories.slug}` },
  { label: data.product.products.name }
]} />
```

## Loading Skeletons

Show placeholders while data loads to prevent layout shift:

```svelte
<!-- src/lib/components/ui/ProductCardSkeleton.svelte -->
<div class="rounded-lg border border-gray-200 overflow-hidden animate-pulse">
  <div class="aspect-square bg-gray-200"></div>
  <div class="p-4 space-y-3">
    <div class="h-3 bg-gray-200 rounded w-1/3"></div>
    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
    <div class="flex justify-between">
      <div class="h-5 bg-gray-200 rounded w-1/4"></div>
      <div class="h-4 bg-gray-200 rounded w-1/5"></div>
    </div>
  </div>
</div>
```

For SvelteKit streaming with `await`, combine the skeleton with a loading state:

```svelte
{#await data.products}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each Array(8) as _}
      <ProductCardSkeleton />
    {/each}
  </div>
{:then products}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each products as product}
      <ProductCard {product} />
    {/each}
  </div>
{/await}
```

## Try It

Add a hover effect to the product card that reveals an "Add to Cart" button overlaying the image. Use Tailwind's `opacity-0 group-hover:opacity-100` pattern to show the button only on hover, and add a subtle backdrop blur behind it.

## Key Takeaways

- GSAP ScrollTrigger creates staggered reveal animations that make catalogs feel dynamic
- Always clean up ScrollTrigger instances in the `onMount` return function to prevent memory leaks
- Breadcrumbs improve navigation and help search engines understand your site structure
- Loading skeletons prevent layout shift and give users immediate visual feedback while data loads
- Small polish details like hover transitions, truncated text, and consistent spacing build customer trust
