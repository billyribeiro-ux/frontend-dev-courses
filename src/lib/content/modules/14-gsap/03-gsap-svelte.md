# GSAP in Svelte

Using GSAP in a SvelteKit application requires understanding component lifecycle and cleanup. Animations that are not properly cleaned up can cause memory leaks, and animations that start before the DOM is ready will fail silently. This lesson teaches you the right patterns for integrating GSAP with Svelte 5.

The key concepts are: use `$effect()` or `onMount()` to wait for the DOM, always clean up animations when components are destroyed, and consider lazy-loading GSAP for better performance.

## Using $effect() for Animations

In Svelte 5, `$effect()` runs after the component mounts and re-runs when its dependencies change. This makes it ideal for animations that depend on reactive state:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';

  let isVisible = $state(false);
  let card: HTMLDivElement;

  $effect(() => {
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

## Cleaning Up Animations

When a component is destroyed (the user navigates away), active animations must be killed. Otherwise they continue running on elements that no longer exist. Use the cleanup return in `$effect()`:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  $effect(() => {
    const ctx = gsap.context(() => {
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
    }, section);

    return () => {
      ctx.revert();  // Kills all animations and ScrollTriggers in this context
    };
  });
</script>

<section bind:this={section}>
  <div class="animate-item">Item 1</div>
  <div class="animate-item">Item 2</div>
  <div class="animate-item">Item 3</div>
</section>
```

`gsap.context()` scopes all animations to a parent element and provides a clean `revert()` method that destroys everything at once.

## onMount vs $effect

Both work for animations, but serve different purposes:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { onMount } from 'svelte';

  let hero: HTMLElement;

  // Use onMount for one-time entrance animations
  onMount(() => {
    const ctx = gsap.context(() => {
      gsap.from('.hero-title', { y: 40, opacity: 0, duration: 0.8 });
      gsap.from('.hero-text', { y: 30, opacity: 0, duration: 0.8, delay: 0.2 });
      gsap.from('.hero-button', { y: 20, opacity: 0, duration: 0.8, delay: 0.4 });
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

**Use `onMount`** for one-time setup animations that run once when the page loads.
**Use `$effect`** for animations that need to re-run when reactive state changes.

## Lazy-Loading GSAP

GSAP adds ~30KB to your bundle. For pages that do not use animations, you can lazy-load it:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let section: HTMLElement;

  onMount(async () => {
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

The `await import()` syntax loads GSAP only when the component mounts, keeping your initial bundle small.

## Respecting Motion Preferences

Some users experience motion sickness or discomfort from animations. Always respect the `prefers-reduced-motion` media query:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

In your GSAP code, check before animating:

```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

$effect(() => {
  if (prefersReducedMotion) return; // Skip animations entirely

  const ctx = gsap.context(() => {
    gsap.from('.element', { opacity: 0, y: 20, duration: 0.6 });
  });

  return () => ctx.revert();
});
```

This is a professional requirement — many users rely on this setting, and ignoring it creates an inaccessible experience.

## Animating Component Entrance

A reusable pattern for animating any component as it enters the viewport:

```svelte
<!-- src/lib/components/FadeIn.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  interface Props {
    children: Snippet;
    y?: number;
    duration?: number;
    delay?: number;
  }

  let { children, y = 30, duration = 0.6, delay = 0 }: Props = $props();
  let wrapper: HTMLDivElement;

  onMount(async () => {
    const { gsap } = await import('gsap');
    const { ScrollTrigger } = await import('gsap/ScrollTrigger');
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      gsap.from(wrapper, {
        y,
        opacity: 0,
        duration,
        delay,
        ease: 'power2.out',
        scrollTrigger: { trigger: wrapper, start: 'top 85%' }
      });
    });

    return () => ctx.revert();
  });
</script>

<div bind:this={wrapper}>
  {@render children()}
</div>
```

Now any content can be animated by wrapping it:

```svelte
<FadeIn>
  <h2>This heading fades in on scroll</h2>
</FadeIn>

<FadeIn y={50} delay={0.2}>
  <p>This paragraph fades in with more distance and a delay.</p>
</FadeIn>
```

## Try It

Create a `FadeIn.svelte` wrapper component that lazy-loads GSAP and animates its children on scroll. Use it on a page with multiple sections. Then create a separate animation that reacts to a `$state` toggle using `$effect()`. Verify that navigating away from the page cleans up all animations.

## Key Takeaways

- Use `$effect()` for animations that depend on reactive state; use `onMount()` for one-time setups
- **Always clean up** animations with `gsap.context().revert()` to prevent memory leaks
- `gsap.context()` scopes animations to a parent element for easy cleanup
- **Lazy-load GSAP** with `await import('gsap')` to reduce initial bundle size
- Reusable `FadeIn` wrapper components make scroll animations easy to apply anywhere
- The cleanup return in `$effect()` and `onMount()` runs when the component is destroyed
