# Lists & Structure

As your web pages grow, you need two things: a way to display **lists** of items and a way to organize your page into **meaningful sections**. HTML gives you elements for both — list tags for ordered and unordered content, and semantic tags that describe the purpose of each section.

Semantic HTML is one of those things that separates beginners from professionals. Search engines, screen readers, and other developers all rely on semantic tags to understand your page. Let's learn both concepts.

## Unordered Lists

An unordered list displays items with bullet points. Use `<ul>` for the list container and `<li>` for each item:

```svelte
<h2>Grocery List</h2>
<ul>
  <li>Apples</li>
  <li>Bread</li>
  <li>Milk</li>
  <li>Cheese</li>
</ul>
```

## Ordered Lists

An ordered list displays items with numbers. Just swap `<ul>` for `<ol>`:

```svelte
<h2>Morning Routine</h2>
<ol>
  <li>Wake up</li>
  <li>Brush teeth</li>
  <li>Make coffee</li>
  <li>Start coding</li>
</ol>
```

## Nested Lists

You can put lists inside lists. This is great for sub-categories:

```svelte
<ul>
  <li>
    Frontend
    <ul>
      <li>HTML</li>
      <li>CSS</li>
      <li>JavaScript</li>
    </ul>
  </li>
  <li>
    Backend
    <ul>
      <li>Node.js</li>
      <li>Databases</li>
    </ul>
  </li>
</ul>
```

## Semantic HTML: Giving Your Page Meaning

So far, you could wrap everything in `<div>` tags and it would look the same. But **semantic HTML** uses tags that describe what the content actually is. This helps screen readers, search engines, and your future self understand the page.

Here are the most important semantic tags:

| Tag | Purpose |
|-----|---------|
| `<header>` | Top section of a page or component (logo, title, nav) |
| `<nav>` | Navigation links |
| `<main>` | The primary content of the page |
| `<section>` | A thematic grouping of content |
| `<article>` | Self-contained content (blog post, news story) |
| `<footer>` | Bottom section (copyright, links, contact info) |

## A Semantic Page Layout

Here is how a well-structured Svelte component looks using semantic HTML:

```svelte
<header>
  <h1>My Blog</h1>
  <nav>
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  </nav>
</header>

<main>
  <article>
    <h2>My First Post</h2>
    <p>Today I learned about semantic HTML!</p>
  </article>

  <article>
    <h2>Learning Svelte</h2>
    <p>Svelte makes building websites so much easier.</p>
  </article>
</main>

<footer>
  <p>&copy; 2025 My Blog. All rights reserved.</p>
</footer>
```

Compare that to wrapping everything in `<div>` tags — the semantic version tells you exactly what each section does just by reading the tag names.

## When to Use div vs Semantic Tags

Use a `<div>` when you need a generic container for styling purposes. Use semantic tags when the content has a clear purpose:

```svelte
<!-- Use semantic tags for meaningful structure -->
<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>

<!-- Use div for generic wrappers that are just for styling -->
<div class="card">
  <h3>Card Title</h3>
  <p>Card content goes here.</p>
</div>
```

## Try It

Build a "Recipe Page" component that includes:
- A `<header>` with the recipe name in an `<h1>`
- A `<main>` section containing an unordered list of ingredients and an ordered list of steps
- A `<footer>` with a note like "Recipe by Chef Alex"
- Use proper semantic HTML throughout

## Key Takeaways

- `<ul>` creates bullet lists, `<ol>` creates numbered lists — both use `<li>` for items
- Lists can be nested inside each other for sub-categories
- Semantic tags (`<header>`, `<nav>`, `<main>`, `<section>`, `<article>`, `<footer>`) describe the purpose of content
- Use semantic HTML instead of generic `<div>` tags whenever possible
- Good structure makes your pages accessible, searchable, and easier to maintain
