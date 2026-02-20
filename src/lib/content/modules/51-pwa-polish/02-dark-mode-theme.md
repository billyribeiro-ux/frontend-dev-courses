# Dark Mode & Theme System

Every modern application needs a theme system. Users expect to choose between light and dark modes, and many expect the app to follow their OS setting by default. TeamBoard already has Tailwind's `dark:` classes sprinkled throughout its components. This lesson wires up the actual theme switching machinery — detecting system preferences, toggling between modes, persisting the choice, and making sure there is no flash of the wrong theme on page load.

You will also handle `prefers-reduced-motion`. Some users have vestibular disorders that make animations uncomfortable or even harmful. A responsible theme system respects this preference and disables transitions when the user asks for it.

## Detecting System Preferences with svelte:window

The browser exposes media queries through `window.matchMedia()`. You can check the user's current system preference and listen for changes — useful when someone toggles dark mode in their OS settings while your app is open.

Here is the raw approach using `<svelte:window>`:

```svelte
<script lang="ts">
  let prefersDark = $state(false);
  let prefersReducedMotion = $state(false);
</script>

<svelte:window
  onchange:matchMedia={(e) => {
    // This does not exist — svelte:window cannot bind to matchMedia directly.
    // We need a different approach.
  }}
/>
```

That will not work. `<svelte:window>` can bind to properties like `innerWidth` and `online`, but it does not have built-in support for media queries. Instead, you set up `matchMedia` listeners inside an `$effect` that runs when the component mounts:

```svelte
<script lang="ts">
  let systemPrefersDark = $state(false);
  let systemPrefersReducedMotion = $state(false);

  $effect(() => {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Set initial values
    systemPrefersDark = darkQuery.matches;
    systemPrefersReducedMotion = motionQuery.matches;

    // Listen for changes (user toggles OS dark mode)
    function onDarkChange(e: MediaQueryListEvent) {
      systemPrefersDark = e.matches;
    }
    function onMotionChange(e: MediaQueryListEvent) {
      systemPrefersReducedMotion = e.matches;
    }

    darkQuery.addEventListener('change', onDarkChange);
    motionQuery.addEventListener('change', onMotionChange);

    return () => {
      darkQuery.removeEventListener('change', onDarkChange);
      motionQuery.removeEventListener('change', onMotionChange);
    };
  });
</script>
```

The `$effect` return function cleans up the listeners when the component is destroyed, just like the cleanup function in `onMount`. The `systemPrefersDark` and `systemPrefersReducedMotion` variables are reactive — any component that reads them will re-render when the system preference changes.

## The ThemeContext

In Module 46 you learned about using `setContext` and `getContext` to share state across a component tree without prop drilling. The theme system is a perfect use case. You set it once in the root layout and every component in the tree can read it.

```typescript
// src/lib/state/theme.svelte.ts
import { getContext, setContext } from 'svelte';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_KEY = Symbol('theme');
const STORAGE_KEY = 'teamboard-theme';

export function createThemeContext() {
  // User's explicit choice — defaults to 'system'
  let mode = $state<ThemeMode>('system');

  // System preference — updated by matchMedia listener
  let systemPrefersDark = $state(false);
  let systemPrefersReducedMotion = $state(false);

  // The resolved theme: what is actually applied to the page
  let resolvedTheme = $derived<'light' | 'dark'>(
    mode === 'system'
      ? (systemPrefersDark ? 'dark' : 'light')
      : mode
  );

  let isDark = $derived(resolvedTheme === 'dark');

  // Load persisted preference from localStorage
  function loadFromStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        mode = stored;
      }
    } catch {
      // localStorage may be unavailable (private browsing, SSR)
    }
  }

  // Save preference to localStorage
  function persistChoice() {
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // Silently fail
    }
  }

  // Cycle through modes: system -> light -> dark -> system
  function toggle() {
    const order: ThemeMode[] = ['system', 'light', 'dark'];
    const currentIndex = order.indexOf(mode);
    mode = order[(currentIndex + 1) % order.length];
    persistChoice();
  }

  // Set a specific mode
  function setMode(newMode: ThemeMode) {
    mode = newMode;
    persistChoice();
  }

  // Initialize system preference listeners
  function initMediaQueries() {
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    systemPrefersDark = darkQuery.matches;
    systemPrefersReducedMotion = motionQuery.matches;

    darkQuery.addEventListener('change', (e) => {
      systemPrefersDark = e.matches;
    });
    motionQuery.addEventListener('change', (e) => {
      systemPrefersReducedMotion = e.matches;
    });
  }

  const context = {
    get mode() { return mode; },
    get resolvedTheme() { return resolvedTheme; },
    get isDark() { return isDark; },
    get reducedMotion() { return systemPrefersReducedMotion; },
    toggle,
    setMode,
    loadFromStorage,
    initMediaQueries
  };

  setContext(THEME_KEY, context);
  return context;
}

export function getThemeContext() {
  return getContext<ReturnType<typeof createThemeContext>>(THEME_KEY);
}
```

