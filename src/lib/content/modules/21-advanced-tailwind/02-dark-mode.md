# Dark Mode

Dark mode reduces eye strain in low-light environments, saves battery on OLED screens, and has become an expected feature in modern applications. What sounds simple — "just invert the colors" — is actually a design challenge that touches CSS architecture, server rendering, persistence, and accessibility.

Tailwind CSS makes the mechanics straightforward with the `dark:` prefix. The real difficulty is the surrounding infrastructure: detecting the user's preference, persisting their choice, preventing a flash of the wrong theme on page load, and designing color palettes that work in both modes. This lesson covers all of it.

## The dark: Prefix

Every Tailwind utility can have a dark mode variant. You write both light and dark styles directly in your markup:

```svelte
<div class="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
  <h1 class="text-3xl font-bold">My App</h1>
  <p class="text-gray-600 dark:text-gray-400">
    This text adapts to the current color scheme.
  </p>
</div>
```

In light mode, the background is white and text is dark. In dark mode, the background becomes dark gray and text becomes light. Tailwind only applies the `dark:` variants when dark mode is active — the mechanism for activating it depends on your configuration.

## Two Dark Mode Strategies

Tailwind supports two ways to activate dark mode: **media query** (automatic, based on system preferences) and **class-based** (manual, controlled by JavaScript). Understanding the tradeoffs is important because changing strategies mid-project requires updating every component.

### Strategy 1: Media Query (System Preference)

By default, Tailwind v4 uses the `prefers-color-scheme` CSS media query. Dark mode activates automatically when the user's operating system is set to dark mode:

```css
/* This happens automatically — no configuration needed */
@media (prefers-color-scheme: dark) {
  /* dark: utilities apply */
}
```

**Pros:** Zero JavaScript required. Instantly matches the OS setting. Works even if JavaScript fails to load.

**Cons:** Users cannot override the system preference. If they want light mode in your app while their OS is set to dark, they are stuck.

### Strategy 2: Class-Based (Manual Control)

For manual control (letting users toggle dark mode independently of their OS), configure class-based dark mode in your CSS:

```css
/* src/app.css */
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));
```

Now dark mode activates when the `dark` class is present on a parent element, typically the `<html>` tag. This gives you full programmatic control.

**Pros:** Users can override the system preference. You can persist their choice. You can support three modes: light, dark, and system.

**Cons:** Requires JavaScript for toggling. Requires extra work to prevent a flash of the wrong theme on page load.

For most production applications, class-based is the right choice because users expect a toggle. The rest of this lesson focuses on class-based dark mode, since it involves more architectural decisions.

## System Preference Detection with JavaScript

Even with class-based dark mode, you want to respect the user's system preference as the default. The `matchMedia` API detects this:

```typescript
// Check current system preference
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

// Listen for changes (user switches OS theme while your app is open)
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
mediaQuery.addEventListener('change', (event) => {
  if (getUserPreference() === 'system') {
    document.documentElement.classList.toggle('dark', event.matches);
  }
});

function getUserPreference(): 'light' | 'dark' | 'system' {
  return (localStorage.getItem('theme') as any) || 'system';
}
```

The listener is important. Without it, if the user has "system" selected in your app and then switches their OS from light to dark mode, your app will not respond until the next page load.

## Building a Three-Mode Theme Toggle

A proper theme toggle supports three states: Light, Dark, and System. "System" means "follow whatever the OS says."

