# SSR & SEO

When a user types your URL into a browser, what happens in the first few hundred milliseconds determines whether they see content or a blank screen — and whether Google can index your page. SvelteKit renders every page on the server by default, producing complete HTML that the browser can display before JavaScript has even loaded. This is **Server-Side Rendering (SSR)**, and it is one of SvelteKit's most important architectural features.

SSR matters for two reasons. First, **performance**: users see content faster because the browser can paint HTML immediately without waiting for JavaScript to download, parse, and execute. Second, **SEO**: search engine crawlers receive fully-rendered HTML, which means your content is indexed immediately and reliably. Without SSR, crawlers see an empty `<div id="app"></div>` and must execute JavaScript to discover your content — something most crawlers handle poorly or not at all.

This lesson covers the complete SSR lifecycle, how to control rendering behavior per-route, how to add comprehensive SEO metadata, and how to prerender static pages for maximum performance.

## The SSR Lifecycle

Understanding the exact sequence of events helps you debug rendering issues and make informed architectural decisions:

### Step 1: Server Render

When a request arrives, SvelteKit executes these steps on the server:

1. Matches the URL to a route
2. Runs `handle` hooks in `hooks.server.ts`
3. Runs layout load functions (from root to deepest matching layout)
4. Runs the page load function
5. Renders the Svelte component tree to an HTML string
6. Injects the serialized load data into the HTML as a `<script>` tag
7. Sends the complete HTML response to the browser

```
Request: GET /blog/my-post
  → hooks.server.ts handle()
  → +layout.server.ts load()
  → +page.server.ts load()
  → Render component tree to HTML string
  → Inject serialized data: <script>__sveltekit_data = {...}</script>
  → Send HTML response
```

### Step 2: Browser Display

The browser receives complete HTML. It can display the page immediately — text, images, and layout are all visible. The page looks complete but is not yet interactive. Buttons do not respond to clicks, forms do not submit, and `$effect` callbacks have not run.

### Step 3: Hydration

JavaScript loads and SvelteKit "hydrates" the page. Hydration means Svelte walks the existing DOM (which was rendered on the server), attaches event listeners, initializes reactive state from the serialized data, and makes the page fully interactive. Critically, hydration does NOT re-render the page — it reuses the existing DOM nodes.

```
Browser receives HTML → displays immediately (non-interactive)
  → JavaScript loads
  → Svelte hydrates: attaches event listeners, initializes reactivity
  → Page is now fully interactive
```

### Step 4: Client-Side Navigation

Once hydrated, SvelteKit takes over navigation. Clicking an internal link does not trigger a full page reload. Instead, SvelteKit:
1. Calls the target page's load functions
2. Updates the component tree reactively
3. Updates the URL in the browser's address bar

This is the **SPA (Single-Page App) mode** — after the initial server render, the app behaves like a client-side app with instant transitions.

## How +page.ts and +page.server.ts Differ During SSR

Both file types participate in SSR, but their behavior differs after the initial page load:

**`+page.server.ts`** — Runs on the server during SSR. On client-side navigations, SvelteKit makes an internal fetch to your server to run the load function again. The function always runs on the server.

**`+page.ts`** — Runs on the server during SSR. On client-side navigations, the function runs directly in the browser. No server round trip.

This means `+page.ts` code must be compatible with both environments. During SSR, browser APIs like `window`, `document`, and `localStorage` do not exist. Use the `browser` constant to guard browser-only code:

```typescript
// src/routes/settings/+page.ts
import type { PageLoad } from './$types';
import { browser } from '$app/environment';

export const load: PageLoad = async ({ fetch }) => {
  const settings = await fetch('/api/settings').then(r => r.json());

  let savedTheme = 'light';
  if (browser) {
    // This only runs in the browser — localStorage does not exist during SSR
    savedTheme = localStorage.getItem('theme') ?? 'light';
  }

  return {
    settings,
    savedTheme
  };
};
```

## Controlling SSR Per Route

