# Responsive Design

A website that looks great on a desktop but falls apart on a phone is not a finished website. **Responsive design** means your layout adapts to any screen size — phones, tablets, laptops, and giant monitors. Over half of all web traffic comes from mobile devices, so this is not optional.

The good news: you already know some responsive techniques! Flexbox's `flex-wrap` and Grid's `auto-fit` both adapt to screen size automatically. But for fine-tuned control, you need **media queries**, **container queries**, and **responsive units**.

## The Mobile-First Philosophy

Mobile-first means you write your base CSS for small screens first, then add styles for larger screens using media queries. This is the industry standard because:

1. **It forces you to prioritize.** Small screens have limited space, so you focus on essential content and functionality first.
2. **Mobile CSS is simpler.** Single column, stacked layout, full-width elements — these are the simplest CSS to write.
3. **It is easier to add complexity than to remove it.** Adding a sidebar at 768px is one rule. Hiding a sidebar below 768px requires overriding multiple rules.
4. **Performance.** Mobile devices parse CSS that applies to them first. Desktop enhancements are behind `min-width` queries that mobile devices skip.

```svelte
<div class="container">
  <h1>My Website</h1>
  <p>This layout adapts to any screen size.</p>
</div>

<style>
  /* Base styles — these apply to ALL screen sizes (mobile first) */
  .container {
    padding: 16px;
    max-width: 1200px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.5rem; /* Small screens */
  }

  /* Tablet and up (768px or wider) */
  @media (min-width: 768px) {
    h1 {
      font-size: 2rem;
    }
  }

  /* Desktop and up (1024px or wider) */
  @media (min-width: 1024px) {
    h1 {
      font-size: 2.5rem;
    }
  }
</style>
```

**The mistake to avoid**: Writing desktop-first CSS and then overriding everything with `max-width` queries for mobile. You end up shipping desktop styles to mobile devices and then immediately overriding them — wasted bandwidth and more CSS to maintain.

## Media Queries

A **media query** applies CSS only when the screen matches a condition. The most common condition is `min-width`:

```svelte
<div class="layout">
  <aside class="sidebar">Sidebar</aside>
  <main class="content">Main Content</main>
</div>

<style>
  /* Mobile: single column, stacked */
  .layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
  }

  .sidebar {
    background: #2c3e50;
    color: white;
    padding: 16px;
    border-radius: 8px;
  }

  .content {
    background: #ecf0f1;
    padding: 16px;
    border-radius: 8px;
  }

  /* Tablet: side by side */
  @media (min-width: 768px) {
    .layout {
      flex-direction: row;
    }

    .sidebar {
      width: 250px;
      flex-shrink: 0;
    }

    .content {
      flex: 1;
    }
  }
</style>
```

On mobile, the sidebar stacks on top of the content. On wider screens, they sit side by side.

**Media query features beyond width**:

```css
/* Orientation */
@media (orientation: landscape) { /* ... */ }
@media (orientation: portrait) { /* ... */ }

/* Hover capability (touch vs mouse) */
@media (hover: hover) {
  /* Only devices with a mouse/trackpad — safe to add hover effects */
  .card:hover { transform: scale(1.02); }
}

@media (hover: none) {
  /* Touch devices — no hover effects */
}

/* Prefers reduced motion (accessibility) */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}

/* Dark mode preference */
@media (prefers-color-scheme: dark) {
  :root { --bg: #1a1a1a; --text: #e0e0e0; }
}

/* High-resolution displays */
@media (min-resolution: 2dppx) {
  /* Retina-specific styles, like higher-res background images */
}

/* Range syntax (modern browsers) */
@media (768px <= width <= 1024px) {
  /* Tablet only */
}
```

## Common Breakpoints

Breakpoints are the screen widths where your layout changes:

| Breakpoint | Target | Tailwind Class |
|---|---|---|
| `480px` | Large phones | `xs:` (custom) |
| `640px` | Small tablets | `sm:` |
| `768px` | Tablets | `md:` |
| `1024px` | Small laptops | `lg:` |
| `1280px` | Desktops | `xl:` |
| `1536px` | Large desktops | `2xl:` |

