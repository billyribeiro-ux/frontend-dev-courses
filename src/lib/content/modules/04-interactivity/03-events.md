# Handling Events

Your page can display data beautifully, but a website that does not respond to user actions is just a fancy poster. **Events** are how you make your page interactive — responding to clicks, key presses, mouse movements, form submissions, touch gestures, and more.

In Svelte 5, event handling underwent a fundamental redesign. Gone are the Svelte 4 `on:click` directives and event modifiers. In their place: standard DOM event attributes (`onclick`, `oninput`, `onkeydown`) that map directly to the platform. This is not just a syntax change — it reflects a deeper philosophy. Svelte 5 embraces the web platform rather than abstracting over it.

Understanding events deeply — how they propagate, how the browser dispatches them, how Svelte optimizes them, and how to build accessible interactions — separates someone who can wire up a button from someone who can build a production component library.

## Your First Click Handler

In Svelte 5, you handle clicks with the `onclick` attribute and a function reference:

```svelte
<script>
  let count = $state(0);

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>
  Clicked {count} times
</button>
```

When the user clicks the button, `increment` runs, `count` increases by 1, and Svelte automatically updates the text. That is the reactive loop in action: event fires, state changes, UI updates.

Notice we pass `increment` — the function reference — not `increment()`. If you wrote `onclick={increment()}`, JavaScript would *call* the function immediately during rendering and pass the return value (`undefined`) as the handler. This is a common beginner mistake:

```svelte
<!-- WRONG: calls increment() during render, passes undefined as handler -->
<button onclick={increment()}>Click me</button>

<!-- CORRECT: passes the function reference, called when clicked -->
<button onclick={increment}>Click me</button>

<!-- ALSO CORRECT: wraps in arrow function (needed when passing arguments) -->
<button onclick={() => increment()}>Click me</button>
```

## Inline Event Handlers

For simple one-line actions, you can write the handler directly inline as an arrow function:

```svelte
<script>
  let count = $state(0);
  let message = $state("");
</script>

<button onclick={() => count++}>
  Count: {count}
</button>

<button onclick={() => count = 0}>
  Reset
</button>

<button onclick={() => { count++; message = `Count is now ${count}`; }}>
  Increment with message
</button>
```

The `() =>` syntax creates an anonymous function. Use it for quick one-liners. For anything more than one or two statements, extract a named function — it improves readability, is easier to debug (named functions show up in stack traces), and can be unit-tested independently.

**Guideline:** If your inline handler needs curly braces `{}` for a function body, it should probably be a named function.

## The Event Object

Every event handler receives an **event object** as its first parameter. This object contains information about what happened — where the mouse was, which key was pressed, which element was targeted:

```svelte
<script>
  let mouseX = $state(0);
  let mouseY = $state(0);
  let elementWidth = $state(0);

  function handleMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
  }

  function handleClick(event) {
    // event.target — the element that was actually clicked
    // event.currentTarget — the element the handler is attached to
    // event.clientX/Y — mouse position relative to viewport
    // event.offsetX/Y — mouse position relative to the element
    // event.button — which mouse button (0=left, 1=middle, 2=right)
    // event.shiftKey, event.ctrlKey, event.altKey, event.metaKey — modifier keys
    elementWidth = event.currentTarget.offsetWidth;
  }
</script>

<div class="tracker" onmousemove={handleMouseMove} onclick={handleClick}>
  <p>Mouse: {mouseX}, {mouseY}</p>
  <p>Element width: {elementWidth}px</p>
</div>

<style>
  .tracker {
    height: 200px;
    background: #ecf0f1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: crosshair;
    user-select: none;
  }
</style>
```

### TypeScript Typing for Events

If you are using TypeScript (and you should in production), type your event parameters explicitly. This gives you autocomplete and catches errors:

