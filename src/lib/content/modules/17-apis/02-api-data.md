# Fetching API Data in SvelteKit

Now that you understand fetch and async/await, it is time to use them inside SvelteKit. The best place to fetch external data is inside **load functions** in `+page.server.ts`. This keeps API keys secret, avoids CORS issues, and ensures data is ready before the page renders.

SvelteKit provides its own enhanced `fetch` inside load functions. It handles cookies, relative URLs, and can deduplicate requests automatically.

## Fetching from a Public API

Here is a load function that fetches posts from a public API:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');
  const posts = await response.json();

  return {
    posts
  };
};
```

Use SvelteKit's `fetch` from the event object (not the global `fetch`) for server-side benefits like credential forwarding.

## Displaying the Data

Access the returned data through the `data` prop in your page component:

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Recent Posts</h1>

<ul>
  {#each data.posts as post}
    <li>
      <h2>{post.title}</h2>
      <p>{post.body}</p>
    </li>
  {/each}
</ul>
```

The data is available immediately when the page renders — no loading spinner needed for the initial load.

## Adding Loading and Error States

For client-side navigations and error handling, you should handle both states. Use SvelteKit's error helper for failures:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');

  if (!response.ok) {
    throw error(response.status, 'Failed to load posts');
  }

  const posts = await response.json();

  return {
    posts
  };
};
```

When you throw an error, SvelteKit displays your nearest `+error.svelte` page:

```svelte
<!-- src/routes/posts/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
</script>

<h1>Something went wrong</h1>
<p>{$page.error?.message}</p>
<a href="/">Go home</a>
```

## Fetching Multiple APIs

You can fetch from several APIs in parallel using `Promise.all`:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const [usersResponse, postsResponse] = await Promise.all([
    fetch('https://jsonplaceholder.typicode.com/users?_limit=5'),
    fetch('https://jsonplaceholder.typicode.com/posts?_limit=5')
  ]);

  const users = await usersResponse.json();
  const posts = await postsResponse.json();

  return { users, posts };
};
```

`Promise.all` runs both requests at the same time instead of one after the other, making your page load faster.

## Try It

Create a page at `/users` that fetches a list of users from `https://jsonplaceholder.typicode.com/users`. Display each user's name, email, and company name. Add error handling that throws a SvelteKit error if the response is not ok. Create an `+error.svelte` file to display a friendly error message.

## Key Takeaways

- Use `+page.server.ts` load functions to fetch API data on the server
- Destructure `fetch` from the load function's event object for SvelteKit's enhanced fetch
- Return data from the load function and access it via `$props()` in the page
- Throw `error()` from `@sveltejs/kit` to trigger error pages
- Use `Promise.all` to fetch from multiple APIs in parallel
- Server-side fetching avoids CORS issues and keeps API keys private
