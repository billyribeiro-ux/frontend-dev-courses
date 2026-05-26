# GSAP in Svelte

Using GSAP in a SvelteKit application requires understanding component lifecycle, reactivity boundaries, and cleanup semantics at a deep level. Animations that are not properly cleaned up cause memory leaks. Animations that start before the DOM is ready fail silently. Animations that re-run on every reactive change instead of only when intended create janky, flickering experiences. And animations that ignore accessibility preferences make your application unusable for people with vestibular disorders.

This lesson teaches the production patterns for integrating GSAP with Svelte 5. You will learn when to use `$effect()` versus `onMount()`, how `gsap.context()` works as a scope manager, how to lazy-load GSAP to keep your bundle small, how to build reusable animation components, and the critical patterns for respecting user preferences and avoiding common pitfalls.

## The Mental Model: GSAP Needs the DOM, Svelte Controls the DOM

The fundamental tension between GSAP and Svelte is that GSAP operates on real DOM elements, but Svelte controls when those elements exist. In vanilla JavaScript, you create an element, add it to the page, and animate it -- the element exists the entire time. In Svelte, elements appear and disappear based on reactive state (`{#if}`, `{#each}`, component mounting and unmounting). If you try to animate an element that Svelte has not yet created, GSAP gets `null` and fails silently. If you animate an element that Svelte then removes, the animation keeps running on a detached node, leaking memory.

The solution is to tie GSAP's lifecycle to Svelte's lifecycle:

- **Mount** -- Start animations (the DOM element exists)
- **Update** -- Restart or adjust animations (reactive state changed)
- **Unmount** -- Kill all animations (the DOM element is being removed)

Svelte 5 gives you two tools for this: `$effect()` and `onMount()`. Understanding when to use each is the first skill you need.

## Using $effect() for Reactive Animations

In Svelte 5, `$effect()` runs after the component mounts and re-runs whenever its reactive dependencies change. This makes it ideal for animations that respond to state changes:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let isVisible = $state(false);
  let card: HTMLDivElement;

  $effect(() => {
    // This effect tracks 'isVisible' automatically.
    // It runs once on mount, then re-runs every time isVisible changes.
    if (isVisible) {
      gsap.fromTo(card,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }
      );
    } else {
      gsap.to(card, { y: -30, opacity: 0, duration: 0.4 });
    }
  });
</script>

<button onclick={() => isVisible = !isVisible}>
  Toggle Card
</button>

<div bind:this={card} class="card">
  <h3>Animated Card</h3>
  <p>I animate in and out smoothly.</p>
</div>
```

### How Dependency Tracking Works

Svelte's `$effect()` automatically detects which reactive values you read inside the callback. In the example above, it tracks `isVisible` because you read it in the `if` statement. When `isVisible` changes, the entire effect re-runs.

This is different from React's `useEffect`, where you must manually specify dependencies in an array. In Svelte 5, dependencies are detected at runtime. This is more convenient but requires discipline -- if you accidentally read a reactive value you do not intend to track, the effect will re-run when that value changes.

### WRONG: Reading Unrelated Reactive State Inside an Animation Effect

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let isVisible = $state(false);
  let theme = $state('light');  // Unrelated state
  let card: HTMLDivElement;

  // WRONG -- this effect also tracks 'theme' because it reads it
  $effect(() => {
    console.log('Current theme:', theme);  // Accidental dependency!

    if (isVisible) {
      gsap.fromTo(card,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 }
      );
    }
  });
</script>
```

Every time `theme` changes, this effect re-runs and replays the animation, even though the theme has nothing to do with the card visibility. Keep animation effects focused -- only read the state that should trigger re-animation.

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let isVisible = $state(false);
  let theme = $state('light');
  let card: HTMLDivElement;

  // CORRECT -- separate effects for separate concerns
  $effect(() => {
    if (isVisible) {
      gsap.fromTo(card,
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6 }
      );
    } else {
      gsap.to(card, { y: -30, opacity: 0, duration: 0.4 });
    }
  });

  $effect(() => {
    // Theme handling is a separate concern
    document.documentElement.dataset.theme = theme;
  });
