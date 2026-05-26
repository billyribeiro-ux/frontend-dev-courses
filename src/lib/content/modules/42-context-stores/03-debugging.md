# Debugging Reactivity

Reactive systems are powerful, but when something updates unexpectedly — or fails to update at all — they can be deeply frustrating to debug. The problem is invisible causality: a value changed, but what changed it? An effect re-ran, but which dependency triggered it? A component re-rendered, but why?

Svelte 5 provides dedicated tools for answering these questions: `$inspect` for logging reactive changes, `$inspect.trace()` for tracking which signal triggered a re-run, and `{@debug}` for pausing execution at reactive breakpoints. Beyond these built-in tools, there are browser DevTools techniques, the Svelte DevTools extension, and systematic debugging strategies that every Svelte developer needs to know.

This lesson covers all of them. By the end, you will have a complete debugging workflow for any reactivity issue you encounter.

## $inspect — Reactive Console Logging

The `$inspect` rune logs a value to the console whenever it changes. It is the reactive equivalent of `console.log`, but it automatically re-runs when any dependency updates:

```svelte
<script>
  let count = $state(0);
  let name = $state('Alice');

  $inspect(count);
  // Console output:
  // init 0                ← on mount
  // update 1              ← after first increment
  // update 2              ← after second increment
</script>

<button onclick={() => count++}>Count: {count}</button>
```

The key difference from `console.log`: a `console.log(count)` in the script body runs once during initialization and never again. `$inspect(count)` runs on initialization AND every time `count` changes.

### Inspecting Multiple Values

Pass multiple arguments to inspect several values at once:

```svelte
<script>
  let firstName = $state('Alice');
  let lastName = $state('Smith');
  let age = $state(30);

  $inspect(firstName, lastName, age);
  // Logs all three values whenever ANY of them changes
  // init "Alice" "Smith" 30
  // update "Alice" "Johnson" 30   ← lastName changed
  // update "Bob" "Johnson" 30     ← firstName changed
</script>
```

### Inspecting Objects and Arrays

For objects and arrays managed by `$state`, `$inspect` sees through the proxy and logs the changes:

```svelte
<script>
  let cart = $state({
    items: [
      { name: 'Widget', qty: 2 },
      { name: 'Gadget', qty: 1 }
    ],
    total: 0
  });

  $inspect(cart);
  // Logs the entire cart object whenever any nested property changes
  // Even cart.items[0].qty++ triggers the log
</script>
```

### Production Safety

The best feature of `$inspect`: it is automatically stripped from production builds. You never need to remember to remove it before deploying. This means you can leave `$inspect` calls in your code during development without worrying about accidentally shipping them to users.

This is fundamentally different from `console.log` — if you forget to remove a `console.log`, it shows up in your users' browser consoles. `$inspect` has zero production impact.

## $inspect with Custom Callbacks

By default, `$inspect` uses `console.log`. The `.with(fn)` method lets you replace it with any callback. The callback receives the phase (`"init"` or `"update"`) and the current values:

```svelte
<script>
  let count = $state(0);

  // Use console.trace to see the full call stack
  $inspect(count).with(console.trace);

  // Custom logging with a label
  $inspect(count).with((phase, value) => {
    console.log(`[Counter] ${phase}: ${value}`);
  });

  // Pause in the debugger on every change
  $inspect(count).with((phase, value) => {
    if (phase === 'update') debugger;
  });
</script>
```

Using `console.trace` is particularly powerful. It shows you the exact call stack that led to the state change, answering the question "what code path caused this update?"

### Advanced Callback Patterns

```svelte
<script>
  let items = $state<string[]>([]);

  // Log only updates (skip initial value)
  $inspect(items).with((phase, value) => {
    if (phase === 'update') {
      console.log('Items changed:', value);
    }
  });

  // Break only when a specific condition is met
  $inspect(items).with((phase, value) => {
    if (value.length > 10) {
      console.warn('Items exceeded 10! This might cause performance issues.');
      debugger;
    }
  });

  // Send to an analytics/debugging service in development
  $inspect(items).with((phase, value) => {
    if (phase === 'update') {
      performance.mark(`items-changed-${value.length}`);
    }
  });

  // Track how often a value changes (detect excessive re-renders)
  let updateCount = 0;
  $inspect(items).with((phase) => {
    if (phase === 'update') {
      updateCount++;
      if (updateCount > 100) {
        console.error(`Items updated ${updateCount} times — possible infinite loop`);
        debugger;
      }
    }
  });
</script>
```

