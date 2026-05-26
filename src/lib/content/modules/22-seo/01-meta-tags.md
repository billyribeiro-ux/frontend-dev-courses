# Meta Tags and SEO

Search Engine Optimization (SEO) determines how your pages appear in Google, Bing, and other search results. The foundation of SEO is **meta tags** — HTML elements in the `<head>` that describe your page's content to search engines and social media platforms.

Most developers treat meta tags as an afterthought — slap a title on each page and move on. But meta tags are one of the highest-leverage things you can do for discoverability. The right title and description can double your click-through rate from search results. Proper Open Graph tags mean your content looks professional when shared on social media. Canonical URLs prevent Google from penalizing you for duplicate content.

SvelteKit provides the `<svelte:head>` element to add meta tags from any component. This lesson covers every meta tag that matters, how `<svelte:head>` works with SvelteKit's layout system, dynamic meta tags from server data, social sharing previews, and a complete production-ready SEO component.

## How svelte:head Works

The `<svelte:head>` element inserts content into the document's `<head>` from any Svelte component — pages, layouts, or even deeply nested child components:

```svelte
<svelte:head>
  <title>My Page Title</title>
  <meta name="description" content="A description of this page." />
</svelte:head>
```

### How it behaves with layouts

SvelteKit renders layouts from the outside in. If both a layout and a page define `<svelte:head>`, the page's content takes precedence for elements that conflict (like `<title>`). Non-conflicting elements from both are merged:

```svelte
<!-- src/routes/+layout.svelte -->
<svelte:head>
  <meta name="theme-color" content="#ff3e00" />
  <link rel="icon" href="/favicon.png" />
</svelte:head>
```

```svelte
<!-- src/routes/about/+page.svelte -->
<svelte:head>
  <title>About Us | My App</title>
  <meta name="description" content="Learn about our team." />
</svelte:head>
```

The rendered `<head>` contains the `theme-color` and `favicon` from the layout plus the `title` and `description` from the page. If the layout also had a `<title>`, the page's `<title>` would override it.

### SSR behavior

During server-side rendering, SvelteKit collects all `<svelte:head>` content and renders it into the HTML response. This is critical for SEO — search engine crawlers see the meta tags in the initial HTML, not after JavaScript runs. When SvelteKit hydrates on the client, it takes over managing the `<head>`, and client-side navigations update meta tags dynamically without a full page reload.

## Essential Meta Tags

### Title tag

The `<title>` tag is the single most important SEO element. It appears as the clickable headline in search results and in the browser tab:

```svelte
<svelte:head>
  <title>About Us | My App</title>
</svelte:head>
```

Best practices for titles:
- Keep it under **60 characters** (Google truncates longer titles)
- Put the unique page name first, site name last: `Page Title | Site Name`
- Make it descriptive and specific — "About Us" is worse than "Our Team and Mission"
- Include your primary keyword naturally (do not keyword-stuff)
- Every page must have a unique title

### Title templates

A common pattern is to append your site name to every title. Create a utility for this:

```typescript
// src/lib/utils/seo.ts
const SITE_NAME = 'My App';

export function formatTitle(pageTitle: string): string {
  return `${pageTitle} | ${SITE_NAME}`;
}

export function formatHomeTitle(): string {
  return `${SITE_NAME} — Build beautiful web applications`;
}
```

```svelte
<script lang="ts">
  import { formatTitle } from '$lib/utils/seo';
</script>

<svelte:head>
  <title>{formatTitle('About Us')}</title>
</svelte:head>
```

### Meta description

The description appears as the snippet below the title in search results. Google sometimes overrides it with content from the page, but a good description increases click-through rates:

```svelte
<svelte:head>
  <meta name="description" content="Learn about our team, mission, and the technology behind My App. We've helped 10,000+ developers ship faster." />
</svelte:head>
```

Best practices:
- Keep it between **120-160 characters** (Google truncates at ~155)
- Write it as a call to action — it is an advertisement for your page
- Include relevant keywords naturally
- Make each page's description unique
- Do not use quotes (they get truncated)

### Viewport meta tag

Essential for responsive design. This should be in your `app.html`, not in individual pages:

```html
<!-- src/app.html -->
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
```

The `width=device-width` tells the browser to use the device's actual width instead of a virtual viewport (which older mobile browsers used for desktop-optimized sites). The `initial-scale=1` sets the initial zoom level.

