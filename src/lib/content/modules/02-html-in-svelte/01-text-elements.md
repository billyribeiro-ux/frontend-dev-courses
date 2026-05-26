# Text Elements

The most fundamental part of any web page is text. Before you worry about colors, layouts, or animations, you need to know how to put words on the screen. And more importantly, you need to know how to put words on the screen *correctly* — in a way that machines, assistive technologies, and other developers can understand.

HTML gives you a set of **elements** (also called "tags") specifically designed for different types of text. These are not just visual hints. Every element carries **semantic meaning** — it tells the browser, search engines, and screen readers what role that text plays in the document. This distinction between appearance and meaning is one of the most important mental models in web development.

In Svelte, you write HTML directly in your `.svelte` file — no JSX transformation, no `createElement` calls. Everything you learn about HTML elements here works inside any Svelte component, and Svelte's compiler makes the resulting DOM updates remarkably efficient.

## Why Semantic HTML Matters

Before we dive into specific elements, let's talk about *why* choosing the right tag matters. You can make any text look like a heading with CSS. You can make a `<div>` look bold. So why bother with `<h1>` and `<strong>`?

Three reasons, and they are all critical in professional work:

**Accessibility.** Over a billion people worldwide live with some form of disability. Screen readers — software used by people with visual impairments — don't "see" your page. They parse the HTML structure. When a screen reader encounters an `<h2>`, it announces "heading level 2" and lets the user jump between headings to navigate the page. A `<div>` styled to look like a heading? Invisible to navigation. Your page becomes a wall of undifferentiated text.

Here is what a screen reader user actually experiences. Tools like NVDA and VoiceOver build a "rotor" — a navigable list of all landmarks, headings, links, and form controls on the page. If your headings are `<div>` elements with a CSS class, the rotor shows nothing. The user has to arrow through every single line of text, one by one. On a page with 2,000 words, that can take 15 minutes just to find the section they want. Proper headings reduce that to seconds.

**SEO.** Search engines use heading structure to understand what your page is about. An `<h1>` tells Google "this is the primary topic." Subheadings establish the content hierarchy. Pages with proper semantic structure consistently rank better than div soup — not because of a magic trick, but because the crawler can actually understand your content.

Google's own Search Central documentation explicitly states that heading tags help them understand the structure of the page. But it goes deeper than that. Rich snippets — the enhanced search results with FAQ dropdowns, article previews, and how-to steps — depend on parseable semantic HTML. A page full of `<div>` tags with CSS classes gives the crawler nothing to work with.

**Maintainability.** Six months from now, when you or a teammate opens a component, `<article>` and `<h2>` communicate intent instantly. `<div class="title-big">` requires you to read CSS, trace class names, and guess. Semantic HTML is self-documenting code.

I have worked on a codebase where every element was a `<div>` or a `<span>`. The team had invented their own vocabulary: `.text-header-1`, `.text-body-bold`, `.container-section`. When the design system changed, we had to update hundreds of class names. When we rewrote the same app with semantic HTML, the CSS became a fraction of the size because browsers already give you sensible defaults for `<h1>`, `<p>`, `<article>`, and `<blockquote>`. The styling layer became an enhancement, not a reconstruction of what HTML already provides.

## The Document Outline Algorithm

Understanding the document outline is essential for writing correct heading hierarchies. Every HTML page has an implied outline — a tree structure built from headings — that both browsers and assistive technology expose to users.

Here is how the algorithm works conceptually:

1. The page starts at root level
2. Each heading either continues at the current level, creates a new subsection (if it is a deeper level), or closes the current section and starts a new one (if it is the same or shallower level)
3. The outline is strictly hierarchical — each heading level must be nested within its parent level

Think of it like a book's table of contents:

```
Chapter 1: Introduction        ← h1
  1.1 Background               ← h2
    1.1.1 History               ← h3
    1.1.2 Current State         ← h3
  1.2 Goals                    ← h2
Chapter 2: Methods             ← h1 (this would be wrong — only one h1)
```

Here is what a well-formed outline looks like versus a broken one:

```svelte
<!-- CORRECT outline — clear, navigable hierarchy -->
<h1>Svelte 5 Guide</h1>

<h2>Getting Started</h2>
<h3>Installation</h3>
<h3>Your First Component</h3>

<h2>Runes</h2>
<h3>$state</h3>
<h3>$derived</h3>
<h3>$effect</h3>

<h2>Advanced Topics</h2>
<h3>Performance</h3>
<h4>Lazy Loading</h4>
<h4>Code Splitting</h4>
<h3>Testing</h3>
```

