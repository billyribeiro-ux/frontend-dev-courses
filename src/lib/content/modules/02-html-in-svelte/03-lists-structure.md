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

```svelte
<!-- A FAQ using definition lists — semantically excellent -->
<h2>Frequently Asked Questions</h2>
<dl>
  <dt>Is this course beginner-friendly?</dt>
  <dd>Yes! We start from the fundamentals and build up progressively.</dd>

  <dt>Do I need to know JavaScript first?</dt>
  <dd>Basic JavaScript knowledge is helpful but not strictly required. We cover what you need as we go.</dd>

  <dt>How long do I have access?</dt>
  <dd>Lifetime access. Once you enroll, the content is yours forever.</dd>
</dl>
```

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

The `(task.id)` after `as task` is the key. Here is what it does and why it is critical:

**Without a key**, Svelte updates the list by index. If you remove the second item, Svelte sees that item at index 1 changed and item at index 2 disappeared. It updates the *content* of the second DOM node and destroys the third one. If those DOM nodes have internal state (checkbox state, animation state, input values), the state gets associated with the wrong item. The checkbox that belonged to "Fix login bug" is now sitting on "Deploy to staging."

**With a key**, Svelte tracks each DOM node by the key value. When you remove the item with `id: 2`, Svelte knows exactly which DOM node to destroy — the one keyed by `2` — and leaves the others untouched. State stays with the correct item.

The rule: **always provide a key when list items have identity** — when they can be reordered, added, or removed. Use a stable, unique identifier (database ID, UUID), not the array index. Using the index as a key is the same as not providing a key at all.

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

## Nested Lists and Complex Structures

Lists can be nested for hierarchical data. This is common for navigation menus, file trees, and category breakdowns:

```svelte
<script>
  let departments = $state([
    {
      name: 'Engineering',
      teams: [
        { name: 'Frontend', members: 8 },
        { name: 'Backend', members: 12 },
        { name: 'Platform', members: 5 },
      ]
    },
    {
      name: 'Design',
      teams: [
        { name: 'Product Design', members: 4 },
        { name: 'Brand', members: 3 },
      ]
    },
  ]);
</script>

<ul>
  {#each departments as dept (dept.name)}
    <li>
      <strong>{dept.name}</strong>
      <ul>
        {#each dept.teams as team (team.name)}
          <li>{team.name} ({team.members} members)</li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>
```

The HTML structure mirrors the data structure: departments contain teams, and the nested `<ul>` inside the `<li>` reflects that containment. Screen readers will announce the nesting level, helping users understand the hierarchy.

## Tables: For Tabular Data Only

Tables have a specific, important purpose: displaying **tabular data** — information that is naturally organized in rows and columns where the relationship between cells in the same row and column is meaningful.

**Use tables for:** financial data, comparison charts, schedules, statistics, spreadsheet-like data.

**Do not use tables for:** page layout, card grids, form alignment, or anything that is not genuinely rows-and-columns data. Using tables for layout was common in the 1990s and is one of the worst accessibility anti-patterns in web history.

### Basic Table Structure

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
    <tr>
      <td>Asia Pacific</td>
      <td>$1.2M</td>
      <td>+22%</td>
    </tr>
  </tbody>
