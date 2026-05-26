# Motion & Animate

Transitions handle elements entering and leaving the DOM. But what about elements that **move** — a list item sliding to a new position after sorting, a progress bar smoothly filling, or a draggable element springing back to its origin? Svelte provides three tools for this: the `animate:flip` directive for list reordering, `Tween` for smooth value interpolation, and `Spring` for physics-based motion.

These tools combine with transitions to create interfaces where everything moves fluidly. Items entering a list fade in, items leaving fade out, and the remaining items smoothly slide to fill the gap. This lesson covers each tool in depth — including the internal mechanics, performance characteristics, and advanced patterns — and shows how to combine them for polished, production-quality animations.

## animate:flip — Smooth List Reordering

When items in a keyed `{#each}` block change position, they normally jump instantly to their new location. The `animate:flip` directive measures each element's old and new position and smoothly animates between them.

### The FLIP Technique Deep Dive

FLIP stands for **First, Last, Invert, Play** — a performance pattern for layout animations:

1. **First**: Before the DOM change, Svelte records each element's position using `getBoundingClientRect()`. It captures `top`, `left`, `width`, and `height`.
2. **Last**: The DOM change is applied (items are reordered). Svelte records each element's new position.
3. **Invert**: For each element, Svelte calculates the delta between old and new positions: `deltaX = first.left - last.left`, `deltaY = first.top - last.top`. It applies a CSS `transform: translate(deltaX, deltaY)` — the element is now visually in its old position, even though its DOM position has changed.
4. **Play**: Svelte removes the transform with a CSS transition, so the element smoothly animates from its old visual position to its new DOM position.

Why is this performant? Because `transform` is a compositor-only property. The browser does not need to recalculate layout or repaint — it just moves pixels on the GPU. The actual DOM reorder happens instantly in step 2, which is a single layout calculation. The animation in step 4 is free from layout thrashing.

The key requirement is the `(key)` expression in `{#each}`. Without it, Svelte cannot track which DOM element moved where. It would have to destroy and recreate elements instead of animating them:

```svelte
<!-- WRONG — no key, items are destroyed and recreated -->
{#each items as item}
  <li animate:flip>{item.name}</li>
{/each}

<!-- CORRECT — key enables identity tracking -->
{#each items as item (item.id)}
  <li animate:flip>{item.name}</li>
{/each}
```

### Basic Usage

```svelte
<script>
  import { flip } from "svelte/animate";

  let items = $state([
    { id: 1, name: "Alpha", priority: 3 },
    { id: 2, name: "Beta", priority: 1 },
    { id: 3, name: "Gamma", priority: 4 },
    { id: 4, name: "Delta", priority: 2 }
  ]);

  function sortByPriority() {
    items = [...items].sort((a, b) => a.priority - b.priority);
  }

  function sortByName() {
    items = [...items].sort((a, b) => a.name.localeCompare(b.name));
  }

  function shuffle() {
    items = [...items].sort(() => Math.random() - 0.5);
  }
</script>

<div class="controls">
  <button onclick={sortByPriority}>Sort by Priority</button>
  <button onclick={sortByName}>Sort by Name</button>
  <button onclick={shuffle}>Shuffle</button>
</div>

<ul>
  {#each items as item (item.id)}
    <li animate:flip={{ duration: 300 }}>
      <span class="priority">P{item.priority}</span>
      {item.name}
    </li>
  {/each}
</ul>

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  button {
    padding: 8px 14px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 4px;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .priority {
    background: #3b82f6;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: bold;
  }
</style>
```

### animate:flip Parameters

The `flip` function accepts three parameters:

| Parameter | Type | Default | Purpose |
|-----------|------|---------|---------|
| `delay` | `number` | `0` | Milliseconds before animation starts |
| `duration` | `number \| function` | `(d) => Math.sqrt(d) * 120` | Duration in ms, or function of pixel distance |
| `easing` | `function` | `cubicOut` | Easing function from `svelte/easing` |

The default `duration` function is `(d) => Math.sqrt(d) * 120`, where `d` is the pixel distance the element moves. This means short movements are quick and long movements take proportionally less additional time — which matches how physical objects move. You can override with a fixed number or your own function:

```svelte
<!-- Fixed duration — all items move at the same speed regardless of distance -->
<li animate:flip={{ duration: 300 }}>

<!-- Distance-based duration — longer distances take longer -->
<li animate:flip={{ duration: (d) => d * 2 }}>

<!-- Custom easing for a bouncy feel -->
<li animate:flip={{ duration: 400, easing: elasticOut }}>
```

### When animate:flip Does NOT Work