### Logging Snapshots of Complex Objects

When inspecting `$state` objects, the console may show a `Proxy` wrapper. To get clean output, use `$state.snapshot()` inside the callback:

```svelte
<script>
  let formData = $state({
    name: '',
    email: '',
    preferences: { theme: 'dark', notifications: true }
  });

  $inspect(formData).with((phase, value) => {
    // Without snapshot: shows Proxy{} — hard to read
    // With snapshot: shows plain object — easy to read
    console.log(`[Form] ${phase}:`, $state.snapshot(value));
  });
</script>
```

## $inspect.trace() — Finding the Source of Re-Runs

When an `$effect` or `$derived.by` re-runs and you cannot figure out why, `$inspect.trace()` tells you exactly which reactive signals triggered the re-run. Place it as the first line inside the effect:

```svelte
<script>
  let count = $state(0);
  let name = $state('Alice');
  let items = $state([1, 2, 3]);

  $effect(() => {
    $inspect.trace();
    // Console output identifies the specific signal(s) that changed:
    // $effect — src/routes/+page.svelte:8:2
    //   count: 0 → 1
    console.log('Effect ran:', count, name, items.length);
  });
</script>
```

This is invaluable when an effect has many dependencies and you need to know which one triggered a specific re-run. Without `$inspect.trace()`, you would have to add `$inspect` to every individual value and correlate the timing — error-prone and tedious.

### Tracing Derived Values

`$inspect.trace()` also works inside `$derived.by`:

```svelte
<script>
  let width = $state(100);
  let height = $state(50);
  let padding = $state(10);
  let margin = $state(5);

  let area = $derived.by(() => {
    $inspect.trace();
    // Tells you whether width, height, padding, or margin changed
    const inner = (width - 2 * padding) * (height - 2 * padding);
    return inner;
  });
</script>
```

### When $inspect.trace() Reveals Surprises

`$inspect.trace()` often reveals that effects depend on signals you did not intend:

```svelte
<script>
  let searchQuery = $state('');
  let results = $state<string[]>([]);
  let error = $state<string | null>(null);

  $effect(() => {
    $inspect.trace();
    // Surprise! This effect also depends on `error` because
    // we read it inside the effect body
    const query = searchQuery;
    if (query.length < 3) {
      results = [];
      error = null; // ← This reads AND writes `error`
      return;
    }
    fetch(`/api/search?q=${query}`).then(/* ... */);
  });

  // Fix: use untrack for the error read, or restructure
</script>
```

## The {@debug} Template Tag

The `{@debug}` tag pauses execution in the browser debugger whenever the specified variables change. It works like a reactive breakpoint in your template:

```svelte
<script>
  let user = $state({ name: 'Alice', role: 'admin' });
  let items = $state([1, 2, 3]);
</script>

{@debug user, items}

<p>{user.name} has {items.length} items</p>
```

When `user` or `items` changes, the browser DevTools opens at that exact point, letting you inspect the full component state in the debugger scope. This only works with DevTools open and only in development mode — it has no effect in production.

A bare `{@debug}` without arguments pauses on every re-render of the template:

```svelte
{@debug}
<p>This component just re-rendered</p>
```

### When to Use {@debug} vs $inspect

| Need | Tool |
|------|------|
| See values in console as they change | `$inspect` |
| See the call stack that caused a change | `$inspect().with(console.trace)` |
| Know which signal triggered a re-run | `$inspect.trace()` |
| Pause execution to inspect all state | `{@debug}` |
| Step through re-render logic line by line | `{@debug}` |

Use `{@debug}` when you need to stop time and explore. Use `$inspect` when you want a running log of changes.

## Browser DevTools for Svelte

### Svelte DevTools Extension

The Svelte DevTools browser extension adds a "Svelte" tab to Chrome/Firefox DevTools. It provides:

- **Component tree**: See every Svelte component mounted on the page, nested as they appear in the DOM hierarchy
- **Props and state**: Inspect each component's `$props` and `$state` values. You can edit values directly to test different scenarios
- **Context**: See which context values are available at each level of the component tree
- **Event listeners**: View which events each component is listening to
- **Highlight on hover**: Hovering a component in the tree highlights it in the page

Install it from the Chrome Web Store or Firefox Add-ons. It only works with development builds — production builds strip the instrumentation data.

### Proxy-Friendly Console Logging

