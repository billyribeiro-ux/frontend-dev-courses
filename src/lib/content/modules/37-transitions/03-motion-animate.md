# Motion & Animate

Transitions handle elements entering and leaving the DOM. But what about elements that **move** — a list item sliding to a new position after sorting, a progress bar smoothly filling, or a draggable element springing back to its origin? Svelte provides three tools for this: the `animate:flip` directive for list reordering, `tweened` for smooth value interpolation, and `spring` for physics-based motion.

These tools combine with transitions to create interfaces where everything moves fluidly. Items entering a list fade in, items leaving fade out, and the remaining items smoothly slide to fill the gap. This lesson covers each tool and shows how to combine them for polished, production-quality animations.

## animate:flip — Smooth List Reordering

When items in a keyed `{#each}` block change position, they normally jump instantly to their new location. The `animate:flip` directive (First, Last, Invert, Play) measures each element's old and new position and smoothly animates between them:

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

The key `(item.id)` is required — Svelte uses it to track which element moved where. The `duration` parameter controls how long the position animation takes. You can also pass `delay` and `easing`.

## tweened() — Smooth Value Interpolation

`tweened` creates a reactive value that smoothly transitions between numbers over time. Instead of jumping from 0 to 100, it glides there. Import it from `svelte/motion`:

```svelte
<script>
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";

  const progress = tweened(0, {
    duration: 600,
    easing: cubicOut
  });
</script>

<div class="bar-bg">
  <div class="bar-fill" style="width: {$progress}%"></div>
</div>
<p>{Math.round($progress)}%</p>

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

Access the current value with `$progress` (the `$` prefix reads the store value). When you call `progress.set(75)`, the value smoothly interpolates from its current position to 75 over 600ms.

Tweened values accept `duration`, `easing`, and an `interpolate` function for complex types:

```typescript
import { tweened } from "svelte/motion";
import { cubicInOut } from "svelte/easing";

// Tween a number
const count = tweened(0, { duration: 400 });

// Tween with custom interpolation (e.g., for colors)
const color = tweened("#ff0000", {
  duration: 800,
  interpolate: (from, to) => {
    // Return a function that takes t (0 to 1) and returns the interpolated value
    return (t) => {
      // Simple hex interpolation (in practice, use a library)
      const r = Math.round(parseInt(from.slice(1, 3), 16) * (1 - t) + parseInt(to.slice(1, 3), 16) * t);
      const g = Math.round(parseInt(from.slice(3, 5), 16) * (1 - t) + parseInt(to.slice(3, 5), 16) * t);
      const b = Math.round(parseInt(from.slice(5, 7), 16) * (1 - t) + parseInt(to.slice(5, 7), 16) * t);
      return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    };
  }
});
```

## spring() — Physics-Based Motion

While `tweened` follows a fixed easing curve, `spring` simulates physical spring dynamics. The value overshoots, oscillates, and settles naturally — perfect for drag interactions and playful UI:

```svelte
<script>
  import { spring } from "svelte/motion";

  const coords = spring({ x: 0, y: 0 }, {
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
    style="left: {$coords.x}px; top: {$coords.y}px"
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

Spring parameters control the feel of the motion:

| Parameter | Range | Effect |
|-----------|-------|--------|
| `stiffness` | 0 to 1 | Higher = faster, snappier motion |
| `damping` | 0 to 1 | Higher = less oscillation, settles faster |
| `precision` | 0.001+ | How close to the target before stopping |

Low stiffness + low damping = slow, bouncy. High stiffness + high damping = quick, rigid. Experiment to find the right feel.

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

## Respecting prefers-reduced-motion

Some users configure their operating system to reduce animations — because of motion sensitivity, vestibular disorders, or personal preference. You should always respect this setting. Use the `prefers-reduced-motion` media query to conditionally reduce or disable transitions:

```svelte
<script>
  import { fly, fade } from "svelte/transition";
  import { flip } from "svelte/animate";

  let reducedMotion = $state(false);

  $effect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotion = mediaQuery.matches;

    function handleChange(event) {
      reducedMotion = event.matches;
    }

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  });

  // Use short durations or skip transitions for users who prefer reduced motion
  let transitionDuration = $derived(reducedMotion ? 0 : 300);
  let flipDuration = $derived(reducedMotion ? 0 : 300);

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:fly={{ y: 20, duration: transitionDuration }}>
    <p>I respect your motion preferences.</p>
  </div>
{/if}
```

Setting `duration: 0` effectively disables the animation while keeping the transition logic intact. This is cleaner than conditionally removing the `transition:` directive entirely.

You can also handle this with pure CSS as a complementary approach:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

## Try It

Build a "Sortable Task Board":
- Create a list of tasks with name, priority (1-5), and creation date
- Add buttons to sort by each field — when sorting, items should smoothly animate to their new positions with `animate:flip`
- Add an "Add Task" button — new tasks should fly in from the left with `in:fly`
- Add a delete button on each task — removed tasks should fade out and the remaining tasks should slide into place
- Use a `tweened` value for a "completion progress" bar that updates as tasks are added and removed
- Use a `spring` value for a floating count badge that bounces when the count changes
- Wrap all animation durations with a `prefers-reduced-motion` check

## Key Takeaways

- `animate:flip` smoothly animates elements when their position changes in a keyed `{#each}` block
- `tweened()` from `svelte/motion` interpolates between values over time — great for progress bars, counters, and gauges
- `spring()` from `svelte/motion` provides physics-based motion with `stiffness` and `damping` — great for drag interactions and playful UIs
- Combine `animate:flip` with `in:`/`out:` transitions for the complete experience: enter, exit, and reorder animations all at once
- `tweened` and `spring` are Svelte stores — read their current value with the `$` prefix
- Always respect `prefers-reduced-motion` by checking the media query and setting `duration: 0` for users who prefer reduced motion
- The `interpolate` parameter on `tweened` lets you animate complex values like colors or objects
