# Svelte Stores

Before Svelte 5 introduced runes, **stores** were the primary way to manage reactive state outside components. Stores still exist in Svelte 5, they are fully supported, and many libraries -- including SvelteKit itself -- expose stores as part of their API. Understanding stores is essential for working with the broader Svelte ecosystem.

A store is any object with a `subscribe` method that follows the Svelte store contract. The `svelte/store` module provides three built-in store creators: `writable`, `readable`, and `derived`.

## Writable Stores

A `writable` store holds a value that can be read and updated from anywhere:

```typescript
// src/lib/stores/counter.ts
import { writable } from 'svelte/store';

export const count = writable(0);
```

Writable stores expose three methods:

```typescript
import { count } from '$lib/stores/counter';

count.set(10);           // Replace the value
count.update(n => n + 1); // Transform the current value
count.subscribe(value => {
  console.log('Count is now:', value);
}); // Listen for changes -- returns an unsubscribe function
```

In components, the `$` prefix auto-subscribes to the store and auto-unsubscribes when the component is destroyed:

```svelte
<script>
  import { count } from '$lib/stores/counter';
</script>

<p>Count: {$count}</p>
<button onclick={() => $count++}>Increment</button>
```

Writing `$count++` is shorthand for `count.update(n => n + 1)`. The `$` prefix works for both reading and writing.

### The Store Contract

The `$` prefix is not magic that only works with `svelte/store`. It works with any object that has a `subscribe` method matching this signature:

```typescript
interface Readable<T> {
  subscribe(run: (value: T) => void): () => void;
}
```

`subscribe` receives a callback, calls it immediately with the current value, calls it again whenever the value changes, and returns an unsubscribe function. This is the entire store contract. Any object that follows this pattern -- whether from `svelte/store`, a third-party library, or your own code -- works with `$` auto-subscription.

This is how RxJS observables, custom event emitters, and even framework-agnostic state libraries can integrate with Svelte. If the object has `.subscribe`, you can `$` it.

### Memory Management

The `subscribe` method returns an unsubscribe function. In plain JavaScript (outside Svelte components), you must call it to prevent memory leaks:

```typescript
import { count } from '$lib/stores/counter';

const unsubscribe = count.subscribe(value => {
  console.log(value);
});

// Later, when you are done listening:
unsubscribe();
```

In Svelte components, the `$` prefix handles this automatically. When the component is destroyed, all `$`-prefixed subscriptions are cleaned up. This is why `$count` is preferred over manual `subscribe` -- it is impossible to forget to unsubscribe.

## Readable Stores

A `readable` store cannot be set from outside -- only its internal logic can update the value. This is perfect for values that come from external sources:

```typescript
// src/lib/stores/time.ts
import { readable } from 'svelte/store';

export const currentTime = readable(new Date(), (set) => {
  const interval = setInterval(() => {
    set(new Date());
  }, 1000);

  // Return a cleanup function
  return () => clearInterval(interval);
});
```

The second argument is a `start` function that runs when the first subscriber arrives. It receives `set` to update the value. The function it returns runs when the last subscriber leaves -- perfect for cleanup.

```svelte
<script>
  import { currentTime } from '$lib/stores/time';
</script>

<p>The time is {$currentTime.toLocaleTimeString()}</p>
```

The start/stop lifecycle is demand-driven. If no component is subscribed to `currentTime`, the interval is not running. The moment a component subscribes, the interval starts. When all subscribers leave, it stops. This is lazy initialization -- resources are only consumed when needed.

### Readable Store Patterns

Readable stores are ideal for wrapping browser APIs, network connections, and other external data sources:

```typescript
// src/lib/stores/online.ts
import { readable } from 'svelte/store';

/** Track the browser's online/offline status. */
export const isOnline = readable(true, (set) => {
  if (typeof window === 'undefined') return;

  const goOnline = () => set(true);
  const goOffline = () => set(false);

  set(navigator.onLine);

  window.addEventListener('online', goOnline);
  window.addEventListener('offline', goOffline);

  return () => {
    window.removeEventListener('online', goOnline);
    window.removeEventListener('offline', goOffline);
  };
});
```

```typescript
// src/lib/stores/media-query.ts
import { readable } from 'svelte/store';

/** Create a store that tracks a CSS media query. */
export function createMediaQuery(query: string) {
  return readable(false, (set) => {
    if (typeof window === 'undefined') return;

    const mql = window.matchMedia(query);
    set(mql.matches);

    const handler = (e: MediaQueryListEvent) => set(e.matches);
    mql.addEventListener('change', handler);

    return () => mql.removeEventListener('change', handler);
  });
}

export const isMobile = createMediaQuery('(max-width: 768px)');
export const prefersDark = createMediaQuery('(prefers-color-scheme: dark)');
export const prefersReducedMotion = createMediaQuery('(prefers-reduced-motion: reduce)');
```