```svelte
<script lang="ts">
  let value = $state("");
  let key = $state("");

  // Mouse events
  function handleClick(event: MouseEvent) {
    console.log(event.clientX, event.clientY);
  }

  // Keyboard events
  function handleKeyDown(event: KeyboardEvent) {
    key = event.key;
  }

  // Input events — note the cast needed for event.target
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
  }

  // Form events
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget as HTMLFormElement);
  }

  // Focus events
  function handleFocus(event: FocusEvent) {
    console.log("Focused:", event.target);
  }
</script>
```

The most common pain point: `event.target` is typed as `EventTarget | null`, which does not have `.value`. You need to cast it to the specific element type (`HTMLInputElement`, `HTMLSelectElement`, etc.) or use `event.currentTarget` which is more precisely typed in some contexts.

## Common DOM Events Reference

Here is a comprehensive reference of the events you will use most often:

### Mouse Events

| Event | Triggers When | Key Properties |
|-------|--------------|----------------|
| `onclick` | Element is clicked | `clientX`, `clientY`, `button` |
| `ondblclick` | Element is double-clicked | Same as onclick |
| `onmousedown` | Mouse button pressed | `button`, `buttons` |
| `onmouseup` | Mouse button released | `button` |
| `onmousemove` | Mouse moves over element | `clientX`, `clientY`, `movementX`, `movementY` |
| `onmouseenter` | Mouse enters element (no bubble) | `clientX`, `clientY` |
| `onmouseleave` | Mouse leaves element (no bubble) | `clientX`, `clientY` |
| `onmouseover` | Mouse enters element (bubbles) | `relatedTarget` |
| `onmouseout` | Mouse leaves element (bubbles) | `relatedTarget` |
| `oncontextmenu` | Right-click / context menu | `clientX`, `clientY` |

**`mouseenter`/`mouseleave` vs `mouseover`/`mouseout`:** The `enter`/`leave` pair does not bubble and does not fire when moving between child elements. Use `enter`/`leave` for hover effects on a single element. Use `over`/`out` when you need event delegation (the event bubbles to parent handlers).

### Keyboard Events

| Event | Triggers When | Key Properties |
|-------|--------------|----------------|
| `onkeydown` | Key is pressed down | `key`, `code`, `repeat` |
| `onkeyup` | Key is released | `key`, `code` |

**`keydown` vs `keyup`:** Use `keydown` for most keyboard handling — it fires immediately when the key is pressed and repeats if held down. Use `keyup` when you specifically care about the moment a key is released (rare). The old `keypress` event is deprecated — never use it.

### Form / Input Events

| Event | Triggers When | Key Properties |
|-------|--------------|----------------|
| `oninput` | Value changes (immediate) | `target.value`, `data` |
| `onchange` | Value committed (on blur for text, immediately for select/checkbox) | `target.value` |
| `onfocus` | Element gains focus | `relatedTarget` |
| `onblur` | Element loses focus | `relatedTarget` |
| `onsubmit` | Form is submitted | `submitter` |
| `onreset` | Form is reset | — |

**`input` vs `change`:** This distinction matters. `input` fires on every keystroke — great for live search, character counters, real-time validation. `change` fires when the user "commits" a value — after leaving a text field, after selecting a dropdown option. For text inputs, prefer `oninput` for real-time response and `onchange` for "user is done editing" logic.

### Touch Events

| Event | Triggers When | Key Properties |
|-------|--------------|----------------|
| `ontouchstart` | Finger touches screen | `touches`, `targetTouches` |
| `ontouchmove` | Finger moves on screen | `touches`, `changedTouches` |
| `ontouchend` | Finger lifts from screen | `changedTouches` |
| `ontouchcancel` | Touch is interrupted | `changedTouches` |

### Other Useful Events

| Event | Triggers When |
|-------|--------------|
| `onscroll` | Element is scrolled |
| `onresize` | Window is resized (window only) |
| `onwheel` | Mouse wheel / trackpad scroll |
| `ondrag`, `ondrop` | Drag and drop operations |
| `onanimationend` | CSS animation completes |
| `ontransitionend` | CSS transition completes |

## Event Delegation in Svelte 5

Svelte 5 uses **event delegation** for most events. Instead of attaching a listener to every individual element, Svelte attaches a single listener to the document root and routes events to the correct handler based on the event target.