**You do not need all of them.** Many sites only use two or three breakpoints. The right breakpoints depend on your content, not on arbitrary device widths. Add a breakpoint when your layout looks broken, not at every standard width.

**Breakpoint selection strategy**: Open your site in a browser window and slowly resize from wide to narrow. The moment something looks bad — text is too wide, columns are too cramped, spacing feels wrong — that is where you add a breakpoint.

## CSS Container Queries

Media queries respond to the *viewport* width. Container queries respond to the width of a *parent element*. This is revolutionary for component-based development because a component can adapt to wherever it is placed — in a sidebar, in a main content area, or in a modal.

```svelte
<div class="sidebar-container">
  <div class="card-component">
    <img src="https://picsum.photos/400/200" alt="Demo" />
    <h3>Responsive Card</h3>
    <p>I adapt to my container, not the viewport.</p>
  </div>
</div>

<div class="main-container">
  <div class="card-component">
    <img src="https://picsum.photos/400/200" alt="Demo" />
    <h3>Responsive Card</h3>
    <p>Same component, wider container — different layout.</p>
  </div>
</div>

<style>
  /* Mark containers as queryable */
  .sidebar-container {
    container-type: inline-size;
    width: 300px;
    padding: 16px;
    background: #f1f5f9;
  }

  .main-container {
    container-type: inline-size;
    width: 600px;
    padding: 16px;
    background: #f1f5f9;
    margin-top: 16px;
  }

  /* Base styles: vertical layout */
  .card-component {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #e2e8f0;
  }

  .card-component img {
    width: 100%;
    height: 150px;
    object-fit: cover;
  }

  .card-component h3, .card-component p {
    padding: 0 16px;
  }

  /* When container is wide enough: horizontal layout */
  @container (min-width: 500px) {
    .card-component {
      display: grid;
      grid-template-columns: 200px 1fr;
    }

    .card-component img {
      height: 100%;
    }
  }
</style>
```

**The key property**: `container-type: inline-size` on the parent makes it queryable. Then `@container (min-width: ...)` checks the *container's* width, not the viewport.

**Named containers**: When you have nested containers, name them to be explicit about which one you are querying:

```css
.sidebar {
  container-type: inline-size;
  container-name: sidebar;
}

@container sidebar (min-width: 300px) {
  /* These styles respond to .sidebar's width specifically */
}
```

## Fluid Typography with clamp()

Hard breakpoints for font sizes create jarring jumps. `clamp()` creates smooth, continuous scaling:

```css
/* clamp(minimum, preferred, maximum) */
h1 {
  font-size: clamp(1.5rem, 4vw, 3rem);
  /* At least 1.5rem, ideally 4% of viewport width, at most 3rem */
}

h2 {
  font-size: clamp(1.25rem, 3vw, 2rem);
}

p {
  font-size: clamp(1rem, 1.5vw, 1.25rem);
}
```

**How clamp() works**: The browser evaluates the three values and picks whichever is in the middle. On a narrow screen, `4vw` might be smaller than `1.5rem`, so it uses `1.5rem`. On a wide screen, `4vw` might exceed `3rem`, so it uses `3rem`. In between, it scales fluidly with `4vw`.

**The formula for the preferred value**: A useful starting point is `preferred = minimum + (maximum - minimum) * (viewport-unit / reference-viewport)`. But in practice, just try a few `vw` values and see what looks right.

```svelte
<div class="fluid-text">
  <h1>Fluid Heading</h1>
  <p>This text scales smoothly between the minimum and maximum sizes without any breakpoints.</p>
</div>

<style>
  .fluid-text {
    padding: clamp(1rem, 3vw, 3rem);
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    font-size: clamp(1.75rem, 4vw + 0.5rem, 3.5rem);
    line-height: 1.2;
    margin-bottom: 1rem;
  }

  p {
    font-size: clamp(1rem, 1.2vw + 0.5rem, 1.25rem);
    line-height: 1.7;
  }
</style>
```

