# Utility-First CSS

Traditional CSS has you writing custom class names and style rules for every element: `.card-title`, `.nav-link`, `.hero-section`. You open the HTML, decide you need a class name, switch to the CSS file, write the rule, switch back. Multiply that by every element on every page, and you spend a shocking amount of time not styling things — but *naming* things and *navigating* between files.

Utility-first CSS flips this approach entirely. Instead of inventing class names, you compose styles directly in your HTML using small, single-purpose utility classes like `text-lg`, `bg-white`, `p-4`, and `rounded-lg`. Each class does exactly one thing. You build complex layouts by combining simple building blocks, right where you see the elements they affect.

**Tailwind CSS** is the dominant utility-first framework. It provides hundreds of pre-built utility classes that map directly to CSS properties. Once the approach clicks, you can build complete interfaces without writing a single custom CSS rule. This lesson introduces the philosophy, every category of core utilities, the responsive and state variant systems, how Tailwind coexists with Svelte's scoped styles, and when utility-first is the wrong tool for the job.

> **Note:** This course uses **Tailwind CSS v4**, which has a simplified setup (no config file needed, CSS-first configuration with `@theme`). If you see older tutorials referencing `tailwind.config.js`, that is the v3 approach — we use the modern v4 way throughout.

## Why Utility-First? The Real Arguments

The first time you see a utility-first class string, it looks wrong:

```svelte
<div class="flex items-center gap-4 p-4 bg-white rounded-xl shadow-md">
  <img class="w-12 h-12 rounded-full" src={avatar} alt="" />
  <div>
    <p class="text-sm font-semibold text-gray-900">{name}</p>
    <p class="text-xs text-gray-500">{role}</p>
  </div>
</div>
```

Your instinct says "this is messy — I should extract a `.user-card` class." That instinct comes from years of being taught separation of concerns. But consider what "separation" actually costs you:

### 1. The Naming Problem

You invent `.user-card`, `.user-card__avatar`, `.user-card__name`, `.user-card__role`. These names carry no information the browser cares about — they exist purely to connect HTML to CSS. Every name is a decision, and every decision is cognitive overhead. BEM, SMACSS, and OOCSS all exist because naming CSS classes is so hard that people built entire methodologies just to manage names.

With utilities, naming disappears. The style `text-sm font-semibold text-gray-900` is its own documentation. You read it and know exactly what it does — you do not need to look up what `.user-card__name` renders.

### 2. Colocation Eliminates Context-Switching

With traditional CSS, understanding an element's appearance requires reading the HTML, finding its class name, jumping to the CSS file (which file? what line?), reading the rule, then jumping back. With utilities, every visual property is right there in the markup. One file, one context.

This matters more than it sounds. Studies on developer productivity consistently show that context-switching is one of the most expensive operations for human cognition. Reducing it compounds over every element you touch.

### 3. Zero Dead CSS — Automatically

When you delete a component that uses `.card-title`, do you also delete the `.card-title` CSS rule? Almost never — you are afraid something else might use it. Over months, your stylesheet accumulates dead rules that nobody dares remove. Teams have invented tools like PurgeCSS specifically to solve this.

With utilities, there is no abstraction layer to accumulate debt. You delete the markup and the styles vanish with it. The utility class `text-sm` still exists in Tailwind's engine, but it takes zero space unless some other element still uses it.

### 4. No Specificity Wars

Traditional CSS uses specificity as its conflict resolution mechanism, which creates ordering bugs. Is `.card .title` more specific than `.title.active`? What happens when a utility class fights a component class? Utility classes are flat — each one maps to exactly one CSS declaration with minimal specificity. No cascading surprises, no `!important` hacks, no "why is this override not working" debugging sessions.

### 5. Design Constraints as a Feature

A raw `font-size: 14.5px` is a magic number. Tailwind's `text-sm` is a design token — it maps to a specific size from a curated scale. When every developer on your team reaches for Tailwind's spacing scale (`p-2`, `p-4`, `p-6`), the results are consistent. The constraint system prevents the "1000 different font sizes" problem that plagues large codebases.

The tradeoff is real: your class strings get longer. But you gain **zero naming decisions, zero dead CSS, zero style conflicts, zero context-switching, and design consistency by default.** For most teams, that is a decisive net win.

## Core Utility Classes — The Complete Reference

Tailwind organizes utilities by category. Here are the ones you will reach for daily, with the mental model for each.

### Layout — Flexbox

Flexbox is how you arrange items in a row or column. In Tailwind, you apply `flex` to the container and then use alignment, direction, and wrapping utilities:

