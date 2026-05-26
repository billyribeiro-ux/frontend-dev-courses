# Context API Deep Dive

You have already seen how `setContext` and `getContext` pass data down the component tree without prop drilling. Now it is time to explore the full Context API — typed keys, optional context checks, reactive context objects, and exactly when context is the right tool compared to props and shared state.

Context is scoped to a component tree. A value set in a parent is available to every descendant in that branch, but invisible to components outside it. This tree-scoping is what makes context fundamentally different from global state in a `.svelte.ts` file.

## setContext and getContext

The two core functions work as a pair. The parent calls `setContext` during component initialization, and any descendant calls `getContext` with the same key:

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  const user = { name: 'Alice', role: 'admin' };
  setContext('user', user);
</script>

{@render children()}
```

```svelte
<!-- src/routes/dashboard/settings/+page.svelte -->
<script lang="ts">
  import { getContext } from 'svelte';

  const user = getContext<{ name: string; role: string }>('user');
</script>

<h1>Settings for {user.name}</h1>
<p>Role: {user.role}</p>
```

Both functions must be called during component initialization — inside the top-level `<script>` block, not inside event handlers or `$effect` callbacks.

## Typed Symbol Keys

String keys are fragile. A typo silently returns `undefined`, and two libraries could accidentally use the same string. Using `Symbol` keys with typed helper functions solves both problems:

```typescript
// src/lib/context/theme.ts
import { setContext, getContext } from 'svelte';

interface ThemeConfig {
  mode: 'light' | 'dark';
  accentColor: string;
  fontSize: 'sm' | 'md' | 'lg';
}

const THEME_KEY = Symbol('theme');

export function setThemeContext(config: ThemeConfig) {
  setContext(THEME_KEY, config);
}

export function getThemeContext(): ThemeConfig {
  return getContext<ThemeConfig>(THEME_KEY);
}
```

```svelte
<!-- Parent layout -->
<script lang="ts">
  import { setThemeContext } from '$lib/context/theme';
  setThemeContext({ mode: 'dark', accentColor: '#7c3aed', fontSize: 'md' });
</script>

<!-- Deeply nested child -->
<script lang="ts">
  import { getThemeContext } from '$lib/context/theme';
  const theme = getThemeContext(); // Fully typed, no string key to mistype
</script>

<div class="accent" style:color={theme.accentColor}>
  Themed content
</div>
```

Symbols are globally unique, so collisions are impossible even across third-party libraries.

## createContext — The Modern Approach

Svelte 5 introduced `createContext()` as the preferred way to create typed, scoped context. Instead of manually defining Symbol keys and writing `get`/`set` wrapper functions yourself, `createContext` does it all in one call. It may still be marked as experimental in some versions, so check the docs for your Svelte release.

`createContext()` returns a `[get, set]` pair of functions — no Symbol key to manage, no boilerplate:

```typescript
// src/lib/context/theme.ts
import { createContext } from 'svelte';

interface ThemeConfig {
  mode: 'light' | 'dark';
  accentColor: string;
  fontSize: 'sm' | 'md' | 'lg';
}

const [getThemeContext, setThemeContext] = createContext<ThemeConfig>();

export { getThemeContext, setThemeContext };
```

Compare this with the manual Symbol approach in the previous section — the interface stays the same, but the Symbol key, the `setContext`/`getContext` wrappers, and the explicit type annotations on `getContext` are all gone. `createContext` handles the unique key internally, making collisions impossible without any effort on your part.

Usage in components is identical to the typed helper pattern:

```svelte
<!-- Parent layout -->
<script lang="ts">
  import { setThemeContext } from '$lib/context/theme';

  setThemeContext({ mode: 'dark', accentColor: '#7c3aed', fontSize: 'md' });
</script>

{@render children()}
```

```svelte
<!-- Deeply nested child -->
<script lang="ts">
  import { getThemeContext } from '$lib/context/theme';

  const theme = getThemeContext(); // Fully typed — ThemeConfig is inferred
</script>

