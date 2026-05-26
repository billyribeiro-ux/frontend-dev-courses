# CSS Grid

While Flexbox is great for one-dimensional layouts (a row or a column), **CSS Grid** is designed for two-dimensional layouts — rows **and** columns at the same time. Think photo galleries, dashboard layouts, and magazine-style designs.

Grid and Flexbox are not competitors — they are teammates. You will often use Grid for the overall page layout and Flexbox for smaller components inside the grid cells.

## The Mental Model: A Spreadsheet for Layout

Think of CSS Grid like a spreadsheet. You define a grid of rows and columns, then place items into specific cells. Items can span multiple rows or columns, just like merged cells in a spreadsheet.

The key conceptual difference from Flexbox: with Grid, you define the *container's* structure first (how many columns, how wide, how many rows), then items flow into that structure. With Flexbox, the *items* determine how the layout looks. Grid is container-driven; Flexbox is content-driven.

This means Grid excels when you know the layout structure in advance — "I want a sidebar, main content, and right panel" — while Flexbox excels when the content should dictate the layout — "just put these items in a row and let them figure out the spacing."

## Your First Grid

Just like Flexbox, you activate Grid on the parent container:

```svelte
<div class="grid">
  <div class="cell">1</div>
  <div class="cell">2</div>
  <div class="cell">3</div>
  <div class="cell">4</div>
  <div class="cell">5</div>
  <div class="cell">6</div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }

  .cell {
    padding: 24px;
    background: #3498db;
    color: white;
    text-align: center;
    border-radius: 4px;
    font-weight: 600;
  }
</style>
```

This creates a 3-column grid. The `1fr` unit means "one fraction of the available space" — so three `1fr` columns share the space equally. Six items with three columns automatically produces two rows.

## Grid Terminology

Before going deeper, here are the key terms:

- **Grid container** — The element with `display: grid`
- **Grid item** — Direct children of the grid container
- **Grid line** — The invisible lines that form the grid structure (columns have lines 1, 2, 3...; rows have lines 1, 2, 3...)
- **Grid track** — A row or column (the space between two adjacent grid lines)
- **Grid cell** — A single unit (intersection of one row and one column)
- **Grid area** — A rectangular region spanning one or more cells

```
     Column Lines: 1      2      3      4
                   │      │      │      │
 Row Line 1 ──────┼──────┼──────┼──────┤
                   │ Cell │ Cell │ Cell │  ← Row Track 1
 Row Line 2 ──────┼──────┼──────┼──────┤
                   │ Cell │ Cell │ Cell │  ← Row Track 2
 Row Line 3 ──────┼──────┼──────┼──────┤
                   ↑ Column Track 1
```

## grid-template-columns

This property defines how many columns you have and how wide they are:

```svelte
<div class="grid-demo">
  <div class="cell">Sidebar</div>
  <div class="cell">Main Content</div>
  <div class="cell">Aside</div>
</div>

<style>
  .grid-demo {
    display: grid;
    gap: 12px;

    /* Equal columns */
    grid-template-columns: 1fr 1fr 1fr;

    /* Fixed + flexible */
    /* grid-template-columns: 250px 1fr; */

    /* Mixed units */
    /* grid-template-columns: 200px 1fr 200px; */

    /* Percentage */
    /* grid-template-columns: 25% 50% 25%; */

    /* min-max */
    /* grid-template-columns: minmax(200px, 300px) 1fr; */
  }

  .cell {
    padding: 20px;
    background: #2c3e50;
    color: white;
    border-radius: 4px;
  }
</style>
```

Common patterns:
- `1fr 1fr 1fr` — three equal columns
- `250px 1fr` — fixed sidebar + flexible main
- `200px 1fr 200px` — sidebar, main, sidebar
- `minmax(200px, 1fr) 3fr` — sidebar at least 200px, main gets 3x the space

**The `fr` unit explained**: `fr` stands for "fraction." It distributes *remaining* space after fixed sizes are allocated. In `200px 1fr 1fr`, the first column gets 200px, then the remaining space is split equally between the other two. If the container is 1000px, the first column is 200px and each `1fr` column is 400px.

## grid-template-rows

You can also define row heights:

