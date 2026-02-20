# Advanced Derived State

You have already used `$derived()` to compute values from reactive state — totals, filtered lists, formatted strings. But the simple `$derived(expression)` form is just the beginning. For complex, multi-step computations you need `$derived.by()`. And to write truly efficient applications, you need to understand how Svelte's push-pull reactivity model makes derived values lazy and performant by default.

This lesson covers the full power of derived state, how to chain derived values together, and the critical distinction between `$derived` and `$effect` — two tools that beginners often confuse.

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

When your derived value requires multiple steps, use `$derived.by()` with a callback function. The function body can contain any logic — variables, if/else, loops, early returns — and the return value becomes the derived state:

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

Use `$derived()` for simple expressions and `$derived.by()` when you need multiple lines of logic. Both are equally reactive.

## How Push-Pull Reactivity Works

Svelte 5 uses a **push-pull** reactivity model, and understanding it helps explain why derived values are so efficient.

**Push phase**: When a `$state()` value changes, Svelte immediately notifies all dependents that something is dirty. This notification is cheap — it just sets a flag, it does not recompute anything.

**Pull phase**: A derived value is only actually recalculated when something **reads** it — the template rendering, another derived value, or an effect. If nobody reads the value, it is never recomputed. This makes derived values **lazy**.

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

When `count` goes from 0 to 5, `expensive` is flagged as dirty but never recalculated because no one reads it. Once `count` exceeds 5, the template reads `expensive`, triggering the pull. This laziness is automatic — you get it for free.

## Derived Chains

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

<div class="controls">
  <select bind:value={selectedCategory}>
    <option value="all">All Categories</option>
    <option value="tools">Tools</option>
    <option value="electronics">Electronics</option>
  </select>

  <select bind:value={sortField}>
    <option value="name">Sort by Name</option>
    <option value="price">Sort by Price</option>
  </select>
</div>

<ul>
  {#each paginated as product (product.name)}
    <li>{product.name} — ${product.price} ({product.category})</li>
  {/each}
</ul>

<div class="pagination">
  <button onclick={() => currentPage--} disabled={currentPage <= 1}>
    Previous
  </button>
  <span>Page {currentPage} of {totalPages}</span>
  <button onclick={() => currentPage++} disabled={currentPage >= totalPages}>
    Next
  </button>
</div>

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  select {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 6px;
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

When `selectedCategory` changes, `filtered` recalculates, which triggers `sorted`, then `paginated`, and `totalPages`. Each step is independent and lazy — if you removed the pagination UI, `paginated` and `totalPages` would never compute.

## $derived vs $effect: When to Use Each

This is one of the most common points of confusion in Svelte 5. Both respond to reactive changes, but they serve fundamentally different purposes:

| | `$derived` | `$effect` |
|---|---|---|
| **Purpose** | Compute a value | Perform a side effect |
| **Returns** | A reactive value | Nothing (void) |
| **Evaluation** | Lazy (only when read) | Eager (runs after every change) |
| **SSR** | Works during server-side rendering | Skipped on the server |
| **Examples** | Filtered lists, totals, formatted strings | DOM manipulation, logging, API calls |

**Prefer `$derived` whenever possible.** If you can express something as a computation that returns a value, it should be `$derived`. Only use `$effect` when you need to cause something to happen — write to the DOM, call an API, start a timer, or log output.

```svelte
<script>
  let searchTerm = $state("");
  let items = $state(["apple", "banana", "cherry", "date"]);

  // CORRECT: filtering is a computation — use $derived
  let results = $derived(
    items.filter(item => item.includes(searchTerm.toLowerCase()))
  );

  // WRONG: do not use $effect to compute derived values
  // let results = $state([]);
  // $effect(() => {
  //   results = items.filter(item => item.includes(searchTerm.toLowerCase()));
  // });
</script>
```

The `$effect` version works, but it is eager (runs even if nobody reads `results`), does not work during SSR, and introduces an unnecessary intermediate state update.

## Try It

Build a "Product Explorer" with derived chains:
- A `$state()` array of at least 8 products with `name`, `price`, `category`, and `rating` properties
- A search input that filters products by name using `$derived`
- A category dropdown that further filters using another `$derived` (chained off the search filter)
- A `$derived.by()` that computes summary statistics: total products shown, average price, highest rating
- Display everything in a clean UI with the stats above the product list

## Key Takeaways

- `$derived.by(() => { ... })` handles multi-step computations that do not fit in a single expression
- Svelte's **push-pull** model means derived values are **lazy** — they are only recomputed when actually read
- Derived values can **chain**: `filtered` feeds into `sorted`, which feeds into `paginated`
- **Always prefer `$derived` over `$effect`** for computing values — it is lazy, works during SSR, and produces cleaner code
- Use `$effect` only for true side effects: DOM manipulation, network calls, logging, or subscriptions
- `$derived` and `$derived.by` are equally reactive — choose based on whether your logic fits in one expression or needs multiple steps
