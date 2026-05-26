# Page Transitions

Page transitions are the difference between "a website" and "an experience." Instead of a hard cut between pages — a blank white flash while the browser loads and renders — elements can fade, slide, morph, and cross-dissolve between states. Done well, page transitions communicate spatial relationships ("this page slides in from the right because it is deeper in the hierarchy"), maintain continuity (a thumbnail grows into a full-size image), and make your application feel instantaneous.

SvelteKit provides the `onNavigate` lifecycle function that integrates with the browser's **View Transitions API**, giving you native crossfade transitions with minimal code. For more sophisticated animations — sequenced exits and entrances, shared element morphing, staggered reveals — you can layer GSAP on top or replace the View Transitions API entirely.

This lesson covers both approaches, from zero-config view transitions to fully orchestrated GSAP page transition systems.

## How SvelteKit Navigation Works

Before diving into transitions, you need to understand what happens during a SvelteKit client-side navigation:

1. User clicks a link (or `goto()` is called)
2. SvelteKit fetches the new page's data (load functions run)
3. The current page's component is destroyed
4. The new page's component is created and rendered
5. The DOM updates

Steps 3-5 happen in a single synchronous tick — there is no built-in gap where you could play an exit animation. This is why you need either the View Transitions API (which snapshots the old state before the update) or a manual orchestration layer (which delays the navigation until your exit animation completes).

## The View Transitions API

The View Transitions API is a browser feature that creates a smooth visual transition between two DOM states. Here is how it works:

1. You call `document.startViewTransition(callback)`
2. The browser **screenshots the current page** (captures all elements into images)
3. Your callback runs, updating the DOM to the new state
4. The browser **screenshots the new page**
5. The browser cross-fades from old screenshots to new screenshots using CSS animations
6. Once the animations complete, the screenshots are removed and the live DOM is shown

SvelteKit integrates with this through `onNavigate`:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  let { children } = $props();

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
</nav>

<main>
  {@render children()}
</main>
```

Place this in your root layout to enable view transitions for every navigation in your app. With just this code, you get a default crossfade transition between pages.

**How the `onNavigate` integration works:** `onNavigate` receives a callback that runs before the navigation completes. By returning a Promise, you tell SvelteKit to wait before finalizing the navigation. Inside, `document.startViewTransition()` takes a callback that performs the actual DOM update. Calling `resolve()` lets SvelteKit proceed with the navigation, and `await navigation.complete` waits until the new page is fully rendered.

**Browser support:** as of 2025, View Transitions are supported in Chrome, Edge, and Safari. Firefox support is in progress. The `if (!document.startViewTransition) return;` check ensures graceful degradation — unsupported browsers get instant navigation without errors.

## Customizing Transition Animations with CSS

The default crossfade is fine, but you will want to customize the animation. The View Transitions API exposes CSS pseudo-elements for this:

```css
/* src/app.css */

/* The old page (outgoing) */
::view-transition-old(root) {
  animation: fade-out 0.25s ease-in forwards;
}

/* The new page (incoming) */
::view-transition-new(root) {
  animation: fade-in 0.3s ease-out forwards;
}

@keyframes fade-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.98); }
}

@keyframes fade-in {
  from { opacity: 0; transform: scale(1.02); }
  to { opacity: 1; transform: scale(1); }
}
```

`::view-transition-old(root)` is the screenshot of the old page, rendered as a pseudo-element on top of the new page. `::view-transition-new(root)` is the new page itself, initially hidden behind the old screenshot.

### Slide Transitions

Create a more dynamic slide effect:

```css
::view-transition-old(root) {
  animation: slide-out-left 0.3s ease-in forwards;
}

::view-transition-new(root) {
  animation: slide-in-right 0.3s ease-out forwards;
}

@keyframes slide-out-left {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-50px); opacity: 0; }
}

