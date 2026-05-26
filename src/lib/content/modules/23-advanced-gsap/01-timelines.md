# GSAP Timelines

Individual `gsap.to()` and `gsap.from()` calls work well for single animations, but real interfaces need sequences — a heading slides in, then a subtitle fades up, then buttons appear one by one. **Timelines** let you chain animations together into a coordinated sequence with precise timing control.

A timeline is a container for multiple tweens. It plays them in order by default, and gives you methods to control the entire sequence as a single unit — play, pause, reverse, restart, seek to any point, adjust speed, or kill it entirely. Think of a timeline like a video editor's track: you arrange clips (tweens) on the track and control when each clip starts relative to the others.

The mental model: without timelines, you are forced to use `delay` to stagger animations. That approach breaks the moment you change one animation's duration — every subsequent delay must be recalculated. Timelines solve this by defining relationships between animations, not absolute times.

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

Each `.from()` call plays after the previous one finishes. The subtitle waits for the title (0.8s), and the button waits for the subtitle (0.6s more). The total timeline duration is 1.8s. Change the title's duration to 1.2s and everything downstream adjusts automatically — no delay math needed.

## The Position Parameter System

The position parameter is the third argument to any tween method on a timeline. It is the most powerful feature of GSAP timelines and what separates amateur animations from professional ones. Without it, tweens play sequentially. With it, you control exact overlap, gaps, and synchronization.

### Relative Offsets

```typescript
const tl = gsap.timeline();

// Sequential (default) — each waits for the previous to finish
tl.from('.title', { y: 50, opacity: 0, duration: 0.8 })

  // "-=0.2" — start 0.2s BEFORE the previous tween ends (overlap)
  .from('.subtitle', { y: 30, opacity: 0, duration: 0.6 }, '-=0.2')

  // "+=0.3" — start 0.3s AFTER the previous tween ends (gap)
  .from('.button', { y: 20, opacity: 0, duration: 0.4 }, '+=0.3')

  // Absolute time — start at exactly 0.5s into the timeline
  .from('.badge', { scale: 0, duration: 0.3 }, 0.5);
```

### The `<` and `>` Operators

These operators are relative to the **previous tween's start** (`<`) or **end** (`>`), respectively:

```typescript
const tl = gsap.timeline();

tl.from('.title', { y: 50, opacity: 0, duration: 0.8 })
  // "<" — start at the same time as the previous tween (simultaneous)
  .from('.bg-overlay', { opacity: 0, duration: 1.0 }, '<')

  // "<0.2" — start 0.2s after the previous tween STARTS
  .from('.subtitle', { y: 30, opacity: 0, duration: 0.6 }, '<0.2')

  // ">" — start when the previous tween ENDS (same as default sequential)
  .from('.button', { scale: 0.8, opacity: 0, duration: 0.4 }, '>')

  // ">-0.1" — start 0.1s before the previous tween ends
  .from('.icon', { rotate: -90, opacity: 0, duration: 0.3 }, '>-0.1');
```

The `<` operator is extremely useful for creating groups of simultaneous animations within a sequence. Without it, you would need labels or absolute times.

### Position Parameter Reference Table

| Value | Meaning | Use Case |
|-------|---------|----------|
| `(none)` | After previous tween ends | Sequential animations |
| `"-=0.2"` | 0.2s before previous ends | Slight overlap for smoothness |
| `"+=0.3"` | 0.3s after previous ends | Dramatic pause between steps |
| `0.5` | At absolute time 0.5s | Sync to a specific moment |
| `"<"` | Same start time as previous | Simultaneous group |
| `"<0.3"` | 0.3s after previous starts | Staggered simultaneous start |
| `">"` | When previous ends | Explicit sequential (same as default) |
| `">-0.1"` | 0.1s before previous ends | Slight overlap |
| `"myLabel"` | At a named label | Sync to a named milestone |
| `"myLabel+=0.5"` | 0.5s after a label | Offset from milestone |

## Labels

Labels mark positions in the timeline that you can reference by name. They make complex timelines readable and maintainable — you name the milestone, not calculate its time:

