# Design Tokens

A **design token** is a named value that represents a design decision — a specific color, a spacing size, a font weight, a border radius. Instead of scattering raw values like `#ff3e00` or `16px` throughout your code, you give each value a meaningful name and store it in one place. This creates a single source of truth for your entire design system.

Design tokens are the bridge between design and code. Designers work in tools like Figma using named styles. Developers work in CSS using custom properties. Design tokens are the shared vocabulary that connects both worlds. When a designer changes "primary blue" in Figma, the corresponding token updates in code, and every component follows.

In this lesson, you will build a complete, production-grade token system for a SvelteKit project. You will learn token categories, naming conventions, the critical difference between primitive and semantic tokens, multi-theme support, and how to scale a token system from a solo project to a multi-team design system.

## The Two-Layer Token Architecture

The most important concept in token design is the **two-layer architecture**: primitive tokens and semantic tokens. This separation is what makes a token system flexible enough to support multiple themes, brands, and contexts.

### Primitive tokens (the palette)

Primitive tokens are raw values with descriptive names. They describe **what** the value is, not **why** it is used:

```css
:root {
  /* Primitive color tokens — the palette */
  --orange-50: #fff7ed;
  --orange-100: #ffedd5;
  --orange-200: #fed7aa;
  --orange-300: #fdba74;
  --orange-400: #fb923c;
  --orange-500: #f97316;
  --orange-600: #ea580c;
  --orange-700: #c2410c;
  --orange-800: #9a3412;
  --orange-900: #7c2d12;

  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --gray-950: #030712;

  --blue-500: #3b82f6;
  --blue-600: #2563eb;
  --green-500: #22c55e;
  --green-600: #16a34a;
  --red-500: #ef4444;
  --red-600: #dc2626;
  --yellow-500: #eab308;
  --yellow-600: #ca8a04;

  --white: #ffffff;
  --black: #000000;
}
```

Primitive tokens are stable. `--orange-500` is always `#f97316` regardless of theme. These are the building blocks.

### Semantic tokens (the meaning)

Semantic tokens describe **why** a value is used, not what it is. They reference primitive tokens:

```css
:root {
  /* Semantic color tokens — what colors mean */
  --color-primary: var(--orange-500);
  --color-primary-hover: var(--orange-600);
  --color-primary-active: var(--orange-700);
  --color-primary-subtle: var(--orange-50);

  --color-bg: var(--white);
  --color-bg-elevated: var(--white);
  --color-surface: var(--gray-50);
  --color-surface-hover: var(--gray-100);

  --color-text: var(--gray-900);
  --color-text-secondary: var(--gray-600);
  --color-text-tertiary: var(--gray-400);
  --color-text-inverse: var(--white);

  --color-border: var(--gray-200);
  --color-border-strong: var(--gray-300);

  --color-success: var(--green-500);
  --color-success-subtle: #ecfdf5;
  --color-warning: var(--yellow-500);
  --color-warning-subtle: #fffbeb;
  --color-error: var(--red-500);
  --color-error-subtle: #fef2f2;
  --color-info: var(--blue-500);
  --color-info-subtle: #eff6ff;
}
```

Now your components use `--color-primary`, never `--orange-500` directly. When you switch to a dark theme, you remap `--color-primary` to a different primitive, and every component updates. When marketing decides to rebrand from orange to purple, you change one line: `--color-primary: var(--purple-500)`.

### Why two layers?

Components should never reference primitive tokens directly. If fifty components use `--orange-500`, and you switch themes, you need to remap `--orange-500` to a different color — but `--orange-500` semantically means "that specific shade of orange." Remapping it breaks the mental model.

With two layers, theming becomes simple: primitive tokens stay constant, semantic tokens change per theme. Components reference semantic tokens only.

## Token Categories

A production token system covers six categories. Here is each one with the reasoning behind the scale choices.

### 1. Color tokens

Already covered above. The key insight: define more semantic tokens than you think you need. You will need `--color-text`, `--color-text-secondary`, and `--color-text-tertiary` at minimum. You will need `--color-bg`, `--color-surface`, and `--color-bg-elevated`. Stingy color semantics lead to hacks later.

### 2. Spacing tokens

Use a scale based on a consistent unit (4px or 8px base). The scale should feel mathematical but serve visual design:

```css
:root {
  /* Spacing — 4px base unit */
  --space-0: 0;
  --space-px: 1px;
  --space-0-5: 0.125rem;  /* 2px */
  --space-1: 0.25rem;     /* 4px */
  --space-1-5: 0.375rem;  /* 6px */
  --space-2: 0.5rem;      /* 8px */
  --space-3: 0.75rem;     /* 12px */
  --space-4: 1rem;        /* 16px */
  --space-5: 1.25rem;     /* 20px */
  --space-6: 1.5rem;      /* 24px */
  --space-8: 2rem;        /* 32px */
  --space-10: 2.5rem;     /* 40px */
  --space-12: 3rem;       /* 48px */
  --space-16: 4rem;       /* 64px */
  --space-20: 5rem;       /* 80px */
  --space-24: 6rem;       /* 96px */
}
```

Why not linear? Because visual design needs tighter steps at small sizes (the difference between 4px and 8px is significant) and bigger jumps at large sizes (the difference between 80px and 84px is negligible). This mirrors how Tailwind, Material, and every major design system structures their spacing scale.

### 3. Typography tokens

Typography tokens cover font families, sizes, weights, line heights, and letter spacing:

```css
:root {
  /* Font families */
  --font-sans: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-serif: 'Georgia', 'Times New Roman', serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;

  /* Font sizes — modular scale (ratio ~1.25) */
  --text-xs: 0.75rem;     /* 12px */
  --text-sm: 0.875rem;    /* 14px */
  --text-base: 1rem;      /* 16px */
  --text-lg: 1.125rem;    /* 18px */
  --text-xl: 1.25rem;     /* 20px */
  --text-2xl: 1.5rem;     /* 24px */
  --text-3xl: 1.875rem;   /* 30px */
  --text-4xl: 2.25rem;    /* 36px */
  --text-5xl: 3rem;       /* 48px */

  /* Font weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* Line heights */
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  /* Letter spacing */
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
}
```

The modular scale (each step roughly 1.25x the previous) creates a natural visual hierarchy. You do not need to memorize the values — the scale handles the proportions.

### 4. Shadow tokens

Shadows create depth. Use an elevation system where higher numbers mean more perceived depth:

```css
:root {
  --shadow-xs: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  --shadow-2xl: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  --shadow-inner: inset 0 2px 4px 0 rgba(0, 0, 0, 0.05);
  --shadow-none: 0 0 0 0 transparent;

  /* Focus ring — consistent across all interactive elements */
  --ring-width: 2px;
  --ring-color: var(--color-primary);
  --ring-offset: 2px;
  --shadow-ring: 0 0 0 var(--ring-offset) var(--color-bg),
                 0 0 0 calc(var(--ring-offset) + var(--ring-width)) var(--ring-color);
}
```

The focus ring shadow deserves special attention. Using a box-shadow for focus rings (instead of `outline`) gives you rounded corners and consistent styling. The offset ensures the ring does not overlap the element's border.

### 5. Border and radius tokens

```css
:root {
  /* Border widths */
  --border-width-0: 0;
  --border-width-1: 1px;
  --border-width-2: 2px;
  --border-width-4: 4px;

  /* Border radii */
  --radius-none: 0;
  --radius-sm: 0.125rem;   /* 2px */
  --radius-md: 0.375rem;   /* 6px */
  --radius-lg: 0.5rem;     /* 8px */
  --radius-xl: 0.75rem;    /* 12px */
  --radius-2xl: 1rem;      /* 16px */
  --radius-full: 9999px;   /* pill shape */
}
```

### 6. Motion and transition tokens

Motion tokens prevent inconsistent animation speeds across your app:

```css
:root {
  /* Durations */
  --duration-75: 75ms;
  --duration-100: 100ms;
  --duration-150: 150ms;
  --duration-200: 200ms;
  --duration-300: 300ms;
  --duration-500: 500ms;

  /* Easing curves */
  --ease-linear: linear;
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* Composite transition tokens */
  --transition-colors: color, background-color, border-color, text-decoration-color, fill, stroke;
  --transition-shadow: box-shadow;
  --transition-transform: transform;
}
```

### 7. Layout and breakpoint tokens

Breakpoints cannot be used as custom properties in media queries (media queries cannot use `var()`). But layout constants work well as tokens:

```css
:root {
  /* Container widths */
  --container-sm: 640px;
  --container-md: 768px;
  --container-lg: 1024px;
  --container-xl: 1280px;
  --container-max: 1400px;

  /* Layout constants */
  --header-height: 64px;
  --sidebar-width: 280px;
  --footer-height: 200px;

  /* Z-index scale — avoid z-index: 9999 wars */
  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-overlay: 1300;
  --z-modal: 1400;
  --z-popover: 1500;
  --z-toast: 1600;
  --z-tooltip: 1700;
}
```

