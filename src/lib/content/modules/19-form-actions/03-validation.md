# Server-Side Validation

Never trust data from the client. Even if you add HTML `required` attributes and JavaScript validation, users can bypass them. **Server-side validation** is your last line of defense — it runs in your form action where users cannot tamper with it.

The pattern is straightforward: check the submitted data, return errors if something is wrong, and display those errors next to the relevant fields.

## Basic Validation Pattern

Validate each field and collect errors:

```typescript
// src/routes/register/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const errors: Record<string, string> = {};

    if (!name || name.length < 2) {
      errors.name = 'Name must be at least 2 characters';
    }

    if (!email || !email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }

    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, {
        errors,
        values: { name, email }
      });
    }

    // Validation passed — save to database
    return { success: true };
  }
};
```

Notice the `values` object in the failure response. This sends back the submitted values so the form can repopulate fields — the user does not have to re-type everything. Importantly, never send the password back.

## Displaying Field Errors

Show errors next to each field in the form:

```svelte
<!-- src/routes/register/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<h1>Register</h1>

{#if form?.success}
  <p class="success">Account created successfully!</p>
{/if}

<form method="POST" use:enhance={() => {
  return async ({ update }) => {
    await update({ reset: false });
  };
}}>
  <label>
    Name
    <input name="name" value={form?.values?.name ?? ''} />
    {#if form?.errors?.name}
      <span class="error">{form.errors.name}</span>
    {/if}
  </label>

  <label>
    Email
    <input name="email" type="email" value={form?.values?.email ?? ''} />
    {#if form?.errors?.email}
      <span class="error">{form.errors.email}</span>
    {/if}
  </label>

  <label>
    Password
    <input name="password" type="password" />
    {#if form?.errors?.password}
      <span class="error">{form.errors.password}</span>
    {/if}
  </label>

  <button type="submit">Register</button>
</form>

<style>
  .error {
    color: #dc2626;
    font-size: 0.875rem;
    display: block;
    margin-top: 0.25rem;
  }

  .success {
    color: #16a34a;
    padding: 1rem;
    background: #f0fdf4;
    border-radius: 0.5rem;
  }
</style>
```

The `{ reset: false }` in `use:enhance` prevents clearing the form when validation fails, so the user's input is preserved.

## Validating Different Field Types

Different fields require different validation strategies:

```typescript
function validateForm(formData: FormData) {
  const errors: Record<string, string> = {};

  // Required text field
  const title = formData.get('title') as string;
  if (!title?.trim()) {
    errors.title = 'Title is required';
  }

  // URL field
  const url = formData.get('url') as string;
  try {
    new URL(url);
  } catch {
    errors.url = 'Please enter a valid URL';
  }

  // Number in range
  const age = Number(formData.get('age'));
  if (isNaN(age) || age < 13 || age > 120) {
    errors.age = 'Age must be between 13 and 120';
  }

  // Enum / allowed values
  const role = formData.get('role') as string;
  if (!['admin', 'editor', 'viewer'].includes(role)) {
    errors.role = 'Invalid role selected';
  }

  return errors;
}
```

## Unique Constraint Validation

Some validations require a database check, like ensuring an email is not already registered:

```typescript
import { eq } from 'drizzle-orm';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;

    // Check if email already exists
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return fail(400, {
        errors: { email: 'This email is already registered' },
        values: { email }
      });
    }

    // Continue with registration...
  }
};
```

## Try It

Create a "Create Post" form with fields for `title`, `slug`, `content`, and `category`. Validate that the title is 3-100 characters, the slug contains only lowercase letters and hyphens, the content is at least 50 characters, and the category is one of "tutorial", "news", or "opinion". Display all errors inline and preserve the submitted values.

## Key Takeaways

- Always validate on the server — client-side validation can be bypassed
- Use `fail(400, { errors, values })` to return validation errors and preserve user input
- Display errors conditionally with `{#if form?.errors?.fieldName}` next to each field
- Use `{ reset: false }` in `use:enhance` to keep form values after failed validation
- Validate types, ranges, formats, and uniqueness constraints as needed
- Never return sensitive data like passwords in the failure response
