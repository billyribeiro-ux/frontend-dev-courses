# ScrollTrigger

ScrollTrigger is a GSAP plugin that connects animations to scroll position. Instead of animating on page load or button click, you trigger animations when elements come into view — or link animation progress directly to how far the user has scrolled. This creates engaging, narrative-driven web experiences where content reveals itself as the user scrolls.

ScrollTrigger handles all the complexity of scroll detection, intersection observation, and performance optimization. You tell it what to animate and when, and it handles the rest — including resize recalculation, mobile touch scrolling, container-based scrolling, and cleanup.

The mental model: ScrollTrigger watches the scroll position and tells GSAP when to play, pause, reverse, or scrub animations. You define a **trigger element**, a **start** position, and an **end** position. When the scroll position enters that range, the animation responds.

## Registering the Plugin

ScrollTrigger must be registered before use. Do this once, typically in each component that uses it:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);
</script>
```

Registration is idempotent — calling it multiple times has no side effects. GSAP checks if the plugin is already registered before adding it.

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

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
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

When the user scrolls down and the top edge of `section` reaches 80% of the viewport height (measured from the top), GSAP plays the animation. The section slides up 60px and fades from transparent to fully visible.

## Start and End: The Trigger System

The `start` and `end` properties are the core of ScrollTrigger. They define a scroll range — a "zone" where the animation is active. The format is `"element-position viewport-position"`:

```js
scrollTrigger: {
  trigger: element,
  start: 'top 80%',      // top of element reaches 80% from viewport top
  end: 'bottom 20%',     // bottom of element reaches 20% from viewport top
}
```

Each value has two parts:
1. **Element position:** Where on the trigger element (top, center, bottom, or a percentage/pixel value)
2. **Viewport position:** Where on the viewport (top, center, bottom, or a percentage/pixel value)

### Common Start/End Values

```js
// "top bottom" — animation starts when the top of the element enters the viewport
// (bottom of viewport = the appearing edge)
start: 'top bottom'

// "top 80%" — starts when top of element is at 80% down from viewport top
// This triggers slightly before the element is fully visible
start: 'top 80%'

// "top center" — starts when top of element hits the center of the viewport
start: 'top center'

// "center center" — starts when element center hits viewport center
start: 'center center'

// "top top" — starts when top of element hits top of viewport
// Used for pinning and full-page takeovers
start: 'top top'

// Pixel offsets from the calculated position
start: 'top 80%+=100'  // 100px below the 80% mark

// End positions
end: 'bottom top'      // bottom of element leaves viewport top (fully scrolled past)
end: 'bottom center'   // bottom of element hits viewport center
end: '+=500'           // 500px after the start position (absolute scroll distance)
end: '+=100%'          // Element height after start position
```

### Development Markers

During development, add `markers: true` to visualize the trigger points. This draws colored lines on the page showing exactly where start and end positions are:

```js
scrollTrigger: {
  trigger: section,
  start: 'top 80%',
  end: 'top 20%',
  markers: true   // Shows green (start) and red (end) lines
}
```

The green markers show the start position (element + viewport), and the red markers show the end position. **Always remove markers before deploying to production.**

Markers are the single most useful debugging tool for ScrollTrigger. If an animation is not firing when expected, add markers and visually verify where the trigger zone actually is.

## Scroll-Triggered vs Scroll-Driven

There are two fundamentally different ways to connect animations to scroll:

### Scroll-Triggered: toggleActions

The animation plays at normal speed when the scroll position enters the trigger zone. The scroll controls *when* the animation starts, but not its speed:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    gsap.from(section.querySelectorAll('.reveal'), {
      y: 60,
      opacity: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 75%',
        // toggleActions: "onEnter onLeave onEnterBack onLeaveBack"
        toggleActions: 'play none none reverse'
      }
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  });
</script>

<section bind:this={section}>
  <h2 class="reveal">Features</h2>
  <p class="reveal">First feature description</p>
  <p class="reveal">Second feature description</p>
</section>
```

**toggleActions** controls what happens at four moments:
1. `onEnter` — scroll forward past the start
2. `onLeave` — scroll forward past the end
3. `onEnterBack` — scroll backward past the end
4. `onLeaveBack` — scroll backward past the start

