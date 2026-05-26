# Derived State

You have learned how to create reactive state with `$state()` and display it in your markup. But what about values that **depend on** other state? A shopping cart total that recalculates when items change. A filtered list that updates when a search term changes. A character count that adjusts as you type.

Svelte 5's `$derived()` rune solves this perfectly. It creates a value that automatically recalculates whenever the state it depends on changes. No manual updates. No stale data. Pure reactive computation.

## What is $derived()?

`$derived()` takes an expression and recomputes it any time a reactive value inside that expression changes:

```svelte
<script>
  let price = $state(25);
  let quantity = $state(3);

  let total = $derived(price * quantity);
</script>

<p>Price: ${price}</p>
<p>Quantity: {quantity}</p>
<p>Total: ${total}</p>

<button onclick={() => quantity++}>Add One</button>
```

Every time `quantity` changes, `total` is automatically recalculated. You never need to manually update it.

The mental model is simple: `$derived` is a read-only mirror of some computation over reactive values. You cannot assign to a derived value. If you try `total = 100`, Svelte will throw a compiler error. This is intentional -- derived values are outputs, not inputs. They describe "what follows" from your state, not "what the user can change."

## How Dependency Tracking Works

Svelte tracks dependencies at runtime, not at compile time. When the expression inside `$derived()` executes, Svelte records every reactive value that was actually read during that execution. If you have a conditional inside your derived expression, only the branch that actually ran will register dependencies:

```svelte
<script>
  let useMetric = $state(true);
  let celsius = $state(22);
  let fahrenheit = $state(72);

  // Only tracks 'celsius' when useMetric is true
  // Only tracks 'fahrenheit' when useMetric is false
  // Always tracks 'useMetric'
  let temperature = $derived(
    useMetric ? `${celsius}C` : `${fahrenheit}F`
  );
</script>
```

This means if `useMetric` is `true` and you change `fahrenheit`, the derived value does not recompute. Svelte only reruns when a value that was actually read during the last execution changes. This is automatic and granular -- you never need to declare a dependency array.

This is fundamentally different from React's `useMemo`, where you manually specify dependencies in an array and hope you got them right. Svelte's approach is both more ergonomic and more correct.

## $derived() vs Inline Expressions

You might wonder: "Can I just write `{price * quantity}` in the markup?" Yes, and for simple calculations that is fine. But `$derived()` shines when:

1. **The calculation is complex** -- you do not want a multi-line reduce inside your template
2. **You need the computed value in multiple places** -- DRY principle
3. **You want to keep your markup clean** -- separation of logic and presentation
4. **You want to compose derivations** -- one derived feeds into another

```svelte
<script>
  let items = $state([
    { name: "Shirt", price: 29.99 },
    { name: "Pants", price: 49.99 },
    { name: "Shoes", price: 89.99 }
  ]);

  // Complex calculation -- better as $derived()
  let subtotal = $derived(items.reduce((sum, item) => sum + item.price, 0));
  let tax = $derived(subtotal * 0.08);
  let grandTotal = $derived(subtotal + tax);
</script>

<h2>Order Summary</h2>
<p>Subtotal: ${subtotal.toFixed(2)}</p>
<p>Tax (8%): ${tax.toFixed(2)}</p>
<p><strong>Total: ${grandTotal.toFixed(2)}</strong></p>
```

Imagine writing `{items.reduce((sum, item) => sum + item.price, 0) * 0.08}` in your markup every time you need the tax. Derived state keeps things readable and maintainable.

## Derived Chains

One of the most powerful patterns with `$derived` is chaining -- where one derived value feeds into another. Svelte handles this correctly and efficiently:

```svelte
<script>
  let items = $state([
    { name: "Widget", price: 10, quantity: 3 },
    { name: "Gadget", price: 25, quantity: 1 },
    { name: "Doohickey", price: 5, quantity: 7 }
  ]);

  // Chain of derived values -- each depends on the previous
  let lineItems = $derived(
    items.map(item => ({
      ...item,
      lineTotal: item.price * item.quantity
    }))
  );
  let subtotal = $derived(lineItems.reduce((sum, li) => sum + li.lineTotal, 0));
  let discountRate = $derived(subtotal > 100 ? 0.1 : 0);
  let discount = $derived(subtotal * discountRate);
  let afterDiscount = $derived(subtotal - discount);
  let tax = $derived(afterDiscount * 0.08);
  let grandTotal = $derived(afterDiscount + tax);
</script>

<table>
  <thead>
    <tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>
  </thead>
  <tbody>
    {#each lineItems as item}
      <tr>
        <td>{item.name}</td>
        <td>{item.quantity}</td>
        <td>${item.price.toFixed(2)}</td>
        <td>${item.lineTotal.toFixed(2)}</td>
      </tr>
    {/each}
  </tbody>
</table>

<p>Subtotal: ${subtotal.toFixed(2)}</p>
{#if discountRate > 0}
  <p>Discount ({(discountRate * 100).toFixed(0)}%): -${discount.toFixed(2)}</p>
{/if}
<p>Tax (8%): ${tax.toFixed(2)}</p>
<p><strong>Grand Total: ${grandTotal.toFixed(2)}</strong></p>
```

Each step in the chain is clear and testable. When `items` changes, Svelte recalculates only the downstream values that actually need updating. If `subtotal` was 120 and stays 120 after a change, `discountRate` and everything downstream may not need to recompute (Svelte compares values to avoid unnecessary work).

## $derived.by() -- Complex Computations

When your derivation requires more than a single expression -- loops, conditionals, early returns, try/catch, variable declarations -- use `$derived.by()`. It takes a function instead of an expression:

```svelte
<script>
  let items = $state([
    { name: "Laptop", price: 999, inStock: true },
    { name: "Mouse", price: 29, inStock: true },
    { name: "Keyboard", price: 79, inStock: false },
    { name: "Monitor", price: 449, inStock: true }
  ]);

  let summary = $derived.by(() => {
    const available = items.filter(item => item.inStock);
    const unavailable = items.filter(item => !item.inStock);

    const totalValue = available.reduce((sum, item) => sum + item.price, 0);

    const cheapest = available.length > 0
      ? available.reduce((min, item) => item.price < min.price ? item : min)
      : null;

    const mostExpensive = available.length > 0
      ? available.reduce((max, item) => item.price > max.price ? item : max)
      : null;

    return {
      available,
      unavailable,
      totalValue,
      cheapest,
      mostExpensive,
      averagePrice: available.length > 0 ? totalValue / available.length : 0
    };
  });
</script>

<h2>Inventory Summary</h2>
<p>{summary.available.length} items available, {summary.unavailable.length} out of stock</p>
<p>Total inventory value: ${summary.totalValue.toFixed(2)}</p>
<p>Average price: ${summary.averagePrice.toFixed(2)}</p>
{#if summary.cheapest}
  <p>Cheapest: {summary.cheapest.name} (${summary.cheapest.price})</p>
{/if}
{#if summary.mostExpensive}
  <p>Most expensive: {summary.mostExpensive.name} (${summary.mostExpensive.price})</p>
{/if}
```

The rule of thumb: if you need curly braces `{}`, use `$derived.by()`. If a single expression suffices, use `$derived()`. Both track dependencies identically.

### When $derived.by() Is Essential

There are patterns that require `$derived.by()` because they cannot be expressed as a single expression:

```svelte
<script>
  let data = $state([5, 3, 8, 1, 9, 2, 7, 4, 6]);

  // Early return pattern
  let median = $derived.by(() => {
    if (data.length === 0) return 0;

    const sorted = [...data].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  });

  // Multi-step algorithm
  let histogram = $derived.by(() => {
    const bins = new Map();
    for (const value of data) {
      const bin = Math.floor(value / 3) * 3;
      bins.set(bin, (bins.get(bin) ?? 0) + 1);
    }
    return [...bins.entries()].sort((a, b) => a[0] - b[0]);
  });

  // Password strength calculator
  let password = $state('');

  let strength = $derived.by(() => {
    if (password.length === 0) return { label: 'Empty', score: 0, color: '#ccc' };
    if (password.length < 6) return { label: 'Weak', score: 1, color: '#ef4444' };

    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    if (score <= 2) return { label: 'Fair', score: 2, color: '#f97316' };
    if (score <= 3) return { label: 'Good', score: 3, color: '#eab308' };
    return { label: 'Strong', score: 4, color: '#22c55e' };
  });
</script>
```

## Memoization and Lazy Evaluation

A critical detail about `$derived`: it uses lazy evaluation. The derived value is only recomputed when it is actually read. If nothing in your template or in another reactive computation reads the derived value, it sits dormant even if its dependencies change.

```svelte
<script>
  let count = $state(0);

  // This will NOT run on every count change
  // It only runs when 'expensive' is actually read somewhere
  let expensive = $derived.by(() => {
    console.log('Computing expensive value...');
    let result = 0;
    for (let i = 0; i < count * 1000; i++) {
      result += Math.sqrt(i);
    }
    return result;
  });

  let showResult = $state(false);
</script>

<button onclick={() => count++}>Count: {count}</button>
<button onclick={() => showResult = !showResult}>
  {showResult ? 'Hide' : 'Show'} result
</button>

{#if showResult}
  <!-- 'expensive' is only computed when this block renders -->
  <p>Result: {expensive.toFixed(2)}</p>
{/if}
```

When `showResult` is `false`, the expensive computation does not run even as `count` climbs. The moment `showResult` becomes `true` and the `{#if}` block renders, Svelte computes `expensive` and displays it. This is a genuine performance benefit -- you do not pay for derivations that are not currently visible.

Additionally, Svelte caches the result. If you read `expensive` twice in the same render cycle, the function runs only once. The second read returns the cached value. The cache is invalidated only when a dependency changes.

## $derived vs $effect -- A Critical Distinction

New Svelte developers often confuse `$derived` and `$effect`. They are fundamentally different tools:

| | `$derived` | `$effect` |
|---|---|---|
| **Purpose** | Compute a value from state | Run side effects when state changes |
| **Returns** | A value you can read | Nothing (void) |
| **Timing** | Lazy, on-demand | Eager, after DOM updates |
| **Side effects** | No (pure computation) | Yes (DOM manipulation, logging, API calls) |
| **Assignable** | No, read-only | N/A |

The golden rule: **if you are computing a value, use `$derived`. If you are doing something (logging, fetching, manipulating the DOM), use `$effect`.**

```svelte
<script>
  let items = $state(['apple', 'banana', 'cherry']);

  // CORRECT: computing a value
  let count = $derived(items.length);

  // CORRECT: side effect (logging)
  $effect(() => {
    console.log(`There are now ${items.length} items`);
  });

  // WRONG: do not use $effect to compute a value
  // let count = 0;
  // $effect(() => { count = items.length; }); // Don't do this!
</script>
```

Using `$effect` to synchronize one piece of state with another creates a second source of truth and can cause timing bugs -- the effect runs after the DOM updates, meaning there is a brief moment where `count` is stale. `$derived` has no such gap; it is always consistent.

### Why the $effect Anti-Pattern Is Dangerous

```svelte
<script>
  let items = $state([10, 20, 30]);

  // ANTI-PATTERN: Using $effect to compute a derived value
  let total = $state(0);
  $effect(() => {
    total = items.reduce((sum, n) => sum + n, 0);
  });

  // Problems:
  // 1. Double render: Svelte renders with total=0, then effect sets total=60, renders again
  // 2. Timing gap: Between first render and effect, the UI shows stale data
  // 3. Infinite loop risk: If effect sets state that triggers itself
  // 4. Harder to reason about: two sources of truth for one value

  // CORRECT: Use $derived
  let totalCorrect = $derived(items.reduce((sum, n) => sum + n, 0));
  // No double render. No timing gap. Always consistent.
</script>
```