Notice the `typeof window === 'undefined'` guard. Store creation can happen on the server during SSR. Browser APIs do not exist there, so the start function must bail out early. The store will still have its initial value (`true`, `false`, etc.) during SSR.

## Derived Stores

A `derived` store computes its value from one or more source stores. It updates automatically whenever any source changes:

```typescript
// src/lib/stores/cart.ts
import { writable, derived } from 'svelte/store';

interface CartItem {
  name: string;
  price: number;
  quantity: number;
}

export const cartItems = writable<CartItem[]>([]);

export const totalPrice = derived(cartItems, ($items) =>
  $items.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

export const itemCount = derived(cartItems, ($items) =>
  $items.reduce((sum, item) => sum + item.quantity, 0)
);

export const isEmpty = derived(itemCount, ($count) => $count === 0);
```

Derived stores can depend on multiple sources:

```typescript
import { derived } from 'svelte/store';

const fullName = derived(
  [firstName, lastName],
  ([$first, $last]) => `${$first} ${$last}`
);
```

### Async Derived Stores

Derived stores support an asynchronous form where you pass a `set` callback:

```typescript
import { derived } from 'svelte/store';

const searchQuery = writable('');

// Async derived store -- the second argument to the callback is `set`
const searchResults = derived(
  searchQuery,
  ($query, set) => {
    if (!$query.trim()) {
      set([]);
      return;
    }

    // Debounce by returning a cleanup function
    const timeout = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent($query)}`);
      const results = await res.json();
      set(results);
    }, 300);

    return () => clearTimeout(timeout);
  },
  [] // Initial value while waiting
);
```

The third argument to `derived` is the initial value, used before the first computation completes. The cleanup function (returned from the callback) runs before each re-computation, giving you a natural place to cancel pending requests or timers.

## Getting a Store Value Synchronously

The `get` function reads a store's current value without subscribing. Use it sparingly -- it subscribes, reads, and immediately unsubscribes, so it is inefficient in hot paths:

```typescript
import { get } from 'svelte/store';
import { count } from '$lib/stores/counter';

function logCurrentCount() {
  console.log('Count right now:', get(count));
}
```

This is most useful in non-reactive code like server-side utilities, one-off event handlers, or test assertions where you need a snapshot of the value.

**When not to use `get`**: Inside `$effect` or reactive computations, use the `$` prefix instead. Every `get()` call creates and destroys a subscription, which is wasteful if you need the value on every update.

## Custom Stores

A custom store wraps a `writable` and exposes a limited, domain-specific API. The only requirement is that the returned object has a `subscribe` method:

```typescript
// src/lib/stores/counter-custom.ts
import { writable } from 'svelte/store';

function createCounter(initial = 0) {
  const { subscribe, set, update } = writable(initial);

  return {
    subscribe,
    increment: () => update(n => n + 1),
    decrement: () => update(n => n - 1),
    reset: () => set(initial)
  };
}

export const counter = createCounter(0);
```

```svelte
<script>
  import { counter } from '$lib/stores/counter-custom';
</script>

<p>{$counter}</p>
<button onclick={counter.increment}>+</button>
<button onclick={counter.decrement}>-</button>
<button onclick={counter.reset}>Reset</button>
```

Consumers can read the value with `$counter` but can only modify it through the exposed methods. There is no `set` or `update` in the public API. This encapsulation prevents consumers from putting the store into an invalid state.

### Advanced Custom Store: localStorage Persistence

A common pattern is a store that persists to `localStorage`:

```typescript
// src/lib/stores/persisted.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * Create a writable store that persists to localStorage.
 * Falls back to the default value during SSR or if localStorage is unavailable.
 */
export function persisted<T>(key: string, defaultValue: T) {
  let initial = defaultValue;

  if (browser) {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      try {
        initial = JSON.parse(stored);
      } catch {
        // Corrupted data -- fall back to default
        localStorage.removeItem(key);
      }
    }
  }

  const store = writable<T>(initial);

  if (browser) {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }

  return store;
}

// Usage
export const theme = persisted<'light' | 'dark'>('theme', 'light');
export const recentSearches = persisted<string[]>('recent-searches', []);
```

### Custom Store with Validation

```typescript
// src/lib/stores/form-store.ts
import { writable, derived } from 'svelte/store';

interface FormField<T> {
  value: T;
  error: string | null;
  touched: boolean;
}

