# Effects Mastery

You have used `$effect()` to run code when reactive state changes — logging values, updating the document title, syncing with external systems. But the effect system in Svelte 5 goes much deeper. There are specialized variants for timing-sensitive work, utilities for controlling dependency tracking, and critical patterns for avoiding the most common pitfall of all: the infinite loop.

This lesson covers every tool in the effect toolkit. You will learn the internals of dependency tracking, the precise timing of each effect variant, when to use effects versus derived values, and how to write effects that are clean, efficient, and bug-free. By the end, you will have the knowledge to debug any effect-related issue and the judgment to know when NOT to use an effect.

## How $effect() Works Under the Hood

Before diving into the variants, you need to understand the fundamental mechanism that powers all effects: **automatic dependency tracking via getters**.

When you write `$effect(() => { ... })`, Svelte does the following:

1. **Runs your function immediately** (after mount for component-level effects)
2. **Tracks every reactive value read** during execution — `$state`, `$derived`, and `$props` all register as dependencies because their compiled forms use getter functions that call into the signal system
3. **Stores the dependency list** for this effect
4. **When any dependency changes**, Svelte schedules the effect to re-run
5. **Before re-running**, Svelte calls any cleanup function returned from the previous run
6. **When the component is destroyed**, Svelte calls the final cleanup

The tracking happens through JavaScript's call stack. When your effect function executes, it sets a global "current subscriber" variable. Every signal getter checks for this subscriber and registers it. This is why tracking is synchronous — values read after an `await` are not tracked because the call stack has been unwound and restored by the time async execution resumes.

Here is a mental model:

```javascript
// Conceptually (not actual Svelte internals)
function $effect(fn) {
  const effect = {
    dependencies: new Set(),
    cleanup: null,
    run() {
      // Clean up from previous run
      if (this.cleanup) this.cleanup();

      // Set this effect as the "current subscriber"
      setCurrentSubscriber(this);

      // Run the function — any signal reads during this will add to dependencies
      this.cleanup = fn();

      // Unset the subscriber
      setCurrentSubscriber(null);
    }
  };

  // Schedule initial run after mount
  onMount(() => effect.run());
}
```

This "tracking context" approach is what makes Svelte's effects ergonomic — you do not declare dependencies manually (like React's `useEffect` dependency array). But it also means you must understand what gets tracked and what does not.

### What Gets Tracked vs What Does Not

```svelte
<script>
  let count = $state(0);
  let label = $state("Count");
  let config = { multiplier: 2 }; // NOT reactive — plain object

  $effect(() => {
    // TRACKED: count and label are reactive ($state signals)
    console.log(`${label}: ${count}`);

    // NOT TRACKED: config.multiplier is a plain object property
    // Changing config.multiplier will NOT re-run this effect
    console.log(`Multiplied: ${count * config.multiplier}`);

    // NOT TRACKED: values read inside untrack()
    // (covered in detail below)

    // NOT TRACKED: values read after await
    // (covered in the async section)
  });
</script>
```

## Review: $effect() Basics and Timing

`$effect()` runs a function after the component mounts and re-runs it whenever any reactive value read inside it changes. The timing is important: effects run **after the DOM has been updated**. This means you can safely read DOM measurements, scroll positions, and element dimensions inside an effect:

```svelte
<script>
  let count = $state(0);
  let paragraph;

  $effect(() => {
    // This runs AFTER the DOM reflects the current count value
    document.title = `Count: ${count}`;

    // Safe to read DOM — it is already updated
    if (paragraph) {
      console.log("Paragraph height:", paragraph.offsetHeight);
    }
  });
</script>

<p bind:this={paragraph}>The count is {count}</p>
<button onclick={() => count++}>Increment: {count}</button>
```

Every time `count` changes, the DOM updates first (the paragraph text changes), then the effect runs (the document title updates and the paragraph height is measured). The effect is automatically cleaned up when the component is destroyed.

### Effect Scheduling: When Exactly Do Effects Run?

Effects do not run synchronously when a state change happens. Svelte batches state changes and schedules effects using microtasks. The sequence is:

1. State changes happen (potentially many in the same event handler)
2. Svelte marks affected effects as "dirty"
3. At the end of the current microtask, Svelte processes all dirty effects
4. `$effect.pre()` effects run first
5. Svelte updates the DOM
6. `$effect()` effects run

This batching is critical for performance. If you set three state variables in one event handler, the associated effects run once, not three times:

```svelte
<script>
  let firstName = $state("Alex");
  let lastName = $state("Smith");
  let age = $state(25);

  let renderCount = 0;

  $effect(() => {
    renderCount++;
    console.log(`Effect ran (${renderCount}x): ${firstName} ${lastName}, age ${age}`);
  });

  function updateAll() {
    firstName = "Jordan";
    lastName = "Lee";
    age = 30;
    // The effect runs ONCE after all three changes, not three times
  }
</script>
```

## $effect.pre() — Before the DOM Updates

Standard `$effect()` runs **after** the DOM has been updated. But sometimes you need to read or measure the DOM **before** it changes — for example, saving the scroll position before new content is added so you can restore it afterward.

`$effect.pre()` runs at the same time as `$effect()` for dependency tracking, but it fires **before** Svelte updates the DOM:

```svelte
<script>
  let messages = $state([
    "Hello!",
    "How are you?",
    "Welcome to the chat."
  ]);

  let container;
  let shouldAutoScroll = $state(true);

  $effect.pre(() => {
    // This runs BEFORE the DOM updates
    // Read the scroll position while the DOM still reflects the OLD state
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // If the user is near the bottom, we should auto-scroll after update
      shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
    }

    // We access messages.length to track the dependency
    // Without reading a reactive value, this effect would never re-run
    messages.length;
  });

  $effect(() => {
    // This runs AFTER the DOM updates
    // Now we can safely scroll to the new bottom position
    if (shouldAutoScroll && container) {
      container.scrollTop = container.scrollHeight;
    }
  });

  function addMessage() {
    messages.push(`New message at ${new Date().toLocaleTimeString()}`);
  }
</script>

<div class="chat" bind:this={container}>
  {#each messages as msg}
    <p>{msg}</p>
  {/each}
</div>

<button onclick={addMessage}>Send Message</button>

<style>
  .chat {
    height: 200px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 12px;
  }
</style>
```

The sequence when a new message is added:
1. `messages.push()` marks the effect as dirty
2. `$effect.pre()` runs — reads scroll position from the OLD DOM
3. Svelte updates the DOM — new message appears
4. `$effect()` runs — scrolls to bottom if user was near bottom

Without `$effect.pre()`, you cannot read the pre-update DOM state. The regular `$effect()` only sees the DOM after the update.

### When You Actually Need $effect.pre()

In practice, `$effect.pre()` is needed for a small set of use cases:

- **Preserving scroll position** in chat-like interfaces (as shown above)
- **Capturing DOM measurements** before a layout change (element positions for animations)
- **Recording the "before" state** for transition effects that need both old and new values
- **Virtual scrolling implementations** where you need to know the current viewport before items change

If you are not doing DOM measurement or position-dependent logic before an update, you do not need `$effect.pre()`.

## $effect.tracking() — Detecting Reactive Context

`$effect.tracking()` returns `true` if the code is currently running inside a tracking context — an effect, a `$derived` computation, or template rendering. This is useful for conditionally setting up subscriptions only when someone is actually listening:

```svelte
<script>
  function createTimer(intervalMs = 1000) {
    let time = $state(new Date());

    $effect(() => {
      // Only run the interval if something is actually reading the time
      if (!$effect.tracking()) return;

      const interval = setInterval(() => {
        time = new Date();
      }, intervalMs);

      return () => clearInterval(interval);
    });

    return {
      get time() { return time; },
      get formatted() {
        return time.toLocaleTimeString();
      }
    };
  }

  const clock = createTimer();
</script>

<p>Current time: {clock.formatted}</p>
```

### Why This Pattern Matters

The `$effect.tracking()` check is primarily useful in library code. Consider a reactive data source that is expensive to maintain — a WebSocket connection, a polling interval, or an event stream. You only want to establish the connection when something is actually consuming the data:

```typescript
// src/lib/stores/live-price.svelte.ts
export function createLivePrice(symbol: string) {
  let price = $state<number | null>(null);
  let status = $state<"disconnected" | "connecting" | "connected">("disconnected");

  $effect(() => {
    if (!$effect.tracking()) return;

    status = "connecting";
    const ws = new WebSocket(`wss://prices.example.com/${symbol}`);

    ws.onopen = () => { status = "connected"; };
    ws.onmessage = (event) => { price = JSON.parse(event.data).price; };
    ws.onclose = () => { status = "disconnected"; };

    return () => {
      ws.close();
      status = "disconnected";
    };
  });

  return {
    get price() { return price; },
    get status() { return status; }
  };
}
```

If a component imports this but never renders the price in the template, the WebSocket is never opened. The connection only exists when the data is actively consumed.

## $effect.root() — Standalone Effect Scopes

Normally, effects are tied to a component's lifecycle and are automatically cleaned up when the component is destroyed. `$effect.root()` creates an independent effect scope that lives outside the component lifecycle. You must manually clean it up:

```typescript
const cleanup = $effect.root(() => {
  // Effects created inside here are NOT tied to any component
  $effect(() => {
    console.log("This persists beyond component lifecycle");
  });

  // You can nest multiple effects
  $effect(() => {
    console.log("This also persists");
  });
});

