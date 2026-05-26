# Flexbox

Remember struggling with `display: inline-block` and `float` to put things side by side? **Flexbox** makes all of that effortless. It is a one-dimensional layout system that lets you arrange items in a row or column, control spacing, and align everything perfectly — all with a few CSS properties.

Flexbox is the most important CSS layout tool you will learn. Developers use it every single day for navbars, card grids, centering content, and building entire page layouts. Once it clicks, you will wonder how anyone built websites without it.

## The Mental Model: One Axis at a Time

Flexbox works on a single axis at a time. You choose either a **row** (horizontal) or **column** (vertical) as the **main axis**. The other direction automatically becomes the **cross axis**.

This distinction matters because every flexbox property relates to one of these axes:

- **Main axis** properties: `justify-content`, `flex-grow`, `flex-shrink`, `flex-basis`, `order`
- **Cross axis** properties: `align-items`, `align-self`, `align-content`

When you change `flex-direction`, the axes swap — and so does the behavior of every alignment property. This is the single most confusing thing about flexbox. Once you internalize "main axis vs cross axis," everything falls into place.

```
flex-direction: row (default)
┌─────────────────────────────────────────┐
│  Main axis →                            │
│  ┌─────┐  ┌─────┐  ┌─────┐            │ ↕ Cross axis
│  │  A  │  │  B  │  │  C  │            │
│  └─────┘  └─────┘  └─────┘            │
└─────────────────────────────────────────┘

flex-direction: column
┌─────────────┐
│  Main axis ↓│
│  ┌─────┐    │
│  │  A  │    │ ← Cross axis →
│  └─────┘    │
│  ┌─────┐    │
│  │  B  │    │
│  └─────┘    │
│  ┌─────┐    │
│  │  C  │    │
│  └─────┘    │
└─────────────┘
```

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

Just adding `display: flex` makes the children sit in a horizontal row. That is the default behavior. The children become flex items — they no longer behave like normal block elements.

**What changes when an element becomes a flex item:**
- It no longer takes the full width of its parent (block elements normally do)
- It shrinks to fit its content (unless you tell it otherwise)
- Vertical margins no longer collapse
- `float` and `clear` have no effect
- It can be reordered visually without changing HTML order

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
    gap: 8px;
    margin-bottom: 16px;
  }

  .column {
    display: flex;
    flex-direction: column; /* Items stack top to bottom */
    gap: 8px;
  }

  .box {
    padding: 12px 20px;
    background: #2c3e50;
    color: white;
    border-radius: 4px;
  }
</style>
```

The four values:
- `row` (default) — left to right
- `row-reverse` — right to left
- `column` — top to bottom
- `column-reverse` — bottom to top

**Production tip**: `row-reverse` and `column-reverse` reverse the visual order but not the DOM order. Screen readers still read elements in DOM order. Never use reverse directions to reorder content — use them only for visual effects where reading order does not matter.

## justify-content: Main Axis Alignment

`justify-content` controls how items are distributed along the main axis (horizontal for row, vertical for column):

```svelte
<script>
  let justify = $state('flex-start');
  const options = ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'];
</script>

<div class="demo" style:justify-content={justify}>
  <div class="box">1</div>
  <div class="box">2</div>
  <div class="box">3</div>
</div>

