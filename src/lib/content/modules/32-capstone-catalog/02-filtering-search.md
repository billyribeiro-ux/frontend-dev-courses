# Filtering & Search

A product listing without filtering is just a wall of items. Customers need to narrow results by category, filter by price range, sort by relevance or price, search by name, and paginate through large catalogs. In this lesson you will build a comprehensive server-side filtering system using URL search parameters, keeping everything bookmarkable, shareable, and back-button friendly.

The key principle: **filters belong in the URL, not in component state.** When a customer filters by "Electronics," sorts by "Price: Low to High," and lands on page 3, that exact view must be reproducible by copying the URL. This is not just good UX -- it is critical for SEO, analytics, and customer support ("what page were you looking at?").

## Why URL-Based Filtering Matters

Consider the alternative: storing filters in `$state`. The customer finds exactly the product they want through a combination of filters. They copy the URL to send to a friend. The friend opens it and sees the unfiltered default view. The customer cannot bookmark their filtered view. The back button does not undo filter changes. Search engines cannot index filtered pages.

URL-based filtering solves all of these problems because the URL *is* the state. SvelteKit's load functions re-run whenever URL parameters change, making this pattern natural.

## Server-Side Filtering with URL Params

The load function reads every filter from the URL, builds a dynamic SQL query, and returns the matching products plus metadata for the UI to render filter controls.

```typescript
// src/routes/(store)/products/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { eq, ilike, asc, desc, and, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const PRODUCTS_PER_PAGE = 12;

// Whitelist valid sort options to prevent SQL injection via sort param
const SORT_OPTIONS = {
  'newest': { column: products.createdAt, direction: 'desc' },
  'oldest': { column: products.createdAt, direction: 'asc' },
  'price-asc': { column: products.price, direction: 'asc' },
  'price-desc': { column: products.price, direction: 'desc' },
  'name-asc': { column: products.name, direction: 'asc' },
  'name-desc': { column: products.name, direction: 'desc' }
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

export const load: PageServerLoad = async ({ url }) => {
  // ── Extract and validate URL parameters ─────────
  const category = url.searchParams.get('category');
  const sort = (url.searchParams.get('sort') || 'newest') as SortKey;
  const search = url.searchParams.get('q')?.trim() || null;
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const minPrice = url.searchParams.get('min')
    ? Number(url.searchParams.get('min')) * 100  // convert dollars to cents
    : null;
  const maxPrice = url.searchParams.get('max')
    ? Number(url.searchParams.get('max')) * 100
    : null;

  // ── Build WHERE conditions dynamically ──────────
  const conditions: SQL[] = [
    eq(products.inStock, true),
    eq(products.published, true)
  ];

  if (category) {
    conditions.push(eq(categories.slug, category));
  }

  if (search) {
    // Search across name and description
    conditions.push(
      sql`(${ilike(products.name, `%${search}%`)} OR ${ilike(products.description, `%${search}%`)})`
    );
  }

  if (minPrice !== null) {
    conditions.push(gte(products.price, minPrice));
  }

  if (maxPrice !== null) {
    conditions.push(lte(products.price, maxPrice));
  }

  const whereClause = and(...conditions);

  // ── Determine sort order ────────────────────────
  const sortConfig = SORT_OPTIONS[sort] || SORT_OPTIONS['newest'];
  const orderBy = sortConfig.direction === 'desc'
    ? desc(sortConfig.column)
    : asc(sortConfig.column);

  // ── Execute queries in parallel ─────────────────
  const [filtered, countResult, allCategories, priceRange] = await Promise.all([
    // 1. Fetch the current page of products
    db
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
      .where(whereClause)
      .orderBy(orderBy)
      .limit(PRODUCTS_PER_PAGE)
      .offset((page - 1) * PRODUCTS_PER_PAGE),

    // 2. Get total count for pagination
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause),

    // 3. Fetch all categories for the filter sidebar
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        productCount: sql<number>`cast(count(${products.id}) as int)`
      })
      .from(categories)
      .leftJoin(products, and(
        eq(products.categoryId, categories.id),
        eq(products.published, true),
        eq(products.inStock, true)
      ))
      .groupBy(categories.id, categories.name, categories.slug)
      .orderBy(asc(categories.name)),

    // 4. Get price range for the price filter
    db
      .select({
        min: sql<number>`coalesce(min(${products.price}), 0)`,
        max: sql<number>`coalesce(max(${products.price}), 0)`
      })
      .from(products)
      .where(and(eq(products.published, true), eq(products.inStock, true)))
  ]);

  const totalCount = countResult[0]?.count ?? 0;
  const totalPages = Math.ceil(totalCount / PRODUCTS_PER_PAGE);

  return {
    products: filtered,
    categories: allCategories,
    totalCount,
    totalPages,
    currentPage: page,
    priceRange: {
      min: Math.floor((priceRange[0]?.min ?? 0) / 100),
      max: Math.ceil((priceRange[0]?.max ?? 0) / 100)
    },
    filters: {
      category,
      sort,
      search,
      minPrice: minPrice !== null ? minPrice / 100 : null,
      maxPrice: maxPrice !== null ? maxPrice / 100 : null
    }
  };
};
```

