# Theme Customization

Your Tailwind configuration is not just a settings file — it is the single source of truth for your design system. Every color, spacing value, font, and breakpoint you define creates the boundaries within which your entire team operates. When a designer says "use the primary color," there should be exactly one answer, and it should live in your theme.

Tailwind CSS v4 introduced a fundamental shift: instead of a JavaScript `tailwind.config.js`, you define design tokens directly in CSS using the `@theme` directive. This is more than a syntax change. It means your tokens participate in the CSS cascade, they are visible to browser DevTools, and they compose naturally with CSS custom properties. Your design system becomes a first-class citizen of the platform.

## Design Tokens: The Bridge Between Design and Code

Design tokens are the atomic values of your design system — colors, spacing, typography, shadows, radii. They are the contract between designers working in Figma and developers writing Tailwind classes. When this contract is explicit and shared, two things happen: designers stop inventing one-off values, and developers stop guessing which shade of blue to use.

In Figma, your design team defines tokens like `color/brand/500` or `spacing/page-gutter`. In Tailwind v4, you express those same tokens in CSS:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  /* These names map directly to Figma token names */
  --color-brand-500: #6366f1;
  --spacing-page-gutter: 1.5rem;
  --font-heading: 'Cal Sans', 'Inter', sans-serif;
}
```

The key insight: if your Figma tokens and your `@theme` tokens share a naming convention, designers can communicate in the same language as your utility classes. `bg-brand-500` means the same thing in a Figma spec and in your HTML. That alignment eliminates an entire category of "does this look right?" back-and-forth.

## The @theme Directive

The `@theme` directive is where you declare your custom design tokens. Every token you add automatically generates the corresponding Tailwind utility classes:

```css
@import 'tailwindcss';

@theme {
  --color-brand: #6366f1;
  --color-brand-light: #818cf8;
  --color-brand-dark: #4f46e5;

  --color-surface: #ffffff;
  --color-surface-hover: #f8fafc;

  --color-accent: #f59e0b;
}
```

Defining `--color-brand` gives you `text-brand`, `bg-brand`, `border-brand`, `ring-brand`, `shadow-brand`, and every other color utility — automatically. You never register these classes manually. The naming convention is the API.

## Extending vs Overriding the Default Theme

This is a critical architectural decision that teams often get wrong. Tailwind ships with a comprehensive default theme — colors like `red-500`, spacing like `p-4`, breakpoints like `md:`. You have two choices:

**Extending** adds your tokens alongside the defaults. Your team can use both `bg-brand-500` and `bg-blue-500`. This is the right choice when you want Tailwind's defaults as a fallback for prototyping, internal tools, or cases where your design system does not have an opinion.

```css
@theme {
  /* Adds brand colors alongside default colors */
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
}
```

**Overriding** replaces the defaults entirely using `@theme inline`. This is the right choice for production applications with a strict design system. If your designer did not define a color, your developers should not be using it:

```css
@theme inline {
  /* ONLY these colors exist. No default red, blue, green, etc. */
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-neutral-50: #fafafa;
  --color-neutral-900: #171717;
}
```

The principle: **extend for flexibility, override for consistency.** In my experience, mature design systems override. You want `bg-blue-400` to fail loudly rather than silently produce an off-brand color.

## Custom Color Scales: Light and Dark Mode with CSS Custom Properties

A well-designed color palette works across both light and dark modes. The pattern that scales best is defining semantic color tokens that reference mode-specific CSS custom properties:

```css
/* Define mode-specific values as regular CSS custom properties */
:root {
  --ui-bg: #ffffff;
  --ui-bg-elevated: #f8fafc;
  --ui-text: #0f172a;
  --ui-text-muted: #64748b;
  --ui-border: #e2e8f0;
}

:root.dark {
  --ui-bg: #0f172a;
  --ui-bg-elevated: #1e293b;
  --ui-text: #f1f5f9;
  --ui-text-muted: #94a3b8;
  --ui-border: #334155;
}