// Later, when you are done — call the cleanup function
// This tears down ALL effects created inside the root
cleanup();
```

### Use Cases for $effect.root()

**Module-level effects:** When you need an effect in a `.svelte.ts` module file that is not associated with any component:

```typescript
// src/lib/stores/auth.svelte.ts
let user = $state<User | null>(null);
let token = $state<string | null>(null);

// This effect runs at module import time and persists for the app's lifetime
const cleanup = $effect.root(() => {
  $effect(() => {
    // Sync auth state to localStorage whenever it changes
    if (token) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
    }
  });
});

export function login(newUser: User, newToken: string) {
  user = newUser;
  token = newToken;
}

export function logout() {
  user = null;
  token = null;
}

export { user, token };
```

**Testing:** When you want to test reactive behavior outside a component:

```typescript
import { describe, it, expect } from "vitest";

it("tracks count changes", () => {
  let count = $state(0);
  let log: number[] = [];

  const cleanup = $effect.root(() => {
    $effect(() => {
      log.push(count);
    });
  });

  count = 1;
  count = 2;
  // After flushing, log should contain [0, 1, 2]

  cleanup();
});
```

**Framework utilities:** Building reactive primitives that need their own effect lifecycle, independent of any specific component.

Use `$effect.root()` sparingly. In most application code, effects are tied to components, and the component lifecycle handles cleanup automatically.

## untrack() — Reading Without Subscribing

By default, every reactive value you read inside an `$effect()` becomes a dependency. `untrack()` lets you read a value without adding it as a dependency:

```svelte
<script>
  import { untrack } from "svelte";

  let searchTerm = $state("");
  let logCount = $state(0);

  $effect(() => {
    // We want to re-run when searchTerm changes
    console.log(`Search: "${searchTerm}"`);

    // But reading logCount should NOT cause a re-run
    untrack(() => {
      logCount++;
    });
  });
</script>

<input type="text" bind:value={searchTerm} placeholder="Search..." />
<p>Effect ran {logCount} times</p>
```

Without `untrack`, this effect would create an **infinite loop**: the effect reads `logCount` (dependency), which increments `logCount` (triggers re-run), which reads `logCount` again, forever. `untrack()` breaks the cycle by telling Svelte "I am reading this value, but do not track it as a dependency."

### When to Use untrack()

**Logging and analytics:** You want to track how many times an effect runs, but the counter itself should not trigger re-runs:

```svelte
<script>
  import { untrack } from "svelte";

  let query = $state("");
  let analytics = $state({ searchCount: 0, lastSearch: "" });

  $effect(() => {
    // Track this dependency — re-run when query changes
    const currentQuery = query;

    // Update analytics WITHOUT creating a dependency
    untrack(() => {
      analytics.searchCount++;
      analytics.lastSearch = currentQuery;
    });

    // Perform the actual search
    performSearch(currentQuery);
  });
</script>
```

**Accessing config or context that should not trigger re-runs:**

```svelte
<script>
  import { untrack } from "svelte";

  let data = $state([]);
  let config = $state({ apiUrl: "https://api.example.com", timeout: 5000 });

  $effect(() => {
    // Re-run when data changes
    const items = data;

    // Read config without tracking — we don't want to re-run
    // when someone changes the API URL
    const url = untrack(() => config.apiUrl);

    // Process items using the url
    console.log(`Processing ${items.length} items from ${url}`);
  });
</script>
```

**Reading from one piece of state while writing to another:**

```svelte
<script>
  import { untrack } from "svelte";

  let source = $state(0);
  let destination = $state(0);

  $effect(() => {
    // Track source — re-run when it changes
    const value = source;

    // Write to destination without tracking the read of destination
    untrack(() => {
      destination = value * 2;
    });
  });
</script>
```

## tick() — Waiting for DOM Updates

State changes in Svelte are batched and applied asynchronously. If you change a value and immediately try to read the DOM, it will not reflect the change yet. `tick()` returns a promise that resolves after all pending state changes have been applied to the DOM:

```svelte
<script>
  import { tick } from "svelte";

  let items = $state(["Apple", "Banana"]);
  let list;

  async function addAndMeasure() {
    items.push("Cherry");

    // DOM has NOT updated yet — Svelte is still batching
    console.log("Before tick:", list?.children.length); // Still 2

    await tick();

    // DOM is now updated — all pending changes have been flushed
    console.log("After tick:", list?.children.length); // Now 3

    // Safe to measure or manipulate the updated DOM
    const lastItem = list?.lastElementChild;
    lastItem?.scrollIntoView({ behavior: "smooth" });
  }
