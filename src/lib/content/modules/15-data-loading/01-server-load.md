# Server Load Functions

So far, your pages have used hardcoded data defined directly in the component. Real applications load data from databases, APIs, and files. SvelteKit's **server load functions** let you fetch data on the server before the page renders, keeping sensitive logic (database queries, API keys) out of the browser.

Server load functions live in `+page.server.ts` files. They run exclusively on the server — the code never ships to the client. This is where you fetch data, read from databases, and access environment variables safely.

## Your First Server Load Function

Create a `+page.server.ts` file alongside your `+page.svelte`:

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  // This code runs ONLY on the server
  const posts = [
    { slug: 'first-post', title: 'My First Post', excerpt: 'Hello world!' },
    { slug: 'svelte-rocks', title: 'Svelte Rocks', excerpt: 'Why I love Svelte.' },
    { slug: 'css-tips', title: 'CSS Tips', excerpt: 'Useful CSS tricks.' }
  ];

  return {
    posts
  };
};
```

The `load` function returns an object. Whatever you return becomes available in the corresponding `+page.svelte` component.

## Using Data in +page.svelte

Access the loaded data through the `data` prop:

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Blog</h1>

<ul>
  {#each data.posts as post}
    <li>
      <a href="/blog/{post.slug}">
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
      </a>
    </li>
  {/each}
</ul>
```

SvelteKit automatically connects the data returned from `load` to the `data` prop in your page component. No manual wiring required.

## Server-Only Code

Because `+page.server.ts` runs only on the server, you can safely use:

- **Database queries** (Prisma, Drizzle, raw SQL)
- **API keys and secrets** from environment variables
- **File system access** (reading files from disk)
- **Server-only npm packages**

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';
import { PRIVATE_API_KEY } from '$env/static/private';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://api.example.com/posts', {
    headers: {
      Authorization: `Bearer ${PRIVATE_API_KEY}`
    }
  });

  const posts = await response.json();

  return {
    posts
  };
};
```

The `PRIVATE_API_KEY` is never sent to the browser. It exists only in the server load function.

## Accessing Route Parameters

Dynamic routes pass their parameters to the load function through the `params` object:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
  const { slug } = params;

  // In a real app, you would fetch this from a database
  const post = {
    slug,
    title: `Post: ${slug}`,
    content: `This is the content for ${slug}.`,
    publishedAt: '2025-01-15'
  };

  return {
    post
  };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<article>
  <h1>{data.post.title}</h1>
  <time>{data.post.publishedAt}</time>
  <div>{data.post.content}</div>
</article>
```

## Error Handling

If data loading fails, throw an error to show an error page:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    throw error(404, {
      message: 'Post not found'
    });
  }

  return { post };
};
```

## Try It

Create a blog index page at `/blog` with a `+page.server.ts` that returns an array of posts. Create a dynamic route at `/blog/[slug]` with its own server load function that returns a single post based on the slug parameter. Display the posts on each page and add error handling for missing posts.

## Key Takeaways

- `+page.server.ts` exports a `load` function that runs exclusively on the server
- Return an object from `load` — it becomes the `data` prop in `+page.svelte`
- Server load functions can safely use API keys, database queries, and private data
- Access dynamic route parameters through the `params` object
- Use `throw error(404)` from `@sveltejs/kit` for error handling
- The `$types` import provides automatic TypeScript types for your load functions