```svelte
<!-- Row with centered items and space between -->
<div class="flex items-center justify-between gap-4">
  <span>Left</span>
  <span>Right</span>
</div>

<!-- Column layout -->
<div class="flex flex-col gap-2">
  <p>First</p>
  <p>Second</p>
</div>

<!-- Wrap items when they overflow -->
<div class="flex flex-wrap gap-3">
  {#each tags as tag}
    <span class="px-2 py-1 bg-gray-100 rounded text-sm">{tag}</span>
  {/each}
</div>

<!-- Center everything (the holy grail of CSS) -->
<div class="flex items-center justify-center h-screen">
  <p>Perfectly centered</p>
</div>
```

Key flex utilities:
- **Direction**: `flex-row` (default), `flex-col`, `flex-row-reverse`, `flex-col-reverse`
- **Alignment (cross axis)**: `items-start`, `items-center`, `items-end`, `items-stretch` (default), `items-baseline`
- **Justification (main axis)**: `justify-start`, `justify-center`, `justify-end`, `justify-between`, `justify-around`, `justify-evenly`
- **Children sizing**: `flex-1` (grow to fill), `flex-none` (do not grow or shrink), `flex-auto`, `shrink-0` (prevent shrinking)
- **Gap**: `gap-2`, `gap-4`, `gap-x-4` (horizontal only), `gap-y-2` (vertical only)

### Layout — CSS Grid

Grid is for two-dimensional layouts — rows and columns together:

```svelte
<!-- 3 equal columns -->
<div class="grid grid-cols-3 gap-6">
  <div>One</div>
  <div>Two</div>
  <div>Three</div>
</div>

<!-- Responsive product grid -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
  {#each products as product}
    <ProductCard {product} />
  {/each}
</div>

<!-- Sidebar layout (fixed sidebar, flexible content) -->
<div class="grid grid-cols-[250px_1fr] gap-8">
  <aside>Sidebar</aside>
  <main>Content area</main>
</div>

<!-- Auto-fill as many as fit -->
<div class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
  {#each items as item}
    <div class="p-4 border rounded">{item.name}</div>
  {/each}
</div>
```

The `grid-cols-[...]` bracket syntax uses Tailwind's arbitrary value feature — you can pass any valid CSS `grid-template-columns` value. The `auto-fill` pattern creates a responsive grid without any breakpoint classes — items wrap naturally as the container resizes.

Key grid utilities:
- **Columns**: `grid-cols-1` through `grid-cols-12`, plus `grid-cols-none` and `grid-cols-subgrid`
- **Rows**: `grid-rows-1` through `grid-rows-6`, plus `grid-rows-none` and `grid-rows-subgrid`
- **Span**: `col-span-2`, `col-span-full`, `row-span-2`
- **Placement**: `col-start-2`, `col-end-4`, `row-start-1`

### Spacing — Padding and Margin

Tailwind uses a spacing scale where each unit is 0.25rem (4px at default browser font size). So `p-1` = 4px, `p-2` = 8px, `p-4` = 16px, `p-8` = 32px, `p-16` = 64px:

```svelte
<div class="p-4">Padding on all sides (1rem / 16px)</div>
<div class="px-6 py-2">Horizontal 1.5rem, vertical 0.5rem</div>
<div class="pt-8 pb-4">Top 2rem, bottom 1rem</div>
<div class="mt-4">Margin-top 1rem</div>
<div class="mx-auto">Horizontally centered (auto left + right margins)</div>
<div class="space-y-4">Vertical spacing between children</div>
```

The prefix tells you which sides:
- `p-` / `m-` = all four sides
- `px-` / `mx-` = horizontal (left + right)
- `py-` / `my-` = vertical (top + bottom)
- `pt-` / `pr-` / `pb-` / `pl-` = individual sides (top, right, bottom, left)
- `ps-` / `pe-` = inline start/end (for LTR/RTL support)

**Tip:** Prefer `gap` over margin for spacing between sibling elements. `gap` is cleaner — it does not create unwanted space on the first or last child, it works on both flex and grid containers, and it is easier to reason about.

```svelte
<!-- WRONG: margin creates extra space above first item -->
<div class="flex flex-col">
  <p class="mt-4">Item</p>
  <p class="mt-4">Item (extra space above first child)</p>
</div>

<!-- CORRECT: gap applies spacing between children only -->
<div class="flex flex-col gap-4">
  <p>Item</p>
  <p>Item (no extra space above first child)</p>
</div>
```

### Typography

