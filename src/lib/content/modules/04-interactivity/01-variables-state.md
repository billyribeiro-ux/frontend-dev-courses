# Variables & $state()

Up until now, everything on your page has been static — the same text, the same styles, nothing changes. That is about to change. **JavaScript variables** let you store data, and Svelte 5's **`$state()` rune** makes that data *reactive*, meaning your page automatically updates when the data changes.

But before we write any code, let's talk about the mental model that makes modern UI development click.

## The Big Idea: Declarative UI

Traditional web development is **imperative** — you manually tell the browser what to change, step by step:

```js
// Imperative (vanilla JS) — YOU manage every DOM update
document.getElementById("count").textContent = count;
document.getElementById("message").classList.toggle("hidden", count === 0);
document.getElementById("btn").disabled = count >= 10;
```

Every time `count` changes, you must remember to update every part of the DOM that depends on it. Miss one? You have a bug. Have 50 pieces of state? You have 50 sources of potential inconsistency.

Svelte takes the **declarative** approach — you describe *what* the UI should look like for a given state, and the framework figures out *how* to update the DOM:

```svelte
<script>
  let count = $state(0);
</script>

<p>{count}</p>
<p class:hidden={count === 0}>You've started counting!</p>
<button disabled={count >= 10}>Add</button>
```

You never touch the DOM directly. You just update `count`, and everything that depends on it updates automatically. This is the single most important idea in modern frontend development: **your component is a function from state to UI**. State changes, UI follows.

### Why This Matters at Scale

In a 10-line demo, the imperative approach feels fine. In a 10,000-line application with dozens of interconnected UI elements, it becomes untenable. Consider a dashboard with a user's name displayed in the header, a sidebar, a welcome message, and a settings panel. With imperative code, changing the user's name means updating four DOM locations manually. Miss one and the UI is inconsistent.

With declarative UI, you update `user.name` once, and every location that reads it updates automatically. This eliminates an entire category of bugs — stale UI — that plagues imperative codebases.

## What Is a Variable?

Before we get to reactivity, let's make sure the foundation is solid. A variable is a named container for a value. You create variables inside the `<script>` tag of your Svelte component:

```svelte
<script>
  let name = "Alex";
  let age = 25;
  let isStudent = true;
</script>

<p>Name: {name}</p>
<p>Age: {age}</p>
<p>Student: {isStudent}</p>
```

The curly braces `{ }` in Svelte's template are **expression slots** — they evaluate whatever JavaScript expression is inside and render the result. Anything that produces a value works: `{name}`, `{age + 1}`, `{isStudent ? "Yes" : "No"}`.

### Expression Slots Are Full JavaScript

You can put any valid JavaScript expression in curly braces. Not just variables — function calls, math, ternaries, template literals, even array methods:

```svelte
<script>
  let items = ["Apple", "Banana", "Cherry"];
  let price = 9.99;
</script>

<p>{items.length} items</p>
<p>Total: ${(price * items.length).toFixed(2)}</p>
<p>{items.join(", ")}</p>
<p>{new Date().toLocaleDateString()}</p>
```

But keep expressions simple. If an expression needs more than one line of logic, move it to a variable or function in the `<script>` block. Template expressions should be readable at a glance.

## let vs const

JavaScript has two main ways to declare variables:

- **`let`** — the value can be reassigned later
- **`const`** — the binding is permanent; you cannot reassign it

```svelte
<script>
  let score = 0;        // Can change later
  const maxScore = 100;  // Will never be reassigned

  score = 10; // Works fine
  // maxScore = 200; // ERROR: Cannot reassign a const
</script>

<p>Score: {score} / {maxScore}</p>
```

Use `const` for values that should never change — configuration, labels, imported functions. Use `let` for everything that might change. When in doubt, start with `const` and change to `let` when the compiler tells you it needs to be reassigned.

A subtle but important point: `const` prevents *reassignment*, not *mutation*. A `const` object can still have its properties changed. This will matter when we talk about object state later.