</table>
```

Every element here serves a purpose:

- **`<caption>`** provides a visible title for the table. Screen readers announce it when the user enters the table, giving context before they navigate the cells. Without a caption, a screen reader user lands on the table and has no idea what data they are looking at.
- **`<thead>`** groups the header row(s). This has both semantic meaning (these are labels, not data) and practical value (the browser can keep the header visible when scrolling long tables with CSS `position: sticky`).
- **`<th scope="col">`** marks a cell as a header and tells screen readers that it labels the entire column. When a user navigates to a data cell, the screen reader announces the column header first: "Region: Europe." Without `scope`, the relationship is ambiguous.
- **`<tbody>`** groups the data rows. It is technically optional (the browser infers it), but being explicit improves readability and makes CSS targeting easier.

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

Beyond lists and tables, HTML provides elements that describe the *purpose* of page sections. These are not visual elements — they are structural metadata that helps machines and assistive technology understand your layout.

| Tag | Purpose |
|-----|---------|
| `<header>` | Introductory content for a page or section (logo, title, nav) |
| `<nav>` | A section containing navigation links |
| `<main>` | The primary content of the page (only one per page) |
| `<section>` | A thematic grouping of content, typically with a heading |
| `<article>` | Self-contained content that could stand alone (blog post, product card, comment) |
| `<aside>` | Content tangentially related to the surrounding content (sidebars, callouts) |
| `<footer>` | Closing content for a page or section (copyright, links, contact) |

The key insight: `<header>`, `<footer>`, `<article>`, and `<section>` can be nested. A page has a `<header>`, but so can each `<article>` within the page. An `<article>` can have its own `<footer>`. These elements describe structure *relative to their context*.

### A Complete Semantic Layout

```svelte
<header>
  <h1>DevCourses</h1>
  <nav>
    <ul>
      <li><a href="/">Home</a></li>
      <li><a href="/courses">Courses</a></li>
      <li><a href="/about">About</a></li>
    </ul>
  </nav>
</header>

<main>
  <section>
    <h2>Featured Courses</h2>

    <article>
      <h3>SvelteKit Fundamentals</h3>
      <p>Learn to build modern web apps with Svelte 5 and SvelteKit.</p>
      <footer>
        <small>8 weeks &middot; Intermediate</small>
      </footer>
    </article>

    <article>
      <h3>CSS Architecture</h3>
      <p>Master scalable CSS patterns for large applications.</p>
      <footer>
        <small>6 weeks &middot; Advanced</small>
      </footer>
    </article>
  </section>

  <aside>
    <h2>Latest News</h2>
    <p>Svelte 5 is now stable! Check out the new runes API.</p>
  </aside>
</main>

<footer>
  <p>&copy; 2025 DevCourses. All rights reserved.</p>
  <nav>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms of Service</a>
  </nav>
</footer>
```

Compare this to a page built entirely with `<div>` tags. The semantic version communicates the entire page structure through element names alone. A screen reader user can jump directly to `<main>` to skip the header, navigate between `<article>` elements to scan courses, or jump to the page `<footer>` for legal links — all without scrolling through everything.

### When to Use `<div>`

Use `<div>` when you need a generic container purely for styling or layout purposes and no semantic element fits:

```svelte
<!-- Semantic: this IS navigation -->
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>

<!-- div: generic wrapper for CSS grid/flex layout -->
<div class="card-grid">
  <article class="card">...</article>
  <article class="card">...</article>
</div>
```

The `<div>` wrapping the cards has no semantic meaning — it is just a layout container. The cards themselves are `<article>` because each one is a self-contained piece of content. This is the right mix.

## Real Example: A Feature List and Pricing Table

Here is a realistic component combining lists, tables, and semantic structure:

```svelte
<script>
  let features = $state([
    { name: 'Component Architecture', included: [true, true, true] },
    { name: 'TypeScript Support', included: [true, true, true] },
    { name: 'SSR & Streaming', included: [false, true, true] },
    { name: 'Edge Deployment', included: [false, false, true] },
    { name: 'Priority Support', included: [false, false, true] },
  ]);

  let tiers = ['Starter', 'Pro', 'Enterprise'];
</script>

<section>
  <h2>What You Get</h2>

  <ul>
    <li>
      <strong>Build faster</strong> — Component-based architecture
      with hot module replacement
    </li>
    <li>
      <strong>Ship smaller</strong> — Compiler-based framework with
      no runtime overhead
    </li>
    <li>
      <strong>Scale confidently</strong> — TypeScript, testing, and
      deployment built in
    </li>
  </ul>
</section>

<section>
  <h2>Compare Plans</h2>

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
          {#each feature.included as isIncluded, i}
            <td>{isIncluded ? '✓' : '—'}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>
```

The data structure (an array of features, each with an array of booleans matching the tier order) maps directly to the table structure (rows of features, columns of tiers). The HTML reflects the data. The `{#each}` blocks handle both dimensions cleanly.

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
