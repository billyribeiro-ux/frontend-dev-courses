# CSS Custom Properties

CSS custom properties (also called CSS variables) let you define a value once and reuse it throughout your stylesheets. Instead of repeating the same hex color in fifty places, you define it once as `--brand-color` and reference it everywhere with `var()`. When you need to change the color, you update it in one place and the entire site updates.

This is not just a convenience feature. Custom properties are the foundation for building maintainable, scalable design systems. They cascade through the DOM, can be overridden per component, respond to media queries, can be manipulated with JavaScript at runtime, and can even be animated. In this lesson, you will learn every facet of custom properties and how they integrate with Svelte's component model.

## The Mental Model: Properties, Not Variables

The name "CSS variables" is a bit misleading. Variables in JavaScript are lexically scoped — they belong to the block where they are declared. CSS custom properties are fundamentally different: they are **inherited properties** that flow down the DOM tree, just like `color` or `font-family`. This distinction matters.

When you set `--brand-color: #ff3e00` on an element, every descendant of that element can read that value unless they override it. This is inheritance, not variable lookup. The cascade, specificity, and inheritance rules that govern normal CSS all apply to custom properties too.

```css
/* This works because custom properties inherit through the DOM tree */
.parent {
  --text-size: 1.25rem;
}

.parent .child {
  font-size: var(--text-size); /* 1.25rem — inherited from .parent */
}

.parent .child .grandchild {
  font-size: var(--text-size); /* still 1.25rem — inherited through .child */
}
```

If `.child` sets `--text-size: 2rem`, then `.grandchild` gets `2rem` because it inherits from its nearest ancestor that defines the property. This is identical to how `color` inheritance works. Understanding this mental model prevents entire categories of bugs.

## Defining and Using Custom Properties

Define a custom property with the `--` prefix and use it with the `var()` function:

```css
:root {
  --brand-color: #ff3e00;
  --text-color: #333;
  --spacing-md: 1rem;
  --radius: 8px;
}

.card {
  color: var(--text-color);
  padding: var(--spacing-md);
  border-radius: var(--radius);
  border: 2px solid var(--brand-color);
}
```

The `:root` selector targets the document root (`<html>` element), making these properties available everywhere in your app. Using `:root` is conventional for global tokens, but you can define custom properties on any element.

### What can a custom property hold?

Custom properties can hold any valid CSS value — not just colors and lengths. This flexibility is what makes them so powerful:

```css
:root {
  /* Colors */
  --color-primary: #ff3e00;
  --color-primary-rgb: 255, 62, 0; /* For use with rgba() */

  /* Lengths and spacing */
  --spacing-md: 1rem;
  --container-width: min(90%, 1200px);

  /* Complex values */
  --shadow-elevation-1: 0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08);
  --font-stack: 'Inter', system-ui, -apple-system, sans-serif;
  --grid-template: repeat(auto-fill, minmax(280px, 1fr));

  /* Whole shorthand values */
  --border-default: 1px solid #e0e0e0;
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Partial values — combine with other parts later */
  --duration: 300ms;
  --easing: cubic-bezier(0.4, 0, 0.2, 1);

  /* Even empty or whitespace values for toggle tricks */
  --is-dark: ;
}
```

The one restriction: a custom property cannot hold a property name or a selector. You cannot do `var(--my-property): red` — the property name itself cannot be dynamic.

## Using Custom Properties in SvelteKit

In a SvelteKit project, define your custom properties in your global CSS file and use them in any component:

```css
/* src/app.css */
:root {
  --color-primary: #ff3e00;
  --color-secondary: #676778;
  --color-bg: #ffffff;
  --color-text: #222222;
  --font-body: 'Inter', sans-serif;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 2rem;
}
```

```svelte
<!-- src/lib/components/Button.svelte -->
<button>
  {@render children()}
</button>

<style>
  button {
    background: var(--color-primary);
    color: white;
    padding: var(--spacing-sm) var(--spacing-md);
    border: none;
    border-radius: 6px;
    font-family: var(--font-body);
    cursor: pointer;
  }

  button:hover {
    opacity: 0.9;
  }
</style>
```

