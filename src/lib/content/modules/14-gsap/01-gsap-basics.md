# GSAP Basics

**GSAP** (GreenSock Animation Platform) is the most powerful animation library on the web. While CSS transitions handle simple hover effects and fades, GSAP gives you fine-grained control over complex, sequenced, and physics-based animations. It can animate any CSS property, SVG attribute, or JavaScript value with silky-smooth 60fps performance.

In this lesson, you will learn the three core GSAP methods — `gsap.to()`, `gsap.from()`, and `gsap.fromTo()` — and how to target DOM elements in SvelteKit components using `bind:this`.

## Installing GSAP

Add GSAP to your SvelteKit project:

```bash
npm install gsap
```

## The Core Methods

GSAP has three primary animation methods:

### gsap.to() — Animate TO a state

Animates an element from its current state to the values you specify:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let box: HTMLDivElement;

  function animate() {
    gsap.to(box, {
      x: 200,
      rotation: 360,
      duration: 1,
      ease: 'power2.out'
    });
  }
</script>

<div bind:this={box} class="box">Move me</div>
<button onclick={animate}>Animate</button>

<style>
  .box {
    width: 100px;
    height: 100px;
    background: #ff3e00;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
  }
</style>
```

### gsap.from() — Animate FROM a state

Animates from the values you specify back to the element's current state. Great for entrance animations. We use `onMount` here because this is a one-time animation that should run once when the page loads. For animations that react to changing state, use `$effect()` — covered in lesson 3.

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let heading: HTMLHeadingElement;

  onMount(() => {
    gsap.from(heading, {
      y: 50,
      opacity: 0,
      duration: 0.8,
      ease: 'power3.out'
    });
  });
</script>

<h1 bind:this={heading}>Welcome to My Site</h1>
```

### gsap.fromTo() — Animate between two states

Defines both the starting and ending values explicitly:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let card: HTMLDivElement;

  function animateCard() {
    gsap.fromTo(card,
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: 'back.out(1.7)' }
    );
  }
</script>

<div bind:this={card} class="card">
  <h3>Featured</h3>
  <p>This card animates in with a bounce.</p>
</div>
<button onclick={animateCard}>Show Card</button>
```

## Animatable Properties

GSAP can animate virtually any CSS property. Here are the most common:

```js
gsap.to(element, {
  // Transform properties (GPU-accelerated, best performance)
  x: 100,           // translateX
  y: 50,            // translateY
  rotation: 45,     // rotate in degrees
  scale: 1.2,       // uniform scale
  scaleX: 1.5,      // horizontal scale
  scaleY: 0.8,      // vertical scale

  // Visual properties
  opacity: 0.5,
  borderRadius: '50%',
  backgroundColor: '#6c5ce7',

  // Layout properties (triggers reflow — use sparingly)
  width: 200,
  height: 150,

  // Timing
  duration: 1,       // seconds
  delay: 0.5,        // seconds before start
  ease: 'power2.out' // easing curve
});
```

## Easing Functions

Easing controls the acceleration curve of your animation. GSAP includes many built-in eases:

```js
// Smooth deceleration (best for entrances)
ease: 'power2.out'

// Smooth acceleration (best for exits)
ease: 'power2.in'

// Acceleration then deceleration
ease: 'power2.inOut'

// Bouncy overshoot
ease: 'back.out(1.7)'

// Elastic spring
ease: 'elastic.out(1, 0.3)'

// Bounce at the end
ease: 'bounce.out'
```

## Targeting Elements with bind:this

In SvelteKit, use `bind:this` to get a reference to a DOM element for GSAP:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let items: HTMLDivElement[] = [];

  function animateAll() {
    gsap.from(items, {
      y: 30,
      opacity: 0,
      duration: 0.5,
      stagger: 0.1,    // 0.1s delay between each item
      ease: 'power2.out'
    });
  }
</script>

{#each ['Item 1', 'Item 2', 'Item 3'] as item, i}
  <div bind:this={items[i]}>{item}</div>
{/each}

<button onclick={animateAll}>Animate List</button>
```

The `stagger` property adds a delay between each element in an array, creating a cascade effect.

## Try It

Create a hero section with a heading, a paragraph, and a button. Use `gsap.from()` to animate each element in from below with staggered timing when the page loads. Experiment with different easing functions to find one you like.

## Key Takeaways

- `gsap.to()` animates to a target state, `gsap.from()` animates from a starting state
- `gsap.fromTo()` defines both start and end states explicitly
- Use `bind:this` to get DOM element references for GSAP in Svelte
- Prefer transform properties (`x`, `y`, `scale`, `rotation`) for best performance
- `duration` is in seconds, `ease` controls the acceleration curve
- `stagger` creates cascading animations across multiple elements
