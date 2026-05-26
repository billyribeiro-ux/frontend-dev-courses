# Context API Deep Dive

You have already seen how `setContext` and `getContext` pass data down the component tree without prop drilling. Now it is time to explore the full Context API -- typed keys, optional context checks, reactive context objects, and exactly when context is the right tool compared to props and shared state. We will build a complete Tabs component system from scratch to show every pattern in action.

Context is scoped to a component tree. A value set in a parent is available to every descendant in that branch, but invisible to components outside it. This tree-scoping is what makes context fundamentally different from global state in a `.svelte.ts` file. Two instances of the same component can provide different context values to their respective subtrees without interfering with each other.

This lesson goes beyond the basics. We will explore context composition with snippets, understand the compiler's role in context scoping, examine patterns that most tutorials never cover, and build a production-quality form system to demonstrate advanced usage. Understanding _why_ the distinction between context and global state matters, and _when_ each approach is correct, is what separates a developer who uses context from one who wields it.

## Why Context Exists -- The Problem It Solves

Consider a dashboard application with a theme, an authenticated user, and feature flags. Without context, you must thread these values through every level of the component tree:

```svelte
<!-- WRONG: Prop drilling through 6 levels -->
<Dashboard {user} {theme} {featureFlags}>
  <Sidebar {user} {theme} {featureFlags}>
    <Navigation {user} {theme}>
      <NavItem {theme}>
        <Icon {theme} />  <!-- Icon needs theme but nothing else -->
      </NavItem>
    </Navigation>
  </Sidebar>
</Dashboard>
```

Every intermediate component (`Sidebar`, `Navigation`, `NavItem`) must declare, accept, and forward props it does not use. This creates three problems:

1. **Coupling** -- Intermediate components know about data they do not use. Changing the `theme` type requires editing every component in the chain.
2. **Noise** -- Props lists become cluttered with pass-through values, obscuring the props a component actually consumes.
3. **Fragility** -- Adding a new piece of shared data requires modifying every component between the provider and the consumer.

Context solves this by letting a parent component "broadcast" values to all descendants. Any descendant can read the value directly, without the intermediary components knowing or caring.

## How Context Works Under the Hood

When you call `setContext(key, value)`, Svelte stores the key-value pair on the **component's internal context object**. This object is part of the component's runtime representation, created during initialization.

When a descendant calls `getContext(key)`, Svelte walks up the component tree from the calling component to its parent, grandparent, and so on, checking each component's context object for a matching key. It returns the first match it finds.

This is why both functions must be called during **component initialization** -- inside the top-level `<script>` block, not inside event handlers, `$effect` callbacks, or `setTimeout`. During initialization, Svelte knows which component is currently being constructed and can associate the context with the right position in the tree. Outside initialization, there is no active component context to reference.

```svelte
<script lang="ts">
  import { setContext, getContext } from 'svelte';

  // CORRECT: Called during initialization
  setContext('key', 'value');
  const value = getContext('key');

  function handleClick() {
    // WRONG: Called outside initialization — runtime error
    // setContext('key', 'new value');
    // const v = getContext('key');
  }

  $effect(() => {
    // WRONG: Called outside initialization — runtime error
    // const v = getContext('key');
  });
</script>
```

The component tree walk is what gives context its scoping behavior. If a grandparent and a parent both set context with the same key, a child component gets the parent's value (the nearest ancestor wins). This enables **context overriding** -- a powerful pattern we will explore later.

### Context Is Set Once Per Component Instance

A common misconception: `setContext` does not "broadcast" a value. It simply stores a key-value pair on the current component instance. When a descendant calls `getContext`, Svelte walks up the component tree until it finds the nearest ancestor that set a context with that key.

This means:

1. Multiple ancestors can set the same key. The nearest one wins.
2. Context is established once, during initialization. You cannot call `setContext` again later to "update" the value. (But you can make the value itself reactive -- more on this below.)
3. Siblings never share context. Two components at the same level in the tree have completely independent context.

## setContext and getContext -- The Foundation

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

## Typed Symbol Keys -- The Professional Approach

String keys are fragile. A typo silently returns `undefined`, and two libraries could accidentally use the same string key (imagine two libraries both using `'theme'`). Using `Symbol` keys with typed helper functions solves both problems:

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