Because Svelte's `<style>` blocks are scoped to the component, the generated CSS only applies to elements within the component. But `var(--color-primary)` still resolves by looking up the DOM tree at runtime. This means your global tokens flow into scoped styles naturally — no special imports needed.

### Why not just import a SCSS variables file?

You might wonder why custom properties are better than SCSS/Less variables. The answer is that custom properties are **live at runtime**. SCSS variables are compiled away during the build — they become static values in the output CSS. Custom properties exist in the browser, which means:

1. You can change them with JavaScript
2. They cascade through the DOM (enabling per-section theming)
3. They respond to media queries
4. They can be animated
5. They work with Svelte's component property passing syntax

SCSS variables are compile-time constants. Custom properties are runtime values. For design tokens and theming, runtime values win.

## The var() Function in Depth

The `var()` function does more than simple lookup. Understanding its full behavior prevents subtle bugs.

### Basic fallback

The `var()` function accepts a second argument as a fallback in case the property is not defined:

```css
.card {
  /* If --card-bg is not set, use white */
  background: var(--card-bg, #ffffff);
}
```

### Nested fallbacks

Fallbacks can reference other custom properties, creating a chain of resolution:

```css
.card {
  /* Try --card-text, then --color-text, then fall back to #333 */
  color: var(--card-text, var(--color-text, #333));
}
```

This pattern is essential for building component APIs. The component tries a component-specific property first, falls back to the global token, and finally has a hardcoded default.

### The guaranteed value mechanism

When `var()` references a property that exists but has an invalid value for the context, the browser does **not** use the fallback. Instead, it uses the property's inherited value (or initial value). This is called the "guaranteed-invalid" value behavior:

```css
:root {
  --color-bg: not-a-color; /* Invalid for background */
}

.box {
  /* The fallback #fff is NOT used. Instead, background gets
     the inherited value or transparent (the initial value). */
  background: var(--color-bg, #fff);
}
```

This trips up many developers. The fallback only activates when the custom property is **not defined at all** (or defined as `initial`). If it is defined but with a value that is invalid in the context where `var()` is used, the fallback is ignored.

### Fallback with commas

Because the fallback can contain commas, everything after the first comma is treated as the fallback value:

```css
.card {
  /* The entire "Helvetica, Arial, sans-serif" is the fallback */
  font-family: var(--font-heading, Helvetica, Arial, sans-serif);
}
```

This is a syntax feature, not a bug. The `var()` function only splits on the first comma.

## Cascading, Overriding, and Scoping

Custom properties follow the CSS cascade. A child element can override a property defined by a parent:

```svelte
<div class="default-theme">
  <p>I use the default colors.</p>

  <div class="accent-section">
    <p>I use different colors!</p>
  </div>
</div>

<style>
  .default-theme {
    --color-primary: #ff3e00;
    --color-bg: #ffffff;
  }

  .accent-section {
    --color-primary: #6c5ce7;
    --color-bg: #f8f7ff;
  }

  /* Both sections use the same var() references,
     but get different values */
  div {
    background: var(--color-bg);
    border-left: 4px solid var(--color-primary);
    padding: 1rem;
    margin: 1rem 0;
  }
</style>
```

This cascading behavior is what makes theming possible. You define the same property names with different values, and every component that references those properties updates automatically.

### Scoping strategies

You can scope custom properties at different levels depending on the use case:

```css
/* Global — available everywhere */
:root {
  --color-primary: #ff3e00;
}

/* Page section — overrides for a specific region */
.dashboard {
  --color-primary: #0066ff;
  --sidebar-width: 280px;
}

/* Component — only within this component's DOM subtree */
.card {
  --card-padding: 1.5rem;
  --card-radius: 8px;
}

/* State-based — properties that change with interaction */
.card:hover {
  --card-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

/* Media-query scoped — responsive token values */
@media (max-width: 768px) {
  :root {
    --spacing-lg: 1rem;   /* tighter spacing on mobile */
    --text-3xl: 1.75rem;  /* smaller headings on mobile */
  }
}
```

Media-query scoping is particularly powerful. You can adjust your entire spacing scale or typography scale at a single breakpoint, and every component that uses those tokens adapts automatically. No component-level media queries needed.

