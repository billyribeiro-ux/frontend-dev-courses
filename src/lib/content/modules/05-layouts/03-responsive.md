# Responsive Design

A website that looks great on a desktop but falls apart on a phone is not a finished website. **Responsive design** means your layout adapts to any screen size — phones, tablets, laptops, and giant monitors. Over half of all web traffic comes from mobile devices, so this is not optional.

The good news: you already know some responsive techniques! Flexbox's `flex-wrap` and Grid's `auto-fit` both adapt to screen size automatically. But for fine-tuned control, you need **media queries** and **responsive units**.

## Mobile-First Approach

The mobile-first approach means you write your base CSS for small screens first, then add styles for larger screens using media queries. This is the industry standard because:

1. It forces you to focus on essential content first
2. Mobile CSS is usually simpler (single column, stacked layout)
3. It is easier to add complexity than to remove it

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
    font-size: 1.5rem;
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

## Common Breakpoints

Breakpoints are the screen widths where your layout changes. Here are the most common:

| Breakpoint | Target |
|-----------|--------|
| `480px` | Large phones |
| `768px` | Tablets |
| `1024px` | Small laptops |
| `1280px` | Desktops |

You do not need to use all of them. Many sites only use two or three breakpoints.

## Responsive Units

Fixed units like `px` do not adapt to screen size. Responsive units do:

| Unit | Relative To | Example |
|------|------------|---------|
| `%` | Parent element's size | `width: 50%` |
| `vw` | Viewport (screen) width | `font-size: 5vw` |
| `vh` | Viewport (screen) height | `height: 100vh` |
| `rem` | Root font size (usually 16px) | `padding: 1.5rem` |
| `em` | Parent element's font size | `margin: 2em` |

```svelte
<section class="hero">
  <h1>Welcome</h1>
  <p>This section always fills the screen height.</p>
</section>

<div class="content">
  <p>Content below uses rem for consistent spacing.</p>
</div>

<style>
  .hero {
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    background: #2c3e50;
    color: white;
  }

  .hero h1 {
    font-size: 3rem;
  }

  .content {
    padding: 2rem;
    max-width: 800px;
    margin: 0 auto;
  }
</style>
```

## rem vs px

Use `rem` for most sizing. It scales if the user changes their browser's default font size, making your site more accessible:

```svelte
<div class="card">
  <h2>Accessible Card</h2>
  <p>All spacing uses rem units for better accessibility.</p>
</div>

<style>
  .card {
    padding: 1.5rem;
    margin: 1rem;
    border-radius: 0.5rem;
    border: 1px solid #ddd;
  }

  .card h2 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
  }

  .card p {
    font-size: 1rem;
    line-height: 1.6;
  }
</style>
```

## max-width for Readability

On large screens, text that stretches the full width is hard to read. Use `max-width` to constrain content:

```svelte
<article class="post">
  <h1>My Blog Post</h1>
  <p>
    This text will never be wider than 700px, keeping it comfortable
    to read on any screen. On small screens it naturally takes the
    full width. No media query needed.
  </p>
</article>

<style>
  .post {
    max-width: 700px;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
```

## A Responsive Card Layout

Here is a complete responsive layout combining everything:

```svelte
<div class="cards">
  <div class="card">
    <h3>Feature 1</h3>
    <p>Cards stack on mobile and flow into columns on desktop.</p>
  </div>
  <div class="card">
    <h3>Feature 2</h3>
    <p>This uses Grid with auto-fit for automatic responsiveness.</p>
  </div>
  <div class="card">
    <h3>Feature 3</h3>
    <p>Combined with media queries for font size adjustments.</p>
  </div>
</div>

<style>
  .cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    padding: 1rem;
    max-width: 1200px;
    margin: 0 auto;
  }

  .card {
    padding: 1.5rem;
    background: white;
    border-radius: 0.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .card h3 {
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
  }

  @media (min-width: 768px) {
    .card h3 {
      font-size: 1.4rem;
    }
  }
</style>
```

## Try It

Build a responsive "Landing Page" component with:
- A full-screen hero section using `100vh` height
- A three-column feature section that stacks to a single column on mobile
- Use `rem` units for all spacing and font sizes
- Add at least one `@media` query for tablet breakpoint (768px)
- Use `max-width` to keep content readable on large screens

## Key Takeaways

- **Mobile-first** means writing base styles for phones, then adding media queries for larger screens
- `@media (min-width: 768px) {}` applies styles only on screens 768px or wider
- Common breakpoints: `480px` (phone), `768px` (tablet), `1024px` (laptop), `1280px` (desktop)
- Use `rem` instead of `px` for accessible, scalable sizing
- `vw` and `vh` are relative to the screen size — `100vh` fills the full screen height
- `max-width` with `margin: 0 auto` keeps content readable and centered
- Grid's `auto-fit` + `minmax()` often eliminates the need for media queries