Symbols are globally unique. Even `Symbol('theme') !== Symbol('theme')` -- two Symbols with the same description are still different values. This makes key collisions impossible, even across third-party libraries. The typed wrapper functions ensure you always get the correct type back, and if you misuse them, TypeScript catches the error at compile time rather than at runtime.

### The Full Pattern for Typed Context

In production, the typed context pattern includes error handling and an optional variant:

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

Svelte provides `createContext()` as the preferred way to create typed, scoped context. Instead of manually defining Symbol keys and writing `get`/`set` wrapper functions yourself, `createContext` does it all in one call:

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

**Production pattern -- Components that work standalone AND in context:**

This is common in component libraries. A `Button` component might check for a `FormContext` to know if it is inside a form, and adapt accordingly:

```svelte
<!-- Button.svelte -->
<script lang="ts">
  import { hasContext, getContext } from 'svelte';

  interface FormContext {
    disabled: boolean;
    submitting: boolean;
  }

  const FORM_KEY = Symbol.for('form-context');
  const formCtx = hasContext(FORM_KEY)
    ? getContext<FormContext>(FORM_KEY)
    : null;

  // Button is disabled if the form is submitting
  let { disabled = false, ...rest }: { disabled?: boolean } = $props();

  const isDisabled = $derived(disabled || formCtx?.submitting || formCtx?.disabled || false);
</script>

<button disabled={isDisabled} {...rest}>
  {#if formCtx?.submitting}
    Submitting...
  {:else}
    <slot />
  {/if}
</button>
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

## Reactive Context -- The Critical Pattern

Context values are set once during initialization, so passing a plain value creates a static snapshot. If the parent's data changes, descendants keep the stale initial value. This is the most common context mistake I see in production code:

```svelte
<!-- WRONG: Static context — descendants never see updates -->
<script lang="ts">
  import { setContext } from 'svelte';

  let mode = $state<'light' | 'dark'>('light');

  // This captures the INITIAL value of mode, not the reactive signal
  setContext('theme', { mode });
  // When mode changes to 'dark', descendants still see 'light'
</script>
```

To make context reactive, pass an object that uses **getters** to read `$state` values:

```svelte
<!-- CORRECT: Reactive context with getters -->
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

This is the same principle that applies everywhere in Svelte 5 reactivity: `$state` is reactive because reading a `$state` variable creates a subscription. If you copy the value into a plain variable or object property, you break the subscription chain.

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
```

```svelte
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

## Context vs Props vs Shared State -- The Decision Matrix

Choosing between these three mechanisms comes down to scope, relationship, and reactivity needs:

| Mechanism | Scope | Reactivity | Best For |
|-----------|-------|------------|----------|
| Props | Parent to direct child | Always reactive | Explicit, one-level data passing |
| Context | Ancestor to any descendant | Reactive via getters | Tree-scoped data without prop drilling |
| Shared state (`.svelte.ts`) | Any component, anywhere | Always reactive | App-wide global data |

**Decision tree:**

1. Does only the direct child need the data? Use **props**. They are explicit, easy to trace, and strongly typed by default.
2. Do multiple descendants in the same subtree need the data, but it should not leak outside that tree? Use **context**. It avoids prop drilling while maintaining tree isolation.
3. Do unrelated components across different pages need the data? Use **shared state** in a `.svelte.ts` file. It is globally accessible.
4. Is the data server-specific (per-request)? Use **context** (in a layout load function or hooks). Shared `.svelte.ts` state is dangerous on the server because it is shared across all requests.

### The Server-Side Gotcha

This is a production war story worth internalizing. On the server, `.svelte.ts` module-level state is **shared across all requests**. If you store user data in a `.svelte.ts` file:

```typescript
// src/lib/state/user.svelte.ts
// DANGEROUS: This is shared across ALL server-side requests!
let currentUser = $state<User | null>(null);

export function setUser(user: User) {
  currentUser = user; // User A's data leaks to User B's request
}
```

Request 1 sets `currentUser` to Alice. Request 2, handled before the module resets, sees Alice's data. This is a security vulnerability and a correctness bug.

Context does not have this problem because it is scoped to a component instance, and each SSR request creates fresh component instances. For per-request data (current user, session, locale), always use context or `event.locals` -- never module-level `.svelte.ts` state.

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

## Context + Snippets Composition

Snippets are Svelte 5's mechanism for passing renderable content into components. When combined with context, they enable sophisticated composition patterns:

```svelte
<!-- DataTable.svelte — provides column context to cell renderers -->
<script lang="ts">
  import { setContext } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Column {
    key: string;
    label: string;
    width?: string;
  }

  let {
    data,
    columns,
    row
  }: {
    data: Record<string, unknown>[];
    columns: Column[];
    row: Snippet<[Record<string, unknown>, number]>;
  } = $props();

  setContext('datatable', {
    get columns() { return columns; },
    getRowData: (index: number) => data[index]
  });
</script>

<table>
  <thead>
    <tr>
      {#each columns as col}
        <th style:width={col.width}>{col.label}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each data as item, index}
      <tr>
        {@render row(item, index)}
      </tr>
    {/each}
  </tbody>
</table>
```

```svelte
<!-- Usage — the snippet receives data, context provides metadata -->
<DataTable {data} {columns}>
  {#snippet row(item, index)}
    <td>{item.name}</td>
    <td>{item.email}</td>
    <td>
      <button onclick={() => editUser(item)}>Edit</button>
    </td>
  {/snippet}
</DataTable>
```

## Multi-Provider Pattern

Complex applications often need multiple context providers. Instead of deeply nesting them:

```svelte
<!-- WRONG: Provider pyramid of doom -->
<ThemeProvider>
  <AuthProvider>
    <FeatureFlagProvider>
      <NotificationProvider>
        <ToastProvider>
          {@render children()}
        </ToastProvider>
      </NotificationProvider>
    </FeatureFlagProvider>
  </AuthProvider>
</ThemeProvider>
```

Create a combined provider:

```svelte
<!-- AppProviders.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { initThemeContext } from '$lib/context/theme';
  import { initAuthContext } from '$lib/context/auth';
  import { initFeatureFlagContext } from '$lib/context/features';
  import { initNotificationContext } from '$lib/context/notifications';

  let { children }: { children: Snippet } = $props();

  // All context is set during initialization — order does not matter
  initThemeContext({ mode: 'light', accentColor: '#3b82f6' });
  initAuthContext();
  initFeatureFlagContext();
  initNotificationContext();
</script>

{@render children()}
```

```svelte
<!-- +layout.svelte — clean and flat -->
<script lang="ts">
  import AppProviders from '$lib/components/AppProviders.svelte';
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<AppProviders>
  {@render children()}
</AppProviders>
```

This is cleaner, and the initialization order of `setContext` calls within a single component does not matter -- they are all associated with the same component's context object.

## Advanced: Form System Using Context

A form system demonstrates the power of context at scale. Each `Form` component creates its own context, and nested `FormField` components read from the nearest form:

```typescript
// src/lib/context/form.ts
import { createContext } from 'svelte';

interface FormContext {
  readonly values: Record<string, string>;
  readonly errors: Record<string, string>;
  readonly submitting: boolean;
  setValue: (name: string, value: string) => void;
  validate: () => boolean;
  submit: () => Promise<void>;
}

const [getFormContext, setFormContext] = createContext<FormContext>();

export { getFormContext };

export function createFormContext(onSubmit: (values: Record<string, string>) => Promise<void>) {
  let values = $state<Record<string, string>>({});
  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);

  const ctx: FormContext = {
    get values() { return values; },
    get errors() { return errors; },
    get submitting() { return submitting; },
    setValue(name, value) {
      values = { ...values, [name]: value };
      if (errors[name]) {
        const { [name]: _, ...rest } = errors;
        errors = rest;
      }
    },
    validate() {
      const newErrors: Record<string, string> = {};
      for (const [key, value] of Object.entries(values)) {
        if (!value.trim()) newErrors[key] = `${key} is required`;
      }
      errors = newErrors;
      return Object.keys(newErrors).length === 0;
    },
    async submit() {
      if (ctx.validate()) {
        submitting = true;
        try {
          await onSubmit(values);
        } finally {
          submitting = false;
        }
      }
    }
  };

  setFormContext(ctx);
  return ctx;
}
```