Do not add `maximum-scale=1` or `user-scalable=no` — these prevent users from zooming, which is an accessibility violation and will hurt your Lighthouse score.

### Robots meta tag

Controls how search engines index your page:

```svelte
<!-- Allow indexing (default behavior, no tag needed) -->
<svelte:head>
  <meta name="robots" content="index, follow" />
</svelte:head>

<!-- Prevent indexing (staging sites, private pages) -->
<svelte:head>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<!-- Index but don't follow links (user-generated content) -->
<svelte:head>
  <meta name="robots" content="index, nofollow" />
</svelte:head>

<!-- Index but don't show a cached version -->
<svelte:head>
  <meta name="robots" content="index, follow, noarchive" />
</svelte:head>

<!-- Don't show a snippet in search results -->
<svelte:head>
  <meta name="robots" content="nosnippet" />
</svelte:head>
```

For staging environments, use a layout-level robots tag:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { dev } from '$app/environment';
</script>

<svelte:head>
  {#if dev}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
</svelte:head>
```

### Canonical URLs

The canonical URL tells search engines which URL is the "official" version of the page. This prevents duplicate content penalties when the same page is accessible from multiple URLs:

```svelte
<svelte:head>
  <link rel="canonical" href="https://mysite.com/blog/my-post" />
</svelte:head>
```

When do you need canonical URLs?
- If your site is accessible via both `www.` and non-`www.` URLs
- If pages have URL parameters (`?sort=date`) that do not change the content
- If content is syndicated or republished on other sites
- If the same content exists at multiple paths (e.g., `/products/shoes` and `/category/footwear/shoes`)

Generate canonical URLs dynamically using the `page` store:

```svelte
<script lang="ts">
  import { page } from '$app/stores';

  const BASE_URL = 'https://mysite.com';
  let canonicalUrl = $derived(`${BASE_URL}${$page.url.pathname}`);
</script>

<svelte:head>
  <link rel="canonical" href={canonicalUrl} />
</svelte:head>
```

## Dynamic Meta Tags from Load Functions

Generate meta tags from server-loaded data for dynamic pages:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  if (!post) {
    throw error(404, 'Post not found');
  }

  return {
    post,
    meta: {
      title: post.title,
      description: post.excerpt,
      image: post.coverImage
        ? `https://mysite.com/images/${post.coverImage}`
        : 'https://mysite.com/og-default.jpg',
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      author: post.author.name
    }
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';

  let { data } = $props();
</script>

<SEO
  title={data.meta.title}
  description={data.meta.description}
  image={data.meta.image}
  url="https://mysite.com/blog/{data.post.slug}"
  type="article"
  publishedAt={data.meta.publishedAt}
  author={data.meta.author}
/>

<article>
  <h1>{data.post.title}</h1>
  {@html data.post.content}
</article>
```

## Open Graph Protocol

Open Graph tags control how your page appears when shared on Facebook, LinkedIn, Discord, Slack, and most social platforms. They are the difference between a bare URL and a rich preview card with image, title, and description.

### Required Open Graph tags

```svelte
<svelte:head>
  <meta property="og:title" content="How to Build a Design System with SvelteKit" />
  <meta property="og:description" content="A complete guide to building production-ready design systems using CSS custom properties and Svelte 5." />
  <meta property="og:image" content="https://mysite.com/og/design-system.jpg" />
  <meta property="og:url" content="https://mysite.com/blog/design-system" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="My App" />
</svelte:head>
```

### Open Graph types

The `og:type` affects what additional metadata platforms expect:

```svelte
<!-- For general pages -->
<meta property="og:type" content="website" />

<!-- For blog posts and articles -->
<meta property="og:type" content="article" />
<meta property="article:published_time" content="2025-03-15T10:00:00Z" />
<meta property="article:modified_time" content="2025-04-01T14:30:00Z" />
<meta property="article:author" content="Jane Smith" />
<meta property="article:section" content="Technology" />
<meta property="article:tag" content="SvelteKit" />
<meta property="article:tag" content="CSS" />

<!-- For products -->
<meta property="og:type" content="product" />
<meta property="product:price:amount" content="29.99" />
<meta property="product:price:currency" content="USD" />