```svelte
<!-- Sizes: text-xs (0.75rem) through text-9xl (8rem) -->
<h1 class="text-4xl font-bold tracking-tight">Page Title</h1>
<h2 class="text-2xl font-semibold">Section Heading</h2>
<p class="text-base text-gray-700 leading-relaxed">Body paragraph with comfortable line height.</p>
<p class="text-sm text-gray-500">Small helper text — great for metadata and captions.</p>
<p class="text-xs text-gray-400 uppercase tracking-wider font-medium">OVERLINE LABEL</p>

<!-- Weights: font-thin (100) through font-black (900) -->
<span class="font-light">Light</span>
<span class="font-normal">Normal</span>
<span class="font-medium">Medium</span>
<span class="font-semibold">Semibold</span>
<span class="font-bold">Bold</span>

<!-- Text overflow -->
<p class="truncate">This text will be cut off with an ellipsis if it overflows...</p>
<p class="line-clamp-2">This text will show exactly two lines then cut off with an ellipsis.
   Any additional content beyond the second line is hidden.</p>

<!-- Alignment and decoration -->
<p class="text-center">Centered text</p>
<a class="underline decoration-2 underline-offset-2">Styled underline</a>
<del class="line-through text-gray-400">Deleted price</del>
```

The `text-` prefix does double duty: `text-xl` sets font size, while `text-gray-500` sets color. This might feel ambiguous at first, but in practice you always pair a size with a color, so the context is clear.

### Colors — Text, Background, Border, and Ring

Tailwind provides a color palette with shades from 50 (lightest) to 950 (darkest):

```svelte
<!-- Text colors -->
<p class="text-gray-900">Primary text (nearly black)</p>
<p class="text-gray-700">Secondary text (body copy)</p>
<p class="text-gray-500">Tertiary text (muted/helper)</p>
<p class="text-gray-400">Quaternary text (placeholders)</p>

<!-- Background colors -->
<div class="bg-white">White background</div>
<div class="bg-gray-50">Barely-there gray — great for alternating rows</div>
<div class="bg-gray-100">Light gray — subtle distinction</div>
<div class="bg-blue-600">Vibrant blue — primary action color</div>

<!-- Border colors -->
<div class="border border-gray-200">Subtle default border</div>
<div class="border-2 border-blue-500">Prominent blue border</div>

<!-- Ring (for focus indicators) -->
<button class="focus:ring-2 focus:ring-blue-400 focus:ring-offset-2">
  Focused button
</button>

<!-- Opacity modifier -->
<div class="bg-black/50">50% opacity black overlay</div>
<div class="bg-blue-600/10">10% opacity blue tint</div>
```

A practical palette that covers 90% of UIs: `gray-900` for headings, `gray-700` for body text, `gray-500` for muted text, `gray-200` for borders, `gray-50` or `white` for backgrounds, and one accent color (e.g., `blue-600`) for interactive elements. Add a green for success, red for errors, and yellow for warnings, and you have a complete design system.

### Borders, Radius, Shadows, and Sizing

```svelte
<!-- Border width and style -->
<div class="border">1px solid (default)</div>
<div class="border-2">2px solid</div>
<div class="border-t">Top border only</div>
<div class="border-dashed border-gray-300">Dashed border</div>
<div class="divide-y divide-gray-200">Children separated by horizontal lines</div>

<!-- Border radius -->
<div class="rounded">Small radius (0.25rem)</div>
<div class="rounded-md">Medium radius (0.375rem)</div>
<div class="rounded-lg">Large radius (0.5rem)</div>
<div class="rounded-xl">Extra large (0.75rem)</div>
<div class="rounded-2xl">2XL (1rem)</div>
<div class="rounded-full">Pill shape / circle</div>

<!-- Shadows -->
<div class="shadow-sm">Subtle — form inputs, cards on white</div>
<div class="shadow">Default — standalone cards</div>
<div class="shadow-md">Medium — elevated cards</div>
<div class="shadow-lg">Large — dropdowns, popovers</div>
<div class="shadow-xl">XL — modals, dialogs</div>

<!-- Sizing -->
<div class="w-full">Full width of parent</div>
<div class="w-64">Fixed width: 16rem (256px)</div>
<div class="max-w-md mx-auto">Centered with max-width</div>
<div class="h-screen">Full viewport height</div>
<div class="min-h-screen">At least viewport height</div>
<img class="w-12 h-12 rounded-full object-cover" src="/avatar.jpg" alt="" />
<div class="aspect-video">16:9 aspect ratio</div>
<div class="aspect-square">1:1 aspect ratio</div>
```

### Position, Display, and Overflow