```typescript
const tl = gsap.timeline();

// Phase 1: Header reveals
tl.from('.header', { y: -100, duration: 0.5 })
  .from('.nav-link', { y: -20, opacity: 0, stagger: 0.1, duration: 0.3 }, '-=0.2')
  .addLabel('headerDone')

  // Phase 2: Layout appears — sidebar and content start together from the label
  .from('.sidebar', { x: -200, opacity: 0, duration: 0.5 }, 'headerDone')
  .from('.content', { opacity: 0, duration: 0.5 }, 'headerDone')
  .from('.content-image', { scale: 0.8, opacity: 0, duration: 0.4 }, 'headerDone+=0.2')
  .addLabel('layoutReady')

  // Phase 3: Footer and decorative elements
  .from('.footer', { y: 50, opacity: 0, duration: 0.3 }, 'layoutReady')
  .from('.decorative-dots', { scale: 0, stagger: 0.05, duration: 0.2 }, 'layoutReady+=0.1');
```

Both `.sidebar` and `.content` start at the "headerDone" label, so they animate simultaneously after the header finishes. The content image starts 0.2s later. Labels let you rearrange phases without recalculating any timing.

## Nested Timelines

Complex animations benefit from nesting: each section of your page gets its own timeline, and a master timeline orchestrates them. This mirrors component architecture — each component manages its own animation, and the parent coordinates.

```typescript
function createHeroTimeline(): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.from('.hero-bg', { scale: 1.2, opacity: 0, duration: 1.0 })
    .from('.hero-title', { y: 60, opacity: 0, duration: 0.8 }, '-=0.4')
    .from('.hero-subtitle', { y: 30, opacity: 0, duration: 0.6 }, '-=0.3')
    .from('.hero-cta', { y: 20, scale: 0.9, opacity: 0, duration: 0.5 }, '-=0.2');
  return tl;
}

function createFeaturesTimeline(): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.from('.features-title', { y: 40, opacity: 0, duration: 0.6 })
    .from('.feature-card', {
      y: 60,
      opacity: 0,
      duration: 0.5,
      stagger: { each: 0.15, from: 'start' }
    }, '-=0.2');
  return tl;
}

function createTestimonialsTimeline(): gsap.core.Timeline {
  const tl = gsap.timeline();
  tl.from('.testimonial-heading', { opacity: 0, duration: 0.4 })
    .from('.testimonial-card', {
      x: 100,
      opacity: 0,
      duration: 0.6,
      stagger: 0.2
    }, '-=0.1');
  return tl;
}

// Master timeline orchestrates everything
const master = gsap.timeline();
master
  .add(createHeroTimeline())
  .add(createFeaturesTimeline(), '-=0.3')   // Overlap with hero ending
  .add(createTestimonialsTimeline(), '+=0.2'); // Gap after features
```

**Advantages of nesting:**
- Each section's animation is independently testable and reusable
- You can pass a nested timeline to ScrollTrigger to trigger it on scroll
- Changes inside a nested timeline do not require changes to the master
- You can develop and iterate on each section independently

## Playback Control

Timelines provide methods to control playback, making them ideal for interactive animations:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  let tl: gsap.core.Timeline;
  let progress = $state(0);
  let timeScale = $state(1);

  onMount(() => {
    tl = gsap.timeline({ paused: true });

    tl.from('.card', { y: 100, opacity: 0, duration: 0.5, stagger: 0.1 })
      .from('.cta', { scale: 0.8, opacity: 0, duration: 0.3 })
      .from('.sparkle', { scale: 0, rotation: 180, duration: 0.4, stagger: 0.05 });

    // Track progress for the slider
    tl.eventCallback('onUpdate', () => {
      progress = tl.progress() * 100;
    });
  });

  function play() { tl.play(); }
  function pause() { tl.pause(); }
  function reverse() { tl.reverse(); }
  function restart() { tl.restart(); }
  function seekTo(pct: number) { tl.progress(pct / 100).pause(); }
  function setSpeed(speed: number) {
    timeScale = speed;
    tl.timeScale(speed);
  }
</script>

