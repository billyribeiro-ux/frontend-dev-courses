# Links & Images

Text alone is not enough to build a real website. You need **links** to connect pages together and **images** to make things visual. These two elements are the backbone of the web — links are literally what make the "web" a web, and images are consistently the largest contributor to page weight and load time.

Getting links and images right is not just about making things clickable and visible. It is about navigation patterns, accessibility, performance, and understanding how SvelteKit transforms basic HTML into a fast, app-like experience. Let's dig in.

## The Anchor Tag: Creating Links

Links are created with the `<a>` tag (short for "anchor"). The `href` attribute tells the browser where to go when clicked:

```svelte
<a href="https://svelte.dev">Visit Svelte</a>
```

This renders as clickable text: "Visit Svelte." Simple enough. But the `href` attribute is more versatile than most developers realize. There are several patterns worth knowing:

### href Patterns

```svelte
<!-- Absolute URL: full address to an external site -->
<a href="https://svelte.dev/docs">Svelte Documentation</a>

<!-- Relative URL: resolved against the current page path -->
<a href="about">About Page</a>        <!-- current path + /about -->
<a href="../settings">Settings</a>    <!-- up one level, then /settings -->

<!-- Root-relative: always resolved from the site root -->
<a href="/blog/my-post">My Post</a>

<!-- Hash link: jump to an element on the current page -->
<a href="#pricing">Jump to Pricing</a>

<!-- Email link: opens the user's mail client -->
<a href="mailto:hello@example.com">Email Us</a>

<!-- Phone link: critical for mobile users -->
<a href="tel:+1-555-123-4567">Call Us</a>

<!-- Download link: triggers file download instead of navigation -->
<a href="/files/report.pdf" download>Download Report (PDF)</a>
```

The `mailto:` and `tel:` patterns are especially important for business and e-commerce sites. On mobile, a `tel:` link opens the phone dialer directly. Users expect this behavior, and providing it is a genuine accessibility win.

### Opening Links in a New Tab

By default, clicking a link replaces the current page. To open a link in a new tab, add `target="_blank"`:

```svelte
<a href="https://svelte.dev" target="_blank" rel="noopener noreferrer">
  Visit Svelte (opens in new tab)
</a>
```

The `rel="noopener noreferrer"` part is a **security requirement**, not just a best practice. Here is why:

- **`noopener`** prevents the new page from accessing `window.opener`, which would give it a reference back to your page. A malicious site could use this to redirect your page to a phishing URL while the user's attention is on the new tab. Modern browsers now imply `noopener` for `target="_blank"`, but explicit is better.
- **`noreferrer`** prevents the browser from sending the `Referer` header to the new page, so it does not know where the user came from. This is a privacy consideration.

**When should you open in a new tab?** The general UX guideline: open external links in a new tab (the user is leaving your site), keep internal links in the same tab (the user is navigating within your site). But be thoughtful — some users find unsolicited new tabs annoying. Always provide a visual hint (like an external-link icon) when a link opens a new tab.

### Hash Links and Smooth Scrolling

You can link to any element on the current page by referencing its `id`:

```svelte
<!-- Navigation at the top -->
<nav>
  <a href="#features">Features</a>
  <a href="#pricing">Pricing</a>
  <a href="#faq">FAQ</a>
</nav>

<!-- Sections further down the page -->
<section id="features">
  <h2>Features</h2>
  <p>Everything you need to build modern web apps.</p>
</section>

<section id="pricing">
  <h2>Pricing</h2>
  <p>Simple, transparent pricing for teams of all sizes.</p>
</section>
```

Add `scroll-behavior: smooth` in your CSS to make the jump animated instead of instant. This is a one-line CSS improvement that dramatically improves UX on long pages.

## SvelteKit Client-Side Navigation

Here is something that surprises many developers coming to SvelteKit: **your `<a>` tags automatically become SPA-style client-side navigation links** when they point to routes within your application. No special component needed.

```svelte
<!-- This looks like regular HTML, but SvelteKit intercepts the click -->
<a href="/blog">Blog</a>
<a href="/about">About</a>
<a href="/contact">Contact</a>
```

When a user clicks one of these links, SvelteKit does not trigger a full page reload. Instead, it:

1. Intercepts the click event
2. Fetches only the data needed for the new route
3. Updates the DOM in place
4. Updates the browser's URL bar and history

The result is instant, app-like navigation with no flash of white, no re-parsing of CSS and JavaScript, and no loss of client-side state that lives outside the navigated component. And it works with **zero configuration** — just write normal `<a>` tags.

