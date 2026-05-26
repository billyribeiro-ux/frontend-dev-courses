# Theme Customization

Your Tailwind configuration is not just a settings file — it is the single source of truth for your design system. Every color, spacing value, font, and breakpoint you define creates the boundaries within which your entire team operates. When a designer says "use the primary color," there should be exactly one answer, and it should live in your theme.

Tailwind CSS v4 introduced a fundamental shift: instead of a JavaScript `tailwind.config.js`, you define design tokens directly in CSS using the `@theme` directive. This is more than a syntax change. It means your tokens participate in the CSS cascade, they are visible to browser DevTools, and they compose naturally with CSS custom properties. Your design system becomes a first-class citizen of the platform.

This lesson takes you from understanding the `@theme` directive to building a production-grade design system with semantic color tokens, responsive typography, dark mode, and plugin extensions. By the end you will understand the architectural decisions that separate a "configuration file" from a genuine design system.

## The Mental Model: Design Tokens as a Contract

Design tokens are the atomic values of your design system — colors, spacing, typography, shadows, radii. They are the contract between designers working in Figma and developers writing Tailwind classes. When this contract is explicit and shared, two things happen: designers stop inventing one-off values, and developers stop guessing which shade of blue to use.

Think of design tokens as the vocabulary of your product. A natural language has a finite set of words. When everyone uses the same vocabulary, communication is clear. When people invent new words on every page, the result is incoherent. Your `@theme` block defines the vocabulary of your UI.

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

### The Token Hierarchy

Not all tokens are created equal. A well-structured token system has three layers:

```
Layer 1: Primitive Tokens (raw values)
  blue-500: #3b82f6
  gray-100: #f3f4f6
  spacing-4: 1rem

Layer 2: Semantic Tokens (purpose-driven aliases)
  color-primary: var(--blue-500)
  color-surface: var(--gray-100)
  spacing-card-padding: var(--spacing-4)

Layer 3: Component Tokens (scoped to a specific component)
  button-bg: var(--color-primary)
  card-padding: var(--spacing-card-padding)
```

Layer 1 defines the raw palette. Layer 2 assigns meaning. Layer 3 binds meaning to specific components. In practice, most Tailwind projects work with Layers 1 and 2. Layer 3 is only necessary for very large design systems or white-label products.

```css
/* WRONG: jumping straight to raw values everywhere */
@theme {
  --color-button-bg: #3b82f6;
  --color-card-bg: #ffffff;
  --color-header-bg: #1e293b;
}

/* CORRECT: primitives + semantic layer */
@theme {
  /* Primitives */
  --color-blue-500: #3b82f6;
  --color-blue-600: #2563eb;
  --color-slate-50: #f8fafc;
  --color-slate-900: #0f172a;

  /* Semantic */
  --color-primary: var(--color-blue-500);
  --color-primary-hover: var(--color-blue-600);
  --color-surface: var(--color-slate-50);
  --color-text: var(--color-slate-900);
}
```

The semantic layer is what makes a rebrand possible. When marketing says "we are switching from blue to purple," you change one line (`--color-primary: var(--color-purple-500)`) instead of hunting through hundreds of components.

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

### How Token Names Map to Utility Classes

Understanding the mapping is essential for designing your token namespace:

```css
@theme {
  /* --color-{name} → bg-{name}, text-{name}, border-{name}, etc. */
  --color-danger: #ef4444;         /* → bg-danger, text-danger */

  /* --spacing-{name} → p-{name}, m-{name}, gap-{name}, etc. */
  --spacing-18: 4.5rem;            /* → p-18, m-18, gap-18 */

  /* --font-{name} → font-{name} */
  --font-display: 'Playfair Display', serif;  /* → font-display */

  /* --text-{name} → text-{name} (font size) */
  --text-hero: 4rem;               /* → text-hero */

  /* --radius-{name} → rounded-{name} */
  --radius-card: 12px;             /* → rounded-card */

  /* --shadow-{name} → shadow-{name} */
  --shadow-card: 0 4px 12px rgba(0, 0, 0, 0.08);  /* → shadow-card */

  /* --breakpoint-{name} → {name}: prefix */
  --breakpoint-tablet: 768px;      /* → tablet:flex */

  /* --width-{name} → w-{name}, max-w-{name} */
  --width-content: 65ch;           /* → max-w-content */
}
```

