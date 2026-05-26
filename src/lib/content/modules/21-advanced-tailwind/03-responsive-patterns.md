# Advanced Responsive Patterns

Responsive design is not about making things shrink. It is about designing for the constraints and opportunities of every screen size -- from a 320px phone held in one hand to a 2560px ultrawide monitor with a mouse and keyboard. The tools are breakpoints, container queries, fluid typography, and intentional layout shifts. The mental model is: **start with the most constrained environment (mobile), then progressively enhance for more space.**

You already know Tailwind's responsive prefixes. Now it is time to understand the deeper patterns: why mobile-first matters architecturally, how container queries change component design, how fluid typography eliminates breakpoint jumps, and how to think about touch targets. These are the patterns that separate "it works on my laptop" from "it works everywhere."

## Mobile-First: Why the Order Matters

Tailwind's breakpoints are `min-width` queries. This is not an arbitrary choice -- it encodes a philosophy. Unprefixed utilities are your mobile styles. Prefixed utilities (`sm:`, `md:`, `lg:`) layer on complexity as the screen grows:

```css
/* What Tailwind actually generates: */
.flex-col { flex-direction: column; }

@media (min-width: 640px) {
  .sm\:flex-row { flex-direction: row; }
}
```

Why does this matter? Because mobile is the hardest design problem. You have the least space, the slowest connection, and the most distracted user. If you design for desktop first and then try to cram it into mobile, you end up hiding things, breaking layouts, and shipping a degraded experience. If you design for mobile first, you have already solved the hard problem. Adding a sidebar when you have 1280px of space is easy.

The practical rule: **write your base classes for the smallest screen, then add prefixed overrides for larger ones.** If you catch yourself writing `md:hidden` more than `hidden md:block`, you are probably thinking desktop-first.

```svelte
<!-- WRONG: Desktop-first thinking — start horizontal, then override for mobile -->
<div class="flex flex-row md:flex-row sm:flex-col gap-4">
  <!-- This is confusing. What is the base? What changes where? -->
</div>

<!-- CORRECT: Mobile-first thinking — start stacked, go horizontal when there is room -->
<div class="flex flex-col sm:flex-row gap-4">
  <div class="w-full sm:w-1/3">Sidebar</div>
  <div class="w-full sm:w-2/3">Main content</div>
</div>
```

Here is a diagnostic test. Read these two class strings and determine which is mobile-first:

```html
<!-- Option A -->
<div class="grid grid-cols-4 md:grid-cols-3 sm:grid-cols-2 grid-cols-1">

<!-- Option B -->
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
```

Option A is desktop-first: it starts with 4 columns and reduces. But because Tailwind uses `min-width`, these breakpoints stack incorrectly -- `sm:grid-cols-2` will be overridden by `md:grid-cols-3`, which is correct, but the base `grid-cols-4` applies to every screen and gets overridden at `sm:`. This works but is backwards. Option B is mobile-first: it starts with 1 column and adds more as space permits. Each breakpoint builds on the previous one. This is how you should think.

### Tailwind v4 Breakpoint Reference

Tailwind v4 uses the `@theme` directive for configuration. Here are the default breakpoints:

```css
@theme {
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
  --breakpoint-xl: 1280px;
  --breakpoint-2xl: 1536px;
}
```

You can customize these in your CSS file (not in `tailwind.config.js` -- Tailwind v4 uses CSS-native configuration):

```css
@theme {
  --breakpoint-xs: 475px;    /* Small phones */
  --breakpoint-sm: 640px;    /* Large phones */
  --breakpoint-md: 768px;    /* Tablets */
  --breakpoint-lg: 1024px;   /* Laptops */
  --breakpoint-xl: 1280px;   /* Desktops */
  --breakpoint-2xl: 1536px;  /* Large desktops */
  --breakpoint-3xl: 1920px;  /* Ultra-wide */
}
```

A critical detail: you should add custom breakpoints only when you have a genuine design need. Adding `xs:` because "it might be useful" creates more decisions for every utility you write. Most designs work fine with `sm`, `md`, `lg`, and `xl`.

## Common Responsive Patterns

Most responsive layouts are variations of a few core patterns. Learn these, and you can build almost any responsive page.

### Stack to Row

The most common pattern. Content stacks vertically on mobile and flows horizontally on larger screens:

```svelte
<div class="flex flex-col md:flex-row gap-6">
  <img src="/hero.jpg" alt="Hero" class="w-full md:w-1/2 rounded-xl" />
  <div class="flex flex-col justify-center">
    <h2 class="text-2xl font-bold">Feature Title</h2>
    <p class="mt-2 text-gray-600">Description that sits beside the image on desktop.</p>
  </div>
</div>
```

The key detail is `w-full md:w-1/2`. On mobile, both elements take full width and stack. On `md:`, the image takes half and the text takes the remaining half. The `flex` container handles the distribution.