The z-index scale deserves emphasis. Without agreed-upon values, developers escalate z-index in an arms race. A named scale prevents `z-index: 99999` from ever appearing in your codebase.

## Using Tokens in Components

Once your tokens are defined, use them consistently in every component. The rule is simple: **no raw values in component styles**:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description: string;
    href?: string;
    children?: Snippet;
  }

  let { title, description, href, children }: Props = $props();
</script>

{#if href}
  <a {href} class="card">
    <h3>{title}</h3>
    <p>{description}</p>
    {#if children}{@render children()}{/if}
  </a>
{:else}
  <article class="card">
    <h3>{title}</h3>
    <p>{description}</p>
    {#if children}{@render children()}{/if}
  </article>
{/if}

<style>
  .card {
    display: block;
    background: var(--color-surface);
    border: var(--border-width-1) solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--space-6);
    box-shadow: var(--shadow-sm);
    transition: box-shadow var(--duration-200) var(--ease-out),
                transform var(--duration-200) var(--ease-out);
    text-decoration: none;
    color: inherit;
  }

  .card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-2px);
  }

  .card:focus-visible {
    outline: none;
    box-shadow: var(--shadow-ring);
  }

  h3 {
    font-family: var(--font-sans);
    font-size: var(--text-lg);
    font-weight: var(--font-semibold);
    color: var(--color-text);
    line-height: var(--leading-tight);
    margin: 0 0 var(--space-2);
  }

  p {
    font-size: var(--text-base);
    color: var(--color-text-secondary);
    line-height: var(--leading-normal);
    margin: 0;
  }
</style>
```

Notice how zero raw values appear in the component styles. Everything references a token. If you decide to change your spacing scale or color palette, update the tokens and every component follows.

## Naming Conventions

Token naming is one of those things that feels trivial until you have 200 tokens and cannot find anything. Here are the conventions that scale.

### Hierarchical naming: category-variant-modifier

```css
/* Pattern: --{category}-{variant}-{modifier} */

/* Colors */
--color-primary
--color-primary-hover
--color-primary-active
--color-primary-subtle

/* Spacing */
--space-1
--space-2
--space-4

/* Typography */
--text-sm
--text-base
--text-lg
--font-sans
--font-mono
--leading-normal
--leading-tight
```

### What to avoid

```css
/* Avoid value-based names — they break when values change */
--blue-button        /* What if the button becomes green? */
--padding-16         /* What if 16px becomes 20px? */
--header-60px        /* Tightly coupled to the value */

/* Avoid abbreviations that are unclear */
--clr-p              /* --color-primary is searchable */
--sp-3               /* --space-3 is readable */

/* Avoid names tied to a specific component */
--card-header-title-color  /* Too specific; use --color-text */
```

### Semantic vs primitive names in practice

```css
/* Primitive: WHAT the color is */
--orange-500: #f97316;

/* Semantic: WHY the color is used */
--color-primary: var(--orange-500);

/* Component tokens: HOW the semantic token is applied */
/* These are defined within the component, not globally */
.button {
  --btn-bg: var(--color-primary);
  --btn-text: var(--color-text-inverse);
}
```

This creates three tiers: primitives (stable values), semantics (design intent), and component tokens (local application). Not every project needs all three, but the mental model helps you decide where a new token belongs.

## Multi-Theme Token Swapping

The two-layer architecture makes multi-theme support straightforward. Primitive tokens stay constant; semantic tokens change per theme:

```css
/* Light theme (default) */
:root {
  --color-bg: var(--white);
  --color-surface: var(--gray-50);
  --color-text: var(--gray-900);
  --color-text-secondary: var(--gray-600);
  --color-border: var(--gray-200);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

/* Dark theme */
:root.dark {
  --color-bg: var(--gray-950);
  --color-surface: var(--gray-900);
  --color-text: var(--gray-50);
  --color-text-secondary: var(--gray-400);
  --color-border: var(--gray-800);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
}

/* High contrast theme (accessibility) */
:root.high-contrast {
  --color-bg: var(--white);
  --color-surface: var(--white);
  --color-text: var(--black);
  --color-text-secondary: var(--black);
  --color-border: var(--black);
  --color-primary: #0000cc;
}
```

Components never change. They always use `var(--color-text)` and the right value appears based on which theme class is on the `<html>` element.

## Generating Tokens from Figma

In a production design system workflow, tokens often originate in Figma and are exported to code. Here is a practical workflow.

### Figma setup

1. In Figma, create a **local styles** library with named color styles (e.g., "primary/500", "gray/200")
2. Use the **Tokens Studio** plugin (formerly Figma Tokens) to define tokens with the two-layer architecture
3. Export tokens as JSON

### Token transformation

The exported JSON looks like this:

```json
{
  "color": {
    "primary": { "value": "{orange.500}", "type": "color" },
    "bg": { "value": "{white}", "type": "color" },
    "text": { "value": "{gray.900}", "type": "color" }
  },
  "space": {
    "1": { "value": "4px", "type": "spacing" },
    "2": { "value": "8px", "type": "spacing" },
    "4": { "value": "16px", "type": "spacing" }
  }
}
```

A build script transforms this JSON into CSS custom properties:

```typescript
// scripts/generate-tokens.ts
import { readFileSync, writeFileSync } from 'fs';

interface Token {
  value: string;
  type: string;
}

interface TokenGroup {
  [key: string]: Token | TokenGroup;
}

function flattenTokens(
  tokens: TokenGroup,
  prefix = ''
): Array<{ name: string; value: string }> {
  const result: Array<{ name: string; value: string }> = [];

  for (const [key, token] of Object.entries(tokens)) {
    const name = prefix ? `${prefix}-${key}` : key;

    if ('value' in token && 'type' in token) {
      // Resolve references like {orange.500} → var(--orange-500)
      const value = (token as Token).value.replace(
        /\{([^}]+)\}/g,
        (_, ref: string) => `var(--${ref.replace(/\./g, '-')})`
      );
      result.push({ name: `--${name}`, value });
    } else {
      result.push(...flattenTokens(token as TokenGroup, name));
    }
  }

  return result;
}

