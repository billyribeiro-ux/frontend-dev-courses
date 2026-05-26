# Conditional Rendering

In the real world, what you show on screen almost always depends on some condition. Is the user logged in? Show the dashboard. Are they logged out? Show the login form. Is the cart empty? Display a message. Has an error occurred? Show a warning. Is data still loading? Show a spinner.

Svelte gives you **if blocks** to handle exactly this — a clean, readable way to show or hide HTML based on conditions. Unlike `display: none` or `visibility: hidden` (which merely hide elements visually), Svelte's conditional rendering **truly removes and adds elements to the DOM**. Hidden elements do not exist in the page — they do not consume memory, they do not fire lifecycle callbacks, screen readers do not see them.

This distinction has real consequences for performance, accessibility, and correctness. Let's explore every facet of conditional rendering.

## The {#if} Block — The Foundation

The simplest conditional block shows content only when a condition is true:

```svelte
<script>
  let isLoggedIn = $state(true);
</script>

{#if isLoggedIn}
  <p>Welcome back! You are logged in.</p>
{/if}
```

If `isLoggedIn` is `true`, the paragraph appears. If it is `false`, the HTML is **not in the DOM at all** — not hidden, not invisible, not present. This is different from CSS-based hiding in a fundamental way.

### The Mental Model: Conditional Blocks as Branches

Think of `{#if}` as a branch in a decision tree. The Svelte compiler generates code that creates DOM nodes when the condition becomes true and destroys them when it becomes false. Each time the condition changes, Svelte:

1. Evaluates the condition expression
2. If transitioning from false to true: creates all the DOM nodes inside the block
3. If transitioning from true to false: removes all those DOM nodes
4. If the condition has not changed: does nothing

This means elements inside `{#if}` blocks are **mount/unmount boundaries**. Components inside them get created and destroyed, not just shown and hidden. If a child component fetches data on mount, it will re-fetch every time the condition toggles to true.

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

Click the button to toggle between the two views. Svelte removes one branch's DOM nodes and creates the other's — instantly and efficiently.

### Why Not Just Use CSS `display: none`?

Developers coming from vanilla JS or jQuery often ask: "Why not just hide things with CSS?" Here is why conditional rendering is almost always better:

| `{#if}` blocks | `display: none` |
|---|---|
| Element removed from DOM entirely | Element stays in DOM, just invisible |
| Child components unmount and clean up | Child components stay alive, consuming resources |
| Screen readers do not see hidden content | Screen readers may still announce hidden content |
| No event listeners on hidden elements | Event listeners still fire on hidden elements |
| Re-creates element from scratch on show | Element already in DOM, just shown |

The one case where CSS hiding is better: when you need to frequently toggle something and preserve its internal state (like a complex form the user partially filled out). In that case, use `class:hidden` or `style:display` to hide without destroying. For everything else, prefer `{#if}`.

## {:else if} for Multiple Conditions

When you have more than two possibilities, chain conditions with `{:else if}`:

```svelte
<script>
  let temperature = $state(72);
</script>

<input type="range" bind:value={temperature} min="0" max="120" />
<p>Temperature: {temperature}°F</p>

{#if temperature > 100}
  <p class="extreme">Dangerously hot! Stay indoors.</p>
{:else if temperature > 85}
  <p class="hot">It is hot. Stay hydrated.</p>
{:else if temperature > 70}
  <p class="warm">Nice and warm. Perfect weather!</p>
{:else if temperature > 50}
  <p class="cool">A bit cool. Grab a jacket.</p>
{:else if temperature > 32}
  <p class="cold">Cold. Bundle up!</p>
{:else}
  <p class="freezing">Freezing! Below 32°F — ice warning.</p>
{/if}

<style>
  .extreme  { color: #c0392b; font-weight: bold; }
  .hot      { color: #e74c3c; }
  .warm     { color: #f39c12; }
  .cool     { color: #3498db; }
  .cold     { color: #2c3e50; font-weight: bold; }
  .freezing { color: #8e44ad; font-weight: bold; }
</style>
```

Svelte checks conditions from top to bottom and renders the **first** branch that evaluates to true. Once a match is found, all subsequent branches are skipped. This is exactly like a JavaScript `if/else if/else` chain.

