# Theming

With your design tokens in place, building a theme system is straightforward. The idea is simple: define one set of token names and swap their values for different themes. A dark theme uses the same `--color-bg` and `--color-text` names as the light theme, but with different values. Every component that references these tokens automatically adapts.

But "straightforward" does not mean "trivial." A production theme system must handle server-side rendering without flash of wrong theme (FOUC), persist user preferences across sessions and devices, respect operating system preferences, support more than two themes, integrate with SvelteKit's cookie-based SSR approach, and do all of this without a jarring visual experience. This lesson covers every piece.

## The Architecture of a Theme System

Before writing code, understand what the system must do:

1. **Determine the initial theme** — from cookies (SSR), localStorage (client), or system preference (fallback)
2. **Apply the theme before first paint** — no flash of wrong colors
3. **Provide a toggle mechanism** — UI for users to switch themes
4. **Persist the choice** — survive page reloads, new tabs, and return visits
5. **React to system changes** — if the user changes their OS dark mode while your site is open
6. **Propagate theme context** — let any component read the current theme

Each of these has edge cases that catch developers off guard. Let us handle them all.

## Light and Dark Themes with CSS

Define your light theme as the default on `:root` and your dark theme as an override:

```css
/* src/app.css */
:root {
  /* Light theme (default) */
  --color-bg: #ffffff;
  --color-surface: #f8f8f8;
  --color-surface-hover: #f0f0f0;
  --color-text: #222222;
  --color-text-secondary: #666666;
  --color-text-tertiary: #999999;
  --color-border: #e0e0e0;
  --color-primary: #ff3e00;
  --color-primary-hover: #e63600;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.1);

  color-scheme: light;
}

:root.dark {
  /* Dark theme */
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-surface-hover: #334155;
  --color-text: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-text-tertiary: #64748b;
  --color-border: #334155;
  --color-primary: #ff6b3d;
  --color-primary-hover: #ff8a65;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);

  color-scheme: dark;
}
```

When the `.dark` class is added to the `<html>` element, all the token values switch and every component updates instantly.

The `color-scheme` property is important but often forgotten. It tells the browser to adjust native UI elements (scrollbars, form controls, selection colors) to match your theme. Without it, you get dark backgrounds with light-colored native scrollbars — a dead giveaway that the dark mode is incomplete.

## Respecting System Preferences

Many users set a preferred color scheme at the operating system level. Use the `prefers-color-scheme` media query as the automatic fallback when no user preference is saved:

```css
/* src/app.css */
@media (prefers-color-scheme: dark) {
  :root:not(.light):not(.dark) {
    /* Apply dark tokens only when:
       - System prefers dark AND
       - User has not explicitly chosen light or dark */
    --color-bg: #0f172a;
    --color-surface: #1e293b;
    --color-surface-hover: #334155;
    --color-text: #f1f5f9;
    --color-text-secondary: #94a3b8;
    --color-text-tertiary: #64748b;
    --color-border: #334155;
    --color-primary: #ff6b3d;
    --color-primary-hover: #ff8a65;
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
    --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);

    color-scheme: dark;
  }
}
```

The selector `:root:not(.light):not(.dark)` means "only apply this when no explicit theme class is set." This three-state model (explicit light, explicit dark, auto/system) is the most user-friendly approach.

## Preventing Flash of Wrong Theme (FOUC)

This is the single most complained-about bug in theme systems. The user has dark mode saved. They navigate to your site. For a split second, they see the blinding white light theme before JavaScript runs and applies the dark class. This is FOUC — Flash of Unstyled Content (or in this case, Flash of Wrong Theme).

The fix requires understanding the rendering timeline:

1. Browser receives HTML
2. Browser parses `<head>`, including inline `<script>` tags (**synchronous, render-blocking**)
3. Browser begins rendering `<body>`
4. SvelteKit hydrates and runs component JavaScript