## Responsive Images

Images are one of the biggest responsive challenges. They need to look sharp on retina displays, load quickly on mobile, and not stretch or distort.

```svelte
<!-- Basic responsive image -->
<img src="/photo.jpg" alt="Description" class="responsive" />

<!-- Responsive with different sources -->
<picture>
  <source media="(min-width: 1024px)" srcset="/photo-large.jpg" />
  <source media="(min-width: 768px)" srcset="/photo-medium.jpg" />
  <img src="/photo-small.jpg" alt="Description" />
</picture>

<!-- Resolution switching for retina displays -->
<img
  src="/photo-400.jpg"
  srcset="/photo-400.jpg 400w, /photo-800.jpg 800w, /photo-1200.jpg 1200w"
  sizes="(min-width: 1024px) 50vw, 100vw"
  alt="Description"
/>

<style>
  .responsive {
    max-width: 100%;
    height: auto; /* Maintain aspect ratio */
    display: block; /* Remove bottom gap */
  }

  /* Modern: aspect-ratio for consistent sizing */
  .card-image {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border-radius: 8px;
  }
</style>
```

**`object-fit: cover`** is essential for responsive images in fixed-size containers. It scales the image to cover the container while maintaining aspect ratio, cropping overflow. `object-fit: contain` scales to fit inside the container without cropping.

**`aspect-ratio`** sets a consistent aspect ratio regardless of the image's natural dimensions. Combined with `object-fit: cover`, it ensures all images in a grid look consistent.

## Viewport Units: vw, vh, dvh, svh, lvh

Viewport units size elements relative to the browser window:

| Unit | Meaning |
|---|---|
| `vw` | 1% of viewport width |
| `vh` | 1% of viewport height |
| `dvh` | 1% of *dynamic* viewport height (accounts for mobile browser chrome) |
| `svh` | 1% of *small* viewport height (address bar visible) |
| `lvh` | 1% of *large* viewport height (address bar hidden) |
| `vmin` | 1% of whichever viewport dimension is smaller |
| `vmax` | 1% of whichever viewport dimension is larger |

```svelte
<section class="hero">
  <h1>Full-Screen Hero</h1>
  <p>This section fills the viewport height.</p>
</section>

<style>
  .hero {
    /* dvh accounts for mobile browser address bar */
    height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: #2c3e50;
    color: white;
    text-align: center;
    padding: 2rem;
  }

  .hero h1 {
    font-size: clamp(2rem, 5vw, 4rem);
  }
</style>
```

**The `100vh` problem on mobile**: Mobile browsers have a URL bar that hides when you scroll. `100vh` uses the *large* viewport height (URL bar hidden), which means content initially overflows the visible area. Use `100dvh` instead — it adjusts dynamically as the URL bar shows/hides. If you need a stable size, `100svh` gives you the small viewport (URL bar visible).

## Responsive Spacing Strategies

Consistent spacing scales are easier to maintain than ad-hoc values:

```svelte
<style>
  :root {
    /* Fluid spacing scale */
    --space-xs: clamp(0.25rem, 0.5vw, 0.5rem);
    --space-sm: clamp(0.5rem, 1vw, 0.75rem);
    --space-md: clamp(0.75rem, 2vw, 1.5rem);
    --space-lg: clamp(1rem, 3vw, 2.5rem);
    --space-xl: clamp(1.5rem, 5vw, 4rem);
    --space-2xl: clamp(2rem, 7vw, 6rem);
  }

  .section {
    padding: var(--space-xl) var(--space-lg);
  }

  .card {
    padding: var(--space-md);
    gap: var(--space-sm);
  }

  .stack > * + * {
    margin-top: var(--space-md);
  }
</style>
```

This approach uses CSS custom properties with `clamp()` to create a fluid spacing scale. On small screens, spacing is tighter. On large screens, spacing is more generous. No breakpoints needed.