```svelte
<!-- WRONG outline — broken hierarchy, confusing for screen readers -->
<h1>Svelte 5 Guide</h1>

<h3>Getting Started</h3>    <!-- Skipped h2! Screen reader users wonder: what section am I in? -->
<h5>Installation</h5>       <!-- Jumped from h3 to h5 — two levels skipped -->

<h2>Runes</h2>              <!-- Back to h2 after h5 — outline is inconsistent -->
<h4>$state</h4>             <!-- Skipped h3 -->
```

You can test your document outline using browser extensions like HeadingsMap or the accessibility panel in Chrome DevTools. Run these checks on every page you build — a broken outline is a broken experience for screen reader users.

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
- In SvelteKit, each page component typically has its own `<h1>`, and the layout does not contain one. This keeps the heading hierarchy clean across route transitions.

### Headings in Svelte Components

When you build reusable components in Svelte, headings create a subtle challenge. A card component might use `<h3>` internally, but what if someone places that card on a page where the context calls for `<h4>`? The heading level is context-dependent.

One approach is to accept the heading level as a prop:

```svelte
<script>
  let { title, level = 'h2' } = $props();
</script>

<!-- Svelte does not support dynamic tag names directly -->
<!-- So we use conditional rendering -->
{#if level === 'h2'}
  <h2>{title}</h2>
{:else if level === 'h3'}
  <h3>{title}</h3>
{:else if level === 'h4'}
  <h4>{title}</h4>
{/if}
```

This is verbose but explicit. In practice, you rarely need more than two or three levels in a single component. The key insight is that heading levels are part of the *document* structure, not the *component* structure — a component needs to know where it sits in the page hierarchy.

## Paragraphs and Line Breaks

The `<p>` tag creates a paragraph — a block of text with automatic spacing above and below. The browser adds margin between paragraphs by default, creating the visual separation readers expect.

```svelte
<p>This is my first paragraph. It can contain as much text as you need. The browser will wrap the text automatically based on the container width.</p>

<p>This is a second paragraph. Notice the spacing between them — that comes from the default paragraph margin, not from blank lines in your source code.</p>
```

An important mental model: **whitespace in HTML source is collapsed.** Multiple spaces, tabs, and newlines between words are all rendered as a single space. The browser does not care about your formatting in the source file. Structure comes from elements, not from whitespace.

```svelte
<!-- All three of these render identically -->
<p>Hello   World</p>
<p>Hello
   World</p>
<p>Hello                                  World</p>

<!-- They all produce: "Hello World" with a single space -->
```

This is important because developers coming from other contexts (Markdown, plain text emails, word processors) often expect whitespace to be preserved. In HTML, it is not — unless you use the `<pre>` element, which we will cover shortly.

The `<br>` tag forces a line break within a paragraph. But use it sparingly and intentionally:

```svelte
<!-- Good use of <br>: addresses and poetry, where line breaks are part of the content -->
<p>
  123 Main Street<br>
  Springfield, IL 62701
</p>

<p>
  Two roads diverged in a yellow wood,<br>
  And sorry I could not travel both<br>
  And be one traveler, long I stood<br>
  And looked down one as far as I could<br>
  To where it bent in the undergrowth;
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

Here is a real-world example that makes the distinction concrete:

```svelte
<p>
  <strong>Warning:</strong> This action is irreversible.
  <!-- "Warning" is genuinely important — strong is correct -->
</p>

<p>
  In this recipe, <b>butter</b> and <b>sugar</b> are the key ingredients.
  <!-- These are keywords being called out visually, not urgently important -->
</p>

<p>
  She didn't say she <em>hated</em> it.
  <!-- The emphasis changes the spoken meaning — em is correct -->
</p>

<p>
  The French word <i>terroir</i> has no direct English translation.
  <!-- Foreign word in an alternate voice — i is correct -->
</p>
```

You can also combine them when content is both important and emphatic:

```svelte
<p>
  <strong><em>Warning:</em></strong> Do not delete the production database.
</p>
```

### Nesting and Combining Inline Elements

Inline elements can be nested, but the nesting should reflect meaning, not styling:

```svelte
<!-- CORRECT: The citation is inside emphasised text -->
<p>
  As <em><cite>The Pragmatic Programmer</cite></em> argues, you should not repeat yourself.