```svelte
<!-- src/lib/components/ThemeToggle.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';

  type Theme = 'light' | 'dark' | 'system';

  let theme = $state<Theme>('system');

  // Initialize from persisted preference
  if (browser) {
    const saved = localStorage.getItem('theme') as Theme | null;
    theme = saved || 'system';
  }

  function getEffectiveTheme(preference: Theme): 'light' | 'dark' {
    if (preference === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return preference;
  }

  function applyTheme(preference: Theme) {
    if (!browser) return;

    const effective = getEffectiveTheme(preference);
    document.documentElement.classList.toggle('dark', effective === 'dark');
    localStorage.setItem('theme', preference);

    // Update meta theme-color for mobile browsers
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute(
        'content',
        effective === 'dark' ? '#0f172a' : '#ffffff'
      );
    }
  }

  function cycle() {
    const order: Theme[] = ['light', 'dark', 'system'];
    const currentIndex = order.indexOf(theme);
    theme = order[(currentIndex + 1) % order.length];
    applyTheme(theme);
  }

  // Listen for OS theme changes when in "system" mode
  $effect(() => {
    if (!browser) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  });
</script>

<button
  onclick={cycle}
  class="flex items-center gap-2 rounded-lg px-3 py-2 text-sm
         bg-gray-100 dark:bg-gray-800
         text-gray-700 dark:text-gray-300
         hover:bg-gray-200 dark:hover:bg-gray-700
         transition-colors"
  aria-label={`Current theme: ${theme}. Click to change.`}
>
  {#if theme === 'light'}
    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
    <span>Light</span>
  {:else if theme === 'dark'}
    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
    <span>Dark</span>
  {:else}
    <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
    <span>System</span>
  {/if}
</button>
```

## Preventing the Flash of Wrong Theme

The most common complaint about dark mode implementations is the **flash**: the page briefly renders in light mode before JavaScript runs and adds the `dark` class. This happens because HTML renders before JavaScript executes.

### Approach 1: Inline Script in app.html (localStorage-Based)

Add a blocking script to your `app.html` that runs before the page renders:

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#ffffff" />
    <script>
      (function() {
        try {
          var theme = localStorage.getItem('theme');
          var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
          var isDark = theme === 'dark' || (theme !== 'light' && prefersDark);

          if (isDark) {
            document.documentElement.classList.add('dark');
            // Update theme-color meta tag for mobile browsers
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', '#0f172a');
          }
        } catch (e) {
          // localStorage unavailable (private browsing, SSR, etc.)
        }
      })();
    </script>
    %sveltekit.head%
  </head>
  <body>
    %sveltekit.body%
  </body>
</html>
```

This inline script runs immediately, before any CSS or JavaScript loads, before the first paint. It is synchronous and blocks rendering until complete, which is exactly what we want — a few microseconds of blocking is far better than a visible flash.

**Limitation:** This approach relies entirely on `localStorage`, which is a client-side API. During server-side rendering, SvelteKit generates HTML without knowing the user's theme preference. The HTML arrives without the `dark` class, and the inline script adds it before the first paint. This works well in practice, but there is a theoretical race condition on very slow connections where the HTML might render before the script executes.

### Approach 2: Cookie-Based SSR (Zero Flash, Production-Grade)

For a bulletproof solution with no flash whatsoever, use a cookie to communicate the theme preference to the server. The server then renders HTML with the correct `dark` class from the very first byte.

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const theme = event.cookies.get('theme');

  // Determine if we should apply dark mode
  // "system" or missing: let the client-side script handle it
  // "dark": apply dark class server-side
  // "light": no dark class
  const applyDark = theme === 'dark';

  return resolve(event, {
    transformPageChunk: ({ html }) => {
      if (applyDark) {
        return html.replace('<html lang="en">', '<html lang="en" class="dark"');
      }
      return html;
    }
  });
};
```

Now update the theme toggle to set a cookie in addition to `localStorage`:

```svelte
<!-- src/lib/components/ThemeToggle.svelte (cookie-based version) -->
<script lang="ts">
  import { browser } from '$app/environment';

  type Theme = 'light' | 'dark' | 'system';

  let theme = $state<Theme>('system');

  if (browser) {
    const saved = localStorage.getItem('theme') as Theme | null;
    theme = saved || 'system';
  }

  function getEffectiveTheme(preference: Theme): 'light' | 'dark' {
    if (preference === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return preference;
  }

  function applyTheme(preference: Theme) {
    if (!browser) return;

    const effective = getEffectiveTheme(preference);
    document.documentElement.classList.toggle('dark', effective === 'dark');

    // Persist to localStorage (for the inline script on reload)
    localStorage.setItem('theme', preference);

    // Persist to cookie (for SSR on next navigation)
    document.cookie = `theme=${effective}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  }

  function setTheme(newTheme: Theme) {
    theme = newTheme;
    applyTheme(theme);
  }

  $effect(() => {
    if (!browser) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  });
