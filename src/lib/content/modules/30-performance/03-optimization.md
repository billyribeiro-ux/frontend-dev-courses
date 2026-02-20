# Performance Optimization

Performance is not just about speed — it is about user experience. A page that loads in 1 second instead of 3 has measurably higher conversion rates, lower bounce rates, and better search rankings. Google uses Core Web Vitals as a ranking factor, so performance directly impacts how many people find and use your site.

This lesson covers the practical optimizations that make the biggest difference: images, fonts, layout stability, and how to measure it all with Lighthouse.

## Image Optimization

Images are typically the largest assets on a page. Optimizing them is the highest-impact change you can make:

**Use modern formats** — WebP is 25-35% smaller than JPEG at the same quality:

```svelte
<picture>
  <source srcset="/hero.avif" type="image/avif" />
  <source srcset="/hero.webp" type="image/webp" />
  <img src="/hero.jpg" alt="Hero banner" width="1200" height="600" />
</picture>
```

**Serve responsive sizes** — Do not send a 2000px image to a 400px phone screen:

```svelte
<img
  src="/product.jpg"
  srcset="
    /product-400.webp 400w,
    /product-800.webp 800w,
    /product-1200.webp 1200w
  "
  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
  alt="Blue running shoes"
  width="800"
  height="600"
  loading="lazy"
/>
```

**Lazy load below-the-fold images** — The `loading="lazy"` attribute defers loading until the image is near the viewport. Never lazy-load the hero image or any content visible on first render.

**Always set width and height** — This reserves space in the layout and prevents content from jumping when the image loads.

## Font Loading Strategies

Custom fonts can block rendering if loaded incorrectly. Use `font-display: swap` so text is visible immediately with a fallback font:

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}
```

Preload critical fonts to start downloading them early:

```svelte
<!-- src/app.html -->
<head>
  <link
    rel="preload"
    href="/fonts/inter-variable.woff2"
    as="font"
    type="font/woff2"
    crossorigin
  />
</head>
```

Tips for font performance:

- Use variable fonts (one file covers all weights)
- Stick to WOFF2 format (best compression)
- Limit yourself to 1-2 font families
- Subset fonts to include only the characters you need

## Reducing Cumulative Layout Shift (CLS)

CLS measures how much content moves around as the page loads. High CLS frustrates users — they try to click a button and it jumps away. Common causes and fixes:

```svelte
<!-- Problem: image without dimensions causes layout shift -->
<img src="/photo.jpg" alt="Landscape" />

<!-- Fix: always include width and height -->
<img src="/photo.jpg" alt="Landscape" width="800" height="600" />
```

```css
/* Problem: dynamic content pushes layout down */
.ad-slot {
  /* No height reserved */
}

/* Fix: reserve space for dynamic content */
.ad-slot {
  min-height: 250px;
}
```

```svelte
<!-- Problem: font swap causes text to reflow -->
<!-- Fix: match fallback font metrics to custom font -->
<style>
  :root {
    font-family: 'Inter', 'Arial', sans-serif;
    /* Use CSS font-size-adjust or @font-face size-adjust */
  }
</style>
```

Other CLS fixes:

- Place dynamic banners and alerts at the top of content so they push nothing
- Use CSS `aspect-ratio` for media containers
- Avoid inserting content above existing content after load

## Lighthouse Audit Walkthrough

Run a full Lighthouse audit to measure your performance:

1. Open Chrome DevTools (F12)
2. Go to the **Lighthouse** tab
3. Select **Performance**, **Accessibility**, **Best Practices**, **SEO**
4. Choose **Mobile** (more demanding than Desktop)
5. Click **Analyze page load**

The key metrics to watch:

| Metric | Good | Description |
|--------|------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | When the main content becomes visible |
| **FID** (First Input Delay) | < 100ms | Time until the page responds to input |
| **CLS** (Cumulative Layout Shift) | < 0.1 | How much the layout shifts during load |
| **TTFB** (Time to First Byte) | < 800ms | Server response time |

## Achieving 95+ Scores

A checklist for hitting top Lighthouse scores:

```bash
# Performance
- Optimize and lazy-load images (WebP/AVIF, srcset, loading="lazy")
- Prerender static pages
- Set cache headers on API responses
- Preload critical fonts
- Remove unused CSS and JavaScript

# Accessibility
- Semantic HTML with proper heading order
- All images have alt text
- Color contrast meets WCAG AA (4.5:1)
- All forms have labels

# Best Practices
- Use HTTPS everywhere
- No console errors
- No deprecated APIs

# SEO
- Every page has a unique <title> and meta description
- Proper Open Graph tags
- Valid robots.txt and sitemap.xml
```

## Try It

Run a Lighthouse audit on your project in mobile mode. Note your current scores. Then implement the following optimizations: convert your three largest images to WebP with srcset, add `font-display: swap` to your custom fonts, and set `width`/`height` on all images. Run Lighthouse again and compare the improvement.

## Key Takeaways

- Images are the biggest performance bottleneck — use WebP/AVIF, srcset, and lazy loading
- Use `font-display: swap` and preload critical fonts to avoid invisible text during load
- Prevent CLS by always setting dimensions on images and reserving space for dynamic content
- Lighthouse measures LCP, FID, CLS, and TTFB — aim for green on all four
- Prerendering, caching, and removing unused code are the fastest paths to a 95+ Lighthouse score
