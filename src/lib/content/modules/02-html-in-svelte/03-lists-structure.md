# Lists & Structure

As your web pages grow, you need ways to display **lists** of items, present **tabular data**, and organize your page into **meaningful sections**. HTML gives you elements for all of these — and choosing the right one is a design decision that affects accessibility, maintainability, and how well machines can parse your content.

Here is the mental model that ties this all together: **your HTML structure should mirror your data structure.** If your data is a sequence of steps, use an ordered list. If it is a collection of key-value pairs, use a definition list. If it is rows and columns of related data, use a table. When the HTML structure matches the data structure, everything downstream — styling, accessibility, search indexing — works better with less effort.

This lesson covers more than syntax. It covers the *reasoning* behind structural choices — why `<article>` instead of `<div>`, why `scope` on `<th>`, why keys matter in `{#each}`, and what goes wrong when you get these details wrong.

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

Screen readers announce unordered lists as "list, 4 items" and let users navigate between items. This is genuinely useful for accessibility — a `<div>` with `<span>` elements provides none of this context.

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

### WRONG vs CORRECT: List Type Selection

```svelte
<!-- WRONG: Using <ol> for a feature list — order does not matter -->
<h2>Features</h2>
<ol>
  <li>Real-time collaboration</li>
  <li>Version history</li>
  <li>Export to PDF</li>
</ol>
<!-- Implies these features have a ranking or sequence. They do not. -->

<!-- CORRECT: Using <ul> for features — they are a set -->
<h2>Features</h2>
<ul>
  <li>Real-time collaboration</li>
  <li>Version history</li>
  <li>Export to PDF</li>
</ul>

<!-- WRONG: Using <ul> for installation steps — order matters! -->
<h2>Installation</h2>
<ul>
  <li>Install Node.js</li>
  <li>Run npm install</li>
  <li>Copy .env.example to .env</li>
  <li>Run npm run dev</li>
</ul>
<!-- These steps must happen in order. Putting "Run npm run dev" first would fail. -->

<!-- CORRECT: Using <ol> for steps — sequence is critical -->
<h2>Installation</h2>
<ol>
  <li>Install Node.js</li>
  <li>Run npm install</li>
  <li>Copy .env.example to .env</li>
  <li>Run npm run dev</li>
</ol>
```

### Ordered List Attributes

`<ol>` has attributes that most developers never discover but are useful in practice:

```svelte
<!-- Start numbering from a different number -->
<ol start="5">
  <li>Deploy to staging</li>  <!-- Numbered as 5 -->
  <li>Verify staging</li>     <!-- Numbered as 6 -->
  <li>Promote to production</li> <!-- Numbered as 7 -->
</ol>
<!-- Useful when you split a long list across multiple sections -->

<!-- Reverse numbering (countdown) -->
<ol reversed>
  <li>Deploy to production</li>  <!-- 3 -->
  <li>Verify staging</li>        <!-- 2 -->
  <li>Run tests</li>             <!-- 1 -->
</ol>

<!-- Different numbering types -->
<ol type="a">  <!-- a, b, c, d -->
<ol type="A">  <!-- A, B, C, D -->
<ol type="i">  <!-- i, ii, iii, iv -->
<ol type="I">  <!-- I, II, III, IV -->
```

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

Notice that a single `<dt>` can have multiple `<dd>` elements — "Prerequisites" has two values. This is valid and semantically correct. The reverse is also valid: multiple `<dt>` elements can share a single `<dd>` (synonyms that share a definition).

Definition lists are ideal for settings pages, product specs, FAQs, contact information — anywhere you have labeled data. They are significantly more meaningful than a `<div>` with a `<span>` for the label and another `<span>` for the value, and screen readers announce the term-description relationship.

### WRONG vs CORRECT: When to Use Definition Lists

