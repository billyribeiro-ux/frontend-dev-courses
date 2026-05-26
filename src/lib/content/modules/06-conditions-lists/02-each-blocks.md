# Rendering Lists

Most real-world applications display lists of things — posts in a feed, items in a cart, users in a table, songs in a playlist, search results, notifications, comments. Hard-coding each item in HTML would be impractical and impossible for dynamic data. Instead, you store data in an array and let Svelte render each item automatically.

Svelte's `{#each}` block is how you loop over arrays in your markup. It takes an array and repeats a chunk of HTML for every item in it. But there is far more to lists than basic looping — keyed lists, DOM reconciliation, performance with large datasets, reactivity with `$state` arrays, animations, and pagination patterns all matter in production.

Understanding how Svelte decides which DOM nodes to create, update, reuse, or destroy when a list changes is one of the most important performance concepts in the framework.

## The {#each} Block — Basics

The basic syntax loops over an array and gives you access to each item:

```svelte
<script>
  let fruits = ["Apple", "Banana", "Cherry", "Mango"];
</script>

<h2>My Fruits</h2>
<ul>
  {#each fruits as fruit}
    <li>{fruit}</li>
  {/each}
</ul>
```

This renders four `<li>` elements, one for each fruit. The variable name `fruit` is scoped to the block — you choose the name.

### How It Works Under the Hood

The Svelte compiler transforms `{#each}` into code that:
1. Iterates over the array
2. Creates a DOM fragment for each item
3. When the array changes, compares old and new items to determine what to create, update, or remove

This comparison algorithm — called **DOM reconciliation** — is where the key expression becomes critical. We will get to that soon.

## Getting the Index

Need to know the position of each item? Add a second parameter after a comma:

```svelte
<script>
  let steps = ["Plan", "Design", "Build", "Test", "Deploy"];
</script>

<ol>
  {#each steps as step, index}
    <li>
      <span class="step-number">Step {index + 1}</span>
      {step}
    </li>
  {/each}
</ol>
```

The `index` starts at 0 (like all JavaScript arrays). Add 1 for human-friendly numbering.

**Important:** The index reflects the item's position in the *current* array, not a stable identity. If items are reordered, the same item might have a different index. Never use the index as a key for items that can be reordered or removed — that is what the key expression is for.

## Rendering Arrays of Objects

In real applications, your data almost always comes as an array of objects. Each object has multiple properties:

```svelte
<script>
  let users = [
    { name: "Alex", role: "Developer", active: true },
    { name: "Sam", role: "Designer", active: true },
    { name: "Jordan", role: "Manager", active: false }
  ];
</script>

<div class="user-list">
  {#each users as user}
    <div class="user-card">
      <h3>{user.name}</h3>
      <p>{user.role}</p>
      <span class={user.active ? "active" : "inactive"}>
        {user.active ? "Active" : "Inactive"}
      </span>
    </div>
  {/each}
</div>

<style>
  .user-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
  }

  .user-card {
    padding: 16px;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  .user-card h3 { margin: 0 0 4px; }
  .user-card p { color: #666; margin: 0 0 8px; }
  .active { color: #27ae60; font-weight: bold; }
  .inactive { color: #e74c3c; font-weight: bold; }
</style>
```

## Destructuring in {#each}

When working with objects, you can destructure them directly in the each block. This pulls out the properties you need and makes the template cleaner:

```svelte
<script>
  let products = [
    { name: "Laptop", price: 999, inStock: true, category: "Electronics" },
    { name: "Phone", price: 699, inStock: true, category: "Electronics" },
    { name: "Tablet", price: 449, inStock: false, category: "Electronics" },
    { name: "Desk", price: 299, inStock: true, category: "Furniture" }
  ];
</script>

<ul>
  {#each products as { name, price, inStock, category }}
    <li>
      <strong>{name}</strong> — ${price} ({category})
      {#if !inStock}
        <em class="oos">(Out of stock)</em>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .oos { color: #e74c3c; }
</style>
```

You can also destructure with renaming and defaults:

```svelte
{#each products as { name: productName, price, inStock, category: cat = "Uncategorized" }}
  <li>{productName} in {cat}</li>
{/each}
```

And you can destructure while also getting the index:

```svelte
{#each products as { name, price }, i}
  <li>#{i + 1}: {name} (${price})</li>
{/each}
```

## Keyed Each Blocks — The Critical Concept

When your list items can be reordered, added, or removed, Svelte needs a way to track which item is which. A **keyed each** block gives each item a unique identifier:

```svelte
{#each todos as todo (todo.id)}
  <li>{todo.text}</li>
{/each}
```

The `(todo.id)` after `as todo` tells Svelte: "Use the `id` property as the unique identity for each item."

### Why Keys Matter — DOM Reconciliation

Without a key, Svelte uses **index-based reconciliation**. It assumes the first item in the new array corresponds to the first DOM node, the second to the second, and so on. This is fast for simple cases but produces wrong behavior for reordering and removal.

Consider this example:

```svelte
<script>
  let items = $state([
    { id: 1, text: "First", color: "red" },
    { id: 2, text: "Second", color: "blue" },
    { id: 3, text: "Third", color: "green" }
  ]);

  function removeFirst() {
    items = items.slice(1); // Remove the first item
  }
</script>

<!-- UNKEYED: When you remove "First", Svelte updates like this:
     DOM node 1: "First" → "Second" (text updated in place)
     DOM node 2: "Second" → "Third" (text updated in place)
     DOM node 3: "Third" → (removed)
     The WRONG DOM node gets removed! -->
{#each items as item}
  <div style="background: {item.color}; padding: 8px;">
    {item.text}
    <input type="text" placeholder="Type here" />
  </div>
{/each}

<!-- KEYED: When you remove "First", Svelte sees:
     id=1 → removed (its DOM node is removed)
     id=2 → still here (DOM node stays untouched)
     id=3 → still here (DOM node stays untouched) -->
{#each items as item (item.id)}
  <div style="background: {item.color}; padding: 8px;">
    {item.text}
    <input type="text" placeholder="Type here" />
  </div>
{/each}

<button onclick={removeFirst}>Remove First</button>
```

**The bug in the unkeyed version:** Type something into the inputs, then click "Remove First." In the unkeyed version, the text you typed in the first input stays, but it is now associated with "Second" — because Svelte updated the text content of DOM node 1 but left the input's state. In the keyed version, the entire DOM node for "First" is removed, and the other nodes remain untouched with their input state intact.

### What Makes a Good Key?

A key must be:
1. **Unique** within the list — no two items can share the same key
2. **Stable** across re-renders — the same item should always produce the same key
3. **Primitive** — strings and numbers work best

```svelte
<!-- GOOD keys -->
{#each items as item (item.id)}        <!-- Database ID — unique and stable -->
{#each items as item (item.uuid)}      <!-- UUID — guaranteed unique -->
{#each items as item (item.email)}     <!-- Unique field from data -->

<!-- BAD keys -->
{#each items as item, i (i)}           <!-- Index — changes on reorder/remove! -->
{#each items as item (Math.random())}  <!-- Random — changes every render! -->
{#each items as item (item.name)}      <!-- Non-unique — duplicates break things -->
{#each items as item (JSON.stringify(item))} <!-- Object — expensive, fragile -->
```

**When can you skip keys?** If your list is static (never reordered, items never added or removed) and items have no internal state (no inputs, no expanded sections), unkeyed each blocks work fine. In practice, always use keys for dynamic lists — it is cheap insurance against subtle bugs.

## Empty Lists with {:else}

Svelte has a built-in way to handle empty arrays — the `{:else}` clause inside `{#each}`:

```svelte
<script>
  let notifications = $state([]);

  function addNotification() {
    notifications = [...notifications, {
      id: Date.now(),
      text: `Notification at ${new Date().toLocaleTimeString()}`
    }];
  }

  function clearAll() {
    notifications = [];
  }
</script>

<h3>Notifications ({notifications.length})</h3>

<ul>
  {#each notifications as note (note.id)}
    <li>{note.text}</li>
  {:else}
    <li class="empty">No notifications yet. All quiet!</li>
  {/each}
</ul>

<button onclick={addNotification}>Add Notification</button>
<button onclick={clearAll} disabled={notifications.length === 0}>Clear All</button>

<style>
  .empty { color: #999; font-style: italic; }
</style>
```

