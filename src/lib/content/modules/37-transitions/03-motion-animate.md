# Motion & Animate

Transitions handle elements entering and leaving the DOM. But what about elements that **move** — a list item sliding to a new position after sorting, a progress bar smoothly filling, or a draggable element springing back to its origin? Svelte provides three tools for this: the `animate:flip` directive for list reordering, `Tween` for smooth value interpolation, and `Spring` for physics-based motion.

These tools combine with transitions to create interfaces where everything moves fluidly. Items entering a list fade in, items leaving fade out, and the remaining items smoothly slide to fill the gap. This lesson covers each tool in depth — the mental models behind them, their performance characteristics, common pitfalls, and how to combine them for polished, production-quality animations.

The key architectural distinction: transitions control **presence** (is this element in the DOM?), while motion and animate control **values** (what number, position, or color should this element have right now?). Understanding this separation helps you pick the right tool for each animation task.

## animate:flip — Smooth List Reordering

When items in a keyed `{#each}` block change position, they normally jump instantly to their new location. The `animate:flip` directive (First, Last, Invert, Play) measures each element's old and new position and smoothly animates between them.

### The FLIP Algorithm Explained

The name comes from a four-step technique invented by Paul Lewis at Google:

1. **First**: Before the DOM change, Svelte records each element's position using `getBoundingClientRect()`. It captures `top`, `left`, `width`, and `height`.
2. **Last**: The DOM change is applied (items are reordered). Svelte records each element's new position.
3. **Invert**: For each element, Svelte calculates the delta between old and new positions: `deltaX = first.left - last.left`, `deltaY = first.top - last.top`. It applies a CSS `transform: translate(deltaX, deltaY)` — the element is now visually in its old position, even though its DOM position has changed.
4. **Play**: Svelte removes the transform with a CSS transition, so the element smoothly animates from its old visual position to its new DOM position.

This is why FLIP animations are performant — they use CSS `transform` for the animation, which runs on the compositor thread and does not trigger layout recalculations. The actual DOM reorder happens instantly in step 2, which is a single layout calculation. The animation in step 4 is free from layout thrashing.

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

The key `(item.id)` is required — Svelte uses it to track which element moved where. Without a key, Svelte cannot distinguish between items, and `animate:flip` will not work.

### animate:flip Parameters

The `flip` function accepts several configuration options:

| Parameter | Type | Default | Effect |
|-----------|------|---------|--------|
| `duration` | `number \| ((len: number) => number)` | `(d) => Math.sqrt(d) * 120` | Animation duration in ms |
| `delay` | `number` | `0` | Delay before animation starts |
| `easing` | `(t: number) => number` | `cubicOut` | Easing function |

The default `duration` is a function of the distance traveled — items that move farther take longer, which feels natural. You can override with a fixed number or your own distance function:

```svelte
<!-- Fixed duration: all items animate in the same time -->
<li animate:flip={{ duration: 300 }}>

<!-- Distance-proportional: longer distance = longer animation -->
<li animate:flip={{ duration: (d) => d * 2 }}>

<!-- With easing: control the acceleration curve -->
<li animate:flip={{ duration: 400, easing: quintOut }}>
```

### Common animate:flip Mistakes

The most frequent `animate:flip` bugs stem from key expression problems:

```svelte
<!-- WRONG: No key expression — flip cannot track elements -->
{#each items as item}
  <li animate:flip={{ duration: 300 }}>{item.name}</li>
{/each}

<!-- WRONG: Using index as key — items swap identities instead of moving -->
{#each items as item, i (i)}
  <li animate:flip={{ duration: 300 }}>{item.name}</li>
{/each}

<!-- CORRECT: Stable unique key from the data -->
{#each items as item (item.id)}
  <li animate:flip={{ duration: 300 }}>{item.name}</li>
{/each}
```

The index-as-key mistake is subtle and worth understanding deeply. When you sort a list and use `(i)` as the key, Svelte sees key `0` still at position 0, key `1` still at position 1, etc. — no elements "moved," so FLIP does nothing. Instead, Svelte updates the *content* of each element in place. The visual result is that text changes instantly without animation. This is one of the most common animation bugs in Svelte applications.

Another common mistake is mutating the array in place instead of creating a new reference:

```svelte
<!-- WRONG: Mutating in place can cause unpredictable FLIP behavior -->
<script>
  function sortByPriority() {
    items.sort((a, b) => a.priority - b.priority);
    // The FLIP algorithm may not correctly measure positions because
    // the mutation and the DOM update can interleave
  }
</script>

<!-- CORRECT: Create a new array reference -->
<script>
  function sortByPriority() {
    items = [...items].sort((a, b) => a.priority - b.priority);
  }
</script>
```

### When animate:flip Does NOT Work

The `animate:flip` directive has specific requirements:

1. It must be on a **direct child** of a keyed `{#each}` block
2. The `{#each}` block must have a key expression: `{#each items as item (item.id)}`
3. The element must already exist in the list — `animate:flip` does not handle elements entering or leaving; for those, use `in:` and `out:` transitions
4. It only animates position changes. If an element's size changes dramatically (e.g., its text gets much longer), FLIP handles the size difference but the visual result may look odd

### Grid Layouts with animate:flip

FLIP works with any layout — not just vertical lists. Here is a grid where items animate both horizontally and vertically:

```svelte
<script>
  import { flip } from "svelte/animate";

  let items = $state(
    Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      label: `Item ${i + 1}`,
      color: `hsl(${i * 30}, 70%, 60%)`
    }))
  );

  function shuffle() {
    items = [...items].sort(() => Math.random() - 0.5);
  }
</script>

<button onclick={shuffle}>Shuffle Grid</button>

<div class="grid">
  {#each items as item (item.id)}
    <div
      animate:flip={{ duration: 400 }}
      class="card"
      style="background: {item.color}"
    >
      {item.label}
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
    max-width: 500px;
  }

  .card {
    padding: 20px;
    border-radius: 8px;
    color: white;
    font-weight: bold;
    text-align: center;
  }
</style>
```

Each card smoothly slides to its new grid position. FLIP calculates the 2D offset (both X and Y) and animates the transform accordingly. This is why FLIP-based animations are popular for masonry layouts, image galleries, and Kanban boards.

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
    transition: none; /* Let Tween handle animation, not CSS */
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

### Why Tween Instead of CSS Transitions?

CSS transitions handle many animation needs well, but `Tween` gives you something CSS cannot: a reactive JavaScript value that updates every frame. This matters when:

1. **You need the intermediate value in your template**: Displaying a counter that counts up from 0 to 1000, or formatting a currency value as it animates
2. **You need to derive other values**: A progress bar where the color changes based on the current percentage
3. **You are animating non-CSS properties**: SVG path data, canvas drawing coordinates, chart data points
4. **You need to interrupt and redirect**: Calling `.set()` mid-animation smoothly redirects to the new target without a jump

```svelte
<script>
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  const value = new Tween(0, { duration: 2000, easing: cubicOut });

  // The color transitions from red to green as the value goes from 0 to 100
  let barColor = $derived(
    `hsl(${(value.current / 100) * 120}, 70%, 50%)`
  );

  // Format as currency — impossible with CSS transitions alone
  let displayValue = $derived(
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value.current * 100)
  );
</script>

<div class="bar-bg">
  <div class="bar-fill" style="width: {value.current}%; background: {barColor}"></div>
</div>
<p class="text-2xl font-mono">{displayValue}</p>

<button onclick={() => value.set(100)}>Animate to $10,000</button>
<button onclick={() => value.set(0)}>Reset</button>
```

### How Tween Works Internally

When you call `tween.set(newValue)`, here is what happens:

1. Svelte records the current value as `startValue` and `newValue` as `endValue`
2. It captures `Date.now()` as `startTime`
3. It registers a `requestAnimationFrame` loop
4. On each frame, it calculates `elapsed = Date.now() - startTime` and `t = elapsed / duration`
5. It applies the easing function: `easedT = easing(Math.min(t, 1))`
6. It interpolates: `currentValue = startValue + (endValue - startValue) * easedT`
7. It updates `this.current`, which is a reactive signal that triggers re-renders
8. When `t >= 1`, the loop stops and the value is set exactly to `endValue`

If you call `tween.set()` again while an animation is in progress, the current animation is cancelled. The new animation starts from wherever the value currently is. This is why rapid clicking on the progress bar buttons produces smooth, natural motion — each new click interrupts the current animation and starts a new one from the current position.

