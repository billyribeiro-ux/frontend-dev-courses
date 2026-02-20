# Custom Transitions

Svelte's built-in transitions cover the most common animations, but every project eventually needs something unique — a typewriter effect for text, a wipe for images, or a draw animation for SVG graphics. Svelte lets you build custom transitions that plug into the same `transition:`, `in:`, and `out:` system you already know. You also get access to `crossfade` for morphing elements between positions, and transition events for coordinating complex sequences.

This lesson teaches you to write your own CSS and JavaScript transitions, animate SVG paths with `draw`, pair elements with `crossfade`, and react to transition lifecycle events.

## Custom CSS Transitions

A custom transition is a function that returns an object describing the animation. For CSS transitions, you provide a `css` function that receives `t` (a value from 0 to 1) and returns a CSS string. During intro, `t` goes from 0 to 1. During outro, `t` goes from 1 to 0:

```svelte
<script>
  function whoosh(node, { duration = 400, direction = "left" }) {
    const xOffset = direction === "left" ? -100 : 100;

    return {
      duration,
      css: (t) => `
        transform: translateX(${(1 - t) * xOffset}px) scale(${0.5 + t * 0.5});
        opacity: ${t};
      `
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:whoosh={{ duration: 500, direction: "left" }}>
    <p>I whoosh in from the left!</p>
  </div>
{/if}
```

The function receives two arguments: `node` (the DOM element) and a parameters object (whatever you pass in the template). You can read the element's dimensions, computed styles, or anything else you need to calculate the animation.

## Example: Typewriter Transition

A typewriter effect reveals text character by character. This uses the CSS `clip-path` or `max-width` trick to progressively reveal content:

```svelte
<script>
  function typewriter(node, { speed = 30 }) {
    const text = node.textContent;
    const duration = text.length * speed;

    return {
      duration,
      css: (t) => {
        const chars = Math.floor(text.length * t);
        return `
          clip-path: inset(0 ${100 - (chars / text.length) * 100}% 0 0);
        `;
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <p transition:typewriter={{ speed: 40 }}>
    Welcome to Svelte transitions! This text appears one character at a time.
  </p>
{/if}

<style>
  p {
    font-family: monospace;
    font-size: 1.2rem;
    white-space: nowrap;
  }
</style>
```

The `speed` parameter controls milliseconds per character. Svelte generates the CSS keyframes and runs the animation on the compositor thread for smooth performance.

## Custom JavaScript Transitions

When CSS alone is not enough — for canvas rendering, WebGL, or imperative DOM manipulation — use the `tick` function instead of `css`. The `tick` callback runs on every animation frame:

```svelte
<script>
  function colorShift(node, { duration = 600 }) {
    return {
      duration,
      tick: (t) => {
        const hue = Math.floor(t * 360);
        node.style.backgroundColor = `hsl(${hue}, 70%, 85%)`;
        node.style.opacity = `${t}`;
      }
    };
  }

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div class="box" transition:colorShift={{ duration: 800 }}>
    <p>I shift through colors as I appear!</p>
  </div>
{/if}

<style>
  .box {
    padding: 24px;
    border-radius: 12px;
    text-align: center;
  }
</style>
```

**Performance note**: Prefer CSS transitions whenever possible. CSS animations run on the compositor thread, separate from the main JavaScript thread. JavaScript `tick` transitions run on the main thread and can cause jank if the animation is complex or the page is busy.

## transition:draw for SVG

The `draw` transition animates SVG strokes using `stroke-dasharray` and `stroke-dashoffset`. It makes paths look like they are being drawn by hand. Import it from `svelte/transition`:

```svelte
<script>
  import { draw } from "svelte/transition";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle Drawing</button>

{#if show}
  <svg viewBox="0 0 200 200" width="200" height="200">
    <path
      transition:draw={{ duration: 1500 }}
      d="M 10 80 Q 52.5 10, 95 80 T 180 80"
      fill="none"
      stroke="#3b82f6"
      stroke-width="3"
    />
    <circle
      transition:draw={{ duration: 1000, delay: 500 }}
      cx="100"
      cy="120"
      r="40"
      fill="none"
      stroke="#16a34a"
      stroke-width="2"
    />
    <line
      transition:draw={{ duration: 800, delay: 1000 }}
      x1="20"
      y1="180"
      x2="180"
      y2="180"
      stroke="#dc2626"
      stroke-width="2"
    />
  </svg>
{/if}

<style>
  svg {
    display: block;
    margin: 20px 0;
  }
</style>
```

`draw` works with `<path>`, `<line>`, `<polyline>`, `<polygon>`, `<circle>`, `<rect>`, and any SVG element that has a stroke. Use `delay` to stagger multiple elements for a sequential drawing effect.

