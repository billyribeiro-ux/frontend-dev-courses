# The Box Model

Every single HTML element on a web page is a **box**. Even if it looks like a circle, a line of text, or an oddly-shaped SVG container, the browser treats it as a rectangular box. The CSS Box Model describes the four concentric layers that make up every element, and it governs how elements take up space, how spacing works between them, and why things sometimes feel "off" by a few pixels.

Understanding the box model is not optional. It is the single most important mental model in CSS. Every layout problem, every spacing mystery, every "why is this element wider than I said it should be" question traces back to the box model. Once you internalize it, CSS goes from frustrating to predictable.

## The Four Layers

From inside to outside, every element has:

1. **Content** — The actual text, image, or child elements
2. **Padding** — Space between the content and the border (inside the box)
3. **Border** — A visible (or invisible) line around the padding
4. **Margin** — Space between this box and neighboring boxes (outside the box)

Here is a visual representation:

```
┌──────────────────────────────── margin ────────────────────────────────┐
│                                                                       │
│   ┌──────────────────────────── border ───────────────────────────┐   │
│   │                                                               │   │
│   │   ┌──────────────────────── padding ──────────────────────┐   │   │
│   │   │                                                       │   │   │
│   │   │   ┌──────────────────── content ──────────────────┐   │   │   │
│   │   │   │                                               │   │   │   │
│   │   │   │       Your text, images, children             │   │   │   │
│   │   │   │                                               │   │   │   │
│   │   │   └───────────────────────────────────────────────┘   │   │   │
│   │   │                                                       │   │   │
│   │   └───────────────────────────────────────────────────────┘   │   │
│   │                                                               │   │
│   └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

Think of it like a picture frame: the photo is the **content**, the matting around the photo is the **padding**, the frame itself is the **border**, and the wall space between frames is the **margin**.

A critical distinction: **padding is inside the box** (it gets the element's background color), while **margin is outside the box** (it is always transparent). This distinction matters more than people realize. When you set a background color on an element, the color fills the content and padding areas but stops at the border. The margin is invisible empty space.

## Seeing the Box Model in Action

```svelte
<div class="box">
  I am a box!
</div>

<style>
  .box {
    width: 200px;
    padding: 20px;
    border: 3px solid #3498db;
    margin: 30px;
    background-color: #ecf0f1;
  }
</style>
```

In this example:
- The text area (content) is `200px` wide
- There is `20px` of space inside the border (padding) on all four sides
- The border is `3px` thick, solid, and blue
- There is `30px` of space outside the border (margin) on all four sides

But here is the question that trips everyone up: **how wide is this element actually rendered on screen?** The answer depends on `box-sizing`, which we will cover shortly. Under the default (`content-box`), the total rendered width is `200 + 20 + 20 + 3 + 3 = 246px`. The margin adds another `30 + 30 = 60px` of space, but margin is not part of the element's size — it is the gap between this element and its neighbors.

## Padding Deep Dive

Padding adds space **inside** the element, between the content and the border. You can set each side individually or use shorthand:

```svelte
<div class="padded">Padding example</div>

<style>
  .padded {
    /* All four sides */
    padding: 20px;

    /* Vertical | Horizontal */
    padding: 10px 20px;

    /* Top | Horizontal | Bottom */
    padding: 10px 20px 30px;

    /* Top | Right | Bottom | Left (clockwise from top) */
    padding: 10px 20px 30px 40px;

    /* Individual sides */
    padding-top: 10px;
    padding-right: 20px;
    padding-bottom: 30px;
    padding-left: 40px;
  }
</style>
```

The clockwise shorthand (`top | right | bottom | left`) is easy to remember: start at noon and go clockwise. The two-value shorthand (`vertical | horizontal`) is the most commonly used in practice — most designs have symmetrical horizontal and vertical padding.

**Key fact:** padding cannot be negative. If you need to pull content outside its container, you need negative margin, not negative padding. Padding is always zero or positive.

**When to use padding:** use padding when you want the background color or clickable area to extend beyond the content. For example, a button needs padding so the click target is bigger than just the text. A card needs padding so content does not touch the card's border.

## Margin Deep Dive

Margin adds space **outside** the element, pushing other elements away. It uses the same shorthand patterns as padding:

```svelte
<div class="first">Box 1</div>
<div class="second">Box 2</div>

