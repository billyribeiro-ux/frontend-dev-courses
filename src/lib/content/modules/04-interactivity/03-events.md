# Handling Events

Your page can display data beautifully, but a website that does not respond to user actions is just a fancy poster. **Events** are how you make your page interactive — responding to clicks, key presses, mouse movements, and more.

In Svelte 5, event handling is clean and simple. You attach handlers directly to HTML elements using familiar syntax. Combined with `$state()`, events let you build truly interactive components.

## Your First Click Handler

In Svelte 5, you handle clicks with the `onclick` attribute and a function:

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

When the user clicks the button, `increment` runs, `count` increases by 1, and Svelte automatically updates the text. That is reactivity in action.

## Inline Event Handlers

For simple one-line actions, you can write the handler directly inline:

```svelte
<script>
  let count = $state(0);
</script>

<button onclick={() => count++}>
  Count: {count}
</button>

<button onclick={() => count = 0}>
  Reset
</button>
```

The `() =>` syntax creates a small inline function. Use it for quick actions; use named functions for anything longer than one line.

## The Event Object

Every event handler receives an **event object** with information about what happened. You access it as the first parameter:

```svelte
<script>
  let mouseX = $state(0);
  let mouseY = $state(0);

  function handleMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;
  }
</script>

<div class="tracker" onmousemove={handleMouseMove}>
  <p>Mouse position: {mouseX}, {mouseY}</p>
</div>

<style>
  .tracker {
    height: 200px;
    background: #ecf0f1;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: crosshair;
  }
</style>
```

## Common Events

Here are the events you will use most often:

| Event | Triggers When |
|-------|--------------|
| `onclick` | Element is clicked |
| `ondblclick` | Element is double-clicked |
| `onmouseover` | Mouse enters the element |
| `onmouseout` | Mouse leaves the element |
| `onmousemove` | Mouse moves over the element |
| `onkeydown` | A key is pressed down |
| `onkeyup` | A key is released |
| `oninput` | Text input value changes |
| `onsubmit` | A form is submitted |

## Preventing Default Behavior

Some elements have built-in behaviors — forms reload the page on submit, and links navigate away. Use `event.preventDefault()` to stop that:

```svelte
<script>
  let message = $state("");

  function handleSubmit(event) {
    event.preventDefault();
    message = "Form submitted without page reload!";
  }
</script>

<form onsubmit={handleSubmit}>
  <input type="text" placeholder="Type something..." />
  <button type="submit">Submit</button>
</form>

<p>{message}</p>
```

## Building a Click Counter

Let's build a more complete interactive component:

```svelte
<script>
  let count = $state(0);
  let lastAction = $state("None");

  function increment() {
    count++;
    lastAction = "Incremented";
  }

  function decrement() {
    if (count > 0) {
      count--;
      lastAction = "Decremented";
    }
  }

  function reset() {
    count = 0;
    lastAction = "Reset";
  }
</script>

<div class="counter">
  <h2>Counter: {count}</h2>
  <div class="buttons">
    <button onclick={decrement}>-</button>
    <button onclick={reset}>Reset</button>
    <button onclick={increment}>+</button>
  </div>
  <p class="action">Last action: {lastAction}</p>
</div>

<style>
  .counter {
    text-align: center;
    padding: 24px;
    max-width: 300px;
    margin: 0 auto;
    border: 2px solid #ddd;
    border-radius: 12px;
  }

  .buttons {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  button {
    padding: 8px 20px;
    font-size: 1.2rem;
    border: none;
    border-radius: 6px;
    background: #3498db;
    color: white;
    cursor: pointer;
  }

  button:hover {
    background: #2980b9;
  }

  .action {
    color: #888;
    font-size: 0.9rem;
    margin-top: 12px;
  }
</style>
```

## Keyboard Events

You can listen for specific keys using the `event.key` property:

```svelte
<script>
  let lastKey = $state("Press any key...");

  function handleKeyDown(event) {
    lastKey = `You pressed: ${event.key}`;
  }
</script>

<input
  type="text"
  placeholder="Type here..."
  onkeydown={handleKeyDown}
/>
<p>{lastKey}</p>
```

## Try It

Build a "Color Picker" component with:
- Three buttons labeled "Red", "Green", "Blue"
- A `$state()` variable for the current color
- Clicking a button changes a `<div>` background to that color
- Display the current color name below the buttons
- Add a "Reset" button that sets the background back to white

## Key Takeaways

- Svelte 5 uses `onclick`, `onmouseover`, etc. directly on elements
- Named functions are best for multi-line logic; inline `() =>` arrows are fine for one-liners
- The event object provides details like `event.clientX`, `event.key`, and `event.target`
- Use `event.preventDefault()` to stop default browser behavior (like form submission)
- Combine `$state()` with event handlers to build fully interactive components