</p>

<!-- CORRECT: Important text that contains a code reference -->
<p>
  <strong>Never call <code>rm -rf /</code> on a production server.</strong>
</p>

<!-- WRONG: Nesting for purely visual effect -->
<p>
  <strong><em><b><i>This is not more emphatic, just messy.</i></b></em></strong>
</p>
```

## Other Useful Text Elements

HTML provides several specialized text elements beyond the basics. Each has specific semantic meaning that assistive technology can act on:

### Highlighted and Marked Text

```svelte
<!-- Highlighted/marked text — great for search results -->
<p>Your search for "svelte" found 3 results with <mark>svelte</mark> in the title.</p>

<!-- Also useful for drawing attention to a passage in a quotation -->
<blockquote>
  <p>The most important thing is to <mark>ship working software</mark> early and often.</p>
</blockquote>
```

The `<mark>` element has a specific semantic: it represents text that is *relevant* in the current context — search highlights, referenced passages, or content the author wants to draw attention to. Browsers render it with a yellow background by default. Screen readers may announce "highlighted" before the text.

### Small Print and Legal Text

```svelte
<!-- Small print — legal text, disclaimers, caveats, copyright notices -->
<p><small>Offer valid while supplies last. Terms and conditions apply.</small></p>

<footer>
  <p><small>&copy; 2025 Acme Corp. All rights reserved.</small></p>
</footer>
```

The `<small>` element represents side comments and small print, like legal disclaimers and copyright notices. It does not mean "make this text small" — it means "this is ancillary content." You can style it any size you want with CSS.

### Document Edits

```svelte
<!-- Showing changes to a document -->
<p>The meeting is on <del>Tuesday</del> <ins>Wednesday</ins> at 3pm.</p>

<!-- With metadata about the edit -->
<p>
  Price: <del datetime="2025-01-15">$49.99</del>
  <ins datetime="2025-02-01">$39.99</ins>
</p>
```

The `<del>` and `<ins>` elements represent deletions and insertions. Screen readers announce "deleted" and "inserted" respectively. The `datetime` attribute records when the change was made — useful for changelogs and document revision history.

### Scientific Notation and Mathematics

```svelte
<!-- Subscript and superscript have semantic meaning in science and math -->
<p>Water is H<sub>2</sub>O, and the speed of light is approximately 3 &times; 10<sup>8</sup> m/s.</p>

<p>The equation for energy is E = mc<sup>2</sup>.</p>

<!-- Footnote references also use superscript -->
<p>
  Svelte was created by Rich Harris.<sup><a href="#fn1">1</a></sup>
</p>
```

### Inline Code and Keyboard Input

```svelte
<!-- Inline code — variable names, function calls, commands -->
<p>Use the <code>console.log()</code> function to debug your code.</p>

<p>Install dependencies with <code>npm install</code>.</p>

<!-- Keyboard input — keys the user should press -->
<p>Press <kbd>Ctrl</kbd> + <kbd>S</kbd> to save your work.</p>

<!-- Nesting kbd for key combinations is the proper pattern -->
<p>Copy text: <kbd><kbd>Ctrl</kbd>+<kbd>C</kbd></kbd></p>

<!-- Sample output from a program -->
<p>The terminal will display: <samp>Build complete in 1.2s</samp></p>

<!-- Variable placeholder in code -->
<p>Replace <var>username</var> with your actual username.</p>
```

The `<code>` element is for code fragments. `<kbd>` is for keyboard input. `<samp>` is for sample output from a program. `<var>` is for mathematical or programming variables. Each has distinct semantic meaning — and screen readers can distinguish between them.

### Abbreviations and Definitions

```svelte
<!-- Abbreviations with expansion tooltip -->
<p>We use <abbr title="Hypertext Markup Language">HTML</abbr> to structure content.</p>

<p>The <abbr title="World Health Organization">WHO</abbr> recommends regular exercise.</p>

<!-- Definition term — marks the first use/definition of a term -->
<p>
  A <dfn>component</dfn> is a reusable, self-contained piece of UI that
  encapsulates markup, styles, and behavior.
