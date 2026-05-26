# Server Load Functions

Every real application needs data. Pages display blog posts from a database, dashboards show metrics from an analytics API, and user profiles pull information from an auth provider. SvelteKit's **server load functions** are the mechanism that bridges your backend data sources with your frontend pages. They run exclusively on the server, which means they can safely access databases, read environment secrets, call internal APIs, and perform any operation that must never be exposed to a browser.

Server load functions live in `+page.server.ts` files. When a user navigates to a route, SvelteKit calls the corresponding load function on the server, waits for the returned data, renders the page to HTML (during SSR), and sends everything to the client. On subsequent client-side navigations, SvelteKit calls the load function via an internal fetch request — the function still runs on the server, but the response is serialized as JSON and sent to the browser.

Understanding this architecture is foundational. The load function is not just "where you fetch data." It is the security boundary between server and client, the performance bottleneck you must optimize, and the contract that defines what data your page receives.

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

The `load` function returns a plain object. Whatever you return becomes available in the corresponding `+page.svelte` component via the `data` prop. The return value must be serializable — you can return strings, numbers, booleans, arrays, plain objects, `Date` objects, and a few other types that SvelteKit knows how to serialize. You cannot return class instances, functions, or symbols.

The `PageServerLoad` type is auto-generated from the `$types` module. SvelteKit creates this type based on your route parameters, so `params.slug` is typed as `string` in a `[slug]` route without any manual type annotations.

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

SvelteKit automatically connects the data returned from `load` to the `data` prop. The `data` prop is fully typed — your editor knows that `data.posts` is an array with `slug`, `title`, and `excerpt` fields. No manual type annotations needed.

## The ServerLoadEvent Object

The load function receives a single argument: the `ServerLoadEvent`. This object is your gateway to everything about the incoming request. Understanding each property is essential for building production applications.

### params

Contains the dynamic segments from the route path. For a route defined as `src/routes/blog/[slug]/+page.server.ts`, `params.slug` holds the matched value:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  const post = await db.post.findUnique({
    where: { slug: params.slug }
  });

  if (!post) {
    throw error(404, { message: 'Post not found' });
  }

  return { post };
};
```

For routes with multiple dynamic segments like `[category]/[slug]`, both `params.category` and `params.slug` are available and typed.

### url

The full `URL` object for the request. Use it to read query parameters, the pathname, or the origin:

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Number(url.searchParams.get('limit')) || 10;
  const search = url.searchParams.get('q') ?? '';

  const offset = (page - 1) * limit;

  const { posts, total } = await fetchPosts({ offset, limit, search });

  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    },
    search
  };
};
```

This is the standard pattern for paginated lists. The page component can link to `?page=2` or `?q=svelte` and the load function picks up the values automatically. SvelteKit re-runs the load function when query parameters change.

### cookies

Read and write HTTP cookies. This is how you manage sessions, track preferences, and handle authentication tokens:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ cookies }) => {
  const sessionId = cookies.get('session_id');

  if (!sessionId) {
    throw redirect(303, '/login');
  }

  const user = await getUserBySession(sessionId);

  if (!user) {
    // Session expired or invalid — clear the cookie and redirect
    cookies.delete('session_id', { path: '/' });
    throw redirect(303, '/login');
  }

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  };
};
```

The `cookies` API uses `cookies.get(name)`, `cookies.set(name, value, options)`, and `cookies.delete(name, options)`. Always specify `path: '/'` when setting or deleting cookies so they apply to all routes.

### locals

An object that persists for the duration of a single request. It is typically populated in a `handle` hook inside `src/hooks.server.ts` and then read in load functions. This is the standard pattern for attaching authenticated user data to every request:

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get('session_id');

  if (sessionId) {
    const user = await db.user.findUnique({
      where: { sessionId }
    });
    event.locals.user = user;
  }

  return resolve(event);
};
```

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  const stats = await getDashboardStats(locals.user.id);

  return {
    user: locals.user,
    stats
  };
};
```

To type `locals`, declare the `App.Locals` interface in `src/app.d.ts`:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Locals {
      user: {
        id: string;
        name: string;
        email: string;
        role: 'admin' | 'user';
      } | null;
    }
  }
}

export {};
```

