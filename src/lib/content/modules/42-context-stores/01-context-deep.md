# Context API Deep Dive

You have already seen how `setContext` and `getContext` pass data down the component tree without prop drilling. Now it is time to explore the full Context API -- typed keys, optional context checks, reactive context objects, and exactly when context is the right tool compared to props and shared state. We will build a complete Tabs component system from scratch to show every pattern in action.

Context is scoped to a component tree. A value set in a parent is available to every descendant in that branch, but invisible to components outside it. This tree-scoping is what makes context fundamentally different from global state in a `.svelte.ts` file. Two instances of the same component can provide different context values to their respective subtrees without interfering with each other.

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

Both functions must be called during component initialization -- inside the top-level `<script>` block, not inside event handlers or `$effect` callbacks. This is because Svelte needs to know the component's position in the tree to look up the correct context.

If you call `getContext` with a key that no ancestor has set, it returns `undefined`. This is a silent failure that can cause confusing runtime errors later. Typed wrappers (covered below) solve this problem.

### Context Is Set Once Per Component Instance

A common misconception: `setContext` does not "broadcast" a value. It simply stores a key-value pair on the current component instance. When a descendant calls `getContext`, Svelte walks up the component tree until it finds the nearest ancestor that set a context with that key.

This means:

1. Multiple ancestors can set the same key. The nearest one wins.
2. Context is established once, during initialization. You cannot call `setContext` again later to "update" the value. (But you can make the value itself reactive -- more on this below.)
3. Siblings never share context. Two components at the same level in the tree have completely independent context.

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

Symbols are globally unique, so collisions are impossible even across third-party libraries. The typed wrapper functions ensure you always get the correct type back, and if you misuse them, TypeScript catches the error at compile time rather than at runtime.

### The Full Pattern for Typed Context

In production, the typed context pattern includes a default value and an optional flag:

```typescript
// src/lib/context/auth.ts
import { setContext, getContext, hasContext } from 'svelte';

interface AuthContext {
  user: { id: string; name: string; email: string } | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AUTH_KEY = Symbol('auth');

export function setAuthContext(auth: AuthContext) {
  setContext(AUTH_KEY, auth);
}

export function getAuthContext(): AuthContext {
  const ctx = getContext<AuthContext>(AUTH_KEY);
  if (!ctx) {
    throw new Error(
      'getAuthContext() was called outside of a component that provides AuthContext. ' +
      'Wrap your component tree with a provider that calls setAuthContext().'
    );
  }
  return ctx;
}

export function getAuthContextOptional(): AuthContext | null {
  return hasContext(AUTH_KEY) ? getContext<AuthContext>(AUTH_KEY) : null;
}
```

The `getAuthContext()` function throws an informative error if context is missing, rather than returning `undefined` and crashing later with a confusing "Cannot read property of undefined" message. The `getAuthContextOptional()` variant is for components that want to adapt their behavior based on whether auth context exists.

## createContext -- The Modern Approach

Svelte 5 introduced `createContext()` as the preferred way to create typed, scoped context. Instead of manually defining Symbol keys and writing `get`/`set` wrapper functions yourself, `createContext` does it all in one call:

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

Compare this with the manual Symbol approach -- the Symbol key, the `setContext`/`getContext` wrappers, and the explicit type annotations are all gone. `createContext` handles the unique key internally, making collisions impossible without any effort on your part.

Usage in components is identical:

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

  const theme = getThemeContext(); // Fully typed -- ThemeConfig is inferred
</script>

<div class="accent" style:color={theme.accentColor}>
  Current font size: {theme.fontSize}
</div>
```

### createContext with a Default Value

`createContext` optionally accepts a default value. When provided, `getContext` returns the default instead of `undefined` if no ancestor has set the context. This is useful for components that should work standalone:

```typescript
// src/lib/context/theme.ts
import { createContext } from 'svelte';

interface ThemeConfig {
  mode: 'light' | 'dark';
  accentColor: string;
}

const [getThemeContext, setThemeContext] = createContext<ThemeConfig>({
  mode: 'light',
  accentColor: '#3b82f6'
});

