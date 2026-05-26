# Lists & Structure

As your web pages grow, you need ways to display **lists** of items, present **tabular data**, and organize your page into **meaningful sections**. HTML gives you elements for all of these — and choosing the right one is a design decision that affects accessibility, maintainability, and how well machines can parse your content.

Here is the mental model that ties this all together: **your HTML structure should mirror your data structure.** If your data is a sequence of steps, use an ordered list. If it is a collection of key-value pairs, use a definition list. If it is rows and columns of related data, use a table. When the HTML structure matches the data structure, everything downstream — styling, accessibility, search indexing — works better with less effort.

## Unordered Lists

An unordered list displays items where **the order does not matter.** Use `<ul>` for the list container and `<li>` for each item:

```svelte
<h2>Tech Stack</h2>
<ul>
  <li>SvelteKit</li>
  <li>TypeScript</li>
  <li>PostgreSQL</li>
  <li>Tailwind CSS</li>
</ul>
```

The semantic meaning: these are a set of related items, but rearranging them would not change the meaning. A grocery list, a set of features, navigation links — all unordered.

## Ordered Lists

An ordered list displays items where **sequence matters.** Swap `<ul>` for `<ol>`:

```svelte
<h2>Deployment Steps</h2>
<ol>
  <li>Run the test suite</li>
  <li>Build the production bundle</li>
  <li>Run database migrations</li>
  <li>Deploy to staging</li>
  <li>Verify staging environment</li>
  <li>Promote to production</li>
</ol>
```

The semantic meaning: these items must happen in this order. Instructions, rankings, steps in a process — all ordered. A screen reader will announce each item with its number, reinforcing the sequence.

**Choosing between `<ul>` and `<ol>` is not about bullets versus numbers.** You can style either list to look like anything with CSS. The choice is about meaning. Ask yourself: "If I rearranged these items, would the content still make sense?" If yes, use `<ul>`. If no, use `<ol>`.

## Definition Lists: The Forgotten Hero

Most developers never reach for `<dl>` (definition list), but it is perfect for **key-value pairs**, **glossaries**, and **metadata displays**:

```svelte
<h2>Course Details</h2>
<dl>
  <dt>Instructor</dt>
  <dd>Alex Chen</dd>

  <dt>Duration</dt>
  <dd>8 weeks</dd>

  <dt>Level</dt>
  <dd>Intermediate</dd>

  <dt>Prerequisites</dt>
  <dd>Basic HTML and CSS</dd>
  <dd>JavaScript fundamentals</dd>
</dl>
```

- **`<dt>`** is the definition term (the key)
- **`<dd>`** is the definition description (the value)

Notice that a single `<dt>` can have multiple `<dd>` elements — "Prerequisites" has two values. This is valid and semantically correct.

Definition lists are ideal for settings pages, product specs, FAQs, contact information — anywhere you have labeled data. They are significantly more meaningful than a `<div>` with a `<span>` for the label and another `<span>` for the value, and screen readers announce the term-description relationship.

Definition lists also work beautifully for FAQs — each question is a `<dt>`, each answer a `<dd>`. Far more semantic than a stack of headings and paragraphs.

## Rendering Lists in Svelte with {#each}

Static lists are fine for hardcoded content, but real applications render lists from data. Svelte's `{#each}` block is how you do it:

```svelte
<script>
  let technologies = $state([
    { name: 'SvelteKit', category: 'Framework' },
    { name: 'TypeScript', category: 'Language' },
    { name: 'PostgreSQL', category: 'Database' },
    { name: 'Tailwind', category: 'Styling' },
  ]);
</script>

<ul>
  {#each technologies as tech}
    <li><strong>{tech.name}</strong> — {tech.category}</li>
  {/each}
</ul>
```

### The Key Expression: Why It Matters

When items in a list can change — reorder, add, remove — you need to tell Svelte how to identify each item. This is the **key expression**, and getting it wrong causes subtle, maddening bugs:

```svelte
<script>
  let tasks = $state([
    { id: 1, text: 'Write documentation', done: false },
    { id: 2, text: 'Fix login bug', done: true },
    { id: 3, text: 'Deploy to staging', done: false },
  ]);

  function removeTask(id) {
    tasks = tasks.filter(t => t.id !== id);
  }
</script>

<ul>
  {#each tasks as task (task.id)}
    <li>
      <input type="checkbox" checked={task.done} />
      {task.text}
      <button onclick={() => removeTask(task.id)}>Remove</button>
    </li>
  {/each}
</ul>
```

