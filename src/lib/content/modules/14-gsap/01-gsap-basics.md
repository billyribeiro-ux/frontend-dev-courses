# GSAP Basics

**GSAP** (GreenSock Animation Platform) is the most powerful animation library on the web. While CSS transitions handle simple hover effects and fades, GSAP gives you fine-grained control over complex, sequenced, and physics-based animations. It can animate any CSS property, SVG attribute, or JavaScript value with silky-smooth 60fps performance.

In this lesson, you will learn GSAP's architecture, the three core methods, easing functions in depth, stagger animations, proper lifecycle management in Svelte components with `$effect`, cleanup patterns, how GSAP interacts with Svelte's reactivity system, and GPU-accelerated performance strategies. We will build a complete animated hero section by the end.

## GSAP Architecture

Before writing animation code, understand how GSAP works under the hood. This mental model will help you debug timing issues and write performant animations.

### The Tween Engine

GSAP's core unit is the **tween** — an object that interpolates one or more property values over time. When you call `gsap.to(element, { x: 200, duration: 1 })`, GSAP creates a tween that:

1. Records the element's current `x` value (the start value)
2. Sets the target value (`200`)
3. On every animation frame (~60 times per second), calculates the intermediate value using the easing function and applies it to the element

GSAP uses `requestAnimationFrame` internally, which means animations are synchronized with the browser's repaint cycle. This prevents jank that can occur with `setTimeout`-based animation.

### The Timeline

A **timeline** is a container for tweens. It lets you sequence, overlap, and control multiple animations as a single unit:

```javascript
const tl = gsap.timeline();
tl.to(heading, { opacity: 1, y: 0, duration: 0.6 })
  .to(paragraph, { opacity: 1, y: 0, duration: 0.6 }, "-=0.3")  // Overlap by 0.3s
  .to(button, { opacity: 1, y: 0, duration: 0.4 });
```

Timelines give you `play()`, `pause()`, `reverse()`, `restart()`, `progress()`, and `timeScale()` methods. You can scrub through a timeline, speed it up, or reverse it at any point.

### The Plugin System

GSAP's plugin system extends its capabilities. Plugins are registered once and then available everywhere:

- **ScrollTrigger** — trigger animations on scroll (next lesson)
- **Draggable** — make elements draggable with physics
- **MorphSVG** — morph between SVG shapes
- **SplitText** — split text into characters/words/lines for individual animation
- **Flip** — animate layout changes (position, size)
- **MotionPath** — animate along a path

Core plugins (ScrollTrigger, Draggable) are free. Premium plugins require a GreenSock membership.

## Installing GSAP

Add GSAP to your SvelteKit project:

```bash
npm install gsap
```

Import it in any component:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
</script>
```

## The Core Methods

GSAP has three primary animation methods. Every animation you create will use one of these.

### gsap.to() — Animate TO a state

Animates an element from its current state to the values you specify. This is the most common method:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let box: HTMLDivElement;

  function animate() {
    gsap.to(box, {
      x: 200,           // translateX to 200px
      rotation: 360,     // rotate 360 degrees
      borderRadius: '50%',
      backgroundColor: '#6c5ce7',
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

If you call `gsap.to()` multiple times on the same element, each new tween starts from the element's *current* state — not the original state. This means animations compound naturally.

### gsap.from() — Animate FROM a state

Animates from the values you specify back to the element's current (natural) state. This is the go-to method for entrance animations:

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

The element starts at `{ y: 50, opacity: 0 }` and animates to its natural CSS state (position 0, opacity 1). This is why `gsap.from()` is so convenient — you only define the "before" state.

One subtlety: `gsap.from()` immediately sets the element to the "from" values, then animates back. This means there is a brief flash if the element renders before the animation starts. To avoid this, set the element's initial state in CSS to match the "from" values, or use `gsap.fromTo()`.

### gsap.fromTo() — Animate between two explicit states

Defines both the starting and ending values. Use this when you need full control over both states:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let card: HTMLDivElement;

  function animateCard() {
    gsap.fromTo(card,
      { scale: 0.8, opacity: 0, y: 20 },          // FROM these values
      { scale: 1, opacity: 1, y: 0, duration: 0.6, ease: 'back.out(1.7)' }  // TO these values
    );
  }
</script>

<div bind:this={card} class="card">
  <h3>Featured</h3>
  <p>This card animates in with a bounce.</p>
</div>
<button onclick={animateCard}>Show Card</button>
```