### fetch

A special version of the Fetch API that has several advantages over the global `fetch`:

- It can make relative requests on the server (like `fetch('/api/posts')`) that would fail with global fetch because there is no origin during SSR
- It carries the incoming request's cookies, so authenticated API calls work transparently
- It deduplicates identical requests made during the same render cycle

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  // This works during SSR — SvelteKit resolves the relative URL
  const response = await fetch('/api/posts');
  const posts = await response.json();

  return { posts };
};
```

### parent

Await data from parent layout load functions. Use this when a page needs data that a parent layout has already loaded:

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
  return {
    user: locals.user
  };
};
```

```typescript
// src/routes/settings/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
  const { user } = await parent();

  // Use the user data from the layout
  const preferences = await getUserPreferences(user.id);

  return { preferences };
};
```

**Warning about data waterfalls:** Calling `await parent()` creates a waterfall because the page load must wait for the layout load to finish before it can start its own work. Only call `parent()` when you actually need the parent's data to make your own queries. If you just need the parent data in the component template, it is already merged into `data` automatically — you do not need to fetch it again in the load function.

### depends

Register custom dependency identifiers so you can programmatically invalidate and re-run the load function from the client:

```typescript
// src/routes/notifications/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ depends, locals }) => {
  // Register a custom dependency
  depends('app:notifications');

  const notifications = await getNotifications(locals.user.id);

  return { notifications };
};
```

```svelte
<!-- src/routes/notifications/+page.svelte -->
<script lang="ts">
  import { invalidate } from '$app/navigation';

  let { data } = $props();

  // Re-fetch notifications every 30 seconds
  $effect(() => {
    const interval = setInterval(() => {
      invalidate('app:notifications');
    }, 30000);

    return () => clearInterval(interval);
  });
</script>

<h1>Notifications ({data.notifications.length})</h1>

{#each data.notifications as notification}
  <div class="notification">
    <p>{notification.message}</p>
    <time>{notification.createdAt}</time>
  </div>
{/each}

<button onclick={() => invalidate('app:notifications')}>
  Refresh
</button>
```

When `invalidate('app:notifications')` is called, SvelteKit re-runs every load function that called `depends('app:notifications')`. The page updates reactively with the fresh data.

You can also use `invalidateAll()` to re-run every load function for the current page, or `invalidate(url)` to re-run load functions that fetched from a specific URL (SvelteKit tracks URL dependencies automatically when you use the provided `fetch`).

## Error Handling

SvelteKit provides two helper functions for controlling the response from a load function: `error()` and `redirect()`.

### Throwing Errors

Use `error()` from `@sveltejs/kit` to show an error page. The first argument is the HTTP status code, and the second is either a string or an object with a `message` property:

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  const post = await db.post.findUnique({
    where: { slug: params.slug, published: true }
  });

  if (!post) {
    throw error(404, {
      message: 'Post not found'
    });
  }

  // Check authorization
  if (post.visibility === 'private') {
    throw error(403, {
      message: 'You do not have permission to view this post'
    });
  }

  return { post };
};
```

SvelteKit catches the thrown error and renders the nearest `+error.svelte` component. You can customize error pages at any level of the route hierarchy:

```svelte
<!-- src/routes/blog/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<div class="error-page">
  <h1>{page.status}</h1>
  <p>{page.error?.message}</p>
  <a href="/blog">Back to blog</a>