@keyframes slide-in-right {
  from { transform: translateX(50px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

### Direction-Aware Transitions

You can change the transition direction based on where the user is navigating. Store the navigation direction and use it to toggle a CSS class:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';
  import { page } from '$app/state';

  let { children } = $props();
  let direction = $state<'forward' | 'back'>('forward');

  // Track navigation direction based on URL path depth
  const pathSegments = $derived(page.url.pathname.split('/').filter(Boolean).length);
  let previousDepth = 0;

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    const newDepth = navigation.to?.url.pathname.split('/').filter(Boolean).length ?? 0;
    direction = newDepth >= previousDepth ? 'forward' : 'back';

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
        previousDepth = newDepth;
      });
    });
  });
</script>

<div class="page-wrapper" data-direction={direction}>
  {@render children()}
</div>
```

```css
/* Forward navigation: slide left */
[data-direction="forward"]::view-transition-old(root) {
  animation: slide-out-left 0.3s ease-in;
}
[data-direction="forward"]::view-transition-new(root) {
  animation: slide-in-right 0.3s ease-out;
}

/* Backward navigation: slide right */
[data-direction="back"]::view-transition-old(root) {
  animation: slide-out-right 0.3s ease-in;
}
[data-direction="back"]::view-transition-new(root) {
  animation: slide-in-left 0.3s ease-out;
}

@keyframes slide-out-right {
  to { transform: translateX(50px); opacity: 0; }
}
@keyframes slide-in-left {
  from { transform: translateX(-50px); opacity: 0; }
}
```

## Named View Transitions — Shared Element Morphing

The most visually impressive feature of the View Transitions API: when the same `view-transition-name` exists on both the old and new pages, the browser morphs the element from its old position, size, and style to its new one. The image slides and resizes, the title moves — creating a seamless continuity between pages.

```svelte
<!-- src/routes/blog/+page.svelte — Blog list page -->
<script lang="ts">
  let { data } = $props();
</script>

<div class="blog-grid">
  {#each data.posts as post}
    <a href="/blog/{post.slug}" class="post-card">
      <img
        src={post.image}
        alt={post.title}
        style="view-transition-name: post-image-{post.slug};"
      />
      <h2 style="view-transition-name: post-title-{post.slug};">{post.title}</h2>
      <p>{post.excerpt}</p>
    </a>
  {/each}
</div>

<style>
  .blog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 2rem;
    padding: 2rem;
  }

  .post-card {
    text-decoration: none;
    color: inherit;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid hsl(210, 15%, 88%);
    transition: box-shadow 0.2s;
  }

  .post-card:hover {
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }

  .post-card img {
    width: 100%;
    height: 200px;
    object-fit: cover;
  }

  .post-card h2 {
    padding: 0 1.5rem;
    font-size: 1.25rem;
  }

  .post-card p {
    padding: 0 1.5rem 1.5rem;
    color: hsl(210, 10%, 45%);
  }
</style>
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte — Blog detail page -->
<script lang="ts">
  let { data } = $props();
</script>

<article class="post-detail">
  <img
    src={data.post.image}
    alt={data.post.title}
    style="view-transition-name: post-image-{data.post.slug};"
  />
  <h1 style="view-transition-name: post-title-{data.post.slug};">{data.post.title}</h1>
  <div class="post-body">
    {@html data.post.content}
  </div>
</article>

<style>
  .post-detail img {
    width: 100%;
    height: 400px;
    object-fit: cover;
    border-radius: 12px;
  }

  .post-detail h1 {
    font-size: 2.5rem;
    margin: 1.5rem 0;
  }

  .post-body {
    line-height: 1.8;
    font-size: 1.125rem;
    max-width: 700px;
  }
</style>
```

When navigating from the list to the detail page, the browser automatically:
1. Identifies matching `view-transition-name` values
2. Measures the old element's position, size, and transform
3. Measures the new element's position, size, and transform
4. Animates from old to new with a smooth morph

**Critical rule:** `view-transition-name` values must be unique across the **entire page**. If two visible elements have the same name, the transition breaks. This is why we append the slug: `post-image-{post.slug}`.

### Customizing the morph animation

You can override the default morph with custom CSS:

```css
::view-transition-old(post-image-*) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