</script>

<div class="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
  <button
    onclick={() => setTheme('light')}
    class="rounded-md px-3 py-1.5 text-sm transition-colors"
    class:bg-white={theme === 'light'}
    class:shadow-sm={theme === 'light'}
    class:text-gray-900={theme === 'light'}
    class:text-gray-500={theme !== 'light'}
    class:dark:text-gray-400={theme !== 'light'}
    aria-pressed={theme === 'light'}
  >
    Light
  </button>
  <button
    onclick={() => setTheme('dark')}
    class="rounded-md px-3 py-1.5 text-sm transition-colors"
    class:bg-gray-700={theme === 'dark'}
    class:shadow-sm={theme === 'dark'}
    class:text-white={theme === 'dark'}
    class:text-gray-500={theme !== 'dark'}
    class:dark:text-gray-400={theme !== 'dark'}
    aria-pressed={theme === 'dark'}
  >
    Dark
  </button>
  <button
    onclick={() => setTheme('system')}
    class="rounded-md px-3 py-1.5 text-sm transition-colors"
    class:bg-white={theme === 'system'}
    class:dark:bg-gray-700={theme === 'system'}
    class:shadow-sm={theme === 'system'}
    class:text-gray-900={theme === 'system'}
    class:dark:text-white={theme === 'system'}
    class:text-gray-500={theme !== 'system'}
    class:dark:text-gray-400={theme !== 'system'}
    aria-pressed={theme === 'system'}
  >
    System
  </button>
</div>
```

The cookie approach has one subtlety: when the user selects "system" mode, you set the cookie to the effective theme (light or dark) so the server knows which class to apply. The `localStorage` value tracks the user's actual preference (which might be "system"), while the cookie tracks the resolved theme.

Keep the inline script in `app.html` as a fallback for the very first visit (before the cookie exists) and for the "system" mode case where the OS preference might have changed between navigation.

## Designing for Dark Mode

Dark mode is not "invert all the colors." Good dark mode design requires intentional color choices. Here are the principles that professional designers follow:

### 1. Do Not Use Pure Black

Pure black (`#000000`) on screens creates excessive contrast with white text, causing eye strain. Use a dark gray instead:

```css
/* Bad — too much contrast, causes halation (text appears to glow) */
.dark { background: #000000; color: #ffffff; }

/* Good — softer contrast, easier on the eyes */
.dark { background: #0f172a; color: #e2e8f0; }
```

### 2. Reduce Elevation with Lighter Surfaces

In light mode, you use shadows to create depth. In dark mode, shadows are invisible against dark backgrounds. Instead, use progressively lighter surface colors to indicate elevation:

```svelte
<!-- Base surface → elevated surface → highest elevation -->
<div class="bg-white dark:bg-slate-900">
  <div class="bg-white dark:bg-slate-800 shadow-md dark:shadow-none rounded-lg p-4">
    <div class="bg-gray-50 dark:bg-slate-700 rounded p-3">
      Highest elevation — lightest dark surface
    </div>
  </div>
</div>
```

### 3. Desaturate Colors in Dark Mode

Vivid colors that look great on a white background become garish against dark backgrounds. Reduce saturation or use lighter tints:

```svelte
<button class="bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-400
               text-white px-4 py-2 rounded-lg">
  Save
</button>

<!-- Status colors — softer in dark mode -->
<span class="text-green-700 dark:text-green-400">Success</span>
<span class="text-red-700 dark:text-red-400">Error</span>
<span class="text-yellow-700 dark:text-yellow-400">Warning</span>
```

### 4. Handle Images and Media

Images designed for light backgrounds can look washed out or jarring in dark mode:

```svelte
<!-- Reduce brightness and add slight contrast boost in dark mode -->
<img
  src={product.image}
  alt={product.name}
  class="rounded-lg dark:brightness-90 dark:contrast-105"
/>

<!-- Show different images per theme -->
<picture>
  <source srcset="/logo-dark.svg" media="(prefers-color-scheme: dark)" />
  <img src="/logo-light.svg" alt="Logo" />
</picture>

<!-- Or use class-based switching -->
<img src="/logo-light.svg" alt="Logo" class="dark:hidden" />
<img src="/logo-dark.svg" alt="Logo" class="hidden dark:block" />
```

