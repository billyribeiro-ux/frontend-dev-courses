# The Box Model

Every single HTML element on a web page is a **box**. Even if it looks like a circle or a line of text, the browser treats it as a rectangular box. Understanding how these boxes work is the key to controlling spacing, sizing, and layout in CSS.

The **CSS Box Model** describes the four layers that make up every element's box. Once you understand it, spacing issues that used to seem random will make perfect sense.

## The Four Layers

From inside to outside, every element has:

1. **Content** — The actual text, image, or child elements
2. **Padding** — Space between the content and the border (inside the box)
3. **Border** — A line around the padding
4. **Margin** — Space between this box and other boxes (outside the box)

Think of it like a picture frame: the photo is the **content**, the matting around the photo is the **padding**, the frame itself is the **border**, and the wall space between frames is the **margin**.

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
- There is `20px` of space inside the border (padding)
- The border is `3px` thick and solid blue
- There is `30px` of space outside the border (margin)

## Padding

Padding adds space **inside** the element, between the content and the border. You can set each side individually or use shorthand:

```svelte
<div class="padded">Padding example</div>

<style>
  .padded {
    /* All four sides */
    padding: 20px;

    /* Vertical | Horizontal */
    padding: 10px 20px;

    /* Top | Right | Bottom | Left (clockwise) */
    padding: 10px 20px 10px 20px;

    /* Individual sides */
    padding-top: 10px;
    padding-right: 20px;
    padding-bottom: 10px;
    padding-left: 20px;
  }
</style>
```

## Margin

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

A handy trick for centering a block element horizontally is `margin: 0 auto`:

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

## Border

Borders sit between padding and margin. You can control their width, style, and color:

```svelte
<div class="bordered">Styled borders</div>

<style>
  .bordered {
    /* Shorthand: width style color */
    border: 2px solid #333;

    /* Individual properties */
    border-width: 2px;
    border-style: solid; /* solid, dashed, dotted, double, none */
    border-color: #333;

    /* Round the corners */
    border-radius: 8px;

    padding: 16px;
  }
</style>
```

## The box-sizing Fix

By default, `width` only sets the content width. Padding and border are added **on top**, making the element bigger than you expected. This catches everyone off guard.

The fix is `box-sizing: border-box`, which makes `width` include padding and border:

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

Most professional projects apply this to every element:

```css
* {
  box-sizing: border-box;
}
```

## Try It

Create a set of three "pricing cards" side by side, each with:
- A different background color
- `20px` of padding inside
- A `2px` solid border with rounded corners
- `16px` of margin between cards
- A width of `200px`
- Use `box-sizing: border-box` on all of them

## Key Takeaways

- Every HTML element is a box with four layers: content, padding, border, and margin
- **Padding** is space inside the border, **margin** is space outside the border
- Use shorthand (`padding: 10px 20px`) or individual sides (`margin-left: 10px`)
- `border-radius` rounds corners, making boxes look modern
- Always use `box-sizing: border-box` so `width` includes padding and border
- Use `margin: 0 auto` to center a block element horizontally