The `{:else}` block renders when the array has zero items. This is cleaner than wrapping everything in a separate `{#if}` check:

```svelte
<!-- Without {:else} — more verbose -->
{#if notifications.length > 0}
  <ul>
    {#each notifications as note (note.id)}
      <li>{note.text}</li>
    {/each}
  </ul>
{:else}
  <p>No notifications.</p>
{/if}

<!-- With {:else} — cleaner -->
<ul>
  {#each notifications as note (note.id)}
    <li>{note.text}</li>
  {:else}
    <li>No notifications.</li>
  {/each}
</ul>
```

## Nested Each Blocks

You can nest `{#each}` blocks for rendering hierarchical data — categories with items, teams with members, etc.:

```svelte
<script>
  let departments = $state([
    {
      name: "Engineering",
      teams: [
        { name: "Frontend", members: ["Alice", "Bob"] },
        { name: "Backend", members: ["Charlie", "Diana"] },
        { name: "DevOps", members: ["Eve"] }
      ]
    },
    {
      name: "Design",
      teams: [
        { name: "UX", members: ["Frank", "Grace"] },
        { name: "Visual", members: ["Heidi"] }
      ]
    }
  ]);
</script>

{#each departments as dept}
  <div class="department">
    <h2>{dept.name}</h2>
    {#each dept.teams as team}
      <div class="team">
        <h3>{team.name}</h3>
        <ul>
          {#each team.members as member, i}
            <li>{i + 1}. {member}</li>
          {:else}
            <li class="empty">No members</li>
          {/each}
        </ul>
      </div>
    {/each}
  </div>
{/each}

<style>
  .department { margin-bottom: 20px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  .team { margin-left: 16px; margin-top: 8px; }
  .team h3 { font-size: 0.95rem; color: #555; }
  .empty { color: #999; font-style: italic; }
</style>
```

**Performance warning:** Three levels of nesting is usually fine. Four or more levels of `{#each}` suggests your data model or component structure needs refactoring — break inner loops into child components.

## {#each} with $state Arrays — Mutation vs Reassignment

Svelte 5's `$state()` deep-proxies arrays, so direct mutations like `push`, `pop`, `splice`, and index assignment are tracked automatically:

```svelte
<script>
  let items = $state([
    { id: 1, text: "Learn Svelte", done: false },
    { id: 2, text: "Build a project", done: false },
    { id: 3, text: "Deploy it", done: false }
  ]);

  let nextId = $state(4);

  // Direct mutation — works with $state() because of deep proxy
  function addItem(text) {
    items.push({ id: nextId++, text, done: false });
  }

  function toggleItem(id) {
    const item = items.find(i => i.id === id);
    if (item) item.done = !item.done; // Mutation — tracked by proxy
  }

  function removeItem(id) {
    const index = items.findIndex(i => i.id === id);
    if (index !== -1) items.splice(index, 1); // Mutation — tracked
  }

  // Reassignment also works — creates new array reference
  function clearDone() {
    items = items.filter(i => !i.done); // Reassignment
  }

  // Sort in place — mutation, tracked
  function sortByText() {
    items.sort((a, b) => a.text.localeCompare(b.text));
  }
</script>

<ul>
  {#each items as item (item.id)}
    <li class:done={item.done}>
      <label>
        <input
          type="checkbox"
          checked={item.done}
          onchange={() => toggleItem(item.id)}
        />
        {item.text}
      </label>
      <button onclick={() => removeItem(item.id)}>×</button>
    </li>
  {/each}
</ul>

<style>
  .done { text-decoration: line-through; opacity: 0.5; }
  li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  button { border: none; background: none; color: #e74c3c; cursor: pointer; font-size: 1.2rem; }
</style>
```