### 5. Borders and Dividers

Borders that are subtle in light mode become invisible or harsh in dark mode. Adjust border colors explicitly:

```svelte
<div class="border border-gray-200 dark:border-gray-700 rounded-lg">
  <div class="p-4 border-b border-gray-200 dark:border-gray-700">
    Header
  </div>
  <div class="p-4">
    Content
  </div>
</div>

<!-- Use ring instead of border for form elements — better dark mode appearance -->
<input class="rounded-lg bg-white dark:bg-gray-800
              ring-1 ring-gray-300 dark:ring-gray-600
              focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400
              text-gray-900 dark:text-gray-100
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              px-3 py-2" />
```

## Using CSS Variables for Theme Colors

Sprinkling `dark:` variants on every element works, but it leads to verbose markup and makes global color changes tedious. CSS custom properties give you a single source of truth for theme colors:

```css
/* src/app.css */
@import 'tailwindcss';

@custom-variant dark (&:where(.dark, .dark *));

@theme {
  /* Light mode colors (default) */
  --color-surface: #ffffff;
  --color-surface-alt: #f8fafc;
  --color-surface-elevated: #ffffff;
  --color-on-surface: #0f172a;
  --color-on-surface-muted: #64748b;
  --color-on-surface-subtle: #94a3b8;
  --color-border: #e2e8f0;
  --color-border-strong: #cbd5e1;
  --color-primary: #2563eb;
  --color-primary-hover: #1d4ed8;
  --color-on-primary: #ffffff;
  --color-success: #16a34a;
  --color-error: #dc2626;
  --color-warning: #d97706;
}

/* Dark mode overrides */
.dark {
  --color-surface: #0f172a;
  --color-surface-alt: #1e293b;
  --color-surface-elevated: #1e293b;
  --color-on-surface: #e2e8f0;
  --color-on-surface-muted: #94a3b8;
  --color-on-surface-subtle: #64748b;
  --color-border: #334155;
  --color-border-strong: #475569;
  --color-primary: #3b82f6;
  --color-primary-hover: #60a5fa;
  --color-on-primary: #ffffff;
  --color-success: #4ade80;
  --color-error: #f87171;
  --color-warning: #fbbf24;
}
```

Now your components use semantic names instead of duplicated color values:

```svelte
<!-- Before: verbose, hard to maintain -->
<div class="bg-white dark:bg-slate-900 border border-gray-200 dark:border-gray-700 p-6">
  <h3 class="text-gray-900 dark:text-gray-100">Title</h3>
  <p class="text-gray-500 dark:text-gray-400">Description</p>
  <button class="bg-blue-600 dark:bg-blue-500 text-white">Save</button>
</div>

<!-- After: clean, one set of classes, easy to rebrand -->
<div class="bg-surface border border-border p-6">
  <h3 class="text-on-surface">Title</h3>
  <p class="text-on-surface-muted">Description</p>
  <button class="bg-primary text-on-primary hover:bg-primary-hover">Save</button>
</div>
```

The CSS variable approach has compounding benefits:
- To change your brand color, you update two lines (light and dark) instead of finding every `bg-blue-600` in your codebase
- Components are theme-agnostic — they do not know whether they are in light or dark mode
- Adding a third theme (e.g., "high contrast") requires only adding another set of variable overrides

## Complete Dark Mode Card Component

Here is a production-quality card component that demonstrates all the dark mode design principles:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    image?: string;
    badge?: string;
    href?: string;
  }

  let { title, description, image, badge, href }: Props = $props();
</script>

<article
  class="group relative overflow-hidden rounded-xl
         bg-surface-elevated border border-border
         shadow-sm dark:shadow-none
         transition-all duration-200
         hover:shadow-md dark:hover:bg-surface-alt
         hover:border-border-strong"