This mapping is automatic and exhaustive. Every token namespace (`--color-*`, `--spacing-*`, etc.) generates the corresponding utility classes. Design your token names knowing that they will become class names your team types every day.

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

### WRONG vs CORRECT: The Override Decision

```css
/* WRONG: Extending when you should override.
   Developers use bg-teal-400 and bg-emerald-300 because they exist.
   Your design becomes a patchwork of random Tailwind defaults. */
@theme {
  --color-brand-500: #6366f1;
}
/* Result: 200+ color utilities available. Nobody knows which are "on brand." */

/* CORRECT: Override for production apps with a design system. */
@theme inline {
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-neutral-50: #fafafa;
  --color-neutral-100: #f5f5f5;
  --color-neutral-200: #e5e5e5;
  --color-neutral-700: #404040;
  --color-neutral-900: #171717;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
/* Result: Only approved colors exist. bg-teal-400 fails loudly. */
```

The principle: **extend for flexibility, override for consistency.** In my experience, mature design systems override. You want `bg-blue-400` to fail loudly rather than silently produce an off-brand color.

### Selective Overriding

You can override specific namespaces while keeping defaults in others. For example, override colors (strict brand enforcement) but keep default spacing (the 4px scale is fine):

```css
/* Override ONLY colors — spacing, breakpoints, etc. keep their defaults */
@theme inline {
  --color-*: initial;  /* Clear all default colors */

  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-neutral-50: #fafafa;
  --color-neutral-900: #171717;
}

/* Spacing, fonts, breakpoints still use Tailwind defaults */
```

This gives you surgical control. Clear what you want to own, keep what you are happy with.

## Custom Color Scales: Light and Dark Mode with CSS Custom Properties

A well-designed color palette works across both light and dark modes. The pattern that scales best is defining semantic color tokens that reference mode-specific CSS custom properties:

```css
/* Define mode-specific values as regular CSS custom properties */
:root {
  --ui-bg: #ffffff;
  --ui-bg-elevated: #f8fafc;
  --ui-bg-sunken: #f1f5f9;
  --ui-text: #0f172a;
  --ui-text-muted: #64748b;
  --ui-text-inverted: #f8fafc;
  --ui-border: #e2e8f0;
  --ui-border-strong: #cbd5e1;
  --ui-ring: #6366f1;
  --ui-overlay: rgba(0, 0, 0, 0.4);
}

:root.dark {
  --ui-bg: #0f172a;
  --ui-bg-elevated: #1e293b;
  --ui-bg-sunken: #020617;
  --ui-text: #f1f5f9;
  --ui-text-muted: #94a3b8;
  --ui-text-inverted: #0f172a;
  --ui-border: #334155;
  --ui-border-strong: #475569;
  --ui-ring: #818cf8;
  --ui-overlay: rgba(0, 0, 0, 0.7);
}

/* Reference them in your theme */
@theme {
  --color-bg: var(--ui-bg);
  --color-bg-elevated: var(--ui-bg-elevated);
  --color-bg-sunken: var(--ui-bg-sunken);
  --color-text: var(--ui-text);
  --color-text-muted: var(--ui-text-muted);
  --color-text-inverted: var(--ui-text-inverted);
  --color-border: var(--ui-border);
  --color-border-strong: var(--ui-border-strong);
  --color-ring: var(--ui-ring);
  --color-overlay: var(--ui-overlay);

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

### WRONG vs CORRECT: Dark Mode Architecture

```css
/* WRONG: Using Tailwind's dark: modifier on every element.
   This duplicates every color decision across hundreds of elements. */