**Important:** The order of conditions matters. If you put `temperature > 50` before `temperature > 100`, the `> 50` branch would catch temperatures of 101 and above (because 101 > 50 is true), and the `> 100` branch would never render. Always order conditions from most specific to least specific.

## Truthy and Falsy Values — The JavaScript Gotchas

`{#if}` does not require a boolean — it evaluates JavaScript's **truthiness** rules. Any value can be used as a condition. This is powerful but has well-known gotchas:

### Falsy values (evaluate to false):

```svelte
<script>
  let zero = 0;
  let emptyString = "";
  let nullVal = null;
  let undefinedVal = undefined;
  let falseVal = false;
  let nan = NaN;
</script>

<!-- ALL of these blocks are HIDDEN — the condition is falsy -->
{#if zero}<p>zero</p>{/if}
{#if emptyString}<p>empty string</p>{/if}
{#if nullVal}<p>null</p>{/if}
{#if undefinedVal}<p>undefined</p>{/if}
{#if falseVal}<p>false</p>{/if}
{#if nan}<p>NaN</p>{/if}
```

### Truthy values (evaluate to true):

```svelte
<script>
  let one = 1;
  let negativeOne = -1;
  let someString = "hello";
  let whiteSpace = " "; // a space IS truthy!
  let emptyArray = [];  // empty arrays ARE truthy!
  let emptyObject = {}; // empty objects ARE truthy!
  let zeroString = "0"; // the string "0" IS truthy!
</script>

<!-- ALL of these blocks are SHOWN — the condition is truthy -->
{#if one}<p>1</p>{/if}
{#if negativeOne}<p>-1</p>{/if}
{#if someString}<p>"hello"</p>{/if}
{#if whiteSpace}<p>" " (space)</p>{/if}
{#if emptyArray}<p>[] (empty array)</p>{/if}
{#if emptyObject}<p>{} (empty object)</p>{/if}
{#if zeroString}<p>"0" (string zero)</p>{/if}
```

### The Common Gotchas

**Gotcha 1: `0` is falsy.** This bites you when checking array lengths or counts:

```svelte
<script>
  let items = $state([]);
</script>

<!-- BUG: items.length is 0, which is falsy — this block never shows! -->
{#if items.length}
  <p>You have {items.length} items</p>
{:else}
  <p>No items</p>
{/if}

<!-- Wait — this actually works correctly for THIS case because 0 IS falsy
     and we WANT to show "No items" when length is 0.
     The bug would be: -->

<script>
  let count = $state(0);
</script>

<!-- BUG: count of 0 is a valid value, but this hides it -->
{#if count}
  <p>Count: {count}</p>
{/if}

<!-- FIX: be explicit about what you mean -->
{#if count !== null && count !== undefined}
  <p>Count: {count}</p>
{/if}

<!-- OR: if you just want to check it is a number -->
{#if typeof count === "number"}
  <p>Count: {count}</p>
{/if}
```

**Gotcha 2: Empty arrays and objects are truthy.**

```svelte
<script>
  let items = $state([]);
</script>

<!-- BUG: shows "Items loaded" even when array is empty -->
{#if items}
  <p>Items loaded</p>
{/if}

<!-- FIX: check the length -->
{#if items.length > 0}
  <p>Items loaded ({items.length})</p>
{/if}
```

**Gotcha 3: The string `"0"` and `"false"` are truthy.**

```svelte
<script>
  let value = "0"; // from an API response, perhaps
</script>

<!-- BUG: "0" is truthy, so this shows even though the value is semantically "zero" -->
{#if value}
  <p>Has value: {value}</p>
{/if}

<!-- FIX: parse to number first, or compare explicitly -->
{#if Number(value) > 0}
  <p>Has positive value: {value}</p>
{/if}
```

**The rule of thumb:** When the set of "show this" values does not exactly match JavaScript's truthy set, use an explicit comparison (`> 0`, `!== null`, `.length > 0`) instead of relying on truthiness.

## Toggling Visibility — The Fundamental Pattern

Toggling a boolean is the simplest and most common interactive pattern. Here is an FAQ accordion:

```svelte
<script>
  let showAnswer = $state(false);
</script>

<div class="faq">
  <button
    onclick={() => showAnswer = !showAnswer}
    aria-expanded={showAnswer}
  >
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
    display: flex;
    justify-content: space-between;
  }

  .answer {
    padding: 0 16px 16px;
  }
</style>
```

Note the `aria-expanded` attribute — screen readers use it to announce whether the section is open or closed. Every accordion, dropdown, and collapsible panel should have this attribute.

## {#if} with Derived State

When your condition depends on computed values, `$derived` keeps the condition reactive:

```svelte
<script>
  let password = $state("");
  let confirmPassword = $state("");

  let hasMinLength = $derived(password.length >= 8);
  let hasUppercase = $derived(/[A-Z]/.test(password));
  let hasNumber = $derived(/[0-9]/.test(password));
  let passwordsMatch = $derived(password === confirmPassword && password.length > 0);
  let isValid = $derived(hasMinLength && hasUppercase && hasNumber && passwordsMatch);
</script>

<div class="form">
  <label>
    Password
    <input type="password" bind:value={password} />
  </label>

  <label>
    Confirm Password
    <input type="password" bind:value={confirmPassword} />
  </label>

  <ul class="rules">
    <li class:pass={hasMinLength} class:fail={!hasMinLength}>
      {hasMinLength ? "✓" : "✗"} At least 8 characters
    </li>
    <li class:pass={hasUppercase} class:fail={!hasUppercase}>
      {hasUppercase ? "✓" : "✗"} Contains uppercase letter
    </li>
    <li class:pass={hasNumber} class:fail={!hasNumber}>
      {hasNumber ? "✓" : "✗"} Contains a number
    </li>
    <li class:pass={passwordsMatch} class:fail={!passwordsMatch}>
      {passwordsMatch ? "✓" : "✗"} Passwords match
    </li>
  </ul>

  {#if isValid}
    <button class="submit">Create Account</button>
  {:else}
    <button class="submit" disabled>Fix errors above</button>
  {/if}
</div>

<style>
  .form { max-width: 300px; display: flex; flex-direction: column; gap: 12px; }
  label { display: flex; flex-direction: column; gap: 4px; font-weight: 600; font-size: 0.9rem; }
  input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
  .rules { list-style: none; padding: 0; margin: 0; font-size: 0.85rem; }
  .rules li { padding: 2px 0; }
  .pass { color: #27ae60; }
  .fail { color: #e74c3c; }
  .submit { padding: 10px; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
  .submit:not(:disabled) { background: #27ae60; color: white; }
  .submit:disabled { background: #eee; color: #999; cursor: not-allowed; }
</style>
```

Here, each rule is a `$derived` boolean, and the overall `isValid` is derived from all of them. The template uses both `{#if}` blocks and `class:` directives driven by these derived values. As the user types, every validation indicator updates in real-time.

## Nested Conditionals and When to Refactor

Nested `{#if}` blocks are valid but can become hard to read:

```svelte
<!-- Nested — hard to follow -->
{#if user}
  {#if user.isAdmin}
    {#if user.permissions.includes("write")}
      <button>Edit</button>
    {:else}
      <p>Read-only admin</p>
    {/if}
  {:else}
    <p>Regular user</p>
  {/if}
{:else}
  <p>Not logged in</p>
{/if}
```

When you hit three levels of nesting, refactor. Two strategies:

**Strategy 1: Flatten with `{:else if}`**

```svelte
{#if user?.isAdmin && user?.permissions.includes("write")}
  <button>Edit</button>
{:else if user?.isAdmin}
  <p>Read-only admin</p>
{:else if user}
  <p>Regular user</p>
{:else}
  <p>Not logged in</p>
{/if}
```

**Strategy 2: Derive a state variable**

```svelte
<script>
  let user = $state(null);

  let userRole = $derived(
    !user ? "anonymous" :
    user.isAdmin && user.permissions.includes("write") ? "admin-write" :
    user.isAdmin ? "admin-readonly" :
    "user"
  );
</script>

{#if userRole === "admin-write"}
  <button>Edit</button>
{:else if userRole === "admin-readonly"}
  <p>Read-only admin</p>
{:else if userRole === "user"}
  <p>Regular user</p>
{:else}
  <p>Not logged in</p>
{/if}
```

