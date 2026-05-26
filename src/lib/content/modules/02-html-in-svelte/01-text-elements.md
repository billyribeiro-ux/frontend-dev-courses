# Text Elements

The most fundamental part of any web page is text. Before you worry about colors, layouts, or animations, you need to know how to put words on the screen. And more importantly, you need to know how to put words on the screen *correctly* — in a way that machines, assistive technologies, and other developers can understand.

HTML gives you a set of **elements** (also called "tags") specifically designed for different types of text. These are not just visual hints. Every element carries **semantic meaning** — it tells the browser, search engines, and screen readers what role that text plays in the document. This distinction between appearance and meaning is one of the most important mental models in web development.

In Svelte, you write HTML directly in your `.svelte` file — no JSX transformation, no `createElement` calls. Everything you learn about HTML elements here works inside any Svelte component, and Svelte's compiler makes the resulting DOM updates remarkably efficient.

## Why Semantic HTML Matters

Before we dive into specific elements, let's talk about *why* choosing the right tag matters. You can make any text look like a heading with CSS. You can make a `<div>` look bold. So why bother with `<h1>` and `<strong>`?

Three reasons, and they are all critical in professional work:

**Accessibility.** Over a billion people worldwide live with some form of disability. Screen readers — software used by people with visual impairments — don't "see" your page. They parse the HTML structure. When a screen reader encounters an `<h2>`, it announces "heading level 2" and lets the user jump between headings to navigate the page. A `<div>` styled to look like a heading? Invisible to navigation. Your page becomes a wall of undifferentiated text.

**SEO.** Search engines use heading structure to understand what your page is about. An `<h1>` tells Google "this is the primary topic." Subheadings establish the content hierarchy. Pages with proper semantic structure consistently rank better than div soup — not because of a magic trick, but because the crawler can actually understand your content.

**Maintainability.** Six months from now, when you or a teammate opens a component, `<article>` and `<h2>` communicate intent instantly. `<div class="title-big">` requires you to read CSS, trace class names, and guess. Semantic HTML is self-documenting code.

## Headings: The Document Outline

HTML has six heading levels, from `<h1>` (the most important) to `<h6>` (the least). But headings are not just "big text" and "small text." They create a **document outline** — a hierarchical table of contents that assistive technology and search engines use to understand your page.

```svelte
<h1>Web Development Bootcamp</h1>

<h2>Module 1: HTML Foundations</h2>
<h3>Lesson 1: Text Elements</h3>
<h3>Lesson 2: Links and Images</h3>

<h2>Module 2: CSS Styling</h2>
<h3>Lesson 1: Selectors</h3>
<h3>Lesson 2: Box Model</h3>
```

Think of this like an outline in a word processor. The `<h1>` is the document title. Each `<h2>` is a major section. Each `<h3>` is a subsection within that `<h2>`. Screen reader users can press a single key to jump between headings — it is their primary way of scanning a page, just like sighted users scan visually for large bold text.

**The rules that matter:**

- Every page should have exactly **one `<h1>`**. It is the primary topic of the page.
- **Never skip levels.** Don't jump from `<h2>` to `<h4>`. The outline must be contiguous. A screen reader user hearing "heading level 4" after "heading level 2" will wonder if they missed a section.
- Heading level has nothing to do with font size. You set the size with CSS. Choose the level based on document hierarchy, not visual appearance.

## Paragraphs and Line Breaks

The `<p>` tag creates a paragraph — a block of text with automatic spacing above and below. The browser adds margin between paragraphs by default, creating the visual separation readers expect.

```svelte
<p>This is my first paragraph. It can contain as much text as you need. The browser will wrap the text automatically based on the container width.</p>

<p>This is a second paragraph. Notice the spacing between them — that comes from the default paragraph margin, not from blank lines in your source code.</p>
```

An important mental model: **whitespace in HTML source is collapsed.** Multiple spaces, tabs, and newlines between words are all rendered as a single space. The browser does not care about your formatting in the source file. Structure comes from elements, not from whitespace.

The `<br>` tag forces a line break within a paragraph. But use it sparingly and intentionally:

```svelte
<!-- Good use of <br>: addresses and poetry, where line breaks are part of the content -->
<p>
  123 Main Street<br>
  Springfield, IL 62701
</p>

<!-- Bad use of <br>: creating spacing between content -->
<!-- Don't do this — use margins and padding with CSS instead -->
<p>First paragraph</p>
<br><br>
<p>Second paragraph with forced spacing above</p>
```