```

```svelte
<div class="bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100
            border-gray-200 dark:border-gray-700">
  <h3 class="text-gray-800 dark:text-gray-200">Title</h3>
  <p class="text-gray-500 dark:text-gray-400">Subtitle</p>
  <button class="bg-blue-500 dark:bg-blue-400 text-white">Action</button>
</div>
<!-- Every component repeats dark: variants. Changing a dark mode color
     means updating every file that uses it. -->
```

```css
/* CORRECT: Semantic tokens handle the mode switch in one place. */
```

```svelte
<div class="bg-bg text-text border border-border">
  <h3>Title</h3>
  <p class="text-text-muted">Subtitle</p>
  <button class="bg-brand-500 text-white">Action</button>
</div>
<!-- No dark: variants anywhere. Change the mode? Update CSS variables once. -->
```

The `dark:` modifier has its place — for one-off overrides that genuinely differ between modes beyond what semantic tokens cover. But your baseline should be semantic tokens, not per-element `dark:` classes.

### Implementing the Dark Mode Toggle in Svelte

```svelte
<script>
  let dark = $state(false);

  $effect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  });

  // Persist preference
  $effect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  });

  // Initialize from stored preference or system preference
  $effect(() => {
    const stored = localStorage.getItem('theme');
    if (stored) {
      dark = stored === 'dark';
    } else {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  });
</script>

<button
  onclick={() => dark = !dark}
  class="rounded-lg border border-border bg-bg-elevated px-3 py-2 text-sm text-text"
>
  {dark ? 'Light Mode' : 'Dark Mode'}
</button>
```

### System Preference Detection with Reactive Updates

For a production-quality implementation, listen for system theme changes so the UI updates if the user changes their OS preference while your app is open:

```svelte
<script>
  let mode = $state('system'); // 'light' | 'dark' | 'system'
  let systemDark = $state(false);

  let effectiveDark = $derived(
    mode === 'system' ? systemDark : mode === 'dark'
  );

  $effect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    systemDark = mql.matches;

    function handleChange(e) {
      systemDark = e.matches;
    }
    mql.addEventListener('change', handleChange);
    return () => mql.removeEventListener('change', handleChange);
  });

  $effect(() => {
    document.documentElement.classList.toggle('dark', effectiveDark);
  });
</script>

<select bind:value={mode} class="rounded-lg border border-border bg-bg px-3 py-2 text-text">
  <option value="light">Light</option>
  <option value="dark">Dark</option>
  <option value="system">System</option>
</select>
```

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

### Typography Scale: The Mathematical Approach

Professional type scales use a mathematical ratio (often the "major third" 1.25, "perfect fourth" 1.333, or "golden ratio" 1.618). Each step is the previous size multiplied by the ratio:

```css
@theme {
  /* Major Third scale (ratio: 1.25), base: 1rem */
  --text-xs: 0.64rem;       /* 1 / 1.25^2 */
  --text-xs--line-height: 1rem;
  --text-sm: 0.8rem;        /* 1 / 1.25 */
  --text-sm--line-height: 1.2rem;
  --text-base: 1rem;        /* base */
  --text-base--line-height: 1.5rem;
  --text-lg: 1.25rem;       /* base * 1.25 */
  --text-lg--line-height: 1.75rem;
  --text-xl: 1.563rem;      /* base * 1.25^2 */
  --text-xl--line-height: 2rem;
  --text-2xl: 1.953rem;     /* base * 1.25^3 */
  --text-2xl--line-height: 2.25rem;
  --text-3xl: 2.441rem;     /* base * 1.25^4 */
  --text-3xl--line-height: 2.75rem;
  --text-4xl: 3.052rem;     /* base * 1.25^5 */
  --text-4xl--line-height: 3.25rem;
}
```

A mathematical type scale creates visual harmony because the ratios between sizes are consistent. Random sizes (14px, 17px, 22px, 31px) create subtle visual tension that users feel even if they cannot articulate it.

### Responsive Font Sizes with clamp()

For fluid typography that scales smoothly between screen sizes without breakpoint jumps:

```css
@theme {
  /* Fluid type: min at 320px viewport, max at 1280px viewport */
  --text-hero: clamp(2rem, 1.5rem + 2.5vw, 4rem);
  --text-hero--line-height: 1.1;

  --text-display: clamp(1.5rem, 1.2rem + 1.5vw, 2.5rem);
  --text-display--line-height: 1.2;

  --text-body: clamp(0.95rem, 0.9rem + 0.25vw, 1.125rem);
  --text-body--line-height: 1.65;
}
```

The `clamp(min, preferred, max)` function ensures text never gets too small on mobile or too large on ultrawide monitors, while scaling smoothly in between. The middle value uses `vw` units for viewport-relative scaling.

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
  @apply btn bg-bg-elevated text-text border border-border hover:bg-bg-sunken;
}
```

