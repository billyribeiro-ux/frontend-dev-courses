# Transition Basics

Animations make the difference between an application that feels mechanical and one that feels alive. When elements appear and disappear abruptly, users lose context. Where did that notification go? Did my item get deleted or did the page break? When elements glide in, fade out, or slide into place, the interface communicates intent. Transitions are not decoration -- they are information.

Svelte ships with a powerful built-in transition system that makes this easy -- no extra animation libraries required. Transitions in Svelte attach to elements that are being added to or removed from the DOM, typically inside `{#if}` or `{#each}` blocks. You import a transition function, apply it with a directive, and Svelte handles the rest -- calculating keyframes, managing timing, cleaning up when the animation completes, and even handling interruptions when a user toggles something mid-animation.

The mental model: a transition is a function that receives a DOM node and returns an object describing how to animate it. Svelte calls this function at mount (intro) and unmount (outro), generates CSS animations from the description, and manages the lifecycle. The animations run in CSS, not JavaScript -- they are hardware-accelerated and do not block the main thread. This is why Svelte transitions perform well even on mobile devices.

## Import and Basic Usage

All built-in transitions live in the `svelte/transition` module:

```svelte
<script>
  import { fade, fly, slide, blur, scale, draw, crossfade } from "svelte/transition";

  let visible = $state(true);
</script>

<button onclick={() => visible = !visible}>
  Toggle
</button>

{#if visible}
  <p transition:fade>This fades in and out.</p>
{/if}
```

The `transition:fade` directive tells Svelte to animate the element's opacity from 0 to 1 when it enters the DOM (intro), and from 1 to 0 when it leaves (outro). The animation plays automatically -- you do not need to manage any state for it. Svelte handles the timing, cleanup, and even the case where the user toggles visibility while an animation is still playing (it reverses smoothly rather than jumping).

A key architectural detail: Svelte transitions generate CSS animations at runtime, not JavaScript-driven `requestAnimationFrame` loops. This means the main thread is free during the animation. The browser's compositor handles the interpolation on the GPU. This is why you can have dozens of elements transitioning simultaneously without janking the UI.

```
How Svelte transitions work under the hood:

1. Element is about to enter the DOM
2. Svelte calls your transition function: fade(node, params)
3. The function returns { duration, delay, easing, css, tick }
4. Svelte generates a @keyframes animation from the css() function
5. Svelte applies the animation via element.style.animation
6. The animation runs in CSS (GPU-accelerated, off main thread)
7. When complete, Svelte removes the animation styles

For outro (exit):
1. Element is about to leave the DOM
2. Svelte runs the transition in reverse
3. When the animation completes, Svelte removes the element from the DOM
4. The element is NOT removed until the outro finishes -- this prevents jank
```

## transition:fade

The simplest transition. It animates opacity only:

```svelte
<script>
  import { fade } from "svelte/transition";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:fade={{ duration: 400 }}>
    <p>I fade in and out smoothly.</p>
  </div>
{/if}
```

`fade` is the right default for most show/hide animations. It is subtle, fast, and universally understood. Use it for tooltips, modal overlays, notification badges, and any element that appears or disappears without changing position.

One gotcha: `fade` only animates `opacity`. The element still occupies space in the layout even at opacity 0 (during the animation). If you need the element to also collapse its space, combine `fade` with `slide` using separate `in:` and `out:` directives, or use `slide` alone.

## transition:fly

Animates both position and opacity. The element flies in from an offset and fades simultaneously:

```svelte
<script>
  import { fly } from "svelte/transition";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div transition:fly={{ y: 20, duration: 300 }}>
    <p>I fly up from 20px below while fading in.</p>
  </div>
{/if}
```

The `x` and `y` parameters control the starting offset in pixels. Use negative values to fly from the opposite direction:

| Parameter | Effect |
|-----------|--------|
| `{ y: 20 }` | Flies up from 20px below (most common -- feels like rising into place) |
| `{ y: -20 }` | Flies down from 20px above (dropdown menus, notifications from top) |
| `{ x: 100 }` | Flies in from 100px to the right (slide-in panels) |
| `{ x: -100 }` | Flies in from 100px to the left |
| `{ x: 50, y: 50 }` | Flies diagonally |