```js
const user = { name: "Alex" };
user.name = "Sam";  // This works! We changed a property, not the binding.
// user = { name: "Sam" }; // ERROR: This reassigns the binding.
```

## Data Types

JavaScript has several types of data you will use constantly:

```svelte
<script>
  // String — text wrapped in quotes
  let greeting = "Hello, world!";

  // Number — numeric values (no quotes!)
  let temperature = 72;
  let price = 9.99;

  // Boolean — true or false
  let isLoggedIn = false;

  // null — intentional absence of a value
  let selectedItem = null;

  // undefined — value not yet assigned
  let pendingResult;

  // Array — ordered list of values
  let tags = ["svelte", "javascript", "web"];

  // Object — collection of key-value pairs
  let user = { name: "Alex", age: 25 };
</script>

<p>{greeting}</p>
<p>Temperature: {temperature} degrees</p>
<p>Price: ${price}</p>
<p>Logged in: {isLoggedIn}</p>
```

| Type | Examples | Use For |
|------|----------|---------|
| String | `"hello"`, `'world'`, `` `template` `` | Text, names, messages |
| Number | `42`, `3.14`, `-10` | Counts, prices, measurements |
| Boolean | `true`, `false` | On/off states, yes/no flags |
| null | `null` | Intentional "no value" |
| undefined | `undefined` | Value not yet set |
| Array | `[1, 2, 3]` | Lists, collections |
| Object | `{ key: "value" }` | Structured data |

The first three — strings, numbers, and booleans — are **primitives**. They are simple, single values. Arrays and objects are **reference types** — they hold collections of values. The distinction matters enormously for reactivity, as we will see.

## Reactive State with $state()

Here is where Svelte 5 shines. The `$state()` rune makes a variable **reactive** — Svelte will track it and automatically update any part of the UI that depends on it:

```svelte
<script>
  let count = $state(0);
</script>

<p>Count: {count}</p>
```

But what does "reactive" actually *mean*? Let's build the mental model.

### What "Reactive" Means Under the Hood

When you write `let count = $state(0)`, the Svelte compiler transforms your code. Instead of a plain variable, it creates a **signal** — a value wrapper with a getter and a setter that can notify subscribers.

Conceptually, think of it like this:

```js
// What you write:
let count = $state(0);

// What Svelte conceptually creates (simplified):
// A signal that tracks who reads it and notifies them on write
let count = createSignal(0);
// - Every time the template reads `count`, Svelte records that dependency
// - Every time `count` is assigned a new value, Svelte re-runs only
//   the specific template expressions that depend on it
```

This is why `$state()` is called a "rune" — it is a compile-time instruction. It looks like a function call, but the Svelte compiler recognizes it and transforms the surrounding code. You cannot pass `$state` to another function or store it in a variable — it is not a runtime value, it is a compiler directive.

The key insight: **Svelte does not re-render your entire component when state changes.** It updates only the specific DOM nodes that depend on the changed state. This is surgically precise and very fast.

### WRONG vs CORRECT: Where `$state()` Works

```svelte
<script>
  // WRONG — $state() outside of a declaration
  const state = $state;  // Error: $state is not a value
  someFunction($state(0));  // Error: can't pass as an argument

  // WRONG — $state() with var (must use let or with a class field)
  var count = $state(0);  // Error

  // CORRECT — $state() in a let declaration
  let count = $state(0);

  // CORRECT — $state() in a class field
  class Counter {
    count = $state(0);
  }

  // CORRECT — $state() in a .svelte.ts module (exported)
  // (in a .svelte.ts file)
  // export let count = $state(0);
</script>
```

Runes only work in `.svelte` and `.svelte.ts` / `.svelte.js` files. They are compiler directives, not runtime functions.

## When Do You Need $state()?

Use `$state()` when the value will change *after* the component first renders — user interactions, timer updates, data fetching, anything dynamic. Use a plain `let` or `const` when the value is set once and never changes.