**When to use `@apply`:** Shared component styles that appear 10+ times and are unlikely to diverge. Form inputs, buttons, and badge variants are good candidates.

**When NOT to use `@apply`:** One-off layouts, page-specific styles, or anything you could handle with a Svelte component. If you find yourself `@apply`-ing everything, you have lost the benefit of utility-first CSS. You are just writing CSS with extra steps.

### WRONG vs CORRECT: @apply Usage

```css
/* WRONG: @apply-ing everything. This is just CSS with extra steps. */
.page-header {
  @apply flex items-center justify-between px-6 py-4 border-b border-border;
}
.page-title {
  @apply text-2xl font-bold text-text;
}
.page-subtitle {
  @apply text-sm text-text-muted mt-1;
}
.page-content {
  @apply max-w-content mx-auto px-6 py-8;
}
/* Every layout element gets @apply. You now have a CSS file that is
   harder to read than utility classes AND harder to maintain than CSS. */

/* CORRECT: Reserve @apply for genuinely repeated component patterns. */
.btn {
  @apply px-4 py-2 rounded-lg font-medium transition-colors
         focus-visible:outline-2 focus-visible:outline-offset-2
         focus-visible:outline-ring disabled:opacity-50
         disabled:cursor-not-allowed;
}
/* One-off layouts? Use utilities directly in the template. */
```

The rule of thumb: if you are extracting a pattern, ask yourself whether a Svelte component would be better. A `<Button variant="primary">` component is almost always preferable to a `.btn-primary` CSS class, because the component can enforce props, slots, and accessibility attributes that CSS cannot.

## Animations and Keyframes in @theme

Tailwind v4 lets you define custom animations directly in your CSS, and they integrate with the `animate-{name}` utility:

```css
@theme {
  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-slide-up: slide-up 0.4s ease-out;
  --animate-scale-in: scale-in 0.2s ease-out;
  --animate-spin-slow: spin 3s linear infinite;
  --animate-bounce-subtle: bounce-subtle 1s ease-in-out infinite;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes bounce-subtle {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-4px);
  }
}
```

Now you use `animate-fade-in`, `animate-slide-up`, etc. as utility classes. This is especially useful for page transitions and loading states in SvelteKit:

```svelte
<div class="animate-fade-in">
  <h1 class="animate-slide-up">Welcome</h1>
  <p class="animate-slide-up" style="animation-delay: 100ms">
    Content with staggered entrance
  </p>
</div>
```

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

### Writing a Custom Variant Plugin

Variants are modifiers like `hover:`, `focus:`, `dark:`. You can create your own:

```js
// plugins/data-state.js
export default function ({ addVariant }) {
  // Matches elements with data-state="open"
  addVariant('data-open', '&[data-state="open"]');
  addVariant('data-closed', '&[data-state="closed"]');
  addVariant('data-loading', '&[data-state="loading"]');
  addVariant('data-error', '&[data-state="error"]');

  // Group variants — match when a parent has the state
  addVariant('group-data-open', ':merge(.group)[data-state="open"] &');
}
```

