# Server-Side Validation

Never trust data from the client. Even if you add HTML `required` attributes and JavaScript validation, users can bypass them — by disabling JavaScript, editing the DOM in DevTools, or sending raw HTTP requests with `curl`. **Server-side validation** is your last line of defense — it runs in your form action where users cannot tamper with it.

The pattern is straightforward: check the submitted data, return errors if something is wrong, and display those errors next to the relevant fields. The goal is a professional form experience where errors are clear, specific, and accessible.

## The Validation Mental Model

Think of validation as three layers:

1. **HTML validation** (`required`, `type="email"`, `minlength`) — instant, zero JavaScript, but easily bypassed and hard to style
2. **Client-side JavaScript validation** — fast feedback, nice UX, but can be bypassed by any technical user
3. **Server-side validation** — cannot be bypassed, the single source of truth, but requires a round trip

**You need all three.** HTML and client-side validation provide fast user feedback. Server-side validation provides security. Never skip server-side validation just because you have client-side checks.

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

    // Validate name
    if (!name || name.trim().length === 0) {
      errors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      errors.name = 'Name must be at least 2 characters';
    } else if (name.trim().length > 100) {
      errors.name = 'Name must be under 100 characters';
    }

    // Validate email
    if (!email || email.trim().length === 0) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email address';
    }

    // Validate password
    if (!password) {
      errors.password = 'Password is required';
    } else if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    } else if (!/[A-Z]/.test(password)) {
      errors.password = 'Password must include an uppercase letter';
    } else if (!/[0-9]/.test(password)) {
      errors.password = 'Password must include a number';
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, {
        errors,
        values: { name, email } // Repopulate form — never send password back
      });
    }

    // Validation passed — save to database
    // await db.insert(users).values({ name, email, passwordHash: await hash(password) });

    return { success: true };
  }
};
```

**Key details:**
- `fail(400, data)` sets the HTTP status to 400 and returns the data to the page component as `form`
- The `values` object sends back submitted values so the form can repopulate fields — the user does not have to re-type everything
- **Never return sensitive data** like passwords in the failure response
- Chain validation checks with `else if` to show only the first error per field — showing five errors at once for one field is overwhelming

## Displaying Field Errors

Show errors next to each field with accessible markup:

```svelte
<!-- src/routes/register/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<h1>Register</h1>