Available actions: `play`, `pause`, `resume`, `reverse`, `restart`, `reset`, `complete`, `none`

Common toggleActions patterns:

```js
// Play once, never reverse (content reveal)
toggleActions: 'play none none none'

// Play on enter, reverse when scrolling back
toggleActions: 'play none none reverse'

// Restart every time it enters, reverse when it leaves
toggleActions: 'restart none none reverse'

// Play forward and backward
toggleActions: 'play reverse play reverse'
```

### Scroll-Driven: scrub

Scrub links animation progress directly to scroll position. The animation does not play at its own speed — it advances and retreats as the user scrolls:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let progressBar: HTMLDivElement;

  onMount(() => {
    // Page-wide progress bar
    gsap.to(progressBar, {
      scaleX: 1,
      ease: 'none',
      scrollTrigger: {
        trigger: document.body,
        start: 'top top',
        end: 'bottom bottom',
        scrub: true
      }
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
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

**Scrub values:**
- `scrub: true` — animation perfectly follows scroll position (no smoothing)
- `scrub: 0.5` — animation lags 0.5 seconds behind scroll (smooth, organic feel)
- `scrub: 1` — 1 second of smoothing lag (very smooth, slightly floaty)
- `scrub: 3` — 3 seconds of lag (dramatic, dreamy effect)

For UI elements like progress bars, use `scrub: true`. For content animations, `scrub: 0.5` or `scrub: 1` feels more polished.

**When to use which:**
- **toggleActions** for reveal animations (cards appearing, text fading in). The animation should play at a consistent, designed speed regardless of how fast the user scrolls.
- **scrub** for parallax, progress indicators, and animations where the user should control the pace. The animation should be tied to scroll position, not time.

## Pinning Sections

Pinning locks an element in place while the user scrolls past it. The element stays fixed in the viewport for a defined scroll distance, then unpins and scrolls away normally. This is used for full-screen takeover sections, step-by-step reveals, and horizontal scrolling effects.

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let pinnedSection: HTMLElement;

  onMount(() => {
    // Pin the section for 600px of scrolling
    ScrollTrigger.create({
      trigger: pinnedSection,
      start: 'top top',
      end: '+=600',      // Stay pinned for 600px of scrolling
      pin: true,
      pinSpacing: true   // Add padding below to prevent content overlap (default true)
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
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

### Pin + Scrub Animation

The real power of pinning comes when combined with scrub — the section stays pinned while an animation plays through, driven by the user's scrolling:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: '+=2000',     // 2000px of scroll controls this timeline
        pin: true,
        scrub: 1
      }
    });

    // These animations play sequentially as the user scrolls through 2000px
    tl.from('.step-1', { opacity: 0, y: 50, duration: 1 })
      .to('.step-1', { opacity: 0, y: -50, duration: 1 }, '+=0.5')
      .from('.step-2', { opacity: 0, y: 50, duration: 1 })
      .to('.step-2', { opacity: 0, y: -50, duration: 1 }, '+=0.5')
      .from('.step-3', { opacity: 0, y: 50, duration: 1 })
      .from('.step-3-details', { opacity: 0, x: 100, stagger: 0.2, duration: 0.5 });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  });
</script>

<section bind:this={section} class="steps-section">
  <div class="step-1">
    <h2>Step 1: Design</h2>
    <p>Create your wireframes and visual design.</p>
  </div>
  <div class="step-2">
    <h2>Step 2: Develop</h2>
    <p>Build with SvelteKit and deploy.</p>
  </div>
  <div class="step-3">
    <h2>Step 3: Launch</h2>
    <div class="step-3-details">
      <span>Analytics</span>
      <span>Monitoring</span>
      <span>Marketing</span>
    </div>
  </div>
</section>

<style>
  .steps-section {
    height: 100vh;
    display: grid;
    place-items: center;
    position: relative;
    overflow: hidden;
  }
  .steps-section > div {
    position: absolute;
    text-align: center;
  }
</style>
```

**`pinSpacing`:** By default, ScrollTrigger adds padding below the pinned element to prevent content from overlapping. Set `pinSpacing: false` if you want content to scroll underneath the pinned element (useful for overlay effects).

## Batch Animations

`ScrollTrigger.batch()` creates efficient scroll-triggered animations for many elements. Instead of creating individual ScrollTriggers for each card or list item, batch processes them together:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let container: HTMLElement;

  onMount(() => {
    // Set initial state
    gsap.set('.card', { y: 60, opacity: 0 });

    // Batch triggers — animate cards in groups as they enter the viewport
    ScrollTrigger.batch('.card', {
      onEnter: (elements) => {
        gsap.to(elements, {
          y: 0,
          opacity: 1,
          duration: 0.6,
          stagger: 0.1,       // Stagger within each batch
          ease: 'power2.out',
          overwrite: true
        });
      },
      onLeaveBack: (elements) => {
        gsap.to(elements, {
          y: 60,
          opacity: 0,
          duration: 0.4,
          stagger: 0.05,
          overwrite: true
        });
      },
      start: 'top 85%',
      // How often to check for new elements entering (in pixels)
      batchMax: 4           // Max elements per batch
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  });
</script>

<div bind:this={container} class="card-grid">
  {#each { length: 20 } as _, i}
    <div class="card">Card {i + 1}</div>
  {/each}
</div>

<style>
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 1.5rem;
    padding: 2rem;
  }
  .card {
    padding: 2rem;
    background: white;
    border-radius: 0.75rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
</style>
```

**Why batch instead of individual ScrollTriggers?** Performance. 100 cards with individual ScrollTriggers means 100 scroll event listeners calculating positions on every frame. Batch consolidates them into a single observer that checks which elements are in view, then fires callbacks for groups.

## Horizontal Scrolling

Horizontal scroll sections are a popular pattern where the user scrolls vertically but content moves horizontally. This is achieved by pinning a container and translating its content sideways:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;
  let track: HTMLElement;

  onMount(() => {
    // Calculate how far to scroll horizontally
    const panels = gsap.utils.toArray<HTMLElement>('.panel');
    const totalWidth = panels.reduce((w, panel) => w + panel.offsetWidth, 0);
    const scrollDistance = totalWidth - window.innerWidth;

    gsap.to(track, {
      x: -scrollDistance,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: () => `+=${scrollDistance}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,  // Recalculate on resize
        anticipatePin: 1            // Prevents a brief flicker when pinning starts
      }
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  });
</script>

<section bind:this={section} class="horizontal-section">
  <div bind:this={track} class="horizontal-track">
    <div class="panel" style="background: #1a1a2e;">
      <h2>Panel One</h2>
      <p>Introduction to the concept.</p>
    </div>
    <div class="panel" style="background: #16213e;">
      <h2>Panel Two</h2>
      <p>Deeper exploration of the idea.</p>
    </div>
    <div class="panel" style="background: #0f3460;">
      <h2>Panel Three</h2>
      <p>Practical applications.</p>
    </div>
    <div class="panel" style="background: #533483;">
      <h2>Panel Four</h2>
      <p>Conclusion and next steps.</p>
    </div>
  </div>
</section>

<style>
  .horizontal-section {
    overflow: hidden;
    height: 100vh;
  }
  .horizontal-track {
    display: flex;
    height: 100%;
    width: max-content;
  }
  .panel {
    width: 100vw;
    height: 100vh;
    display: grid;
    place-items: center;
    color: white;
    flex-shrink: 0;
  }
</style>
```

**`invalidateOnRefresh: true`** is critical for horizontal scrolling. When the user resizes the browser, the total width changes and all calculations need to update. Without this flag, the animation uses stale width values.

**`anticipatePin: 1`** tells ScrollTrigger to start the pin slightly early, preventing a visual jump that can occur on mobile devices or at high scroll speeds.

## Parallax Effects

Parallax creates depth by moving background elements slower than foreground elements. ScrollTrigger makes this straightforward:

```svelte
<script lang="ts">
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';
  import { onMount } from 'svelte';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    // Background moves slower (parallax effect)
    gsap.to('.parallax-bg', {
      y: -200,  // Moves up slower than scroll
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true
      }
    });

    // Foreground text moves faster
    gsap.to('.parallax-text', {
      y: -100,
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top bottom',
        end: 'bottom top',
        scrub: true
      }
    });

    // Floating elements at different speeds create layers of depth
    gsap.utils.toArray<HTMLElement>('.floating').forEach((el, i) => {
      const speed = 50 + (i * 30); // Each element moves at a different speed
      gsap.to(el, {
        y: -speed,
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    return () => ScrollTrigger.getAll().forEach(st => st.kill());
  });
</script>

<section bind:this={section} class="parallax-section">
  <div class="parallax-bg">
    <img src="/mountains-bg.jpg" alt="" aria-hidden="true" />
  </div>
  <div class="floating" style="top: 20%; left: 10%;">Cloud 1</div>
  <div class="floating" style="top: 40%; left: 60%;">Cloud 2</div>
  <div class="floating" style="top: 60%; left: 30%;">Cloud 3</div>
  <h2 class="parallax-text">Discover the Mountain</h2>
</section>

<style>
  .parallax-section {
    position: relative;
    height: 100vh;
    overflow: hidden;
  }
  .parallax-bg {
    position: absolute;
    inset: -100px 0;  /* Extra height for parallax movement */
  }
  .parallax-bg img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .floating {
    position: absolute;
    color: white;
    font-size: 1.5rem;
  }
  .parallax-text {
    position: relative;
    z-index: 1;
    color: white;
    text-align: center;
    padding-top: 40vh;
    font-size: 3rem;
  }
</style>
```

**Parallax tip:** The background image container needs extra height (negative inset or oversized dimensions) to prevent gaps from appearing as the image moves. If the image moves 200px, the container needs at least 200px of extra height.

## ScrollTrigger + SvelteKit Navigation Cleanup

This is one of the most common bugs in SvelteKit projects that use GSAP. When the user navigates to a new page, SvelteKit destroys the old page component and mounts the new one. But ScrollTrigger instances created by the old component are still listening for scroll events and targeting elements that no longer exist. This causes:

- Memory leaks (ScrollTriggers accumulate with every navigation)
- Console errors (animations target removed DOM elements)
- Janky behavior (old ScrollTriggers interfere with new ones)

**Solution: `gsap.context()` with cleanup in `onMount`:**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let container: HTMLElement;

  onMount(() => {
    // gsap.context() scopes all animations and ScrollTriggers
    // created inside the callback to the container element
    const ctx = gsap.context(() => {
      // All selectors like '.card' are scoped to container
      gsap.from('.card', {
        y: 60,
        opacity: 0,
        stagger: 0.15,
        scrollTrigger: {
          trigger: '.card-grid',
          start: 'top 80%'
        }
      });

      gsap.to('.progress', {
        scaleX: 1,
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true
        }
      });
    }, container); // Second argument scopes selectors to this DOM subtree

    // When the component is destroyed (page navigation), revert everything
    return () => ctx.revert();
  });
</script>

<div bind:this={container}>
  <div class="progress"></div>
  <div class="card-grid">
    <div class="card">Card 1</div>
    <div class="card">Card 2</div>
    <div class="card">Card 3</div>
  </div>
</div>
```

**`ctx.revert()` does three things:**
1. Kills all tweens and ScrollTriggers created inside the context
2. Resets all animated CSS properties to their original values
3. Removes all event listeners added by ScrollTrigger

This is far more reliable than manually tracking and killing individual ScrollTriggers.

### Refreshing After Navigation

When SvelteKit navigates to a new page, the DOM changes and scroll positions reset. If you have a layout-level ScrollTrigger (like a progress bar in the layout), it needs to recalculate after navigation:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  afterNavigate(() => {
    // Give the DOM time to settle, then recalculate all ScrollTrigger positions
    // The timeout is needed because SvelteKit may still be updating the DOM
    setTimeout(() => {
      ScrollTrigger.refresh();
    }, 100);
  });

  let { children } = $props();
</script>

{@render children()}
```

## Lazy Loading with ScrollTrigger

Use ScrollTrigger to load heavy content (images, iframes, components) only when the user scrolls near them:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let container: HTMLElement;
  let videoLoaded = $state(false);
  let heavyComponentLoaded = $state(false);
  let HeavyComponent: any = $state(null);

  onMount(() => {
    const ctx = gsap.context(() => {
      // Load video when it is 200px from entering the viewport
      ScrollTrigger.create({
        trigger: '.video-placeholder',
        start: 'top bottom+=200', // 200px before it enters the viewport
        once: true,              // Trigger only once — do not unload when scrolling back
        onEnter: () => {
          videoLoaded = true;
        }
      });

      // Dynamically import a heavy component when its container is near
      ScrollTrigger.create({
        trigger: '.chart-container',
        start: 'top bottom+=300',
        once: true,
        onEnter: async () => {
          const module = await import('$lib/components/HeavyChart.svelte');
          HeavyComponent = module.default;
          heavyComponentLoaded = true;
        }
      });
    }, container);

    return () => ctx.revert();
  });
</script>

<div bind:this={container}>
  <div class="video-placeholder">
    {#if videoLoaded}
      <iframe
        src="https://www.youtube.com/embed/abc123"
        title="Demo video"
        width="560"
        height="315"
        frameborder="0"
        allow="accelerometer; autoplay; encrypted-media; gyroscope"
        allowfullscreen
      ></iframe>
    {:else}
      <div class="placeholder">
        <p>Video loads when you scroll here</p>
      </div>
    {/if}
  </div>

  <div class="chart-container">
    {#if heavyComponentLoaded && HeavyComponent}
      <HeavyComponent />
    {:else}
      <div class="skeleton chart-skeleton"></div>
    {/if}
  </div>
</div>
```

The `once: true` option makes the ScrollTrigger fire only on the first enter, then automatically remove itself. This is perfect for lazy loading — you do not want to unload the video when the user scrolls back up.

## ScrollTrigger Callbacks and Events

ScrollTrigger provides callbacks for monitoring scroll state:

```typescript
ScrollTrigger.create({
  trigger: section,
  start: 'top center',
  end: 'bottom center',

  onEnter: (self) => {
    console.log('Entered from above');
    // self.progress gives current progress (0 to 1)
    // self.direction gives 1 (forward) or -1 (backward)
  },
  onLeave: (self) => {
    console.log('Left from below');
  },
  onEnterBack: (self) => {
    console.log('Re-entered from below (scrolling back up)');
  },
  onLeaveBack: (self) => {
    console.log('Left from above (scrolling back up)');
  },
  onUpdate: (self) => {
    // Fires on every scroll frame while active
    console.log(`Progress: ${(self.progress * 100).toFixed(1)}%`);
    console.log(`Direction: ${self.direction === 1 ? 'down' : 'up'}`);
    console.log(`Velocity: ${self.getVelocity()}px/s`);
  },
  onToggle: (self) => {
    // Fires when active state changes (enter or leave)
    console.log(`Active: ${self.isActive}`);
  },
  onRefresh: (self) => {
    // Fires when ScrollTrigger recalculates (window resize, etc.)
    console.log('Positions recalculated');
  }
});
```

## Complete Scroll-Driven Landing Page

Here is a production-quality landing page combining multiple ScrollTrigger techniques:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { gsap } from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let page: HTMLElement;

  onMount(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      gsap.set('.animate', { clearProps: 'all' });
      return;
    }

    const ctx = gsap.context(() => {
      // --- PAGE PROGRESS BAR ---
      gsap.to('.page-progress', {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: page,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true
        }
      });

      // --- HERO PARALLAX ---
      gsap.to('.hero-bg', {
        y: -150,
        ease: 'none',
        scrollTrigger: {
          trigger: '.hero',
          start: 'top top',
          end: 'bottom top',
          scrub: true
        }
      });

      // --- FEATURES: BATCH REVEAL ---
      gsap.set('.feature-card', { y: 80, opacity: 0 });

      ScrollTrigger.batch('.feature-card', {
        onEnter: (elements) => {
          gsap.to(elements, {
            y: 0,
            opacity: 1,
            duration: 0.8,
            stagger: 0.15,
            ease: 'power3.out'
          });
        },
        start: 'top 85%',
        batchMax: 3
      });

      // --- HOW IT WORKS: PINNED STEP-THROUGH ---
      const stepsTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.steps-section',
          start: 'top top',
          end: '+=2000',
          pin: true,
          scrub: 1
        }
      });

      stepsTl
        .from('.step-1', { opacity: 0, x: -50, duration: 1 })
        .from('.step-1-image', { opacity: 0, x: 50, duration: 1 }, '<')
        .to('.step-1', { opacity: 0, duration: 0.5 }, '+=0.5')
        .to('.step-1-image', { opacity: 0, duration: 0.5 }, '<')
        .from('.step-2', { opacity: 0, x: -50, duration: 1 })
        .from('.step-2-image', { opacity: 0, x: 50, duration: 1 }, '<')
        .to('.step-2', { opacity: 0, duration: 0.5 }, '+=0.5')
        .to('.step-2-image', { opacity: 0, duration: 0.5 }, '<')
        .from('.step-3', { opacity: 0, y: 50, duration: 1 })
        .from('.step-3-details', { opacity: 0, stagger: 0.2, duration: 0.5 }, '-=0.5');

      // --- TESTIMONIALS: HORIZONTAL SCROLL ---
      const cards = gsap.utils.toArray<HTMLElement>('.testimonial');
      if (cards.length > 0) {
        const totalWidth = cards.reduce(
          (sum, card) => sum + card.offsetWidth + 24, 0
        );

        gsap.to('.testimonials-track', {
          x: () => -(totalWidth - window.innerWidth + 48),
          ease: 'none',
          scrollTrigger: {
            trigger: '.testimonials-section',
            start: 'top top',
            end: () => `+=${totalWidth}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1
          }
        });
      }

      // --- STATS: NUMBER COUNTER ---
      gsap.from('.stat-value', {
        textContent: 0,
        duration: 2,
        snap: { textContent: 1 },
        stagger: 0.3,
        scrollTrigger: {
          trigger: '.stats-section',
          start: 'top 75%',
          toggleActions: 'play none none none'
        }
      });

      // --- CTA: REVEAL ---
      gsap.from('.cta-section', {
        y: 60,
        opacity: 0,
        duration: 1,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: '.cta-section',
          start: 'top 85%',
          toggleActions: 'play none none none'
        }
      });
    }, page);

    return () => ctx.revert();
  });