<style>
  .first {
    margin-bottom: 20px;
    background: #3498db;
    color: white;
    padding: 16px;
  }

  .second {
    margin-top: 10px;
    background: #e74c3c;
    color: white;
    padding: 16px;
  }
</style>
```

**Critical question:** what is the gap between these two boxes? You might expect `20px + 10px = 30px`. But the actual gap is `20px`. This is called **margin collapse**, and it is arguably the most confusing behavior in CSS. We will cover it in detail below.

**Negative margins** are valid and surprisingly useful. A negative margin pulls the element (or its neighbors) closer:

```svelte
<div class="overlap-demo">
  <div class="card">Card 1</div>
  <div class="card overlap">Card 2 (overlapping)</div>
</div>

<style>
  .overlap-demo {
    padding: 20px;
  }

  .card {
    background: #3498db;
    color: white;
    padding: 20px;
    border-radius: 8px;
  }

  .overlap {
    margin-top: -15px;
    background: #e74c3c;
    position: relative;
  }
</style>
```

**Centering with `margin: 0 auto`:** this is the classic technique for centering a block element horizontally. It only works when the element has a defined `width` (or `max-width`), because `auto` tells the browser to split the remaining space equally between left and right margins:

```svelte
<div class="centered">I am centered!</div>

<style>
  .centered {
    width: 300px;
    margin: 0 auto;
    background: #2ecc71;
    color: white;
    padding: 16px;
    text-align: center;
  }
</style>
```

If you omit the `width`, the block element fills its parent's full width, so there is no remaining space to distribute. The `auto` has nothing to work with, and centering does not happen.

## Margin Collapse — The Most Confusing CSS Behavior

Margin collapse is the single most misunderstood behavior in CSS. Here is a thorough explanation.

**The rule:** when the vertical margins of two block-level elements touch, they **collapse** into a single margin equal to the larger of the two. They do not add together.

### Case 1: Adjacent siblings

```svelte
<div class="a">A (margin-bottom: 30px)</div>
<div class="b">B (margin-top: 20px)</div>

<style>
  .a {
    margin-bottom: 30px;
    background: #3498db;
    color: white;
    padding: 12px;
  }

  .b {
    margin-top: 20px;
    background: #e74c3c;
    color: white;
    padding: 12px;
  }
</style>
```

The gap between A and B is `30px`, not `50px`. The `30px` margin and the `20px` margin collapse, and the larger one (30px) wins.

### Case 2: Parent and first/last child

This one surprises people. If a parent has no padding, no border, and no content before its first child, the child's top margin collapses *through* the parent:

```svelte
<div class="parent">
  <div class="child">I have a 30px top margin</div>
</div>

<style>
  .parent {
    background: #ecf0f1;
    /* No padding or border on top! */
  }

  .child {
    margin-top: 30px;
    background: #3498db;
    color: white;
    padding: 12px;
  }
</style>
```

The `30px` margin appears *above* the parent, not inside it. The parent's top margin and the child's top margin have nothing separating them (no padding, no border), so they collapse.

**How to prevent it:** add any of these to the parent:
- `padding-top: 1px` (or any value)
- `border-top: 1px solid transparent`
- `overflow: hidden` or `overflow: auto`
- `display: flow-root` (the modern, purpose-built solution)

```svelte
<div class="parent-fixed">
  <div class="child">Now the margin is inside the parent</div>
</div>

<style>
  .parent-fixed {
    background: #ecf0f1;
    display: flow-root; /* Creates a new block formatting context */
  }

  .child {
    margin-top: 30px;
    background: #3498db;
    color: white;
    padding: 12px;
  }
