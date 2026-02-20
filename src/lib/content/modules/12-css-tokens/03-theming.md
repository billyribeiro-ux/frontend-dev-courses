# Theming

With your design tokens in place, building a theme system is straightforward. The idea is simple: define one set of token names and swap their values for different themes. A dark theme uses the same `--color-bg` and `--color-text` names as the light theme, but with different values. Every component that references these tokens automatically adapts.

In this lesson, you will build a complete light/dark theme system for your SvelteKit application using CSS custom properties, the `prefers-color-scheme` media query, and a toggle that saves the user's preference.

## Light and Dark Themes with CSS

Define your light theme as the default on `:root` and your dark theme as an override:

```css
/* src/app.css */
:root {
  --color-bg: #ffffff;
  --color-surface: #f8f8f8;
  --color-text: #222222;
  --color-text-muted: #666666;
  --color-border: #e0e0e0;
  --color-primary: #ff3e00;
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);
}

:root.dark {
  --color-bg: #1a1a2e;
  --color-surface: #16213e;
  --color-text: #eaeaea;
  --color-text-muted: #a0a0b0;
  --color-border: #2a2a4a;
  --color-primary: #ff6b3d;
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
}
```

When the `.dark` class is added to the `<html>` element, all the token values switch and every component updates instantly.

## Respecting System Preferences

Many users set a preferred color scheme at the operating system level. Use the `prefers-color-scheme` media query to respect that preference:

```css
/* src/app.css */
@media (prefers-color-scheme: dark) {
  :root:not(.light) {
    --color-bg: #1a1a2e;
    --color-surface: #16213e;
    --color-text: #eaeaea;
    --color-text-muted: #a0a0b0;
    --color-border: #2a2a4a;
    --color-primary: #ff6b3d;
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  }
}
```

This applies dark theme values automatically when the user's system is set to dark mode, unless they have explicitly chosen light mode (`.light` class).

## Building a Theme Toggle

Create a toggle component that switches between themes and saves the preference:

```svelte
<!-- src/lib/components/ThemeToggle.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  let isDark = $state(false);

  // On mount, check for saved preference
  if (browser) {
    const saved = localStorage.getItem('theme');
    if (saved) {
      isDark = saved === 'dark';
    } else {
      isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    applyTheme();
  }

  function toggle() {
    isDark = !isDark;
    applyTheme();
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }

  function applyTheme() {
    if (browser) {
      document.documentElement.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('light', !isDark);
    }
  }
</script>

<button onclick={toggle} aria-label="Toggle theme">
  {isDark ? 'Light Mode' : 'Dark Mode'}
</button>

<style>
  button {
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
```

## Applying the Theme Globally

Add the toggle to your root layout so it is available on every page:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import ThemeToggle from '$lib/components/ThemeToggle.svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

<header>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <ThemeToggle />
  </nav>
</header>

<main>
  {@render children()}
</main>

<style>
  :global(body) {
    background: var(--color-bg);
    color: var(--color-text);
    transition: background 0.3s, color 0.3s;
  }
</style>
```

The `transition` on `body` creates a smooth color change when the theme toggles.

## Preventing Flash of Wrong Theme

To prevent a flash of the light theme on page load for dark-mode users, add an inline script in `src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <script>
      const theme = localStorage.getItem('theme');
      if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
      }
    </script>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

This script runs before any content is rendered, so the correct theme is applied from the very first frame.

## Try It

Implement a complete light/dark theme system. Define light and dark token values in `app.css`, create a `ThemeToggle` component, add it to your layout, and add the flash-prevention script to `app.html`. Verify that the preference persists across page reloads using `localStorage`.

## Key Takeaways

- Theming works by swapping CSS custom property values using class selectors
- Define light theme on `:root` and dark theme on `:root.dark`
- Use `prefers-color-scheme` to respect the user's system preference
- Store the user's choice in `localStorage` for persistence
- Prevent flash of wrong theme with an inline script in `app.html`
- Adding `transition` to `body` creates smooth theme switching
