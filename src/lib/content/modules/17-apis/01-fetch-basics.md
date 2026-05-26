# Fetch Basics

The `fetch` API is how JavaScript talks to servers. Before we dive into SvelteKit-specific patterns, it is important to understand that `fetch` is a **web standard** — not a framework feature. It works the same way in browsers, Node.js, Deno, Cloudflare Workers, and SvelteKit. When you learn `fetch`, you are learning a skill that transfers everywhere.

This matters more than you might think. Frameworks come and go. Libraries fall out of fashion. But `fetch` is part of the platform. It is defined by the WHATWG specification, implemented by every modern runtime, and it will be here long after today's frameworks are forgotten. Investing in understanding `fetch` deeply pays dividends across your entire career.

## The Request/Response Mental Model

HTTP works on a simple mental model: **you send a request, you get back a response**.

A request has two essential pieces:
- **URL** — identifies which resource you want. Think of it as an address: `https://api.example.com/users/42` says "I want user 42 from example.com's API."
- **Method** — indicates your intent. The four most common methods map to CRUD operations:

| Method   | Intent              | Example                          |
|----------|---------------------|----------------------------------|
| `GET`    | Read data           | Fetch a user's profile           |
| `POST`   | Create something    | Submit a new blog post           |
| `PUT`    | Replace/update      | Update a user's email address    |
| `DELETE` | Remove something    | Delete a comment                 |

When you call `fetch(url)` without specifying a method, it defaults to `GET`. That is by far the most common operation — most of the time you are reading data, not writing it.

## Making Your First Fetch Request

The simplest fetch call takes a URL and returns a `Response` object:

```typescript
async function getPost() {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');
  const data = await response.json();
  console.log(data);
}

getPost();
```

Two `await` calls happen here, and it is worth understanding why. The first `await` pauses until the server sends back the **response headers** — the status code, content type, and other metadata. At this point the response body (the actual data) may still be streaming over the network. The second `await` on `response.json()` waits for the entire body to arrive and parses it from a JSON string into a JavaScript object.

This two-step design is intentional. It lets you inspect the response headers (is it a 200? a 404?) *before* you spend time and memory parsing the body. For large responses, this distinction matters.

## The Response Object

`fetch` always resolves to a `Response` object (unless a network error occurs). The Response gives you several useful properties:

```typescript
const response = await fetch('https://jsonplaceholder.typicode.com/posts/1');

console.log(response.status);     // 200
console.log(response.ok);         // true (status is 200-299)
console.log(response.statusText); // "OK"
console.log(response.headers.get('content-type')); // "application/json; charset=utf-8"
```

The `ok` property is a convenience — it is `true` when the status code is in the 200-299 range. You should **always** check this before parsing the body.

### Parsing the Body

The Response offers different methods depending on the format you expect:

```typescript
// For JSON APIs (most common)
const data = await response.json();

// For plain text, HTML, CSV, etc.
const text = await response.text();

// For binary data like images or files
const blob = await response.blob();
```

Each of these returns a Promise, and you can only call one of them — the body stream can only be consumed once. If you need to read the body twice (rare), clone the response first with `response.clone()`.

## Two Kinds of Errors

This is a critical distinction that trips up many developers: **`fetch` has two completely different failure modes**, and you need to handle both.

**Network errors** happen when the request never reaches the server — the user is offline, DNS fails, the server is down, or a CORS preflight is rejected. These cause `fetch` to reject its promise, which means `await` will throw. You catch these with `try/catch`.

**HTTP errors** happen when the request reaches the server but something goes wrong on its end — a `404 Not Found`, `401 Unauthorized`, or `500 Internal Server Error`. Here is the counterintuitive part: `fetch` considers these **successful** requests. The promise resolves normally. You get a Response object back. You have to check `response.ok` yourself.

```typescript
async function getUser(id: number) {
  try {
    // This try/catch handles NETWORK errors (offline, DNS failure, etc.)
    const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);

    // This check handles HTTP errors (404, 500, etc.)
    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const user = await response.json();
    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}
```

If you forget the `response.ok` check, your code will happily try to parse a 404 error page as JSON and produce a confusing runtime error instead of a clear "not found" message.

## Headers: Telling the Server What You Need

HTTP headers are metadata attached to requests and responses. Two headers come up constantly in API work:

**`Content-Type`** tells the server what format your request body is in. When you send JSON, you must set this or many servers will reject the request:

```typescript
headers: {
  'Content-Type': 'application/json'
}
```

**`Authorization`** sends credentials — typically a bearer token for authenticated APIs:

```typescript
headers: {
  'Authorization': `Bearer ${token}`
}
```

For simple GET requests, you often do not need any custom headers. But the moment you send data or access protected resources, headers become essential.

## Sending Data with POST Requests

Fetch can send data to a server by specifying the method, headers, and body:

```typescript
async function createPost(title: string, body: string) {
  try {
    const response = await fetch('https://jsonplaceholder.typicode.com/posts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ title, body, userId: 1 })
    });

    if (!response.ok) {
      throw new Error(`Failed to create post: ${response.status}`);
    }

    const newPost = await response.json();
    return newPost;
  } catch (error) {
    console.error('Failed to create post:', error);
    return null;
  }
}
```

Notice that `body` must be a string — `JSON.stringify()` converts your JavaScript object into JSON text. The `Content-Type: application/json` header tells the server how to interpret that string. These two always go together. Forgetting the header is a common source of "why is the server ignoring my data?" bugs.

## Fetch in SvelteKit: Two Contexts

In SvelteKit, you will use `fetch` in two different contexts, and they behave slightly differently.

**In components** (client-side), `fetch` is the standard browser `fetch`. You use it for user-triggered actions like form submissions, search-as-you-type, or loading more data on scroll.

**In load functions** (`+page.server.ts`), SvelteKit provides an augmented `fetch` through the event object. This enhanced version does several things the standard `fetch` cannot:

```typescript
// src/routes/posts/+page.server.ts
export const load = async ({ fetch }) => {
  // This fetch is special — it:
  // 1. Forwards cookies from the browser (for authentication)
  // 2. Resolves relative URLs against the app's origin
  // 3. Can call your own API routes without a network round-trip
  const response = await fetch('/api/posts');
  const posts = await response.json();
  return { posts };
};
```

Always destructure `fetch` from the load function's parameter object. If you use the global `fetch` instead, you lose cookie forwarding and the relative URL resolution — and your authenticated API calls will mysteriously fail.

## Real Example: Fetching and Displaying Data

Here is a complete example that fetches data from a public API and handles all the edge cases:

```typescript
// src/routes/posts/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('https://jsonplaceholder.typicode.com/posts?_limit=5');

  if (!response.ok) {
    throw error(response.status, 'Could not load posts from the API');
  }

  const posts: { id: number; title: string; body: string }[] = await response.json();

  return { posts };
};
```

```svelte
<!-- src/routes/posts/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<h1>Recent Posts</h1>

{#each data.posts as post (post.id)}
  <article>
    <h2>{post.title}</h2>
    <p>{post.body}</p>
  </article>
{/each}
```

Note the `(post.id)` key in the `#each` block. When Svelte re-renders the list (say, after a client-side navigation), it uses the key to match old DOM elements with new data instead of recreating everything. This is a performance detail, but it is the kind of thing that separates careless code from solid code.

## Try It

Write an async function called `fetchTodos` that fetches the first five todos from `https://jsonplaceholder.typicode.com/todos?_limit=5`. Use `try/catch` to handle network errors. Check `response.ok` before parsing. If the response is not OK, throw an error with the status code. If the fetch succeeds, log each todo's `title` and whether it is `completed`. Then wrap this in a SvelteKit load function that returns the todos as page data.

## Key Takeaways

- `fetch` is a web standard — it works in browsers, Node.js, and SvelteKit with the same core API
- URLs identify resources, HTTP methods indicate intent: GET reads, POST creates, PUT updates, DELETE removes
- `await fetch(url)` returns a Response object — always check `response.ok` before parsing the body
- `response.json()` and `response.text()` both return promises — the body is parsed asynchronously
- Network errors (try/catch) and HTTP errors (status codes) are different failure modes — handle both
- `Content-Type` and `Authorization` are the headers you will use most often
- In SvelteKit load functions, use the provided `fetch` from the event object — it forwards cookies and resolves relative URLs
- `JSON.stringify()` converts objects to JSON strings for request bodies; `response.json()` parses JSON response bodies back into objects