`gsap.fromTo()` is deterministic — it always produces the same animation regardless of the element's current state. This makes it ideal for repeatable animations (toggles, re-entrances, loading states).

## Animatable Properties

GSAP can animate virtually any CSS property. Here is a complete reference organized by performance characteristics:

```javascript
gsap.to(element, {
  // ─── Transform properties (GPU-accelerated, best performance) ───
  x: 100,            // translateX in pixels
  y: 50,             // translateY in pixels
  xPercent: 50,      // translateX as percentage of element width
  yPercent: -50,     // translateY as percentage of element height
  rotation: 45,      // rotate in degrees
  rotationX: 45,     // 3D rotation on X axis
  rotationY: 45,     // 3D rotation on Y axis
  scale: 1.2,        // uniform scale
  scaleX: 1.5,       // horizontal scale
  scaleY: 0.8,       // vertical scale
  skewX: 10,         // skew on X axis
  skewY: 10,         // skew on Y axis
  transformOrigin: '50% 50%',  // pivot point

  // ─── Visual properties (GPU-composited for opacity) ───
  opacity: 0.5,
  borderRadius: '50%',
  backgroundColor: '#6c5ce7',
  color: '#ffffff',
  boxShadow: '0 10px 30px rgba(0,0,0,0.2)',

  // ─── Layout properties (trigger reflow — use sparingly) ───
  width: 200,
  height: 150,
  padding: 20,
  margin: 10,
  top: 50,
  left: 100,

  // ─── SVG properties ───
  attr: {            // animate SVG attributes
    cx: 100,
    r: 50,
    fill: '#ff3e00'
  },

  // ─── Timing ───
  duration: 1,       // seconds (not milliseconds)
  delay: 0.5,        // seconds before start
  ease: 'power2.out', // easing curve
  repeat: 2,         // repeat 2 additional times (3 total)
  repeatDelay: 0.5,  // pause between repeats
  yoyo: true,        // reverse on alternate repeats

  // ─── Callbacks ───
  onStart: () => console.log('Animation started'),
  onComplete: () => console.log('Animation finished'),
  onUpdate: () => console.log('Frame updated'),
  onRepeat: () => console.log('Repeat cycle')
});
```

### Performance hierarchy

Prefer properties in this order (fastest to slowest):

1. **Transforms** (`x`, `y`, `scale`, `rotation`) — GPU-composited, no layout recalculation
2. **Opacity** — GPU-composited
3. **Colors/shadows** — repaint only, no layout recalculation
4. **Width/height/margin/padding** — triggers full layout reflow, avoid animating these

## Easing Functions Deep Dive

Easing controls the acceleration curve of your animation. The choice of easing is the difference between animation that feels mechanical and animation that feels natural.

### The mental model

Think of easing as throwing a ball:
- **ease-out** — the ball decelerates (most natural for entrances)
- **ease-in** — the ball accelerates (most natural for exits)
- **ease-in-out** — accelerates then decelerates (good for transitions between states)

### Power eases (most common)

Power eases come in strengths. Higher power = more dramatic curve:

```javascript
ease: 'power1.out'   // Gentle — like linear with slight deceleration
ease: 'power2.out'   // Medium — good default for most animations
ease: 'power3.out'   // Strong — dramatic deceleration
ease: 'power4.out'   // Very strong — near-instant start, long ease out
```

`power2.out` is the best default. Use it unless you have a specific reason to choose something else.

### Special eases

```javascript
// Back — overshoots the target then comes back
ease: 'back.out(1.7)'     // 1.7 is the overshoot amount (default)
ease: 'back.out(3)'       // More dramatic overshoot
ease: 'back.inOut(1.7)'   // Overshoot on both ends

// Elastic — spring-like oscillation
ease: 'elastic.out(1, 0.3)'   // amplitude, period
ease: 'elastic.out(1, 0.5)'   // Less oscillation
ease: 'elastic.out(0.5, 0.3)' // Gentler spring

// Bounce — like a ball bouncing
ease: 'bounce.out'    // Bounces at the end
ease: 'bounce.in'     // Bounces at the start (rarely used)

// Stepped — discrete steps (like a clock hand)
ease: 'steps(5)'      // 5 discrete steps

// None — linear (constant speed)
ease: 'none'           // Used for scrub animations and progress bars
```

