# Links & Images

Text alone is not enough to build a real website. You need **links** to connect pages together and **images** to make things visual. These two elements are the backbone of the web — links are literally what make the "web" a web, and images are consistently the largest contributor to page weight and load time.

Getting links and images right is not just about making things clickable and visible. It is about navigation patterns, accessibility, performance, and understanding how SvelteKit transforms basic HTML into a fast, app-like experience. These are topics where the difference between a junior and senior developer shows up clearly — in the details of `alt` text, loading strategies, and security attributes that most tutorials gloss over.

## The Anchor Tag: Creating Links

Links are created with the `<a>` tag (short for "anchor"). The `href` attribute tells the browser where to go when clicked:

```svelte
<a href="https://svelte.dev">Visit Svelte</a>
```

This renders as clickable text: "Visit Svelte." Simple enough. But the `href` attribute is more versatile than most developers realize. There are several patterns worth knowing, and understanding the differences prevents bugs.

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

<!-- Download with custom filename -->
<a href="/files/report-q1-2025.pdf" download="Q1-Report.pdf">
  Download Q1 Report
</a>
```

### Understanding Relative vs Root-Relative URLs

This is a source of bugs that catches even experienced developers. The behavior depends on where you are:

```
Current page: https://mysite.com/blog/posts/hello

Relative URLs resolve from the current path:
  "about"         → https://mysite.com/blog/posts/about
  "../"           → https://mysite.com/blog/posts/
  "../../"        → https://mysite.com/blog/

Root-relative URLs always resolve from the site root:
  "/about"        → https://mysite.com/about
  "/blog"         → https://mysite.com/blog
```

**The rule in SvelteKit: always use root-relative URLs (`/about`, `/blog/my-post`) for internal navigation.** They work the same regardless of which page you are on. Relative URLs break when you move a component from one route to another.

```svelte
<!-- WRONG: Relative URL — breaks if this component is used on different routes -->
<a href="about">About</a>
<!-- On /blog → goes to /blog/about
     On /dashboard → goes to /dashboard/about
     Different destinations depending on context! -->

<!-- CORRECT: Root-relative URL — always goes to the same place -->
<a href="/about">About</a>
<!-- Always goes to /about regardless of which page renders this component -->
```

The `mailto:` and `tel:` patterns are especially important for business and e-commerce sites. On mobile, a `tel:` link opens the phone dialer directly. Users expect this behavior, and providing it is a genuine accessibility win.

```svelte
<!-- tel: links — format matters -->
<a href="tel:+15551234567">Call Us</a>

<!-- The + and country code (1 for US) ensure international compatibility.
     Do NOT include spaces, dashes, or parentheses in the href:
     WRONG: href="tel:(555) 123-4567"
     CORRECT: href="tel:+15551234567"
     Display the number however you want in the link text. -->

<!-- mailto: with pre-filled fields -->
<a href="mailto:support@example.com?subject=Help%20Request&body=Hi%20team">
  Email Support
</a>
```

### Opening Links in a New Tab

By default, clicking a link replaces the current page. To open a link in a new tab, add `target="_blank"`:

```svelte
<a href="https://svelte.dev" target="_blank" rel="noopener noreferrer">
  Visit Svelte (opens in new tab)
</a>
```

The `rel="noopener noreferrer"` part is a **security requirement**, not just a best practice. Here is why:

- **`noopener`** prevents the new page from accessing `window.opener`, which would give it a reference back to your page. A malicious site could use this to redirect your page to a phishing URL while the user's attention is on the new tab. The attack: you click a link to an innocent-looking site, which runs `window.opener.location = 'https://fake-login.com'`, and your original tab now shows a fake login page. Modern browsers now imply `noopener` for `target="_blank"`, but explicit is better — older browsers do not.
- **`noreferrer`** prevents the browser from sending the `Referer` header to the new page, so it does not know where the user came from. This is a privacy consideration — you may not want external sites knowing your URL structure.

### WRONG vs CORRECT: External Links

```svelte
<!-- WRONG: No security attributes -->
<a href="https://sketchy-site.com" target="_blank">Visit</a>
<!-- The new page can access window.opener and redirect your page -->

<!-- WRONG: noopener but not noreferrer -->
<a href="https://partner-site.com" target="_blank" rel="noopener">Visit</a>
<!-- Secure, but leaks your page URL via the Referer header -->