## Common Mistakes

### Mistake 1: Mutating Inside $derived

```svelte
<script>
  let items = $state([3, 1, 4, 1, 5]);

  // BAD: .sort() mutates the original array!
  let sorted = $derived(items.sort((a, b) => a - b));

  // GOOD: spread first, then sort
  let sorted = $derived([...items].sort((a, b) => a - b));
</script>
```

Array methods like `.sort()` and `.reverse()` mutate in place. Always spread `[...array]` before using them in a derived expression. If you forget, you silently corrupt your source data. Modern JavaScript provides `.toSorted()` and `.toReversed()` which return new arrays without mutation -- use these if your target supports them (modern browsers, Node 20+).

### Mistake 2: Assigning to $derived

```svelte
<script>
  let price = $state(10);
  let doubled = $derived(price * 2);

  function reset() {
    doubled = 0; // ERROR: Cannot assign to a derived value
  }
</script>
```

If you need a value that can be both computed and overridden, use a state+derived pattern:

```svelte
<script>
  let price = $state(100);
  let taxOverride = $state<number | null>(null);
  let calculatedTax = $derived(price * 0.08);
  let tax = $derived(taxOverride ?? calculatedTax);
</script>
```

### Mistake 3: Assuming $derived Runs Immediately

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  count = 5;
  // Do NOT assume 'doubled' is 10 here in the script block
  // $derived is lazy -- it computes when read in a reactive context
</script>
```

In practice, reading `doubled` in the template always gives the correct value. But if you try to read it synchronously right after changing `count` in the same script block, the behavior depends on the reactive context.

### Mistake 4: Putting Side Effects in $derived

```svelte
<script>
  let query = $state('');

  // BAD: fetch is a side effect, not a computation
  let results = $derived.by(() => {
    fetch(`/api/search?q=${query}`); // Don't do this
    return [];
  });

  // GOOD: use $effect for side effects
  let results = $state([]);
  $effect(() => {
    fetch(`/api/search?q=${query}`)
      .then(r => r.json())
      .then(data => results = data);
  });
</script>
```

`$derived` should be a pure computation. No fetch calls, no DOM manipulation, no logging. If it has side effects, use `$effect` instead.

## Filtering Data

One of the most common uses of `$derived()` is filtering a list based on user input:

```svelte
<script>
  let search = $state("");

  let todos = $state([
    { id: 1, text: "Learn HTML", done: true },
    { id: 2, text: "Learn CSS", done: true },
    { id: 3, text: "Learn JavaScript", done: false },
    { id: 4, text: "Learn Svelte", done: false },
    { id: 5, text: "Build a project", done: false }
  ]);

  let filteredTodos = $derived(
    todos.filter(todo =>
      todo.text.toLowerCase().includes(search.toLowerCase())
    )
  );
</script>

<input
  type="text"
  placeholder="Search todos..."
  value={search}
  oninput={(e) => search = e.target.value}
/>

<p>Showing {filteredTodos.length} of {todos.length} todos</p>

