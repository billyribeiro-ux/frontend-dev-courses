# Utility-First CSS

Traditional CSS has you writing custom class names and style rules for every element: `.card-title`, `.nav-link`, `.hero-section`. Utility-first CSS flips this approach. Instead of inventing class names, you compose styles directly in your HTML using small, single-purpose utility classes like `text-lg`, `bg-white`, `p-4`, and `rounded-lg`.

Tailwind CSS is the most popular utility-first framework. It provides hundreds of pre-built utility classes that map to CSS properties. Once you get used to the approach, you can build complex layouts and components without ever leaving your markup. This lesson introduces the philosophy, the core utilities, and how Tailwind fits into Svelte development.

> **Note:** This course uses **Tailwind CSS v4**, which has a simplified setup (no config file, CSS-first configuration with `@theme`). If you see older tutorials referencing `tailwind.config.js`, that's the v3 approach — we use the modern v4 way throughout.

## The Utility-First Philosophy

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

1. **Naming.** You invent `.user-card`, `.user-card__avatar`, `.user-card__name`. These names carry no information the browser cares about — they exist purely to connect HTML to CSS. Every name is a decision, and decisions are cognitive overhead.
2. **Context-switching.** With traditional CSS, you read the HTML, jump to the CSS file, then jump back. With utilities, the styles are right there in the markup. One file, one context.
3. **Dead CSS.** When you delete a component, do you also delete its styles? Usually not — you are afraid something else might use `.card-title`. With utilities, you delete the markup and the styles vanish with it.
4. **Style conflicts.** Traditional CSS uses specificity, which creates ordering bugs. Utility classes are flat — each one maps to exactly one CSS declaration. No cascading surprises.

The tradeoff is real: your class strings get longer. But you gain **zero naming decisions, zero dead CSS, zero style conflicts, and zero context-switching.** For most teams, that is a net win.

## Core Utility Classes

Tailwind organizes utilities by category. Here are the ones you will reach for daily.

### Layout — Flexbox and Grid

```svelte
<!-- Flexbox row with centered items and gap -->
<div class="flex items-center justify-between gap-4">
  <span>Left</span>
  <span>Right</span>
</div>

<!-- Flexbox column -->
<div class="flex flex-col gap-2">
  <p>First</p>
  <p>Second</p>
</div>

<!-- CSS Grid — 3 equal columns with gap -->
<div class="grid grid-cols-3 gap-6">
  <div>One</div>
  <div>Two</div>
  <div>Three</div>
</div>
```

The pattern: `flex` or `grid` on the container, then alignment and sizing utilities to control the children. Once this clicks, you can lay out almost anything without writing a single line of CSS.

### Spacing — Padding and Margin

Tailwind uses a spacing scale where each step is 0.25rem (4px). So `p-1` is 4px, `p-2` is 8px, `p-4` is 16px, `p-8` is 32px:

```svelte
<div class="p-4">Padding on all sides (1rem / 16px)</div>
<div class="px-6 py-2">Horizontal 1.5rem, vertical 0.5rem</div>
<div class="mt-4">Margin-top 1rem</div>
<div class="space-y-4">Vertical spacing between children</div>
```

The prefix tells you which sides: `p-`/`m-` = all, `px-`/`mx-` = horizontal, `py-`/`my-` = vertical, `pt-`/`pr-`/`pb-`/`pl-` = individual sides, and `gap-` = spacing between flex/grid children.

**Tip:** Prefer `gap` over margin for spacing between sibling elements. It is cleaner and does not create unwanted space on the first or last child.

### Typography

```svelte
<h1 class="text-3xl font-bold">Large bold heading</h1>
<h2 class="text-xl font-semibold">Section heading</h2>
<p class="text-sm text-gray-500">Small muted helper text</p>
<p class="leading-relaxed tracking-wide">Relaxed line spacing, wider letters.</p>
<p class="truncate">Long text cut off with an ellipsis...</p>
```

The `text-` prefix does double duty: `text-xl` sets font size, while `text-gray-500` sets color. This might feel ambiguous at first, but in practice you always pair a size with a color, so the context is clear.

### Colors — Text, Background, and Border

Tailwind provides a color palette with shades from 50 (lightest) to 950 (darkest):

```svelte
<p class="text-gray-900">Primary text (nearly black)</p>
<p class="text-gray-500">Secondary text (muted)</p>
<div class="bg-white">White background</div>
<div class="bg-gray-50">Barely-there gray</div>
<div class="border border-gray-200">Subtle border</div>
<div class="border-2 border-blue-500">Prominent blue border</div>
```