</script>
```

## Cleaning Up Animations: Why It Matters

When a component is destroyed (the user navigates to another page, or a conditional block hides the component), all active GSAP animations on that component's elements must be killed. If they are not:

1. **Memory leak**: The animation holds a reference to the DOM element, preventing garbage collection. Over multiple navigations, memory usage climbs steadily.
2. **Ghost animations**: The animation's tick callback continues to fire, trying to update an element that no longer exists in the document. This wastes CPU and can cause console errors.
3. **ScrollTrigger orphans**: If you used ScrollTrigger, the scroll listener remains active, watching for scroll events on a trigger element that was removed. This is especially expensive because scroll events fire at 60+ FPS.

### The gsap.context() Pattern

`gsap.context()` is GSAP's built-in scope manager. It tracks every animation and ScrollTrigger created inside its callback, and provides a single `revert()` method that kills them all at once:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  $effect(() => {
    // Create a GSAP context scoped to the section element
    const ctx = gsap.context(() => {
      // All animations and ScrollTriggers created here are tracked
      gsap.from('.animate-item', {
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.15,
        scrollTrigger: {
          trigger: section,
          start: 'top 75%'
        }
      });
    }, section);  // Second argument scopes selector strings to this element

    // Cleanup: kill everything when the effect is cleaned up
    return () => {
      ctx.revert();
    };
  });
</script>

<section bind:this={section}>
  <div class="animate-item">Item 1</div>
  <div class="animate-item">Item 2</div>
  <div class="animate-item">Item 3</div>
</section>
```

The second argument to `gsap.context()` is the scope element. When you use CSS selectors like `'.animate-item'` inside the context, GSAP only selects elements that are descendants of that scope element. This prevents your animation from accidentally targeting elements in other components that happen to have the same class name.

### WRONG: Animating Without Context or Cleanup

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  // WRONG -- no gsap.context(), no cleanup
  $effect(() => {
    gsap.from('.animate-item', {
      y: 40,
      opacity: 0,
      scrollTrigger: {
        trigger: section,
        start: 'top 75%'
      }
    });
    // No return function -- nothing is cleaned up on unmount
  });
</script>
```

This has three problems: (1) no cleanup, so animations and ScrollTriggers leak, (2) no scope, so `.animate-item` selects globally across the entire page, and (3) every time the effect re-runs, new animations stack on top of old ones without killing the previous batch.

### WRONG: Manually Killing Individual Tweens

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let section: HTMLElement;
  let tween1: gsap.core.Tween;
  let tween2: gsap.core.Tween;
  let tween3: gsap.core.Tween;

  // WRONG -- manually tracking every tween is error-prone
  $effect(() => {
    tween1 = gsap.from('.item-1', { y: 40, opacity: 0 });
    tween2 = gsap.from('.item-2', { y: 40, opacity: 0, delay: 0.1 });
    tween3 = gsap.from('.item-3', { y: 40, opacity: 0, delay: 0.2 });

    return () => {
      tween1.kill();
      tween2.kill();
      tween3.kill();
    };
  });
</script>
```

This works for three tweens, but in a real component you might have a timeline with ten steps, five ScrollTriggers, and nested animations. Tracking each one manually is fragile -- if you add a new animation and forget to kill it, you have a leak. `gsap.context()` tracks everything automatically.

## onMount vs $effect: Choosing the Right Lifecycle Hook

Both `onMount()` and `$effect()` wait for the DOM before running, but they serve fundamentally different purposes:

| | `onMount()` | `$effect()` |
|---|---|---|
| **Runs** | Once, when the component mounts | On mount, and again when dependencies change |
| **Re-runs** | Never | Whenever tracked reactive state changes |
| **Use for** | One-time setup animations | State-driven animations |
| **Cleanup** | Return function runs on unmount | Return function runs on re-run AND unmount |