<div class="controls">
  <button onclick={play}>Play</button>
  <button onclick={pause}>Pause</button>
  <button onclick={reverse}>Reverse</button>
  <button onclick={restart}>Restart</button>

  <label>
    Progress
    <input
      type="range"
      min="0"
      max="100"
      value={progress}
      oninput={(e) => seekTo(Number(e.currentTarget.value))}
    />
  </label>

  <label>
    Speed
    <select onchange={(e) => setSpeed(Number(e.currentTarget.value))}>
      <option value="0.25">0.25x</option>
      <option value="0.5">0.5x</option>
      <option value="1" selected>1x</option>
      <option value="2">2x</option>
      <option value="4">4x</option>
    </select>
  </label>
</div>
```

Create the timeline with `{ paused: true }` so it waits for a trigger instead of playing immediately. This is essential for scroll-triggered, button-triggered, or state-driven animations.

### Key Playback Methods

| Method | Description |
|--------|-------------|
| `.play()` | Play forward from current position |
| `.pause()` | Freeze at current position |
| `.reverse()` | Play backward from current position |
| `.restart()` | Jump to start and play forward |
| `.seek(time)` | Jump to a specific time (in seconds) |
| `.progress(0.5)` | Jump to 50% through the timeline |
| `.timeScale(2)` | Play at 2x speed |
| `.kill()` | Destroy the timeline and free memory |
| `.invalidate()` | Clear cached values (useful after DOM changes) |
| `.totalDuration()` | Get the total duration including repeats |

## Timeline Callbacks

Timelines support callbacks at key moments:

```typescript
const tl = gsap.timeline({
  paused: true,
  onStart: () => console.log('Timeline started'),
  onComplete: () => {
    console.log('Timeline finished');
    // Enable a button, navigate, or trigger the next animation
  },
  onReverseComplete: () => {
    console.log('Reverse finished — back to the beginning');
  },
  onUpdate: () => {
    // Fires on every frame — use sparingly
    // Good for updating a progress indicator
  },
  onRepeat: () => {
    console.log('Timeline looped');
  },
  // Repeat 2 more times (3 total plays)
  repeat: 2,
  // Alternate direction on each repeat (ping-pong)
  yoyo: true,
  // 0.5s pause between repeats
  repeatDelay: 0.5
});
```

Individual tweens also accept callbacks:

```typescript
tl.from('.title', {
  y: 50,
  opacity: 0,
  duration: 0.8,
  onStart: () => {
    // Add a CSS class when this specific tween starts
    document.querySelector('.title')?.classList.add('animating');
  },
  onComplete: () => {
    document.querySelector('.title')?.classList.remove('animating');
  }
});
```

## ScrollTrigger + Timeline

Combining timelines with ScrollTrigger creates scroll-driven animation sequences. The timeline defines the animation choreography, and ScrollTrigger controls when (and how) it plays:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: 'top 70%',     // Trigger when top of section hits 70% viewport
        end: 'bottom 30%',    // End when bottom of section hits 30% viewport
        scrub: 1,             // Smooth 1-second lag behind scroll position
        // toggleActions: 'play none none reverse'  // Alternative to scrub
      }
    });

    tl.from('.section-title', { y: 60, opacity: 0, duration: 0.5 })
      .from('.section-text', { y: 40, opacity: 0, duration: 0.4 }, '-=0.2')
      .from('.section-image', { x: 100, opacity: 0, duration: 0.6 }, '-=0.3')
      .from('.section-stat', {
        textContent: 0,
        duration: 1,
        snap: { textContent: 1 },
        stagger: 0.2
      }, '-=0.4');

    return () => {
      // Clean up on component destroy
      tl.kill();
      ScrollTrigger.getAll().forEach(st => st.kill());
    };
  });
</script>

<section bind:this={section} class="stats-section">
  <h2 class="section-title">Our Impact</h2>
  <p class="section-text">Trusted by thousands of developers worldwide.</p>
  <img class="section-image" src="/impact.jpg" alt="Impact visualization" />
  <div class="stats">
    <span class="section-stat">10000</span>
    <span class="section-stat">500</span>
    <span class="section-stat">98</span>
  </div>
</section>
```

