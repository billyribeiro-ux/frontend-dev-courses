# Transition Basics

Animations make the difference between an application that feels mechanical and one that feels alive. When elements appear and disappear abruptly, users lose context. When elements glide in, fade out, or slide into place, the interface feels intentional and polished. Svelte ships with a powerful built-in transition system that makes this easy — no extra animation libraries required.

Transitions in Svelte attach to elements that are being added to or removed from the DOM, typically inside `{#if}` or `{#each}` blocks. You import a transition function, apply it with a directive, and Svelte handles the rest — calculating keyframes, managing timing, and cleaning up when the animation completes.

## Import and Basic Usage

All built-in transitions live in the `svelte/transition` module:

```svelte
<script>
  import { fade, fly, slide, blur, scale } from "svelte/transition";

  let visible = $state(true);
</script>

<button onclick={() => visible = !visible}>
  Toggle
</button>

{#if visible}
  <p transition:fade>This fades in and out.</p>
{/if}
```

The `transition:fade` directive tells Svelte to animate the element's opacity from 0 to 1 when it enters the DOM, and from 1 to 0 when it leaves. The animation plays automatically — you do not need to manage any state for it.

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

The `x` and `y` parameters control the starting offset in pixels. Use negative values to fly from the opposite direction: `{{ y: -50 }}` flies down from above, `{{ x: -100 }}` flies in from the left.

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
    <p>Here are the details that slide into view. The element's height is animated from zero to its natural height.</p>
  </div>
{/if}
```

## transition:blur and transition:scale

**Blur** animates a Gaussian blur filter — the element goes from blurry to sharp on enter and sharp to blurry on exit:

```svelte
<script>
  import { blur } from "svelte/transition";

  let show = $state(true);
</script>

{#if show}
  <img transition:blur={{ amount: 10, duration: 400 }} src="/photo.jpg" alt="Example" />
{/if}
```

**Scale** animates the element's size. It grows from a starting scale to full size on enter, and shrinks back on exit:

```svelte
<script>
  import { scale } from "svelte/transition";

  let show = $state(true);
</script>

{#if show}
  <div transition:scale={{ start: 0.5, duration: 300 }}>
    <p>I scale up from half size.</p>
  </div>
{/if}
```

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
  import { elasticOut } from "svelte/easing";

  let show = $state(true);
</script>

{#if show}
  <div transition:fly={{ y: 50, duration: 600, delay: 100, easing: elasticOut }}>
    <p>I fly in with an elastic bounce after a short delay!</p>
  </div>
{/if}
```

Svelte provides many easing functions: `linear`, `cubicIn`, `cubicOut`, `cubicInOut`, `elasticOut`, `bounceOut`, `quintOut`, and more. Import them from `svelte/easing`.

## Directional Transitions: in: and out:

Sometimes you want a different animation for entering versus leaving. Use `in:` and `out:` instead of `transition:`:

```svelte
<script>
  import { fly, fade } from "svelte/transition";

  let show = $state(true);
</script>

<button onclick={() => show = !show}>Toggle</button>

{#if show}
  <div in:fly={{ y: 20, duration: 300 }} out:fade={{ duration: 200 }}>
    <p>I fly in from below, but fade out.</p>
  </div>
{/if}
```

This gives you full control over each direction. The element can slide in but fade out, scale in but fly out — any combination works.

## Global Transitions

By default, transitions only play when the element's **direct parent block** is added or removed. If an outer `{#if}` controls visibility, transitions on inner elements will not play. Adding `|global` makes the transition play regardless of what triggered the DOM change:

```svelte
<script>
  import { fade } from "svelte/transition";

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
  </div>
{/if}
```

Use `|global` when elements are deeply nested inside conditional blocks but you still want their transitions to fire.

## Practical Example: Notification Toast

Here is a complete notification component that uses `fly` for entering and `fade` for exiting:

```svelte
<script>
  import { fly, fade } from "svelte/transition";

  let notifications = $state([]);
  let nextId = $state(1);

  function addNotification(message, type = "info") {
    const id = nextId++;
    notifications.push({ id, message, type });

    // Auto-dismiss after 3 seconds
    setTimeout(() => dismiss(id), 3000);
  }

  function dismiss(id) {
    notifications = notifications.filter(n => n.id !== id);
  }
</script>

<div class="controls">
  <button onclick={() => addNotification("File saved successfully!", "success")}>
    Success
  </button>
  <button onclick={() => addNotification("Something went wrong.", "error")}>
    Error
  </button>
  <button onclick={() => addNotification("New update available.", "info")}>
    Info
  </button>
</div>

<div class="toast-container">
  {#each notifications as notification (notification.id)}
    <div
      class="toast {notification.type}"
      in:fly={{ x: 300, duration: 300 }}
      out:fade={{ duration: 200 }}
    >
      <span>{notification.message}</span>
      <button class="close" onclick={() => dismiss(notification.id)}>
        &times;
      </button>
    </div>
  {/each}
</div>

<style>
  .controls {
    display: flex;
    gap: 8px;
    margin-bottom: 20px;
  }

  .controls button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: #3b82f6;
    color: white;
    cursor: pointer;
  }

  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 1000;
  }

  .toast {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 8px;
    color: white;
    font-size: 0.95rem;
    min-width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .toast.success { background: #16a34a; }
  .toast.error { background: #dc2626; }
  .toast.info { background: #2563eb; }

  .close {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 4px;
  }
</style>
```

Each notification flies in from the right and fades out when dismissed. The `{#each}` block with a key `(notification.id)` ensures Svelte correctly tracks which notification is entering or leaving.

## Try It

Build a "FAQ Accordion" component:
- Create an array of 4-5 question/answer objects
- Display each question as a clickable header
- When clicked, use `slide` to reveal the answer below
- Only one answer should be visible at a time (clicking a new question closes the previous one)
- Add `fly` with a small y-offset to the question list itself so items animate when the page loads

## Key Takeaways

- Svelte has built-in transitions — import from `svelte/transition` with no extra packages
- `fade`, `fly`, `slide`, `blur`, and `scale` cover the most common animation patterns
- Pass parameters as an object: `transition:fly={{ y: 20, duration: 300 }}`
- Use `in:` and `out:` for different animations on enter versus exit
- Control timing with `duration`, `delay`, and `easing` (from `svelte/easing`)
- Add `|global` when transitions should play even if a parent block controls visibility
- Transitions work automatically on elements inside `{#if}` and `{#each}` blocks