SvelteKit only intercepts links that match your application's routes. External links (like `https://svelte.dev`) work normally as full-page navigations. You can also opt out of client-side navigation for specific links when needed:

```svelte
<!-- Force a full-page reload for this link -->
<a href="/legacy-page" data-sveltekit-reload>Legacy Page</a>

<!-- Preload data when the user hovers over the link -->
<a href="/blog" data-sveltekit-preload-data="hover">Blog</a>
```

The `data-sveltekit-preload-data="hover"` attribute is a performance trick worth knowing. When the user hovers over the link, SvelteKit starts fetching the data for that page before they even click. By the time they click, the data is already loaded and the navigation feels instant.

## The Image Tag: Displaying Images

Images use the `<img>` tag. Unlike most HTML tags, `<img>` is **self-closing** — it does not have a closing tag because it has no children:

```svelte
<img src="/photos/sunset.jpg" alt="Orange sunset over the Pacific Ocean" />
```

Two required attributes:
- **`src`** — the URL or path to the image file
- **`alt`** — a text description of the image

### Alt Text: A Requirement, Not an Afterthought

The `alt` attribute is not optional, and writing good alt text is a skill. It serves multiple critical purposes:

1. **Screen readers** read the `alt` text aloud, making the image "visible" to visually impaired users
2. **Search engines** use `alt` text to understand and index image content
3. **Broken images** display the `alt` text as fallback when the image fails to load

Writing effective alt text follows a principle: **describe the content and function of the image, not its appearance.**

```svelte
<!-- Good: describes what the image conveys -->
<img src="/photos/team.jpg" alt="The engineering team celebrating the product launch" />

<!-- Bad: describes what it looks like without context -->
<img src="/photos/team.jpg" alt="Photo of people" />

<!-- Bad: redundant with surrounding text -->
<img src="/photos/team.jpg" alt="Image of the team image" />

<!-- Decorative images: use empty alt to tell screen readers to skip -->
<img src="/icons/decorative-divider.svg" alt="" />

<!-- Functional images: describe the action, not the image -->
<a href="/home">
  <img src="/logo.svg" alt="Return to homepage" />
</a>
```

That last example is important. When an image is inside a link, the alt text should describe where the link goes, not what the logo looks like. The image is functioning as a link, not as visual content.

### Setting Width and Height: Preventing Layout Shift

Always set `width` and `height` attributes on your images:

```svelte
<img
  src="/photos/landscape.jpg"
  alt="Mountain valley at sunrise"
  width="800"
  height="600"
/>
```

This might seem old-fashioned — "I'll handle sizing in CSS." But `width` and `height` serve a critical performance purpose: they let the browser **reserve the correct amount of space** before the image loads. Without them, the page content jumps around as images load in (called **Cumulative Layout Shift**, or CLS), which is jarring for users and penalized by Google's Core Web Vitals.

Set the intrinsic dimensions in the HTML, then constrain the visual size in CSS:

```css
img {
  max-width: 100%;
  height: auto;
}
```

This gives you responsive behavior (images scale down on smaller screens) while preserving the aspect ratio for the browser's layout calculation.

### Responsive Images with srcset and sizes

On a modern web, a single image file is rarely enough. A phone with a 375px-wide screen does not need the same 2400px-wide image as a desktop monitor. Responsive images solve this:

```svelte
<img
  src="/photos/hero-800.jpg"
  srcset="
    /photos/hero-400.jpg 400w,
    /photos/hero-800.jpg 800w,
    /photos/hero-1200.jpg 1200w,
    /photos/hero-1600.jpg 1600w
  "
  sizes="(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 800px"
  alt="Mountain landscape hero image"
  width="1600"
  height="900"
/>
```

Here is the mental model:
- **`srcset`** gives the browser a menu of available image files and their actual widths
- **`sizes`** tells the browser how wide the image will be displayed at different viewport widths
- The browser combines these to pick the optimal file — it knows the viewport width, the display density (1x, 2x, 3x), and how large the image will actually render

You provide options. The browser picks the best one. This can reduce image transfer sizes by 50-70% on mobile without you writing a single line of JavaScript.

### Lazy Loading

Images below the fold (not visible when the page first loads) should be lazy loaded:

```svelte
<!-- Images visible on initial load: do NOT lazy load -->
<img src="/photos/hero.jpg" alt="Hero banner" width="1200" height="600" />

<!-- Images below the fold: lazy load them -->
<img
  src="/photos/feature-1.jpg"
  alt="Feature demonstration"
  width="600"
  height="400"
  loading="lazy"
/>
```