**`scrub` vs `toggleActions`:**
- `scrub: true` (or `scrub: 1`) ties animation progress to scroll position. Scroll forward = animate forward. Scroll back = animate backward. The number is the smoothing lag in seconds.
- `toggleActions: 'play none none reverse'` plays the animation when entering and reverses when leaving. The animation plays at normal speed, not linked to scroll velocity.

Choose scrub for parallax-style effects where the user controls the pace. Choose toggleActions for reveal animations that should play at a consistent speed.

## Timeline Defaults

Set default properties that apply to every tween in the timeline, reducing repetition:

```typescript
const tl = gsap.timeline({
  defaults: {
    duration: 0.6,
    ease: 'power2.out',
    opacity: 0  // Every .from() starts at opacity 0
  }
});

// These tweens inherit duration (0.6), ease, and opacity (0) from defaults
tl.from('.title', { y: 50 })
  .from('.subtitle', { y: 30 })
  .from('.button', { y: 20, duration: 0.3 }); // Override duration for this one
```

Individual tweens can override any default value. This is especially useful when most of your animations share the same ease and opacity pattern.

## Staggering in Timelines

Animate multiple elements with a staggered delay:

```typescript
const tl = gsap.timeline();

// Simple stagger — each starts 0.1s after the previous
tl.from('.nav-link', {
  y: -20,
  opacity: 0,
  duration: 0.4,
  stagger: 0.1
})

// Advanced stagger configuration
.from('.card', {
  y: 50,
  opacity: 0,
  duration: 0.5,
  stagger: {
    each: 0.15,         // 0.15s between each element
    from: 'center',     // Animate from the center outward
    ease: 'power2.out', // Ease the stagger delay itself
    grid: 'auto'        // Auto-detect grid layout for 2D stagger
  }
})

// Grid stagger — animates in a wave across a 2D grid
.from('.grid-item', {
  scale: 0,
  opacity: 0,
  duration: 0.4,
  stagger: {
    each: 0.08,
    from: 'edges',      // Start from the edges, work inward
    grid: [4, 6],       // 4 rows, 6 columns
    axis: null          // Stagger in both directions (null = both)
  }
});
```

Stagger `from` options: `'start'` (default), `'end'`, `'center'`, `'edges'`, `'random'`, or an index number.

## Svelte Lifecycle Integration

GSAP creates DOM-manipulating objects that must be cleaned up when components are destroyed. Failing to clean up causes memory leaks and ghost animations that target elements that no longer exist.

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let section: HTMLElement;

  onMount(() => {
    // Create a GSAP context scoped to this component
    // All animations created inside this context are tracked
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top 80%',
          end: 'bottom 20%',
          toggleActions: 'play none none reverse'
        }
      });

      tl.from('.reveal', { y: 50, opacity: 0, stagger: 0.15, duration: 0.6 });

      // Any additional tweens or ScrollTriggers created here
      // are automatically tracked by the context
      gsap.to('.floating-element', {
        y: -20,
        duration: 2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut'
      });
    }, section); // Scope selectors to this component's container

    // Clean up everything when the component is destroyed
    return () => ctx.revert();
  });
</script>

<section bind:this={section}>
  <div class="reveal">First item</div>
  <div class="reveal">Second item</div>
  <div class="reveal">Third item</div>
  <div class="floating-element">I float</div>
</section>
```

**Why `gsap.context()` matters:**
1. **Scoped selectors:** `.reveal` only matches elements inside `section`, not other components that might have the same class
2. **Automatic cleanup:** `ctx.revert()` kills all tweens, ScrollTriggers, and resets all animated properties created inside the context
3. **SvelteKit navigation:** When SvelteKit navigates between pages, components are destroyed and recreated. Without cleanup, old ScrollTriggers pile up and cause janky behavior

### SvelteKit Navigation Cleanup

SvelteKit's client-side navigation means components mount and unmount as the user navigates. This requires extra care:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { beforeNavigate } from '$app/navigation';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let container: HTMLElement;

  onMount(() => {
    const ctx = gsap.context(() => {
      // ... your animations
    }, container);

    return () => ctx.revert();
  });

  // Also refresh ScrollTrigger after navigation completes
  // (new page content may have different heights)
  beforeNavigate(() => {
    // Kill ScrollTriggers that target elements about to be removed
    ScrollTrigger.getAll().forEach(st => {
      if (container?.contains(st.trigger as Element)) {
        st.kill();
      }
    });
  });
</script>
```