An important gotcha: when switching from `flex-col` to `flex-row`, the meaning of width and height properties changes. In `flex-col`, `w-full` controls the cross-axis (horizontal width). In `flex-row`, `w-1/2` controls the main-axis (horizontal share). This is why you set `w-full` as the base and `md:w-1/2` as the override -- in column mode, `w-full` ensures the item spans the container. In row mode, `md:w-1/2` gives it half the space.

### Hide and Show

Some elements only make sense at certain sizes. A desktop sidebar becomes a mobile hamburger menu. A decorative illustration disappears on small screens:

```svelte
<!-- Desktop sidebar, hidden on mobile -->
<aside class="hidden lg:block w-64 border-r p-6">
  <nav>...</nav>
</aside>

<!-- Mobile menu button, hidden on desktop -->
<button class="lg:hidden p-2" aria-label="Open menu">
  <svg>...</svg>
</button>

<!-- Decorative element that adds nothing on small screens -->
<div class="hidden md:block absolute -right-20 top-10 opacity-20">
  <img src="/decoration.svg" alt="" />
</div>
```

The pattern is always one of these two:
- `hidden lg:block` -- hidden by default (mobile), shown at `lg` and above
- `lg:hidden` -- shown by default (all sizes), hidden at `lg` and above

```
WRONG: Using both hidden and block at the same breakpoint
  class="hidden md:hidden lg:block"  — the md:hidden is redundant

CORRECT: One toggle point
  class="hidden lg:block"  — hidden up to lg, visible from lg onward

WRONG: Hiding content that screen readers need
  class="hidden md:block"  — if this content is important, use sr-only instead

CORRECT: Hide decorative content, keep meaningful content accessible
  class="sr-only md:not-sr-only"  — always accessible, visually hidden on mobile
```

A design principle: **do not hide critical content on mobile.** If information is important enough to show on desktop, it is important enough to show on mobile -- just present it differently. Hide decorative elements, secondary navigation, and supplementary information. Never hide the primary action, main content, or error messages.

### Grid Column Changes

Grids that reflow from one column to many are the backbone of card layouts, product grids, and dashboards:

```svelte
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {#each products as product}
    <div class="bg-white rounded-xl shadow-sm p-4">
      <img src={product.image} alt={product.name}
           class="w-full aspect-square object-cover rounded-lg" />
      <h3 class="mt-3 font-semibold">{product.name}</h3>
      <p class="text-gray-500">${product.price}</p>
    </div>
  {/each}
</div>
```

The `aspect-square` class is a production detail that matters. Without it, images of different dimensions create uneven card heights, which breaks the grid alignment. `object-cover` ensures the image fills its container without distortion.

An alternative approach uses `auto-fill` or `auto-fit` for grids that automatically adjust column count:

```svelte
<!-- Auto-responsive grid — no breakpoints needed -->
<div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
  {#each products as product}
    <div class="bg-white rounded-xl shadow-sm p-4">
      <!-- Each card is at least 280px wide, fills available space -->
    </div>
  {/each}
</div>
```

This CSS grid technique creates as many columns as will fit, with each column at least 280px wide. No breakpoints needed -- the grid automatically adjusts. Use explicit breakpoints (`grid-cols-1 sm:grid-cols-2`) when you want precise control over column count at each size. Use `auto-fill`/`auto-fit` when you want the grid to figure it out based on available space and a minimum item width.

### Responsive Spacing

Padding and margins often need to change with screen size. A page gutter of 16px on mobile feels right, but on a 1440px screen you need more breathing room:

```svelte
<main class="px-4 sm:px-6 lg:px-8 xl:px-12 py-6 lg:py-12">
  <div class="max-w-7xl mx-auto">
    <!-- Content with responsive gutters -->
  </div>
</main>
```

When should you use responsive utilities versus relative units? Use responsive utilities (`px-4 lg:px-8`) when the change is a deliberate design decision at a specific breakpoint. Use relative units (`padding: 2vw`) when you want truly fluid behavior. Most of the time, responsive utilities are clearer and more predictable.

A common wrapper pattern for consistent page margins:

```svelte
<!-- src/lib/components/PageContainer.svelte -->
<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
  {@render children()}
</div>
```

Use this component everywhere instead of repeating the padding utilities. It enforces consistent gutters across every page.

### Responsive Text

Typography needs to adapt to screen size, but not always in the way you might expect:

```svelte
<!-- WRONG: text too small on mobile, too large on desktop -->
<h1 class="text-xl lg:text-5xl">Page Title</h1>

<!-- CORRECT: readable on all sizes, proportional scaling -->
<h1 class="text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight">
  Page Title
</h1>

<!-- Body text: rarely needs to change size -->
<p class="text-base text-gray-600 max-w-prose">
  Body text should stay at a readable size on all screens.
  max-w-prose limits line length to ~65 characters for readability.
</p>
```

The `max-w-prose` utility is underappreciated. It limits the element's width to approximately 65 characters -- the optimal line length for reading. Without it, text on a wide screen stretches across the full viewport, making it hard to track from the end of one line to the beginning of the next.

