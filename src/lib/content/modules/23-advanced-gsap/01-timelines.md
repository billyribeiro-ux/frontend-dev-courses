# GSAP Timelines

Individual `gsap.to()` and `gsap.from()` calls work well for single animations, but real interfaces need sequences — a heading slides in, then a subtitle fades up, then buttons appear one by one. **Timelines** let you chain animations together into a coordinated sequence with precise timing control.

A timeline is a container for multiple tweens. It plays them in order by default, and gives you methods to control the entire sequence as a single unit.

## Creating a Timeline

Use `gsap.timeline()` to create a new timeline:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  let container: HTMLElement;

  onMount(() => {
    const tl = gsap.timeline();

    tl.from('.hero-title', { y: 50, opacity: 0, duration: 0.8 })
      .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.6 })
      .from('.hero-button', { y: 20, opacity: 0, duration: 0.4 });
  });
</script>

<div bind:this={container}>
  <h1 class="hero-title">Welcome</h1>
  <p class="hero-subtitle">Build something amazing</p>
  <button class="hero-button">Get Started</button>
</div>
```

Each `.from()` call plays after the previous one finishes. The subtitle waits for the title, and the button waits for the subtitle.

## Position Parameters

Control when each animation starts relative to the others using the **position parameter** — the third argument:

```typescript
const tl = gsap.timeline();

// Starts at the beginning
tl.from('.title', { y: 50, opacity: 0, duration: 0.8 })
  // Starts 0.2 seconds before the previous animation ends
  .from('.subtitle', { y: 30, opacity: 0, duration: 0.6 }, '-=0.2')
  // Starts 0.1 seconds after the previous animation ends
  .from('.button', { y: 20, opacity: 0, duration: 0.4 }, '+=0.1')
  // Starts at exactly 0.5 seconds into the timeline
  .from('.badge', { scale: 0, duration: 0.3 }, 0.5);
```

- `"-=0.2"` — overlap with the previous animation by 0.2 seconds
- `"+=0.1"` — add a 0.1 second gap after the previous animation
- `0.5` — start at an absolute time of 0.5 seconds

## Labels

Labels mark positions in the timeline that you can reference by name:

```typescript
const tl = gsap.timeline();

tl.from('.header', { y: -100, duration: 0.5 })
  .addLabel('headerDone')
  .from('.sidebar', { x: -200, duration: 0.5 }, 'headerDone')
  .from('.content', { opacity: 0, duration: 0.5 }, 'headerDone')
  .addLabel('layoutReady')
  .from('.footer', { y: 50, opacity: 0, duration: 0.3 }, 'layoutReady');
```

Both `.sidebar` and `.content` start at the "headerDone" label, so they animate simultaneously after the header finishes.

## Playback Control

Timelines provide methods to control playback:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  let tl: gsap.core.Timeline;

  onMount(() => {
    tl = gsap.timeline({ paused: true });

    tl.from('.card', { y: 100, opacity: 0, duration: 0.5, stagger: 0.1 })
      .from('.cta', { scale: 0.8, opacity: 0, duration: 0.3 });
  });

  function play() { tl.play(); }
  function pause() { tl.pause(); }
  function reverse() { tl.reverse(); }
  function restart() { tl.restart(); }
</script>

<button onclick={play}>Play</button>
<button onclick={pause}>Pause</button>
<button onclick={reverse}>Reverse</button>
<button onclick={restart}>Restart</button>
```

Create the timeline with `{ paused: true }` so it waits for a trigger instead of playing immediately.

## Timeline Defaults

Set default properties that apply to every tween in the timeline:

```typescript
const tl = gsap.timeline({
  defaults: {
    duration: 0.6,
    ease: 'power2.out',
    opacity: 0
  }
});

// These tweens inherit duration, ease, and opacity from defaults
tl.from('.title', { y: 50 })
  .from('.subtitle', { y: 30 })
  .from('.button', { y: 20, duration: 0.3 }); // Override duration for this one
```

Individual tweens can override any default value.

## Staggering in Timelines

Animate multiple elements with a staggered delay:

```typescript
const tl = gsap.timeline();

tl.from('.nav-link', {
  y: -20,
  opacity: 0,
  duration: 0.4,
  stagger: 0.1  // Each link starts 0.1s after the previous
})
.from('.card', {
  y: 50,
  opacity: 0,
  duration: 0.5,
  stagger: {
    each: 0.15,
    from: 'center'  // Animate from the center outward
  }
});
```

## Try It

Create an animated landing page sequence: first the navbar slides down, then the hero title types in from the left, then the subtitle fades up (overlapping slightly with the title), and finally three feature cards stagger in from below. Add play/pause/restart controls. Use labels to mark the "hero complete" point and trigger the cards from that label.

## Respecting Motion Preferences

Always check the user's motion preference before running complex timeline animations:

```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const tl = gsap.timeline();
  tl.from('.title', { y: 50, opacity: 0, duration: 0.8 })
    .from('.subtitle', { y: 30, opacity: 0, duration: 0.6 });
}
```

This is an accessibility requirement — not optional. Many users rely on reduced motion settings.

> **Tip:** In Svelte 5.7+, you can use `prefersReducedMotion` from `svelte/motion` instead of the manual `window.matchMedia` call. It is a reactive boolean that updates automatically if the user changes their OS setting mid-session, and it avoids SSR issues since it is handled by the framework.

## Key Takeaways

- `gsap.timeline()` creates a sequence container for multiple animations
- Tweens play in order by default — each waits for the previous to finish
- Position parameters (`"-=0.2"`, `"+=0.1"`, absolute time) control overlap and gaps
- Labels mark named positions for precise choreography
- Playback methods (`.play()`, `.pause()`, `.reverse()`, `.restart()`) control the entire sequence
- Timeline defaults reduce repetition across tweens