The `animate:flip` directive has specific requirements:

1. It must be on a **direct child** of a keyed `{#each}` block.
2. The `{#each}` block must have a key expression: `{#each items as item (item.id)}`.
3. The element must already exist in the list — `animate:flip` does not handle elements entering or leaving. For those, use `in:` and `out:` transitions.
4. It only animates position changes. If an element's size changes (e.g., its text gets longer), FLIP handles that too, but the visual result may look odd if the size change is dramatic.

## Tween — Smooth Value Interpolation

`Tween` creates a reactive value that smoothly transitions between numbers over time. Instead of jumping from 0 to 100, it glides there. Import the class from `svelte/motion`:

```svelte
<script>
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  const progress = new Tween(0, {
    duration: 600,
    easing: cubicOut
  });
</script>

<div class="bar-bg">
  <div class="bar-fill" style="width: {progress.current}%"></div>
</div>
<p>{Math.round(progress.current)}%</p>

<div class="controls">
  <button onclick={() => progress.set(0)}>0%</button>
  <button onclick={() => progress.set(25)}>25%</button>
  <button onclick={() => progress.set(50)}>50%</button>
  <button onclick={() => progress.set(75)}>75%</button>
  <button onclick={() => progress.set(100)}>100%</button>
</div>

<style>
  .bar-bg {
    height: 24px;
    background: #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 8px;
  }

  .bar-fill {
    height: 100%;
    background: #3b82f6;
    border-radius: 12px;
    transition: none;
  }

  .controls {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  button {
    padding: 6px 14px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
</style>
```

Access the current interpolated value with `progress.current`. When you call `progress.set(75)`, the value smoothly interpolates from its current position to 75 over 600ms.

### How Tween Works Internally

When you call `tween.set(newValue)`, here is what happens inside:

1. Svelte records the current value as `startValue` and `newValue` as `endValue`.
2. It captures `Date.now()` as `startTime`.
3. It registers a `requestAnimationFrame` loop.
4. On each frame, it calculates `elapsed = Date.now() - startTime` and `t = elapsed / duration`.
5. It applies the easing function: `easedT = easing(Math.min(t, 1))`.
6. It interpolates: `currentValue = startValue + (endValue - startValue) * easedT`.
7. It updates `this.current`, which is a reactive signal that triggers re-renders.
8. When `t >= 1`, the loop stops and the value is set exactly to `endValue`.

If you call `tween.set()` again while an animation is in progress, the current animation is cancelled. The new animation starts from wherever the value currently is. This is why rapid clicking on the progress bar buttons above produces smooth, natural motion — each new click interrupts the current animation and starts a new one from the current position.

### The .set() Method Returns a Promise

`tween.set()` returns a Promise that resolves when the animation completes. This lets you chain animations:

```typescript
const position = new Tween(0, { duration: 400 });

// Sequential animations
await position.set(50);
await position.set(100);
await position.set(0);

// The promise rejects (resolves with false) if interrupted
const completed = await position.set(100);
if (!completed) {
  console.log("Animation was interrupted");
}
```

### Custom Interpolation for Complex Values

`Tween` accepts `duration`, `easing`, and an `interpolate` function for complex types. By default, Tween performs linear interpolation on numbers: `start + (end - start) * t`. For non-numeric values, you need a custom interpolator:

```typescript
import { Tween } from "svelte/motion";
import { cubicInOut } from "svelte/easing";

// Tween a number
const count = new Tween(0, { duration: 400 });

// Tween with custom interpolation (e.g., for colors)
const color = new Tween("#ff0000", {
  duration: 800,
  interpolate: (from, to) => {
    // Return a function that takes t (0 to 1) and returns the interpolated value
    return (t) => {
      const r = Math.round(parseInt(from.slice(1, 3), 16) * (1 - t) + parseInt(to.slice(1, 3), 16) * t);
      const g = Math.round(parseInt(from.slice(3, 5), 16) * (1 - t) + parseInt(to.slice(3, 5), 16) * t);
      const b = Math.round(parseInt(from.slice(5, 7), 16) * (1 - t) + parseInt(to.slice(5, 7), 16) * t);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };
  }
});
```

You can tween objects with multiple properties:

```svelte
<script>
  import { Tween } from "svelte/motion";

  const box = new Tween(
    { x: 0, y: 0, rotation: 0 },
    {
      duration: 800,
      interpolate: (from, to) => (t) => ({
        x: from.x + (to.x - from.x) * t,
        y: from.y + (to.y - from.y) * t,
        rotation: from.rotation + (to.rotation - from.rotation) * t
      })
    }
  );

  function moveToCorner(corner) {
    const positions = {
      topLeft: { x: 0, y: 0, rotation: 0 },
      topRight: { x: 300, y: 0, rotation: 90 },
      bottomRight: { x: 300, y: 300, rotation: 180 },
      bottomLeft: { x: 0, y: 300, rotation: 270 }
    };
    box.set(positions[corner]);
  }
</script>

<div class="area">
  <div
    class="box"
    style="transform: translate({box.current.x}px, {box.current.y}px) rotate({box.current.rotation}deg)"
  ></div>
</div>

<div class="controls">
  <button onclick={() => moveToCorner('topLeft')}>Top Left</button>
  <button onclick={() => moveToCorner('topRight')}>Top Right</button>
  <button onclick={() => moveToCorner('bottomRight')}>Bottom Right</button>
  <button onclick={() => moveToCorner('bottomLeft')}>Bottom Left</button>
</div>

<style>
  .area {
    position: relative;
    width: 350px;
    height: 350px;
    background: #f8f9fa;
    border-radius: 12px;
  }
  .box {
    position: absolute;
    width: 50px;
    height: 50px;
    background: #3b82f6;
    border-radius: 8px;
  }
</style>
```

### Tween.of() — Reactive Tracking

The static `Tween.of` method creates a tween that automatically tracks a reactive expression. Whenever the expression's value changes, the tween animates to the new value:

```svelte
<script>
  import { Tween } from "svelte/motion";

  let target = $state(0);
  const tweened = Tween.of(() => target, { duration: 400 });

  function increment() {
    target += 10;
  }

  function reset() {
    target = 0;
  }
</script>

<p>Target: {target}</p>
<p>Tweened: {Math.round(tweened.current)}</p>

<button onclick={increment}>+10</button>
<button onclick={reset}>Reset</button>
```

The key difference between `Tween.of()` and manually calling `tween.set()`:

- **`Tween.of(() => expr)`**: The tween passively follows the reactive expression. You update `target` and the tween reacts automatically. You do not call `.set()` at all.
- **`new Tween(initial)` + `.set()`**: You imperatively drive the tween. You decide when and what to animate.

Use `Tween.of()` when the animated value is derived from reactive state. Use `new Tween()` + `.set()` when you want explicit control over when animations happen (e.g., in event handlers).

### Tweened Gauge Component

Here is a complete reusable gauge component that demonstrates Tween in a production context:

```svelte
<script>
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  let { value = 0, max = 100, label = "", color = "#3b82f6" } = $props();

  const tweenedValue = Tween.of(() => value, {
    duration: 800,
    easing: cubicOut
  });

  let percentage = $derived((tweenedValue.current / max) * 100);
  let circumference = 2 * Math.PI * 45;
  let offset = $derived(circumference - (percentage / 100) * circumference);
</script>

<div class="gauge">
  <svg viewBox="0 0 100 100" width="120" height="120">
    <circle cx="50" cy="50" r="45" fill="none" stroke="#e5e7eb" stroke-width="8" />
    <circle
      cx="50" cy="50" r="45"
      fill="none"
      stroke={color}
      stroke-width="8"
      stroke-dasharray={circumference}
      stroke-dashoffset={offset}
      stroke-linecap="round"
      transform="rotate(-90 50 50)"
    />
    <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
      font-size="18" font-weight="bold" fill="#1e293b">
      {Math.round(tweenedValue.current)}
    </text>
  </svg>
  {#if label}
    <p class="label">{label}</p>
  {/if}
</div>

<style>
  .gauge { text-align: center; }
  .label { margin: 8px 0 0; color: #64748b; font-size: 0.85rem; }
</style>
```

## Spring — Physics-Based Motion

While `Tween` follows a fixed easing curve, `Spring` simulates physical spring dynamics. The value overshoots, oscillates, and settles naturally — perfect for drag interactions and playful UI.

### The Physics Behind Spring

A Spring simulates a damped harmonic oscillator. The equation of motion is:

```
F = -kx - cv
```

Where `k` is the spring constant (stiffness), `x` is the displacement from equilibrium, `c` is the damping coefficient, and `v` is the velocity. On every animation frame, Svelte:

1. Calculates the spring force: `force = -stiffness * displacement`
2. Calculates the damping force: `dampingForce = -damping * velocity`
3. Updates velocity: `velocity += (force + dampingForce) * dt`
4. Updates position: `position += velocity * dt`
5. Checks if the spring has settled (both velocity and displacement are below `precision`)
6. If settled, snaps to the target value and stops the animation loop