## Overriding in Child Components (Svelte's --prop Syntax)

Svelte provides a special syntax for passing custom property overrides to child components. This is one of the most elegant features of Svelte's component model:

```svelte
<!-- Parent page -->
<script lang="ts">
  import Card from '$lib/components/Card.svelte';
</script>

<!-- These --props become CSS custom properties on a wrapper element -->
<Card --card-bg="#f0f0f0" --card-padding="2rem" />
<Card --card-bg="#e8f4f8" --card-padding="1rem" />
```

```svelte
<!-- Card.svelte -->
<div class="card">
  {@render children()}
</div>

<style>
  .card {
    background: var(--card-bg, white);
    padding: var(--card-padding, 1rem);
  }
</style>
```

Under the hood, Svelte wraps the component in a `<div style="display: contents">` element with the custom properties set as inline styles. The `display: contents` means the wrapper does not affect layout — it is invisible in terms of the box model but participates in property inheritance.

### Building a component property API

This pattern lets you create a styling API for your components that is both flexible and type-safe:

```svelte
<!-- Alert.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'info' | 'success' | 'warning' | 'error';
    children: Snippet;
  }

  let { variant = 'info', children }: Props = $props();
</script>

<div class="alert {variant}">
  {@render children()}
</div>

<style>
  .alert {
    padding: var(--alert-padding, 1rem 1.25rem);
    border-radius: var(--alert-radius, 8px);
    border-left: var(--alert-border-width, 4px) solid var(--alert-accent);
    background: var(--alert-bg);
    color: var(--alert-text);
    font-size: var(--alert-font-size, 0.95rem);
  }

  .info {
    --alert-accent: #3b82f6;
    --alert-bg: #eff6ff;
    --alert-text: #1e40af;
  }

  .success {
    --alert-accent: #10b981;
    --alert-bg: #ecfdf5;
    --alert-text: #065f46;
  }

  .warning {
    --alert-accent: #f59e0b;
    --alert-bg: #fffbeb;
    --alert-text: #92400e;
  }

  .error {
    --alert-accent: #ef4444;
    --alert-bg: #fef2f2;
    --alert-text: #991b1b;
  }
</style>
```

A consumer can override the defaults without touching the component internals:

```svelte
<!-- Custom-styled alert -->
<Alert variant="info" --alert-padding="2rem" --alert-radius="0" --alert-font-size="1.1rem">
  This alert has custom padding, no border radius, and larger text.
</Alert>
```

This is a controlled API surface. The component exposes specific custom properties as its styling hooks, and the consumer can tweak them without reaching into the component's internals.

## JavaScript Interaction

Custom properties are live in the DOM, which means JavaScript can read and write them at runtime. This is the bridge between your CSS design system and your application logic.

### Reading custom property values

```typescript
// Read a computed custom property value from an element
const element = document.querySelector('.card')!;
const styles = getComputedStyle(element);
const primaryColor = styles.getPropertyValue('--color-primary').trim();
// → "#ff3e00"
```

`getComputedStyle` resolves the cascade — it returns the final computed value after inheritance and overrides.

### Writing custom property values

```typescript
// Set a custom property on a specific element
element.style.setProperty('--card-bg', '#f0f0f0');

// Set a global custom property on the document root
document.documentElement.style.setProperty('--color-primary', '#0066ff');

// Remove a custom property (falls back to inherited/fallback value)
element.style.removeProperty('--card-bg');
```

### Reactive custom properties in Svelte

You can bind custom properties to reactive state using Svelte's style directive:

```svelte
<script lang="ts">
  let hue = $state(0);
  let saturation = $state(80);
  let lightness = $state(50);

  let color = $derived(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
</script>

<div class="preview" style:--preview-color={color}>
  <p>Current color: {color}</p>
</div>

<label>
  Hue: <input type="range" min="0" max="360" bind:value={hue} />
</label>
<label>
  Saturation: <input type="range" min="0" max="100" bind:value={saturation} />
</label>
<label>
  Lightness: <input type="range" min="0" max="100" bind:value={lightness} />
</label>

<style>
  .preview {
    width: 200px;
    height: 200px;
    background: var(--preview-color);
    border-radius: 12px;
    display: grid;
    place-items: center;
    transition: background 100ms;
  }

  p {
    background: rgba(255, 255, 255, 0.9);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
</style>
```

