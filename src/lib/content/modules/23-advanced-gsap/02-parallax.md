# Parallax with ScrollTrigger

Parallax is one of the oldest visual tricks in computing — layers moving at different speeds to create an illusion of depth. Think of looking out a car window: the fence right next to the road flies past, the trees behind it move slower, and the mountains in the distance barely move at all. That is parallax. On the web, we create this effect by moving elements at different rates as the user scrolls.

GSAP's **ScrollTrigger** plugin makes parallax both simple to implement and performant. It ties animation progress directly to scroll position, handles the math of scroll ranges, and provides tools for pinning, snapping, and smoothing that would take hundreds of lines of custom code.

This lesson covers everything from basic scroll-triggered animations to multi-layer parallax scenes, including performance optimization and accessibility considerations that separate production work from demos.

## Setting Up ScrollTrigger

Register the ScrollTrigger plugin before using it. Registration only needs to happen once, at the module level:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    // ScrollTrigger animations go here — DOM must exist

    return () => {
      // Always clean up when the component is destroyed
      ScrollTrigger.getAll().forEach((trigger) => trigger.kill());
    };
  });
</script>
```

**Why register at the top level?** GSAP plugins modify the core `gsap` object. Registration is idempotent (calling it twice is harmless), but it must happen before any ScrollTrigger-related code runs. Placing it at the module scope guarantees this.

**Why animate in `onMount`?** ScrollTrigger measures element positions and scroll ranges. If the DOM has not rendered yet, those measurements will be wrong. `onMount` runs after the component's first render, so all elements exist and have their initial positions.

**Why clean up on destroy?** ScrollTriggers attach scroll event listeners and resize observers. If the component unmounts (navigation, conditional rendering), those listeners persist and reference stale DOM nodes, causing memory leaks and console errors.

## Understanding ScrollTrigger's Core Properties

Before building parallax, you need a solid mental model of how ScrollTrigger works.

### start and end

These define the scroll range over which the animation plays:

```typescript
scrollTrigger: {
  trigger: '.section',
  start: 'top 80%',    // When the TOP of the trigger hits 80% down from the viewport TOP
  end: 'bottom 20%',   // When the BOTTOM of the trigger hits 20% down from the viewport TOP
}
```

The format is `"triggerPosition viewportPosition"`. Both accept keywords (`top`, `center`, `bottom`) and percentages. You can also use pixel offsets: `"top+=100 center"`.

### toggleActions

Controls what happens when crossing the start/end lines in both directions:

```typescript
scrollTrigger: {
  trigger: '.section',
  start: 'top 80%',
  end: 'bottom 20%',
  // Format: onEnter onLeave onEnterBack onLeaveBack
  toggleActions: 'play none none reverse'
}
```

The four positions are: **onEnter** (scrolling down past start), **onLeave** (scrolling down past end), **onEnterBack** (scrolling up past end), **onLeaveBack** (scrolling up past start). Each can be `play`, `pause`, `resume`, `reset`, `restart`, `complete`, `reverse`, or `none`.

### scrub

This is the key to parallax. `scrub` ties animation progress directly to scroll position instead of playing on a timeline:

```typescript
scrollTrigger: {
  trigger: '.section',
  start: 'top bottom',
  end: 'bottom top',
  scrub: true       // Progress = scroll position (instant)
  // scrub: 1       // Progress follows scroll with 1-second smoothing
  // scrub: 0.5     // Faster smoothing (0.5 seconds)
  // scrub: 3       // Slower, more cinematic smoothing (3 seconds)
}
```

When `scrub` is `true`, the animation snaps instantly to match scroll position. When it is a number, that number is the seconds of lag — creating a smooth, slightly delayed "catch-up" effect. `scrub: 1` is the most common value for parallax because it feels polished without being sluggish.

### pin

Pins an element in place while the scroll-linked animation plays:

```typescript
scrollTrigger: {
  trigger: '.hero',
  start: 'top top',
  end: '+=500',      // Pin for 500px of scrolling
  pin: true,
  pinSpacing: true   // Default: adds space below to compensate
}
```

When pinned, the element is taken out of flow and held in position. ScrollTrigger automatically adds padding to the document to prevent content from jumping. Set `pinSpacing: false` if you want the content below to scroll *behind* the pinned element (useful for reveal effects).

### markers

The most useful debugging tool — shows colored lines in the browser where start and end positions are:

```typescript
scrollTrigger: {
  trigger: '.section',
  start: 'top 80%',
  end: 'bottom 20%',
  markers: true     // Green line = start, red line = end
}
```

Always enable markers during development. Remove them before deploying.

## Basic Scroll-Triggered Animation

Before parallax, let us start with a simple "animate when visible" pattern:

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
        start: 'top 80%',
        end: 'bottom 20%',
        toggleActions: 'play none none reverse'
      }
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>

<section class="features-section">
  <div class="feature-card">Feature 1</div>
  <div class="feature-card">Feature 2</div>
  <div class="feature-card">Feature 3</div>
</section>
```