```svelte
<!-- Position -->
<div class="relative">
  <div class="absolute top-0 right-0">Badge in corner</div>
</div>
<nav class="sticky top-0 z-50 bg-white/80 backdrop-blur">Sticky header</nav>
<div class="fixed inset-0 bg-black/50">Full-screen overlay</div>

<!-- Display -->
<span class="inline-block">Inline but with block sizing</span>
<div class="hidden md:block">Show on medium screens and up</div>

<!-- Overflow -->
<div class="overflow-hidden rounded-lg">Clip content to rounded corners</div>
<div class="overflow-y-auto max-h-64">Scrollable container</div>
<div class="overflow-x-auto">Horizontal scroll for wide tables</div>

<!-- Z-index -->
<div class="z-10">Above normal content</div>
<div class="z-50">Above most things (modals, tooltips)</div>
```

## Responsive Design — The Mobile-First Mental Model

Tailwind uses breakpoint prefixes to apply styles at specific screen sizes. The key insight is **mobile-first**: unprefixed classes apply to all screen sizes, and prefixed classes kick in at that breakpoint *and above*.

```svelte
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div class="p-4 bg-white rounded-lg shadow">Card 1</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 2</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 3</div>
</div>
```

Reading this: "1 column by default (mobile), 2 columns at medium screens (768px+), 3 columns at large screens (1024px+)."

The breakpoints use `min-width` media queries, meaning they apply at the specified width *and larger*:
- No prefix = all screen sizes (start here — this is your mobile layout)
- `sm:` = 640px and wider
- `md:` = 768px and wider
- `lg:` = 1024px and wider
- `xl:` = 1280px and wider
- `2xl:` = 1536px and wider

### Why Mobile-First Matters

The mobile-first approach is not just a Tailwind convention — it is a design philosophy that produces better results:

1. **Content priority.** Mobile forces you to decide what matters. When you have 375px of width, you cannot show everything — you must prioritize.
2. **Progressive enhancement.** You start with a simple layout that works everywhere, then add complexity (multi-column grids, sidebars, larger spacing) as screen space allows.
3. **Smaller CSS.** Mobile styles are the base; larger screens add overrides. If you designed desktop-first, you would need max-width queries to undo desktop styles on mobile — more code, more complexity.

### Common Responsive Patterns

```svelte
<!-- Responsive text sizing -->
<h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
  Responsive Heading
</h1>

<!-- Stack on mobile, side-by-side on desktop -->
<div class="flex flex-col md:flex-row gap-6">
  <div class="md:w-1/3">Sidebar</div>
  <div class="md:w-2/3">Main content</div>
</div>

<!-- Hide/show at breakpoints -->
<button class="md:hidden">Mobile menu toggle</button>
<nav class="hidden md:flex gap-4">Desktop navigation</nav>

<!-- Different padding at breakpoints -->
<section class="px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16">
  Content with responsive padding
</section>

<!-- Responsive grid with different gaps -->
<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
  {#each items as item}
    <div>{item.name}</div>
  {/each}
</div>
```

**Think mobile-first.** Start with the smallest screen and add complexity upward. Never start from desktop and try to "make it work on mobile" — that path leads to hidden overflow, broken layouts, and frustrated users.

## State Variants — Hover, Focus, Active, and Beyond

Apply styles conditionally using state prefixes:

```svelte
<button class="bg-blue-600 text-white px-4 py-2 rounded-lg
               hover:bg-blue-700
               focus:ring-2 focus:ring-blue-400 focus:outline-none
               focus-visible:ring-2 focus-visible:ring-blue-400
               active:bg-blue-800
               disabled:opacity-50 disabled:cursor-not-allowed
               transition">
  Click me
</button>
```

Each state prefix applies its utility only when the condition is true. The `transition` class adds a smooth CSS transition between states.

### The `focus` vs `focus-visible` Distinction

`focus:` applies whenever the element receives focus — including mouse clicks. `focus-visible:` applies only when the browser determines focus should be visible (typically keyboard navigation). For buttons, prefer `focus-visible:` — users clicking a button with a mouse do not need a focus ring, but keyboard users do.

```svelte
<!-- WRONG: focus ring appears on mouse click too -->
<button class="focus:ring-2 focus:ring-blue-400">Click me</button>

<!-- CORRECT: focus ring only appears for keyboard users -->
<button class="focus-visible:ring-2 focus-visible:ring-blue-400
               focus-visible:outline-none">
  Click me
</button>
```

### Group Hover — Styling Children Based on Parent State

Sometimes you want child elements to react when the parent is hovered. The `group` utility handles this:

```svelte
<a href="/product" class="group block p-4 rounded-lg hover:bg-gray-50 transition">
  <h3 class="font-semibold group-hover:text-blue-600 transition-colors">
    Product Name
  </h3>
  <p class="text-sm text-gray-500 group-hover:text-gray-700">
    Description that changes color when the card is hovered.
  </p>
  <span class="text-sm text-blue-600 opacity-0 group-hover:opacity-100
               transition-opacity">
    View details &rarr;
  </span>
</a>
```

Add `group` to the parent and use `group-hover:` on children. This is powerful for card links where the entire card is clickable but specific elements should change style.

### Named Groups

When you have nested groups, use named groups to target a specific ancestor:

```svelte
<div class="group/card p-4 hover:bg-gray-50">
  <h3 class="group-hover/card:text-blue-600">Card Title</h3>
  <div class="group/actions flex gap-2">
    <button class="group-hover/actions:text-red-600">Delete</button>
  </div>
</div>
```

### Peer Modifier — Styling Based on Sibling State

`peer` works like `group` but for siblings instead of parent-child relationships:

```svelte
<label class="block">
  <input type="email" class="peer border rounded px-3 py-2 w-full
                             invalid:border-red-500" />
  <p class="mt-1 text-sm text-red-500 hidden peer-invalid:block">
    Please enter a valid email address.
  </p>
</label>
```

The error message is hidden by default and only appears when the input is in an invalid state. This is pure CSS validation feedback — no JavaScript required.

### First, Last, Odd, Even — Structural Selectors

```svelte
<ul class="divide-y">
  {#each items as item}
    <li class="p-4 first:pt-0 last:pb-0 odd:bg-gray-50">
      {item.name}
    </li>
  {/each}
</ul>
```

### Dark Mode

Tailwind supports dark mode with the `dark:` prefix:

```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
            border border-gray-200 dark:border-gray-700">
  <h2 class="font-bold">Adapts to Dark Mode</h2>
  <p class="text-gray-500 dark:text-gray-400">
    This text adapts automatically.
  </p>
</div>
```

In Tailwind v4, dark mode uses the CSS `prefers-color-scheme` media query by default. To use a class-based strategy for manual toggling (e.g., a toggle button that adds `class="dark"` to the `<html>` element):

```css
/* app.css — Tailwind v4 dark mode configuration */
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));
```

This tells Tailwind to activate `dark:` classes when an ancestor has the `dark` class, instead of relying on the OS preference.

## Arbitrary Values — Escaping the Design System

When the predefined scale does not have what you need, use square brackets for arbitrary values:

```svelte
<!-- Exact pixel values -->
<div class="w-[327px] h-[200px]">Exact dimensions</div>

<!-- CSS custom properties -->
<div class="bg-[var(--brand-color)]">Dynamic brand color</div>

<!-- Complex CSS values -->
<div class="grid grid-cols-[1fr_250px]">Custom grid template</div>
<div class="shadow-[0_2px_8px_rgba(0,0,0,0.12)]">Custom shadow</div>
<div class="top-[calc(100vh-4rem)]">Calculated position</div>

<!-- Arbitrary text color -->
<p class="text-[#1a1a2e]">Exact hex color</p>
```

Arbitrary values are an escape hatch — they let you use any CSS value without leaving the utility-first model. But use them sparingly. If you find yourself reaching for `text-[14.5px]` often, you should add that size to your theme tokens instead.

## Tailwind v4 — @theme Configuration

Tailwind v4 moved configuration from JavaScript (`tailwind.config.js`) to CSS using `@theme`. This is the modern approach:

```css
/* app.css */
@import 'tailwindcss';

@theme {
  /* Extend the color palette */
  --color-brand-50: #eff6ff;
  --color-brand-100: #dbeafe;
  --color-brand-500: #3b82f6;
  --color-brand-600: #2563eb;
  --color-brand-700: #1d4ed8;
  --color-brand-900: #1e3a5f;

  /* Custom font family */
  --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Custom spacing (extends the default scale) */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;

  /* Custom border radius */
  --radius-4xl: 2rem;

  /* Custom shadows */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-elevation: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);

  /* Custom breakpoints */
  --breakpoint-xs: 475px;
  --breakpoint-3xl: 1800px;

  /* Animation */
  --animate-fade-in: fade-in 0.3s ease-out;

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
```

Now you can use `bg-brand-600`, `font-mono`, `p-18`, `rounded-4xl`, `shadow-card`, `xs:`, `3xl:`, and `animate-fade-in` anywhere in your markup — they work exactly like built-in utilities.

The benefit of `@theme` over `tailwind.config.js` is colocation: your design tokens live in CSS, the language they actually affect. No JavaScript build chain required for customization.