### Mutation vs Reassignment — When to Use Which

Both approaches work with `$state()`. Here are the trade-offs:

| Mutation (`push`, `splice`, etc.) | Reassignment (`items = items.filter(...)`) |
|---|---|
| More efficient for large arrays (no copy) | Creates a new array reference every time |
| Reads naturally for add/remove operations | Required for `filter`, `map`, `sort` (which return new arrays) |
| Only works with `$state()`, not `$state.raw()` | Works with both `$state()` and `$state.raw()` |
| Can confuse developers from React background | Familiar pattern from React/Svelte 4 |

**In Svelte 5, both are idiomatic.** Choose whichever reads more naturally for the operation. Use `push()` to add, `splice()` to remove at index, and reassignment with `filter()` to remove by condition.

## Filtering and Sorting with $derived

For filtered or sorted views of a list, use `$derived` rather than mutating the source array:

```svelte
<script>
  let todos = $state([
    { id: 1, text: "Learn HTML", done: true, priority: "low" },
    { id: 2, text: "Learn CSS", done: true, priority: "low" },
    { id: 3, text: "Learn JavaScript", done: false, priority: "high" },
    { id: 4, text: "Learn Svelte", done: false, priority: "high" },
    { id: 5, text: "Build a project", done: false, priority: "medium" }
  ]);

  let filter = $state("all"); // "all" | "active" | "done"
  let sortBy = $state("default"); // "default" | "text" | "priority"

  // Derived: filtered view — does NOT modify the source array
  let filteredTodos = $derived(
    filter === "all" ? todos :
    filter === "active" ? todos.filter(t => !t.done) :
    todos.filter(t => t.done)
  );

  // Derived: sorted view of the filtered list
  let sortedTodos = $derived.by(() => {
    const list = [...filteredTodos]; // Copy before sorting
    if (sortBy === "text") {
      list.sort((a, b) => a.text.localeCompare(b.text));
    } else if (sortBy === "priority") {
      const order = { high: 0, medium: 1, low: 2 };
      list.sort((a, b) => order[a.priority] - order[b.priority]);
    }
    return list;
  });

  let stats = $derived({
    total: todos.length,
    done: todos.filter(t => t.done).length,
    active: todos.filter(t => !t.done).length,
    showing: sortedTodos.length
  });
</script>

<div class="controls">
  <div class="filters">
    <button class:active={filter === "all"} onclick={() => filter = "all"}>
      All ({stats.total})
    </button>
    <button class:active={filter === "active"} onclick={() => filter = "active"}>
      Active ({stats.active})
    </button>
    <button class:active={filter === "done"} onclick={() => filter = "done"}>
      Done ({stats.done})
    </button>
  </div>

  <select bind:value={sortBy}>
    <option value="default">Default order</option>
    <option value="text">Sort by name</option>
    <option value="priority">Sort by priority</option>
  </select>
</div>

<p class="showing">Showing {stats.showing} of {stats.total}</p>

<ul>
  {#each sortedTodos as todo (todo.id)}
    <li class:done={todo.done}>
      <label>
        <input
          type="checkbox"
          checked={todo.done}
          onchange={() => todo.done = !todo.done}
        />
        <span class="text">{todo.text}</span>
        <span class="priority {todo.priority}">{todo.priority}</span>
      </label>
    </li>
  {:else}
    <li class="empty">No items match this filter.</li>
  {/each}
</ul>

<style>
  .controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; }
  .filters { display: flex; gap: 4px; }
  .filters button {
    padding: 4px 12px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 0.85rem;
  }
  .filters button.active { background: #3498db; color: white; border-color: #3498db; }
  select { padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; }
  .showing { font-size: 0.85rem; color: #888; margin-bottom: 8px; }
  ul { list-style: none; padding: 0; }
  li { padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
  li.done label { text-decoration: line-through; opacity: 0.5; }
  label { display: flex; align-items: center; gap: 8px; cursor: pointer; }
  .text { flex: 1; }
  .priority { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; }
  .high { background: #fdecea; color: #c0392b; }
  .medium { background: #fef9e7; color: #f39c12; }
  .low { background: #d5f5e3; color: #27ae60; }
  .empty { color: #999; font-style: italic; padding: 16px; text-align: center; }
</style>
```