The `start` value `"top 80%"` means the animation begins when the top of `.features-section` reaches 80% down from the top of the viewport — roughly when the section enters the lower portion of the screen. The `toggleActions: 'play none none reverse'` plays the animation on scroll down and reverses it on scroll back up.

## Speed-Based Parallax

The simplest parallax technique: move elements at different speeds. Elements moving slower appear farther away; elements moving faster appear closer.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    // Background moves slowly (far away)
    gsap.to('.parallax-bg', {
      y: -200,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // Text moves at medium speed (middle distance)
    gsap.to('.hero-text', {
      y: -100,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // Foreground element moves fast (close)
    gsap.to('.hero-overlay', {
      y: -300,
      opacity: 0,
      scrollTrigger: {
        trigger: '.hero',
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>

<section class="hero">
  <img class="parallax-bg" src="/bg.jpg" alt="" />
  <div class="hero-text">
    <h1>Welcome</h1>
    <p>Scroll to experience depth</p>
  </div>
  <div class="hero-overlay"></div>
</section>

<style>
  .hero {
    position: relative;
    height: 100vh;
    overflow: hidden;
  }

  .parallax-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 120%;         /* Taller than container so it has room to move */
    object-fit: cover;
  }

  .hero-text {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: white;
    text-align: center;
  }

  .hero-text h1 {
    font-size: 4rem;
    font-weight: 700;
    margin: 0;
  }

  .hero-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent 50%, rgba(0, 0, 0, 0.7));
    z-index: 1;
  }
</style>
```

**Why `height: 120%` on the background image?** If the image is exactly `100%` of the container height and you translate it upward by 200px, a 200px gap appears at the bottom. Making it taller than the container provides "headroom" for the translation. A general rule: make the parallax element's dimension `100% + absolute translation value` in the scrolling direction.

## Multi-Layer Parallax

Create convincing depth with multiple layers moving at graded speeds:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const layers = [
      { selector: '.layer-sky', speed: 0 },         // Static — infinitely far
      { selector: '.layer-clouds', speed: -30 },     // Very slow — far away
      { selector: '.layer-mountains', speed: -80 },  // Slow — mid-distance
      { selector: '.layer-trees', speed: -150 },     // Medium — closer
      { selector: '.layer-ground', speed: -250 },    // Fast — foreground
      { selector: '.layer-text', speed: -350 }       // Fastest — closest
    ];

    layers.forEach(({ selector, speed }) => {
      if (speed === 0) return; // Skip static layers

      gsap.to(selector, {
        y: speed,
        ease: 'none',  // Linear movement for consistent parallax
        scrollTrigger: {
          trigger: '.parallax-scene',
          start: 'top top',
          end: 'bottom top',
          scrub: 1  // 1-second smoothing
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>

<section class="parallax-scene">
  <div class="layer layer-sky"></div>
  <div class="layer layer-clouds">
    <img src="/clouds.png" alt="" />
  </div>
  <div class="layer layer-mountains">
    <img src="/mountains.png" alt="" />
  </div>
  <div class="layer layer-trees">
    <img src="/trees.png" alt="" />
  </div>
  <div class="layer layer-ground"></div>
  <div class="layer layer-text">
    <h1>Into the Wild</h1>
  </div>
</section>
<section class="content-below">
  <p>Content continues here after the parallax scene...</p>
</section>

<style>
  .parallax-scene {
    position: relative;
    height: 200vh; /* Extra height for scroll distance */
    overflow: hidden;
  }

  .layer {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    will-change: transform; /* Hint browser to optimize */
  }

  .layer img {
    width: 100%;
    object-fit: cover;
    object-position: bottom;
  }

  .layer-sky {
    background: linear-gradient(to bottom, #87ceeb 0%, #e0f0ff 100%);
  }

  .layer-ground {
    top: auto;
    height: 30%;
    background: #2d5a27;
  }

  .layer-text {
    align-items: center;
    z-index: 10;
  }

  .layer-text h1 {
    color: white;
    font-size: 5rem;
    text-shadow: 0 2px 20px rgba(0, 0, 0, 0.5);
  }

  .content-below {
    position: relative;
    z-index: 10;
    background: white;
    padding: 4rem 2rem;
    font-size: 1.25rem;
  }
</style>
```

**The speed calculation rationale:** the slowest-moving layers should move barely at all (or not at all). Each subsequent layer moves proportionally faster. The ratio between layers determines how "deep" the scene feels. A common ratio is roughly 1.5x-2x per layer. You do not need to be precise — tune by eye until the scene feels right.

## Parallax Hero Section with Pinning

A complete hero section that pins in place while a scroll-linked animation plays:

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
        end: '+=800',   // 800px of scroll to play through the entire timeline
        scrub: 1,
        pin: true        // Hero stays in place while animation plays
      }
    });

    // All these animate in parallel during the 800px scroll
    tl.to('.hero-title', { y: -80, opacity: 0, scale: 0.95 }, 0)
      .to('.hero-subtitle', { y: -50, opacity: 0 }, 0.05)
      .to('.hero-cta', { y: -30, opacity: 0 }, 0.1)
      .to('.hero-image', { scale: 1.3, y: -120, filter: 'blur(4px)' }, 0)
      .to('.hero-overlay', { opacity: 0.8 }, 0);

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>

<section class="hero">
  <img class="hero-image" src="/hero.jpg" alt="" />
  <div class="hero-overlay"></div>
  <div class="hero-content">
    <h1 class="hero-title">Explore the World</h1>
    <p class="hero-subtitle">Adventures await beyond the horizon</p>
    <a class="hero-cta" href="/explore">Start Your Journey</a>
  </div>
</section>

<section class="after-hero">
  <h2>Featured Destinations</h2>
  <p>Content that appears after the hero unpin...</p>
</section>

<style>
  .hero {
    position: relative;
    height: 100vh;
    overflow: hidden;
  }

  .hero-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .hero-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
  }

  .hero-content {
    position: relative;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: white;
  }

  .hero-title {
    font-size: 4.5rem;
    font-weight: 800;
    margin: 0 0 1rem;
    line-height: 1.1;
  }

  .hero-subtitle {
    font-size: 1.5rem;
    margin: 0 0 2rem;
    opacity: 0.9;
  }

  .hero-cta {
    display: inline-block;
    padding: 1rem 2.5rem;
    background: white;
    color: hsl(220, 25%, 12%);
    text-decoration: none;
    font-weight: 700;
    border-radius: 50px;
    font-size: 1.125rem;
    transition: transform 0.2s;
  }

  .hero-cta:hover {
    transform: scale(1.05);
  }

  .after-hero {
    padding: 4rem 2rem;
    text-align: center;
  }