<div class="controls">
  {#each options as option}
    <label>
      <input type="radio" bind:group={justify} value={option} />
      {option}
    </label>
  {/each}
</div>

<style>
  .demo {
    display: flex;
    padding: 16px;
    background: #f0f0f0;
    border-radius: 8px;
    min-height: 80px;
  }

  .box {
    padding: 12px 20px;
    background: #e74c3c;
    color: white;
    border-radius: 4px;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-top: 12px;
  }

  label { cursor: pointer; }
</style>
```

Here is what each value does:

| Value | Behavior |
|---|---|
| `flex-start` | Pack items to the start (default) |
| `flex-end` | Pack items to the end |
| `center` | Center all items |
| `space-between` | Equal space *between* items, no space at edges |
| `space-around` | Equal space *around* each item (half-size space at edges) |
| `space-evenly` | Truly equal space everywhere, including edges |

**When to use which**: `space-between` is the most common — it pushes the first item to the start and the last to the end, distributing the rest evenly. Perfect for navbars (logo left, links right) and card layouts. `center` is for centering content. `space-evenly` is for even spacing when edge gaps matter (like icon toolbars).

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
    border-radius: 8px;
    gap: 12px;
    padding: 12px;
    /* Other values:
       stretch    — items stretch to fill container height (default)
       flex-start — align to top
       flex-end   — align to bottom
       center     — vertically center
       baseline   — align text baselines
    */
  }

  .tall   { padding: 40px 20px; background: #3498db; color: white; border-radius: 4px; }
  .short  { padding: 10px 20px; background: #e74c3c; color: white; border-radius: 4px; }
  .medium { padding: 25px 20px; background: #2ecc71; color: white; border-radius: 4px; }
</style>
```

**The `stretch` default is important to understand.** When you do not set `align-items`, flex items stretch to fill the container's cross axis dimension. In a row layout, this means all items become the same height as the tallest item. This is actually useful — it gives you equal-height columns for free.

**`baseline` alignment**: Aligns items so their text baselines line up. Crucial when items have different padding or font sizes but you want the text to appear on the same line:

```svelte
<div class="baseline-demo">
  <span class="big">Title</span>
  <span class="small">Subtitle</span>
  <span class="tiny">Caption</span>
</div>

<style>
  .baseline-demo {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }

  .big   { font-size: 2rem; padding: 20px; background: #eee; }
  .small { font-size: 1rem; padding: 10px; background: #ddd; }
  .tiny  { font-size: 0.75rem; padding: 5px; background: #ccc; }
</style>
```

## align-self: Per-Item Override

While `align-items` applies to all children, `align-self` lets a single item override its alignment:

```svelte
<div class="container">
  <div class="item">Default</div>
  <div class="item self-end">align-self: flex-end</div>
  <div class="item">Default</div>
  <div class="item self-center">align-self: center</div>
</div>

<style>
  .container {
    display: flex;
    align-items: flex-start;
    height: 200px;
    gap: 12px;
    background: #f0f0f0;
    padding: 12px;
    border-radius: 8px;
  }

  .item {
    padding: 12px 16px;
    background: #3498db;
    color: white;
    border-radius: 4px;
  }

  .self-end    { align-self: flex-end; }
  .self-center { align-self: center; }
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

  /* You can also set row and column gaps separately: */
  /* gap: 16px 24px; — 16px row gap, 24px column gap */

  .box {
    padding: 16px 24px;
    background: #8e44ad;
    color: white;
    border-radius: 4px;
  }
</style>
```

**Why `gap` is better than margins**: With margins, you have to deal with the extra margin on the first/last item. Classic approaches like `margin-right: 16px` on all items plus `margin-right: 0` on the last child, or negative margins on the container, are fragile hacks. `gap` only creates space *between* items — never at the edges.

## flex-wrap

By default, flex items squeeze onto one line, shrinking until they cannot shrink further. Use `flex-wrap: wrap` to let them wrap to the next line:

```svelte
<div class="wrapping">
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
  <div class="card">Card 4</div>
  <div class="card">Card 5</div>
  <div class="card">Card 6</div>
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

**`flex-wrap: wrap` combined with `flex: 1`** is a powerful pattern. Each item tries to grow to fill available space (`flex: 1`), but wraps when there is not enough room (`min-width: 150px` ensures each item is at least 150px). The result is a responsive grid-like layout with no media queries.

## flex-grow, flex-shrink, and flex-basis

These three properties control how items share space. They are the most nuanced part of flexbox.

**`flex-basis`** — The starting size of an item before growing or shrinking. Think of it as "the ideal size if there is exactly enough space":

```css
.item { flex-basis: 200px; } /* Start at 200px, then grow/shrink */
.item { flex-basis: auto; }  /* Use the item's content size or width */
.item { flex-basis: 0; }     /* Start from nothing, let flex-grow distribute all space */
```

**`flex-grow`** — How much an item should grow relative to other items when there is extra space. Default is `0` (do not grow):

```svelte
<div class="grow-demo">
  <div class="item" style="flex-grow: 1;">1</div>
  <div class="item" style="flex-grow: 2;">2 (grows 2x)</div>
  <div class="item" style="flex-grow: 1;">1</div>
</div>

<style>
  .grow-demo {
    display: flex;
    gap: 8px;
  }

  .item {
    padding: 16px;
    background: #3498db;
    color: white;
    border-radius: 4px;
    text-align: center;
  }
</style>
```

**`flex-shrink`** — How much an item should shrink relative to other items when space runs out. Default is `1` (shrink equally):

```css
.sidebar {
  flex-shrink: 0; /* Never shrink — critical for fixed-width sidebars */
  width: 250px;
}

.content {
  flex-shrink: 1; /* Allow shrinking */
}
```

## The `flex` Shorthand

Instead of setting all three separately, use the `flex` shorthand:

```css
/* flex: grow shrink basis */
.item { flex: 0 1 auto; }   /* Default: don't grow, can shrink, size from content */
.item { flex: 1; }           /* Shorthand for: flex: 1 1 0 — grow equally, basis 0 */
.item { flex: auto; }        /* Shorthand for: flex: 1 1 auto — grow equally, basis from content */
.item { flex: none; }        /* Shorthand for: flex: 0 0 auto — rigid, no grow/shrink */
```

**`flex: 1` is the most common value.** It makes items grow equally to fill available space, with `flex-basis: 0` meaning all space is distributed proportionally (not just leftover space).

**`flex: 1` vs `flex: auto`**: With `flex: 1` (basis 0), items share space equally regardless of content. With `flex: auto` (basis auto), items first get space for their content, then leftover space is shared equally. Use `flex: 1` for equal columns; use `flex: auto` when content size should influence sizing.

## The `order` Property

Change the visual order of items without changing the HTML:

```svelte
<div class="reordered">
  <div class="item" style="order: 3;">First in HTML</div>
  <div class="item" style="order: 1;">Second in HTML</div>
  <div class="item" style="order: 2;">Third in HTML</div>
</div>

<style>
  .reordered {
    display: flex;
    gap: 8px;
  }

  .item {
    padding: 16px;
    background: #2c3e50;
    color: white;
    border-radius: 4px;
    flex: 1;
    text-align: center;
  }
</style>
```

**Accessibility warning**: `order` only changes visual order — screen readers still follow DOM order. Use it for minor visual tweaks, not for rearranging content that users read sequentially.

## Flexbox Gotchas

**`min-width: 0` on flex items**: By default, flex items will not shrink below their minimum content size (the widest word or replaced element). If text overflows its flex container, add `min-width: 0` to allow shrinking past the content size:

```svelte
<div class="overflow-demo">
  <div class="text-item">
    This is a really long text that should truncate with an ellipsis
  </div>
  <div class="fixed">Fixed</div>
</div>

<style>
  .overflow-demo {
    display: flex;
    gap: 12px;
    width: 300px;
    background: #f0f0f0;
    padding: 8px;
    border-radius: 4px;
  }

  .text-item {
    min-width: 0; /* Allow shrinking past content size */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 8px;
    background: white;
    border-radius: 4px;
  }

  .fixed {
    flex-shrink: 0;
    padding: 8px 16px;
    background: #3498db;
    color: white;
    border-radius: 4px;
  }
</style>
```

Without `min-width: 0`, the text would push the container wider instead of truncating.

**`flex-basis` vs `width`**: When you set both, `flex-basis` wins in flex layout. Use `flex-basis` for flex items and `width` for non-flex elements to keep your intention clear.

**Margin auto trick**: In flexbox, `margin: auto` absorbs all available space in that direction. This is incredibly powerful:

```svelte
<nav class="navbar">
  <a href="/">Logo</a>
  <a href="/about">About</a>
  <a href="/contact">Contact</a>
  <a href="/login" class="push-right">Login</a>
</nav>

<style>
  .navbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 24px;
    background: #2c3e50;
  }

  .navbar a { color: white; text-decoration: none; }

  .push-right {
    margin-left: auto; /* Pushes this item (and everything after) to the right */
  }