Several important patterns in this load function:

**`Promise.all` for parallel queries.** Four independent queries run at the same time instead of sequentially. On a database with 10ms round-trip latency, this turns 40ms into 10ms.

**Whitelist valid sort options.** The sort parameter comes from the URL, which means it comes from the user. Never interpolate user input directly into SQL. The `SORT_OPTIONS` object acts as a whitelist -- any value not in the object falls back to `'newest'`.

**Price filter conversion.** The URL uses human-readable dollars (`?min=20&max=50`) while the database stores cents. The load function handles the conversion in both directions.

**Category product counts.** The categories query includes a count of products per category using a LEFT JOIN and GROUP BY. This powers the "(42)" count next to each category name in the filter sidebar.

**`Math.max(1, ...)` for page number.** Never trust user input. Someone will request `?page=0` or `?page=-5`. Clamping to minimum 1 prevents negative offsets.

## The Filter URL Helper

Every filter component needs to update URL parameters. Instead of duplicating URL manipulation logic across components, create a single helper:

```typescript
// src/lib/utils/filter-url.ts

/**
 * Create a new URL with updated search parameters.
 * Automatically removes parameters with null/undefined values.
 * Resets page to 1 when filters change (unless page is explicitly set).
 */
export function updateSearchParams(
  currentUrl: URL,
  params: Record<string, string | number | null | undefined>,
  options: { resetPage?: boolean } = { resetPage: true }
): string {
  const url = new URL(currentUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === '') {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }

  // Reset to page 1 when filters change (not when page itself changes)
  if (options.resetPage && !('page' in params)) {
    url.searchParams.delete('page');
  }

  return url.pathname + url.search;
}
```

This helper encapsulates three subtle behaviors:

1. **Null removes the parameter** -- setting category to `null` deletes `?category=electronics` from the URL.
2. **Page resets automatically** -- changing the category filter resets to page 1 so the user does not land on an empty page.
3. **Returns pathname + search** -- the return value works with both `goto()` and `<a href>`.

## Category Filter Component

The category filter renders a list of category buttons with product counts. Clicking a category updates the URL and triggers a new server load.