export { getThemeContext, setThemeContext };
```

Now `getThemeContext()` always returns a valid `ThemeConfig`, even if no ancestor called `setThemeContext()`. This is the pattern to use when a component should have sensible defaults but allow overrides via a provider.

### When to Use createContext vs Manual Symbols

| Pattern | Use When |
|---------|----------|
| `createContext()` | New code, simple get/set context needs |
| Manual Symbol + wrappers | You need multiple getters (required vs optional), or custom error messages |
| String keys | Simple prototyping only; never in production |

The `setContext` and `getContext` functions are not deprecated and still work exactly as before. `createContext` is a convenience wrapper that reduces boilerplate for the common case.

## hasContext and getAllContexts

`hasContext(key)` checks whether a context value exists without throwing. This is useful for optional dependencies -- components that adapt their behavior based on whether a parent has provided context:

```svelte
<script lang="ts">
  import { hasContext, getContext } from 'svelte';

  const THEME_KEY = Symbol('theme');

  // Component works with or without a theme provider
  const hasTheme = hasContext(THEME_KEY);
  const theme = hasTheme
    ? getContext<{ mode: string }>(THEME_KEY)
    : { mode: 'light' };
</script>

<p>Using {theme.mode} mode{hasTheme ? '' : ' (default)'}</p>
```

A real-world use case: a `<Button>` component that reads accent color from context when used inside a `<ThemeProvider>`, but uses a default blue when used standalone.

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

The canonical use case is a portal component that renders content in a different part of the DOM (e.g., appended to `document.body`). Without `getAllContexts()`, the teleported content would lose access to all ancestor context. By capturing and re-providing it, the portal maintains the context chain.

### Debugging with getAllContexts

During development, `getAllContexts()` is useful for debugging context issues:

```svelte
<script lang="ts">
  import { getAllContexts } from 'svelte';

  const contexts = getAllContexts();
  console.log('Available contexts:', [...contexts.entries()]);
</script>
```

This shows you every context key and value available at this point in the tree. Useful when you are unsure why `getContext` returns `undefined` -- maybe the provider is in the wrong place, or you are using a different key than you think.

## Reactive Context

Context values are set once during initialization, so passing a plain value creates a static snapshot. If you pass a string or number, descendants receive a copy that never updates. To make context reactive, pass an object that uses `$state` internally with getter functions:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let mode = $state<'light' | 'dark'>('light');
  let accentColor = $state('#3b82f6');

  setContext('theme', {
    get mode() { return mode; },
    get accentColor() { return accentColor; },
    toggle() { mode = mode === 'light' ? 'dark' : 'light'; },
    setAccent(color: string) { accentColor = color; }
  });
</script>

{@render children()}
```

```svelte
<!-- Any descendant component -->
<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{
    mode: string;
    accentColor: string;
    toggle: () => void;
    setAccent: (color: string) => void;
  }>('theme');
</script>

<p>Current mode: {theme.mode}</p>
<p>Accent: <span style:color={theme.accentColor}>{theme.accentColor}</span></p>
<button onclick={theme.toggle}>Toggle theme</button>
<input type="color" value={theme.accentColor} oninput={(e) => theme.setAccent(e.currentTarget.value)} />
```

The getter `get mode()` returns the live `$state` value each time it is read, so descendants see reactive updates. Without the getter, descendants would receive the initial value and never update.

### Why Getters Are Required

This is the most common mistake with reactive context. Consider the difference:

```typescript
// WRONG: static snapshot -- descendants will never see updates
let count = $state(0);
setContext('counter', { count }); // copies the value 0

// CORRECT: reactive getter -- descendants see live updates
let count = $state(0);
setContext('counter', {
  get count() { return count; },
  increment() { count++; }
});
```

In the wrong example, `{ count }` creates an object with a property `count` set to the current value of `count` (which is `0`). Changing `count` later does not change the object's property. In the correct example, `get count()` creates a getter that reads `count` fresh every time it is accessed, so it always returns the current value.

### Reactive Context with createContext

Combining `createContext` with reactive objects:

```typescript
// src/lib/context/counter.ts
import { createContext } from 'svelte';

interface CounterContext {
  readonly count: number;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
}

const [getCounterContext, setCounterContext] = createContext<CounterContext>();

export { getCounterContext };

export function createCounterContext(initialValue = 0) {
  let count = $state(initialValue);

  const ctx: CounterContext = {
    get count() { return count; },
    increment() { count++; },
    decrement() { count--; },
    reset() { count = initialValue; }
  };

  setCounterContext(ctx);
  return ctx;
}
```