### Choosing the right ease

| Animation type | Recommended ease |
|---|---|
| Element entering view | `power2.out` or `power3.out` |
| Element exiting view | `power2.in` |
| Modal opening | `back.out(1.7)` |
| Button press feedback | `power2.out`, short duration |
| Scroll-linked animation | `none` (linear) |
| Playful micro-interaction | `elastic.out(1, 0.3)` |
| Notification badge | `back.out(2)` |
| Loading progress bar | `none` |

## Stagger Animations

Stagger adds a delay between each element in an array, creating a cascade effect. This is one of GSAP's most visually impactful features:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let items: HTMLDivElement[] = [];

  onMount(() => {
    gsap.from(items, {
      y: 30,
      opacity: 0,
      duration: 0.5,
      stagger: 0.1,        // 0.1s delay between each item
      ease: 'power2.out'
    });
  });
</script>

{#each ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5'] as item, i}
  <div bind:this={items[i]} class="item">{item}</div>
{/each}
```

### Advanced stagger options

```javascript
gsap.from(items, {
  y: 30,
  opacity: 0,
  duration: 0.5,
  stagger: {
    each: 0.1,          // Time between each element
    from: 'center',     // Start from center, animate outward
    // from: 'start'    // First to last (default)
    // from: 'end'      // Last to first
    // from: 'edges'    // Both edges toward center
    // from: 'random'   // Random order
    ease: 'power2.in',  // Easing for the stagger timing itself
  }
});

// Grid stagger — for 2D layouts
gsap.from(gridItems, {
  scale: 0,
  opacity: 0,
  duration: 0.4,
  stagger: {
    each: 0.05,
    from: 'center',
    grid: [4, 3],      // 4 rows, 3 columns
    axis: 'both'       // Stagger on both axes
  }
});
```

## GSAP in Svelte Components: Lifecycle Management

This is the most important section of this lesson. Getting lifecycle management wrong causes memory leaks, stale animations, and bugs that only appear on navigation.

### Using $effect for animations

For one-time entrance animations, `onMount` is fine. But for animations that depend on reactive state or need proper cleanup, use `$effect`:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let box: HTMLDivElement;
  let expanded = $state(false);

  // This effect runs when 'expanded' changes
  $effect(() => {
    if (!box) return;

    gsap.to(box, {
      width: expanded ? 400 : 200,
      height: expanded ? 300 : 100,
      borderRadius: expanded ? 16 : 8,
      duration: 0.4,
      ease: 'power2.out'
    });
  });
</script>

<div bind:this={box} class="box"></div>
<button onclick={() => expanded = !expanded}>
  {expanded ? 'Collapse' : 'Expand'}
</button>
```

### Cleaning up animations on component destroy

Every GSAP animation must be killed when its component unmounts. If you do not do this, the tween continues running on a detached DOM element, causing memory leaks and console errors.

The pattern is to use `gsap.context()`:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let container: HTMLDivElement;

  onMount(() => {
    // gsap.context() collects all animations created inside it
    const ctx = gsap.context(() => {
      // All animations inside this callback are tracked by ctx
      gsap.from('.hero-title', {
        y: 50, opacity: 0, duration: 0.8, ease: 'power3.out'
      });

      gsap.from('.hero-subtitle', {
        y: 30, opacity: 0, duration: 0.6, delay: 0.3, ease: 'power2.out'
      });

      gsap.from('.hero-cta', {
        y: 20, opacity: 0, duration: 0.5, delay: 0.5, ease: 'power2.out'
      });
    }, container); // Scope to the container element

    // Return cleanup function — kills ALL animations in this context
    return () => ctx.revert();
  });
</script>

<div bind:this={container}>
  <h1 class="hero-title">Welcome</h1>
  <p class="hero-subtitle">Build something amazing</p>
  <button class="hero-cta">Get Started</button>
</div>
```

`gsap.context()` takes a scope element as the second argument. Inside the callback, CSS selectors (like `.hero-title`) are scoped to that element — they only match children of the container. This prevents one component's animations from accidentally targeting elements in another component.

`ctx.revert()` kills all animations AND resets elements to their pre-animation state. This is the cleanest cleanup possible.

### Combining $effect and gsap.context

For reactive animations with proper cleanup:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let container: HTMLDivElement;
  let activeTab = $state(0);

  $effect(() => {
    if (!container) return;

    const ctx = gsap.context(() => {
      // Animate the active tab content in
      gsap.fromTo('.tab-content',
        { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
      );
    }, container);

    // Cleanup runs when the effect re-runs (activeTab changes) or component unmounts
    return () => ctx.revert();
  });
</script>

<div bind:this={container}>
  <div class="tabs">
    {#each ['Tab 1', 'Tab 2', 'Tab 3'] as tab, i}
      <button onclick={() => activeTab = i} class:active={activeTab === i}>
        {tab}
      </button>
    {/each}
  </div>
  <div class="tab-content">
    Content for tab {activeTab + 1}
  </div>
</div>
```

## GSAP + Svelte Reactivity

GSAP and Svelte's reactivity system can work together, but you need to understand the boundaries. GSAP mutates DOM properties directly (bypassing Svelte's reactivity). Svelte's `$state` tracks JavaScript values. They operate in parallel:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let progress = $state(0);
  let bar: HTMLDivElement;

  // Animate a DOM element based on reactive state
  $effect(() => {
    if (!bar) return;
    gsap.to(bar, {
      scaleX: progress / 100,
      duration: 0.4,
      ease: 'power2.out'
    });
  });

  // Animate a JavaScript value (not a DOM element)
  function animateCounter(target: number) {
    const obj = { value: progress };
    gsap.to(obj, {
      value: target,
      duration: 1,
      ease: 'power2.out',
      onUpdate: () => {
        progress = Math.round(obj.value);
      }
    });
  }