{#if form?.success}
  <div class="success" role="status">
    <p>Account created successfully!</p>
  </div>
{/if}

<form method="POST" use:enhance={() => {
  return async ({ update }) => {
    await update({ reset: false });
  };
}}>
  <div class="field">
    <label for="name">
      Name <span class="required" aria-hidden="true">*</span>
    </label>
    <input
      id="name"
      name="name"
      type="text"
      value={form?.values?.name ?? ''}
      aria-invalid={form?.errors?.name ? true : undefined}
      aria-describedby={form?.errors?.name ? 'name-error' : undefined}
      autocomplete="name"
    />
    {#if form?.errors?.name}
      <p id="name-error" class="error" role="alert">{form.errors.name}</p>
    {/if}
  </div>

  <div class="field">
    <label for="email">
      Email <span class="required" aria-hidden="true">*</span>
    </label>
    <input
      id="email"
      name="email"
      type="email"
      value={form?.values?.email ?? ''}
      aria-invalid={form?.errors?.email ? true : undefined}
      aria-describedby={form?.errors?.email ? 'email-error' : undefined}
      autocomplete="email"
    />
    {#if form?.errors?.email}
      <p id="email-error" class="error" role="alert">{form.errors.email}</p>
    {/if}
  </div>

  <div class="field">
    <label for="password">
      Password <span class="required" aria-hidden="true">*</span>
    </label>
    <input
      id="password"
      name="password"
      type="password"
      aria-invalid={form?.errors?.password ? true : undefined}
      aria-describedby="password-hint password-error"
      autocomplete="new-password"
    />
    <p id="password-hint" class="hint">
      At least 8 characters, one uppercase letter, one number
    </p>
    {#if form?.errors?.password}
      <p id="password-error" class="error" role="alert">{form.errors.password}</p>
    {/if}
  </div>

  <button type="submit">Create Account</button>
</form>

<style>
  form {
    max-width: 450px;
  }

  .field {
    margin-bottom: 20px;
  }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 0.95rem;
  }

  .required {
    color: #dc2626;
  }

  input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: 2px solid #3498db;
    outline-offset: 1px;
    border-color: #3498db;
  }

  input[aria-invalid="true"] {
    border-color: #dc2626;
  }

  input[aria-invalid="true"]:focus {
    outline-color: #dc2626;
  }

  .error {
    color: #dc2626;
    font-size: 0.875rem;
    margin: 6px 0 0;
  }

  .hint {
    color: #64748b;
    font-size: 0.8rem;
    margin: 4px 0 0;
  }

  .success {
    color: #16a34a;
    padding: 1rem;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 0.5rem;
    margin-bottom: 1rem;
  }

  button {
    width: 100%;
    padding: 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover {
    background: #2980b9;
  }
</style>
```

**Accessibility details in this form:**
- `aria-invalid="true"` tells screen readers the field has an error
- `aria-describedby` links error messages (and hints) to their input — screen readers announce them when the user focuses the field
- `role="alert"` on error messages announces them immediately when they appear (live region)
- `aria-hidden="true"` on the asterisk prevents screen readers from reading "star" — the `required` attribute handles the semantics
- The `{ reset: false }` in `use:enhance` prevents clearing the form when validation fails

## Schema-Based Validation with Zod

Writing validation logic manually gets tedious and error-prone. Schema libraries like **Zod** let you define validation rules declaratively and reuse them on both client and server:

```typescript
// src/lib/schemas/register.ts
import { z } from 'zod';

export const registerSchema = z.object({
  name: z
    .string({ required_error: 'Name is required' })
    .trim()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be under 100 characters'),

  email: z
    .string({ required_error: 'Email is required' })
    .trim()
    .email('Please enter a valid email address')
    .toLowerCase(),

  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must include an uppercase letter')
    .regex(/[0-9]/, 'Password must include a number')
    .regex(/[!@#$%^&*]/, 'Password must include a special character'),

  confirmPassword: z
    .string({ required_error: 'Please confirm your password' })
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']  // Error appears on confirmPassword field
});

export type RegisterInput = z.infer<typeof registerSchema>;
```

Now use it in your form action:

```typescript
// src/routes/register/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { registerSchema } from '$lib/schemas/register';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = registerSchema.safeParse(data);

    if (!result.success) {
      // Transform Zod errors into a field-keyed object
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!errors[field]) {
          errors[field] = issue.message; // Only first error per field
        }
      }

      return fail(400, {
        errors,
        values: {
          name: data.name as string,
          email: data.email as string
        }
      });
    }

    // result.data is fully typed and validated
    const { name, email, password } = result.data;
    // await createUser(name, email, password);

    return { success: true };
  }
};
```

**Why Zod?**
- **Type inference** — `z.infer<typeof schema>` gives you TypeScript types for free
- **Composable** — build complex schemas from simple ones
- **Same schema on client and server** — define once, validate everywhere
- **Transforms** — `.trim()`, `.toLowerCase()`, `.transform()` clean data during validation
- **Cross-field validation** — `.refine()` handles rules that span multiple fields

## Schema-Based Validation with Valibot

Valibot is a smaller alternative to Zod with a similar API but better tree-shaking:

```typescript
// src/lib/schemas/register.ts
import * as v from 'valibot';

export const registerSchema = v.pipe(
  v.object({
    name: v.pipe(
      v.string('Name is required'),
      v.trim(),
      v.minLength(2, 'Name must be at least 2 characters'),
      v.maxLength(100, 'Name must be under 100 characters')
    ),
    email: v.pipe(
      v.string('Email is required'),
      v.trim(),
      v.email('Please enter a valid email address'),
      v.toLowerCase()
    ),
    password: v.pipe(
      v.string('Password is required'),
      v.minLength(8, 'Password must be at least 8 characters'),
      v.regex(/[A-Z]/, 'Must include an uppercase letter'),
      v.regex(/[0-9]/, 'Must include a number')
    ),
    confirmPassword: v.string('Please confirm your password')
  }),
  v.forward(
    v.check(
      (data) => data.password === data.confirmPassword,
      'Passwords do not match'
    ),
    ['confirmPassword']
  )
);

export type RegisterInput = v.InferOutput<typeof registerSchema>;
```

The action code is nearly identical — just swap `safeParse` for `v.safeParse`:

```typescript
import * as v from 'valibot';
import { registerSchema } from '$lib/schemas/register';

const result = v.safeParse(registerSchema, data);

if (!result.success) {
  const errors: Record<string, string> = {};
  for (const issue of result.issues) {
    const field = issue.path?.[0]?.key as string;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return fail(400, { errors, values: { name: data.name, email: data.email } });
}
```

**Zod vs Valibot**: Zod is more popular and has a slightly more ergonomic API. Valibot is smaller (tree-shakable to ~1KB vs Zod's ~13KB). Both work well with SvelteKit. Choose Zod for most projects; consider Valibot if bundle size is critical.

## Cross-Field Validation

Some validations depend on multiple fields. Common examples:

```typescript
import { z } from 'zod';

// Password confirmation
const passwordSchema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword']
});