```svelte
<!-- WRONG: Using divs and spans for key-value data -->
<div class="detail">
  <span class="label">Instructor:</span>
  <span class="value">Alex Chen</span>
</div>
<div class="detail">
  <span class="label">Duration:</span>
  <span class="value">8 weeks</span>
</div>
<!-- No semantic relationship between label and value.
     Screen readers see two random spans, not a key-value pair. -->

<!-- CORRECT: Using a definition list -->
<dl>
  <dt>Instructor</dt>
  <dd>Alex Chen</dd>
  <dt>Duration</dt>
  <dd>8 weeks</dd>
</dl>
<!-- Screen readers announce "Instructor: Alex Chen" as a related pair. -->

<!-- ALSO CORRECT: Definition list for FAQ -->
<dl>
  <dt>What payment methods do you accept?</dt>
  <dd>We accept Visa, Mastercard, and PayPal.</dd>

  <dt>Can I cancel my subscription?</dt>
  <dd>Yes, you can cancel anytime from your account settings.</dd>
</dl>
<!-- Each question-answer pair is semantically linked. -->
```

### Styling Definition Lists

Definition lists are notoriously tricky to style because `<dt>` and `<dd>` are siblings, not parent-child. Here are common layout patterns:

```css
/* Horizontal layout: term and description on the same line */
dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 16px;
}
dt {
  font-weight: 600;
  color: #555;
}
dd {
  margin: 0; /* Reset browser default margin */
}

/* Alternatively, using flexbox with wrapping */
dl {
  display: flex;
  flex-wrap: wrap;
}
dt {
  width: 30%;
  font-weight: 600;
}
dd {
  width: 70%;
  margin: 0;
}
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

When items in a list can change — reorder, add, remove — you need to tell Svelte how to identify each item. This is the **key expression**, and getting it wrong causes subtle, maddening bugs.

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

**Without a key**, Svelte updates by index. Remove the second item, and Svelte updates the *content* of DOM node 2 with node 3's data, then destroys node 3. Any internal state (checkbox values, animations, input text, component state) gets associated with the wrong item.

**With a key**, Svelte tracks each DOM node by the key value. Remove `id: 2`, and Svelte destroys exactly that node, leaving others untouched. State stays with the correct item.

### Demonstrating the Key Bug

This is the exact scenario where missing keys cause visible bugs:

```svelte
<script>
  let items = $state([
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Charlie' },
  ]);

  function removeFirst() {
    items = items.slice(1);
  }
</script>

<!-- WITHOUT key: type "hello" in Alice's input, then click "Remove First".
     Alice's DOM node now shows Bob's name, but the input STILL shows "hello"
     because the DOM node was reused, not destroyed. -->