**Key pattern:** The source array `todos` is never filtered or sorted in place. We create derived views (`filteredTodos`, `sortedTodos`) that compute from the source. This means changing the filter does not lose data — you can always switch back to "All" and see everything. This is the "single source of truth" principle applied to list management.

## Keyed vs Unkeyed — Performance and Correctness Deep Dive

Let's be precise about the differences:

### Unkeyed (default)

```svelte
{#each items as item}
```

- Svelte identifies items by their **index position**
- When the array changes, Svelte walks through positions 0, 1, 2... and updates each DOM node in place
- Removing item at position 0 causes every subsequent item to "slide up" — all DOM nodes get updated
- Fast for **appending** to the end (only one new node created)
- Slow and incorrect for **reordering** or **removing from the middle** (every node after the change gets updated)
- Element state (input values, scroll position, CSS animations) gets "shifted" to the wrong item

### Keyed

```svelte
{#each items as item (item.id)}
```

- Svelte identifies items by their **key value**
- When the array changes, Svelte matches old keys to new keys
- Items with matching keys keep their DOM nodes — no unnecessary updates
- Items with new keys get new DOM nodes created
- Items whose keys disappeared get their DOM nodes removed
- Element state stays with the correct item
- Slightly more overhead for simple append-only lists (tracking keys), but much better for any other operation

**Performance summary:**

| Operation | Unkeyed | Keyed |
|---|---|---|
| Append to end | Fast (1 create) | Fast (1 create) |
| Prepend to start | Slow (N updates + 1 create) | Fast (1 create + 1 move) |
| Remove from middle | Wrong behavior + N updates | Fast (1 remove) |
| Reorder | Wrong behavior + N updates | Fast (N moves, 0 creates) |
| Replace all | N updates | N removes + N creates |

## Pagination Patterns

For large datasets, you do not render everything at once. Here is a basic pagination pattern:

```svelte
<script>
  // Simulate a large dataset
  let allItems = $state(
    Array.from({ length: 95 }, (_, i) => ({
      id: i + 1,
      name: `Item ${i + 1}`,
      value: Math.round(Math.random() * 1000)
    }))
  );

  let currentPage = $state(1);
  let pageSize = $state(10);

  let totalPages = $derived(Math.ceil(allItems.length / pageSize));

  let paginatedItems = $derived(
    allItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  // Ensure current page is valid when pageSize changes
  let validatedPage = $derived(Math.min(currentPage, totalPages));

  function goToPage(page) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }

  // Generate page numbers for display
  let pageNumbers = $derived.by(() => {
    const pages = [];
    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });
</script>

<div class="pagination-demo">
  <div class="page-size">
    Show
    <select bind:value={pageSize} onchange={() => currentPage = 1}>
      <option value={5}>5</option>
      <option value={10}>10</option>
      <option value={25}>25</option>
      <option value={50}>50</option>
    </select>
    per page
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Name</th>
        <th>Value</th>
      </tr>
    </thead>
    <tbody>
      {#each paginatedItems as item (item.id)}
        <tr>
          <td>{item.id}</td>
          <td>{item.name}</td>
          <td>${item.value}</td>
        </tr>
      {:else}
        <tr>
          <td colspan="3" class="empty">No items</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="pagination-controls">
    <button onclick={() => goToPage(1)} disabled={currentPage === 1}>First</button>
    <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Prev</button>

    {#each pageNumbers as page}
      <button
        class:active={page === currentPage}
        onclick={() => goToPage(page)}
      >
        {page}
      </button>
    {/each}

    <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>Next</button>
    <button onclick={() => goToPage(totalPages)} disabled={currentPage === totalPages}>Last</button>
  </div>

  <p class="info">
    Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, allItems.length)} of {allItems.length}
  </p>
</div>

<style>
  .pagination-demo { max-width: 500px; }
  .page-size { margin-bottom: 12px; font-size: 0.9rem; }
  .page-size select { padding: 2px 4px; }

  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #f8f9fa; font-size: 0.85rem; text-transform: uppercase; color: #666; }
  .empty { text-align: center; color: #999; padding: 20px; }

  .pagination-controls { display: flex; gap: 4px; flex-wrap: wrap; }
  .pagination-controls button {
    padding: 4px 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 0.85rem;
  }
  .pagination-controls button.active { background: #3498db; color: white; border-color: #3498db; }
  .pagination-controls button:disabled { opacity: 0.4; cursor: not-allowed; }

  .info { font-size: 0.8rem; color: #888; margin-top: 8px; }
</style>
```

