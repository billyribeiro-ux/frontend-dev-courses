# Context API

Global state is powerful, but it is a blunt instrument. It gives every component in your entire application access to the same shared value — which is exactly right for things like authentication status or a shopping cart. But many shared state problems are not app-wide. A multi-step form wizard where child components need access to shared form data. A dashboard panel where nested widgets read a selected date range. A theme override that applies to one section of the page but not another. Two side-by-side preview panels, each with their own independent state.

For these problems, global state is the wrong scope. You need state that is shared within a *subtree* of your component tree — visible to descendants but invisible to everything outside.

This is exactly what Svelte's **Context API** solves. It lets a parent component provide data that any descendant can access — without passing props through every intermediate level. The data is scoped to that parent's subtree, which means you can have multiple independent instances of the same context (one per provider), and components outside the subtree never see it. This lesson covers the prop drilling problem, both the classic and modern Context APIs, reactive context with `$state` getters, timing constraints, multi-provider patterns, the decision framework for choosing between props, context, and global state, and a complete real-world implementation.

## The Problem: Prop Drilling Visualized

Imagine a layout that loads the current user and needs to pass it to a deeply nested avatar component:

```
+layout.svelte (has user data)
  └─ Sidebar.svelte (doesn't use user, but must accept and pass it)
      └─ Navigation.svelte (doesn't use user, but must accept and pass it)
          └─ UserMenu.svelte (doesn't use user, but must accept and pass it)
              └─ Avatar.svelte (finally uses user!)
```

Without context, every intermediate component must accept a `user` prop and forward it to its children. Here is what that actually looks like in code:

```svelte
<!-- Sidebar.svelte — does NOT use user, but must thread it through -->
<script lang="ts">
  import Navigation from './Navigation.svelte';
  import type { User } from '$lib/types';

  let { user }: { user: User } = $props();
</script>

<nav>
  <Navigation {user} />
</nav>
```

```svelte
<!-- Navigation.svelte — also does NOT use user -->
<script lang="ts">
  import UserMenu from './UserMenu.svelte';
  import type { User } from '$lib/types';

  let { user }: { user: User } = $props();
</script>

<ul>
  <li>Dashboard</li>
  <li>Settings</li>
  <li><UserMenu {user} /></li>
</ul>
```

```svelte
<!-- UserMenu.svelte — STILL does not use user -->
<script lang="ts">
  import Avatar from './Avatar.svelte';
  import type { User } from '$lib/types';

  let { user }: { user: User } = $props();
</script>

<div>
  <Avatar {user} />
  <button>Logout</button>
</div>
```

```svelte
<!-- Avatar.svelte — FINALLY uses user -->
<script lang="ts">
  import type { User } from '$lib/types';

  let { user }: { user: User } = $props();
</script>

<img src={user.avatarUrl} alt="{user.name}'s avatar" class="rounded-full w-8 h-8" />
```

This is **prop drilling** — four components handling data they do not care about, just to shuttle it to the one that does. The problems compound:

1. **Refactoring brittleness.** If you insert or remove a component layer, you must update every component in the chain. Remove `UserMenu` and now `Navigation` must pass directly to `Avatar` — but only if you remember to update it.
2. **Noise.** Every component's prop interface includes data it does not use. When you read `Navigation.svelte`, the `user` prop is misleading — it suggests Navigation cares about the user.
3. **Scaling.** Once you drill one piece of data, you start drilling others. Soon every intermediate component has five props it does not use.

Context eliminates this entirely. The layout sets context once, Avatar reads it directly, and the components in between know nothing about it.

## setContext and getContext — The Classic API

The basic Context API has two functions: `setContext` to provide a value from a parent and `getContext` to consume it from any descendant.

```svelte
<!-- src/routes/dashboard/+layout.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let { data, children } = $props();

  // The user comes from the layout's load function
  setContext('user', data.user);
</script>

{@render children()}
```