</style>
```

**How pinning works under the hood:** when the trigger element reaches its start position, ScrollTrigger sets `position: fixed` on it and adds a spacer `<div>` to the document flow to preserve the same height. This spacer prevents the content below from jumping up. When the end position is reached, the element is un-pinned and the spacer is removed. This is why you may see a brief flash if your pinned element has a background — the spacer is transparent unless you style it.

## Horizontal Parallax on Scroll

Parallax is not limited to vertical movement. You can create horizontal scrolling sections with parallax:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const container = document.querySelector('.horizontal-track') as HTMLElement;
    const totalWidth = container.scrollWidth - window.innerWidth;

    gsap.to('.horizontal-track', {
      x: -totalWidth,
      ease: 'none',
      scrollTrigger: {
        trigger: '.horizontal-section',
        start: 'top top',
        end: () => `+=${totalWidth}`,
        scrub: 1,
        pin: true
      }
    });

    // Parallax within the horizontal scroll
    gsap.to('.h-parallax-bg', {
      x: -totalWidth * 0.3,  // Background moves at 30% speed
      ease: 'none',
      scrollTrigger: {
        trigger: '.horizontal-section',
        start: 'top top',
        end: () => `+=${totalWidth}`,
        scrub: 1
      }
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>

<section class="horizontal-section">
  <div class="h-parallax-bg"></div>
  <div class="horizontal-track">
    <div class="h-panel">Panel 1</div>
    <div class="h-panel">Panel 2</div>
    <div class="h-panel">Panel 3</div>
    <div class="h-panel">Panel 4</div>
  </div>
</section>

<style>
  .horizontal-section {
    position: relative;
    overflow: hidden;
    height: 100vh;
  }

  .h-parallax-bg {
    position: absolute;
    inset: 0;
    width: 200%;   /* Wider than viewport for parallax movement */
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    z-index: 0;
  }

  .horizontal-track {
    display: flex;
    height: 100%;
    position: relative;
    z-index: 1;
  }

  .h-panel {
    min-width: 100vw;
    height: 100%;
    display: grid;
    place-items: center;
    font-size: 3rem;
    font-weight: 700;
    color: white;
    border-right: 1px solid rgba(255, 255, 255, 0.2);
  }
</style>
```

