# Page Transitions

Page transitions add polish to navigation — instead of a hard cut between pages, elements can fade, slide, or morph smoothly. SvelteKit provides the `onNavigate` lifecycle function and integrates with the browser's **View Transitions API** for native-feeling page transitions.

## The View Transitions API

The View Transitions API is a browser feature that animates between two page states. SvelteKit integrates with it through the `onNavigate` function:

```typescript
// src/routes/+layout.ts
import { onNavigate } from '$app/navigation';

onNavigate((navigation) => {
  // Check if the browser supports view transitions
  if (!document.startViewTransition) return;

  return new Promise((resolve) => {
    document.startViewTransition(async () => {
      resolve();
      await navigation.complete;
    });
  });
});
```

Place this in your root layout's `+layout.ts` (or `+layout.svelte` script) to enable view transitions for every navigation in your app.

## Using View Transitions in a Layout

Enable transitions from your layout component:

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

With just this code, navigating between pages gets a default crossfade transition.

## Customizing Transition Styles

Control the transition animation with CSS:

```css
/* src/app.css */

/* Default page transition */
::view-transition-old(root) {
  animation: fade-out 0.2s ease-in;
}

::view-transition-new(root) {
  animation: fade-in 0.3s ease-out;
}

@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

The `::view-transition-old` pseudo-element represents the outgoing page, and `::view-transition-new` represents the incoming page.

## Slide Transitions

Create a slide effect for a more dynamic feel:

```css
::view-transition-old(root) {
  animation: slide-out-left 0.3s ease-in;
}

::view-transition-new(root) {
  animation: slide-in-right 0.3s ease-out;
}

@keyframes slide-out-left {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-30px); opacity: 0; }
}

@keyframes slide-in-right {
  from { transform: translateX(30px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

## Named View Transitions

Assign unique transition names to specific elements so they animate independently:

```svelte
<!-- Blog list page -->
<a href="/blog/{post.slug}">
  <img
    src={post.image}
    alt={post.title}
    style="view-transition-name: post-image-{post.slug};"
  />
  <h2 style="view-transition-name: post-title-{post.slug};">{post.title}</h2>
</a>
```

```svelte
<!-- Blog detail page -->
<img
  src={data.post.image}
  alt={data.post.title}
  style="view-transition-name: post-image-{data.post.slug};"
/>
<h1 style="view-transition-name: post-title-{data.post.slug};">{data.post.title}</h1>
```

When the same `view-transition-name` exists on both the old and new pages, the browser morphs the element from its old position and size to its new one. The image grows and the title slides into place.

## Combining GSAP with Navigation

For more control, use GSAP for exit animations before navigating:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import gsap from 'gsap';

  async function navigateWithAnimation(href: string) {
    // Exit animation
    await gsap.to('.page-content', {
      opacity: 0,
      y: -20,
      duration: 0.3,
      ease: 'power2.in'
    });

    // Navigate after animation completes
    await goto(href);

    // Entrance animation on the new page is handled by onMount
  }
</script>

<button onclick={() => navigateWithAnimation('/about')}>
  Go to About
</button>

<div class="page-content">
  <h1>Current Page</h1>
</div>
```

## Entrance Animations

Pair exit animations with entrance animations in each page:

```svelte
<!-- src/routes/about/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import gsap from 'gsap';

  let ready = $state(false);

  onMount(() => {
    gsap.from('.page-content', {
      opacity: 0,
      y: 20,
      duration: 0.4,
      ease: 'power2.out',
      onComplete: () => { ready = true; }
    });
  });
</script>

<div class="page-content">
  <h1>About Us</h1>
  <p>Content that animates in on page load.</p>
</div>
```

## Try It

Set up view transitions in your SvelteKit app. Create a blog list page and a blog detail page where the post image and title morph between pages using named view transitions. Add custom CSS for the page crossfade, and add a GSAP entrance animation on the detail page that staggers in the article content after the view transition completes.

## Key Takeaways

- SvelteKit's `onNavigate` integrates with the browser's View Transitions API
- `document.startViewTransition()` captures the old page and crossfades to the new one
- Customize transitions with `::view-transition-old` and `::view-transition-new` CSS pseudo-elements
- Named view transitions (`view-transition-name`) morph shared elements between pages
- GSAP can supplement view transitions for complex entrance and exit animations
- Always check `document.startViewTransition` exists for browser compatibility