A practical palette for most UIs: `gray-900` for headings, `gray-700` for body text, `gray-500` for muted text, `gray-200` for borders, `gray-50` or `white` for backgrounds, and one accent color (e.g., `blue-600`) for interactive elements.

### Borders, Radius, Shadows, and Sizing

```svelte
<div class="border border-gray-200 rounded-lg">Bordered box</div>
<div class="rounded-xl shadow-md">Rounded with medium shadow</div>
<img class="rounded-full w-12 h-12 object-cover" src="/avatar.jpg" alt="Avatar" />
<div class="max-w-md mx-auto">Centered container with max width</div>
<div class="shadow-sm">Subtle</div>
<div class="shadow-lg">Large — good for modals</div>
```

## Responsive Design — Mobile-First Prefixes

Tailwind uses breakpoint prefixes to apply styles at specific screen sizes. The key insight is **mobile-first**: unprefixed classes apply to all sizes, and prefixed classes kick in at that breakpoint and above.

```svelte
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  <div class="p-4 bg-white rounded-lg shadow">Card 1</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 2</div>
  <div class="p-4 bg-white rounded-lg shadow">Card 3</div>
</div>
```

Reading this: "1 column by default (mobile), 2 columns at medium screens (768px+), 3 columns at large screens (1024px+)."

The breakpoints:
- No prefix = all screen sizes (start here — this is your mobile layout)
- `sm:` = 640px+, `md:` = 768px+, `lg:` = 1024px+, `xl:` = 1280px+, `2xl:` = 1536px+

A common pattern for responsive text:

```svelte
<h1 class="text-2xl md:text-4xl lg:text-5xl font-bold">Responsive Heading</h1>
```

**Think mobile-first.** Start with the smallest screen and add complexity upward. This is not just a Tailwind convention — it produces better CSS and forces you to prioritize content over decoration.

## State Variants — Hover, Focus, and Beyond

Apply styles on hover, focus, and other states using prefixes:

```svelte
<button class="bg-blue-600 text-white px-4 py-2 rounded-lg
               hover:bg-blue-700
               focus:ring-2 focus:ring-blue-400 focus:outline-none
               active:bg-blue-800
               disabled:opacity-50 disabled:cursor-not-allowed
               transition">
  Click me
</button>
```

Each state prefix applies its utility only when the condition is true. The `transition` class adds a smooth animation between states.

### Group Hover — Styling Children Based on Parent State

Sometimes you want child elements to react when the parent is hovered. The `group` utility handles this:

```svelte
<a href="/product" class="group block p-4 rounded-lg hover:bg-gray-50 transition">
  <h3 class="font-semibold group-hover:text-blue-600 transition-colors">Product Name</h3>
  <p class="text-sm text-gray-500 group-hover:text-gray-700">
    Description that changes color when the card is hovered.
  </p>
</a>
```

Add `group` to the parent and use `group-hover:` on children. This is powerful for card links where the entire card is clickable but specific text should change color.

### Dark Mode

Tailwind supports dark mode with the `dark:` prefix:

```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  <p class="text-gray-500 dark:text-gray-400">
    This text adapts to dark mode automatically.
  </p>
</div>
```

In Tailwind v4, dark mode uses the CSS `prefers-color-scheme` media query by default. You can also configure it to use a class-based strategy for manual toggling.

## Tailwind + Svelte — A Natural Fit

**Scoped styles and Tailwind coexist.** Tailwind utilities are global (applied via class names), while Svelte's `<style>` block is scoped to the component. They do not interfere with each other. Use Tailwind for layout, spacing, colors, and typography. Use Svelte's scoped styles when you need something Tailwind does not cover.

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
  /* Scoped styles for things Tailwind doesn't cover */
  article { container-type: inline-size; }
</style>
```

**Svelte components are the abstraction layer.** In traditional CSS, you extract repeated styles into a class like `.card`. With Tailwind + Svelte, you extract repeated markup into a component like `<Card>`. The component bundles markup, styles, and behavior together — a better abstraction than a class name.

## Real Example: Responsive Product Card

Here is a complete, production-style card component built entirely with Tailwind:

```svelte
<!-- ProductCard.svelte -->
<script lang="ts">
  interface Props { name: string; price: number; image: string; inStock: boolean }
  let { name, price, image, inStock }: Props = $props();
</script>

