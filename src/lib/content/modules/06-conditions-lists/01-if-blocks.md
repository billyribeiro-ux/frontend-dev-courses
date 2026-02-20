# Conditional Rendering

In the real world, what you show on screen often depends on some condition. Is the user logged in? Show the dashboard. Are they logged out? Show the login form. Is the cart empty? Show a message. Has an error occurred? Show a warning.

Svelte gives you **if blocks** to handle exactly this — a clean, readable way to show or hide HTML based on conditions. No need for `display: none` hacks or DOM manipulation. Svelte handles it all for you.

## The {#if} Block

The simplest conditional block shows content only when a condition is true:

```svelte
<script>
  let isLoggedIn = $state(true);
</script>

{#if isLoggedIn}
  <p>Welcome back! You are logged in.</p>
{/if}
```

If `isLoggedIn` is `true`, the paragraph appears. If it is `false`, nothing renders — the HTML is not even in the page.

## {#if} ... {:else}

Most conditions have two sides. Use `{:else}` for the alternative:

```svelte
<script>
  let isLoggedIn = $state(false);
</script>

{#if isLoggedIn}
  <h2>Dashboard</h2>
  <p>Welcome to your account.</p>
{:else}
  <h2>Please Log In</h2>
  <p>You need to sign in to see this content.</p>
{/if}

<button onclick={() => isLoggedIn = !isLoggedIn}>
  {isLoggedIn ? "Log Out" : "Log In"}
</button>
```

Click the button to toggle between the two views. Svelte swaps the HTML instantly.

## {:else if} for Multiple Conditions

When you have more than two possibilities, chain conditions with `{:else if}`:

```svelte
<script>
  let temperature = $state(72);
</script>

{#if temperature > 90}
  <p class="hot">It is scorching hot! Stay hydrated.</p>
{:else if temperature > 70}
  <p class="warm">Nice and warm. Perfect weather!</p>
{:else if temperature > 50}
  <p class="cool">A bit cool. Grab a jacket.</p>
{:else}
  <p class="cold">Brrr! Bundle up!</p>
{/if}

<style>
  .hot  { color: #e74c3c; font-weight: bold; }
  .warm { color: #f39c12; }
  .cool { color: #3498db; }
  .cold { color: #2c3e50; font-weight: bold; }
</style>
```

Svelte checks conditions from top to bottom and renders the first one that is true.

## Toggling Visibility

A common pattern is toggling a section open and closed. Here is a FAQ accordion:

```svelte
<script>
  let showAnswer = $state(false);
</script>

<div class="faq">
  <button onclick={() => showAnswer = !showAnswer}>
    What is Svelte? {showAnswer ? "▲" : "▼"}
  </button>

  {#if showAnswer}
    <div class="answer">
      <p>
        Svelte is a modern JavaScript framework that compiles your code
        into tiny, fast vanilla JavaScript at build time.
      </p>
    </div>
  {/if}
</div>

<style>
  .faq {
    max-width: 500px;
    border: 1px solid #ddd;
    border-radius: 8px;
    overflow: hidden;
  }

  button {
    width: 100%;
    padding: 16px;
    text-align: left;
    font-size: 1rem;
    font-weight: bold;
    background: #f8f9fa;
    border: none;
    cursor: pointer;
  }

  .answer {
    padding: 0 16px 16px;
  }
</style>
```

## Conditional CSS Classes

Sometimes you do not want to hide content entirely — you just want to change its appearance. You can conditionally apply classes using expressions:

```svelte
<script>
  let isActive = $state(false);
  let isDark = $state(false);
</script>

<button
  class="tab"
  class:active={isActive}
  onclick={() => isActive = !isActive}
>
  {isActive ? "Active" : "Inactive"}
</button>

<div class={isDark ? "theme-dark" : "theme-light"}>
  <p>Toggle the theme!</p>
  <button onclick={() => isDark = !isDark}>
    Switch to {isDark ? "Light" : "Dark"} Mode
  </button>
</div>

<style>
  .tab {
    padding: 8px 16px;
    border: 2px solid #3498db;
    background: white;
    color: #3498db;
    border-radius: 4px;
    cursor: pointer;
  }

  .tab.active {
    background: #3498db;
    color: white;
  }

  .theme-light {
    background: white;
    color: #333;
    padding: 20px;
    border-radius: 8px;
  }

  .theme-dark {
    background: #2c3e50;
    color: #ecf0f1;
    padding: 20px;
    border-radius: 8px;
  }
</style>
```

The `class:active={isActive}` syntax is a Svelte shorthand — it adds the `active` class when `isActive` is true and removes it when false.

## A Practical Example: Status Badge

```svelte
<script>
  let status = $state("online");
</script>

<div class="user">
  <span class="badge" class:online={status === "online"} class:away={status === "away"} class:offline={status === "offline"}>
    {status}
  </span>
</div>

<div class="controls">
  <button onclick={() => status = "online"}>Online</button>
  <button onclick={() => status = "away"}>Away</button>
  <button onclick={() => status = "offline"}>Offline</button>
</div>

<style>
  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 0.85rem;
    font-weight: bold;
    text-transform: uppercase;
  }

  .online  { background: #2ecc71; color: white; }
  .away    { background: #f39c12; color: white; }
  .offline { background: #95a5a6; color: white; }

  .controls {
    margin-top: 12px;
    display: flex;
    gap: 8px;
  }

  button {
    padding: 6px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    background: white;
  }
</style>
```

## Try It

Build a "Login Page" component with:
- A `$state()` boolean for logged-in status
- An `{#if}` block that shows either a welcome message or a login prompt
- A toggle button to switch between states
- Use `class:` directive to style the button differently based on login state

## Key Takeaways

- `{#if condition}...{/if}` renders HTML only when the condition is true
- `{:else}` provides an alternative when the condition is false
- `{:else if}` chains multiple conditions together
- Use `!variable` (the NOT operator) to toggle booleans: `isOpen = !isOpen`
- `class:name={condition}` adds or removes a CSS class based on a condition
- Conditional rendering is more powerful than `display: none` because the HTML is truly removed from the page