<ul>
  {#each filteredTodos as todo (todo.id)}
    <li class:done={todo.done}>{todo.text}</li>
  {/each}
</ul>

<style>
  .done {
    text-decoration: line-through;
    color: #999;
  }

  input {
    padding: 8px 12px;
    font-size: 1rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    width: 100%;
    margin-bottom: 12px;
  }
</style>
```

As the user types in the search box, `filteredTodos` recalculates and the list updates instantly.

## Counting and Summarizing

Derived values are perfect for computing statistics from your data:

```svelte
<script>
  let tasks = $state([
    { text: "Design homepage", done: true },
    { text: "Build navbar", done: true },
    { text: "Add dark mode", done: false },
    { text: "Write tests", done: false },
    { text: "Deploy to production", done: false }
  ]);

  let totalTasks = $derived(tasks.length);
  let completedTasks = $derived(tasks.filter(t => t.done).length);
  let remainingTasks = $derived(totalTasks - completedTasks);
  let progressPercent = $derived(
    totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
  );
</script>

<div class="progress-card">
  <h2>Project Progress</h2>
  <div class="bar-bg">
    <div class="bar-fill" style="width: {progressPercent}%"></div>
  </div>
  <p>{progressPercent}% complete ({completedTasks} of {totalTasks})</p>
  <p>{remainingTasks} tasks remaining</p>
</div>

<style>
  .progress-card {
    max-width: 400px;
    padding: 20px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  .bar-bg {
    height: 20px;
    background: #ecf0f1;
    border-radius: 10px;
    overflow: hidden;
    margin: 12px 0;
  }

  .bar-fill {
    height: 100%;
    background: #27ae60;
    border-radius: 10px;
    transition: width 0.3s ease;
  }
</style>
```

## Complete Example: Filtered, Sorted, and Paginated List

This is the pattern you will use in production. It combines filtering, sorting, and pagination -- all driven by derived state:

```svelte
<script>
  let search = $state('');
  let sortField = $state('name');
  let sortDirection = $state('asc');
  let currentPage = $state(1);
  let pageSize = $state(5);

  let products = $state([
    { id: 1, name: 'Laptop', price: 999, category: 'Electronics' },
    { id: 2, name: 'Headphones', price: 149, category: 'Electronics' },
    { id: 3, name: 'Desk Chair', price: 349, category: 'Furniture' },
    { id: 4, name: 'Monitor', price: 449, category: 'Electronics' },
    { id: 5, name: 'Keyboard', price: 79, category: 'Electronics' },
    { id: 6, name: 'Mouse', price: 29, category: 'Electronics' },
    { id: 7, name: 'Bookshelf', price: 199, category: 'Furniture' },
    { id: 8, name: 'Desk Lamp', price: 45, category: 'Lighting' },
    { id: 9, name: 'Standing Desk', price: 599, category: 'Furniture' },
    { id: 10, name: 'Webcam', price: 69, category: 'Electronics' },
    { id: 11, name: 'Notebook', price: 12, category: 'Office' },
    { id: 12, name: 'Pen Set', price: 24, category: 'Office' },
    { id: 13, name: 'Floor Lamp', price: 129, category: 'Lighting' },
    { id: 14, name: 'Whiteboard', price: 89, category: 'Office' },
    { id: 15, name: 'Cable Organizer', price: 15, category: 'Electronics' }
  ]);

  // Step 1: Filter
  let filtered = $derived(
    products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.category.toLowerCase().includes(search.toLowerCase())
    )
  );

  // Step 2: Sort
  let sorted = $derived.by(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return copy;
  });

  // Step 3: Pagination metadata
  let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / pageSize)));

  // Reset to page 1 when filters change the result count
  let safePage = $derived(Math.min(currentPage, totalPages));

  // Step 4: Paginate
  let paginated = $derived(
    sorted.slice((safePage - 1) * pageSize, safePage * pageSize)
  );

  // Summary stats
  let categories = $derived([...new Set(filtered.map(p => p.category))]);
  let totalValue = $derived(filtered.reduce((sum, p) => sum + p.price, 0));

  function toggleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }
  }
</script>

<input
  type="text"
  placeholder="Search products or categories..."
  value={search}
  oninput={(e) => { search = e.target.value; currentPage = 1; }}
/>

<p>
  {filtered.length} results across {categories.length} categories
  (total value: ${totalValue.toLocaleString()})
</p>