```svelte
<script>
  // Even though you write onclick on 100 buttons,
  // Svelte attaches ONE click listener to document
  // and delegates based on event.target
  let items = $state(Array.from({ length: 100 }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
    selected: false
  })));

  function toggleItem(id) {
    const item = items.find(i => i.id === id);
    if (item) item.selected = !item.selected;
  }
</script>

{#each items as item (item.id)}
  <button
    onclick={() => toggleItem(item.id)}
    class:selected={item.selected}
  >
    {item.label}
  </button>
{/each}
```

**Why this matters:**
1. **Memory efficiency** — 1 listener instead of 100.
2. **Dynamic elements** — New elements added to the DOM automatically work because the listener is on the root, not on each element.
3. **Performance** — Fewer listeners means faster component mount and unmount.

**Events that do NOT delegate:** Some events do not bubble and therefore cannot be delegated. Svelte attaches these directly to the element: `focus`, `blur`, `mouseenter`, `mouseleave`, `scroll`, `resize`. This is handled automatically — you do not need to think about it.

## Preventing Default Behavior

Some elements have built-in browser behaviors — forms reload the page on submit, links navigate to a new URL, right-click opens a context menu. Use `event.preventDefault()` to intercept:

```svelte
<script>
  let formData = $state({ email: "", password: "" });
  let submitted = $state(false);
  let error = $state("");

  function handleSubmit(event) {
    event.preventDefault(); // Stop the page from reloading

    // Validate
    if (!formData.email.includes("@")) {
      error = "Please enter a valid email";
      return;
    }

    if (formData.password.length < 8) {
      error = "Password must be at least 8 characters";
      return;
    }

    error = "";
    submitted = true;
    // In real app: send to API
  }
</script>

<form onsubmit={handleSubmit}>
  <input
    type="email"
    placeholder="Email"
    value={formData.email}
    oninput={(e) => formData.email = e.target.value}
  />
  <input
    type="password"
    placeholder="Password"
    value={formData.password}
    oninput={(e) => formData.password = e.target.value}
  />
  <button type="submit">Sign In</button>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if submitted}
    <p class="success">Signed in as {formData.email}!</p>
  {/if}
</form>

<style>
  form { display: flex; flex-direction: column; gap: 8px; max-width: 300px; }
  input { padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
  .error { color: #e74c3c; font-size: 0.9rem; }
  .success { color: #27ae60; font-size: 0.9rem; }
</style>
```

### Svelte 5 Has No Event Modifiers

In Svelte 4, you could write `on:click|preventDefault|stopPropagation={handler}`. **Svelte 5 removed event modifiers entirely.** You call `event.preventDefault()` and `event.stopPropagation()` explicitly in your handler. This was a deliberate design choice:

```svelte
<!-- Svelte 4 (old — do NOT use) -->
<!-- <button on:click|preventDefault|once={handler}>Click</button> -->

<!-- Svelte 5 — call methods explicitly -->
<script>
  function handleClick(event) {
    event.preventDefault();
    event.stopPropagation();
    // your logic here
  }
</script>
<button onclick={handleClick}>Click</button>
```

The reasoning: modifiers were a mini-DSL that hid what was happening. Explicit method calls are clearer, more debuggable, and work exactly like vanilla JavaScript.

**What about `once`?** For one-time handlers, you have several options:

```svelte
<script>
  let clicked = $state(false);

  function handleOnce(event) {
    if (clicked) return; // Guard against repeat calls
    clicked = true;
    // do something
  }

  // Or use the DOM API directly:
  // element.addEventListener("click", handler, { once: true });
</script>

<button onclick={handleOnce} disabled={clicked}>
  {clicked ? "Done" : "Click once"}
</button>
```

## Stopping Propagation

Events in the DOM propagate (bubble) from the target element up through its ancestors. `event.stopPropagation()` stops this:

```svelte
<script>
  let outerClicks = $state(0);
  let innerClicks = $state(0);

  function handleOuter() {
    outerClicks++;
  }

  function handleInner(event) {
    event.stopPropagation(); // Prevents the outer handler from firing
    innerClicks++;
  }
</script>

<div class="outer" onclick={handleOuter}>
  <p>Outer (clicked {outerClicks}x)</p>
  <button onclick={handleInner}>
    Inner (clicked {innerClicks}x)
  </button>
  <p class="note">Clicking inner does NOT increment outer</p>
</div>

<style>
  .outer {
    padding: 24px; background: #ebf5fb; border-radius: 8px;
    cursor: pointer; text-align: center;
  }
  .note { font-size: 0.8rem; color: #888; margin-top: 8px; }
</style>
```

**When to stop propagation:** Be conservative. Stopping propagation can break things that depend on events reaching parent elements — analytics trackers, focus management, dropdown close handlers. Only stop propagation when you have a specific reason.

### Capture Phase

By default, events bubble *up* from the target. You can also listen during the *capture* phase — as the event travels *down* to the target. Use `onclickcapture` (add `capture` suffix):

```svelte
<script>
  let log = $state([]);

  function addLog(msg) {
    log = [...log, msg];
  }
</script>

<div onclickcapture={() => addLog("outer capture")} onclick={() => addLog("outer bubble")}>
  <button onclickcapture={() => addLog("inner capture")} onclick={() => addLog("inner bubble")}>
    Click me
  </button>
</div>

<p>Event order: {log.join(" → ")}</p>
<button onclick={() => log = []}>Clear log</button>

<!-- Clicking the inner button logs:
     outer capture → inner capture → inner bubble → outer bubble -->
```

Capture-phase listeners are rare in application code but useful for things like global keyboard shortcuts that need to intercept events before any child component handles them.

## Keyboard Event Handling Patterns

Keyboard handling is where event management gets sophisticated. Here are the patterns you will use in production:

```svelte
<script>
  let lastKey = $state("(none)");
  let history = $state([]);

  function handleKeyDown(event) {
    lastKey = event.key;
    history = [...history.slice(-9), event.key]; // Keep last 10

    // Common pattern: handle specific keys
    switch (event.key) {
      case "Enter":
        // Submit, confirm
        break;
      case "Escape":
        // Close, cancel
        break;
      case "ArrowUp":
      case "ArrowDown":
        event.preventDefault(); // Prevent page scroll
        // Navigate list
        break;
      case "Tab":
        // Usually let the browser handle this for accessibility
        break;
    }
  }

  // Keyboard shortcuts with modifiers
  function handleShortcuts(event) {
    // Ctrl+S / Cmd+S (save)
    if ((event.ctrlKey || event.metaKey) && event.key === "s") {
      event.preventDefault();
      // save logic
    }

    // Ctrl+K / Cmd+K (command palette)
    if ((event.ctrlKey || event.metaKey) && event.key === "k") {
      event.preventDefault();
      // open command palette
    }
  }
</script>

<svelte:window onkeydown={handleShortcuts} />

<input
  type="text"
  placeholder="Press any key..."
  onkeydown={handleKeyDown}
/>
<p>Last key: <code>{lastKey}</code></p>
<p>History: {history.map(k => `[${k}]`).join(" ")}</p>
```

### `event.key` vs `event.code`

This is a subtle but important distinction:

- **`event.key`** — The character produced by the key, accounting for keyboard layout and modifier keys. `"a"`, `"A"`, `"Enter"`, `"ArrowUp"`. Use this for character input and named keys.
- **`event.code`** — The physical key on the keyboard, regardless of layout. `"KeyA"`, `"Digit1"`, `"ShiftLeft"`. Use this for game controls or shortcuts that should be based on key position, not character.

```svelte
<script>
  let keyInfo = $state({ key: "", code: "" });

  function handleKey(event) {
    keyInfo = { key: event.key, code: event.code };
  }
</script>

<input onkeydown={handleKey} placeholder="Press a key" />
<p>key: "{keyInfo.key}" — code: "{keyInfo.code}"</p>
<!-- Pressing 'a' → key: "a", code: "KeyA" -->
<!-- Pressing Shift+a → key: "A", code: "KeyA" -->
<!-- On French keyboard, pressing 'q' position → key: "a", code: "KeyQ" -->
```

