# Structured Data

Structured data helps search engines understand the meaning of your content, not just the text. When Google knows that a page contains a recipe, an article, or a product, it can display **rich results** — enhanced search listings with stars, images, prices, FAQs, and other details that dramatically stand out from plain blue links.

The impact is significant. Rich results have click-through rates 20-40% higher than standard results. A product listing with star ratings, price, and availability catches the eye. An FAQ snippet occupies more vertical space in search results, pushing competitors down. A breadcrumb trail helps users understand where they are before they click. Structured data is free advertising real estate in search results.

This lesson covers the JSON-LD format, the most important schema.org types, how to implement them in SvelteKit with server-loaded data, validation, and complete production examples.

## What Is JSON-LD?

JSON-LD (JSON for Linked Data) is a JSON object that describes your content using a standardized vocabulary from [schema.org](https://schema.org). You embed it in a `<script type="application/ld+json">` tag in your page's `<head>`. Search engines parse it to understand the page's meaning.

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

The `@context` tells search engines you are using the schema.org vocabulary. The `@type` specifies what kind of thing you are describing. Every other property provides data about that thing.

### Why JSON-LD over Microdata or RDFa?

There are three formats for structured data: JSON-LD, Microdata, and RDFa. Google recommends JSON-LD because:

1. **Separation of concerns**: JSON-LD lives in `<head>`, separate from your HTML markup. Your templates stay clean.
2. **Easier to maintain**: A single JSON object is easier to read and edit than attributes scattered across HTML elements.
3. **Dynamic generation**: JSON-LD is just JSON — trivially generated from server load functions.
4. **No coupling**: Changing your HTML structure does not break your structured data.

### The @html safety note

In Svelte, we use `{@html}` to render the `<script>` tag. This is one of the rare cases where `{@html}` is necessary and safe — the content is JSON that you control, not user input. However, if any data in the schema comes from user input (like a review body or product name), you should sanitize it:

```typescript
// Escape characters that could break out of a script tag
function sanitizeForJsonLd(text: string): string {
  return text
    .replace(/</g, '\\u003C')
    .replace(/>/g, '\\u003E')
    .replace(/&/g, '\\u0026');
}
```

In practice, `JSON.stringify` handles most escaping, but the `</script>` sequence is the one edge case that can break things. If a user-provided string contains `</script>`, it could prematurely close the script tag.

## Reusable JsonLd Component

Before diving into specific schemas, create a helper component that handles the boilerplate:

```svelte
<!-- src/lib/components/JsonLd.svelte -->
<script lang="ts">
  interface Props {
    schema: Record<string, unknown> | Record<string, unknown>[];
  }

  let { schema }: Props = $props();

  // Handle both single schemas and arrays of schemas
  let jsonString = $derived(
    JSON.stringify(schema)
      .replace(/</g, '\\u003C') // Prevent script injection
  );
</script>

<svelte:head>
  {@html `<script type="application/ld+json">${jsonString}</script>`}
</svelte:head>
```

Now every schema implementation is clean:

```svelte
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
</script>

<JsonLd schema={{
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'My App',
  url: 'https://mysite.com'
}} />
```

### Multiple schemas on one page

A page can (and often should) have multiple structured data blocks. A blog post page might have an Article schema, a BreadcrumbList schema, and an Organization schema. Use an array or multiple `<JsonLd>` instances:

```svelte
<JsonLd schema={articleSchema} />
<JsonLd schema={breadcrumbSchema} />
<JsonLd schema={organizationSchema} />
```

Or pass an array using `@graph`:

```svelte
<JsonLd schema={{
  '@context': 'https://schema.org',
  '@graph': [articleSchema, breadcrumbSchema, organizationSchema]
}} />
```

The `@graph` approach is preferred when schemas reference each other (e.g., the Article's `publisher` references the Organization by `@id`).

## Common Schema Types

### Organization Schema

Every site should have an Organization (or Person) schema on the home page. This feeds into Google's Knowledge Panel:

```typescript
// src/lib/schemas/organization.ts
export function createOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://mysite.com/#organization',
    name: 'My App',
    url: 'https://mysite.com',
    logo: {
      '@type': 'ImageObject',
      url: 'https://mysite.com/logo.png',
      width: 512,
      height: 512
    },
    description: 'We build tools that help developers ship faster.',
    foundingDate: '2023-01-15',
    sameAs: [
      'https://twitter.com/myapp',
      'https://github.com/myapp',
      'https://linkedin.com/company/myapp'
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      email: 'support@mysite.com',
      availableLanguage: ['English']
    }
  };
}
```

The `@id` property is important — it creates a unique identifier that other schemas can reference. The `sameAs` property tells Google about your social profiles, which can appear in the Knowledge Panel.

### WebSite Schema with SearchAction

Tells Google that your site has a search feature, enabling a sitelinks searchbox in results:

```typescript
export function createWebSiteSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': 'https://mysite.com/#website',
    name: 'My App',
    url: 'https://mysite.com',
    publisher: { '@id': 'https://mysite.com/#organization' },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: 'https://mysite.com/search?q={search_term_string}'
      },
      'query-input': 'required name=search_term_string'
    }
  };
}
```

### Article Schema

For blog posts and articles. This is the most common schema type and produces rich results with author, date, and thumbnail:

```typescript
// src/lib/schemas/article.ts
interface ArticleData {
  title: string;
  excerpt: string;
  slug: string;
  content: string;
  publishedAt: string;
  updatedAt: string;
  author: {
    name: string;
    url?: string;
    image?: string;
  };
  image?: string;
  tags?: string[];
  wordCount?: number;
}

export function createArticleSchema(article: ArticleData) {
  const BASE_URL = 'https://mysite.com';

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${BASE_URL}/blog/${article.slug}#article`,
    headline: article.title,
    description: article.excerpt,
    image: article.image || `${BASE_URL}/og/${article.slug}.png`,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt || article.publishedAt,
    wordCount: article.wordCount || estimateWordCount(article.content),
    author: {
      '@type': 'Person',
      name: article.author.name,
      ...(article.author.url && { url: article.author.url }),
      ...(article.author.image && {
        image: {
          '@type': 'ImageObject',
          url: article.author.image
        }
      })
    },
    publisher: {
      '@id': `${BASE_URL}/#organization`
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${BASE_URL}/blog/${article.slug}`
    },
    isPartOf: {
      '@id': `${BASE_URL}/#website`
    },
    ...(article.tags && {
      keywords: article.tags.join(', ')
    })
  };
}