Svelte's reactive proxies can look confusing in the console. When you log a `$state` object, you see `Proxy {target: {...}, handler: {...}}` rather than plain data. Two ways to get clean output:

```svelte
<script>
  let cart = $state({
    items: [{ name: 'Widget', qty: 2 }],
    coupon: null
  });

  function debugCart() {
    // Option 1: $state.snapshot() — clean, deep-cloned plain object
    console.log($state.snapshot(cart));

    // Option 2: JSON parse/stringify — also works but slower
    console.log(JSON.parse(JSON.stringify(cart)));

    // Option 3: structuredClone — handles more types than JSON
    console.log(structuredClone($state.snapshot(cart)));
  }
</script>
```

`$state.snapshot()` is the canonical approach. It creates a non-reactive plain-object copy of the current state, safe to log and safe to pass to external libraries that do not understand Svelte proxies.

### Performance Tab

The browser's Performance tab shows you how long each frame takes to render. For Svelte debugging:

1. Start a performance recording
2. Perform the action that feels slow
3. Stop recording
4. Look for long frames (anything over 16ms means dropped frames at 60fps)
5. Drill into the call stack — look for Svelte's internal functions like `$$invalidate`, `create_fragment`, or `update`
6. If a specific component's update function takes too long, that component is doing too much work during re-render

### Network Tab for SvelteKit

When debugging SvelteKit data loading:

1. Open the Network tab
2. Filter by "Fetch/XHR"
3. Navigate between pages in your app
4. Watch for `__data.json` requests — these are SvelteKit's data fetches for client-side navigation
5. Check the response payload to see exactly what your `load` function returned
6. Check timing to see if your server functions are slow

For remote functions (`query`, `command`), watch for the RPC calls that SvelteKit generates. The request body contains the function arguments, and the response contains the return value.

## Debugging $effect Dependency Chains

When effects depend on each other through shared state, debugging gets harder. Here is a systematic approach:

### Step 1: Map the Dependency Graph

Draw out which signals each effect reads and writes:

```svelte
<script>
  let searchQuery = $state('');       // Signal A
  let category = $state('all');       // Signal B
  let results = $state<Item[]>([]);   // Signal C
  let selectedId = $state<number | null>(null); // Signal D
  let detail = $state<Item | null>(null);       // Signal E

  // Effect 1: reads A, B — writes C
  $effect(() => {
    const query = searchQuery;
    const cat = category;
    fetch(`/api/search?q=${query}&cat=${cat}`)
      .then(r => r.json())
      .then(data => { results = data; });
  });

  // Effect 2: reads D — writes E
  $effect(() => {
    if (selectedId !== null) {
      fetch(`/api/items/${selectedId}`)
        .then(r => r.json())
        .then(data => { detail = data; });
    }
  });

  // Effect 3: reads C — writes D
  $effect(() => {
    // Auto-select first result when results change
    selectedId = results.length > 0 ? results[0].id : null;
  });
</script>
```

The dependency chain: A/B changes trigger Effect 1, which writes C, which triggers Effect 3, which writes D, which triggers Effect 2. A change to `searchQuery` cascades through three effects. Is that intended? Usually yes in this case, but mapping it out makes the flow visible.

### Step 2: Add $inspect.trace() to the Suspicious Effect

```svelte
<script>
  // Add to the effect that's misbehaving
  $effect(() => {
    $inspect.trace(); // ← Which signal triggered this?
    selectedId = results.length > 0 ? results[0].id : null;
  });
</script>
```

### Step 3: Check for Unintended Dependencies

A common bug is reading a signal you did not mean to depend on:

```svelte
<script>
  let config = $state({ pageSize: 20 });
  let page = $state(1);
  let data = $state([]);

  $effect(() => {
    $inspect.trace();
    // BUG: this effect depends on BOTH page AND config.pageSize
    // Changing config.pageSize re-fetches data even if that wasn't intended
    const offset = (page - 1) * config.pageSize;
    fetch(`/api/data?offset=${offset}&limit=${config.pageSize}`)
      .then(r => r.json())
      .then(d => { data = d; });
  });

  // FIX: if config.pageSize should not trigger a re-fetch,
  // read it outside the tracked scope
  import { untrack } from 'svelte';

  $effect(() => {
    const currentPage = page; // tracked
    const pageSize = untrack(() => config.pageSize); // not tracked
    const offset = (currentPage - 1) * pageSize;
    fetch(`/api/data?offset=${offset}&limit=${pageSize}`)
      .then(r => r.json())
      .then(d => { data = d; });
  });
</script>
```