</style>
```

### Case 3: Empty elements

An element with no content, no padding, and no border has its own top and bottom margins collapse into a single margin.

### When margins do NOT collapse

- **Horizontal margins** never collapse — only vertical ones
- **Floated elements** — margins adjacent to floats do not collapse
- **Absolutely or fixedly positioned elements** — they are out of flow
- **Flex items and grid items** — margins of flex/grid children never collapse
- **Elements with `overflow` other than `visible`** — they create a new block formatting context

The flex/grid exception is why many developers unknowingly avoid margin collapse in modern layouts. If you use flexbox for everything, you rarely encounter collapsing margins, but when you do encounter it in normal flow, it can be baffling.

## Border

Borders sit between padding and margin. They have three properties: width, style, and color:

```svelte
<div class="bordered">Styled borders</div>

<style>
  .bordered {
    /* Shorthand: width style color */
    border: 2px solid #333;

    /* Individual properties */
    border-width: 2px;
    border-style: solid; /* solid, dashed, dotted, double, groove, ridge, inset, outset, none */
    border-color: #333;

    /* Individual sides */
    border-top: 3px solid #e74c3c;
    border-bottom: 1px dashed #ccc;

    /* Round the corners */
    border-radius: 8px;

    /* Fully round (circle for square elements) */
    /* border-radius: 50%; */

    /* Asymmetric rounding */
    /* border-radius: 20px 8px 20px 8px; */

    padding: 16px;
  }
</style>
```

**`border-radius` does not require a border.** You can round the corners of an element's background without having a visible border. This is a common source of confusion — `border-radius` is really "corner-radius" despite its name.

## Outline vs Border

Outlines look similar to borders but behave differently:

```svelte
<button class="outline-demo">Focus me</button>

<style>
  .outline-demo {
    padding: 12px 24px;
    border: 2px solid #3498db;
    background: white;
    cursor: pointer;
  }

  .outline-demo:focus-visible {
    outline: 3px solid #f39c12;
    outline-offset: 3px;
  }
</style>
```

Key differences:
- **Border** is part of the box model — it takes up space and affects layout
- **Outline** does not take up space — it is drawn on top of the element without affecting layout
- **Outline** cannot have rounded corners in older browsers (modern browsers follow `border-radius`)
- **Outline** cannot have different sides — it is always the same on all four sides
- **Outline** has `outline-offset` to add space between the outline and the border

**When to use which:** use `border` for visual design (card edges, dividers, decorative effects). Use `outline` for focus indicators (accessibility). Never remove `outline` on interactive elements without providing an alternative focus indicator.

## The box-sizing Fix

By default, `width` only sets the content width. Padding and border are added **on top**, making the element bigger than you specified. This is the `content-box` model, and it is universally considered a mistake in the CSS specification.

```
/* content-box (the frustrating default) */
width: 300px
+ padding-left: 20px
+ padding-right: 20px
+ border-left: 2px
+ border-right: 2px
= 344px actual rendered width  ← NOT what you wanted
```

The fix is `box-sizing: border-box`, which makes `width` include padding and border:

```
/* border-box (what you actually want) */
width: 300px
padding and border are INSIDE the 300px
= 300px actual rendered width  ← Exactly what you said
```

```svelte
<div class="predictable">I am exactly 300px wide!</div>

<style>
  .predictable {
    box-sizing: border-box;
    width: 300px;
    padding: 20px;
    border: 5px solid #9b59b6;
    background: #f4f4f4;
  }
</style>
```

Every professional project applies this globally. This is the most important three lines of CSS you will ever write:

```css
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

Including `::before` and `::after` ensures pseudo-elements also use `border-box`. Without this, pseudo-elements inherit the default `content-box`, which can cause subtle sizing issues.

## The display Property

The `display` property controls two things: **how the element participates in its parent's layout** (outer display type) and **how the element's children are laid out** (inner display type). Here is a comprehensive breakdown:

### block

Block elements take the full width available, start on a new line, and respect all box model properties:

```svelte
<div class="block-demo">I fill the full width</div>
<p class="block-demo">So do I</p>

<style>
  .block-demo {
    background: #3498db;
    color: white;
    padding: 8px;
    margin-bottom: 4px;
  }
</style>
```

Default block elements: `<div>`, `<p>`, `<h1>`-`<h6>`, `<section>`, `<article>`, `<header>`, `<footer>`, `<ul>`, `<ol>`, `<li>`, `<form>`, `<blockquote>`.