<!-- CORRECT: Both security attributes -->
<a href="https://partner-site.com" target="_blank" rel="noopener noreferrer">
  Visit Partner Site
</a>

<!-- ALSO CORRECT: Internal link — no target="_blank" needed -->
<a href="/about">About</a>
<!-- Internal links should NOT open in new tabs.
     Users expect internal navigation to happen in the same tab. -->
```

**When should you open in a new tab?** The general UX guideline: open external links in a new tab (the user is leaving your site), keep internal links in the same tab (the user is navigating within your site). But be thoughtful — some users find unsolicited new tabs annoying. Always provide a visual hint (like an external-link icon) when a link opens a new tab:

```svelte
<a href="https://svelte.dev" target="_blank" rel="noopener noreferrer"
   class="inline-flex items-center gap-1">
  Svelte Docs
  <!-- Visual indicator that this opens in a new tab -->
  <svg class="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor">
    <path d="M4 1H1v10h10V8M7 1h4v4M11 1L5 7" stroke-width="1.5"/>
  </svg>
</a>
```

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

<section id="faq">
  <h2>FAQ</h2>
  <p>Answers to common questions.</p>
</section>
```

Add `scroll-behavior: smooth` in your CSS to make the jump animated instead of instant:

```css
/* In your global CSS (e.g., app.css) */
html {
  scroll-behavior: smooth;
}
```

This is a one-line CSS improvement that dramatically improves UX on long pages. The browser handles the animation natively — no JavaScript needed.

**Gotcha with hash links:** the target element must have the matching `id`. If the `id` does not exist on the page, the browser does nothing (no error, no navigation). This is a silent failure that is easy to miss during development:

```svelte
<!-- WRONG: The id has a space (invalid) -->
<a href="#my section">Go</a>
<section id="my section">...</section>
<!-- This will NOT work — ids cannot contain spaces -->

<!-- CORRECT: Use hyphens or camelCase -->
<a href="#my-section">Go</a>
<section id="my-section">...</section>
```

### Link Styling and States

Links have four important states that CSS can target. Understanding them matters for accessibility:

```css
/* Unvisited link — the default state */
a:link { color: #3498db; }

/* Visited link — the user has been to this URL before */
a:visited { color: #8e44ad; }

/* Hover — mouse is over the link (desktop only) */
a:hover { color: #2980b9; text-decoration: underline; }

/* Active — the link is being clicked (mouse button down) */
a:active { color: #e74c3c; }

/* Focus — keyboard navigation has reached this link */
a:focus-visible {
  outline: 2px solid #3498db;
  outline-offset: 2px;
  border-radius: 2px;
}
```

**The `:focus-visible` state is critical for accessibility.** Keyboard users (including screen reader users) navigate by tabbing through links. Without a visible focus indicator, they cannot tell which link is currently selected. Never do `a:focus { outline: none; }` without providing an alternative focus style. This is one of the most common accessibility violations on the web.

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
2. Fetches only the data needed for the new route (via `+page.server.ts` or `+page.ts` load functions)
3. Updates the DOM in place
4. Updates the browser's URL bar and history

The result is instant, app-like navigation with no flash of white, no re-parsing of CSS and JavaScript, and no loss of client-side state that lives outside the navigated component. And it works with **zero configuration** — just write normal `<a>` tags.

This is a fundamental architectural advantage of SvelteKit. In React, you need `<Link>` from React Router. In Next.js, you need `<Link>` from `next/link`. In SvelteKit, you just use `<a>`. It is simpler, more accessible (screen readers and crawlers see a real `<a>` tag), and you cannot forget to use the special component because there is none.

### When SvelteKit Does and Does Not Intercept

SvelteKit only intercepts links that meet ALL of these criteria:
- The `href` points to a route within your application
- The link does not have `target="_blank"` or `target="_self"`
- The link does not have `data-sveltekit-reload`
- The user is not holding Ctrl/Cmd (which tells the browser to open in a new tab)
- The link is a left-click (not right-click or middle-click)

```svelte
<!-- SvelteKit intercepts these (client-side navigation): -->
<a href="/blog">Blog</a>
<a href="/about">About</a>

<!-- SvelteKit does NOT intercept these (full page navigation): -->
<a href="https://svelte.dev">Svelte</a>              <!-- External URL -->
<a href="/blog" target="_blank">Blog</a>              <!-- New tab -->
<a href="/legacy-page" data-sveltekit-reload>Legacy</a> <!-- Explicit opt-out -->
<a href="/files/report.pdf" download>Download</a>     <!-- Download link -->
```

