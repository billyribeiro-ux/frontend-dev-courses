# Meta Tags and SEO

Search Engine Optimization (SEO) determines how your pages appear in Google, Bing, and other search results. The foundation of SEO is **meta tags** — HTML elements in the `<head>` that describe your page's content to search engines and social media platforms.

SvelteKit provides the `<svelte:head>` element to add meta tags from any component. This lets you set unique titles and descriptions for every page in your application.

## Basic Meta Tags with svelte:head

Add a title and description to any page:

```svelte
<!-- src/routes/about/+page.svelte -->
<svelte:head>
  <title>About Us | My App</title>
  <meta name="description" content="Learn about our team, mission, and values. We build tools that help developers ship faster." />
</svelte:head>

<h1>About Us</h1>
<p>Welcome to our about page.</p>
```

The `<title>` tag appears in the browser tab and as the clickable headline in search results. The `description` meta tag appears as the snippet below the title. Keep descriptions between 120-160 characters.

## Dynamic Meta Tags

Generate meta tags from loaded data:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />
  <link rel="canonical" href="https://mysite.com/blog/{data.post.slug}" />
</svelte:head>

<article>
  <h1>{data.post.title}</h1>
  <p>{data.post.content}</p>
</article>
```

The **canonical URL** tells search engines which URL is the "official" version of the page. This prevents duplicate content issues when the same page is accessible from multiple URLs.

## Open Graph Tags

Open Graph tags control how your page appears when shared on Facebook, LinkedIn, and other platforms:

```svelte
<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />

  <!-- Open Graph -->
  <meta property="og:type" content="article" />
  <meta property="og:title" content={data.post.title} />
  <meta property="og:description" content={data.post.excerpt} />
  <meta property="og:image" content="https://mysite.com/images/{data.post.slug}.jpg" />
  <meta property="og:url" content="https://mysite.com/blog/{data.post.slug}" />
  <meta property="og:site_name" content="My Blog" />
</svelte:head>
```

The `og:image` tag is especially important — it determines the preview image when someone shares your link. Use images at least 1200x630 pixels.

## Twitter Card Tags

Twitter (X) uses its own set of tags for link previews:

```svelte
<svelte:head>
  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.post.title} />
  <meta name="twitter:description" content={data.post.excerpt} />
  <meta name="twitter:image" content="https://mysite.com/images/{data.post.slug}.jpg" />
  <meta name="twitter:site" content="@yourusername" />
</svelte:head>
```

The `summary_large_image` card type shows a large preview image. Use `summary` for a smaller thumbnail.

## Reusable SEO Component

Avoid repeating meta tags by creating a reusable component:

```svelte
<!-- src/lib/components/SEO.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description: string;
    image?: string;
    url?: string;
    type?: string;
  }

  let { title, description, image, url, type = 'website' }: Props = $props();

  const siteName = 'My App';
  const fullTitle = `${title} | ${siteName}`;
</script>

<svelte:head>
  <title>{fullTitle}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={url} />

  <meta property="og:type" content={type} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={description} />
  {#if image}<meta property="og:image" content={image} />{/if}
  {#if url}<meta property="og:url" content={url} />{/if}
  <meta property="og:site_name" content={siteName} />

  <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
  <meta name="twitter:title" content={fullTitle} />
  <meta name="twitter:description" content={description} />
  {#if image}<meta name="twitter:image" content={image} />{/if}
</svelte:head>
```

Use it on any page:

```svelte
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';
</script>

<SEO
  title="About Us"
  description="Learn about our team and mission."
  url="https://mysite.com/about"
/>
```

## Try It

Create an SEO component and use it on three different pages: a home page, a blog post page (with dynamic data), and a static about page. Include Open Graph and Twitter Card tags. Test your tags using a social media preview tool or browser dev tools to verify the `<head>` content.

## Key Takeaways

- Use `<svelte:head>` to add meta tags from any Svelte component
- Every page needs a unique `<title>` and `<meta name="description">`
- Open Graph tags (`og:title`, `og:image`, etc.) control social media link previews
- Twitter Card tags (`twitter:card`, `twitter:title`) control Twitter/X previews
- Canonical URLs prevent duplicate content issues in search results
- Build a reusable SEO component to keep meta tags consistent across pages
