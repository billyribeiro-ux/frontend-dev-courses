# Context API

Global state is powerful, but it is a blunt instrument. Sometimes you need shared state that is scoped to a *section* of your component tree, not the entire app. A multi-step form wizard where child components need access to the shared form data. A dashboard panel where nested widgets read the selected date range. A theme override that applies to one section of the page but not another.

This is exactly what Svelte's **Context API** solves. It lets a parent component provide data that any descendant can access — without passing props through every intermediate level. The data is invisible to components outside that subtree, which keeps your architecture clean and your state scoped to where it belongs.

## The Problem: Prop Drilling

Imagine a layout that loads the current user and needs to pass it to a deeply nested avatar component:

```
+layout.svelte (has user data)
  └─ Sidebar.svelte (doesn't use user, but must pass it)
      └─ Navigation.svelte (doesn't use user, but must pass it)
          └─ UserMenu.svelte (doesn't use user, but must pass it)
              └─ Avatar.svelte (finally uses user!)
```

Without context, every intermediate component must accept a `user` prop and forward it to its children. This is **prop drilling** — four components handling data they do not care about, just to shuttle it to the one that does. It makes components harder to refactor (removing a layer breaks the chain), harder to read (every component has props it does not use), and harder to maintain.

Context eliminates this entirely. The layout sets context, and Avatar reads it directly. The components in between know nothing about it.

## setContext and getContext

The basic Context API has two functions: `setContext` to provide a value from a parent and `getContext` to consume it from any descendant.

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script>
  import { setContext } from 'svelte';

  const user = {
    name: 'Alice',
    role: 'admin'
  };

  setContext('user', user);
</script>

<slot />
```

```svelte
<!-- src/routes/dashboard/profile/Avatar.svelte -->
<script>
  import { getContext } from 'svelte';

  const user = getContext('user');
</script>

<img src="/avatars/{user.name}.png" alt="{user.name}'s avatar" />
```

Any component rendered inside the dashboard layout can call `getContext('user')` and get the same object — regardless of how deeply nested it is. Components outside the dashboard layout get `undefined` (or throw if you are using the typed pattern shown below).

## Typed Context with Symbol Keys

Using string keys is fragile. A typo like `getContext('usr')` silently returns `undefined`, and you will not find the bug until runtime. Two unrelated libraries might also pick the same string key, causing a collision.

The professional pattern uses a shared helper module with `Symbol` keys and TypeScript types:

```typescript
// src/lib/context/user.ts
import { setContext, getContext } from 'svelte';

interface UserContext {
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

const USER_KEY = Symbol('user');

export function setUserContext(user: UserContext) {
  setContext(USER_KEY, user);
}

export function getUserContext(): UserContext {
  return getContext<UserContext>(USER_KEY);
}
```

```svelte
<!-- Parent: set context -->
<script>
  import { setUserContext } from '$lib/context/user';
  setUserContext({ name: 'Alice', email: 'alice@example.com', role: 'admin' });
</script>

<!-- Descendant: read context -->
<script>
  import { getUserContext } from '$lib/context/user';
  const user = getUserContext(); // Fully typed: UserContext
</script>

<p>{user.name} ({user.role})</p>
```

This gives you three benefits:
1. **Type safety** — TypeScript knows the exact shape of the context value
2. **No collisions** — `Symbol` creates a globally unique key
3. **Single source of truth** — the interface lives in one file, not scattered across components

## createContext: The Modern API

Svelte also provides `createContext()` as a more ergonomic alternative. It returns a `[get, set]` pair and handles the Symbol key internally:

```typescript
// src/lib/context/user.ts
import { createContext } from 'svelte';

interface UserContext {
  name: string;
  role: 'admin' | 'editor' | 'viewer';
}

export const [getUserContext, setUserContext] = createContext<UserContext>();
```

```svelte
<!-- Parent -->
<script>
  import { setUserContext } from '$lib/context/user';
  setUserContext({ name: 'Alice', role: 'admin' });
</script>

<!-- Descendant -->
<script>
  import { getUserContext } from '$lib/context/user';
  const user = getUserContext(); // Typed, no key needed
</script>
```

`createContext()` is the preferred API for new code. It is less boilerplate, eliminates the key management entirely, and is harder to misuse. The manual `setContext`/`getContext` pattern remains fully supported and is useful when you need explicit control over the key.

## Reactive Context

Context values are set once during component initialization. If you set a primitive value like a string, it will not update when the source changes. To make context **reactive**, you need to pass an object that contains reactive state:

```svelte
<!-- ThemeProvider.svelte -->
<script>
  import { setContext } from 'svelte';

  let mode = $state<'light' | 'dark'>('light');

  setContext('theme', {
    get current() { return mode; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; }
  });
</script>

<div class="theme-{mode}">
  {@render children()}
</div>
```

```svelte
<!-- Any descendant component -->
<script>
  import { getContext } from 'svelte';

  const theme = getContext<{ current: 'light' | 'dark'; toggle: () => void }>('theme');
</script>

<p>Current theme: {theme.current}</p>
<button onclick={theme.toggle}>
  Switch to {theme.current === 'light' ? 'dark' : 'light'}
</button>
```

The critical detail: `current` is a **getter** that reads the `$state` variable `mode`. Each time a component accesses `theme.current`, it triggers a reactive read. When `mode` changes, every component reading `theme.current` updates.

If you had written `{ current: mode }` instead of `get current() { return mode }`, the object would capture the value of `mode` at the time of creation and never update. This is the most common mistake with reactive context.

```typescript
// BROKEN — captures the value at creation time
setContext('theme', { current: mode }); // mode is 'light' forever

// WORKS — getter reads the live $state value each time
setContext('theme', { get current() { return mode; } });
```

## The Timing Constraint

Context must be set and read during **component initialization** — the synchronous execution of the `<script>` block when the component is first created. You cannot set or read context inside event handlers, `$effect` callbacks, or `setTimeout`:

```svelte
<script>
  import { setContext, getContext } from 'svelte';