```svelte
<!-- src/routes/dashboard/profile/Avatar.svelte -->
<script lang="ts">
  import { getContext } from 'svelte';

  const user = getContext('user');
</script>

<img src={user.avatarUrl} alt="{user.name}'s avatar" class="rounded-full w-8 h-8" />
```

Any component rendered inside the dashboard layout can call `getContext('user')` and get the same object — regardless of how deeply nested it is. Components outside the dashboard layout get `undefined` (or throw if you use the typed pattern shown below).

### How Context Works Under the Hood

When a component calls `setContext(key, value)`, Svelte attaches the value to that component's internal context map. When a descendant calls `getContext(key)`, Svelte walks up the component tree from the calling component until it finds an ancestor that has set a value for that key. It returns the first match.

This walk-up behavior means context is **inherited**: if a grandchild calls `getContext('theme')`, and neither the child nor the grandchild has set a 'theme' context, Svelte walks up to the grandparent and finds it there. The lookup is deterministic — closer ancestors shadow further ones.

This is also why you can override context at any level: if a parent sets `setContext('theme', darkTheme)` and a middle component sets `setContext('theme', lightTheme)`, descendants of the middle component see `lightTheme`, while other descendants of the parent still see `darkTheme`.

## Typed Context with Symbol Keys

Using string keys like `'user'` is fragile in production code. A typo like `getContext('usr')` silently returns `undefined`, and you will not find the bug until runtime. Two unrelated libraries might also pick the same string key, causing a collision.

The professional pattern uses a shared helper module with `Symbol` keys and TypeScript types:

```typescript
// src/lib/context/user.ts
import { setContext, getContext } from 'svelte';

interface UserContext {
  name: string;
  email: string;
  avatarUrl: string;
  role: 'admin' | 'editor' | 'viewer';
}

const USER_KEY = Symbol('user-context');

export function setUserContext(user: UserContext) {
  setContext(USER_KEY, user);
}

export function getUserContext(): UserContext {
  const ctx = getContext<UserContext>(USER_KEY);
  if (!ctx) {
    throw new Error(
      'getUserContext() was called in a component that is not ' +
      'a descendant of a UserContext provider'
    );
  }
  return ctx;
}
```

```svelte
<!-- Provider: set context in a layout or wrapper -->
<script lang="ts">
  import { setUserContext } from '$lib/context/user';

  let { data, children } = $props();

  setUserContext({
    name: data.user.name,
    email: data.user.email,
    avatarUrl: data.user.avatarUrl,
    role: data.user.role
  });
</script>

{@render children()}
```

```svelte
<!-- Consumer: read context from any descendant -->
<script lang="ts">
  import { getUserContext } from '$lib/context/user';

  const user = getUserContext(); // Fully typed: UserContext
</script>

<p>{user.name} ({user.role})</p>
<img src={user.avatarUrl} alt="{user.name}'s avatar" />
```

This gives you three benefits:
1. **Type safety** — TypeScript knows the exact shape of the context value. Autocompletion works, and accessing `user.nam` instead of `user.name` is a compile-time error.
2. **No collisions** — `Symbol('user-context')` creates a globally unique key. Two libraries that both want a "user" context will not interfere with each other.
3. **Error boundaries** — the explicit throw in `getUserContext()` tells you immediately when a component is used outside its expected provider. Without it, you get a cryptic `Cannot read property 'name' of undefined` at render time.

## createContext: The Modern Svelte 5 API

Svelte also provides `createContext()` as a more ergonomic alternative. It returns a `[get, set]` pair and handles the Symbol key internally:

```typescript
// src/lib/context/user.ts
import { createContext } from 'svelte';

interface UserContext {
  name: string;
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export const [getUserContext, setUserContext] = createContext<UserContext>();
```

That is the entire file. No Symbol declaration, no manual key management, no boilerplate getter function. The returned `getUserContext` throws automatically if called outside a provider.