```svelte
<!-- Form.svelte -->
<script lang="ts">
  import { createFormContext } from '$lib/context/form';
  import type { Snippet } from 'svelte';

  let {
    onsubmit,
    children
  }: {
    onsubmit: (values: Record<string, string>) => Promise<void>;
    children: Snippet;
  } = $props();

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

  let { name, label, type = 'text' }: { name: string; label: string; type?: string } = $props();

  const form = getFormContext();
</script>

<div class="field">
  <label for={name}>{label}</label>
  <input
    id={name}
    {type}
    value={form.values[name] ?? ''}
    oninput={(e) => form.setValue(name, e.currentTarget.value)}
    disabled={form.submitting}
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
<Form onsubmit={async (values) => console.log('Login:', values)}>
  <FormField name="email" label="Email" type="email" />
  <FormField name="password" label="Password" type="password" />
  <button type="submit">Log In</button>
</Form>

<Form onsubmit={async (values) => console.log('Signup:', values)}>
  <FormField name="name" label="Full Name" />
  <FormField name="company" label="Company" />
  <button type="submit">Sign Up</button>
</Form>
```

Each `Form` creates its own context. The `FormField` inside each form reads from the nearest `Form` ancestor. The two forms do not interfere with each other. This is the power of tree-scoped context.

## Component Composition with Context: A Complete Tabs System

This is the capstone example. A Tabs system is a classic use case for context: the parent `Tabs` component manages state, and the `TabList`, `Tab`, and `TabPanel` children read that state to know which tab is active.

### Step 1: Define the Context

```typescript
// src/lib/context/tabs.ts
import { createContext } from 'svelte';

interface TabsContext {
  readonly activeTab: string;
  registerTab: (id: string) => () => void;
  selectTab: (id: string) => void;
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
      if (tabs.length === 1 && !initialTab) {
        activeTab = id;
      }
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
  import type { Snippet } from 'svelte';

  let {
    initialTab,
    children,
    class: className = ''
  }: {
    initialTab?: string;
    children: Snippet;
    class?: string;
  } = $props();

  createTabsContext(initialTab);
</script>

<div class="tabs {className}">
  {@render children()}
</div>
```

### Step 3: The Tab List with Keyboard Navigation

```svelte
<!-- src/lib/components/TabList.svelte -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';
  import type { Snippet } from 'svelte';

  let { children, class: className = '' }: { children: Snippet; class?: string } = $props();
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

    const tabButton = document.getElementById(`tab-${tabs.tabs[nextIndex]}`);
    tabButton?.focus();
  }
</script>

<div class="tab-list {className}" role="tablist" onkeydown={handleKeydown}>
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

### Step 4: The Tab Button

```svelte
<!-- src/lib/components/Tab.svelte -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  let {
    id,
    children,
    disabled = false
  }: {
    id: string;
    children: Snippet;
    disabled?: boolean;
  } = $props();

  const tabs = getTabsContext();

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
  tabindex={isActive ? 0 : -1}
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

  .tab-button:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: -2px;
    border-radius: 4px;
  }
</style>
```

### Step 5: The Tab Panel

```svelte
<!-- src/lib/components/TabPanel.svelte -->
<script lang="ts">
  import { getTabsContext } from '$lib/context/tabs';
  import type { Snippet } from 'svelte';

  let { id, children }: { id: string; children: Snippet } = $props();

  const tabs = getTabsContext();

  let isActive = $derived(tabs.activeTab === id);
</script>