The `(task.id)` after `as task` is the key. Here is why it is critical:

**Without a key**, Svelte updates by index. Remove the second item, and Svelte updates the *content* of DOM node 2 and destroys node 3. Any internal state (checkbox values, animations, input text) gets associated with the wrong item.

**With a key**, Svelte tracks each DOM node by the key value. Remove `id: 2`, and Svelte destroys exactly that node, leaving others untouched. State stays with the correct item.

The rule: **always provide a key when items can be reordered, added, or removed.** Use a stable, unique identifier (database ID, UUID), not the array index — using the index is the same as no key at all.

```svelte
<!-- Good: stable unique ID -->
{#each users as user (user.id)}

<!-- Bad: index is not stable when list changes -->
{#each users as user, index (index)}

<!-- Bad: no key at all, same problem as index -->
{#each users as user}
```

### The Index Variable

The `{#each}` block gives you access to the current index as a second variable:

```svelte
<ol>
  {#each steps as step, index (step.id)}
    <li>Step {index + 1}: {step.description}</li>
  {/each}
</ol>
```

### Empty Lists

Handle the empty state with an `{:else}` block — this is one of Svelte's nice ergonomic touches:

```svelte
<ul>
  {#each notifications as notification (notification.id)}
    <li>{notification.message}</li>
  {:else}
    <li class="empty-state">No notifications yet.</li>
  {/each}
</ul>
```

## Nested Lists

Lists can be nested for hierarchical data — navigation menus, file trees, category breakdowns. Nest the inner `<ul>` *inside* the parent `<li>`:

```svelte
<script>
  let departments = $state([
    { name: 'Engineering', teams: ['Frontend', 'Backend', 'Platform'] },
    { name: 'Design', teams: ['Product Design', 'Brand'] },
  ]);
</script>

<ul>
  {#each departments as dept (dept.name)}
    <li>
      <strong>{dept.name}</strong>
      <ul>
        {#each dept.teams as team}
          <li>{team}</li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>
```

The HTML mirrors the data: departments contain teams, and the nested `<ul>` reflects that containment. Screen readers announce the nesting level, helping users understand the hierarchy.

## Tables: For Tabular Data Only

Tables display **tabular data** — information naturally organized in rows and columns. Use them for financial data, comparison charts, schedules, and statistics. **Do not** use them for page layout, card grids, or form alignment — that was a 1990s pattern and is one of the worst accessibility anti-patterns in web history.

### Accessible Table Structure

```svelte
<table>
  <caption>Q1 2025 Revenue by Region</caption>
  <thead>
    <tr>
      <th scope="col">Region</th>
      <th scope="col">Revenue</th>
      <th scope="col">Growth</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>North America</td>
      <td>$2.4M</td>
      <td>+12%</td>
    </tr>
    <tr>
      <td>Europe</td>
      <td>$1.8M</td>
      <td>+8%</td>
    </tr>
  </tbody>
</table>
```

Every element serves a purpose:

- **`<caption>`** gives the table a title. Screen readers announce it when the user enters the table — without it, they have no idea what data they are looking at.
- **`<thead>`** groups the header row. It also lets browsers keep headers visible with CSS `position: sticky` on long tables.
- **`<th scope="col">`** tells screen readers this cell labels the entire column. When navigating to "$1.8M", the reader announces "Revenue: $1.8M." Without `scope`, the relationship is ambiguous.
- **`<tbody>`** groups data rows. Technically optional but explicit is better for readability and CSS targeting.

### Row Headers and Dynamic Tables

Sometimes the first cell in each row is also a header — use `<th scope="row">` so screen readers announce both the row and column context. Here is a dynamic pricing table that uses both `scope="col"` and `scope="row"`:

```svelte
<script>
  let plans = $state([
    { name: 'Starter', price: 0, projects: 3, storage: '1 GB', support: 'Community' },
    { name: 'Pro', price: 29, projects: 50, storage: '100 GB', support: 'Email' },
    { name: 'Enterprise', price: 99, projects: 'Unlimited', storage: '1 TB', support: '24/7 Phone' },
  ]);
</script>

<table>
  <caption>Pricing Comparison</caption>
  <thead>
    <tr>
      <th scope="col">Plan</th>
      <th scope="col">Price</th>
      <th scope="col">Projects</th>
      <th scope="col">Storage</th>
      <th scope="col">Support</th>
    </tr>
  </thead>
  <tbody>
    {#each plans as plan (plan.name)}
      <tr>
        <th scope="row">{plan.name}</th>
        <td>{plan.price === 0 ? 'Free' : `$${plan.price}/mo`}</td>
        <td>{plan.projects}</td>
        <td>{plan.storage}</td>
        <td>{plan.support}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

With `scope="row"`, a screen reader user navigating to the "$29/mo" cell hears: "Pro, Price: $29/mo." They get full context without scrolling back to check. Notice how the `{#each}` block iterates rows while the template handles columns — the HTML mirrors the data structure.

## Semantic Page Structure

Beyond lists and tables, HTML provides elements that describe the *purpose* of page sections. These help screen readers, search engines, and other developers understand your layout.

| Tag | Purpose |
|-----|---------|
| `<header>` | Introductory content for a page or section (logo, title, nav) |
| `<nav>` | A section containing navigation links |
| `<main>` | The primary content of the page (only one per page) |
| `<section>` | A thematic grouping of content, typically with a heading |
| `<article>` | Self-contained content that could stand alone (blog post, product card) |
| `<aside>` | Tangentially related content (sidebars, callouts) |
| `<footer>` | Closing content for a page or section (copyright, contact) |

The key insight: these elements can be **nested**. A page has a `<header>`, but so can each `<article>` within it. They describe structure *relative to their context*. A screen reader user can jump directly to `<main>`, navigate between `<article>` elements, or skip to the `<footer>` — all without scrolling through everything.

Use `<div>` only when you need a generic container for styling and no semantic element fits. The cards in a grid are `<article>` elements; the grid wrapper is a `<div>`.

## Real Example: Feature Comparison with Two-Dimensional Data

Here is a pattern you will see in real applications — a comparison table where `{#each}` handles both rows and columns:

```svelte
<script>
  let features = $state([
    { name: 'Component Architecture', included: [true, true, true] },
    { name: 'SSR & Streaming', included: [false, true, true] },
    { name: 'Edge Deployment', included: [false, false, true] },
    { name: 'Priority Support', included: [false, false, true] },
  ]);

  let tiers = ['Starter', 'Pro', 'Enterprise'];
</script>

<table>
  <caption>Feature availability by plan tier</caption>
  <thead>
    <tr>
      <th scope="col">Feature</th>
      {#each tiers as tier}
        <th scope="col">{tier}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each features as feature (feature.name)}
      <tr>
        <th scope="row">{feature.name}</th>
        {#each feature.included as isIncluded}
          <td>{isIncluded ? '✓' : '—'}</td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
```

The data structure (an array of features, each with a boolean array matching the tier order) maps directly to the table structure. The outer `{#each}` iterates rows, the inner one iterates columns. HTML mirrors data.

## Try It

Build a "Recipe Page" component that includes:
- A `<header>` with the recipe name in an `<h1>`
- A `<dl>` (definition list) for metadata — prep time, cook time, servings, difficulty
- A `<main>` containing an unordered list of ingredients and an ordered list of steps
- A `<table>` with nutritional information (calories, protein, carbs, fat) with proper `<caption>`, `<thead>`, and `<th scope>` attributes
- A `<footer>` with a note like "Recipe by Chef Alex"
- Use Svelte's `{#each}` to render at least one list from an array in your `<script>` block

## Key Takeaways

- **Ordered lists** (`<ol>`) are for sequences where order matters; **unordered lists** (`<ul>`) are for sets where it does not — the choice is about meaning, not bullets vs numbers
- **Definition lists** (`<dl>`) are ideal for key-value pairs, FAQs, and metadata — reach for them more often
- Always provide a **key expression** in `{#each}` blocks when items have identity — use stable unique IDs, never array indices
- The `{:else}` block inside `{#each}` handles empty lists elegantly
- **Tables are for tabular data only** — never for layout. Use `<caption>`, `<thead>`, and `<th scope>` to make tables accessible
- **Semantic elements** (`<header>`, `<main>`, `<article>`, `<nav>`, `<aside>`, `<footer>`) communicate page structure to screen readers and search engines — use them instead of generic `<div>` whenever content has a clear purpose
- The guiding principle: **HTML structure should mirror data structure.** When it does, accessibility, SEO, and styling all become easier