</script>

<div class="bar-track">
  <div bind:this={bar} class="bar-fill"></div>
</div>
<p>{progress}%</p>
<button onclick={() => animateCounter(100)}>Complete</button>
```

The `onUpdate` callback bridges GSAP's animation engine with Svelte's reactive state. Each frame, GSAP updates `obj.value`, and the callback sets `progress`, which triggers Svelte to update the `{progress}%` text.

## Performance: will-change and GPU Acceleration

GSAP automatically uses CSS transforms for `x`, `y`, `scale`, and `rotation`, which are GPU-accelerated. But there are additional optimizations:

### will-change

The CSS `will-change` property hints to the browser that an element will be animated, allowing it to pre-allocate GPU layers:

```css
.animated-element {
  will-change: transform, opacity;
}
```

Use it sparingly — each `will-change` element gets its own GPU layer, which consumes memory. Only apply it to elements that will actually animate, and remove it after animation:

```javascript
gsap.to(element, {
  x: 200,
  duration: 1,
  onStart: () => { element.style.willChange = 'transform'; },
  onComplete: () => { element.style.willChange = 'auto'; }
});
```

### Force3D

GSAP's `force3D` property forces the browser to use 3D transforms (which always get GPU acceleration) even for 2D animations:

```javascript
gsap.to(element, {
  x: 200,
  force3D: true,  // Adds translateZ(0) for GPU acceleration — this is the default
  duration: 1
});

// At the end of the animation, reset to 2D to free GPU memory
gsap.to(element, {
  x: 200,
  force3D: 'auto',  // Uses 3D during animation, resets to 2D when done
  duration: 1
});
```

`force3D: 'auto'` is the default in GSAP — it promotes to a GPU layer during animation and releases it afterward. This is the right choice for most animations.

### Avoiding layout thrashing

Never animate properties that trigger layout recalculation (`width`, `height`, `top`, `left`, `margin`, `padding`). Instead, use transforms:

```javascript
// Bad — triggers layout on every frame
gsap.to(element, { left: 200, top: 100 });

// Good — GPU-composited, no layout recalculation
gsap.to(element, { x: 200, y: 100 });

// Bad — triggers layout
gsap.to(element, { width: 400 });