### onMount for One-Time Entrance Animations

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let hero: HTMLElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      // These run once when the page loads -- a page entrance sequence
      gsap.from('.hero-title', {
        y: 40, opacity: 0, duration: 0.8
      });
      gsap.from('.hero-text', {
        y: 30, opacity: 0, duration: 0.8, delay: 0.2
      });
      gsap.from('.hero-button', {
        y: 20, opacity: 0, duration: 0.8, delay: 0.4
      });
    }, hero);

    return () => ctx.revert();
  });
</script>

<section bind:this={hero}>
  <h1 class="hero-title">Welcome</h1>
  <p class="hero-text">Build amazing things with SvelteKit.</p>
  <button class="hero-button">Get Started</button>
</section>
```

This entrance animation runs once and is done. Using `$effect()` here would be wasteful -- it would re-run the animation if any reactive state changed, causing the hero to re-animate unexpectedly.

### $effect for State-Driven Animations

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let activeTab = $state(0);
  let tabContent: HTMLElement;

  $effect(() => {
    // Re-animates every time the active tab changes
    const ctx = gsap.context(() => {
      gsap.fromTo(tabContent,
        { opacity: 0, x: activeTab > 0 ? 20 : -20 },
        { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
      );
    });

    return () => ctx.revert();
  });
</script>

<div class="tabs">
  {#each ['Overview', 'Features', 'Pricing'] as label, i}
    <button
      class:active={activeTab === i}
      onclick={() => activeTab = i}
    >
      {label}
    </button>
  {/each}
</div>

<div bind:this={tabContent}>
  {#if activeTab === 0}
    <p>Overview content</p>
  {:else if activeTab === 1}
    <p>Features content</p>
  {:else}
    <p>Pricing content</p>
  {/if}
</div>
```

Every time `activeTab` changes, the effect re-runs: the old animation is killed (via the cleanup return), and a new fade/slide animation plays for the new tab content.

### WRONG: Using $effect for One-Time Animations

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let hero: HTMLElement;
  let unrelatedCounter = $state(0);

  // WRONG -- this is a one-time animation, but $effect will re-run it
  // if unrelatedCounter is somehow read inside (or if refactored to include it)
  $effect(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-title', { y: 40, opacity: 0, duration: 0.8 });
    }, hero);

    return () => ctx.revert();
  });
</script>
```

If you later add a line inside this effect that reads `unrelatedCounter`, the entire entrance animation replays. `onMount()` is the correct choice because it guarantees single execution regardless of what reactive state exists in the component.

## Lazy-Loading GSAP

GSAP adds approximately 30KB (minified + gzipped) to your JavaScript bundle. For pages that do not use animations -- login forms, settings pages, documentation -- this is wasted bytes. Lazy-loading GSAP with dynamic `import()` ensures it is only downloaded when needed.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let section: HTMLElement;

  onMount(async () => {
    // These imports only execute when the component mounts.
    // The GSAP code is split into a separate chunk by Vite.
    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from('.fade-in', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        scrollTrigger: {
          trigger: section,
          start: 'top 80%'
        }
      });
    }, section);

    return () => ctx.revert();
  });
</script>

<section bind:this={section}>
  <div class="fade-in">Lazy loaded animation 1</div>
  <div class="fade-in">Lazy loaded animation 2</div>
  <div class="fade-in">Lazy loaded animation 3</div>
</section>
```

### How Vite Handles Dynamic Imports

When Vite encounters `await import('gsap')`, it creates a separate JavaScript chunk for GSAP and its dependencies. The chunk is only downloaded when the `import()` call executes. This means:

1. Your initial page load does not include GSAP
2. The first page that uses GSAP triggers a network request for the chunk
3. Subsequent pages reuse the cached chunk -- it is only downloaded once
4. If the user never visits an animated page, GSAP is never downloaded at all

### WRONG: Lazy-Loading Inside $effect

```svelte
<script lang="ts">
  let isVisible = $state(false);
  let card: HTMLDivElement;

  // WRONG -- async import inside $effect re-downloads on every state change
  $effect(() => {
    (async () => {
      const { gsap } = await import('gsap');

      if (isVisible) {
        gsap.to(card, { opacity: 1, y: 0, duration: 0.6 });
      } else {
        gsap.to(card, { opacity: 0, y: 30, duration: 0.4 });
      }
    })();
  });
</script>
```