`fly` is the workhorse transition. It communicates direction -- the user understands where the element came from and where it went. Use it for list items, modal dialogs, side panels, and notifications.

A common mistake is using overly large offsets. A `y: 200` fly creates a dramatic swooping animation that feels slow and distracting. For UI elements, keep offsets between 8-30 pixels. Reserve large offsets (100px+) for intentional dramatic effects like page transitions.

```svelte
<!-- WRONG: too dramatic for a UI element -->
<div transition:fly={{ y: 200, duration: 800 }}>
  <p>This swoops in like a bird -- distracting</p>
</div>

<!-- CORRECT: subtle and professional -->
<div transition:fly={{ y: 12, duration: 200 }}>
  <p>This rises gently into place</p>
</div>
```

## transition:slide

Slides the element vertically by animating its height. This is perfect for expandable sections, accordions, and dropdown content:

```svelte
<script>
  import { slide } from "svelte/transition";

  let expanded = $state(false);
</script>

<button onclick={() => expanded = !expanded}>
  {expanded ? "Collapse" : "Expand"} Details
</button>

{#if expanded}
  <div transition:slide={{ duration: 300 }}>
    <p>Here are the details that slide into view. The element's height
    is animated from zero to its natural height.</p>
  </div>
{/if}
```

`slide` works by animating `height`, `padding-top`, `padding-bottom`, `margin-top`, `margin-bottom`, `border-top-width`, and `border-bottom-width` from 0 to their computed values. This makes surrounding content flow smoothly around the appearing element.

An important gotcha: `slide` sets `overflow: hidden` during the animation. If your content has elements that are positioned outside their parent (tooltips, dropdowns, absolutely positioned elements), they will be clipped during the transition. There are two workarounds:

```svelte
<!-- GOTCHA: overflow: hidden clips positioned children during slide -->
<div transition:slide>
  <div class="relative">
    <button>Open menu</button>
    <!-- This dropdown will be clipped during the slide animation! -->
    <div class="absolute top-full left-0 z-50">
      Dropdown content
    </div>
  </div>
</div>

<!-- WORKAROUND 1: Delay showing the positioned element until after the transition -->
<script>
  import { slide } from "svelte/transition";

  let expanded = $state(false);
  let transitionComplete = $state(false);
</script>

{#if expanded}
  <div transition:slide
       onintroend={() => transitionComplete = true}
       onoutrostart={() => transitionComplete = false}>
    <div class="relative">
      {#if transitionComplete}
        <!-- Positioned content only appears after slide completes -->
        <div class="absolute">Dropdown</div>
      {/if}
    </div>
  </div>
{/if}
```

The `slide` transition also accepts an `axis` parameter in Svelte 5 to slide horizontally:

```svelte
{#if showPanel}
  <div transition:slide={{ axis: 'x', duration: 300 }}>
    Side panel content
  </div>
{/if}
```

## transition:blur and transition:scale

**Blur** animates a Gaussian blur filter -- the element goes from blurry to sharp on enter and sharp to blurry on exit:

```svelte
<script>
  import { blur } from "svelte/transition";

  let show = $state(true);
</script>

{#if show}
  <img transition:blur={{ amount: 10, duration: 400 }} src="/photo.jpg" alt="Example" />
{/if}
```

The `amount` parameter controls the blur radius in pixels. Higher values create a more dramatic effect. `blur` is visually expensive -- it triggers GPU-intensive filter operations. Use it sparingly and avoid it on large elements or elements that transition frequently.

**Scale** animates the element's size. It grows from a starting scale to full size on enter, and shrinks back on exit:

```svelte
<script>
  import { scale } from "svelte/transition";

  let show = $state(true);
</script>

{#if show}
  <div transition:scale={{ start: 0.8, duration: 200, opacity: 0.5 }}>
    <p>I scale up from 80% size.</p>
  </div>
{/if}
```

| Parameter | Default | Description |
|-----------|---------|-------------|
| `start` | 0 | Starting scale (0 = invisible, 0.5 = half size, 1 = full size) |
| `opacity` | 0 | Starting opacity |