function estimateWordCount(html: string): number {
  const text = html.replace(/<[^>]+>/g, '');
  return text.split(/\s+/).filter(Boolean).length;
}
```

Usage in a page:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
  import { createArticleSchema } from '$lib/schemas/article';

  let { data } = $props();

  const articleSchema = createArticleSchema({
    title: data.post.title,
    excerpt: data.post.excerpt,
    slug: data.post.slug,
    content: data.post.content,
    publishedAt: data.post.publishedAt,
    updatedAt: data.post.updatedAt,
    author: data.post.author,
    image: data.post.coverImage,
    tags: data.post.tags,
    wordCount: data.post.wordCount
  });
</script>

<JsonLd schema={articleSchema} />
```

### BreadcrumbList Schema

Breadcrumbs show the page hierarchy in search results as a trail: Home > Blog > My Post Title. Google displays these instead of the raw URL, making search results more navigable:

```typescript
// src/lib/schemas/breadcrumb.ts
interface BreadcrumbItem {
  name: string;
  path: string;
}

export function createBreadcrumbSchema(items: BreadcrumbItem[]) {
  const BASE_URL = 'https://mysite.com';

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.path}`
    }))
  };
}
```

Usage:

```svelte
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
  import { createBreadcrumbSchema } from '$lib/schemas/breadcrumb';

  let { data } = $props();

  const breadcrumbs = createBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: data.post.title, path: `/blog/${data.post.slug}` }
  ]);