// Good — visual-only scale change
gsap.to(element, { scaleX: 2 });
```

## Timelines: Sequencing Multiple Animations

Timelines let you orchestrate complex sequences with precise timing control:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let container: HTMLDivElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' }  // Default ease for all tweens
      });

      tl.from('.hero-badge', { y: -20, opacity: 0, duration: 0.4 })
        .from('.hero-title', { y: 40, opacity: 0, duration: 0.6 }, '-=0.1')
        .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.5 }, '-=0.3')
        .from('.hero-buttons', { y: 20, opacity: 0, duration: 0.4 }, '-=0.2')
        .from('.hero-image', { scale: 0.9, opacity: 0, duration: 0.8 }, '-=0.3');

      // Position parameter explained:
      // '-=0.3'  — start 0.3s before the previous tween ends (overlap)
      // '+=0.5'  — start 0.5s after the previous tween ends (gap)
      // 1.5      — start at absolute time 1.5s on the timeline
      // '<'      — start at the same time as the previous tween
      // '<0.2'   — start 0.2s after the previous tween starts

    }, container);

    return () => ctx.revert();
  });
</script>

<div bind:this={container}>
  <span class="hero-badge">New</span>
  <h1 class="hero-title">Build Faster</h1>
  <p class="hero-subtitle">The modern web development framework</p>
  <div class="hero-buttons">
    <button>Get Started</button>
    <button>Learn More</button>
  </div>
  <img class="hero-image" src="/hero.png" alt="Hero" />
</div>
```

### Timeline control methods

```typescript
const tl = gsap.timeline({ paused: true });
// ... add tweens ...

tl.play();           // Start playing
tl.pause();          // Pause at current position
tl.reverse();        // Play backwards
tl.restart();        // Go to start and play
tl.progress(0.5);   // Jump to 50% through
tl.timeScale(2);    // Play at 2x speed
tl.kill();          // Destroy the timeline
```

## Complete Animated Hero Section

Here is a production-quality animated hero section combining everything from this lesson:

```svelte
<!-- src/lib/components/AnimatedHero.svelte -->
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let container: HTMLDivElement;
  let timeline: gsap.core.Timeline;

  onMount(() => {
    const ctx = gsap.context(() => {
      timeline = gsap.timeline({
        defaults: {
          ease: 'power3.out',
          duration: 0.7
        }
      });

      // Badge slides down and fades in
      timeline.fromTo('.hero-badge',
        { y: -20, opacity: 0, scale: 0.9 },
        { y: 0, opacity: 1, scale: 1, duration: 0.5 }
      );

      // Title characters stagger in
      timeline.fromTo('.hero-title',
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8 },
        '-=0.2'
      );

      // Subtitle fades in
      timeline.fromTo('.hero-subtitle',
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 },
        '-=0.4'
      );

      // Buttons stagger in
      timeline.fromTo('.hero-btn',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.15, duration: 0.5 },
        '-=0.3'
      );

      // Stats counter animate up
      timeline.fromTo('.stat-value',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.1, duration: 0.4 },
        '-=0.2'
      );

      // Floating decoration elements
      gsap.to('.float-element', {
        y: -15,
        duration: 3,
        ease: 'sine.inOut',
        repeat: -1,     // Infinite repeat
        yoyo: true,      // Reverse on alternate repeats
        stagger: {
          each: 0.5,
          from: 'random'
        }
      });

    }, container);

    return () => ctx.revert();
  });
</script>

<section bind:this={container} class="hero">
  <div class="hero-content">
    <span class="hero-badge">Now in Beta</span>
    <h1 class="hero-title">Build Beautiful Web Apps</h1>
    <p class="hero-subtitle">
      A modern framework for creating fast, accessible web applications
      with less boilerplate and more joy.
    </p>
    <div class="hero-buttons">
      <button class="hero-btn primary">Get Started Free</button>
      <button class="hero-btn secondary">View Demo</button>
    </div>
    <div class="hero-stats">
      <div class="stat">
        <span class="stat-value">10K+</span>
        <span class="stat-label">Developers</span>
      </div>
      <div class="stat">
        <span class="stat-value">50K+</span>
        <span class="stat-label">Projects</span>
      </div>
      <div class="stat">
        <span class="stat-value">99.9%</span>
        <span class="stat-label">Uptime</span>
      </div>
    </div>
  </div>

  <!-- Floating decoration elements -->
  <div class="float-element float-1" aria-hidden="true"></div>
  <div class="float-element float-2" aria-hidden="true"></div>
  <div class="float-element float-3" aria-hidden="true"></div>
</section>

<style>
  .hero {
    position: relative;
    min-height: 90vh;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    padding: 2rem;
  }

  .hero-content {
    text-align: center;
    max-width: 800px;
    position: relative;
    z-index: 1;
  }

  .hero-badge {
    display: inline-block;
    padding: 0.375rem 1rem;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.15);
    color: #818cf8;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid rgba(99, 102, 241, 0.3);
  }

  .hero-title {
    font-size: clamp(2rem, 5vw, 3.75rem);
    font-weight: 800;
    color: white;
    margin: 1.5rem 0 1rem;
    line-height: 1.1;
  }

  .hero-subtitle {
    font-size: 1.125rem;
    color: #94a3b8;
    max-width: 600px;
    margin: 0 auto 2rem;
    line-height: 1.7;
  }

  .hero-buttons {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
    margin-bottom: 3rem;
  }

  .hero-btn {
    padding: 0.75rem 2rem;
    border-radius: 0.75rem;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    border: none;
    transition: transform 0.15s ease;
  }

  .hero-btn:hover {
    transform: translateY(-2px);
  }

  .hero-btn.primary {
    background: #6366f1;
    color: white;
  }

  .hero-btn.secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .hero-stats {
    display: flex;
    gap: 3rem;
    justify-content: center;
  }

  .stat-value {
    display: block;
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #64748b;
  }

  .float-element {
    position: absolute;
    border-radius: 50%;
    opacity: 0.1;
    background: #6366f1;
  }

  .float-1 { width: 200px; height: 200px; top: 10%; left: 5%; }
  .float-2 { width: 150px; height: 150px; bottom: 15%; right: 10%; }
  .float-3 { width: 100px; height: 100px; top: 40%; right: 5%; }
</style>
```

