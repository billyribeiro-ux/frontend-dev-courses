# Advanced Derived State

You have already used `$derived()` to compute values from reactive state -- totals, filtered lists, formatted strings. But the simple `$derived(expression)` form is just the beginning. For complex, multi-step computations you need `$derived.by()`. And to write truly efficient applications, you need to understand how Svelte's push-pull reactivity model makes derived values lazy and performant by default.

This lesson covers the full power of derived state: how the dependency graph works, why derived values are lazy, how to chain derived values together, the diamond dependency problem, reference vs value equality for objects and arrays, performance patterns for expensive computations, and the critical distinction between `$derived` and `$effect` -- two tools that beginners confuse constantly and that experienced developers still get wrong.

## Quick Review: $derived()

As a refresher, `$derived()` takes a single expression and recalculates it whenever its reactive dependencies change:

```svelte
<script>
  let price = $state(100);
  let quantity = $state(2);
  let total = $derived(price * quantity);
</script>

<p>Total: ${total}</p>
```

This works well for one-liners. But what about computations that need variables, conditionals, or loops?

## $derived.by() for Complex Computations

When your derived value requires multiple steps, use `$derived.by()` with a callback function. The function body can contain any logic -- variables, if/else, loops, early returns -- and the return value becomes the derived state:

```svelte
<script>
  let cartItems = $state([
    { name: "Shirt", price: 29.99, quantity: 2 },
    { name: "Pants", price: 49.99, quantity: 1 },
    { name: "Shoes", price: 89.99, quantity: 1 }
  ]);

  let couponCode = $state("");
  let membershipTier = $state("gold");

  let orderSummary = $derived.by(() => {
    const subtotal = cartItems.reduce(
      (sum, item) => sum + item.price * item.quantity, 0
    );

    // Apply membership discount
    let discount = 0;
    if (membershipTier === "gold") {
      discount = subtotal * 0.10;
    } else if (membershipTier === "silver") {
      discount = subtotal * 0.05;
    }

    // Apply coupon
    if (couponCode === "SAVE20") {
      discount += subtotal * 0.20;
    }

    // Cap discount at subtotal
    discount = Math.min(discount, subtotal);

    const afterDiscount = subtotal - discount;
    const tax = afterDiscount * 0.08;
    const shipping = afterDiscount > 100 ? 0 : 9.99;
    const total = afterDiscount + tax + shipping;

    return {
      subtotal,
      discount,
      tax,
      shipping,
      total,
      itemCount: cartItems.reduce((sum, item) => sum + item.quantity, 0)
    };
  });
</script>

<div class="summary">
  <p>Items: {orderSummary.itemCount}</p>
  <p>Subtotal: ${orderSummary.subtotal.toFixed(2)}</p>
  <p>Discount: -${orderSummary.discount.toFixed(2)}</p>
  <p>Tax: ${orderSummary.tax.toFixed(2)}</p>
  <p>Shipping: {orderSummary.shipping === 0 ? "Free" : `$${orderSummary.shipping}`}</p>
  <p><strong>Total: ${orderSummary.total.toFixed(2)}</strong></p>
</div>
```

Use `$derived()` for simple expressions and `$derived.by()` when you need multiple lines of logic. Both are equally reactive -- the choice is purely about readability. A good rule of thumb: if you need a semicolon, use `$derived.by()`.

### When to Extract to $derived.by() vs Keep Inline

```svelte
<script>
  let items = $state([1, 2, 3, 4, 5]);

  // GOOD — simple enough for inline $derived
  let count = $derived(items.length);
  let sum = $derived(items.reduce((a, b) => a + b, 0));
  let average = $derived(sum / count);

  // GOOD — too complex for inline, use $derived.by()
  let statistics = $derived.by(() => {
    if (items.length === 0) return { mean: 0, median: 0, stdDev: 0 };

    const sorted = [...items].sort((a, b) => a - b);
    const mean = items.reduce((a, b) => a + b, 0) / items.length;

    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;

    const variance = items.reduce((sum, val) => sum + (val - mean) ** 2, 0) / items.length;
    const stdDev = Math.sqrt(variance);

    return { mean, median, stdDev };
  });
</script>
```