## Performance Considerations

Parallax can destroy performance if done carelessly. Here is what matters:

### Transform vs top/left

**Always use `transform: translateY()` instead of `top` / `left` for movement.** GSAP's `y` property maps to `transform: translateY()`, which is composited on the GPU. Moving elements via `top` or `left` triggers layout recalculations on every scroll frame, which is catastrophically expensive.

```typescript
// GOOD — runs on the GPU compositor
gsap.to('.element', { y: -200, scrollTrigger: { ... } });

// BAD — triggers layout on every frame
gsap.to('.element', { top: -200, scrollTrigger: { ... } });
```

### will-change

`will-change: transform` hints to the browser that an element will be animated, prompting it to promote the element to its own GPU layer:

```css
.parallax-layer {
  will-change: transform;
}
```

**But use it sparingly.** Each `will-change` element consumes GPU memory. On a phone with limited VRAM, ten layers with `will-change` can cause the browser to start thrashing between GPU and CPU rendering, making performance *worse*. Apply it only to elements that are actively being animated.

### Image optimization for parallax

Large background images are often the real performance bottleneck:

```svelte
<img
  class="parallax-bg"
  src="/hero-1920.jpg"
  srcset="/hero-640.jpg 640w, /hero-1280.jpg 1280w, /hero-1920.jpg 1920w"
  sizes="100vw"
  alt=""
  loading="eager"
  decoding="async"
/>
```

- Use `srcset` to serve appropriately sized images for each screen
- Use `loading="eager"` for above-the-fold parallax images (they need to load immediately)
- Use `decoding="async"` to avoid blocking the main thread during decode
- Prefer WebP or AVIF formats for smaller file sizes

### Debouncing ScrollTrigger.refresh()

When the page resizes, ScrollTrigger needs to recalculate positions. This is automatic, but on complex pages it can be expensive. GSAP debounces this internally, but if you are manually calling `ScrollTrigger.refresh()`, batch those calls:

```typescript
// BAD — refreshing inside a loop
items.forEach((item) => {
  createAnimation(item);
  ScrollTrigger.refresh(); // Called N times!
});

// GOOD — refresh once after all animations are created
items.forEach((item) => {
  createAnimation(item);
});
ScrollTrigger.refresh(); // Called once
```

### Reducing layer count on mobile