Usage:

```svelte
<div data-state={isOpen ? 'open' : 'closed'} class="group">
  <div class="data-open:bg-green-50 data-closed:bg-red-50 p-4 rounded-lg">
    <p class="data-open:text-green-800 data-closed:text-red-800">
      Status indicator
    </p>
  </div>
</div>
```

This is significantly cleaner than conditional classes for state-driven styling, and it composes naturally with other Tailwind utilities.

## Organizing Large Theme Files

For projects with extensive design systems, a single `app.css` file becomes unwieldy. Split your theme across multiple files:

```css
/* src/app.css — the entry point */
@import 'tailwindcss';
@import './theme/colors.css';
@import './theme/typography.css';
@import './theme/spacing.css';
@import './theme/animations.css';
@import './theme/components.css';
@plugin './plugins/text-shadow.js';
@plugin './plugins/data-state.js';
```

```css
/* src/theme/colors.css */
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

@theme {
  --color-bg: var(--ui-bg);
  --color-bg-elevated: var(--ui-bg-elevated);
  --color-text: var(--ui-text);
  --color-text-muted: var(--ui-text-muted);
  --color-border: var(--ui-border);

  --color-brand-50: #eef2ff;
  --color-brand-500: #6366f1;
  --color-brand-600: #4f46e5;
  --color-brand-700: #4338ca;

  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
}
```

```css
/* src/theme/typography.css */
@theme {
  --font-heading: 'Cal Sans', 'Inter', sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

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
}
```