## Complete Multi-Section Landing Page Animation

Here is a production-quality landing page with coordinated animations across multiple sections:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';
  import { ScrollTrigger } from 'gsap/ScrollTrigger';

  gsap.registerPlugin(ScrollTrigger);

  let page: HTMLElement;

  onMount(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) {
      // Make everything visible without animation
      gsap.set('.animate', { opacity: 1, y: 0, x: 0, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      // --- HERO SECTION ---
      const heroTl = gsap.timeline({
        defaults: { ease: 'power3.out', duration: 0.8 }
      });

      heroTl
        .from('.hero-bg-shape', { scale: 0, rotation: 45, duration: 1.2 })
        .from('.hero-title span', { y: 80, opacity: 0, stagger: 0.1 }, '<0.3')
        .from('.hero-description', { y: 40, opacity: 0, duration: 0.6 }, '-=0.3')
        .from('.hero-cta', { y: 30, scale: 0.9, opacity: 0 }, '-=0.2')
        .from('.hero-image', { x: 100, opacity: 0, duration: 1 }, '<');

      // --- FEATURES SECTION (scroll-triggered) ---
      const featuresTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.features-section',
          start: 'top 75%',
          toggleActions: 'play none none none'
        },
        defaults: { ease: 'power2.out', duration: 0.6 }
      });

      featuresTl
        .from('.features-badge', { scale: 0, duration: 0.4 })
        .from('.features-title', { y: 40, opacity: 0 }, '-=0.1')
        .from('.feature-card', {
          y: 60,
          opacity: 0,
          stagger: {
            each: 0.15,
            from: 'start'
          }
        }, '-=0.2');

      // --- STATS SECTION (scrub-driven counter) ---
      const statsTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.stats-section',
          start: 'top 80%',
          end: 'center center',
          scrub: 1
        }
      });

      statsTl
        .from('.stats-container', { y: 40, opacity: 0, duration: 0.5 })
        .from('.stat-number', {
          textContent: 0,
          duration: 1.5,
          snap: { textContent: 1 },
          stagger: 0.3,
          ease: 'power2.out'
        }, '-=0.3');

      // --- TESTIMONIALS (horizontal scroll pin) ---
      const testimonialCards = gsap.utils.toArray<HTMLElement>('.testimonial-card');
      if (testimonialCards.length > 1) {
        const totalWidth = testimonialCards.reduce(
          (sum, card) => sum + card.offsetWidth + 32, 0  // 32px gap
        );

        gsap.to('.testimonials-track', {
          x: () => -(totalWidth - window.innerWidth + 64),
          ease: 'none',
          scrollTrigger: {
            trigger: '.testimonials-section',
            start: 'top top',
            end: () => `+=${totalWidth}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true
          }
        });
      }

      // --- CTA SECTION (final reveal) ---
      const ctaTl = gsap.timeline({
        scrollTrigger: {
          trigger: '.cta-section',
          start: 'top 80%',
          toggleActions: 'play none none none'
        }
      });

      ctaTl
        .from('.cta-bg', { scale: 0.9, opacity: 0, duration: 0.8 })
        .from('.cta-title', { y: 30, opacity: 0, duration: 0.6 }, '-=0.4')
        .from('.cta-button', { y: 20, scale: 0.8, opacity: 0, duration: 0.5 }, '-=0.2');
    }, page);

    return () => ctx.revert();
  });
</script>

<div bind:this={page}>
  <section class="hero-section">
    <div class="hero-bg-shape"></div>
    <div class="hero-content">
      <h1 class="hero-title">
        <span>Build</span> <span>Something</span> <span>Amazing</span>
      </h1>
      <p class="hero-description">
        The fastest way to ship production-ready web applications.
      </p>
      <button class="hero-cta">Get Started Free</button>
    </div>
    <img class="hero-image" src="/hero-screenshot.png" alt="App screenshot" />
  </section>

  <section class="features-section">
    <span class="features-badge">Features</span>
    <h2 class="features-title">Everything you need</h2>
    <div class="feature-cards">
      <div class="feature-card">Lightning Fast</div>
      <div class="feature-card">Fully Typed</div>
      <div class="feature-card">SEO Ready</div>
    </div>
  </section>

  <section class="stats-section">
    <div class="stats-container">
      <div><span class="stat-number">10000</span> Users</div>
      <div><span class="stat-number">500</span> Projects</div>
      <div><span class="stat-number">99</span>% Uptime</div>
    </div>
  </section>

  <section class="testimonials-section">
    <div class="testimonials-track">
      <div class="testimonial-card">Testimonial 1...</div>
      <div class="testimonial-card">Testimonial 2...</div>
      <div class="testimonial-card">Testimonial 3...</div>
      <div class="testimonial-card">Testimonial 4...</div>
    </div>
  </section>

  <section class="cta-section">
    <div class="cta-bg">
      <h2 class="cta-title">Ready to start?</h2>
      <button class="cta-button">Sign Up Now</button>
    </div>
  </section>
</div>
```

## Respecting Motion Preferences

Always check the user's motion preference before running complex timeline animations:

```typescript
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  // Show everything instantly — no animation
  gsap.set('.animate', { clearProps: 'all' });
} else {
  const tl = gsap.timeline();
  tl.from('.title', { y: 50, opacity: 0, duration: 0.8 })
    .from('.subtitle', { y: 30, opacity: 0, duration: 0.6 });
}
```

This is an accessibility requirement — not optional. Many users rely on reduced motion settings due to vestibular disorders, motion sensitivity, or personal preference.

> **Tip:** In Svelte 5.7+, you can use `prefersReducedMotion` from `svelte/motion` instead of the manual `window.matchMedia` call. It is a reactive boolean that updates automatically if the user changes their OS setting mid-session, and it avoids SSR issues since it is handled by the framework.

## Try It

Create an animated landing page with at least four sections:

1. **Hero:** Navbar slides down, background shape scales in, title words stagger from below (each word is a `<span>`), subtitle fades up overlapping with the last title word, and CTA button scales in
2. **Features:** Three cards stagger in from below when scrolled into view, using ScrollTrigger with `toggleActions`
3. **Stats:** Numbers count up from 0 using `textContent` animation with `snap`, driven by scrub
4. **CTA:** Final section reveals with a combined scale + fade

Requirements:
- Use nested timelines (one function per section, composed into a master timeline for the hero, individual scroll-triggered timelines for other sections)
- Add labels to mark the transition between hero phases
- Add play/pause/restart controls for the hero timeline
- Use `gsap.context()` for cleanup
- Respect `prefers-reduced-motion`
- Add a progress bar that scrubs with the overall page scroll

## Key Takeaways

- `gsap.timeline()` creates a sequence container for multiple animations — tweens play in order by default
- The **position parameter** is the core of timeline choreography: `"-=0.2"` overlaps, `"+=0.1"` gaps, `"<"` starts simultaneously with the previous, and absolute numbers pin to exact times
- **Labels** name positions for clarity: `"headerDone"` is more maintainable than calculating `0.8 + 0.3 + 0.1`
- **Nested timelines** mirror component architecture: each section manages its own animation, and a master timeline orchestrates them
- **Playback methods** (`.play()`, `.pause()`, `.reverse()`, `.progress()`, `.timeScale()`) give you full programmatic control over the entire sequence
- **Timeline defaults** eliminate repetition by setting shared `duration`, `ease`, and `opacity` values once
- **Callbacks** (`onStart`, `onComplete`, `onUpdate`, `onRepeat`) fire at key moments for triggering side effects
- **ScrollTrigger + Timeline** connects choreographed sequences to scroll position — use `scrub` for scroll-driven, `toggleActions` for scroll-triggered
- **`gsap.context()`** scopes selectors to a component and provides a single `.revert()` call that kills all tweens, ScrollTriggers, and resets properties — essential for SvelteKit navigation cleanup
- Always **respect motion preferences** — check `prefers-reduced-motion` and skip animations or show content instantly for users who need it