```svelte
<!-- Provider -->
<script lang="ts">
  import { setUserContext } from '$lib/context/user';

  let { data, children } = $props();

  setUserContext({
    name: data.user.name,
    email: data.user.email,
    role: data.user.role
  });
</script>

{@render children()}
```

```svelte
<!-- Consumer -->
<script lang="ts">
  import { getUserContext } from '$lib/context/user';

  const user = getUserContext(); // Typed, throws if no provider
</script>

<p>Welcome, {user.name}</p>
```

`createContext()` is the preferred API for new code. It produces less boilerplate, eliminates key management, and is harder to misuse. The manual `setContext`/`getContext` pattern remains fully supported and is useful when you need explicit control over the key (e.g., dynamic keys based on runtime values).

### createContext with a Default Value

You can provide a default value that is returned when no provider is found:

```typescript
import { createContext } from 'svelte';

interface ThemeContext {
  mode: 'light' | 'dark';
}

// If no provider is found, returns { mode: 'light' } instead of throwing
export const [getTheme, setTheme] = createContext<ThemeContext>({
  mode: 'light'
});
```

Use defaults sparingly. In most cases, you *want* a missing provider to throw — it indicates a structural bug. Defaults are appropriate for optional contexts where the consumer has a reasonable standalone behavior.

## Reactive Context — The Most Important Pattern

Context values are set once during component initialization. If you set a primitive value like a string, it captures the value at that moment and never updates:

```svelte
<!-- BROKEN: This does NOT update when count changes -->
<script lang="ts">
  import { setContext } from 'svelte';

  let count = $state(0);

  // Captures count=0 forever
  setContext('counter', count);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

The `count` value is read once when `setContext` executes and baked into the context as the number `0`. Even though `count` is a `$state` variable, the context consumer never sees updates because it has a plain number, not a reactive binding.

To make context **reactive**, you need to pass an object that contains reactive state accessed through getters:

```svelte
<!-- ThemeProvider.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  let mode = $state<'light' | 'dark'>('light');

  // Object with getter — reads the live $state value on each access
  setContext('theme', {
    get current() { return mode; },
    get isDark() { return mode === 'dark'; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; },
    set(newMode: 'light' | 'dark') { mode = newMode; }
  });
</script>

<div class="theme-{mode}">
  {@render children()}
</div>
```

```svelte
<!-- Any descendant component -->
<script lang="ts">
  import { getContext } from 'svelte';

  interface ThemeContext {
    current: 'light' | 'dark';
    isDark: boolean;
    toggle: () => void;
    set: (mode: 'light' | 'dark') => void;
  }

  const theme = getContext<ThemeContext>('theme');
</script>

<p>Current theme: {theme.current}</p>
<button onclick={theme.toggle}>
  Switch to {theme.current === 'light' ? 'dark' : 'light'}
</button>
```

The critical detail: `current` is a **getter** that reads the `$state` variable `mode`. Each time a component accesses `theme.current`, it establishes a reactive dependency. When `mode` changes (via `toggle()` or `set()`), every component reading `theme.current` re-renders.

If you had written `{ current: mode }` instead of `get current() { return mode }`, the object would capture the value of `mode` at creation time and never update. This is the single most common mistake with reactive context.

```typescript
// BROKEN — captures the VALUE at creation time. mode is evaluated once.
setContext('theme', { current: mode }); // mode is 'light' forever

// WORKS — getter reads the live $state variable on every access
setContext('theme', { get current() { return mode; } });
```

### Reactive Context with createContext

The same pattern works with the modern API:

```typescript
// src/lib/context/counter.ts
import { createContext } from 'svelte';

interface CounterContext {
  readonly count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

export const [getCounter, setCounter] = createContext<CounterContext>();
```

```svelte
<!-- CounterProvider.svelte -->
<script lang="ts">
  import { setCounter } from '$lib/context/counter';
  import type { Snippet } from 'svelte';

  let { initial = 0, children }: { initial?: number; children: Snippet } = $props();

  let count = $state(initial);