While the browser caches the module after the first import, the `await` creates unnecessary microtask overhead on every re-run. More importantly, the animation timing becomes unpredictable -- the first run waits for the import, subsequent runs do not, leading to inconsistent behavior.

### CORRECT: Load Once, Animate Reactively

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let isVisible = $state(false);
  let card: HTMLDivElement;
  let gsapModule: typeof import('gsap') | null = null;

  // Load GSAP once on mount
  onMount(async () => {
    gsapModule = await import('gsap');
  });

  // Animate reactively using the loaded module
  $effect(() => {
    if (!gsapModule) return;
    const { gsap } = gsapModule;

    if (isVisible) {
      gsap.to(card, { opacity: 1, y: 0, duration: 0.6 });
    } else {
      gsap.to(card, { opacity: 0, y: 30, duration: 0.4 });
    }
  });
</script>
```

This pattern separates loading (one-time, in `onMount`) from animation (reactive, in `$effect`). The first render shows the initial state without animation; once GSAP loads, subsequent state changes animate smoothly.

## Respecting Motion Preferences

Some users experience motion sickness, seizures, or discomfort from animations. The `prefers-reduced-motion` media query lets them signal this preference through their operating system settings. Respecting this preference is not optional -- it is a professional requirement and an accessibility obligation.

### Using Svelte's Built-In MediaQuery

Svelte 5.7+ provides `MediaQuery` from `svelte/reactivity`, which gives you a reactive boolean that stays in sync if the user changes their OS setting while the page is open:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  let section: HTMLElement;

  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

  onMount(() => {
    if (reducedMotion.current) return;  // Skip animation entirely

    const ctx = gsap.context(() => {
      gsap.from('.element', { opacity: 0, y: 20, duration: 0.6 });
    }, section);

    return () => ctx.revert();
  });
</script>
```

### Reducing Instead of Removing

For some animations, removing them entirely would break the user experience -- a progress indicator that animates from 0% to 100%, for example, still needs to show the final state. In these cases, reduce the motion instead of eliminating it:

```typescript
function getAnimationConfig(reducedMotion: boolean) {
  if (reducedMotion) {
    return {
      duration: 0.01,  // Near-instant
      ease: 'none',
      stagger: 0       // No stagger delay
    };
  }

  return {
    duration: 0.6,
    ease: 'power2.out',
    stagger: 0.15
  };
}
```

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  let section: HTMLElement;
  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

  onMount(() => {
    const config = getAnimationConfig(reducedMotion.current);

    const ctx = gsap.context(() => {
      gsap.from('.card', {
        y: reducedMotion.current ? 0 : 40,
        opacity: 0,
        ...config
      });
    }, section);

    return () => ctx.revert();
  });
</script>
```

### WRONG: Using CSS to Override GSAP

```css
/* WRONG -- this fights with GSAP's inline styles */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

This CSS rule only affects CSS animations and transitions. GSAP sets inline styles directly on elements using JavaScript -- it does not use CSS animations. So this media query has zero effect on GSAP animations. You must check the preference in your JavaScript code and either skip the animation or use reduced-motion configuration.

## Building a Reusable FadeIn Component

A reusable wrapper component that animates any content as it enters the viewport is one of the most valuable patterns for GSAP in Svelte. It encapsulates the lazy-loading, cleanup, accessibility check, and ScrollTrigger setup in one place:

```svelte
<!-- src/lib/components/FadeIn.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  interface Props {
    children: Snippet;
    y?: number;
    x?: number;
    duration?: number;
    delay?: number;
    start?: string;
    staggerChildren?: number;
  }

  let {
    children,
    y = 30,
    x = 0,
    duration = 0.6,
    delay = 0,
    start = 'top 85%',
    staggerChildren = 0
  }: Props = $props();

  let wrapper: HTMLDivElement;
  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

  onMount(async () => {
    if (reducedMotion.current) return;

    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      const targets = staggerChildren > 0
        ? wrapper.children  // Animate each child separately
        : wrapper;          // Animate the wrapper as a whole

      gsap.from(targets, {
        y,
        x,
        opacity: 0,
        duration,
        delay,
        ease: 'power2.out',
        stagger: staggerChildren,
        scrollTrigger: {
          trigger: wrapper,
          start
        }
      });
    });

    return () => ctx.revert();
  });
</script>

<div bind:this={wrapper}>
  {@render children()}
</div>
```

### Using the FadeIn Component

```svelte
<script lang="ts">
  import FadeIn from '$lib/components/FadeIn.svelte';
</script>

<!-- Simple fade-up on scroll -->
<FadeIn>
  <h2>This heading fades in on scroll</h2>
</FadeIn>

<!-- Customized animation -->
<FadeIn y={50} delay={0.2} start="top 70%">
  <p>This paragraph has more distance, a delay, and triggers earlier.</p>
</FadeIn>

<!-- Staggered children -->
<FadeIn staggerChildren={0.1} y={20}>
  <div class="card">Card 1</div>
  <div class="card">Card 2</div>
  <div class="card">Card 3</div>
</FadeIn>

<!-- Slide from left -->
<FadeIn x={-40} y={0}>
  <aside>This sidebar slides in from the left.</aside>
</FadeIn>
```

This component gives you a declarative API for a fundamentally imperative operation. Developers who have never used GSAP can add scroll animations by wrapping their content in `<FadeIn>`.

### WRONG: Creating a New Component for Every Animation Type

```svelte
<!-- WRONG -- separate components for each direction -->
<!-- FadeUp.svelte, FadeDown.svelte, FadeLeft.svelte, FadeRight.svelte,
     FadeUpStagger.svelte, FadeLeftStagger.svelte ... -->
```

This approach creates a maintenance nightmare. Every change to the animation logic (updating GSAP, changing the easing, adding the accessibility check) must be duplicated across every component. A single configurable component with props for direction, distance, and timing is far more maintainable.

## GSAP Timelines for Complex Sequences

For animations with multiple coordinated steps, GSAP timelines provide sequencing, overlapping, and labeling. Here is a page entrance animation that coordinates multiple elements:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let page: HTMLElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        defaults: { ease: 'power2.out' }
      });

      tl
        // Phase 1: Header slides down
        .from('.nav', { y: -60, opacity: 0, duration: 0.5 })
        // Phase 2: Hero content fades in (starts 0.2s before nav finishes)
        .from('.hero-title', { y: 40, opacity: 0, duration: 0.8 }, '-=0.2')
        .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.6 }, '-=0.4')
        // Phase 3: CTA button scales up (starts when subtitle is halfway done)
        .from('.hero-cta', { scale: 0.8, opacity: 0, duration: 0.5 }, '-=0.3')
        // Phase 4: Feature cards stagger in
        .from('.feature-card', {
          y: 60,
          opacity: 0,
          duration: 0.6,
          stagger: 0.15
        }, '-=0.2');

    }, page);

    return () => ctx.revert();
  });
</script>

<div bind:this={page}>
  <nav class="nav">Navigation</nav>
  <section>
    <h1 class="hero-title">Build Faster</h1>
    <p class="hero-subtitle">Modern tools for modern teams.</p>
    <button class="hero-cta">Get Started</button>
  </section>
  <section>
    <div class="feature-card">Feature 1</div>
    <div class="feature-card">Feature 2</div>
    <div class="feature-card">Feature 3</div>
  </section>
</div>
```

### Timeline Position Parameter

The string `'-=0.2'` is GSAP's position parameter. It controls when each animation starts relative to the previous one:

- `'-=0.2'` -- start 0.2 seconds *before* the previous animation ends (overlap)
- `'+=0.5'` -- start 0.5 seconds *after* the previous animation ends (gap)
- `'<'` -- start at the same time as the previous animation
- `'<0.3'` -- start 0.3 seconds after the previous animation starts

Without overlapping, the sequence feels robotic. With too much overlap, it feels chaotic. The position parameter gives you precise control.

## Animating Route Transitions

In SvelteKit, page navigations trigger component unmounting and mounting. You can animate route transitions by combining GSAP with SvelteKit's `onNavigate` lifecycle:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import '../app.css';

  let { children } = $props();

  onNavigate((navigation) => {
    // Check if the browser supports View Transitions API
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

{@render children()}
```