## Common Reactivity Pitfalls

### Reading State After await

Svelte tracks which reactive values are read synchronously inside `$effect` and `$derived`. Any reads that happen after an `await` are not tracked:

```svelte
<script>
  let url = $state('/api/data');
  let filter = $state('all');

  // BAD: filter is read after await — not tracked
  $effect(() => {
    const res = await fetch(url);  // url IS tracked
    const data = await res.json();
    // filter is NOT tracked — this effect won't re-run when filter changes
    console.log(data.filter(d => d.type === filter));
  });

  // GOOD: read all dependencies before the first await
  $effect(() => {
    const currentUrl = url;         // tracked
    const currentFilter = filter;   // tracked

    fetch(currentUrl)
      .then(res => res.json())
      .then(data => {
        console.log(data.filter(d => d.type === currentFilter));
      });
  });
</script>
```

The mental model: Svelte records which signals are read during the synchronous execution of the effect function. After the first `await`, execution resumes asynchronously and reads are no longer tracked. Always capture all dependencies into local variables before any `await`.

### Infinite Loops in $effect

Reading and writing the same state inside an `$effect` creates an infinite loop — the write triggers a re-run, which reads the state, which writes again:

```svelte
<script>
  import { untrack } from 'svelte';

  let count = $state(0);
  let log = $state<string[]>([]);

  // BAD: infinite loop — reads log (dependency), then pushes to log (write)
  $effect(() => {
    log.push(`Count changed to ${count}`);
  });

  // GOOD: untrack the read of log so it's not a dependency
  $effect(() => {
    const currentCount = count; // tracked
    untrack(() => {
      log.push(`Count changed to ${currentCount}`);
    });
  });
</script>
```

The `untrack` function tells Svelte "do not track any reactive reads inside this callback." The effect still depends on `count`, but not on `log`.

### Mutating $state.raw Without Reassignment

`$state.raw` does not use proxies, so mutating the object directly will not trigger updates. You must reassign the entire value:

```svelte
<script>
  let items = $state.raw([1, 2, 3]);

  // BAD: mutation — no reactivity triggered
  items.push(4);

  // GOOD: reassignment — reactivity triggered
  items = [...items, 4];
</script>
```

`$state.raw` is for values where you want to opt out of deep reactivity for performance reasons (large arrays, complex objects you replace wholesale). If you need mutation-based reactivity, use regular `$state`.

### Using $effect Where $derived Would Work

If your effect only computes a value from other reactive state and has no side effects, `$derived` is the right choice:

```svelte
<script>
  let price = $state(10);
  let quantity = $state(2);
  let taxRate = $state(0.08);

  // BAD: using $effect to compute a value
  let total = $state(0);
  $effect(() => {
    total = (price * quantity) * (1 + taxRate);
  });

  // GOOD: use $derived — it's synchronous, glitch-free, and self-documenting
  let total = $derived((price * quantity) * (1 + taxRate));
</script>
```

Why is `$derived` better here? Three reasons: (1) It is synchronous — the value is always up-to-date when read, never stale for a frame. (2) It is glitch-free — intermediate states are never visible. (3) It communicates intent — "this is a computed value" vs "this is a side effect."

### Comparing Reactive Values with Object References

Two objects with the same contents are not the same reference. This catches people when they try to use `$derived` with objects:

```svelte
<script>
  let filters = $state({ search: '', category: 'all' });

  // This creates a NEW object every time any filter changes
  // which means $effect and $derived treat it as "changed" every time
  let activeFilters = $derived({
    search: filters.search,
    category: filters.category
  });

  // If you pass this to a child component, it will re-render every time
  // ANY filter changes, even if the specific filter it uses didn't change
</script>
```

## Debugging Network Issues in SvelteKit

### Load Function Debugging

Add strategic logging to your load functions to understand the server-side data flow:

```typescript
// src/routes/products/+page.server.ts
export async function load({ url, locals, depends }) {
  const start = performance.now();
  const category = url.searchParams.get('category') ?? 'all';

  console.log(`[load] /products category=${category} user=${locals.user?.id ?? 'anonymous'}`);

  depends('app:products');

  try {
    const products = await db.select().from(productsTable);
    const elapsed = Math.round(performance.now() - start);

    console.log(`[load] /products returned ${products.length} items in ${elapsed}ms`);

    return { products, category };
  } catch (error) {
    console.error(`[load] /products FAILED:`, error);
    throw error;
  }
}
```

