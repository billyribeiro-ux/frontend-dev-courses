# Setting Up Tailwind v4

Tailwind CSS v4 is a major overhaul of the framework. It is faster, simpler to configure, and uses a new CSS-first approach. Gone is the `tailwind.config.js` file — customization now happens directly in your CSS using the `@theme` directive. Setup is also much simpler: one import and one Vite plugin.

This lesson walks you through installing and configuring Tailwind v4 in a SvelteKit project from scratch, then covers everything you need for a production-ready setup: VS Code IntelliSense, class sorting with Prettier, extracting components vs `@apply`, coexistence with Svelte scoped styles, and troubleshooting the issues you will actually hit.

## The Mental Model: CSS-First Configuration

Tailwind v3 used a JavaScript config file (`tailwind.config.js`) to define your design system. Tailwind v4 moves everything into CSS. This is not just a syntax change — it is a philosophical shift:

```
Tailwind v3:                          Tailwind v4:
  tailwind.config.js (JS)      →       @theme { } in app.css (CSS)
  @tailwind base;              →       @import 'tailwindcss';
  @tailwind components;        →       (automatic)
  @tailwind utilities;         →       (automatic)
  content: ['./src/**/*.svelte'] →     (automatic via Vite module graph)
  PostCSS plugin               →       Vite plugin
```

Everything that was configured in JavaScript is now configured in CSS. Everything that was manual (content scanning, base/components/utilities layers) is now automatic. The result is fewer files, fewer dependencies, and fewer things that can break.

## Installation

Install Tailwind and its Vite plugin:

```bash
npm install tailwindcss @tailwindcss/vite
```

That is it for dependencies. Tailwind v4 does not require PostCSS, a separate CLI tool, or a `tailwind.config.js` file. The Vite plugin handles everything — scanning your files for class names, generating CSS, and optimizing the output.

If you are starting a brand new SvelteKit project:

```bash
npx sv create my-app
cd my-app
npm install tailwindcss @tailwindcss/vite
```

## Adding the Vite Plugin

Open your `vite.config.ts` and add the Tailwind plugin. The order matters — Tailwind must come before SvelteKit:

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit()
  ]
});
```

### WRONG vs CORRECT: Plugin Order

```typescript
// WRONG — SvelteKit before Tailwind
export default defineConfig({
  plugins: [
    sveltekit(),     // Processes .svelte files first
    tailwindcss()    // Too late — Svelte has already compiled without Tailwind
  ]
});
// Result: missing styles, broken builds, or styles that only appear after HMR

// CORRECT — Tailwind before SvelteKit
export default defineConfig({
  plugins: [
    tailwindcss(),   // Processes CSS first
    sveltekit()      // Then Svelte has Tailwind utilities available
  ]
});
```

Why Tailwind first? The Tailwind Vite plugin needs to process CSS before SvelteKit's Vite plugin transforms `.svelte` files. If you reverse the order, you may get missing styles or build errors. This is a common setup mistake and the first thing to check when styles are not appearing.

## Importing Tailwind in CSS

Create or update your global CSS file to import Tailwind:

```css
/* src/app.css */
@import 'tailwindcss';
```

That single line gives you access to every Tailwind utility class. It replaces the old v3 approach of three separate `@tailwind base`, `@tailwind components`, and `@tailwind utilities` directives.

### WRONG vs CORRECT: CSS Import

```css
/* WRONG — v3 syntax (does not work in v4) */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* WRONG — wrong import path */
@import 'tailwindcss/base';

/* CORRECT — single v4 import */
@import 'tailwindcss';
```

Make sure this CSS file is imported in your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

Start your dev server and Tailwind is ready:

```bash
npm run dev
```

## How Tailwind v4 Content Detection Works

Tailwind v4 automatically detects which files to scan for class names. It uses the Vite module graph — any file that Vite processes (your `.svelte`, `.ts`, `.js`, `.html` files) is automatically included. You do not need to configure `content` paths like you did in v3.

However, if you have files outside the Vite module graph that contain Tailwind classes (for example, Markdown files processed by a custom plugin, or classes in a database), you can explicitly add sources:

```css
/* src/app.css */
@import 'tailwindcss';