```svelte
<div class="layout">
  <div class="cell">Header</div>
  <div class="cell">Content</div>
  <div class="cell">Footer</div>
</div>

<style>
  .layout {
    display: grid;
    grid-template-rows: 80px 1fr 60px;
    height: 400px;
    gap: 8px;
  }

  .cell {
    background: #8e44ad;
    color: white;
    padding: 16px;
    border-radius: 4px;
  }
</style>
```

**Implicit vs explicit rows**: `grid-template-rows` defines *explicit* rows. If you have more items than rows defined, Grid creates *implicit* rows automatically. These implicit rows default to `auto` height (sized to fit content). Control implicit row size with `grid-auto-rows`:

```css
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 200px; /* All implicit rows are 200px tall */
  /* or */
  grid-auto-rows: minmax(100px, auto); /* At least 100px, grow as needed */
}
```

## The repeat() Function

When you have many identical columns, use `repeat()` instead of typing the same value over and over:

```css
.grid {
  /* Instead of: 1fr 1fr 1fr 1fr */
  grid-template-columns: repeat(4, 1fr);

  /* Repeat a pattern: */
  grid-template-columns: repeat(3, 100px 1fr);
  /* Expands to: 100px 1fr 100px 1fr 100px 1fr */
}
```

## minmax(): Flexible Track Sizing

`minmax(min, max)` defines a track that is at least `min` and at most `max`:

```css
.grid {
  grid-template-columns: minmax(200px, 300px) 1fr;
  /* First column: 200-300px. Second: fills remaining space. */

  grid-auto-rows: minmax(100px, auto);
  /* Rows: at least 100px, grow with content. */
}
```

This is essential for responsive layouts — it lets tracks adapt without media queries.

## auto-fit vs auto-fill: Responsive Grids

This is where Grid really shines. `auto-fit` and `auto-fill` with `minmax()` create grids that automatically adjust the number of columns based on available space:

```svelte
<div class="auto-grid">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
  <div class="card">Card 4</div>
  <div class="card">Card 5</div>
  <div class="card">Card 6</div>
</div>

<style>
  .auto-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
  }

  .card {
    padding: 24px;
    background: #1abc9c;
    color: white;
    border-radius: 8px;
    text-align: center;
  }
</style>
```

This says: "Make as many columns as will fit, with each being at least 200px and stretching to share available space." Resize the window and watch the columns adjust automatically — no media queries needed!

**auto-fit vs auto-fill — the difference matters**: Both create as many tracks as possible. The difference is what happens with *empty* tracks:

- `auto-fill` keeps empty tracks, preserving their space
- `auto-fit` collapses empty tracks, letting filled tracks expand

```css
/* With 2 items in a wide container: */

/* auto-fill: 2 filled columns + empty columns hold their 200px space */
grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));

/* auto-fit: 2 filled columns expand to fill all space */
grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
```

**In practice**: Use `auto-fit` when you want items to stretch and fill the container (the common case). Use `auto-fill` when you want consistent column widths regardless of how many items exist.

## Item Placement with grid-column and grid-row

By default, items flow into the grid in order. You can explicitly place items using grid line numbers:

```svelte
<div class="placement-grid">
  <div class="cell header">Header</div>
  <div class="cell sidebar">Sidebar</div>
  <div class="cell content">Content</div>
  <div class="cell footer">Footer</div>
</div>

<style>
  .placement-grid {
    display: grid;
    grid-template-columns: 200px 1fr;
    grid-template-rows: 80px 1fr 60px;
    gap: 8px;
    height: 400px;
  }

  .header {
    grid-column: 1 / 3;  /* Start at line 1, end at line 3 (spans 2 columns) */
    /* Shorthand: grid-column: 1 / -1; (-1 = last line) */
    background: #2c3e50;
  }

  .sidebar {
    grid-column: 1;
    grid-row: 2;
    background: #34495e;
  }

  .content {
    grid-column: 2;
    grid-row: 2;
    background: #7f8c8d;
  }

  .footer {
    grid-column: 1 / 3;
    background: #2c3e50;
  }

  .cell {
    color: white;
    padding: 16px;
    border-radius: 4px;
  }
</style>
```

## Spanning Cells