function createFormField<T>(
  initial: T,
  validate: (value: T) => string | null
) {
  const { subscribe, set, update } = writable<FormField<T>>({
    value: initial,
    error: null,
    touched: false
  });

  return {
    subscribe,
    setValue: (value: T) => {
      update(field => ({
        ...field,
        value,
        error: field.touched ? validate(value) : null
      }));
    },
    touch: () => {
      update(field => ({
        ...field,
        touched: true,
        error: validate(field.value)
      }));
    },
    reset: () => set({ value: initial, error: null, touched: false })
  };
}

// Usage
const email = createFormField('', (v) =>
  !v ? 'Required' : !v.includes('@') ? 'Invalid email' : null
);

const password = createFormField('', (v) =>
  !v ? 'Required' : v.length < 8 ? 'Must be at least 8 characters' : null
);

const isFormValid = derived(
  [email, password],
  ([$email, $password]) => !$email.error && !$password.error && $email.touched && $password.touched
);
```

## Motion Stores: Deprecated in Svelte 5

> **Important migration note:** The store-based `tweened()` and `spring()` functions from `svelte/motion` are deprecated in Svelte 5. They are replaced by class-based APIs that use runes under the hood.

### Before: Store-Based Motion (Deprecated)

```svelte
<!-- OLD: Using tweened() and spring() stores -->
<script>
  import { tweened } from 'svelte/motion';
  import { spring } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  const progress = tweened(0, {
    duration: 400,
    easing: cubicOut
  });

  const coords = spring({ x: 0, y: 0 }, {
    stiffness: 0.1,
    damping: 0.25
  });
</script>

<!-- Auto-subscription with $ prefix -->
<div style="width: {$progress * 100}%"></div>
<div style="transform: translate({$coords.x}px, {$coords.y}px)"></div>

<button onclick={() => progress.set(1)}>Complete</button>
<div onpointermove={(e) => coords.set({ x: e.clientX, y: e.clientY })}></div>
```

### After: Class-Based Motion (Svelte 5)

```svelte
<!-- NEW: Using Tween and Spring classes -->
<script>
  import { Tween, Spring } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  const progress = new Tween(0, {
    duration: 400,
    easing: cubicOut
  });

  const coords = new Spring({ x: 0, y: 0 }, {
    stiffness: 0.1,
    damping: 0.25
  });
</script>

<!-- Access via .current instead of $ prefix -->
<div style="width: {progress.current * 100}%"></div>
<div style="transform: translate({coords.current.x}px, {coords.current.y}px)"></div>

<button onclick={() => progress.target = 1}>Complete</button>
<div onpointermove={(e) => coords.target = { x: e.clientX, y: e.clientY }}></div>
```

Key differences in the migration:
- `tweened(value, opts)` becomes `new Tween(value, opts)`
- `spring(value, opts)` becomes `new Spring(value, opts)`
- `$storeName` becomes `.current` for reading the interpolated value
- `.set(value)` becomes assigning to `.target` property
- The classes are reactive via runes internally -- no store subscription needed
- `Tween` and `Spring` are classes, so they work in `.svelte` and `.svelte.ts` files

### Migration Example: Animated Progress Bar

```svelte
<!-- BEFORE (deprecated) -->
<script>
  import { tweened } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  const progress = tweened(0, { duration: 600, easing: cubicOut });

  let tasks = $state([
    { text: 'Design', done: true },
    { text: 'Build', done: false },
    { text: 'Test', done: false }
  ]);

  // This does not work cleanly -- you need to manually call progress.set()
  $effect(() => {
    const completed = tasks.filter(t => t.done).length;
    progress.set(completed / tasks.length);
  });
</script>

<div class="bar" style="width: {$progress * 100}%"></div>
```

```svelte
<!-- AFTER (Svelte 5) -->
<script>
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';

  let tasks = $state([
    { text: 'Design', done: true },
    { text: 'Build', done: false },
    { text: 'Test', done: false }
  ]);

  let completionRatio = $derived(tasks.filter(t => t.done).length / tasks.length);

  const progress = new Tween(0, { duration: 600, easing: cubicOut });

  // Set the target whenever the ratio changes
  $effect(() => {
    progress.target = completionRatio;
  });
</script>

<div class="bar" style="width: {progress.current * 100}%"></div>
```

## Store + Rune Interop Patterns

In practice, you will use both stores and runes in the same project -- especially when consuming SvelteKit's built-in stores alongside your own rune-based state. Here are the patterns for making them work together.

### Reading SvelteKit Stores with Runes

SvelteKit exposes reactive state through `$app/state`, which uses runes internally. The older `$app/stores` module (exposing `page`, `navigating`, and `updated` as stores) still works but `$app/state` is preferred in new code:

```svelte
<script>
  // Rune-based (preferred in new code)
  import { page } from '$app/state';

  // Access properties directly -- already reactive
  // page.url.pathname
  // page.params.slug