  // WORKS — runs during component initialization
  setContext('key', 'value');
  const val = getContext('key');

  // BROKEN — runs after initialization
  function handleClick() {
    setContext('key', 'new value'); // Error: can only be called during init
  }

  $effect(() => {
    const val = getContext('key'); // Error: can only be called during init
  });
</script>
```

This constraint exists because context is tied to the component tree structure. When a component initializes, Svelte knows its parent chain and can walk up the tree to find the nearest provider. After initialization, the call stack no longer contains that tree information.

To update context after initialization, make the context value reactive (using the getter pattern above) and mutate the underlying state — not the context binding itself.

## Real Example: Theme Context

Here is a complete, production-quality theme context implementation:

```typescript
// src/lib/context/theme.ts
import { createContext } from 'svelte';

interface ThemeContext {
  readonly current: 'light' | 'dark';
  readonly isDark: boolean;
  toggle: () => void;
  set: (mode: 'light' | 'dark') => void;
}

export const [getTheme, setThemeContext] = createContext<ThemeContext>();
```

```svelte
<!-- src/lib/components/ThemeProvider.svelte -->
<script>
  import { setThemeContext } from '$lib/context/theme';

  let mode = $state<'light' | 'dark'>('light');

  setThemeContext({
    get current() { return mode; },
    get isDark() { return mode === 'dark'; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; },
    set(newMode) { mode = newMode; }
  });
</script>

<div class="theme" data-theme={mode}>
  {@render children()}
</div>
```

```svelte
<!-- Any component inside the ThemeProvider -->
<script>
  import { getTheme } from '$lib/context/theme';
  const theme = getTheme();
</script>

<div class:dark={theme.isDark}>
  <p>The current theme is {theme.current}.</p>
  <button onclick={theme.toggle}>Toggle theme</button>
</div>
```

Notice how the `ThemeProvider` wraps a section of the app. You could have different theme providers for different sections, each with its own state. This is impossible with global state — module-level state is one-per-app. Context is one-per-provider-instance.

## Context vs Props vs Global State: The Decision Framework

Choosing the right tool for shared state is an architectural decision. Here is how to think about it:

| | Props | Context | Global State |
|---|---|---|---|
| **Scope** | Parent to direct child | Parent to any descendant | Anywhere in the app |
| **Visibility** | Explicit — you see it in the template | Implicit — hidden from intermediate components | Implicit — any import can access it |
| **Refactoring** | Adding a layer requires threading the prop | Adding a layer has no impact | No impact |
| **SSR safety** | Completely safe | Safe (per-component-tree) | Dangerous (shared across requests) |
| **Multiple instances** | Natural — each component has its own props | Natural — each provider has its own context | Impossible without extra work |
| **Best for** | 1-2 levels of nesting | Subtree-scoped shared state | Truly app-wide state |

**Use props** when the data flows 1-2 levels down and both components are closely related. Props are the most explicit and easiest to trace.

**Use context** when data needs to skip levels, when you want subtree scoping (not app-wide), or when you need multiple independent instances (e.g., two dashboard panels with different date ranges).

**Use global state** when the data is truly app-wide with a single value (theme, auth status, shopping cart) and you need access from components that share no common parent.

Ask yourself: "Could there ever be two independent instances of this state on the same page?" If yes, context is the right tool. If no, global state might be fine.

## Common Mistakes

**Trying to set context in event handlers:**
Context must be set during initialization. If you need to update shared data in response to user actions, make the context value an object with reactive state and methods (the getter pattern).

**Forgetting to make context reactive:**
Setting `setContext('count', count)` where `count` is a `$state` variable passes the *current value*, not a reactive binding. Use a getter: `setContext('count', { get value() { return count; } })`.

**Using context when global state would be simpler:**
If every component in the entire app needs the data (like a shopping cart), context forces you to wrap everything in a provider. Global state is simpler — just import and use.

**Trying to read context from a non-descendant:**
Context flows downward only. A sibling component of the provider cannot read its context. If you need sibling communication, either lift the context higher or use global state.

## Try It

1. Create a typed context for a notification system. Define a `NotificationContext` interface with `add(message: string, type: 'info' | 'error' | 'success')`, `dismiss(id: string)`, and a `readonly notifications` array. Use `createContext()` for type-safe access. Build a `NotificationProvider` component and a `NotificationList` component that displays the notifications.

2. Build a multi-step form wizard with context. The parent `Wizard` component sets context with `{ currentStep, totalSteps, formData, next(), back(), setField(key, value) }`. Each step component reads the context to access shared form data without prop drilling.

3. Refactor challenge: you have a global auth state module (`auth.svelte.ts`). Your app now needs to support "impersonation" — an admin views the app as another user. Two browser tabs should show different impersonated users. Can global state handle this? How would you restructure it using context?

## Key Takeaways

- Context solves prop drilling — data passes from a parent to any descendant without intermediate components knowing about it
- `setContext(key, value)` provides data; `getContext(key)` consumes it from any descendant
- Use `Symbol` keys and typed helper functions for type safety and collision prevention
- `createContext()` is the modern API — it returns a `[get, set]` pair and handles keys automatically
- Make context reactive by passing objects with `$state`-backed getters, not raw values
- Context must be set and read during component initialization — not in event handlers or effects
- Context is scoped to a component subtree; global state is app-wide — choose based on the scope you need
- If you might need multiple independent instances of the same state, context is the right tool