/* Scan additional files for class names */
@source "../content/**/*.md";
@source "../data/*.json";
```

The `@source` directive tells Tailwind to scan additional paths. This is rarely needed — for most SvelteKit projects, automatic detection works perfectly.

### When @source Is Necessary

| Scenario | Need @source? | Why |
|----------|---------------|-----|
| .svelte files in src/ | No | Vite module graph includes them |
| .ts files in src/ | No | Same |
| Markdown files with Tailwind classes | Yes | Not in the Vite module graph |
| CMS content with embedded classes | Yes | External to your project |
| JSON/YAML with class names | Yes | Not processed by Vite |
| Dynamic classes from an API | Cannot detect | Use a safelist instead |

## Customizing with @theme

In Tailwind v4, customization happens in CSS using the `@theme` directive. This replaces the old `tailwind.config.js` approach entirely:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-brand: #ff3e00;
  --color-brand-light: #ff6b3d;
  --color-brand-dark: #cc3200;

  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;

  --breakpoint-xs: 30rem;
}
```

Now you can use these custom values as Tailwind utilities:

```svelte
<h1 class="text-brand font-heading text-3xl">
  Welcome to My App
</h1>

<button class="bg-brand hover:bg-brand-light text-white px-4 py-2 rounded-lg">
  Get Started
</button>
```

Every CSS variable you define in `@theme` becomes a usable utility class. The naming convention maps directly: `--color-brand` becomes `text-brand`, `bg-brand`, `border-brand`, etc. `--font-heading` becomes `font-heading`.

### The @theme Variable Naming Convention

The first segment of the variable name determines which utilities it generates:

| Variable Pattern | Generated Utilities | Example |
|-----------------|---------------------|---------|
| `--color-*` | `text-*`, `bg-*`, `border-*`, `ring-*`, etc. | `--color-primary` → `bg-primary` |
| `--font-*` | `font-*` | `--font-heading` → `font-heading` |
| `--spacing-*` | `p-*`, `m-*`, `gap-*`, `w-*`, `h-*`, etc. | `--spacing-18` → `p-18` |
| `--radius-*` | `rounded-*` | `--radius-card` → `rounded-card` |
| `--shadow-*` | `shadow-*` | `--shadow-card` → `shadow-card` |
| `--animate-*` | `animate-*` | `--animate-fade-in` → `animate-fade-in` |
| `--breakpoint-*` | `*:` (responsive prefix) | `--breakpoint-xs` → `xs:` |

Understanding this mapping is key. You are not writing arbitrary CSS variables — you are extending Tailwind's design system through a structured naming convention.

## Extending the Default Theme

Custom values in `@theme` are added alongside the default Tailwind palette — they do not replace it. You keep all of Tailwind's built-in colors, spacing, and other utilities:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  /* Custom colors (added alongside default palette) */
  --color-primary: #ff3e00;
  --color-secondary: #676778;
  --color-accent: #6c5ce7;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;

  /* Custom spacing values */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;

  /* Custom border radius */
  --radius-card: 12px;
  --radius-button: 8px;

  /* Custom shadows */
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-card-hover: 0 4px 16px rgba(0, 0, 0, 0.12);

  /* Custom animations */
  --animate-fade-in: fade-in 0.3s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

```svelte
<div class="bg-primary text-white p-18 rounded-card shadow-card hover:shadow-card-hover transition-shadow">
  Custom themed content
</div>
```

### Replacing the Default Theme

To completely replace a namespace (for example, remove all default colors and only use your own), use the `--color-*: initial` pattern:

```css
@theme {
  --color-*: initial;  /* Remove ALL default colors */

  /* Now define only the colors you want */
  --color-primary: #ff3e00;
  --color-neutral-50: #fafafa;
  --color-neutral-900: #171717;
}
```

This is useful for design system projects where you want total control over the available utilities. But use it carefully — removing default colors means `text-red-500`, `bg-blue-200`, etc. stop working. Your team must use only the custom palette.

### WRONG vs CORRECT: Theme Customization

```css
/* WRONG — defining theme variables inside a Svelte <style> block */
<style>
  @theme {
    --color-brand: #ff3e00;
  }
  /* @theme must be in app.css, not in a component's scoped styles */
  /* It will not be processed by the Tailwind Vite plugin */
</style>

/* WRONG — using tailwind.config.js (v3 approach) */
// tailwind.config.js
module.exports = {
  theme: { extend: { colors: { brand: '#ff3e00' } } }
};
/* This file is ignored in Tailwind v4 */
```

```css
/* CORRECT — @theme in app.css */
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-brand: #ff3e00;
}
```

## VS Code IntelliSense Setup

The Tailwind CSS IntelliSense extension provides autocomplete, syntax highlighting, and linting for Tailwind classes. Install it from the VS Code marketplace:

1. Search for "Tailwind CSS IntelliSense" (extension ID: `bradlc.vscode-tailwindcss`)
2. Install the extension
3. It should work automatically with Tailwind v4 and the Vite plugin

For the best experience, add these settings to your project's `.vscode/settings.json`:

```json
{
  "tailwindCSS.includeLanguages": {
    "svelte": "html"
  },
  "editor.quickSuggestions": {
    "strings": "on"
  },
  "tailwindCSS.experimental.classRegex": [
    ["class=\"([^\"]*)\"", "([a-zA-Z0-9\\-:]+)"],
    ["class=\\{`([^`]*)`\\}", "([a-zA-Z0-9\\-:]+)"]
  ],
  "files.associations": {
    "*.css": "tailwindcss"
  }
}
```

The `includeLanguages` setting ensures IntelliSense works inside `.svelte` files. The `quickSuggestions` setting triggers autocomplete inside class strings. The `classRegex` patterns help IntelliSense recognize Tailwind classes in template literal strings (which you use for conditional classes).

### Verifying IntelliSense Works

After configuring, test it:
1. Open a `.svelte` file
2. Type `class="bg-"` — you should see autocomplete suggestions for all background colors
3. Type `class="text-brand"` — your custom `@theme` colors should appear
4. Hover over a class — you should see the generated CSS

If autocomplete does not work, try: Command Palette > "Developer: Reload Window."

## Prettier Plugin for Class Sorting

Consistent class order makes your code easier to read and prevents meaningless diff noise in pull requests. The `prettier-plugin-tailwindcss` plugin automatically sorts your Tailwind classes into a consistent order:

```bash
npm install -D prettier prettier-plugin-tailwindcss prettier-plugin-svelte
```

Create or update your Prettier config:

```json
// .prettierrc
{
  "plugins": [
    "prettier-plugin-svelte",
    "prettier-plugin-tailwindcss"
  ],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
```

### WRONG vs CORRECT: Plugin Order in Prettier

```json
// WRONG — Tailwind before Svelte
{
  "plugins": [
    "prettier-plugin-tailwindcss",
    "prettier-plugin-svelte"
  ]
}
// Tailwind tries to sort classes before Svelte parsing.
// Result: broken formatting or missed class sorting in .svelte files.

// CORRECT — Svelte before Tailwind
{
  "plugins": [
    "prettier-plugin-svelte",
    "prettier-plugin-tailwindcss"
  ]
}
// Svelte parses first, then Tailwind sorts classes within the parsed output.
```

The plugin order matters: `prettier-plugin-svelte` must come before `prettier-plugin-tailwindcss`. Svelte parsing must happen first so Tailwind can find and sort the classes.

Before sorting:

```svelte
<div class="p-4 flex bg-white text-gray-900 rounded-lg shadow-sm items-center justify-between">
```

After sorting:

```svelte
<div class="flex items-center justify-between rounded-lg bg-white p-4 text-gray-900 shadow-sm">
```

The sort order follows Tailwind's recommended convention: layout (flex, grid) first, then box model (padding, margin), then visual (background, text, border), then effects (shadow, opacity).

## Extracting Components vs @apply

When you find yourself repeating the same set of Tailwind classes, you have two options: extract a Svelte component or use `@apply`. Here is when to use each.

### Extract a Svelte component (preferred)

This is almost always the right choice. Svelte components give you props, logic, and TypeScript support:

```svelte
<!-- src/lib/components/Badge.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: "default" | "success" | "warning" | "error";
    children: Snippet;
  }

  let { variant = "default", children }: Props = $props();

  const variantClasses: Record<string, string> = {
    default: "bg-gray-100 text-gray-800",
    success: "bg-green-100 text-green-800",
    warning: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800"
  };
