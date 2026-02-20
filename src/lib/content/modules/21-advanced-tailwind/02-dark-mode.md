# Dark Mode

Dark mode reduces eye strain in low-light environments and has become an expected feature in modern applications. Tailwind CSS makes dark mode straightforward with the `dark:` prefix — add it to any utility class to apply different styles when dark mode is active.

## The dark: Prefix

Every Tailwind utility can have a dark mode variant:

```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
  <h1 class="text-3xl font-bold">My App</h1>
  <p class="text-gray-600 dark:text-gray-400">
    This text adapts to the current color scheme.
  </p>
</div>
```

In light mode, the background is white and text is dark. In dark mode, the background becomes dark gray and text becomes light.

## System Preference Detection

By default, Tailwind v4 uses the `prefers-color-scheme` media query. Dark mode activates automatically when the user's operating system is set to dark mode:

```css
/* This happens automatically — no configuration needed */
@media (prefers-color-scheme: dark) {
  /* dark: utilities apply */
}
```

## Class-Based Dark Mode

For manual control (letting users toggle dark mode), configure class-based dark mode:

```css
/* src/app.css */
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));
```

Now dark mode activates when the `dark` class is present on a parent element, typically the `<html>` tag.

## Building a Theme Toggle

Create a reusable theme toggle component:

```svelte
<!-- src/lib/components/ThemeToggle.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  let dark = $state(false);

  if (browser) {
    dark = document.documentElement.classList.contains('dark');
  }

  function toggle() {
    dark = !dark;

    if (browser) {
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('theme', dark ? 'dark' : 'light');
    }
  }
</script>

<button
  onclick={toggle}
  class="p-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
  aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
>
  {#if dark}
    <span>Light</span>
  {:else}
    <span>Dark</span>
  {/if}
</button>
```

## Initializing the Theme

Add a script to your `app.html` that runs before the page renders to prevent a flash of the wrong theme:

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en">
  <head>
    <script>
      try {
        const theme = localStorage.getItem('theme');
        if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {
        // localStorage unavailable (private browsing, etc.)
      }
    </script>
    %sveltekit.head%
  </head>
  <body>
    %sveltekit.body%
  </body>
</html>
```

This inline script runs immediately, before CSS or JavaScript loads, preventing any visible flash.

## Styling Components for Dark Mode

Design components with both modes in mind:

```svelte
<div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm dark:shadow-gray-900/20">
  <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
    Card Title
  </h3>
  <p class="mt-2 text-gray-600 dark:text-gray-300">
    Card description that reads well in both modes.
  </p>
  <button class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400">
    Action
  </button>
</div>
```

## Using CSS Variables for Theme Colors

For cleaner markup, define theme-aware colors with CSS variables:

```css
@theme {
  --color-surface: #ffffff;
  --color-surface-alt: #f8fafc;
  --color-on-surface: #0f172a;
  --color-on-surface-muted: #64748b;
}

.dark {
  --color-surface: #0f172a;
  --color-surface-alt: #1e293b;
  --color-on-surface: #f1f5f9;
  --color-on-surface-muted: #94a3b8;
}
```

Now your markup is cleaner:

```svelte
<div class="bg-surface text-on-surface p-6">
  <p class="text-on-surface-muted">Adapts automatically.</p>
</div>
```

## Try It

Build a settings page with a theme toggle that switches between light, dark, and system preference modes. Store the user's choice in localStorage. Use CSS variables for your theme colors so components only need one set of utility classes. Make sure there is no flash of wrong theme on page load.

## Key Takeaways

- The `dark:` prefix applies styles when dark mode is active
- By default, Tailwind uses the system preference via `prefers-color-scheme`
- Use `@custom-variant dark` to enable class-based dark mode for manual control
- Add an inline script in `app.html` to prevent a flash of the wrong theme
- Store the user's preference in `localStorage` and apply the `dark` class to `<html>`
- CSS variables let you define theme-aware colors for cleaner component markup