::view-transition-new(post-image-*) {
  animation-duration: 0.4s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}
```

## GSAP-Powered Page Transitions

For transitions that go beyond what CSS can do — sequenced multi-step animations, physics-based easing, complex choreography — GSAP gives you full programmatic control.

### Exit-then-Enter Pattern

The simplest GSAP transition: animate the current page out, navigate, then animate the new page in:

```svelte
<!-- src/lib/components/TransitionLink.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import gsap from 'gsap';

  let { href, children } = $props();
  let navigating = $state(false);

  async function handleClick(e: MouseEvent) {
    e.preventDefault();
    if (navigating) return;
    navigating = true;

    // Exit animation
    await gsap.to('.page-content', {
      opacity: 0,
      y: -30,
      duration: 0.35,
      ease: 'power2.in'
    });

    // Navigate (SvelteKit handles the data loading)
    await goto(href);

    // The new page's onMount handles the entrance animation
    navigating = false;
  }
</script>

<a {href} onclick={handleClick}>
  {@render children()}
</a>
```

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  onMount(() => {
    // Entrance animation
    gsap.from('.page-content', {
      opacity: 0,
      y: 30,
      duration: 0.4,
      ease: 'power2.out'
    });

    // Stagger in child elements for a polished effect
    gsap.from('.page-content > *', {
      opacity: 0,
      y: 20,
      stagger: 0.08,
      duration: 0.4,
      delay: 0.1,
      ease: 'power2.out'
    });
  });
</script>

<div class="page-content">
  <h1>About Us</h1>
  <p>We build tools for developers.</p>
  <p>Our mission is to make the web faster.</p>
</div>
```

### Transition Coordinator

For a more robust system, create a transition coordinator that manages the exit/enter lifecycle:

```typescript
// src/lib/transitions/coordinator.ts
import gsap from 'gsap';
import { goto } from '$app/navigation';

type TransitionConfig = {
  exit?: gsap.TweenVars;
  enter?: gsap.TweenVars;
  duration?: number;
};

const defaults: TransitionConfig = {
  exit: { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' },
  enter: { opacity: 0, y: 20, duration: 0.4, ease: 'power2.out' }
};

let isTransitioning = false;

export async function navigateWithTransition(
  href: string,
  config: TransitionConfig = {}
) {
  if (isTransitioning) return;
  isTransitioning = true;

  const exitVars = { ...defaults.exit, ...config.exit };
  const enterVars = { ...defaults.enter, ...config.enter };

  const content = document.querySelector('.page-content');
  if (!content) {
    await goto(href);
    isTransitioning = false;
    return;
  }

  try {
    // Exit
    await gsap.to(content, exitVars);

    // Navigate
    await goto(href);

    // Enter — target the new page content (DOM has updated)
    const newContent = document.querySelector('.page-content');
    if (newContent) {
      gsap.from(newContent, enterVars);
    }
  } catch (error) {
    console.error('Transition failed:', error);
  } finally {
    isTransitioning = false;
  }
}

export function isNavigating() {
  return isTransitioning;
}
```

```svelte
<!-- Usage in any component -->
<script lang="ts">
  import { navigateWithTransition } from '$lib/transitions/coordinator';
</script>

<button onclick={() => navigateWithTransition('/blog', {
  exit: { opacity: 0, x: -100, duration: 0.4, ease: 'power3.in' },
  enter: { opacity: 0, x: 100, duration: 0.4, ease: 'power3.out' }
})}>
  Visit Blog
</button>
```

## Handling Interrupted Transitions

What happens when the user clicks a link during a transition? Or presses the back button? Interrupted transitions cause visual glitches, stuck states, and broken layouts. Handling them properly is what separates production code from demos.

