# Design Tokens

A **design token** is a named value that represents a design decision — a specific color, a spacing size, a font weight, a border radius. Instead of scattering raw values like `#ff3e00` or `16px` throughout your code, you give each value a meaningful name and store it in one place. This creates a single source of truth for your entire design system.

Design tokens make your application consistent, maintainable, and easy to update. Change a token once and every component that uses it updates automatically. In this lesson, you will build a complete token system for a SvelteKit project using CSS custom properties.

## What Are Design Tokens?

Design tokens are the smallest pieces of your design system. They capture decisions like:

- "Our primary brand color is `#ff3e00`"
- "Standard padding between elements is `1rem`"
- "Body text uses the `Inter` font at `16px`"

Without tokens, these values are scattered across dozens of files. With tokens, they live in one place:

```css
/* src/app.css — Design Tokens */
:root {
  /* Colors */
  --color-primary: #ff3e00;
  --color-secondary: #676778;
  --color-accent: #6c5ce7;
  --color-success: #00b894;
  --color-warning: #fdcb6e;
  --color-error: #d63031;

  /* Neutrals */
  --color-gray-100: #f7f7f7;
  --color-gray-200: #e6e6e6;
  --color-gray-300: #cccccc;
  --color-gray-700: #555555;
  --color-gray-900: #222222;
}
```

## Building a Token System

A complete token system covers colors, spacing, typography, shadows, and borders. Here is a production-ready example:

```css
/* src/app.css */
:root {
  /* === Colors === */
  --color-primary: #ff3e00;
  --color-primary-light: #ff6b3d;
  --color-primary-dark: #cc3200;
  --color-bg: #ffffff;
  --color-surface: #f8f8f8;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-border: #e0e0e0;

  /* === Spacing === */
  --space-xs: 0.25rem;   /* 4px */
  --space-sm: 0.5rem;    /* 8px */
  --space-md: 1rem;      /* 16px */
  --space-lg: 1.5rem;    /* 24px */
  --space-xl: 2rem;      /* 32px */
  --space-2xl: 3rem;     /* 48px */
  --space-3xl: 4rem;     /* 64px */

  /* === Typography === */
  --font-body: 'Inter', system-ui, sans-serif;
  --font-heading: 'Inter', system-ui, sans-serif;
  --font-mono: 'Fira Code', monospace;

  --text-xs: 0.75rem;    /* 12px */
  --text-sm: 0.875rem;   /* 14px */
  --text-base: 1rem;     /* 16px */
  --text-lg: 1.25rem;    /* 20px */
  --text-xl: 1.5rem;     /* 24px */
  --text-2xl: 2rem;      /* 32px */
  --text-3xl: 2.5rem;    /* 40px */

  /* === Borders & Radius === */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;

  /* === Shadows === */
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.15);
}
```

## Using Tokens in Components

Once your tokens are defined, use them consistently in every component:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description: string;
  }

  let { title, description }: Props = $props();
</script>

<article class="card">
  <h3>{title}</h3>
  <p>{description}</p>
</article>

<style>
  .card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-lg);
    box-shadow: var(--shadow-sm);
  }

  .card:hover {
    box-shadow: var(--shadow-md);
  }

  h3 {
    font-family: var(--font-heading);
    font-size: var(--text-lg);
    color: var(--color-text);
    margin: 0 0 var(--space-sm);
  }

  p {
    font-size: var(--text-base);
    color: var(--color-text-muted);
    margin: 0;
  }
</style>
```

Notice how zero raw values appear in the component styles. Everything references a token. If you decide to change your spacing scale or color palette, update the tokens and every component follows.

## Naming Conventions

Good token names are descriptive and hierarchical:

```css
/* Category → Variant → Modifier */
--color-primary
--color-primary-light
--color-primary-dark

--space-sm
--space-md
--space-lg

--text-sm
--text-base
--text-lg
```

Avoid names tied to specific values like `--blue-500` or `--padding-16`. Use semantic names that describe the purpose: `--color-primary`, `--space-md`, `--text-lg`.

## Try It

Create a complete design token system in your `src/app.css` with at least 5 colors, 5 spacing values, and 3 font sizes. Build a Card component and a Button component that use only tokens — no raw values in the component styles. Then try changing a token value and see how it cascades through your entire app.

## Key Takeaways

- **Design tokens** are named values representing design decisions (colors, spacing, fonts)
- Define all tokens on `:root` in `src/app.css` as a single source of truth
- Cover **colors**, **spacing**, **typography**, **borders**, and **shadows**
- Components should reference tokens instead of using raw values
- Use semantic, hierarchical names like `--color-primary` and `--space-md`
- Changing a token value automatically updates every component that uses it