This separation makes large themes manageable. Each file owns one concern, and you can review or modify colors without wading through spacing and typography.

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

  /* Custom animations */
  --animate-fade-in: fade-in 0.3s ease-out;
  --animate-slide-up: slide-up 0.4s ease-out;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slide-up {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
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
        <div class="rounded-xl border border-border bg-bg-elevated p-6 animate-fade-in">
          <h2 class="font-heading text-xl font-semibold">Welcome back</h2>
          <p class="mt-2 text-text-muted">
            Everything uses semantic tokens. Toggle dark mode and it all adapts.
          </p>
          <div class="mt-4 flex gap-3">
            <button class="rounded-lg bg-brand-500 px-4 py-2 text-white hover:bg-brand-600
                           focus-visible:outline-2 focus-visible:outline-offset-2
                           focus-visible:outline-ring transition-colors">
              Primary
            </button>
            <button class="rounded-lg border border-border px-4 py-2 text-text
                           hover:bg-bg-sunken transition-colors">
              Secondary
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
```

## Debugging and Validating Your Theme

### Using Browser DevTools

One advantage of `@theme` generating CSS custom properties is that you can inspect and modify them live in DevTools:

1. Open DevTools, select any element
2. Look at the "Computed" styles to see which `--color-*` or `--spacing-*` variables are in effect
3. Go to `:root` styles to see all your theme variables
4. Modify values in real-time to test changes

### Common Theme Debugging Pitfalls

```css
/* WRONG: Token name does not match expected namespace */
@theme {
  --brand-primary: #6366f1;  /* This creates --brand-primary, NOT --color-brand-primary */
}
/* bg-brand-primary will NOT work. You need --color-brand-primary for color utilities. */

/* CORRECT: Use the right namespace prefix */
@theme {
  --color-brand-primary: #6366f1;  /* Now bg-brand-primary works */
}
```

```css
/* WRONG: Forgetting that @theme inline clears ALL defaults in that namespace */
@theme inline {
  --color-brand-500: #6366f1;
}
/* text-white no longer works! You cleared ALL default colors. */

/* CORRECT: Include essential colors when using @theme inline */
@theme inline {
  --color-brand-500: #6366f1;
  --color-white: #ffffff;
  --color-black: #000000;
  --color-transparent: transparent;
}
```

### Preventing Token Drift

Over time, developers add one-off values that bypass the design system. Use a linting strategy to catch this:

```js
// .eslintrc.js (with eslint-plugin-tailwindcss)
module.exports = {
  plugins: ['tailwindcss'],
  rules: {
    // Forbid arbitrary values like bg-[#ff0000]
    'tailwindcss/no-arbitrary-value': 'warn',
    // Enforce consistent class ordering
    'tailwindcss/classnames-order': 'warn',
  }
};
```

Arbitrary values (`bg-[#ff0000]`, `p-[13px]`) are a code smell. Every arbitrary value is a token that should probably exist in your theme — or a value that should not exist at all.

## Performance Implications of Theme Architecture

### CSS Custom Properties and Performance

CSS custom properties have negligible runtime cost for static values. However, when you change a custom property on `:root`, the browser must recalculate styles for every element that uses it. This is fine for infrequent changes (theme toggle), but avoid animating custom properties in tight loops:

```css
/* WRONG: Animating a CSS variable on :root — forces global style recalculation */
:root {
  animation: shift-hue 5s linear infinite;
}
@keyframes shift-hue {
  to { --ui-bg: hsl(360, 50%, 95%); }
}

/* CORRECT: Animate on individual elements, not :root */
.animated-card {
  animation: card-glow 2s ease-in-out infinite alternate;
}
@keyframes card-glow {
  to { box-shadow: 0 0 20px rgba(99, 102, 241, 0.3); }
}
```

### Bundle Size Considerations

Using `@theme inline` to remove unused default tokens directly reduces your CSS bundle size. Tailwind only generates utilities for tokens that exist. If you define 20 colors instead of 200, your CSS is roughly 10x smaller for color utilities.

## Try It

Build a complete theme for a fictional brand. Define:

1. A full brand color scale with at least five shades, plus semantic surface colors that work in both light and dark mode using CSS custom properties
2. Two custom font families with a mathematical type scale (pick a ratio)
3. Custom spacing values on an 8px grid, including at least one "non-standard" value (like `--spacing-18`)
4. Two custom animations with `@keyframes` registered through `@theme`
5. A custom plugin that adds a new utility (text-shadow, glass-morphism, or your own idea)
6. A dashboard layout component that uses your brand colors for the header, your body font for text, semantic colors for the background and borders, your custom spacing for padding, and your custom animation for entrance effects
7. Verify it works in both light and dark modes by toggling the `dark` class on the root element

Bonus: Use `@theme inline` to override the default color palette entirely, and confirm that an off-brand utility like `bg-teal-400` no longer works.

## Key Takeaways

- Your `@theme` is the design system boundary — it defines what is "on brand" and what is not
- Design tokens have three layers: primitive (raw values), semantic (purpose), and component (scoped) — most projects need the first two
- Extending the default theme adds flexibility; overriding it with `@theme inline` enforces consistency — mature design systems override
- Semantic color tokens (via CSS custom properties on `:root` and `:root.dark`) handle light/dark modes without duplicating `dark:` classes across your markup
- Brand colors stay constant across modes; surface and text colors adapt — this preserves brand identity while the chrome changes
- Use a mathematical type scale for visual harmony, and pair font sizes with line heights using the `--line-height` suffix convention
- Fluid typography with `clamp()` scales smoothly across viewport sizes without breakpoint jumps
- Use `@apply` for heavily repeated patterns (buttons, inputs), but prefer Svelte components over CSS classes for reuse
- Custom animations defined in `@theme` integrate with the `animate-{name}` utility class pattern
- Plugins extend Tailwind with custom utilities and variants when `@theme` alone is not enough — data-state variants are especially powerful for component libraries
- Split large theme files across multiple CSS imports for maintainability
- Arbitrary values (`bg-[#ff0000]`) are a code smell — every arbitrary value is a missing token
- `@theme inline` removes unused default tokens, reducing CSS bundle size significantly
- Design tokens are the contract between Figma and code — shared naming eliminates an entire class of miscommunication