/* Reference them in your theme */
@theme {
  --color-bg: var(--ui-bg);
  --color-bg-elevated: var(--ui-bg-elevated);
  --color-text: var(--ui-text);
  --color-text-muted: var(--ui-text-muted);
  --color-border: var(--ui-border);

  /* Brand colors stay constant across modes */
  --color-brand-50: #eef2ff;
  --color-brand-100: #e0e7ff;
  --color-brand-200: #c7d2fe;
  --color-brand-300: #a5b4fc;
  --color-brand-400: #818cf8;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;
  --color-brand-800: #3730a3;
  --color-brand-900: #312e81;
  --color-brand-950: #1e1b4b;
}
```

Now your components use semantic tokens that automatically adapt:

```svelte
<div class="bg-bg text-text border border-border rounded-xl p-6">
  <h3 class="text-lg font-semibold">This card works in both modes</h3>
  <p class="text-text-muted mt-2">
    The background, text, and border colors swap automatically
    when the <code>dark</code> class is toggled on the root.
  </p>
  <button class="mt-4 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg">
    Brand stays consistent
  </button>
</div>
```

The mental model: **semantic tokens** (`bg`, `text`, `border`) change with the mode. **Brand tokens** (`brand-500`) stay constant. This separation means your brand identity is preserved while the surrounding chrome adapts.

## Custom Spacing, Font Sizes, and Breakpoints

When your design spec calls for a spacing scale that does not match Tailwind's defaults, define your own. The goal is to make the "right" spacing value easy to reach for and the "wrong" value impossible:

```css
@theme {
  /* Custom spacing for a design spec that uses an 8px grid */
  --spacing-0: 0;
  --spacing-1: 0.25rem;  /* 4px */
  --spacing-2: 0.5rem;   /* 8px */
  --spacing-3: 0.75rem;  /* 12px */
  --spacing-4: 1rem;     /* 16px */
  --spacing-6: 1.5rem;   /* 24px */
  --spacing-8: 2rem;     /* 32px */
  --spacing-12: 3rem;    /* 48px */
  --spacing-16: 4rem;    /* 64px */
  --spacing-24: 6rem;    /* 96px */

  /* Custom font sizes with matched line heights */
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
  --text-base: 1rem;
  --text-base--line-height: 1.625rem;
  --text-lg: 1.125rem;
  --text-lg--line-height: 1.75rem;
  --text-xl: 1.25rem;
  --text-xl--line-height: 1.875rem;
  --text-2xl: 1.5rem;
  --text-2xl--line-height: 2rem;
  --text-4xl: 2.25rem;
  --text-4xl--line-height: 2.75rem;

  /* Content width constraints */
  --width-content: 65ch;
  --width-wide: 80rem;
  --width-narrow: 28rem;

  /* Custom breakpoints to match your design grid */
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
}
```

The `--line-height` suffix convention is how Tailwind v4 pairs line heights with font sizes. When you write `text-base`, you get both the font size and its matched line height. This is a detail that separates polished typography from "close enough."

## The @apply Directive: Use Sparingly

`@apply` lets you extract repeated utility patterns into a CSS class. It is the escape hatch for when utility classes become unwieldy:

```css
/* When a button pattern repeats across dozens of components */
.btn {
  @apply px-4 py-2 rounded-lg font-medium transition-colors;
}

.btn-primary {
  @apply btn bg-brand-500 text-white hover:bg-brand-600;
}

.btn-secondary {
  @apply btn bg-bg-elevated text-text border border-border hover:bg-surface-hover;
}
```

**When to use `@apply`:** Shared component styles that appear 10+ times and are unlikely to diverge. Form inputs, buttons, and badge variants are good candidates.

**When NOT to use `@apply`:** One-off layouts, page-specific styles, or anything you could handle with a Svelte component. If you find yourself `@apply`-ing everything, you have lost the benefit of utility-first CSS. You are just writing CSS with extra steps.

The rule of thumb: if you are extracting a pattern, ask yourself whether a Svelte component would be better. A `<Button variant="primary">` component is almost always preferable to a `.btn-primary` CSS class, because the component can enforce props, slots, and accessibility attributes that CSS cannot.

## Plugins: Extending Tailwind with Custom Utilities

When `@theme` is not enough, plugins let you register entirely new utilities, components, or variants. In Tailwind v4, you write plugins as CSS using `@plugin` or as JavaScript modules:

```css
@import 'tailwindcss';
@plugin './plugins/text-shadow.js';
```

```js
// plugins/text-shadow.js
export default function ({ matchUtilities, theme }) {
  matchUtilities(
    {
      'text-shadow': (value) => ({
        textShadow: value,
      }),
    },
    {
      values: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.1)',
        DEFAULT: '0 2px 4px rgba(0, 0, 0, 0.1)',
        lg: '0 4px 8px rgba(0, 0, 0, 0.15)',
        none: 'none',
      },
    }
  );
}
```

Now you can use `text-shadow`, `text-shadow-sm`, `text-shadow-lg`, and `text-shadow-none` as regular utility classes. Plugins are the right tool when you need utilities that Tailwind does not ship — text shadows, scroll-snap helpers, or domain-specific patterns for your application.

## Real Example: A Complete Brand Theme

Here is a production-ready theme configuration for a SaaS product. Notice how every decision is intentional — the spacing scale uses an 8px grid, the colors support light/dark modes, and the typography is paired with line heights:

```css
@import 'tailwindcss';