</script>
```

### Converting a Store to a Rune-Based Value

When you need to use a third-party store inside rune-based logic:

```svelte
<script>
  import { someLibraryStore } from 'third-party-lib';

  // Method 1: Use $-prefix directly (works in .svelte files)
  // $someLibraryStore gives you the reactive value

  // Method 2: Mirror the store value into a $state for complex logic
  let localValue = $state(0);

  $effect(() => {
    const unsub = someLibraryStore.subscribe(v => {
      localValue = v;
    });
    return unsub;
  });

  // Now localValue is a reactive $state synced to the store
</script>
```

### Converting Rune-Based State to a Store

When a third-party library expects a store but you have rune-based state:

```typescript
// src/lib/utils/rune-to-store.ts
import { readable } from 'svelte/store';

/**
 * Create a readable store from a getter function.
 * The getter is called reactively, so it works with $state and $derived values.
 *
 * Note: This only works in .svelte or .svelte.ts files where runes are available.
 */
export function toReadableStore<T>(getter: () => T) {
  return readable(getter(), (set) => {
    $effect(() => {
      set(getter());
    });
  });
}
```

```svelte
<script>
  import { toReadableStore } from '$lib/utils/rune-to-store';
  import { SomeLibraryComponent } from 'some-library';

  let count = $state(0);
  let doubled = $derived(count * 2);

  // Convert to a store for the library
  const doubledStore = toReadableStore(() => doubled);
</script>

<!-- Library expects a store prop -->
<SomeLibraryComponent value={doubledStore} />
```

### Shared State Module: Store vs Rune Approach

Here is the same feature implemented both ways, so you can see the tradeoffs:

```typescript
// STORE APPROACH: src/lib/stores/theme.ts
// Works in any .ts file. No compiler required.
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

function createThemeStore() {
  const { subscribe, set } = writable<'light' | 'dark'>('light');

  if (browser) {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') set(saved);
  }

  return {
    subscribe,
    toggle: () => {
      let current: 'light' | 'dark';
      subscribe(v => current = v)(); // Synchronous read via subscribe
      const next = current! === 'light' ? 'dark' : 'light';
      set(next);
      if (browser) localStorage.setItem('theme', next);
    },
    setTheme: (theme: 'light' | 'dark') => {
      set(theme);
      if (browser) localStorage.setItem('theme', theme);
    }
  };
}

export const theme = createThemeStore();
export const isDark = derived(theme, $t => $t === 'dark');
```

```typescript
// RUNE APPROACH: src/lib/state/theme.svelte.ts
// Must be .svelte.ts so the compiler processes runes.
import { browser } from '$app/environment';

let theme = $state<'light' | 'dark'>('light');

if (browser) {
  const saved = localStorage.getItem('theme');
  if (saved === 'light' || saved === 'dark') theme = saved;
}

let isDark = $derived(theme === 'dark');

export function getTheme() { return theme; }
export function getIsDark() { return isDark; }

export function toggleTheme() {
  theme = theme === 'light' ? 'dark' : 'light';
  if (browser) localStorage.setItem('theme', theme);
}

export function setTheme(t: 'light' | 'dark') {
  theme = t;
  if (browser) localStorage.setItem('theme', t);
}
```

The rune approach is simpler -- no `subscribe/set/update` ceremony, no `get()` hacks for synchronous reads. But it requires the `.svelte.ts` extension. The store approach works in plain `.ts` files and is compatible with any library that expects the store contract. For new projects, prefer runes. For library code that needs maximum compatibility, stores may still be the right choice.

## When to Use Stores vs Runes vs Context

| Mechanism | When to Use |
|-----------|-------------|
| Runes (`$state`) | The default for new code. Use in `.svelte` and `.svelte.ts` files. |
| Stores | When using libraries that expose stores (SvelteKit's `page` store, third-party packages), or for interop with non-Svelte code that follows the store contract. Also when you need code that works in plain `.ts` files without the Svelte compiler. |
| Context | When state is tree-scoped and should not be globally accessible. Context is set in a parent and read by descendants -- it does not leak to siblings or unrelated components. |

SvelteKit's own `$app/state` module exposes `page`, `navigating`, and `updated` as reactive state objects that work directly with runes. The older `$app/stores` module still works but `$app/state` is preferred in new code.

## Common Store Pitfalls

### Pitfall 1: Forgetting to Unsubscribe

```typescript
// BUG: memory leak -- subscribe() returns an unsubscribe function you must call
import { count } from '$lib/stores/counter';

