# Fetching API Data in SvelteKit

Now that you understand fetch and async/await, it is time to use them inside SvelteKit. But SvelteKit gives you something most frameworks do not: it lets you build **both sides** of the API conversation. You can fetch data from external APIs, and you can create your own API endpoints that your frontend (or external consumers) can call.

This lesson covers two powerful patterns: using `+page.server.ts` load functions to feed data into pages, and using `+server.ts` files to build standalone API endpoints. Understanding when to use each — and why — is a key architectural decision in every SvelteKit application.

## Load Functions: The Preferred Pattern for Page Data

The best place to fetch data for a page is inside a **load function** in `+page.server.ts`. This runs on the server before the page renders, which means:

- API keys and secrets never reach the browser
- You avoid CORS issues entirely (server-to-server requests are not subject to browser CORS policies)
- The page arrives with data already populated — no loading spinner on first paint
- Search engines see fully rendered content

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=10');

  if (!response.ok) {
    error(response.status, 'Failed to load posts');
  }

  const posts = await response.json();
  return { posts };
};
```

Notice that you destructure `fetch` from the event object — this is SvelteKit's enhanced version. It automatically forwards cookies from the user's browser (critical for authentication), resolves relative URLs against your app's origin, and can even short-circuit calls to your own API endpoints without an actual network request.

## Displaying Load Function Data

The data returned from your load function flows into the page component through `$props()`:

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Recent Posts</h1>

<ul>
  {#each data.posts as post (post.id)}
    <li>
      <h2>{post.title}</h2>
      <p>{post.body}</p>
    </li>
  {/each}
</ul>
```

The data is available immediately when the page renders. On the initial server-side render, the load function runs on the server. On client-side navigations (clicking a link), SvelteKit calls the load function and streams the data to the client. Either way, your component code is the same.

## Fetching Multiple APIs in Parallel

When a page needs data from several sources, run the requests concurrently with `Promise.all`. Sequential requests are one of the most common performance mistakes in web development:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  // BAD: sequential — total time is request1 + request2
  // const users = await (await fetch('/api/users')).json();
  // const posts = await (await fetch('/api/posts')).json();

  // GOOD: parallel — total time is max(request1, request2)
  const [usersRes, postsRes] = await Promise.all([
    fetch('https://jsonplaceholder.typicode.com/users?_limit=5'),
    fetch('https://jsonplaceholder.typicode.com/posts?_limit=5')
  ]);

  if (!usersRes.ok || !postsRes.ok) {
    error(500, 'Failed to load dashboard data');
  }

  const [users, posts] = await Promise.all([
    usersRes.json(),
    postsRes.json()
  ]);

  return { users, posts };
};
```

If you have two API calls that each take 200ms, running them sequentially takes 400ms. Running them in parallel takes 200ms. For a dashboard with five data sources, the difference can be over a second — that is the difference between a fast app and a sluggish one.

## API Endpoints with +server.ts

While load functions feed data into pages, sometimes you need a standalone API endpoint. Maybe your frontend needs to submit data via a button click. Maybe you are building an API that a mobile app or third-party service will consume. That is what `+server.ts` files are for.

A `+server.ts` file exports functions named after HTTP methods. Each function receives a `RequestEvent` and must return a `Response`:

```typescript
// src/routes/api/todos/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// In-memory store for this example (use a database in production)
let todos = [
  { id: 1, title: 'Learn SvelteKit', completed: false },
  { id: 2, title: 'Build an app', completed: false }
];
let nextId = 3;

// GET /api/todos — return all todos
export const GET: RequestHandler = async () => {
  return json(todos);
};
```

The `json()` helper from `@sveltejs/kit` creates a proper `Response` with the `Content-Type: application/json` header already set. You could build the response manually with `new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })`, but `json()` saves you from that boilerplate.

## Building a Complete CRUD API

Here is a full CRUD API for a todo list, demonstrating all four HTTP methods with proper input validation and error handling:

```typescript
// src/routes/api/todos/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

let todos = [
  { id: 1, title: 'Learn SvelteKit', completed: false },
  { id: 2, title: 'Build an app', completed: false }
];
let nextId = 3;

// GET /api/todos
export const GET: RequestHandler = async () => {
  return json(todos);
};

// POST /api/todos — create a new todo
export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  // Never trust client data — validate everything
  if (!body.title || typeof body.title !== 'string') {
    error(400, 'Title is required and must be a string');
  }

  if (body.title.trim().length === 0) {
    error(400, 'Title cannot be empty');
  }

  const todo = {
    id: nextId++,
    title: body.title.trim(),
    completed: false
  };

  todos.push(todo);

  // 201 means "Created" — semantically correct for resource creation
  return json(todo, { status: 201 });
};
```

```typescript
// src/routes/api/todos/[id]/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// PUT /api/todos/:id — update a todo
export const PUT: RequestHandler = async ({ params, request }) => {
  const id = Number(params.id);
  const todoIndex = todos.findIndex((t) => t.id === id);

  if (todoIndex === -1) {
    error(404, `Todo with id ${id} not found`);
  }

  const body = await request.json();

  // Validate the fields the client is allowed to update
  if (body.title !== undefined && typeof body.title !== 'string') {
    error(400, 'Title must be a string');
  }
  if (body.completed !== undefined && typeof body.completed !== 'boolean') {
    error(400, 'Completed must be a boolean');
  }

  todos[todoIndex] = {
    ...todos[todoIndex],
    ...(body.title !== undefined && { title: body.title.trim() }),
    ...(body.completed !== undefined && { completed: body.completed })
  };

  return json(todos[todoIndex]);
};