```svelte
<!-- src/lib/components/product/CategoryFilter.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateSearchParams } from '$lib/utils/filter-url';

  type Category = {
    id: number;
    name: string;
    slug: string;
    productCount: number;
  };

  let { categories, activeCategory }: {
    categories: Category[];
    activeCategory: string | null;
  } = $props();

  function selectCategory(slug: string | null) {
    const url = updateSearchParams($page.url, { category: slug });
    goto(url, { replaceState: true, noScroll: true });
  }
</script>

<div>
  <h3 class="font-semibold text-sm uppercase tracking-wide text-gray-900 mb-3">
    Categories
  </h3>

  <div class="space-y-1">
    <button
      onclick={() => selectCategory(null)}
      class="flex items-center justify-between w-full text-left px-3 py-2
             rounded-lg text-sm transition-colors
             {!activeCategory
               ? 'bg-gray-900 text-white font-medium'
               : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
    >
      <span>All Products</span>
    </button>

    {#each categories as cat (cat.id)}
      <button
        onclick={() => selectCategory(cat.slug)}
        class="flex items-center justify-between w-full text-left px-3 py-2
               rounded-lg text-sm transition-colors
               {activeCategory === cat.slug
                 ? 'bg-gray-900 text-white font-medium'
                 : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}"
      >
        <span>{cat.name}</span>
        <span class="text-xs {activeCategory === cat.slug
          ? 'text-gray-300'
          : 'text-gray-400'}">
          {cat.productCount}
        </span>
      </button>
    {/each}
  </div>
</div>
```

**`replaceState: true`** prevents each filter change from creating a new browser history entry. Without this, the user would need to press back 15 times to get to the previous page after trying 15 different filters.

**`noScroll: true`** keeps the scroll position when filters change. Without this, every filter click scrolls to the top, which is disorienting when the filter sidebar is below the fold on mobile.

## Sort Dropdown

```svelte
<!-- src/lib/components/product/SortSelect.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateSearchParams } from '$lib/utils/filter-url';

  let { currentSort }: { currentSort: string } = $props();

  const sortOptions = [
    { value: 'newest', label: 'Newest' },
    { value: 'oldest', label: 'Oldest' },
    { value: 'price-asc', label: 'Price: Low to High' },
    { value: 'price-desc', label: 'Price: High to Low' },
    { value: 'name-asc', label: 'Name: A-Z' },
    { value: 'name-desc', label: 'Name: Z-A' }
  ];

  function handleSort(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const url = updateSearchParams($page.url, { sort: value });
    goto(url, { replaceState: true, noScroll: true });
  }
</script>

<div class="flex items-center gap-2">
  <label for="sort-select" class="text-sm text-gray-500 whitespace-nowrap">
    Sort by
  </label>
  <select
    id="sort-select"
    onchange={handleSort}
    value={currentSort}
    class="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
           focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
  >
    {#each sortOptions as option}
      <option value={option.value}>{option.label}</option>
    {/each}
  </select>
</div>
```

## Price Range Filter

A price range filter with two inputs for minimum and maximum price. It debounces the inputs to avoid firing a server request on every keystroke.

```svelte
<!-- src/lib/components/product/PriceFilter.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateSearchParams } from '$lib/utils/filter-url';

  let { priceRange, currentMin, currentMax }: {
    priceRange: { min: number; max: number };
    currentMin: number | null;
    currentMax: number | null;
  } = $props();

  let minInput = $state(currentMin?.toString() ?? '');
  let maxInput = $state(currentMax?.toString() ?? '');
  let debounceTimer: ReturnType<typeof setTimeout>;

  function applyPriceFilter() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const min = minInput ? Number(minInput) : null;
      const max = maxInput ? Number(maxInput) : null;

      // Validate: min must be less than max
      if (min !== null && max !== null && min > max) return;

      const url = updateSearchParams($page.url, { min, max });
      goto(url, { replaceState: true, noScroll: true });
    }, 500);
  }

  function clearPriceFilter() {
    minInput = '';
    maxInput = '';
    const url = updateSearchParams($page.url, { min: null, max: null });
    goto(url, { replaceState: true, noScroll: true });
  }
</script>

<div>
  <div class="flex items-center justify-between mb-3">
    <h3 class="font-semibold text-sm uppercase tracking-wide text-gray-900">
      Price Range
    </h3>
    {#if currentMin !== null || currentMax !== null}
      <button
        onclick={clearPriceFilter}
        class="text-xs text-gray-500 hover:text-gray-900 underline"
      >
        Clear
      </button>
    {/if}
  </div>

  <div class="flex items-center gap-2">
    <div class="relative flex-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      <input
        type="number"
        placeholder={String(priceRange.min)}
        bind:value={minInput}
        oninput={applyPriceFilter}
        min="0"
        class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm
               focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
        aria-label="Minimum price"
      />
    </div>
    <span class="text-gray-400">--</span>
    <div class="relative flex-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      <input
        type="number"
        placeholder={String(priceRange.max)}
        bind:value={maxInput}
        oninput={applyPriceFilter}
        min="0"
        class="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg text-sm
               focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
        aria-label="Maximum price"
      />
    </div>
  </div>

  <p class="mt-2 text-xs text-gray-400">
    Products range from ${priceRange.min} to ${priceRange.max}
  </p>
</div>
```