<!-- For a user's profile page -->
<meta property="og:type" content="profile" />
<meta property="profile:first_name" content="Jane" />
<meta property="profile:last_name" content="Smith" />
```

### Image best practices

The `og:image` tag is the most impactful Open Graph tag. A compelling image dramatically increases engagement:

```svelte
<svelte:head>
  <!-- Primary image — 1200x630 for optimal display -->
  <meta property="og:image" content="https://mysite.com/og/my-page.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="A diagram showing the design system architecture" />

  <!-- Fallback for high-resolution displays -->
  <meta property="og:image" content="https://mysite.com/og/my-page-2x.jpg" />
  <meta property="og:image:width" content="2400" />
  <meta property="og:image:height" content="1260" />
</svelte:head>
```

Image requirements:
- **Minimum**: 200x200 pixels (Facebook's requirement)
- **Recommended**: 1200x630 pixels (2:1.05 ratio for Facebook/LinkedIn)
- **Format**: JPEG or PNG (not WebP — some crawlers do not support it yet)
- **File size**: Under 8MB (Facebook's limit)
- **URL**: Must be absolute (include `https://your-domain.com`)
- Always include `og:image:alt` for accessibility

### Dynamic OG images

For blog posts and dynamic content, generate OG images with a server endpoint:

```typescript
// src/routes/og/[slug].png/+server.ts
import type { RequestHandler } from './$types';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';

export const GET: RequestHandler = async ({ params }) => {
  const post = await getPost(params.slug);

  const svg = await satori(
    {
      type: 'div',
      props: {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '60px',
          width: '1200px',
          height: '630px',
          background: 'linear-gradient(135deg, #ff3e00, #ff6b3d)',
          color: 'white',
          fontFamily: 'Inter'
        },
        children: [
          {
            type: 'h1',
            props: {
              style: { fontSize: '48px', margin: 0, lineHeight: 1.2 },
              children: post.title
            }
          },
          {
            type: 'p',
            props: {
              style: { fontSize: '24px', opacity: 0.9, marginTop: '20px' },
              children: post.excerpt
            }
          }
        ]
      }
    },
    { width: 1200, height: 630, fonts: [/* font data */] }
  );

  const resvg = new Resvg(svg);
  const png = resvg.render().asPng();

  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800'
    }
  });
};
```

Then reference it in your meta tags:

```svelte
<meta property="og:image" content="https://mysite.com/og/{data.post.slug}.png" />
```

## Twitter/X Card Tags

Twitter (X) uses its own set of tags for link previews. If Twitter card tags are not present, Twitter falls back to Open Graph tags, but defining both gives you the most control:

```svelte
<svelte:head>
  <!-- Card type -->
  <meta name="twitter:card" content="summary_large_image" />

  <!-- Content -->
  <meta name="twitter:title" content={data.post.title} />
  <meta name="twitter:description" content={data.post.excerpt} />
  <meta name="twitter:image" content="https://mysite.com/og/{data.post.slug}.jpg" />
  <meta name="twitter:image:alt" content="Cover image for {data.post.title}" />

  <!-- Attribution -->
  <meta name="twitter:site" content="@yoursitehandle" />
  <meta name="twitter:creator" content="@authorhandle" />
</svelte:head>
```

### Card types

- **`summary`**: Small square thumbnail on the left, title and description on the right
- **`summary_large_image`**: Large image above the title and description (most common for blog posts)
- **`player`**: For video/audio content with an embedded player
- **`app`**: For mobile app install cards

For most content, use `summary_large_image`. Use `summary` only when you do not have a compelling image.

## Favicons and App Icons

Modern browsers and devices use several different icon formats. Set them up in `app.html` (not `<svelte:head>`, since they do not change per page):

```html
<!-- src/app.html -->
<head>
  <!-- Standard favicon -->
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" href="/icon.svg" type="image/svg+xml" />

  <!-- Apple touch icon -->
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

  <!-- Web app manifest for PWA -->
  <link rel="manifest" href="/manifest.json" />

  <!-- Theme color for mobile browsers -->
  <meta name="theme-color" content="#ff3e00" />
  <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />
</head>
```

The `theme-color` meta tag colors the browser's address bar on mobile. Use two tags with media queries to match your light and dark themes.

