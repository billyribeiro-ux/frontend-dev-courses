# Core Web Vitals

Google uses **Core Web Vitals** as ranking signals — they measure the real-world user experience of your pages. Poor scores can push your pages lower in search results, while good scores can give you a ranking boost. These metrics focus on loading speed, interactivity, and visual stability.

## The Three Core Web Vitals

### Largest Contentful Paint (LCP)

LCP measures how long it takes for the largest visible element to finish loading. This is usually a hero image, heading, or large text block.

- **Good:** under 2.5 seconds
- **Needs improvement:** 2.5-4 seconds
- **Poor:** over 4 seconds

### Interaction to Next Paint (INP)

INP measures how quickly the page responds to user interactions (clicks, taps, keyboard input). It captures the delay between the user's action and the visual update.

- **Good:** under 200 milliseconds
- **Needs improvement:** 200-500 milliseconds
- **Poor:** over 500 milliseconds

### Cumulative Layout Shift (CLS)

CLS measures how much the page layout shifts unexpectedly while loading. Content jumping around is frustrating — it causes users to click the wrong thing.

- **Good:** under 0.1
- **Needs improvement:** 0.1-0.25
- **Poor:** over 0.25

## Measuring with Lighthouse

Chrome DevTools includes Lighthouse, a built-in auditing tool:

1. Open Chrome DevTools (F12)
2. Go to the **Lighthouse** tab
3. Select **Performance** and **SEO**
4. Click **Analyze page load**

Lighthouse simulates a mobile device and gives you scores for each Core Web Vital along with specific improvement suggestions.

## Optimizing LCP

The biggest LCP improvements come from faster content delivery:

```svelte
<!-- Preload the hero image -->
<svelte:head>
  <link rel="preload" as="image" href="/hero.webp" />
</svelte:head>

<!-- Use modern image formats and explicit dimensions -->
<img
  src="/hero.webp"
  alt="Hero image"
  width={1200}
  height={630}
  loading="eager"
  fetchpriority="high"
/>
```

Key strategies:
- Use `fetchpriority="high"` on the hero image
- Use WebP or AVIF format for smaller file sizes
- Preload critical images with `<link rel="preload">`
- Avoid lazy-loading above-the-fold images

## Optimizing INP

INP improves when you minimize JavaScript work during interactions:

```svelte
<script lang="ts">
  // Bad: Heavy computation blocks the main thread
  function handleClick() {
    const result = expensiveCalculation(); // Blocks for 500ms
    updateUI(result);
  }

  // Good: Defer heavy work with setTimeout
  function handleClickBetter() {
    updateUI('loading...');
    setTimeout(() => {
      const result = expensiveCalculation();
      updateUI(result);
    }, 0);
  }
</script>
```

Key strategies:
- Keep event handlers fast and lightweight
- Break up long tasks with `setTimeout` or `requestAnimationFrame`
- Use SvelteKit's server-side rendering — less JavaScript means faster interactions
- Avoid large JavaScript bundles with code splitting

## Optimizing CLS

CLS improves when elements have reserved space before they load:

```svelte
<!-- Bad: Image without dimensions causes layout shift -->
<img src="/photo.jpg" alt="Photo" />

<!-- Good: Explicit dimensions reserve space -->
<img src="/photo.jpg" alt="Photo" width={800} height={600} />

<!-- Good: Aspect ratio container -->
<div class="aspect-video">
  <img src="/photo.jpg" alt="Photo" class="w-full h-full object-cover" />
</div>
```

Key strategies:
- Always set `width` and `height` on images
- Use CSS `aspect-ratio` for embedded content
- Avoid inserting content above existing content after load
- Use `min-height` on containers that load dynamic content
- Load fonts with `font-display: swap` and reserve space

## SvelteKit Performance Advantages

SvelteKit gives you several performance wins out of the box:

```typescript
// Server-side rendering means content is visible immediately
// No JavaScript needed to show the first paint

// Code splitting is automatic — each route loads only its own code

// Preloading on hover speeds up navigation
// SvelteKit automatically preloads links when users hover over them
```

## Try It

Run Lighthouse on one of your SvelteKit pages and note the Core Web Vitals scores. Then apply optimizations: add dimensions to all images, preload the largest image, and check for layout shifts. Run Lighthouse again and compare the before and after scores.

## Key Takeaways

- Core Web Vitals (LCP, INP, CLS) are Google ranking signals that measure real user experience
- LCP measures loading speed — optimize with image preloading, modern formats, and `fetchpriority`
- INP measures interaction responsiveness — keep event handlers fast and minimize JavaScript
- CLS measures visual stability — always set image dimensions and avoid injecting content above the fold
- Use Lighthouse in Chrome DevTools to measure and track your scores
- SvelteKit's SSR, code splitting, and link preloading give you a strong performance foundation