const raw = JSON.parse(readFileSync('tokens.json', 'utf-8'));
const tokens = flattenTokens(raw);

const css = `:root {\n${tokens.map(t => `  ${t.name}: ${t.value};`).join('\n')}\n}\n`;
writeFileSync('src/lib/styles/tokens.css', css);

console.log(`Generated ${tokens.length} tokens`);
```

Run this script in your CI pipeline so tokens stay synchronized between Figma and code.

## Building a Complete Token System File

Here is the full, copy-paste-ready token file for a production SvelteKit project:

```css
/* src/lib/styles/tokens.css
 * Design token system — single source of truth.
 * Import this in src/app.css with @import './lib/styles/tokens.css';
 *
 * Architecture:
 * 1. Primitives — raw values (colors, raw numbers)
 * 2. Semantic tokens — design intent (what colors mean)
 * 3. Component tokens — defined within individual components
 */

/* ============================================
   PRIMITIVES
   ============================================ */
:root {
  /* --- Color Palette --- */
  --orange-50: #fff7ed;
  --orange-100: #ffedd5;
  --orange-500: #f97316;
  --orange-600: #ea580c;
  --orange-700: #c2410c;

  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;
  --gray-950: #030712;

  --blue-50: #eff6ff;
  --blue-500: #3b82f6;
  --green-50: #ecfdf5;
  --green-500: #22c55e;
  --red-50: #fef2f2;
  --red-500: #ef4444;
  --yellow-50: #fffbeb;
  --yellow-500: #eab308;

  --white: #ffffff;
  --black: #000000;
}

/* ============================================
   SEMANTIC TOKENS (Light Theme — default)
   ============================================ */
:root {
  /* --- Colors --- */
  --color-primary: var(--orange-500);
  --color-primary-hover: var(--orange-600);
  --color-primary-active: var(--orange-700);
  --color-primary-subtle: var(--orange-50);

  --color-bg: var(--white);
  --color-surface: var(--gray-50);
  --color-surface-hover: var(--gray-100);
  --color-text: var(--gray-900);
  --color-text-secondary: var(--gray-600);
  --color-text-tertiary: var(--gray-400);
  --color-text-inverse: var(--white);
  --color-border: var(--gray-200);
  --color-border-strong: var(--gray-300);

  --color-success: var(--green-500);
  --color-success-subtle: var(--green-50);
  --color-error: var(--red-500);
  --color-error-subtle: var(--red-50);
  --color-warning: var(--yellow-500);
  --color-warning-subtle: var(--yellow-50);
  --color-info: var(--blue-500);
  --color-info-subtle: var(--blue-50);

  /* --- Spacing --- */
  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;

  /* --- Typography --- */
  --font-sans: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.5rem;
  --text-3xl: 1.875rem;
  --text-4xl: 2.25rem;
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  --leading-tight: 1.25;
  --leading-normal: 1.5;
  --leading-relaxed: 1.75;

  /* --- Borders & Radius --- */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* --- Shadows --- */
  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);

  /* --- Motion --- */
  --duration-fast: 150ms;
  --duration-normal: 300ms;
  --duration-slow: 500ms;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

  /* --- Layout --- */
  --container-max: 1200px;
  --header-height: 64px;
  --z-dropdown: 1000;
  --z-sticky: 1100;
  --z-overlay: 1300;
  --z-modal: 1400;
  --z-toast: 1600;
}