</style>
```

## Common Layout Patterns

### Navbar

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
    transition: color 0.2s;
  }

  .links a:hover {
    color: #3498db;
  }
</style>
```

### Sidebar Layout

```svelte
<div class="layout">
  <aside class="sidebar">
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
      <a href="/profile">Profile</a>
    </nav>
  </aside>
  <main class="content">
    <h1>Main Content</h1>
    <p>The sidebar stays fixed width. The content fills the rest.</p>
  </main>
</div>

<style>
  .layout {
    display: flex;
    min-height: 100vh;
  }

  .sidebar {
    width: 250px;
    flex-shrink: 0; /* Don't let the sidebar shrink */
    background: #1e293b;
    padding: 20px;
  }

  .sidebar a {
    display: block;
    color: #94a3b8;
    text-decoration: none;
    padding: 10px 12px;
    border-radius: 6px;
    margin-bottom: 4px;
  }

  .sidebar a:hover {
    background: #334155;
    color: white;
  }

  .content {
    flex: 1; /* Fill remaining space */
    padding: 24px;
  }
</style>
```

### Holy Grail Layout

The classic three-column layout with header and footer:

```svelte
<div class="holy-grail">
  <header>Header</header>
  <div class="body">
    <nav class="left">Left Nav</nav>
    <main>Main Content</main>
    <aside class="right">Right Sidebar</aside>
  </div>
  <footer>Footer</footer>
</div>

<style>
  .holy-grail {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header, footer {
    padding: 16px 24px;
    background: #2c3e50;
    color: white;
  }

  .body {
    display: flex;
    flex: 1; /* Fills remaining vertical space */
  }

  .left {
    width: 200px;
    flex-shrink: 0;
    background: #34495e;
    color: white;
    padding: 16px;
  }

  main {
    flex: 1;
    padding: 24px;
  }

  .right {
    width: 200px;
    flex-shrink: 0;
    background: #ecf0f1;
    padding: 16px;
  }
</style>
```