### The .set() Method Returns a Promise

`tween.set()` returns a Promise that resolves when the animation completes. This lets you chain animations:

```typescript
const position = new Tween(0, { duration: 400 });

// Sequential animations
await position.set(50);
await position.set(100);
await position.set(0);
```

### Tween Configuration Deep Dive

`Tween` accepts three options:

| Option | Type | Default | Effect |
|--------|------|---------|--------|
| `duration` | `number` | `400` | How long the animation lasts in milliseconds |
| `easing` | `(t: number) => number` | `linear` | The acceleration curve — import from `svelte/easing` |
| `interpolate` | `(from: T, to: T) => (t: number) => T` | Linear interpolation | How to compute intermediate values |

The `easing` parameter deserves attention. Svelte ships with many easing functions in `svelte/easing`:

```typescript
import {
  linear,        // Constant speed (default)
  cubicOut,      // Fast start, slow end — feels natural for most UI
  cubicInOut,    // Slow start, slow end — good for emphasis
  elasticOut,    // Overshoots and bounces — playful
  bounceOut,     // Bounces at the end — like a ball dropping
  quintOut,      // Similar to cubicOut but more dramatic
  expoOut        // Exponential deceleration — very quick start
} from "svelte/easing";
```

A common mistake is using `linear` (the default) for UI animations. Linear motion looks robotic because nothing in the physical world moves at constant speed. Always specify an easing function for user-facing animations:

```typescript
// WRONG: Linear easing looks mechanical
const progress = new Tween(0, { duration: 600 });

// CORRECT: cubicOut feels natural — fast start, gentle stop
const progress = new Tween(0, { duration: 600, easing: cubicOut });
```

### Custom Interpolation for Complex Types

The `interpolate` option lets you tween between non-numeric values. This is how you animate colors, coordinates, or any custom type:

```typescript
import { Tween } from "svelte/motion";
import { cubicInOut } from "svelte/easing";

// Tween a color (hex string)
const color = new Tween("#ff0000", {
  duration: 800,
  easing: cubicInOut,
  interpolate: (from, to) => {
    const fromR = parseInt(from.slice(1, 3), 16);
    const fromG = parseInt(from.slice(3, 5), 16);
    const fromB = parseInt(from.slice(5, 7), 16);
    const toR = parseInt(to.slice(1, 3), 16);
    const toG = parseInt(to.slice(3, 5), 16);
    const toB = parseInt(to.slice(5, 7), 16);

    // Return a function that takes t (0 to 1) and returns the interpolated value
    return (t) => {
      const r = Math.round(fromR + (toR - fromR) * t);
      const g = Math.round(fromG + (toG - fromG) * t);
      const b = Math.round(fromB + (toB - fromB) * t);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };
  }
});
```

For object values with numeric properties, `Tween` interpolates each property by default:

```typescript
// Tween an object with numeric properties — works out of the box
const position = new Tween(
  { x: 0, y: 0, rotation: 0 },
  { duration: 500, easing: cubicOut }
);

position.set({ x: 200, y: 150, rotation: 45 });
// position.current smoothly transitions all three values simultaneously
```

### Tween.of — Automatic Reactive Tracking

The static `Tween.of` method creates a tween that automatically tracks a reactive expression. Instead of calling `.set()` manually, the tween follows whatever value the expression produces:

```svelte
<script>
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  let step = $state(0);

  // The tween automatically follows `step * 25`
  const progress = Tween.of(() => step * 25, {
    duration: 400,
    easing: cubicOut
  });
</script>

<div class="bar-bg">
  <div class="bar-fill" style="width: {progress.current}%"></div>
</div>

<p>Step {step} of 4 ({Math.round(progress.current)}%)</p>

<button onclick={() => step = Math.max(0, step - 1)}>Previous</button>
<button onclick={() => step = Math.min(4, step + 1)}>Next</button>
```

This is cleaner than manually calling `.set()` in an `$effect` — `Tween.of` handles the subscription and cleanup internally. Use `.of()` when the target value comes from reactive state; use `.set()` when the target comes from imperative events (button clicks, timers, external callbacks).

### Tweened Gauge Component

Here is a complete reusable gauge component that demonstrates Tween in a production context with SVG:

```svelte
<!-- Gauge.svelte -->
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

This component animates both the SVG arc and the displayed number whenever the `value` prop changes. Notice that `Tween.of()` is the right choice here — the animation should follow the reactive `value` prop, not be triggered imperatively.

## Spring — Physics-Based Motion

While `Tween` follows a fixed easing curve with a predetermined duration, `Spring` simulates physical spring dynamics. The value overshoots, oscillates, and settles naturally — and the animation duration is emergent from the physics parameters, not specified directly. This is perfect for drag interactions and playful UI where the motion should feel physical rather than choreographed.

### The Physics Model

A Spring simulates a damped harmonic oscillator — a mass attached to a spring with friction. The equation of motion is:

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

### Spring Parameters and Their Feel

| Parameter | Range | Effect |
|-----------|-------|--------|
| `stiffness` | 0 to 1 | Higher = faster, snappier motion. Controls how aggressively the spring pulls toward the target |
| `damping` | 0 to 1 | Higher = less oscillation, settles faster. Controls how quickly energy is dissipated |
| `precision` | 0.001+ | How close to the target before the animation stops. Lower = more precise but more frames |

Understanding the interplay between stiffness and damping is essential for getting the right feel:

| Stiffness | Damping | Feel | Use case |
|-----------|---------|------|----------|
| High (0.3+) | High (0.7+) | Quick, no bounce | Toggle switches, menus |
| High (0.3+) | Low (0.2-0.4) | Quick, bouncy | Notifications, badges |
| Low (0.05-0.15) | Low (0.2-0.3) | Slow, bouncy | Drag-and-drop, playful elements |
| Low (0.05-0.15) | High (0.7+) | Slow, smooth | Background parallax, gentle reveals |

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

### Spring.of — Automatic Reactive Tracking

Like `Tween`, `Spring` has a static `.of()` method for tracking reactive expressions:

```svelte
<script>
  import { Spring } from "svelte/motion";

  let selectedIndex = $state(0);
  const tabs = ['Home', 'Projects', 'Settings'];

  // The indicator position follows the selected tab with spring physics
  const indicatorX = Spring.of(() => selectedIndex * 100, {
    stiffness: 0.15,
    damping: 0.3
  });
</script>