The 500ms debounce is critical. Without it, typing "150" in the max price field fires three server requests: one for "1", one for "15", and one for "150". The debounce waits for the user to stop typing before firing the request.

## Search Input with Debounce

The search bar demonstrates the same debounce pattern but with an important twist: it can also submit on Enter for users who prefer explicit submission.

```svelte
<!-- src/lib/components/product/SearchInput.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateSearchParams } from '$lib/utils/filter-url';

  let { currentSearch }: { currentSearch: string | null } = $props();

  let query = $state(currentSearch ?? '');
  let debounceTimer: ReturnType<typeof setTimeout>;

  function handleInput() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      applySearch();
    }, 300);
  }

  function applySearch() {
    clearTimeout(debounceTimer);
    const url = updateSearchParams($page.url, {
      q: query.trim() || null
    });
    goto(url, { replaceState: true, noScroll: true });
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    clearTimeout(debounceTimer);
    applySearch();
  }

  function clearSearch() {
    query = '';
    applySearch();
  }
</script>

<form onsubmit={handleSubmit} class="relative">
  <div class="relative">
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
         fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
    <input
      type="search"
      placeholder="Search products..."
      bind:value={query}
      oninput={handleInput}
      class="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm
             focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent"
      aria-label="Search products"
    />
    {#if query}
      <button
        type="button"
        onclick={clearSearch}
        class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400
               hover:text-gray-600 transition-colors"
        aria-label="Clear search"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/if}
  </div>
</form>
```

The 300ms debounce for search is shorter than the 500ms for price because users expect search to feel more responsive. But it is long enough to avoid hammering the server with partial queries.

The `type="search"` attribute gives the input browser-native clear button behavior on some platforms and communicates semantics to assistive technology.

## Assembling the Complete Filter Page

Now compose all the filter components together on the products page:

```svelte
<!-- src/routes/(store)/products/+page.svelte -->
<script lang="ts">
  import { formatPrice } from '$lib/utils/format';
  import ProductCard from '$lib/components/product/ProductCard.svelte';
  import CategoryFilter from '$lib/components/product/CategoryFilter.svelte';
  import SortSelect from '$lib/components/product/SortSelect.svelte';
  import PriceFilter from '$lib/components/product/PriceFilter.svelte';
  import SearchInput from '$lib/components/product/SearchInput.svelte';
  import Pagination from '$lib/components/product/Pagination.svelte';
  import ActiveFilters from '$lib/components/product/ActiveFilters.svelte';

  let { data } = $props();

  let showMobileFilters = $state(false);
</script>

<svelte:head>
  <title>
    {data.filters.search
      ? `Search: ${data.filters.search} | Acme Store`
      : data.filters.category
        ? `${data.categories.find(c => c.slug === data.filters.category)?.name || 'Products'} | Acme Store`
        : 'Products | Acme Store'}
  </title>
</svelte:head>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Header -->
  <div class="flex flex-col gap-4 mb-6">
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">
          {#if data.filters.search}
            Search: "{data.filters.search}"
          {:else if data.filters.category}
            {data.categories.find(c => c.slug === data.filters.category)?.name || 'Products'}
          {:else}
            All Products
          {/if}
        </h1>
        <p class="mt-1 text-sm text-gray-500">
          {data.totalCount} {data.totalCount === 1 ? 'product' : 'products'} found
        </p>
      </div>

      <div class="flex items-center gap-3">
        <SortSelect currentSort={data.filters.sort} />

        <!-- Mobile filter toggle -->
        <button
          onclick={() => showMobileFilters = !showMobileFilters}
          class="lg:hidden flex items-center gap-2 px-4 py-2 border
                 border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filters
        </button>
      </div>
    </div>

    <SearchInput currentSearch={data.filters.search} />
    <ActiveFilters filters={data.filters} categories={data.categories} />
  </div>

  <div class="flex gap-8">
    <!-- Sidebar Filters -->
    <aside class="w-64 flex-shrink-0 space-y-6
                  {showMobileFilters ? 'block' : 'hidden'} lg:block">
      <CategoryFilter
        categories={data.categories}
        activeCategory={data.filters.category}
      />
      <PriceFilter
        priceRange={data.priceRange}
        currentMin={data.filters.minPrice}
        currentMax={data.filters.maxPrice}
      />
    </aside>

    <!-- Product Grid -->
    <div class="flex-1">
      {#if data.products.length === 0}
        <div class="text-center py-16">
          <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor"
               viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <h2 class="mt-4 text-lg font-medium text-gray-900">No products found</h2>
          <p class="mt-2 text-gray-500">
            {#if data.filters.search}
              No results for "{data.filters.search}". Try a different search term.
            {:else}
              Try adjusting your filters to find what you are looking for.
            {/if}
          </p>
          <a href="/products"
             class="mt-4 inline-block text-sm text-blue-600 hover:text-blue-800 underline">
            Clear all filters
          </a>
        </div>
      {:else}
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
          {#each data.products as product (product.id)}
            <ProductCard {product} />
          {/each}
        </div>

        <Pagination
          currentPage={data.currentPage}
          totalPages={data.totalPages}
        />
      {/if}
    </div>
  </div>
</div>
```

## Active Filters Display

Show the currently active filters as dismissible chips. This gives users a clear visual summary of what is filtering their results and a quick way to remove individual filters.

```svelte
<!-- src/lib/components/product/ActiveFilters.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { updateSearchParams } from '$lib/utils/filter-url';

  type Filters = {
    category: string | null;
    sort: string;
    search: string | null;
    minPrice: number | null;
    maxPrice: number | null;
  };

  type Category = {
    name: string;
    slug: string;
  };

  let { filters, categories }: {
    filters: Filters;
    categories: Category[];
  } = $props();

  // Build list of active filter chips
  const activeFilters = $derived(() => {
    const chips: { label: string; param: string }[] = [];

    if (filters.category) {
      const cat = categories.find(c => c.slug === filters.category);
      chips.push({
        label: `Category: ${cat?.name || filters.category}`,
        param: 'category'
      });
    }

    if (filters.search) {
      chips.push({ label: `Search: "${filters.search}"`, param: 'q' });
    }

    if (filters.minPrice !== null) {
      chips.push({ label: `Min: $${filters.minPrice}`, param: 'min' });
    }

    if (filters.maxPrice !== null) {
      chips.push({ label: `Max: $${filters.maxPrice}`, param: 'max' });
    }

    return chips;
  });

  function removeFilter(param: string) {
    const url = updateSearchParams($page.url, { [param]: null });
    goto(url, { replaceState: true, noScroll: true });
  }

  function clearAll() {
    goto('/products', { replaceState: true });
  }
</script>

{#if activeFilters().length > 0}
  <div class="flex flex-wrap items-center gap-2">
    {#each activeFilters() as filter}
      <button
        onclick={() => removeFilter(filter.param)}
        class="inline-flex items-center gap-1 px-3 py-1 bg-gray-100
               rounded-full text-sm text-gray-700 hover:bg-gray-200 transition-colors"
      >
        {filter.label}
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    {/each}

    <button
      onclick={clearAll}
      class="text-sm text-gray-500 hover:text-gray-900 underline ml-2"
    >
      Clear all
    </button>
  </div>
{/if}
```