// Date range (end must be after start)
const dateRangeSchema = z.object({
  startDate: z.string().pipe(z.coerce.date()),
  endDate: z.string().pipe(z.coerce.date())
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate']
});

// Conditional requirement (if role is "other", otherRole is required)
const profileSchema = z.object({
  role: z.enum(['developer', 'designer', 'manager', 'other']),
  otherRole: z.string().optional()
}).refine(
  (data) => data.role !== 'other' || (data.otherRole && data.otherRole.trim().length > 0),
  {
    message: 'Please specify your role',
    path: ['otherRole']
  }
);
```

In your form action, cross-field errors appear just like regular field errors because they have a `path`.

## Validating Different Field Types

Different fields require different validation strategies:

```typescript
import { z } from 'zod';

const formSchema = z.object({
  // Required text field
  title: z
    .string()
    .trim()
    .min(1, 'Title is required')
    .max(200, 'Title must be under 200 characters'),

  // URL field
  website: z
    .string()
    .url('Please enter a valid URL')
    .optional()
    .or(z.literal('')),  // Allow empty string

  // Number in range
  age: z.coerce  // coerce converts string from FormData to number
    .number({ invalid_type_error: 'Age must be a number' })
    .int('Age must be a whole number')
    .min(13, 'You must be at least 13')
    .max(120, 'Please enter a valid age'),

  // Enum / allowed values
  role: z.enum(['admin', 'editor', 'viewer'], {
    errorMap: () => ({ message: 'Please select a valid role' })
  }),

  // Array (from checkbox group)
  interests: z
    .array(z.string())
    .min(1, 'Select at least one interest')
    .default([]),

  // Boolean (from single checkbox)
  agreedToTerms: z
    .string()
    .transform((val) => val === 'on')  // Checkboxes send "on" or nothing
    .pipe(z.literal(true, { errorMap: () => ({ message: 'You must agree to the terms' }) })),

  // Optional with transform
  bio: z
    .string()
    .trim()
    .max(500, 'Bio must be under 500 characters')
    .optional()
    .transform((val) => val || undefined)  // Convert empty string to undefined
});
```

**FormData gotchas:**
- Unchecked checkboxes are *absent* from FormData, not `false` or empty string
- Multiple checkboxes with the same name create multiple entries — use `formData.getAll('interests')` instead of `formData.get('interests')`
- Number inputs arrive as strings — use `z.coerce.number()` to convert
- Select elements with no selection may send an empty string

Here is how to handle these in the action:

```typescript
export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();

    const data = {
      title: formData.get('title') as string,
      website: formData.get('website') as string,
      age: formData.get('age') as string,
      role: formData.get('role') as string,
      interests: formData.getAll('interests') as string[],  // getAll for checkbox groups
      agreedToTerms: formData.get('agreedToTerms') as string,
      bio: formData.get('bio') as string
    };

    const result = formSchema.safeParse(data);
    // ... handle errors
  }
};
```

## File Validation

File uploads need size and type validation:

```typescript
// src/routes/upload/+page.server.ts
import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('avatar') as File;
    const errors: Record<string, string> = {};

    if (!file || file.size === 0) {
      errors.avatar = 'Please select a file';
    } else if (!ALLOWED_TYPES.includes(file.type)) {
      errors.avatar = `File type not allowed. Use: ${ALLOWED_TYPES.map(t => t.split('/')[1]).join(', ')}`;
    } else if (file.size > MAX_FILE_SIZE) {
      errors.avatar = `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`;
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors });
    }

    // Process the valid file
    const buffer = await file.arrayBuffer();
    // await saveFile(buffer, file.name);

    return { success: true };
  }
};
```

The corresponding form:

```svelte
<form method="POST" enctype="multipart/form-data" use:enhance>
  <div class="field">
    <label for="avatar">Profile Photo</label>
    <input
      id="avatar"
      name="avatar"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      aria-describedby="avatar-hint avatar-error"
    />
    <p id="avatar-hint" class="hint">JPEG, PNG, or WebP. Max 5MB.</p>
    {#if form?.errors?.avatar}
      <p id="avatar-error" class="error" role="alert">{form.errors.avatar}</p>
    {/if}
  </div>

  <button type="submit">Upload</button>
</form>
```

**Important**: Always add `enctype="multipart/form-data"` to forms with file inputs. Without it, the file data is not sent correctly.

## Unique Constraint Validation

Some validations require a database check, like ensuring an email is not already registered:

```typescript
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { registerSchema } from '$lib/schemas/register';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    // Step 1: Schema validation
    const result = registerSchema.safeParse(data);
    if (!result.success) {
      // ... return schema errors
    }

    // Step 2: Business logic validation (requires database)
    const { email, name } = result.data;

    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return fail(400, {
        errors: { email: 'An account with this email already exists' },
        values: { name, email }
      });
    }

    // Step 3: Create the user
    // await db.insert(users).values({ ... });

    return { success: true };
  }
};
```

**Performance note**: Schema validation is fast (microseconds). Database checks are slow (milliseconds). Always do schema validation first to reject obviously invalid data before hitting the database.

## Client-Side Validation with HTML5 Attributes

HTML5 validation attributes give you free, instant validation with zero JavaScript:

```svelte
<form method="POST" use:enhance>
  <!-- Required field -->
  <input name="name" required />

  <!-- Email format -->
  <input name="email" type="email" required />

  <!-- Minimum / maximum length -->
  <input name="username" minlength="3" maxlength="20" required />

  <!-- Pattern matching -->
  <input name="slug" pattern="[a-z0-9-]+" title="Lowercase letters, numbers, and hyphens only" />

  <!-- Number range -->
  <input name="age" type="number" min="13" max="120" required />

  <!-- File type -->
  <input name="avatar" type="file" accept="image/*" />

  <button type="submit">Submit</button>
