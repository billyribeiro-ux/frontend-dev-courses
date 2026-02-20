# ScrollTrigger

ScrollTrigger is a GSAP plugin that connects animations to scroll position. Instead of animating on page load or button click, you trigger animations when elements come into view. This creates engaging, narrative-driven web experiences where content reveals itself as the user scrolls.

ScrollTrigger handles all the complexity of scroll detection, intersection observation, and performance optimization. You tell it what to animate and when, and it handles the rest.

## Registering the Plugin

ScrollTrigger must be registered before use:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);
</script>
```

## Basic Scroll-Triggered Animation

Animate an element when it enters the viewport:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    gsap.from(section, {
      y: 60,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 80%',   // Animation starts when top of element hits 80% of viewport
        end: 'top 20%',     // Animation ends when top of element hits 20% of viewport
      }
    });
  });
</script>

<div style="height: 100vh; display: grid; place-items: center;">
  <h1>Scroll down</h1>
</div>

<section bind:this={section}>
  <h2>I animate when you scroll here</h2>
  <p>This content fades in from below.</p>
</section>
```

## Start and End Markers

The `start` and `end` properties define when the animation triggers. The format is `"element-position viewport-position"`:

```js
scrollTrigger: {
  trigger: element,
  start: 'top 80%',      // top of element reaches 80% of viewport height
  end: 'bottom 20%',     // bottom of element reaches 20% of viewport height
}
```

Common start/end values:

```js
start: 'top center'      // top of element hits center of viewport
start: 'top 80%'         // top of element hits 80% down from viewport top
start: 'top bottom'      // top of element enters viewport
end: 'bottom top'        // bottom of element leaves viewport
end: '+=500'             // 500px after the start position
```

During development, add `markers: true` to visualize the trigger points:

```js
scrollTrigger: {
  trigger: section,
  start: 'top 80%',
  end: 'top 20%',
  markers: true   // Remove in production!
}
```

## Scrub Animations

Scrub links the animation progress directly to the scroll position. Instead of playing once, the animation moves forward and backward as the user scrolls:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let progressBar: HTMLDivElement;

  onMount(() => {
    gsap.to(progressBar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true       // Ties animation to scroll position
      }
    });
  });
</script>

<div class="progress-container">
  <div bind:this={progressBar} class="progress-bar"></div>
</div>

<style>
  .progress-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 4px;
    z-index: 100;
  }
  .progress-bar {
    height: 100%;
    background: #ff3e00;
    transform-origin: left;
    transform: scaleX(0);
  }
</style>
```

`scrub: true` makes the animation perfectly follow scroll position. You can also use `scrub: 0.5` for a smooth 0.5-second lag behind the scroll.

## Pinning Sections

Pinning locks an element in place while the user scrolls past it. This is used for full-screen takeover sections:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let pinnedSection: HTMLElement;

  onMount(() => {
    ScrollTrigger.create({
      trigger: pinnedSection,
      start: 'top top',
      end: '+=600',      // Stay pinned for 600px of scrolling
      pin: true
    });
  });
</script>

<section bind:this={pinnedSection} class="pinned">
  <h2>This section stays pinned while you scroll</h2>
</section>

<style>
  .pinned {
    height: 100vh;
    display: grid;
    place-items: center;
    background: #1a1a2e;
    color: white;
  }
</style>
```

## Try It

Build a long-scrolling page with at least three sections. Animate each section in using `gsap.from()` with `scrollTrigger`. Add a fixed progress bar that uses `scrub` to fill as the user scrolls. Enable `markers: true` to visualize your trigger points, then remove them when you are happy with the timing.

## Key Takeaways

- **ScrollTrigger** connects GSAP animations to scroll position
- Register the plugin with `gsap.registerPlugin(ScrollTrigger)` before use
- `start` and `end` define when animations trigger using `"element viewport"` format
- Use `markers: true` during development to visualize trigger points
- `scrub: true` links animation progress directly to scroll position
- `pin: true` locks an element in place during a scroll range