## Pagination: Offset vs Cursor

There are two fundamental approaches to pagination. Choose the right one for your use case.

### Offset Pagination

Offset pagination uses `LIMIT` and `OFFSET` in SQL. It is simple, supports jumping to any page, and works well for up to about 100,000 rows.

```sql
-- Page 1: skip 0, take 12
SELECT * FROM products LIMIT 12 OFFSET 0;

-- Page 2: skip 12, take 12
SELECT * FROM products LIMIT 12 OFFSET 12;

-- Page 100: skip 1188, take 12
SELECT * FROM products LIMIT 12 OFFSET 1188;
```

The problem: at large offsets, the database must scan and discard all the skipped rows. `OFFSET 1000000` makes the database read a million rows and throw them away. For a product catalog with a few thousand items, this is fine. For a table with millions of rows (like order history), it becomes a performance problem.

### Cursor Pagination

Cursor pagination uses a WHERE clause with the last seen value instead of an offset:

```sql
-- First page
SELECT * FROM products ORDER BY created_at DESC LIMIT 12;

-- Next page (where last item had created_at = '2025-01-15T10:30:00')
SELECT * FROM products
WHERE created_at < '2025-01-15T10:30:00'
ORDER BY created_at DESC
LIMIT 12;
```

Cursor pagination is always fast regardless of how deep you paginate because the database uses an index to jump directly to the cursor position. The tradeoff: you cannot jump to page 50 directly. You can only go forward and backward, which makes it better for infinite scroll than traditional page numbers.

**For this e-commerce catalog, we use offset pagination** because the product count is manageable and customers expect numbered pages.

### Pagination Component

```svelte
<!-- src/lib/components/product/Pagination.svelte -->
<script lang="ts">
  import { page as pageStore } from '$app/stores';
  import { updateSearchParams } from '$lib/utils/filter-url';

  let { currentPage, totalPages }: {
    currentPage: number;
    totalPages: number;
  } = $props();

  // Generate page numbers with ellipsis for large page counts
  const visiblePages = $derived(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | '...')[] = [];

    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    // Show pages around current
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('...');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }

    return pages;
  });

  function pageUrl(pageNum: number): string {
    return updateSearchParams(
      $pageStore.url,
      { page: pageNum > 1 ? pageNum : null },
      { resetPage: false }
    );
  }
</script>

{#if totalPages > 1}
  <nav class="flex justify-center items-center gap-1 mt-10" aria-label="Pagination">
    <!-- Previous -->
    {#if currentPage > 1}
      <a href={pageUrl(currentPage - 1)}
         class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100
                transition-colors"
         aria-label="Previous page">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M15 19l-7-7 7-7" />
        </svg>
      </a>
    {/if}

    <!-- Page numbers -->
    {#each visiblePages() as pageNum}
      {#if pageNum === '...'}
        <span class="px-3 py-2 text-sm text-gray-400">...</span>
      {:else}
        <a href={pageUrl(pageNum)}
           class="px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  {pageNum === currentPage
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'}"
           aria-label="Page {pageNum}"
           aria-current={pageNum === currentPage ? 'page' : undefined}>
          {pageNum}
        </a>
      {/if}
    {/each}

    <!-- Next -->
    {#if currentPage < totalPages}
      <a href={pageUrl(currentPage + 1)}
         class="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100
                transition-colors"
         aria-label="Next page">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 5l7 7-7 7" />
        </svg>
      </a>
    {/if}
  </nav>
{/if}
```

The pagination component uses `<a>` tags, not buttons. This is intentional: pagination links should be crawlable by search engines, and they should work without JavaScript (progressive enhancement). Each page is a real URL that can be bookmarked and shared.

The ellipsis logic prevents rendering 100 page buttons when there are many pages. It shows: first page, ellipsis, pages around current, ellipsis, last page. This pattern is standard across the web.

## Search Highlighting

When users search, highlighting the matching text in results helps them quickly confirm they found what they were looking for.