</script>

<JsonLd schema={breadcrumbs} />
```

### Auto-generating breadcrumbs from the URL

For consistent breadcrumbs across your site, generate them from the URL path:

```typescript
// src/lib/schemas/breadcrumb.ts
export function createBreadcrumbsFromPath(
  pathname: string,
  labels: Record<string, string> = {}
) {
  const BASE_URL = 'https://mysite.com';
  const segments = pathname.split('/').filter(Boolean);

  const items = [
    { '@type': 'ListItem' as const, position: 1, name: 'Home', item: BASE_URL }
  ];

  let currentPath = '';
  segments.forEach((segment, index) => {
    currentPath += `/${segment}`;
    items.push({
      '@type': 'ListItem' as const,
      position: index + 2,
      name: labels[currentPath] || formatSegment(segment),
      item: `${BASE_URL}${currentPath}`
    });
  });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items
  };
}

function formatSegment(segment: string): string {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}
```

### Product Schema

For e-commerce pages. This produces rich results with price, availability, and review ratings:

```typescript
// src/lib/schemas/product.ts
interface ProductData {
  name: string;
  description: string;
  slug: string;
  image: string[];
  price: number;
  currency: string;
  availability: 'InStock' | 'OutOfStock' | 'PreOrder' | 'BackOrder';
  brand: string;
  sku: string;
  rating?: {
    average: number;
    count: number;
  };
  reviewCount?: number;
}

export function createProductSchema(product: ProductData) {
  const BASE_URL = 'https://mysite.com';

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    sku: product.sku,
    brand: {
      '@type': 'Brand',
      name: product.brand
    },
    offers: {
      '@type': 'Offer',
      url: `${BASE_URL}/products/${product.slug}`,
      price: product.price.toFixed(2),
      priceCurrency: product.currency,
      availability: `https://schema.org/${product.availability}`,
      seller: {
        '@id': `${BASE_URL}/#organization`
      }
    }
  };

  if (product.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: product.rating.average.toFixed(1),
      bestRating: '5',
      worstRating: '1',
      ratingCount: product.rating.count
    };
  }

  return schema;
}
```

```svelte
<!-- src/routes/products/[slug]/+page.svelte -->
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
  import { createProductSchema } from '$lib/schemas/product';

  let { data } = $props();

  const productSchema = createProductSchema({
    name: data.product.name,
    description: data.product.description,
    slug: data.product.slug,
    image: data.product.images.map((img: string) => `https://mysite.com/images/${img}`),
    price: data.product.price,
    currency: 'USD',
    availability: data.product.inStock ? 'InStock' : 'OutOfStock',
    brand: data.product.brand,
    sku: data.product.sku,
    rating: data.product.rating
  });
</script>

<JsonLd schema={productSchema} />
```

### FAQ Schema

FAQ structured data produces expandable question/answer pairs directly in search results. This is one of the most visually impactful schema types — it can double the size of your search result:

```typescript
// src/lib/schemas/faq.ts
interface FAQItem {
  question: string;
  answer: string;
}

export function createFAQSchema(items: FAQItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(item => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer
      }
    }))
  };
}
```

```svelte
<!-- src/routes/pricing/+page.svelte -->
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';
  import { createFAQSchema } from '$lib/schemas/faq';

  const faqSchema = createFAQSchema([
    {
      question: 'Is there a free plan?',
      answer: 'Yes! Our free plan includes up to 3 projects with unlimited collaborators.'
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Absolutely. You can cancel your subscription at any time with no cancellation fees.'
    },
    {
      question: 'Do you offer discounts for teams?',
      answer: 'Yes, we offer 20% off for teams of 5 or more. Contact sales@mysite.com for details.'
    }
  ]);