## Large Lists — Virtual Scrolling Concept

When you have thousands of items, even keyed rendering is slow because the browser must maintain thousands of DOM nodes. **Virtual scrolling** solves this by only rendering the items currently visible in the viewport:

```svelte
<script>
  // Simplified virtual scroll concept — in production, use a library
  let allItems = Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    text: `Item ${i + 1}`,
    value: Math.round(Math.random() * 10000)
  }));

  let scrollTop = $state(0);
  let containerHeight = 400; // Visible height in px
  let itemHeight = 40; // Each item's height in px

  let totalHeight = $derived(allItems.length * itemHeight);
  let startIndex = $derived(Math.floor(scrollTop / itemHeight));
  let endIndex = $derived(Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    allItems.length
  ));
  let visibleItems = $derived(allItems.slice(startIndex, endIndex));
  let offsetY = $derived(startIndex * itemHeight);

  function handleScroll(event) {
    scrollTop = event.currentTarget.scrollTop;
  }
</script>

<p>Rendering {visibleItems.length} of {allItems.length.toLocaleString()} items</p>

<div class="virtual-container" onscroll={handleScroll} style="height: {containerHeight}px;">
  <div class="virtual-spacer" style="height: {totalHeight}px;">
    <div class="virtual-content" style="transform: translateY({offsetY}px);">
      {#each visibleItems as item (item.id)}
        <div class="virtual-item" style="height: {itemHeight}px;">
          {item.text} — ${item.value}
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .virtual-container {
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 8px;
  }

  .virtual-spacer {
    position: relative;
  }

  .virtual-content {
    position: absolute;
    left: 0;
    right: 0;
  }

  .virtual-item {
    display: flex;
    align-items: center;
    padding: 0 16px;
    border-bottom: 1px solid #f0f0f0;
    font-size: 0.9rem;
  }
</style>
```

**In production:** Use a library like `svelte-virtual-list`, `tanstack-virtual`, or `svelte-virtual-scroll-list`. The concept above is simplified — real implementations handle variable-height items, scroll anchoring, keyboard navigation, and edge cases.

**When to virtualize:** As a rule of thumb, lists under 100 items rarely need virtualization. Lists of 100-500 items should be fine with good keyed rendering. Lists over 1000 items almost always need virtualization or pagination.

## Complete Example: Sortable, Filterable Data Table