```svelte
<script>
  // Static — never changes after setup, no need for reactivity
  const appName = "My App";
  const maxItems = 50;

  // Reactive — will change based on user actions
  let theme = $state("light");
  let notificationCount = $state(0);
  let searchQuery = $state("");
</script>

<h1>{appName}</h1>
<p>Theme: {theme}</p>
<p>Notifications: {notificationCount}</p>
```

A useful rule of thumb: if a value appears in your template *and* gets reassigned somewhere, it should be `$state()`. If it is only read, a plain `const` or `let` works fine.

### The Cost of Unnecessary Reactivity

Do not wrap everything in `$state()` "just in case." Each reactive variable creates tracking overhead — a signal, dependency registration, and update scheduling. For a static configuration value like `const API_URL = "/api/v1"`, using `$state()` would allocate tracking infrastructure that never fires. It is wasteful and makes your code harder to read (readers wonder "when does this change?").

```svelte
<script>
  // WRONG — reactive state for something that never changes
  let maxRetries = $state(3);
  let appVersion = $state("2.1.0");

  // CORRECT — plain constants for static values
  const maxRetries = 3;
  const appVersion = "2.1.0";

  // CORRECT — reactive state for things that actually change
  let retryCount = $state(0);
  let isLoading = $state(false);
</script>
```

## Primitive vs Object State

`$state()` handles primitive values (strings, numbers, booleans) and objects/arrays differently, and understanding this distinction will save you from subtle bugs.

**Primitives** are tracked by assignment. When you write `count = 5`, Svelte sees the assignment and updates the UI:

```svelte
<script>
  let count = $state(0);
  // Later: count = 5; triggers an update
</script>
```

**Objects and arrays** are **deep-proxied** by `$state()`. This means Svelte wraps the object in a Proxy that intercepts property access and mutation, so even nested changes are tracked:

```svelte
<script>
  let user = $state({
    name: "Alex",
    address: {
      city: "Portland"
    }
  });

  // ALL of these trigger UI updates — even nested mutations:
  // user.name = "Sam";
  // user.address.city = "Seattle";
</script>

<p>{user.name} lives in {user.address.city}</p>
```

### The Proxy Equality Gotcha

Because `$state()` wraps objects in a Proxy, the proxy is not strictly equal to the original object:

```svelte
<script>
  const original = { name: "Alex" };
  let user = $state(original);

  // This is FALSE — user is a Proxy wrapping original
  console.log(user === original); // false

  // To compare, use $state.snapshot()
  console.log($state.snapshot(user).name === original.name); // true
</script>
```

This matters when you compare objects with `===` or use them as Map keys. If you need to pass reactive state to a library that checks identity, use `$state.snapshot()` first.

### Array Mutations Are Tracked Automatically

Deep proxying means array methods like `push`, `pop`, `splice`, `sort`, and index assignment all trigger reactive updates:

```svelte
<script>
  let items = $state(["Apple", "Banana"]);

  function addItem() {
    items.push("Cherry");  // Triggers update — no need to reassign
  }

  function removeFirst() {
    items.shift();  // Also triggers update
  }

  function sortItems() {
    items.sort();  // Triggers update — in-place sort is tracked
  }
</script>

<ul>
  {#each items as item}
    <li>{item}</li>
  {/each}
</ul>

<p>{items.length} items</p>
<button onclick={addItem}>Add Cherry</button>
```

This is different from some other frameworks where you must create a new array to trigger updates. In Svelte 5, mutate freely — the proxy handles tracking.

## $state.raw() — Opting Out of Deep Proxying

Deep proxying has a cost — every property access goes through the proxy. For large objects that you replace wholesale (like API response data you never mutate in place), `$state.raw()` gives you a non-proxied version that only reacts to reassignment:

```svelte
<script>
  // Only triggers update when `data` is reassigned, not when properties mutate
  let data = $state.raw(largeApiResponse);

  // This updates the UI:
  // data = newApiResponse;

  // This does NOT update the UI:
  // data.items[0].name = "new name";
</script>
```

### When to Use `$state()` vs `$state.raw()`

