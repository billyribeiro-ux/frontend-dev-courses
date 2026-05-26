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

These three types — strings, numbers, and booleans — are **primitives**. They are simple, single values. Later you will also work with **objects** and **arrays**, which hold collections of values. The distinction matters for reactivity, as we will see.

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

This is powerful, but the deep proxy has a cost — every property access goes through the proxy. For large objects that you replace wholesale (like API response data you never mutate in place), `$state.raw()` gives you a non-proxied version that only reacts to reassignment:

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

Use `$state()` for state you mutate (form data, UI state, user input). Use `$state.raw()` for large, read-heavy data that you replace rather than mutate.

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

**When to use `bind:` vs one-way + handler:**

| Use `bind:value` when... | Use one-way + handler when... |
|--------------------------|-------------------------------|
| Simple form inputs | You need to validate or transform input |
| Quick prototyping | You want to debounce input |
| The binding is straightforward | You need to track additional event data |

For most form inputs, `bind:value` is the right choice. For inputs where you need to intercept or transform the value (like formatting a phone number as the user types), use the explicit handler.

`bind:` works with other attributes too: `bind:checked` for checkboxes, `bind:group` for radio buttons, `bind:this` to get a reference to the DOM element.

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
</script>

<div class="form-container">
  <h2>Create Your Profile</h2>

  <label>
    Name
    <input bind:value={name} placeholder="Your name" />
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
</style>
```

Study this example carefully. Notice how:

- **State drives everything.** The preview section is a pure function of the form state. You never manually update the preview — it updates itself.
- **`$derived`** computes `level` from `experience`. We have not covered `$derived` in depth yet (that is coming), but the idea is natural: some values are computed from other values, and those computations should also be reactive.
- **Conditional rendering** (`{#if name}`) shows the preview only when there is data to show. The UI is always a faithful representation of the current state.
- **`bind:value`** on every input keeps the form state in sync with zero boilerplate.

This is the declarative model in action. Describe the relationship between state and UI once, and the framework maintains it forever.

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

## Try It

Build an "Event RSVP" component:

1. Use `$state()` for the guest's name (string), number of attendees (number), dietary preference (string from a dropdown: "none", "vegetarian", "vegan", "gluten-free"), and whether they need parking (boolean).
2. Use `bind:value` for text inputs and the select dropdown, `bind:checked` for the parking checkbox, and a range slider for attendee count (1-10).
3. Show a live preview card below the form that summarizes the RSVP. Use conditional rendering: only show the dietary line if the preference is not "none", only show the parking note if checked.
4. Add a "Reset" button that sets all state back to default values using an `onclick` handler.
5. Style the form and preview card with scoped CSS.

Stretch goal: add a character counter below the name input showing `{name.length}/50` and change its color to red when the name exceeds 50 characters.

## Key Takeaways

- **Declarative UI** means you describe what the UI looks like for a given state — the framework handles DOM updates
- **`$state()`** is a compile-time rune that creates a reactive signal — Svelte tracks reads and writes to update only the affected DOM nodes
- **Primitive state** (strings, numbers, booleans) reacts to reassignment; **object state** is deep-proxied so nested mutations are also tracked
- **`$state.raw()`** opts out of deep proxying — use it for large, read-only data you replace wholesale
- **Event handlers** (`onclick`, `oninput`) are standard DOM events, not framework abstractions
- **`bind:value`** is syntactic sugar for two-way data flow — use it for simple form inputs
- **Your component is a function from state to UI.** State changes, UI follows. This is the mental model that makes everything else make sense.