</script>

<div bind:this={page}>
  <div class="page-progress"></div>

  <section class="hero">
    <div class="hero-bg">
      <img src="/hero-bg.jpg" alt="" aria-hidden="true" />
    </div>
    <div class="hero-content">
      <h1>Build Faster</h1>
      <p>Ship production apps in weeks, not months.</p>
      <a href="/signup" class="btn">Start Free Trial</a>
    </div>
  </section>

  <section class="features-section">
    <h2>Features</h2>
    <div class="feature-grid">
      <div class="feature-card">Performance</div>
      <div class="feature-card">Security</div>
      <div class="feature-card">Scalability</div>
      <div class="feature-card">Developer Experience</div>
      <div class="feature-card">Type Safety</div>
      <div class="feature-card">Edge Deployment</div>
    </div>
  </section>

  <section class="steps-section">
    <div class="step-1"><h3>1. Design</h3></div>
    <div class="step-1-image"><img src="/step1.png" alt="Design step" /></div>
    <div class="step-2"><h3>2. Build</h3></div>
    <div class="step-2-image"><img src="/step2.png" alt="Build step" /></div>
    <div class="step-3"><h3>3. Deploy</h3></div>
    <div class="step-3-details">
      <span>CDN</span><span>Edge</span><span>Monitoring</span>
    </div>
  </section>

  <section class="testimonials-section">
    <div class="testimonials-track">
      <div class="testimonial">Testimonial 1</div>
      <div class="testimonial">Testimonial 2</div>
      <div class="testimonial">Testimonial 3</div>
      <div class="testimonial">Testimonial 4</div>
      <div class="testimonial">Testimonial 5</div>
    </div>
  </section>

  <section class="stats-section">
    <div><span class="stat-value">10000</span> Users</div>
    <div><span class="stat-value">500</span> Projects</div>
    <div><span class="stat-value">99</span>% Uptime</div>
  </section>

  <section class="cta-section">
    <h2>Ready to start building?</h2>
    <a href="/signup" class="btn">Get Started Free</a>
  </section>
