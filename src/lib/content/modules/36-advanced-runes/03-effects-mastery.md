# Effects Mastery

You have used `$effect()` to run code when reactive state changes — logging values, updating the document title, syncing with external systems. But the effect system in Svelte 5 goes much deeper. There are specialized variants for timing-sensitive work, utilities for controlling dependency tracking, and critical patterns for avoiding the most common pitfall of all: the infinite loop.

This lesson covers every tool in the effect toolkit. By the end, you will know exactly when to reach for each one and how to write effects that are clean, efficient, and bug-free.

## Review: $effect() Basics

`$effect()` runs a function after the component mounts and re-runs it whenever any reactive value read inside it changes. Svelte automatically tracks dependencies — you do not declare them manually:

```svelte
<script>
  let count = $state(0);

  $effect(() => {
    document.title = `Count: ${count}`;
  });
</script>

<button onclick={() => count++}>Increment: {count}</button>
```

Every time `count` changes, the effect re-runs and updates the document title. The effect is automatically cleaned up when the component is destroyed.

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
    // Read the scroll position BEFORE new messages cause a DOM update
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      shouldAutoScroll = scrollHeight - scrollTop - clientHeight < 50;
    }

    // We access messages.length to track the dependency
    messages.length;
  });

  $effect(() => {
    // After the DOM updates, scroll to bottom if user was already there
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

Use `$effect.pre()` when you need to measure or read the DOM before it is modified by a state change.

## $effect.tracking() — Am I Being Tracked?

`$effect.tracking()` returns `true` if the code is currently running inside a tracking context — an effect, a `$derived` computation, or template rendering. This is useful for conditionally setting up subscriptions only when someone is actually listening:

```svelte
<script>
  import { onDestroy } from "svelte";

  function createTimer() {
    let time = $state(new Date());

    // Only set up the interval if this state is being tracked
    $effect(() => {
      if ($effect.tracking()) {
        const interval = setInterval(() => {
          time = new Date();
        }, 1000);

        return () => clearInterval(interval);
      }
    });

    return {
      get time() { return time; }
    };
  }

  const clock = createTimer();
</script>

<p>Current time: {clock.time.toLocaleTimeString()}</p>
```

This pattern is most useful in library code where you create reusable reactive primitives and want to avoid unnecessary work when nothing is consuming the value.

## $effect.root() — Standalone Effect Scopes

Normally, effects are tied to a component's lifecycle and are automatically cleaned up when the component is destroyed. `$effect.root()` creates an independent effect scope that lives outside the component lifecycle. You must manually clean it up:

```typescript
const cleanup = $effect.root(() => {
  // This effect will NOT be cleaned up when the component is destroyed.
  // It keeps running until you call cleanup().
  $effect(() => {
    console.log("This persists beyond component lifecycle");
  });
});

// Later, when you are done:
cleanup();
```

Use `$effect.root()` sparingly. It is designed for advanced scenarios like building framework utilities, creating effects in module-level code, or managing subscriptions that should outlive a single component. In most application code you will never need it.

## untrack() — Reading Without Tracking

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

Without `untrack`, this effect would create an **infinite loop**: the effect reads `logCount`, which changes `logCount`, which triggers the effect, which reads `logCount`, forever. `untrack()` breaks the cycle by telling Svelte "I am reading this value, but do not track it as a dependency."

## tick() — Waiting for DOM Updates

State changes in Svelte are batched and applied asynchronously. If you change a value and immediately try to read the DOM, it will not reflect the change yet. `tick()` returns a promise that resolves after all pending state changes have been applied to the DOM:

```svelte
<script>
  import { tick } from "svelte";

  let items = $state(["Apple", "Banana"]);
  let list;

  async function addAndMeasure() {
    items.push("Cherry");

    // DOM has NOT updated yet
    console.log("Before tick:", list?.children.length); // Still 2

    await tick();

    // DOM is now updated
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

## flushSync() — Forcing Synchronous Updates

In rare cases, you need the DOM to update **immediately** within the same synchronous execution block. `flushSync()` forces Svelte to process all pending updates right away:

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
  }
</script>

<p bind:this={display}>Count: {count}</p>
<button onclick={incrementAndMeasure}>Increment</button>
```

Use `flushSync` sparingly. It breaks Svelte's batching optimization and forces immediate rendering. It is useful for situations like measuring DOM elements after a state change within the same event handler.

## Cleanup Patterns

Effects often set up resources that need to be torn down — event listeners, intervals, subscriptions, WebSocket connections. Return a cleanup function from your effect, and Svelte will call it before the effect re-runs and when the component is destroyed:

```svelte
<script>
  let windowWidth = $state(window.innerWidth);
  let online = $state(navigator.onLine);

  // Cleanup: event listener
  $effect(() => {
    function handleResize() {
      windowWidth = window.innerWidth;
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  });

  // Cleanup: multiple listeners
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
</script>

<p>Window width: {windowWidth}px</p>
<p>Status: {online ? "Online" : "Offline"}</p>
```

Every effect that allocates a resource should return a cleanup function. This prevents memory leaks and stale subscriptions.

## Async Caveats

Effects can contain asynchronous code, but there is a critical rule: **values read after an `await` are NOT tracked** as dependencies. Svelte tracks dependencies synchronously during the initial execution of the effect function:

```svelte
<script>
  let userId = $state(1);

  $effect(() => {
    // userId IS tracked — read before await
    const id = userId;

    async function fetchUser() {
      const response = await fetch(`/api/users/${id}`);
      // Anything read here is NOT tracked
      const data = await response.json();
      console.log(data);
    }

    fetchUser();
  });
</script>
```

Read all reactive values you want to track **before** any `await` statement. Assign them to local variables first, then use those variables in your async logic.

## Common Pitfall: Infinite Loops

The most frequent `$effect` bug is the infinite loop — an effect that reads and writes the same reactive value:

```svelte
<script>
  let count = $state(0);

  // INFINITE LOOP — reads count, then writes count, which triggers the effect again
  // $effect(() => {
  //   count = count + 1;
  // });

  // FIX: use untrack to read without tracking
  import { untrack } from "svelte";

  $effect(() => {
    const current = untrack(() => count);
    // Now we can safely write to count without causing a loop
    // (though you should question whether this logic belongs in an effect at all)
  });
</script>
```

If you find yourself needing `untrack` to fix a loop, ask whether the value should be `$derived` instead. Most infinite loops are a sign that you are using `$effect` where `$derived` would be more appropriate.

## Try It

Build a "Live Markdown Preview" component:
- Use `$state()` for a textarea that holds markdown text
- Use `$effect()` with a cleanup function to debounce updates (set a timeout, clear it on re-run)
- Use `tick()` after updating the preview HTML to scroll the preview pane to the bottom
- Track the window width with an effect and event listener cleanup pattern, and switch to a stacked layout below 768px
- Use `untrack()` to read and update a "last saved" timestamp without creating a dependency loop

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

## Key Takeaways

- `$effect()` runs after mount and after reactive dependencies change, with automatic cleanup on component destroy
- `$effect.pre()` runs before DOM updates — use it to measure or preserve DOM state
- `$effect.tracking()` checks if code is running in a tracking context — useful for conditional subscriptions
- `$effect.root()` creates standalone effect scopes that must be manually cleaned up
- `$effect.pending()` returns the count of unresolved async operations in the current `{#await}` boundary — useful for unified loading indicators
- `untrack()` reads a reactive value without adding it as a dependency — essential for avoiding infinite loops
- `tick()` waits for pending DOM updates; `flushSync()` forces immediate synchronous DOM updates
- Always return a cleanup function when your effect sets up listeners, intervals, or subscriptions
- Values read after `await` are not tracked — read all dependencies before any async boundary
- If you are using `$effect` to compute a value, you probably want `$derived` instead