<div class="tab-bar">
  {#each tabs as tab, i}
    <button
      class="tab"
      class:active={selectedIndex === i}
      onclick={() => selectedIndex = i}
    >
      {tab}
    </button>
  {/each}
  <div class="indicator" style="left: {indicatorX.current}px"></div>
</div>

<style>
  .tab-bar {
    position: relative;
    display: flex;
  }

  .tab {
    width: 100px;
    padding: 12px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-weight: 500;
  }

  .tab.active {
    color: #3b82f6;
  }

  .indicator {
    position: absolute;
    bottom: 0;
    width: 100px;
    height: 3px;
    background: #3b82f6;
    border-radius: 2px;
    transition: none;
  }
</style>
```

The indicator bounces slightly as it settles into position — a subtle touch that makes the UI feel alive without being distracting.

### Interactive Spring Parameter Playground

Understanding spring parameters is easier with a live playground where you can adjust values and see the effect immediately:

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

### Tween vs Spring: When to Use Which

| Criterion | Tween | Spring |
|-----------|-------|--------|
| Duration | Fixed, known in advance | Emergent from physics |
| Motion curve | Predefined easing function | Natural overshoot and settle |
| Interruption | Restarts from current position with full duration | Preserves momentum from previous motion |
| Use case | Progress bars, counters, gauges | Drag interactions, toggles, playful UI |
| Predictability | High — same duration every time | Lower — duration depends on distance and current velocity |
| Accessibility | Easy to set `duration: 0` | Set `stiffness: 1, damping: 1` for instant |

The key difference is interruption behavior. When you call `.set()` on a `Tween` mid-animation, it starts a new animation from the current position with the full duration. When you call `.set()` on a `Spring` mid-animation, the spring keeps its current velocity and redirects toward the new target. This velocity preservation is why springs feel better for mouse-following and drag-and-drop — the element never "stops and restarts."

```svelte
<script>
  import { Tween, Spring } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  // Compare the two by moving your mouse quickly side to side
  const tweenX = new Tween(0, { duration: 400, easing: cubicOut });
  const springX = new Spring(0, { stiffness: 0.15, damping: 0.4 });

  function handleMouseMove(event) {
    const x = event.clientX;
    tweenX.set(x);
    springX.set(x);
  }
</script>

<svelte:window onmousemove={handleMouseMove} />

<div class="comparison">
  <div class="dot tween" style="left: {tweenX.current}px">Tween</div>
  <div class="dot spring" style="left: {springX.current}px">Spring</div>
</div>
```

Move your mouse quickly and change direction — the tween dot feels like it "fights" direction changes, while the spring dot carries momentum naturally.

### Pointer-Based Drag with Spring

For a fluid drag-and-release interaction, use pointer events with Spring physics. The element follows the pointer during drag and springs back to its origin on release:

```svelte
<script>
  import { Spring } from "svelte/motion";

  const position = new Spring({ x: 150, y: 150 }, {
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

When the user releases the element, the Spring animates it back to center with natural physics — it overshoots, oscillates, and settles. The `stiffness: 0.2` and `damping: 0.4` give a satisfying bounce. The `setPointerCapture` call ensures the element continues receiving pointer events even if the cursor moves outside the element during fast drags.

## Combining Transitions with animate:flip

The real power emerges when you combine `animate:flip` for moving items with `transition:` for entering and leaving items. This creates the complete experience — items fade in when added, fade out when removed, and the remaining items smoothly slide to fill the gap, all happening simultaneously:

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

### The Timing Coordination Problem

There is a subtle gotcha when combining transitions with FLIP. During the `out` transition, the leaving element still occupies space in the DOM. The FLIP animation for remaining elements starts from positions that include the leaving element, but animates to positions where the leaving element is gone. This usually works well because the FLIP animation and the out transition run simultaneously.

However, if the out transition duration is much longer than the FLIP duration, you get a visual glitch: the remaining items finish animating to their new positions while the leaving element is still visible and fading out, creating a gap that suddenly collapses:

```svelte
<!-- WRONG: Out transition is much longer than FLIP — creates a visual gap -->
<li
  animate:flip={{ duration: 200 }}
  out:fade={{ duration: 1000 }}
>

<!-- CORRECT: Keep durations in the same ballpark -->
<li
  animate:flip={{ duration: 300 }}
  out:fade={{ duration: 250 }}
>
```

A good rule of thumb: the out transition duration should be less than or equal to the FLIP duration. This way, the leaving element has disappeared by the time the remaining items finish settling.

### Crossfade — The Transition Pair

For elements that move between two different `{#each}` blocks (like moving a task between columns), Svelte provides `crossfade` from `svelte/transition`. It creates a matched pair of transitions: the element appears to fly from its old container to the new one:

```svelte
<script>
  import { flip } from "svelte/animate";
  import { crossfade } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const [send, receive] = crossfade({
    duration: 400,
    easing: quintOut,
    fallback(node) {
      // Fallback for items without a matching pair (e.g., newly created)
      return {
        duration: 300,
        css: (t) => `opacity: ${t}`
      };
    }
  });

  let todo = $state([
    { id: 1, text: "Design the UI" },
    { id: 2, text: "Write the API" },
    { id: 3, text: "Add tests" }
  ]);

  let done = $state([
    { id: 4, text: "Set up repo" }
  ]);

  function markDone(id) {
    const item = todo.find(t => t.id === id);
    if (!item) return;
    todo = todo.filter(t => t.id !== id);
    done = [...done, item];
  }

  function markTodo(id) {
    const item = done.find(t => t.id === id);
    if (!item) return;
    done = done.filter(t => t.id !== id);
    todo = [...todo, item];
  }
</script>

<div class="board">
  <div class="column">
    <h2>To Do</h2>
    {#each todo as item (item.id)}
      <div
        animate:flip={{ duration: 300 }}
        in:receive={{ key: item.id }}
        out:send={{ key: item.id }}
      >
        <span>{item.text}</span>
        <button onclick={() => markDone(item.id)}>Done</button>
      </div>
    {/each}
  </div>

  <div class="column">
    <h2>Done</h2>
    {#each done as item (item.id)}
      <div
        animate:flip={{ duration: 300 }}
        in:receive={{ key: item.id }}
        out:send={{ key: item.id }}
      >
        <span>{item.text}</span>
        <button onclick={() => markTodo(item.id)}>Undo</button>
      </div>
    {/each}
  </div>
</div>

<style>
  .board {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .column {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 16px;
  }

  .column > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 14px;
    margin-bottom: 6px;
    background: white;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }
</style>
```

The `key` parameter matches elements across the two lists. When an item is removed from `todo` and added to `done`, `send` records the old position and `receive` animates from that position to the new one. The `fallback` function handles items that have no matching pair (e.g., items that are freshly created, not moved between lists).

## Performance Considerations

Motion animations run on every animation frame (60fps = every 16.7ms). In most cases this is fine, but there are situations where performance degrades.

### Large Lists with animate:flip

FLIP requires measuring the position of every element in the list before and after the update. For 10 items this is trivial. For 1000 items it means 2000 `getBoundingClientRect()` calls — enough to cause a visible frame drop:

```svelte
<!-- Caution: FLIP on very large lists -->
{#each thousandItems as item (item.id)}
  <li animate:flip={{ duration: 300 }}>{item.name}</li>
{/each}

<!-- Better: Virtualize the list, only FLIP visible items -->
{#each visibleItems as item (item.id)}
  <li animate:flip={{ duration: 300 }}>{item.name}</li>
{/each}
```

### GPU-Accelerated Properties

Not all CSS properties animate equally. Some trigger layout recalculations, others only trigger repaint, and a few run entirely on the GPU compositor:

| Property | Cost | GPU? | Notes |
|----------|------|------|-------|
| `transform` | Very low | Yes | Translate, scale, rotate — always prefer this |
| `opacity` | Very low | Yes | Fading is nearly free |
| `filter` | Low | Yes (usually) | blur, brightness, contrast |
| `width` / `height` | High | No | Triggers layout — avoid in animations |
| `top` / `left` | High | No | Triggers layout — use transform instead |
| `box-shadow` | High | No | Complex repaints |

For Tween and Spring, this means you should animate `transform` and `opacity` whenever possible:

```svelte
<script>
  import { Spring } from "svelte/motion";

  const spring = new Spring({ x: 0, y: 0, scale: 1 }, {
    stiffness: 0.15,
    damping: 0.7
  });
</script>

<!-- WRONG: animating left/top triggers layout on every frame -->
<div style="left: {spring.current.x}px; top: {spring.current.y}px; position: absolute;">

<!-- CORRECT: animating transform runs on the GPU -->
<div style="transform: translate({spring.current.x}px, {spring.current.y}px) scale({spring.current.scale});">
```

The difference is dramatic: the `transform` version runs at a consistent 60fps even with dozens of animated elements. The `left/top` version can drop to 30fps or worse because every frame triggers a full layout recalculation.

### Multiple Springs and Frame Budgets

Each `Spring` runs its own animation loop. Having 50 springs all tracking mouse position means 50 calculations per frame. This is usually fine on modern hardware, but test on your target devices. For trail effects with many elements, consider reducing the number of animated elements or increasing the `precision` parameter to let springs settle earlier.

## Respecting prefers-reduced-motion

Some users configure their operating system to reduce animations — because of motion sensitivity, vestibular disorders, or personal preference. You should always respect this setting.

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

### Building a Motion-Safe Helper

Instead of checking `prefersReducedMotion` in every component, create a utility that wraps your animation parameters:

```typescript
// src/lib/utils/motion.ts
import { prefersReducedMotion } from "svelte/motion";

/** Returns 0 if reduced motion is preferred, otherwise the given value. */
export function motionSafe(value: number): number {
  return prefersReducedMotion.current ? 0 : value;
}

/** Returns instant spring params when reduced motion is preferred. */
export function safeSpringParams(params: { stiffness: number; damping: number }) {
  if (prefersReducedMotion.current) {
    return { stiffness: 1, damping: 1 }; // Instant, no bounce
  }
  return params;
}
```

```svelte
<script>
  import { flip } from "svelte/animate";
  import { fly, fade } from "svelte/transition";
  import { Spring } from "svelte/motion";
  import { motionSafe, safeSpringParams } from "$lib/utils/motion";

  const coords = new Spring({ x: 0, y: 0 }, safeSpringParams({
    stiffness: 0.1,
    damping: 0.25
  }));
</script>

{#each items as item (item.id)}
  <li
    animate:flip={{ duration: motionSafe(300) }}
    in:fly={{ y: motionSafe(-20), duration: motionSafe(300) }}
    out:fade={{ duration: motionSafe(200) }}
  >
    {item.text}
  </li>
{/each}
```

If you need a manual approach (for example, in environments where the `prefersReducedMotion` export is not available), you can use `MediaQuery` from `svelte/reactivity`:

```svelte
<script>
  import { MediaQuery } from "svelte/reactivity";

  const reducedMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let transitionDuration = $derived(reducedMotion.current ? 0 : 300);
</script>
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

However, the CSS approach only affects CSS-driven animations. `Tween` and `Spring` are JavaScript-driven — they update reactive values in `requestAnimationFrame` and do not respond to CSS media queries. You must handle them explicitly with the `prefersReducedMotion` check.

## Animated Number Displays

A common pattern is animating displayed numbers — scores, statistics, prices, timers. `Tween` handles this elegantly, but there are formatting details to get right:

```svelte
<script>
  import { Tween } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  let targetScore = $state(0);

  const displayScore = Tween.of(() => targetScore, {
    duration: 800,
    easing: cubicOut
  });

  let formattedScore = $derived(
    Math.round(displayScore.current).toLocaleString('en-US')
  );

  function addPoints(points) {
    targetScore += points;
  }
</script>

<div class="score-display">
  <span class="label">Score</span>
  <span class="value">{formattedScore}</span>
</div>

<div class="controls">
  <button onclick={() => addPoints(100)}>+100</button>
  <button onclick={() => addPoints(500)}>+500</button>
  <button onclick={() => addPoints(1000)}>+1,000</button>
  <button onclick={() => targetScore = 0}>Reset</button>
</div>

<style>
  .score-display {
    text-align: center;
    padding: 24px;
  }

  .label {
    display: block;
    font-size: 0.875rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .value {
    display: block;
    font-size: 3rem;
    font-weight: bold;
    font-variant-numeric: tabular-nums; /* Prevents layout shift as digits change */
    color: #1a1a1a;
  }

  .controls {
    display: flex;
    gap: 8px;
    justify-content: center;
  }

  button {
    padding: 8px 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    cursor: pointer;
  }
</style>
```

The `font-variant-numeric: tabular-nums` CSS property is critical — without it, digits have variable widths and the display jitters as numbers change. With tabular numbers, each digit has the same width, creating a stable layout.

## The Legacy API: tweened() and spring()

Before Svelte 5, motion values used store-based functions. You will encounter these in older codebases:

```svelte
<!-- DEPRECATED: Svelte 4 store-based API -->
<script>
  import { tweened } from "svelte/motion";
  import { spring } from "svelte/motion";

  const progress = tweened(0, { duration: 400 });
  const coords = spring({ x: 0, y: 0 });

  // Access value with $ prefix (store subscription)
  // $progress, $coords.x, $coords.y
</script>

<div style="width: {$progress}%"></div>
```

```svelte
<!-- CURRENT: Svelte 5 class-based API -->
<script>
  import { Tween, Spring } from "svelte/motion";

  const progress = new Tween(0, { duration: 400 });
  const coords = new Spring({ x: 0, y: 0 });

  // Access value with .current
  // progress.current, coords.current.x, coords.current.y
</script>

<div style="width: {progress.current}%"></div>
```

The class-based API has several advantages:

1. **No `$` magic**: `.current` is explicit, not compiler-transformed syntax
2. **Static `.of()` method**: Automatic reactive tracking without manual `$effect` + `.set()` wiring
3. **Type safety**: TypeScript generics work naturally with classes
4. **Consistency**: Matches other Svelte 5 reactive primitives like `$state` and `$derived`

If you are migrating from Svelte 4, the conversion is mechanical: replace `tweened(initial, opts)` with `new Tween(initial, opts)`, replace `spring(initial, opts)` with `new Spring(initial, opts)`, and replace `$value` with `value.current`.

## Try It

Build a "Sortable Task Board" that combines all the motion tools covered in this lesson:

1. **Task list with FLIP**: Create a list of 8 tasks, each with a name, priority (1-5), and creation date. Add buttons to sort by each field. When sorting, items should smoothly animate to their new positions with `animate:flip`. Use a stable `id` as the key — not the array index.

2. **Add and remove with transitions**: Add an "Add Task" button that prepends a new task — new tasks should fly in from the left with `in:fly={{ x: -200, duration: 300 }}`. Add a delete button on each task — removed tasks should fade out with `out:fade={{ duration: 200 }}`. Remaining tasks should slide into place via `animate:flip`. Keep the out transition duration shorter than the FLIP duration.

3. **Progress bar with Tween**: Show a "completion progress" bar at the top. Use `Tween.of()` to create a tween that automatically tracks `(completedTasks / totalTasks) * 100`. Include a checkbox on each task to mark it complete. The bar should smoothly animate as tasks are completed. Use `cubicOut` easing and 600ms duration. Display the animated percentage as a formatted number.

4. **Count badge with Spring**: Display a floating badge showing the total task count. Use `Spring.of()` to track the count, with `stiffness: 0.15` and `damping: 0.3`. The badge should bounce when tasks are added or removed.

5. **Crossfade between columns**: Split the board into "To Do" and "Done" columns. When a task is marked complete, it should animate from the "To Do" column to the "Done" column using `crossfade`. Provide an "Undo" button in the "Done" column that sends the task back. Use `animate:flip` within each column so remaining items slide into place.

6. **Drag to reorder**: Implement pointer-based drag reordering on the task list using a `Spring` for the drag offset. When released, the item should spring back to its new position. Use `setPointerCapture` for reliable drag tracking.

7. **Reduced motion**: Import `prefersReducedMotion` from `svelte/motion` and create a `motionSafe()` helper. Use it to set all durations to 0 and spring parameters to `{ stiffness: 1, damping: 1 }` when the user prefers reduced motion. Test by enabling "Reduce motion" in your OS accessibility settings.

## Key Takeaways

- `animate:flip` smoothly animates elements when their position changes in a keyed `{#each}` block — the key must be a stable unique identifier from your data, never the array index
- FLIP uses CSS transforms for animation, running on the compositor thread without triggering layout recalculations — this is why it performs well even with many elements
- The key `(item.id)` expression is non-negotiable: without it, Svelte updates content in place instead of moving elements, and FLIP does nothing
- `new Tween(value, options)` from `svelte/motion` interpolates between values over time with a fixed duration and easing curve — great for progress bars, counters, and gauges where you need the intermediate value in your template
- Always specify an easing function for Tween — the default `linear` looks robotic; use `cubicOut` for most UI animations
- `new Spring(value, options)` from `svelte/motion` provides physics-based motion with `stiffness` and `damping` — it preserves velocity on interruption, making it ideal for drag interactions and mouse-following elements
- Both `Tween` and `Spring` expose a `.current` property for the interpolated value, and a static `.of(fn)` method to automatically track reactive expressions without manual `.set()` calls
- The key behavioral difference: Tweens have fixed duration, Springs have emergent duration; Tweens restart on interruption, Springs redirect with preserved momentum
- `tween.set()` returns a Promise — chain sequential animations with `await` or detect interruptions
- Use `interpolate` on `Tween` to animate non-numeric values like colors, coordinates, or complex objects
- Combine `animate:flip` with `in:`/`out:` transitions for the complete experience: enter, exit, and reorder animations all at once — keep out transition duration shorter than FLIP duration to avoid visual gaps
- Use `crossfade` from `svelte/transition` for elements that move between different `{#each}` blocks — the `key` parameter matches items across lists
- Animate GPU-accelerated properties (`transform`, `opacity`) instead of layout-triggering ones (`width`, `height`, `top`, `left`) — the performance difference is dramatic
- Use `font-variant-numeric: tabular-nums` on animated number displays to prevent layout jitter as digits change width
- Use `prefersReducedMotion` from `svelte/motion` to respect the user's motion preference — set `duration: 0` for tweens and transitions, and `stiffness: 1, damping: 1` for springs; CSS media queries do not affect JavaScript-driven motion
- The legacy `tweened()` and `spring()` store functions still work but are deprecated — use the class-based `new Tween()` / `new Spring()` API with `.current` instead of the `$` prefix
