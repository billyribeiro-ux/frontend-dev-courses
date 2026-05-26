# Layout Basics

So far you know how to style individual elements, but how do you control where they appear on the page? Why do some elements stack on top of each other while others sit side by side? Why does adding `z-index: 9999` sometimes do absolutely nothing? The answer lies in the **display** and **position** properties, and in understanding **stacking contexts**.

These properties are the foundation of all CSS layout. Modern tools like Flexbox and Grid (covered in the next module) build on top of these fundamentals. If you skip this chapter, Flexbox and Grid will feel like magic — sometimes working, sometimes not, and you will not know why.

## A Brief History of CSS Layout

Understanding where we came from helps you understand why CSS layout works the way it does:

1. **Tables (1996)** — Developers used `<table>` elements to create multi-column layouts. It worked, but it mixed content with presentation and was inaccessible.
2. **Floats (2000s)** — `float: left` was designed for text wrapping around images, but developers co-opted it for page layout. It required "clearfix" hacks and was fragile.
3. **Inline-block (2005+)** — A step up from floats, but struggled with whitespace issues and vertical alignment.
4. **Flexbox (2012)** — Purpose-built for one-dimensional layout (rows or columns). The first truly intuitive layout system.
5. **Grid (2017)** — Purpose-built for two-dimensional layout (rows AND columns simultaneously). The most powerful layout system CSS has ever had.
6. **Subgrid (2023)** — Allows nested grids to inherit track definitions from parent grids. Solves the "alignment across nested components" problem.

Today, you should use **Flexbox** for one-dimensional layout, **Grid** for two-dimensional layout, and **positioning** for elements that need to break out of normal document flow. Floats should only be used for their original purpose: wrapping text around images.

## The display Property

Every HTML element has a default `display` value. The two most common are **block** and **inline**:

**Block elements** take up the full width available and start on a new line:
- `<div>`, `<h1>`-`<h6>`, `<p>`, `<ul>`, `<section>`, `<header>`, `<footer>`, `<article>`, `<form>`

**Inline elements** only take up as much width as their content and sit side by side:
- `<span>`, `<a>`, `<strong>`, `<em>`, `<code>`, `<img>`, `<input>`, `<button>`

```svelte
<div class="block-example">I am a block element (full width)</div>
<div class="block-example">I am another block element (new line)</div>

<span class="inline-example">I am inline</span>
<span class="inline-example">I sit next to you</span>

<style>
  .block-example {
    background: #3498db;
    color: white;
    padding: 8px;
    margin-bottom: 4px;
  }

  .inline-example {
    background: #e74c3c;
    color: white;
    padding: 4px 8px;
  }
</style>
```

## Changing display Values

You can override the default display behavior of any element:

```svelte
<a class="nav-link" href="/">Home</a>
<a class="nav-link" href="/about">About</a>
<a class="nav-link" href="/contact">Contact</a>

<style>
  .nav-link {
    /* Make inline <a> tags behave like blocks that flow inline */
    display: inline-block;
    padding: 12px 24px;
    background: #2c3e50;
    color: white;
    text-decoration: none;
    border-radius: 4px;
    margin: 4px;
  }
</style>
```

Here is a comprehensive reference:

| Value | Behavior | Width | Respects margin/padding | New line? |
|-------|----------|-------|-------------------------|-----------|
| `block` | Full width, block-level | Parent width | Yes, all sides | Yes |
| `inline` | Content width, inline | Content width | Horizontal only | No |
| `inline-block` | Content width, block box | Content width | Yes, all sides | No |
| `none` | Removed from layout entirely | N/A | N/A | N/A |
| `contents` | Box removed, children remain | N/A | N/A | N/A |
| `flex` | Block-level flex container | Parent width | Yes, all sides | Yes |
| `inline-flex` | Inline-level flex container | Content width | Yes, all sides | No |
| `grid` | Block-level grid container | Parent width | Yes, all sides | Yes |
| `inline-grid` | Inline-level grid container | Content width | Yes, all sides | No |
| `flow-root` | Block-level, new BFC | Parent width | Yes, all sides | Yes |

## Hiding Elements: display none vs visibility hidden vs opacity 0

There are three ways to "hide" an element, and they behave very differently:

```svelte
<div class="demo">
  <p class="visible">Visible element</p>
  <p class="display-none">display: none (removed from layout)</p>
  <p class="visibility-hidden">visibility: hidden (invisible but takes space)</p>
  <p class="opacity-zero">opacity: 0 (invisible, takes space, still interactive)</p>
  <p class="visible">After the hidden elements</p>
</div>

<style>
  .visible { background: #2ecc71; color: white; padding: 8px; }

  .display-none {
    display: none;
    /* Completely gone — no space, no events, invisible to screen readers */
  }

  .visibility-hidden {
    visibility: hidden;
    /* Invisible but STILL occupies space in the layout */
    /* Not interactive, not announced by screen readers */
  }

  .opacity-zero {
    opacity: 0;
    /* Invisible but STILL occupies space AND is still clickable! */
    /* Screen readers still announce it */
  }
</style>
```

| Property | Takes space? | Clickable? | Screen reader? | Animatable? |
|---|---|---|---|---|
| `display: none` | No | No | No | No |
| `visibility: hidden` | Yes | No | No | Yes (visibility toggles) |
| `opacity: 0` | Yes | Yes | Yes | Yes (fades) |

**When to use which:**
- `display: none` — for content that should not exist in the current state (tabs not selected, conditional UI)
- `visibility: hidden` — for content that should be hidden but whose space must be preserved (preventing layout shifts)
- `opacity: 0` — for elements you want to fade in/out with CSS transitions

## The position Property

The `position` property controls how an element is placed in the document. It is one of the most powerful and most misunderstood CSS properties.

### static (default)

Elements flow normally in the document. `top`, `right`, `bottom`, `left`, and `z-index` have **no effect** on statically positioned elements:

```css
.normal {
  position: static; /* This is the default — you rarely need to write this */
}
```

### relative

The element stays in its normal position in the flow, but you can **nudge** it with `top`, `right`, `bottom`, and `left`. The important detail: the space it originally occupied is preserved — other elements do not move to fill the gap.

```svelte
<div class="box">Normal position</div>
<div class="box nudged">Nudged 10px down, 20px right</div>
<div class="box">I don't move — the nudged box's original space is preserved</div>

<style>
  .box {
    background: #3498db;
    color: white;
    padding: 12px;
    margin-bottom: 4px;
  }

  .nudged {
    position: relative;
    top: 10px;
    left: 20px;
    background: #f39c12;
  }
</style>
```

The primary use of `position: relative` is not for nudging — it is to **create a positioning context for absolutely positioned children**. This is the most important use case by far.

### absolute

The element is **removed from normal flow** (other elements act as if it does not exist) and positioned relative to its nearest ancestor that has `position` set to anything other than `static`. If no such ancestor exists, it positions relative to the initial containing block (essentially the viewport).

```svelte
<div class="parent">
  <div class="badge">NEW</div>
  <h2>Product Card</h2>
  <p>A great product you should buy.</p>
</div>

<style>
  .parent {
    position: relative;  /* This creates the positioning context */
    border: 2px solid #ccc;
    padding: 24px;
    border-radius: 8px;
  }

  .badge {
    position: absolute;
    top: -10px;
    right: -10px;
    background: #e74c3c;
    color: white;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.8rem;
    font-weight: bold;
  }
</style>
```

**The key pattern:** set `position: relative` on the parent (creating a positioning context without moving it), then use `position: absolute` on the child to place it exactly where you want.

**Absolute positioning with `inset`:** the `inset` shorthand sets `top`, `right`, `bottom`, and `left` in one declaration. Combined with `margin: auto`, it provides a powerful centering technique:

```svelte
<div class="overlay-container">
  <div class="overlay">
    <p>This overlay is centered in its parent using absolute + inset + auto margin</p>
  </div>
</div>

<style>
  .overlay-container {
    position: relative;
    height: 300px;
    background: #ecf0f1;
    border-radius: 8px;
  }

  .overlay {
    position: absolute;
    inset: 0;          /* top: 0; right: 0; bottom: 0; left: 0 */
    margin: auto;
    width: 200px;
    height: 150px;
    background: white;
    border-radius: 8px;
    padding: 24px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    text-align: center;
  }
</style>
```

### fixed

Like `absolute`, but positions relative to the **viewport**. The element stays in place even when the page scrolls. Common uses: sticky headers, floating action buttons, modals.