  setCounter({
    get count() { return count; },
    increment() { count++; },
    decrement() { count--; },
    reset() { count = initial; }
  });
</script>

{@render children()}
```

```svelte
<!-- Any descendant -->
<script lang="ts">
  import { getCounter } from '$lib/context/counter';

  const counter = getCounter();
</script>

<p>Count: {counter.count}</p>
<button onclick={counter.increment}>+</button>
<button onclick={counter.decrement}>-</button>
<button onclick={counter.reset}>Reset</button>
```

### Complex Reactive Context with $state Objects

For context with multiple pieces of reactive state, you can use a `$state` object and expose it directly, since property access on `$state` objects is already reactive:

```typescript
// src/lib/context/dashboard.ts
import { createContext } from 'svelte';

interface DashboardFilters {
  dateRange: { start: Date; end: Date };
  selectedTeam: string | null;
  searchQuery: string;
}

interface DashboardContext {
  readonly filters: DashboardFilters;
  setDateRange: (start: Date, end: Date) => void;
  setTeam: (teamId: string | null) => void;
  setSearch: (query: string) => void;
  resetFilters: () => void;
}

export const [getDashboard, setDashboard] = createContext<DashboardContext>();
```

```svelte
<!-- DashboardProvider.svelte -->
<script lang="ts">
  import { setDashboard } from '$lib/context/dashboard';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  const defaultFilters = () => ({
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      end: new Date()
    },
    selectedTeam: null as string | null,
    searchQuery: ''
  });

  let filters = $state(defaultFilters());

  setDashboard({
    get filters() { return filters; },
    setDateRange(start, end) {
      filters.dateRange = { start, end };
    },
    setTeam(teamId) {
      filters.selectedTeam = teamId;
    },
    setSearch(query) {
      filters.searchQuery = query;
    },
    resetFilters() {
      filters = defaultFilters();
    }
  });
</script>

{@render children()}
```

## The Timing Constraint — Why It Exists

Context must be set and read during **component initialization** — the synchronous execution of the `<script>` block when the component is first created. You cannot set or read context inside event handlers, `$effect` callbacks, `setTimeout`, or any other asynchronous or deferred code:

```svelte
<script lang="ts">
  import { setContext, getContext } from 'svelte';

  // WORKS — runs during component initialization
  setContext('key', 'value');
  const val = getContext('key');

  // BROKEN — runs after initialization
  function handleClick() {
    setContext('key', 'new value'); // Error!
  }

  $effect(() => {
    const val = getContext('key'); // Error!
  });

  setTimeout(() => {
    setContext('delayed', 'value'); // Error!
  }, 0);
</script>
```

This constraint exists because context is tied to the component tree structure. When a component's `<script>` block runs, Svelte knows exactly where that component sits in the tree — it knows the parent, the parent's parent, and so on. After initialization, the call stack no longer carries that tree information. A `setTimeout` callback or an event handler runs outside the component initialization stack, so Svelte cannot determine which component is asking for context.

To update context values after initialization, make the context value reactive (using the getter pattern) and mutate the underlying `$state` — not the context binding itself. The context object never changes; its *contents* do.

```svelte
<script lang="ts">
  import { setContext } from 'svelte';

  let count = $state(0);

  // Set once during init — this never changes
  setContext('counter', {
    get value() { return count; },
    increment() { count++; }  // Mutates the $state, not the context
  });
</script>

<!-- This works because increment mutates $state, not context -->
<button onclick={() => count++}>Works: {count}</button>
```

## Context + Component Composition

Context shines when combined with Svelte's component composition patterns. You can build compound components where a parent establishes context and children consume it:

```typescript
// src/lib/context/tabs.ts
import { createContext } from 'svelte';

interface TabsContext {
  readonly activeTab: string;
  setActive: (id: string) => void;
  register: (id: string) => void;
}