While SSR is enabled by default and is the right choice for most pages, some pages simply cannot render on the server — they depend heavily on browser APIs, contain third-party widgets that require the DOM, or display content that only makes sense in a browser context.

### Disabling SSR

Export `ssr = false` from `+page.ts` or `+layout.ts`:

```typescript
// src/routes/canvas-editor/+page.ts
export const ssr = false;

// The load function still works, but it only runs in the browser
export const load = async ({ fetch }) => {
  const data = await fetch('/api/canvas-data');
  return { canvasData: await data.json() };
};
```

When SSR is disabled:
- The server sends a minimal HTML shell (no server-rendered content)
- The browser renders the page entirely with JavaScript
- Load functions run only in the browser
- SEO crawlers see an empty page — **never disable SSR for content you want indexed**

Setting `ssr = false` in a layout disables SSR for all child pages:

```typescript
// src/routes/app/+layout.ts
// Disables SSR for /app, /app/settings, /app/dashboard, etc.
export const ssr = false;
```

This is useful for authenticated application shells where SEO does not matter and the entire UI depends on client-side state.

### When to Disable SSR

- **Canvas/WebGL applications** that require browser APIs to render
- **Authenticated dashboards** where content is user-specific and not crawled
- **Rich editors** (code editors, WYSIWYG, drawing tools) that depend on DOM measurement
- **Pages using third-party libraries** that crash during SSR (libraries that access `window` at import time)

## Prerendering Static Pages

Prerendering generates HTML at **build time** instead of on every request. The result is a static HTML file that can be served from a CDN with zero server processing per request. Prerendered pages load as fast as physically possible.

```typescript
// src/routes/about/+page.ts
export const prerender = true;
```

During `npm run build`, SvelteKit visits `/about`, runs the load function, renders the component, and saves the output as a static HTML file. When a user visits `/about` in production, the CDN serves this pre-built file directly.

### Prerendering an Entire Section

```typescript
// src/routes/docs/+layout.ts
export const prerender = true;
// Every page under /docs will be prerendered at build time
```

### Prerendering Dynamic Routes

For dynamic routes like `/blog/[slug]`, SvelteKit needs to know which slugs to prerender. It discovers them by crawling links from prerendered pages. If your blog index page links to all posts, SvelteKit follows those links and prerenders each one:

```typescript
// src/routes/blog/+page.server.ts
export const prerender = true;

export const load = async () => {
  const posts = await getAllPosts();
  return { posts };
  // If the template links to /blog/[slug] for each post,
  // SvelteKit will prerender every linked post page
};
```

You can also specify entry points explicitly in `svelte.config.js`:

```javascript
// svelte.config.js
const config = {
  kit: {
    prerender: {
      entries: [
        '*',              // All static routes
        '/blog/post-1',   // Specific dynamic routes
        '/blog/post-2'
      ]
    }
  }
};
```

### Prerender vs SSR Trade-offs

| Aspect | SSR | Prerender |
|---|---|---|
| When HTML is generated | On every request | At build time |
| Data freshness | Always current | Stale until next build |
| Server cost | CPU per request | Zero per request |
| Hosting | Requires Node.js server | Any static file host/CDN |
| Dynamic content | Yes | No (static at build time) |
| User-specific content | Yes | No (same HTML for everyone) |
| Build time | Not affected | Increases with page count |

### The CSR Option

For completeness, you can also control client-side rendering with the `csr` export:

```typescript
// src/routes/static-page/+page.ts
export const prerender = true;
export const csr = false;
// Prerendered AND no JavaScript sent to the client
// The page is pure HTML — no interactivity
```

Setting `csr = false` means SvelteKit does not send the JavaScript needed to hydrate the page. The page is completely static — no event handlers, no reactive updates, no client-side navigation. This is useful for content-only pages where you want the absolute smallest payload.

## SEO with svelte:head

Search engines and social media platforms read metadata from the `<head>` element of your HTML. The `<svelte:head>` special element lets you add elements to `<head>` from any Svelte component:

```svelte
<svelte:head>
  <title>Page Title</title>
  <meta name="description" content="Page description for search results." />
</svelte:head>
```

Elements inside `<svelte:head>` are placed into the document's `<head>` during SSR and managed reactively on the client. When a page component mounts, its head elements are added. When it unmounts (navigating away), they are removed.

### Essential Meta Tags

Every page should have at minimum a title and description:

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />

  <!-- Canonical URL prevents duplicate content issues -->
  <link rel="canonical" href="https://myblog.com/blog/{data.post.slug}" />

  <!-- Language declaration -->
  <meta property="og:locale" content="en_US" />
</svelte:head>
```

The `title` tag is the most important SEO element. It appears in search results, browser tabs, and bookmarks. Keep it under 60 characters, put the most important words first, and make each page's title unique.

The `description` meta tag appears as the snippet text in search results. Keep it under 160 characters and make it compelling — it directly affects click-through rates.

### Open Graph Tags

Open Graph (OG) tags control how your pages appear when shared on Facebook, LinkedIn, Discord, Slack, and many other platforms:

```svelte
<script lang="ts">
  let { data } = $props();

  const siteUrl = 'https://myblog.com';
</script>

<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content={data.post.title} />
  <meta property="og:description" content={data.post.excerpt} />
  <meta property="og:url" content="{siteUrl}/blog/{data.post.slug}" />
  <meta property="og:image" content="{siteUrl}/images/blog/{data.post.slug}.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name" content="My Blog" />

  <!-- Article-specific Open Graph -->
  <meta property="article:published_time" content={data.post.publishedAt} />
  <meta property="article:modified_time" content={data.post.updatedAt} />
  <meta property="article:author" content={data.post.author} />
  {#each data.post.tags as tag}
    <meta property="article:tag" content={tag} />
  {/each}
</svelte:head>
```

The `og:image` tag is particularly important. Social media platforms display images prominently in shared links. Use 1200x630 pixel images for the best display across platforms. Without an OG image, your shared links look plain and get fewer clicks.

### Twitter Card Tags

Twitter (X) uses its own meta tags in addition to Open Graph. Specify `twitter:card` to control the card format:

```svelte
<svelte:head>
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@yourtwitterhandle" />
  <meta name="twitter:creator" content="@authorhandle" />
  <meta name="twitter:title" content={data.post.title} />
  <meta name="twitter:description" content={data.post.excerpt} />
  <meta name="twitter:image" content="{siteUrl}/images/blog/{data.post.slug}.jpg" />
  <meta name="twitter:image:alt" content="Cover image for {data.post.title}" />
</svelte:head>
```

Card types: `summary` (small image), `summary_large_image` (large image), `player` (video/audio), and `app` (mobile app).

### Canonical URLs

Canonical URLs tell search engines which version of a page is the "official" one. This prevents duplicate content penalties when the same content is accessible at multiple URLs:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  const canonicalUrl = `https://myblog.com${page.url.pathname}`;
</script>

<svelte:head>
  <link rel="canonical" href={canonicalUrl} />
</svelte:head>
```

This is especially important when your content is accessible with different query parameters (`/blog?page=1` vs `/blog`) or with and without trailing slashes.

## Structured Data (JSON-LD)

Structured data helps search engines understand your content's type and meaning. It can produce rich results in Google Search — star ratings, recipe cards, event listings, FAQ accordions, and more:

```svelte
<script lang="ts">
  let { data } = $props();

  const siteUrl = 'https://myblog.com';

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.post.title,
    description: data.post.excerpt,
    image: `${siteUrl}/images/blog/${data.post.slug}.jpg`,
    datePublished: data.post.publishedAt,
    dateModified: data.post.updatedAt,
    author: {
      '@type': 'Person',
      name: data.post.author,
      url: `${siteUrl}/authors/${data.post.authorSlug}`
    },
    publisher: {
      '@type': 'Organization',
      name: 'My Blog',
      logo: {
        '@type': 'ImageObject',
        url: `${siteUrl}/logo.png`
      }
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/blog/${data.post.slug}`
    }
  };
</script>

<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />
  {@html `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`}
</svelte:head>
```

Common schema types you should implement:

- **Article** — for blog posts and news articles
- **Product** — for e-commerce product pages (includes price, availability, reviews)
- **BreadcrumbList** — for navigation breadcrumbs
- **FAQ** — for FAQ pages (appears as expandable accordions in search results)
- **Organization** — for your company/brand page
- **WebSite** — for your homepage (enables sitelinks search box)

### Breadcrumb Structured Data

```svelte
<script lang="ts">
  let { data } = $props();

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://myblog.com'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://myblog.com/blog'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: data.post.title,
        item: `https://myblog.com/blog/${data.post.slug}`
      }
    ]
  };
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`}
</svelte:head>
```