</div>
```

### Unexpected Errors

If your load function throws a non-SvelteKit error (like a database connection failure), SvelteKit catches it, logs the details on the server, and sends a generic 500 response to the client. The real error message is never leaked to the browser — this is a security feature. You see the full error in your server logs.

```typescript
export const load: PageServerLoad = async () => {
  try {
    const data = await riskyDatabaseQuery();
    return { data };
  } catch (err) {
    // Log the real error for debugging
    console.error('Database query failed:', err);

    // Throw a user-friendly error
    throw error(500, {
      message: 'Unable to load data. Please try again later.'
    });
  }
};
```

### Redirects

Use `redirect()` to send the user to a different URL. Always use HTTP status code 303 for redirects after form submissions, and 307 or 308 for other cases:

```typescript
import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    // Preserve the intended destination so you can redirect back after login
    const returnTo = encodeURIComponent(url.pathname);
    throw redirect(303, `/login?returnTo=${returnTo}`);
  }

  return { user: locals.user };
};
```

## Avoiding Data Waterfalls

A data waterfall happens when requests execute sequentially instead of in parallel. This is one of the most common performance problems in server-rendered applications:

```typescript
// BAD: Sequential requests — each waits for the previous one
export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);        // 200ms
  const author = await getUser(post.authorId);     // 150ms
  const comments = await getComments(post.id);     // 180ms
  // Total: 530ms (200 + 150 + 180)

  return { post, author, comments };
};
```

```typescript
// GOOD: Parallel requests with Promise.all
export const load: PageServerLoad = async ({ params }) => {
  const post = await getPost(params.slug);         // 200ms

  // These two can run in parallel since they both depend on post
  const [author, comments] = await Promise.all([
    getUser(post.authorId),                         // 150ms
    getComments(post.id)                            // 180ms
  ]);
  // Total: 380ms (200 + max(150, 180))

  return { post, author, comments };
};
```

```typescript
// BEST: When requests are independent, parallelize everything
export const load: PageServerLoad = async ({ params, locals }) => {
  const [post, recentPosts, userPrefs] = await Promise.all([
    getPost(params.slug),
    getRecentPosts(5),
    getUserPreferences(locals.user?.id)
  ]);
  // Total: max(all three) instead of sum(all three)

  return { post, recentPosts, userPrefs };
};
```

The same principle applies across layout and page boundaries. SvelteKit runs layout and page load functions in parallel by default. But if your page load calls `await parent()`, it creates a waterfall because it must wait for the layout load to finish.

## Streaming with Promises

For data that takes a long time to load, you can return a promise instead of an awaited value. SvelteKit streams the initial page HTML immediately and sends the resolved data later:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
  // Critical data — await it so it is included in the initial HTML
  const user = await getUser(locals.user.id);

  // Non-critical data — return as a promise to stream later
  return {
    user,
    // These promises are NOT awaited — the page renders without them
    recommendations: getRecommendations(user.id),
    activityFeed: getActivityFeed(user.id)
  };
};
```

In the page component, use `{#await}` blocks to handle the streamed promises:

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Welcome, {data.user.name}</h1>

<!-- This renders immediately because user was awaited -->
<div class="profile-card">
  <p>{data.user.email}</p>
</div>