/* Mode-specific semantic colors */
:root {
  --ui-bg: #ffffff;
  --ui-bg-elevated: #f8fafc;
  --ui-bg-sunken: #f1f5f9;
  --ui-text: #0f172a;
  --ui-text-muted: #64748b;
  --ui-border: #e2e8f0;
  --ui-ring: #6366f1;
}

:root.dark {
  --ui-bg: #020617;
  --ui-bg-elevated: #0f172a;
  --ui-bg-sunken: #020617;
  --ui-text: #f1f5f9;
  --ui-text-muted: #94a3b8;
  --ui-border: #1e293b;
  --ui-ring: #818cf8;
}

@theme {
  /* Semantic surface colors */
  --color-bg: var(--ui-bg);
  --color-bg-elevated: var(--ui-bg-elevated);
  --color-bg-sunken: var(--ui-bg-sunken);
  --color-text: var(--ui-text);
  --color-text-muted: var(--ui-text-muted);
  --color-border: var(--ui-border);
  --color-ring: var(--ui-ring);

  /* Brand palette */
  --color-brand-50: #eef2ff;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;

  /* Feedback colors */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;

  /* Typography */
  --font-heading: 'Cal Sans', 'Inter', sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Spacing (8px grid) */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;
  --spacing-128: 32rem;

  /* Widths */
  --width-content: 65ch;
  --width-wide: 80rem;
  --width-sidebar: 16rem;
}
```

And a component that uses the full theme:

```svelte
<div class="min-h-screen bg-bg text-text font-body">
  <header class="border-b border-border bg-bg-elevated px-6 py-4">
    <h1 class="font-heading text-2xl font-bold">Acme Dashboard</h1>
  </header>

  <div class="flex">
    <aside class="w-sidebar border-r border-border bg-bg-elevated p-6">
      <nav class="space-y-1">
        <a href="/home" class="block rounded-lg bg-brand-50 px-4 py-2 text-brand-700 font-medium">
          Home
        </a>
        <a href="/settings" class="block rounded-lg px-4 py-2 text-text-muted hover:bg-bg-sunken">
          Settings
        </a>
      </nav>
    </aside>

    <main class="flex-1 p-8">
      <div class="mx-auto max-w-content">
        <div class="rounded-xl border border-border bg-bg-elevated p-6">
          <h2 class="font-heading text-xl font-semibold">Welcome back</h2>
          <p class="mt-2 text-text-muted">
            Everything uses semantic tokens. Toggle dark mode and it all adapts.
          </p>
          <div class="mt-4 flex gap-3">
            <button class="rounded-lg bg-brand-500 px-4 py-2 text-white hover:bg-brand-600">
              Primary
            </button>
            <button class="rounded-lg border border-border px-4 py-2 text-text hover:bg-bg-sunken">
              Secondary
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
```

## Try It

Build a complete theme for a fictional brand. Define: (1) a full brand color scale with at least five shades, (2) semantic surface colors that work in both light and dark mode using CSS custom properties, (3) two custom font families, (4) at least two custom spacing values, and (5) a custom width token. Then build a card component that uses your brand colors for the header, your body font for text, semantic colors for the background and borders, and your custom spacing for padding. Add a hover state using a darker brand shade, and verify it works in both light and dark modes.

## Key Takeaways

- Your `@theme` is the design system boundary — it defines what is "on brand" and what is not
- Extending the default theme adds flexibility; overriding it enforces consistency. Mature design systems override
- Semantic color tokens (via CSS custom properties) let you support light/dark modes without duplicating component markup
- Brand colors stay constant across modes; surface and text colors adapt
- Pair font sizes with line heights using the `--line-height` suffix convention for polished typography
- Use `@apply` for heavily repeated patterns (buttons, inputs), but prefer Svelte components over CSS classes for reuse
- Plugins extend Tailwind with custom utilities when `@theme` alone is not enough
- Design tokens are the contract between Figma and code — shared naming eliminates an entire class of miscommunication