// DELETE /api/todos/:id — delete a todo
export const DELETE: RequestHandler = async ({ params }) => {
  const id = Number(params.id);
  const todoIndex = todos.findIndex((t) => t.id === id);

  if (todoIndex === -1) {
    error(404, `Todo with id ${id} not found`);
  }

  todos.splice(todoIndex, 1);

  // 204 means "No Content" — the deletion succeeded, nothing to return
  return new Response(null, { status: 204 });
};
```

A few things to notice here:

**Input validation is non-negotiable.** The client could be a malicious user with curl, not your nice UI. Check that required fields exist, have the right type, and meet your business rules. Validate on the server even if you also validate on the client.

**Status codes communicate meaning.** `200` means success. `201` means a resource was created. `204` means success with no body. `400` means the client sent bad data. `404` means the resource does not exist. Using the right status code is not pedantry — it helps clients handle responses correctly and makes debugging easier.

**The `error()` helper throws an error response.** It sets the status code and creates a JSON body with an error message. SvelteKit catches it and returns a proper error response.

## When to Use +server.ts vs +page.server.ts

This is an architectural decision that confuses many developers. Here is the rule:

**Use `+page.server.ts`** when the data is for rendering a page. The load function runs before the page component mounts, and the data flows directly into `$props()`. This is the default choice for page data.

**Use `+server.ts`** when you need a standalone API endpoint — for client-side fetch calls triggered by user actions (like a "Save" button), for endpoints consumed by external clients (a mobile app, a webhook), or for operations that do not map to a page (file uploads, search suggestions).

```
Page loads → +page.server.ts (load function)
User actions → +server.ts (API endpoint)
External consumers → +server.ts (API endpoint)
```

In practice, a typical SvelteKit app has many `+page.server.ts` files and a few `+server.ts` files. If you find yourself creating API endpoints just so your load function can fetch from them, stop — put the logic directly in the load function instead.

## Calling Your API from a Component

Here is how the component side looks when calling an API endpoint:

```svelte
<!-- src/routes/todos/+page.svelte -->
<script lang="ts">
  let { data } = $props();
  let newTitle = $state('');
  let todos = $state(data.todos);

  async function addTodo() {
    if (!newTitle.trim()) return;

    const response = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle })
    });

    if (response.ok) {
      const todo = await response.json();
      todos.push(todo);
      newTitle = '';
    }
  }

  async function deleteTodo(id: number) {
    const response = await fetch(`/api/todos/${id}`, {
      method: 'DELETE'
    });

    if (response.ok) {
      todos = todos.filter((t) => t.id !== id);
    }
  }
</script>

<h1>My Todos</h1>

<form onsubmit={(e) => { e.preventDefault(); addTodo(); }}>
  <input bind:value={newTitle} placeholder="What needs doing?" />
  <button type="submit">Add</button>
</form>

<ul>
  {#each todos as todo (todo.id)}
    <li>
      <span>{todo.title}</span>
      <button onclick={() => deleteTodo(todo.id)}>Delete</button>
    </li>
  {/each}
</ul>
```

## Error Handling in Load Functions

When something goes wrong in a load function, use the `error()` helper to trigger SvelteKit's error page:

```typescript
// src/routes/posts/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, fetch }) => {
  const response = await fetch(`https://jsonplaceholder.typicode.com/posts/${params.id}`);

  if (response.status === 404) {
    error(404, 'Post not found');
  }

  if (!response.ok) {
    error(500, 'Something went wrong loading this post');
  }

  const post = await response.json();
  return { post };
};
```

SvelteKit renders the nearest `+error.svelte` component in the route hierarchy:

```svelte
<!-- src/routes/posts/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>{page.status}: {page.error?.message}</h1>
<a href="/">Back to home</a>
```

## Try It

Build a `/users` page. Create a `+page.server.ts` load function that fetches users from `https://jsonplaceholder.typicode.com/users`. Display each user's name, email, and company name. Add error handling with the `error()` helper. Then create a `/api/todos` endpoint with `+server.ts` that supports GET (list all) and POST (create new). Validate that the POST body includes a non-empty `title`. Return proper status codes: `200` for the list, `201` for creation, `400` for invalid input.

## Key Takeaways

- Use `+page.server.ts` load functions for page data — it runs on the server, keeps secrets safe, and avoids CORS issues
- Destructure `fetch` from the load function event — SvelteKit's fetch forwards cookies and resolves relative URLs
- `+server.ts` files create standalone API endpoints — export `GET`, `POST`, `PUT`, `DELETE` handler functions
- Each handler receives a `RequestEvent` and must return a `Response` — use the `json()` helper for JSON responses
- Always validate input on the server — never trust data from the client
- Use semantic HTTP status codes: `200` (success), `201` (created), `204` (no content), `400` (bad request), `404` (not found)
- Use `+page.server.ts` for page data, `+server.ts` for user-triggered actions and external APIs
- Use `Promise.all` to fetch from multiple sources in parallel — sequential requests are a common performance mistake
- The `error()` helper from `@sveltejs/kit` triggers the nearest `+error.svelte` page