## Responsive Navigation: Hamburger Menu

The most common responsive pattern — a horizontal navbar on desktop that collapses into a hamburger menu on mobile:

```svelte
<script>
  let menuOpen = $state(false);
</script>

<nav class="nav">
  <div class="nav-brand">MySite</div>

  <button
    class="hamburger"
    onclick={() => menuOpen = !menuOpen}
    aria-label="Toggle navigation"
    aria-expanded={menuOpen}
  >
    <span class="bar"></span>
    <span class="bar"></span>
    <span class="bar"></span>
  </button>

  <div class="nav-links" class:open={menuOpen}>
    <a href="/" onclick={() => menuOpen = false}>Home</a>
    <a href="/about" onclick={() => menuOpen = false}>About</a>
    <a href="/services" onclick={() => menuOpen = false}>Services</a>
    <a href="/contact" onclick={() => menuOpen = false}>Contact</a>
  </div>
</nav>

<style>
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    padding: 12px 24px;
    background: #1e293b;
  }

  .nav-brand {
    font-size: 1.3rem;
    font-weight: bold;
    color: white;
  }

  .hamburger {
    display: flex;
    flex-direction: column;
    gap: 5px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
  }

  .bar {
    display: block;
    width: 24px;
    height: 3px;
    background: white;
    border-radius: 2px;
    transition: all 0.3s;
  }

  .nav-links {
    display: none;
    flex-basis: 100%;
    flex-direction: column;
    gap: 0;
  }

  .nav-links.open {
    display: flex;
  }

  .nav-links a {
    display: block;
    padding: 12px 0;
    color: #94a3b8;
    text-decoration: none;
    border-bottom: 1px solid #334155;
  }

  .nav-links a:hover {
    color: white;
  }

  /* Desktop: horizontal links, hide hamburger */
  @media (min-width: 768px) {
    .hamburger {
      display: none;
    }

    .nav-links {
      display: flex;
      flex-basis: auto;
      flex-direction: row;
      gap: 24px;
    }

    .nav-links a {
      padding: 0;
      border-bottom: none;
    }
  }
</style>
```

This pattern:
- Shows a hamburger button on mobile that toggles the menu
- Uses `flex-wrap: wrap` so the menu drops below the navbar on mobile
- Hides the hamburger and shows horizontal links on desktop
- Includes `aria-label` and `aria-expanded` for accessibility
- Closes the menu when a link is clicked

## Responsive Data Tables

Tables are notoriously difficult to make responsive. Here are two approaches:

### Horizontal scroll

The simplest approach — wrap the table in a scrollable container:

```svelte
<div class="table-wrapper">
  <table>
    <thead>
      <tr>
        <th>Name</th>
        <th>Email</th>
        <th>Role</th>
        <th>Status</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Alex Chen</td>
        <td>alex@example.com</td>
        <td>Admin</td>
        <td>Active</td>
        <td><button>Edit</button></td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  .table-wrapper {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch; /* Smooth scrolling on iOS */
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  table {
    width: 100%;
    min-width: 600px; /* Prevents cramping */
    border-collapse: collapse;
  }

  th, td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
    white-space: nowrap;
  }

  th { background: #f8fafc; font-weight: 600; }
</style>
```

### Card-style on mobile

Transform table rows into stacked cards on small screens:

```svelte
<table class="responsive-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Email</th>
      <th>Role</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td data-label="Name">Alex Chen</td>
      <td data-label="Email">alex@example.com</td>
      <td data-label="Role">Admin</td>
      <td data-label="Status">Active</td>
    </tr>
    <tr>
      <td data-label="Name">Sam Rivera</td>
      <td data-label="Email">sam@example.com</td>
      <td data-label="Role">Editor</td>
      <td data-label="Status">Inactive</td>
    </tr>
  </tbody>
</table>

<style>
  .responsive-table {
    width: 100%;
    border-collapse: collapse;
  }

  .responsive-table th,
  .responsive-table td {
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid #e2e8f0;
  }

  .responsive-table th {
    background: #f8fafc;
    font-weight: 600;
  }

  @media (max-width: 640px) {
    .responsive-table thead {
      display: none; /* Hide header row */
    }

    .responsive-table tr {
      display: block;
      margin-bottom: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 8px 0;
    }

    .responsive-table td {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px;
      border-bottom: 1px solid #f1f5f9;
    }

    .responsive-table td::before {
      content: attr(data-label);
      font-weight: 600;
      color: #64748b;
    }
  }
</style>
```

