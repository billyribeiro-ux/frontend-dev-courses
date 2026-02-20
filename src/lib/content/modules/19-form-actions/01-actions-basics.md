# Form Actions Basics

HTML forms have been sending data to servers since the early web. SvelteKit embraces this pattern with **form actions** — server-side functions that process form submissions. They work without JavaScript, handle POST requests, and integrate seamlessly with SvelteKit's data loading.

Form actions live in `+page.server.ts` alongside your load functions. When a user submits a form, SvelteKit calls the matching action, processes the data, and re-renders the page with fresh data.

## The Default Action

The simplest setup is a single default action:

```typescript
// src/routes/contact/+page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const message = formData.get('message') as string;

    console.log(`Message from ${name}: ${message}`);

    return { success: true };
  }
};
```

The corresponding form does not need an `action` attribute — it automatically submits to the default action:

```svelte
<!-- src/routes/contact/+page.svelte -->
<script lang="ts">
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<h1>Contact Us</h1>

{#if form?.success}
  <p>Thank you for your message!</p>
{/if}

<form method="POST">
  <label>
    Name
    <input name="name" required />
  </label>
  <label>
    Message
    <textarea name="message" required></textarea>
  </label>
  <button type="submit">Send</button>
</form>
```

The `form` prop contains whatever the action returned. It is `null` on initial page load and populated after a form submission.

## Named Actions

When a page needs multiple forms (like create, update, and delete), use named actions:

```typescript
// src/routes/todos/+page.server.ts
import type { Actions } from './$types';

export const actions: Actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const text = formData.get('text') as string;
    // Save the todo...
    return { success: true };
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id') as string;
    // Delete the todo...
    return { success: true };
  }
};
```

Point each form to its action using the `action` attribute with a query parameter:

```svelte
<!-- Create form -->
<form method="POST" action="?/create">
  <input name="text" placeholder="New todo..." required />
  <button type="submit">Add</button>
</form>

<!-- Delete form (one per todo) -->
{#each data.todos as todo}
  <div>
    <span>{todo.text}</span>
    <form method="POST" action="?/delete">
      <input type="hidden" name="id" value={todo.id} />
      <button type="submit">Delete</button>
    </form>
  </div>
{/each}
```

The `?/create` and `?/delete` syntax tells SvelteKit which named action to call.

## Working with FormData

The `FormData` API provides several methods for reading submitted values:

```typescript
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();

    // Get a single value
    const title = formData.get('title') as string;

    // Get multiple values (for checkboxes or multi-selects)
    const tags = formData.getAll('tags') as string[];

    // Check if a field exists
    const hasNewsletter = formData.has('newsletter');

    return { title, tags, hasNewsletter };
  }
};
```

## Returning Responses

Actions can return data that the page component uses to show feedback:

```typescript
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;

    if (!email.includes('@')) {
      return fail(400, { email, error: 'Invalid email address' });
    }

    // Save to database...
    return { success: true, message: 'Subscription confirmed!' };
  }
};
```

Use `fail()` to return a non-200 response. This marks the submission as unsuccessful while preserving the returned data.

## Try It

Create a page with a "guest book" that has two named actions: `sign` for adding a new entry and `clear` for removing all entries. The `sign` action should accept a `name` and `message` from the form. Display all entries on the page with a delete-all button that calls the `clear` action.

## Key Takeaways

- Form actions are server-side functions defined in `+page.server.ts` under `export const actions`
- The default action handles forms without a specific `action` attribute
- Named actions use `action="?/actionName"` to target specific handlers
- `request.formData()` returns a `FormData` object with `.get()`, `.getAll()`, and `.has()` methods
- The `form` prop in `+page.svelte` contains the action's return value
- Use `fail()` from `@sveltejs/kit` to return error responses with data