</script>

<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium {variantClasses[variant]}">
  {@render children()}
</span>
```

### Use @apply (sparingly)

`@apply` extracts Tailwind utilities into a CSS class. Use it only for very simple, non-parameterized styles — typically for base element styles or third-party component overrides:

```css
/* src/app.css */
@import 'tailwindcss';

/* Good use of @apply — styling base elements */
@layer base {
  h1 {
    @apply text-3xl font-bold tracking-tight;
  }

  h2 {
    @apply text-2xl font-semibold;
  }

  a {
    @apply text-blue-600 underline hover:text-blue-800;
  }
}

/* Acceptable — overriding a third-party library's styles */
.prose pre {
  @apply rounded-xl bg-gray-900 p-4;
}
```

### WRONG vs CORRECT: Component Extraction

```css
/* WRONG — creating component classes with @apply */
.btn-primary {
  @apply px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700;
}
.btn-secondary {
  @apply px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50;
}
/* You have recreated CSS component classes.
   No props, no logic, no types, no conditional rendering.
   This defeats the purpose of both Tailwind AND Svelte. */
```

```svelte
<!-- CORRECT — extract a Svelte component -->
<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
    children: Snippet;
    onclick?: () => void;
  }

  let { variant = 'primary', disabled = false, children, onclick }: Props = $props();

  const base = 'px-4 py-2 rounded-lg transition-colors font-medium';
  const variants: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300',
    secondary: 'border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50'
  };
</script>

<button class="{base} {variants[variant]}" {disabled} {onclick}>
  {@render children()}
</button>
```

If you need a reusable `.btn-primary` class, you need a `<Button>` component instead. Components give you props, variants, disabled states, loading states, TypeScript types, and conditional rendering — everything `@apply` cannot.

## Tailwind + Svelte Scoped Styles Coexistence

Tailwind utility classes and Svelte's `<style>` block work together without conflict. Tailwind classes are global utilities applied via the `class` attribute. Svelte scoped styles are component-local CSS applied via `<style>`. They target elements differently and coexist naturally:

```svelte
<script lang="ts">
  let active = $state(false);
</script>

<!-- Tailwind handles layout, spacing, colors -->
<div class="flex items-center gap-4 p-6">
  <!-- Svelte scoped CSS handles complex/dynamic styles -->
  <div class="indicator" class:active>
    <span class="label">Status</span>
  </div>
</div>

<style>
  /* Scoped styles for things Tailwind cannot do cleanly */
  .indicator {
    position: relative;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #94a3b8;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .indicator.active {
    background: #10b981;
    box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.2);
  }

  .indicator::after {
    content: '';
    position: absolute;
    inset: 2px;
    border-radius: 50%;
    background: white;
  }

  .label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