The theme class must be set at step 2, before step 3. This means an inline script in `app.html`:

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>
      // This runs synchronously before any content renders.
      // It checks three sources in priority order:
      // 1. Cookie (set by server for SSR, most reliable)
      // 2. localStorage (client-side persistence)
      // 3. System preference (OS-level setting)
      (function() {
        function getTheme() {
          // Check cookie first (available during SSR)
          var match = document.cookie.match(/(?:^|;\s*)theme=(\w+)/);
          if (match) return match[1];

          // Check localStorage
          try {
            var stored = localStorage.getItem('theme');
            if (stored) return stored;
          } catch (e) {
            // localStorage might be unavailable (private browsing, etc.)
          }

          // Fall back to system preference
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
          }

          return 'light';
        }

        var theme = getTheme();
        document.documentElement.classList.add(theme);
      })();
    </script>
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

This script runs before any content is rendered, so the correct theme class is applied from the very first frame. No flash.

### Why cookies, not just localStorage?

localStorage is client-side only. During server-side rendering, SvelteKit generates HTML on the server where `localStorage` does not exist. If the server renders the light theme but the client has dark mode in localStorage, there is a mismatch — the server-rendered HTML has light styles, and the client switches to dark after hydration.

Cookies solve this because they are sent with every HTTP request. The server can read the cookie, know the theme, and render the correct HTML from the start. This eliminates even the sub-frame flash that the inline script approach cannot fully prevent on the very first server-rendered page load.

## Cookie-Based Theme for Perfect SSR

Here is the complete implementation using cookies for server-side theme awareness:

### Step 1: Read the cookie in hooks

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('theme') || 'light';

  // Make theme available to all server load functions
  event.locals.theme = theme;

  // Transform the HTML to include the theme class on <html>
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('<html lang="en">', `<html lang="en" class="${theme}">`);
    }
  });
};
```

This ensures the server-rendered HTML already has the correct theme class. No flash whatsoever — even on the first page load, even before JavaScript runs.

### Step 2: Type the locals

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      theme: string;
    }
  }
}

export {};
```

### Step 3: Create a theme API endpoint

```typescript
// src/routes/api/theme/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const { theme } = await request.json();

  if (!['light', 'dark', 'system'].includes(theme)) {
    return json({ error: 'Invalid theme' }, { status: 400 });
  }

  cookies.set('theme', theme, {
    path: '/',
    httpOnly: false, // Needs to be readable by client JS
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365 // 1 year
  });

  return json({ theme });
};
```

### Step 4: Build the theme toggle component

```svelte
<!-- src/lib/components/ThemeToggle.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  type Theme = 'light' | 'dark' | 'system';

  let currentTheme = $state<Theme>('light');
  let resolvedTheme = $state<'light' | 'dark'>('light');

  // Initialize from cookie or system preference
  if (browser) {
    const cookieMatch = document.cookie.match(/(?:^|;\s*)theme=(\w+)/);
    const saved = cookieMatch ? cookieMatch[1] as Theme : 'system';
    currentTheme = saved;
    resolvedTheme = resolveTheme(saved);
  }

  function resolveTheme(theme: Theme): 'light' | 'dark' {
    if (theme === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return theme;
  }

  function applyTheme(resolved: 'light' | 'dark') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolved);
    resolvedTheme = resolved;
  }

  async function setTheme(theme: Theme) {
    currentTheme = theme;
    const resolved = resolveTheme(theme);
    applyTheme(resolved);

    // Persist to cookie and localStorage
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: resolved })
    });

    try {
      localStorage.setItem('theme', theme);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  }

  // Listen for system preference changes (only matters when theme is 'system')
  if (browser) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', (e) => {
      if (currentTheme === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  function cycle() {
    const order: Theme[] = ['light', 'dark', 'system'];
    const nextIndex = (order.indexOf(currentTheme) + 1) % order.length;
    setTheme(order[nextIndex]);
  }
</script>

<button
  onclick={cycle}
  aria-label="Toggle theme (current: {currentTheme})"
  title="Theme: {currentTheme}"
>
  {#if resolvedTheme === 'dark'}
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
    </svg>
  {:else}
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
      <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
    </svg>
  {/if}
  {#if currentTheme === 'system'}
    <span class="badge">auto</span>
  {/if}
</button>

<style>
  button {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 0.25rem);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    padding: var(--space-2, 0.5rem);
    border-radius: var(--radius-md, 8px);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) var(--ease-out);
  }

  button:hover {
    background: var(--color-surface-hover);
  }

  button:focus-visible {
    outline: 2px solid var(--color-primary);
    outline-offset: 2px;
  }

  .badge {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }
</style>
```