This means Spring has no fixed duration. A stiff, heavily damped spring might settle in 200ms. A loose, lightly damped spring might oscillate for 2 seconds. The animation runs until the physics simulation naturally comes to rest.

### Basic Usage

```svelte
<script>
  import { Spring } from "svelte/motion";

  const coords = new Spring({ x: 0, y: 0 }, {
    stiffness: 0.1,
    damping: 0.25
  });

  function handleMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    coords.set({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
  }
</script>

<div class="area" onmousemove={handleMouseMove}>
  <div
    class="dot"
    style="left: {coords.current.x}px; top: {coords.current.y}px"
  ></div>
  <p>Move your mouse around!</p>
</div>

<style>
  .area {
    position: relative;
    width: 100%;
    height: 300px;
    background: #f8f9fa;
    border-radius: 12px;
    overflow: hidden;
    cursor: crosshair;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dot {
    position: absolute;
    width: 24px;
    height: 24px;
    background: #3b82f6;
    border-radius: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  p {
    color: #999;
    pointer-events: none;
  }
</style>
```

### Spring Parameters Explained

| Parameter | Range | Effect |
|-----------|-------|--------|
| `stiffness` | 0 to 1 | Higher = faster, snappier motion. Controls how aggressively the spring pulls toward the target. |
| `damping` | 0 to 1 | Higher = less oscillation, settles faster. Controls how quickly energy is dissipated. |
| `precision` | 0.001+ | How close to the target before the animation stops. Lower = more precise but more frames. |

Understanding the interplay:

- **Low stiffness + low damping** = slow, bouncy, jelly-like. Good for playful UI elements, mascot animations.
- **High stiffness + low damping** = fast and bouncy, snaps to position then oscillates. Good for notifications, badges, attention-grabbing elements.
- **Low stiffness + high damping** = slow, smooth, no bounce. Good for background movements, parallax effects.
- **High stiffness + high damping** = fast, crisp, no bounce. Behaves similar to a tween. Good for precise UI, cursor followers, tooltips.

```svelte
<script>
  import { Spring } from "svelte/motion";

  let stiffness = $state(0.15);
  let damping = $state(0.8);

  const spring = new Spring(0, { stiffness, damping });

  // Update spring parameters reactively
  $effect(() => {
    spring.stiffness = stiffness;
    spring.damping = damping;
  });
</script>

<div class="demo">
  <div class="bar" style="width: {spring.current}%"></div>
</div>

<button onclick={() => spring.set(spring.current < 50 ? 100 : 0)}>Toggle</button>

<label>
  Stiffness: {stiffness.toFixed(2)}
  <input type="range" min="0.01" max="1" step="0.01" bind:value={stiffness} />
</label>

<label>
  Damping: {damping.toFixed(2)}
  <input type="range" min="0.01" max="1" step="0.01" bind:value={damping} />
</label>

<style>
  .demo {
    height: 30px;
    background: #e5e7eb;
    border-radius: 15px;
    overflow: hidden;
    margin-bottom: 16px;
  }
  .bar {
    height: 100%;
    background: #3b82f6;
    border-radius: 15px;
  }
  label {
    display: block;
    margin: 8px 0;
  }
</style>
```

### Spring.of() — Reactive Tracking

Like `Tween`, `Spring` has a static `.of()` method for automatically tracking reactive values:

```svelte
<script>
  import { Spring } from "svelte/motion";

  let target = $state({ x: 0, y: 0 });
  const springCoords = Spring.of(() => target, { stiffness: 0.1, damping: 0.25 });

  function handleClick(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    target = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  }
</script>

<div class="area" onclick={handleClick}>
  <div
    class="dot"
    style="left: {springCoords.current.x}px; top: {springCoords.current.y}px"
  ></div>
  <p>Click anywhere</p>
</div>
```

### Building a Drag-to-Reorder List with Spring

This is one of the most satisfying interactions to build: a list where items can be dragged to reorder, with spring physics making the movement feel physical and natural:

```svelte
<script>
  import { Spring } from "svelte/motion";
  import { flip } from "svelte/animate";

  let items = $state([
    { id: 1, text: "Design mockups", color: "#dbeafe" },
    { id: 2, text: "Write API docs", color: "#dcfce7" },
    { id: 3, text: "Review PRs", color: "#fef3c7" },
    { id: 4, text: "Ship release", color: "#fce7f3" },
    { id: 5, text: "Update tests", color: "#e0e7ff" }
  ]);

  let draggingId = $state(null);
  let dragOffset = new Spring({ x: 0, y: 0 }, { stiffness: 0.2, damping: 0.7 });

  function handleDragStart(event, id) {
    draggingId = id;
    event.dataTransfer.effectAllowed = "move";
    // Make the drag image transparent
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    event.dataTransfer.setDragImage(img, 0, 0);
  }

  function handleDragOver(event, targetId) {
    event.preventDefault();
    if (draggingId === null || draggingId === targetId) return;

    const fromIndex = items.findIndex(i => i.id === draggingId);
    const toIndex = items.findIndex(i => i.id === targetId);

    if (fromIndex === -1 || toIndex === -1) return;

    const reordered = [...items];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    items = reordered;
  }

  function handleDragEnd() {
    draggingId = null;
  }
</script>

<ul>
  {#each items as item (item.id)}
    <li
      animate:flip={{ duration: 300 }}
      draggable="true"
      class:dragging={draggingId === item.id}
      style="background: {item.color}"
      ondragstart={(e) => handleDragStart(e, item.id)}
      ondragover={(e) => handleDragOver(e, item.id)}
      ondragend={handleDragEnd}
    >
      <span class="handle">&#9776;</span>
      {item.text}
    </li>
  {/each}
</ul>

<style>
  ul {
    list-style: none;
    padding: 0;
    max-width: 400px;
  }

  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    margin-bottom: 6px;
    border-radius: 8px;
    cursor: grab;
    user-select: none;
  }

  li.dragging {
    opacity: 0.5;
    cursor: grabbing;
  }

  .handle {
    color: #94a3b8;
    font-size: 1.1rem;
  }
</style>
```

### Pointer-Based Drag with Spring (No HTML Drag API)

For a more fluid feel, you can use pointer events with Spring for the drag offset. This gives you smooth, physics-based drag that works on touch devices:

```svelte
<script>
  import { Spring } from "svelte/motion";

  const position = new Spring({ x: 100, y: 100 }, {
    stiffness: 0.2,
    damping: 0.4
  });

  let isDragging = $state(false);
  let dragStartPointer = { x: 0, y: 0 };
  let dragStartPosition = { x: 0, y: 0 };

  function handlePointerDown(event) {
    isDragging = true;
    dragStartPointer = { x: event.clientX, y: event.clientY };
    dragStartPosition = { ...position.current };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!isDragging) return;
    position.set({
      x: dragStartPosition.x + (event.clientX - dragStartPointer.x),
      y: dragStartPosition.y + (event.clientY - dragStartPointer.y)
    });
  }

  function handlePointerUp() {
    isDragging = false;
    // Spring back to center
    position.set({ x: 150, y: 150 });
  }
</script>

<div class="area">
  <div
    class="draggable"
    class:dragging={isDragging}
    style="left: {position.current.x}px; top: {position.current.y}px"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
  >
    Drag me
  </div>
</div>

<style>
  .area {
    position: relative;
    width: 100%;
    height: 350px;
    background: #f8f9fa;
    border-radius: 12px;
    overflow: hidden;
  }

  .draggable {
    position: absolute;
    width: 80px;
    height: 80px;
    background: #3b82f6;
    color: white;
    border-radius: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
    font-weight: bold;
    cursor: grab;
    transform: translate(-50%, -50%);
    user-select: none;
    touch-action: none;
  }

  .draggable.dragging {
    cursor: grabbing;
    background: #2563eb;
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
  }
</style>
```

When the user releases the element, the Spring animates it back to center with natural physics — it overshoots, oscillates, and settles. The `stiffness: 0.2` and `damping: 0.4` give a satisfying bounce.

## Combining Transitions with animate:flip

The real power emerges when you combine `animate:flip` for moving items with `transition:` for entering and leaving items. This creates the complete experience — items fade in when added, fade out when removed, and slide smoothly when others around them change position:

```svelte
<script>
  import { flip } from "svelte/animate";
  import { fade, fly } from "svelte/transition";

  let items = $state([
    { id: 1, text: "First item" },
    { id: 2, text: "Second item" },
    { id: 3, text: "Third item" }
  ]);

  let nextId = 4;

  function addItem() {
    const newItem = { id: nextId++, text: `Item ${nextId - 1}` };
    items = [newItem, ...items];
  }

  function removeItem(id) {
    items = items.filter(item => item.id !== id);
  }

  function shuffle() {
    items = [...items].sort(() => Math.random() - 0.5);
  }
</script>

<div class="controls">
  <button onclick={addItem}>Add Item</button>
  <button onclick={shuffle}>Shuffle</button>
</div>

<ul>
  {#each items as item (item.id)}
    <li
      animate:flip={{ duration: 300 }}
      in:fly={{ y: -20, duration: 300 }}
      out:fade={{ duration: 200 }}
    >
      <span>{item.text}</span>
      <button onclick={() => removeItem(item.id)}>Remove</button>
    </li>
  {/each}
</ul>

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
  }

  ul {
    list-style: none;
    padding: 0;
  }

  li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    margin-bottom: 6px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .controls button, li button {
    padding: 6px 14px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
</style>
```