</script>

<ul bind:this={list}>
  {#each items as item}
    <li>{item}</li>
  {/each}
</ul>

<button onclick={addAndMeasure}>Add & Scroll</button>
```

### When to Use tick() vs flushSync()

Both `tick()` and `flushSync()` force state changes to be applied, but they differ in timing:

- **`tick()`** — waits for the next microtask. Your code after `await tick()` runs after the DOM update but NOT synchronously. Other code may run between your state change and the `await tick()` resolution.
- **`flushSync()`** — forces immediate, synchronous processing. Your code after `flushSync()` runs immediately after the DOM update, in the same synchronous execution block.

```svelte
<script>
  import { tick } from "svelte";

  let items = $state(["A", "B"]);
  let listEl;

  // Using tick() — async, batches with other updates
  async function addWithTick() {
    items.push("C");
    await tick();
    // DOM updated — but this line runs asynchronously
    listEl.lastElementChild.scrollIntoView();
  }

  // Using tick() in a non-async context — returns a promise
  function addNonAsync() {
    items.push("D");
    tick().then(() => {
      listEl.lastElementChild.scrollIntoView();
    });
  }
</script>
```

Use `tick()` when you need to wait for DOM updates in async code. Use `flushSync()` when you need synchronous DOM updates in event handlers.

## flushSync() — Forcing Synchronous Updates

In rare cases, you need the DOM to update **immediately** within the same synchronous execution block. `flushSync()` forces Svelte to process all pending updates right now:

```svelte
<script>
  import { flushSync } from "svelte";

  let count = $state(0);
  let display;

  function incrementAndMeasure() {
    flushSync(() => {
      count++;
    });

    // DOM is already updated — no need for tick() or await
    console.log("Display shows:", display?.textContent);
    // Output: "Display shows: Count: 1"
  }

  // Multiple flushSync calls in sequence
  function multiStep() {
    flushSync(() => { count = 10; });
    console.log("Step 1:", display?.textContent); // "Count: 10"

    flushSync(() => { count = 20; });
    console.log("Step 2:", display?.textContent); // "Count: 20"

    flushSync(() => { count = 30; });
    console.log("Step 3:", display?.textContent); // "Count: 30"
  }
</script>

<p bind:this={display}>Count: {count}</p>
<button onclick={incrementAndMeasure}>Increment</button>
<button onclick={multiStep}>Multi-step</button>
```

### Real Use Case: Textarea Auto-Resize

A practical use of `flushSync` — auto-resizing a textarea by measuring its scroll height after each input:

```svelte
<script>
  import { flushSync } from "svelte";

  let text = $state("");
  let textarea;

  function handleInput(event) {
    // Update state synchronously so we can measure the DOM immediately
    flushSync(() => {
      text = event.currentTarget.value;
    });

    // Now the DOM reflects the new text — measure and resize
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  }
</script>

<textarea
  bind:this={textarea}
  value={text}
  oninput={handleInput}
  style="resize: none; overflow: hidden;"
></textarea>
```

Without `flushSync`, measuring `scrollHeight` would return the height before the text update, causing a one-character lag in the resize.

**Use `flushSync` sparingly.** It breaks Svelte's batching optimization and forces immediate rendering. It is useful for situations like measuring DOM elements after a state change within the same event handler, or when building drag-and-drop interactions that need frame-accurate DOM state.

## Cleanup Patterns

Effects often set up resources that need to be torn down — event listeners, intervals, subscriptions, WebSocket connections. Return a cleanup function from your effect, and Svelte will call it before the effect re-runs and when the component is destroyed:

```svelte
<script>
  let windowWidth = $state(window.innerWidth);
  let online = $state(navigator.onLine);
  let mousePosition = $state({ x: 0, y: 0 });

  // Pattern 1: Single event listener
  $effect(() => {
    function handleResize() {
      windowWidth = window.innerWidth;
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Pattern 2: Multiple event listeners
  $effect(() => {
    function goOnline() { online = true; }
    function goOffline() { online = false; }

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  });

  // Pattern 3: Mouse tracking with throttle
  $effect(() => {
    let frameId;
    function handleMouseMove(event) {
      // Use requestAnimationFrame to throttle updates
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        mousePosition = { x: event.clientX, y: event.clientY };
      });
    }

    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  });
</script>

<p>Window width: {windowWidth}px</p>
<p>Status: {online ? "Online" : "Offline"}</p>
<p>Mouse: {mousePosition.x}, {mousePosition.y}</p>
```

### Cleanup Timing

The cleanup function runs at two specific times:
1. **Before the effect re-runs** — when a dependency changes, Svelte calls cleanup from the previous run, then runs the effect again
2. **When the component is destroyed** — Svelte calls cleanup one final time

This means each effect run can set up its own resources knowing that the previous run's resources have been cleaned up. The pattern is:

```
Mount → effect runs → (state changes) → cleanup → effect re-runs → (state changes) → cleanup → effect re-runs → ... → component destroy → final cleanup
```

### Comprehensive WebSocket Example

Here is a real-world effect that manages a WebSocket connection with reconnection logic:

```svelte
<script>
  let channel = $state("general");
  let messages = $state([]);
  let connectionStatus = $state("disconnected");

  $effect(() => {
    // Track the channel — reconnect when it changes
    const currentChannel = channel;
    let ws;
    let reconnectTimeout;
    let isCleanedUp = false;

    function connect() {
      if (isCleanedUp) return;

      connectionStatus = "connecting";
      ws = new WebSocket(`wss://chat.example.com/${currentChannel}`);

      ws.onopen = () => {
        if (isCleanedUp) { ws.close(); return; }
        connectionStatus = "connected";
      };

      ws.onmessage = (event) => {
        if (isCleanedUp) return;
        const msg = JSON.parse(event.data);
        messages.push(msg);
      };

      ws.onclose = () => {
        if (isCleanedUp) return;
        connectionStatus = "disconnected";
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      ws.onerror = () => {
        connectionStatus = "error";
      };
    }

    connect();

    // Cleanup: close WebSocket and cancel reconnect on channel change or unmount
    return () => {
      isCleanedUp = true;
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.close();
      }
      connectionStatus = "disconnected";
    };
  });
</script>

<div>
  <select bind:value={channel}>
    <option value="general">General</option>
    <option value="tech">Tech</option>
    <option value="random">Random</option>
  </select>

  <span class="status {connectionStatus}">{connectionStatus}</span>
</div>

<div class="messages">
  {#each messages as msg}
    <p><strong>{msg.user}:</strong> {msg.text}</p>
  {/each}
</div>
```

The `isCleanedUp` flag is a crucial pattern for async cleanup. When the channel changes, the cleanup function runs (setting `isCleanedUp = true`), but the WebSocket's `onopen` or `onmessage` callbacks might still fire. The flag prevents stale callbacks from mutating state after cleanup.

## Async Caveats

Effects can contain asynchronous code, but there is a critical rule: **values read after an `await` are NOT tracked** as dependencies. Svelte tracks dependencies synchronously during the initial execution of the effect function:

```svelte
<script>
  let userId = $state(1);
  let includeDetails = $state(false);

  $effect(() => {
    // TRACKED — read before any await
    const id = userId;
    const details = includeDetails;

    // Start async operation
    async function fetchUser() {
      const url = details
        ? `/api/users/${id}?details=true`
        : `/api/users/${id}`;

      const response = await fetch(url);

      // NOTHING read after this point is tracked
      // Even if you read another $state variable here,
      // it will NOT cause the effect to re-run
      const data = await response.json();
      console.log(data);
    }

    fetchUser();
  });
</script>
```

**The fix is simple:** read all reactive values you want to track **before** any `await` statement. Assign them to local variables first, then use those variables in your async logic.

### Common Async Effect Pattern

```svelte
<script>
  let query = $state("");
  let results = $state([]);
  let loading = $state(false);

  $effect(() => {
    // Read the dependency FIRST
    const currentQuery = query;

    // Guard: skip empty searches
    if (!currentQuery.trim()) {
      results = [];
      return;
    }

    // Use an abort controller for cancellation
    const controller = new AbortController();
    loading = true;

    async function search() {
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(currentQuery)}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        results = data;
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Search failed:", err);
        }
      } finally {
        loading = false;
      }
    }

    search();

    // Cleanup: abort the fetch if the query changes before it completes
    return () => controller.abort();
  });