Items can span multiple rows or columns:

```svelte
<div class="span-grid">
  <div class="cell featured">Featured (spans 2 cols, 2 rows)</div>
  <div class="cell">Normal</div>
  <div class="cell">Normal</div>
  <div class="cell wide">Wide (spans 2 cols)</div>
  <div class="cell">Normal</div>
</div>

<style>
  .span-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 120px;
    gap: 12px;
  }

  .featured {
    grid-column: span 2;  /* Span 2 columns from current position */
    grid-row: span 2;     /* Span 2 rows from current position */
    background: #e74c3c;
  }

  .wide {
    grid-column: span 2;
    background: #9b59b6;
  }

  .cell {
    background: #3498db;
    color: white;
    padding: 16px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
```

There are two ways to span:
- `grid-column: span 2` — span 2 columns from wherever the item is placed
- `grid-column: 1 / 3` — start at line 1, end at line 3 (explicit placement + span)

## Named Grid Areas

For complex page layouts, you can name each section and arrange them visually. This is Grid's most powerful feature for readability:

```svelte
<div class="page">
  <header class="head">Header</header>
  <nav class="side">Sidebar</nav>
  <main class="content">Main Content</main>
  <footer class="foot">Footer</footer>
</div>

<style>
  .page {
    display: grid;
    grid-template-areas:
      "head head"
      "side content"
      "foot foot";
    grid-template-columns: 200px 1fr;
    grid-template-rows: 60px 1fr 50px;
    gap: 8px;
    height: 400px;
  }

  .head    { grid-area: head;    background: #2c3e50; }
  .side    { grid-area: side;    background: #34495e; }
  .content { grid-area: content; background: #7f8c8d; }
  .foot    { grid-area: foot;    background: #2c3e50; }

  .page > * {
    color: white;
    padding: 12px;
    border-radius: 4px;
  }
</style>
```

Reading the `grid-template-areas` value is like looking at a tiny map of your page layout. Each string is a row. Each word is a column. Use `.` for empty cells:

```css
grid-template-areas:
  "head head head"
  "side content ."
  "foot foot foot";
```

**Rules for named areas:**
- Area names must form rectangles (no L-shapes)
- Each row must have the same number of cells
- Use `.` for empty cells
- Area names cannot be CSS keywords

## Subgrid

Subgrid lets a nested grid inherit the track definitions of its parent grid. This is powerful for aligning nested content with the outer layout:

```svelte
<div class="card-grid">
  <div class="card">
    <h3>Short Title</h3>
    <p>Brief description.</p>
    <button>Action</button>
  </div>
  <div class="card">
    <h3>A Much Longer Card Title That Wraps</h3>
    <p>This card has a longer title, but the description and button still align with the other cards.</p>
    <button>Action</button>
  </div>
  <div class="card">
    <h3>Medium Title</h3>
    <p>Another description here.</p>
    <button>Action</button>
  </div>
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .card {
    display: grid;
    grid-template-rows: subgrid; /* Inherit row tracks from parent */
    grid-row: span 3;           /* Each card spans 3 parent rows */
    padding: 20px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    gap: 12px;
  }

  .card button {
    align-self: start;
    padding: 8px 16px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
</style>
```

With subgrid, all card titles align on the same row, all descriptions align, and all buttons align — even when titles have different lengths. Without subgrid, each card's internal layout is independent.

**Browser support**: Subgrid is supported in all modern browsers as of 2023. Check caniuse.com for your support requirements.

## Responsive Grid Patterns Without Media Queries

Grid offers several patterns that adapt to screen size without any `@media` rules:

### auto-fit with minmax (the classic)

```css
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}
```

### RAM (Repeat, Auto, Minmax) with different minimums

```css
/* Cards: at least 300px, great for blog layouts */
.blog-grid {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

/* Thumbnails: at least 150px, great for image galleries */
.gallery-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}

/* Sidebar + content: sidebar has fixed width, content fills rest */
.sidebar-layout {
  grid-template-columns: minmax(200px, 250px) 1fr;
}
```

### Full-bleed layout with grid