When you add an item, it flies in from above. When you remove one, it fades out. And the remaining items smoothly slide to fill the gap, all happening simultaneously.

### Why This Combination Works

The three directives serve complementary roles:

- **`in:fly`** handles the entering element only. It has no effect on existing elements.
- **`out:fade`** handles the departing element only. Svelte keeps the element in the DOM until the outro completes, then removes it.
- **`animate:flip`** watches all *remaining* elements. After the DOM change (add or remove), it detects position shifts and animates them.

The timing coordination is automatic: Svelte first records FLIP positions, applies the DOM change, records new FLIP positions, then starts both the transition and the FLIP animation simultaneously. Items slide out of the way while the new item flies in.

## Respecting prefers-reduced-motion

Some users configure their operating system to reduce animations — because of motion sensitivity, vestibular disorders, or personal preference. You should always respect this setting.

### Using prefersReducedMotion from svelte/motion

Svelte 5.7+ provides a built-in `prefersReducedMotion` reactive object from `svelte/motion` that tracks the user's preference automatically:

```svelte
<script>
  import { fly } from "svelte/transition";
  import { prefersReducedMotion } from "svelte/motion";

  let transitionDuration = $derived(prefersReducedMotion.current ? 0 : 300);

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:fly={{ y: 20, duration: transitionDuration }}>
    <p>I respect your motion preferences.</p>
  </div>
{/if}
```

`prefersReducedMotion` is a `MediaQuery` object — read `.current` to get the boolean value. It updates reactively when the user changes their OS setting. No manual `matchMedia` wiring needed.

### Using MediaQuery from svelte/reactivity

If you need a manual approach (for example, in environments where `svelte/motion` does not have `prefersReducedMotion`, or when you need additional media queries), you can use `MediaQuery` from `svelte/reactivity`:

```svelte
<script>
  import { MediaQuery } from "svelte/reactivity";

  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  const prefersColorScheme = new MediaQuery("(prefers-color-scheme: dark)");

  let transitionDuration = $derived(reducedMotion.current ? 0 : 300);
</script>
```

`MediaQuery` is a general-purpose reactive wrapper around `window.matchMedia`. It works with any valid CSS media query string. The `.current` property is a reactive boolean that updates whenever the media query result changes.

### Creating a Motion-Safe Wrapper

For larger projects, centralize your motion preference handling:

```typescript
// src/lib/motion.ts
import { prefersReducedMotion } from "svelte/motion";

export function motionSafe(duration: number): number {
  return prefersReducedMotion.current ? 0 : duration;
}

export function getFlipDuration(baseDuration = 300): number {
  return prefersReducedMotion.current ? 0 : baseDuration;
}

export function getSpringConfig(opts: { stiffness: number; damping: number }) {
  if (prefersReducedMotion.current) {
    return { stiffness: 1, damping: 1 }; // Instant, no bounce
  }
  return opts;
}
```

```svelte
<script>
  import { motionSafe, getFlipDuration } from "$lib/motion";
  import { flip } from "svelte/animate";
  import { fade } from "svelte/transition";
</script>

{#each items as item (item.id)}
  <li
    animate:flip={{ duration: getFlipDuration() }}
    out:fade={{ duration: motionSafe(200) }}
  >
    {item.text}
  </li>
{/each}
```

Setting `duration: 0` effectively disables the animation while keeping the transition logic intact. This is cleaner than conditionally removing the `transition:` directive entirely, because the element still enters and leaves the DOM correctly.

You can also handle this with pure CSS as a complementary approach:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Performance: GPU-Accelerated Properties

Not all CSS properties animate equally. Some trigger layout recalculations, others only trigger repaint, and a few run entirely on the GPU compositor:

| Property | Cost | GPU? | Notes |
|----------|------|------|-------|
| `transform` | Very low | Yes | Translate, scale, rotate, skew — always prefer this |
| `opacity` | Very low | Yes | Fading is nearly free |
| `filter` | Low | Yes (usually) | blur, brightness, contrast |
| `clip-path` | Low-Medium | Sometimes | Depends on browser and complexity |
| `background-color` | Medium | No | Triggers repaint but no layout |
| `width` / `height` | High | No | Triggers layout — avoid in animations |
| `top` / `left` | High | No | Triggers layout — use transform instead |
| `box-shadow` | High | No | Complex repaints — animate opacity of a pseudo-element instead |