</script>

<input type="text" bind:value={query} placeholder="Search..." />

{#if loading}
  <p>Searching...</p>
{:else}
  <ul>
    {#each results as result}
      <li>{result.title}</li>
    {/each}
  </ul>
{/if}
```

This pattern handles the three critical async challenges:
1. **Dependencies are read synchronously** before any async work
2. **AbortController cancels stale requests** when the query changes before the previous fetch completes
3. **Cleanup function aborts the fetch** on component destroy or re-run

## Common Pitfall: Infinite Loops

The most frequent `$effect` bug is the infinite loop — an effect that reads and writes the same reactive value:

```svelte
<script>
  let count = $state(0);

  // INFINITE LOOP — reads count, then writes count, which triggers the effect again
  // $effect(() => {
  //   count = count + 1;
  // });
</script>
```

Svelte 5 has built-in infinite loop detection and will throw an error after a certain number of iterations. But it is better to avoid the pattern entirely.

### Three Ways to Fix Infinite Loops

**1. Use `untrack()` to read without tracking:**

```svelte
<script>
  import { untrack } from "svelte";

  let count = $state(0);

  $effect(() => {
    const current = untrack(() => count);
    // Now we can read count's value without creating a dependency
    // Only use this when you specifically need to avoid tracking
  });
</script>
```

**2. Use `$derived` instead of `$effect` (preferred in most cases):**

```svelte
<script>
  let count = $state(0);

  // WRONG: effect that computes a value
  // let doubled = $state(0);
  // $effect(() => {
  //   doubled = count * 2; // Reads count, writes doubled — but doubled is what we want to compute!
  // });

  // CORRECT: derived value
  let doubled = $derived(count * 2);
</script>
```

**3. Separate the read and write into different variables:**

```svelte
<script>
  let input = $state(0);
  let output = $state(0);

  $effect(() => {
    // Reads input, writes output — no cycle
    output = input * 2;
  });
</script>
```

### The Golden Rule: Effects Are for Side Effects, Not Computations

If your effect exists to compute a value from other reactive values, it should be `$derived`. Effects are for **side effects** — things that interact with the world outside Svelte's reactivity system:

```svelte
<script>
  let count = $state(0);

  // COMPUTATION — use $derived
  let doubled = $derived(count * 2);
  let isEven = $derived(count % 2 === 0);
  let label = $derived(`Count is ${count}`);

  // SIDE EFFECTS — use $effect
  $effect(() => {
    document.title = label;              // DOM mutation
  });
  $effect(() => {
    analytics.track("count_changed", count); // External API
  });
  $effect(() => {
    localStorage.setItem("count", count);    // Browser storage
  });
</script>
```

A good test: "Can I express this as `$derived(expression)`?" If yes, use `$derived`. If no (because it involves DOM manipulation, API calls, timers, or other external interactions), use `$effect`.

## $effect.pending — Tracking Unresolved Async Operations

`$effect.pending()` returns the number of unresolved async operations within the current `{#await}` boundary. Instead of tracking individual promises one by one, it gives you a single count of everything that is still loading — making it ideal for building unified loading indicators.

```svelte
<script>
  let userPromise = $state(fetchUser());
  let postsPromise = $state(fetchPosts());
  let commentsPromise = $state(fetchComments());

  async function fetchUser() {
    const res = await fetch("/api/user");
    return res.json();
  }

  async function fetchPosts() {
    const res = await fetch("/api/posts");
    return res.json();
  }

  async function fetchComments() {
    const res = await fetch("/api/comments");
    return res.json();
  }

  function refreshAll() {
    userPromise = fetchUser();
    postsPromise = fetchPosts();
    commentsPromise = fetchComments();
  }
</script>

{#if $effect.pending()}
  <div class="loading-bar">
    Loading... ({$effect.pending()} pending)
  </div>
{/if}

{#await userPromise then user}
  <h1>{user.name}</h1>
{/await}

{#await postsPromise then posts}
  <ul>
    {#each posts as post}
      <li>{post.title}</li>
    {/each}
  </ul>
{/await}

{#await commentsPromise then comments}
  <p>{comments.length} comments</p>
{/await}

<button onclick={refreshAll}>Refresh All</button>
```

In this example, `$effect.pending()` returns `3` when all three fetches are in flight, `2` when one has resolved, and so on down to `0`. This lets you build a single global loading indicator that automatically reflects the true loading state without manually combining boolean flags.

### Building a Progress Bar with $effect.pending()

```svelte
<script>
  let totalOperations = $state(0);

  let pendingCount = $derived($effect.pending());
  let progress = $derived(
    totalOperations > 0 ? ((totalOperations - pendingCount) / totalOperations) * 100 : 0
  );

  function startOperations() {
    totalOperations = 5;
    // Start 5 async operations with varying durations
    // The progress bar automatically reflects completion
  }
</script>

{#if pendingCount > 0}
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress}%"></div>
  </div>
  <p>{pendingCount} operations remaining</p>
{/if}
```

## Building Reusable Effect-Based Utilities

One of the best uses of effects is building reusable reactive utilities. Here are patterns from production codebases:

### Debounced Value

```typescript
// src/lib/utils/debounce.svelte.ts
export function createDebouncedValue<T>(getter: () => T, delayMs: number) {
  let value = $state<T>(getter());
  let timeoutId: ReturnType<typeof setTimeout>;

  $effect(() => {
    const newValue = getter(); // Track the dependency

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      value = newValue;
    }, delayMs);

    return () => clearTimeout(timeoutId);
  });

  return {
    get value() { return value; }
  };
}
```

Usage:

```svelte
<script>
  import { createDebouncedValue } from "$lib/utils/debounce.svelte";

  let search = $state("");
  const debounced = createDebouncedValue(() => search, 300);

  // debounced.value updates 300ms after the last keystroke
  $effect(() => {
    if (debounced.value) {
      fetchResults(debounced.value);
    }
  });
</script>

<input bind:value={search} />
<p>Searching for: {debounced.value}</p>
```

### Media Query Matcher

```typescript
// src/lib/utils/media-query.svelte.ts
export function createMediaQuery(query: string) {
  let matches = $state(false);

  $effect(() => {
    const mediaQuery = window.matchMedia(query);
    matches = mediaQuery.matches;

    function handler(event: MediaQueryListEvent) {
      matches = event.matches;
    }

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  });

  return {
    get matches() { return matches; }
  };
}
```

### Intersection Observer

```typescript
// src/lib/utils/intersection.svelte.ts
export function createIntersectionObserver(
  getElement: () => HTMLElement | null,
  options: IntersectionObserverInit = {}
) {
  let isIntersecting = $state(false);
  let ratio = $state(0);

  $effect(() => {
    const element = getElement();
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        isIntersecting = entry.isIntersecting;
        ratio = entry.intersectionRatio;
      },
      options
    );

    observer.observe(element);
    return () => observer.disconnect();
  });

  return {
    get isIntersecting() { return isIntersecting; },
    get ratio() { return ratio; }
  };
}
```

Usage:

```svelte
<script>
  import { createIntersectionObserver } from "$lib/utils/intersection.svelte";

  let element;
  const visibility = createIntersectionObserver(() => element, { threshold: 0.5 });
</script>

<div bind:this={element} class:visible={visibility.isIntersecting}>
  {visibility.isIntersecting ? "In view!" : "Not visible"}
</div>
```

## Practical Example: Complete Debugging Dashboard

This component demonstrates multiple effect patterns working together — dependency tracking, cleanup, timing, and `untrack`:

```svelte
<script>
  import { untrack, tick } from "svelte";

  // Reactive state
  let query = $state("");
  let results = $state([]);
  let loading = $state(false);
  let windowWidth = $state(window.innerWidth);
  let isCompact = $derived(windowWidth < 768);

  // Debug state — tracked separately to avoid effect loops
  let effectLog = $state([]);
  let renderCount = $state(0);

  // Effect 1: Window resize tracking with cleanup
  $effect(() => {
    function handleResize() {
      windowWidth = window.innerWidth;
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Effect 2: Search with debounce, abort controller, and logging
  $effect(() => {
    const currentQuery = query;

    if (!currentQuery.trim()) {
      results = [];
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      loading = true;

      // Log the search WITHOUT creating a dependency on effectLog
      untrack(() => {
        effectLog = [...effectLog, {
          time: new Date().toLocaleTimeString(),
          action: `Searching: "${currentQuery}"`
        }].slice(-10); // Keep last 10 entries
      });

      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(currentQuery)}`,
          { signal: controller.signal }
        );
        const data = await response.json();
        results = data;

        untrack(() => {
          effectLog = [...effectLog, {
            time: new Date().toLocaleTimeString(),
            action: `Found ${data.length} results`
          }].slice(-10);
        });
      } catch (err) {
        if (err.name !== "AbortError") {
          untrack(() => {
            effectLog = [...effectLog, {
              time: new Date().toLocaleTimeString(),
              action: `Error: ${err.message}`
            }].slice(-10);
          });
        }
      } finally {
        loading = false;
      }
    }, 300);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  });

  // Effect 3: Render counting (demonstrates untrack for self-referencing)
  $effect(() => {
    // Track query and results
    query;
    results;

    // Increment render count without tracking it
    untrack(() => {
      renderCount++;
    });
  });

  // Effect 4: Document title (simple side effect)
  $effect(() => {
    const count = results.length;
    document.title = count > 0
      ? `${count} results for "${query}"`
      : "Search Dashboard";
  });
