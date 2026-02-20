# Tailwind Patterns

Now that Tailwind is installed and configured, let's build real UI patterns. This lesson covers the components you will build most often — cards, buttons, navigation bars — and teaches you when to reach for Tailwind versus Svelte's scoped CSS.

Understanding these patterns and knowing when to use each styling approach will make you a more effective developer. There is no single right answer — the best choice depends on the component and the situation.

## Building a Card

Cards are everywhere in modern web design. Here is a complete card pattern:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description: string;
    imageUrl?: string;
    href?: string;
  }

  let { title, description, imageUrl, href }: Props = $props();
</script>

{#if href}
  <a {href} class="block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
    {#if imageUrl}
      <img src={imageUrl} alt={title} class="w-full h-48 object-cover group-hover:scale-105 transition-transform" />
    {/if}
    <div class="p-6">
      <h3 class="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p class="text-gray-600 text-sm leading-relaxed">{description}</p>
    </div>
  </a>
{:else}
  <div class="bg-white rounded-xl shadow-sm p-6">
    <h3 class="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
    <p class="text-gray-600 text-sm leading-relaxed">{description}</p>
  </div>
{/if}
```

The `group` class on the parent and `group-hover:` on the child let you trigger child hover effects when the parent is hovered.

## Building Buttons

Create a reusable button with variant support:

```svelte
<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    children: Snippet;
    onclick?: () => void;
  }

  let { variant = 'primary', size = 'md', children, onclick }: Props = $props();

  const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-400',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400',
    ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 focus:ring-gray-400'
  };

  const sizeClasses = {
    sm: 'text-sm px-3 py-1.5',
    md: 'text-base px-4 py-2',
    lg: 'text-lg px-6 py-3'
  };
</script>

<button class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]}" {onclick}>
  {@render children()}
</button>
```

## Building a Navbar

```svelte
<!-- src/lib/components/Navbar.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  const links = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/projects', label: 'Projects' },
    { href: '/blog', label: 'Blog' }
  ];
</script>

<nav class="bg-white border-b border-gray-200 px-6 py-4">
  <div class="max-w-6xl mx-auto flex items-center justify-between">
    <a href="/" class="text-xl font-bold text-gray-900">
      MySite
    </a>

    <div class="flex items-center gap-6">
      {#each links as link}
        <a
          href={link.href}
          class="text-sm font-medium transition-colors {
            $page.url.pathname === link.href
              ? 'text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }"
        >
          {link.label}
        </a>
      {/each}
    </div>
  </div>
</nav>
```

## Dark Mode with dark: Prefix

Tailwind supports dark mode with the `dark:` prefix. It reads the `.dark` class on the `<html>` element:

```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-6 rounded-lg shadow dark:shadow-gray-900/30">
  <h2 class="text-xl font-bold mb-2">Themed Card</h2>
  <p class="text-gray-600 dark:text-gray-400">
    This card adapts to light and dark themes.
  </p>
</div>
```

This pairs perfectly with the theme toggle you built in the CSS tokens module.

## When to Use Tailwind vs Scoped CSS

Both approaches work well in SvelteKit. Here is a guideline:

**Use Tailwind when:**
- Building common UI patterns (cards, buttons, grids, layouts)
- You want rapid prototyping and consistent spacing/colors
- The styles are mostly utility-driven with no complex selectors

**Use Svelte scoped CSS when:**
- You need complex CSS (animations, pseudo-elements, `::before`/`::after`)
- The component has many state-dependent styles that would clutter the markup
- You are building a highly reusable component library with self-contained styles

```svelte
<!-- Mixing both approaches works great -->
<div class="grid grid-cols-1 md:grid-cols-3 gap-6 p-8">
  <div class="card">
    <h3>Scoped styles for complex parts</h3>
  </div>
</div>

<style>
  .card {
    position: relative;
    overflow: hidden;
  }
  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    background: linear-gradient(90deg, #ff3e00, #6c5ce7);
  }
</style>
```

## Try It

Build a project page that includes a Navbar, a grid of Cards, and Buttons with different variants. Use the `dark:` prefix to add dark mode support. Identify one element where Svelte scoped CSS works better than Tailwind and use both approaches on the same page.

## Key Takeaways

- **Cards**, **buttons**, and **navbars** are the most common Tailwind patterns
- Use `group` and `group-hover:` for parent-triggered child hover effects
- Build variant systems by mapping prop values to class strings
- The `dark:` prefix enables dark mode styles that pair with a class-based theme toggle
- **Mix Tailwind and scoped CSS** freely — use each where it is strongest
- Tailwind handles layout and utilities; scoped CSS handles complex selectors and animations