```svelte
<!-- Provider -->
<script lang="ts">
  import { createCounterContext } from '$lib/context/counter';

  const counter = createCounterContext(10);
</script>

{@render children()}

<!-- Consumer (any descendant) -->
<script lang="ts">
  import { getCounterContext } from '$lib/context/counter';
  const counter = getCounterContext();
</script>

<p>Count: {counter.count}</p>
<button onclick={counter.increment}>+</button>
<button onclick={counter.decrement}>-</button>
<button onclick={counter.reset}>Reset</button>
```

The `createCounterContext` function encapsulates the `$state` and the context setup in a single call, making the provider component trivially simple.

## Context vs Props vs Shared State

Choosing between these three mechanisms comes down to scope and relationship:

| Mechanism | Scope | Reactivity | Best For |
|-----------|-------|------------|----------|
| Props | Parent to direct child | Always reactive | Explicit, one-level data passing |
| Context | Ancestor to any descendant | Reactive via getters | Tree-scoped data without prop drilling |
| Shared state (`.svelte.ts`) | Any component, anywhere | Always reactive | App-wide global data |

**Decision tree:**

1. Does only the direct child need the data? Use **props**. They are explicit, easy to trace, and strongly typed by default.
2. Do multiple descendants in the same subtree need the data, but it should not leak outside that tree? Use **context**. It avoids prop drilling while maintaining tree isolation.
3. Do unrelated components across different pages need the data? Use **shared state** in a `.svelte.ts` file. It is globally accessible.

### When Context Wins Over Props

The classic example is a deeply nested component tree:

```
Layout
  Sidebar
    UserMenu
      Avatar  <-- needs user data
    Navigation
      NavItem  <-- needs theme
  Main
    Header
      Breadcrumb  <-- needs route context
    Content
      Widget
        WidgetBody  <-- needs theme
```

Without context, you would need to pass `user` through `Sidebar`, `UserMenu`, and `Avatar` -- even though `Sidebar` and `UserMenu` never use it. With context, `Avatar` calls `getContext` directly, and the intermediate components are unaware.

### When Shared State Wins Over Context

Context is tree-scoped. A context value provided in `/dashboard/+layout.svelte` is available to every page under `/dashboard`, but not to components under `/settings`. If your shopping cart needs to be accessible everywhere -- from the header, the product page, the checkout page, and the footer -- that is shared state, not context.

```typescript
// src/lib/stores/cart.svelte.ts -- shared state, not context
class CartStore {
  items = $state<CartItem[]>([]);

  get total() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  get count() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  add(item: CartItem) {
    const existing = this.items.find(i => i.id === item.id);
    if (existing) {
      existing.quantity++;
    } else {
      this.items.push({ ...item, quantity: 1 });
    }
  }

  remove(id: string) {
    this.items = this.items.filter(i => i.id !== id);
  }
}

export const cart = new CartStore();
```

Any component anywhere can `import { cart } from '$lib/stores/cart.svelte'` and read or modify the cart. No context provider needed, no tree scoping.

### When Context and Shared State Combine

A common advanced pattern: use shared state for the data store, but use context to scope which instance of that store a subtree uses:

```typescript
// src/lib/context/form.ts
import { createContext } from 'svelte';

interface FormContext {
  readonly values: Record<string, string>;
  readonly errors: Record<string, string>;
  setValue: (name: string, value: string) => void;
  validate: () => boolean;
  submit: () => Promise<void>;
}

const [getFormContext, setFormContext] = createContext<FormContext>();

export { getFormContext };

export function createFormContext(onSubmit: (values: Record<string, string>) => Promise<void>) {
  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});

  const ctx: FormContext = {
    get values() { return values; },
    get errors() { return errors; },
    setValue(name, value) {
      values = { ...values, [name]: value };
      // Clear error when field is modified
      if (errors[name]) {
        const { [name]: _, ...rest } = errors;
        errors = rest;
      }
    },
    validate() {
      // Example validation
      const newErrors: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (!value.trim()) newErrors[key] = `${key} is required`;
      }
      errors = newErrors;
      return Object.keys(newErrors).length === 0;
    },
    async submit() {
      if (ctx.validate()) {
        await onSubmit(values);
      }
    }
  };

  setFormContext(ctx);
  return ctx;
}
```