## Layout-Level Meta Tags

Set default meta tags in a layout so every page inherits a baseline. Page-level `<svelte:head>` entries merge with layout entries. If a page sets its own `<title>`, it overrides the layout title:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
  <!-- Defaults for every page -->
  <meta name="author" content="Your Name" />
  <meta property="og:site_name" content="My SvelteKit App" />
  <meta name="twitter:site" content="@yourtwitterhandle" />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Default title — overridden by child pages -->
  <title>My SvelteKit App</title>
</svelte:head>

{@render children()}
```

## A Complete SEO Component

For production applications, create a reusable SEO component:

```svelte
<!-- src/lib/components/SEO.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description: string;
    canonical?: string;
    ogImage?: string;
    ogType?: 'website' | 'article';
    twitterCard?: 'summary' | 'summary_large_image';
    noindex?: boolean;
    article?: {
      publishedTime?: string;
      modifiedTime?: string;
      author?: string;
      tags?: string[];
    };
  }

  let {
    title,
    description,
    canonical,
    ogImage,
    ogType = 'website',
    twitterCard = 'summary_large_image',
    noindex = false,
    article
  }: Props = $props();

  const siteName = 'My SvelteKit App';
  const siteUrl = 'https://myapp.com';
  const defaultImage = `${siteUrl}/og-default.jpg`;

  const fullTitle = `${title} | ${siteName}`;
  const image = ogImage ?? defaultImage;
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />

  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}

  {#if canonical}
    <link rel="canonical" href={canonical} />
  {/if}

  <!-- Open Graph -->
  <meta property="og:type" content={ogType} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={image} />
  <meta property="og:site_name" content={siteName} />
  {#if canonical}
    <meta property="og:url" content={canonical} />
  {/if}

  <!-- Article-specific -->
  {#if article}
    {#if article.publishedTime}
      <meta property="article:published_time" content={article.publishedTime} />
    {/if}
    {#if article.modifiedTime}
      <meta property="article:modified_time" content={article.modifiedTime} />
    {/if}
    {#if article.author}
      <meta property="article:author" content={article.author} />
    {/if}
    {#if article.tags}
      {#each article.tags as tag}
        <meta property="article:tag" content={tag} />
      {/each}
    {/if}
  {/if}

  <!-- Twitter Card -->
  <meta name="twitter:card" content={twitterCard} />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
</svelte:head>
```

Use it in any page:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';

  let { data } = $props();
</script>

<SEO
  title={data.post.title}
  description={data.post.excerpt}
  canonical="https://myapp.com/blog/{data.post.slug}"
  ogImage="https://myapp.com/images/blog/{data.post.slug}.jpg"
  ogType="article"
  article={{
    publishedTime: data.post.publishedAt,
    modifiedTime: data.post.updatedAt,
    author: data.post.author,
    tags: data.post.tags
  }}
/>

<article>
  <h1>{data.post.title}</h1>
  <p>{data.post.content}</p>
</article>
```

## Hydration Mismatch Debugging

A hydration mismatch occurs when the HTML rendered on the server differs from what the client expects during hydration. Svelte logs a warning in the browser console when this happens. Common causes:

### 1. Using Browser APIs During SSR

```svelte
<script lang="ts">
  // BAD: window does not exist during SSR
  // let width = window.innerWidth;

  // GOOD: Initialize safely, update after mount
  import { browser } from '$app/environment';

  let width = $state(0);

  $effect(() => {
    if (browser) {
      width = window.innerWidth;
    }
  });
</script>

<p>Window width: {width}</p>
```

### 2. Date/Time Rendering

```svelte
<script lang="ts">
  // BAD: Different times on server and client
  // const now = new Date().toLocaleTimeString();

  // GOOD: Use data from load function (consistent server/client)
  let { data } = $props();
</script>

<!-- Server and client will have the same value -->
<p>Generated at: {data.generatedAt}</p>
```

### 3. Random Values

```svelte
<script lang="ts">
  // BAD: Different random values on server and client
  // const id = Math.random().toString(36);

  // GOOD: Generate in load function or use a deterministic ID
  let { data } = $props();
</script>

<div id={data.elementId}>Content</div>
```

The rule is simple: anything that produces different values on server and client causes a hydration mismatch. Generate such values in load functions (which run once and pass data to both environments) or guard them with `browser` checks and `$effect`.

## SvelteKit Streaming SSR

SvelteKit supports streaming SSR for promises returned from load functions. Instead of waiting for all data before sending any HTML, SvelteKit sends the initial HTML shell immediately and streams additional content as promises resolve:

```typescript
// src/routes/dashboard/+page.server.ts
export const load = async ({ locals }) => {
  // Awaited — included in the initial HTML
  const user = await getUser(locals.user.id);

  // Not awaited — streamed to the client when ready
  return {
    user,
    slowData: getSlowAnalytics(user.id)  // Takes 3 seconds
  };
};
```

The browser receives the page with `user` data rendered immediately. While the user reads the visible content, the `slowData` promise resolves on the server and is streamed to the browser, where the `{#await}` block updates automatically.

This is fundamentally different from client-side loading. With client-side loading, the user sees a loading spinner and then the data appears. With streaming SSR, the user sees real content immediately and supplementary content fills in progressively — no JavaScript required for the initial render.

## Try It

### Exercise 1: Full SEO Implementation
Create a blog with three pages: an index page, an individual post page, and an about page. Add complete SEO metadata to each: title, description, Open Graph tags, Twitter card tags, and canonical URLs. Use the reusable `SEO.svelte` component pattern.

### Exercise 2: Structured Data
Add JSON-LD structured data to your blog post pages using the `Article` schema. Add `BreadcrumbList` structured data showing Home > Blog > Post Title. Validate your structured data using Google's Rich Results Test.

### Exercise 3: Prerendering
Mark your about page and blog post pages as prerenderable. Run `npm run build` and examine the generated HTML files in the build output. Compare the file sizes with and without `csr = false`.

### Exercise 4: Hydration Mismatch
Intentionally create a hydration mismatch by rendering `new Date().toLocaleTimeString()` directly in a component. Observe the console warning. Then fix it by generating the time in a load function and passing it as data.

## Key Takeaways

- **SSR** renders pages to complete HTML on the server — SvelteKit does this by default for every page
- The SSR lifecycle is: server render, browser display (non-interactive), hydration (interactive), then client-side navigation takes over
- Use `<svelte:head>` to add title, meta descriptions, Open Graph tags, Twitter cards, and structured data to every page
- **Prerender** static pages with `export const prerender = true` for maximum performance — generates HTML at build time
- Disable SSR with `export const ssr = false` only for pages that depend on browser APIs and do not need SEO
- Set `export const csr = false` on prerendered pages to send zero JavaScript for content-only pages
- Create a reusable SEO component to ensure consistent metadata across all pages
- Structured data (JSON-LD) enables rich search results — star ratings, FAQ accordions, recipe cards
- Hydration mismatches occur when server and client produce different HTML — avoid browser APIs and non-deterministic values during SSR
- Streaming SSR lets you send critical content immediately while slow data loads progressively
- Layout-level `<svelte:head>` sets defaults; page-level entries merge with and override layout entries