count.subscribe(value => {
  document.title = `Count: ${value}`;
});
// This subscription lives forever!

// FIX: store the unsubscribe function and call it when done
const unsubscribe = count.subscribe(value => {
  document.title = `Count: ${value}`;
});
// Later:
unsubscribe();
```

### Pitfall 2: Mutating Objects Inside Stores

```typescript
// BUG: mutation does not trigger subscribers
import { writable } from 'svelte/store';

const items = writable([1, 2, 3]);
items.update(arr => {
  arr.push(4);  // Mutation -- same array reference
  return arr;   // Subscribers may not fire because reference equality check passes
});

// FIX: return a new array
items.update(arr => [...arr, 4]);
```

### Pitfall 3: Circular Derived Stores

```typescript
// BUG: infinite loop -- a depends on b, b depends on a
const a = writable(1);
const b = derived(a, $a => $a * 2);
// Do NOT subscribe to b and update a based on it -- that creates a cycle
```

## Migration: Stores to Runes

If you have existing store-based code, converting to runes is straightforward:

```typescript
// BEFORE: store-based (src/lib/stores/user.ts)
import { writable, derived } from 'svelte/store';

export const user = writable({ name: '', email: '' });
export const greeting = derived(user, ($u) => `Hello, ${$u.name}`);
```

```typescript
// AFTER: runes-based (src/lib/state/user.svelte.ts)
let user = $state({ name: '', email: '' });
let greeting = $derived(`Hello, ${user.name}`);

export function getUser() { return user; }
export function getGreeting() { return greeting; }
export function setUser(data: { name: string; email: string }) {
  user = data;
}
```

Key differences in the migration:
- `writable` becomes `$state`
- `derived` becomes `$derived`
- The file extension changes to `.svelte.ts` so the Svelte compiler processes the runes
- You use getter functions or class getters to export reactive primitives (exporting `$state` directly does not maintain reactivity -- the consumer gets a snapshot, not a live reference)
- `get(store)` calls become simple function calls that return the current value
- `$store` auto-subscription in templates becomes direct property access

### Migration Checklist

```
1. Rename the file: .ts -> .svelte.ts
2. Replace writable(value) with $state(value)
3. Replace derived(source, fn) with $derived(expression)
4. Replace .set(value) with direct assignment
5. Replace .update(fn) with reading + assigning
6. Replace get(store) with direct reads (in .svelte.ts context)
7. Export getter functions instead of raw $state values
8. Update all import paths in consuming components
9. Remove the svelte/store import
10. Test that reactivity still works in all consumers
```

## Try It

1. Create a custom store called `createTodoStore` that wraps a writable array of todo objects. Expose only `subscribe`, `add(text)`, `toggle(id)`, and `removeCompleted()` methods. Use a `derived` store to compute the number of remaining items. Use the store in a component with `$` auto-subscription.

2. Create a `persisted` store factory (like the one shown above) and use it to build a theme store that remembers the user's preference across page reloads. Toggle between light and dark mode.

3. Convert the todo store from exercise 1 to the rune-based approach using `.svelte.ts`. Compare the two implementations and note which you find clearer.

4. Create an async derived store that fetches user profile data when a `userId` writable store changes. Include a debounce so rapid changes do not fire multiple requests.

## Key Takeaways

- Stores are Svelte's original reactivity primitive -- they pre-date runes but are still fully supported
- `writable` creates a read/write store; `readable` creates a read-only store; `derived` computes from other stores
- The `$` prefix in components auto-subscribes and auto-unsubscribes, preventing memory leaks
- Any object with a `subscribe` method that follows the store contract works with `$` auto-subscription
- Custom stores expose a `subscribe` method plus domain-specific methods, hiding `set` and `update` to enforce invariants
- Use `get(store)` sparingly for synchronous one-off reads outside reactive contexts
- The store-based `tweened()` and `spring()` from `svelte/motion` are deprecated -- use `Tween` and `Spring` classes instead, accessing values via `.current` instead of `$storeName`
- Store-to-rune interop is straightforward: use `$` prefix in templates, `$effect` + `subscribe` for syncing, and `readable` wrappers for the reverse direction
- For new code, prefer runes (`$state`, `$derived`). Use stores when interacting with libraries that expect them or when you need plain `.ts` file compatibility
- Migration from stores to runes: `writable` becomes `$state`, `derived` becomes `$derived`, file becomes `.svelte.ts`, exports become getter functions
