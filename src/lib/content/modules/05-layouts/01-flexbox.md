# Flexbox

Remember struggling with `display: inline-block` and `float` to put things side by side? **Flexbox** makes all of that effortless. It is a one-dimensional layout system that lets you arrange items in a row or column, control spacing, and align everything perfectly — all with a few CSS properties.

Flexbox is the most important CSS layout tool you will learn. Developers use it every single day for navbars, card grids, centering content, and building entire page layouts. Once it clicks, you will wonder how anyone built websites without it.

## How Flexbox Works

Flexbox has two roles: the **flex container** (the parent) and **flex items** (the children). You turn on Flexbox by adding `display: flex` to the parent:

```svelte
<div class="container">
  <div class="item">1</div>
  <div class="item">2</div>
  <div class="item">3</div>
</div>

<style>
  .container {
    display: flex;
  }

  .item {
    padding: 16px 24px;
    background: #3498db;
    color: white;
    border-radius: 4px;
  }
</style>
```

Just adding `display: flex` makes the children sit in a horizontal row. That is the default behavior.

## flex-direction

Control whether items flow horizontally or vertically:

```svelte
<div class="row">
  <div class="box">A</div>
  <div class="box">B</div>
  <div class="box">C</div>
</div>

<div class="column">
  <div class="box">A</div>
  <div class="box">B</div>
  <div class="box">C</div>
</div>

<style>
  .row {
    display: flex;
    flex-direction: row; /* Default — items go left to right */
  }

  .column {
    display: flex;
    flex-direction: column; /* Items stack top to bottom */
  }

  .box {
    padding: 12px 20px;
    background: #2c3e50;
    color: white;
    border-radius: 4px;
  }
</style>
```

## justify-content: Main Axis Alignment

`justify-content` controls how items are distributed along the main axis (horizontal for row, vertical for column):

```svelte
<div class="spread">
  <div class="box">1</div>
  <div class="box">2</div>
  <div class="box">3</div>
</div>

<style>
  .spread {
    display: flex;
    justify-content: space-between;
    /* Other values:
       flex-start    — pack items to the start (default)
       flex-end      — pack items to the end
       center        — center all items
       space-between — equal space between items
       space-around  — equal space around items
       space-evenly  — equal space between and around
    */
  }

  .box {
    padding: 12px 20px;
    background: #e74c3c;
    color: white;
    border-radius: 4px;
  }
</style>
```

## align-items: Cross Axis Alignment

`align-items` controls alignment on the cross axis (vertical for row, horizontal for column):

```svelte
<div class="aligned">
  <div class="tall">Tall</div>
  <div class="short">Short</div>
  <div class="medium">Medium</div>
</div>

<style>
  .aligned {
    display: flex;
    align-items: center;
    height: 200px;
    background: #f0f0f0;
    /* Other values:
       stretch    — items stretch to fill (default)
       flex-start — align to top
       flex-end   — align to bottom
       center     — vertically center
    */
  }

  .tall { padding: 40px 20px; background: #3498db; color: white; }
  .short { padding: 10px 20px; background: #e74c3c; color: white; }
  .medium { padding: 25px 20px; background: #2ecc71; color: white; }
</style>
```

## gap

The `gap` property adds space **between** flex items without using margins:

```svelte
<div class="gapped">
  <div class="box">1</div>
  <div class="box">2</div>
  <div class="box">3</div>
</div>

<style>
  .gapped {
    display: flex;
    gap: 16px; /* 16px between each item */
  }

  .box {
    padding: 16px 24px;
    background: #8e44ad;
    color: white;
    border-radius: 4px;
  }
</style>
```

## flex-wrap

By default, flex items squeeze onto one line. Use `flex-wrap: wrap` to let them wrap to the next line:

```svelte
<div class="wrapping">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
  <div class="card">Card 4</div>
  <div class="card">Card 5</div>
</div>

<style>
  .wrapping {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
  }

  .card {
    padding: 20px;
    background: #1abc9c;
    color: white;
    border-radius: 8px;
    min-width: 150px;
    flex: 1;
  }
</style>
```

## Building a Navbar

Flexbox is perfect for navigation bars. Here is a practical example:

```svelte
<nav class="navbar">
  <div class="logo">MySite</div>
  <div class="links">
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/projects">Projects</a>
    <a href="/contact">Contact</a>
  </div>
</nav>

<style>
  .navbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: #2c3e50;
  }

  .logo {
    font-size: 1.4rem;
    font-weight: bold;
    color: white;
  }

  .links {
    display: flex;
    gap: 24px;
  }

  .links a {
    color: #ecf0f1;
    text-decoration: none;
  }

  .links a:hover {
    color: #3498db;
  }
</style>
```

## The Perfect Centering Trick

The most common CSS question ever: "How do I center a div?" With Flexbox, it is two lines:

```svelte
<div class="center-everything">
  <p>I am perfectly centered!</p>
</div>

<style>
  .center-everything {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 300px;
    background: #34495e;
    color: white;
    border-radius: 8px;
  }
</style>
```

## Try It

Build a navigation bar component with:
- A logo on the left and links on the right (use `justify-content: space-between`)
- Links displayed in a row with `gap` between them
- Vertically centered items with `align-items: center`
- Hover effects on the links

## Key Takeaways

- `display: flex` turns a container into a flex container, arranging children in a row
- `flex-direction` switches between row (horizontal) and column (vertical)
- `justify-content` distributes items along the main axis (e.g., `space-between`, `center`)
- `align-items` aligns items on the cross axis (e.g., `center`, `stretch`)
- `gap` adds space between items without needing margin
- `flex-wrap: wrap` allows items to flow onto multiple lines
- Flexbox makes centering trivial: `justify-content: center` + `align-items: center`