| Scenario | Use | Why |
|----------|-----|-----|
| Form inputs bound to an object | `$state()` | You mutate individual fields: `form.email = "..."` |
| Shopping cart items | `$state()` | You push, remove, update quantities in place |
| API response displayed in a list | `$state.raw()` | Large, replaced wholesale on fetch, never mutated |
| Config loaded from server | `$state.raw()` | Read-only reference, replaced on reload |
| Drag-and-drop reordering | `$state()` | You splice and mutate arrays during drag |
| Paginated search results | `$state.raw()` | Entire page of results replaced on each search |

Use `$state()` for state you mutate (form data, UI state, user input). Use `$state.raw()` for large, read-heavy data that you replace rather than mutate.

### Performance Difference in Numbers

If an API returns 500 task objects, each with 10 properties, `$state()` would create proxies for 5,000+ property accessors. `$state.raw()` stores the plain objects directly — faster initialization, less memory, no proxy overhead on reads. For a list of 10 items, the difference is negligible. For a list of 1,000, it matters.

## $state.snapshot() — Escaping the Reactive Boundary

Reactive proxies cannot be serialized directly. When you need to send state to `JSON.stringify`, `fetch`, `localStorage`, or log it to the console, use `$state.snapshot()`:

```svelte
<script>
  let cart = $state([
    { id: 1, name: "Widget", qty: 2 },
    { id: 2, name: "Gadget", qty: 1 }
  ]);

  function saveToLocalStorage() {
    // WRONG — JSON.stringify on a proxy can behave unexpectedly
    // localStorage.setItem("cart", JSON.stringify(cart));

    // CORRECT — snapshot creates a plain, deep-cloned object
    const snapshot = $state.snapshot(cart);
    localStorage.setItem("cart", JSON.stringify(snapshot));
  }

  function logState() {
    // Without snapshot: console shows "Proxy {}" — unreadable
    // With snapshot: console shows the actual data
    console.log($state.snapshot(cart));
  }
</script>
```

`$state.snapshot()` performs a deep clone — mutating the snapshot does not affect the reactive state, and vice versa.

## Event Handlers — Responding to User Actions

State only becomes interesting when users can change it. In Svelte, event handlers are just DOM event attributes — no special framework syntax:

```svelte
<script>
  let count = $state(0);
</script>

<p>Count: {count}</p>
<button onclick={() => count++}>Increment</button>
<button onclick={() => count--}>Decrement</button>
<button onclick={() => count = 0}>Reset</button>
```

Notice: `onclick`, not `on:click`. Svelte 5 uses standard DOM event attribute names. These are not a framework abstraction — they map directly to the DOM events you already know: `onclick`, `oninput`, `onchange`, `onkeydown`, `onsubmit`, and so on.

### WRONG vs CORRECT: Event Handler Syntax in Svelte 5

```svelte
<!-- WRONG — Svelte 4 syntax (deprecated in Svelte 5) -->
<button on:click={increment}>+1</button>
<input on:input={handleInput} />

<!-- CORRECT — Svelte 5 standard DOM attributes -->
<button onclick={increment}>+1</button>
<input oninput={handleInput} />
```

The `on:` directive syntax still works but is deprecated. Always use the standard lowercase DOM attribute names.

You can also extract handlers into named functions for clarity:

```svelte
<script>
  let count = $state(0);

  function increment() {
    count++;
  }

  function reset() {
    count = 0;
  }
</script>

<button onclick={increment}>+1</button>
<button onclick={reset}>Reset</button>
<p>{count}</p>
```

For events that carry data (like input events), the handler receives the standard DOM event object:

```svelte
<script>
  let value = $state("");
</script>

<input
  type="text"
  oninput={(event) => value = event.target.value}
  placeholder="Type something..."
/>
<p>You typed: {value}</p>
```

### Event Modifiers in Svelte 5

Svelte 4 had special modifiers like `on:click|preventDefault`. In Svelte 5, use standard JavaScript in your handler:

```svelte
<script>
  function handleSubmit(event) {
    event.preventDefault();  // Prevent form submission
    event.stopPropagation(); // Stop event from bubbling
    // ... handle the form
  }

  function handleKeydown(event) {
    if (event.key === "Enter") {
      // Only react to Enter key
      submitForm();
    }
  }
</script>

<form onsubmit={handleSubmit}>
  <input onkeydown={handleKeydown} />
  <button type="submit">Submit</button>
</form>
```

This is more explicit and easier to understand than magic modifier strings. You write standard JavaScript — no framework-specific syntax to memorize.

### Common Event Types

| Event | Fires When | Common Use |
|-------|-----------|------------|
| `onclick` | Element is clicked | Buttons, links, interactive elements |
| `oninput` | Input value changes (each keystroke) | Live search, character counters |
| `onchange` | Input loses focus after changing | Dropdowns, checkboxes, file inputs |
| `onsubmit` | Form is submitted | Form validation, data submission |
| `onkeydown` | Key is pressed | Keyboard shortcuts, enter-to-submit |
| `onfocus` / `onblur` | Element gains/loses focus | Showing help text, validation |
| `onmouseenter` / `onmouseleave` | Mouse enters/leaves element | Tooltips, hover previews |

## Two-Way Binding with bind:value

That `oninput` pattern — reading from `event.target.value` and assigning to state — is so common that Svelte provides a shortcut: `bind:value`.

```svelte
<script>
  let name = $state("");
</script>

<!-- These two are equivalent: -->
<input oninput={(e) => name = e.target.value} value={name} />
<input bind:value={name} />

<p>Hello, {name}!</p>
```

`bind:value` creates **two-way data flow**: the input reads from `name` *and* writes back to `name` when the user types. It is syntactic sugar, not magic — it compiles down to an event handler plus a value attribute.

### When to Use `bind:` vs One-Way + Handler

| Use `bind:value` when... | Use one-way + handler when... |
|--------------------------|-------------------------------|
| Simple form inputs | You need to validate or transform input |
| Quick prototyping | You want to debounce input |
| The binding is straightforward | You need to track additional event data |
| Standard form fields | You are formatting as the user types |

For most form inputs, `bind:value` is the right choice. For inputs where you need to intercept or transform the value, use the explicit handler:

```svelte
<script>
  let phone = $state("");

  function handlePhoneInput(event) {
    // Strip non-digits and format as (XXX) XXX-XXXX
    const digits = event.target.value.replace(/\D/g, "").slice(0, 10);
    if (digits.length >= 6) {
      phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length >= 3) {
      phone = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
      phone = digits;
    }
  }
</script>

<input value={phone} oninput={handlePhoneInput} placeholder="(555) 123-4567" />
```

### Other `bind:` Targets

`bind:` works with other attributes too:

```svelte
<script>
  let checked = $state(false);
  let selected = $state("medium");
  let groupValue = $state("a");
  let inputElement;
</script>

<!-- Checkboxes: bind:checked -->
<input type="checkbox" bind:checked />

<!-- Select dropdowns: bind:value -->
<select bind:value={selected}>
  <option value="small">Small</option>
  <option value="medium">Medium</option>
  <option value="large">Large</option>
</select>

<!-- Radio buttons: bind:group -->
<label><input type="radio" bind:group={groupValue} value="a" /> Option A</label>
<label><input type="radio" bind:group={groupValue} value="b" /> Option B</label>

<!-- DOM element reference: bind:this -->
<input bind:this={inputElement} />
<!-- Now inputElement is the actual DOM <input> element -->
```

## A Complete Example: Interactive Profile Form

Let's put everything together — `$state()`, event handlers, `bind:value`, computed display, and conditional rendering:

```svelte
<script>
  let name = $state("");
  let role = $state("developer");
  let experience = $state(1);
  let isRemote = $state(false);
  let bio = $state("");

  const roles = ["developer", "designer", "manager", "analyst"];

  // Derived value — computed from state, updates automatically
  let level = $derived(
    experience < 2 ? "Junior" :
    experience < 5 ? "Mid-level" :
    experience < 10 ? "Senior" :
    "Staff+"
  );

  function resetForm() {
    name = "";
    role = "developer";
    experience = 1;
    isRemote = false;
    bio = "";
  }
</script>

<div class="form-container">
  <h2>Create Your Profile</h2>

  <label>
    Name
    <input bind:value={name} placeholder="Your name" />
    {#if name.length > 50}
      <span class="warning">Name is too long ({name.length}/50)</span>
    {:else}
      <span class="counter">{name.length}/50</span>
    {/if}
  </label>

  <label>
    Role
    <select bind:value={role}>
      {#each roles as r}
        <option value={r}>{r}</option>
      {/each}
    </select>
  </label>

  <label>
    Years of experience: {experience}
    <input type="range" bind:value={experience} min="0" max="20" />
  </label>

  <label class="checkbox-label">
    <input type="checkbox" bind:checked={isRemote} />
    Open to remote work
  </label>

  <label>
    Bio
    <textarea bind:value={bio} rows="3" placeholder="Tell us about yourself..." />
  </label>

  <button onclick={resetForm}>Reset Form</button>
</div>

{#if name}
  <div class="preview">
    <h3>Preview</h3>
    <p><strong>{name}</strong> — {level} {role}</p>
    <p>{experience} year{experience === 1 ? "" : "s"} of experience</p>
    {#if isRemote}
      <span class="badge">Remote OK</span>
    {/if}
    {#if bio}
      <p class="bio">"{bio}"</p>
    {/if}
  </div>
{/if}

<style>
  .form-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 24rem;
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 600;
    font-size: 0.875rem;
    color: #374151;
  }

  .checkbox-label {
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  input, select, textarea {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  .preview {
    margin-top: 1.5rem;
    padding: 1.25rem;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
  }

  .badge {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    background: #dbeafe;
    color: #1e40af;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .bio {
    font-style: italic;
    color: #6b7280;
  }

  .counter {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 400;
  }

  .warning {
    font-size: 0.75rem;
    color: #ef4444;
    font-weight: 400;
  }
</style>
```

Study this example carefully. Notice how:

- **State drives everything.** The preview section is a pure function of the form state. You never manually update the preview — it updates itself.
- **`$derived`** computes `level` from `experience`. We have not covered `$derived` in depth yet (that is coming), but the idea is natural: some values are computed from other values, and those computations should also be reactive.
- **Conditional rendering** (`{#if name}`) shows the preview only when there is data to show. The UI is always a faithful representation of the current state.
- **`bind:value`** on every input keeps the form state in sync with zero boilerplate.
- **Character counter** changes color when the name exceeds the limit — pure declarative logic, no imperative DOM manipulation.

This is the declarative model in action. Describe the relationship between state and UI once, and the framework maintains it forever.

## Debugging Reactive State

When reactive state is not updating as you expect, here are the debugging strategies:

### 1. Use `$inspect()` — Svelte's Built-In Debugger

```svelte
<script>
  let count = $state(0);
  let items = $state(["a", "b"]);

  // Logs to the console whenever count or items change
  $inspect(count);
  $inspect(items);

  // With a custom handler
  $inspect(count).with((type, value) => {
    if (type === "update") {
      console.log("Count changed to:", value);
    }
  });
</script>
```

`$inspect` only runs in development mode — it is stripped from production builds. It is the Svelte equivalent of putting a `console.log` on every state change, but smarter.

### 2. Snapshot for Console Logging

```svelte
<script>
  let user = $state({ name: "Alex", scores: [95, 87, 92] });

  function debug() {
    // WRONG — logs "Proxy {}" which is unreadable
    console.log(user);

    // CORRECT — logs the actual data structure
    console.log($state.snapshot(user));
  }
</script>
```

### 3. Common "Why Isn't It Updating?" Checklist