<table>
  <thead>
    <tr>
      <th onclick={() => toggleSort('name')} style="cursor: pointer;">
        Name {sortField === 'name' ? (sortDirection === 'asc' ? '(A-Z)' : '(Z-A)') : ''}
      </th>
      <th onclick={() => toggleSort('price')} style="cursor: pointer;">
        Price {sortField === 'price' ? (sortDirection === 'asc' ? '(low)' : '(high)') : ''}
      </th>
      <th onclick={() => toggleSort('category')} style="cursor: pointer;">
        Category
      </th>
    </tr>
  </thead>
  <tbody>
    {#each paginated as product (product.id)}
      <tr>
        <td>{product.name}</td>
        <td>${product.price}</td>
        <td>{product.category}</td>
      </tr>
    {:else}
      <tr><td colspan="3">No products match your search.</td></tr>
    {/each}
  </tbody>
</table>

<div class="pagination">
  <button disabled={safePage <= 1} onclick={() => currentPage = safePage - 1}>Previous</button>
  <span>Page {safePage} of {totalPages}</span>
  <button disabled={safePage >= totalPages} onclick={() => currentPage = safePage + 1}>Next</button>
</div>

<style>
  table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  th, td { padding: 10px 14px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; user-select: none; }
  tr:hover td { background: #f1f5f9; }
  .pagination { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
  input { padding: 10px 14px; font-size: 1rem; border: 1px solid #ddd; border-radius: 6px; width: 100%; margin-bottom: 8px; }
</style>
```

Study this pattern carefully. The chain is `products -> filtered -> sorted -> paginated`, with each step expressed as a clean `$derived` declaration. When the user types a search query, the entire pipeline re-evaluates. When they click a column header, only `sorted` and `paginated` recompute (because `filtered` has not changed). When they click "Next", only `paginated` recomputes.

This is the architectural power of derived chains: each layer has a single responsibility, and Svelte's reactivity engine ensures minimal recomputation.

## Performance Considerations

For most applications, `$derived` is fast enough that you will never think about performance. But at scale -- thousands of items, complex transformations -- a few principles matter:

1. **Keep derivations focused.** A single `$derived` that does filtering, sorting, grouping, and pagination is harder to optimize than four separate derivations chained together. Svelte can skip intermediate steps when their dependencies have not changed.

2. **Avoid allocating in tight loops.** Every time a `$derived` runs, it produces a new value. For arrays, that means a new array allocation. This is fine for hundreds of items but may matter for tens of thousands.

3. **Consider `$derived.by()` for expensive computations.** If you need to guard with an early return ("if the list is empty, return `[]` immediately"), `$derived.by()` lets you skip the expensive work.

4. **Derived values are cached.** If you read the same derived value three times in one render, the function runs once. The second and third reads hit the cache. This means you can use the same derived value in your template and in another derivation without paying double.

5. **Lazy evaluation is your friend.** If a derived value is inside an `{#if}` block that is not rendered, its computation is skipped entirely. Structure your UI so expensive derivations are only active when visible.

## Transforming Data

You can also use `$derived()` to transform data into a new shape:

```svelte
<script>
  let students = $state([
    { name: "Alex", score: 92 },
    { name: "Sam", score: 78 },
    { name: "Jordan", score: 95 },
    { name: "Taylor", score: 88 }
  ]);

  // Sort by score (highest first)
  let ranked = $derived(
    [...students].sort((a, b) => b.score - a.score)
  );

  // Average score
  let average = $derived(
    students.reduce((sum, s) => sum + s.score, 0) / students.length
  );

  // Group by grade bracket
  let gradeGroups = $derived.by(() => {
    const groups = { A: [], B: [], C: [], F: [] };
    for (const s of students) {
      if (s.score >= 90) groups.A.push(s);
      else if (s.score >= 80) groups.B.push(s);
      else if (s.score >= 70) groups.C.push(s);
      else groups.F.push(s);
    }
    return groups;
  });
</script>

<h2>Leaderboard (Average: {average.toFixed(1)})</h2>
<ol>
  {#each ranked as student, i}
    <li>
      {#if i === 0}
        <strong>{student.name} -- {student.score} pts</strong>
      {:else}
        {student.name} -- {student.score} pts
      {/if}
    </li>
  {/each}
</ol>

<h3>By Grade</h3>
{#each Object.entries(gradeGroups) as [grade, members]}
  {#if members.length > 0}
    <p><strong>{grade}:</strong> {members.map(m => m.name).join(', ')}</p>
  {/if}
{/each}
```

Notice the `[...students]` spread -- this creates a copy before sorting, so we do not mutate the original array.

## Derived State in Class-Based Patterns

When you use classes with `$state` (a common Svelte 5 pattern for complex state), `$derived` works seamlessly as a class field:

```svelte
<script>
  class TodoList {
    items = $state([]);
    filter = $state('all');

    filtered = $derived.by(() => {
      switch (this.filter) {
        case 'active': return this.items.filter(t => !t.done);
        case 'completed': return this.items.filter(t => t.done);
        default: return this.items;
      }
    });

    remaining = $derived(this.items.filter(t => !t.done).length);
    allDone = $derived(this.items.length > 0 && this.remaining === 0);

    add(text) {
      this.items.push({ id: Date.now(), text, done: false });
    }

    toggle(id) {
      const item = this.items.find(t => t.id === id);
      if (item) item.done = !item.done;
    }
  }

  const list = new TodoList();
</script>

<input onkeydown={(e) => {
  if (e.key === 'Enter' && e.currentTarget.value) {
    list.add(e.currentTarget.value);
    e.currentTarget.value = '';
  }
}} placeholder="Add a todo..." />

<div>
  <button onclick={() => list.filter = 'all'}>All</button>
  <button onclick={() => list.filter = 'active'}>Active ({list.remaining})</button>
  <button onclick={() => list.filter = 'completed'}>Completed</button>
</div>

{#each list.filtered as todo (todo.id)}
  <label>
    <input type="checkbox" checked={todo.done} onchange={() => list.toggle(todo.id)} />
    <span class:done={todo.done}>{todo.text}</span>
  </label>
{/each}

{#if list.allDone && list.items.length > 0}
  <p>All done! Great job.</p>
{/if}

<style>
  .done { text-decoration: line-through; opacity: 0.5; }
  label { display: block; padding: 4px 0; }
</style>
```

This pattern scales well because the class encapsulates both state and derived computations. You can instantiate multiple `TodoList` objects and each one tracks its own reactivity independently.

## Try It

Build a "Student Grades" component with:
- An array of at least 8 students with `name`, `grade`, and `subject` properties
- A text search input and a subject filter dropdown
- A `$derived` chain: `allStudents -> searchFiltered -> subjectFiltered -> sorted -> paginated`
- `$derived` values for: class average, highest grade, lowest grade, grade distribution (A/B/C/D/F counts)
- Sortable table headers (name, grade, subject) with ascending/descending toggle
- Pagination with 4 items per page and Previous/Next buttons
- A progress bar showing what percentage of students are passing (grade >= 60)

## Key Takeaways

- `$derived()` creates a value that automatically recalculates when its dependencies change
- Svelte tracks dependencies at runtime -- only values actually read during execution are tracked
- `$derived.by()` accepts a function for multi-statement computations with loops, conditionals, and early returns
- Derived values are lazy: they only compute when read, and results are cached within a render cycle
- Chain derivations for complex pipelines: `source -> filtered -> sorted -> paginated`
- Never mutate arrays inside `$derived` -- always spread `[...array]` before `.sort()` or `.reverse()`
- `$derived` is for pure computations; `$effect` is for side effects. Never use `$effect` to synchronize state
- Derived values cannot be assigned to -- they are read-only outputs of your state
- Use `$derived` in classes for encapsulated, reusable state logic
- Performance is excellent by default; lazy evaluation and caching prevent unnecessary work