<div class="group flex flex-col bg-white rounded-xl shadow-sm
            hover:shadow-md transition-shadow overflow-hidden">
  <div class="aspect-[4/3] overflow-hidden">
    <img class="w-full h-full object-cover group-hover:scale-105
                transition-transform duration-300"
         src={image} alt={name} />
  </div>
  <div class="flex flex-col gap-1 p-4">
    <h3 class="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
      {name}
    </h3>
    <div class="flex items-center justify-between">
      <span class="text-lg font-bold">${price.toFixed(2)}</span>
      {#if inStock}
        <span class="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          In Stock
        </span>
      {:else}
        <span class="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
          Out of Stock
        </span>
      {/if}
    </div>
  </div>
</div>
```

And a responsive grid that uses it:

```svelte
<div class="max-w-6xl mx-auto px-4 py-8">
  <h1 class="text-3xl font-bold mb-8">Our Products</h1>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {#each products as product}
      <ProductCard {...product} />
    {/each}
  </div>
</div>
```

Notice how much is happening with zero custom CSS: responsive grid, hover effects on the card and image, conditional stock badges, proper spacing and typography. This is the utility-first payoff.

## When NOT to Use Tailwind

Tailwind is excellent for most UI work, but there are cases where other approaches are better:

**Complex animations.** Multi-step keyframe animations are awkward as utility classes. Use Svelte's `transition:` and `animate:` directives instead:

```svelte
<div class="p-4" transition:fly={{ y: 20, duration: 300 }}>
  Svelte transitions are better for this.
</div>
```

**Highly dynamic styles.** When a value comes from JavaScript — a computed color, a progress percentage — use Svelte's `style:` directive. You cannot write `class="w-{progress}%"` because Tailwind generates classes at build time, so dynamic class names do not work:

```svelte
<script lang="ts">
  let progress = $state(65);
</script>

<div class="h-2 rounded-full bg-gray-200">
  <div class="h-full rounded-full bg-blue-600 transition-all"
       style:width="{progress}%"></div>
</div>
```

**Runtime-customizable themes.** If your app supports arbitrary user-chosen colors, Tailwind's predefined palette will not cover it. Use CSS custom properties and reference them with `bg-[var(--brand-color)]` syntax, or skip Tailwind for that part entirely.

## Performance — Only the CSS You Use

A common concern: "doesn't shipping hundreds of utility classes make a huge CSS file?" No. Tailwind's engine scans your source files and generates only the CSS for classes you actually use. If you never write `bg-purple-400`, that rule never ends up in your stylesheet.

The result is typically 5-15 KB (gzipped) for a full application — smaller than most hand-written stylesheets. No dead CSS to audit, no PurgeCSS to configure (it is built in), no wasted bytes. In a SvelteKit project, this works automatically — Tailwind scans your `.svelte`, `.ts`, and `.html` files during the build and produces minimal CSS output.

## Try It

1. Build a "profile card" component with an avatar (`rounded-full`), a name (bold), a role (muted gray text), and an email. Use `flex items-center gap-4` for horizontal layout.
2. Make it responsive: stack vertically on mobile (`flex-col`), side by side on medium screens (`md:flex-row`).
3. Add hover effects: subtle background change on the card (`hover:bg-gray-50`), name turns blue using `group` and `group-hover:`.
4. Add dark mode variants: `dark:bg-gray-800`, `dark:text-white`, and appropriate dark colors for muted text.
5. Add a "Contact" button with `hover:`, `focus:ring-2`, and `disabled:opacity-50` states.

## Key Takeaways

- **Utility-first CSS** composes styles from small, single-purpose classes directly in markup — eliminating naming, dead CSS, and style conflicts
- The tradeoff is longer class strings, but you gain **colocation** (styles live next to the elements they affect) and **zero wasted CSS**
- Core categories: layout (`flex`, `grid`, `gap`), spacing (`p-`, `m-`), typography (`text-`, `font-`), colors (`bg-`, `text-`, `border-`), borders (`rounded-`, `border-`), shadows (`shadow-`)
- **Responsive prefixes** (`sm:`, `md:`, `lg:`, `xl:`) are mobile-first — start with the mobile layout, add complexity upward
- **State prefixes** (`hover:`, `focus:`, `active:`, `disabled:`, `dark:`, `group-hover:`) handle interactive and conditional states
- **Svelte components are the abstraction layer** — extract repeated Tailwind markup into components, not CSS classes
- Use Svelte's `style:` directive for dynamic values and `transition:` for animations — Tailwind is for static, known-at-build-time styles
- Tailwind's build engine generates **only the CSS you use**, resulting in tiny production stylesheets