</p>
```

The `<abbr>` element provides an expansion that appears on hover and is read by assistive technology. The `<dfn>` element marks the defining instance of a term — the place where it is introduced and explained.

### Quotation Elements

```svelte
<!-- Block quotation — for extended quotes from another source -->
<blockquote cite="https://svelte.dev/blog/runes">
  <p>
    Runes are symbols that influence the Svelte compiler. Whereas Svelte today
    uses <code>let</code>, <code>=</code>, the <code>export</code> keyword and
    the <code>$:</code> label to mean specific things, runes use function syntax.
  </p>
  <footer>
    <cite>Svelte Blog</cite>, September 2023
  </footer>
</blockquote>

<!-- Inline quotation — short quotes within a sentence -->
<p>
  Rich Harris described Svelte as <q cite="https://svelte.dev">a compiler that
  writes the code you would have written by hand.</q>
</p>
```

`<blockquote>` is for extended quotations from another source — it is a block-level element with indentation. `<q>` is for short inline quotations — browsers automatically add quotation marks. The `<cite>` element names the source of a quotation or reference.

## Preformatted Text and Code Blocks

The `<pre>` element preserves whitespace exactly as written in the source. This is essential for code blocks, ASCII art, and any content where spacing and line breaks carry meaning:

```svelte
<pre><code>function greet(name) {
  return `Hello, ${'{'}name{'}'}!`;
}

// Indentation and line breaks are preserved
console.log(greet('World'));</code></pre>
```

Without `<pre>`, the browser would collapse all that whitespace into a single line. The `<pre>` + `<code>` combination is the standard pattern for code blocks — `<pre>` preserves formatting, `<code>` communicates that the content is source code.

```svelte
<!-- WRONG: code block without pre — whitespace is lost -->
<code>
function add(a, b) {
  return a + b;
}
</code>
<!-- Renders as: function add(a, b) { return a + b; } -->

<!-- CORRECT: pre preserves the formatting -->
<pre><code>function add(a, b) {
  return a + b;
}</code></pre>
```

**Important pitfall with `<pre>`:** The content inside `<pre>` includes *all* whitespace, including the indentation from your Svelte template. This catches developers constantly:

```svelte
<!-- This produces unexpected leading whitespace -->
<div>
  <pre>
    Line 1
    Line 2
  </pre>
</div>
<!-- The indentation from the template becomes visible content -->

<!-- Fix: start content right after the tag -->
<div>
  <pre>Line 1
Line 2</pre>
</div>
```

In a Svelte component, you can also use a variable to avoid the template indentation problem:

```svelte
<script>
  let codeExample = $state(`function greet(name) {
  return \`Hello, \${name}!\`;
}`);
</script>

<pre><code>{codeExample}</code></pre>
```

## HTML Entities

HTML entities are special character codes for characters that have meaning in HTML syntax or are not easily typed on a keyboard. You will encounter these constantly in real-world content:

```svelte
<!-- Characters that conflict with HTML syntax -->
<p>Use &lt;strong&gt; for important text.</p>
<!-- Renders: Use <strong> for important text. -->

<p>Tom &amp; Jerry</p>
<!-- Renders: Tom & Jerry -->

<!-- Typographic characters -->
<p>Price: &dollar;29.99</p>
<p>Copyright &copy; 2025 Acme Corp.</p>
<p>Temperature: 72&deg;F</p>
<p>She said &ldquo;hello&rdquo; and walked away.</p>
<p>The recipe calls for &frac12; cup of sugar.</p>

<!-- Spacing entities -->
<p>Non-breaking&nbsp;space keeps words together.</p>
<p>Em dash &mdash; used for parenthetical statements.</p>
<p>En dash: pages 10&ndash;20</p>

<!-- Mathematical entities -->
<p>5 &times; 3 = 15</p>
<p>10 &divide; 2 = 5</p>
<p>&pi; &asymp; 3.14159</p>
```

The most critical entities to know are `&lt;` (less than), `&gt;` (greater than), `&amp;` (ampersand), and `&nbsp;` (non-breaking space). The first three prevent HTML parsing conflicts. The non-breaking space is essential for keeping words together that should not be separated by a line break — like "100 km" or "Dr. Smith."

When you use Svelte's `{expression}` syntax, special characters in the expression output are automatically escaped. You do not need to worry about HTML injection from dynamic content — Svelte handles that:

```svelte
<script>
  let userInput = $state('<script>alert("xss")</script>');
</script>

