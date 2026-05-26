# Advanced Responsive Patterns

Responsive design is not about making things shrink. It is about designing for the constraints and opportunities of every screen size — from a 320px phone held in one hand to a 2560px ultrawide monitor with a mouse and keyboard. The tools are breakpoints, container queries, fluid typography, and intentional layout shifts. The mental model is: **start with the most constrained environment (mobile), then progressively enhance for more space.**

You already know Tailwind's responsive prefixes. Now it is time to understand the deeper patterns: why mobile-first matters architecturally, how container queries change component design, how fluid typography eliminates breakpoint jumps, and how to think about touch targets. These are the patterns that separate "it works on my laptop" from "it works everywhere."

## Mobile-First: Why the Order Matters

Tailwind's breakpoints are `min-width` queries. This is not an arbitrary choice — it encodes a philosophy. Unprefixed utilities are your mobile styles. Prefixed utilities (`sm:`, `md:`, `lg:`) layer on complexity as the screen grows:

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
<!-- Mobile-first thinking: start stacked, go horizontal when there is room -->
<div class="flex flex-col sm:flex-row gap-4">
  <div class="w-full sm:w-1/3">Sidebar</div>
  <div class="w-full sm:w-2/3">Main content</div>
</div>
```

## Common Responsive Patterns

Most responsive layouts are variations of a few core patterns. Learn these, and you can build almost any responsive page:

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

### Grid Column Changes

Grids that reflow from one column to many are the backbone of card layouts, product grids, and dashboards:

```svelte
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  {#each products as product}
    <div class="bg-white rounded-xl shadow-sm p-4">
      <img src={product.image} alt={product.name} class="w-full aspect-square object-cover rounded-lg" />
      <h3 class="mt-3 font-semibold">{product.name}</h3>
      <p class="text-gray-500">${product.price}</p>
    </div>
  {/each}
</div>
```

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

## Container Queries: Component-Level Responsiveness

This is a paradigm shift. Traditional breakpoints ask "how wide is the viewport?" Container queries ask "how wide is my parent?" This matters because the same component can appear in wildly different contexts — a card in a three-column grid, a card in a sidebar, a card in a modal — and it should adapt to each.

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

Container queries are the right tool when a component needs to be layout-agnostic — when it should not know or care whether it is in a sidebar, a modal, or the main content area.

## Fluid Typography with clamp()

Breakpoint-based typography creates jarring jumps. At 767px your heading is 24px; at 768px it snaps to 36px. Fluid typography uses `clamp()` to scale smoothly between a minimum and maximum size:

```css
@theme {
  --text-fluid-sm: clamp(0.875rem, 0.8rem + 0.25vw, 1rem);
  --text-fluid-base: clamp(1rem, 0.9rem + 0.35vw, 1.125rem);
  --text-fluid-lg: clamp(1.25rem, 1rem + 0.75vw, 1.75rem);
  --text-fluid-xl: clamp(1.5rem, 1rem + 1.5vw, 2.5rem);
  --text-fluid-2xl: clamp(2rem, 1.2rem + 2.5vw, 3.5rem);
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

The `clamp(min, preferred, max)` function takes three values. The preferred value (middle) usually includes a `vw` unit so it scales with the viewport. The min and max values set the floor and ceiling. This gives you responsive typography with zero breakpoints and zero jumps.

When to use fluid typography versus breakpoint-based: use fluid for hero headings, marketing pages, and anywhere smooth scaling looks better than discrete steps. Use breakpoints for body text and UI copy where you want precise control at each size.

## Touch Targets: The 44px Rule

On mobile, fingers are imprecise. Apple's Human Interface Guidelines and WCAG both recommend a minimum touch target of 44x44 CSS pixels. This is not a suggestion — it is the difference between a usable mobile app and a frustrating one.

Tailwind's spacing scale helps. `p-3` gives 12px of padding on each side. On a text link or small button, that can be the difference between a tappable element and a rage-inducing pixel hunt:

```svelte
<!-- Too small for touch — 32px total height -->
<button class="px-3 py-1 text-sm">Tiny Button</button>

<!-- Good touch target — 44px+ total height -->
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

## Real Example: Responsive Dashboard Layout

Here is a complete dashboard that goes from a single-column mobile layout to a complex multi-panel desktop layout. Study the breakpoint strategy — every change has a reason:

```svelte
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <!-- Mobile header: visible only below lg breakpoint -->
  <header class="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
    <h1 class="text-lg font-bold">Dashboard</h1>
    <button class="p-3 -m-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="Menu">
      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  </header>

  <div class="lg:flex">
    <!-- Sidebar: hidden on mobile, fixed-width on desktop -->
    <aside class="hidden lg:flex lg:flex-col w-64 min-h-screen bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 p-6">
      <h1 class="text-xl font-bold mb-8">Dashboard</h1>
      <nav class="space-y-1 flex-1">
        <a href="/dashboard" class="flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
          Home
        </a>
        <a href="/dashboard/analytics" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
          Analytics
        </a>
        <a href="/dashboard/settings" class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
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
        {#each stats as stat}
          <div class="bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <p class="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p class="text-2xl font-bold mt-1">{stat.value}</p>
            <p class="text-xs mt-2 {stat.trend > 0 ? 'text-green-600' : 'text-red-600'}">
              {stat.trend > 0 ? '+' : ''}{stat.trend}% from last month
            </p>
          </div>
        {/each}
      </div>

      <!-- Content grid: stacked on mobile, 2/3 + 1/3 on lg -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-4">Recent Activity</h2>
          <div class="space-y-4">
            <!-- Activity items with responsive layout -->
            {#each activities as activity}
              <div class="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0">
                <span class="text-sm text-gray-500 sm:w-32 shrink-0">{activity.time}</span>
                <span class="text-sm">{activity.description}</span>
              </div>
            {/each}
          </div>
        </div>

        <!-- Sidebar panel -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-5 sm:p-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 class="text-lg font-semibold mb-4">Quick Actions</h2>
          <div class="space-y-3">
            <button class="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
              New Report
            </button>
            <button class="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
              Export Data
            </button>
            <button class="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
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
- **Sidebar** uses `hidden lg:flex` — below 1024px, the sidebar disappears entirely and a mobile header takes over. This is a layout shift, not a squeeze.
- **Stats grid** uses three breakpoints (`grid-cols-1`, `sm:grid-cols-2`, `xl:grid-cols-4`) because two columns on a tablet looks better than four cramped columns.
- **Main content padding** scales from `p-4` to `sm:p-6` to `lg:p-8` — more breathing room as more space is available.
- **Activity items** go from stacked (`flex-col`) to inline (`sm:flex-row`) so timestamps and descriptions sit side by side when there is room.
- **Touch targets** on buttons and nav links are 48px+ tall (`py-3`) for comfortable mobile interaction.

## Testing Responsive Designs

Building responsive is half the job. Testing it is the other half:

**Chrome DevTools Device Mode** (`Cmd+Shift+M` / `Ctrl+Shift+M`) lets you simulate different viewport sizes and devices. Use the responsive mode and drag the handles to find breakpoints where your layout breaks — those are the widths where you need to add responsive utilities.

**Test at real breakpoints and between them.** Most bugs happen at 639px (just below `sm:`), not at 640px. Drag the viewport width slowly across each breakpoint and look for content overflow, text truncation, and overlapping elements.

**Test on real devices** when possible. Simulators do not capture the feeling of tapping a 32px button with a thumb, the way text wraps differently on iOS Safari, or how a fixed-position header interacts with the mobile browser chrome. Browsers like Safari on iOS handle viewport units (`vh`) differently from desktop browsers — what looks perfect in DevTools can break on an actual phone.

**Container query testing:** since container queries respond to parent width, you cannot test them by resizing the browser window alone. You need to actually render the component in different-width containers. Build a test page that places the same component in a narrow sidebar and a wide content area simultaneously.

## Try It

Build a responsive portfolio layout with: a full-width hero section on all screens, a project grid that goes from 1 column on mobile to 2 on tablet to 3 on desktop, and a sidebar with contact info that moves from below the projects on mobile to a sticky sidebar on desktop. Use container queries for the project cards so they show a compact layout in the sidebar preview and a detailed layout in the main grid. Add fluid typography for the hero heading using `clamp()`. Ensure all interactive elements have at least 44px touch targets on mobile.

## Key Takeaways

- Mobile-first is not just a CSS convention — it forces you to solve the hardest design problem first and progressively enhance
- Common responsive patterns (stack-to-row, hide/show, grid reflow) cover 90% of responsive layouts. Learn them as building blocks
- Container queries (`@container` + `@md:`) make components layout-agnostic — they adapt to their parent, not the viewport
- Fluid typography with `clamp()` eliminates jarring size jumps between breakpoints
- Use responsive utilities for deliberate breakpoint changes; use relative units for truly fluid behavior
- Touch targets must be at least 44x44px — `py-3` on interactive elements is your friend on mobile
- Test at breakpoints AND between them. Most responsive bugs happen at the edges, not the exact breakpoint widths
- Real device testing catches issues that simulators miss — iOS Safari viewport behavior, touch precision, and browser chrome interactions