## Container Queries: Component-Level Responsiveness

This is a paradigm shift. Traditional breakpoints ask "how wide is the viewport?" Container queries ask "how wide is my parent?" This matters because the same component can appear in wildly different contexts -- a card in a three-column grid, a card in a sidebar, a card in a modal -- and it should adapt to each.

Tailwind v4 supports container queries natively:

```svelte
<div class="@container">
  <div class="flex flex-col @md:flex-row gap-4">
    <img src="/photo.jpg" alt="Photo" class="w-full @md:w-48 rounded-lg" />
    <div>
      <h3 class="font-semibold text-lg">Article Title</h3>
      <p class="text-gray-600 text-sm @md:text-base">
        This layout responds to container width, not viewport width.
      </p>
    </div>
  </div>
</div>
```

The `@container` class marks a parent as a size container. The `@md:` prefix applies when that container is at least 28rem wide. This means the exact same markup renders differently depending on where you place it:

```svelte
<!-- Same component, two different containers -->
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <!-- In a wide column: card goes horizontal at @md -->
  <div class="lg:col-span-2">
    <ArticleCard {article} />
  </div>
  
  <!-- In a narrow column: card stays vertical because container is too small -->
  <div>
    <ArticleCard {article} />
  </div>
</div>
```

This is architecturally important. With viewport breakpoints, a component must know about the layout it lives in -- it must know whether it is in a sidebar or a main content area. With container queries, the component is truly self-contained. It adapts to whatever space it is given. This is the difference between a component and a layout-aware widget.

### Container Query Breakpoints

Tailwind v4 provides these container query breakpoints:

| Prefix | Min width | Common use |
|--------|-----------|------------|
| `@xs:` | 20rem (320px) | Very narrow containers |
| `@sm:` | 24rem (384px) | Sidebar cards |
| `@md:` | 28rem (448px) | Half-width content |
| `@lg:` | 32rem (512px) | Main content area |
| `@xl:` | 36rem (576px) | Wide content |
| `@2xl:` | 42rem (672px) | Full-width cards |

### Named Containers

When containers are nested, use names to target specific ancestors:

```svelte
<div class="@container/sidebar">
  <div class="@container/card">
    <p class="@lg/sidebar:text-xl @md/card:font-bold">
      This text responds to both the sidebar and card container sizes.
    </p>
  </div>
</div>
```

Named containers solve the ambiguity problem. Without names, `@md:` applies when the nearest `@container` ancestor is `>=28rem` wide. With names, you can target a specific container regardless of nesting depth.

### Building a Container-Query Card Component

Here is a complete card component that works in any context without knowing about its layout:

```svelte
<!-- src/lib/components/ProjectCard.svelte -->
<script lang="ts">
  let { project }: { project: { title: string; description: string; image: string; tags: string[] } } = $props();
</script>

<div class="@container">
  <article class="flex flex-col @sm:flex-row gap-4 rounded-xl border border-gray-200
                  bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
    <!-- Image: full width when stacked, fixed width when horizontal -->
    <img
      src={project.image}
      alt={project.title}
      class="w-full @sm:w-32 @md:w-48 aspect-video @sm:aspect-square
             rounded-lg object-cover"
    />

    <div class="flex flex-col justify-between gap-2">
      <!-- Title: larger when there is room -->
      <h3 class="text-base @md:text-lg font-semibold leading-tight">
        {project.title}
      </h3>

      <!-- Description: hidden in tiny containers, shown when there is room -->
      <p class="hidden @sm:block text-sm text-gray-500 dark:text-gray-400
                line-clamp-2 @lg:line-clamp-none">
        {project.description}
      </p>

      <!-- Tags: wrap when needed -->
      <div class="flex flex-wrap gap-1.5">
        {#each project.tags.slice(0, 3) as tag}
          <span class="rounded-full bg-gray-100 px-2 py-0.5 text-xs
                       dark:bg-gray-700">
            {tag}
          </span>
        {/each}
      </div>
    </div>
  </article>
</div>
```

This component renders as a compact vertical card in a sidebar (< 384px container) and as a horizontal card with full description in a main content area (> 448px container). No breakpoints, no layout awareness -- pure container-driven responsiveness.

### When to Use Container Queries vs Viewport Breakpoints

| Use container queries when... | Use viewport breakpoints when... |
|-------------------------------|----------------------------------|
| Component appears in different layout contexts | Layout affects the entire page structure |
| Component does not know its container width | You are controlling the page-level layout (sidebar, header) |
| You want truly reusable, layout-agnostic components | You need to hide/show entire sections (mobile menu vs sidebar) |
| The component is a card, widget, or embeddable element | You are setting page-level spacing and margins |

A good rule of thumb: **viewport breakpoints for layout, container queries for components**.

## Fluid Typography with clamp()

Breakpoint-based typography creates jarring jumps. At 767px your heading is 24px; at 768px it snaps to 36px. Fluid typography uses `clamp()` to scale smoothly between a minimum and maximum size:

```css
@theme {
  --text-fluid-sm: clamp(0.875rem, 0.8rem + 0.25vw, 1rem);
  --text-fluid-base: clamp(1rem, 0.9rem + 0.35vw, 1.125rem);
  --text-fluid-lg: clamp(1.25rem, 1rem + 0.75vw, 1.75rem);
  --text-fluid-xl: clamp(1.5rem, 1rem + 1.5vw, 2.5rem);
  --text-fluid-2xl: clamp(2rem, 1.2rem + 2.5vw, 3.5rem);
  --text-fluid-3xl: clamp(2.5rem, 1.5rem + 3vw, 4.5rem);
}
```

```svelte
<h1 class="text-fluid-2xl font-bold leading-tight">
  This heading scales smoothly from mobile to desktop
</h1>
<p class="text-fluid-base text-gray-600 max-w-prose">
  No breakpoints needed. The font size interpolates between the min and max
  based on the viewport width.
</p>
```

### Understanding clamp()

The `clamp(min, preferred, max)` function takes three values:

1. **min** -- the floor. The font size never goes below this, even on a 320px phone.
2. **preferred** -- the ideal value, usually including a `vw` unit so it scales with the viewport.
3. **max** -- the ceiling. The font size never exceeds this, even on a 4K monitor.

The preferred value is the key. It typically combines a `rem` base with a `vw` proportion:

```
preferred = base_rem + scale_vw
```

- `0.9rem + 0.35vw` -- subtle scaling, good for body text
- `1rem + 1.5vw` -- moderate scaling, good for section headings
- `1.2rem + 2.5vw` -- aggressive scaling, good for hero headings

### Calculating clamp() Values

There is a formula for calculating the preferred value when you want a specific font size at two viewport widths:

```
Given:
  min_font  = 16px at viewport 320px
  max_font  = 24px at viewport 1280px

Calculate:
  slope = (max_font - min_font) / (max_viewport - min_viewport)
  slope = (24 - 16) / (1280 - 320)
  slope = 8 / 960
  slope = 0.00833...
  slope in vw = 0.833vw

  intercept = min_font - slope * min_viewport
  intercept = 16 - 0.00833 * 320
  intercept = 16 - 2.666
  intercept = 13.33px = 0.833rem

Result:
  clamp(1rem, 0.833rem + 0.833vw, 1.5rem)
```

This is precise but tedious. In practice, use a tool like `utopia.fyi` to generate fluid type scales, or use the approximate values from the `@theme` example above.

### When to Use Fluid vs Breakpoint Typography

| Fluid typography | Breakpoint typography |
|-----------------|----------------------|
| Hero headings, marketing pages | Body text, UI labels |
| Anywhere smooth scaling looks polished | When you need precise control per breakpoint |
| Long-form content headings | Navigation items, buttons |
| When you want zero breakpoints for text | When font size affects layout (e.g., fitting text in a fixed-width container) |

A common mistake is applying fluid typography to everything. Body text at 16px does not need to scale -- it reads well on all screen sizes. Reserve fluid typography for headings and display text where the size difference between mobile and desktop is significant (e.g., 24px to 48px).

## Fluid Spacing with clamp()

The same `clamp()` technique works for spacing:

```css
@theme {
  --spacing-fluid-sm: clamp(0.5rem, 0.4rem + 0.25vw, 0.75rem);
  --spacing-fluid-md: clamp(1rem, 0.8rem + 0.5vw, 1.5rem);
  --spacing-fluid-lg: clamp(1.5rem, 1rem + 1.25vw, 3rem);
  --spacing-fluid-xl: clamp(2rem, 1rem + 2.5vw, 5rem);
}
```

```svelte
<section class="py-[--spacing-fluid-xl]">
  <div class="mx-auto max-w-7xl px-4">
    <h2 class="text-fluid-xl mb-[--spacing-fluid-lg]">Section Title</h2>
    <div class="grid gap-[--spacing-fluid-md]">
      <!-- Cards with fluid gaps -->
    </div>
  </div>
</section>
```

Fluid spacing is particularly effective for section padding. Marketing pages with `py-8 lg:py-20` have a visible jump at the `lg` breakpoint. Fluid spacing scales smoothly, creating a more polished experience.

## Touch Targets: The 44px Rule

On mobile, fingers are imprecise. Apple's Human Interface Guidelines and WCAG both recommend a minimum touch target of 44x44 CSS pixels. This is not a suggestion -- it is the difference between a usable mobile app and a frustrating one. Google's research found that 70% of tap errors on mobile are caused by targets smaller than 48px.

Tailwind's spacing scale helps. `p-3` gives 12px of padding on each side. On a text link or small button, that can be the difference between a tappable element and a rage-inducing pixel hunt:

```svelte
<!-- WRONG: too small for touch — 32px total height -->
<button class="px-3 py-1 text-sm">Tiny Button</button>

<!-- CORRECT: good touch target — 44px+ total height -->
<button class="px-4 py-3 text-sm">Tappable Button</button>

<!-- Nav links with adequate touch targets -->
<nav class="flex flex-col sm:flex-row gap-1">
  <a href="/home" class="px-4 py-3 sm:py-2 rounded-lg hover:bg-gray-100">
    Home
  </a>
  <a href="/about" class="px-4 py-3 sm:py-2 rounded-lg hover:bg-gray-100">
    About
  </a>
</nav>
```

Notice the pattern: `py-3` on mobile (generous touch target), `sm:py-2` on desktop (tighter, since mouse cursors are precise). This is mobile-first thinking applied to interaction design.

### Touch Target Spacing

Touch targets need spacing between them too. Adjacent touch targets without spacing cause mis-taps. The minimum recommended gap is 8px:

```svelte
<!-- WRONG: buttons touching each other — easy to mis-tap -->
<div class="flex">
  <button class="px-4 py-3">Save</button>
  <button class="px-4 py-3">Cancel</button>
</div>

<!-- CORRECT: gap between touch targets -->
<div class="flex gap-3">
  <button class="px-4 py-3">Save</button>
  <button class="px-4 py-3">Cancel</button>
</div>
```

### Extending Touch Targets Without Changing Visual Size

Sometimes a design calls for a small visual element (an icon button, a text link) but you still need a 44px touch target. Use padding or `min-h-11 min-w-11` without changing the visual appearance:

```svelte
<!-- Icon button: visually 24px, touch target 44px -->
<button class="p-2.5 -m-2.5 rounded-full hover:bg-gray-100" aria-label="Close">
  <svg class="w-5 h-5" ...></svg>
</button>
```

The negative margin (`-m-2.5`) cancels out the extra padding visually while keeping the touch target large. This is a common pattern for icon buttons in toolbars and navigation.

## Responsive Images

Images are often the largest assets on a page. Responsive image patterns ensure they load at the right size and resolution:

```svelte
<!-- Basic responsive image -->
<img
  src="/hero-800.jpg"
  srcset="/hero-400.jpg 400w, /hero-800.jpg 800w, /hero-1600.jpg 1600w"
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 800px"
  alt="Hero"
  class="w-full rounded-xl"
  loading="lazy"
  decoding="async"
/>
```

The `sizes` attribute tells the browser how wide the image will be at each viewport width:
- Below 640px: the image takes 100% of the viewport (`100vw`)
- Between 640px and 1024px: the image takes 50% of the viewport (`50vw`)
- Above 1024px: the image is 800px wide

The browser uses this information combined with `srcset` to pick the smallest image that looks sharp on the user's device. On a 375px phone with a 2x display, it picks `hero-800.jpg` (375 * 2 = 750, next size up is 800). On a 1440px desktop with a 1x display, it picks `hero-800.jpg` (display width is 800px, matching exactly).

Key responsive image utilities in Tailwind:

```svelte
<!-- Aspect ratio control — prevents layout shift -->
<img class="w-full aspect-video object-cover" ... />
<img class="w-full aspect-square object-cover" ... />
<img class="w-full aspect-[4/3] object-cover" ... />

<!-- Object position for cropped images -->
<img class="w-full aspect-video object-cover object-top" ... />

<!-- Lazy loading for below-the-fold images -->
<img class="w-full" loading="lazy" decoding="async" ... />
```

The `aspect-video` (16:9) and `aspect-square` (1:1) classes prevent layout shift by reserving space before the image loads. Without them, the page reflows when each image loads, causing the Cumulative Layout Shift (CLS) metric to spike.

## Dark Mode Responsive Patterns

Dark mode is its own responsive axis. Tailwind's `dark:` prefix works alongside responsive prefixes:

```svelte
<div class="bg-white dark:bg-gray-900
            border border-gray-200 dark:border-gray-700
            text-gray-900 dark:text-gray-100">
  <h2 class="text-xl font-bold text-gray-900 dark:text-white">
    Card Title
  </h2>
  <p class="text-gray-600 dark:text-gray-400">
    Card description
  </p>
</div>
```

You can combine dark mode with responsive prefixes:

```svelte
<!-- Different background on mobile dark mode vs desktop dark mode -->
<div class="bg-gray-50 dark:bg-gray-900 lg:bg-white lg:dark:bg-gray-800">
```

The order of prefixes matters: `lg:dark:bg-gray-800` means "at `lg` breakpoint AND in dark mode, apply `bg-gray-800`." This is because Tailwind v4 generates CSS with nested media queries and class selectors.

A production pattern for dark mode colors:

```css
@theme {
  --color-surface: #ffffff;
  --color-surface-secondary: #f9fafb;
  --color-text-primary: #111827;
  --color-text-secondary: #6b7280;
  --color-border: #e5e7eb;
}

@media (prefers-color-scheme: dark) {
  @theme {
    --color-surface: #111827;
    --color-surface-secondary: #1f2937;
    --color-text-primary: #f9fafb;
    --color-text-secondary: #9ca3af;
    --color-border: #374151;
  }
}
```