## How Push-Pull Reactivity Works

Svelte 5 uses a **push-pull** reactivity model, and understanding it helps explain why derived values are so efficient. This is the runtime engine that makes everything work.

### The Push Phase

When a `$state()` value changes (e.g., `count++`), Svelte immediately **pushes** notifications to every signal that depends on it. This notification is cheap -- it just sets a "dirty" flag on each dependent. It does not recompute anything.

```
count changes → mark `doubled` as dirty → mark `quadrupled` as dirty
```

The push is O(number of direct dependents) and involves no computation, just flag-setting.

### The Pull Phase

A derived value is only actually recalculated when something **reads** it -- the template during rendering, another derived value, or an effect. If nobody reads the value, it is never recomputed. This makes derived values **lazy**.

```svelte
<script>
  let count = $state(0);

  // This derived value is NOT recomputed on every count change.
  // It is only recalculated when the template reads it during rendering.
  let expensive = $derived.by(() => {
    let result = 0;
    for (let i = 0; i < count; i++) {
      result += Math.sqrt(i);
    }
    return result;
  });
</script>

<button onclick={() => count++}>Increment ({count})</button>

<!-- If this block is hidden, `expensive` is never recalculated -->
{#if count > 5}
  <p>Expensive result: {expensive.toFixed(2)}</p>
{/if}
```

When `count` goes from 0 to 5, `expensive` is flagged as dirty each time but never recalculated because no one reads it. The `{#if count > 5}` block is closed, so the template does not access `expensive`. Once `count` exceeds 5, the template reads `expensive`, triggering the pull -- the actual computation runs.

This laziness is automatic -- you get it for free. It means you can declare arbitrarily complex derived values and pay zero cost if they are not currently visible.

### Why This Matters in Practice

Consider a tab interface with expensive computations on each tab:

```svelte
<script>
  let activeTab = $state('overview');
  let transactions = $state([/* thousands of items */]);

  // These are all declared, but only the active one computes
  let overview = $derived.by(() => {
    return computeOverview(transactions);  // Only runs when activeTab === 'overview'
  });

  let analytics = $derived.by(() => {
    return computeAnalytics(transactions);  // Only runs when activeTab === 'analytics'
  });

  let report = $derived.by(() => {
    return generateReport(transactions);  // Only runs when activeTab === 'report'
  });
</script>

{#if activeTab === 'overview'}
  <OverviewPanel data={overview} />
{:else if activeTab === 'analytics'}
  <AnalyticsPanel data={analytics} />
{:else if activeTab === 'report'}
  <ReportPanel data={report} />
{/if}
```

When the user is on the "overview" tab, `analytics` and `report` are marked dirty when `transactions` changes, but they are never pulled because their components are not rendered. When the user switches to "analytics", only then does `analytics` actually compute. This is zero-cost abstraction in practice.

### Memoization: Avoiding Redundant Recomputation

Derived values are memoized. If a derived value is pulled and its dependencies have not changed since the last computation, Svelte returns the cached result without re-running the function. This is the "pull" part -- on pull, Svelte first checks whether the dependencies are actually dirty, and if not, returns the cached value.

```svelte
<script>
  let a = $state(1);
  let b = $state(2);
  let sum = $derived(a + b);

  // If a component reads `sum` multiple times in the same render,
  // the computation runs only once. The second read returns the cached result.
</script>

<p>Sum is {sum}</p>           <!-- Computation runs here -->
<p>Sum is still {sum}</p>     <!-- Cached result returned -->
<p>Double sum: {sum * 2}</p>  <!-- Cached result returned -->
```

## Derived Chains and the Diamond Dependency Problem

Derived values can depend on other derived values, forming chains. Svelte tracks the dependency graph and updates everything in the correct order:

```svelte
<script>
  let products = $state([
    { name: "Widget A", price: 25, category: "tools" },
    { name: "Widget B", price: 45, category: "tools" },
    { name: "Gadget X", price: 120, category: "electronics" },
    { name: "Gadget Y", price: 85, category: "electronics" },
    { name: "Gizmo Z", price: 15, category: "tools" }
  ]);

  let selectedCategory = $state("all");
  let sortField = $state("name");
  let currentPage = $state(1);
  const pageSize = 2;

  // Chain 1: Filter
  let filtered = $derived(
    selectedCategory === "all"
      ? products
      : products.filter(p => p.category === selectedCategory)
  );

  // Chain 2: Sort (depends on filtered)
  let sorted = $derived(
    [...filtered].sort((a, b) => {
      if (sortField === "price") return a.price - b.price;
      return a.name.localeCompare(b.name);
    })
  );

  // Chain 3: Paginate (depends on sorted)
  let paginated = $derived(
    sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  // Chain 4: Page count (depends on filtered)
  let totalPages = $derived(Math.ceil(filtered.length / pageSize));
</script>
```

When `selectedCategory` changes, the dependency graph propagates like this:

```
selectedCategory changes
  → filtered is dirty (depends on selectedCategory)
    → sorted is dirty (depends on filtered)
      → paginated is dirty (depends on sorted)
    → totalPages is dirty (depends on filtered)
```

During the pull phase (when the template renders), each value computes in topological order. `filtered` computes first, then `sorted` and `totalPages` (which both depend on `filtered`), then `paginated` (which depends on `sorted`).

### The Diamond Dependency Problem

What happens when a derived value depends on two other derived values that share a common ancestor?

```svelte
<script>
  let items = $state([10, 20, 30]);

  let sum = $derived(items.reduce((a, b) => a + b, 0));
  let count = $derived(items.length);
  let average = $derived(sum / count);  // Depends on BOTH sum and count
</script>
```

The dependency graph forms a diamond:

```
     items
     /   \
   sum   count
     \   /
    average
```

When `items` changes, both `sum` and `count` are marked dirty, and then `average` is marked dirty. The question is: does `average` compute twice (once when `sum` updates, once when `count` updates)?

**No.** Svelte handles this correctly. During the pull phase, `average` is pulled once. It reads `sum` (which triggers sum's recomputation), then reads `count` (which triggers count's recomputation), and then computes itself. There is no double computation. The push-pull model naturally solves the diamond problem because the pull phase resolves all dependencies in a single pass.

This is a significant advantage over "push-only" reactive systems (like early versions of MobX or Knockout), where diamond dependencies cause redundant recomputations unless you add explicit batching or scheduling.

## $derived with Arrays and Objects: Reference vs Value Equality

Understanding how Svelte determines whether a derived value has "changed" is critical for performance. For primitive values (numbers, strings, booleans), Svelte uses strict equality (`===`). For objects and arrays, Svelte checks reference equality -- not deep equality.

```svelte
<script>
  let items = $state([1, 2, 3, 4, 5]);
  let filter = $state(3);

  // This creates a NEW array every time filter or items changes
  let filtered = $derived(items.filter(i => i > filter));

  // This effect runs every time filtered changes
  $effect(() => {
    console.log('Filtered changed:', filtered);
  });
</script>

<button onclick={() => filter = 3}>Set filter to 3 (no change)</button>
```

Even if the *contents* of `filtered` are identical (same elements in the same order), the `filter()` method creates a new array reference every time. Svelte sees a new reference and considers the value "changed." The downstream effect runs even though the logical output is the same.

### When This Matters

For most applications, this does not matter. Array creation is cheap, and downstream effects or template updates are negligible for small-to-medium datasets. But for expensive downstream computations, you may want to avoid unnecessary propagation.

### Manual Memoization for Expensive Downstream Work

If you need deep equality checking, you can implement it manually:

```svelte
<script>
  let items = $state([/* large dataset */]);
  let searchTerm = $state('');

  // Basic filter — creates new array on every search change
  let filtered = $derived(
    items.filter(item => item.name.includes(searchTerm))
  );

  // Memoized version — only "changes" if the result is actually different
  let previousFiltered = $state([]);
  let stableFiltered = $derived.by(() => {
    const result = items.filter(item => item.name.includes(searchTerm));

    // Shallow comparison — are the same items in the same order?
    if (
      result.length === previousFiltered.length &&
      result.every((item, i) => item === previousFiltered[i])
    ) {
      return previousFiltered;  // Return same reference
    }

    previousFiltered = result;
    return result;
  });
</script>
```