For most UI work (search boxes, form submission, dialog dismissal), use `event.key`. For games or keyboard-position-dependent shortcuts, use `event.code`.

## Touch Events and Gesture Detection

Touch events are essential for mobile-friendly interfaces. The touch event model is different from mouse events — multiple fingers can touch simultaneously:

```svelte
<script>
  let touchInfo = $state({ startX: 0, startY: 0, currentX: 0, currentY: 0 });
  let gesture = $state("none");
  let touchCount = $state(0);

  function handleTouchStart(event) {
    const touch = event.touches[0];
    touchInfo.startX = touch.clientX;
    touchInfo.startY = touch.clientY;
    touchInfo.currentX = touch.clientX;
    touchInfo.currentY = touch.clientY;
    touchCount = event.touches.length;
    gesture = "touching";
  }

  function handleTouchMove(event) {
    event.preventDefault(); // Prevent scroll while gesturing
    const touch = event.touches[0];
    touchInfo.currentX = touch.clientX;
    touchInfo.currentY = touch.clientY;

    const deltaX = touchInfo.currentX - touchInfo.startX;
    const deltaY = touchInfo.currentY - touchInfo.startY;

    // Simple swipe detection
    if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
      gesture = deltaX > 0 ? "swipe-right" : "swipe-left";
    } else if (Math.abs(deltaY) > 50 && Math.abs(deltaY) > Math.abs(deltaX)) {
      gesture = deltaY > 0 ? "swipe-down" : "swipe-up";
    }
  }

  function handleTouchEnd() {
    touchCount = 0;
    // gesture stays showing the last detected gesture
  }
</script>

<div
  class="touch-area"
  ontouchstart={handleTouchStart}
  ontouchmove={handleTouchMove}
  ontouchend={handleTouchEnd}
>
  <p>Touch count: {touchCount}</p>
  <p>Gesture: {gesture}</p>
  <p>Delta: {touchInfo.currentX - touchInfo.startX}px, {touchInfo.currentY - touchInfo.startY}px</p>
</div>

<style>
  .touch-area {
    height: 200px;
    background: #f0f0f0;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    touch-action: none; /* Prevent browser handling */
    user-select: none;
  }
</style>
```

**Production tip:** For real gesture detection (pinch-to-zoom, rotate, long-press), use a library like Hammer.js or use-gesture rather than rolling your own. The edge cases (multi-touch, browser differences, scroll interference) are numerous.

## Svelte 5: Callback Props Instead of Custom Events

In Svelte 4, child components communicated with parents using `createEventDispatcher`. Svelte 5 replaces this with a simpler pattern: **callback props**.

```svelte
<!-- SearchInput.svelte — child component -->
<script>
  let { onsearch, onreset, placeholder = "Search..." } = $props();
  let query = $state("");

  function handleSubmit(event) {
    event.preventDefault();
    onsearch?.(query); // Call the parent's callback if provided
  }

  function handleReset() {
    query = "";
    onreset?.();
  }
</script>

<form onsubmit={handleSubmit}>
  <input
    type="text"
    bind:value={query}
    {placeholder}
  />
  <button type="submit">Search</button>
  {#if query}
    <button type="button" onclick={handleReset}>Clear</button>
  {/if}
</form>
```

```svelte
<!-- App.svelte — parent component -->
<script>
  import SearchInput from "./SearchInput.svelte";

  let results = $state([]);
  let searchTerm = $state("");

  function handleSearch(query) {
    searchTerm = query;
    // In production: fetch from API
    results = ["Result 1", "Result 2", "Result 3"]
      .filter(r => r.toLowerCase().includes(query.toLowerCase()));
  }

  function handleReset() {
    searchTerm = "";
    results = [];
  }
</script>

<SearchInput onsearch={handleSearch} onreset={handleReset} />

{#if searchTerm}
  <p>Results for "{searchTerm}":</p>
  <ul>
    {#each results as result}
      <li>{result}</li>
    {/each}
  </ul>
{/if}
```