```svelte
<script>
  let employees = $state([
    { id: 1, name: "Alice Chen", department: "Engineering", salary: 125000, startDate: "2021-03-15", active: true },
    { id: 2, name: "Bob Martinez", department: "Design", salary: 95000, startDate: "2022-06-01", active: true },
    { id: 3, name: "Charlie Kim", department: "Engineering", salary: 135000, startDate: "2020-01-10", active: true },
    { id: 4, name: "Diana Patel", department: "Marketing", salary: 88000, startDate: "2023-02-20", active: false },
    { id: 5, name: "Eve Johnson", department: "Engineering", salary: 140000, startDate: "2019-08-05", active: true },
    { id: 6, name: "Frank Lee", department: "Design", salary: 98000, startDate: "2022-11-12", active: true },
    { id: 7, name: "Grace Wang", department: "Marketing", salary: 92000, startDate: "2021-07-28", active: false },
    { id: 8, name: "Henry Davis", department: "Engineering", salary: 115000, startDate: "2023-09-01", active: true }
  ]);

  let search = $state("");
  let departmentFilter = $state("all");
  let statusFilter = $state("all");
  let sortField = $state("name");
  let sortDirection = $state("asc");

  // Get unique departments for filter dropdown
  let departments = $derived(
    [...new Set(employees.map(e => e.department))].sort()
  );

  // Step 1: Filter
  let filtered = $derived.by(() => {
    let result = employees;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.department.toLowerCase().includes(q)
      );
    }

    if (departmentFilter !== "all") {
      result = result.filter(e => e.department === departmentFilter);
    }

    if (statusFilter !== "all") {
      const isActive = statusFilter === "active";
      result = result.filter(e => e.active === isActive);
    }

    return result;
  });

  // Step 2: Sort
  let sorted = $derived.by(() => {
    const list = [...filtered];
    const dir = sortDirection === "asc" ? 1 : -1;

    list.sort((a, b) => {
      if (sortField === "name") return dir * a.name.localeCompare(b.name);
      if (sortField === "department") return dir * a.department.localeCompare(b.department);
      if (sortField === "salary") return dir * (a.salary - b.salary);
      if (sortField === "startDate") return dir * (new Date(a.startDate) - new Date(b.startDate));
      return 0;
    });

    return list;
  });

  // Statistics
  let stats = $derived({
    showing: sorted.length,
    total: employees.length,
    avgSalary: sorted.length > 0
      ? sorted.reduce((s, e) => s + e.salary, 0) / sorted.length
      : 0
  });

  function toggleSort(field) {
    if (sortField === field) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDirection = "asc";
    }
  }

  function getSortIndicator(field) {
    if (sortField !== field) return "";
    return sortDirection === "asc" ? " ▲" : " ▼";
  }

  function toggleActive(id) {
    const emp = employees.find(e => e.id === id);
    if (emp) emp.active = !emp.active;
  }

  function formatCurrency(n) {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function resetFilters() {
    search = "";
    departmentFilter = "all";
    statusFilter = "all";
    sortField = "name";
    sortDirection = "asc";
  }
</script>

<div class="data-table-container">
  <div class="toolbar">
    <input
      type="text"
      placeholder="Search name or department..."
      bind:value={search}
      class="search-input"
    />

    <select bind:value={departmentFilter}>
      <option value="all">All Departments</option>
      {#each departments as dept}
        <option value={dept}>{dept}</option>
      {/each}
    </select>

    <select bind:value={statusFilter}>
      <option value="all">All Status</option>
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>

    <button class="reset" onclick={resetFilters}>Reset</button>
  </div>

  <div class="stats-bar">
    <span>Showing {stats.showing} of {stats.total} employees</span>
    {#if stats.showing > 0}
      <span>Avg salary: {formatCurrency(stats.avgSalary)}</span>
    {/if}
  </div>

  <table>
    <thead>
      <tr>
        <th class="sortable" onclick={() => toggleSort("name")}>
          Name{getSortIndicator("name")}
        </th>
        <th class="sortable" onclick={() => toggleSort("department")}>
          Department{getSortIndicator("department")}
        </th>
        <th class="sortable" onclick={() => toggleSort("salary")}>
          Salary{getSortIndicator("salary")}
        </th>
        <th class="sortable" onclick={() => toggleSort("startDate")}>
          Start Date{getSortIndicator("startDate")}
        </th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      {#each sorted as employee (employee.id)}
        {@const tenure = Math.floor((Date.now() - new Date(employee.startDate)) / (365.25 * 86400000))}
        <tr class:inactive={!employee.active}>
          <td class="name-cell">
            <strong>{employee.name}</strong>
          </td>
          <td>
            <span class="dept-badge">{employee.department}</span>
          </td>
          <td class="salary">{formatCurrency(employee.salary)}</td>
          <td>
            {formatDate(employee.startDate)}
            <span class="tenure">({tenure}y)</span>
          </td>
          <td>
            <button
              class="status-toggle"
              class:active={employee.active}
              onclick={() => toggleActive(employee.id)}
            >
              {employee.active ? "Active" : "Inactive"}
            </button>
          </td>
        </tr>
      {:else}
        <tr>
          <td colspan="5" class="empty">
            No employees match your filters.
            <button onclick={resetFilters}>Clear filters</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .data-table-container { max-width: 800px; font-family: system-ui, sans-serif; }

  .toolbar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
  .search-input { flex: 1; min-width: 200px; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; }
  select { padding: 6px 8px; border: 1px solid #ddd; border-radius: 4px; }
  .reset { padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: white; cursor: pointer; }

  .stats-bar {
    display: flex; justify-content: space-between;
    font-size: 0.8rem; color: #888; margin-bottom: 8px;
  }

  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: 10px 12px; background: #f8f9fa; border-bottom: 2px solid #ddd; font-size: 0.8rem; text-transform: uppercase; color: #666; white-space: nowrap; }
  th.sortable { cursor: pointer; user-select: none; }
  th.sortable:hover { color: #333; }

  td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; font-size: 0.9rem; }
  tr.inactive td { opacity: 0.5; }
  tr:hover td { background: #f9f9f9; }

  .name-cell strong { color: #333; }
  .dept-badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 10px; background: #e8f4fd; color: #2980b9; }
  .salary { font-family: monospace; }
  .tenure { color: #aaa; font-size: 0.8rem; }

  .status-toggle {
    padding: 3px 10px; border-radius: 10px; border: 1px solid #ddd;
    font-size: 0.75rem; cursor: pointer; background: #f0f0f0; color: #888;
  }
  .status-toggle.active { background: #d4edda; color: #155724; border-color: #c3e6cb; }

  .empty { text-align: center; color: #999; padding: 24px; }
  .empty button { margin-top: 8px; }
</style>
```