</script>

<JsonLd schema={faqSchema} />

<h1>Pricing</h1>
<!-- Display the FAQ items visually too -->
{#each faqItems as faq}
  <details>
    <summary>{faq.question}</summary>
    <p>{faq.answer}</p>
  </details>
{/each}
```

Important: Google requires that the FAQ content is visible on the page, not just in the structured data. Do not add FAQ schema for questions that are not actually answered on the page.

### Course Schema

For educational content and course platforms:

```typescript
// src/lib/schemas/course.ts
interface CourseData {
  title: string;
  description: string;
  slug: string;
  instructor: string;
  duration: string; // ISO 8601 duration format
  modules: Array<{ title: string; description: string }>;
  price?: number;
  currency?: string;
  rating?: { average: number; count: number };
}

export function createCourseSchema(course: CourseData) {
  const BASE_URL = 'https://mysite.com';

  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: course.title,
    description: course.description,
    url: `${BASE_URL}/courses/${course.slug}`,
    provider: {
      '@id': `${BASE_URL}/#organization`
    },
    instructor: {
      '@type': 'Person',
      name: course.instructor
    },
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: course.duration
    },
    syllabusSections: course.modules.map((mod, index) => ({
      '@type': 'Syllabus',
      position: index + 1,
      name: mod.title,
      description: mod.description
    }))
  };

  if (course.price !== undefined) {
    (schema.hasCourseInstance as Record<string, unknown>).offers = {
      '@type': 'Offer',
      price: course.price.toFixed(2),
      priceCurrency: course.currency || 'USD',
      availability: 'https://schema.org/InStock'
    };
  }

  if (course.rating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: course.rating.average.toFixed(1),
      bestRating: '5',
      ratingCount: course.rating.count
    };
  }

  return schema;
}
```

### HowTo Schema

For tutorial and guide pages. This produces step-by-step rich results:

```typescript
// src/lib/schemas/howto.ts
interface HowToStep {
  name: string;
  text: string;
  image?: string;
}

export function createHowToSchema(
  name: string,
  description: string,
  steps: HowToStep[],
  totalTime?: string // ISO 8601 duration, e.g., "PT30M"
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(totalTime && { totalTime }),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image && {
        image: {
          '@type': 'ImageObject',
          url: step.image
        }
      })
    }))
  };
}
```

## Generating Structured Data from Load Functions

The cleanest pattern is to generate structured data in your load functions and pass it to the page:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { createArticleSchema } from '$lib/schemas/article';
import { createBreadcrumbSchema } from '$lib/schemas/breadcrumb';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);

  if (!post) {
    throw error(404, 'Post not found');
  }

  return {
    post,
    schemas: {
      article: createArticleSchema({
        title: post.title,
        excerpt: post.excerpt,
        slug: post.slug,
        content: post.content,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        author: post.author,
        image: post.coverImage,
        tags: post.tags
      }),
      breadcrumbs: createBreadcrumbSchema([
        { name: 'Home', path: '/' },
        { name: 'Blog', path: '/blog' },
        { name: post.title, path: `/blog/${post.slug}` }
      ])
    }
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import JsonLd from '$lib/components/JsonLd.svelte';

  let { data } = $props();
</script>

<JsonLd schema={data.schemas.article} />
<JsonLd schema={data.schemas.breadcrumbs} />

<article>
  <h1>{data.post.title}</h1>
  {@html data.post.content}
</article>
```

This keeps the page component clean — it just renders schemas that were assembled server-side.

## Complete Blog Post Page with All Schemas