This approach uses CSS custom properties that automatically switch between light and dark values. Your components use `bg-surface` and `text-text-primary` without needing `dark:` prefixes everywhere.

## Real Example: Responsive Dashboard Layout

Here is a complete dashboard that goes from a single-column mobile layout to a complex multi-panel desktop layout. Study the breakpoint strategy -- every change has a reason:

```svelte
<script lang="ts">
  let { data } = $props();
  let menuOpen = $state(false);

  // Close mobile menu on navigation
  import { afterNavigate } from '$app/navigation';
  afterNavigate(() => { menuOpen = false; });
</script>

<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <!-- Mobile header: visible only below lg breakpoint -->
  <header class="lg:hidden flex items-center justify-between p-4
                 bg-white dark:bg-gray-800
                 border-b border-gray-200 dark:border-gray-700
                 sticky top-0 z-40">
    <h1 class="text-lg font-bold">Dashboard</h1>
    <button
      class="p-3 -m-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
      aria-label={menuOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={menuOpen}
      onclick={() => menuOpen = !menuOpen}
    >
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {#if menuOpen}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M6 18L18 6M6 6l12 12" />
        {:else}
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16" />
        {/if}
      </svg>
    </button>
  </header>

  <!-- Mobile menu overlay -->
  {#if menuOpen}
    <div class="lg:hidden fixed inset-0 z-30 bg-black/50"
         onclick={() => menuOpen = false}>
    </div>
    <nav class="lg:hidden fixed top-[57px] left-0 right-0 z-40
                bg-white dark:bg-gray-800
                border-b border-gray-200 dark:border-gray-700
                p-4 space-y-1">
      <a href="/dashboard"
         class="flex items-center gap-3 px-4 py-3 rounded-lg
                bg-blue-50 dark:bg-blue-900/30
                text-blue-700 dark:text-blue-300 font-medium">
        Home
      </a>
      <a href="/dashboard/analytics"
         class="flex items-center gap-3 px-4 py-3 rounded-lg
                text-gray-600 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-700">
        Analytics
      </a>
      <a href="/dashboard/settings"
         class="flex items-center gap-3 px-4 py-3 rounded-lg
                text-gray-600 dark:text-gray-400
                hover:bg-gray-100 dark:hover:bg-gray-700">
        Settings
      </a>
    </nav>
  {/if}

  <div class="lg:flex">
    <!-- Sidebar: hidden on mobile, fixed-width on desktop -->
    <aside class="hidden lg:flex lg:flex-col w-64 min-h-screen shrink-0
                  bg-white dark:bg-gray-800
                  border-r border-gray-200 dark:border-gray-700
                  p-6 sticky top-0">
      <h1 class="text-xl font-bold mb-8">Dashboard</h1>
      <nav class="space-y-1 flex-1">
        <a href="/dashboard"
           class="flex items-center gap-3 px-4 py-3 rounded-lg
                  bg-blue-50 dark:bg-blue-900/30
                  text-blue-700 dark:text-blue-300 font-medium">
          Home
        </a>
        <a href="/dashboard/analytics"
           class="flex items-center gap-3 px-4 py-3 rounded-lg
                  text-gray-600 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700">
          Analytics
        </a>
        <a href="/dashboard/settings"
           class="flex items-center gap-3 px-4 py-3 rounded-lg
                  text-gray-600 dark:text-gray-400
                  hover:bg-gray-100 dark:hover:bg-gray-700">
          Settings
        </a>
      </nav>
      <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
        <p class="text-sm text-gray-500">v1.0.0</p>
      </div>
    </aside>

    <!-- Main content area -->
    <main class="flex-1 p-4 sm:p-6 lg:p-8">
      <!-- Stats: 1 col on mobile, 2 on sm, 4 on xl -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        {#each data.stats as stat}
          <div class="@container bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6
                      shadow-sm border border-gray-100 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p class="text-2xl @xs:text-3xl font-bold mt-1">{stat.value}</p>
            <p class="text-xs mt-2 {stat.trend > 0 ? 'text-green-600' : 'text-red-600'}">
              {stat.trend > 0 ? '+' : ''}{stat.trend}% from last month
            </p>
          </div>
        {/each}
      </div>

      <!-- Content grid: stacked on mobile, 2/3 + 1/3 on lg -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6
                    shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-4">Recent Activity</h2>
          <div class="divide-y divide-gray-100 dark:divide-gray-700">
            {#each data.activities as activity}
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3">
                <span class="text-sm text-gray-500 sm:w-32 shrink-0">
                  {activity.time}
                </span>
                <span class="text-sm">{activity.description}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Sidebar panel -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6
                    shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-4">Quick Actions</h2>
          <div class="space-y-3">
            <button class="w-full text-left px-4 py-3 rounded-lg
                           bg-gray-50 dark:bg-gray-700
                           hover:bg-gray-100 dark:hover:bg-gray-600
                           transition-colors">
              New Report
            </button>
            <button class="w-full text-left px-4 py-3 rounded-lg
                           bg-gray-50 dark:bg-gray-700
                           hover:bg-gray-100 dark:hover:bg-gray-600
                           transition-colors">
              Export Data
            </button>
            <button class="w-full text-left px-4 py-3 rounded-lg
                           bg-gray-50 dark:bg-gray-700
                           hover:bg-gray-100 dark:hover:bg-gray-600
                           transition-colors">
              Invite Team
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
```