## Testing Responsive Designs

**Browser DevTools**: Every browser has responsive design mode (Ctrl+Shift+M in Firefox, Ctrl+Shift+I then toggle device toolbar in Chrome). Test at various widths, not just the standard breakpoints.

**Real devices**: Always test on actual phones and tablets. Touch targets need to be at least 44x44 pixels. Hover effects need alternatives.

**Checklist for responsive testing**:
- Does text remain readable at all sizes?
- Do images scale without distortion?
- Are touch targets large enough (44px minimum)?
- Does the navigation work on mobile?
- Do tables display usable data on narrow screens?
- Is horizontal scrolling avoided (except for tables/code)?
- Does the site work in both portrait and landscape?
- Do forms remain usable on small screens?

## Tailwind Responsive Utilities Deep Dive

Tailwind's responsive system is mobile-first. Unprefixed utilities apply to all screens. Prefixed utilities (`sm:`, `md:`, `lg:`, etc.) apply at that breakpoint and above:

```html
<!-- Mobile: full width, stacked. Tablet: 2 columns. Desktop: 3 columns -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">

<!-- Mobile: hidden. Desktop: visible -->
<aside class="hidden lg:block">Sidebar</aside>

<!-- Mobile: column. Tablet: row -->
<div class="flex flex-col md:flex-row gap-4">

<!-- Responsive text size -->
<h1 class="text-2xl md:text-4xl lg:text-6xl">

<!-- Responsive padding -->
<section class="px-4 md:px-8 lg:px-16">

<!-- Responsive grid spans -->
<div class="col-span-1 md:col-span-2 lg:col-span-3">

<!-- Mobile-only styles (use max-* modifier) -->
<div class="max-md:text-center">Centered on mobile only</div>
```

**Common responsive patterns in Tailwind**:

```html
<!-- Container with responsive padding -->
<div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

<!-- Stack → Side by side -->
<div class="flex flex-col sm:flex-row gap-4">

<!-- Full-width → constrained -->
<div class="w-full md:w-1/2 lg:w-1/3">

<!-- Responsive navigation -->
<nav class="flex flex-col md:flex-row md:items-center md:gap-6">
```

## Complete Responsive Page Layout

Here is a full production-quality responsive page:

```svelte
<script>
  let menuOpen = $state(false);
</script>

<div class="page">
  <!-- Navigation -->
  <nav class="nav">
    <a href="/" class="logo">Brand</a>
    <button class="menu-btn" onclick={() => menuOpen = !menuOpen} aria-label="Menu">
      {menuOpen ? '✕' : '☰'}
    </button>
    <div class="nav-links" class:open={menuOpen}>
      <a href="/features">Features</a>
      <a href="/pricing">Pricing</a>
      <a href="/docs">Docs</a>
      <a href="/login" class="cta">Sign In</a>
    </div>
  </nav>

  <!-- Hero -->
  <section class="hero">
    <div class="hero-content">
      <h1>Build better websites, faster</h1>
      <p>A modern framework for creating reactive web applications with less code.</p>
      <div class="hero-actions">
        <a href="/get-started" class="btn-primary">Get Started</a>
        <a href="/docs" class="btn-secondary">Documentation</a>
      </div>
    </div>
  </section>

  <!-- Features -->
  <section class="features">
    <h2>Why developers love it</h2>
    <div class="feature-grid">
      <div class="feature">
        <div class="feature-icon">⚡</div>
        <h3>Blazing Fast</h3>
        <p>Compiled to minimal JavaScript for optimal runtime performance.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">📦</div>
        <h3>Small Bundle</h3>
        <p>No runtime framework overhead. Ship only what you use.</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🛠️</div>
        <h3>Great DX</h3>
        <p>Intuitive API, excellent tooling, and helpful error messages.</p>
      </div>
    </div>
  </section>

  <!-- CTA -->
  <section class="cta-section">
    <h2>Ready to get started?</h2>
    <p>Join thousands of developers building with our platform.</p>
    <a href="/signup" class="btn-primary">Create Free Account</a>
  </section>

  <!-- Footer -->
  <footer class="footer">
    <div class="footer-grid">
      <div>
        <h4>Product</h4>
        <a href="/features">Features</a>
        <a href="/pricing">Pricing</a>
        <a href="/changelog">Changelog</a>
      </div>
      <div>
        <h4>Resources</h4>
        <a href="/docs">Documentation</a>
        <a href="/tutorials">Tutorials</a>
        <a href="/blog">Blog</a>
      </div>
      <div>
        <h4>Company</h4>
        <a href="/about">About</a>
        <a href="/careers">Careers</a>
        <a href="/contact">Contact</a>
      </div>
    </div>
    <p class="copyright">&copy; 2024 Brand. All rights reserved.</p>
  </footer>
</div>

<style>
  /* ===== Reset & Base (Mobile First) ===== */
  .page {
    font-family: system-ui, -apple-system, sans-serif;
    color: #1e293b;
  }

  /* ===== Navigation ===== */
  .nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    padding: 16px 24px;
    background: white;
    border-bottom: 1px solid #e2e8f0;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .logo {
    font-size: 1.3rem;
    font-weight: 800;
    color: #3498db;
    text-decoration: none;
  }

  .menu-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
  }

  .nav-links {
    display: none;
    flex-basis: 100%;
    flex-direction: column;
  }

  .nav-links.open { display: flex; }

  .nav-links a {
    padding: 12px 0;
    color: #475569;
    text-decoration: none;
    border-bottom: 1px solid #f1f5f9;
  }

  .nav-links .cta {
    color: #3498db;
    font-weight: 600;
  }

  /* ===== Hero ===== */
  .hero {
    padding: clamp(3rem, 10vw, 8rem) 24px;
    text-align: center;
    background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
  }

  .hero-content {
    max-width: 700px;
    margin: 0 auto;
  }

  .hero h1 {
    font-size: clamp(2rem, 5vw, 3.5rem);
    font-weight: 800;
    line-height: 1.1;
    margin-bottom: 1rem;
    color: #0f172a;
  }

  .hero p {
    font-size: clamp(1rem, 2vw, 1.25rem);
    color: #475569;
    line-height: 1.6;
    margin-bottom: 2rem;
  }

  .hero-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
  }

  .btn-primary {
    display: inline-block;
    padding: 14px 32px;
    background: #3498db;
    color: white;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    font-size: 1rem;
    text-align: center;
    transition: background 0.2s;
  }

  .btn-primary:hover { background: #2980b9; }

  .btn-secondary {
    display: inline-block;
    padding: 14px 32px;
    background: white;
    color: #475569;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 600;
    text-align: center;
  }

  /* ===== Features ===== */
  .features {
    padding: clamp(3rem, 8vw, 6rem) 24px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .features h2 {
    text-align: center;
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    margin-bottom: clamp(2rem, 4vw, 3rem);
  }

  .feature-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
  }

  .feature {
    text-align: center;
    padding: 24px;
  }

  .feature-icon {
    font-size: 2.5rem;
    margin-bottom: 12px;
  }

  .feature h3 {
    font-size: 1.25rem;
    margin-bottom: 8px;
  }

  .feature p {
    color: #64748b;
    line-height: 1.6;
  }

  /* ===== CTA Section ===== */
  .cta-section {
    text-align: center;
    padding: clamp(3rem, 8vw, 6rem) 24px;
    background: #1e293b;
    color: white;
  }

  .cta-section h2 {
    font-size: clamp(1.5rem, 3vw, 2.5rem);
    margin-bottom: 0.5rem;
  }

  .cta-section p {
    color: #94a3b8;
    margin-bottom: 2rem;
    font-size: 1.1rem;
  }

  /* ===== Footer ===== */
  .footer {
    padding: clamp(2rem, 5vw, 4rem) 24px;
    background: #0f172a;
    color: #94a3b8;
  }

  .footer-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 32px;
    max-width: 1100px;
    margin: 0 auto;
  }

  .footer h4 {
    color: white;
    margin-bottom: 12px;
  }

  .footer a {
    display: block;
    color: #94a3b8;
    text-decoration: none;
    padding: 4px 0;
  }

  .footer a:hover { color: white; }

  .copyright {
    text-align: center;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #1e293b;
    font-size: 0.85rem;
  }

  /* ===== Tablet (768px+) ===== */
  @media (min-width: 768px) {
    .menu-btn { display: none; }

    .nav-links {
      display: flex;
      flex-basis: auto;
      flex-direction: row;
      gap: 24px;
      align-items: center;
    }

    .nav-links a { padding: 0; border-bottom: none; }

    .hero-actions {
      flex-direction: row;
      justify-content: center;
    }

    .feature-grid {
      grid-template-columns: repeat(3, 1fr);
    }

    .footer-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  /* ===== Desktop (1024px+) ===== */
  @media (min-width: 1024px) {
    .nav {
      padding: 16px 48px;
    }

    .features, .footer-grid {
      padding-left: 48px;
      padding-right: 48px;
    }
  }
</style>
```

