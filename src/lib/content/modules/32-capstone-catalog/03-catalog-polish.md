# Catalog Polish

A functional catalog is good. A polished catalog sells products. In this lesson you will add loading skeletons with shimmer effects, image lazy loading with progressive enhancement, view transitions between pages, comprehensive error states with retry, accessible infinite scroll, responsive design polish, and performance optimization. These details separate a student project from a production storefront.

None of these features change the core functionality, but they dramatically improve the user experience. Polish is what makes customers trust your store enough to enter their credit card.

## Loading Skeletons with Shimmer

Loading skeletons prevent layout shift and give users immediate visual feedback that content is coming. The skeleton must match the exact dimensions of the real content -- otherwise the page "jumps" when data arrives.

### Product Card Skeleton

```svelte
<!-- src/lib/components/ui/ProductCardSkeleton.svelte -->
<div class="rounded-lg border border-gray-200 overflow-hidden" aria-hidden="true">
  <div class="aspect-square bg-gray-200 shimmer"></div>
  <div class="p-4 space-y-3">
    <div class="h-3 bg-gray-200 rounded w-1/3 shimmer"></div>
    <div class="h-4 bg-gray-200 rounded w-3/4 shimmer"></div>
    <div class="flex justify-between">
      <div class="h-5 bg-gray-200 rounded w-1/4 shimmer"></div>
      <div class="h-4 bg-gray-200 rounded w-1/5 shimmer"></div>
    </div>
  </div>
</div>

<style>
  .shimmer {
    background: linear-gradient(
      90deg,
      rgb(229 231 235) 0%,
      rgb(243 244 246) 50%,
      rgb(229 231 235) 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>
```

The `aria-hidden="true"` attribute is critical. Screen readers should not announce "gray rectangle, gray rectangle, gray rectangle" -- they should simply wait for the real content.

The shimmer animation uses a gradient that slides across the element, creating the illusion of light reflecting off a loading surface. This is more polished than a static gray block or a spinning loader because it communicates "content is being loaded into this exact space."

### Grid Skeleton Component

Wrap the skeleton in a reusable grid component that matches the layout of the real product grid:

```svelte
<!-- src/lib/components/ui/ProductGridSkeleton.svelte -->
<script lang="ts">
  let { count = 8 }: { count?: number } = $props();
</script>

<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
     role="status" aria-label="Loading products">
  {#each Array(count) as _, i}
    <ProductCardSkeleton />
  {/each}
  <span class="sr-only">Loading products, please wait...</span>
</div>
```

The `role="status"` and `sr-only` span inform screen readers that the page is loading. The `count` prop lets you match the expected number of results -- showing 4 skeletons when you know a "featured" section will have exactly 4 items.

### Using Skeletons with SvelteKit Streaming

When you stream data from the server, use skeletons as the pending state in `{#await}` blocks:

```svelte
{#await data.streamed.products}
  <ProductGridSkeleton count={12} />
{:then products}
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each products as product (product.id)}
      <ProductCard {product} />
    {/each}
  </div>
{:catch error}
  <ErrorState message="Failed to load products" onRetry={() => invalidateAll()} />
{/await}
```

### Detail Page Skeleton

Product detail pages need their own skeleton that matches the two-column layout:

```svelte
<!-- src/lib/components/ui/ProductDetailSkeleton.svelte -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" aria-hidden="true">
  <!-- Breadcrumb skeleton -->
  <div class="flex gap-2 mb-6">
    <div class="h-4 bg-gray-200 rounded w-12 shimmer"></div>
    <div class="h-4 bg-gray-200 rounded w-2 shimmer"></div>
    <div class="h-4 bg-gray-200 rounded w-20 shimmer"></div>
    <div class="h-4 bg-gray-200 rounded w-2 shimmer"></div>
    <div class="h-4 bg-gray-200 rounded w-32 shimmer"></div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
    <!-- Image skeleton -->
    <div class="space-y-4">
      <div class="aspect-square bg-gray-200 rounded-lg shimmer"></div>
      <div class="flex gap-2">
        {#each Array(4) as _}
          <div class="w-20 h-20 bg-gray-200 rounded-lg shimmer"></div>
        {/each}
      </div>
    </div>

    <!-- Info skeleton -->
    <div class="space-y-4">
      <div class="h-4 bg-gray-200 rounded w-24 shimmer"></div>
      <div class="h-8 bg-gray-200 rounded w-3/4 shimmer"></div>
      <div class="h-8 bg-gray-200 rounded w-1/3 shimmer"></div>
      <div class="h-4 bg-gray-200 rounded w-28 shimmer"></div>
      <div class="space-y-2 mt-6">
        <div class="h-4 bg-gray-200 rounded w-full shimmer"></div>
        <div class="h-4 bg-gray-200 rounded w-5/6 shimmer"></div>
        <div class="h-4 bg-gray-200 rounded w-4/6 shimmer"></div>
      </div>
      <div class="h-12 bg-gray-200 rounded-lg w-full mt-8 shimmer"></div>
    </div>
  </div>
</div>
```

