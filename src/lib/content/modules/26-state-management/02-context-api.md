# Context API

Global state is powerful, but sometimes you need something in between. What if a section of your component tree needs shared state, but you do not want it accessible from everywhere? That is exactly what Svelte's **Context API** is for.

Context lets a parent component provide data that any descendant can access — without passing props through every level. Think of it like a family announcement: the parent says "here is the family name" and every child, grandchild, and great-grandchild can hear it without anyone repeating it down the line.

## setContext and getContext

The Context API has two functions: `setContext` to provide a value and `getContext` to consume it.

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
<!-- src/routes/dashboard/settings/+page.svelte -->
<script>
  import { getContext } from 'svelte';

  const user = getContext('user');
</script>

<h1>Settings for {user.name}</h1>
<p>Role: {user.role}</p>
```

Any component rendered inside the dashboard layout can call `getContext('user')` and get the same object.

## Typed Context

Using string keys is fragile. A typo in the key silently returns `undefined`. Use a shared helper module to get type safety:

```typescript
// src/lib/context/user.ts
import { setContext, getContext } from 'svelte';

interface UserContext {
  name: string;
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
<!-- Parent -->
<script>
  import { setUserContext } from '$lib/context/user';
  setUserContext({ name: 'Alice', role: 'admin' });
</script>

<!-- Child -->
<script>
  import { getUserContext } from '$lib/context/user';
  const user = getUserContext(); // Fully typed!
</script>
```

Using `Symbol` as the key guarantees no accidental collisions, and TypeScript knows exactly what type the context value is.

## Reactive Context

Context values are set once during component initialization. To make context reactive, provide a reactive object:

```svelte
<script>
  import { setContext } from 'svelte';

  let theme = $state('light');

  setContext('theme', {
    get current() { return theme; },
    toggle() { theme = theme === 'light' ? 'dark' : 'light'; }
  });
</script>
```

Descendants that read `getContext('theme').current` will reactively update when the value changes.

## Context vs Props vs Global State

| | Props | Context | Global State |
|---|---|---|---|
| Scope | Parent to child | Parent to any descendant | Anywhere |
| Explicit | Very explicit | Implicit | Implicit |
| Best for | Direct children | Component subtrees | App-wide data |
| SSR safe | Yes | Yes | Requires care |

Context is the right choice when a layout, page, or complex component needs to share data with deeply nested children without prop drilling, but the data should not leak to unrelated parts of the app.

## Try It

Create a typed context for a "notification" system. The parent layout should provide methods to `add` and `dismiss` notifications, and a nested `NotificationList` component should read and display them. Use `Symbol` keys and TypeScript interfaces.

## Key Takeaways

- `setContext` provides a value from a parent; `getContext` reads it from any descendant
- Context avoids prop drilling through intermediate components
- Use `Symbol` keys and typed helper functions for type-safe, collision-free context
- Wrap reactive state (using `$state` and getters) in the context object to make it reactive
- Context is scoped to a component subtree, unlike global state which is app-wide