>
  {#if image}
    <div class="aspect-video overflow-hidden">
      <img
        src={image}
        alt=""
        class="h-full w-full object-cover
               transition-transform duration-300
               group-hover:scale-105
               dark:brightness-90 dark:contrast-105"
      />
    </div>
  {/if}

  <div class="p-5">
    {#if badge}
      <span class="inline-block rounded-full
                    bg-primary/10 dark:bg-primary/20
                    text-primary text-xs font-medium
                    px-2.5 py-0.5 mb-2">
        {badge}
      </span>
    {/if}

    <h3 class="text-lg font-semibold text-on-surface
               group-hover:text-primary transition-colors">
      {#if href}
        <a {href} class="after:absolute after:inset-0">
          {title}
        </a>
      {:else}
        {title}
      {/if}
    </h3>

    {#if description}
      <p class="mt-2 text-sm text-on-surface-muted line-clamp-2">
        {description}
      </p>
    {/if}
  </div>
</article>
```

Notice the technique for hover effects: in light mode, the card gets a larger shadow on hover (`hover:shadow-md`). In dark mode, shadows are invisible, so instead the background lightens slightly (`dark:hover:bg-surface-alt`). Same visual intent — "this card is interactive" — communicated through the appropriate mechanism for each mode.

## Accessibility Considerations

Dark mode is not just a visual preference — it is an accessibility feature. Some users with photosensitivity or certain visual impairments require dark mode for comfortable use.

```svelte
<!-- Announce theme changes to screen readers -->
<script lang="ts">
  let announcement = $state('');

  function setTheme(newTheme: Theme) {
    theme = newTheme;
    applyTheme(theme);

    const effective = getEffectiveTheme(theme);
    announcement = `Theme changed to ${effective} mode`;

    // Clear after screen reader has read it
    setTimeout(() => { announcement = ''; }, 1000);
  }
</script>

<!-- Live region for screen reader announcements -->
<div role="status" aria-live="polite" class="sr-only">
  {announcement}
</div>
```

Also ensure that your color contrast ratios meet WCAG guidelines in both modes. Light text on a dark background needs the same 4.5:1 contrast ratio as dark text on a light background. Tools like the WebAIM contrast checker can verify this.

## Try It

1. **Build a complete settings page** with a three-mode theme toggle (Light, Dark, System). Store the user's choice in both `localStorage` and a cookie. Use the cookie in `hooks.server.ts` to apply the correct class during SSR so there is zero flash on page load. Listen for OS preference changes when "System" mode is selected.

2. **Create a design token system** using CSS custom properties for at least: surface, on-surface, muted, border, primary, success, error. Define light and dark values. Build a card, a form input, an alert, and a navigation bar using only these tokens — no direct `dark:` variants in the markup.

3. **Add a dark mode toggle** to your application's navigation bar. When the theme changes, smoothly transition the background and text colors using `transition-colors`. Make sure the toggle shows the current state with an appropriate icon (sun, moon, or monitor). Test with a screen reader to ensure the theme change is announced.

4. **Handle images** in dark mode. Find three images in your app and apply appropriate dark mode treatment: reduce brightness, swap to a dark variant, or add a subtle background behind transparent PNGs. Compare the visual result side by side in both modes.

## Key Takeaways

- Tailwind's `dark:` prefix applies styles when dark mode is active — every utility class supports it
- Class-based dark mode (`@custom-variant dark`) gives users manual control over the theme; media-query mode follows the OS automatically
- Prevent the flash of wrong theme with an inline blocking script in `app.html` that applies the `dark` class before the first paint
- For zero-flash SSR, use a cookie to communicate the theme to the server, and apply the class in `hooks.server.ts` using `transformPageChunk`
- Dark mode design is not "invert the colors" — avoid pure black, use elevation through lighter surfaces, desaturate vivid colors, and handle images explicitly
- CSS custom properties create a single source of truth for theme colors, eliminating duplicate `dark:` classes and simplifying rebranding
- Support three modes: Light, Dark, and System — with a listener for OS preference changes when System is selected
- Set `theme-color` meta tag dynamically so mobile browsers match your app's current theme
- Dark mode is an accessibility feature — ensure WCAG contrast ratios are met in both modes and announce theme changes to screen readers
