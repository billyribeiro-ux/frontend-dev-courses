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
- Choose `form()` for reusable, component-level forms; use traditional actions for simple, route-bound forms
