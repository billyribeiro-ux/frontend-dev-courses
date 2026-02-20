# Advanced Responsive Patterns

You already know Tailwind's responsive prefixes like `md:` and `lg:`. Now it is time to explore advanced patterns: container queries that respond to a parent's size instead of the viewport, complex grid layouts that adapt at every breakpoint, and building a fully responsive dashboard.

## Responsive Breakpoint Review

Tailwind's breakpoints are mobile-first. Utilities without a prefix apply to all screen sizes. Prefixed utilities apply at that breakpoint and above:

```svelte
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
  <!-- 1 column on mobile, 2 on small, 3 on large, 4 on extra large -->
</div>
```

## Container Queries

Sometimes a component's layout should depend on its container, not the viewport. A card in a sidebar should be compact, but the same card in the main content area should be wide — regardless of screen size.

Tailwind v4 supports container queries natively:

```svelte
<div class="@container">
  <div class="flex flex-col @md:flex-row gap-4">
    <img src="/photo.jpg" alt="Photo" class="w-full @md:w-48 rounded-lg" />
    <div>
      <h3 class="font-semibold text-lg">Article Title</h3>
      <p class="text-gray-600 @md:text-base text-sm">
        This layout switches from stacked to horizontal based on the container width.
      </p>
    </div>
  </div>
</div>
```

The `@container` class marks a parent as a container. The `@md:` prefix applies styles when the container (not the viewport) is at least 28rem wide.

## Named Containers

When containers are nested, use names to target a specific one:

```svelte
<div class="@container/sidebar">
  <div class="@container/card">
    <p class="@lg/sidebar:text-xl @md/card:font-bold">
      This text responds to both the sidebar and card container sizes.
    </p>
  </div>
</div>
```

## Responsive Dashboard Layout

Build a complete dashboard layout that adapts from mobile to desktop:

```svelte
<div class="min-h-screen bg-gray-50 dark:bg-gray-900">
  <!-- Mobile header (hidden on desktop) -->
  <header class="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b">
    <h1 class="text-lg font-bold">Dashboard</h1>
    <button class="p-2">Menu</button>
  </header>

  <div class="lg:flex">
    <!-- Sidebar (hidden on mobile, visible on desktop) -->
    <aside class="hidden lg:block w-64 min-h-screen bg-white dark:bg-gray-800 border-r p-6">
      <h1 class="text-xl font-bold mb-8">Dashboard</h1>
      <nav class="space-y-2">
        <a href="/dashboard" class="block px-4 py-2 rounded-lg bg-blue-50 text-blue-700">Home</a>
        <a href="/dashboard/analytics" class="block px-4 py-2 rounded-lg hover:bg-gray-100">Analytics</a>
        <a href="/dashboard/settings" class="block px-4 py-2 rounded-lg hover:bg-gray-100">Settings</a>
      </nav>
    </aside>

    <!-- Main content -->
    <main class="flex-1 p-4 lg:p-8">
      <!-- Stats grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Total Users</p>
          <p class="text-2xl font-bold mt-1">12,345</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Revenue</p>
          <p class="text-2xl font-bold mt-1">$45,678</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Orders</p>
          <p class="text-2xl font-bold mt-1">1,234</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <p class="text-sm text-gray-500">Conversion</p>
          <p class="text-2xl font-bold mt-1">3.2%</p>
        </div>
      </div>

      <!-- Content area -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold mb-4">Recent Activity</h2>
          <p class="text-gray-500">Chart goes here</p>
        </div>
        <div class="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm">
          <h2 class="text-lg font-semibold mb-4">Quick Actions</h2>
          <div class="space-y-3">
            <button class="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100">
              New Report
            </button>
            <button class="w-full text-left px-4 py-3 rounded-lg bg-gray-50 hover:bg-gray-100">
              Export Data
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
```

## Responsive Typography

Scale typography smoothly across breakpoints:

```svelte
<h1 class="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold leading-tight">
  Responsive Heading
</h1>

<p class="text-sm sm:text-base lg:text-lg max-w-prose">
  Body text that scales up on larger screens while maintaining a comfortable reading width.
</p>
```

## Try It

Build a responsive portfolio layout with: a full-width hero section on all screens, a project grid that goes from 1 column on mobile to 2 on tablet to 3 on desktop, and a sidebar with contact info that moves from below the projects on mobile to a sticky sidebar on desktop. Use container queries for the project cards so they show a compact layout in the sidebar preview and a detailed layout in the main grid.

## Key Takeaways

- Tailwind breakpoints are mobile-first: unprefixed utilities apply everywhere, prefixed ones apply at that size and up
- Container queries (`@container` and `@md:`) respond to a parent element's width, not the viewport
- Named containers let you target specific ancestors when containers are nested
- Dashboard layouts combine `lg:flex`, `hidden lg:block`, and responsive grid columns
- Use `col-span-*` to create asymmetric grid layouts
- Scale typography and spacing across breakpoints for comfortable reading at every size