Now each `<Form>` component creates its own context, and nested `<FormField>` components read from the nearest form:

```svelte
<!-- Form.svelte -->
<script lang="ts">
  import { createFormContext } from '$lib/context/form';

  let { onsubmit, children } = $props();

  const form = createFormContext(onsubmit);
</script>

<form onsubmit={(e) => { e.preventDefault(); form.submit(); }}>
  {@render children()}
</form>
```

```svelte
<!-- FormField.svelte -->
<script lang="ts">
  import { getFormContext } from '$lib/context/form';

  let { name, label, type = 'text' } = $props();

  const form = getFormContext();
</script>

<div class="field">
  <label for={name}>{label}</label>
  <input
    id={name}
    {type}
    value={form.values[name] ?? ''}
    oninput={(e) => form.setValue(name, e.currentTarget.value)}
    class:error={form.errors[name]}
  />
  {#if form.errors[name]}
    <p class="error-text">{form.errors[name]}</p>
  {/if}
</div>

<style>
  .error { border-color: #dc2626; }
  .error-text { color: #dc2626; font-size: 0.8rem; margin-top: 4px; }
</style>
```

```svelte
<!-- Usage: two independent forms on the same page -->
<Form onsubmit={async (values) => console.log('Form 1:', values)}>
  <FormField name="email" label="Email" type="email" />
  <FormField name="password" label="Password" type="password" />
  <button type="submit">Log In</button>
</Form>

<Form onsubmit={async (values) => console.log('Form 2:', values)}>
  <FormField name="name" label="Full Name" />
  <FormField name="company" label="Company" />
  <button type="submit">Sign Up</button>
</Form>
```

Each `Form` creates its own context. The `FormField` inside each form reads from the nearest `Form` ancestor. The two forms do not interfere with each other.

## Component Composition with Context: A Complete Tabs System

This is the capstone example. A Tabs system is a classic use case for context: the parent `Tabs` component manages state, and the `TabList`, `Tab`, and `TabPanel` children read that state to know which tab is active.

### Step 1: Define the Context

```typescript
// src/lib/context/tabs.ts
import { createContext } from 'svelte';

interface TabsContext {
  /** The currently active tab ID */
  readonly activeTab: string;
  /** Register a tab panel -- returns an unregister function */
  registerTab: (id: string) => () => void;
  /** Switch to a tab */
  selectTab: (id: string) => void;
  /** All registered tab IDs in order */
  readonly tabs: string[];
}

const [getTabsContext, setTabsContext] = createContext<TabsContext>();

export { getTabsContext };

export function createTabsContext(initialTab?: string) {
  let activeTab = $state(initialTab ?? '');
  let tabs = $state<string[]>([]);

  const ctx: TabsContext = {
    get activeTab() { return activeTab; },
    get tabs() { return tabs; },

    registerTab(id: string) {
      tabs = [...tabs, id];
      // If this is the first tab and no initial tab was specified, activate it
      if (tabs.length === 1 && !initialTab) {
        activeTab = id;
      }
      // Return unregister function
      return () => {
        tabs = tabs.filter(t => t !== id);
      };
    },

    selectTab(id: string) {
      if (tabs.includes(id)) {
        activeTab = id;
      }
    }
  };

  setTabsContext(ctx);
  return ctx;
}
```

### Step 2: The Tabs Container

```svelte
<!-- src/lib/components/Tabs.svelte -->
<script lang="ts">
  import { createTabsContext } from '$lib/context/tabs';

  let { initialTab, children, class: className = '' } = $props();

  createTabsContext(initialTab);
</script>

<div class="tabs {className}">
  {@render children()}
</div>
```

### Step 3: The Tab List and Tab Button

```svelte
<!-- src/lib/components/TabList.svelte -->
<script lang="ts">
  let { children, class: className = '' } = $props();
</script>

<div class="tab-list {className}" role="tablist">
  {@render children()}
</div>

<style>
  .tab-list {
    display: flex;
    border-bottom: 2px solid #e5e7eb;
    gap: 0;
  }
</style>
```