Strategy 2 is better when the same condition is used in multiple places (e.g., the nav also needs to know the role). The derived value computes the "role" once, and every template block reads from it.

## Pattern Matching with {@const} and Discriminated Unions

When working with TypeScript discriminated unions — objects whose type is determined by a `type` or `status` field — `{#if}` blocks combine with `{@const}` for clean pattern matching:

```svelte
<script>
  // Simulating an API response state machine
  let state = $state({ status: "idle" });

  async function loadData() {
    state = { status: "loading" };
    try {
      // Simulate API call
      await new Promise(r => setTimeout(r, 1500));
      state = {
        status: "success",
        data: [
          { id: 1, name: "Alice", score: 92 },
          { id: 2, name: "Bob", score: 87 },
          { id: 3, name: "Charlie", score: 95 }
        ]
      };
    } catch (err) {
      state = { status: "error", message: "Failed to load data" };
    }
  }

  function simulateError() {
    state = { status: "error", message: "Network timeout after 30s" };
  }
</script>

<div class="container">
  <div class="actions">
    <button onclick={loadData} disabled={state.status === "loading"}>
      Load Data
    </button>
    <button onclick={simulateError} disabled={state.status === "loading"}>
      Simulate Error
    </button>
    <button onclick={() => state = { status: "idle" }}>
      Reset
    </button>
  </div>

  {#if state.status === "idle"}
    <div class="state-idle">
      <p>Click "Load Data" to fetch results.</p>
    </div>
  {:else if state.status === "loading"}
    <div class="state-loading">
      <div class="spinner"></div>
      <p>Loading data...</p>
    </div>
  {:else if state.status === "error"}
    {@const errorMessage = state.message}
    <div class="state-error" role="alert">
      <p><strong>Error:</strong> {errorMessage}</p>
      <button onclick={loadData}>Retry</button>
    </div>
  {:else if state.status === "success"}
    {@const items = state.data}
    {@const average = items.reduce((s, i) => s + i.score, 0) / items.length}
    <div class="state-success">
      <p>Loaded {items.length} items (avg score: {average.toFixed(1)})</p>
      <ul>
        {#each items as item (item.id)}
          <li>{item.name}: {item.score}</li>
        {/each}
      </ul>
    </div>
  {/if}
</div>

<style>
  .container { max-width: 400px; }
  .actions { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .actions button { padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; background: white; }
  .actions button:disabled { opacity: 0.5; cursor: not-allowed; }

  .state-idle { padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; color: #666; }
  .state-loading { padding: 20px; text-align: center; }
  .state-error { padding: 16px; background: #fdecea; border: 1px solid #f5c6cb; border-radius: 8px; }
  .state-error button { margin-top: 8px; }
  .state-success { padding: 16px; background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; }
  .state-success ul { margin: 8px 0 0; padding-left: 20px; }

  .spinner {
    width: 24px; height: 24px;
    border: 3px solid #eee; border-top: 3px solid #3498db;
    border-radius: 50%; margin: 0 auto 8px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
```

This pattern — `{#if status === "x"}` with `{@const}` to extract type-specific fields — is how you model state machines in templates. Each branch knows exactly what fields are available. In TypeScript, the compiler can narrow the type within each branch.

## The {#key} Block — Forcing Re-creation

Sometimes you want to force an element or component to be destroyed and recreated when a value changes. The `{#key}` block does this:

```svelte
<script>
  let userId = $state(1);

  // Simulate fetching user data
  function getUser(id) {
    const users = {
      1: { name: "Alice", role: "Admin" },
      2: { name: "Bob", role: "Editor" },
      3: { name: "Charlie", role: "Viewer" }
    };
    return users[id] || { name: "Unknown", role: "None" };
  }

  let user = $derived(getUser(userId));
</script>

<select bind:value={userId}>
  <option value={1}>User 1</option>
  <option value={2}>User 2</option>
  <option value={3}>User 3</option>
</select>

<!-- Without {#key}: Svelte updates the existing DOM nodes in place -->
<div class="user-card">
  <h3>{user.name}</h3>
  <p>{user.role}</p>
</div>

<!-- With {#key}: Svelte destroys and recreates the DOM nodes when userId changes -->
{#key userId}
  <div class="user-card animated">
    <h3>{user.name}</h3>
    <p>{user.role}</p>
  </div>
{/key}

<style>
  .user-card { padding: 16px; border: 1px solid #ddd; border-radius: 8px; margin-top: 12px; }

  .animated {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
```