Key decisions in this layout:
- **Sidebar** uses `hidden lg:flex` -- below 1024px, the sidebar disappears entirely and a mobile menu takes over. This is a layout shift, not a squeeze. The sidebar is `sticky top-0` on desktop so it stays visible as the user scrolls.
- **Mobile menu** uses a fixed overlay with `z-30` backdrop and `z-40` menu. It closes on navigation using `afterNavigate`.
- **Stats grid** uses three breakpoints (`grid-cols-1`, `sm:grid-cols-2`, `xl:grid-cols-4`) because two columns on a tablet looks better than four cramped columns. Each stat card also uses `@container` for container-query-aware text sizing.
- **Main content padding** scales from `p-4` to `sm:p-6` to `lg:p-8` -- more breathing room as more space is available.
- **Activity items** go from stacked (`flex-col`) to inline (`sm:flex-row`) so timestamps and descriptions sit side by side when there is room.
- **Touch targets** on buttons and nav links are 48px+ tall (`py-3`) for comfortable mobile interaction.
- **ARIA attributes** on the menu button (`aria-label`, `aria-expanded`) ensure screen reader accessibility.

## Responsive Table Patterns

Tables are notoriously difficult to make responsive. Here are three production patterns:

### Pattern 1: Horizontal Scroll

The simplest approach -- let the table scroll horizontally:

```svelte
<div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
  <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
    <thead class="bg-gray-50 dark:bg-gray-800">
      <tr>
        <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Name</th>
        <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Email</th>
        <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Role</th>
        <th class="px-4 py-3 text-left text-sm font-medium text-gray-500">Status</th>
      </tr>
    </thead>
    <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
      {#each users as user}
        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800/50">
          <td class="px-4 py-3 text-sm whitespace-nowrap">{user.name}</td>
          <td class="px-4 py-3 text-sm whitespace-nowrap">{user.email}</td>
          <td class="px-4 py-3 text-sm">{user.role}</td>
          <td class="px-4 py-3 text-sm">{user.status}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

### Pattern 2: Card on Mobile, Table on Desktop

Transform the table into stacked cards on small screens:

```svelte
<!-- Table on desktop -->
<div class="hidden md:block">
  <table><!-- normal table markup --></table>
</div>