**Important caveat:** Writing state from within `$derived` (like `previousFiltered = result` above) is an anti-pattern that Svelte warns about. In practice, for most applications, the default reference equality behavior is fine. Only reach for manual memoization if profiling shows that downstream recomputation is a measurable bottleneck.

A cleaner approach is to let the downstream consumer handle it:

```svelte
<script>
  let items = $state([/* large dataset */]);
  let searchTerm = $state('');

  // Let the filter create a new array — it's cheap
  let filtered = $derived(
    items.filter(item => item.name.includes(searchTerm))
  );

  // Expensive computation — only run when filtered.length changes
  let expensiveStats = $derived.by(() => {
    // This reads filtered.length (a primitive), not filtered (an array reference)
    // So it only recomputes when the count actually changes
    const count = filtered.length;
    return computeExpensiveStats(count);
  });
</script>
```

The insight: read the *minimal* set of properties you need. If your downstream computation only cares about the array length, read `.length` (a primitive) instead of the array itself. Svelte tracks the specific property read, and `.length` only changes when the actual count changes.

## Performance Patterns

### Avoiding Unnecessary Work in Derived Callbacks

The function inside `$derived.by()` should be a pure computation -- no side effects, no DOM manipulation, no network calls. Keep it fast, because it runs synchronously during the rendering phase.

```svelte
<script>
  let query = $state('');
  let allProducts = $state([/* 10,000 products */]);

  // WRONG — doing too much in one derived
  let displayData = $derived.by(() => {
    const filtered = allProducts.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    const paginated = sorted.slice(0, 50);
    const stats = {
      total: filtered.length,
      avgPrice: filtered.reduce((s, p) => s + p.price, 0) / filtered.length || 0,
      categories: [...new Set(filtered.map(p => p.category))]
    };
    return { items: paginated, stats };
  });

  // CORRECT — break into a chain so each step is independent and lazy
  let filtered = $derived(
    allProducts.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase())
    )
  );

  let sorted = $derived(
    [...filtered].sort((a, b) => a.name.localeCompare(b.name))
  );

  let paginated = $derived(sorted.slice(0, 50));

  let stats = $derived.by(() => ({
    total: filtered.length,
    avgPrice: filtered.reduce((s, p) => s + p.price, 0) / filtered.length || 0,
    categories: [...new Set(filtered.map(p => p.category))]
  }));
</script>
```

The chain version is better because:
1. **Laziness.** If the stats panel is hidden, `stats` never computes.
2. **Granularity.** Changing the sort order recomputes `sorted` and `paginated` but not `filtered` or `stats`.
3. **Readability.** Each step has a clear name and responsibility.

### Debouncing Derived Values

`$derived` recomputes synchronously on every state change. For search inputs that update on every keystroke, this can mean filtering a large dataset 20 times per second as the user types.

Svelte's `$derived` itself cannot be debounced (it is synchronous by design), but you can debounce the *input* that feeds into it:

```svelte
<script>
  let rawQuery = $state('');
  let debouncedQuery = $state('');
  let timeoutId: ReturnType<typeof setTimeout>;

  // Debounce the query — derived values downstream use debouncedQuery
  $effect(() => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      debouncedQuery = rawQuery;
    }, 300);

    return () => clearTimeout(timeoutId);
  });

  let products = $state([/* large list */]);

  // This only recomputes when debouncedQuery changes (300ms after typing stops)
  let filtered = $derived(
    products.filter(p => p.name.toLowerCase().includes(debouncedQuery.toLowerCase()))
  );
</script>

<input bind:value={rawQuery} placeholder="Search products..." />
<p>{filtered.length} results</p>
```

The `$effect` is the right tool here because debouncing is a *side effect* (it involves a timer). The `$derived` downstream benefits because it only recomputes when `debouncedQuery` changes, not on every keystroke.