1. **Did you use `$state()`?** A plain `let` without `$state()` will not trigger UI updates.
2. **Are you mutating `$state.raw()`?** Raw state only reacts to reassignment, not mutation.
3. **Are you reassigning or mutating?** For primitives, you must reassign. For `$state()` objects, both work.
4. **Is the update happening in a callback?** Ensure the callback is modifying the same `$state` variable the template reads.
5. **Are you comparing proxies with `===`?** Proxied objects are never `===` to the original.

## The Mental Model, Summarized

Here is the mental model to carry with you:

1. **State** is the single source of truth. It lives in `$state()` variables.
2. **The template** is a declaration of what the UI should look like *for the current state*. It is not instructions — it is a description.
3. **Events** are the only way state changes. A button click, a keystroke, a timer — something happens, state updates.
4. **The framework** closes the loop. When state changes, Svelte automatically and efficiently updates only the parts of the DOM that need to change.

```
Events → State changes → UI updates (automatically)
  ↑                              |
  └──────── User interacts ──────┘
```

This cycle — event, state change, UI update, user interaction — is the heartbeat of every interactive Svelte application. Every feature you build is some variation of this loop.

### State Boundaries — Where State Lives Matters

A principle that becomes critical as applications grow: **state should live at the lowest common ancestor of all components that need it.**

If only one component uses a counter, declare `$state(0)` in that component. If two sibling components need the same counter, lift it to their parent. If the entire app needs it, put it in a `.svelte.ts` module or use context. Placing state too high makes components unnecessarily coupled. Placing state too low forces you to duplicate it or pass it around awkwardly.

## Try It

Build an "Event RSVP" component:

1. Use `$state()` for the guest's name (string), number of attendees (number), dietary preference (string from a dropdown: "none", "vegetarian", "vegan", "gluten-free"), and whether they need parking (boolean).
2. Use `bind:value` for text inputs and the select dropdown, `bind:checked` for the parking checkbox, and a range slider for attendee count (1-10).
3. Show a live preview card below the form that summarizes the RSVP. Use conditional rendering: only show the dietary line if the preference is not "none", only show the parking note if checked.
4. Add a "Reset" button that sets all state back to default values using an `onclick` handler.
5. Style the form and preview card with scoped CSS.
6. Add a character counter below the name input showing `{name.length}/50` and change its color to red when the name exceeds 50 characters using a conditional class (`class:warning`).
7. Add a `$inspect(name)` call and observe it in the browser console as you type.
8. Add a "Save to Console" button that logs `$state.snapshot()` of all form data as a plain object.

Stretch goal: Add an array of additional guest names using `$state([])`. Include an "Add Guest" button that pushes to the array and a list that renders each guest with a "Remove" button that splices them out. Verify that the UI updates for both `push` and `splice` without reassignment.

## Key Takeaways

- **Declarative UI** means you describe what the UI looks like for a given state — the framework handles DOM updates
- **`$state()`** is a compile-time rune that creates a reactive signal — Svelte tracks reads and writes to update only the affected DOM nodes
- Runes only work in `.svelte` and `.svelte.ts` / `.svelte.js` files — they are compiler directives, not runtime functions
- **Primitive state** (strings, numbers, booleans) reacts to reassignment; **object state** is deep-proxied so nested mutations are also tracked
- Array methods like `push`, `splice`, and `sort` trigger updates automatically with `$state()` — no need to create new arrays
- **`$state.raw()`** opts out of deep proxying — use it for large, read-only data you replace wholesale
- **`$state.snapshot()`** converts reactive proxies to plain objects for serialization, logging, and identity comparison
- **`$inspect()`** logs state changes during development and is stripped from production builds
- **Event handlers** (`onclick`, `oninput`) are standard DOM events, not framework abstractions — use `event.preventDefault()` instead of modifiers
- **`bind:value`** is syntactic sugar for two-way data flow — use it for simple form inputs, use explicit handlers for transformation and validation
- **Your component is a function from state to UI.** State changes, UI follows. This is the mental model that makes everything else make sense
- State should live at the **lowest common ancestor** of all components that need it — not higher, not lower