### inline

Inline elements only take as much width as their content, sit on the same line as surrounding content, and **ignore top/bottom margin and width/height**:

```svelte
<p>
  This is a paragraph with <span class="highlight">inline elements</span> inside it.
  They flow <em class="highlight">with the text</em>.
</p>

<style>
  .highlight {
    background: #f1c40f;
    padding: 2px 6px;
    /* width: 200px;  ← This would be IGNORED on inline elements */
    /* margin-top: 20px; ← This would also be IGNORED */
  }
</style>
```

Default inline elements: `<span>`, `<a>`, `<strong>`, `<em>`, `<code>`, `<img>` (technically inline-replaced), `<input>`.

### inline-block

The best of both worlds. Inline-block elements flow inline (they sit side by side) but respect all box model properties like width, height, and vertical margin/padding:

```svelte
<nav>
  <a class="nav-link" href="/">Home</a>
  <a class="nav-link" href="/about">About</a>
  <a class="nav-link" href="/contact">Contact</a>
</nav>

<style>
  .nav-link {
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

**The whitespace gotcha:** inline-block elements respect whitespace in your HTML. If you have line breaks between elements, there will be small gaps between them. This is not a bug — the browser treats the whitespace as a text node. Flexbox and grid do not have this issue, which is one reason they replaced inline-block for layout.

### none

Completely removes the element from the layout. It is not rendered, takes no space, and is invisible to screen readers. Compare with `visibility: hidden`, which hides the element visually but still takes up space:

```svelte
<p class="visible">You can see me</p>
<p class="gone">I am removed from layout entirely</p>
<p class="invisible">I am invisible but still take up space</p>
<p class="visible">I appear right after the first paragraph</p>