**Why callback props over custom events:**
1. **Type-safe** — Props are typed with TypeScript interfaces. Events were stringly-typed.
2. **Simpler** — No dispatcher boilerplate, no special API to learn. Just functions.
3. **Standard** — This is how React, Vue, and most frameworks handle child-to-parent communication. Transferable knowledge.
4. **Optional chaining** — `onsearch?.(query)` cleanly handles the case where the parent does not provide a callback.

The convention is to name callback props starting with `on` — `onsearch`, `onchange`, `ondelete` — matching DOM event naming.

## Building Accessible Interactive Components

Events are not just about making things clickable — they are about making things usable by *everyone*, including keyboard users, screen reader users, and users with motor impairments.

```svelte
<script>
  let items = $state(["Dashboard", "Settings", "Profile", "Logout"]);
  let activeIndex = $state(0);
  let isOpen = $state(false);

  function handleMenuKeyDown(event) {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        break;
      case "ArrowUp":
        event.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      case "Enter":
      case " ": // Space key
        event.preventDefault();
        // Select current item
        alert(`Selected: ${items[activeIndex]}`);
        break;
      case "Escape":
        isOpen = false;
        break;
      case "Home":
        event.preventDefault();
        activeIndex = 0;
        break;
      case "End":
        event.preventDefault();
        activeIndex = items.length - 1;
        break;
    }
  }
</script>

<div class="menu-container">
  <button
    onclick={() => isOpen = !isOpen}
    aria-expanded={isOpen}
    aria-haspopup="true"
  >
    Menu {isOpen ? "▲" : "▼"}
  </button>

  {#if isOpen}
    <ul
      role="menu"
      onkeydown={handleMenuKeyDown}
    >
      {#each items as item, i}
        <li
          role="menuitem"
          tabindex={i === activeIndex ? 0 : -1}
          class:active={i === activeIndex}
          onclick={() => alert(`Selected: ${item}`)}
          onmouseenter={() => activeIndex = i}
        >
          {item}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .menu-container { position: relative; display: inline-block; }

  button {
    padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px;
    background: white; cursor: pointer;
  }

  ul {
    position: absolute; top: 100%; left: 0;
    list-style: none; margin: 4px 0 0; padding: 4px 0;
    background: white; border: 1px solid #ddd; border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    min-width: 160px;
  }

  li {
    padding: 8px 16px; cursor: pointer;
  }

  li:hover, li.active {
    background: #f0f0f0;
  }
</style>
```

### Accessibility Checklist for Interactive Components

1. **Keyboard navigable** — Can a user reach and operate every interactive element with only the keyboard? Arrow keys for lists, Enter/Space to activate, Escape to close.
2. **Focus management** — When a dropdown opens, focus should move into it. When it closes, focus should return to the trigger.
3. **ARIA attributes** — Use `role`, `aria-expanded`, `aria-haspopup`, `aria-label`, `aria-describedby`, `aria-live` as appropriate.
4. **Click targets** — Minimum 44x44px for touch targets (WCAG 2.5.5). Do not put click handlers on tiny text.
5. **No mouse-only interactions** — If something responds to `onmouseover`, it should also respond to `onfocus`. Hover tooltips need focus equivalents.

## The `svelte:window` and `svelte:document` Special Elements

Sometimes you need to listen to events on the `window` or `document` rather than a specific element. Svelte provides special elements for this:

```svelte
<script>
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let scrollY = $state(0);
  let isOnline = $state(true);
  let keyLog = $state("");

  function handleResize() {
    // innerWidth and innerHeight are already bound below,
    // but you can run additional logic here
  }

  function handleKeyDown(event) {
    keyLog = `${event.key} (${event.code})`;
  }
</script>

<!-- Window-level event listeners -->
<svelte:window
  onkeydown={handleKeyDown}
  onresize={handleResize}
  ononline={() => isOnline = true}
  onoffline={() => isOnline = false}
  bind:innerWidth
  bind:innerHeight
  bind:scrollY
/>

<div class="status-bar">
  <p>Window: {innerWidth}x{innerHeight}</p>
  <p>Scroll: {scrollY}px</p>
  <p>Online: {isOnline ? "Yes" : "No"}</p>
  <p>Last key: {keyLog}</p>
</div>
```

