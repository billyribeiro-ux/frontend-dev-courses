# Debugging Reactivity

Reactive systems are powerful, but when something updates unexpectedly — or fails to update at all — they can be frustrating to debug. Svelte 5 provides dedicated tools for inspecting reactive state: `$inspect` for logging changes, `$inspect.trace()` for tracking signal dependencies, and `{@debug}` for pausing execution in the browser. Knowing when to reach for each one will save you hours of guesswork.

## $inspect

The `$inspect` rune logs a value to the console whenever it changes. It is the reactive equivalent of `console.log`, but it automatically re-runs when any dependency updates:

```svelte
<script>
  let count = $state(0);
  let name = $state('Alice');

  $inspect(count);
  // Logs: "init" 0
  // Logs: "update" 1 (after increment)
</script>

<button onclick={() => count++}>Count: {count}</button>
```

You can inspect multiple values at once by passing them as separate arguments:

```svelte
<script>
  let firstName = $state('Alice');
  let lastName = $state('Smith');

  $inspect(firstName, lastName);
  // Logs both values whenever either changes
</script>
```

The best part: `$inspect` is automatically stripped from production builds. You never need to remember to remove it before deploying.

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

Using `console.trace` is particularly powerful — it shows you the exact call stack that led to the state change, answering the question "what code caused this update?"

## $inspect.trace()

When an `$effect` or `$derived.by` re-runs and you cannot figure out why, `$inspect.trace()` tells you exactly which reactive signals triggered the re-run. Place it as the first line inside the effect:

```svelte
<script>
  let count = $state(0);
  let name = $state('Alice');
  let items = $state([1, 2, 3]);

  $effect(() => {
    $inspect.trace();
    // Now the console will show which of count, name, or items
    // triggered this particular re-run
    console.log('Effect ran:', count, name, items.length);
  });
</script>
```

The console output identifies the specific signals that changed, making it easy to spot unintended dependencies. This is available in Svelte 5.14 and later.

## The {@debug} Template Tag

The `{@debug}` tag pauses execution in the browser debugger whenever the specified variables change. It works like a reactive breakpoint:

```svelte
<script>
  let user = $state({ name: 'Alice', role: 'admin' });
  let items = $state([1, 2, 3]);
</script>

{@debug user, items}

<p>{user.name} has {items.length} items</p>
```

When `user` or `items` changes, the browser dev tools open at that exact point, letting you inspect the full component state. This only works with dev tools open and only in development mode — it has no effect in production.

A bare `{@debug}` without arguments pauses on every re-render of the template, which can help you understand how often a component updates.

## Browser DevTools Tips

Svelte's reactive proxies can look confusing in the console. When you log a `$state` object, you see a `Proxy` wrapper rather than plain data. Use `$state.snapshot()` to get a clean, plain-object copy:

```svelte
<script>
  let cart = $state({ items: [{ name: 'Widget', qty: 2 }] });

  function debugCart() {
    // Shows Proxy — hard to read
    console.log(cart);

    // Shows plain object — easy to read
    console.log($state.snapshot(cart));
  }
</script>
```

If your browser has a Svelte DevTools extension, the **Components** tab lets you inspect each component's props, state, and context in a tree view. You can edit state values directly in the panel to test different scenarios without changing code.

## Common Reactivity Pitfalls

### Reading State After await

Svelte tracks which reactive values are read synchronously inside `$effect` and `$derived`. Any reads that happen after an `await` are not tracked:

```svelte
<script>
  let url = $state('/api/data');
  let filter = $state('all');

  $effect(() => {
    // url IS tracked (read before await)
    const res = await fetch(url);
    const data = await res.json();

    // filter is NOT tracked (read after await)
    console.log(data.filter(d => d.type === filter));
  });

  // Fix: read all dependencies before the await
  $effect(() => {
    const currentUrl = url;
    const currentFilter = filter;

    fetch(currentUrl).then(res => res.json()).then(data => {
      console.log(data.filter(d => d.type === currentFilter));
    });
  });
</script>
```

### Infinite Loops in $effect

Reading and writing the same state inside an `$effect` creates an infinite loop — the write triggers a re-run, which writes again. Use `untrack` to break the cycle:

```svelte
<script>
  import { untrack } from 'svelte';

  let count = $state(0);
  let log = $state<string[]>([]);

  // BAD: infinite loop — reads log, then writes to log
  $effect(() => {
    log.push(`Count changed to ${count}`);
  });

  // GOOD: untrack the read of log
  $effect(() => {
    const currentCount = count; // tracked
    untrack(() => {
      log.push(`Count changed to ${currentCount}`);
    });
  });
</script>
```

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

### Using $effect Where $derived Would Work

If your effect only computes a value from other reactive state and has no side effects, `$derived` is the right choice. Effects that could be derived values are a common source of unnecessary complexity:

```svelte
<script>
  let price = $state(10);
  let quantity = $state(2);

  // BAD: using $effect to compute a value
  let total = $state(0);
  $effect(() => {
    total = price * quantity;
  });

  // GOOD: use $derived instead
  let total = $derived(price * quantity);
</script>
```

## Try It

Create a component with a list of items and a text filter. Add `$inspect` to watch the filtered results. Intentionally create an infinite loop with `$effect` (reading and writing the same array), then fix it using `untrack`. Use `$inspect.trace()` to confirm which signals trigger your effect after the fix.

## Key Takeaways

- `$inspect(value)` logs reactive values on every change and is stripped from production builds
- `$inspect(value).with(fn)` replaces `console.log` with a custom callback like `console.trace` or `debugger`
- `$inspect.trace()` inside `$effect` or `$derived.by` reveals which signals triggered the re-run
- `{@debug variable}` pauses the browser debugger when the variable changes — a reactive breakpoint
- Use `$state.snapshot()` to get plain objects from reactive proxies for cleaner console output
- Read all reactive dependencies before `await` in effects — post-await reads are not tracked
- Avoid reading and writing the same state in `$effect`; use `untrack` or switch to `$derived` when possible