This page uses:
- **Mobile-first** architecture — base styles are for phones
- **Only two breakpoints** (768px and 1024px) — proving you rarely need more
- **`clamp()`** for fluid typography and spacing — no per-breakpoint font sizes
- **Grid** for the feature cards and footer columns
- **Flexbox** for the navigation and hero buttons
- **Sticky navigation** that stays visible on scroll
- **`dvh` and viewport units** avoided for section heights — content-based sizing instead
- **Hamburger menu** that toggles on mobile

## Try It

Build a responsive "Landing Page" component with:
- A sticky navigation bar that collapses to a hamburger menu below 768px
- A full-screen hero section using `100dvh` height with fluid `clamp()` typography
- A three-column feature section that stacks to a single column on mobile using CSS Grid
- A testimonial section using `@container` queries so each testimonial card adapts to its container width
- Use `rem` units for all spacing and fluid `clamp()` for font sizes
- A footer with a 3-column grid that collapses to 1 column on mobile
- Add a `prefers-reduced-motion` media query that disables transitions
- Test at 375px, 768px, and 1280px — it should look polished at all three

## Key Takeaways

- **Mobile-first** means writing base styles for phones, then adding complexity for larger screens with `min-width` queries
- `@media (min-width: 768px) {}` applies styles only on screens 768px or wider — stack these from small to large
- **Container queries** (`@container`) let components respond to their container width, not the viewport — essential for reusable components
- `clamp(min, preferred, max)` creates fluid typography and spacing that scales smoothly without breakpoints
- Common breakpoints: `640px`, `768px`, `1024px`, `1280px` — but add breakpoints where your content needs them, not at arbitrary device widths
- Use `rem` instead of `px` for accessible, scalable sizing that respects user font preferences
- `dvh` fixes the `100vh` mobile browser bar problem — use it for full-viewport sections
- `aspect-ratio` with `object-fit: cover` creates consistent responsive images
- `max-width` with `margin: 0 auto` keeps content readable and centered on wide screens
- Grid's `auto-fit` + `minmax()` and Flexbox's `flex-wrap` often eliminate the need for media queries entirely
- Always test with real devices, check touch target sizes (44px minimum), and respect `prefers-reduced-motion`