## Try It

1. Create a hero section with a heading, a paragraph, and two buttons. Use `gsap.timeline()` to animate each element in with staggered timing. The badge should slide down, the title should slide up, the subtitle should fade in, and the buttons should stagger in from left to right. Use `gsap.context()` for cleanup.

2. Build an animated card grid. When the page loads, cards should stagger in from the bottom using `gsap.from()` with `stagger: { each: 0.08, from: 'start' }`. Add a button that re-triggers the animation using `timeline.restart()`.

3. Create a counter component that animates from 0 to a target number using `gsap.to()` on a JavaScript object with an `onUpdate` callback that writes to a `$state` variable. Use `ease: 'power2.out'` for a satisfying deceleration.

4. Experiment with easing: create a row of boxes. Animate all of them to `x: 300` simultaneously, but give each one a different ease (`power1.out`, `power2.out`, `power3.out`, `back.out`, `elastic.out`, `bounce.out`). Observe how the same motion feels completely different with each ease.

## Key Takeaways

- GSAP's core unit is the **tween** — it interpolates property values over time using `requestAnimationFrame`
- `gsap.to()` animates to a target state, `gsap.from()` animates from a starting state, `gsap.fromTo()` defines both
- **Timelines** sequence multiple tweens with precise timing using position parameters (`-=0.3`, `+=0.5`, `<`)
- Use `bind:this` to get DOM element references for GSAP in Svelte
- **Always clean up**: use `gsap.context()` and return `ctx.revert()` from `onMount` or `$effect`
- `gsap.context()` scopes CSS selectors to a container element and kills all nested animations on revert
- Prefer transform properties (`x`, `y`, `scale`, `rotation`) for GPU-accelerated performance
- `duration` is in seconds (not milliseconds), `ease` controls the acceleration curve
- `power2.out` is the best default ease — use it unless you have a specific reason for something else
- `stagger` creates cascading animations across multiple elements — supports `from`, `grid`, and `ease` options
- Bridge GSAP and Svelte reactivity with `onUpdate` callbacks that write to `$state` variables
- Set `force3D: 'auto'` (the default) to use GPU acceleration during animation and release it afterward