<div class="accent" style:color={theme.accentColor}>
  Current font size: {theme.fontSize}
</div>
```

The `setContext` and `getContext` functions are not deprecated and still work exactly as before. If you have existing code that uses Symbol keys and typed helpers, there is no need to rewrite it. However, for new code `createContext` is cleaner: fewer lines, no manual key management, and the same type safety you would get from hand-rolled helpers.

## hasContext and getAllContexts

`hasContext(key)` checks whether a context value exists without throwing. This is useful for optional dependencies — components that adapt their behavior based on whether a parent has provided context:

```svelte
<script lang="ts">
  import { hasContext, getContext } from 'svelte';
  import { THEME_KEY } from '$lib/context/theme';

  const hasTheme = hasContext(THEME_KEY);
  const theme = hasTheme ? getContext(THEME_KEY) : { mode: 'light' };
</script>

<p>Using {theme.mode} mode{hasTheme ? '' : ' (default)'}</p>
```

`getAllContexts()` returns a `Map` of every context key-value pair set by ancestor components. This is rarely needed, but is valuable when building wrapper components that need to forward all context to a dynamic child:

```svelte
<script lang="ts">
  import { getAllContexts, setContext } from 'svelte';

  // Capture all context from ancestors
  const allContexts = getAllContexts();

  // Forward everything (useful in wrapper/portal components)
  for (const [key, value] of allContexts) {
    setContext(key, value);
  }
</script>
```

## Reactive Context

Context values are set once during initialization, so passing a plain value creates a static snapshot. To make context reactive, pass an object that uses `$state` internally:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let mode = $state<'light' | 'dark'>('light');

  setContext('theme', {
    get mode() { return mode; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; }
  });
</script>

{@render children()}
```

```svelte
<!-- Any descendant component -->
<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{ mode: string; toggle: () => void }>('theme');
</script>

<p>Current mode: {theme.mode}</p>
<button onclick={theme.toggle}>Toggle theme</button>
```

The getter `get mode()` returns the live `$state` value each time it is read, so descendants see reactive updates. Without the getter, descendants would receive the initial value and never update.

## Context vs Props vs Shared State

Choosing between these three mechanisms comes down to scope and relationship:

| Mechanism | Scope | Best For |
|-----------|-------|----------|
| Props | Parent to direct child | Explicit, one-level data passing |
| Context | Ancestor to any descendant | Tree-scoped data without prop drilling |
| Shared state (`.svelte.ts`) | Any component, anywhere | App-wide global data |

**Decision tree:**

1. Does only the direct child need the data? Use **props**.
2. Do multiple descendants in the same subtree need the data, but it should not leak outside that tree? Use **context**.
3. Do unrelated components across different pages need the data? Use **shared state** in a `.svelte.ts` file.

Context is scoped to the tree where it was set. A context value provided in `/dashboard/+layout.svelte` is available to every page and component under `/dashboard`, but not to components under `/settings`. This scoping is a feature, not a limitation — it prevents unrelated parts of your app from accidentally depending on each other.

## Try It

Build a `Tabs` component system using context. The parent `Tabs` component should set context with the active tab and a method to change it. Each `Tab` child should read the context to know whether it is active. Each `TabPanel` child should read the context to decide whether to render its content. Use typed Symbol keys and reactive state.

## Key Takeaways

- `setContext(key, value)` provides data from a parent; `getContext(key)` reads it in any descendant
- Use `Symbol` keys with typed helper functions to prevent collisions and ensure type safety
- `createContext()` is the preferred approach for new code — it returns a typed `[get, set]` pair with no manual key management
- `setContext`/`getContext` still work and are not deprecated, but `createContext` eliminates boilerplate and avoids key collisions automatically
- `hasContext(key)` checks if context exists, enabling components with optional dependencies
- `getAllContexts()` returns all ancestor context as a Map, useful for wrapper components
- Pass objects with `$state` and getters to make context values reactive
- Context is tree-scoped: only descendants of the provider component can access the value
- Use props for direct children, context for subtrees, and `.svelte.ts` shared state for global data