The `style:--preview-color` directive sets a CSS custom property directly on the element. When `color` changes (because `hue`, `saturation`, or `lightness` changed), Svelte updates the inline style, and the CSS recalculates.

### Mouse-tracking example

```svelte
<script lang="ts">
  let x = $state(0);
  let y = $state(0);

  function handleMouseMove(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    x = ((e.clientX - rect.left) / rect.width) * 100;
    y = ((e.clientY - rect.top) / rect.height) * 100;
  }
</script>

<div
  class="spotlight"
  onmousemove={handleMouseMove}
  style:--mouse-x="{x}%"
  style:--mouse-y="{y}%"
>
  <p>Move your mouse</p>
</div>

<style>
  .spotlight {
    width: 400px;
    height: 300px;
    background: radial-gradient(
      circle at var(--mouse-x, 50%) var(--mouse-y, 50%),
      rgba(255, 62, 0, 0.3),
      transparent 60%
    );
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    display: grid;
    place-items: center;
  }
</style>
```

This demonstrates the power of custom properties as a bridge. The JavaScript knows the mouse position; the CSS knows how to render a radial gradient. The custom property is the interface between them, and neither side needs to know about the other's implementation.

## Animating Custom Properties with @property

By default, custom properties cannot be animated — the browser does not know their type, so it cannot interpolate between values. The `@property` at-rule (part of CSS Houdini) solves this by registering a custom property with a specific syntax:

```css
@property --gradient-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.rotating-gradient {
  background: conic-gradient(from var(--gradient-angle), #ff3e00, #6c5ce7, #ff3e00);
  animation: rotate 3s linear infinite;
}

@keyframes rotate {
  to {
    --gradient-angle: 360deg;
  }
}
```

Without `@property`, this animation would snap between 0deg and 360deg instead of smoothly rotating. The `syntax: '<angle>'` declaration tells the browser how to interpolate the values.

### Registered property types

```css
@property --my-color {
  syntax: '<color>';
  inherits: true;
  initial-value: black;
}

@property --my-length {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

@property --my-percentage {
  syntax: '<percentage>';
  inherits: false;
  initial-value: 0%;
}

@property --my-number {
  syntax: '<number>';
  inherits: false;
  initial-value: 0;
}

@property --my-integer {
  syntax: '<integer>';
  inherits: false;
  initial-value: 0;
}
```

### Smooth color transitions with @property

```css
@property --bg-start {
  syntax: '<color>';
  inherits: false;
  initial-value: #ff3e00;
}

@property --bg-end {
  syntax: '<color>';
  inherits: false;
  initial-value: #6c5ce7;
}

.gradient-box {
  background: linear-gradient(135deg, var(--bg-start), var(--bg-end));
  transition: --bg-start 600ms, --bg-end 600ms;
}

.gradient-box:hover {
  --bg-start: #00b894;
  --bg-end: #0984e3;
}
```

Without `@property`, the gradient would snap on hover. With it, the colors smoothly transition.

## Complete Design System Example

Here is a production-ready example that ties everything together — global tokens, component APIs, responsive adjustments, and JavaScript interaction:

```css
/* src/app.css — Complete token foundation */
:root {
  /* Color primitives */
  --color-orange-500: #ff3e00;
  --color-orange-600: #e63600;
  --color-purple-500: #6c5ce7;
  --color-gray-50: #f9fafb;
  --color-gray-100: #f3f4f6;
  --color-gray-200: #e5e7eb;
  --color-gray-700: #374151;
  --color-gray-900: #111827;

  /* Semantic tokens — what colors mean */
  --color-primary: var(--color-orange-500);
  --color-primary-hover: var(--color-orange-600);
  --color-bg: #ffffff;
  --color-surface: var(--color-gray-50);
  --color-text: var(--color-gray-900);
  --color-text-muted: var(--color-gray-700);
  --color-border: var(--color-gray-200);

  /* Spacing scale (4px base unit) */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;

  /* Typography */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 2rem;
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* Borders and radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1);

  /* Motion */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --ease-out: cubic-bezier(0.0, 0.0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* Layout */
  --container-max: 1200px;
  --sidebar-width: 280px;
}

/* Responsive adjustments — one place to change, everything adapts */
@media (max-width: 768px) {
  :root {
    --space-8: 1.5rem;
    --space-12: 2rem;
    --space-16: 3rem;
    --text-2xl: 1.25rem;
    --text-3xl: 1.5rem;
    --sidebar-width: 100%;
  }
}
```