```

**Use Tailwind for:** layout, spacing, typography, colors, responsive design, hover/focus states.
**Use scoped CSS for:** pseudo-elements (`::before`, `::after`), complex animations, intricate state-dependent styles, third-party component overrides.

### The Specificity Interaction

One caveat: Svelte scoped styles have higher specificity than Tailwind utilities because Svelte adds a unique class to each scoped selector. If a scoped style and a Tailwind class target the same property, the scoped style wins:

```svelte
<p class="text-blue-500">This text is NOT blue</p>

<style>
  p { color: red; }
  /* The scoped style compiles to p.svelte-abc123 { color: red; }
     This has specificity 0-1-1, which beats .text-blue-500 (0-1-0).
     The text is red, not blue. */
</style>
```

If you need the Tailwind class to win, remove the conflicting scoped style or use the `!` modifier (`text-blue-500!`) which adds `!important`.

## Conditional Classes in Svelte

Svelte provides several ways to apply classes conditionally, and each works well with Tailwind:

```svelte
<script lang="ts">
  let isActive = $state(false);
  let variant = $state<'primary' | 'danger'>('primary');
</script>

<!-- Method 1: class: directive (best for single boolean toggles) -->
<button class="px-4 py-2 rounded-lg" class:bg-blue-600={isActive}>
  Toggle
</button>

<!-- Method 2: Ternary in class string (best for switching between two states) -->
<button class="px-4 py-2 rounded-lg {isActive ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}">
  Toggle
</button>

<!-- Method 3: Object lookup (best for multiple variants) -->
<button class="px-4 py-2 rounded-lg {
  variant === 'primary' ? 'bg-blue-600 text-white hover:bg-blue-700' :
  variant === 'danger' ? 'bg-red-600 text-white hover:bg-red-700' :
  'bg-gray-100 text-gray-700'
}">
  {variant}
</button>
```

### The Dynamic Class Pitfall

```svelte
<!-- WRONG — Tailwind cannot detect dynamically constructed class names -->
<div class="text-{color}-500">Dynamic</div>
<div class="bg-{variant}-100">Dynamic</div>
<!-- The scanner searches for complete strings like "text-red-500".
     It cannot evaluate JavaScript expressions like "text-" + color + "-500". -->