```svelte
<!-- src/lib/components/Tab.svelte -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';
  import { onMount } from 'svelte';

  let { id, children, disabled = false } = $props();

  const tabs = getTabsContext();

  // Register this tab on mount, unregister on unmount
  onMount(() => {
    const unregister = tabs.registerTab(id);
    return unregister;
  });

  let isActive = $derived(tabs.activeTab === id);
</script>

<button
  role="tab"
  aria-selected={isActive}
  aria-controls="panel-{id}"
  id="tab-{id}"
  onclick={() => !disabled && tabs.selectTab(id)}
  {disabled}
  class="tab-button"
  class:active={isActive}
  class:disabled
>
  {@render children()}
</button>

<style>
  .tab-button {
    padding: 10px 20px;
    border: none;
    background: none;
    cursor: pointer;
    font-size: 0.95rem;
    color: #64748b;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    transition: color 0.2s, border-color 0.2s;
  }

  .tab-button:hover:not(.disabled) {
    color: #1e293b;
  }

  .tab-button.active {
    color: #1e293b;
    border-bottom-color: #3b82f6;
    font-weight: 600;
  }

  .tab-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
```

### Step 4: The Tab Panel

```svelte
<!-- src/lib/components/TabPanel.svelte -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';

  let { id, children } = $props();

  const tabs = getTabsContext();

  let isActive = $derived(tabs.activeTab === id);
</script>

{#if isActive}
  <div
    role="tabpanel"
    id="panel-{id}"
    aria-labelledby="tab-{id}"
    class="tab-panel"
  >
    {@render children()}
  </div>
{/if}

<style>
  .tab-panel {
    padding: 20px 0;
  }
</style>
```

### Step 5: Using the Tabs System

```svelte
<script lang="ts">
  import Tabs from '$lib/components/Tabs.svelte';
  import TabList from '$lib/components/TabList.svelte';
  import Tab from '$lib/components/Tab.svelte';
  import TabPanel from '$lib/components/TabPanel.svelte';
</script>

<Tabs initialTab="overview">
  <TabList>
    <Tab id="overview">Overview</Tab>
    <Tab id="features">Features</Tab>
    <Tab id="pricing">Pricing</Tab>
    <Tab id="faq" disabled>FAQ (coming soon)</Tab>
  </TabList>

  <TabPanel id="overview">
    <h2>Product Overview</h2>
    <p>Welcome to our product. Here is what you need to know.</p>
  </TabPanel>

  <TabPanel id="features">
    <h2>Features</h2>
    <ul>
      <li>Feature one -- fast and reliable</li>
      <li>Feature two -- easy to use</li>
      <li>Feature three -- fully customizable</li>
    </ul>
  </TabPanel>

  <TabPanel id="pricing">
    <h2>Pricing</h2>
    <p>Plans start at $9/month.</p>
  </TabPanel>

  <TabPanel id="faq">
    <h2>FAQ</h2>
    <p>Coming soon.</p>
  </TabPanel>
</Tabs>
```

Study this architecture:

1. `Tabs` creates the context (state + methods).
2. `Tab` registers itself on mount and reads `activeTab` to know if it is active.
3. `TabPanel` reads `activeTab` to decide whether to render.
4. No props are drilled. `Tab` and `TabPanel` do not need to receive the active tab from their parent -- they read it from context.
5. Multiple `Tabs` on the same page work independently because each creates its own context.

### Adding Keyboard Navigation

Production tabs need keyboard navigation. Add it to `TabList` using the context:

```svelte
<!-- Enhanced TabList with keyboard nav -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';

  let { children, class: className = '' } = $props();
  const tabs = getTabsContext();

  function handleKeydown(e: KeyboardEvent) {
    const currentIndex = tabs.tabs.indexOf(tabs.activeTab);
    let nextIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        nextIndex = (currentIndex + 1) % tabs.tabs.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        nextIndex = (currentIndex - 1 + tabs.tabs.length) % tabs.tabs.length;
        break;
      case 'Home':
        e.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        nextIndex = tabs.tabs.length - 1;
        break;
      default:
        return;
    }

    tabs.selectTab(tabs.tabs[nextIndex]);

    // Focus the newly active tab button
    const tabButton = document.getElementById(`tab-${tabs.tabs[nextIndex]}`);
    tabButton?.focus();
  }
</script>

<div
  class="tab-list {className}"
  role="tablist"
  onkeydown={handleKeydown}
>
  {@render children()}
</div>
```

Now arrow keys cycle through tabs, Home/End jump to the first/last tab, and focus follows the active tab. This is the WCAG-compliant pattern for tab widgets.