</script>

<div class="dashboard" class:compact={isCompact}>
  <header>
    <h1>Search Dashboard</h1>
    <span class="meta">
      Renders: {renderCount} | Width: {windowWidth}px | Layout: {isCompact ? "Compact" : "Full"}
    </span>
  </header>

  <input
    type="text"
    bind:value={query}
    placeholder="Search..."
    class="search-input"
  />

  <div class="content">
    <section class="results">
      {#if loading}
        <p class="status">Searching...</p>
      {:else if results.length > 0}
        <ul>
          {#each results as result}
            <li>{result.title}</li>
          {/each}
        </ul>
      {:else if query}
        <p class="status">No results</p>
      {:else}
        <p class="status">Type to search</p>
      {/if}
    </section>

    <aside class="log">
      <h3>Effect Log</h3>
      {#each effectLog as entry}
        <p><span class="time">{entry.time}</span> {entry.action}</p>
      {/each}
    </aside>
  </div>
</div>

<style>
  .dashboard {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, sans-serif;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 16px;
  }

  .meta {
    font-size: 0.8rem;
    color: #888;
  }

  .search-input {
    width: 100%;
    padding: 12px;
    font-size: 1rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    margin-bottom: 16px;
  }

  .search-input:focus {
    border-color: #3b82f6;
    outline: none;
  }

  .content {
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: 20px;
  }

  .compact .content {
    grid-template-columns: 1fr;
  }

  .results ul {
    list-style: none;
    padding: 0;
  }

  .results li {
    padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0;
  }

  .status {
    color: #888;
    font-style: italic;
  }

  .log {
    background: #f9fafb;
    border-radius: 8px;
    padding: 12px;
    font-size: 0.85rem;
  }

  .log p {
    margin: 4px 0;
  }

  .time {
    color: #6b7280;
    font-family: monospace;
  }
</style>
```

This dashboard uses:
- **`$effect()` with cleanup** for window resize (event listener pattern)
- **`$effect()` with async + abort** for debounced search (timeout + AbortController cleanup)
- **`untrack()`** to update the effect log and render counter without creating dependencies
- **`$derived()`** for computed values (isCompact) instead of effects
- **Proper dependency tracking** — all reactive reads happen synchronously before async boundaries

## Try It

Build a "Live Markdown Preview" component that exercises every effect tool:

1. Use `$state()` for a textarea that holds markdown text
2. Use `$effect()` with a cleanup function to debounce preview rendering (set a 300ms timeout, clear it on re-run)
3. Use `$effect.pre()` to save the scroll position of the preview pane before the HTML updates
4. Use `$effect()` to restore the scroll position after the DOM updates
5. Use `tick()` after updating the preview HTML to measure the rendered content's height
6. Track the window width with an `$effect()` and event listener cleanup pattern, and switch to a stacked layout below 768px
7. Use `untrack()` to read and update a "last rendered" timestamp without creating a dependency loop
8. Add a "render count" display that uses `untrack()` to increment without causing re-runs
9. Implement keyboard shortcut effects (Ctrl+B for bold, Ctrl+I for italic) with proper cleanup

## Key Takeaways

- `$effect()` runs after mount and after reactive dependencies change — dependencies are tracked automatically by reading reactive values during synchronous execution
- **Effects are for side effects, not computations** — if you can express something as `$derived(expression)`, do that instead of `$effect(() => { value = expression })`
- `$effect.pre()` runs before DOM updates — use it to measure or preserve DOM state (scroll positions, element dimensions)
- `$effect.tracking()` checks if code is running in a tracking context — useful for library code that conditionally sets up expensive subscriptions
- `$effect.root()` creates standalone effect scopes that must be manually cleaned up — use for module-level effects, testing, or framework utilities
- `$effect.pending()` returns the count of unresolved async operations in the current `{#await}` boundary — useful for unified loading indicators
- `untrack()` reads a reactive value without adding it as a dependency — essential for avoiding infinite loops and for logging/analytics in effects
- `tick()` waits for pending DOM updates (async); `flushSync()` forces immediate synchronous DOM updates — use `tick()` by default, `flushSync()` only when you need synchronous DOM access
- **Always return a cleanup function** when your effect sets up listeners, intervals, subscriptions, or timers — this prevents memory leaks and stale callbacks
- **Values read after `await` are NOT tracked** — read all dependencies into local variables before any async boundary
- **Infinite loops** happen when an effect reads and writes the same variable — fix with `untrack()`, `$derived`, or by separating read and write variables
- **Effect batching** means multiple state changes in one handler trigger effects once, not once per change — this is a performance feature, not a bug