Use this skeleton in the layout's loading state or in a `+loading.svelte` file:

```svelte
<!-- src/routes/(store)/products/[slug]/+loading.svelte -->
<script>
  import ProductDetailSkeleton from '$lib/components/ui/ProductDetailSkeleton.svelte';
</script>

<ProductDetailSkeleton />
```

## Image Lazy Loading and Progressive Enhancement

Image optimization is one of the highest-impact performance improvements you can make. Images are typically the largest assets on a product page.

### Lazy Loading with Intersection Observer

For more control than the browser's native `loading="lazy"`, use an Intersection Observer to load images only when they enter the viewport:

```svelte
<!-- src/lib/components/ui/LazyImage.svelte -->
<script lang="ts">
  let {
    src,
    alt,
    class: className = '',
    aspectRatio = 'aspect-square',
    sizes = '(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw'
  }: {
    src: string;
    alt: string;
    class?: string;
    aspectRatio?: string;
    sizes?: string;
  } = $props();

  let imgElement: HTMLImageElement;
  let isLoaded = $state(false);
  let isInView = $state(false);
  let hasError = $state(false);

  $effect(() => {
    if (!imgElement) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          isInView = true;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }  // Start loading 200px before visible
    );

    observer.observe(imgElement);

    return () => observer.disconnect();
  });
</script>

<div class="{aspectRatio} bg-gray-100 overflow-hidden relative {className}">
  {#if hasError}
    <div class="absolute inset-0 flex items-center justify-center text-gray-400">
      <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  {:else}
    <img
      bind:this={imgElement}
      src={isInView ? src : undefined}
      {alt}
      {sizes}
      decoding="async"
      onload={() => isLoaded = true}
      onerror={() => hasError = true}
      class="h-full w-full object-cover transition-opacity duration-300
             {isLoaded ? 'opacity-100' : 'opacity-0'}"
    />
  {/if}

  <!-- Loading placeholder -->
  {#if !isLoaded && !hasError}
    <div class="absolute inset-0 bg-gray-200 shimmer"></div>
  {/if}
</div>
```

The `rootMargin: '200px'` starts loading images when they are 200 pixels below the viewport. This gives the browser a head start so images appear loaded by the time the user scrolls to them.

The opacity transition from 0 to 1 creates a smooth fade-in effect. Without it, images "pop" into existence, which looks jarring.

### Responsive Image Sizes

The `sizes` attribute tells the browser how wide the image will be at different viewport sizes. Without it, the browser assumes the image is full-width and downloads the largest version even for thumbnail-sized cards.

For a 4-column grid:
- At `xl` (1280px+): each card is 25% of the viewport
- At `lg` (1024px+): each card is 33% of the viewport
- At `sm` (640px+): each card is 50% of the viewport
- Below `sm`: each card is 100% of the viewport

If your images are served from a CDN with automatic resizing (Cloudinary, Imgix, Vercel Image Optimization), you can also generate `srcset` attributes:

```typescript
// src/lib/utils/image.ts
export function getImageSrcSet(baseUrl: string, widths: number[] = [320, 640, 960, 1280]): string {
  return widths
    .map(w => `${baseUrl}?w=${w}&q=80&auto=format ${w}w`)
    .join(', ');
}
```

## View Transitions

SvelteKit supports the View Transitions API for smooth animations between pages. When a user clicks from the product listing to a product detail, the product image can smoothly animate from its grid position to the detail page position.

```svelte
<!-- In ProductCard.svelte, add a view-transition-name to the image -->
<div class="aspect-square bg-gray-100 overflow-hidden"
     style="view-transition-name: product-image-{product.id}">
  <img src={product.imageUrl} alt={product.name}
       class="h-full w-full object-cover" />
</div>
```

```svelte
<!-- In the product detail page, use the same view-transition-name -->
<div class="aspect-square rounded-lg overflow-hidden bg-gray-100"
     style="view-transition-name: product-image-{data.product.id}">
  <img src={images[selectedIndex].url} alt={data.product.name}
       class="h-full w-full object-cover" />
</div>
```

Enable view transitions in your layout:

```svelte
<!-- src/routes/(store)/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  let { children } = $props();

  onNavigate((navigation) => {
    // Only animate if the browser supports View Transitions
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

{@render children()}
```

Add CSS to control the transition animation:

```css
/* src/app.css or in the layout's <style> block */
@keyframes fade-in {
  from { opacity: 0; }
}

@keyframes fade-out {
  to { opacity: 0; }
}

@keyframes slide-from-right {
  from { transform: translateX(30px); opacity: 0; }
}

@keyframes slide-to-left {
  to { transform: translateX(-30px); opacity: 0; }
}

::view-transition-old(root) {
  animation: 200ms ease-out both fade-out;
}

::view-transition-new(root) {
  animation: 200ms ease-out both fade-in;
}

/* Product image transitions smoothly between listing and detail */
::view-transition-old(product-image-*),
::view-transition-new(product-image-*) {
  animation: none;
  mix-blend-mode: normal;
}
```

View transitions are progressive enhancement -- they only apply in browsers that support the API (Chrome 111+, Edge 111+, Safari 18+). Other browsers get instant page navigation, which is still perfectly fine.

## GSAP Scroll Animations

Animate product cards as they scroll into view for a dynamic catalog feel:

```svelte
<!-- src/lib/components/product/AnimatedProductGrid.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let { children } = $props();
  let grid: HTMLDivElement;

  onMount(async () => {
    // Dynamic import to avoid bundling GSAP on the server
    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    const cards = grid.querySelectorAll('.product-card');
    gsap.set(cards, { opacity: 0, y: 40 });

    // Use a batch for better performance with many cards
    ScrollTrigger.batch(cards, {
      onEnter: (batch) => {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.5,
          stagger: 0.08,
          ease: 'power2.out'
        });
      },
      start: 'top 90%'
    });

    // Respect reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set(cards, { opacity: 1, y: 0 });
      ScrollTrigger.getAll().forEach(t => t.kill());
    }

    return () => {
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  });
</script>

<div bind:this={grid}
     class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {@render children()}
</div>
```

Three important patterns here:

**Dynamic import.** GSAP is loaded only on the client, not during SSR. The `await import()` also means GSAP is code-split and only downloaded when the component actually renders.

**`ScrollTrigger.batch`** groups multiple elements into a single trigger. Instead of creating one ScrollTrigger per card (12+ observers for a page of products), the batch creates a single observer that handles all cards. This is significantly more performant.

**Reduced motion respect.** Users who enable `prefers-reduced-motion` in their OS settings get no animation. The cards simply appear at full opacity. This is not just nice to have -- it is an accessibility requirement that prevents triggering motion sickness.

## Error States with Retry

When a product load fails -- database timeout, network error, invalid data -- the user needs to understand what happened and have a clear path to recovery.

```svelte
<!-- src/lib/components/ui/ErrorState.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';

  let {
    title = 'Something went wrong',
    message = 'We could not load this content. Please try again.',
    onRetry,
    showRetry = true
  }: {
    title?: string;
    message?: string;
    onRetry?: () => void;
    showRetry?: boolean;
  } = $props();

  let retrying = $state(false);

  async function handleRetry() {
    retrying = true;
    try {
      if (onRetry) {
        onRetry();
      } else {
        await invalidateAll();
      }
    } finally {
      // Small delay so the user sees the loading state
      setTimeout(() => { retrying = false; }, 500);
    }
  }
</script>

<div class="flex flex-col items-center justify-center py-16 px-4 text-center">
  <div class="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
    <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  </div>

  <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
  <p class="mt-2 text-gray-500 max-w-md">{message}</p>

  {#if showRetry}
    <button
      onclick={handleRetry}
      disabled={retrying}
      class="mt-6 inline-flex items-center gap-2 bg-gray-900 text-white px-6 py-2.5
             rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors
             disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {#if retrying}
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
                  stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        Retrying...
      {:else}
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Try Again
      {/if}
    </button>
  {/if}
</div>
```

The `invalidateAll()` call re-runs all load functions for the current route. This is the "nuclear option" for retry -- it refreshes all data. For more granular retry, use `invalidate('app:products')` with a custom invalidation key.

## Breadcrumb Navigation

Breadcrumbs help users understand where they are and navigate back up the hierarchy. They also provide structured data that search engines use.

```svelte
<!-- src/lib/components/ui/Breadcrumbs.svelte -->
<script lang="ts">
  type Crumb = {
    label: string;
    href?: string;
  };

  let { crumbs }: { crumbs: Crumb[] } = $props();

  // Build structured data for breadcrumbs
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
      ...crumbs.map((crumb, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: crumb.label,
        ...(crumb.href ? { item: crumb.href } : {})
      }))
    ]
  };
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`}
</svelte:head>

