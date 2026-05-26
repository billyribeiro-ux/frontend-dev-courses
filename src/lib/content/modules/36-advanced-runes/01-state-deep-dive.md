# State Deep Dive

You already know that `$state()` makes variables reactive. But under the surface, Svelte 5's state system is more powerful and nuanced than a simple "track this variable" mechanism. Understanding how `$state()` actually works — and when to reach for its siblings `$state.raw()` and `$state.snapshot()` — will help you write faster, more correct applications.

This lesson dives into the three faces of state in Svelte 5. You will learn how deep reactivity works, when it helps, when it hurts, and how to pick the right tool for each situation.

## How $state() Creates Deep Reactive Proxies

When you write `let user = $state({ name: "Alex", address: { city: "NYC" } })`, Svelte does not just watch for reassignment of the `user` variable. It wraps the entire object in a **reactive proxy** — a special JavaScript construct that intercepts every property read and write, no matter how deeply nested.

```svelte
<script>
  let user = $state({
    name: "Alex",
    address: {
      city: "NYC",
      zip: "10001"
    }
  });
</script>

<p>{user.name} lives in {user.address.city}</p>

<button onclick={() => user.address.city = "LA"}>
  Move to LA
</button>
```

Clicking the button changes a deeply nested property, and the UI updates immediately. You did not reassign `user` — you mutated `user.address.city` directly. This works because the proxy tracks every level of the object. The same applies to arrays inside `$state()`:

```svelte
<script>
  let todos = $state([
    { id: 1, text: "Learn Svelte", done: false },
    { id: 2, text: "Build an app", done: false }
  ]);
</script>

<ul>
  {#each todos as todo (todo.id)}
    <li>
      <label>
        <input type="checkbox" bind:checked={todo.done} />
        {todo.text}
      </label>
    </li>
  {/each}
</ul>

<button onclick={() => todos.push({ id: 3, text: "Deploy", done: false })}>
  Add Todo
</button>
```

Calling `todos.push()` mutates the array in place, and Svelte detects it. Toggling `todo.done` through `bind:checked` also works because each item in the array is itself a proxy.

## $state.raw() — Immutable-Style Reactivity

Deep proxies are powerful but come with a cost. Every nested property becomes a proxy object, which adds memory overhead and processing time. For large datasets that you never mutate in place — like API responses with hundreds of items, or read-only configuration — `$state.raw()` is the better choice.

`$state.raw()` creates state that only triggers updates on **reassignment**, not on mutation:

```svelte
<script>
  let items = $state.raw([
    { id: 1, name: "Product A", price: 29.99 },
    { id: 2, name: "Product B", price: 49.99 },
    { id: 3, name: "Product C", price: 19.99 }
  ]);

  function addItem() {
    // This will NOT trigger an update:
    // items.push({ id: 4, name: "Product D", price: 39.99 });

    // This WILL trigger an update — full reassignment:
    items = [...items, { id: 4, name: "Product D", price: 39.99 }];
  }

  function removeItem(id: number) {
    items = items.filter(item => item.id !== id);
  }
</script>

<ul>
  {#each items as item (item.id)}
    <li>
      {item.name} — ${item.price}
      <button onclick={() => removeItem(item.id)}>Remove</button>
    </li>
  {/each}
</ul>

<button onclick={addItem}>Add Product D</button>
```

With `$state.raw()`, you must treat the data as immutable. To update it, create a new array or object and reassign. This is the same pattern used in React and other frameworks, and it performs better for large, infrequently mutated datasets because Svelte does not need to wrap every nested property in a proxy.

## $state.snapshot() — Escaping the Proxy

A `$state()` proxy is not a plain JavaScript object. If you pass it to `console.log`, you will see `Proxy {}` instead of your data. External libraries, `JSON.stringify`, and `localStorage` may not handle proxies correctly. `$state.snapshot()` solves this by returning a plain, deep-cloned copy of the current state:

```svelte
<script>
  let user = $state({
    name: "Alex",
    preferences: {
      theme: "dark",
      fontSize: 16
    }
  });

  function saveToLocalStorage() {
    const plain = $state.snapshot(user);
    localStorage.setItem("user", JSON.stringify(plain));
  }

  function logState() {
    // Without snapshot: logs Proxy {}
    console.log(user);

    // With snapshot: logs { name: "Alex", preferences: { ... } }
    console.log($state.snapshot(user));
  }
</script>

<button onclick={saveToLocalStorage}>Save Settings</button>
<button onclick={logState}>Log to Console</button>
```

Common use cases for `$state.snapshot()`:
- **Serialization**: Saving to `localStorage` or sending as a request body
- **Debugging**: Getting readable output in `console.log`
- **External libraries**: Passing data to chart libraries, form validators, or analytics tools that do not expect proxies
- **Comparison**: Checking if state has changed by comparing snapshots

```typescript
let previousSnapshot = $state.snapshot(formData);

function hasChanged() {
  const current = $state.snapshot(formData);
  return JSON.stringify(current) !== JSON.stringify(previousSnapshot);
}
```

## $state.eager() — Forcing Synchronous Updates

By default, Svelte batches state changes and applies them to the DOM asynchronously. This is great for performance — if you update three variables in a row, Svelte groups them into a single DOM update instead of three. But occasionally you need the DOM to reflect a state change **immediately**, before the next line of code runs. That is what `$state.eager()` is for.

`$state.eager(value)` creates reactive state that forces a synchronous UI update every time it changes, bypassing Svelte's batching:

```svelte
<script>
  let status = $state.eager("idle");
  let resultBox;

  async function runProcess() {
    // The DOM updates IMMEDIATELY after this assignment
    status = "loading";

    // Because status is eager, the UI already shows "loading"
    // before we start the fetch
    const response = await fetch("/api/slow-endpoint");
    const data = await response.json();

    // The DOM updates again immediately
    status = "done";
  }
</script>

<p class={status}>Status: {status}</p>
<button onclick={runProcess} disabled={status === "loading"}>
  Start
</button>
```

With regular `$state("idle")`, the assignment `status = "loading"` would be batched. If the `await` on the next line resolves very quickly (or if you need to measure the DOM between assignments), the user might never see the "loading" state. `$state.eager()` guarantees each assignment is flushed to the DOM before execution continues.

This is especially useful when state interacts with `await` expressions or when you need to read the DOM (measure dimensions, check positions) between state changes:

```svelte
<script>
  let expanded = $state.eager(false);
  let panel;

  async function toggleAndMeasure() {
    expanded = !expanded;
    // DOM is already updated — safe to measure
    console.log("Panel height:", panel?.offsetHeight);
  }
</script>

<div bind:this={panel} class:expanded>
  {#if expanded}
    <p>Expanded content here</p>
  {/if}
</div>
<button onclick={toggleAndMeasure}>Toggle</button>
```

**Use `$state.eager()` sparingly.** The default batched behavior exists because it is significantly better for performance — collapsing multiple state changes into a single render pass. Only reach for `$state.eager()` when you have a specific reason to need synchronous DOM updates, such as coordinating with `await` or measuring the DOM between state changes.

## When to Use Each: Decision Guide

| Scenario | Use | Why |
|----------|-----|-----|
| Form data, interactive UI state | `$state()` | Deep reactivity lets you mutate fields directly |
| Large API responses, read-only data | `$state.raw()` | No proxy overhead; better memory and performance |
| Passing state to external libraries | `$state.snapshot()` | Returns a plain object that any library can consume |
| Logging or debugging reactive state | `$state.snapshot()` | Produces readable console output |
| Saving state to localStorage/database | `$state.snapshot()` | Safe serialization without proxy artifacts |
| Small-to-medium interactive objects | `$state()` | Convenience of direct mutation outweighs any overhead |
| Immutable update patterns (Redux-style) | `$state.raw()` | Forces reassignment, making changes explicit |

**Rule of thumb**: Start with `$state()`. Switch to `$state.raw()` when you have large data you replace rather than mutate. Use `$state.snapshot()` whenever data leaves the Svelte reactivity boundary.

## Practical Example: Settings Panel

This component demonstrates all three state variants working together in a realistic scenario:

```svelte
<script>
  // Interactive form state — deep reactivity for easy mutation
  let settings = $state({
    profile: {
      displayName: "Alex",
      bio: "Frontend developer"
    },
    appearance: {
      theme: "light",
      fontSize: 16,
      sidebarOpen: true
    },
    notifications: {
      email: true,
      push: false,
      frequency: "daily"
    }
  });

  // Read-only config from API — no need for deep proxy overhead
  let appConfig = $state.raw({
    version: "2.1.0",
    features: ["dashboard", "analytics", "export"],
    limits: { maxUploadMb: 50, maxProjects: 10 }
  });

  let savedMessage = $state("");

  function saveSettings() {
    // Snapshot to get a plain object for serialization
    const plain = $state.snapshot(settings);
    localStorage.setItem("settings", JSON.stringify(plain));
    savedMessage = "Settings saved!";
    setTimeout(() => savedMessage = "", 2000);
  }

  function resetSettings() {
    settings.appearance.theme = "light";
    settings.appearance.fontSize = 16;
    settings.notifications.email = true;
    settings.notifications.push = false;
  }
</script>

<div class="panel">
  <h2>Settings</h2>

  <section>
    <h3>Profile</h3>
    <label>
      Display Name
      <input type="text" bind:value={settings.profile.displayName} />
    </label>
    <label>
      Bio
      <textarea bind:value={settings.profile.bio}></textarea>
    </label>
  </section>

  <section>
    <h3>Appearance</h3>
    <label>
      <select bind:value={settings.appearance.theme}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
    <label>
      Font Size: {settings.appearance.fontSize}px
      <input type="range" min="12" max="24" bind:value={settings.appearance.fontSize} />
    </label>
  </section>

  <section>
    <h3>Notifications</h3>
    <label>
      <input type="checkbox" bind:checked={settings.notifications.email} />
      Email notifications
    </label>
    <label>
      <input type="checkbox" bind:checked={settings.notifications.push} />
      Push notifications
    </label>
  </section>

  <div class="actions">
    <button onclick={saveSettings}>Save</button>
    <button onclick={resetSettings}>Reset Defaults</button>
  </div>

  {#if savedMessage}
    <p class="success">{savedMessage}</p>
  {/if}

  <footer>
    <p class="version">App v{appConfig.version}</p>
  </footer>
</div>

<style>
  .panel {
    max-width: 480px;
    padding: 24px;
    border: 1px solid #e0e0e0;
    border-radius: 12px;
    font-family: system-ui, sans-serif;
  }

  section {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 0.95rem;
  }

  input[type="text"], textarea, select {
    display: block;
    width: 100%;
    padding: 8px;
    margin-top: 4px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 0.95rem;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  button {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    background: #3b82f6;
    color: white;
    cursor: pointer;
  }

  button:hover {
    background: #2563eb;
  }

  .success {
    color: #16a34a;
    margin-top: 8px;
  }

  .version {
    color: #999;
    font-size: 0.8rem;
    margin-top: 16px;
  }
</style>
```

## Try It

Build a "Contact Manager" that uses all three state variants:
- Use `$state()` for an editable contact form with nested fields (name, email, address with city and zip)
- Use `$state.raw()` for a list of saved contacts loaded from a mock API response
- Add a "Save Contact" button that uses `$state.snapshot()` to serialize the form data and add it to the contacts list
- Display the saved contacts in a list below the form

## Key Takeaways

- `$state()` creates a **deep reactive proxy** — mutating any nested property triggers UI updates automatically
- `$state.raw()` creates state that only reacts to **reassignment**, not mutation — better performance for large or read-only data
- `$state.snapshot()` returns a **plain JavaScript object** from a proxy — essential for serialization, logging, and external libraries
- `$state.eager()` forces **synchronous DOM updates** on every change — use it when coordinating with `await` or measuring the DOM between state changes, but sparingly since batching is better for performance
- Start with `$state()` for most interactive data; switch to `$state.raw()` when performance matters and you do not need deep mutation
- Use `$state.snapshot()` whenever reactive data crosses the boundary out of Svelte (localStorage, fetch, console, third-party libraries)