<!-- Safe — Svelte escapes the HTML entities automatically -->
<p>{userInput}</p>
<!-- Renders as text: <script>alert("xss")</script> -->
<!-- Does NOT execute the script -->
```

This is a security feature. Svelte's template expressions always produce text nodes, never parsed HTML. If you *need* to render raw HTML (and you rarely should), you must use `{@html expression}` — but be warned that this bypasses escaping and can create XSS vulnerabilities.

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

### How the Compiler Handles Text Updates

**How Svelte handles reactivity here is worth understanding.** When `name` changes, Svelte does not re-render the entire component or diff a virtual DOM. The compiler has already identified, at build time, exactly which text node in the DOM depends on `name`. It generates code that directly updates `textNode.data = name` — a single DOM property assignment. No tree walking, no reconciliation, no overhead.

Let me show you roughly what the compiler generates. When you write:

```svelte
<p>Hello, {name}!</p>
```

The compiled output (simplified) looks something like this:

```javascript
// The compiler creates the DOM structure once
const p = document.createElement('p');
const text1 = document.createTextNode('Hello, ');
const text2 = document.createTextNode('');  // placeholder for {name}
const text3 = document.createTextNode('!');
p.append(text1, text2, text3);

// When `name` changes, only this runs:
text2.data = name;  // Direct DOM property assignment
```

Compare this with React, which would re-run the component function, generate a new virtual DOM tree, diff it against the previous tree, and then apply the minimal DOM changes. Svelte skips all of that because the compiler already knows the relationship between state and DOM at build time.

This is why Svelte is fast: the compiler does the work that other frameworks do at runtime. And this is specifically why text updates are essentially free — a property assignment on a text node is one of the cheapest DOM operations possible.

### Derived Values in Templates

```svelte
<script>
  let firstName = $state('Grace');
  let lastName = $state('Hopper');

  // Derived value — Svelte tracks this dependency automatically
  let fullName = $derived(`${firstName} ${lastName}`);
  let initials = $derived(`${firstName[0]}${lastName[0]}`);
  let nameLength = $derived(fullName.length);
</script>

<h2>{fullName}</h2>
<p>Initials: <strong>{initials}</strong></p>
<p>Name length: {nameLength} characters</p>
```

When `firstName` changes, Svelte updates every text node that depends on it — and *only* those nodes. The `lastName` text stays untouched. This granular reactivity is a direct result of the compile-time analysis.

### Expressions in Text Context

You can use any JavaScript expression in curly braces, but keep readability in mind:

```svelte
<script>
  let price = $state(29.99);
  let quantity = $state(3);
  let discount = $state(0.1);
  let items = $state(['apple', 'banana', 'cherry']);
</script>

<!-- Simple expressions — clear and readable -->
<p>Total: ${(price * quantity).toFixed(2)}</p>
<p>With discount: ${(price * quantity * (1 - discount)).toFixed(2)}</p>

<!-- Function calls -->
<p>Items: {items.join(', ')}</p>
<p>Count: {items.length}</p>

<!-- Ternary for conditional text -->
<p>{quantity > 1 ? `${quantity} items` : '1 item'} in your cart</p>

<!-- Date formatting -->
<p>Today: {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
```

```svelte
<!-- WRONG: Complex logic in templates — hard to read and test -->
<p>
  {items.filter(i => i.startsWith('a')).map(i => i.toUpperCase()).join(', ') || 'No items found'}
</p>

<!-- CORRECT: Move complex logic to derived values -->
<script>
  let filteredDisplay = $derived.by(() => {
    const filtered = items.filter(i => i.startsWith('a'));
    if (filtered.length === 0) return 'No items found';
    return filtered.map(i => i.toUpperCase()).join(', ');
  });
</script>

<p>{filteredDisplay}</p>
```

The rule of thumb: if your template expression needs more than one method chain or contains conditional logic, extract it into a `$derived` value. Your template stays readable, and the derived value is testable in isolation.

## Real Example: A Complete Blog Post Layout

Let's put it all together with a realistic component — a blog post with proper semantic structure using every text element we have learned:

```svelte
<script>
  let title = $state('Understanding Semantic HTML');
  let author = $state('Alex Chen');
  let publishDate = $state('2025-03-15');
  let updatedDate = $state('2025-04-02');
  let readingTime = $state(5);
  let isUpdated = $state(true);
  let category = $state('Web Development');
  let tags = $state(['HTML', 'Accessibility', 'SEO']);

  let formattedDate = $derived(
    new Date(publishDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  );

  let formattedUpdated = $derived(
    new Date(updatedDate).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })
  );

  let tagDisplay = $derived(tags.join(', '));
</script>