<h3>Without Key (BUGGY)</h3>
{#each items as item}
  <div>
    <span>{item.name}</span>
    <input placeholder="Type here..." />
  </div>
{/each}

<!-- WITH key: type "hello" in Alice's input, then click "Remove First".
     Alice's entire DOM node is destroyed. Bob and Charlie's nodes are untouched.
     The "hello" disappears because Alice's node was removed. -->
<h3>With Key (CORRECT)</h3>
{#each items as item (item.id)}
  <div>
    <span>{item.name}</span>
    <input placeholder="Type here..." />
  </div>
{/each}

<button onclick={removeFirst}>Remove First</button>
```

The rule: **always provide a key when items can be reordered, added, or removed.** Use a stable, unique identifier (database ID, UUID), not the array index — using the index is the same as no key at all.

```svelte
<!-- CORRECT: stable unique ID -->
{#each users as user (user.id)}

<!-- WRONG: index is not stable when list changes -->
{#each users as user, index (index)}
<!-- If you remove item at index 0, every remaining item's index shifts.
     Svelte thinks EVERY item changed. Same problem as no key. -->

<!-- WRONG: no key at all -->
{#each users as user}
<!-- Svelte uses index internally. Same bug as above. -->

<!-- WRONG: non-unique key -->
{#each items as item (item.category)}
<!-- If two items share a category, Svelte cannot distinguish them.
     Behavior is undefined. -->
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

The index is zero-based, so `index + 1` gives you human-readable numbering. The index updates when items are added or removed — it always reflects the current position in the array.

Common uses for the index:
- Alternating row colors (`class:even={index % 2 === 0}`)
- "First" and "last" styling
- Numbering items in the UI
- Accessing adjacent items (`steps[index - 1]` for the previous step)

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

The `{:else}` block renders when the array is empty. This is more elegant than a separate `{#if}` check:

```svelte
<!-- CORRECT but verbose: separate {#if} check -->
{#if notifications.length === 0}
  <p>No notifications yet.</p>
{:else}
  <ul>
    {#each notifications as notification (notification.id)}
      <li>{notification.message}</li>
    {/each}
  </ul>
{/if}

<!-- BETTER: inline {:else} — less nesting, same result -->
<ul>
  {#each notifications as notification (notification.id)}
    <li>{notification.message}</li>
  {:else}
    <li class="empty-state">No notifications yet.</li>
  {/each}
</ul>
```

### Destructuring in {#each}

You can destructure the item directly in the `{#each}` declaration for cleaner templates:

```svelte
<!-- Without destructuring -->
{#each users as user (user.id)}
  <p>{user.name} ({user.email})</p>
{/each}

<!-- With destructuring — cleaner when accessing many properties -->
{#each users as { id, name, email, role } (id)}
  <div>
    <strong>{name}</strong>
    <span>{email}</span>
    <span class="badge">{role}</span>
  </div>
{/each}
```

Destructuring is especially useful when each item has many properties and you reference them repeatedly in the template.

## Nested Lists

Lists can be nested for hierarchical data — navigation menus, file trees, category breakdowns. Nest the inner `<ul>` *inside* the parent `<li>`:

```svelte
<script>
  let departments = $state([
    { name: 'Engineering', teams: ['Frontend', 'Backend', 'Platform'] },
    { name: 'Design', teams: ['Product Design', 'Brand'] },
    { name: 'Marketing', teams: ['Content', 'Growth', 'SEO'] },
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

The HTML mirrors the data: departments contain teams, and the nested `<ul>` reflects that containment. Screen readers announce the nesting level, helping users understand the hierarchy — "list, 3 items, nesting level 1" then "list, 3 items, nesting level 2."

### WRONG vs CORRECT: Nesting Structure

```svelte
<!-- WRONG: Inner list is a sibling of <li>, not a child -->
<ul>
  <li>Engineering</li>
  <ul>
    <li>Frontend</li>
    <li>Backend</li>
  </ul>
</ul>
<!-- Invalid HTML! A <ul> cannot be a direct child of another <ul>.
     It must be inside a <li>. Browsers may render it, but the structure
     is broken for accessibility. -->

<!-- CORRECT: Inner list is inside the parent <li> -->
<ul>
  <li>
    Engineering
    <ul>
      <li>Frontend</li>
      <li>Backend</li>
    </ul>
  </li>
</ul>
```

## Tables: For Tabular Data Only

Tables display **tabular data** — information naturally organized in rows and columns. Use them for financial data, comparison charts, schedules, and statistics. **Do not** use them for page layout, card grids, or form alignment — that was a 1990s pattern and is one of the worst accessibility anti-patterns in web history.

The test for whether you should use a table: "Is the data meaningful in both rows AND columns? Does each cell relate to both its row header and column header?" If yes, use a table. If you just want things aligned in a grid, use CSS Grid or Flexbox.

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
    <tr>
      <td>Asia Pacific</td>
      <td>$900K</td>
      <td>+22%</td>
    </tr>
  </tbody>
  <tfoot>
    <tr>
      <th scope="row">Total</th>
      <td>$5.1M</td>
      <td>+13%</td>
    </tr>
  </tfoot>
</table>
```

Every element serves a purpose:

- **`<caption>`** gives the table a title. Screen readers announce it when the user enters the table — without it, they have no idea what data they are looking at. Think of it as the table's `alt` text.
- **`<thead>`** groups the header row. It also lets browsers keep headers visible with CSS `position: sticky` on long tables — the headers stick to the top as you scroll.
- **`<th scope="col">`** tells screen readers this cell labels the entire column. When navigating to "$1.8M", the reader announces "Revenue: $1.8M." Without `scope`, the relationship is ambiguous.
- **`<tbody>`** groups data rows. Technically optional but explicit is better for readability and CSS targeting.
- **`<tfoot>`** groups footer rows (totals, summaries). The browser can render `<tfoot>` even before all `<tbody>` rows have loaded.

### Row Headers and Dynamic Tables

Sometimes the first cell in each row is also a header — use `<th scope="row">` so screen readers announce both the row and column context:

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

With `scope="row"`, a screen reader user navigating to the "$29/mo" cell hears: "Pro, Price: $29/mo." They get full context without scrolling back to check which row they are in.

Notice how the `{#each}` block iterates rows while the template handles columns — the HTML mirrors the data structure.

### WRONG vs CORRECT: Table Usage

```svelte
<!-- WRONG: Using a table for layout (not tabular data) -->
<table>
  <tr>
    <td><img src="/photo.jpg" alt="Photo" /></td>
    <td>
      <h2>Product Name</h2>
      <p>Description here</p>
    </td>
  </tr>
</table>
<!-- This is layout, not data. Screen readers announce it as a data table,
     confusing users. Use CSS Grid or Flexbox instead. -->

<!-- CORRECT: CSS Grid for layout -->
<div class="grid grid-cols-2 gap-4">
  <img src="/photo.jpg" alt="Photo" />
  <div>
    <h2>Product Name</h2>
    <p>Description here</p>
  </div>
</div>

<!-- WRONG: Using divs for tabular data -->
<div class="row">
  <div class="cell">Region</div>
  <div class="cell">Revenue</div>
</div>
<div class="row">
  <div class="cell">North America</div>
  <div class="cell">$2.4M</div>
</div>
<!-- Screen readers see random divs, not a data table.
     No row/column relationships. No navigation. -->

<!-- CORRECT: Using a real table for real data -->
<table>
  <thead><tr><th scope="col">Region</th><th scope="col">Revenue</th></tr></thead>
  <tbody><tr><td>North America</td><td>$2.4M</td></tr></tbody>
</table>
```

### Responsive Tables

Tables are notoriously difficult on mobile. Here are two patterns:

```svelte
<!-- Pattern 1: Horizontal scroll wrapper -->
<div class="overflow-x-auto">
  <table class="min-w-full">
    <!-- Full table here — users scroll horizontally on mobile -->
  </table>
</div>

<!-- Pattern 2: Stack on mobile using CSS (more complex but better UX) -->
<style>
  @media (max-width: 768px) {
    table, thead, tbody, th, td, tr {
      display: block;
    }
    thead { display: none; }
    td {
      position: relative;
      padding-left: 50%;
    }
    td::before {
      content: attr(data-label);
      position: absolute;
      left: 0;
      font-weight: bold;
    }
  }
</style>

<table>
  <thead>
    <tr><th>Plan</th><th>Price</th><th>Storage</th></tr>
  </thead>
  <tbody>
    <tr>
      <td data-label="Plan">Pro</td>
      <td data-label="Price">$29/mo</td>
      <td data-label="Storage">100 GB</td>
    </tr>
  </tbody>
</table>
```

## Semantic Page Structure

Beyond lists and tables, HTML provides elements that describe the *purpose* of page sections. These help screen readers, search engines, and other developers understand your layout.

| Tag | Purpose | Usage Rule |
|-----|---------|------------|
| `<header>` | Introductory content (logo, title, nav) | Can appear multiple times (page header, article header) |
| `<nav>` | Navigation links | Use `aria-label` when you have multiple navs |
| `<main>` | Primary content of the page | **Only one per page** |
| `<section>` | Thematic grouping with a heading | Always include a heading (`<h2>`, `<h3>`, etc.) |
| `<article>` | Self-contained content (blog post, card) | Should make sense independently |
| `<aside>` | Tangentially related content (sidebar) | Content that supplements the main content |
| `<footer>` | Closing content (copyright, links) | Can appear multiple times |

The key insight: these elements can be **nested**. A page has a `<header>`, but so can each `<article>` within it. They describe structure *relative to their context*.

```svelte
<body>
  <header>
    <!-- Page-level header: logo, main nav -->
    <nav aria-label="Main navigation">...</nav>
  </header>

  <main>
    <h1>Blog</h1>

    <article>
      <header>
        <!-- Article-level header: title, author, date -->
        <h2>Understanding Svelte 5 Runes</h2>
        <p>By Alex Chen — March 15, 2025</p>
      </header>

      <p>Article content here...</p>

      <footer>
        <!-- Article-level footer: tags, share links -->
        <p>Tags: Svelte, JavaScript</p>
      </footer>
    </article>

    <aside>
      <!-- Sidebar: related posts, newsletter signup -->
      <h2>Related Posts</h2>
      <ul>...</ul>
    </aside>
  </main>

  <footer>
    <!-- Page-level footer: copyright, legal links -->
    <p>&copy; 2025 MyBlog</p>
    <nav aria-label="Footer navigation">...</nav>
  </footer>
</body>
```

A screen reader user can jump directly to `<main>`, navigate between `<article>` elements, or skip to the `<footer>` — all without scrolling through everything. This is called **landmark navigation** and it is one of the most powerful accessibility features in HTML.

### WRONG vs CORRECT: Semantic Elements

```svelte
<!-- WRONG: Everything is a div — no semantic meaning -->
<div class="header">
  <div class="nav">...</div>
</div>
<div class="content">
  <div class="post">...</div>
  <div class="sidebar">...</div>
</div>
<div class="footer">...</div>
<!-- Screen readers see a flat list of divs. No landmarks.
     The user cannot jump to content or skip navigation. -->

<!-- CORRECT: Semantic elements provide structure -->
<header>
  <nav aria-label="Main">...</nav>
</header>
<main>
  <article>...</article>
  <aside>...</aside>
</main>
<footer>...</footer>
<!-- Screen readers see: banner, navigation, main, article, complementary, contentinfo.
     Users can jump between these landmarks instantly. -->
```

### When to Use <div>

Use `<div>` only when you need a generic container for styling and no semantic element fits:

```svelte
<!-- CORRECT uses of <div> -->
<div class="grid grid-cols-3 gap-4">  <!-- Layout wrapper -->
  <article>...</article>
  <article>...</article>
  <article>...</article>
</div>

<div class="bg-gray-100 rounded-lg p-4">  <!-- Visual grouping -->
  <h3>Settings</h3>
  <p>Configure your preferences</p>
</div>

<!-- WRONG use of <div> — should be <section> or <article> -->
<div class="features">
  <h2>Features</h2>
  <p>Our product includes...</p>
</div>
<!-- This has a heading and thematic content. Use <section>. -->
```

The test: if the element has a heading and represents a distinct topic, use `<section>`. If it could stand alone (blog post, product card, comment), use `<article>`. If it is purely a styling wrapper, use `<div>`.

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
        {#each feature.included as isIncluded, tierIndex}
          <td>
            {#if isIncluded}
              <span class="text-green-600" aria-label="{tiers[tierIndex]}: included">
                &#10003;
              </span>
            {:else}
              <span class="text-gray-300" aria-label="{tiers[tierIndex]}: not included">
                &mdash;
              </span>
            {/if}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>
```

The data structure (an array of features, each with a boolean array matching the tier order) maps directly to the table structure. The outer `{#each}` iterates rows, the inner one iterates columns. HTML mirrors data.

Notice the `aria-label` on the checkmark and dash — without it, screen readers would announce "checkmark" or just silence, with no context about which tier it refers to.

## Putting It All Together: A Full Page Layout

Here is a complete SvelteKit page that uses every structural element from this lesson:

```svelte
<script>
  import { page } from '$app/state';

  let navLinks = [
    { href: '/', label: 'Home' },
    { href: '/recipes', label: 'Recipes' },
    { href: '/about', label: 'About' },
  ];

  let recipe = $state({
    name: 'Pasta Carbonara',
    prepTime: '10 min',
    cookTime: '20 min',
    servings: 4,
    difficulty: 'Intermediate',
    ingredients: [
      '400g spaghetti',
      '200g pancetta',
      '4 egg yolks',
      '100g Pecorino Romano',
      'Black pepper to taste'
    ],
    steps: [
      'Boil pasta in salted water until al dente',
      'Fry pancetta until crispy',
      'Mix egg yolks with grated cheese',
      'Toss hot pasta with pancetta',
      'Add egg mixture and toss quickly off heat',
      'Season with black pepper and serve immediately'
    ],
    nutrition: [
      { nutrient: 'Calories', amount: '520 kcal' },
      { nutrient: 'Protein', amount: '24g' },
      { nutrient: 'Carbs', amount: '58g' },
      { nutrient: 'Fat', amount: '22g' },
    ]
  });
</script>

<header>
  <nav aria-label="Main navigation">
    <ul>
      {#each navLinks as link (link.href)}
        <li>
          <a href={link.href}
             class:active={page.url.pathname === link.href}
             aria-current={page.url.pathname === link.href ? 'page' : undefined}>
            {link.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>
</header>

<main>
  <article>
    <header>
      <h1>{recipe.name}</h1>
    </header>

    <dl>
      <dt>Prep Time</dt><dd>{recipe.prepTime}</dd>
      <dt>Cook Time</dt><dd>{recipe.cookTime}</dd>
      <dt>Servings</dt><dd>{recipe.servings}</dd>
      <dt>Difficulty</dt><dd>{recipe.difficulty}</dd>
    </dl>

    <section>
      <h2>Ingredients</h2>
      <ul>
        {#each recipe.ingredients as ingredient}
          <li>{ingredient}</li>
        {/each}
      </ul>
    </section>

    <section>
      <h2>Instructions</h2>
      <ol>
        {#each recipe.steps as step, i}
          <li>{step}</li>
        {/each}
      </ol>
    </section>

    <section>
      <h2>Nutrition</h2>
      <table>
        <caption>Nutritional information per serving</caption>
        <thead>
          <tr>
            <th scope="col">Nutrient</th>
            <th scope="col">Amount</th>
          </tr>
        </thead>
        <tbody>
          {#each recipe.nutrition as row (row.nutrient)}
            <tr>
              <th scope="row">{row.nutrient}</th>
              <td>{row.amount}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <footer>
      <p>Recipe by Chef Alex</p>
    </footer>
  </article>
</main>

<footer>
  <p>&copy; 2025 Recipe Collection</p>
</footer>
```

Every structural choice is intentional:
- `<header>` and `<footer>` at both page and article levels
- `<nav>` with `aria-label` for the navigation
- `<main>` wrapping the primary content (only one per page)
- `<article>` for the self-contained recipe
- `<dl>` for key-value metadata
- `<ul>` for ingredients (order does not matter)
- `<ol>` for steps (order matters)
- `<table>` with `<caption>`, `<th scope>` for nutritional data
- `{#each}` with keys where items have identity

## Try It

Build a "Recipe Page" component that includes:
- A `<header>` with the recipe name in an `<h1>`
- A `<dl>` (definition list) for metadata — prep time, cook time, servings, difficulty
- A `<main>` containing an unordered list of ingredients and an ordered list of steps
- A `<table>` with nutritional information (calories, protein, carbs, fat) with proper `<caption>`, `<thead>`, and `<th scope>` attributes
- A `<footer>` with a note like "Recipe by Chef Alex"
- Use Svelte's `{#each}` to render at least one list from an array in your `<script>` block with a key expression
- Add an `{:else}` block to handle the case where the ingredients list is empty
- Use destructuring in at least one `{#each}` block
- Make the page responsive: wrap the table in a `<div class="overflow-x-auto">` for mobile scrolling

## Key Takeaways

- **Ordered lists** (`<ol>`) are for sequences where order matters; **unordered lists** (`<ul>`) are for sets where it does not — the choice is about meaning, not bullets vs numbers — ask "if I rearranged these, would it still make sense?"
- **Definition lists** (`<dl>`) are ideal for key-value pairs, FAQs, and metadata — reach for them more often instead of building key-value layouts with `<div>` and `<span>`
- Always provide a **key expression** in `{#each}` blocks when items have identity — use stable unique IDs, never array indices — missing keys cause state to stick to the wrong DOM nodes when items are added, removed, or reordered
- The `{:else}` block inside `{#each}` handles empty lists elegantly without a separate `{#if}` check
- Destructuring in `{#each}` (`{#each users as { id, name, email } (id)}`) produces cleaner templates when accessing many properties
- **Tables are for tabular data only** — never for layout. Use `<caption>` (the table's title), `<thead>` (header row group), `<th scope="col">` (column header), and `<th scope="row">` (row header) to make tables fully accessible to screen reader navigation
- **Semantic elements** (`<header>`, `<main>`, `<article>`, `<nav>`, `<aside>`, `<footer>`) create landmarks that screen readers use for navigation — use them instead of generic `<div>` whenever content has a clear purpose
- Use `<div>` only as a styling wrapper when no semantic element fits — if the content has a heading, it is probably a `<section>`; if it could stand alone, it is probably an `<article>`
- Nested lists must place the inner `<ul>`/`<ol>` inside the parent `<li>`, not as a sibling — incorrect nesting is invalid HTML and breaks accessibility
- The guiding principle: **HTML structure should mirror data structure.** When it does, accessibility, SEO, and styling all become easier
