# Rendering Lists

Most real-world applications display lists of things — posts in a feed, items in a cart, users in a table, songs in a playlist. Hard-coding each item in HTML would be impractical. Instead, you store data in an array and let Svelte render each item automatically.

Svelte's `{#each}` block is how you loop over arrays in your markup. It takes an array and repeats a chunk of HTML for every item in it — clean, efficient, and easy to read.

## The {#each} Block

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

This renders four `<li>` elements, one for each fruit. If you add or remove items from the array, Svelte updates the list automatically.

## Getting the Index

Need to know the position of each item? Add a second parameter after a comma:

```svelte
<script>
  let steps = ["Plan", "Design", "Build", "Test", "Deploy"];
</script>

<ol>
  {#each steps as step, index}
    <li>Step {index + 1}: {step}</li>
  {/each}
</ol>
```

The `index` starts at 0, so we add 1 for human-friendly numbering.

## Rendering Arrays of Objects

In real apps, your data usually comes as an array of objects. Each object has multiple properties:

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

  .user-card h3 {
    margin: 0 0 4px;
  }

  .user-card p {
    color: #666;
    margin: 0 0 8px;
  }

  .active {
    color: #27ae60;
    font-weight: bold;
  }

  .inactive {
    color: #e74c3c;
    font-weight: bold;
  }
</style>
```

## Destructuring in {#each}

When working with objects, you can destructure them directly in the each block for cleaner code:

```svelte
<script>
  let products = [
    { name: "Laptop", price: 999, inStock: true },
    { name: "Phone", price: 699, inStock: true },
    { name: "Tablet", price: 449, inStock: false }
  ];
</script>

<ul>
  {#each products as { name, price, inStock }}
    <li>
      {name} — ${price}
      {#if !inStock}
        <em>(Out of stock)</em>
      {/if}
    </li>
  {/each}
</ul>
```

## Keyed Each Blocks

When your list items can be reordered, added, or removed, Svelte needs a way to track which item is which. A **keyed each** block gives each item a unique identifier:

```svelte
<script>
  let todos = $state([
    { id: 1, text: "Learn Svelte", done: false },
    { id: 2, text: "Build a project", done: false },
    { id: 3, text: "Deploy it", done: false }
  ]);

  function removeTodo(id) {
    todos = todos.filter(todo => todo.id !== id);
  }
</script>

<ul>
  {#each todos as todo (todo.id)}
    <li>
      {todo.text}
      <button onclick={() => removeTodo(todo.id)}>Remove</button>
    </li>
  {/each}
</ul>
```

The `(todo.id)` after `as todo` tells Svelte to use the `id` property as a unique key. This ensures correct updates when items are added, removed, or reordered.

## Empty Lists

You can handle the case when an array is empty by combining `{#each}` with `{#if}`:

```svelte
<script>
  let notifications = $state([]);
</script>

{#if notifications.length === 0}
  <p class="empty">No notifications yet.</p>
{:else}
  <ul>
    {#each notifications as note}
      <li>{note}</li>
    {/each}
  </ul>
{/if}
```

## A Complete Example: Task List

```svelte
<script>
  let tasks = $state([
    { id: 1, title: "Buy groceries", priority: "high" },
    { id: 2, title: "Walk the dog", priority: "medium" },
    { id: 3, title: "Read a book", priority: "low" },
    { id: 4, title: "Fix the bug", priority: "high" }
  ]);
</script>

<div class="task-list">
  <h2>My Tasks ({tasks.length})</h2>
  {#each tasks as task (task.id)}
    <div class="task" class:high={task.priority === "high"}>
      <span>{task.title}</span>
      <span class="badge">{task.priority}</span>
    </div>
  {/each}
</div>

<style>
  .task-list {
    max-width: 400px;
  }

  .task {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border: 1px solid #eee;
    border-radius: 6px;
    margin-bottom: 8px;
  }

  .task.high {
    border-left: 4px solid #e74c3c;
  }

  .badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    border-radius: 10px;
    background: #ecf0f1;
    text-transform: uppercase;
  }
</style>
```

## Try It

Build a "Bookshelf" component with:
- An array of book objects (title, author, year, isRead)
- Use `{#each}` with a key to render each book as a card
- Use `{#if}` inside the each to show a "Read" or "Unread" badge
- Show the total number of books and how many are read
- Style the read books differently from unread ones

## Key Takeaways

- `{#each array as item}` repeats HTML for every item in an array
- Access the index with `{#each array as item, index}`
- Use `(item.id)` for keyed each blocks when items can change
- Destructure objects directly: `{#each items as { name, price }}`
- Combine `{#each}` with `{#if}` to handle empty arrays gracefully
- Always use keys when list items can be added, removed, or reordered