### Perfect Centering

The most common CSS question ever: "How do I center a div?" With Flexbox, it is two lines:

```svelte
<div class="center-everything">
  <div class="centered-box">
    <h2>Perfectly Centered</h2>
    <p>Both horizontally and vertically.</p>
  </div>
</div>

<style>
  .center-everything {
    display: flex;
    justify-content: center; /* Horizontal center */
    align-items: center;     /* Vertical center */
    height: 400px;
    background: #34495e;
    border-radius: 8px;
  }

  .centered-box {
    text-align: center;
    color: white;
  }
</style>
```

### Card Row with Equal Heights

```svelte
<div class="card-row">
  <div class="card">
    <h3>Short Card</h3>
    <p>Just one line.</p>
  </div>
  <div class="card">
    <h3>Tall Card</h3>
    <p>This card has more content which makes it taller than the others.</p>
    <p>But all cards match its height thanks to flex stretch.</p>
  </div>
  <div class="card">
    <h3>Medium Card</h3>
    <p>Two lines of content here.</p>
  </div>
</div>

<style>
  .card-row {
    display: flex;
    gap: 16px;
    /* align-items defaults to stretch — all cards same height */
  }

  .card {
    flex: 1;
    padding: 20px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    /* Use flex column inside for footer alignment: */
    display: flex;
    flex-direction: column;
  }

  .card p:last-child {
    margin-top: auto; /* Pushes to the bottom of the card */
  }
</style>
```

## Tailwind Flex Utilities

If you use Tailwind CSS, here are the equivalent utility classes:

```html
<!-- display: flex -->
<div class="flex">

<!-- flex-direction -->
<div class="flex flex-row">      <!-- default -->
<div class="flex flex-col">      <!-- column -->
<div class="flex flex-row-reverse">

<!-- justify-content -->
<div class="flex justify-start">
<div class="flex justify-center">
<div class="flex justify-between">
<div class="flex justify-evenly">

<!-- align-items -->
<div class="flex items-start">
<div class="flex items-center">
<div class="flex items-stretch">
<div class="flex items-baseline">

<!-- gap -->
<div class="flex gap-4">        <!-- 16px -->
<div class="flex gap-x-4 gap-y-2">

<!-- flex-wrap -->
<div class="flex flex-wrap">

<!-- flex grow/shrink/basis -->
<div class="flex-1">            <!-- flex: 1 1 0 -->
<div class="flex-auto">         <!-- flex: 1 1 auto -->
<div class="flex-none">         <!-- flex: 0 0 auto -->
<div class="grow">              <!-- flex-grow: 1 -->
<div class="shrink-0">          <!-- flex-shrink: 0 -->

<!-- Practical navbar in Tailwind -->
<nav class="flex justify-between items-center px-6 py-4 bg-slate-800">
  <span class="text-white font-bold text-xl">Logo</span>
  <div class="flex gap-6">
    <a class="text-slate-300 hover:text-white" href="/">Home</a>
    <a class="text-slate-300 hover:text-white" href="/about">About</a>
  </div>
</nav>
```

## Try It

Build two components:

1. **Navigation Bar**: A responsive navbar with a logo on the left, navigation links centered, and a "Sign In" button pushed to the far right using `margin-left: auto`. Use `gap` for spacing between links and `align-items: center` for vertical alignment.

2. **Card Grid**: A wrapping card layout using `display: flex`, `flex-wrap: wrap`, and `flex: 1` on each card with a `min-width` of `280px`. Each card should have a title, description, and a "Read More" button. Use `flex-direction: column` inside each card and `margin-top: auto` on the button to push it to the bottom, so all buttons align even when cards have different amounts of text.

## Key Takeaways

- `display: flex` turns a container into a flex container, arranging children along a main axis
- **Main axis** (`justify-content`) and **cross axis** (`align-items`) are the two dimensions you control
- `flex-direction` switches between row (horizontal) and column (vertical) — and swaps which axis is "main"
- `justify-content: space-between` is the workhorse for navbars and distributed layouts
- `align-items: center` vertically centers items; `stretch` (default) gives equal heights
- `gap` adds space between items cleanly — no margin hacks needed
- `flex-wrap: wrap` allows items to flow onto multiple lines for responsive layouts
- `flex: 1` makes items grow equally; `flex-shrink: 0` prevents important elements from shrinking
- The `flex` shorthand (`flex: grow shrink basis`) is preferred over setting the three properties individually
- `min-width: 0` on flex items allows them to shrink past their content size for text truncation
- `margin-left: auto` (or any `margin: auto` in flex) absorbs available space — perfect for pushing items
- Flexbox makes centering trivial: `justify-content: center` + `align-items: center`