The minimal icon set:
- `favicon.ico` (32x32) — legacy browsers
- `icon.svg` — modern browsers (scales infinitely, can be responsive with media queries)
- `apple-touch-icon.png` (180x180) — iOS home screen
- `manifest.json` — PWA icons (192x192 and 512x512)

## Complete SEO Component

Here is a production-ready, reusable SEO component that handles all the tags discussed:

```svelte
<!-- src/lib/components/SEO.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    title: string;
    description: string;
    image?: string;
    imageAlt?: string;
    url?: string;
    type?: 'website' | 'article' | 'product' | 'profile';
    siteName?: string;
    twitterCard?: 'summary' | 'summary_large_image';
    twitterSite?: string;
    twitterCreator?: string;
    publishedAt?: string;
    updatedAt?: string;
    author?: string;
    section?: string;
    tags?: string[];
    noindex?: boolean;
    canonical?: string;
  }

  const BASE_URL = 'https://mysite.com';
  const DEFAULT_SITE_NAME = 'My App';
  const DEFAULT_IMAGE = `${BASE_URL}/og-default.jpg`;
  const DEFAULT_TWITTER_SITE = '@myapp';

  let {
    title,
    description,
    image = DEFAULT_IMAGE,
    imageAlt = '',
    url,
    type = 'website',
    siteName = DEFAULT_SITE_NAME,
    twitterCard,
    twitterSite = DEFAULT_TWITTER_SITE,
    twitterCreator,
    publishedAt,
    updatedAt,
    author,
    section,
    tags = [],
    noindex = false,
    canonical
  }: Props = $props();

  const fullTitle = `${title} | ${siteName}`;

  // Default to current page URL if not provided
  let pageUrl = $derived(url || `${BASE_URL}${$page.url.pathname}`);
  let canonicalUrl = $derived(canonical || pageUrl);

  // Auto-select Twitter card based on image presence
  let resolvedTwitterCard = $derived(
    twitterCard || (image && image !== DEFAULT_IMAGE ? 'summary_large_image' : 'summary')
  );

  // Truncate description to safe length
  let safeDescription = $derived(
    description.length > 155 ? description.slice(0, 152) + '...' : description
  );
</script>

<svelte:head>
  <!-- Primary Meta Tags -->
  <title>{fullTitle}</title>
  <meta name="description" content={safeDescription} />
  <link rel="canonical" href={canonicalUrl} />

  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}

  <!-- Open Graph -->
  <meta property="og:type" content={type} />
  <meta property="og:title" content={fullTitle} />
  <meta property="og:description" content={safeDescription} />
  <meta property="og:image" content={image} />
  {#if imageAlt}
    <meta property="og:image:alt" content={imageAlt} />
  {/if}
  <meta property="og:url" content={pageUrl} />
  <meta property="og:site_name" content={siteName} />
  <meta property="og:locale" content="en_US" />

  <!-- Article-specific OG tags -->
  {#if type === 'article'}
    {#if publishedAt}
      <meta property="article:published_time" content={publishedAt} />
    {/if}
    {#if updatedAt}
      <meta property="article:modified_time" content={updatedAt} />
    {/if}
    {#if author}
      <meta property="article:author" content={author} />
    {/if}
    {#if section}
      <meta property="article:section" content={section} />
    {/if}
    {#each tags as tag}
      <meta property="article:tag" content={tag} />
    {/each}
  {/if}

  <!-- Twitter Card -->
  <meta name="twitter:card" content={resolvedTwitterCard} />
  <meta name="twitter:title" content={fullTitle} />
  <meta name="twitter:description" content={safeDescription} />
  {#if image}
    <meta name="twitter:image" content={image} />
  {/if}
  {#if imageAlt}
    <meta name="twitter:image:alt" content={imageAlt} />
  {/if}
  {#if twitterSite}
    <meta name="twitter:site" content={twitterSite} />
  {/if}
  {#if twitterCreator}
    <meta name="twitter:creator" content={twitterCreator} />
  {/if}
</svelte:head>
```

### Using the SEO component

```svelte
<!-- Home page -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';
</script>

<SEO
  title="Home"
  description="Build beautiful web applications with My App. Start for free and deploy in minutes."
/>

<!-- Blog post page -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';
  let { data } = $props();
</script>

<SEO
  title={data.post.title}
  description={data.post.excerpt}
  image="https://mysite.com/og/{data.post.slug}.png"
  imageAlt="Cover art for {data.post.title}"
  type="article"
  publishedAt={data.post.publishedAt}
  updatedAt={data.post.updatedAt}
  author={data.post.author.name}
  section="Technology"
  tags={data.post.tags}
  twitterCreator={data.post.author.twitter}
/>

<!-- Private/staging page -->
<SEO
  title="Admin Dashboard"
  description="Internal admin tools."
  noindex
/>
```