{#if isActive}
  <div role="tabpanel" id="panel-{id}" aria-labelledby="tab-{id}" class="tab-panel">
    {@render children()}
  </div>
{/if}

<style>
  .tab-panel {
    padding: 20px 0;
  }
</style>
```

### Step 6: Using the Tabs System

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
6. Keyboard navigation follows the WCAG-compliant pattern: Arrow keys cycle through tabs, Home/End jump to first/last, and focus follows the active tab via `tabindex` management.

## Context vs Dependency Injection

If you come from a Java or .NET background, context might remind you of dependency injection (DI). The comparison is apt but there are important differences:

| DI (Java/Spring) | Svelte Context |
|-------------------|---------------|
| Container manages lifecycle | Component tree manages scope |
| Singleton, request-scoped, prototype | Tree-scoped only |
| Constructor injection | `getContext()` during init |
| Registered in configuration | `setContext()` in component |
| Can be mocked via container | Can be overridden by closer ancestor |
| Resolved at startup | Resolved at component initialization |

The key difference: Svelte context is implicitly scoped by the component tree. You do not configure a "container" -- the tree itself is the container. This means testing is simple: render the component inside a wrapper that sets the expected context.

## Advanced Pattern: Nested Context Providers

Context lookups walk up the tree and stop at the first match. This means you can nest providers to override context for a subtree:

```svelte
<!-- ThemeOverride.svelte -->
<script lang="ts">
  import { setThemeContext } from '$lib/context/theme';
  import type { Snippet } from 'svelte';

  let {
    mode,
    accentColor,
    children
  }: {
    mode: 'light' | 'dark';
    accentColor: string;
    children: Snippet;
  } = $props();

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
  import type { Snippet } from 'svelte';

  let { data, children }: { data: any; children: Snippet } = $props();

  let user = $state(data.user);

  setContext('app', {
    get user() { return user; },
    get isAdmin() { return user?.role === 'admin'; }
  });
</script>

{@render children()}
```

Every page under the `(app)` route group can call `getContext('app')` to access the user.

## Common Pitfalls

### Pitfall 1: Reading context outside initialization

```svelte
<script lang="ts">
  import { getContext } from 'svelte';

  // WRONG: Inside setTimeout — not initialization time
  setTimeout(() => {
    const theme = getContext('theme'); // Runtime error!
  }, 0);

  // CORRECT: Read during initialization, use the reference later
  const theme = getContext<{ mode: string }>('theme');
  setTimeout(() => {
    console.log(theme.mode); // Works — using the reference
  }, 1000);
</script>
```

### Pitfall 2: Non-reactive context that looks reactive

```svelte
<script lang="ts">
  import { setContext } from 'svelte';

  let count = $state(0);

  // WRONG: Spreads the value, not a getter
  setContext('counter', { count }); // { count: 0 } — forever 0

  // CORRECT: Getter returns live value
  setContext('counter', {
    get count() { return count; }
  });
</script>
```

### Pitfall 3: Mutating context from descendants without actions

```svelte
<script lang="ts">
  import { getContext } from 'svelte';

  const theme = getContext<{ mode: string }>('theme');

  // WRONG: Direct mutation bypasses reactivity
  theme.mode = 'dark'; // May not trigger updates; violates unidirectional flow

  // CORRECT: Use an action method provided by the context
  // theme.toggle();
</script>
```

## Try It

Build a complete `Tabs` component system with the following requirements:

1. **Context file:** Use `createContext()` to define a `TabsContext` with `activeTab` (reactive), `registerTab(id)`, `selectTab(id)`, and `tabs` (list of registered IDs).

2. **Tabs component:** Creates the context. Accepts an optional `initialTab` prop.

3. **Tab component:** Registers itself on mount (and unregisters on unmount). Reads context to show active styling. Supports a `disabled` prop.

4. **TabPanel component:** Reads context and only renders when its `id` matches `activeTab`.

5. **TabList component:** Wraps tabs and adds keyboard navigation (ArrowLeft/ArrowRight cycle through tabs, Home/End jump to first/last).

6. **Bonus:** Make it work with two independent `Tabs` instances on the same page, proving that context isolation works.

7. **Bonus:** Add a `FormContext` system using context. Create a `Form` provider that manages field values and errors, and `FormField` consumers that read from the nearest form. Put two independent forms on the same page and verify they do not interfere.

## Key Takeaways

- `setContext(key, value)` provides data from a parent; `getContext(key)` reads it in any descendant. Both must be called during component initialization.
- Context works by walking up the component tree to find the nearest ancestor with a matching key -- closer ancestors override further ones.
- Use `Symbol` keys with typed helper functions to prevent collisions and ensure type safety. Throw informative errors when context is missing.
- `createContext()` is the preferred approach for new code -- it returns a typed `[get, set]` pair with no manual key management. It optionally accepts a default value.
- `setContext`/`getContext` still work and are not deprecated, but `createContext` eliminates boilerplate.
- `hasContext(key)` checks if context exists, enabling components with optional dependencies. `getAllContexts()` returns all ancestor context as a Map.
- Pass objects with `$state` and **getters** to make context values reactive. Without getters, descendants see a static snapshot.
- Context is tree-scoped: only descendants of the provider component can access the value. Multiple providers of the same key can coexist -- the nearest one wins.
- On the server, `.svelte.ts` shared state leaks across requests -- use context for per-request data like authenticated user or session.
- Use props for direct children, context for subtrees, and `.svelte.ts` shared state for global, client-only data.
- Nested context providers let you override context for a subtree -- useful for theme overrides and scoped configurations.
- The Tabs/Form pattern (provider creates state, children register and read from context) is a reusable architectural blueprint for any compound component: accordions, form fields, disclosure groups, and more.