### Preloading for Instant Navigation

SvelteKit can preload linked pages before the user clicks, making navigation feel instant:

```svelte
<!-- Preload data when the user hovers over the link -->
<a href="/blog" data-sveltekit-preload-data="hover">Blog</a>

<!-- The timeline:
     1. User moves mouse toward the link (100-300ms before click)
     2. SvelteKit starts fetching the data for /blog
     3. User clicks the link
     4. Data is already loaded — navigation is instant
-->
```

The `data-sveltekit-preload-data="hover"` attribute is a performance trick worth knowing. Humans take 100-300ms between hovering and clicking. SvelteKit uses this window to prefetch data. By the time the click happens, the data is already loaded and the navigation feels instant.

You can also set preloading at the layout level so all links within a section preload on hover:

```svelte
<!-- In +layout.svelte — all child links preload on hover -->
<div data-sveltekit-preload-data="hover">
  <nav>
    <a href="/blog">Blog</a>
    <a href="/about">About</a>
    <a href="/pricing">Pricing</a>
  </nav>
  {@render children()}
</div>
```

### Navigation State with $app/state

SvelteKit provides information about the current navigation state:

```svelte
<script>
  import { page } from '$app/state';
</script>

<nav>
  <!-- Highlight the active link by checking the current URL -->
  <a href="/blog" class:active={page.url.pathname === '/blog'}>Blog</a>
  <a href="/about" class:active={page.url.pathname === '/about'}>About</a>
</nav>

<style>
  .active {
    font-weight: bold;
    color: #2c3e50;
  }
</style>
```

Note: we use `$app/state` (not `$app/stores`, which is deprecated). The `page` object from `$app/state` gives you reactive access to the current URL, route parameters, error state, and more.

## The Image Tag: Displaying Images

Images use the `<img>` tag. Unlike most HTML tags, `<img>` is **self-closing** — it does not have a closing tag because it has no children:

```svelte
<img src="/photos/sunset.jpg" alt="Orange sunset over the Pacific Ocean" />
```

Two required attributes:
- **`src`** — the URL or path to the image file
- **`alt`** — a text description of the image

Both are required. Omitting `src` is obviously broken — no image appears. But omitting `alt` is also wrong — the Svelte compiler will warn you about it, and it is an accessibility violation.

### Alt Text: A Requirement, Not an Afterthought

The `alt` attribute is not optional, and writing good alt text is a skill. It serves multiple critical purposes:

1. **Screen readers** read the `alt` text aloud, making the image "visible" to visually impaired users
2. **Search engines** use `alt` text to understand and index image content (this affects SEO)
3. **Broken images** display the `alt` text as fallback when the image fails to load
4. **Slow connections** show the `alt` text while the image is still downloading

Writing effective alt text follows a principle: **describe the content and function of the image, not its appearance.**

```svelte
<!-- Good: describes what the image conveys -->
<img src="/photos/team.jpg"
     alt="The engineering team celebrating the product launch" />

<!-- Bad: too vague, provides no useful information -->
<img src="/photos/team.jpg" alt="Photo of people" />

<!-- Bad: redundant words — screen readers already announce "image" -->
<img src="/photos/team.jpg" alt="Image of the team photo" />

<!-- Bad: too long — alt text should be concise (under ~125 characters) -->
<img src="/photos/team.jpg"
     alt="A photograph taken on March 15, 2025 showing twelve members of the
          engineering department standing in front of the office building
          holding champagne glasses and smiling at the camera" />

<!-- Good: concise and informative -->
<img src="/photos/team.jpg"
     alt="Engineering team celebrating the v2.0 launch" />

<!-- Decorative images: use empty alt to tell screen readers to skip -->
<img src="/icons/decorative-divider.svg" alt="" />
<!-- An empty alt="" is DIFFERENT from no alt attribute.
     alt="" means "this image is decorative, skip it."
     No alt attribute means "this image has no description" — a violation. -->

<!-- Functional images: describe the action, not the image -->
<a href="/home">
  <img src="/logo.svg" alt="Return to homepage" />
</a>
<!-- When an image is inside a link, the alt text should describe WHERE
     the link goes, not what the logo looks like. The image is functioning
     as a navigation element, not as visual content. -->
```

