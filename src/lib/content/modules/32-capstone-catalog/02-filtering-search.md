# Filtering & Search

A product listing without filtering is just a wall of items. Customers need to narrow down results by category, sort by price, and paginate through large catalogs. In this lesson you will build server-side filtering using URL search parameters, keeping everything bookmarkable and shareable.

The key principle is this: filters belong in the URL, not in component state. When a customer filters by "Electronics" and sorts by "Price: Low to High," that exact view should be reproducible by copying the URL.

## Server-Side Filtering with URL Params

Update your product listing load function to read filters from the URL:

```typescript
// src/routes/(store)/products/+page.server.ts
import { db } from '$lib/server/db';
import { products, categories } from '$lib/server/schema';
import { eq, ilike, asc, desc, and, sql } from 'drizzle-orm';

export async function load({ url }) {
  const category = url.searchParams.get('category');
  const sort = url.searchParams.get('sort') || 'newest';
  const search = url.searchParams.get('q');
  const page = Number(url.searchParams.get('page')) || 1;
  const perPage = 12;

  // Build conditions array
  const conditions = [eq(products.inStock, true)];

  if (category) {
    conditions.push(eq(categories.slug, category));
  }

  if (search) {
    conditions.push(ilike(products.name, `%${search}%`));
  }

  // Determine sort order
  const orderBy = {
    newest: desc(products.createdAt),
    'price-asc': asc(products.price),
    'price-desc': desc(products.price),
    name: asc(products.name)
  }[sort] || desc(products.createdAt);

  // Fetch products with filters
  const filtered = await db
    .select()
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  // Get total count for pagination
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(products)
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(...conditions));

  const allCategories = await db.select().from(categories);

  return {
    products: filtered,
    categories: allCategories,
    totalPages: Math.ceil(count / perPage),
    currentPage: page,
    filters: { category, sort, search }
  };
}
```

## Category Filter Component

Build a filter sidebar that updates URL parameters:

```svelte
<!-- src/lib/components/product/CategoryFilter.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let { categories, activeCategory } = $props();

  function selectCategory(slug: string | null) {
    const url = new URL($page.url);
    if (slug) {
      url.searchParams.set('category', slug);
    } else {
      url.searchParams.delete('category');
    }
    url.searchParams.delete('page'); // Reset to page 1
    goto(url.toString(), { replaceState: true });
  }
</script>

<div class="space-y-2">
  <h3 class="font-semibold text-sm uppercase tracking-wide">Categories</h3>

  <button onclick={() => selectCategory(null)}
          class="block w-full text-left px-3 py-2 rounded"
          class:bg-gray-100={!activeCategory}>
    All Products
  </button>

  {#each categories as cat}
    <button onclick={() => selectCategory(cat.slug)}
            class="block w-full text-left px-3 py-2 rounded"
            class:bg-gray-100={activeCategory === cat.slug}>
      {cat.name}
    </button>
  {/each}
</div>
```

## Sort Dropdown

Add a sort control that also updates the URL:

```svelte
<!-- src/lib/components/product/SortSelect.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  let { currentSort } = $props();

  function handleSort(event: Event) {
    const value = (event.target as HTMLSelectElement).value;
    const url = new URL($page.url);
    url.searchParams.set('sort', value);
    goto(url.toString(), { replaceState: true });
  }
</script>

<select onchange={handleSort} value={currentSort}
        class="border rounded-lg px-3 py-2">
  <option value="newest">Newest</option>
  <option value="price-asc">Price: Low to High</option>
  <option value="price-desc">Price: High to Low</option>
  <option value="name">Name: A-Z</option>
</select>
```

## Pagination

Render page links based on the total count:

```svelte
<!-- src/lib/components/product/Pagination.svelte -->
<script lang="ts">
  import { page as pageStore } from '$app/stores';

  let { currentPage, totalPages } = $props();

  function pageUrl(pageNum: number): string {
    const url = new URL($pageStore.url);
    url.searchParams.set('page', String(pageNum));
    return url.toString();
  }
</script>

{#if totalPages > 1}
  <nav class="flex justify-center gap-2 mt-8">
    {#each Array.from({ length: totalPages }, (_, i) => i + 1) as num}
      <a href={pageUrl(num)}
         class="px-4 py-2 rounded border"
         class:bg-black={num === currentPage}
         class:text-white={num === currentPage}>
        {num}
      </a>
    {/each}
  </nav>
{/if}
```

## Try It

Add a search bar component that reads its initial value from the `q` URL parameter and updates the URL when the user submits the form. Use a `<form>` with a GET method so the browser handles the navigation naturally. Make sure the search preserves the current category filter.

## Key Takeaways

- Store filter state in URL search parameters so filtered views are bookmarkable and shareable
- Use `goto()` with `replaceState: true` to update the URL without adding a history entry for every filter change
- Build filter conditions dynamically with Drizzle's `and()` to compose multiple where clauses
- Always reset pagination to page 1 when filters change, or users land on empty pages
- Server-side filtering scales better than client-side filtering because you only transfer the data the user needs