<style>
  .visible { background: #2ecc71; color: white; padding: 8px; }
  .gone { display: none; }
  .invisible { visibility: hidden; padding: 8px; }
</style>
```

### contents

`display: contents` makes the element itself disappear from the layout tree, but its children remain. The element's box is "unwrapped":

```svelte
<div class="grid-container">
  <div class="wrapper">
    <div class="item">A</div>
    <div class="item">B</div>
  </div>
  <div class="item">C</div>
</div>

<style>
  .grid-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .wrapper {
    display: contents;
    /* The wrapper disappears — A and B become direct grid children */
  }

  .item {
    background: #3498db;
    color: white;
    padding: 16px;
    text-align: center;
  }
</style>
```

This is useful when you need a semantic wrapper (for accessibility or component structure) but do not want it to interfere with a parent grid or flex layout.

## Overflow and Scrolling

When content is bigger than its container, the `overflow` property controls what happens:

```svelte
<div class="overflow-demo">
  <p>This container has a fixed height but lots of content that will not fit.
  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod
  tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam,
  quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo
  consequat.</p>
</div>

<style>
  .overflow-demo {
    height: 100px;
    width: 250px;
    border: 2px solid #333;
    padding: 12px;

    /* overflow: visible;  ← Default: content spills out */
    /* overflow: hidden;   ← Content is clipped */
    overflow: auto;         /* ← Scrollbar appears only when needed */
    /* overflow: scroll;   ← Scrollbar always visible */
  }
</style>
```

You can control horizontal and vertical overflow independently:

```css
.container {
  overflow-x: hidden;  /* No horizontal scroll */
  overflow-y: auto;    /* Vertical scroll when needed */
}
```

**`overflow: hidden` creates a new block formatting context.** This is a side effect that prevents margin collapse and contains floats. Some developers use it for this purpose, but `display: flow-root` is more explicit.

**Scrollbar styling** is possible with vendor-specific pseudo-elements, but the modern approach is `scrollbar-width` and `scrollbar-color`:

```css
.scrollable {
  scrollbar-width: thin;
  scrollbar-color: #888 #f1f1f1;
}
```

## Logical Properties

Traditional CSS uses physical directions: `top`, `right`, `bottom`, `left`. But in right-to-left (RTL) languages like Arabic or Hebrew, "left" and "right" need to swap. **Logical properties** use `inline` (the text direction axis) and `block` (the perpendicular axis) instead:

```svelte
<div class="logical-demo">
  <p>This card uses logical properties for proper internationalization.</p>
</div>

<style>
  .logical-demo {
    /* Instead of margin-left / margin-right */
    margin-inline: auto;

    /* Instead of margin-top / margin-bottom */
    margin-block: 1rem;

    /* Instead of padding-left / padding-right */
    padding-inline: 1.5rem;

    /* Instead of padding-top / padding-bottom */
    padding-block: 1rem;

    /* Instead of border-left */
    border-inline-start: 4px solid #3498db;

    /* Instead of width / height */
    inline-size: 400px;   /* replaces width in LTR */
    block-size: auto;     /* replaces height */

    /* Instead of max-width */
    max-inline-size: 100%;

    background: #f8f9fa;
    border-radius: 8px;
  }
</style>
```

Mapping table for reference:

| Physical Property | Logical Property | Axis |
|---|---|---|
| `margin-left` | `margin-inline-start` | Inline |
| `margin-right` | `margin-inline-end` | Inline |
| `margin-top` | `margin-block-start` | Block |
| `margin-bottom` | `margin-block-end` | Block |
| `padding-left` / `padding-right` | `padding-inline` | Inline |
| `padding-top` / `padding-bottom` | `padding-block` | Block |
| `width` | `inline-size` | Inline |
| `height` | `block-size` | Block |
| `border-left` | `border-inline-start` | Inline |
| `top` | `inset-block-start` | Block |
| `left` | `inset-inline-start` | Inline |

Even if you never build an RTL application, logical properties are worth adopting. They make your CSS more intentional — when you write `margin-block-end`, you are saying "space after this in the reading direction," which conveys meaning better than `margin-bottom`.

## Debugging the Box Model with DevTools

Every browser's DevTools has a box model visualizer. Here is how to use it:

1. **Right-click any element** and select "Inspect"
2. In the **Elements** panel, look for the **Computed** tab (Chrome) or **Box Model** section
3. You will see the four layers rendered as nested rectangles with pixel values for each side
4. **Hover over elements** in the Elements panel — the browser highlights the content (blue), padding (green), border (yellow/brown), and margin (orange) directly on the page

**Diagnosing common issues:**

- **Element wider than expected?** Check if `box-sizing` is `content-box`. Look at the computed width and compare to your declared width.
- **Unexpected gap between elements?** Look at margins. Check for margin collapse.
- **Background not extending to the edge?** You might have padding where you expect none, or the background is clipped by `overflow`.
- **Click target too small?** The element probably needs more padding.

```svelte
<!-- A debugging trick: temporarily add outlines to see all boxes -->
<div class="debug-layout">
  <header>Header</header>
  <main>Main content</main>
  <footer>Footer</footer>
</div>

<style>
  /* Temporary debug styles — outlines don't affect layout */
  .debug-layout * {
    outline: 1px solid red;
  }
</style>
```

Using `outline` instead of `border` for debugging is important because outlines do not affect layout. Adding a border would change element sizes and potentially shift your layout, masking the very problem you are trying to diagnose.

## Spacing Systems

Professional designs use consistent spacing values rather than arbitrary pixel amounts. A spacing scale creates visual rhythm and makes your UI feel cohesive:

```svelte
<div class="card-list">
  <article class="card">
    <h3 class="card-title">Getting Started</h3>
    <p class="card-body">Learn the fundamentals of building modern web applications.</p>
    <footer class="card-footer">
      <span class="tag">Beginner</span>
      <a href="/read" class="card-link">Read more</a>
    </footer>
  </article>

  <article class="card">
    <h3 class="card-title">Advanced Patterns</h3>
    <p class="card-body">Deep dive into production architecture and performance.</p>
    <footer class="card-footer">
      <span class="tag">Advanced</span>
      <a href="/read" class="card-link">Read more</a>
    </footer>
  </article>
</div>

<style>
  .card-list {
    /* Use a spacing scale: 4, 8, 12, 16, 24, 32, 48, 64 */
    --space-xs: 0.25rem;  /* 4px */
    --space-sm: 0.5rem;   /* 8px */
    --space-md: 1rem;     /* 16px */
    --space-lg: 1.5rem;   /* 24px */
    --space-xl: 2rem;     /* 32px */
    --space-2xl: 3rem;    /* 48px */

    display: flex;
    gap: var(--space-lg);
    padding: var(--space-xl);
  }

  .card {
    flex: 1;
    padding: var(--space-lg);
    border: 1px solid hsl(210, 15%, 85%);
    border-radius: 8px;
    background: white;
  }

  .card-title {
    margin: 0 0 var(--space-sm) 0;
    font-size: 1.25rem;
  }

  .card-body {
    margin: 0 0 var(--space-md) 0;
    color: hsl(210, 10%, 45%);
    line-height: 1.6;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-top: var(--space-md);
    border-top: 1px solid hsl(210, 15%, 90%);
  }

  .tag {
    padding: var(--space-xs) var(--space-sm);
    background: hsl(210, 80%, 95%);
    color: hsl(210, 80%, 40%);
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .card-link {
    color: hsl(210, 80%, 50%);
    text-decoration: none;
    font-weight: 500;
  }

  .card-link:hover {
    text-decoration: underline;
  }
</style>
```

**Why spacing scales work:** humans are naturally good at detecting when spacing is inconsistent. Using values from a predefined scale (like multiples of 4px or 8px) ensures everything lines up visually, even when different developers are working on different components. Most design systems (Tailwind, Material, Primer) use a 4px or 8px base scale.

## Complete Layout Example

Here is a complete example that brings together all the box model concepts — padding, margin, border, box-sizing, overflow, and spacing:

```svelte
<div class="pricing-page">
  <h2 class="pricing-title">Choose Your Plan</h2>
  <div class="pricing-grid">
    <div class="pricing-card">
      <div class="card-header basic">
        <h3>Basic</h3>
        <p class="price">$9<span>/mo</span></p>
      </div>
      <ul class="features">
        <li>5 Projects</li>
        <li>10GB Storage</li>
        <li>Email Support</li>
      </ul>
      <button class="cta">Get Started</button>
    </div>

    <div class="pricing-card featured">
      <div class="badge">Most Popular</div>
      <div class="card-header pro">
        <h3>Pro</h3>
        <p class="price">$29<span>/mo</span></p>
      </div>
      <ul class="features">
        <li>Unlimited Projects</li>
        <li>100GB Storage</li>
        <li>Priority Support</li>
        <li>API Access</li>
      </ul>
      <button class="cta primary">Get Started</button>
    </div>

    <div class="pricing-card">
      <div class="card-header enterprise">
        <h3>Enterprise</h3>
        <p class="price">$99<span>/mo</span></p>
      </div>
      <ul class="features">
        <li>Unlimited Everything</li>
        <li>1TB Storage</li>
        <li>24/7 Phone Support</li>
        <li>Custom Integrations</li>
        <li>SLA Guarantee</li>
      </ul>
      <button class="cta">Contact Sales</button>
    </div>
  </div>
</div>

<style>
  .pricing-page {
    --space-sm: 0.5rem;
    --space-md: 1rem;
    --space-lg: 1.5rem;
    --space-xl: 2rem;

    max-width: 900px;
    margin: 0 auto;
    padding: var(--space-xl);
  }

  .pricing-title {
    text-align: center;
    margin-block-end: var(--space-xl);
    font-size: 2rem;
  }

  .pricing-grid {
    display: flex;
    gap: var(--space-lg);
    align-items: start;
  }

  .pricing-card {
    box-sizing: border-box;
    flex: 1;
    border: 2px solid hsl(210, 15%, 85%);
    border-radius: 12px;
    overflow: hidden; /* Clips the colored header to the border-radius */
    position: relative;
    background: white;
  }

  .pricing-card.featured {
    border-color: hsl(210, 80%, 55%);
    transform: scale(1.05);
  }

  .badge {
    position: absolute;
    top: -1px;
    right: -1px;
    background: hsl(210, 80%, 55%);
    color: white;
    padding: 4px 16px;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 0 10px 0 8px;
  }

  .card-header {
    padding: var(--space-xl) var(--space-lg);
    text-align: center;
    color: white;
  }

  .card-header.basic { background: hsl(210, 15%, 30%); }
  .card-header.pro { background: hsl(210, 80%, 55%); }
  .card-header.enterprise { background: hsl(260, 50%, 45%); }

  .card-header h3 {
    margin: 0 0 var(--space-sm) 0;
    font-size: 1.25rem;
  }

  .price {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
  }

  .price span {
    font-size: 1rem;
    font-weight: 400;
    opacity: 0.8;
  }

  .features {
    list-style: none;
    padding: var(--space-lg);
    margin: 0;
  }

  .features li {
    padding-block: var(--space-sm);
    border-block-end: 1px solid hsl(210, 15%, 92%);
  }

  .features li:last-child {
    border-block-end: none;
  }

  .cta {
    display: block;
    inline-size: calc(100% - var(--space-lg) * 2);
    margin: 0 var(--space-lg) var(--space-lg);
    padding: var(--space-md);
    border: 2px solid hsl(210, 15%, 75%);
    border-radius: 8px;
    background: white;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }

  .cta:hover {
    background: hsl(210, 15%, 95%);
  }

  .cta.primary {
    background: hsl(210, 80%, 55%);
    color: white;
    border-color: hsl(210, 80%, 55%);
  }

  .cta.primary:hover {
    background: hsl(210, 80%, 48%);
  }
</style>
```

This example demonstrates:
- `box-sizing: border-box` so widths are predictable
- `overflow: hidden` on the card to clip the colored header to the card's border-radius
- `position: relative` / `position: absolute` for the "Most Popular" badge
- Logical properties (`margin-block-end`, `padding-block`, `inline-size`, `border-block-end`)
- A consistent spacing scale via CSS custom properties
- Negative margin trick on the badge (`top: -1px; right: -1px`) to align with the card's border

## Try It

**Exercise 1: Card Grid with Spacing Scale**

Create a set of three "pricing cards" side by side, each with:
- A different background color for the card header
- `20px` of padding inside
- A `2px` solid border with rounded corners (`border-radius: 12px`)
- `16px` of margin between cards (hint: use `gap` on a flex container)
- Use `box-sizing: border-box` on all of them
- A "Most Popular" badge positioned absolutely in the top-right corner of one card

**Exercise 2: Margin Collapse Investigation**

Create three `<div>` elements stacked vertically:
- First div: `margin-bottom: 40px`
- Second div: `margin-top: 25px` and `margin-bottom: 35px`
- Third div: `margin-top: 20px`

Predict the gap between the first and second div, and between the second and third. Then check in the browser. Now wrap them in a flex container (`display: flex; flex-direction: column`) and observe how the spacing changes (flex items do not collapse margins).

**Exercise 3: Logical Properties Conversion**

Take the pricing card example above and convert ALL physical properties (`margin-top`, `padding-left`, `border-bottom`, `width`, `height`) to their logical equivalents. Test with `dir="rtl"` on the parent element and verify the layout flips correctly.

## Key Takeaways

- Every HTML element is a box with four layers: content, padding, border, and margin
- **Padding** is space inside the border (gets the background color), **margin** is space outside the border (always transparent)
- Always use `box-sizing: border-box` globally — it makes `width` include padding and border, which is what you actually want
- **Margin collapse** only affects vertical margins of block-level elements in normal flow. Flex items, grid items, floats, and elements with overflow other than `visible` do not collapse
- **Outline** does not affect layout (use for focus indicators); **border** does (use for visual design)
- `overflow: auto` adds scrollbars only when needed; `overflow: hidden` clips and creates a new block formatting context
- `display: contents` unwraps an element's box, letting its children participate in the parent layout
- **Logical properties** (`margin-inline`, `padding-block`, `inline-size`) replace physical properties for better internationalization
- Use a **spacing scale** (multiples of 4px or 8px) for consistent, professional-feeling layouts
- Debug layout issues with DevTools' box model visualizer — and use `outline` (not `border`) for temporary debug styling