**When `{#key}` is useful:**
1. **Re-triggering CSS animations** — An animation only runs when an element is created. Without `{#key}`, updating text content does not re-trigger the animation.
2. **Resetting component state** — If a child component has its own `$state`, wrapping it in `{#key}` destroys the old instance and creates a fresh one with default state.
3. **Forcing a fresh mount** — When a component fetches data in `onMount`, `{#key}` forces a new fetch when the key changes.

**When NOT to use `{#key}`:** When you just want to update content. Destroying and recreating DOM is more expensive than updating in place. Use `{#key}` only when you specifically need the destroy/create cycle.

## Accessibility Implications of Conditional Rendering

Conditional rendering has real consequences for assistive technology. Here are the patterns you must know:

### Live Regions for Dynamic Content

When content appears or disappears, screen readers need to be told:

```svelte
<script>
  let status = $state("");
  let loading = $state(false);

  async function saveData() {
    loading = true;
    status = "Saving...";
    await new Promise(r => setTimeout(r, 2000));
    loading = false;
    status = "Saved successfully!";
  }
</script>

<!-- aria-live="polite" makes the screen reader announce changes -->
<div aria-live="polite" aria-atomic="true">
  {#if status}
    <p class={loading ? "loading" : "success"}>{status}</p>
  {/if}
</div>

<button onclick={saveData} disabled={loading}>
  {loading ? "Saving..." : "Save"}
</button>
```

`aria-live="polite"` tells screen readers: "When the content of this region changes, announce it at the next convenient moment." Use `"assertive"` for urgent messages (errors) and `"polite"` for status updates.

### Conditional Rendering vs Hiding for Accessibility

```svelte
<!-- GOOD: truly conditional content — not needed when hidden -->
{#if isLoggedIn}
  <nav>Dashboard navigation</nav>
{/if}

<!-- GOOD: visually hidden but accessible to screen readers -->
<span class="sr-only">Opens in new window</span>

<!-- BAD: using aria-hidden instead of conditional rendering -->
<!-- The element still exists in the DOM, consuming resources -->
<nav aria-hidden={!isLoggedIn}>Dashboard navigation</nav>
```

Use `{#if}` when content should not exist at all for the current state. Use `aria-hidden` only when content should be visually present but hidden from assistive technology (decorative icons, duplicate info).

## Conditional CSS Classes — The class: Directive

Sometimes you do not want to show/hide content — you just want to change its appearance. The `class:` directive is the right tool:

```svelte
<script>
  let status = $state("online");
</script>

<div class="user">
  <span
    class="badge"
    class:online={status === "online"}
    class:away={status === "away"}
    class:offline={status === "offline"}
  >
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

## Complete Example: Multi-State Application Shell

Here is a production-quality example combining everything — `{#if}`/`{:else if}`, `{#key}`, `$derived`, `{@const}`, class directives, accessibility, and state machine patterns:

```svelte
<script>
  // Application state
  let currentPage = $state("dashboard");
  let user = $state({ name: "Alex", role: "admin", notifications: 3 });
  let theme = $state("light");
  let sidebarOpen = $state(true);

  // Data states — each page has its own loading state
  let dashboardData = $state({ status: "idle" });
  let settingsData = $state({ status: "idle" });

  const pages = ["dashboard", "settings", "profile", "help"];

  let pageTitle = $derived(
    currentPage === "dashboard" ? "Dashboard" :
    currentPage === "settings" ? "Settings" :
    currentPage === "profile" ? "Profile" :
    currentPage === "help" ? "Help Center" :
    "Unknown Page"
  );

  let hasNotifications = $derived(user.notifications > 0);

  async function loadDashboard() {
    dashboardData = { status: "loading" };
    await new Promise(r => setTimeout(r, 1000));
    dashboardData = {
      status: "success",
      data: {
        revenue: 48750,
        users: 1234,
        orders: 56,
        growth: 12.5
      }
    };
  }

  function navigate(page) {
    currentPage = page;
    if (page === "dashboard" && dashboardData.status === "idle") {
      loadDashboard();
    }
  }
</script>

<div class="app" class:dark={theme === "dark"}>
  <!-- Sidebar -->
  {#if sidebarOpen}
    <nav class="sidebar" aria-label="Main navigation">
      <h2>My App</h2>
      <ul>
        {#each pages as page}
          <li>
            <button
              class:active={currentPage === page}
              onclick={() => navigate(page)}
              aria-current={currentPage === page ? "page" : undefined}
            >
              {page.charAt(0).toUpperCase() + page.slice(1)}
              {#if page === "dashboard" && hasNotifications}
                <span class="notification-dot" aria-label="{user.notifications} notifications">
                  {user.notifications}
                </span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
    </nav>
  {/if}

  <!-- Main content -->
  <main class:full-width={!sidebarOpen}>
    <header>
      <button
        class="menu-toggle"
        onclick={() => sidebarOpen = !sidebarOpen}
        aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
      >
        {sidebarOpen ? "◀" : "▶"}
      </button>
      <h1>{pageTitle}</h1>
      <div class="header-actions">
        <button onclick={() => theme = theme === "light" ? "dark" : "light"}>
          {theme === "light" ? "🌙" : "☀️"}
        </button>
        <span>Hi, {user.name}</span>
      </div>
    </header>

    <!-- Page content with key to re-trigger animations -->
    {#key currentPage}
      <div class="page-content" aria-live="polite">
        {#if currentPage === "dashboard"}
          {#if dashboardData.status === "idle"}
            <div class="placeholder">
              <p>Welcome! Click "Load Data" or navigate to load the dashboard.</p>
              <button onclick={loadDashboard}>Load Data</button>
            </div>
          {:else if dashboardData.status === "loading"}
            <div class="loading">
              <div class="spinner"></div>
              <p>Loading dashboard...</p>
            </div>
          {:else if dashboardData.status === "success"}
            {@const d = dashboardData.data}
            {@const formattedRevenue = d.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 })}
            <div class="dashboard-grid">
              <div class="stat-card">
                <span class="stat-label">Revenue</span>
                <span class="stat-value">{formattedRevenue}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Users</span>
                <span class="stat-value">{d.users.toLocaleString()}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Orders</span>
                <span class="stat-value">{d.orders}</span>
              </div>
              <div class="stat-card">
                <span class="stat-label">Growth</span>
                <span class="stat-value" class:positive={d.growth > 0}>
                  {d.growth > 0 ? "+" : ""}{d.growth}%
                </span>
              </div>
            </div>
          {/if}
        {:else if currentPage === "settings"}
          <div class="settings-page">
            <h3>Preferences</h3>
            <label>
              <input type="checkbox" checked={theme === "dark"} onchange={() => theme = theme === "dark" ? "light" : "dark"} />
              Dark Mode
            </label>
            <label>
              <input type="checkbox" bind:checked={sidebarOpen} />
              Show Sidebar
            </label>
          </div>
        {:else if currentPage === "profile"}
          <div class="profile-page">
            <h3>{user.name}</h3>
            <p>Role: {user.role}</p>
          </div>
        {:else}
          <div class="help-page">
            <h3>Help Center</h3>
            <p>How can we help you today?</p>
          </div>
        {/if}
      </div>
    {/key}
  </main>
</div>

<style>
  .app {
    display: flex; min-height: 400px; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;
    font-family: system-ui, sans-serif; background: white; color: #333;
  }
  .app.dark { background: #1a1a2e; color: #eee; }

  .sidebar {
    width: 200px; background: #f8f9fa; border-right: 1px solid #ddd; padding: 16px;
  }
  .app.dark .sidebar { background: #16213e; border-color: #333; }
  .sidebar h2 { margin: 0 0 16px; font-size: 1.1rem; }
  .sidebar ul { list-style: none; padding: 0; margin: 0; }
  .sidebar button {
    width: 100%; text-align: left; padding: 8px 12px; border: none; border-radius: 6px;
    background: none; cursor: pointer; font-size: 0.9rem; color: inherit; position: relative;
  }
  .sidebar button:hover { background: #e9ecef; }
  .app.dark .sidebar button:hover { background: #1a1a3e; }
  .sidebar button.active { background: #3498db; color: white; }

  .notification-dot {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    background: #e74c3c; color: white; border-radius: 10px; padding: 0 6px;
    font-size: 0.7rem; font-weight: bold;
  }

  main { flex: 1; display: flex; flex-direction: column; }
  main.full-width { width: 100%; }

  header {
    display: flex; align-items: center; gap: 12px; padding: 12px 16px;
    border-bottom: 1px solid #ddd;
  }
  .app.dark header { border-color: #333; }
  header h1 { margin: 0; font-size: 1.2rem; flex: 1; }
  .menu-toggle { border: none; background: none; cursor: pointer; font-size: 1rem; color: inherit; }
  .header-actions { display: flex; align-items: center; gap: 12px; font-size: 0.9rem; }
  .header-actions button { border: none; background: none; cursor: pointer; font-size: 1.2rem; }

  .page-content {
    padding: 20px; flex: 1;
    animation: slideIn 0.2s ease-out;
  }
  @keyframes slideIn { from { opacity: 0; transform: translateX(8px); } to { opacity: 1; transform: translateX(0); } }

  .placeholder, .loading { text-align: center; padding: 40px; color: #888; }
  .spinner { width: 24px; height: 24px; border: 3px solid #eee; border-top: 3px solid #3498db; border-radius: 50%; margin: 0 auto 8px; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .dashboard-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .stat-card { padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  .app.dark .stat-card { border-color: #333; }
  .stat-label { font-size: 0.8rem; color: #888; text-transform: uppercase; }
  .stat-value { display: block; font-size: 1.5rem; font-weight: bold; margin-top: 4px; }
  .positive { color: #27ae60; }

  .settings-page label { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
</style>
```

Study this example. Notice:

- **State machine pattern** — `dashboardData.status` drives the loading/success/error display. Each status has exactly one branch.
- **`{#key currentPage}`** wraps the page content, triggering a slide-in animation on every navigation.
- **`$derived`** computes `pageTitle` and `hasNotifications` from raw state.
- **`{@const}`** extracts `d` and `formattedRevenue` inside the success branch — values that only exist in that context.
- **`aria-live`** on the page content region announces page changes to screen readers.
- **`aria-current="page"`** marks the active navigation item for assistive technology.

## Try It

Build a "Login Flow" component with four states: `idle`, `loading`, `success`, `error`:
1. In `idle`: show email/password inputs and a "Sign In" button.
2. On click, transition to `loading`: show a spinner and disable the form.
3. After 2 seconds (simulated with `setTimeout`), transition to either `success` (show welcome message and a "Sign Out" button) or `error` (show error message and a "Try Again" button).
4. Use `$derived` to validate the form (email must include `@`, password must be 6+ chars) and disable the Sign In button when invalid.
5. Use `{#key}` to animate transitions between states.
6. Add `aria-live` for status announcements and `aria-invalid` on invalid inputs.

## Key Takeaways

- **`{#if condition}...{/if}`** renders HTML only when the condition is true — elements are truly added to and removed from the DOM
- **`{:else}`** provides the alternative branch; **`{:else if}`** chains multiple conditions evaluated top-to-bottom
- **Truthiness gotchas:** `0`, `""`, `null`, `undefined`, `NaN`, and `false` are falsy; empty arrays and objects are truthy; the string `"0"` is truthy — use explicit comparisons when JavaScript's truthiness does not match your intent
- **Nested `{#if}` blocks** beyond 2-3 levels should be refactored — flatten with `{:else if}` or extract a derived state variable
- **`{#key expression}`** forces destroy/recreate — use it to re-trigger animations, reset component state, or force a fresh `onMount`
- **`{@const}`** creates block-scoped computed values within `{#if}` branches — particularly useful with discriminated unions
- **Accessibility:** use `aria-live` regions to announce conditional content changes, `aria-expanded` on toggle buttons, and `aria-current="page"` on active navigation items
- **CSS hiding vs `{#if}`:** Use `{#if}` when elements should not exist; use CSS hiding when you need to preserve element state across toggles
- **State machine pattern:** Model complex UI states as a `status` field with discriminated branches — each `{:else if}` handles exactly one state