## $derived vs $effect: The Critical Distinction

This is one of the most common points of confusion in Svelte 5. Both respond to reactive changes, but they serve fundamentally different purposes:

| | `$derived` | `$effect` |
|---|---|---|
| **Purpose** | Compute a value | Perform a side effect |
| **Returns** | A reactive value | Nothing (void) |
| **Evaluation** | Lazy (only when read) | Eager (runs after every change) |
| **SSR** | Works during server-side rendering | Skipped on the server |
| **Timing** | Synchronous, during render | After rendering (microtask) |
| **Examples** | Filtered lists, totals, formatted strings | DOM manipulation, logging, API calls, timers |

**Prefer `$derived` whenever possible.** If you can express something as a computation that returns a value, it should be `$derived`. Only use `$effect` when you need to *cause something to happen* -- write to the DOM, call an API, start a timer, or log output.

### The Anti-Pattern: Using $effect to Compute Values

```svelte
<script>
  let searchTerm = $state("");
  let items = $state(["apple", "banana", "cherry", "date"]);

  // WRONG: using $effect to compute a derived value
  let results = $state<string[]>([]);
  $effect(() => {
    results = items.filter(item => item.includes(searchTerm.toLowerCase()));
  });
</script>
```

This works but is wrong for five reasons:

1. **Eager evaluation.** The effect runs every time `searchTerm` or `items` changes, even if nobody reads `results`. With `$derived`, the computation is skipped if the result is not used.

2. **No SSR.** Effects do not run on the server. If `results` is used during SSR (in a server-rendered component), it will be the initial empty array, not the filtered list.

3. **Extra re-render.** The effect runs *after* rendering, then sets `results`, which triggers *another* re-render. With `$derived`, the value is available during the first render.

4. **Unnecessary intermediate state.** `results` starts as `[]` and then immediately changes to the filtered list. There is a frame where the empty state is visible. With `$derived`, the value is computed before the first render.

5. **Harder to trace.** With `$derived`, the dependency is declarative -- you can see that `results` depends on `items` and `searchTerm` just by reading the expression. With `$effect`, the dependency is implicit in the callback body.

```svelte
<script>
  let searchTerm = $state("");
  let items = $state(["apple", "banana", "cherry", "date"]);

  // CORRECT: filtering is a computation — use $derived
  let results = $derived(
    items.filter(item => item.includes(searchTerm.toLowerCase()))
  );
</script>
```

### When $effect IS the Right Tool

```svelte
<script>
  let searchTerm = $state("");
  let results = $derived(/* ... */);

  // CORRECT: logging is a side effect — use $effect
  $effect(() => {
    console.log(`Search: "${searchTerm}" → ${results.length} results`);
  });

  // CORRECT: API call is a side effect — use $effect
  $effect(() => {
    if (searchTerm.length >= 3) {
      fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`)
        .then(res => res.json())
        .then(data => {
          // Update state with server results
          serverResults = data;
        });
    }
  });

  // CORRECT: DOM manipulation is a side effect — use $effect
  let canvas: HTMLCanvasElement;
  $effect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw based on reactive state...
  });

  // CORRECT: timer is a side effect — use $effect
  let isRunning = $state(false);
  let elapsed = $state(0);
  $effect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => elapsed++, 1000);
    return () => clearInterval(interval);
  });