### Debugging Invalidation

When data is not refreshing as expected, check what `depends` and `invalidate` keys are in play:

```svelte
<script>
  import { invalidate, invalidateAll } from '$app/navigation';

  // Debug: log every invalidation
  $effect(() => {
    console.log('Component re-rendered — data may have been invalidated');
  });
</script>
```

## Complete Debugging Workflow

Here is a systematic approach to debugging any reactivity issue:

### 1. Define the Problem

"The shopping cart total does not update when I change the quantity." Be specific.

### 2. Add $inspect to the Source Values

```svelte
<script>
  let cart = $state({ items: [...] });
  $inspect(cart); // Does the cart itself update?
</script>
```

### 3. Add $inspect to the Derived Values

```svelte
<script>
  let total = $derived(cart.items.reduce((sum, item) => sum + item.price * item.qty, 0));
  $inspect(total); // Does the total recalculate?
</script>
```

### 4. If an Effect is Suspect, Add $inspect.trace()

```svelte
<script>
  $effect(() => {
    $inspect.trace(); // What triggered this re-run?
    updateCartBadge(total);
  });
</script>
```

### 5. If Still Stuck, Use {@debug} to Pause and Inspect

```svelte
{@debug cart, total}
<p>Total: {total}</p>
```

### 6. Check for Common Pitfalls

- Are you reading state after `await`?
- Are you mutating `$state.raw` instead of reassigning?
- Are you using `$effect` where `$derived` would work?
- Is `untrack` hiding a dependency you need?
- Is a parent component's `{#key}` block destroying and recreating your component unexpectedly?

### 7. Use Browser DevTools

- **Console**: Check `$inspect` output
- **Sources**: Set breakpoints in compiled Svelte output
- **Network**: Verify server responses for SvelteKit load functions
- **Performance**: Profile render times for slow components
- **Svelte DevTools**: Inspect component tree, props, and state

## Practical Debugging Example

Here is a real bug and how you would find and fix it:

```svelte
<script>
  // BUG: search results don't clear when the user empties the search box

  let query = $state('');
  let results = $state<string[]>([]);
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    // Step 1: $inspect reveals the effect runs when query changes
    $inspect(query);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (query.length > 0) {
        const res = await fetch(`/api/search?q=${query}`);
        results = await res.json();
      }
      // BUG: no else clause to clear results when query is empty!
    }, 300);
  });

  // FIX:
  $effect(() => {
    const currentQuery = query; // captured before async

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (currentQuery.length > 0) {
        const res = await fetch(`/api/search?q=${currentQuery}`);
        results = await res.json();
      } else {
        results = []; // ← Clear results when query is empty
      }
    }, 300);
  });
</script>
```

## Try It

Create a component with a list of items (at least 5) and a text filter input. Wire up the filter with `$derived` to show only matching items. Add `$inspect` to the filter value, the derived filtered list, and the original items array. Then intentionally create an infinite loop: add an `$effect` that reads and writes the same array (for example, pushing a log entry every time the list changes). Observe the browser freezing or the console flooding. Fix it using `untrack`. Add `$inspect.trace()` inside the fixed effect to confirm which signal triggers each re-run. Finally, add `{@debug}` to the template to practice pausing at a reactive breakpoint and inspecting state in the DevTools scope.

## Key Takeaways

- `$inspect(value)` logs reactive values on every change and is automatically stripped from production builds — safe to leave in your code
- `$inspect(value).with(fn)` replaces `console.log` with a custom callback like `console.trace`, `debugger`, or a performance marker
- `$inspect.trace()` inside `$effect` or `$derived.by` reveals exactly which signals triggered the re-run — essential for complex dependency chains
- `{@debug variable}` pauses the browser debugger when the variable changes — a reactive breakpoint for deep inspection
- Use `$state.snapshot()` to get plain objects from reactive proxies for cleaner console output and external library compatibility
- Read all reactive dependencies before `await` in effects — post-await reads are not tracked by Svelte's dependency system
- Avoid reading and writing the same state in `$effect` — use `untrack` to break the cycle, or switch to `$derived` if you are just computing a value
- The Svelte DevTools extension provides a component tree, state inspector, and live editing of props and state values
- For SvelteKit debugging, watch `__data.json` requests in the Network tab and add timing logs to `load` functions
- Follow a systematic workflow: define the problem, inspect source values, inspect derived values, trace effects, check for common pitfalls, then use browser DevTools