`loading="lazy"` tells the browser to defer loading the image until it is near the viewport. This is a massive performance win on image-heavy pages — you avoid downloading images the user may never scroll to.

**When NOT to lazy load:** Never lazy load your hero image, above-the-fold content, or LCP (Largest Contentful Paint) image. Lazy loading those delays your most important visual content and hurts Core Web Vitals scores. The rule: lazy load everything *below* the initial viewport, and eagerly load everything *in* it.

### SvelteKit Enhanced Images

SvelteKit provides an `enhanced:img` feature that automates image optimization at build time:

```svelte
<!-- SvelteKit generates optimized versions automatically -->
<enhanced:img src="/photos/team.jpg" alt="Team photo at the office" />
```

This transforms your images at build time — generating multiple sizes, converting to modern formats like WebP and AVIF, and adding the correct `srcset`, `sizes`, `width`, and `height` attributes automatically. It is the easiest way to get image performance right without manually creating image variants.

## Images Are Your Biggest Performance Bottleneck

This is worth stating directly: **images are almost always the heaviest assets on any web page.** On a typical page, images account for 50-70% of total bytes transferred. A single unoptimized hero image can be larger than all your JavaScript and CSS combined.

The performance checklist:
1. **Right format** — use WebP or AVIF instead of PNG/JPEG where supported (30-50% smaller)
2. **Right size** — serve different sizes for different viewports with `srcset`
3. **Right loading** — lazy load below-the-fold images
4. **Right dimensions** — always set `width` and `height` to prevent layout shift
5. **Right compression** — compress images before shipping (tools like Sharp, Squoosh, or Vite plugins)

## Combining Links and Images

Wrapping an image in a link is a common pattern — product cards, logos, thumbnails:

```svelte
<a href="/products/svelte-course">
  <img
    src="/images/course-thumbnail.jpg"
    alt="Svelte 5 Fundamentals — click to view course details"
    width="400"
    height="300"
    loading="lazy"
  />
</a>
```

Remember: when an image is inside a link, the `alt` text should describe the link's destination or action, not just the image's visual content. A screen reader user hears the `alt` text as the link's label.

## Practical Example: A Product Card

Here is a realistic product card component that brings together everything we have covered:

```svelte
<script>
  let { product } = $props();
</script>

<article class="product-card">
  <a href="/products/{product.slug}">
    <img
      src={product.thumbnail}
      srcset="{product.thumbnailSmall} 400w, {product.thumbnail} 800w"
      sizes="(max-width: 768px) 100vw, 400px"
      alt={product.name}
      width="800"
      height="600"
      loading="lazy"
    />
  </a>

  <div class="product-info">
    <h3>
      <a href="/products/{product.slug}">{product.name}</a>
    </h3>
    <p>{product.description}</p>
    <p class="price">
      {#if product.salePrice}
        <del>${product.originalPrice}</del>
        <strong>${product.salePrice}</strong>
      {:else}
        ${product.originalPrice}
      {/if}
    </p>
    <a href="/products/{product.slug}" class="cta">
      View Details
    </a>
  </div>
</article>
```

Notice the thoughtful decisions: lazy loading on the thumbnail (these cards are likely below the fold), `srcset` for responsive images, semantic `<article>` wrapper, `<del>` for the original price on sale items (screen readers will announce it as "deleted" text, conveying the visual strikethrough meaning), and descriptive link text instead of "Click here."

## Try It

Build a "Favorite Links" component that includes:
- At least three links using different `href` patterns (external, hash, and `mailto:` or `tel:`)
- One external link that opens in a new tab with proper `rel` attributes
- An image with descriptive `alt` text, explicit `width` and `height`, and `loading="lazy"`
- A clickable image that links somewhere, with `alt` text describing the destination
- Add `data-sveltekit-preload-data="hover"` to at least one internal link

## Key Takeaways

- `<a href="...">` creates links — `href` supports absolute, relative, hash, `mailto:`, `tel:`, and `download` patterns
- Always add `rel="noopener noreferrer"` when using `target="_blank"` — it is a security requirement, not a suggestion
- SvelteKit automatically turns internal `<a>` tags into client-side SPA navigation — no special component needed
- `<img>` requires both `src` and meaningful `alt` text — decorative images use `alt=""` to signal screen readers to skip them
- Always set `width` and `height` on images to prevent Cumulative Layout Shift, even if you resize with CSS
- Use `srcset` and `sizes` for responsive images — let the browser choose the optimal file for the device
- Use `loading="lazy"` for below-the-fold images, but never for your hero or LCP image
- Images are typically 50-70% of page weight — optimizing them is the single highest-impact performance work you can do