`scale` is ideal for modals (they "pop" into existence), floating action buttons, context menus, and tooltip-like elements. A `start` of 0.8 or 0.9 creates a subtle zoom that feels responsive. A `start` of 0 creates a dramatic grow-from-nothing effect.

```svelte
<!-- Modal: scale with a subtle zoom -->
{#if showModal}
  <div class="fixed inset-0 z-50 flex items-center justify-center">
    <div transition:fade={{ duration: 200 }} class="fixed inset-0 bg-black/50"
         onclick={() => showModal = false}></div>
    <div transition:scale={{ start: 0.95, duration: 200 }}
         class="relative z-10 rounded-xl bg-white p-6 shadow-xl">
      <h2>Modal Title</h2>
      <p>Modal content here.</p>
    </div>
  </div>
{/if}
```

## transition:draw

`draw` is designed for SVG `<path>` elements. It animates the stroke from invisible to fully drawn, like a pen drawing a shape:

```svelte
<script>
  import { draw } from "svelte/transition";

  let visible = $state(true);
</script>

<svg viewBox="0 0 100 100" class="w-24 h-24">
  {#if visible}
    <path
      transition:draw={{ duration: 1000, easing: cubicInOut }}
      d="M10 80 Q 50 10, 90 80"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
    />
  {/if}
</svg>
```

`draw` works by manipulating `stroke-dasharray` and `stroke-dashoffset`. It only works on SVG elements that have a `stroke` -- it does nothing on `<div>` or `<rect>` (which uses `fill`). This transition is perfect for loading animations, success checkmarks, signature effects, and decorative SVG illustrations.

## Transition Parameters

All transitions accept common parameters that control timing and easing:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `duration` | number | 400 | Animation length in milliseconds |
| `delay` | number | 0 | Time to wait before starting (ms) |
| `easing` | function | `cubicOut` | Easing curve from `svelte/easing` |

```svelte
<script>
  import { fly } from "svelte/transition";
  import { elasticOut, cubicOut, quintOut, backOut, bounceOut } from "svelte/easing";

  let show = $state(true);
</script>

{#if show}
  <div transition:fly={{ y: 50, duration: 600, delay: 100, easing: elasticOut }}>
    <p>I fly in with an elastic bounce after a short delay!</p>
  </div>
{/if}
```

Svelte provides a rich set of easing functions. Understanding when to use which is important:

| Easing | Character | Best for |
|--------|-----------|----------|
| `cubicOut` | Smooth deceleration (default) | Most UI transitions -- feels natural |
| `cubicIn` | Smooth acceleration | Exit animations (speeds up as it leaves) |
| `cubicInOut` | Slow start, slow end | Longer animations, state changes |
| `quintOut` | Sharper deceleration | Quick, snappy entrances |
| `elasticOut` | Springy overshoot | Playful UI, attention-grabbing elements |
| `bounceOut` | Bounces at the end | Playful, game-like interfaces |
| `backOut` | Slight overshoot then settle | Subtle spring feel without the bounce |
| `linear` | Constant speed | Progress bars, loading indicators |

A key principle: **use `Out` easings for entrances and `In` easings for exits**. This is counterintuitive but correct. An `Out` easing starts fast and decelerates -- the element arrives quickly and settles into place. An `In` easing starts slow and accelerates -- the element gently lifts off and zooms away. `InOut` is for animations where the element is visible throughout (like a loading spinner or a position change).

```svelte
<!-- WRONG: cubicIn for entrance feels sluggish -->
<div transition:fly={{ y: 20, easing: cubicIn }}>Slow start, fast end -- jarring</div>

<!-- CORRECT: cubicOut for entrance feels responsive -->
<div transition:fly={{ y: 20, easing: cubicOut }}>Fast start, gentle settle -- natural</div>
```

## Directional Transitions: in: and out:

Sometimes you want a different animation for entering versus leaving. Use `in:` and `out:` instead of `transition:`:

```svelte
<script>
  import { fly, fade, scale } from "svelte/transition";
  import { quintOut, cubicIn } from "svelte/easing";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div
    in:fly={{ y: 20, duration: 300, easing: quintOut }}
    out:fade={{ duration: 200, easing: cubicIn }}
  >
    <p>I fly in from below, but fade out.</p>
  </div>
{/if}
```

This gives you full control over each direction. The element can slide in but fade out, scale in but fly out -- any combination works.

There is an important behavioral difference between `transition:` and `in:`/`out:`. When you use `transition:` and toggle the condition rapidly, Svelte smoothly reverses the animation mid-flight. With separate `in:` and `out:`, the current animation completes before the opposite one starts. Choose `transition:` when you want smooth reversals (toggles, hover states). Choose `in:`/`out:` when you want distinct, non-reversible animations (notifications arriving from the right and fading out).

```svelte
<!-- transition: reverses smoothly on rapid toggle -->
<div transition:fly={{ y: 20 }}>
  Toggle this rapidly -- it reverses mid-animation smoothly
</div>

<!-- in:/out: each animation plays fully before the opposite starts -->
<div in:fly={{ y: 20 }} out:fade>
  Toggle this rapidly -- the fly-in completes, THEN the fade-out starts
</div>
```

## Global Transitions

By default, transitions only play when the element's **direct parent block** is added or removed. If an outer `{#if}` controls visibility, transitions on inner elements will not play. Adding `|global` makes the transition play regardless of what triggered the DOM change:

```svelte
<script>
  import { fade, fly } from "svelte/transition";

  let showSection = $state(true);
</script>

<button onclick={() => showSection = !showSection}>Toggle Section</button>

{#if showSection}
  <div>
    <!-- Without |global, this transition would NOT play because the
         parent div is what gets added/removed, not this paragraph -->
    <p transition:fade|global={{ duration: 300 }}>
      I transition even though my parent controls the visibility.
    </p>

    <!-- Multiple children can each have their own global transition -->
    <p transition:fly|global={{ y: 10, duration: 300, delay: 100 }}>
      I also transition, with a slight delay for a staggered effect.
    </p>
  </div>
{/if}
```

Use `|global` when elements are deeply nested inside conditional blocks but you still want their transitions to fire. Be careful with it though -- in large component trees, `|global` can cause unexpected animations when parent components re-render. Use it intentionally, not as a default.

The default (local) behavior exists for a reason: when a parent component unmounts, you typically do not want every nested element to play its own exit animation. That would create a chaotic cascade of animations. Local transitions ensure that only directly toggled elements animate.

## Transition Events

Svelte fires events at each stage of a transition, giving you hooks for coordination:

```svelte
<script>
  import { fly } from "svelte/transition";

  let visible = $state(true);
  let status = $state('idle');
</script>

<button onclick={() => visible = !visible}>Toggle</button>
<p>Status: {status}</p>

{#if visible}
  <div
    transition:fly={{ y: 20, duration: 500 }}
    onintrostart={() => status = 'entering...'}
    onintroend={() => status = 'entered'}
    onoutrostart={() => status = 'leaving...'}
    onoutroend={() => status = 'left'}
  >
    Watch the status above as I transition.
  </div>
{/if}
```

| Event | When it fires | Common use |
|-------|--------------|------------|
| `onintrostart` | Intro animation begins | Disable interactions, start related animations |
| `onintroend` | Intro animation completes | Enable interactions, focus an input, start timers |
| `onoutrostart` | Outro animation begins | Cancel pending operations, save state |
| `onoutroend` | Outro animation completes | Clean up resources, navigate away |

These events are essential for coordinating transitions with other behavior. For example, you might want to focus an input field only after a modal has finished animating in, or you might want to prevent interaction during a transition:

```svelte
<script>
  import { scale, fade } from "svelte/transition";

  let showModal = $state(false);
  let transitioning = $state(false);
  let inputRef: HTMLInputElement;
</script>

{#if showModal}
  <div class="fixed inset-0 z-50">
    <div transition:fade={{ duration: 200 }}
         class="fixed inset-0 bg-black/50"
         onclick={() => { if (!transitioning) showModal = false; }}>
    </div>
    <div transition:scale={{ start: 0.95, duration: 200 }}
         onintrostart={() => transitioning = true}
         onintroend={() => { transitioning = false; inputRef?.focus(); }}
         onoutrostart={() => transitioning = true}
         onoutroend={() => transitioning = false}
         class="relative z-10 mx-auto mt-20 max-w-md rounded-xl bg-white p-6 shadow-xl">
      <h2 class="text-lg font-bold">Search</h2>
      <input bind:this={inputRef} type="text" placeholder="Type to search..."
             class="mt-4 w-full rounded-lg border p-3" />
    </div>
  </div>
{/if}
```

## Custom Transitions

Built-in transitions cover most cases, but you can create your own. A transition is a function that receives a DOM node and parameters, and returns an object describing the animation:

```typescript
// src/lib/transitions.ts
import type { TransitionConfig } from 'svelte/transition';

/**
 * A custom "typewriter" transition that reveals text character by character.
 */
export function typewriter(node: HTMLElement, {
  speed = 30,
  delay = 0
}: { speed?: number; delay?: number } = {}): TransitionConfig {
  const text = node.textContent ?? '';
  const duration = text.length * speed;

  return {
    delay,
    duration,
    // The tick function runs on every animation frame (JavaScript-driven)
    tick(t: number) {
      const charCount = Math.round(text.length * t);
      node.textContent = text.slice(0, charCount);
    }
  };
}

/**
 * A "wipe" transition that reveals the element with a clip-path.
 * Uses CSS (GPU-accelerated) instead of tick (main thread).
 */
export function wipe(node: HTMLElement, {
  duration = 400,
  delay = 0,
  direction = 'left'
}: { duration?: number; delay?: number; direction?: 'left' | 'right' | 'top' | 'bottom' } = {}): TransitionConfig {
  return {
    delay,
    duration,
    // The css function returns a CSS string for each point in time
    // This runs as a CSS animation -- GPU-accelerated, off main thread
    css(t: number) {
      switch (direction) {
        case 'left':
          return `clip-path: inset(0 ${(1 - t) * 100}% 0 0)`;
        case 'right':
          return `clip-path: inset(0 0 0 ${(1 - t) * 100}%)`;
        case 'top':
          return `clip-path: inset(0 0 ${(1 - t) * 100}% 0)`;
        case 'bottom':
          return `clip-path: inset(${(1 - t) * 100}% 0 0 0)`;
      }
    }
  };
}
```

```svelte
<script>
  import { typewriter, wipe } from '$lib/transitions';

  let show = $state(true);
</script>

{#if show}
  <h1 in:typewriter={{ speed: 50 }}>Welcome to the app</h1>
  <div in:wipe={{ direction: 'left', duration: 600 }}>
    <img src="/hero.jpg" alt="Hero" />
  </div>
{/if}
```

The critical distinction: **`css` vs `tick`**. The `css` function generates CSS keyframes -- these run on the GPU compositor thread, off the main thread, and perform excellently. The `tick` function runs JavaScript on every animation frame -- it blocks the main thread and can cause jank if the operation is expensive. Always prefer `css` when possible. Use `tick` only for effects that CSS cannot express (like changing text content, manipulating canvas, or updating complex DOM structures).

```typescript
// WRONG: using tick for something CSS can do -- blocks main thread
export function fadeCustom(node: HTMLElement, { duration = 300 }): TransitionConfig {
  return {
    duration,
    tick(t) {
      node.style.opacity = String(t); // JavaScript on every frame
    }
  };
}

// CORRECT: using css for the same effect -- GPU-accelerated
export function fadeCustom(node: HTMLElement, { duration = 300 }): TransitionConfig {
  return {
    duration,
    css(t) {
      return `opacity: ${t}`; // CSS animation, off main thread
    }
  };
}
```

## Transitions in `{#each}` Blocks

Transitions work with keyed `{#each}` blocks to animate list additions and removals. The key `(item.id)` is essential -- it tells Svelte which items are entering, leaving, or staying:

```svelte
<script>
  import { fly, fade } from "svelte/transition";
  import { flip } from "svelte/animate";

  let items = $state([
    { id: 1, text: 'Learn Svelte' },
    { id: 2, text: 'Build an app' },
    { id: 3, text: 'Ship it' }
  ]);
  let nextId = $state(4);

  function addItem() {
    items = [{ id: nextId++, text: `Task ${nextId - 1}` }, ...items];
  }

  function removeItem(id: number) {
    items = items.filter(item => item.id !== id);
  }
</script>

<button onclick={addItem}>Add Item</button>

<ul>
  {#each items as item (item.id)}
    <li
      in:fly={{ x: -100, duration: 300 }}
      out:fade={{ duration: 200 }}
      animate:flip={{ duration: 300 }}
    >
      <span>{item.text}</span>
      <button onclick={() => removeItem(item.id)}>Remove</button>
    </li>
  {/each}
</ul>
```

The `animate:flip` directive is a companion to transitions -- it smoothly animates the *remaining* items when items are added or removed. FLIP stands for First, Last, Invert, Play -- Svelte records each element's position before the change, records the new position after, and animates from old to new. Without `animate:flip`, remaining items would jump to their new positions instantly.

A critical gotcha: **you must use a keyed each block `(item.id)` for transitions to work correctly**. Without a key, Svelte reuses DOM elements and mutations happen in-place -- there are no additions or removals, so no transitions fire:

```svelte
<!-- WRONG: no key -- transitions will not fire correctly -->
{#each items as item}
  <li transition:fade>{item.text}</li>
{/each}

<!-- CORRECT: keyed by unique ID -- Svelte tracks additions/removals -->
{#each items as item (item.id)}
  <li transition:fade>{item.text}</li>
{/each}
```

## Staggered Transitions

Create staggered animations by using the `delay` parameter with the item index:

```svelte
<script>
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let items = $state([]);
  let loaded = $state(false);

  async function loadItems() {
    const response = await fetch('/api/items');
    items = await response.json();
    loaded = true;
  }
</script>

{#if loaded}
  <ul>
    {#each items as item, i (item.id)}
      <li transition:fly={{ y: 20, duration: 300, delay: i * 50, easing: quintOut }}>
        {item.name}
      </li>
    {/each}
  </ul>
{/if}
```

The `delay: i * 50` creates a cascade effect where each item enters 50ms after the previous one. This is visually pleasing for list reveals -- it draws the user's eye down the list and communicates structure. Keep the per-item delay short (30-80ms) to maintain a snappy feel. Longer delays make the list feel sluggish.

Be cautious with staggered transitions on long lists. A 100-item list with 50ms delay means the last item does not appear for 5 seconds. Cap the delay or only stagger the first few items:

```svelte
{#each items as item, i (item.id)}
  <li transition:fly={{
    y: 20,
    duration: 300,
    delay: Math.min(i * 50, 500),  // Cap at 500ms max delay
    easing: quintOut
  }}>
    {item.name}
  </li>
{/each}
```

## Respecting User Preferences

Some users have vestibular disorders or motion sensitivity. The `prefers-reduced-motion` media query lets you respect their system preferences:

```svelte
<script>
  import { fade, fly } from "svelte/transition";

  let show = $state(true);

  // Check if the user prefers reduced motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Use a subtle fade instead of fly for motion-sensitive users
  function getTransition(node: HTMLElement) {
    if (prefersReducedMotion) {
      return fade(node, { duration: 150 });
    }
    return fly(node, { y: 20, duration: 300 });
  }
</script>

{#if show}
  <div transition:getTransition>
    Respects user motion preferences.
  </div>
{/if}
```

Alternatively, use a simpler approach with CSS:

```svelte
<style>
  @media (prefers-reduced-motion: reduce) {
    :global(*) {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
</style>
```

This is an accessibility requirement, not a nice-to-have. WCAG 2.1 Success Criterion 2.3.3 recommends providing a way to disable motion animations.

## Performance Considerations

Transitions are generally performant because they use CSS animations, but there are patterns that can cause problems:

```svelte
<!-- WRONG: transitioning properties that trigger layout recalculation -->
<div transition:fly>
  <!-- fly uses transform (good) but also opacity (acceptable) -->
  <!-- This is fine because Svelte's built-in transitions are optimized -->
</div>

<!-- WRONG: custom transition animating width/height/top/left -->
<script>
  function badTransition(node) {
    return {
      duration: 300,
      css: (t) => `width: ${t * 100}%; height: ${t * 300}px`
      // width and height trigger layout -- every frame forces a reflow
    };
  }
</script>

<!-- CORRECT: custom transition using transform and opacity only -->
<script>
  function goodTransition(node) {
    return {
      duration: 300,
      css: (t) => `transform: scale(${t}); opacity: ${t}`
      // transform and opacity are composited -- no layout recalculation
    };
  }
</script>
```

The compositing rule: only `transform` and `opacity` can be animated without triggering layout recalculation. The browser handles these on the GPU compositor thread, completely off the main thread. Properties like `width`, `height`, `top`, `left`, `padding`, and `margin` trigger layout -- every frame forces the browser to recalculate the position of every affected element.

The `slide` transition is an exception -- it animates `height`, which does trigger layout. Svelte optimizes this by batching the style changes, but on very complex pages with many elements, `slide` can cause jank. If you notice performance issues with `slide`, consider using `transform: scaleY()` in a custom transition instead, though this distorts the content rather than clipping it.

## Practical Example: Notification Toast System

Here is a complete notification component that uses `fly` for entering and `fade` for exiting:

```svelte
<!-- src/lib/components/ToastContainer.svelte -->
<script>
  import { fly, fade } from "svelte/transition";
  import { flip } from "svelte/animate";
  import { quintOut } from "svelte/easing";

  let notifications = $state<Array<{
    id: number;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  }>>([]);
  let nextId = $state(1);

  export function addNotification(
    message: string,
    type: 'success' | 'error' | 'info' | 'warning' = 'info',
    durationMs = 4000
  ) {
    const id = nextId++;
    notifications = [...notifications, { id, message, type }];

    // Auto-dismiss -- but not for errors (user might need to read them)
    if (type !== 'error') {
      setTimeout(() => dismiss(id), durationMs);
    }
  }

  function dismiss(id: number) {
    notifications = notifications.filter(n => n.id !== id);
  }

  // Keyboard accessibility: dismiss on Escape
  function handleKeydown(event: KeyboardEvent, id: number) {
    if (event.key === 'Escape' || event.key === 'Enter') {
      dismiss(id);
    }
  }

  const typeStyles = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-blue-600',
    warning: 'bg-amber-500 text-black'
  };

  const typeIcons = {
    success: '✓',
    error: '✗',
    info: 'ℹ',
    warning: '⚠'
  };
</script>

<div class="pointer-events-none fixed top-4 right-4 z-50 flex flex-col gap-3"
     aria-live="polite" aria-label="Notifications">
  {#each notifications as notification (notification.id)}
    <div
      class="pointer-events-auto flex items-center gap-3 rounded-lg px-4 py-3
             text-white shadow-lg {typeStyles[notification.type]}
             min-w-72 max-w-sm"
      role="alert"
      tabindex="0"
      in:fly={{ x: 300, duration: 300, easing: quintOut }}
      out:fade={{ duration: 200 }}
      animate:flip={{ duration: 200 }}
      onkeydown={(e) => handleKeydown(e, notification.id)}
    >
      <span class="text-lg" aria-hidden="true">{typeIcons[notification.type]}</span>
      <span class="flex-1 text-sm">{notification.message}</span>
      <button
        class="ml-2 rounded p-1 opacity-70 hover:opacity-100"
        onclick={() => dismiss(notification.id)}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  {/each}
</div>
```

Key production details in this example:
- `aria-live="polite"` announces new notifications to screen readers
- `role="alert"` on each toast ensures assistive technology notices them
- Keyboard-accessible: each toast is focusable and dismissible with Escape or Enter
- `pointer-events-none` on the container prevents the fixed overlay from blocking clicks on the page, with `pointer-events-auto` on each individual toast
- Error toasts do not auto-dismiss -- users need time to read error messages
- `animate:flip` smoothly rearranges remaining toasts when one is dismissed

## Practical Example: Accordion with Slide