Mobile devices have limited GPU memory. Reduce the number of parallax layers on smaller screens:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const layers = isMobile
      ? [
          { selector: '.layer-bg', speed: -50 },
          { selector: '.layer-text', speed: -150 }
        ]
      : [
          { selector: '.layer-bg', speed: -50 },
          { selector: '.layer-mountains', speed: -100 },
          { selector: '.layer-trees', speed: -200 },
          { selector: '.layer-text', speed: -300 }
        ];

    layers.forEach(({ selector, speed }) => {
      gsap.to(selector, {
        y: speed,
        ease: 'none',
        scrollTrigger: {
          trigger: '.scene',
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>
```

## Touch Device Considerations

Scroll behavior differs significantly between desktop and mobile:

1. **Momentum scrolling:** on iOS, scroll events fire at 60fps during momentum scrolling, but the actual scroll position updates in bursts. GSAP handles this well, but `scrub: true` (instant) can feel jittery. Use `scrub: 0.5` or higher on mobile for smoother results.

2. **Viewport height changes:** on mobile browsers, the address bar shrinks as you scroll. This changes `100vh`, which can cause ScrollTrigger to recalculate and cause jumps. Use `dvh` (dynamic viewport height) if targeting modern browsers, or set fixed pixel heights.

3. **Overscroll behavior:** on iOS, rubber-band scrolling past the top or bottom of the page can trigger ScrollTrigger unexpectedly. Use `overscroll-behavior: none` on the scroll container to prevent this.

4. **Scroll snapping conflicts:** if you combine `scroll-snap-type` with ScrollTrigger's `snap` property, they will fight. Pick one or the other.

## Accessibility — prefers-reduced-motion

Some users experience motion sickness, vestibular disorders, or simply find excessive animation distracting. Respecting `prefers-reduced-motion` is not optional — it is a legal requirement in many jurisdictions:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      // Skip all parallax — just show static content
      // Or provide a minimal, non-motion alternative
      return;
    }

    // Full parallax only for users who haven't opted out
    const layers = [
      { selector: '.layer-bg', speed: -100 },
      { selector: '.layer-mid', speed: -200 },
      { selector: '.layer-fg', speed: -350 }
    ];

    layers.forEach(({ selector, speed }) => {
      gsap.to(selector, {
        y: speed,
        ease: 'none',
        scrollTrigger: {
          trigger: '.parallax-scene',
          start: 'top top',
          end: 'bottom top',
          scrub: 1
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach((t) => t.kill());
  });
</script>
```

You can also use GSAP's built-in `matchMedia` for cleaner responsive + accessibility handling:

```typescript
onMount(() => {
  const mm = gsap.matchMedia();

  mm.add('(prefers-reduced-motion: no-preference)', () => {
    // Full parallax animations — only runs when motion is OK
    gsap.to('.parallax-bg', {
      y: -200,
      scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 1 }
    });
  });

  mm.add('(prefers-reduced-motion: reduce)', () => {
    // Alternative: simple fade-in, no motion
    gsap.from('.hero-text', { opacity: 0, duration: 0.5 });
  });

  return () => mm.revert();
});
```

`gsap.matchMedia()` automatically cleans up animations when the media query no longer matches. This handles edge cases like the user changing their motion preference while the page is open.

## Complete Multi-Layer Parallax Page

Here is a production-ready parallax landing page combining everything from this lesson:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  onMount(() => {
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // --- Hero parallax ---
      const heroTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: '+=600',
          scrub: 1,
          pin: true
        }
      });

      heroTl
        .to('.hero-bg', { y: -120, scale: 1.1 }, 0)
        .to('.hero-title', { y: -80, opacity: 0 }, 0)
        .to('.hero-subtitle', { y: -60, opacity: 0 }, 0.05)
        .to('.hero-scroll-hint', { opacity: 0 }, 0);

      // --- Feature cards stagger in ---
      gsap.from('.feature-card', {
        y: 60,
        opacity: 0,
        stagger: 0.15,
        duration: 0.6,
        scrollTrigger: {
          trigger: '.features',
          start: 'top 75%',
          toggleActions: 'play none none reverse'
        }
      });

      // --- Multi-layer parallax scene ---
      const sceneLayers = [
        { selector: '.scene-far', speed: -40 },
        { selector: '.scene-mid', speed: -120 },
        { selector: '.scene-near', speed: -220 },
        { selector: '.scene-text', speed: -320 }
      ];

      sceneLayers.forEach(({ selector, speed }) => {
        gsap.to(selector, {
          y: speed,
          ease: 'none',
          scrollTrigger: {
            trigger: '.depth-scene',
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1
          }
        });
      });

      // --- Stats counter on scroll ---
      gsap.from('.stat-number', {
        textContent: 0,
        duration: 1.5,
        snap: { textContent: 1 },
        stagger: 0.3,
        scrollTrigger: {
          trigger: '.stats',
          start: 'top 80%',
          toggleActions: 'play none none reverse'
        }
      });

      // --- Final CTA reveal ---
      gsap.from('.cta-section', {
        y: 40,
        opacity: 0,
        duration: 0.8,
        scrollTrigger: {
          trigger: '.cta-section',
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    });

    mm.add('(prefers-reduced-motion: reduce)', () => {
      // Reduced motion: simple fades only, no movement
      gsap.utils.toArray('.feature-card, .stat-number, .cta-section').forEach((el) => {
        gsap.from(el as HTMLElement, {
          opacity: 0,
          duration: 0.4,
          scrollTrigger: {
            trigger: el as HTMLElement,
            start: 'top 90%',
            toggleActions: 'play none none none'
          }
        });
      });
    });

    return () => mm.revert();
  });
</script>

<!-- Hero -->
<section class="hero">
  <div class="hero-bg"></div>
  <div class="hero-content">
    <h1 class="hero-title">Parallax Done Right</h1>
    <p class="hero-subtitle">Performance, accessibility, and production quality</p>
    <div class="hero-scroll-hint">Scroll to explore</div>
  </div>
</section>

<!-- Features -->
<section class="features">
  <h2 class="section-title">Why It Matters</h2>
  <div class="feature-grid">
    <div class="feature-card">
      <h3>Performance</h3>
      <p>GPU-accelerated transforms, optimized layer management, no layout thrashing.</p>
    </div>
    <div class="feature-card">
      <h3>Accessibility</h3>
      <p>Respects prefers-reduced-motion, provides static fallbacks.</p>
    </div>
    <div class="feature-card">
      <h3>Cross-Device</h3>
      <p>Responsive layer counts, touch-optimized scrub values.</p>
    </div>
  </div>
</section>

<!-- Multi-layer depth scene -->
<section class="depth-scene">
  <div class="scene-layer scene-far"></div>
  <div class="scene-layer scene-mid"></div>
  <div class="scene-layer scene-near"></div>
  <div class="scene-layer scene-text">
    <h2>Feel the Depth</h2>
  </div>
</section>

<!-- Stats -->
<section class="stats">
  <div class="stat">
    <span class="stat-number">60</span>
    <span class="stat-label">FPS target</span>
  </div>
  <div class="stat">
    <span class="stat-number">0</span>
    <span class="stat-label">Layout reflows</span>
  </div>
  <div class="stat">
    <span class="stat-number">100</span>
    <span class="stat-label">Lighthouse score</span>
  </div>
</section>

<!-- CTA -->
<section class="cta-section">
  <h2>Ready to Build?</h2>
  <a href="/get-started" class="cta-button">Get Started</a>
</section>

<style>
  /* Hero */
  .hero {
    position: relative;
    height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .hero-bg {
    position: absolute;
    inset: -10%;
    background: linear-gradient(135deg, #0f0c29, #302b63, #24243e);
    will-change: transform;
  }

  .hero-content {
    position: relative;
    z-index: 2;
    text-align: center;
    color: white;
  }

  .hero-title {
    font-size: clamp(2.5rem, 6vw, 5rem);
    font-weight: 800;
    margin: 0 0 1rem;
  }

  .hero-subtitle {
    font-size: clamp(1rem, 2vw, 1.5rem);
    opacity: 0.85;
    margin: 0 0 3rem;
  }

  .hero-scroll-hint {
    font-size: 0.875rem;
    opacity: 0.5;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  /* Features */
  .features {
    padding: 6rem 2rem;
    text-align: center;
  }

  .section-title {
    font-size: 2rem;
    margin-bottom: 3rem;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 2rem;
    max-width: 900px;
    margin: 0 auto;
  }

  .feature-card {
    padding: 2rem;
    border: 1px solid hsl(210, 15%, 88%);
    border-radius: 12px;
    text-align: left;
  }

  .feature-card h3 { margin: 0 0 0.75rem; }
  .feature-card p { margin: 0; color: hsl(210, 10%, 40%); line-height: 1.6; }

  /* Depth scene */
  .depth-scene {
    position: relative;
    height: 150vh;
    overflow: hidden;
  }

  .scene-layer {
    position: absolute;
    inset: 0;
    will-change: transform;
  }

  .scene-far { background: hsl(220, 60%, 85%); }
  .scene-mid { background: hsl(220, 50%, 70%); top: 30%; border-radius: 50% 50% 0 0; }
  .scene-near { background: hsl(220, 40%, 50%); top: 55%; border-radius: 30% 30% 0 0; }
  .scene-text {
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 3rem;
    z-index: 5;
  }

  /* Stats */
  .stats {
    display: flex;
    justify-content: center;
    gap: 4rem;
    padding: 5rem 2rem;
    background: hsl(220, 25%, 12%);
    color: white;
  }

  .stat { text-align: center; }
  .stat-number { display: block; font-size: 3rem; font-weight: 800; }
  .stat-label { font-size: 0.875rem; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.08em; }

  /* CTA */
  .cta-section {
    text-align: center;
    padding: 6rem 2rem;
  }

  .cta-section h2 { font-size: 2.5rem; margin-bottom: 2rem; }

  .cta-button {
    display: inline-block;
    padding: 1rem 3rem;
    background: hsl(220, 80%, 55%);
    color: white;
    text-decoration: none;
    border-radius: 50px;
    font-weight: 700;
    font-size: 1.125rem;
    transition: background 0.2s;
  }

  .cta-button:hover { background: hsl(220, 80%, 45%); }
</style>
```

## Try It

Build a landing page with three parallax sections:

1. **Pinned hero:** A full-viewport hero with a background image that zooms in (`scale`) and blurs (`filter: blur`) while the title and subtitle fade and float upward. Use `pin: true` with `end: '+=600'`.

2. **Staggered feature cards:** Below the hero, a grid of cards that slide in from alternating sides (odd cards from the left, even cards from the right) as they scroll into view. Use `toggleActions` instead of `scrub`.

3. **Multi-layer parallax scene:** A nature scene with at least four layers (sky, distant hills, trees, foreground grass) moving at different speeds. Use `scrub: 1` for smooth movement. Make the text layer move fastest.

4. **Accessibility:** Wrap everything in `gsap.matchMedia()`. For `prefers-reduced-motion: reduce`, replace all parallax with simple opacity fades.

5. **Performance:** Use `will-change: transform` on animated layers, serve responsive images with `srcset`, and test with Chrome DevTools Performance tab to confirm 60fps.

## Key Takeaways

- ScrollTrigger's `scrub` property ties animation progress to scroll position — `true` for instant, a number for seconds of smoothing
- Different `y` values on layered elements create parallax depth — smaller values for "distant" layers, larger for "near" layers
- `pin: true` holds an element in place while its scroll-linked animation plays
- Always clean up ScrollTriggers when a Svelte component is destroyed to prevent memory leaks
- Use `transform` properties (`y`, `scale`, `rotation`) instead of `top`/`left` for GPU-accelerated performance
- Apply `will-change: transform` sparingly — it consumes GPU memory and too many layers degrade mobile performance
- Make parallax images taller/wider than their containers to provide room for translation
- Respect `prefers-reduced-motion` with `gsap.matchMedia()` — provide static fallbacks or gentle opacity fades
- Use `scrub: 0.5` or higher on mobile for smoother momentum scrolling
- Enable `markers: true` during development to visualize start/end positions, then remove before production
