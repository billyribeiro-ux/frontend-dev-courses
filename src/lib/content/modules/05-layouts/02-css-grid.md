# CSS Grid

While Flexbox is great for one-dimensional layouts (a row or a column), **CSS Grid** is designed for two-dimensional layouts — rows **and** columns at the same time. Think photo galleries, dashboard layouts, and magazine-style designs.

Grid and Flexbox are not competitors — they are teammates. You will often use Grid for the overall page layout and Flexbox for smaller components inside the grid cells.

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
  }
</style>
```

This creates a 3-column grid. The `1fr` unit means "one fraction of the available space" — so three `1fr` columns share the space equally.

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

## The repeat() Function

When you have many identical columns, use `repeat()` instead of typing the same value over and over:

```svelte
<style>
  .grid {
    display: grid;

    /* Instead of: 1fr 1fr 1fr 1fr */
    grid-template-columns: repeat(4, 1fr);

    gap: 12px;
  }
</style>
```

## auto-fit and minmax: Responsive Grids

This is where Grid really shines. `auto-fit` with `minmax()` creates a grid that automatically adjusts the number of columns based on available space:

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

## Grid Areas: Naming Your Layout

For complex page layouts, you can name each section and arrange them visually:

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

Reading the `grid-template-areas` value is like looking at a tiny map of your page layout!

## Try It

Build a "Photo Gallery" component with:
- A `display: grid` container
- Use `repeat(auto-fit, minmax(180px, 1fr))` for responsive columns
- A `gap` of `12px`
- At least 8 colored placeholder boxes (or images) inside
- Try resizing the preview to see the grid adapt

## Key Takeaways

- `display: grid` creates a two-dimensional layout (rows and columns)
- `grid-template-columns` defines column sizes — use `fr` units for flexible sizing
- `repeat()` avoids typing the same value multiple times
- `auto-fit` + `minmax()` creates responsive grids that adjust automatically
- `grid-template-areas` lets you name regions and build layouts visually
- `gap` works the same way in Grid as in Flexbox
- Use Grid for page-level layouts and Flexbox for component-level alignment