<article>
  <header>
    <p><small>{category} &middot; {tagDisplay}</small></p>
    <h1>{title}</h1>
    <p>
      <small>
        By <strong>{author}</strong> &middot;
        <time datetime={publishDate}>{formattedDate}</time> &middot;
        {readingTime} min read
        {#if isUpdated}
          &middot; <em>Updated <time datetime={updatedDate}>{formattedUpdated}</time></em>
        {/if}
      </small>
    </p>
  </header>

  <h2>Why Structure Matters</h2>
  <p>
    The web is built on <abbr title="Hypertext Markup Language">HTML</abbr>,
    and the most important skill a developer can learn is choosing the
    <strong>right element</strong> for each piece of content. As
    <cite>MDN Web Docs</cite> states:
  </p>

  <blockquote cite="https://developer.mozilla.org">
    <p>
      <mark>Semantics refers to the meaning of a piece of code</mark> — for example
      &ldquo;what effect does running that line of JavaScript have?&rdquo;, or
      &ldquo;what purpose or role does that HTML element have?&rdquo;
    </p>
  </blockquote>

  <h3>For Accessibility</h3>
  <p>
    Screen readers rely on semantic elements to navigate. A well-structured
    page is a <em>usable</em> page for everyone. The <abbr title="Web Content Accessibility Guidelines">WCAG</abbr>
    specifically requires that information, structure, and relationships conveyed
    through presentation can be programmatically determined.
  </p>

  <h3>For Search Engines</h3>
  <p>
    Search crawlers parse your heading hierarchy to understand the topic
    and subtopics of your page. Proper structure directly impacts
    <mark>discoverability</mark>. Pages with clear semantic hierarchy
    consistently outperform <q>div soup</q> in search rankings.
  </p>

  <h2>Getting Started</h2>
  <p>
    Begin by auditing your existing components. Replace generic
    <code>&lt;div&gt;</code> tags with semantic elements wherever the content
    has a clear purpose. The process takes time but pays dividends in
    accessibility, <abbr title="Search Engine Optimization">SEO</abbr>,
    and long-term maintainability.
  </p>

  <h3>Practical Steps</h3>
  <p>
    Install a screen reader&mdash;<b>NVDA</b> on Windows or use the built-in
    <b>VoiceOver</b> on macOS&mdash;and navigate your own page with it. Press
    <kbd>H</kbd> to jump between headings. If the experience is confusing,
    your heading structure needs work.
  </p>

  <h3>Code Example</h3>
  <p>Here is a minimal semantic layout:</p>

  <pre><code>&lt;article&gt;
  &lt;h1&gt;Page Title&lt;/h1&gt;
  &lt;p&gt;Introduction paragraph.&lt;/p&gt;

  &lt;h2&gt;First Section&lt;/h2&gt;
  &lt;p&gt;Section content.&lt;/p&gt;
&lt;/article&gt;</code></pre>

  <footer>
    <p>
      <small>
        Published under <a href="/licenses/cc-by">CC BY 4.0</a>.
        Last updated <time datetime={updatedDate}>{formattedUpdated}</time>.
      </small>
    </p>
  </footer>
</article>
```

Notice how the heading hierarchy flows: `<h1>` for the post title, `<h2>` for major sections, `<h3>` for subsections within those. A screen reader user can hear the outline and jump directly to "For Search Engines" without scrolling through everything above it. The `<time>` elements give machine-readable dates. The `<blockquote>` with `cite` attributes properly sources the quotation. The `<article>` element wraps the entire post, telling the browser "this is a self-contained piece of content."

## Common Mistakes

**Div soup.** Wrapping everything in `<div>` tags because "it works" is the most widespread anti-pattern. A `<div>` has zero semantic meaning. It tells the browser, screen readers, and search engines absolutely nothing about the content inside. Use `<div>` only as a generic styling container when no semantic element fits.

```svelte
<!-- WRONG: Everything is a div -->
<div class="article">
  <div class="title">My Post</div>
  <div class="meta">By Alex</div>
  <div class="content">
    <div class="section-title">Introduction</div>
    <div class="text">Lorem ipsum...</div>
  </div>
</div>

<!-- CORRECT: Semantic elements communicate structure -->
<article>
  <h1>My Post</h1>
  <p><small>By <strong>Alex</strong></small></p>
  <section>
    <h2>Introduction</h2>
    <p>Lorem ipsum...</p>
  </section>
</article>
```

**Skipping heading levels.** Jumping from `<h2>` to `<h5>` because you wanted smaller text breaks the document outline. Use CSS to style headings — pick the heading level based on hierarchy, not appearance.

**Using `<br>` for spacing.** If you find yourself stacking `<br>` tags to push content down, stop. That is a layout concern and belongs in CSS. The `<br>` element is for content-meaningful line breaks only.

**Choosing elements for appearance.** Using `<h3>` because you want text "about that size" or `<strong>` because you want bold text. Choose elements for meaning. Style with CSS. These are separate concerns, and conflating them creates maintenance nightmares and accessibility failures.

```svelte
<!-- WRONG: Using h4 because it is the right font size -->
<h4>This is just a label, not a section heading</h4>

<!-- CORRECT: Use the right element and style it -->
<p class="label">This is just a label, not a section heading</p>
```

**Empty headings and paragraphs.** Using `<h2>&nbsp;</h2>` or `<p><br></p>` as spacers. Screen readers will announce these as content, confusing users. Use CSS for spacing.

**Using `{@html}` when text expressions work.** If you are rendering user-generated content, always use `{expression}` (which escapes HTML) instead of `{@html expression}` (which does not). The `{@html}` tag should only be used with trusted, sanitized content like content from a CMS that has been run through a sanitizer like DOMPurify.

```svelte
<script>
  let userComment = $state('Great post! <img src=x onerror=alert("hacked")>');
</script>

<!-- SAFE: Svelte escapes the HTML -->
<p>{userComment}</p>
<!-- Renders as text, no script execution -->

<!-- DANGEROUS: Raw HTML is parsed and executed -->
<p>{@html userComment}</p>
<!-- The onerror handler fires — XSS vulnerability -->
```

## Try It

Create a blog post component with:
- A proper heading hierarchy (`<h1>` for the title, `<h2>` for sections, `<h3>` for subsections)
- A dynamic author name, date (using `<time>` elements), and reading time using Svelte's `{expression}` syntax
- Derived values for formatted dates and tag lists
- Use `<strong>` and `<em>` correctly — for importance and emphasis, not just visual styling
- Include `<abbr>` elements with proper `title` attributes for at least two abbreviations
- A `<blockquote>` with a `<cite>` element and a `cite` attribute
- A code example using `<pre><code>` with proper formatting
- Use `<mark>` to highlight search terms in a paragraph
- A `<kbd>` element showing a keyboard shortcut
- Make sure a screen reader user could navigate the page using headings alone — test with the HeadingsMap browser extension or the accessibility panel in DevTools

Then add interactivity:
- A toggle button that switches between "Published" and "Draft" status using `$state`
- A word count that updates when you change the content using `$derived`
- An "estimated reading time" computed from the word count (assume 200 words per minute)

## Key Takeaways

- Semantic HTML communicates **meaning**, not just appearance — this matters for accessibility, SEO, and maintainability
- The document outline algorithm builds a navigable hierarchy from headings — test it with accessibility tools to verify it is correct
- Headings (`<h1>` through `<h6>`) create a document outline that screen readers use for navigation — use one `<h1>` per page and never skip levels
- `<strong>` means importance (announced differently by screen readers), while `<b>` is for visual attention without extra importance. `<em>` changes spoken emphasis, while `<i>` signals alternate voice
- Specialized elements like `<abbr>`, `<cite>`, `<time>`, `<mark>`, `<kbd>`, `<code>`, `<dfn>`, `<del>`, `<ins>`, `<sub>`, and `<sup>` each carry distinct semantic meaning that assistive technology can leverage
- `<pre>` preserves whitespace for code blocks and structured text — always pair with `<code>` for source code, and watch out for template indentation leaking into the output
- HTML entities like `&lt;`, `&amp;`, `&mdash;`, `&nbsp;`, and `&copy;` handle special characters — Svelte's template expressions automatically escape HTML, protecting against XSS
- Svelte's `{expression}` syntax inserts dynamic text and updates the DOM with surgical precision — no virtual DOM diffing, just direct text node assignments at compile-determined locations
- The compiler generates code like `textNode.data = value` for each reactive text expression — one of the cheapest possible DOM operations
- Extract complex template expressions into `$derived` values for readability and testability
- Choose elements for their semantic meaning, then style with CSS — never pick a tag because of how it looks by default
- Use `{expression}` (safe, escaped) for dynamic content, not `{@html}` (unsafe, unescaped), unless you have sanitized the input