<nav aria-label="Breadcrumb" class="text-sm text-gray-500 mb-6">
  <ol class="flex items-center flex-wrap gap-1">
    <li class="flex items-center">
      <a href="/" class="hover:text-gray-900 transition-colors">Home</a>
    </li>
    {#each crumbs as crumb, i}
      <li class="flex items-center gap-1">
        <svg class="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor"
             viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 5l7 7-7 7" />
        </svg>
        {#if crumb.href && i < crumbs.length - 1}
          <a href={crumb.href} class="hover:text-gray-900 transition-colors">
            {crumb.label}
          </a>
        {:else}
          <span class="text-gray-900 font-medium" aria-current="page">
            {crumb.label}
          </span>
        {/if}
      </li>
    {/each}
  </ol>
</nav>
```

The `aria-current="page"` attribute on the last breadcrumb tells screen readers which item represents the current page. The chevron separator is an SVG rather than a text character for consistent rendering across platforms.

## Infinite Scroll vs Pagination

Infinite scroll loads more products as the user scrolls, avoiding explicit page changes. It works well for browsing-oriented interfaces but has significant tradeoffs.

**Advantages:**
- No page breaks interrupt the browsing flow
- Feels natural on mobile (scroll is the primary interaction)
- Higher engagement metrics (users view more products)

**Disadvantages:**
- Users cannot bookmark a specific "page" of results
- Cannot jump to a specific point in the catalog
- The footer becomes unreachable (new content keeps pushing it down)
- Browser memory grows unbounded with thousands of products
- Back button does not restore scroll position reliably

For e-commerce, **traditional pagination is usually better** because bookmarkable URLs, SEO, and stable back-button behavior are critical. But if you want infinite scroll as an option, here is how to implement it properly:

```svelte
<!-- src/lib/components/product/InfiniteScroll.svelte -->
<script lang="ts">
  let {
    hasMore,
    loading,
    onLoadMore
  }: {
    hasMore: boolean;
    loading: boolean;
    onLoadMore: () => void;
  } = $props();

  let sentinel: HTMLDivElement;

  $effect(() => {
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasMore && !loading) {
          onLoadMore();
        }
      },
      { rootMargin: '400px' }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  });
</script>

<div bind:this={sentinel} class="h-1" aria-hidden="true"></div>