`svelte:window` and `svelte:document` also handle cleanup automatically — when the component is destroyed, all listeners are removed. No manual `removeEventListener` needed.

## Complete Example: Interactive Drawing Canvas

Let's build a component that uses multiple event types together — mouse, keyboard, and touch — to create a simple drawing tool:

```svelte
<script>
  let isDrawing = $state(false);
  let lines = $state([]);
  let currentLine = $state([]);
  let color = $state("#3498db");
  let lineWidth = $state(3);
  let tool = $state("pen"); // "pen" | "eraser"
  let undoStack = $state([]);

  const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#333333"];

  function startDrawing(event) {
    isDrawing = true;
    const point = getPoint(event);
    currentLine = [point];
  }

  function draw(event) {
    if (!isDrawing) return;
    const point = getPoint(event);
    currentLine = [...currentLine, point];
  }

  function stopDrawing() {
    if (!isDrawing) return;
    isDrawing = false;
    if (currentLine.length > 1) {
      lines = [...lines, {
        points: currentLine,
        color: tool === "eraser" ? "#ffffff" : color,
        width: tool === "eraser" ? lineWidth * 3 : lineWidth
      }];
      undoStack = [];
    }
    currentLine = [];
  }

  function getPoint(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function undo() {
    if (lines.length === 0) return;
    const last = lines[lines.length - 1];
    lines = lines.slice(0, -1);
    undoStack = [...undoStack, last];
  }

  function redo() {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    undoStack = undoStack.slice(0, -1);
    lines = [...lines, last];
  }

  function clear() {
    undoStack = [...undoStack, ...lines];
    lines = [];
    currentLine = [];
  }

  function handleKeyDown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === "z") {
      event.preventDefault();
      if (event.shiftKey) { redo(); } else { undo(); }
    }
  }

  function pointsToPath(points) {
    if (points.length < 2) return "";
    return points.map((p, i) =>
      i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`
    ).join(" ");
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="canvas-app">
  <div class="toolbar">
    <div class="color-picker">
      {#each colors as c}
        <button
          class="color-swatch"
          class:selected={color === c && tool === "pen"}
          style:background={c}
          onclick={() => { color = c; tool = "pen"; }}
          aria-label={`Color ${c}`}
        ></button>
      {/each}
    </div>

    <div class="tools">
      <button class:active={tool === "pen"} onclick={() => tool = "pen"}>Pen</button>
      <button class:active={tool === "eraser"} onclick={() => tool = "eraser"}>Eraser</button>
    </div>

    <label class="width-control">
      Width: {lineWidth}
      <input type="range" bind:value={lineWidth} min="1" max="20" />
    </label>

    <div class="actions">
      <button onclick={undo} disabled={lines.length === 0}>Undo</button>
      <button onclick={redo} disabled={undoStack.length === 0}>Redo</button>
      <button onclick={clear} disabled={lines.length === 0}>Clear</button>
    </div>
  </div>

  <svg
    class="canvas"
    onmousedown={startDrawing}
    onmousemove={draw}
    onmouseup={stopDrawing}
    onmouseleave={stopDrawing}
    ontouchstart={startDrawing}
    ontouchmove={draw}
    ontouchend={stopDrawing}
  >
    {#each lines as line}
      <path
        d={pointsToPath(line.points)}
        stroke={line.color}
        stroke-width={line.width}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    {/each}
    {#if currentLine.length > 1}
      <path
        d={pointsToPath(currentLine)}
        stroke={tool === "eraser" ? "#cccccc" : color}
        stroke-width={tool === "eraser" ? lineWidth * 3 : lineWidth}
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
        opacity="0.7"
      />
    {/if}
  </svg>

  <p class="hint">
    Draw with mouse or touch. Ctrl+Z to undo, Ctrl+Shift+Z to redo.
    {lines.length} stroke{lines.length !== 1 ? "s" : ""}
  </p>
</div>

<style>
  .canvas-app {
    max-width: 600px;
    font-family: system-ui, sans-serif;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
    padding: 8px;
    background: #f8f9fa;
    border-radius: 8px 8px 0 0;
    border: 1px solid #ddd;
    border-bottom: none;
  }

  .color-picker { display: flex; gap: 4px; }

  .color-swatch {
    width: 24px; height: 24px; border-radius: 50%;
    border: 2px solid transparent; cursor: pointer; padding: 0;
  }

  .color-swatch.selected { border-color: #333; box-shadow: 0 0 0 2px white, 0 0 0 4px #333; }

  .tools { display: flex; gap: 4px; }
  .tools button {
    padding: 4px 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 0.85rem;
  }
  .tools button.active { background: #333; color: white; }

  .width-control { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; }
  .width-control input { width: 80px; }

  .actions { display: flex; gap: 4px; margin-left: auto; }
  .actions button {
    padding: 4px 10px; border: 1px solid #ddd; border-radius: 4px;
    background: white; cursor: pointer; font-size: 0.85rem;
  }
  .actions button:disabled { opacity: 0.4; cursor: not-allowed; }

  .canvas {
    width: 100%;
    height: 350px;
    background: white;
    border: 1px solid #ddd;
    border-radius: 0 0 8px 8px;
    cursor: crosshair;
    touch-action: none;
  }

  .hint {
    font-size: 0.8rem;
    color: #999;
    margin-top: 6px;
    text-align: center;
  }
</style>
```

Study this example carefully. Notice how:

- **Mouse and touch events** are handled together — `getPoint` normalizes both input sources.
- **Keyboard shortcuts** listen on `svelte:window` so they work regardless of focus.
- **State drives everything** — `lines`, `currentLine`, `color`, `tool`, `lineWidth` are the single source of truth. The SVG is a pure function of that state.
- **Undo/redo** is just array manipulation — pop from `lines` into `undoStack`, and vice versa.
- **No `event.stopPropagation()`** — we do not need it because the SVG canvas handles all its own events.

## Try It

Build a "Keyboard Piano" component with:
- A row of buttons representing piano keys (C, D, E, F, G, A, B)
- `onclick` plays a "note" (just set state to the note name and display it)
- `onkeydown` on `svelte:window` maps keyboard keys (a, s, d, f, g, h, j) to notes so you can "play" with the keyboard
- `onmouseenter` on each key highlights it when hovered
- A `$state` array that records the last 10 notes played (history)
- `class:active` to highlight the currently playing key
- A "Clear History" button that resets the history array
- Accessible: each key button has an `aria-label` with the note name

## Key Takeaways

- Svelte 5 uses **standard DOM event attributes** (`onclick`, `oninput`, `onkeydown`) — no special framework syntax
- Pass **function references** (`onclick={handler}`), not function calls (`onclick={handler()}`)
- The **event object** provides properties like `clientX`, `key`, `target`, and methods like `preventDefault()` and `stopPropagation()`
- **Event modifiers** (`on:click|preventDefault`) are gone in Svelte 5 — call methods explicitly in your handler
- **Event delegation** means Svelte attaches one root listener for most events — you get memory efficiency for free
- Child-to-parent communication uses **callback props** (`onsearch`, `ondelete`), not `createEventDispatcher`
- Use `event.key` for character input and named keys; `event.code` for physical key position
- **Accessibility requires** keyboard handlers alongside mouse handlers — if it responds to click, it must respond to Enter/Space
- `svelte:window` and `svelte:document` let you listen to global events with automatic cleanup
- For **TypeScript**, type event parameters explicitly (`MouseEvent`, `KeyboardEvent`, `SubmitEvent`) and cast `event.target` to the specific element type