```svelte
<!-- src/lib/components/ui/Highlight.svelte -->
<script lang="ts">
  let { text, query }: { text: string; query: string | null } = $props();

  // Split text into segments: matching and non-matching
  const segments = $derived(() => {
    if (!query || !text) return [{ text, match: false }];

    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    const parts = text.split(regex);

    return parts
      .filter(Boolean)
      .map(part => ({
        text: part,
        match: part.toLowerCase() === query.toLowerCase()
      }));
  });

  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
</script>

{#each segments() as segment}
  {#if segment.match}
    <mark class="bg-yellow-200 text-gray-900 rounded px-0.5">{segment.text}</mark>
  {:else}
    {segment.text}
  {/if}
{/each}
```

Use it in the ProductCard:

```svelte
<!-- In ProductCard.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import Highlight from '$lib/components/ui/Highlight.svelte';

  // ... other props

  const searchQuery = $derived($page.url.searchParams.get('q'));
</script>

<h3 class="font-semibold mt-1 text-gray-900 line-clamp-2">
  <Highlight text={product.name} query={searchQuery} />
</h3>
```

The `escapeRegex` function is crucial. Without it, a search query like "USB-C (hub)" would break the regex because parentheses are special characters. Always escape user input before using it in regex.

## Full-Text Search with PostgreSQL

The `ILIKE` search works for small catalogs but does not scale. For production search, use PostgreSQL's built-in full-text search, which handles stemming (finding "running" when searching "run"), ranking, and relevance scoring.

```typescript
// Enhanced search with PostgreSQL full-text search
import { sql } from 'drizzle-orm';

// Add a tsvector column to your products table for indexing
// (do this in a migration, not in the schema file)
// ALTER TABLE products ADD COLUMN search_vector tsvector
//   GENERATED ALWAYS AS (
//     setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
//     setweight(to_tsvector('english', coalesce(description, '')), 'B')
//   ) STORED;
// CREATE INDEX product_search_idx ON products USING gin(search_vector);

// In your load function, replace the ILIKE query:
if (search) {
  const tsQuery = search
    .split(/\s+/)
    .filter(Boolean)
    .map(word => `${word}:*`)  // prefix matching: "wire" matches "wireless"
    .join(' & ');

  conditions.push(
    sql`${products}.search_vector @@ to_tsquery('english', ${tsQuery})`
  );

  // Add relevance ranking to the ORDER BY
  // ts_rank returns a float indicating match quality
  const rankExpr = sql`ts_rank(${products}.search_vector, to_tsquery('english', ${tsQuery}))`;

  // Override sort for search results -- relevance first
  if (sort === 'newest') {
    orderBy = desc(rankExpr);
  }
}
```

The key insight: product names are weighted as `'A'` (most important) and descriptions as `'B'`. When a search term appears in the name, that product ranks higher than one where the term only appears in the description. This produces much better search results than naive string matching.

## Implementing Faceted Search

Faceted search shows how many products match each filter option, updating counts as filters are applied. Amazon's sidebar ("Laptops (42)", "Tablets (18)") is the canonical example.

```typescript
// Fetch faceted counts alongside the main query
async function getFacetedCounts(whereClause: SQL) {
  const [categoryCounts, priceRanges] = await Promise.all([
    // Category facets with counts
    db
      .select({
        slug: categories.slug,
        name: categories.name,
        count: sql<number>`cast(count(*) as int)`
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(whereClause)
      .groupBy(categories.slug, categories.name),

    // Price range facets
    db
      .select({
        range: sql<string>`
          CASE
            WHEN ${products.price} < 2500 THEN 'under-25'
            WHEN ${products.price} < 5000 THEN '25-50'
            WHEN ${products.price} < 10000 THEN '50-100'
            ELSE 'over-100'
          END
        `,
        count: sql<number>`cast(count(*) as int)`
      })
      .from(products)
      .where(whereClause)
      .groupBy(sql`1`)
  ]);

  return { categoryCounts, priceRanges };
}
```