```typescript
// src/lib/transitions/safe-coordinator.ts
import gsap from 'gsap';
import { goto } from '$app/navigation';

let activeTimeline: gsap.core.Timeline | null = null;

export async function safeNavigate(href: string) {
  // Kill any in-progress transition
  if (activeTimeline) {
    activeTimeline.kill();
    // Reset the page content to a clean state
    gsap.set('.page-content', { clearProps: 'all' });
    activeTimeline = null;
  }

  const content = document.querySelector('.page-content');
  if (!content) {
    await goto(href);
    return;
  }

  // Create a timeline we can kill if interrupted
  activeTimeline = gsap.timeline();

  try {
    // Exit animation
    await activeTimeline
      .to(content, {
        opacity: 0,
        y: -20,
        duration: 0.3,
        ease: 'power2.in'
      })
      .then();

    // Navigate
    await goto(href);

    // Enter animation on new content
    const newContent = document.querySelector('.page-content');
    if (newContent) {
      activeTimeline = gsap.timeline();
      activeTimeline.from(newContent, {
        opacity: 0,
        y: 20,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: () => {
          activeTimeline = null;
        }
      });
    }
  } catch {
    // Navigation was interrupted or failed
    gsap.set('.page-content', { clearProps: 'all' });
    activeTimeline = null;
  }
}
```

**Key principles for interrupted transitions:**
1. **Kill the active timeline** before starting a new transition
2. **Reset styles** with `clearProps: 'all'` so elements are not stuck mid-animation
3. **Use try/catch** because `goto()` can throw if the navigation is cancelled
4. **Track state** with a module-level variable so any code can check whether a transition is active

## Layout Shift Prevention

Page transitions can cause layout shifts — the content jumps because the old and new pages have different sizes. Here is how to prevent that:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate, afterNavigate } from '$app/navigation';

  let { children } = $props();
  let mainEl: HTMLElement;

  onNavigate(() => {
    if (!mainEl) return;

    // Lock the main content's height to prevent shift during transition
    const rect = mainEl.getBoundingClientRect();
    mainEl.style.minHeight = `${rect.height}px`;
  });

  afterNavigate(() => {
    if (!mainEl) return;

    // Release the height lock after navigation completes
    // Use requestAnimationFrame to ensure the new content has rendered
    requestAnimationFrame(() => {
      mainEl.style.minHeight = '';
    });
  });
</script>

<nav><!-- navigation --></nav>

<main bind:this={mainEl}>
  {@render children()}
</main>
```

This locks the container's height during the transition so the footer and other content below do not jump. After the new page renders, the lock is released.

## Preloading for Instant Transitions

SvelteKit supports `data-sveltekit-preload-data` for eager data loading. Combine this with transitions for truly instant-feeling navigations:

```svelte
<!-- Preload data on hover — navigation data is ready before the click -->
<a href="/blog/{post.slug}" data-sveltekit-preload-data="hover">
  {post.title}
</a>

<!-- Preload on viewport entry — for links that are likely to be clicked -->
<a href="/blog/{post.slug}" data-sveltekit-preload-data="viewport">
  {post.title}