</script>
```

The mental model: **$derived is a question ("what is the filtered list?"), $effect is an action ("do something when this changes").**

### The Decision Flowchart

Ask yourself these questions in order:

1. **Does this produce a value that other code reads?** Use `$derived`.
2. **Does this need to happen during SSR?** Use `$derived` (effects skip SSR).
3. **Does this write to the DOM, make API calls, or start timers?** Use `$effect`.
4. **Does this need cleanup (intervals, event listeners, subscriptions)?** Use `$effect` (return a cleanup function).

If you are still unsure, try `$derived` first. If the compiler complains or you cannot express it as a pure computation, switch to `$effect`.

## Complete Data Pipeline: Filters, Sorts, Pagination, and Statistics

Here is a complete example combining everything -- derived chains, `$derived.by()`, lazy evaluation, and proper separation from effects:

```svelte
<script>
  let products = $state([
    { name: "Widget A", price: 25, category: "tools", rating: 4.2 },
    { name: "Widget B", price: 45, category: "tools", rating: 3.8 },
    { name: "Gadget X", price: 120, category: "electronics", rating: 4.7 },
    { name: "Gadget Y", price: 85, category: "electronics", rating: 4.1 },
    { name: "Gizmo Z", price: 15, category: "tools", rating: 4.9 },
    { name: "Thingamajig", price: 200, category: "electronics", rating: 3.5 },
    { name: "Doohickey", price: 35, category: "tools", rating: 4.4 },
    { name: "Whatchamacallit", price: 67, category: "accessories", rating: 4.0 }
  ]);

  // ===== User inputs =====
  let searchTerm = $state("");
  let selectedCategory = $state("all");
  let sortField = $state<"name" | "price" | "rating">("name");
  let sortDirection = $state<"asc" | "desc">("asc");
  let currentPage = $state(1);
  let pageSize = $state(3);
  let minPrice = $state(0);
  let maxPrice = $state(Infinity);

  // ===== Derived chain =====

  // Step 1: Filter by search term
  let searchFiltered = $derived(
    searchTerm.length === 0
      ? products
      : products.filter(p =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
  );

  // Step 2: Filter by category
  let categoryFiltered = $derived(
    selectedCategory === "all"
      ? searchFiltered
      : searchFiltered.filter(p => p.category === selectedCategory)
  );

  // Step 3: Filter by price range
  let priceFiltered = $derived(
    categoryFiltered.filter(p => p.price >= minPrice && p.price <= maxPrice)
  );

  // Step 4: Sort
  let sorted = $derived.by(() => {
    const multiplier = sortDirection === "asc" ? 1 : -1;

    return [...priceFiltered].sort((a, b) => {
      if (sortField === "price") return (a.price - b.price) * multiplier;
      if (sortField === "rating") return (a.rating - b.rating) * multiplier;
      return a.name.localeCompare(b.name) * multiplier;
    });
  });

  // Step 5: Paginate
  let paginated = $derived(
    sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  // Step 6: Computed metadata
  let totalPages = $derived(Math.ceil(priceFiltered.length / pageSize));
  let totalResults = $derived(priceFiltered.length);

  // Step 7: Statistics (independent of pagination)
  let stats = $derived.by(() => {
    if (priceFiltered.length === 0) {
      return { avgPrice: 0, avgRating: 0, priceRange: { min: 0, max: 0 } };
    }

    const prices = priceFiltered.map(p => p.price);
    const ratings = priceFiltered.map(p => p.rating);

    return {
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length,
      avgRating: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      priceRange: { min: Math.min(...prices), max: Math.max(...prices) }
    };
  });

  // Step 8: Available categories (derived from full product list, not filtered)
  let categories = $derived(
    ["all", ...new Set(products.map(p => p.category))]
  );

  // Reset to page 1 when filters change
  $effect(() => {
    // Reading these values makes the effect track them
    searchTerm;
    selectedCategory;
    minPrice;
    maxPrice;
    // Reset page — this is a side effect, so $effect is correct
    currentPage = 1;
  });
</script>

<div class="product-explorer">
  <!-- Search and filters -->
  <div class="filters">
    <input
      type="text"
      placeholder="Search products..."
      bind:value={searchTerm}
    />

    <select bind:value={selectedCategory}>
      {#each categories as cat}
        <option value={cat}>{cat === "all" ? "All Categories" : cat}</option>
      {/each}
    </select>

    <select bind:value={sortField}>
      <option value="name">Sort by Name</option>
      <option value="price">Sort by Price</option>
      <option value="rating">Sort by Rating</option>
    </select>

    <button onclick={() => sortDirection = sortDirection === "asc" ? "desc" : "asc"}>
      {sortDirection === "asc" ? "Ascending" : "Descending"}
    </button>
  </div>

  <!-- Statistics panel -->
  <div class="stats">
    <span>{totalResults} products</span>
    <span>Avg price: ${stats.avgPrice.toFixed(2)}</span>
    <span>Avg rating: {stats.avgRating.toFixed(1)}</span>
    <span>Range: ${stats.priceRange.min} - ${stats.priceRange.max}</span>
  </div>

  <!-- Product list -->
  <ul>
    {#each paginated as product (product.name)}
      <li>
        <strong>{product.name}</strong>
        <span>${product.price}</span>
        <span>{product.rating} stars</span>
        <span class="category">{product.category}</span>
      </li>
    {:else}
      <li class="empty">No products match your filters.</li>
    {/each}
  </ul>

  <!-- Pagination -->
  <div class="pagination">
    <button
      onclick={() => currentPage--}
      disabled={currentPage <= 1}
    >
      Previous
    </button>
    <span>Page {currentPage} of {totalPages || 1}</span>
    <button
      onclick={() => currentPage++}
      disabled={currentPage >= totalPages}
    >
      Next
    </button>
  </div>
</div>

<style>
  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  input, select {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
  }

  .stats {
    display: flex;
    gap: 16px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 8px;
    margin-bottom: 16px;
    font-size: 0.875rem;
    color: #6b7280;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  li.empty {
    justify-content: center;
    color: #9ca3af;
  }

  .category {
    background: #eef2ff;
    color: #4f46e5;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.875rem;
  }

  .pagination {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  button {
    padding: 6px 14px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

Notice the architecture:
- The **filter chain** is purely `$derived` -- each step is a computation that feeds the next
- **Statistics** branch off from `priceFiltered`, not from `paginated` -- they show stats for all filtered results, not just the current page
- **Page reset** uses `$effect` because it is a side effect (resetting a state variable in response to filter changes)
- **Categories** derives from the full product list, not the filtered one -- you do not want categories to disappear from the dropdown when you filter

## Try It

Build a "Product Explorer" with derived chains:
- A `$state()` array of at least 8 products with `name`, `price`, `category`, and `rating` properties
- A search input that filters products by name using `$derived`
- A category dropdown that further filters using another `$derived` (chained off the search filter)
- Sort controls (field + direction) as a `$derived.by()` step
- Pagination with `$derived` for the current page slice and total page count
- A `$derived.by()` that computes summary statistics: total products shown, average price, highest rating
- An `$effect` that resets the page to 1 whenever any filter changes
- Display everything in a clean UI with the stats above the product list

Bonus challenges:
1. Add a "price range" filter with min/max inputs. Where in the chain does it go?
2. Add a "sort by" toggle that reverses direction. Does this require a new derived value or a modification to an existing one?
3. Hide the statistics panel behind a toggle button. Verify (using `$inspect` or console.log inside `$derived.by`) that statistics are NOT computed when the panel is hidden.

## Key Takeaways

- `$derived.by(() => { ... })` handles multi-step computations that do not fit in a single expression -- use it whenever you need variables, loops, or conditionals
- Svelte's **push-pull** model means derived values are **lazy** -- they are only recomputed when actually read by the template, an effect, or another derived value
- The **diamond dependency problem** is solved automatically -- derived values at the bottom of a diamond compute exactly once per update cycle, not once per parent
- Derived values are **memoized** -- multiple reads in the same render cycle return the cached result without recomputation
- Derived values can **chain**: `searchFiltered` feeds into `categoryFiltered`, which feeds into `sorted`, then `paginated` -- each step is independent and lazy
- **Reference equality** is used for arrays and objects -- `filter()` and `map()` always create new references, which downstream values treat as "changed" even if contents are identical
- To avoid unnecessary downstream work, **read the minimal property** you need (e.g., `.length` instead of the whole array)
- **Always prefer `$derived` over `$effect`** for computing values -- it is lazy, works during SSR, avoids double-rendering, and produces cleaner dependency tracking
- Use `$effect` only for true side effects: DOM manipulation, network calls, logging, timers, or resetting state in response to changes
- **Debounce the input, not the derived value** -- use `$effect` with `setTimeout` to debounce a state variable, then derive from the debounced value
- The decision rule is simple: **$derived is a question, $effect is an action**
