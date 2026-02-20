# Parallax with ScrollTrigger

Parallax effects create depth by moving elements at different speeds as the user scrolls. Background images drift slowly while foreground text moves faster, creating the illusion of layers. GSAP's **ScrollTrigger** plugin makes parallax effects simple and performant.

## Setting Up ScrollTrigger

Register the ScrollTrigger plugin before using it:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    // ScrollTrigger animations go here
  });
</script>
```

Always register plugins at the top level and create animations inside `onMount` so the DOM elements exist.

## Basic Scroll-Triggered Animation

Trigger an animation when an element enters the viewport:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    gsap.from('.feature-card', {
      y: 80,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      scrollTrigger: {
        trigger: '.features-section',
        start: 'top 80%',   // When top of section hits 80% of viewport
        end: 'bottom 20%',
        toggleActions: 'play none none reverse'
      }
    });
  });
</script>

<section class="features-section">
  <div class="feature-card">Feature 1</div>
  <div class="feature-card">Feature 2</div>
  <div class="feature-card">Feature 3</div>
</section>
```

The `start` value `"top 80%"` means the animation starts when the top of the trigger element reaches 80% down from the top of the viewport.

## Speed-Based Parallax

The simplest parallax effect moves elements at different scroll speeds. Use `scrub` to tie the animation progress directly to the scroll position:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    // Background moves slowly (parallax effect)
    gsap.to('.parallax-bg', {
      y: -200,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // Foreground text moves faster
    gsap.to('.hero-text', {
      y: -100,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });
  });
</script>

<section class="hero relative h-screen overflow-hidden">
  <img class="parallax-bg absolute inset-0 w-full h-[120%] object-cover" src="/bg.jpg" alt="" />
  <div class="hero-text relative z-10 flex items-center justify-center h-full">
    <h1 class="text-6xl font-bold text-white">Welcome</h1>
  </div>
</section>
```

When `scrub` is `true`, the animation maps directly to scroll progress. The background moves -200px over the scroll distance, and the text moves -100px, creating the parallax depth.

## Multi-Layer Parallax

Create depth with multiple layers moving at different rates:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const layers = [
      { selector: '.layer-bg', speed: -50 },
      { selector: '.layer-mountains', speed: -150 },
      { selector: '.layer-trees', speed: -250 },
      { selector: '.layer-foreground', speed: -350 }
    ];

    layers.forEach(({ selector, speed }) => {
      gsap.to(selector, {
        y: speed,
        scrollTrigger: {
          trigger: '.parallax-scene',
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        }
      });
    });
  });
</script>

<section class="parallax-scene relative h-[200vh]">
  <div class="layer-bg absolute inset-0">Sky</div>
  <div class="layer-mountains absolute inset-0">Mountains</div>
  <div class="layer-trees absolute inset-0">Trees</div>
  <div class="layer-foreground absolute inset-0">Content</div>
</section>
```

Setting `scrub: 1` adds a 1-second smoothing delay, making the parallax movement feel polished rather than jittery.

## Parallax Hero Section

A complete hero section with parallax:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: '+=500',
        scrub: 1,
        pin: true
      }
    });

    tl.to('.hero-title', { y: -50, opacity: 0 }, 0)
      .to('.hero-subtitle', { y: -30, opacity: 0 }, 0.1)
      .to('.hero-image', { scale: 1.2, y: -100 }, 0);

    return () => {
      ScrollTrigger.getAll().forEach(trigger => trigger.kill());
    };
  });
</script>

<section class="hero relative h-screen flex items-center justify-center overflow-hidden">
  <img class="hero-image absolute inset-0 w-full h-full object-cover" src="/hero.jpg" alt="" />
  <div class="relative z-10 text-center text-white">
    <h1 class="hero-title text-6xl font-bold">Explore</h1>
    <p class="hero-subtitle text-xl mt-4">Scroll to discover</p>
  </div>
</section>
```

The `pin: true` option keeps the hero section fixed in place while the scroll-linked animation plays. The cleanup function kills all ScrollTriggers when the component is destroyed.

## Try It

Build a landing page with three parallax sections. The first section has a pinned hero with a background image that zooms in while text fades out as you scroll. The second section has feature cards that slide in from alternating sides. The third section has a multi-layer parallax scene with at least three layers moving at different speeds.

## Key Takeaways

- ScrollTrigger's `scrub` property ties animation progress to scroll position
- Different `y` values on layered elements create parallax depth
- `scrub: true` is instant; `scrub: 1` adds smooth easing with a 1-second catch-up
- Use `pin: true` to hold an element in place while its animation plays
- Always clean up ScrollTrigger instances when a Svelte component is destroyed
- The `start` and `end` properties control when the scroll-linked animation begins and finishes
