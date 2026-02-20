# Links & Images

Text alone is not enough to build a real website. You need **links** to connect pages together and **images** to make things visual. These two elements are the backbone of the web — links are what make the "web" a web, connecting billions of pages to each other.

In this lesson you will learn how to create clickable links and display images inside your Svelte components. You will also learn about **accessibility** — making sure your content works for everyone, including people using screen readers.

## The Anchor Tag: Creating Links

Links are created with the `<a>` tag (short for "anchor"). The `href` attribute tells the browser where to go when clicked:

```svelte
<a href="https://svelte.dev">Visit Svelte</a>
```

This renders as clickable text: "Visit Svelte". When someone clicks it, they are taken to `https://svelte.dev`.

### Opening Links in a New Tab

By default, clicking a link replaces the current page. To open a link in a new tab, add `target="_blank"`:

```svelte
<a href="https://svelte.dev" target="_blank" rel="noopener noreferrer">
  Visit Svelte (opens in new tab)
</a>
```

Always add `rel="noopener noreferrer"` when using `target="_blank"` — it is a security best practice.

### Linking to Sections on the Same Page

You can link to an element with a specific `id` on the same page using `#`:

```svelte
<a href="#about">Jump to About Section</a>

<!-- Further down the page -->
<h2 id="about">About</h2>
<p>Here is the about section.</p>
```

## The Image Tag: Displaying Images

Images use the `<img>` tag. Unlike most HTML tags, `<img>` is **self-closing** — it does not have a closing tag:

```svelte
<img src="https://picsum.photos/400/300" alt="A random placeholder image" />
```

- `src` — the URL or path to the image file
- `alt` — a text description of the image (required for accessibility)

### Why alt Text Matters

The `alt` attribute is not optional. It serves two critical purposes:

1. **Screen readers** read the `alt` text aloud for visually impaired users
2. If the image fails to load, the `alt` text is shown instead

```svelte
<!-- Good: descriptive alt text -->
<img src="/photos/sunset.jpg" alt="Orange sunset over the Pacific Ocean" />

<!-- Bad: unhelpful alt text -->
<img src="/photos/sunset.jpg" alt="image" />

<!-- Decorative images use empty alt -->
<img src="/icons/divider.svg" alt="" />
```

### Controlling Image Size

You can set width and height directly on the image:

```svelte
<img
  src="https://picsum.photos/800/600"
  alt="Placeholder landscape"
  width="400"
  height="300"
/>
```

## Combining Links and Images

You can wrap an image inside a link to make a clickable image:

```svelte
<a href="https://svelte.dev" target="_blank" rel="noopener noreferrer">
  <img src="/images/svelte-logo.png" alt="Svelte logo — click to visit svelte.dev" />
</a>
```

## Putting It Together

Here is a component that uses both links and images:

```svelte
<h1>My Favorite Resources</h1>

<div class="resource">
  <img src="https://picsum.photos/200/150" alt="Svelte tutorial preview" />
  <h2>Svelte Tutorial</h2>
  <p>
    The official <a href="https://learn.svelte.dev" target="_blank" rel="noopener noreferrer">Svelte tutorial</a>
    is the best place to practice.
  </p>
</div>
```

## Try It

Build a "Favorite Links" component that includes:
- At least three links to websites you like (one should open in a new tab)
- An image with proper `alt` text
- A clickable image that links somewhere

## Key Takeaways

- `<a href="...">` creates a link — the `href` sets the destination
- Use `target="_blank"` with `rel="noopener noreferrer"` to open links in a new tab
- `<img src="..." alt="..." />` displays an image — it is self-closing
- Always write descriptive `alt` text for accessibility
- You can wrap `<img>` inside `<a>` to make images clickable