### When to Use alt="" (Empty Alt)

Empty `alt=""` is specifically for **decorative images** — images that add visual interest but carry no information. Examples:

```svelte
<!-- Decorative: adds visual flavor but carries no information -->
<img src="/patterns/dots.svg" alt="" />
<img src="/dividers/wave.svg" alt="" />
<img src="/backgrounds/gradient.png" alt="" />

<!-- NOT decorative: carries information the user needs -->
<img src="/charts/revenue.png" alt="Revenue grew 40% in Q3 2025" />
<img src="/icons/warning.svg" alt="Warning" />
<img src="/photos/product.jpg" alt="Blue wireless headphones, side view" />
```

The test: if you removed the image entirely, would the user miss any information? If no, it is decorative — use `alt=""`. If yes, write descriptive alt text.

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

This might seem old-fashioned — "I will handle sizing in CSS." But `width` and `height` serve a critical performance purpose: they let the browser **reserve the correct amount of space** before the image loads. Without them, the page content jumps around as images load in (called **Cumulative Layout Shift**, or CLS), which is jarring for users and penalized by Google's Core Web Vitals.

The browser uses the `width` and `height` to calculate an aspect ratio. Before the image downloads, it renders an invisible box of the correct proportion. When the image arrives, it fills the box with no shift.

Set the intrinsic dimensions in the HTML, then constrain the visual size in CSS:

```css
img {
  max-width: 100%;
  height: auto;
}
```

This gives you responsive behavior (images scale down on smaller screens) while preserving the aspect ratio for the browser's layout calculation.

### WRONG vs CORRECT: Image Dimensions

```svelte
<!-- WRONG: No dimensions — browser allocates 0 height, then jumps -->
<img src="/photo.jpg" alt="Photo" />

<!-- WRONG: Wrong aspect ratio — image will be distorted or cause a shift -->
<img src="/photo.jpg" alt="Photo" width="800" height="800" />
<!-- If the actual image is 800x600, the browser reserves a square space,
     then the image loads as a rectangle — shift! -->

<!-- CORRECT: Dimensions match the actual image aspect ratio -->
<img src="/photo.jpg" alt="Photo" width="800" height="600" />
<!-- Browser reserves an 800x600 (4:3) space. Image loads into it perfectly. -->

<!-- ALSO CORRECT: CSS aspect ratio instead of HTML attributes -->
<img src="/photo.jpg" alt="Photo" class="w-full aspect-video object-cover" />
<!-- aspect-video = 16:9. The browser knows the ratio before the image loads. -->
```

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
- **`srcset`** gives the browser a menu of available image files and their actual widths (the `w` descriptor)
- **`sizes`** tells the browser how wide the image will be displayed at different viewport widths
- The browser combines these to pick the optimal file — it knows the viewport width, the display density (1x, 2x, 3x), and how large the image will actually render

**Reading the `sizes` attribute:** `(max-width: 600px) 100vw, (max-width: 1200px) 50vw, 800px` means:
- On viewports up to 600px wide: the image fills 100% of the viewport width
- On viewports up to 1200px wide: the image fills 50% of the viewport width
- On larger viewports: the image is displayed at 800px wide

The browser does the math. On a 375px phone with a 2x display, it needs a 750px-wide image (375 * 2). It picks `hero-800.jpg` from the menu. On a 1920px desktop, it needs 800px at 1x or 1600px at 2x.

You provide options. The browser picks the best one. This can reduce image transfer sizes by 50-70% on mobile without you writing a single line of JavaScript.

### The `<picture>` Element for Art Direction

When you need different *crops* of an image (not just different sizes), use `<picture>`:

```svelte
<picture>
  <!-- On mobile: show a square crop focused on the product -->
  <source media="(max-width: 768px)"
          srcset="/photos/product-square.webp"
          type="image/webp" />

  <!-- On desktop: show the wide landscape version -->
  <source media="(min-width: 769px)"
          srcset="/photos/product-wide.webp"
          type="image/webp" />

  <!-- Fallback for browsers that don't support WebP -->
  <img src="/photos/product-wide.jpg"
       alt="Product shown on a desk in a home office"
       width="1200" height="630" />
</picture>
```

`<picture>` is also how you serve modern formats (WebP, AVIF) with fallbacks:

```svelte
<picture>
  <source srcset="/photos/hero.avif" type="image/avif" />
  <source srcset="/photos/hero.webp" type="image/webp" />
  <img src="/photos/hero.jpg" alt="Hero image" width="1200" height="630" />
</picture>
<!-- The browser picks the first format it supports.
     AVIF is smallest, WebP is widely supported, JPG is the universal fallback. -->
```

### Lazy Loading

Images below the fold (not visible when the page first loads) should be lazy loaded:

```svelte
<!-- Images visible on initial load: do NOT lazy load -->
<img src="/photos/hero.jpg" alt="Hero banner"
     width="1200" height="600"
     loading="eager" fetchpriority="high" />

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

```svelte
<!-- WRONG: Lazy loading the hero (LCP element) -->
<img src="/hero.webp" alt="Hero" loading="lazy" />
<!-- The browser waits until the image is near the viewport to even START
     downloading it. But it IS the viewport! This delays LCP. -->

<!-- CORRECT: Hero loads eagerly with high priority -->
<img src="/hero.webp" alt="Hero"
     loading="eager" fetchpriority="high"
     width="1200" height="630" />
<!-- The browser starts downloading this immediately, at high priority. -->
```

### SvelteKit Enhanced Images

SvelteKit provides an `enhanced:img` feature that automates image optimization at build time:

```svelte
<script>
  import heroImage from '$lib/images/hero.jpg?enhanced';
</script>

<!-- SvelteKit generates optimized versions automatically -->
<enhanced:img src={heroImage} alt="Team photo at the office" />
```

This transforms your images at build time — generating multiple sizes, converting to modern formats like WebP and AVIF, and adding the correct `srcset`, `sizes`, `width`, and `height` attributes automatically. It is the easiest way to get image performance right without manually creating image variants.

**What `enhanced:img` does for you:**
1. Generates multiple sizes (e.g., 400w, 800w, 1200w)
2. Converts to WebP and AVIF formats
3. Adds `srcset` and `sizes` attributes
4. Adds `width` and `height` to prevent layout shift
5. Sets `loading="lazy"` by default (override with `loading="eager"` for hero images)

## Images Are Your Biggest Performance Bottleneck

This is worth stating directly: **images are almost always the heaviest assets on any web page.** On a typical page, images account for 50-70% of total bytes transferred. A single unoptimized hero image can be larger than all your JavaScript and CSS combined.

The performance checklist:
1. **Right format** — use WebP or AVIF instead of PNG/JPEG where supported (30-50% smaller)
2. **Right size** — serve different sizes for different viewports with `srcset`
3. **Right loading** — lazy load below-the-fold images, eagerly load the hero
4. **Right dimensions** — always set `width` and `height` to prevent layout shift
5. **Right compression** — compress images before shipping (tools like Sharp, Squoosh, or Vite plugins)
6. **Right priority** — add `fetchpriority="high"` to your hero/LCP image

### Image Format Comparison

```
Format    Compression    Browser Support    Best For
─────────────────────────────────────────────────────────
AVIF      Best (50-70%   Modern browsers    Photos, complex images
          smaller)       (Chrome, Firefox)

WebP      Great (30-50%  All modern         Photos, icons, everything
          smaller)       browsers

JPEG      Good           Universal          Photos (fallback)

PNG       Lossless       Universal          Screenshots, graphics
                                            with transparency

SVG       Vector         Universal          Icons, logos, illustrations
          (tiny files)                      (scales to any size)
```

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

### WRONG vs CORRECT: Image Links

```svelte
<!-- WRONG: alt describes the image, not the link destination -->
<a href="/about">
  <img src="/team.jpg" alt="Photo of four people in an office" />
</a>
<!-- Screen reader: "Link: Photo of four people in an office"
     The user has no idea where this link goes. -->

<!-- CORRECT: alt describes where the link goes -->
<a href="/about">
  <img src="/team.jpg" alt="Meet our team" />
</a>
<!-- Screen reader: "Link: Meet our team"
     Clear, actionable, tells the user what to expect. -->

<!-- WRONG: Empty alt on an image that is the ONLY content in a link -->
<a href="/home">
  <img src="/logo.svg" alt="" />
</a>
<!-- Screen reader: "Link" (with no label!)
     The user has no idea what this link does. -->

<!-- CORRECT: Image is the link's only content — alt provides the label -->
<a href="/home">
  <img src="/logo.svg" alt="Return to homepage" />