export const [getTabs, setTabs] = createContext<TabsContext>();
```

```svelte
<!-- Tabs.svelte -->
<script lang="ts">
  import { setTabs } from '$lib/context/tabs';
  import type { Snippet } from 'svelte';

  let { defaultTab, children }: { defaultTab: string; children: Snippet } = $props();

  let activeTab = $state(defaultTab);
  const registeredTabs = new Set<string>();

  setTabs({
    get activeTab() { return activeTab; },
    setActive(id) { activeTab = id; },
    register(id) { registeredTabs.add(id); }
  });
</script>

<div class="tabs">
  {@render children()}
</div>
```

```svelte
<!-- Tab.svelte -->
<script lang="ts">
  import { getTabs } from '$lib/context/tabs';
  import type { Snippet } from 'svelte';

  let { id, children }: { id: string; children: Snippet } = $props();

  const tabs = getTabs();
  tabs.register(id);
</script>

<button
  class="tab"
  class:active={tabs.activeTab === id}
  onclick={() => tabs.setActive(id)}
>
  {@render children()}
</button>
```

```svelte
<!-- TabPanel.svelte -->
<script lang="ts">
  import { getTabs } from '$lib/context/tabs';
  import type { Snippet } from 'svelte';

  let { id, children }: { id: string; children: Snippet } = $props();

  const tabs = getTabs();
</script>