<!-- Cards on mobile -->
<div class="md:hidden space-y-4">
  {#each users as user}
    <div class="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div class="flex items-center justify-between">
        <span class="font-semibold">{user.name}</span>
        <span class="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
          {user.status}
        </span>
      </div>
      <p class="mt-1 text-sm text-gray-500">{user.email}</p>
      <p class="mt-1 text-sm text-gray-500">{user.role}</p>
    </div>
  {/each}
</div>
```

### Pattern 3: Selective Column Hiding

Hide less important columns on smaller screens:

```svelte
<table class="min-w-full">
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th class="hidden sm:table-cell">Role</th>
      <th class="hidden lg:table-cell">Created</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    {#each users as user}
      <tr>
        <td>{user.name}</td>
        <td>{user.email}</td>
        <td class="hidden sm:table-cell">{user.role}</td>
        <td class="hidden lg:table-cell">{user.createdAt}</td>
        <td>{user.status}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

Note the use of `sm:table-cell` instead of `sm:block`. Table cells must use `display: table-cell` to maintain proper table layout. Using `sm:block` on a `<td>` would break the table's column alignment.

## Testing Responsive Designs

Building responsive is half the job. Testing it is the other half.

**Chrome DevTools Device Mode** (`Cmd+Shift+M` / `Ctrl+Shift+M`) lets you simulate different viewport sizes and devices. Use the responsive mode and drag the handles to find breakpoints where your layout breaks -- those are the widths where you need to add responsive utilities.

**Test at real breakpoints and between them.** Most bugs happen at 639px (just below `sm:`), not at 640px. Drag the viewport width slowly across each breakpoint and look for content overflow, text truncation, and overlapping elements. Here is a systematic testing checklist:

| Width | Breakpoint | What to check |
|-------|------------|---------------|
| 320px | Below all | Smallest phone. Does anything overflow? |
| 375px | Below all | iPhone SE/Mini. Most common small phone. |
| 639px | Just below `sm:` | Edge case. Does mobile layout hold? |
| 640px | At `sm:` | First breakpoint. Do layout changes work? |
| 767px | Just below `md:` | Tablet edge case. |
| 768px | At `md:` | Tablet. Does the layout transition smoothly? |
| 1023px | Just below `lg:` | Small laptop edge case. |
| 1024px | At `lg:` | Desktop. Does the full layout work? |
| 1280px | At `xl:` | Wide desktop. Do things look right with extra space? |
| 1920px | Wide desktop | Does content stretch too wide? Is `max-w-7xl` working? |

**Test on real devices** when possible. Simulators do not capture the feeling of tapping a 32px button with a thumb, the way text wraps differently on iOS Safari, or how a fixed-position header interacts with the mobile browser chrome.

**iOS Safari gotchas:**
- `100vh` includes the browser chrome (address bar). Use `100dvh` (dynamic viewport height) instead.
- `position: fixed` elements can behave unexpectedly when the keyboard is open.
- `touch-action: manipulation` prevents the 300ms tap delay on older iOS versions.

**Container query testing:** since container queries respond to parent width, you cannot test them by resizing the browser window alone. You need to actually render the component in different-width containers. Build a test page that places the same component in a narrow sidebar and a wide content area simultaneously.

```svelte
<!-- src/routes/test-responsive/+page.svelte -->
<script>
  import ProjectCard from '$lib/components/ProjectCard.svelte';
  const testProject = { title: 'Test', description: 'Test description', image: '/test.jpg', tags: ['test'] };
</script>

<h1 class="text-xl font-bold mb-6">Container Query Test</h1>
<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div class="lg:col-span-2">
    <h2 class="text-sm font-medium text-gray-500 mb-2">Wide container</h2>
    <ProjectCard project={testProject} />
  </div>
  <div>
    <h2 class="text-sm font-medium text-gray-500 mb-2">Narrow container</h2>
    <ProjectCard project={testProject} />
  </div>
</div>
```

## Try It

Build a responsive portfolio layout with these specific requirements:

1. A full-width hero section on all screens with fluid typography using `clamp()` for the heading (minimum 2rem, maximum 4rem). The hero should have responsive padding that scales from `py-12` on mobile to `py-24` on desktop.

2. A project grid that goes from 1 column on mobile to 2 on tablet to 3 on desktop using Tailwind grid utilities. Each project card should use container queries (`@container`) so it renders as a compact vertical layout in narrow containers and a horizontal layout in wide containers.

3. A sidebar with contact info that moves from below the projects on mobile to a sticky sidebar on desktop (`lg:sticky lg:top-8`). Use `hidden lg:block` for the desktop sidebar and render the contact info inline on mobile instead.

4. Ensure all interactive elements (links, buttons) have at least 44px touch targets on mobile with `py-3`. Use `sm:py-2` to tighten them on desktop.

5. Add dark mode support to every component using `dark:` variants.

6. Add a responsive table section showing project metrics. Use the horizontal scroll pattern on mobile and the full table on desktop.

7. Test your layout at 320px, 639px, 640px, 768px, 1024px, and 1280px. Verify that no content overflows and all layout transitions are smooth.

## Key Takeaways

- Mobile-first is not just a CSS convention -- it forces you to solve the hardest design problem first and progressively enhance. Write unprefixed utilities for mobile, add `sm:`, `md:`, `lg:` for larger screens
- Tailwind v4 uses the `@theme` directive in CSS for breakpoint configuration, not `tailwind.config.js`
- Common responsive patterns (stack-to-row, hide/show, grid reflow, responsive spacing) cover 90% of responsive layouts. Learn them as building blocks
- Container queries (`@container` + `@md:`) make components layout-agnostic -- they adapt to their parent, not the viewport. Use viewport breakpoints for page layout, container queries for component internals
- Named containers (`@container/sidebar`) resolve ambiguity when containers are nested
- Fluid typography with `clamp()` eliminates jarring size jumps between breakpoints. Reserve it for headings and display text, not body copy
- Fluid spacing with `clamp()` works the same way and is especially effective for section padding
- Use responsive utilities for deliberate breakpoint changes; use relative units and `clamp()` for truly fluid behavior
- Touch targets must be at least 44x44px -- `py-3` on interactive elements is your friend on mobile. Add gaps between adjacent touch targets to prevent mis-taps
- Use `max-w-prose` to limit line length for readability on wide screens
- The `aspect-square` and `aspect-video` utilities prevent layout shift for responsive images
- `auto-fill`/`auto-fit` CSS grid creates automatically responsive grids without breakpoints
- Dark mode is a responsive axis -- combine `dark:` with responsive prefixes and consider using CSS custom properties for automatic theme switching
- Tables need special responsive patterns: horizontal scroll, card transformation, or selective column hiding. Remember `sm:table-cell` not `sm:block` for table cells
- Test at breakpoints AND between them. Most responsive bugs happen at 639px, not 640px. Test on real devices for touch precision, iOS Safari quirks, and browser chrome interactions
- Use `100dvh` instead of `100vh` for mobile full-height layouts to account for browser chrome