```svelte
<button class="fab">+</button>

<style>
  .fab {
    position: fixed;
    bottom: 24px;
    right: 24px;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: #e74c3c;
    color: white;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    z-index: 100;
    /* This button stays in the bottom-right corner no matter how far you scroll */
  }
</style>
```

**Gotcha:** `position: fixed` does not always position relative to the viewport. If any ancestor has a `transform`, `filter`, or `perspective` property, the fixed element positions relative to that ancestor instead. This catches people off guard when they add a subtle CSS transform to a parent and suddenly their fixed header scrolls with the page.

### sticky

A hybrid of `relative` and `fixed`. The element scrolls normally until it hits a specified threshold, then it "sticks" in place:

```svelte
<div class="scroll-container">
  <section>
    <h2 class="sticky-header">Section 1</h2>
    <p>Content for section 1...</p>
    <p>More content...</p>
    <p>Even more content...</p>
  </section>
  <section>
    <h2 class="sticky-header">Section 2</h2>
    <p>Content for section 2...</p>
    <p>More content...</p>
    <p>Even more content...</p>
  </section>
  <section>
    <h2 class="sticky-header">Section 3</h2>
    <p>Content for section 3...</p>
    <p>More content...</p>
    <p>Even more content...</p>
  </section>
</div>

<style>
  .sticky-header {
    position: sticky;
    top: 0;
    background: white;
    padding: 12px 0;
    border-bottom: 2px solid #3498db;
    z-index: 10;
    /* Sticks to the top of its scrolling container */
  }

  section {
    padding-bottom: 2rem;
  }
</style>
```

**Why sticky sometimes doesn't work:**

1. **No `top`, `bottom`, `left`, or `right` specified.** Sticky requires at least one of these to know where to stick.
2. **Parent has `overflow: hidden` or `overflow: auto`.** Sticky only works within the nearest scrolling ancestor. If a parent clips overflow, the element sticks relative to that parent, which may not be what you expect.
3. **Parent has insufficient height.** If the parent is only as tall as the sticky element, there is no room to scroll and nothing to "stick" against.

## Stacking Context and z-index

`z-index` controls the front-to-back ordering of overlapping elements. But it only works on **positioned** elements (anything with `position` other than `static`) and on flex/grid children.

### The basics

```svelte
<div class="stack-demo">
  <div class="box red">z-index: 3</div>
  <div class="box blue">z-index: 1</div>
  <div class="box green">z-index: 2</div>
</div>

<style>
  .stack-demo {
    position: relative;
    height: 200px;
  }

  .box {
    position: absolute;
    width: 150px;
    height: 150px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    border-radius: 8px;
  }

  .red   { background: #e74c3c; top: 0; left: 0; z-index: 3; }
  .blue  { background: #3498db; top: 30px; left: 30px; z-index: 1; }
  .green { background: #2ecc71; top: 60px; left: 60px; z-index: 2; }
</style>
```

### Stacking contexts — why z-index "doesn't work"

Here is the part that confuses everyone. `z-index` does not create a global ordering. Each element with certain properties creates a **stacking context** — a self-contained z-index system. Elements inside a stacking context are z-ordered relative to *each other*, and the entire stacking context is z-ordered as a single unit relative to its siblings.

**What creates a new stacking context:**
- `position: relative/absolute/fixed/sticky` with a `z-index` value other than `auto`
- `opacity` less than 1
- `transform` other than `none`
- `filter` other than `none`
- `isolation: isolate`
- `will-change` with certain values
- Flex/grid children with `z-index` other than `auto`

```svelte
<!-- Why z-index: 9999 sometimes does nothing -->
<div class="parent-a">
  <div class="child-high">z-index: 9999 (inside parent A)</div>
</div>
<div class="parent-b">
  <div class="child-low">z-index: 1 (inside parent B)</div>
</div>

<style>
  .parent-a {
    position: relative;
    z-index: 1;  /* Creates a stacking context with z-index: 1 */
  }

  .parent-b {
    position: relative;
    z-index: 2;  /* Creates a stacking context with z-index: 2 */
  }

  .child-high {
    position: absolute;
    z-index: 9999;
    /* This is z-index 9999 WITHIN parent-a's stacking context.
       But parent-a itself is z-index: 1, which is less than
       parent-b's z-index: 2. So child-high is BEHIND child-low. */
    background: #e74c3c;
    color: white;
    padding: 12px;
  }

  .child-low {
    position: relative;
    z-index: 1;
    background: #3498db;
    color: white;
    padding: 12px;
  }
</style>
```