</form>
```

**Limitation**: HTML5 validation is all-or-nothing. It shows browser-native error popups that are hard to style. For custom-styled errors, add `novalidate` to the form and handle validation in JavaScript.

## Real-Time Validation with $effect

For instant feedback as the user types, combine client-side validation with Svelte's reactivity:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  let username = $state(form?.values?.username ?? '');
  let email = $state(form?.values?.email ?? '');
  let password = $state('');

  // Client-side validation state
  let touched = $state({ username: false, email: false, password: false });

  let clientErrors = $derived({
    username: touched.username && username.length > 0 && username.length < 3
      ? 'Username must be at least 3 characters'
      : touched.username && username.length > 0 && !/^[a-zA-Z0-9_]+$/.test(username)
      ? 'Only letters, numbers, and underscores'
      : '',
    email: touched.email && email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ? 'Please enter a valid email address'
      : '',
    password: touched.password && password.length > 0 && password.length < 8
      ? `${8 - password.length} more characters needed`
      : ''
  });

  // Merge server errors and client errors (server errors take priority after submit)
  function getError(field: string): string {
    return form?.errors?.[field] || clientErrors[field] || '';
  }
</script>

<form method="POST" use:enhance={() => {
  return async ({ update }) => {
    await update({ reset: false });
  };
}}>
  <div class="field">
    <label for="username">Username</label>
    <input
      id="username"
      name="username"
      bind:value={username}
      onblur={() => touched.username = true}
      aria-invalid={getError('username') ? true : undefined}
      aria-describedby={getError('username') ? 'username-error' : undefined}
    />
    {#if getError('username')}
      <p id="username-error" class="error">{getError('username')}</p>
    {/if}
  </div>

  <div class="field">
    <label for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      bind:value={email}
      onblur={() => touched.email = true}
      aria-invalid={getError('email') ? true : undefined}
      aria-describedby={getError('email') ? 'email-error' : undefined}
    />
    {#if getError('email')}
      <p id="email-error" class="error">{getError('email')}</p>
    {/if}
  </div>

  <div class="field">
    <label for="password">Password</label>
    <input
      id="password"
      name="password"
      type="password"
      bind:value={password}
      onblur={() => touched.password = true}
      aria-invalid={getError('password') ? true : undefined}
      aria-describedby="password-strength password-error"
    />

    <!-- Password strength indicator -->
    {#if touched.password && password.length > 0}
      <div class="strength-bar">
        <div
          class="strength-fill"
          class:weak={password.length < 8}
          class:medium={password.length >= 8 && password.length < 12}
          class:strong={password.length >= 12}
          style:width="{Math.min(password.length / 16 * 100, 100)}%"
        ></div>
      </div>
      <p id="password-strength" class="hint">
        {password.length < 8 ? 'Weak' : password.length < 12 ? 'Good' : 'Strong'}
      </p>
    {/if}

    {#if getError('password')}
      <p id="password-error" class="error">{getError('password')}</p>
    {/if}
  </div>

  <button type="submit">Register</button>
</form>

<style>
  .field { margin-bottom: 20px; }
  label { display: block; font-weight: 600; margin-bottom: 6px; }

  input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  input[aria-invalid="true"] { border-color: #dc2626; }

  .error { color: #dc2626; font-size: 0.85rem; margin: 6px 0 0; }
  .hint { color: #64748b; font-size: 0.85rem; margin: 4px 0 0; }

  .strength-bar {
    height: 4px;
    background: #e2e8f0;
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
  }

  .strength-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.3s, background 0.3s;
  }

  .weak { background: #dc2626; }
  .medium { background: #f59e0b; }
  .strong { background: #16a34a; }

  button {
    width: 100%;
    padding: 12px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
  }
</style>
```

