# Form Functions

Traditional SvelteKit form actions work well, but they live in `+page.server.ts` and are tightly bound to a specific route. The `form` remote function offers an alternative: declarative form handling that lives in `.remote.ts` files and can be shared across any component. It provides built-in schema validation, field helpers, and progressive enhancement out of the box.

Think of `form()` as the evolution of form actions — same server-side processing, but with a richer API for building form UIs and better co-location with the components that use them.

## Basic Form Function

Define a form function in a `.remote.ts` file with a validation schema and a handler:

```typescript
// src/lib/api/posts.remote.ts
import { form } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';

export const createPost = form(
  v.object({
    title: v.pipe(v.string(), v.minLength(3, 'Title must be at least 3 characters')),
    body: v.pipe(v.string(), v.minLength(10, 'Body must be at least 10 characters')),
    category: v.string()
  }),
  async (data) => {
    await db.insert(postsTable).values({
      title: data.title,
      body: data.body,
      category: data.category
    });
  }
);
```

## Using a Form Function in a Component

Spread the form function's return value onto a `<form>` element. This wires up the action, method, and hidden fields automatically:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
</script>

<h1>New Post</h1>

<form {...createPost}>
  <label>
    Title
    <input {...createPost.fields.title.as('text')} />
  </label>

  <label>
    Body
    <textarea {...createPost.fields.body.as('textarea')}></textarea>
  </label>

  <label>
    Category
    <select {...createPost.fields.category.as('select')}>
      <option value="tech">Tech</option>
      <option value="design">Design</option>
    </select>
  </label>

  <button type="submit">Publish</button>
</form>
```

The `...createPost` spread on the `<form>` sets up the `action`, `method`, and encoding. The `.fields.title.as('text')` helper sets the `name`, `type`, and `value` attributes on the input.

## Field Helpers

Each field on the form object provides methods for reading and writing values and displaying validation errors:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
</script>

<form {...createPost}>
  <label>
    Title
    <input {...createPost.fields.title.as('text')} />
  </label>

  <!-- Show the current value -->
  <p>Current title: {createPost.fields.title.value()}</p>

  <!-- Programmatically set a value -->
  <button type="button" onclick={() => createPost.fields.title.set('Draft Post')}>
    Use Default Title
  </button>

  <!-- Display validation errors -->
  {#each createPost.fields.title.issues() as issue}
    <p class="error">{issue}</p>
  {/each}

  <button type="submit">Publish</button>
</form>
```

- **`.as(type)`** — returns spread attributes for the given input type (`'text'`, `'email'`, `'textarea'`, `'select'`, etc.)
- **`.value()`** — returns the field's current value
- **`.set(value)`** — programmatically updates the field's value
- **`.issues()`** — returns an array of validation error messages for the field

## Custom Submission with enhance

The `.enhance` method lets you customize what happens during and after submission — perfect for optimistic UI, toast notifications, or redirects:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
  import { goto } from '$app/navigation';
  import { toast } from '$lib/toast';
</script>

<form
  {...createPost}
  use:createPost.enhance={() => {
    toast.info('Saving post...');

    return async ({ result }) => {
      if (result.type === 'success') {
        toast.success('Post published!');
        goto('/blog');
      } else {
        toast.error('Something went wrong.');
      }
    };
  }}
>
  <!-- fields -->
</form>
```

The callback receives the submission and returns an async function that handles the result. This is the same pattern as SvelteKit's `use:enhance` but integrated directly into the form function.

## Client-Side Preflight Validation

By default, validation runs on the server. Use `.preflight` to add client-only validation that runs before the server round-trip, giving instant feedback:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
  import * as v from 'valibot';

  const postForm = createPost.preflight(
    v.object({
      title: v.pipe(v.string(), v.minLength(3, 'Title too short')),
      body: v.pipe(v.string(), v.minLength(10, 'Body too short')),
      category: v.string()
    })
  );
</script>

<form {...postForm}>
  <!-- Errors appear instantly without a server request -->
  <input {...postForm.fields.title.as('text')} />
  {#each postForm.fields.title.issues() as issue}
    <p class="error">{issue}</p>
  {/each}

  <button type="submit">Publish</button>
</form>
```

Preflight validation runs in the browser. When the form is submitted, the server still validates with its own schema — this is defense in depth.

## Sensitive Fields

Fields prefixed with an underscore are treated as sensitive. They are excluded from repopulation after a failed submission, preventing passwords and secrets from being echoed back:

```typescript
// src/lib/api/auth.remote.ts
import { form } from '$app/server';
import * as v from 'valibot';

export const register = form(
  v.object({
    email: v.pipe(v.string(), v.email('Invalid email')),
    _password: v.pipe(v.string(), v.minLength(8, 'Minimum 8 characters')),
    _confirmPassword: v.string()
  }),
  async (data) => {
    // _password and _confirmPassword are available here
    // but will NOT be sent back to the client on validation failure
    await createUser(data.email, data._password);
  }
);
```

After a failed submission, the email field repopulates with the user's input, but the password fields remain empty.

## Isolated Form Instances with form.for

When rendering repeated elements that each need their own form — like a list of todo items with inline editing — use `form.for(id)` to create isolated instances. Each instance tracks its own field values, validation state, and submission independently:

```typescript
// src/lib/api/todos.remote.ts
import { form } from '$app/server';
import * as v from 'valibot';
import { db } from '$lib/server/database';

export const updateTodo = form(
  v.object({
    id: v.string(),
    text: v.pipe(v.string(), v.minLength(1, 'Cannot be empty')),
    completed: v.boolean()
  }),
  async (data) => {
    await db
      .update(todosTable)
      .set({ text: data.text, completed: data.completed })
      .where(eq(todosTable.id, data.id));
  }
);
```

```svelte
<script lang="ts">
  import { updateTodo } from '$lib/api/todos.remote';

  let { todos } = $props();
</script>

{#each todos as todo}
  {@const todoForm = updateTodo.for(todo.id)}

  <form {...todoForm}>
    <input type="hidden" name="id" value={todo.id} />
    <input {...todoForm.fields.text.as('text')} />

    {#each todoForm.fields.text.issues() as issue}
      <p class="error">{issue}</p>
    {/each}

    <label>
      <input
        type="checkbox"
        checked={todo.completed}
        onchange={() => todoForm.fields.completed.set(!todo.completed)}
      />
      Done
    </label>

    <button type="submit">Save</button>
  </form>
{/each}
```

Without `form.for`, every item would share the same form state — submitting one would affect all others. The `id` argument creates a unique instance per item, so each todo has independent validation errors, field values, and submission state.

## Programmatic Validation with form.validate

Sometimes you need to validate a form without submitting it — for example, to check fields on blur or before enabling a submit button. The `.validate()` method triggers validation and populates `.issues()` without making a server request:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';

  const postForm = createPost.preflight(
    v.object({
      title: v.pipe(v.string(), v.minLength(3, 'Title too short')),
      body: v.pipe(v.string(), v.minLength(10, 'Body too short')),
      category: v.string()
    })
  );

  let isValid = $state(false);

  async function checkValidity() {
    const result = await postForm.validate();
    isValid = result.valid;
  }
</script>

