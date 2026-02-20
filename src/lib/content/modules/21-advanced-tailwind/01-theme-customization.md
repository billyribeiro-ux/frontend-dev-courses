# Theme Customization

Tailwind CSS v4 introduces a new way to customize your design system using the `@theme` directive. Instead of a JavaScript configuration file, you define your custom tokens directly in CSS. This makes theme customization faster, more readable, and fully integrated with the CSS cascade.

The `@theme` directive lets you add custom colors, spacing values, fonts, and more — or override Tailwind's defaults entirely.

## The @theme Directive

Define custom design tokens in your main CSS file:

```css
/* src/app.css */
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

These tokens become utility classes automatically. `--color-brand` creates `text-brand`, `bg-brand`, `border-brand`, and every other color utility.

## Custom Color Scales

Create a full color scale for your brand:

```css
@theme {
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

Now use the full scale in your components:

```svelte
<button class="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg">
  Primary Action
</button>

<div class="bg-brand-50 border border-brand-200 p-4 rounded-lg">
  <p class="text-brand-900">Information panel with brand colors.</p>
</div>
```

## Custom Spacing and Sizing

Add custom spacing values for consistent layouts:

```css
@theme {
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;
  --spacing-128: 32rem;

  --width-content: 65ch;
  --width-wide: 80rem;
}
```

Use them directly in utility classes:

```svelte
<div class="max-w-content mx-auto px-6">
  <p>This content is constrained to a readable line length.</p>
</div>

<section class="max-w-wide mx-auto py-18">
  <h2>Wide section with custom padding</h2>
</section>
```

## Custom Fonts

Register custom font families in your theme:

```css
@theme {
  --font-heading: 'Cal Sans', 'Inter', sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

Apply them with font utilities:

```svelte
<h1 class="font-heading text-4xl font-bold">Welcome</h1>
<p class="font-body text-lg">This paragraph uses the body font.</p>
<code class="font-mono text-sm bg-gray-100 px-2 py-1 rounded">const x = 42;</code>
```

## Using CSS Variables for Dynamic Themes

Combine `@theme` with CSS custom properties for runtime flexibility:

```css
@theme {
  --color-primary: var(--ui-primary, #6366f1);
  --color-primary-hover: var(--ui-primary-hover, #4f46e5);
}
```

Now you can change the theme at runtime by updating the CSS variable:

```svelte
<script lang="ts">
  let hue = $state(240);
</script>

<div style="--ui-primary: hsl({hue}, 80%, 60%); --ui-primary-hover: hsl({hue}, 80%, 50%);">
  <button class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded">
    Dynamic Color
  </button>
  <input type="range" min="0" max="360" bind:value={hue} />
</div>
```

## Try It

Create a custom theme with your own brand color scale (at least 5 shades), two custom font families, and a custom spacing value. Build a card component that uses your brand colors for the header background, your body font for text, and your custom spacing for padding. Add a hover state that uses a darker shade of your brand color.

## Key Takeaways

- Tailwind v4 uses the `@theme` directive in CSS instead of a JavaScript config file
- Custom color tokens like `--color-brand` automatically generate all color utilities
- Create full color scales (50-950) for consistent, flexible color usage
- Custom spacing, width, and font tokens work the same way
- Combine `@theme` with CSS `var()` for runtime-dynamic themes
- All custom tokens are available as standard Tailwind utility classes