Study this example. Notice:

- **Source array `employees` is never filtered or sorted.** All transformations happen in derived values.
- **The derived chain:** `employees` -> `filtered` (search + department + status) -> `sorted` (sort field + direction) -> rendered. Each step is independent and composable.
- **`{@const tenure}`** computes years of tenure inside each row — a value that only makes sense in the context of one employee.
- **`{:else}` on the each block** handles the "no results" case with a clear-filters option.
- **Keys (`employee.id`)** ensure status toggling and reordering do not confuse DOM state.
- **`$derived.by()`** is used for `filtered` and `sorted` because they need multi-step logic (conditionals, multi-field sorting).

## Try It

Build a "Bookshelf" component with:
- An array of book objects with `id`, `title`, `author`, `year`, `genre`, and `isRead` properties (at least 8 books)
- Use `{#each}` with a key to render each book as a card
- Add a search input that filters by title or author
- Add a genre dropdown filter populated from the unique genres in your data
- Add sortable columns (title, year, author) — click to toggle ascending/descending
- Use `{:else}` to show "No books match" when filters return nothing
- Show statistics: total books, read count, unread count, filtered count
- `class:` directive to style read books differently from unread ones
- A "Mark as Read" button on each book card that toggles `isRead`

## Key Takeaways

- **`{#each array as item}`** repeats HTML for every item in an array — `item` is a block-scoped variable you name
- **Access the index** with `{#each array as item, index}` — the index is positional, not an identity
- **Destructure objects** directly: `{#each items as { name, price }}` for cleaner templates
- **Use `(item.id)` for keyed each blocks** when items can change — keys must be unique, stable, and primitive
- **Without keys,** Svelte uses index-based reconciliation — fast for append-only but wrong for reorder/remove/insert
- **`{:else}` inside `{#each}`** handles empty arrays — cleaner than a separate `{#if}` check
- **Mutation (`push`, `splice`) and reassignment (`filter`, `map`) both work** with `$state()` arrays — use whichever reads more naturally
- **Never sort or filter the source array in place** — use `$derived` to create transformed views, preserving the original data
- **Virtual scrolling** is needed for 1000+ item lists — only render visible items to avoid DOM bloat
- **Pagination** is an alternative to virtualization — slice the array and render one page at a time