### Step 5: Wire it into the layout

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
    font-family: var(--font-sans, system-ui, sans-serif);
    transition: background var(--duration-normal, 300ms),
                color var(--duration-normal, 300ms);
    margin: 0;
  }

  header {
    position: sticky;
    top: 0;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    padding: var(--space-4, 1rem);
    z-index: var(--z-sticky, 1100);
  }

  nav {
    display: flex;
    align-items: center;
    gap: var(--space-4, 1rem);
    max-width: var(--container-max, 1200px);
    margin: 0 auto;
  }

  nav a {
    color: var(--color-text-secondary);
    text-decoration: none;
    transition: color var(--duration-fast, 150ms);
  }

  nav a:hover {
    color: var(--color-primary);
  }

  main {
    max-width: var(--container-max, 1200px);
    margin: 0 auto;
    padding: var(--space-8, 2rem) var(--space-4, 1rem);
  }
</style>
```

The `transition` on `body` creates a smooth color change when the theme toggles. Some developers prefer `transition: none` for instant switching — it depends on whether you want the animation feel.

## Theme Context with Svelte's Context API

When components deep in the tree need to know the current theme (e.g., to render different icons or adjust behavior), use Svelte's context API:

```typescript
// src/lib/theme.svelte.ts
import { getContext, setContext } from 'svelte';

const THEME_KEY = Symbol('theme');

interface ThemeContext {
  readonly current: 'light' | 'dark';
  readonly resolved: 'light' | 'dark';
  toggle: () => void;
  set: (theme: 'light' | 'dark' | 'system') => void;
}

export function createThemeContext(): ThemeContext {
  let current = $state<'light' | 'dark' | 'system'>('light');
  let resolved = $state<'light' | 'dark'>('light');

  const context: ThemeContext = {
    get current() { return resolved; },
    get resolved() { return resolved; },
    toggle() {
      const next = resolved === 'light' ? 'dark' : 'light';
      current = next;
      resolved = next;
      applyAndPersist(next);
    },
    set(theme: 'light' | 'dark' | 'system') {
      current = theme;
      resolved = theme === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : theme;
      applyAndPersist(resolved);
    }
  };

  function applyAndPersist(theme: 'light' | 'dark') {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme })
    });
  }

  setContext(THEME_KEY, context);
  return context;
}

export function getThemeContext(): ThemeContext {
  return getContext<ThemeContext>(THEME_KEY);
}
```

Use it in the root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { createThemeContext } from '$lib/theme.svelte';
  createThemeContext();
</script>
```

And consume it in any child component:

```svelte
<script lang="ts">
  import { getThemeContext } from '$lib/theme.svelte';
  const theme = getThemeContext();
</script>

<!-- Conditionally render based on theme -->
{#if theme.current === 'dark'}
  <img src="/logo-white.svg" alt="Logo" />
{:else}
  <img src="/logo-dark.svg" alt="Logo" />
{/if}
```

## Dynamic Theme Creation

Sometimes you need more than light and dark. Perhaps users can pick a brand color, or you support multiple product themes. Here is a system for dynamic themes:

```svelte
<!-- src/lib/components/ThemeCustomizer.svelte -->
<script lang="ts">
  interface ThemeConfig {
    primary: string;
    bg: string;
    surface: string;
    text: string;
    border: string;
  }

  const presets: Record<string, ThemeConfig> = {
    default: {
      primary: '#ff3e00',
      bg: '#ffffff',
      surface: '#f8f8f8',
      text: '#222222',
      border: '#e0e0e0'
    },
    ocean: {
      primary: '#0077b6',
      bg: '#f0f8ff',
      surface: '#e6f2ff',
      text: '#1a365d',
      border: '#bee3f8'
    },
    forest: {
      primary: '#2d6a4f',
      bg: '#f0fdf4',
      surface: '#dcfce7',
      text: '#14532d',
      border: '#bbf7d0'
    },
    midnight: {
      primary: '#8b5cf6',
      bg: '#0f0b1a',
      surface: '#1a1333',
      text: '#e8e0ff',
      border: '#2d2252'
    }
  };

  let activePreset = $state('default');

  function applyPreset(name: string) {
    activePreset = name;
    const config = presets[name];
    const root = document.documentElement;

    root.style.setProperty('--color-primary', config.primary);
    root.style.setProperty('--color-bg', config.bg);
    root.style.setProperty('--color-surface', config.surface);
    root.style.setProperty('--color-text', config.text);
    root.style.setProperty('--color-border', config.border);
  }

  function resetToDefault() {
    // Remove inline styles so the CSS custom properties fall back
    // to the values defined in the stylesheet
    const root = document.documentElement;
    root.style.removeProperty('--color-primary');
    root.style.removeProperty('--color-bg');
    root.style.removeProperty('--color-surface');
    root.style.removeProperty('--color-text');
    root.style.removeProperty('--color-border');
    activePreset = 'default';
  }
</script>

<div class="customizer">
  <h3>Theme</h3>
  <div class="presets">
    {#each Object.entries(presets) as [name, config]}
      <button
        class="preset"
        class:active={activePreset === name}
        onclick={() => applyPreset(name)}
        style:--swatch={config.primary}
      >
        <span class="swatch"></span>
        {name}
      </button>
    {/each}
  </div>
  <button class="reset" onclick={resetToDefault}>Reset</button>
</div>

<style>
  .customizer {
    padding: var(--space-4);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg, 8px);
  }

  .presets {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin: var(--space-3) 0;
  }

  .preset {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    text-transform: capitalize;
    font-size: var(--text-sm, 0.875rem);
    color: var(--color-text);
    transition: border-color var(--duration-fast, 150ms);
  }

  .preset.active {
    border-color: var(--color-primary);
  }

  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--swatch);
  }

  .reset {
    margin-top: var(--space-2);
    padding: var(--space-1) var(--space-3);
    background: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--text-sm, 0.875rem);
  }
</style>
```

The key technique: `element.style.setProperty` sets inline styles that override stylesheet values. `element.style.removeProperty` removes them, letting the stylesheet values take effect again.

## Tailwind Dark Mode Integration

If you use Tailwind CSS with SvelteKit, configure it to use the class-based dark mode strategy (which aligns with the `.dark` class approach we have been building):

```javascript
// tailwind.config.js
export default {
  darkMode: 'class', // Uses .dark class on <html>, not media query
  content: ['./src/**/*.{html,svelte,js,ts}'],
  theme: {
    extend: {
      colors: {
        // Map to your CSS custom properties so Tailwind and tokens share values
        primary: 'var(--color-primary)',
        surface: 'var(--color-surface)',
        'text-primary': 'var(--color-text)',
        'text-secondary': 'var(--color-text-secondary)',
        border: 'var(--color-border)'
      }
    }
  }
};
```

Now you can use Tailwind utility classes that reference your design tokens:

```svelte
<div class="bg-surface text-text-primary border border-border rounded-lg p-6">
  <h3 class="text-lg font-semibold">Card Title</h3>
  <p class="text-text-secondary">Card content</p>
</div>
```

And Tailwind's `dark:` prefix works because it targets the `.dark` class:

```svelte
<!-- This works WITH your token system, not against it -->
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
  Tailwind dark mode
</div>
```