</a>
```

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

Notice the thoughtful decisions:
- **Lazy loading** on the thumbnail (these cards are likely below the fold in a grid)
- **`srcset`** for responsive images — mobile users download smaller files
- **Semantic `<article>`** wrapper — each card is self-contained content
- **`<del>`** for the original price on sale items — screen readers announce it as "deleted" text, conveying the visual strikethrough meaning
- **Descriptive link text** ("View Details") instead of "Click here" — screen readers list all links on a page, and "Click here" is meaningless out of context
- **Multiple links to the same destination** (image, title, CTA) — the user can click wherever feels natural

### A Navigation Component Example

```svelte
<script>
  import { page } from '$app/state';

  const links = [
    { href: '/', label: 'Home' },
    { href: '/blog', label: 'Blog' },
    { href: '/projects', label: 'Projects' },
    { href: '/about', label: 'About' },
  ];
</script>

<nav aria-label="Main navigation">
  <ul>
    {#each links as link (link.href)}
      <li>
        <a
          href={link.href}
          class:active={page.url.pathname === link.href}
          aria-current={page.url.pathname === link.href ? 'page' : undefined}
        >
          {link.label}
        </a>
      </li>
    {/each}

    <li>
      <a href="https://github.com/myproject"
         target="_blank" rel="noopener noreferrer">
        GitHub
        <span class="sr-only">(opens in new tab)</span>
      </a>
    </li>
  </ul>
</nav>

<style>
  .active {
    font-weight: bold;
    border-bottom: 2px solid currentColor;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
```

Key accessibility details:
- **`aria-label="Main navigation"`** identifies this nav for screen readers (important when a page has multiple `<nav>` elements)
- **`aria-current="page"`** tells screen readers which link is the current page
- **`sr-only` class** hides "(opens in new tab)" visually but announces it to screen readers
- **Links inside a `<ul>`** — navigation links are a list, and structuring them as one lets screen readers announce "list, 5 items"

## Try It

Build a "Favorite Links" component that includes:
- At least three links using different `href` patterns (external with `https://`, hash `#section`, and `mailto:` or `tel:`)
- One external link that opens in a new tab with proper `rel="noopener noreferrer"` attributes and a visual indicator (icon or text) that it opens externally
- An image with descriptive `alt` text, explicit `width` and `height`, and `loading="lazy"`
- A clickable image (image wrapped in a link) with `alt` text describing the destination, not the image
- An active link indicator using `$app/state`'s `page.url.pathname` and a `class:active` directive
- Add `data-sveltekit-preload-data="hover"` to at least one internal link and observe the network tab in DevTools to see the preload request fire on hover
- Use `srcset` on at least one image to provide two different sizes — verify in DevTools that the browser selects the appropriate size based on your viewport width

## Key Takeaways

- `<a href="...">` creates links — `href` supports absolute, relative, root-relative, hash, `mailto:`, `tel:`, and `download` patterns — always use root-relative URLs (`/about`) for internal links in SvelteKit
- Always add `rel="noopener noreferrer"` when using `target="_blank"` — it is a security requirement that prevents the new page from accessing `window.opener` and redirecting your page
- SvelteKit automatically turns internal `<a>` tags into client-side SPA navigation — no special component needed, which is simpler and more accessible than framework-specific `<Link>` components
- Use `data-sveltekit-preload-data="hover"` to prefetch page data during the 100-300ms between hover and click — the navigation feels instant
- Use `$app/state` (not the deprecated `$app/stores`) to access the current page URL for active link styling with `aria-current="page"`
- `<img>` requires both `src` and meaningful `alt` text — decorative images use `alt=""` (empty string, not missing attribute) to signal screen readers to skip them
- When an image is inside a link, the `alt` text should describe the link destination, not the image content — the image is functioning as a navigation label
- Always set `width` and `height` on images to prevent Cumulative Layout Shift — the browser uses them to calculate an aspect ratio and reserve space before the image downloads
- Use `srcset` and `sizes` for responsive images — let the browser choose the optimal file for the device, saving 50-70% bandwidth on mobile
- Use `loading="lazy"` for below-the-fold images, but never for your hero or LCP image — add `fetchpriority="high"` to your most important image
- Images are typically 50-70% of page weight — optimizing format (WebP/AVIF), size (srcset), loading (lazy), and compression is the single highest-impact performance work you can do
- Use `<picture>` with `<source>` for art direction (different crops) and format fallbacks (AVIF > WebP > JPEG)