For custom GSAP-powered transitions instead of the View Transitions API:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  let { children } = $props();
  let pageWrapper: HTMLElement;

  afterNavigate(async () => {
    const { gsap } = await import('gsap');

    gsap.fromTo(pageWrapper,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }
    );
  });
</script>

<div bind:this={pageWrapper}>
  {@render children()}
</div>
```

### WRONG: Animating in onNavigate

```svelte
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  // WRONG -- onNavigate fires BEFORE the new page renders
  onNavigate(async () => {
    const { gsap } = await import('gsap');
    gsap.from('.page-content', { opacity: 0, y: 20, duration: 0.3 });
    // The new page's .page-content doesn't exist yet!
  });
</script>
```

`onNavigate` fires before the navigation completes -- the new page's DOM does not exist yet. Use `afterNavigate` for entrance animations, which fires after the new page has been rendered and mounted.

## Scroll-Driven Animations with ScrollTrigger

ScrollTrigger is GSAP's most powerful plugin for production websites. It connects animations to scroll position, enabling parallax effects, sticky sections, progress indicators, and reveal animations.

### Pin-and-Scrub Pattern

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let container: HTMLElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      // Pin the section and scrub through an animation as the user scrolls
      gsap.to('.progress-bar', {
        width: '100%',
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top top',       // When top of container hits top of viewport
          end: 'bottom bottom',   // When bottom of container hits bottom of viewport
          scrub: true,            // Tie animation progress to scroll position
          pin: true               // Pin the container while scrolling through it
        }
      });

      // Parallax effect on background elements
      gsap.to('.bg-layer', {
        y: -200,
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    }, container);

    return () => ctx.revert();
  });
</script>

<section bind:this={container} class="relative h-[200vh]">
  <div class="bg-layer absolute inset-0 bg-gradient-to-b from-blue-500 to-purple-600"></div>
  <div class="progress-bar fixed top-0 left-0 h-1 bg-white w-0"></div>
  <div class="sticky top-0 flex items-center justify-center h-screen">
    <h2 class="text-4xl text-white">Scroll to reveal</h2>
  </div>
</section>
```

### ScrollTrigger Refresh on Dynamic Content

When content is loaded dynamically (from a server, from an API, or via lazy-loaded images), ScrollTrigger's calculations become stale because the page height changed. You must call `ScrollTrigger.refresh()` after dynamic content loads:

```svelte
<script lang="ts">
  import { tick } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let items = $state<string[]>([]);
  let container: HTMLElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      gsap.from('.reveal-item', {
        y: 50,
        opacity: 0,
        stagger: 0.1,
        scrollTrigger: {
          trigger: container,
          start: 'top 80%'
        }
      });
    }, container);

    return () => ctx.revert();
  });

  async function loadMore() {
    const newItems = await fetchMoreItems();
    items = [...items, ...newItems];

    // Wait for Svelte to render the new items, then recalculate
    await tick();
    ScrollTrigger.refresh();
  }
</script>
```

### WRONG: Forgetting to Refresh After Layout Changes

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  // WRONG -- images load and change the page height, but ScrollTrigger
  // still uses the old measurements
  onMount(() => {
    const ctx = gsap.context(() => {
      gsap.from('.section', {
        y: 50, opacity: 0,
        scrollTrigger: { trigger: '.section', start: 'top 80%' }
      });
    });

    return () => ctx.revert();
  });
  // Images load after mount, changing page height
  // ScrollTrigger triggers at wrong positions