## Additional Useful Meta Tags

### Language and locale

```html
<!-- In app.html -->
<html lang="en">

<!-- For multilingual sites, in svelte:head -->
<link rel="alternate" hreflang="es" href="https://mysite.com/es/about" />
<link rel="alternate" hreflang="fr" href="https://mysite.com/fr/about" />
<link rel="alternate" hreflang="x-default" href="https://mysite.com/about" />
```

### Preconnect and DNS prefetch

These go in `app.html` for third-party domains you know you will need:

```html
<head>
  <!-- Preconnect to domains used for fonts, analytics, etc. -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

  <!-- DNS prefetch for less critical third-party domains -->
  <link rel="dns-prefetch" href="https://analytics.example.com" />
</head>
```

### Content Security Policy

For production security, set a Content Security Policy header (better in `hooks.server.ts` than as a meta tag):

```typescript
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https:; font-src 'self' https://fonts.gstatic.com"
  );

  return response;
};
```

## Debugging and Testing Meta Tags

### Browser DevTools

Open DevTools, go to Elements, and inspect the `<head>` section. After a client-side navigation, check that meta tags updated.

### Social media preview tools

- **Facebook**: [Sharing Debugger](https://developers.facebook.com/tools/debug/) — enter your URL to see the preview and clear Facebook's cache
- **Twitter/X**: [Card Validator](https://cards-dev.twitter.com/validator) — preview your Twitter card
- **LinkedIn**: [Post Inspector](https://www.linkedin.com/post-inspector/) — check LinkedIn previews
- **General**: [opengraph.xyz](https://www.opengraph.xyz/) — preview across multiple platforms

### Common debugging issues

```
Problem: Social media shows old/wrong image
Fix: Clear the platform's cache using the debugger tool above.
     Facebook caches OG data aggressively.

Problem: Description shows page content instead of meta description
Fix: Google sometimes ignores meta descriptions if it thinks
     page content is more relevant. Write a better meta description.

Problem: Title is truncated in search results
Fix: Keep titles under 60 characters.

Problem: No image preview when sharing
Fix: og:image must be an absolute URL (https://...), not a relative path.
     Image must be publicly accessible (not behind auth).
```

## Try It

1. **Foundation exercise**: Create an SEO component with all the properties shown above. Use it on three different pages: a home page (type "website"), a blog post page with dynamic data (type "article" with dates and author), and a static about page. Inspect the `<head>` in DevTools to verify all tags render correctly.

2. **Dynamic exercise**: Create a load function that returns meta data alongside page data. Use the meta data to populate the SEO component. Test with different posts and verify that each page has unique titles, descriptions, and images.

3. **Preview exercise**: Deploy your site (even to a preview URL) and test your meta tags using Facebook's Sharing Debugger and opengraph.xyz. Fix any issues flagged by these tools.

4. **Canonical URL exercise**: Add canonical URL support to your SEO component using the `page` store. Handle query parameters correctly (strip tracking parameters like `?utm_source` from canonicals). Test that paginated content has the correct canonical pointing to the first page.

## Key Takeaways

- Use `<svelte:head>` to add meta tags from any Svelte component — pages, layouts, or child components
- Every page needs a unique `<title>` (under 60 chars) and `<meta name="description">` (120-160 chars)
- Open Graph tags (`og:title`, `og:image`, `og:description`) control social media link previews — `og:image` has the highest impact
- Twitter Card tags override OG tags on Twitter/X — use `summary_large_image` for blog posts
- **Canonical URLs** prevent duplicate content penalties — generate them from the page store
- The `robots` meta tag controls indexing — use `noindex` for staging, admin, and private pages
- Set `color-scheme` and `theme-color` in `app.html` for mobile browser integration
- Build a **reusable SEO component** — consistency across pages prevents forgotten tags
- `<svelte:head>` works during SSR, so crawlers see the correct tags in the initial HTML
- Test your tags with platform-specific debugger tools — do not assume they are correct