<!-- This streams in when the promise resolves -->
{#await data.recommendations}
  <div class="skeleton-loader">Loading recommendations...</div>
{:then recommendations}
  <section>
    <h2>Recommended for You</h2>
    {#each recommendations as item}
      <div class="recommendation">{item.title}</div>
    {/each}
  </section>
{:catch error}
  <p>Failed to load recommendations.</p>
{/await}

{#await data.activityFeed}
  <div class="skeleton-loader">Loading activity...</div>
{:then feed}
  <section>
    <h2>Recent Activity</h2>
    {#each feed as activity}
      <p>{activity.description} — {activity.timestamp}</p>
    {/each}
  </section>
{:catch}
  <p>Failed to load activity feed.</p>
{/await}
```

This pattern is powerful for dashboards and detail pages where some data is critical (must be in the initial HTML for SEO or user experience) and other data is supplementary (can load progressively).

**Important:** Streamed promises are only supported during SSR. On client-side navigations, SvelteKit awaits all data before updating the page. If you need client-side streaming, you would implement that manually with `$effect` and fetch calls.

## Layout Load Functions

Layout load functions work identically to page load functions but live in `+layout.server.ts` files. Their data is available to the layout component and all child pages:

```typescript
// src/routes/admin/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ locals }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  if (locals.user.role !== 'admin') {
    throw redirect(303, '/');
  }

  return {
    user: locals.user,
    adminNav: [
      { label: 'Dashboard', href: '/admin' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Posts', href: '/admin/posts' },
      { label: 'Settings', href: '/admin/settings' }
    ]
  };
};
```

All pages under `/admin/` now have access to `data.user` and `data.adminNav` without each page needing to load that data individually. And the authorization check runs once in the layout, protecting all child routes.

## Load Function Caching Behavior

SvelteKit is smart about when it re-runs load functions during client-side navigation:

1. **Layout load functions** only re-run when their parameters or dependencies change. Navigating between `/blog/post-1` and `/blog/post-2` does not re-run the `/blog/+layout.server.ts` load if it does not use `params`.

2. **Page load functions** re-run on every navigation to that page.

3. **URL dependency tracking:** If your load function uses `url.searchParams`, SvelteKit re-runs it when query parameters change. If it does not read `url`, changes to query parameters do not trigger a re-run.

4. **Custom dependencies** registered with `depends()` only trigger re-runs when you call `invalidate()` with the matching key.

This means you should be deliberate about what you read from the event object. Only access `url.searchParams` if you actually use query parameters, because accessing it registers a dependency.

## Complete Example: Blog with Posts and Detail Pages

Here is a full blog implementation demonstrating all the concepts covered in this lesson:

```typescript
// src/lib/server/database.ts
// Simulated database — replace with Prisma, Drizzle, or any ORM
interface Post {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author: string;
  publishedAt: string;
  tags: string[];
}

const posts: Post[] = [
  {
    slug: 'getting-started-with-svelte',
    title: 'Getting Started with Svelte 5',
    excerpt: 'Learn the fundamentals of Svelte 5 and its new runes system.',
    content: 'Full article content here...',
    author: 'Jane Doe',
    publishedAt: '2025-03-15',
    tags: ['svelte', 'tutorial']
  },
  {
    slug: 'sveltekit-data-loading',
    title: 'Mastering SvelteKit Data Loading',
    excerpt: 'Deep dive into server and universal load functions.',
    content: 'Full article content here...',
    author: 'John Smith',
    publishedAt: '2025-04-02',
    tags: ['sveltekit', 'data']
  }
];

export async function getAllPosts(options?: {
  tag?: string;
  page?: number;
  limit?: number;
}) {
  let filtered = posts;

  if (options?.tag) {
    filtered = filtered.filter(p => p.tags.includes(options.tag!));
  }

  const page = options?.page ?? 1;
  const limit = options?.limit ?? 10;
  const start = (page - 1) * limit;

  return {
    posts: filtered.slice(start, start + limit),
    total: filtered.length
  };
}

export async function getPostBySlug(slug: string): Promise<Post | null> {
  return posts.find(p => p.slug === slug) ?? null;
}
```

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';
import { getAllPosts } from '$lib/server/database';

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const tag = url.searchParams.get('tag') ?? undefined;

  const { posts, total } = await getAllPosts({ page, limit: 10, tag });

  return {
    posts,
    pagination: {
      page,
      total,
      totalPages: Math.ceil(total / 10)
    },
    activeTag: tag ?? null
  };
};
```

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>Blog{data.activeTag ? ` — #${data.activeTag}` : ''}</title>
  <meta name="description" content="Read our latest articles about web development." />
</svelte:head>

<h1>Blog</h1>

{#if data.activeTag}
  <p>
    Showing posts tagged <strong>#{data.activeTag}</strong>.
    <a href="/blog">Show all</a>
  </p>
{/if}

<ul>
  {#each data.posts as post}
    <li>
      <a href="/blog/{post.slug}">
        <h2>{post.title}</h2>
        <p>{post.excerpt}</p>
        <div class="meta">
          <span>{post.author}</span>
          <time>{post.publishedAt}</time>
        </div>
        <div class="tags">
          {#each post.tags as tag}
            <a href="/blog?tag={tag}" class="tag">#{tag}</a>
          {/each}
        </div>
      </a>
    </li>
  {/each}
</ul>

{#if data.pagination.totalPages > 1}
  <nav class="pagination">
    {#if data.pagination.page > 1}
      <a href="/blog?page={data.pagination.page - 1}">Previous</a>
    {/if}
    <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
    {#if data.pagination.page < data.pagination.totalPages}
      <a href="/blog?page={data.pagination.page + 1}">Next</a>
    {/if}
  </nav>
{/if}
```

```typescript
// src/routes/blog/[slug]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { getPostBySlug } from '$lib/server/database';

export const load: PageServerLoad = async ({ params }) => {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    throw error(404, {
      message: `Post "${params.slug}" not found`
    });
  }

  return { post };
};
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} — Blog</title>
  <meta name="description" content={data.post.excerpt} />
  <meta property="og:title" content={data.post.title} />
  <meta property="og:description" content={data.post.excerpt} />
  <meta property="og:type" content="article" />
</svelte:head>

<article>
  <header>
    <h1>{data.post.title}</h1>
    <div class="meta">
      <span>By {data.post.author}</span>
      <time datetime={data.post.publishedAt}>{data.post.publishedAt}</time>
    </div>
    <div class="tags">
      {#each data.post.tags as tag}
        <a href="/blog?tag={tag}" class="tag">#{tag}</a>
      {/each}
    </div>
  </header>

  <div class="content">
    {data.post.content}
  </div>
</article>

<nav>
  <a href="/blog">Back to all posts</a>
</nav>
```

## Server-Only Code Guarantees

Because `+page.server.ts` runs only on the server, you can safely use:

- **Database queries** — Prisma, Drizzle, raw SQL, any ORM
- **Private environment variables** — `import { PRIVATE_API_KEY } from '$env/static/private'`
- **File system access** — `import { readFile } from 'fs/promises'`
- **Server-only npm packages** — packages that use Node.js APIs
- **Internal service calls** — gRPC, message queues, internal REST APIs

```typescript
// src/routes/analytics/+page.server.ts
import type { PageServerLoad } from './$types';
import { ANALYTICS_API_KEY } from '$env/static/private';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (!locals.user) {
    throw redirect(303, '/login');
  }

  const [dbMetrics, apiMetrics] = await Promise.all([
    // Direct database query
    db.query(`
      SELECT COUNT(*) as views, DATE(created_at) as date
      FROM page_views
      WHERE user_id = $1
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `, [locals.user.id]),

    // Private API call
    fetch('https://analytics.internal.example.com/metrics', {
      headers: { 'X-API-Key': ANALYTICS_API_KEY }
    }).then(r => r.json())
  ]);

  return { dbMetrics, apiMetrics };
};
```

None of this code — the database query, the API key, or the internal API URL — is ever sent to the browser. The client only receives the serialized return value.

## Try It

### Exercise 1: Blog Index with Pagination
Create a blog index page at `/blog` with a `+page.server.ts` that returns an array of posts. Support pagination through `?page=1` query parameters and filtering through `?tag=svelte`. Display the posts with links to individual post pages.

### Exercise 2: Individual Post Page
Create a dynamic route at `/blog/[slug]` with its own server load function that returns a single post based on the slug parameter. Handle the case where the post does not exist by throwing a 404 error. Add SEO meta tags using `<svelte:head>`.

### Exercise 3: Dashboard with Streaming
Create a `/dashboard` page that awaits critical user data immediately but streams non-critical data (recommendations, activity feed) using un-awaited promises. Use `{#await}` blocks to show loading states for the streamed data.

### Exercise 4: Reactive Invalidation
Add a notifications section to your dashboard that uses `depends('app:notifications')` and a button that calls `invalidate('app:notifications')` to refresh the data. Add an auto-refresh with `setInterval` that invalidates every 30 seconds.

## Key Takeaways

- `+page.server.ts` exports a `load` function that runs exclusively on the server — the code never ships to the client
- Return a serializable object from `load` — it becomes the `data` prop in `+page.svelte`
- The `ServerLoadEvent` gives you access to `params`, `url`, `cookies`, `locals`, `fetch`, `parent`, and `depends`
- Use `throw error(status, message)` for error responses and `throw redirect(status, url)` for redirects
- Avoid data waterfalls by using `Promise.all()` for independent requests
- Stream non-critical data by returning un-awaited promises — the page renders immediately and data fills in progressively
- Use `depends()` and `invalidate()` to create reactive data that can be refreshed from the client
- Layout load functions in `+layout.server.ts` share data with all child pages and are ideal for auth checks
- The `$types` import provides automatic TypeScript types based on your route parameters — embrace it
- Only call `await parent()` when you genuinely need parent data for your queries — otherwise it creates an unnecessary waterfall
