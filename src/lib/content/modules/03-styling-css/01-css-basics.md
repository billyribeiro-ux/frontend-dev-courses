# CSS Basics

HTML gives your page structure, but without CSS it looks like a plain text document from the 1990s. **CSS** (Cascading Style Sheets) is the language that controls how everything looks — colors, fonts, spacing, sizes, and much more.

One of the best things about Svelte is that CSS is **scoped by default**. That means styles you write in one component will never accidentally affect another component. No more fighting with styles leaking all over your site!

## Writing CSS in Svelte

In a Svelte component, you put your CSS inside a `<style>` tag. The styles only apply to the HTML in that same file:

```svelte
<h1>Hello, Svelte!</h1>
<p>This text is styled with scoped CSS.</p>

<style>
  h1 {
    color: #ff3e00;
    font-size: 2rem;
  }

  p {
    color: #555;
  }
</style>
```

Even if another component also has an `<h1>`, it will not be affected by these styles. That is the power of scoped CSS.

## CSS Selectors

A **selector** tells CSS which element to style. Here are the three most common:

```svelte
<h1>Element Selector</h1>
<p class="intro">Class Selector</p>
<p id="unique">ID Selector</p>

<style>
  /* Element selector — targets all <h1> tags */
  h1 {
    color: navy;
  }

  /* Class selector — targets elements with class="intro" */
  .intro {
    font-size: 1.2rem;
  }

  /* ID selector — targets the one element with id="unique" */
  #unique {
    font-weight: bold;
  }
</style>
```

In practice, you will use **element selectors** and **class selectors** the most. IDs are rarely needed for styling.

## Colors

CSS gives you several ways to specify colors:

```svelte
<p class="named">Named color</p>
<p class="hex">Hex color</p>
<p class="rgb">RGB color</p>

<style>
  /* Named colors — simple but limited */
  .named { color: tomato; }

  /* Hex colors — 6 characters after # */
  .hex { color: #3498db; }

  /* RGB — red, green, blue values from 0 to 255 */
  .rgb { color: rgb(46, 204, 113); }
</style>
```

Hex colors are the most common in professional projects. You can find hex codes using any color picker tool online.

## Fonts and Text

Control how your text looks with these essential properties:

```svelte
<h1>Styled Heading</h1>
<p>This paragraph has custom font styling applied to it.</p>

<style>
  h1 {
    font-family: "Georgia", serif;
    font-size: 2.5rem;
    font-weight: 700;
    text-align: center;
  }

  p {
    font-family: "Arial", sans-serif;
    font-size: 1rem;
    font-weight: 400;
    text-align: left;
    line-height: 1.6;
  }
</style>
```

| Property | What It Does | Example Values |
|----------|-------------|----------------|
| `font-family` | Which font to use | `"Arial"`, `sans-serif`, `monospace` |
| `font-size` | How big the text is | `16px`, `1.5rem`, `2em` |
| `font-weight` | How bold the text is | `400` (normal), `700` (bold) |
| `text-align` | Horizontal alignment | `left`, `center`, `right` |
| `line-height` | Space between lines | `1.5`, `1.8` |

## Background Colors

You can color the background of any element:

```svelte
<div class="banner">
  <h1>Welcome!</h1>
</div>

<style>
  .banner {
    background-color: #2c3e50;
    color: white;
    padding: 32px;
    text-align: center;
    border-radius: 8px;
  }
</style>
```

## Try It

Create a styled "Profile Card" component with:
- A name heading using a custom font and color
- A short bio paragraph with a different font size and color
- A colored background on the card container
- Centered text alignment

## Key Takeaways

- CSS in Svelte is written inside `<style>` tags and is scoped to the component
- Selectors target elements (`h1`), classes (`.intro`), or IDs (`#unique`)
- Colors can be named (`tomato`), hex (`#ff3e00`), or RGB (`rgb(255, 62, 0)`)
- Font properties control family, size, weight, and alignment
- Scoped styles mean you never have to worry about CSS conflicts between components