</a>
```

When combined with a page transition, the sequence becomes:
1. User hovers over link -> SvelteKit preloads the data
2. User clicks -> exit animation plays (data is already loaded)
3. Exit animation completes -> navigation is instant (no loading delay)
4. New page renders -> entrance animation plays

Without preloading, the user might see the exit animation finish and then wait for data to load before the new page appears — creating an awkward pause.

## Combining View Transitions with GSAP Entrance Animations

The best of both worlds: let the View Transitions API handle the crossfade and element morphing, then use GSAP for rich entrance animations after the transition settles:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  let { children } = $props();

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>

<main>
  {@render children()}
</main>
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  let { data } = $props();

  onMount(() => {
    // Wait for the view transition to finish, then play GSAP animations
    // The view transition handles the crossfade and image morph.
    // GSAP handles the staggered content reveal.
    const delay = 0.35; // Approximate view transition duration

    gsap.from('.article-meta', {
      opacity: 0,
      y: 15,
      duration: 0.4,
      delay,
      ease: 'power2.out'
    });

    gsap.from('.article-body > *', {
      opacity: 0,
      y: 20,
      stagger: 0.06,
      duration: 0.4,
      delay: delay + 0.1,
      ease: 'power2.out'
    });

    gsap.from('.sidebar', {
      opacity: 0,
      x: 30,
      duration: 0.5,
      delay: delay + 0.2,
      ease: 'power2.out'
    });
  });
</script>

<article>
  <img
    src={data.post.image}
    alt={data.post.title}
    style="view-transition-name: post-image-{data.post.slug};"
  />
  <h1 style="view-transition-name: post-title-{data.post.slug};">
    {data.post.title}
  </h1>
  <div class="article-meta">
    <span>{data.post.author}</span>
    <time>{data.post.date}</time>
  </div>
  <div class="article-body">
    <p>First paragraph...</p>
    <p>Second paragraph...</p>
    <p>Third paragraph...</p>
  </div>
</article>
<aside class="sidebar">
  <h3>Related Posts</h3>
  <!-- ... -->
</aside>
```

## Complete Multi-Page Transition System

Here is a complete, production-ready transition system combining View Transitions for shared elements with GSAP for rich page animations:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { onNavigate, afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import gsap from 'gsap';

  let { children } = $props();
  let mainEl: HTMLElement;
  let previousPath = $state('');

  onNavigate((navigation) => {
    // Lock height to prevent layout shift
    if (mainEl) {
      mainEl.style.minHeight = `${mainEl.getBoundingClientRect().height}px`;
    }

    // Use View Transitions API if available
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });

  afterNavigate((navigation) => {
    // Release height lock
    if (mainEl) {
      requestAnimationFrame(() => {
        mainEl.style.minHeight = '';
      });
    }

    // Track path for direction detection
    previousPath = navigation.from?.url.pathname ?? '';
  });
</script>

<header class="site-header" style="view-transition-name: site-header;">
  <nav>
    <a href="/" data-sveltekit-preload-data="hover">Home</a>
    <a href="/projects" data-sveltekit-preload-data="hover">Projects</a>
    <a href="/blog" data-sveltekit-preload-data="hover">Blog</a>
    <a href="/contact" data-sveltekit-preload-data="hover">Contact</a>
  </nav>
</header>

<main bind:this={mainEl}>
  {@render children()}
</main>

<footer style="view-transition-name: site-footer;">
  <p>Footer content</p>
</footer>

<style>
  .site-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: white;
    border-bottom: 1px solid hsl(210, 15%, 90%);
    padding: 1rem 2rem;
  }

  nav {
    display: flex;
    gap: 1.5rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  nav a {
    text-decoration: none;
    color: hsl(210, 10%, 35%);
    font-weight: 500;
    transition: color 0.15s;
  }

  nav a:hover {
    color: hsl(210, 80%, 50%);
  }

  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
</style>
```

```css
/* src/app.css — Global transition styles */

/* Default page transition */
::view-transition-old(root) {
  animation: page-fade-out 0.25s ease-in forwards;
}

::view-transition-new(root) {
  animation: page-fade-in 0.3s ease-out 0.1s forwards;
  opacity: 0; /* Start invisible, the animation handles reveal */
}

@keyframes page-fade-out {
  from { opacity: 1; filter: blur(0); }
  to { opacity: 0; filter: blur(2px); }
}

@keyframes page-fade-in {
  from { opacity: 0; filter: blur(2px); }
  to { opacity: 1; filter: blur(0); }
}

/* Header and footer persist — no transition needed */
::view-transition-old(site-header),
::view-transition-new(site-header),
::view-transition-old(site-footer),
::view-transition-new(site-footer) {
  animation: none;
}

/* Shared element morph (images and titles) */
::view-transition-group(*) {
  animation-duration: 0.35s;
  animation-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
}

/* Respect motion preferences */
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(root),
  ::view-transition-new(root) {
    animation-duration: 0.01s;
  }
}
```

```svelte
<!-- src/routes/+page.svelte — Home page with entrance animation -->
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  onMount(() => {
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    if (prefersReducedMotion) return;

    const tl = gsap.timeline({ delay: 0.3 }); // Wait for view transition

    tl.from('.hero-heading', {
        opacity: 0, y: 40, duration: 0.5, ease: 'power3.out'
      })
      .from('.hero-description', {
        opacity: 0, y: 30, duration: 0.4, ease: 'power2.out'
      }, '-=0.3')
      .from('.hero-cta', {
        opacity: 0, y: 20, scale: 0.95, duration: 0.4, ease: 'back.out(1.5)'
      }, '-=0.2')
      .from('.feature-card', {
        opacity: 0, y: 30, stagger: 0.1, duration: 0.4, ease: 'power2.out'
      }, '-=0.1');
  });