## Crossfade — Morphing Between Positions

`crossfade` creates paired `send` and `receive` transitions. When an element with `send` leaves one location and an element with the same key appears elsewhere with `receive`, Svelte smoothly morphs the element between the two positions:

```svelte
<script>
  import { crossfade } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const [send, receive] = crossfade({
    duration: 400,
    easing: quintOut
  });

  let todos = $state([
    { id: 1, text: "Learn transitions" },
    { id: 2, text: "Build a project" },
    { id: 3, text: "Deploy to production" }
  ]);

  let done = $state([]);

  function complete(id) {
    const item = todos.find(t => t.id === id);
    if (item) {
      todos = todos.filter(t => t.id !== id);
      done = [...done, item];
    }
  }

  function uncomplete(id) {
    const item = done.find(t => t.id === id);
    if (item) {
      done = done.filter(t => t.id !== id);
      todos = [...todos, item];
    }
  }
</script>

<div class="board">
  <div class="column">
    <h2>Todo</h2>
    {#each todos as todo (todo.id)}
      <div
        class="card"
        in:receive={{ key: todo.id }}
        out:send={{ key: todo.id }}
      >
        <span>{todo.text}</span>
        <button onclick={() => complete(todo.id)}>Done</button>
      </div>
    {/each}
  </div>

  <div class="column">
    <h2>Completed</h2>
    {#each done as todo (todo.id)}
      <div
        class="card completed"
        in:receive={{ key: todo.id }}
        out:send={{ key: todo.id }}
      >
        <span>{todo.text}</span>
        <button onclick={() => uncomplete(todo.id)}>Undo</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    max-width: 600px;
  }

  .column {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 12px;
    min-height: 200px;
  }

  .card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    margin-bottom: 8px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .card.completed span {
    text-decoration: line-through;
    color: #999;
  }

  button {
    padding: 4px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
  }
</style>
```

The `key` parameter links the `send` and `receive` pair. When an item leaves the "Todo" column with `out:send={{ key: todo.id }}`, Svelte looks for a matching `in:receive={{ key: todo.id }}` in the "Completed" column and animates between the two positions. The result is a smooth morph that feels like the item physically moves across the screen.

## Transition Events

Svelte dispatches events at each stage of a transition's lifecycle. Use these to coordinate animations, disable buttons during transitions, or trigger follow-up actions:

| Event | When It Fires |
|-------|---------------|
| `onintrostart` | Intro transition begins |
| `onintroend` | Intro transition completes |
| `onoutrostart` | Outro transition begins |
| `onoutroend` | Outro transition completes |

```svelte
<script>
  import { fly } from "svelte/transition";

  let show = $state(false);
  let transitioning = $state(false);

  function handleIntroStart() {
    transitioning = true;
  }

  function handleIntroEnd() {
    transitioning = false;
  }

  function handleOutroStart() {
    transitioning = true;
  }

  function handleOutroEnd() {
    transitioning = false;
  }
</script>

<button onclick={() => show = !show} disabled={transitioning}>
  {transitioning ? "Animating..." : show ? "Hide" : "Show"}
</button>

{#if show}
  <div
    transition:fly={{ y: 30, duration: 500 }}
    onintrostart={handleIntroStart}
    onintroend={handleIntroEnd}
    onoutrostart={handleOutroStart}
    onoutroend={handleOutroEnd}
  >
    <p>I disable the button while animating!</p>
  </div>
{/if}

<style>
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  div {
    padding: 16px;
    margin-top: 12px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
  }
</style>
```

Transition events are especially useful for preventing double-clicks during animations, triggering sound effects, or chaining sequential animations.

## Try It

Build a "Kanban Board" with three columns (To Do, In Progress, Done):
- Use `crossfade` to animate items moving between columns
- Write a custom CSS transition called `popIn` that scales and rotates the element slightly as it appears
- Use the `draw` transition on an SVG checkmark that appears when an item moves to the "Done" column
- Disable the move buttons while a transition is in progress using transition events

## Key Takeaways

- Custom CSS transitions return `{ duration, css: (t) => string }` where `t` goes 0 to 1 for intro, 1 to 0 for outro
- Custom JS transitions use `{ duration, tick: (t) => void }` for imperative DOM, canvas, or WebGL work
- Prefer CSS transitions over JS transitions for better performance (compositor thread vs main thread)
- `draw` animates SVG strokes — works with `path`, `line`, `circle`, and other stroke-based elements
- `crossfade` creates paired `send`/`receive` transitions for smooth morphing between positions using matching keys
- Transition events (`onintrostart`, `onintroend`, `onoutrostart`, `onoutroend`) let you coordinate UI behavior during animations