```svelte
<script>
  import { slide } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  const faqs = [
    { id: 1, question: 'What payment methods do you accept?', answer: 'We accept all major credit cards, PayPal, and bank transfers.' },
    { id: 2, question: 'How long does shipping take?', answer: 'Standard shipping takes 5-7 business days. Express shipping is available for 2-3 day delivery.' },
    { id: 3, question: 'What is your return policy?', answer: 'You can return any unused item within 30 days for a full refund. See our returns page for details.' },
    { id: 4, question: 'Do you offer support?', answer: 'Yes, we offer 24/7 email support and live chat during business hours.' }
  ];

  let openId = $state<number | null>(null);

  function toggle(id: number) {
    openId = openId === id ? null : id;
  }
</script>

<div class="mx-auto max-w-2xl divide-y divide-gray-200 rounded-xl border border-gray-200">
  {#each faqs as faq (faq.id)}
    <div>
      <button
        class="flex w-full items-center justify-between px-6 py-4 text-left
               font-medium hover:bg-gray-50"
        onclick={() => toggle(faq.id)}
        aria-expanded={openId === faq.id}
        aria-controls="faq-{faq.id}"
      >
        <span>{faq.question}</span>
        <span class="ml-4 transition-transform duration-200"
              class:rotate-180={openId === faq.id}>
          &#9660;
        </span>
      </button>

      {#if openId === faq.id}
        <div id="faq-{faq.id}"
             transition:slide={{ duration: 250, easing: quintOut }}>
          <p class="px-6 pb-4 text-gray-600">{faq.answer}</p>
        </div>
      {/if}
    </div>
  {/each}
</div>
```

## Try It

Build a "FAQ Accordion" component with these requirements:

1. Create an array of 4-5 question/answer objects
2. Display each question as a clickable header
3. When clicked, use `slide` to reveal the answer below
4. Only one answer should be visible at a time (clicking a new question closes the previous one)
5. Add `fly` with a small y-offset to the question list itself so items animate when the page loads
6. Add a chevron icon that rotates when the section is expanded (use CSS `transition-transform`, not a Svelte transition)
7. Add `aria-expanded` and `aria-controls` attributes for screen reader accessibility
8. Create a custom "wipe" transition that reveals a decorative image using `clip-path` in the CSS approach (not tick)
9. Add a notification toast system using `fly` for entrance and `fade` for exit, with auto-dismiss and `aria-live` for accessibility
10. Bonus: Implement staggered transitions for the FAQ items on initial page load, capped at 500ms maximum total delay

## Key Takeaways

- Svelte has built-in transitions -- import from `svelte/transition` with no extra packages. They generate CSS animations that run on the GPU, not JavaScript animation loops
- `fade`, `fly`, `slide`, `blur`, `scale`, and `draw` cover the most common animation patterns. `fly` is the workhorse for directional motion; `fade` is the safe default
- Pass parameters as an object: `transition:fly={{ y: 20, duration: 300 }}`. Keep offsets subtle (8-30px) for UI elements
- Use `in:` and `out:` for different animations on enter versus exit. Use `transition:` when you want smooth reversals on rapid toggles
- Control timing with `duration`, `delay`, and `easing` (from `svelte/easing`). Use `Out` easings for entrances and `In` easings for exits
- Add `|global` when transitions should play even if a parent block controls visibility -- but use it intentionally, not as a default
- Transitions work automatically on elements inside `{#if}` and `{#each}` blocks. Keyed each blocks `(item.id)` are required for correct add/remove tracking
- Use `animate:flip` alongside transitions in each blocks to smoothly reposition remaining elements
- Transition events (`onintrostart`, `onintroend`, `onoutrostart`, `onoutroend`) let you coordinate transitions with other behavior like focus management and interaction gating
- Custom transitions return `{ duration, delay, css, tick }`. Prefer `css` over `tick` -- CSS animations are GPU-accelerated and do not block the main thread
- Respect `prefers-reduced-motion` -- provide instant or subtle alternatives for motion-sensitive users. This is an accessibility requirement
- Only `transform` and `opacity` can be animated without layout recalculation. The `slide` transition is an exception that animates `height` -- use it carefully on complex pages