For Tween and Spring, this means you should animate `transform` and `opacity` whenever possible:

```svelte
<script>
  import { Spring } from "svelte/motion";

  const spring = new Spring({ x: 0, y: 0, scale: 1 }, {
    stiffness: 0.15,
    damping: 0.7
  });
</script>

<!-- WRONG — animating left/top triggers layout on every frame -->
<div style="left: {spring.current.x}px; top: {spring.current.y}px; position: absolute;">

<!-- CORRECT — animating transform runs on the GPU -->
<div style="transform: translate({spring.current.x}px, {spring.current.y}px) scale({spring.current.scale});">
```

The difference is dramatic: the `transform` version runs at a consistent 60fps even with dozens of animated elements. The `left/top` version can drop to 30fps or worse because every frame triggers a full layout recalculation of the entire page.

### Promoting Elements to Their Own Layer

For elements you know will animate, you can promote them to their own compositor layer with `will-change`:

```css
.animated-element {
  will-change: transform, opacity;
}
```

This tells the browser to put the element on its own GPU layer *before* the animation starts, avoiding a jank-inducing layer promotion during the first frame. Remove `will-change` after the animation ends if the element will not animate again, as each layer consumes GPU memory.

## Complete Interactive Dashboard Example

Here is a complete example combining Tween, Spring, transitions, and FLIP for an interactive dashboard:

```svelte
<script>
  import { Tween, Spring, prefersReducedMotion } from "svelte/motion";
  import { flip } from "svelte/animate";
  import { fly, fade } from "svelte/transition";
  import { cubicOut } from "svelte/easing";

  // Dashboard metrics with tweened values
  const revenue = new Tween(0, { duration: 1200, easing: cubicOut });
  const users = new Tween(0, { duration: 1000, easing: cubicOut });
  const uptime = new Tween(0, { duration: 800, easing: cubicOut });

  // Badge that springs when count changes
  let notificationCount = $state(3);
  const badgeScale = new Spring(1, { stiffness: 0.3, damping: 0.4 });

  // Animate metrics on mount
  $effect(() => {
    revenue.set(48523);
    users.set(1247);
    uptime.set(99.9);
  });

  // Activity feed
  let activities = $state([
    { id: 1, text: "User signed up", time: "2m ago" },
    { id: 2, text: "Payment received", time: "5m ago" },
    { id: 3, text: "Report generated", time: "12m ago" }
  ]);

  let nextActivityId = 4;

  function addActivity() {
    const texts = [
      "New order placed",
      "User upgraded plan",
      "Support ticket closed",
      "Feature deployed"
    ];
    activities = [
      {
        id: nextActivityId++,
        text: texts[Math.floor(Math.random() * texts.length)],
        time: "just now"
      },
      ...activities
    ].slice(0, 8);

    // Bounce the badge
    notificationCount++;
    badgeScale.set(1.4);
    setTimeout(() => badgeScale.set(1), 150);
  }

  function removeActivity(id) {
    activities = activities.filter(a => a.id !== id);
  }

  function dur(ms) {
    return prefersReducedMotion.current ? 0 : ms;
  }
</script>

<div class="dashboard">
  <div class="metrics">
    <div class="metric" in:fly={{ y: 20, duration: dur(400) }}>
      <span class="value">${Math.round(revenue.current).toLocaleString()}</span>
      <span class="label">Revenue</span>
    </div>
    <div class="metric" in:fly={{ y: 20, duration: dur(400), delay: 100 }}>
      <span class="value">{Math.round(users.current).toLocaleString()}</span>
      <span class="label">Users</span>
    </div>
    <div class="metric" in:fly={{ y: 20, duration: dur(400), delay: 200 }}>
      <span class="value">{uptime.current.toFixed(1)}%</span>
      <span class="label">Uptime</span>
    </div>
  </div>

  <div class="feed-header">
    <h3>Activity Feed</h3>
    <button onclick={addActivity}>
      Simulate Event
      <span
        class="badge"
        style="transform: scale({badgeScale.current})"
      >
        {notificationCount}
      </span>
    </button>
  </div>

  <ul class="feed">
    {#each activities as activity (activity.id)}
      <li
        animate:flip={{ duration: dur(300) }}
        in:fly={{ x: -30, duration: dur(300) }}
        out:fade={{ duration: dur(200) }}
      >
        <span>{activity.text}</span>
        <span class="time">{activity.time}</span>
        <button class="dismiss" onclick={() => removeActivity(activity.id)}>x</button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .dashboard { max-width: 600px; }

  .metrics {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-bottom: 24px;
  }

  .metric {
    padding: 20px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    text-align: center;
  }

  .value {
    display: block;
    font-size: 1.5rem;
    font-weight: bold;
    color: #1e293b;
  }

  .label {
    color: #64748b;
    font-size: 0.85rem;
    margin-top: 4px;
  }

  .feed-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .feed-header button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: #ef4444;
    color: white;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: bold;
  }

  .feed {
    list-style: none;
    padding: 0;
  }

  .feed li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    margin-bottom: 6px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .time {
    margin-left: auto;
    color: #94a3b8;
    font-size: 0.8rem;
  }

  .dismiss {
    padding: 2px 8px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    background: white;
    cursor: pointer;
    color: #94a3b8;
    font-size: 0.85rem;
  }
</style>
```

