# SSR & SEO Basics

When a user visits your SvelteKit site, the server renders the page to HTML and sends it to the browser. This is called **Server-Side Rendering (SSR)**, and SvelteKit does it by default. The browser receives a fully-formed HTML page, displays it immediately, and then SvelteKit "hydrates" it — attaching JavaScript to make it interactive.

SSR matters for two critical reasons: **performance** (users see content faster) and **SEO** (search engines can read your content). This lesson covers how SSR works, how to add meta tags for search engines, and how to prerender static pages.

## What is SSR?

Without SSR (a traditional single-page app), the browser receives an empty HTML shell and must download, parse, and execute JavaScript before anything appears. The user sees a blank screen during this time.

With SSR (what SvelteKit does by default):

1. User requests a page
2. Server runs your load function and renders the component to HTML
3. Browser receives **complete HTML** and displays it immediately
4. JavaScript loads and hydrates the page, making it interactive

```bash
# Without SSR (SPA):
Browser gets: <div id="app"></div>  →  blank screen  →  JS loads  →  content appears

# With SSR (SvelteKit default):
Browser gets: <h1>Hello World</h1><p>Content here...</p>  →  content visible immediately
```

SvelteKit enables SSR by default. You do not need to configure anything.

## Adding Meta Tags with svelte:head

Search engines and social media platforms read meta tags to understand your page. Use the `<svelte:head>` element to add tags to the document `<head>`:

```svelte
<!-- src/routes/+page.svelte -->
<svelte:head>
  <title>My SvelteKit App — Home</title>
  <meta name="description" content="A modern web application built with SvelteKit." />
  <meta property="og:title" content="My SvelteKit App" />
  <meta property="og:description" content="A modern web application built with SvelteKit." />
  <meta property="og:type" content="website" />
</svelte:head>

<h1>Welcome to My App</h1>
<p>A modern web application built with SvelteKit.</p>
```

## Dynamic Titles and Descriptions

Combine `svelte:head` with load function data for dynamic meta tags:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  return {
    post: {
      title: post.title,
      description: post.excerpt,
      content: post.content,
      publishedAt: post.publishedAt
    }
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} — My Blog</title>
  <meta name="description" content={data.post.description} />
  <meta property="og:title" content={data.post.title} />
  <meta property="og:description" content={data.post.description} />
  <meta property="og:type" content="article" />
</svelte:head>

<article>
  <h1>{data.post.title}</h1>
  <time>{data.post.publishedAt}</time>
  <div>{data.post.content}</div>
</article>
```

Every blog post now has its own unique title and description that search engines and social media previews can read.

## Layout-Level Meta Tags

Set default meta tags in a layout so every page inherits a baseline:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <meta name="author" content="Your Name" />
  <meta property="og:site_name" content="My SvelteKit App" />
  <link rel="icon" href="/favicon.png" />
</svelte:head>

{@render children()}
```

Page-level `<svelte:head>` entries merge with layout-level entries. If a page sets its own `<title>`, it overrides the layout title.

## Prerendering Static Pages

Pages with static content that does not change per request can be **prerendered** — built to HTML at build time instead of on every request. This is faster and cheaper to host:

```typescript
// src/routes/about/+page.ts
export const prerender = true;
```

You can also prerender an entire section:

```typescript
// src/routes/blog/+layout.ts
export const prerender = true;
// All pages under /blog will be prerendered
```

Or prerender your entire site by setting it in the config:

```typescript
// svelte.config.js
const config = {
  kit: {
    prerender: {
      entries: ['*']
    }
  }
};
```

Prerendered pages are plain HTML files. They load instantly and can be hosted on any static file server or CDN.

## When to Use SSR vs Prerender

- **SSR (default)** — For pages with data that changes frequently or is user-specific (dashboards, feeds)
- **Prerender** — For pages with static content (about, blog posts, documentation)

## Try It

Add `<svelte:head>` to three pages in your project: the home page, an about page, and a dynamic blog post page. Give each page a unique title and description using data from load functions. Then add `export const prerender = true` to your about page and run `npm run build` to see the prerendered HTML output.

## Key Takeaways

- **SSR** renders pages to HTML on the server — SvelteKit does this by default
- SSR improves performance (faster first paint) and SEO (search engines read the HTML)
- Use `<svelte:head>` to add `<title>`, meta descriptions, and Open Graph tags
- Combine `svelte:head` with load function data for dynamic, per-page meta tags
- **Prerender** static pages with `export const prerender = true` for instant loading
- Layout-level `<svelte:head>` sets defaults; page-level entries merge and override