<form {...postForm}>
  <label>
    Title
    <input {...postForm.fields.title.as('text')} onblur={checkValidity} />
  </label>
  {#each postForm.fields.title.issues() as issue}
    <p class="error">{issue}</p>
  {/each}

  <label>
    Body
    <textarea {...postForm.fields.body.as('textarea')} onblur={checkValidity}></textarea>
  </label>
  {#each postForm.fields.body.issues() as issue}
    <p class="error">{issue}</p>
  {/each}

  <button type="submit" disabled={!isValid}>Publish</button>
</form>
```

`.validate()` returns a promise that resolves with `{ valid: boolean }`. It runs the preflight schema against current field values and updates each field's `.issues()` array. This is useful for multi-step wizards where you validate the current step before advancing, or for showing a "form ready" indicator.

## Optimistic Updates with withOverride

When a mutation succeeds, you often want the UI to update immediately without waiting for a query refresh. `withOverride` lets you optimistically apply new data to a query's `.current` value during a form submission:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  import { updateProduct } from '$lib/api/products.remote';

  const products = getProducts();
</script>

<form
  {...updateProduct}
  use:updateProduct.enhance(() => {
    // Optimistically update the product list while the server processes the mutation
    const rollback = products.withOverride(
      products.current?.map((p) =>
        p.id === editingId ? { ...p, ...pendingChanges } : p
      ) ?? []
    );

    return async ({ result }) => {
      if (result.type === 'success') {
        // Refresh with real server data and remove the override
        await products.refresh();
        rollback();
      } else {
        // Revert the optimistic update on failure
        rollback();
      }
    };
  }}
>
  <!-- form fields -->
</form>
```

`withOverride` immediately replaces the query's `.current` value with the data you provide. It returns a `rollback` function that restores the original data. The pattern is:

1. Apply the override with optimistic data before the server responds
2. On success, refresh the query to get confirmed server data and call `rollback` to remove the override
3. On failure, call `rollback` to revert to the previous state

This keeps the UI responsive — users see their changes instantly while the server processes them in the background.

## Client-Requested Query Refresh with requested

After a form submission, you may want the server to decide which queries should refresh. The `requested()` function lets the server accept refresh requests from the client, giving server-side control over post-mutation data fetching:

```typescript
// src/lib/api/products.remote.ts
import { query, form, requested } from '$app/server';
import { db } from '$lib/server/database';

export const getProducts = query(async () => {
  return await db.select().from(productsTable);
});

export const deleteProduct = form(
  v.object({ id: v.string() }),
  async (data) => {
    await db.delete(productsTable).where(eq(productsTable.id, data.id));

    // Accept the client's request to refresh the products query
    await requested(getProducts);
  }
);
```

```svelte
<script lang="ts">
  import { getProducts, deleteProduct } from '$lib/api/products.remote';

  const products = getProducts();
</script>

<form
  {...deleteProduct}
  use:deleteProduct.enhance(() => {
    return async ({ result }) => {
      if (result.type === 'success') {
        // This refresh is fulfilled by the requested() call on the server
        await products.refresh();
      }
    };
  }}
>
  <!-- delete button -->
</form>
```

When the client calls `products.refresh()` after a successful mutation, and the server handler includes `await requested(getProducts)`, the server bundles the fresh query result into the mutation response. This avoids an extra round-trip — the client gets updated data as part of the form submission response rather than making a separate request.

## Server-Side Validation Errors with invalid

For validation that requires server context (like checking if an email is already taken), use `invalid` from `@sveltejs/kit`:

```typescript
import { form } from '$app/server';
import { invalid } from '@sveltejs/kit';
import * as v from 'valibot';

export const register = form(
  v.object({
    email: v.pipe(v.string(), v.email()),
    _password: v.pipe(v.string(), v.minLength(8))
  }),
  async (data) => {
    const existing = await db.getUserByEmail(data.email);

    if (existing) {
      return invalid(409, {
        email: ['This email is already registered']
      });
    }

    await createUser(data.email, data._password);
  }
);
```

The `invalid` response populates the corresponding field's `.issues()` array, so your existing error display logic handles both schema errors and business logic errors.

## When to Use form() vs Traditional Form Actions

| Scenario | Use |
|----------|-----|
| Form logic shared across multiple pages | `form()` remote function |
| Component-level form encapsulation | `form()` remote function |
| Simple single-page form | Traditional form action |
| Must work with zero JavaScript | Traditional form action |
| Need field helpers and preflight validation | `form()` remote function |

Both approaches work with progressive enhancement. Traditional form actions are simpler for basic cases. Remote form functions shine when you need reusable form logic, rich field APIs, or forms embedded in shared components.

## Try It

Create a user registration form using `form()` with a Valibot schema. Include an `email` field, a `_password` field (sensitive), and a `displayName` field. Add preflight validation for instant client-side feedback. Display validation errors under each field using `.issues()`. Add an `.enhance` callback that shows a success toast and redirects to `/login` after successful registration.

## Key Takeaways

- `form()` from `$app/server` provides declarative form handling in `.remote.ts` files
- Spread the form object onto `<form>` to wire up action, method, and encoding automatically
- Field helpers (`.as()`, `.value()`, `.set()`, `.issues()`) simplify building form UIs
- `.enhance` customizes submission behavior for optimistic UI, toasts, and redirects
- `.preflight` adds instant client-side validation before the server round-trip
- Fields prefixed with `_` are sensitive and will not be repopulated after failed submissions
- Use `invalid()` from `@sveltejs/kit` for server-side validation errors that need database access
- `form.for(id)` creates isolated form instances for repeated elements like list items, each with independent state
- `.validate()` triggers validation without submitting, useful for on-blur checks and multi-step forms
- `withOverride` on a query enables optimistic updates during mutations; it returns a `rollback` function to revert on failure
- `requested()` lets the server accept client-requested query refreshes, bundling fresh data into the mutation response
- Choose `form()` for reusable, component-level forms; use traditional actions for simple, route-bound forms