The rule: `<br>` is for when the line break is part of the content's meaning (addresses, poems, song lyrics). It is not a spacing tool. If you want vertical space, use CSS `margin` or `padding`.

## Emphasis and Strong: Meaning vs Appearance

This is where many developers get confused. HTML has two pairs of elements that look similar but mean different things:

```svelte
<p>
  This word is <strong>critically important</strong> to the sentence.
  This word changes the <em>emphasis</em> of the sentence.
</p>
```

- **`<strong>`** means the text has **strong importance**. Screen readers may announce it with a different tone. Browsers display it in bold by default, but the boldness is a side effect of the semantic meaning.
- **`<em>`** means the text has **stress emphasis** — the kind of emphasis that changes meaning when spoken aloud. "I didn't say *he* stole the money" means something different from "I didn't say he stole the *money*."

Now compare these with `<b>` and `<i>`:

```svelte
<p>
  The <b>Svelte</b> framework is our focus today.
  The scientific name is <i>Drosophila melanogaster</i>.
</p>
```

- **`<b>`** means "bring attention to" — visually offset text without conveying extra importance. Use it for keywords in a summary, product names in a review, or the lead sentence in an article.
- **`<i>`** means "alternate voice or mood" — technical terms, foreign words, thoughts, ship names. Traditionally displayed in italics.

The practical difference: a screen reader will announce `<strong>` text with added emphasis. It will *not* change its voice for `<b>` text. When you use `<strong>` just because you want bold styling, you are lying to assistive technology.

You can also combine them when content is both important and emphatic:

```svelte
<p>
  <strong><em>Warning:</em></strong> Do not delete the production database.
</p>
```

## Other Useful Text Elements

HTML provides several specialized text elements beyond the basics:

```svelte
<!-- Highlighted/marked text — great for search results -->
<p>Your search for "svelte" found 3 results with <mark>svelte</mark> in the title.</p>

<!-- Small print — legal text, disclaimers, caveats -->
<p><small>Offer valid while supplies last. Terms and conditions apply.</small></p>

<!-- Edits — showing changes to a document -->
<p>The meeting is on <del>Tuesday</del> <ins>Wednesday</ins> at 3pm.</p>

<!-- Scientific notation -->
<p>Water is H<sub>2</sub>O, and the speed of light is approximately 3 &times; 10<sup>8</sup> m/s.</p>

<!-- Inline code -->
<p>Use the <code>console.log()</code> function to debug your code.</p>

<!-- Keyboard input -->
<p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save your work.</p>

<!-- Abbreviations with tooltip -->
<p>We use <abbr title="Hypertext Markup Language">HTML</abbr> to structure content.</p>
```

Each of these has specific semantic meaning. A screen reader can announce `<del>` text as "deleted" and `<ins>` text as "inserted." The `<abbr>` element provides an expansion that appears on hover and is read by assistive technology. These details matter.

## Dynamic Text in Svelte

Here is where Svelte's power starts to show. You can embed any JavaScript expression directly in your markup using curly braces:

```svelte
<script>
  let name = $state('Alex');
  let postCount = $state(42);
  let isPublished = $state(true);
</script>

<h1>Welcome, {name}!</h1>
<p>You have written {postCount} blog {postCount === 1 ? 'post' : 'posts'}.</p>
<p>Status: {isPublished ? 'Published' : 'Draft'}</p>
```

The expression inside `{}` can be a variable, a function call, a ternary, arithmetic — any valid JavaScript expression. Svelte evaluates it and inserts the result as a text node.

**How Svelte handles reactivity here is worth understanding.** When `name` changes, Svelte does not re-render the entire component or diff a virtual DOM. The compiler has already identified, at build time, exactly which text node in the DOM depends on `name`. It generates code that directly updates `textNode.data = name` — a single DOM property assignment. No tree walking, no reconciliation, no overhead. This is why Svelte is fast: the compiler does the work that other frameworks do at runtime.

```svelte
<script>
  let firstName = $state('Grace');
  let lastName = $state('Hopper');

  // Derived value — Svelte tracks this dependency automatically
  let fullName = $derived(`${firstName} ${lastName}`);
  let initials = $derived(`${firstName[0]}${lastName[0]}`);
</script>

<h2>{fullName}</h2>
<p>Initials: <strong>{initials}</strong></p>
```