```svelte
<!-- src/lib/components/Button.svelte — Component with custom property API -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    onclick?: (e: MouseEvent) => void;
    children: Snippet;
  }

  let { variant = 'primary', size = 'md', disabled = false, onclick, children }: Props = $props();
</script>

<button class="{variant} {size}" {disabled} {onclick}>
  {@render children()}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--btn-gap, var(--space-2));
    padding: var(--btn-padding-y) var(--btn-padding-x);
    border: var(--btn-border, none);
    border-radius: var(--btn-radius, var(--radius-md));
    font-family: var(--font-sans);
    font-size: var(--btn-font-size);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Variants set internal custom properties */
  .primary {
    --btn-bg: var(--color-primary);
    --btn-text: white;
    background: var(--btn-bg);
    color: var(--btn-text);
  }

  .primary:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  .secondary {
    background: var(--color-surface);
    color: var(--color-text);
    --btn-border: 1px solid var(--color-border);
  }

  .ghost {
    background: transparent;
    color: var(--color-primary);
  }

  .ghost:hover:not(:disabled) {
    background: var(--color-surface);
  }

  /* Sizes set internal spacing and font custom properties */
  .sm {
    --btn-padding-x: var(--space-3);
    --btn-padding-y: var(--space-1);
    --btn-font-size: var(--text-sm);
  }

  .md {
    --btn-padding-x: var(--space-4);
    --btn-padding-y: var(--space-2);
    --btn-font-size: var(--text-base);
  }

  .lg {
    --btn-padding-x: var(--space-6);
    --btn-padding-y: var(--space-3);
    --btn-font-size: var(--text-lg);
  }
</style>
```

The consumer can then further customize:

```svelte
<script lang="ts">
  import Button from '$lib/components/Button.svelte';
</script>

<!-- Standard usage -->
<Button variant="primary" size="md">Save</Button>

<!-- Custom overrides via Svelte's --prop syntax -->
<Button variant="primary" --btn-radius="9999px" --btn-padding-x="2rem">
  Pill Button
</Button>
```

## Try It

1. **Foundation exercise**: Create a global `app.css` file with custom properties covering colors, spacing, typography, borders, shadows, and motion. Build a Card component and a Button component that both reference only custom properties — zero raw values in the component styles. Create a section on your page that overrides `--color-primary` and verify the cascading behavior.

2. **Interactive exercise**: Build a "theme playground" page where users can adjust color values, spacing, and border radius using range inputs. Use `style:--prop` directives to pipe the reactive values into custom properties. The preview section should update in real time.

3. **Animation exercise**: Use `@property` to register a `--gradient-position` property as `<percentage>` and create a smooth animated progress bar that uses a gradient with the custom property as the color stop position.

## Key Takeaways

- Custom properties are **inherited properties**, not lexically scoped variables — they flow down the DOM tree
- Define global properties on `:root` in your `app.css` file
- `var()` accepts fallback values; fallbacks only trigger when the property is **undefined**, not when its value is invalid in context
- Custom properties **cascade** — child elements can override parent values, enabling per-section theming
- Svelte supports passing custom properties to components with the `--prop` syntax (rendered via `display: contents` wrapper)
- Use `style:--prop` for reactive custom properties driven by component state
- `getComputedStyle` reads computed values; `element.style.setProperty` writes them
- `@property` registration enables smooth animation and transition of custom properties
- Responsive custom properties (via media queries on `:root`) let you adjust your entire design system at one breakpoint
- This pattern is the foundation for design tokens and theming — the next two lessons build directly on these concepts