<!-- CORRECT — always use complete, static class names -->
<div class={color === 'red' ? 'text-red-500' : 'text-blue-500'}>Fixed</div>
<div class={variant === 'success' ? 'bg-green-100' : 'bg-gray-100'}>Fixed</div>
```

Tailwind's scanner uses static analysis — it searches for complete class name strings in your source files. It cannot evaluate JavaScript expressions. Always use complete, static class names.

## Production Build and Purging

Tailwind v4 automatically purges unused styles in production builds. When you run `npm run build`, the Vite plugin:

1. Scans all files in the module graph for Tailwind class names
2. Generates only the CSS for classes that are actually used
3. Minifies the output

This means your production CSS bundle contains only the utilities you use — typically 5-15KB gzipped for a full application, compared to the 3MB+ unoptimized Tailwind stylesheet.

To verify your production build:

```bash
npm run build
npm run preview
```

Check the network tab in your browser's DevTools — the CSS file should be small. If it is unexpectedly large, check for dynamic class names that Tailwind cannot detect.

## Troubleshooting Common Setup Issues

### Styles not appearing

1. **Check the import order in `vite.config.ts`.** `tailwindcss()` must come before `sveltekit()`.
2. **Check that `app.css` is imported in `+layout.svelte`.** Without this import, no Tailwind styles will load.
3. **Check the CSS file contains `@import 'tailwindcss'`.** This is the only required line.
4. **Restart the dev server.** After initial setup, a fresh `npm run dev` is sometimes needed.
5. **Check for `tailwind.config.js`.** If present from a v3 setup, it might conflict. Delete it.

### IntelliSense not working in .svelte files

1. Make sure you have the Tailwind CSS IntelliSense extension installed.
2. Add `"tailwindCSS.includeLanguages": { "svelte": "html" }` to `.vscode/settings.json`.
3. Reload the VS Code window (Command Palette > "Developer: Reload Window").

### Custom @theme values not generating utilities

1. Check that `@theme` is inside `src/app.css`, not inside a `<style>` block in a Svelte component.
2. Verify the variable naming convention: `--color-brand` generates `text-brand`, `bg-brand`, etc.
3. Make sure there are no typos in the CSS variable name — Tailwind is case-sensitive.

### Classes working in dev but missing in production

This happens when class names are dynamically constructed (string interpolation). Always use complete class names so the scanner can find them. If you must use dynamic values, use the `@source` directive or explicit safelist.

### Svelte scoped styles overriding Tailwind

Svelte's scoped styles have higher specificity. If you set `color: red` in a `<style>` block and `class="text-blue-500"` on the same element, the scoped style wins. Remove the conflicting scoped style or use `!important` on the Tailwind class (e.g., `text-blue-500!`).

## Try It

Follow the installation steps to add Tailwind v4 to your SvelteKit project. Complete this checklist:

1. Install `tailwindcss` and `@tailwindcss/vite`. Add the Vite plugin to `vite.config.ts` (before `sveltekit()`).
2. Create `src/app.css` with `@import 'tailwindcss'` and import it in `+layout.svelte`.
3. Add custom brand colors using `@theme` — at least a primary, secondary, and accent color. Add a custom `--font-heading` and a custom `--radius-card`.
4. Install the Tailwind CSS IntelliSense extension and configure `.vscode/settings.json`. Verify autocomplete works for both default and custom classes.
5. Install `prettier-plugin-tailwindcss` and `prettier-plugin-svelte`. Verify class sorting works by writing an unsorted class list and running `npx prettier --write`.
6. Build a hero section using Tailwind utilities and your custom colors. Verify hover states and responsive prefixes (`sm:`, `md:`, `lg:`) work correctly.
7. Create a `<Button>` component with `variant` and `size` props instead of using `@apply`. Include at least three variants (primary, secondary, danger).
8. Build a card component that mixes Tailwind utilities (layout, spacing) with scoped CSS (pseudo-elements, complex animations). Verify both systems work together.
9. Add a conditional class that switches between two visual states using a ternary. Verify both states appear correctly in production (`npm run build && npm run preview`).
10. Run `npm run build` and check the production CSS size in the network tab. It should be under 20KB gzipped.

## Key Takeaways

- Tailwind v4 uses `@import 'tailwindcss'` in your CSS file — no config file needed
- Install `tailwindcss` and `@tailwindcss/vite` as the only dependencies — no PostCSS required
- Add the Vite plugin to `vite.config.ts` **before** the SvelteKit plugin — order matters
- Tailwind v4 automatically detects content files through the Vite module graph — no `content` config needed
- Customize your theme with the `@theme` directive directly in CSS — each variable becomes a utility based on its prefix (`--color-*` → `text-*`, `bg-*`, etc.)
- Use `--color-*: initial` to replace the entire default palette with your own
- Use `@source` to scan additional files outside the Vite module graph
- Install the VS Code IntelliSense extension and configure `includeLanguages` for `.svelte` support
- Use `prettier-plugin-tailwindcss` for consistent class ordering — it must come after `prettier-plugin-svelte`
- Extract Svelte components for reusable patterns with props, logic, and types. Reserve `@apply` for base element styles and third-party overrides only
- Tailwind utilities and Svelte scoped styles coexist naturally — but scoped styles have higher specificity and will override Tailwind classes on the same property
- Always use complete, static class name strings — Tailwind's scanner cannot evaluate dynamic expressions like `text-${color}-500`
- Import `app.css` in your root `+layout.svelte` to apply styles globally
- Production builds automatically purge unused classes — expect 5-15KB gzipped CSS