{#if tabs.activeTab === id}
  <div class="tab-panel" role="tabpanel">
    {@render children()}
  </div>
{/if}
```

Usage:

```svelte
<Tabs defaultTab="overview">
  <div class="tab-list">
    <Tab id="overview">Overview</Tab>
    <Tab id="analytics">Analytics</Tab>
    <Tab id="settings">Settings</Tab>
  </div>

  <TabPanel id="overview">Dashboard overview content...</TabPanel>
  <TabPanel id="analytics">Analytics charts...</TabPanel>
  <TabPanel id="settings">Settings form...</TabPanel>
</Tabs>
```

The `Tabs`, `Tab`, and `TabPanel` components communicate through context. You never pass a `selectedTab` prop manually — the context handles all coordination. You can even nest a second `<Tabs>` instance inside a panel, and each one gets its own independent context.

## Multi-Provider Patterns

One of context's most powerful features — and the reason it exists as a separate concept from global state — is that you can have multiple independent instances of the same context:

```svelte
<!-- Two independent theme contexts on the same page -->
<div class="grid grid-cols-2 gap-4">
  <ThemeProvider initialMode="light">
    <PreviewPanel title="Light Theme Preview">
      <ThemedCard />  <!-- reads light theme context -->
    </PreviewPanel>
  </ThemeProvider>

  <ThemeProvider initialMode="dark">
    <PreviewPanel title="Dark Theme Preview">
      <ThemedCard />  <!-- reads dark theme context (independent!) -->
    </PreviewPanel>
  </ThemeProvider>
</div>
```

Each `ThemeProvider` creates its own context with its own `$state`. The `ThemedCard` inside the left provider reads `'light'`; the one inside the right provider reads `'dark'`. They are completely independent. This is *impossible* with global state — module-level `$state` is shared across the entire app.

### Context Overriding

A child provider overrides an ancestor's context for its subtree:

```svelte
<!-- App layout uses light theme -->
<ThemeProvider initialMode="light">
  <Header />          <!-- light theme -->
  <Sidebar />         <!-- light theme -->

  <!-- This section overrides to dark -->
  <ThemeProvider initialMode="dark">
    <CodeEditor />    <!-- dark theme (overridden) -->
    <Terminal />      <!-- dark theme (overridden) -->
  </ThemeProvider>

  <Footer />          <!-- light theme (not affected by inner provider) -->
</ThemeProvider>
```

The inner `ThemeProvider` shadows the outer one. Components inside it see `'dark'`; components outside it still see `'light'`. This is the same mechanism as lexical scoping in programming languages — inner scopes shadow outer ones.

## Complete System: Theme + Auth + Notification Context

Here is a production implementation of three interconnected contexts that form the backbone of a real application:

```typescript
// src/lib/context/auth.ts
import { createContext } from 'svelte';

interface AuthContext {
  readonly user: { id: string; name: string; email: string; role: string } | null;
  readonly isAuthenticated: boolean;
  readonly isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const [getAuth, setAuth] = createContext<AuthContext>();
```

```typescript
// src/lib/context/theme.ts
import { createContext } from 'svelte';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContext {
  readonly mode: ThemeMode;
  readonly resolved: 'light' | 'dark'; // after resolving 'system'
  readonly isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const [getTheme, setTheme] = createContext<ThemeContext>();
```

```typescript
// src/lib/context/notifications.ts
import { createContext } from 'svelte';

interface Notification {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
}

interface NotificationContext {
  readonly items: Notification[];
  add: (message: string, type?: Notification['type']) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const [getNotifications, setNotifications] = createContext<NotificationContext>();
```

The providers:

```svelte
<!-- src/lib/components/AuthProvider.svelte -->
<script lang="ts">
  import { setAuth } from '$lib/context/auth';
  import type { Snippet } from 'svelte';

  let { initialUser = null, children }: {
    initialUser?: { id: string; name: string; email: string; role: string } | null;
    children: Snippet;
  } = $props();

  let user = $state(initialUser);

  setAuth({
    get user() { return user; },
    get isAuthenticated() { return user !== null; },
    get isAdmin() { return user?.role === 'admin'; },
    async login(email, password) {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Login failed');
      user = await response.json();
    },
    async logout() {
      await fetch('/api/auth/logout', { method: 'POST' });
      user = null;
    }
  });
</script>

{@render children()}
```

```svelte
<!-- src/lib/components/NotificationProvider.svelte -->
<script lang="ts">
  import { setNotifications } from '$lib/context/notifications';
  import type { Snippet } from 'svelte';

  let { autoDismissMs = 5000, children }: {
    autoDismissMs?: number;
    children: Snippet;
  } = $props();

  let items = $state<Array<{
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    createdAt: number;
  }>>([]);

  setNotifications({
    get items() { return items; },
    add(message, type = 'info') {
      const id = crypto.randomUUID();
      items = [...items, { id, message, type, createdAt: Date.now() }];

      // Auto-dismiss after timeout
      if (autoDismissMs > 0) {
        setTimeout(() => {
          items = items.filter((n) => n.id !== id);
        }, autoDismissMs);
      }

      return id;
    },
    dismiss(id) {
      items = items.filter((n) => n.id !== id);
    },
    clear() {
      items = [];
    }
  });
</script>

{@render children()}
```

```svelte
<!-- src/lib/components/ThemeProvider.svelte -->
<script lang="ts">
  import { setTheme } from '$lib/context/theme';
  import type { Snippet } from 'svelte';

  type ThemeMode = 'light' | 'dark' | 'system';

  let { initialMode = 'system', children }: {
    initialMode?: ThemeMode;
    children: Snippet;
  } = $props();

  let mode = $state<ThemeMode>(initialMode);
  let systemPreference = $state<'light' | 'dark'>('light');

  // Listen for OS preference changes
  $effect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    systemPreference = media.matches ? 'dark' : 'light';

    function handler(e: MediaQueryListEvent) {
      systemPreference = e.matches ? 'dark' : 'light';
    }
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  });

  setTheme({
    get mode() { return mode; },
    get resolved() {
      return mode === 'system' ? systemPreference : mode;
    },
    get isDark() {
      return (mode === 'system' ? systemPreference : mode) === 'dark';
    },
    setMode(newMode) {
      mode = newMode;
      // Persist preference
      localStorage.setItem('theme-mode', newMode);
    },
    toggle() {
      const current = mode === 'system' ? systemPreference : mode;
      mode = current === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme-mode', mode);
    }
  });
</script>

<div class:dark={mode === 'system' ? systemPreference === 'dark' : mode === 'dark'}>
  {@render children()}
</div>
```

Composing all three in the root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import AuthProvider from '$lib/components/AuthProvider.svelte';
  import ThemeProvider from '$lib/components/ThemeProvider.svelte';
  import NotificationProvider from '$lib/components/NotificationProvider.svelte';
  import NotificationList from '$lib/components/NotificationList.svelte';

  let { data, children } = $props();
</script>

<AuthProvider initialUser={data.user}>
  <ThemeProvider>
    <NotificationProvider>
      {@render children()}
      <NotificationList />
    </NotificationProvider>
  </ThemeProvider>
</AuthProvider>
```

Any component in the app can now:

```svelte
<script lang="ts">
  import { getAuth } from '$lib/context/auth';
  import { getTheme } from '$lib/context/theme';
  import { getNotifications } from '$lib/context/notifications';

  const auth = getAuth();
  const theme = getTheme();
  const notifications = getNotifications();
</script>

{#if auth.isAuthenticated}
  <p>Welcome, {auth.user.name}!</p>
  <button onclick={theme.toggle}>
    {theme.isDark ? 'Light' : 'Dark'} mode
  </button>
  <button onclick={() => notifications.add('Settings saved!', 'success')}>
    Save
  </button>
  <button onclick={() => auth.logout()}>Logout</button>
{/if}
```

The notification list component:

```svelte
<!-- src/lib/components/NotificationList.svelte -->
<script lang="ts">
  import { getNotifications } from '$lib/context/notifications';
  import { fly } from 'svelte/transition';

  const notifications = getNotifications();

  const typeStyles: Record<string, string> = {
    info:    'bg-blue-50 text-blue-800 border-blue-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    error:   'bg-red-50 text-red-800 border-red-200'
  };
</script>

{#if notifications.items.length > 0}
  <div class="fixed bottom-4 right-4 z-50 space-y-2 w-80">
    {#each notifications.items as notification (notification.id)}
      <div
        class="p-4 rounded-lg border shadow-lg {typeStyles[notification.type]}"
        transition:fly={{ x: 100, duration: 200 }}
      >
        <div class="flex items-start justify-between gap-2">
          <p class="text-sm font-medium">{notification.message}</p>
          <button
            onclick={() => notifications.dismiss(notification.id)}
            class="text-current opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      </div>
    {/each}
  </div>
{/if}
```

## Context vs Props vs Global State — The Decision Framework

Choosing the right tool for shared state is an architectural decision that affects maintainability, testability, and scalability. Here is how to think about it:

| | Props | Context | Global State (`$state` in `.svelte.ts`) |
|---|---|---|---|
| **Scope** | Parent to direct child | Parent to any descendant | Anywhere in the app |
| **Visibility** | Explicit — visible in template | Implicit — hidden from intermediates | Implicit — any import can access |
| **Refactoring** | Adding a layer requires threading | Adding a layer has no impact | No impact |
| **SSR safety** | Completely safe | Safe (per-component-tree) | Dangerous (shared across requests!) |
| **Multiple instances** | Natural per-component | Natural per-provider | Requires manual plumbing |
| **Testability** | Easy to mock via props | Requires wrapping in provider | Requires module mocking |
| **Best for** | 1-2 levels of nesting | Subtree-scoped shared state | Truly app-wide singletons |

### The SSR Problem with Global State

This deserves special emphasis. On the server, a global `$state` variable in a `.svelte.ts` module is shared across **all concurrent requests**. If user A's request sets `globalUser = alice` and user B's request sets `globalUser = bob` before user A's rendering finishes, user A might see Bob's data. This is a security vulnerability.

Context is safe because each component tree is independent — each request creates its own tree with its own context values. This is why authentication state, user preferences, and any per-user data should use context (or load functions), not global module state, in SSR applications.

### The Decision Flowchart

Ask yourself these questions in order:

1. **Does the data flow only 1-2 levels?** Use props. They are explicit and easy to trace.
2. **Could there ever be two independent instances of this state on the same page?** If yes, context is the right tool. (Example: two dashboard panels with different date ranges.)
3. **Does the data need to be accessed by components that share no common ancestor?** If yes, global state — but be careful with SSR.
4. **Is this truly app-wide with a single value?** (Shopping cart, auth status if no impersonation.) Global state is fine for client-only apps; use context in SSR apps.

## Common Mistakes

### Setting context in event handlers

Context must be set during initialization. If you need to update shared data in response to user actions, make the context value an object with reactive state and methods (the getter pattern). The context object is set once; its contents change reactively.

### Forgetting to make context reactive

Setting `setContext('count', count)` where `count` is a `$state` variable passes the *current value*, not a reactive binding. The consumer gets a plain number that never updates. Always use getters for reactive values: `setContext('count', { get value() { return count; } })`.

### Using context when global state would be simpler

If every component in the entire app needs the data (like a shopping cart in a client-only SPA), context forces you to wrap everything in a provider at the root. Global state is simpler for that case — just import and use. But remember the SSR caveat.

### Trying to read context from a non-descendant

Context flows downward only. A sibling component of the provider cannot read its context. If you need sibling communication, either lift the context higher or use global state.

### Passing `$derived` values directly into context

```svelte
<!-- BROKEN: $derived creates a new value, not a reactive binding -->
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  setContext('math', { doubled }); // Captures value, not reactive
</script>

<!-- CORRECT: Use a getter instead -->
<script lang="ts">
  let count = $state(0);

  setContext('math', {
    get doubled() { return count * 2; }
  });
</script>
```

## Try It

1. **Notification system**: Create a typed context for notifications using `createContext()`. Define a `NotificationContext` interface with `add(message: string, type: 'info' | 'error' | 'success')`, `dismiss(id: string)`, and a `readonly items` array. Build a `NotificationProvider` component that auto-dismisses notifications after 5 seconds. Build a `NotificationList` component that displays them with Svelte transitions.

2. **Multi-step form wizard**: Build a `Wizard` component that provides context with `{ currentStep: number, totalSteps: number, formData: Record<string, any>, next(): void, back(): void, setField(key: string, value: any): void }`. Each step component reads the context to access shared form data. Add validation: `next()` should only advance if the current step's required fields are filled.

3. **Context vs global state**: You have a global auth state module (`auth.svelte.ts`). Your app now needs to support "impersonation" — an admin can view the app as another user. Two browser tabs should show different impersonated users simultaneously. Can global state handle this? Restructure the auth system using context so each tab (or each preview panel in a single page) can impersonate a different user independently.

4. **Nested context override**: Build a `PermissionProvider` that takes a `role` prop. Components inside it can call `getPermission()` to check if the user has a given permission. Then nest two `PermissionProvider`s — an outer one with `role="viewer"` and an inner one with `role="admin"`. Verify that components inside the inner provider see admin permissions while components outside it see viewer permissions.

## Key Takeaways

- Context solves prop drilling — data passes from a parent to any descendant without intermediate components knowing about it
- `setContext(key, value)` provides data; `getContext(key)` consumes it from any descendant via a walk-up lookup
- Use `Symbol` keys and typed helper functions for type safety and collision prevention in production code
- `createContext()` is the modern Svelte 5 API — it returns a `[get, set]` pair and handles keys automatically
- Make context reactive by passing objects with `$state`-backed **getters**, not raw values — raw values capture a snapshot, getters read live state
- Context must be set and read during component initialization — not in event handlers, effects, or async callbacks
- Context is scoped to a component subtree; global state is app-wide — choose based on the scope you need
- Multiple providers create independent instances automatically — this is context's killer feature over global state
- Context is SSR-safe (each component tree gets its own values); global state is shared across requests and can leak data between users
- Use the decision flowchart: props for 1-2 levels, context for subtree-scoped state, global state for true singletons in client-only apps