{#if loading}
  <div class="flex justify-center py-8">
    <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor"
              stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
  </div>
{:else if !hasMore}
  <p class="text-center py-8 text-sm text-gray-400">
    You have seen all products
  </p>
{/if}
```

The `rootMargin: '400px'` triggers loading when the sentinel is 400px below the viewport, giving the browser time to fetch and render the next batch before the user reaches the bottom. Without this margin, the user sees a loading spinner.

## Responsive Design Polish

A polished catalog works perfectly across phone, tablet, and desktop. Here are the specific breakpoints and layout shifts:

```svelte
<!-- Responsive product listing with adaptive layout -->
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Mobile: stack filters and sort above products -->
  <!-- Desktop: sidebar filters on the left -->
  <div class="flex flex-col lg:flex-row gap-8">

    <!-- Filter sidebar: hidden on mobile by default, shown via toggle -->
    <aside class="lg:w-64 lg:flex-shrink-0 {showFilters ? 'block' : 'hidden lg:block'}">
      <!-- On mobile, filters appear as a full-width panel above products -->
      <!-- On desktop, they sit as a persistent sidebar -->
      <div class="lg:sticky lg:top-8 space-y-6">
        <CategoryFilter {categories} {activeCategory} />
        <PriceFilter {priceRange} {currentMin} {currentMax} />
      </div>
    </aside>

    <!-- Product grid: adapts columns based on available width -->
    <main class="flex-1 min-w-0">
      <!-- min-w-0 prevents flexbox overflow with long product names -->

      <div class="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
        <!-- 2 columns even on smallest screens for product cards -->
        <!-- Tighter gap on mobile (12px vs 24px) -->
        {#each products as product}
          <ProductCard {product} />
        {/each}
      </div>
    </main>
  </div>
</div>
```

The `min-w-0` on the flex child is one of the most common flexbox bugs. Without it, a long product name can force the content area to overflow its flex container because the default `min-width` for flex items is `auto`. Setting it to `0` allows the content to shrink properly.

The `lg:sticky lg:top-8` on the filter sidebar keeps it visible as the user scrolls through a long product list, which dramatically improves usability.

## Performance Optimization

### Image Format Optimization

Modern image formats reduce file sizes by 30-50% compared to JPEG and PNG:

```typescript
// src/lib/utils/image.ts

/**
 * Generate an optimized image URL with format conversion.
 * Works with CDNs like Cloudinary, Imgix, or Vercel Image Optimization.
 */
export function optimizedImageUrl(
  src: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'auto' | 'webp' | 'avif';
  } = {}
): string {
  const { width, height, quality = 80, format = 'auto' } = options;

  // Example with Vercel Image Optimization
  const params = new URLSearchParams();
  params.set('url', src);
  if (width) params.set('w', String(width));
  if (height) params.set('h', String(height));
  params.set('q', String(quality));

  return `/_vercel/image?${params.toString()}`;
}
```

### Preloading Critical Images

The first product image visible on screen (above the fold) should be preloaded so it appears immediately:

```svelte
<svelte:head>
  {#if data.products[0]?.imageUrl}
    <link rel="preload" as="image" href={data.products[0].imageUrl}
          fetchpriority="high" />
  {/if}
</svelte:head>
```

The `fetchpriority="high"` attribute tells the browser to prioritize this image over other resources. Only use it for the single most important image on the page -- overusing it cancels out the priority boost.

### Bundle Size Awareness

Track your JavaScript bundle size to prevent regressions:

```bash
# After building, check the output
npx vite build
# SvelteKit prints route sizes automatically

# For detailed analysis:
npx vite-bundle-visualizer
```

Rules of thumb for e-commerce performance budgets:
- **Total JavaScript:** Under 200KB (compressed)
- **Largest Contentful Paint:** Under 2.5 seconds
- **First Input Delay:** Under 100ms
- **Cumulative Layout Shift:** Under 0.1
- **Image per card:** Under 50KB (with proper compression)

## Accessibility Audit Checklist

Before considering the catalog "done," verify these accessibility requirements:

```
Keyboard Navigation:
[x] Every product card is reachable with Tab
[x] Enter/Space on a card navigates to the product
[x] Filter buttons are keyboard accessible
[x] Sort dropdown works with arrow keys
[x] Image gallery arrows work with keyboard
[x] Focus indicators are visible on all interactive elements

Screen Reader:
[x] Product cards announce name, price, and category
[x] Images have descriptive alt text
[x] Skeletons are hidden with aria-hidden
[x] Loading states announce with role="status"
[x] Pagination announces current page with aria-current
[x] Empty states are announced clearly

Visual:
[x] Color contrast meets WCAG AA (4.5:1 for text)
[x] Text is readable at 200% zoom
[x] Touch targets are at least 44x44 pixels on mobile
[x] No information conveyed by color alone (sale badges have text too)
[x] Reduced motion is respected
```

Test with a real screen reader. VoiceOver on macOS, NVDA on Windows, or TalkBack on Android. Automated accessibility tools catch about 30% of issues -- the rest requires human testing.

## Try It

1. Create a "quick view" modal that opens when hovering over a product card and clicking a "Quick View" button. The modal shows the product image, name, price, and an Add to Cart button without navigating to the detail page. Use the `<dialog>` element for proper accessibility and trap focus inside the modal.

2. Implement a "compare products" feature. Add a checkbox to each product card. When 2-3 products are checked, show a floating comparison bar at the bottom of the screen with a "Compare" button. The comparison page shows products side by side with their specs.

3. Add a skeleton animation that uses CSS `@property` for a smoother gradient effect instead of background-position animation. The `@property` approach enables GPU-accelerated animation.

4. Implement a "masonry" layout option for the product grid, where cards have varying heights based on their image aspect ratio. Use CSS Grid with `grid-row: span 2` for featured products.

## Key Takeaways

- Loading skeletons must match the exact dimensions of real content to prevent cumulative layout shift
- Use `aria-hidden="true"` on skeletons so screen readers do not announce placeholder content
- Lazy load images with Intersection Observer and a 200px root margin to start loading before the image enters the viewport
- View Transitions API creates smooth animations between listing and detail pages as progressive enhancement
- GSAP's `ScrollTrigger.batch` is more performant than individual triggers for product grids with many items
- Respect `prefers-reduced-motion` by disabling animations for users who have enabled that OS setting
- Error states with retry buttons give users a clear recovery path when data loading fails
- Breadcrumbs improve navigation and provide structured data for search engines
- Use `min-w-0` on flex children to prevent content overflow from long text
- Preload only the single most important above-the-fold image with `fetchpriority="high"`
- Test accessibility with real screen readers -- automated tools catch only 30% of issues