/* ============================================
   DARK THEME (semantic token overrides)
   ============================================ */
:root.dark {
  --color-primary: var(--orange-400, #fb923c);
  --color-primary-hover: var(--orange-500);
  --color-primary-active: var(--orange-600);
  --color-primary-subtle: rgba(249, 115, 22, 0.15);

  --color-bg: var(--gray-950);
  --color-surface: var(--gray-900);
  --color-surface-hover: var(--gray-800);
  --color-text: var(--gray-50);
  --color-text-secondary: var(--gray-400);
  --color-text-tertiary: var(--gray-500);
  --color-text-inverse: var(--gray-900);
  --color-border: var(--gray-800);
  --color-border-strong: var(--gray-700);

  --color-success-subtle: rgba(34, 197, 94, 0.15);
  --color-error-subtle: rgba(239, 68, 68, 0.15);
  --color-warning-subtle: rgba(234, 179, 8, 0.15);
  --color-info-subtle: rgba(59, 130, 246, 0.15);

  --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 20px 25px rgba(0, 0, 0, 0.4);
}

/* ============================================
   RESPONSIVE ADJUSTMENTS
   ============================================ */
@media (max-width: 768px) {
  :root {
    --text-3xl: 1.5rem;
    --text-4xl: 1.875rem;
    --space-12: 2rem;
    --space-16: 3rem;
    --space-20: 4rem;
    --header-height: 56px;
  }
}
```

## Auditing Token Usage

Over time, tokens accumulate. Some become unused, and new raw values sneak in. Periodic audits keep the system healthy.

### Finding raw values in components

Search for raw values that should be tokens:

```bash
# Find hex colors in Svelte component styles
grep -rn '#[0-9a-fA-F]\{3,8\}' src/lib/components/ --include="*.svelte"

# Find pixel values that should be spacing tokens
grep -rn '[0-9]\+px' src/lib/components/ --include="*.svelte"

# Find raw rgba/rgb values
grep -rn 'rgba\?\s*(' src/lib/components/ --include="*.svelte"
```

Any hit is a candidate for replacement with a token. Zero raw values in component styles is the goal.

### Finding unused tokens

```bash
# List all defined tokens
grep -oP '--[\w-]+(?=:)' src/lib/styles/tokens.css | sort -u > defined-tokens.txt

# List all referenced tokens
grep -ohrP 'var\(--[\w-]+' src/ --include="*.svelte" --include="*.css" \
  | sed 's/var(//g' | sort -u > used-tokens.txt

# Find unused tokens
comm -23 defined-tokens.txt used-tokens.txt
```

Run this in CI to prevent token bloat. Every unused token is cognitive overhead for the next developer who opens the file.

## Try It

1. **Foundation exercise**: Create a complete design token system in `src/lib/styles/tokens.css` with primitives and semantic tokens. Cover at least colors (8 primitives, 10 semantic), spacing (8 steps), typography (5 sizes, 2 families), shadows (4 levels), and radii (4 sizes). Build a Card component and a Button component that use only semantic tokens — no raw values and no primitive token references in the component styles.

2. **Theme exercise**: Add a dark theme override section to your tokens file. Remap all semantic color tokens to dark-appropriate values. Toggle the `.dark` class on `<html>` and verify every component updates without any component-level changes.

3. **Audit exercise**: Run the raw-value detection grep commands above against your component files. Fix any raw values by replacing them with token references. Then run the unused-token detection and remove any tokens that nothing references.

## Key Takeaways

- **Design tokens** are named values representing design decisions (colors, spacing, fonts, shadows, motion)
- Use a **two-layer architecture**: primitive tokens (the palette) and semantic tokens (the meaning)
- Components should reference **semantic tokens only** — never primitive tokens and never raw values
- Cover **seven categories**: colors, spacing, typography, shadows, borders, motion, and layout
- Use hierarchical naming: `--{category}-{variant}-{modifier}`
- Semantic names like `--color-primary` survive rebrands and theme changes; value-based names like `--blue-500` do not
- Multi-theme support is just remapping semantic tokens to different primitives
- Tokens can be generated from Figma exports and transformed by build scripts
- Audit regularly: grep for raw values in components and for unused tokens in the system
- A z-index scale (`--z-dropdown`, `--z-modal`, `--z-toast`) prevents z-index wars across your team