</script>
```

If your page has images or lazy-loaded content, add `ScrollTrigger.refresh()` after the content settles. Alternatively, use `invalidateOnRefresh: true` on your ScrollTrigger instances so they automatically recalculate when `refresh()` is called.

## Performance Considerations

### Animating Transform and Opacity Only

GSAP can animate any CSS property, but not all properties are equal in performance. Properties that trigger layout reflow (width, height, padding, margin, top, left) force the browser to recalculate the position of every element on the page. Properties that trigger repaint (background-color, box-shadow, border-color) are cheaper but still involve pixel work.

The only properties that can be animated at 60fps without layout or repaint are **transforms** (x, y, scale, rotation) and **opacity**. GSAP's shorthand properties `x`, `y`, `scale`, `rotation` map directly to CSS transforms.

```typescript
// CORRECT -- transform and opacity only (GPU-accelerated, 60fps)
gsap.to(element, { x: 100, y: 50, scale: 1.1, opacity: 0.8, rotation: 15 });

// WRONG -- triggers layout reflow (expensive, causes jank)
gsap.to(element, { width: 200, height: 100, marginLeft: 50, top: 20 });

// WRONG -- triggers repaint (less expensive, but still not ideal for 60fps)
gsap.to(element, {
  backgroundColor: 'red',
  borderColor: 'blue',
  boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
});
```

### will-change for Heavy Animations

For elements that will be animated, the `will-change` CSS property hints to the browser to prepare a compositing layer:

```css
.animated-element {
  will-change: transform, opacity;
}
```

Do not apply `will-change` to every element -- each compositing layer consumes GPU memory. Only use it on elements that will definitely be animated, and remove it when the animation completes if the element will be static afterward.

## Try It

Build a portfolio-style landing page with the following GSAP animations:

1. Create a `FadeIn.svelte` wrapper component that:
   - Lazy-loads GSAP and ScrollTrigger
   - Accepts `y`, `x`, `duration`, `delay`, and `staggerChildren` props
   - Checks `prefers-reduced-motion` using Svelte's `MediaQuery` and skips animation if enabled
   - Cleans up all animations with `gsap.context().revert()`

2. Create a page entrance timeline in `+page.svelte` using `onMount()`:
   - Navigation slides down from above
   - Hero title fades up, followed by subtitle (overlapping)
   - CTA button scales in
   - All coordinated with GSAP timeline position parameters

3. Use `<FadeIn>` to animate at least three content sections on scroll:
   - One with staggered children (feature cards)
   - One sliding from the left (`x={-40} y={0}`)
   - One with a longer delay

4. Add a toggle button that shows/hides an element using `$effect()` with a GSAP animation. Verify that the animation responds to state changes.

5. Test the entire page by navigating away and back. Open the browser DevTools Memory tab and confirm no memory leaks from orphaned animations.

## Key Takeaways

- **Use `onMount()`** for one-time entrance animations that should never re-run; use **`$effect()`** for animations that respond to reactive state changes
- **Always clean up** with `gsap.context().revert()` -- it kills all animations and ScrollTriggers created within the context in one call
- **`gsap.context(element)`** scopes CSS selectors to a parent element, preventing animations from accidentally targeting elements in other components
- **Lazy-load GSAP** with `await import('gsap')` to keep it out of your initial bundle; load once in `onMount`, then animate reactively in `$effect`
- **Check `prefers-reduced-motion`** using `MediaQuery` from `svelte/reactivity` -- GSAP uses JavaScript, not CSS, so CSS media queries have no effect on GSAP animations
- **Animate only transforms and opacity** for 60fps performance -- avoid animating width, height, margin, or layout-triggering properties
- **Build one configurable component** (like `FadeIn`) instead of many single-purpose animation components -- props for direction, distance, and timing keep your codebase maintainable
- **Use `afterNavigate`** for page entrance animations, not `onNavigate` -- the new page's DOM does not exist until after navigation completes
- **Call `ScrollTrigger.refresh()`** after dynamic content loads or images finish loading -- stale measurements cause animations to trigger at wrong scroll positions
- **Keep effects focused** -- only read the reactive state that should trigger re-animation; accidental dependencies cause unexpected animation replays