</script>

<section class="hero">
  <h1 class="hero-heading">Build Beautiful Apps</h1>
  <p class="hero-description">SvelteKit + GSAP page transitions in production</p>
  <a class="hero-cta" href="/projects">See Our Work</a>
</section>

<section class="features">
  <div class="feature-card">
    <h3>Fast</h3>
    <p>Preloaded data, instant transitions</p>
  </div>
  <div class="feature-card">
    <h3>Smooth</h3>
    <p>60fps animations, GPU-accelerated</p>
  </div>
  <div class="feature-card">
    <h3>Accessible</h3>
    <p>Respects motion preferences</p>
  </div>
</section>
```

## Try It

Build a multi-page SvelteKit app with polished transitions:

1. **Set up view transitions** in your root `+layout.svelte` using `onNavigate`. Add CSS customization in `app.css` with a subtle blur + fade effect.

2. **Create a blog list and detail page** where the post image and title morph between pages using named view transitions (`view-transition-name`). Ensure names are unique per post.

3. **Add GSAP entrance animations** on the detail page that stagger in the article metadata, body paragraphs, and sidebar after the view transition completes (use a delay matching your transition duration).

4. **Prevent layout shifts** by locking `minHeight` on the content container during `onNavigate` and releasing in `afterNavigate`.

5. **Handle reduced motion** — check `prefers-reduced-motion` in both your CSS (`@media` query on view transition styles) and JavaScript (skip GSAP entrance animations).

6. **Add preloading** with `data-sveltekit-preload-data="hover"` on navigation links so data is ready before the user clicks.

7. **Bonus:** persist the header and footer across transitions by giving them `view-transition-name` values and setting `animation: none` on their pseudo-elements.

## Key Takeaways

- SvelteKit's `onNavigate` integrates with the browser's View Transitions API for native-feeling page transitions
- `document.startViewTransition()` screenshots the old page, updates the DOM, then cross-fades to the new state
- Customize transitions with `::view-transition-old` and `::view-transition-new` CSS pseudo-elements
- Named view transitions (`view-transition-name`) morph shared elements between pages — names must be unique across the page
- GSAP supplements view transitions for complex entrance animations — use a delay to sequence after the crossfade
- Handle interrupted transitions by killing active timelines and resetting styles with `clearProps: 'all'`
- Prevent layout shifts by locking container height during `onNavigate` and releasing in `afterNavigate`
- Use `data-sveltekit-preload-data="hover"` to preload data before the user clicks, making transitions feel instant
- Always check `document.startViewTransition` for browser compatibility and `prefers-reduced-motion` for accessibility
- Persist persistent UI (headers, footers) by giving them unique `view-transition-name` values and disabling their animations