**The mental model:** think of stacking contexts as layers in Photoshop. Elements within a group are ordered within that group, but the group itself has a single position in the layer stack. No matter how high you set an element's z-index within a group, it cannot escape above the group.

**The `isolation: isolate` trick:** when you want to create a stacking context without side effects, use `isolation: isolate`. It does nothing visual but creates a new stacking context, keeping z-index contained:

```css
.component-root {
  isolation: isolate;
  /* All z-index values inside this component are now self-contained.
     They cannot leak out and interfere with other components. */
}
```

This is a best practice for component-based architectures. Set `isolation: isolate` on each component's root element and you never get z-index collisions between components.

## Centering — The Definitive Guide

Centering in CSS has been a long-running joke, but modern CSS makes it straightforward. Here is every technique, when to use it, and why:

### Horizontal centering of block elements

```css
.centered {
  width: 300px;      /* Must have a defined width */
  margin-inline: auto; /* Auto distributes remaining space equally */
}
```

### Horizontal centering of inline/text content

```css
.text-centered {
  text-align: center;
}
```

### Vertical and horizontal centering with Flexbox (the go-to)

```svelte
<div class="flex-center">
  <div class="centered-box">Perfectly centered</div>
</div>

<style>
  .flex-center {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    background: #ecf0f1;
    border-radius: 8px;
  }

  .centered-box {
    background: #3498db;
    color: white;
    padding: 24px;
    border-radius: 8px;
  }
</style>
```

This is the technique you should reach for 90% of the time. It is simple, flexible, and works for any size content.

### Centering with Grid (even simpler)

```svelte
<div class="grid-center">
  <div class="centered-box">Also perfectly centered</div>
</div>

<style>
  .grid-center {
    display: grid;
    place-items: center;
    min-height: 300px;
    background: #ecf0f1;
    border-radius: 8px;
  }

  .centered-box {
    background: #e74c3c;
    color: white;
    padding: 24px;
    border-radius: 8px;
  }
</style>
```

`place-items: center` is shorthand for `align-items: center` + `justify-items: center`. Two lines of CSS, perfectly centered. This is the modern answer to the centering question.

### Centering with absolute positioning

```css
.absolute-center {
  position: absolute;
  inset: 0;
  margin: auto;
  width: 200px;
  height: 150px;
  /* Works because auto margin distributes remaining space when inset constrains all edges */
}
```

### Centering a single child with margin auto in flex

```css
.flex-parent { display: flex; }
.only-child { margin: auto; }
/* auto margin in flex absorbs all available space in all directions */
```

**When to use which:**

| Scenario | Technique |
|---|---|
| Center a block element horizontally | `margin-inline: auto` with a defined width |
| Center text inside an element | `text-align: center` |
| Center anything inside a container | `display: grid; place-items: center` or Flexbox |
| Center within an absolutely positioned context | `inset: 0; margin: auto` with defined dimensions |
| Center a page layout wrapper | `max-width: 1200px; margin-inline: auto` |

## The aspect-ratio Property

The `aspect-ratio` property maintains an element's proportions without the old "padding-bottom hack":

```svelte
<div class="video-container">
  <iframe src="https://www.youtube.com/embed/abc123" title="Video"></iframe>
</div>

<div class="square-card">
  <p>Always a perfect square</p>
</div>

<style>
  .video-container {
    aspect-ratio: 16 / 9;
    width: 100%;
    background: black;
    border-radius: 8px;
    overflow: hidden;
  }

  .video-container iframe {
    width: 100%;
    height: 100%;
    border: none;
  }

  .square-card {
    aspect-ratio: 1;       /* 1:1 — a perfect square */
    width: 200px;
    background: #3498db;
    color: white;
    display: grid;
    place-items: center;
    border-radius: 8px;
  }
</style>
```

`aspect-ratio` works on any element. It sets the preferred aspect ratio, which the browser uses to compute the missing dimension. If both `width` and `height` are set, `aspect-ratio` is ignored.

## When to Use Flexbox vs Grid vs Positioning

This decision framework will save you time:

**Use Flexbox when:**
- You have a row OR a column of items (one-dimensional)
- You need items to wrap to the next line
- You want items to grow/shrink to fill available space
- Navigation bars, button groups, card rows, form layouts

