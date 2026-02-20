# Fetch Basics

Modern web applications need to communicate with servers to get and send data. The **fetch API** is the built-in browser (and server) tool for making HTTP requests. Combined with **async/await**, it gives you a clean way to request data from URLs and handle the responses.

When you call `fetch()`, it returns a **Promise** — an object that represents a value that will arrive in the future. Since network requests take time, JavaScript does not block and wait. Instead, you use `await` to pause your function until the data arrives.

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

Two `await` calls happen here. The first waits for the server to respond. The second waits for the response body to be parsed from JSON text into a JavaScript object. The `.json()` method handles `JSON.parse()` internally.

## Understanding Promises

A Promise has three possible states:

- **Pending** — the request is still in flight
- **Fulfilled** — the request succeeded and data is available
- **Rejected** — something went wrong (network error, server down)

The `await` keyword unwraps a fulfilled promise into its value. If the promise is rejected, it throws an error.

## Handling Errors with try/catch

Network requests can fail for many reasons. Always wrap fetch calls in a `try/catch` block:

```typescript
async function getUser(id: number) {
  try {
    const response = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const user = await response.json();
    return user;
  } catch (error) {
    console.error('Failed to fetch user:', error);
    return null;
  }
}
```

Notice the `response.ok` check. Fetch only rejects on network failures — a 404 or 500 response still counts as a successful fetch. You must check the status yourself.

## Sending Data with POST Requests

Fetch can also send data to a server by specifying the method and body:

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

    const newPost = await response.json();
    return newPost;
  } catch (error) {
    console.error('Failed to create post:', error);
    return null;
  }
}
```

`JSON.stringify()` converts a JavaScript object into a JSON string for the request body. `JSON.parse()` does the reverse, but `.json()` on the response handles that for you.

## Try It

Write an async function called `fetchTodos` that fetches the first five todos from `https://jsonplaceholder.typicode.com/todos?_limit=5`. Use try/catch to handle errors. Check `response.ok` before parsing. Log each todo's `title` and `completed` status to the console.

## Key Takeaways

- `fetch()` makes HTTP requests and returns a Promise
- Use `await` to wait for a Promise to resolve, and always mark the function `async`
- Call `response.json()` to parse the response body as JSON
- Always check `response.ok` — fetch does not throw on 404 or 500 responses
- Wrap fetch calls in `try/catch` to handle network failures
- Use `JSON.stringify()` to send data and `response.json()` to receive it