</div>

<style>
  .page-progress {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 3px;
    background: #ff3e00;
    transform-origin: left;
    transform: scaleX(0);
    z-index: 1000;
  }
  .hero {
    height: 100vh;
    position: relative;
    display: grid;
    place-items: center;
    overflow: hidden;
  }
  .hero-bg {
    position: absolute;
    inset: -150px 0 0 0;
  }
  .hero-bg img {
    width: 100%;
    height: calc(100% + 150px);
    object-fit: cover;
  }
  .hero-content {
    position: relative;
    z-index: 1;
    text-align: center;
    color: white;
  }
  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
    padding: 2rem;
  }
  .steps-section {
    height: 100vh;
    display: grid;
    place-items: center;
    position: relative;
  }
  .steps-section > div {
    position: absolute;
  }
  .testimonials-section {
    overflow: hidden;
    height: 100vh;
  }
  .testimonials-track {
    display: flex;
    gap: 1.5rem;
    height: 100%;
    align-items: center;
    padding: 0 2rem;
  }
  .testimonial {
    min-width: 400px;
    padding: 2rem;
    background: white;
    border-radius: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    flex-shrink: 0;
  }
</style>
```

## Try It

Build a long-scrolling landing page with at least five sections that use different ScrollTrigger techniques:

1. A **hero section** with a parallax background image (background moves slower than foreground)
2. A **features grid** using `ScrollTrigger.batch()` to reveal cards in groups as they enter the viewport
3. A **pinned step-through section** that stays fixed while 3 steps animate in and out, driven by scrub
4. A **stats section** with numbers that count up from 0 when scrolled into view (using `toggleActions`, not scrub)
5. A fixed **progress bar** at the top that fills based on total page scroll

Requirements:
- Use `gsap.context()` for all animations with proper cleanup in `onMount`
- Add `markers: true` during development, then remove them when you are satisfied with the timing
- Respect `prefers-reduced-motion` — make all content visible without animation for users who need it
- Use `invalidateOnRefresh: true` on any ScrollTrigger that depends on element dimensions
- Test SvelteKit navigation: navigate away from the page and back, confirming no console errors or stale ScrollTriggers

## Key Takeaways

- **ScrollTrigger** connects GSAP animations to scroll position — either triggering them at a point (`toggleActions`) or driving them with scroll (`scrub`)
- Register the plugin with `gsap.registerPlugin(ScrollTrigger)` before use
- `start` and `end` define the scroll range using `"element-position viewport-position"` format — use `markers: true` to visualize them during development
- **`scrub: true`** links animation progress directly to scroll position (parallax, progress bars). **`scrub: 0.5`** adds smoothing lag for a polished feel
- **`toggleActions`** controls what happens at four moments (enter, leave, enterBack, leaveBack) — use for reveal animations that should play at designed speed
- **`pin: true`** locks an element in place for a scroll distance — combine with scrub and timelines for step-through sections
- **`ScrollTrigger.batch()`** efficiently animates many elements by grouping them instead of creating individual ScrollTriggers
- **Horizontal scrolling** pins a section and translates content sideways using `x` + scrub. Use `invalidateOnRefresh` and `anticipatePin` for responsive behavior
- **Parallax** moves layers at different speeds using scrub with different `y` values. Background containers need extra height to prevent gaps
- **SvelteKit cleanup** is critical: use `gsap.context()` and return `ctx.revert()` from `onMount` to prevent memory leaks and ghost animations during client-side navigation
- **`ScrollTrigger.refresh()`** recalculates all positions — call it after layout changes or SvelteKit navigation
- Always **respect `prefers-reduced-motion`** — skip all scroll animations and show content immediately for users who need it
