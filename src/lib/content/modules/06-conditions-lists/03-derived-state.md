# Derived State

You have learned how to create reactive state with `$state()` and display it in your markup. But what about values that **depend on** other state? A shopping cart total that recalculates when items change. A filtered list that updates when a search term changes. A character count that adjusts as you type.

Svelte 5's `$derived()` rune solves this perfectly. It creates a value that automatically recalculates whenever the state it depends on changes. No manual updates. No stale data. Pure reactive magic.

## What is $derived()?

`$derived()` takes an expression and recomputes it any time a reactive value inside it changes:

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

## $derived() vs Inline Expressions

You might wonder: "Can I just write `{price * quantity}` in the markup?" Yes, and for simple calculations that is fine. But `$derived()` shines when:

1. The calculation is complex
2. You need the computed value in multiple places
3. You want to keep your markup clean

```svelte
<script>
  let items = $state([
    { name: "Shirt", price: 29.99 },
    { name: "Pants", price: 49.99 },
    { name: "Shoes", price: 89.99 }
  ]);

  // Complex calculation — better as $derived()
  let subtotal = $derived(items.reduce((sum, item) => sum + item.price, 0));
  let tax = $derived(subtotal * 0.08);
  let grandTotal = $derived(subtotal + tax);
</script>

<h2>Order Summary</h2>
<p>Subtotal: ${subtotal.toFixed(2)}</p>
<p>Tax (8%): ${tax.toFixed(2)}</p>
<p><strong>Total: ${grandTotal.toFixed(2)}</strong></p>
```

Imagine writing `{items.reduce((sum, item) => sum + item.price, 0) * 0.08}` in your markup every time you need the tax. Derived state keeps things readable.

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
</script>

<h2>Leaderboard (Average: {average.toFixed(1)})</h2>
<ol>
  {#each ranked as student, i}
    <li>
      {#if i === 0}
        <strong>{student.name} — {student.score} pts</strong>
      {:else}
        {student.name} — {student.score} pts
      {/if}
    </li>
  {/each}
</ol>
```

Notice the `[...students]` spread — this creates a copy before sorting, so we do not mutate the original array.

## Try It

Build a "Student Grades" component with:
- An array of students with name and grade properties
- A `$derived()` value for the class average
- A `$derived()` value for students above average
- A `$derived()` value for students below average
- Display all three lists with the counts

## Key Takeaways

- `$derived()` creates a value that automatically recalculates when its dependencies change
- Use it for totals, averages, filtered lists, sorted data, and percentages
- `$derived()` keeps complex calculations out of your markup
- It works with array methods like `.filter()`, `.reduce()`, `.sort()`, and `.map()`
- Always spread arrays (`[...array]`) before sorting to avoid mutating the original
- Derived values chain naturally — `grandTotal` can depend on `subtotal`, which depends on `items`