This dashboard demonstrates every concept from this lesson working together: tweened metrics that count up on load, a spring-animated notification badge, FLIP animations on the activity list, fly-in transitions for new items, and fade-out transitions for dismissed items — all wrapped in a `prefersReducedMotion` check.

## Legacy API: tweened() and spring() Stores

Older Svelte code uses the function-based API from `svelte/motion`:

```typescript
// Legacy (still works but deprecated)
import { tweened, spring } from "svelte/motion";

const progress = tweened(0, { duration: 400 });
$: console.log($progress); // Subscribe with $ prefix

progress.set(100);
progress.update(n => n + 10);

// Modern (recommended for new code)
import { Tween, Spring } from "svelte/motion";

const progress = new Tween(0, { duration: 400 });
console.log(progress.current); // Read .current property

progress.set(100);
```

Key differences:
- Legacy stores use `$storeName` to read the value; classes use `.current`.
- Legacy stores use `.update(fn)` for relative changes; classes do not have `.update()` — use `.set(newValue)` instead.
- Legacy stores work with Svelte's store contract (`subscribe`, `set`); classes work with Svelte 5's signal system.
- The class-based API supports `.of()` for reactive tracking, which the legacy API lacks.

If you are writing new code, use the class-based API exclusively.

## Try It

Build a "Sortable Task Board":
- Create a list of tasks with name, priority (1-5), and creation date
- Add buttons to sort by each field — when sorting, items should smoothly animate to their new positions with `animate:flip`
- Add an "Add Task" button — new tasks should fly in from the left with `in:fly`
- Add a delete button on each task — removed tasks should fade out and the remaining tasks should slide into place
- Use a `Tween` value for a "completion progress" bar that updates as tasks are added and removed
- Use a `Spring` value for a floating count badge that bounces when the count changes
- Build a draggable element that springs back to its origin when released
- Use `prefersReducedMotion` from `svelte/motion` to wrap all animation durations
- Create an interactive parameter playground for Spring that lets users adjust stiffness and damping in real time

## Key Takeaways

- `animate:flip` smoothly animates elements when their position changes in a keyed `{#each}` block, using the FLIP technique (First, Last, Invert, Play) for GPU-accelerated position animation
- FLIP works by recording positions before and after a DOM change, then animating a `transform` to bridge the difference — no layout thrashing during animation
- `new Tween(value, options)` from `svelte/motion` interpolates between values over time — internally uses `requestAnimationFrame` with easing-shaped `t` values
- `new Spring(value, options)` from `svelte/motion` provides physics-based motion simulating a damped harmonic oscillator — the animation has no fixed duration, it runs until the physics settles
- Both `Tween` and `Spring` expose a `.current` property for the interpolated value, and a static `.of(fn)` method to automatically track reactive expressions
- `Tween.set()` returns a Promise that resolves when the animation completes, enabling chained animations
- Spring parameters: `stiffness` (0-1) controls pull force, `damping` (0-1) controls energy dissipation, `precision` controls the settling threshold
- Combine `animate:flip` with `in:`/`out:` transitions for the complete experience: enter, exit, and reorder animations all at once
- Always animate GPU-accelerated properties (`transform`, `opacity`, `filter`) instead of layout-triggering properties (`width`, `height`, `top`, `left`)
- Use `prefersReducedMotion` from `svelte/motion` to respect the user's motion preference — set `duration: 0` when `.current` is true
- The `interpolate` option on `Tween` lets you animate complex values like colors, objects, or any type with a custom interpolation function
- The legacy `tweened()` and `spring()` store functions still work but are deprecated — use the class-based API for new code