Here is a production example that combines multiple schemas:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import SEO from '$lib/components/SEO.svelte';
  import JsonLd from '$lib/components/JsonLd.svelte';
  import { createArticleSchema } from '$lib/schemas/article';
  import { createBreadcrumbSchema } from '$lib/schemas/breadcrumb';
  import { createFAQSchema } from '$lib/schemas/faq';

  let { data } = $props();

  const BASE_URL = 'https://mysite.com';

  const articleSchema = createArticleSchema({
    title: data.post.title,
    excerpt: data.post.excerpt,
    slug: data.post.slug,
    content: data.post.content,
    publishedAt: data.post.publishedAt,
    updatedAt: data.post.updatedAt,
    author: data.post.author,
    tags: data.post.tags
  });

  const breadcrumbSchema = createBreadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Blog', path: '/blog' },
    { name: data.post.title, path: `/blog/${data.post.slug}` }
  ]);

  // Only add FAQ schema if the post has FAQs
  const faqSchema = data.post.faqs?.length
    ? createFAQSchema(data.post.faqs)
    : null;
</script>

<!-- SEO meta tags -->
<SEO
  title={data.post.title}
  description={data.post.excerpt}
  image="{BASE_URL}/og/{data.post.slug}.png"
  type="article"
  publishedAt={data.post.publishedAt}
  updatedAt={data.post.updatedAt}
  author={data.post.author.name}
  tags={data.post.tags}
/>

