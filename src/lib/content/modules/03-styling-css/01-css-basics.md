# CSS Basics

HTML gives your page structure, but without CSS it looks like a plain text document from the 1990s. **CSS** (Cascading Style Sheets) is the language that controls how everything looks — colors, fonts, spacing, sizes, layout, and much more.

But CSS has a reputation. Developers joke about it being unpredictable, frustrating, a language where things "just don't work." That reputation comes from not understanding a few core mental models. Once you internalize how the **cascade**, **specificity**, and the **box model** actually work, CSS becomes one of the most powerful and *predictable* tools in your toolkit.

And one of the best things about Svelte is that CSS is **scoped by default**. Styles you write in one component will never accidentally bleed into another. This solves the single biggest source of CSS pain in large projects. Let's dig in.

## The Cascade — Why It's Called "Cascading"

The "C" in CSS stands for *Cascading*. This is the algorithm the browser uses to decide which style wins when multiple rules apply to the same element. Think of it like water flowing downhill — styles cascade from general to specific, and later rules override earlier ones.

Here is the cascade's priority order, from lowest to highest:

1. **Browser defaults** — every browser ships with a built-in stylesheet (that's why unstyled `<h1>` tags are big and bold)
2. **External/global stylesheets** — styles loaded via `<link>` tags
3. **Scoped component styles** — what you write in Svelte's `<style>` tag
4. **Inline styles** — `style="color: red"` directly on an element
5. **`!important`** — the nuclear option (more on why you should almost never use this)

When two rules have equal priority, the one that appears *later* in the source code wins. This is not random — it is deterministic and predictable. The moment you understand this, CSS stops feeling like a guessing game.

## Specificity — The Tiebreaker

When multiple CSS rules target the same element, the browser needs a tiebreaker. That tiebreaker is **specificity** — a scoring system that determines which selector is more "specific."

Think of specificity as a three-digit score: `(IDs, Classes, Elements)`.

| Selector | Score | Example |
|----------|-------|---------|
| Element | `0-0-1` | `p { }` |
| Class | `0-1-0` | `.intro { }` |
| ID | `1-0-0` | `#header { }` |
| Element + Class | `0-1-1` | `p.intro { }` |
| Two classes | `0-2-0` | `.card.featured { }` |

Higher scores win. An ID (`1-0-0`) will always beat any number of classes (`0-99-0`), and a class will always beat any number of element selectors. This is why styling with IDs makes things hard to override later — they carry too much specificity weight.

**The practical rule:** style with classes. They give you enough specificity to be precise without making overrides painful.

## How Svelte Scopes CSS (and Why It Matters)

In a traditional web app, all CSS is global. If you write `p { color: red }` in one file, *every* paragraph on the entire site turns red. This is the source of countless bugs in large projects — you change a style in one place and something breaks somewhere else entirely.

Svelte solves this elegantly. When you write styles in a `<style>` tag, Svelte's compiler adds a unique hash-based class to both your CSS selectors and the corresponding HTML elements at build time:

```svelte
<!-- What you write -->
<p>Hello</p>

<style>
  p { color: #ff3e00; }
</style>

<!-- What the browser actually sees -->
<p class="svelte-abc123">Hello</p>

<style>
  p.svelte-abc123 { color: #ff3e00; }
</style>
```

That `.svelte-abc123` class is automatically generated and unique to this component. Your `p` style physically cannot affect paragraphs in other components because they won't have that class. No naming conventions needed, no BEM methodology, no CSS Modules configuration — scoping just works.

If you *do* need to reach into a child component's DOM (say, styling a third-party component), Svelte gives you the `:global()` modifier. But reach for it rarely — it's an escape hatch, not a default.

## CSS Selectors — Your Targeting System

A **selector** tells CSS which elements to style. Think of selectors as a query language for the DOM. Here is the full spectrum, from basic to advanced:

```svelte
<nav>
  <a href="/" class="nav-link active" data-section="home">Home</a>
  <a href="/about" class="nav-link" data-section="about">About</a>
</nav>
<p id="tagline">Build something great.</p>

<style>
  /* Element selector — all <nav> elements in this component */
  nav {
    display: flex;
    gap: 1rem;
  }

  /* Class selector — any element with class="nav-link" */
  .nav-link {
    text-decoration: none;
    color: #333;
  }

  /* Multiple classes — element must have BOTH classes */
  .nav-link.active {
    font-weight: 700;
    color: #ff3e00;
  }

  /* ID selector — the ONE element with id="tagline" */
  #tagline {
    font-style: italic;
  }

  /* Attribute selector — elements with a specific attribute */
  [data-section="home"] {
    border-bottom: 2px solid #ff3e00;
  }

  /* Pseudo-class — style based on state or position */
  .nav-link:hover {
    color: #ff3e00;
  }
  .nav-link:first-child {
    margin-left: 0;
  }

  /* Pseudo-element — style a "virtual" part of an element */
  .nav-link::after {
    content: "";
    display: block;
    height: 2px;
    background: transparent;
    transition: background 0.2s;
  }
  .nav-link:hover::after {
    background: #ff3e00;
  }
</style>
```

**When to use which:**

| Selector Type | When to Use |
|---------------|-------------|
| Element (`p`, `h1`) | Broad base styles within a component |
| Class (`.card`) | Your primary tool — specific, reusable, low specificity |
| ID (`#header`) | Almost never for styling. Use for `aria` attributes and anchor links |
| Attribute (`[type="email"]`) | Styling form inputs by type, or elements with data attributes |
| Pseudo-class (`:hover`, `:focus`) | Interactive states, structural selection (`:first-child`, `:nth-child`) |
| Pseudo-element (`::before`, `::after`) | Decorative elements, custom bullets, underline effects |

## The Box Model — How Every Element Takes Up Space

Every element on the page is a rectangular box. Understanding how that box is sized is fundamental to writing CSS that behaves the way you expect.

The box has four layers, from inside out:

```
┌─────────────────────────── margin ───────────────────────────┐
│  ┌─────────────────────── border ──────────────────────────┐ │
│  │  ┌─────────────────── padding ───────────────────────┐  │ │
│  │  │                                                   │  │ │
│  │  │                  content                          │  │ │
│  │  │                                                   │  │ │
│  │  └───────────────────────────────────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

- **Content** — the text, image, or child elements inside
- **Padding** — space *inside* the border, between the content and the edge
- **Border** — the visible edge of the element
- **Margin** — space *outside* the border, between this element and its neighbors

Here is the critical gotcha: by default, CSS adds padding and border *on top of* the width you set. If you say `width: 200px` and then add `padding: 20px`, the actual rendered width is 240px (200 + 20 + 20). This is insane, and it trips up everyone.

The fix is `box-sizing: border-box`, which makes `width` include padding and border. Set it globally and never think about it again:

```css
/* Put this in your global stylesheet (app.css or +layout.svelte) */
*,
*::before,
*::after {
  box-sizing: border-box;
}
```

This is universally considered best practice. Every CSS reset, every framework, every professional project uses it. Set it once at the top of your project and forget about it.

```svelte
<div class="card">
  <p>This card is exactly 300px wide, padding included.</p>
</div>

<style>
  .card {
    width: 300px;
    padding: 24px;
    border: 2px solid #dee2e6;
    margin: 16px 0;
    border-radius: 8px;
    /* With border-box, the total width is 300px, not 300 + 48 + 4 */
  }
</style>
```

## Units — px, rem, em, %, vh/vw

CSS has many unit types. Using the right one in the right context makes your designs flexible and accessible.

| Unit | Relative To | Best For |
|------|-------------|----------|
| `px` | Nothing (absolute) | Borders, shadows, fine details that should not scale |
| `rem` | Root font size (usually 16px) | Font sizes, spacing, most measurements |
| `em` | Parent element's font size | Spacing that should scale *with the element's text* |
| `%` | Parent element's dimension | Widths that should fill a proportion of the container |
| `vh` / `vw` | Viewport height / width | Full-screen sections, viewport-relative sizing |

**Why `rem` is usually the right default:** `rem` scales with the user's browser font-size setting. If someone sets their default to 20px (for accessibility), your `1.5rem` heading grows proportionally. Pixels do not — they stay fixed, ignoring the user's preference. Using `rem` for font sizes and spacing means your design respects accessibility settings for free.

```svelte
<div class="hero">
  <h1>Welcome</h1>
  <p>Start building today.</p>
</div>

<style>
  .hero {
    padding: 2rem;           /* Scales with root font size */
    min-height: 50vh;        /* Half the viewport height */
    border-bottom: 1px solid #ddd; /* Fine detail — pixels are fine */
  }

  h1 {
    font-size: 2.5rem;       /* Scales with user preferences */
    margin-bottom: 0.5em;    /* Scales with this element's own font size */
  }

  p {
    max-width: 60%;          /* Relative to parent container */
    font-size: 1.125rem;
  }
</style>
```

## Colors — hex, rgb, and hsl

CSS gives you several color formats. They all describe the same colors, but the mental models behind them are very different.

**Hex (`#3498db`)** — the most common format. Six hexadecimal digits: two for red, two for green, two for blue. Compact, but not intuitive to read or tweak by hand.

**RGB (`rgb(52, 152, 219)`)** — red, green, blue values from 0 to 255. Slightly more readable, but still hard to answer "how do I make this 20% lighter?"

**HSL (`hsl(204, 70%, 53%)`)** — hue (0-360, a position on the color wheel), saturation (0-100%, gray to vivid), lightness (0-100%, black to white). This is the most intuitive for programmatic work because each axis is independently meaningful:

```svelte
<div class="swatches">
  <div class="swatch primary">Primary</div>
  <div class="swatch primary-light">Light</div>
  <div class="swatch primary-dark">Dark</div>
</div>

<style>
  .swatch {
    padding: 1rem;
    color: white;
    border-radius: 4px;
    font-weight: 600;
  }

  /* With HSL, creating color variations is trivial —
     just adjust lightness while keeping hue and saturation */
  .primary       { background: hsl(204, 70%, 53%); }
  .primary-light { background: hsl(204, 70%, 70%); } /* same hue, lighter */
  .primary-dark  { background: hsl(204, 70%, 35%); } /* same hue, darker */

  .swatches {
    display: flex;
    gap: 0.5rem;
  }
</style>
```

Want to build a cohesive color palette? Pick a hue, then vary saturation and lightness. Want a complementary color? Add 180 to the hue. Analogous colors? Add 30. HSL makes color theory directly expressible in code.

## CSS Custom Properties (Variables)

CSS custom properties let you define reusable values. They are declared with `--` and accessed with `var()`:

```svelte
<div class="card">
  <h2>Styled Card</h2>
  <p>Using CSS custom properties for consistent theming.</p>
</div>

<style>
  .card {
    --card-padding: 1.5rem;
    --card-radius: 8px;
    --card-bg: hsl(210, 20%, 98%);
    --card-border: hsl(210, 15%, 85%);
    --text-primary: hsl(210, 25%, 15%);
    --text-secondary: hsl(210, 10%, 45%);

    padding: var(--card-padding);
    border-radius: var(--card-radius);
    background: var(--card-bg);
    border: 1px solid var(--card-border);
  }

  h2 {
    color: var(--text-primary);
    margin-bottom: 0.5rem;
  }

  p {
    color: var(--text-secondary);
    line-height: 1.6;
  }
</style>
```

Custom properties compose beautifully with Svelte's component model. A parent component can set a custom property, and a child component can read it — giving you a clean theming API without any props:

```svelte
<!-- Parent.svelte -->
<div class="theme-warm">
  <Card />
</div>

<style>
  .theme-warm {
    --accent-color: hsl(15, 80%, 55%);
    --surface-color: hsl(15, 30%, 97%);
  }
</style>

<!-- Card.svelte -->
<div class="card">
  <h2>I inherit the theme</h2>
</div>

<style>
  .card {
    /* Falls back to blue if no ancestor defines --accent-color */
    border-left: 4px solid var(--accent-color, hsl(210, 70%, 50%));
    background: var(--surface-color, white);
    padding: 1.5rem;
  }
</style>
```

This pattern — defining CSS custom properties on a parent and consuming them in children — is how professional Svelte applications implement theming. It works through the DOM's natural inheritance, requires no JavaScript, and keeps your components decoupled.

## Real Example: Styling a Navigation Bar

Let's put everything together. Here is a navigation bar with proper spacing, colors, hover states, and accessible focus indicators:

```svelte
<nav class="navbar" aria-label="Main navigation">
  <a href="/" class="logo">Acme</a>
  <ul class="nav-links">
    <li><a href="/" class="nav-link active">Home</a></li>
    <li><a href="/about" class="nav-link">About</a></li>
    <li><a href="/projects" class="nav-link">Projects</a></li>
    <li><a href="/contact" class="nav-link">Contact</a></li>
  </ul>
</nav>

<style>
  .navbar {
    --nav-height: 3.5rem;
    --nav-bg: hsl(220, 25%, 12%);
    --nav-text: hsl(220, 15%, 80%);
    --nav-accent: hsl(35, 90%, 55%);

    display: flex;
    align-items: center;
    justify-content: space-between;
    height: var(--nav-height);
    padding: 0 2rem;
    background: var(--nav-bg);
  }

  .logo {
    font-size: 1.25rem;
    font-weight: 700;
    color: white;
    text-decoration: none;
    letter-spacing: 0.02em;
  }

  .nav-links {
    display: flex;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .nav-link {
    display: block;
    padding: 0.5rem 1rem;
    color: var(--nav-text);
    text-decoration: none;
    font-size: 0.9375rem;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }

  .nav-link:hover {
    color: white;
    background: hsl(220, 25%, 20%);
  }

  /* Keyboard users need to see where focus is */
  .nav-link:focus-visible {
    outline: 2px solid var(--nav-accent);
    outline-offset: 2px;
  }

  .nav-link.active {
    color: var(--nav-accent);
    font-weight: 600;
  }
</style>
```

Notice the patterns: CSS custom properties at the top for consistent theming, `rem` units for spacing, HSL for easy color relationships, `transition` for smooth hover effects, and `:focus-visible` for keyboard accessibility. This is production-quality CSS.

## Common Pitfalls

**Fighting specificity instead of understanding it.** If your style is not applying, do not just add more selectors or slap on `!important`. Open DevTools, inspect the element, and look at which rule is winning and *why*. Usually the fix is making your selector more specific, or more often, removing unnecessary specificity from the competing rule.

**Using `!important` as a fix.** `!important` overrides everything — including future styles that legitimately need to override it. Once you use it, the only way to override *that* is with another `!important`, and you spiral into a specificity arms race. It is almost never the right solution. The only acceptable use is in utility classes (like `.visually-hidden`) that must never be overridden.

**Not understanding the cascade.** If two rules have the same specificity, the one that appears later wins. This means the *order of your CSS* matters. Moving a rule from the top of your `<style>` block to the bottom can change behavior. This is not a bug — it is the cascade working as designed.

**Using px for font sizes.** Pixel font sizes ignore user accessibility settings. Someone who has set their browser default to 24px (because they have low vision) will not benefit from your `font-size: 14px` — it will stay at 14px regardless. Use `rem` and their preference is respected automatically.

**Forgetting `box-sizing: border-box`.** If your element is mysteriously wider than the width you set, this is almost certainly the cause. Set it globally and save yourself hours of debugging.

## Try It

Build a "Profile Card" component:

1. Set `box-sizing: border-box` globally
2. Create a card with a colored left border (use HSL for the color)
3. Inside, add a name heading, a role paragraph, and a list of skills
4. Use CSS custom properties for your color palette (define them on the card, use them throughout)
5. Add a `:hover` effect that subtly changes the card's shadow or border color
6. Use `rem` for font sizes and spacing, `px` only for borders

Stretch goal: create two cards side by side with different color themes by overriding the custom properties on each card's container.

## Key Takeaways

- The **cascade** determines which styles win: later rules and higher specificity beat earlier, lower-specificity ones
- **Specificity** is scored as (IDs, Classes, Elements) — style with classes to keep specificity manageable
- Svelte **scopes CSS** by adding unique hash-based classes at compile time — your styles cannot leak
- The **box model** has four layers: content, padding, border, margin. Always set `box-sizing: border-box`
- Use **`rem`** for font sizes and spacing (it respects user preferences), **`px`** for fine details like borders
- **HSL** is the most intuitive color format — vary lightness for shades, shift hue for palettes
- **CSS custom properties** cascade through the DOM and pair perfectly with Svelte's component model for theming
- Never reach for `!important` — understand specificity and the cascade instead
