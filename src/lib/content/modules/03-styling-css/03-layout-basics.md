# Layout Basics

So far you know how to style individual elements, but how do you control where they appear on the page? Why do some elements stack on top of each other while others sit side by side? The answer lies in the **display** and **position** properties.

These two properties are the foundation of all CSS layout. Understanding them now will make Flexbox and Grid (coming next module) much easier to learn.

## The display Property

Every HTML element has a default `display` value. The two most common are **block** and **inline**:

**Block elements** take up the full width available and start on a new line:
- `<div>`, `<h1>`-`<h6>`, `<p>`, `<ul>`, `<section>`, `<header>`

**Inline elements** only take up as much width as their content and sit side by side:
- `<span>`, `<a>`, `<strong>`, `<em>`, `<img>`

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
    /* Make inline <a> tags behave like blocks */
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

| Value | Behavior |
|-------|----------|
| `block` | Full width, new line |
| `inline` | Content width, same line, ignores top/bottom margin |
| `inline-block` | Content width, same line, respects all margin/padding |
| `none` | Completely hidden from the page |

## Hiding Elements with display: none

Sometimes you want to hide an element entirely. `display: none` removes it from the layout as if it does not exist:

```svelte
<p class="visible">You can see me!</p>
<p class="hidden">You cannot see me.</p>
<p class="visible">I appear right after the first paragraph.</p>

<style>
  .visible {
    background: #2ecc71;
    color: white;
    padding: 8px;
  }

  .hidden {
    display: none;
  }
</style>
```

## The position Property

The `position` property controls how an element is placed in the document. The three most useful values are:

### static (default)

Elements flow normally in the document. You rarely need to set this explicitly:

```css
.normal {
  position: static; /* This is the default */
}
```

### relative

The element stays in its normal position, but you can **nudge** it with `top`, `right`, `bottom`, and `left`:

```svelte
<div class="nudged">I am nudged 10px down and 20px right</div>

<style>
  .nudged {
    position: relative;
    top: 10px;
    left: 20px;
    background: #f39c12;
    padding: 12px;
    display: inline-block;
  }
</style>
```

The original space the element occupied is preserved — other elements do not move.

### absolute

The element is removed from the normal flow and positioned relative to its nearest positioned ancestor (or the page if none exists):

```svelte
<div class="parent">
  <div class="badge">NEW</div>
  <h2>Product Card</h2>
  <p>A great product you should buy.</p>
</div>

<style>
  .parent {
    position: relative;
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

The key pattern: set `position: relative` on the parent, then use `position: absolute` on the child to place it exactly where you want.

## Basic Centering

Centering is one of the most common CSS tasks. Here is the classic approach for block elements:

```svelte
<div class="centered-box">
  <p>I am centered on the page!</p>
</div>

<style>
  .centered-box {
    width: 300px;
    margin: 0 auto;
    text-align: center;
    padding: 24px;
    background: #8e44ad;
    color: white;
    border-radius: 8px;
  }
</style>
```

- `margin: 0 auto` centers the box horizontally
- `text-align: center` centers the text inside the box

## Try It

Create a "Product Card" component with:
- A wrapper div with `position: relative`
- An absolutely positioned "Sale" badge in the top-right corner
- Use `inline-block` to place two cards next to each other
- Center the cards on the page with `margin: 0 auto` on a wrapper

## Key Takeaways

- **Block** elements stack vertically, **inline** elements sit side by side
- `inline-block` gives you the best of both worlds — inline flow with block-level spacing
- `display: none` completely hides an element from the page
- `position: relative` lets you nudge an element from its normal position
- `position: absolute` places an element relative to its nearest positioned parent
- Center block elements horizontally with `margin: 0 auto`