**Use Grid when:**
- You need rows AND columns (two-dimensional)
- You want a structured page layout (header, sidebar, content, footer)
- You need items to align across both axes
- You want items to span multiple rows or columns
- Dashboard layouts, image galleries, page-level structure

**Use Positioning when:**
- An element needs to break out of normal flow
- Tooltips, modals, badges, floating action buttons
- Sticky headers
- Overlays and popups

**Use normal flow when:**
- Content should flow naturally (article text, sequential sections)
- Simplicity is the goal — do not add layout complexity unless you need it

## Complete Page Layout

Here is a complete page layout combining positioning, centering, and all the concepts from this lesson:

```svelte
<div class="page">
  <header class="header">
    <div class="header-content">
      <a href="/" class="logo">Acme Co</a>
      <nav class="nav">
        <a href="/" class="nav-link">Home</a>
        <a href="/products" class="nav-link">Products</a>
        <a href="/about" class="nav-link">About</a>
        <a href="/contact" class="nav-link">Contact</a>
      </nav>
    </div>
  </header>

  <main class="main">
    <aside class="sidebar">
      <ul class="sidebar-nav">
        <li><a href="/docs/intro">Introduction</a></li>
        <li><a href="/docs/setup">Setup</a></li>
        <li><a href="/docs/basics">Basics</a></li>
        <li><a href="/docs/advanced">Advanced</a></li>
      </ul>
    </aside>

    <article class="content">
      <h1>Getting Started</h1>
      <p>Welcome to the documentation. This page layout uses position sticky
         for the header and sidebar, flexbox for the horizontal arrangement
         of sidebar and content, and margin auto for centering the header content.</p>

      <div class="info-box">
        <div class="info-icon">i</div>
        <p>This info box uses position relative/absolute for the icon badge.</p>
      </div>
    </article>
  </main>

  <footer class="footer">
    <p>Built with SvelteKit</p>
  </footer>

  <button class="scroll-top" aria-label="Scroll to top">
    &#8593;
  </button>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  /* Sticky header */
  .header {
    position: sticky;
    top: 0;
    z-index: 50;
    background: hsl(220, 25%, 12%);
    border-bottom: 1px solid hsl(220, 25%, 20%);
  }

  .header-content {
    max-width: 1200px;
    margin-inline: auto;
    padding: 0 1.5rem;
    height: 3.5rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .logo {
    color: white;
    text-decoration: none;
    font-weight: 700;
    font-size: 1.125rem;
  }

  .nav { display: flex; gap: 0.25rem; }

  .nav-link {
    display: inline-block;
    padding: 0.5rem 1rem;
    color: hsl(220, 15%, 75%);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.875rem;
    transition: color 0.15s, background 0.15s;
  }

  .nav-link:hover {
    color: white;
    background: hsl(220, 25%, 20%);
  }

  /* Sidebar + content layout */
  .main {
    flex: 1;
    display: flex;
    max-width: 1200px;
    margin-inline: auto;
    width: 100%;
    padding: 0 1.5rem;
  }

  .sidebar {
    width: 220px;
    flex-shrink: 0;
    padding: 1.5rem 1.5rem 1.5rem 0;
    position: sticky;
    top: 3.5rem;        /* Below the header */
    height: fit-content;
    /* Sidebar sticks below the header while content scrolls */
  }

  .sidebar-nav {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .sidebar-nav li {
    margin-bottom: 0.25rem;
  }

  .sidebar-nav a {
    display: block;
    padding: 0.5rem 0.75rem;
    color: hsl(210, 10%, 40%);
    text-decoration: none;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .sidebar-nav a:hover {
    background: hsl(210, 20%, 95%);
    color: hsl(210, 80%, 45%);
  }

  .content {
    flex: 1;
    padding: 1.5rem 0 3rem 1.5rem;
    border-left: 1px solid hsl(210, 15%, 90%);
    min-width: 0; /* Prevents flex child from overflowing */
  }

  .content h1 {
    margin-top: 0;
    margin-bottom: 1rem;
  }

  .content p {
    line-height: 1.7;
    color: hsl(210, 10%, 30%);
    margin-bottom: 1.5rem;
  }

  /* Info box with positioned icon */
  .info-box {
    position: relative;
    background: hsl(210, 80%, 96%);
    border: 1px solid hsl(210, 80%, 85%);
    border-radius: 8px;
    padding: 1rem 1rem 1rem 3rem;
  }

  .info-icon {
    position: absolute;
    left: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    background: hsl(210, 80%, 55%);
    color: white;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.875rem;
  }

  .info-box p {
    margin: 0;
    font-size: 0.875rem;
    color: hsl(210, 50%, 30%);
  }

  /* Footer */
  .footer {
    background: hsl(220, 25%, 12%);
    color: hsl(220, 15%, 65%);
    text-align: center;
    padding: 1.5rem;
    font-size: 0.875rem;
  }

  /* Fixed scroll-to-top button */
  .scroll-top {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: none;
    background: hsl(210, 80%, 55%);
    color: white;
    font-size: 1.25rem;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    z-index: 100;
    transition: background 0.15s;
  }

  .scroll-top:hover {
    background: hsl(210, 80%, 45%);
  }
</style>
```