The subtlety of faceted search: the counts for each facet are calculated *without* that facet's own filter applied. If the user filters by "Electronics," the category counts should show how many products are in each category *without* the Electronics filter (otherwise every category except Electronics shows 0). But the price range counts should reflect the Electronics filter. This requires running separate count queries per facet dimension, which is expensive. For small catalogs, this is fine. For large catalogs, consider caching facet counts.

## Empty State Handling

Different filter combinations produce different empty states. The message should explain *why* there are no results and *what the user can do about it*.

```svelte
<!-- src/lib/components/product/EmptyResults.svelte -->
<script lang="ts">
  type Filters = {
    category: string | null;
    sort: string;
    search: string | null;
    minPrice: number | null;
    maxPrice: number | null;
  };

  let { filters }: { filters: Filters } = $props();

  const hasFilters = filters.category || filters.search
    || filters.minPrice !== null || filters.maxPrice !== null;
</script>

<div class="text-center py-16 px-4">
  <svg class="mx-auto h-16 w-16 text-gray-300" fill="none" stroke="currentColor"
       viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>

  {#if filters.search}
    <h2 class="mt-4 text-lg font-semibold text-gray-900">
      No results for "{filters.search}"
    </h2>
    <p class="mt-2 text-gray-500 max-w-md mx-auto">
      We could not find any products matching your search.
      Try checking for typos or using more general terms.
    </p>
  {:else if hasFilters}
    <h2 class="mt-4 text-lg font-semibold text-gray-900">
      No products match your filters
    </h2>
    <p class="mt-2 text-gray-500 max-w-md mx-auto">
      Try broadening your filters or removing some to see more results.
    </p>
  {:else}
    <h2 class="mt-4 text-lg font-semibold text-gray-900">
      No products available
    </h2>
    <p class="mt-2 text-gray-500 max-w-md mx-auto">
      Check back soon -- new products are being added regularly.
    </p>
  {/if}

  {#if hasFilters}
    <a href="/products"
       class="mt-6 inline-block bg-gray-900 text-white px-6 py-2.5 rounded-lg
              text-sm font-medium hover:bg-gray-800 transition-colors">
      Clear all filters
    </a>
  {/if}
</div>
```

## Try It

1. Add a "tag filter" component that renders tags as toggleable pills. Clicking a tag adds `?tag=sale` to the URL. Multiple tags can be active at once (comma-separated: `?tag=sale,new-arrival`). Update the load function to filter by tags using an EXISTS subquery against the `product_tags` junction table.

2. Implement a "saved search" feature. Add a bookmark icon next to the search bar. When clicked, it saves the current URL (with all filters) to `localStorage`. Display saved searches as a dropdown below the search bar. Each saved search shows the search term and active filters as chips.

3. Build a "recently searched" component that automatically stores the last 5 search queries in `localStorage`. Display them as suggestions below the search bar when the user clicks into the search field. Clear individual items or all items.

4. Add keyboard navigation to the filter sidebar. Pressing `f` should focus the search input. Pressing `Escape` should clear all filters. Use `svelte:window` to capture these keystrokes without conflicting with text input.

## Key Takeaways

- Store all filter state in URL search parameters so filtered views are bookmarkable, shareable, and back-button friendly
- Use `goto()` with `replaceState: true` and `noScroll: true` to update filters without flooding browser history or losing scroll position
- Build filter conditions dynamically with Drizzle's `and()` and a conditions array pattern that composes cleanly
- Always reset pagination to page 1 when filters change, otherwise users land on empty pages
- Use `Promise.all` to run independent database queries in parallel rather than sequentially
- Debounce text inputs (300-500ms) to prevent firing a server request on every keystroke
- Whitelist valid sort values in a lookup object rather than interpolating user input into SQL
- Server-side filtering scales better than client-side filtering because only the matching data traverses the network
- Use offset pagination for catalogs (simple, supports page jumping) and cursor pagination for feeds (fast at any depth, infinite scroll)
- Implement search highlighting to help users confirm their search matched the right products
- Show contextual empty states that explain why there are no results and offer clear actions to broaden the search
