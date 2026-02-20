# Server Routes

SvelteKit is not just a frontend framework — it is a full-stack platform. Beyond rendering pages, SvelteKit lets you create **API endpoints** that live right alongside your routes. These are called server routes, and they are defined in `+server.ts` files.

Server routes respond to HTTP methods like GET, POST, PUT, and DELETE. They receive a `Request` object and return a `Response` object, following the exact same Web API standards that browsers use. If you know `fetch`, you already know how server routes work.

## Creating a Server Route

Create a `+server.ts` file inside any route directory. Each exported function name corresponds to an HTTP method:

```typescript
// src/routes/api/hello/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({ message: 'Hello from the API!' });
};
```

Visit `/api/hello` in your browser and you will see the JSON response. The `json()` helper sets the `Content-Type` header automatically.

## Handling Multiple HTTP Methods

A single `+server.ts` file can handle several methods:

```typescript
// src/routes/api/items/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const items = [{ id: 1, name: 'Notebook' }, { id: 2, name: 'Pen' }];
  return json(items);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  if (!body.name) {
    throw error(400, 'Name is required');
  }

  const newItem = { id: Date.now(), name: body.name };
  return json(newItem, { status: 201 });
};
```

## The Request Object

The `request` parameter is a standard `Request` object. You can read JSON bodies, form data, headers, and URL search params:

```typescript
export const PUT: RequestHandler = async ({ request, url }) => {
  const body = await request.json();
  const authHeader = request.headers.get('Authorization');
  const search = url.searchParams.get('q');

  return json({ received: body, auth: authHeader, query: search });
};
```

## Status Codes and Custom Responses

Use the second argument to `json()` for custom status codes, or build a `Response` manually for full control:

```typescript
export const DELETE: RequestHandler = async ({ params }) => {
  // Return 204 No Content
  return new Response(null, { status: 204 });
};
```

## Try It

Create a server route at `src/routes/api/greeting/+server.ts` that accepts a GET request with a `?name=` query parameter and returns `{ greeting: "Hello, [name]!" }`. If no name is provided, return a 400 error.

## Key Takeaways

- Server routes are defined in `+server.ts` files and export functions named after HTTP methods
- The `json()` helper returns a JSON response with proper headers
- The `request` parameter is a standard Web API `Request` object
- Use `throw error(statusCode, message)` for error responses
- You can return custom status codes by passing options to `json()` or constructing a `Response`