This layout demonstrates:
- **Sticky header** that stays at the top on scroll
- **Sticky sidebar** that sticks below the header (notice `top: 3.5rem` matches the header height)
- **Flexbox** for horizontal sidebar + content layout
- **Auto margin** for centering the header content within its max-width
- **Absolute positioning** for the info box icon
- **Fixed positioning** for the scroll-to-top button
- **`z-index`** on the header and button to ensure they stay above content
- **`min-width: 0`** on the flex child to prevent text overflow (a common flex gotcha)

## display: contents for Wrapper-Free Styling

Sometimes your component structure requires wrapper elements that interfere with layout. `display: contents` removes the wrapper's box while keeping its children:

```svelte
<!-- Without display: contents, the wrapper breaks the grid -->
<div class="grid">
  <div class="item">A</div>
  <div class="component-wrapper">
    <!-- This wrapper would normally create a single grid item -->
    <div class="item">B</div>
    <div class="item">C</div>
  </div>
  <div class="item">D</div>
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .component-wrapper {
    display: contents;
    /* B and C now participate directly in the parent grid,
       as if the wrapper did not exist */
  }

  .item {
    background: #3498db;
    color: white;
    padding: 16px;
    text-align: center;
    border-radius: 4px;
  }
</style>
```

**Accessibility warning:** `display: contents` removes the element from the accessibility tree in some browsers. Avoid using it on elements with semantic roles (like `<section>`, `<article>`, `<ul>`).

## Try It

**Exercise 1: Product Card with Badge**

Create a "Product Card" component with:
- A wrapper div with `position: relative`
- An absolutely positioned "Sale" badge in the top-right corner
- Use `inline-block` to place two cards next to each other
- Center the cards on the page with `margin-inline: auto` on a wrapper

**Exercise 2: Sticky Section Headers**

Create a page with five sections, each with a sticky header that:
- Sticks to the top when scrolling past its section
- Has a background color and z-index so content scrolls behind it
- Gets replaced by the next section's header as you scroll

**Exercise 3: Full Page Layout**

Build a complete page layout with:
- A fixed navigation bar at the top (using `position: sticky`)
- A sidebar on the left that sticks below the header
- A main content area that scrolls
- A footer at the bottom that appears after all content
- A floating action button (fixed) in the bottom-right corner
- Use `isolation: isolate` on each major section to contain z-index values

## Key Takeaways

- **Block** elements stack vertically and take full width; **inline** elements flow with text and ignore vertical margins
- `inline-block` gives inline flow with block-level box model (respects all margins and dimensions)
- `display: none` removes from layout; `visibility: hidden` hides but preserves space; `opacity: 0` hides but remains interactive
- `position: relative` creates a positioning context; `position: absolute` positions within it
- `position: sticky` is a hybrid — scrolls normally until a threshold, then sticks
- `position: fixed` positions relative to the viewport, except when an ancestor has `transform` or `filter`
- **Stacking contexts** are self-contained z-index systems — `z-index: 9999` inside a low-z-index parent is still behind a higher-z-index sibling
- Use `isolation: isolate` on component roots to contain z-index and prevent cross-component conflicts
- **Centering:** `margin-inline: auto` for horizontal blocks, `display: grid; place-items: center` for anything in a container
- `aspect-ratio` replaces the old padding-bottom hack for maintaining proportions
- Use Flexbox for one-dimensional layout, Grid for two-dimensional, and positioning for elements that break out of flow
- `display: contents` removes an element's box but keeps its children in the layout — useful for component wrappers