## Advanced Pattern: Nested Context Providers

Context lookups walk up the tree and stop at the first match. This means you can nest providers to override context for a subtree:

```svelte
<script lang="ts">
  import { setThemeContext, getThemeContext } from '$lib/context/theme';
</script>

<!-- Root: dark theme -->
<div>
  <!-- setThemeContext({ mode: 'dark', accentColor: '#7c3aed' }) in layout -->

  <!-- Everything here uses dark theme -->
  <Sidebar />
  <Main />

  <!-- Except this subtree, which overrides to light -->
  {@const _ = setThemeContext({ mode: 'light', accentColor: '#3b82f6' })}
  <EmbeddedWidget />
  <!-- EmbeddedWidget and its descendants use light theme -->
</div>
```

Wait -- `setContext` can only be called at the top level of a component, not inside a block. To nest context, you need a wrapper component:

```svelte
<!-- ThemeOverride.svelte -->
<script lang="ts">
  import { setThemeContext } from '$lib/context/theme';

  let { mode, accentColor, children } = $props();

  setThemeContext({ mode, accentColor, fontSize: 'md' });
</script>

{@render children()}
```

```svelte
<!-- Now nesting works -->
<ThemeOverride mode="dark" accentColor="#7c3aed">
  <Sidebar />
  <Main />

  <ThemeOverride mode="light" accentColor="#3b82f6">
    <EmbeddedWidget />
  </ThemeOverride>
</ThemeOverride>
```

Each `ThemeOverride` creates a new context at its level in the tree. Components inside the inner `ThemeOverride` see the light theme. Components outside it see the dark theme. This pattern is how component libraries support theme overrides for individual sections of a page.

## Context in Layout Files

SvelteKit layout files are a natural place for context providers because they wrap entire route segments:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import { setContext } from 'svelte';

  let { data, children } = $props();

  // Every page and component under (app) can access the user
  let user = $state(data.user);

  setContext('app', {
    get user() { return user; },
    get isAdmin() { return user?.role === 'admin'; }
  });
</script>

{@render children()}
```

Every page under the `(app)` route group can call `getContext('app')` to access the user. When the user logs in or out (and `data.user` changes), the reactive getter ensures all consumers see the updated value.

## Try It

Build a complete `Tabs` component system with the following requirements:

1. **Context file:** Use `createContext()` to define a `TabsContext` with `activeTab` (reactive), `registerTab(id)`, `selectTab(id)`, and `tabs` (list of registered IDs).

2. **Tabs component:** Creates the context. Accepts an optional `initialTab` prop.

3. **Tab component:** Registers itself on mount (and unregisters on unmount). Reads context to show active styling. Supports a `disabled` prop.

4. **TabPanel component:** Reads context and only renders when its `id` matches `activeTab`.

5. **TabList component:** Wraps tabs and adds keyboard navigation (ArrowLeft/ArrowRight cycle through tabs, Home/End jump to first/last).

6. **Bonus:** Add animated transitions when switching panels. Use a `$derived` value for the transition direction (left-to-right or right-to-left) based on the index change.

7. **Bonus:** Make it work with two independent `Tabs` instances on the same page, proving that context isolation works.

## Key Takeaways

- `setContext(key, value)` provides data from a parent; `getContext(key)` reads it in any descendant. Both must be called during component initialization.
- Use `Symbol` keys with typed helper functions to prevent collisions and ensure type safety. Throw informative errors when context is missing.
- `createContext()` is the preferred approach for new code -- it returns a typed `[get, set]` pair with no manual key management. It optionally accepts a default value.
- `setContext`/`getContext` still work and are not deprecated, but `createContext` eliminates boilerplate.
- `hasContext(key)` checks if context exists, enabling components with optional dependencies. `getAllContexts()` returns all ancestor context as a Map.
- Pass objects with `$state` and **getters** to make context values reactive. Without getters, descendants see a static snapshot.
- Context is tree-scoped: only descendants of the provider component can access the value. Multiple providers of the same key can coexist -- the nearest one wins.
- Use props for direct children, context for subtrees, and `.svelte.ts` shared state for global data.
- Nested context providers let you override context for a subtree -- useful for theme overrides and scoped configurations.
- The Tabs pattern (provider creates state, children register and read from context) is a reusable architectural blueprint for any compound component: accordions, form fields, disclosure groups, and more.
