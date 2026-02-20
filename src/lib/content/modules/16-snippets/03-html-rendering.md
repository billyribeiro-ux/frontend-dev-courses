# Dynamic HTML

By default, Svelte escapes all text content to prevent security vulnerabilities. If you have a variable containing `<strong>bold</strong>`, Svelte displays the literal text including the tags, not bold text. But sometimes you genuinely need to render HTML strings — when displaying content from a CMS, rendering markdown, or showing rich text from a database. The `{@html}` tag makes this possible.

This lesson teaches you how to render dynamic HTML safely, why you need to be careful about security, and when `{@html}` is the right tool for the job.

## The {@html} Tag

Use `{@html expression}` to render a string as HTML instead of escaped text:

```svelte
<script lang="ts">
  const richContent = `
    <h2>Welcome to the Blog</h2>
    <p>This content has <strong>bold text</strong> and <em>italic text</em>.</p>
    <ul>
      <li>First item</li>
      <li>Second item</li>
    </ul>
  `;
</script>

<!-- Without @html — renders as plain text with visible tags -->
<div>{richContent}</div>

<!-- With @html — renders as actual HTML -->
<div>{@html richContent}</div>
```

The first `div` would display the raw `<h2>`, `<p>`, and `<strong>` tags as text. The second `div` renders them as actual HTML elements.

## Security Considerations (XSS)

The `{@html}` tag renders whatever HTML string you give it, including `<script>` tags and event handlers. This creates a **Cross-Site Scripting (XSS)** vulnerability if the HTML comes from user input:

```svelte
<script lang="ts">
  // DANGEROUS: Never render untrusted user input with @html!
  let userInput = $state("");
</script>

<input bind:value={userInput} placeholder="Type something..." />

<!-- This is UNSAFE — a user could type: <img src=x onerror="alert('hacked')"> -->
<div>{@html userInput}</div>
```

**Golden rule:** Only use `{@html}` with content you trust completely — content you control or content that has been sanitized.

## Sanitizing HTML

If you must render user-provided HTML, sanitize it first with a library like DOMPurify:

```bash
npm install dompurify
npm install -D @types/dompurify
```

```svelte
<script lang="ts">
  import DOMPurify from 'dompurify';

  interface Props {
    content: string;
  }

  let { content }: Props = $props();

  let cleanHtml = $derived(DOMPurify.sanitize(content));
</script>

<div class="content">
  {@html cleanHtml}
</div>
```

DOMPurify strips dangerous elements like `<script>`, event handlers like `onerror`, and other attack vectors while preserving safe formatting tags.

## Rendering Markdown Content

A common use case for `{@html}` is rendering markdown. Convert markdown to HTML on the server, then render it in your component:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { marked } from 'marked';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  return {
    title: post.title,
    // Convert markdown to HTML on the server
    htmlContent: marked(post.markdownContent)
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title}</title>
</svelte:head>

<article>
  <h1>{data.title}</h1>
  <div class="prose">
    {@html data.htmlContent}
  </div>
</article>

<style>
  .prose :global(h2) {
    font-size: 1.5rem;
    margin-top: 2rem;
  }
  .prose :global(p) {
    line-height: 1.75;
    margin-bottom: 1rem;
  }
  .prose :global(code) {
    background: #f5f5f5;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .prose :global(pre) {
    background: #1e1e1e;
    color: #d4d4d4;
    padding: 1rem;
    border-radius: 8px;
    overflow-x: auto;
  }
</style>
```

Notice the `:global()` modifier in the styles. Since `{@html}` content is injected at runtime, Svelte's scoped styles would not normally target it. The `:global()` modifier inside a scoped parent (`.prose`) lets you style the rendered HTML while keeping styles contained to that wrapper.

## When to Use {@html}

**Good use cases:**
- Rendering markdown or rich text from a CMS
- Displaying pre-rendered HTML from a server load function
- Showing formatted content from a trusted API

**Bad use cases:**
- Rendering anything from user input without sanitization
- Building dynamic UI (use components and snippets instead)
- Displaying content that could be handled with normal Svelte templates

## Styling {@html} Content

Since `{@html}` content bypasses Svelte's scoped styles, wrap it in a container and use `:global()`:

```svelte
<div class="rendered-content">
  {@html data.htmlContent}
</div>

<style>
  .rendered-content :global(h1) { font-size: 2rem; }
  .rendered-content :global(h2) { font-size: 1.5rem; }
  .rendered-content :global(a) { color: var(--color-primary); }
  .rendered-content :global(img) { max-width: 100%; border-radius: 8px; }
</style>
```

The `:global()` selectors are scoped to `.rendered-content`, so they only affect HTML inside that wrapper.

## Try It

Create a blog post page that loads markdown content from a server load function. Use the `marked` library to convert markdown to HTML on the server, then render it with `{@html}`. Add styles for headings, paragraphs, code blocks, and links using the `:global()` pattern. Experiment with DOMPurify to see how it strips dangerous HTML.

## Key Takeaways

- `{@html string}` renders a string as actual HTML instead of escaped text
- **Never use `{@html}` with untrusted user input** — it creates XSS vulnerabilities
- Sanitize untrusted HTML with DOMPurify before rendering
- Common use cases: CMS content, markdown rendering, trusted API responses
- Style `{@html}` content using `:global()` inside a scoped parent selector
- Convert markdown to HTML on the server in your load function for best performance