**Key UX decisions in this pattern:**
- **Validate on blur, not on every keystroke.** Showing errors while the user is still typing is annoying. Wait until they leave the field.
- **The `touched` state** tracks which fields the user has interacted with. Only show errors for touched fields.
- **Server errors override client errors** after form submission. This prevents the confusing case where client-side says "looks good" but server-side says "already taken."
- **Password strength indicator** gives visual feedback without blocking submission.

## Debounced Async Validation

For validations that require an API call (like checking username availability), debounce the request:

```svelte
<script lang="ts">
  let username = $state('');
  let usernameAvailable = $state<boolean | null>(null);
  let checking = $state(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (username.length < 3) {
      usernameAvailable = null;
      return;
    }

    checking = true;
    clearTimeout(debounceTimer);

    debounceTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-username?u=${encodeURIComponent(username)}`);
        const data = await res.json();
        usernameAvailable = data.available;
      } catch {
        usernameAvailable = null;
      } finally {
        checking = false;
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  });
</script>

<div class="field">
  <label for="username">Username</label>
  <div class="input-with-status">
    <input
      id="username"
      name="username"
      bind:value={username}
      autocomplete="off"
    />
    {#if checking}
      <span class="status checking">Checking...</span>
    {:else if usernameAvailable === true}
      <span class="status available">Available</span>
    {:else if usernameAvailable === false}
      <span class="status taken">Already taken</span>
    {/if}
  </div>
</div>

<style>
  .input-with-status {
    position: relative;
  }

  .status {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .checking { color: #64748b; }
  .available { color: #16a34a; }
  .taken { color: #dc2626; }
</style>
```

## Accessibility of Error Messages

Accessible error handling requires these specific patterns:

### aria-describedby Links Errors to Inputs

```svelte
<input
  id="email"
  name="email"
  aria-describedby="email-hint email-error"
/>
<p id="email-hint" class="hint">We will never share your email</p>
{#if error}
  <p id="email-error" class="error" role="alert">{error}</p>
{/if}
```

When the user focuses the email input, the screen reader announces: "Email, edit text. We will never share your email. Email is required."

### Live Regions Announce Errors Immediately

`role="alert"` creates an ARIA live region. When the error element appears in the DOM, screen readers announce its content immediately — the user does not need to navigate to it.

For a summary of all errors at the top of the form (useful after form submission):

```svelte
{#if form?.errors && Object.keys(form.errors).length > 0}
  <div class="error-summary" role="alert" aria-labelledby="error-heading">
    <h2 id="error-heading">There were errors with your submission</h2>
    <ul>
      {#each Object.entries(form.errors) as [field, message]}
        <li>
          <a href="#{field}">{message}</a>
        </li>
      {/each}
    </ul>
  </div>
{/if}
```

The error summary links to each field, so users can click to jump directly to the problem field. This is the pattern used by government accessibility standards (WCAG).

### Focus Management After Submission

After a failed submission, move focus to the first error or the error summary:

```svelte
<script>
  import { enhance } from '$app/forms';

  let errorSummary;

  function handleEnhance() {
    return async ({ result, update }) => {
      await update({ reset: false });

      if (result.type === 'failure') {
        // Focus the error summary so screen readers announce it
        errorSummary?.focus();
      }
    };
  }
</script>

<div bind:this={errorSummary} tabindex="-1" role="alert">
  {#if form?.errors}
    <!-- error summary content -->
  {/if}
</div>

<form method="POST" use:enhance={handleEnhance}>
  <!-- ... -->
</form>
```

`tabindex="-1"` allows the element to receive focus programmatically without being in the tab order.

## Complete Validated Form with Server + Client Validation

Here is a production-ready form that combines all patterns:

```typescript
// src/lib/schemas/contact.ts
import { z } from 'zod';

export const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Please enter a valid email').toLowerCase(),
  subject: z.enum(['general', 'support', 'billing', 'partnership'], {
    errorMap: () => ({ message: 'Please select a subject' })
  }),
  message: z.string().trim()
    .min(20, 'Message must be at least 20 characters')
    .max(2000, 'Message must be under 2000 characters'),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  agreeToPolicy: z.string().transform(v => v === 'on').pipe(
    z.literal(true, { errorMap: () => ({ message: 'You must agree to our privacy policy' }) })
  )
});

export type ContactInput = z.infer<typeof contactSchema>;
```

```typescript
// src/routes/contact/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { contactSchema } from '$lib/schemas/contact';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = contactSchema.safeParse(data);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!errors[field]) errors[field] = issue.message;
      }

      return fail(400, {
        errors,
        values: {
          name: data.name as string,
          email: data.email as string,
          subject: data.subject as string,
          message: data.message as string,
          priority: data.priority as string
        }
      });
    }

    // Send email, save to DB, etc.
    // await sendContactEmail(result.data);

    return { success: true };
  }
};
```

```svelte
<!-- src/routes/contact/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();

  // Client-side state for real-time feedback
  let message = $state(form?.values?.message ?? '');
  let charCount = $derived(message.length);
  let charLimit = 2000;

  let submitting = $state(false);

  function handleEnhance() {
    submitting = true;
    return async ({ update }) => {
      await update({ reset: false });
      submitting = false;
    };
  }

  function getError(field: string) {
    return form?.errors?.[field] ?? '';
  }
</script>

<h1>Contact Us</h1>

{#if form?.success}
  <div class="success" role="status">
    <h2>Message sent!</h2>
    <p>We will get back to you within 24 hours.</p>
  </div>
{:else}
  {#if form?.errors && Object.keys(form.errors).length > 0}
    <div class="error-summary" role="alert">
      <h2>Please fix the following errors:</h2>
      <ul>
        {#each Object.entries(form.errors) as [field, msg]}
          <li><a href="#{field}">{msg}</a></li>
        {/each}
      </ul>
    </div>
  {/if}

  <form method="POST" use:enhance={handleEnhance} novalidate>
    <div class="field">
      <label for="name">Name <span class="req">*</span></label>
      <input
        id="name"
        name="name"
        type="text"
        value={form?.values?.name ?? ''}
        required
        minlength="2"
        autocomplete="name"
        aria-invalid={getError('name') ? true : undefined}
        aria-describedby={getError('name') ? 'name-error' : undefined}
      />
      {#if getError('name')}
        <p id="name-error" class="error" role="alert">{getError('name')}</p>
      {/if}
    </div>

    <div class="field">
      <label for="email">Email <span class="req">*</span></label>
      <input
        id="email"
        name="email"
        type="email"
        value={form?.values?.email ?? ''}
        required
        autocomplete="email"
        aria-invalid={getError('email') ? true : undefined}
        aria-describedby={getError('email') ? 'email-error' : undefined}
      />
      {#if getError('email')}
        <p id="email-error" class="error" role="alert">{getError('email')}</p>
      {/if}
    </div>

    <div class="field">
      <label for="subject">Subject <span class="req">*</span></label>
      <select
        id="subject"
        name="subject"
        required
        aria-invalid={getError('subject') ? true : undefined}
        aria-describedby={getError('subject') ? 'subject-error' : undefined}
      >
        <option value="" disabled selected={!form?.values?.subject}>Choose a topic</option>
        <option value="general" selected={form?.values?.subject === 'general'}>General Inquiry</option>
        <option value="support" selected={form?.values?.subject === 'support'}>Technical Support</option>
        <option value="billing" selected={form?.values?.subject === 'billing'}>Billing Question</option>
        <option value="partnership" selected={form?.values?.subject === 'partnership'}>Partnership</option>
      </select>
      {#if getError('subject')}
        <p id="subject-error" class="error" role="alert">{getError('subject')}</p>
      {/if}
    </div>

    <div class="field">
      <label for="priority">Priority</label>
      <fieldset class="radio-group" role="radiogroup" aria-label="Priority level">
        {#each [
          { value: 'low', label: 'Low' },
          { value: 'normal', label: 'Normal' },
          { value: 'high', label: 'High' }
        ] as option}
          <label class="radio-label">
            <input
              type="radio"
              name="priority"
              value={option.value}
              checked={
                (form?.values?.priority ?? 'normal') === option.value
              }
            />
            {option.label}
          </label>
        {/each}
      </fieldset>
    </div>

    <div class="field">
      <label for="message">
        Message <span class="req">*</span>
        <span class="char-count" class:over={charCount > charLimit}>
          {charCount}/{charLimit}
        </span>
      </label>
      <textarea
        id="message"
        name="message"
        rows="6"
        required
        minlength="20"
        maxlength={charLimit}
        bind:value={message}
        aria-invalid={getError('message') ? true : undefined}
        aria-describedby={getError('message') ? 'message-error' : 'message-hint'}
      ></textarea>
      <p id="message-hint" class="hint">Minimum 20 characters</p>
      {#if getError('message')}
        <p id="message-error" class="error" role="alert">{getError('message')}</p>
      {/if}
    </div>

    <div class="field">
      <label class="checkbox-label">
        <input
          type="checkbox"
          name="agreeToPolicy"
          aria-invalid={getError('agreeToPolicy') ? true : undefined}
          aria-describedby={getError('agreeToPolicy') ? 'policy-error' : undefined}
        />
        I agree to the <a href="/privacy">Privacy Policy</a> <span class="req">*</span>
      </label>
      {#if getError('agreeToPolicy')}
        <p id="policy-error" class="error" role="alert">{getError('agreeToPolicy')}</p>
      {/if}
    </div>

    <button type="submit" disabled={submitting}>
      {submitting ? 'Sending...' : 'Send Message'}
    </button>
  </form>
{/if}

<style>
  form { max-width: 550px; }

  .field { margin-bottom: 20px; }

  label {
    display: block;
    font-weight: 600;
    margin-bottom: 6px;
    font-size: 0.95rem;
  }

  .req { color: #dc2626; }

  .char-count {
    float: right;
    font-weight: 400;
    font-size: 0.8rem;
    color: #64748b;
  }

  .char-count.over { color: #dc2626; }

  input[type="text"],
  input[type="email"],
  select,
  textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
    transition: border-color 0.2s;
  }

  textarea {
    font-family: inherit;
    resize: vertical;
  }

  input:focus, select:focus, textarea:focus {
    outline: 2px solid #3498db;
    outline-offset: 1px;
    border-color: #3498db;
  }

  input[aria-invalid="true"],
  select[aria-invalid="true"],
  textarea[aria-invalid="true"] {
    border-color: #dc2626;
  }

  .radio-group {
    display: flex;
    gap: 20px;
    border: none;
    padding: 0;
    margin: 0;
  }

  .radio-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 400;
    cursor: pointer;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 400;
    cursor: pointer;
  }

  .error {
    color: #dc2626;
    font-size: 0.85rem;
    margin: 6px 0 0;
  }

  .hint {
    color: #64748b;
    font-size: 0.8rem;
    margin: 4px 0 0;
  }

  .error-summary {
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 16px 20px;
    margin-bottom: 24px;
  }

  .error-summary h2 {
    color: #991b1b;
    font-size: 1rem;
    margin: 0 0 8px;
  }

  .error-summary ul {
    margin: 0;
    padding-left: 20px;
  }

  .error-summary a {
    color: #dc2626;
    font-size: 0.9rem;
  }

  .success {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 8px;
    padding: 24px;
    text-align: center;
  }

  .success h2 { color: #166534; margin: 0 0 8px; }
  .success p { color: #15803d; margin: 0; }

  button {
    width: 100%;
    padding: 14px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s;
  }

  button:hover { background: #2980b9; }
  button:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
```

## Try It

Create a "Create Post" form with full validation:

1. **Schema**: Define a Zod schema with:
   - `title` — 3 to 100 characters, trimmed
   - `slug` — only lowercase letters, numbers, and hyphens (use regex)
   - `content` — at least 50 characters
   - `category` — one of "tutorial", "news", or "opinion"
   - `tags` — array of strings, 1-5 tags required
   - `publishDate` — optional, but if provided must be in the future

2. **Server action**: Validate with the schema, return field-level errors with `fail()`, preserve submitted values

3. **Client-side**: Add real-time validation on blur for the slug field (check format) and a character counter for content. Auto-generate the slug from the title using `$effect`.

4. **Accessibility**: Include an error summary at the top, `aria-describedby` on every field, `role="alert"` on errors, and focus management after failed submission

## Key Takeaways

- Always validate on the server — client-side validation is for UX, server-side is for security
- Use `fail(400, { errors, values })` to return validation errors and preserve user input
- Schema libraries (Zod, Valibot) make validation declarative, composable, and type-safe
- Display errors next to fields with `{#if form?.errors?.fieldName}` and style invalid inputs with `aria-invalid`
- Use `{ reset: false }` in `use:enhance` to keep form values after failed validation
- Handle cross-field validation with Zod's `.refine()` method
- Validate file uploads for type and size on the server
- For real-time validation, use `onblur` + touched state — never validate while the user is still typing
- Debounce async validations (like username availability) to avoid excessive API calls
- Accessible error handling requires `aria-describedby`, `aria-invalid`, `role="alert"`, error summaries, and focus management
- Never return sensitive data (passwords, tokens) in the failure response
- Validate schema first (fast), then database constraints (slow) — fail fast