The best approach is to use CSS custom properties for your tokens and Tailwind for layout utilities. Do not duplicate your color system in both places.

## Handling Images and Media in Themes

Dark themes need more than color swaps. Images, SVGs, and media also need attention:

```svelte
<!-- Swap images based on theme -->
<script lang="ts">
  import { getThemeContext } from '$lib/theme.svelte';
  const theme = getThemeContext();
</script>

<picture>
  <source
    srcset="/hero-dark.webp"
    media="(prefers-color-scheme: dark)"
  />
  <img src="/hero-light.webp" alt="Hero banner" />
</picture>

<!-- Dim bright images in dark mode -->
<style>
  :global(:root.dark) img:not([data-no-dim]) {
    filter: brightness(0.9);
  }
</style>
```

For SVG icons, use `currentColor` so they inherit the text color from the theme:

```svelte
<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M12 2L2 7l10 5 10-5-10-5z" />
</svg>
```

## Transition Best Practices

Adding transitions makes theme switching feel polished, but there are gotchas:

```css
/* Smooth transition for theme changes */
:root {
  transition: background-color 300ms ease,
              color 300ms ease,
              border-color 300ms ease;
}

/* But disable transitions during initial page load to prevent
   a flash-like animation when the theme is first applied */
:root.no-transition,
:root.no-transition * {
  transition: none !important;
}
```

```typescript
// In your theme toggle logic, temporarily disable transitions
// to prevent the initial load animation
function setThemeWithoutTransition(theme: 'light' | 'dark') {
  const root = document.documentElement;
  root.classList.add('no-transition');
  root.classList.remove('light', 'dark');
  root.classList.add(theme);

  // Force a reflow so the class removal takes effect before re-enabling
  root.offsetHeight;

  root.classList.remove('no-transition');
}
```

This prevents the initial page load from showing a transition animation. Transitions should only play when the user actively toggles the theme.

## Complete Multi-Theme System

Here is the full, production-ready system with three themes (light, dark, and a custom "midnight" theme), cookie persistence, SSR support, and system preference detection:

### Theme configuration

```typescript
// src/lib/themes.ts
export const themes = {
  light: {
    label: 'Light',
    tokens: {
      '--color-bg': '#ffffff',
      '--color-surface': '#f8f8f8',
      '--color-text': '#222222',
      '--color-text-secondary': '#666666',
      '--color-border': '#e0e0e0',
      '--color-primary': '#ff3e00'
    }
  },
  dark: {
    label: 'Dark',
    tokens: {
      '--color-bg': '#0f172a',
      '--color-surface': '#1e293b',
      '--color-text': '#f1f5f9',
      '--color-text-secondary': '#94a3b8',
      '--color-border': '#334155',
      '--color-primary': '#ff6b3d'
    }
  },
  midnight: {
    label: 'Midnight',
    tokens: {
      '--color-bg': '#0a0a1a',
      '--color-surface': '#12122a',
      '--color-text': '#e0e0ff',
      '--color-text-secondary': '#8888cc',
      '--color-border': '#2a2a4a',
      '--color-primary': '#8b5cf6'
    }
  }
} as const;

export type ThemeName = keyof typeof themes;
```

### Multi-theme toggle component