<!-- Structured data -->
<JsonLd schema={articleSchema} />
<JsonLd schema={breadcrumbSchema} />
{#if faqSchema}
  <JsonLd schema={faqSchema} />
{/if}

<article>
  <header>
    <nav aria-label="Breadcrumb" class="breadcrumbs">
      <a href="/">Home</a>
      <span>/</span>
      <a href="/blog">Blog</a>
      <span>/</span>
      <span>{data.post.title}</span>
    </nav>

    <h1>{data.post.title}</h1>
    <p class="meta">
      By {data.post.author.name} · {new Date(data.post.publishedAt).toLocaleDateString()}
    </p>
  </header>

  <div class="content">
    {@html data.post.content}
  </div>

  {#if data.post.faqs?.length}
    <section class="faq">
      <h2>Frequently Asked Questions</h2>
      {#each data.post.faqs as faq}
        <details>
          <summary>{faq.question}</summary>
          <p>{faq.answer}</p>
        </details>
      {/each}
    </section>
  {/if}
</article>
```

## Testing and Validation

### Google's Rich Results Test

The most important validation tool. Visit [Rich Results Test](https://search.google.com/test/rich-results) and either enter your URL or paste your HTML. It shows:

- Which rich result types are detected
- Errors (mandatory fields missing)
- Warnings (optional fields missing)
- A preview of how the rich result would appear

### Schema Markup Validator

For detailed schema.org compliance: [Schema Markup Validator](https://validator.schema.org/). This catches issues that the Rich Results Test might not flag.

### Automated testing in CI

Validate your structured data as part of your test suite:

```typescript
// tests/structured-data.test.ts
import { describe, it, expect } from 'vitest';
import { createArticleSchema } from '$lib/schemas/article';
import { createProductSchema } from '$lib/schemas/product';

describe('Article Schema', () => {
  it('includes required fields', () => {
    const schema = createArticleSchema({
      title: 'Test Article',
      excerpt: 'A test article excerpt.',
      slug: 'test-article',
      content: '<p>Content here.</p>',
      publishedAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-20T14:30:00Z',
      author: { name: 'Jane Smith' }
    });

    expect(schema['@type']).toBe('Article');
    expect(schema.headline).toBe('Test Article');
    expect(schema.datePublished).toBe('2025-01-15T10:00:00Z');
    expect(schema.dateModified).toBe('2025-01-20T14:30:00Z');
    expect(schema.author).toEqual(
      expect.objectContaining({ '@type': 'Person', name: 'Jane Smith' })
    );
  });

  it('computes word count from content', () => {
    const schema = createArticleSchema({
      title: 'Test',
      excerpt: 'Test',
      slug: 'test',
      content: '<p>One two three four five.</p>',
      publishedAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
      author: { name: 'Jane' }
    });

    expect(schema.wordCount).toBe(5);
  });
});

describe('Product Schema', () => {
  it('includes price and availability', () => {
    const schema = createProductSchema({
      name: 'Test Product',
      description: 'A test product.',
      slug: 'test-product',
      image: ['https://example.com/product.jpg'],
      price: 29.99,
      currency: 'USD',
      availability: 'InStock',
      brand: 'Test Brand',
      sku: 'TEST-001'
    });

    expect(schema.offers).toEqual(
      expect.objectContaining({
        price: '29.99',
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock'
      })
    );
  });
});
```

### Monitoring in Google Search Console

After deploying structured data:

1. Go to [Google Search Console](https://search.google.com/search-console)
2. Navigate to "Enhancements" in the sidebar
3. Check each structured data type for errors and warnings
4. Google will notify you of new issues via email

The "Enhancements" section shows how many valid items Google found for each type and any pages with errors. Fix errors promptly — they prevent rich results from appearing.

## Common Mistakes and Edge Cases

```
Problem: Structured data does not match visible page content
Impact: Google may penalize or ignore your structured data
Fix:    Every fact in your schema must be verifiable on the page.
        Do not claim a 4.9 star rating in schema if the page shows 4.2.

Problem: FAQ schema for questions not on the page
Impact: Google will ignore the FAQ schema entirely
Fix:    Every question/answer pair must be visible on the page.

Problem: Missing required fields
Impact: Schema is invalid; no rich results
Fix:    Use Rich Results Test to check. For Article: headline,
        datePublished, author are required.

Problem: Dates not in ISO 8601 format
Impact: Google cannot parse the date
Fix:    Always use "2025-01-15T10:00:00Z" format, not "Jan 15, 2025".

Problem: Relative image URLs
Impact: Google cannot fetch the image
Fix:    Always use absolute URLs starting with https://

Problem: Product schema without offers
Impact: Google will not show price/availability in results
Fix:    Always include the offers property with price and availability.
```

## Try It

1. **Foundation exercise**: Create a `JsonLd.svelte` component and use it to add WebSite and Organization schemas to your home page. Validate using the Schema Markup Validator.

2. **Blog exercise**: Add Article and BreadcrumbList schemas to a blog post page. Generate the schema data in the load function and pass it to the page. Include author information, publish date, and word count. Test with Google's Rich Results Test.

3. **Product exercise**: Build a product page with Product schema including offers, brand, and aggregate rating. Make sure the structured data matches the visible content.

4. **FAQ exercise**: Add FAQ schema to a pricing or help page. Display the questions and answers visually on the page using `<details>`/`<summary>` elements. Validate that the structured data matches the visible content.

5. **Testing exercise**: Write Vitest tests for your schema factory functions. Verify required fields are present, dates are in ISO 8601 format, and URLs are absolute.

## Key Takeaways

- Structured data uses **JSON-LD** format embedded in `<script type="application/ld+json">` tags
- The **schema.org** vocabulary provides types like Article, Product, FAQ, BreadcrumbList, Course, and Organization
- Use `{@html}` in `<svelte:head>` to render the script tag — this is the one safe use case for `{@html}`
- Build **factory functions** for each schema type — they are easier to test and maintain than inline objects
- A page can have **multiple schemas** — Article + BreadcrumbList + FAQ is common for blog posts
- Generate schema data in **load functions** so it stays in sync with page content
- **Article** schema: headline, datePublished, author, publisher are required for rich results
- **Product** schema: offers (price, availability) are required for price display in results
- **FAQ** schema: questions must be visible on the page — do not add schema-only FAQs
- **BreadcrumbList** schema: replaces the raw URL in search results with a navigation trail
- Test with Google's **Rich Results Test** before deploying and monitor with **Search Console** after
- Always use absolute URLs, ISO 8601 dates, and ensure schema matches visible page content