When `firstName` changes, Svelte updates every text node that depends on it — and *only* those nodes. The `lastName` text stays untouched. This granular reactivity is a direct result of the compile-time analysis.

## Real Example: A Blog Post Layout

Let's put it all together with a realistic component — a blog post with proper semantic structure:

```svelte
<script>
  let title = $state('Understanding Semantic HTML');
  let author = $state('Alex Chen');
  let publishDate = $state('2025-03-15');
  let readingTime = $state(5);
  let isUpdated = $state(true);
</script>

<article>
  <h1>{title}</h1>
  <p>
    <small>
      By <strong>{author}</strong> &middot;
      {new Date(publishDate).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric'
      })} &middot;
      {readingTime} min read
      {#if isUpdated}
        &middot; <em>Updated</em>
      {/if}
    </small>
  </p>

  <h2>Why Structure Matters</h2>
  <p>
    The web is built on <abbr title="Hypertext Markup Language">HTML</abbr>,
    and the most important skill a developer can learn is choosing the
    <strong>right element</strong> for each piece of content.
  </p>

  <h3>For Accessibility</h3>
  <p>
    Screen readers rely on semantic elements to navigate. A well-structured
    page is a <em>usable</em> page for everyone.
  </p>

  <h3>For Search Engines</h3>
  <p>
    Search crawlers parse your heading hierarchy to understand the topic
    and subtopics of your page. Proper structure directly impacts
    <mark>discoverability</mark>.
  </p>

  <h2>Getting Started</h2>
  <p>
    Begin by auditing your existing components. Replace generic
    <code>&lt;div&gt;</code> tags with semantic elements wherever the content
    has a clear purpose.
  </p>
</article>
```

Notice how the heading hierarchy flows: `<h1>` for the post title, `<h2>` for major sections, `<h3>` for subsections within those. A screen reader user can hear the outline and jump directly to "For Search Engines" without scrolling through everything above it.

## Common Mistakes

**Div soup.** Wrapping everything in `<div>` tags because "it works" is the most widespread anti-pattern. A `<div>` has zero semantic meaning. It tells the browser, screen readers, and search engines absolutely nothing about the content inside. Use `<div>` only as a generic styling container when no semantic element fits.

**Skipping heading levels.** Jumping from `<h2>` to `<h5>` because you wanted smaller text breaks the document outline. Use CSS to style headings — pick the heading level based on hierarchy, not appearance.

**Using `<br>` for spacing.** If you find yourself stacking `<br>` tags to push content down, stop. That is a layout concern and belongs in CSS. The `<br>` element is for content-meaningful line breaks only.

**Choosing elements for appearance.** Using `<h3>` because you want text "about that size" or `<strong>` because you want bold text. Choose elements for meaning. Style with CSS. These are separate concerns, and conflating them creates maintenance nightmares and accessibility failures.

**Empty headings and paragraphs.** Using `<h2>&nbsp;</h2>` or `<p><br></p>` as spacers. Screen readers will announce these as content, confusing users. Use CSS for spacing.

## Try It

Create a blog post component with:
- A proper heading hierarchy (`<h1>` for the title, `<h2>` for sections, `<h3>` for subsections)
- A dynamic author name and date using Svelte's `{expression}` syntax
- Use `<strong>` and `<em>` correctly — for importance and emphasis, not just visual styling
- Include at least one `<abbr>`, one `<code>` element, and one `<mark>` element
- Make sure a screen reader user could navigate the page using headings alone

## Key Takeaways

- Semantic HTML communicates **meaning**, not just appearance — this matters for accessibility, SEO, and maintainability
- Headings (`<h1>` through `<h6>`) create a document outline that screen readers use for navigation — use one `<h1>` per page and never skip levels
- `<strong>` means importance (announced differently by screen readers), while `<b>` is for visual attention without extra importance. `<em>` changes spoken emphasis, while `<i>` signals alternate voice
- Svelte's `{expression}` syntax inserts dynamic text and updates the DOM with surgical precision — no virtual DOM diffing, just direct text node assignments at compile-determined locations
- Choose elements for their semantic meaning, then style with CSS — never pick a tag because of how it looks by default
- Common mistakes include div soup, skipping heading levels, using `<br>` for spacing, and choosing elements based on appearance rather than meaning