## Tailwind + Svelte — A Natural Fit

**Scoped styles and Tailwind coexist without conflict.** Tailwind utilities are global (applied via class names), while Svelte's `<style>` block is scoped to the component. They live in different worlds and do not interfere with each other.

The rule of thumb: use Tailwind for layout, spacing, colors, typography, and responsive design. Use Svelte's scoped styles when you need something Tailwind does not cover — container queries, complex animations, or CSS features not yet in Tailwind's utility set.

```svelte
<script lang="ts">
  let { title, description, image }: {
    title: string; description: string; image: string;
  } = $props();
</script>

<article class="rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-shadow">
  <img class="w-full h-48 object-cover" src={image} alt="" />
  <div class="p-4">
    <h3 class="font-semibold text-lg">{title}</h3>
    <p class="mt-1 text-sm text-gray-500 line-clamp-2">{description}</p>
  </div>
</article>

<style>
  /* Scoped styles for features Tailwind doesn't cover */
  article { container-type: inline-size; }

  @container (min-width: 400px) {
    article { display: grid; grid-template-columns: 200px 1fr; }
  }
</style>
```

**Svelte components are the abstraction layer.** In traditional CSS, you extract repeated styles into a class like `.card`. With Tailwind + Svelte, you extract repeated markup into a component like `<Card>`. The component bundles markup, styles, and behavior together — a fundamentally better abstraction than a CSS class name that can only carry visual information.

### Conditional Classes in Svelte

Svelte's class directive works cleanly with Tailwind:

```svelte
<script lang="ts">
  let { active = false, variant = 'primary' }: {
    active?: boolean;
    variant?: 'primary' | 'secondary' | 'danger';
  } = $props();

  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    danger: 'bg-red-600 text-white hover:bg-red-700'
  };
</script>

<button
  class="px-4 py-2 rounded-lg font-medium transition-colors
         {variants[variant]}"
  class:ring-2={active}
  class:ring-blue-400={active}
>
  {@render children()}
</button>
```

**Critical rule:** never dynamically construct class names with string interpolation. `class="bg-{color}-600"` does not work because Tailwind scans your source files for complete class names at build time. Dynamic strings are invisible to the scanner.

```svelte
<!-- WRONG: Tailwind will not generate these classes -->
<div class="bg-{color}-600 text-{size}">broken</div>

<!-- CORRECT: use complete class names in a mapping object -->
<script lang="ts">
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-600',
    red: 'bg-red-600',
    green: 'bg-green-600'
  };
</script>
<div class="{colorMap[color]}">works</div>
```

## Real Example: Complete Button Component

Here is a production-grade button component built entirely with Tailwind, demonstrating variants, sizes, loading state, and accessibility:

```svelte
<!-- Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md' | 'lg';
    loading?: boolean;
    children: Snippet;
  }

  let {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    children,
    ...rest
  }: Props = $props();

  const variantClasses: Record<string, string> = {
    primary:   'bg-gray-900 text-white hover:bg-gray-800 focus-visible:ring-gray-500',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400',
    ghost:     'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-gray-400',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-400'
  };

  const sizeClasses: Record<string, string> = {
    sm: 'text-xs px-2.5 py-1.5 gap-1.5',
    md: 'text-sm px-4 py-2 gap-2',
    lg: 'text-base px-6 py-3 gap-2.5'
  };
</script>

<button
  class="inline-flex items-center justify-center font-medium rounded-lg
         transition-colors focus-visible:outline-none focus-visible:ring-2
         focus-visible:ring-offset-2
         disabled:opacity-50 disabled:pointer-events-none
         {variantClasses[variant]} {sizeClasses[size]}"
  disabled={disabled || loading}
  aria-busy={loading}
  {...rest}
>
  {#if loading}
    <svg
      class="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10"
              stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  {/if}
  {@render children()}
</button>
```

Usage:

```svelte
<Button>Default</Button>
<Button variant="secondary" size="sm">Small Secondary</Button>
<Button variant="danger" loading={isDeleting}>Delete</Button>
<Button variant="ghost" disabled>Disabled Ghost</Button>
```

## Real Example: Responsive Product Card

Here is a complete, production-style card component built entirely with Tailwind:

```svelte
<!-- ProductCard.svelte -->
<script lang="ts">
  interface Props {
    name: string;
    price: number;
    originalPrice?: number;
    image: string;
    inStock: boolean;
    rating?: number;
  }
  let { name, price, originalPrice, image, inStock, rating }: Props = $props();
</script>

<div class="group flex flex-col bg-white rounded-xl shadow-sm
            hover:shadow-md transition-shadow overflow-hidden">
  <!-- Image with hover zoom -->
  <div class="aspect-[4/3] overflow-hidden relative">
    <img
      class="w-full h-full object-cover group-hover:scale-105
             transition-transform duration-300"
      src={image}
      alt={name}
    />
    {#if originalPrice && originalPrice > price}
      <span class="absolute top-2 left-2 bg-red-500 text-white text-xs
                   font-bold px-2 py-0.5 rounded">
        {Math.round((1 - price / originalPrice) * 100)}% OFF
      </span>
    {/if}
  </div>

  <!-- Content -->
  <div class="flex flex-col gap-1.5 p-4 flex-1">
    <h3 class="font-semibold text-gray-900 group-hover:text-blue-600
               transition-colors line-clamp-1">
      {name}
    </h3>

    {#if rating}
      <div class="flex items-center gap-1">
        {#each Array(5) as _, i}
          <svg
            class="w-3.5 h-3.5 {i < Math.round(rating)
              ? 'text-yellow-400 fill-current'
              : 'text-gray-200 fill-current'}"
            viewBox="0 0 20 20"
          >
            <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
          </svg>
        {/each}
        <span class="text-xs text-gray-400 ml-0.5">{rating.toFixed(1)}</span>
      </div>
    {/if}

    <div class="flex items-center justify-between mt-auto pt-2">
      <div class="flex items-center gap-2">
        <span class="text-lg font-bold">${price.toFixed(2)}</span>
        {#if originalPrice && originalPrice > price}
          <span class="text-sm text-gray-400 line-through">
            ${originalPrice.toFixed(2)}
          </span>
        {/if}
      </div>
      {#if inStock}
        <span class="text-xs font-medium text-green-700 bg-green-50
                     px-2 py-0.5 rounded-full">
          In Stock
        </span>
      {:else}
        <span class="text-xs font-medium text-red-700 bg-red-50
                     px-2 py-0.5 rounded-full">
          Out of Stock
        </span>
      {/if}
    </div>
  </div>
</div>
```

And a responsive grid that uses it:

```svelte
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="flex items-center justify-between mb-8">
    <h1 class="text-2xl sm:text-3xl font-bold">Our Products</h1>
    <div class="flex gap-2">
      <button class="p-2 rounded-lg border hover:bg-gray-50
                     text-gray-500 hover:text-gray-700">
        <!-- Grid icon -->
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
        </svg>
      </button>
    </div>
  </div>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
    {#each products as product}
      <ProductCard {...product} />
    {/each}
  </div>
</div>
```

Notice how much is happening with zero custom CSS: responsive grid with different gap sizes, hover effects on the card and image, sale badges with computed discount percentages, star ratings, conditional stock badges, proper spacing and typography, responsive padding on the container. This is the utility-first payoff.

## When NOT to Use Tailwind

Tailwind is excellent for most UI work, but there are cases where other approaches are better. Knowing when to reach for an alternative is as important as knowing the tool itself.

### Complex Animations

Multi-step keyframe animations are awkward as utility classes. Use Svelte's `transition:` and `animate:` directives instead:

```svelte
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  let visible = $state(true);
</script>

{#if visible}
  <div class="p-4 bg-white rounded-lg shadow"
       transition:fly={{ y: 20, duration: 300 }}>
    Svelte transitions handle this better than Tailwind classes.
  </div>
{/if}
```

Tailwind provides `animate-spin`, `animate-pulse`, `animate-ping`, and `animate-bounce` — but anything beyond those simple loops belongs in CSS keyframes or Svelte transitions.

### Highly Dynamic Styles

When a value comes from JavaScript — a computed color, a progress percentage, a position calculated from mouse coordinates — use Svelte's `style:` directive. Tailwind generates classes at build time; dynamic class names do not work:

```svelte
<script lang="ts">
  let progress = $state(65);
  let hue = $state(220);
</script>

<!-- WRONG: "w-65%" is not a real Tailwind class -->
<div class="w-{progress}%">broken</div>

<!-- CORRECT: use style: for dynamic values -->
<div class="h-2 rounded-full bg-gray-200 overflow-hidden">
  <div
    class="h-full rounded-full transition-all duration-300"
    style:width="{progress}%"
    style:background-color="hsl({hue}, 70%, 50%)"
  ></div>
</div>
```

### Runtime-Customizable Themes

If your app supports arbitrary user-chosen colors (a "pick your brand color" feature), Tailwind's predefined palette will not cover it. Use CSS custom properties and reference them with `bg-[var(--brand-color)]`, or skip Tailwind for those specific elements:

```svelte
<script lang="ts">
  let brandColor = $state('#3b82f6');
</script>

<div style:--brand={brandColor}>
  <button
    class="text-white px-4 py-2 rounded-lg"
    style:background-color="var(--brand)"
  >
    User's Brand Button
  </button>
</div>
```

### Prose Content / Rich Text

Long-form content (blog posts, documentation) where you do not control the HTML (it comes from a CMS or Markdown parser) cannot use utility classes because there are no elements to put them on. Tailwind's `@tailwindcss/typography` plugin provides a `prose` class for this:

```svelte
<article class="prose prose-lg dark:prose-invert max-w-none">
  {@html renderedMarkdown}
</article>
```

## Performance — Only the CSS You Use

A common concern: "doesn't shipping hundreds of utility classes make a huge CSS file?" No. Tailwind's engine scans your source files and generates only the CSS for classes you actually use. If you never write `bg-purple-400`, that rule never ends up in your stylesheet.

The result is typically 5-15 KB (gzipped) for a full application — smaller than most hand-written stylesheets. No dead CSS to audit, no PurgeCSS to configure (it is built in), no wasted bytes.

In a SvelteKit project, this works automatically. During the Vite build, Tailwind scans your `.svelte`, `.ts`, and `.html` files for class names and produces minimal CSS output. The class scanning is a lexical process — it looks for complete strings that could be class names. This is why dynamic class construction (`bg-${color}-600`) fails: the scanner never sees `bg-blue-600` as a complete string in your source code.

## Try It

1. Build a "profile card" component with an avatar (`rounded-full`), a name (bold), a role (muted gray text), and an email link (`text-blue-600 hover:underline`). Use `flex items-center gap-4` for horizontal layout.

2. Make it responsive: stack vertically on mobile (`flex-col items-center text-center`), side by side on medium screens (`md:flex-row md:text-left`).

3. Add hover effects: subtle background change on the card (`hover:bg-gray-50`), name turns blue using `group` and `group-hover:text-blue-600`.

4. Add dark mode variants: `dark:bg-gray-800`, `dark:text-white`, and appropriate dark colors for muted text (`dark:text-gray-400`).

5. Add a "Contact" button with full interactive states: `hover:bg-blue-700`, `focus-visible:ring-2 focus-visible:ring-blue-400`, `active:bg-blue-800`, and `disabled:opacity-50 disabled:cursor-not-allowed`.

6. Create a three-card pricing table (Free, Pro, Enterprise) using `grid grid-cols-1 lg:grid-cols-3 gap-6`. The Pro card should have `ring-2 ring-blue-500 scale-105` to visually distinguish it as the recommended plan.

7. Add a `@theme` block to your `app.css` that defines a `--color-brand-*` palette and `--font-sans`. Use `bg-brand-600` and `font-sans` in one of your components to verify the tokens work.

## Key Takeaways

- **Utility-first CSS** composes styles from small, single-purpose classes directly in markup — eliminating naming, dead CSS, and style conflicts
- The tradeoff is longer class strings, but you gain **colocation** (styles live next to the elements they affect), **zero wasted CSS**, and **design consistency through constrained scales**
- Core categories: layout (`flex`, `grid`, `gap`), spacing (`p-`, `m-`, `gap-`), typography (`text-`, `font-`, `leading-`, `tracking-`), colors (`bg-`, `text-`, `border-`, `ring-`), borders (`rounded-`, `border-`, `divide-`), shadows (`shadow-`), sizing (`w-`, `h-`, `max-w-`, `aspect-`)
- **Responsive prefixes** (`sm:`, `md:`, `lg:`, `xl:`, `2xl:`) are mobile-first — start with the mobile layout, add complexity upward using `min-width` breakpoints
- **State prefixes** (`hover:`, `focus-visible:`, `active:`, `disabled:`, `dark:`, `group-hover:`, `peer-invalid:`) handle interactive and conditional states declaratively
- **Arbitrary values** (`w-[327px]`, `bg-[var(--brand)]`) escape the design system when needed, but prefer theme tokens for recurring values
- **Tailwind v4 uses `@theme`** for CSS-first configuration — no `tailwind.config.js` needed
- **Svelte components are the abstraction layer** — extract repeated Tailwind markup into components, not CSS classes
- **Never dynamically construct class names** — use mapping objects with complete class strings instead
- Use Svelte's `style:` directive for dynamic runtime values and `transition:` for animations — Tailwind is for known-at-build-time styles
- Tailwind's build engine generates **only the CSS you use**, resulting in 5-15 KB (gzipped) production stylesheets