The `$derived` for `resolvedTheme` is the core logic: when `mode` is `'system'`, the resolved theme follows the OS preference. When the user explicitly picks `'light'` or `'dark'`, that overrides the system setting.

Notice that `toggle()` cycles through three states instead of just flipping a boolean. Users want to be able to go back to "follow my system" after manually choosing a theme.

## Applying the Theme with $effect.pre

Here is the critical part. You need to apply the `dark` class to `document.documentElement` (the `<html>` element) so that Tailwind's `dark:` utilities activate. But the timing matters enormously.

A regular `$effect` runs **after** the browser paints. That means on page load:

1. The page renders with no `dark` class (light mode)
2. The `$effect` runs and adds the `dark` class
3. The page re-renders in dark mode

The user sees a flash of light theme. It is jarring and looks broken.

`$effect.pre` runs **before** the browser paints. The sequence becomes:

1. The `$effect.pre` runs and adds the `dark` class
2. The page renders correctly in dark mode on the first paint

No flash. Here is how you wire it up in the root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { createThemeContext } from '$state/theme.svelte';

  let { children } = $props();

  const theme = createThemeContext();

  // Initialize on the client
  $effect(() => {
    theme.loadFromStorage();
    theme.initMediaQueries();
  });

  // Apply theme class BEFORE paint — prevents flash of wrong theme
  $effect.pre(() => {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;

    if (theme.isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  });

  // Apply reduced motion preference globally
  $effect.pre(() => {
    if (typeof document === 'undefined') return;

    if (theme.reducedMotion) {
      document.documentElement.style.setProperty('--transition-duration', '0ms');
      document.documentElement.style.setProperty('--animation-duration', '0ms');
    } else {
      document.documentElement.style.removeProperty('--transition-duration');
      document.documentElement.style.removeProperty('--animation-duration');
    }
  });

  // View Transitions (from Module 44, lesson 3)
  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<svelte:head>
  <meta
    name="theme-color"
    content={theme.isDark ? '#1f2937' : '#ffffff'}
  />
</svelte:head>

{@render children()}
```

Let's break down the three effects:

1. **`$effect` (load + init)** — runs once after mount. Loads the persisted theme choice from localStorage and sets up `matchMedia` listeners. This is a regular effect because it only needs to run once and does not affect the first paint.

2. **`$effect.pre` (theme class)** — runs before every paint where `theme.isDark` changes. Adds or removes the `dark` class on `<html>`. Using `$effect.pre` ensures the class is applied before the browser renders, eliminating the flash.

3. **`$effect.pre` (reduced motion)** — sets CSS custom properties to `0ms` when the user prefers reduced motion. Components use these properties for their transition durations.

## Dynamic theme-color Meta Tag

The `<svelte:head>` block injects a `<meta name="theme-color">` tag that changes based on the current theme. This meta tag controls the browser chrome color on mobile devices — the area around the address bar and status bar.

```svelte
<svelte:head>
  <meta
    name="theme-color"
    content={theme.isDark ? '#1f2937' : '#ffffff'}
  />
</svelte:head>
```

When the user switches to dark mode, the browser chrome on Android and iOS turns dark gray to match. When they switch to light mode, it turns white. This small detail makes the app feel native and polished.

Svelte handles this reactively — when `theme.isDark` changes, the meta tag's `content` attribute updates in the DOM automatically. No manual DOM manipulation needed.

## The Theme Toggle Component

Now build the toggle button that cycles through system, light, and dark:

```svelte
<!-- src/lib/components/ui/ThemeToggle.svelte -->
<script lang="ts">
  import { getThemeContext } from '$state/theme.svelte';

  const theme = getThemeContext();

  let label = $derived(
    theme.mode === 'system'
      ? 'System'
      : theme.mode === 'light'
        ? 'Light'
        : 'Dark'
  );

  let icon = $derived(
    theme.mode === 'system'
      ? '💻'
      : theme.mode === 'light'
        ? '☀️'
        : '🌙'
  );
</script>

<button
  onclick={() => theme.toggle()}
  class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
         bg-gray-100 hover:bg-gray-200
         dark:bg-gray-700 dark:hover:bg-gray-600
         transition-colors"
  aria-label="Toggle theme. Currently: {label}"
  title="Theme: {label}. Click to cycle."
>
  <span class="text-base">{icon}</span>
  <span>{label}</span>
</button>
```

The button calls `theme.toggle()`, which cycles through `system -> light -> dark -> system`. The `$derived` values update the label and icon automatically. The `aria-label` ensures screen reader users know the current state and that clicking will change it.

## Respecting Reduced Motion

When `prefers-reduced-motion: reduce` is active, all animations and transitions should be disabled or significantly reduced. The `$effect.pre` in the root layout sets CSS custom properties, but you also need your components to use those properties.

Here is the CSS pattern:

```css
/* src/app.css */

:root {
  --transition-duration: 200ms;
  --animation-duration: 300ms;
}

/* All transitions and animations use the custom properties */
.transition-colors {
  transition-duration: var(--transition-duration);
}

.animate-slide-in {
  animation-duration: var(--animation-duration);
}
```

When the reduced motion `$effect.pre` fires, it sets `--transition-duration: 0ms` and `--animation-duration: 0ms` on the root element, which cascades to every component using those properties.

For programmatic animations (like GSAP or manual JS transitions), check the context:

```svelte
<script lang="ts">
  import { getThemeContext } from '$state/theme.svelte';
  import { fly } from 'svelte/transition';

  const theme = getThemeContext();

  // Conditional transition parameters
  let flyParams = $derived(
    theme.reducedMotion
      ? { duration: 0 }
      : { y: 20, duration: 300 }
  );
</script>

{#if visible}
  <div transition:fly={flyParams}>
    Content that slides in — unless the user prefers reduced motion.
  </div>
{/if}
```

The board's drag-and-drop animations from Module 47 should also respect this setting:

```svelte
<!-- In the board column component -->
<script lang="ts">
  import { getThemeContext } from '$state/theme.svelte';
  import { flip } from 'svelte/animate';

  const theme = getThemeContext();

  let flipDuration = $derived(theme.reducedMotion ? 0 : 250);
</script>

{#each tasks as task (task.id)}
  <div animate:flip={{ duration: flipDuration }}>
    <TaskCard {task} />
  </div>
{/each}
```

When `reducedMotion` is true, `flip` uses a duration of `0`, which means the items snap to their new positions instantly instead of animating.

## Persisting with $state.snapshot()

The theme context persists to `localStorage` using a simple string, but sometimes you need to persist more complex state objects. This is where `$state.snapshot()` comes in.

`$state.snapshot()` creates a plain JavaScript object from a reactive proxy — stripping away all the Svelte reactivity metadata so it can be safely serialized with `JSON.stringify`:

```typescript
// Example: persisting user preferences (theme + other settings)
interface UserPreferences {
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  defaultBoardView: 'kanban' | 'list';
  notificationsEnabled: boolean;
}

function createPreferences() {
  let prefs = $state<UserPreferences>({
    theme: 'system',
    sidebarCollapsed: false,
    defaultBoardView: 'kanban',
    notificationsEnabled: true
  });

  function save() {
    // $state.snapshot() strips the reactive proxy
    // Without it, JSON.stringify would fail or produce unexpected results
    const plain = $state.snapshot(prefs);
    localStorage.setItem('teamboard-prefs', JSON.stringify(plain));
  }

  function load() {
    try {
      const stored = localStorage.getItem('teamboard-prefs');
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to handle new fields added after the user last visited
        prefs = { ...prefs, ...parsed };
      }
    } catch {
      // Corrupted data — use defaults
    }
  }

  return {
    get value() { return prefs; },
    save,
    load
  };
}
```

The key insight: `$state` objects are Proxies. You cannot `JSON.stringify` a Proxy reliably — it may miss properties or include internal metadata. `$state.snapshot()` gives you a clean, serializable copy.

## Theme-Aware Components in Practice

Here is how a real TeamBoard component uses the theme context for conditional styling that goes beyond Tailwind's `dark:` prefix:

```svelte
<!-- src/lib/components/board/TaskCard.svelte -->
<script lang="ts">
  import { getThemeContext } from '$state/theme.svelte';

  let { task } = $props();
  const theme = getThemeContext();

  // Priority colors that differ between themes
  const priorityColors = $derived(() => {
    if (theme.isDark) {
      return {
        low: 'bg-green-900/50 text-green-300',
        medium: 'bg-blue-900/50 text-blue-300',
        high: 'bg-orange-900/50 text-orange-300',
        urgent: 'bg-red-900/50 text-red-300'
      };
    }
    return {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800'
    };
  });
</script>

<div class="p-3 rounded-lg border bg-white dark:bg-gray-800
            dark:border-gray-700 shadow-sm hover:shadow-md
            transition-shadow"
     style:transition-duration="var(--transition-duration)"
>
  <h3 class="font-medium text-gray-900 dark:text-gray-100">
    {task.title}
  </h3>

  {#if task.priority}
    <span class="inline-block mt-2 px-2 py-0.5 rounded text-xs font-medium
                 {priorityColors()[task.priority]}">
      {task.priority}
    </span>
  {/if}
</div>
```

Most of the time, Tailwind's `dark:` variants are sufficient. But when you need computed class strings or more complex conditional styling, having the `theme.isDark` flag from context gives you full control.

## Handling SSR

The theme system runs entirely on the client. During server-side rendering, there is no `window`, no `localStorage`, and no `matchMedia`. The `typeof document === 'undefined'` check in the `$effect.pre` handles this — it prevents the effect from running on the server.

On the first server render, the page will have no `dark` class. To minimize the flash, add a small inline script to the `app.html` template that applies the theme before Svelte hydrates:

```html
<!-- src/app.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    %sveltekit.head%
    <script>
      // Apply theme before first paint to prevent flash
      try {
        const stored = localStorage.getItem('teamboard-theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (stored === 'dark' || (stored !== 'light' && prefersDark)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
    </script>
  </head>
  <body data-sveltekit-prerender="true">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

This tiny inline script runs synchronously before any rendering happens. It checks localStorage for a saved preference and falls back to the system preference. By the time Svelte hydrates and the `$effect.pre` runs, the `dark` class is already in place — no flash.

## Try It

1. Create the `ThemeContext` in `src/lib/state/theme.svelte.ts`
2. Wire it up in your root `+layout.svelte` with `createThemeContext()`, the `$effect.pre` for the theme class, and the `<svelte:head>` for `theme-color`
3. Build the `ThemeToggle` component and add it to the app sidebar
4. Add the inline script to `app.html` to prevent the flash of wrong theme
5. Test the cycle: click the toggle to go from System to Light to Dark and back
6. Change your OS theme while the app is open — when set to "System", the app should follow immediately
7. Enable "Reduce motion" in your OS accessibility settings — verify that board animations snap to their final position instead of animating
8. Open the app in a new private window — the theme should default to "System" and match your OS preference
9. Set a theme, close the tab, reopen — the persisted choice should be restored without any flash

## Key Takeaways

- Use `window.matchMedia()` inside an `$effect` to reactively detect system dark mode and reduced motion preferences, with cleanup on the return function
- The `ThemeContext` uses `setContext`/`getContext` to make theme state available throughout the entire component tree without prop drilling
- Three-way toggle (system / light / dark) is better UX than a simple on/off switch — users can always return to "follow my system"
- `$effect.pre` applies the theme class **before** the browser paints, preventing the flash of wrong theme that happens with regular `$effect`
- An inline script in `app.html` provides the earliest possible theme application, even before Svelte hydrates
- `<svelte:head>` with a reactive `theme-color` meta tag makes the mobile browser chrome match the current theme
- `$state.snapshot()` creates a plain serializable copy of reactive state for `JSON.stringify` and `localStorage`
- Reduced motion is not optional — set animation/transition durations to `0ms` globally and make programmatic animations check the preference
