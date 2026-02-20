# CSS Custom Properties

CSS custom properties (also called CSS variables) let you define a value once and reuse it throughout your stylesheets. Instead of repeating the same hex color in fifty places, you define it once as `--brand-color` and reference it everywhere with `var()`. When you need to change the color, you update it in one place and the entire site updates.

This is the foundation for building maintainable, scalable design systems. In this lesson, you will learn how to define, use, and override custom properties in your SvelteKit components.

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

The `:root` selector targets the document root, making these properties available everywhere in your app.

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

## Fallback Values

The `var()` function accepts a second argument as a fallback in case the property is not defined:

```css
.card {
  /* If --card-bg is not set, use white */
  background: var(--card-bg, #ffffff);

  /* Fallbacks can even reference other custom properties */
  color: var(--card-text, var(--color-text, #333));
}
```

## Cascading and Overriding

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

## Overriding in Child Components

You can pass custom property overrides to child components using the style attribute in SvelteKit:

```svelte
<!-- Parent page -->
<script lang="ts">
  import Card from '$lib/components/Card.svelte';
</script>

<Card --card-bg="#f0f0f0" --card-padding="2rem" />
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

## Try It

Create a global `app.css` file with custom properties for your primary color, background color, text color, and spacing values. Build a card component and a button component that both reference these properties. Then create a section on your page that overrides the primary color to see how cascading works.

## Key Takeaways

- Custom properties are defined with `--name` and used with `var(--name)`
- Define global properties on `:root` in your `app.css` file
- `var()` accepts fallback values as a second argument
- Custom properties **cascade** — child elements can override parent values
- Svelte supports passing custom properties to components with `--prop` syntax
- This pattern is the foundation for design tokens and theming
