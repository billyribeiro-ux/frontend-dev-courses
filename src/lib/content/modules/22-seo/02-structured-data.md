# Structured Data

Structured data helps search engines understand the meaning of your content, not just the text. When Google understands that a page contains a recipe, a course, or an article, it can display **rich results** — enhanced search listings with stars, images, prices, and other details that stand out.

Structured data uses the **JSON-LD** format (JSON for Linked Data) and follows the **schema.org** vocabulary. You embed it as a `<script>` tag in your page's `<head>`.

## What is JSON-LD?

JSON-LD is a JSON object that describes your content using a standardized vocabulary. Search engines read it to understand the page's meaning:

```svelte
<svelte:head>
  {@html `<script type="application/ld+json">
    ${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "My App",
      "url": "https://mysite.com"
    })}
  </script>`}
</svelte:head>
```

The `@context` tells search engines you are using schema.org vocabulary. The `@type` specifies what kind of thing you are describing.

## Article Schema

For blog posts and articles, use the Article schema:

```svelte
<script lang="ts">
  let { data } = $props();

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.post.title,
    description: data.post.excerpt,
    image: `https://mysite.com/images/${data.post.slug}.jpg`,
    datePublished: data.post.publishedAt,
    dateModified: data.post.updatedAt,
    author: {
      '@type': 'Person',
      name: data.post.author
    },
    publisher: {
      '@type': 'Organization',
      name: 'My Blog',
      logo: {
        '@type': 'ImageObject',
        url: 'https://mysite.com/logo.png'
      }
    }
  };
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>`}
</svelte:head>
```

This can produce rich results with the author name, publish date, and thumbnail in search results.

## Course Schema

Since you are building a course platform, the Course schema is especially relevant:

```svelte
<script lang="ts">
  let { data } = $props();

  const courseSchema = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: data.course.title,
    description: data.course.description,
    provider: {
      '@type': 'Organization',
      name: 'My Course Platform',
      sameAs: 'https://mysite.com'
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: 'PT20H'
    }
  };
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(courseSchema)}</script>`}
</svelte:head>
```

## BreadcrumbList Schema

Breadcrumbs show the page hierarchy in search results:

```svelte
<script lang="ts">
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://mysite.com'
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Blog',
        item: 'https://mysite.com/blog'
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'My Post Title',
        item: 'https://mysite.com/blog/my-post'
      }
    ]
  };
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>`}
</svelte:head>
```

Google displays breadcrumbs as a trail in search results: Home > Blog > My Post Title.

## Reusable Structured Data Component

Create a helper component for cleaner usage:

```svelte
<!-- src/lib/components/JsonLd.svelte -->
<script lang="ts">
  interface Props {
    schema: Record<string, unknown>;
  }

  let { schema }: Props = $props();
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${JSON.stringify(schema)}</script>`}
</svelte:head>
```

Use it anywhere:

```svelte
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
</script>

<JsonLd schema={{
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'My Article',
  datePublished: '2025-01-15'
}} />
```

## Testing with Rich Results Test

Google provides a free tool to validate your structured data. Visit [Rich Results Test](https://search.google.com/test/rich-results) and enter your URL or paste your HTML. It shows which rich result types are detected and flags any errors or warnings.

## Try It

Add structured data to a blog post page that includes both an Article schema and a BreadcrumbList schema. Create a reusable `JsonLd` component and use it on at least two different page types. Test your output by copying the generated JSON-LD and pasting it into Google's Rich Results Test.

## Key Takeaways

- Structured data uses JSON-LD format embedded in a `<script type="application/ld+json">` tag
- The schema.org vocabulary provides types like Article, Course, and BreadcrumbList
- Use `{@html}` in `<svelte:head>` to render the script tag in SvelteKit
- Article schema can produce rich results with author, date, and thumbnail
- BreadcrumbList schema displays a navigation trail in search results
- Test your structured data with Google's Rich Results Test tool