```css
.full-bleed {
  display: grid;
  grid-template-columns:
    1fr
    min(65ch, 100% - 2rem)
    1fr;
}

.full-bleed > * {
  grid-column: 2; /* Everything in the center column */
}

.full-bleed > .bleed {
  grid-column: 1 / -1; /* Full width items */
}
```

## Grid vs Flexbox: Decision Framework

| Scenario | Use |
|---|---|
| Navigation bar | Flexbox |
| Page-level layout (header/sidebar/content/footer) | Grid |
| Card row with equal heights | Either (Grid is simpler) |
| Centering a single element | Flexbox |
| Photo gallery | Grid |
| Form layout (label + input rows) | Grid |
| Items of unknown count wrapping responsively | Either (Grid with auto-fit, or Flexbox with flex-wrap) |
| Dashboard with mixed-size panels | Grid |
| Vertically stacking items in a sidebar | Flexbox |
| Complex overlapping layouts | Grid |

**Rule of thumb**: If you are laying out items in one direction, reach for Flexbox. If you need to control both directions simultaneously, reach for Grid. When in doubt, try Grid first — it can do everything Flexbox does plus more.

## Tailwind Grid Utilities

```html
<!-- display: grid -->
<div class="grid">

<!-- grid-template-columns -->
<div class="grid grid-cols-3">        <!-- repeat(3, 1fr) -->
<div class="grid grid-cols-12">       <!-- repeat(12, 1fr) — 12-column grid -->
<div class="grid grid-cols-[200px_1fr]"> <!-- Custom: 200px 1fr -->

<!-- responsive columns -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">

<!-- gap -->
<div class="grid gap-4">             <!-- 16px gap -->
<div class="grid gap-x-4 gap-y-8">  <!-- Different row/column gaps -->

<!-- spanning -->
<div class="col-span-2">             <!-- grid-column: span 2 -->
<div class="col-span-full">          <!-- grid-column: 1 / -1 -->
<div class="row-span-2">             <!-- grid-row: span 2 -->

<!-- grid-auto-rows -->
<div class="grid auto-rows-min">     <!-- grid-auto-rows: min-content -->
<div class="grid auto-rows-fr">      <!-- grid-auto-rows: minmax(0, 1fr) -->

<!-- Practical dashboard layout in Tailwind -->
<div class="grid grid-cols-1 md:grid-cols-[250px_1fr] min-h-screen">
  <aside class="bg-slate-800 p-4">Sidebar</aside>
  <main class="p-6">Content</main>
</div>
```

## Complete Dashboard Layout

Here is a production dashboard layout combining Grid and Flexbox:

```svelte
<div class="dashboard">
  <header class="topbar">
    <h1>Dashboard</h1>
    <div class="user">Admin</div>
  </header>

  <nav class="sidebar">
    <a href="/dashboard" class="active">Overview</a>
    <a href="/analytics">Analytics</a>
    <a href="/reports">Reports</a>
    <a href="/settings">Settings</a>
  </nav>

  <main class="main">
    <!-- Stats row -->
    <div class="stats">
      <div class="stat-card">
        <span class="stat-label">Revenue</span>
        <span class="stat-value">$42,500</span>
        <span class="stat-change positive">+12.5%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Users</span>
        <span class="stat-value">8,420</span>
        <span class="stat-change positive">+3.2%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Orders</span>
        <span class="stat-value">1,250</span>
        <span class="stat-change negative">-2.1%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Conversion</span>
        <span class="stat-value">3.6%</span>
        <span class="stat-change positive">+0.8%</span>
      </div>
    </div>

    <!-- Content panels -->
    <div class="panels">
      <div class="panel chart">
        <h3>Revenue Over Time</h3>
        <div class="chart-placeholder">Chart goes here</div>
      </div>
      <div class="panel activity">
        <h3>Recent Activity</h3>
        <ul>
          <li>New order #1234</li>
          <li>User signup: alex@example.com</li>
          <li>Payment received: $250</li>
          <li>Support ticket resolved</li>
        </ul>
      </div>
    </div>
  </main>
</div>

<style>
  .dashboard {
    display: grid;
    grid-template-areas:
      "sidebar topbar"
      "sidebar main";
    grid-template-columns: 240px 1fr;
    grid-template-rows: 60px 1fr;
    min-height: 100vh;
  }

  .topbar {
    grid-area: topbar;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    background: white;
    border-bottom: 1px solid #e2e8f0;
  }

  .topbar h1 {
    font-size: 1.2rem;
    margin: 0;
  }

  .sidebar {
    grid-area: sidebar;
    background: #1e293b;
    padding: 20px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar a {
    display: block;
    color: #94a3b8;
    text-decoration: none;
    padding: 10px 16px;
    border-radius: 6px;
    transition: all 0.2s;
  }

  .sidebar a:hover {
    background: #334155;
    color: #e2e8f0;
  }

  .sidebar a.active {
    background: #3498db;
    color: white;
  }

  .main {
    grid-area: main;
    padding: 24px;
    background: #f8fafc;
    overflow-y: auto;
  }

  /* Stats use Grid for equal-width cards */
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label { font-size: 0.85rem; color: #64748b; }
  .stat-value { font-size: 1.8rem; font-weight: 700; color: #1e293b; }
  .stat-change { font-size: 0.85rem; font-weight: 600; }
  .positive { color: #16a34a; }
  .negative { color: #dc2626; }

  /* Panels use Grid for 2/3 + 1/3 split */
  .panels {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 16px;
  }

  .panel {
    background: white;
    padding: 20px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .panel h3 {
    margin: 0 0 16px;
    font-size: 1.1rem;
    color: #1e293b;
  }

  .chart-placeholder {
    height: 250px;
    background: #f1f5f9;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
  }

  .activity ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .activity li {
    padding: 10px 0;
    border-bottom: 1px solid #f1f5f9;
    font-size: 0.9rem;
    color: #475569;
  }

  .activity li:last-child { border-bottom: none; }

  /* Responsive: collapse sidebar on small screens */
  @media (max-width: 768px) {
    .dashboard {
      grid-template-areas:
        "topbar"
        "main";
      grid-template-columns: 1fr;
    }

    .sidebar { display: none; }

    .panels {
      grid-template-columns: 1fr;
    }
  }
</style>
```

This dashboard demonstrates:
- `grid-template-areas` for the overall page structure (sidebar + topbar + main)
- Grid inside Grid: the stats section uses `auto-fit` for responsive stat cards
- Grid with explicit proportions: the panels section uses `2fr 1fr` for a chart/activity split
- Flexbox inside grid cells: the topbar uses flexbox for horizontal alignment
- Flexbox inside grid cells: stat cards use column flexbox for vertical stacking
- A responsive breakpoint that hides the sidebar on mobile and collapses the panels

## Try It

Build a "Photo Gallery" with two layout modes:

1. **Grid mode**: A responsive grid using `repeat(auto-fit, minmax(180px, 1fr))` with a `gap` of `12px`. Use at least 8 colored placeholder boxes. One item should span 2 columns and 2 rows to create a "featured" look.

2. **List mode**: A single-column layout where each item spans the full width and uses `grid-template-columns: 120px 1fr` for an image-thumbnail + text side-by-side layout.

Add a toggle button to switch between modes using a Svelte `$state` variable.

## Key Takeaways

- `display: grid` creates a two-dimensional layout — you control both rows and columns simultaneously
- `grid-template-columns` defines column sizes — use `fr` units for flexible, proportional sizing
- `grid-template-rows` defines explicit row sizes; use `grid-auto-rows` for implicit (automatically created) rows
- `repeat()` avoids typing the same track value multiple times
- `minmax()` creates tracks that adapt between a minimum and maximum size
- `auto-fit` + `minmax()` creates responsive grids that adjust column count automatically — no media queries needed
- `auto-fit` collapses empty tracks (items stretch); `auto-fill` preserves empty tracks (items stay at min size)
- Place items explicitly with `grid-column: start / end` and `grid-row: start / end`
- `span` lets items cover multiple rows or columns: `grid-column: span 2`
- `grid-template-areas` lets you name regions and build layouts visually — the most readable way to define complex layouts
- `subgrid` lets nested grids inherit parent track definitions for aligned cards and forms
- `gap` works the same way in Grid as in Flexbox
- Use Grid for page-level and two-dimensional layouts; use Flexbox for one-dimensional component-level alignment