```svelte
<!-- src/lib/components/ThemeSelector.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { themes, type ThemeName } from '$lib/themes';

  let current = $state<ThemeName | 'system'>('system');
  let open = $state(false);

  if (browser) {
    const saved = getCookie('theme-preference') as ThemeName | 'system' | null;
    current = saved || 'system';
  }

  function getCookie(name: string): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
  }

  async function select(theme: ThemeName | 'system') {
    current = theme;
    open = false;

    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    // Apply classes
    const root = document.documentElement;
    root.className = resolved;

    // Persist
    document.cookie = `theme-preference=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
    document.cookie = `theme=${resolved}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;

    // For custom themes beyond light/dark, apply inline tokens
    if (theme !== 'system' && theme !== 'light' && theme !== 'dark') {
      const config = themes[theme];
      for (const [prop, value] of Object.entries(config.tokens)) {
        root.style.setProperty(prop, value);
      }
    } else {
      // Remove any inline overrides and let CSS handle it
      for (const prop of Object.keys(themes.midnight.tokens)) {
        root.style.removeProperty(prop);
      }
    }
  }
</script>

<div class="selector">
  <button onclick={() => open = !open} aria-expanded={open}>
    Theme: {current === 'system' ? 'Auto' : themes[current].label}
  </button>

  {#if open}
    <div class="dropdown" role="menu">
      <button role="menuitem" onclick={() => select('system')}>
        System (Auto)
      </button>
      {#each Object.entries(themes) as [name, config]}
        <button
          role="menuitem"
          class:active={current === name}
          onclick={() => select(name as ThemeName)}
        >
          {config.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .selector {
    position: relative;
  }

  button {
    padding: var(--space-2) var(--space-3);
    background: var(--color-surface);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    font-size: var(--text-sm, 0.875rem);
  }

  .dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: var(--space-1);
    background: var(--color-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md, 6px);
    box-shadow: var(--shadow-lg);
    z-index: var(--z-dropdown, 1000);
    min-width: 160px;
    overflow: hidden;
  }

  .dropdown button {
    display: block;
    width: 100%;
    text-align: left;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  .dropdown button:hover {
    background: var(--color-surface-hover);
  }

  .dropdown button.active {
    color: var(--color-primary);
    font-weight: 600;
  }
</style>
```

## Testing Your Theme System

Theme bugs are visual and easy to miss. Here is a testing checklist:

```bash
# Manual testing checklist:
# 1. Load site in light mode — all tokens correct?
# 2. Switch to dark — smooth transition, all elements update?
# 3. Reload page in dark — no flash of light theme?
# 4. Open new tab — theme persists?
# 5. Set system to dark, clear preference — auto-detects?
# 6. Change system preference while site is open — updates live?
# 7. Disable JavaScript — theme still works from SSR?
# 8. Check native elements: scrollbars, inputs, selects in dark mode
# 9. Check images: are bright images dimmed?
# 10. Check focus rings: visible in both themes?
```

## Try It

1. **Basic exercise**: Implement a complete light/dark theme system. Define light and dark token values in `app.css`, create a `ThemeToggle` component, add it to your layout, and add the flash-prevention script to `app.html`. Verify that the preference persists across page reloads using cookies and localStorage.

2. **SSR exercise**: Add the cookie-based SSR approach using `hooks.server.ts` with `transformPageChunk`. Disable JavaScript in your browser and verify the correct theme is still applied from the server-rendered HTML.

3. **Multi-theme exercise**: Add a third theme (e.g., "sepia" or "high contrast") to your system. Create a dropdown selector instead of a simple toggle. Persist the choice and handle the "system" option that auto-detects the user's preference.

4. **Context exercise**: Create a `theme.svelte.ts` file using Svelte's context API that exposes the current theme to any component in the tree. Use it to conditionally render a light/dark logo in the header.

## Key Takeaways

- Theming works by swapping CSS custom property values using class selectors on `<html>`
- Define light theme on `:root` and dark theme on `:root.dark`
- Use `prefers-color-scheme` to respect the user's system preference as the automatic fallback
- **Prevent FOUC** with an inline script in `app.html` that runs before first paint
- Use **cookies** (not just localStorage) so the server can render the correct theme during SSR
- `hooks.server.ts` with `transformPageChunk` injects the theme class into server-rendered HTML
- Set `color-scheme: dark` on the dark theme so native UI elements (scrollbars, form controls) match
- Use Svelte's context API to share theme state with deeply nested components
- Disable transitions during initial load to prevent animation on first paint
- Dynamic multi-theme systems use `setProperty`/`removeProperty` to override tokens at runtime
- Always test: reload persistence, SSR without JS, system preference changes, native element styling
