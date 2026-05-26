# Schema Validation in SvelteKit

You now have two powerful schema validation libraries in your toolkit: Zod (lesson 1) and Valibot (lesson 2). You understand how to define schemas, parse data, transform values, and extract TypeScript types. But a schema sitting in a file is inert — it only becomes valuable when it intercepts untrusted data at the boundaries of your application. This lesson is about those boundaries.

SvelteKit has several places where data enters your application: form submissions, API requests, URL parameters, search params, and external API responses. Each is a boundary. Each needs validation. The question is not *whether* to validate, but *where*, *how*, and *with what ergonomics*. By the end of this lesson, you will have a battle-tested architecture for integrating schema validation into every layer of a SvelteKit application — shared schemas, server-side enforcement, client-side feedback, and reusable utilities that eliminate boilerplate.

A note on form actions: this lesson previews form actions because they are the most common place you will use schema validation. You will learn form actions in full depth in module 19. For now, focus on the validation patterns — the form action mechanics will click into place when you reach that module.

## The Validation Architecture

Before writing any code, you need a mental model of where validation runs in a SvelteKit application. Data enters your app through multiple doors, and each door needs a guard:

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                      │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  Client-Side Validation                             │    │
│   │  Purpose: instant UX feedback                       │    │
│   │  Runs: before form submission                       │    │
│   │  Trust level: ZERO (user can bypass)                │    │
│   └─────────────────────┬───────────────────────────────┘    │
│                         │ form submit / fetch()              │
├─────────────────────────┼────────────────────────────────────┤
│                         ▼                                    │
│                        SERVER                                │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  Form Actions (+page.server.ts)                     │    │
│   │  Purpose: validate form submissions                 │    │
│   │  Runs: server only                                  │    │
│   │  Trust level: AUTHORITATIVE                         │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  API Routes (+server.ts)                            │    │
│   │  Purpose: validate JSON bodies, query params        │    │
│   │  Runs: server only                                  │    │
│   │  Trust level: AUTHORITATIVE                         │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  Load Functions (+page.server.ts / +page.ts)        │    │
│   │  Purpose: validate URL params, search params,       │    │
│   │           external API responses                    │    │
│   │  Runs: server (server load) or server+client        │    │
│   │         (universal load)                            │    │
│   │  Trust level: AUTHORITATIVE for user input          │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

The principle is **validate everywhere, trust nothing**:

- **Client-side validation** is a courtesy. It gives the user instant feedback — "this email is invalid" — without waiting for a server round trip. But it can always be bypassed. A user can open DevTools, disable JavaScript, or send a raw HTTP request with `curl`. Client-side validation is never security.
- **Server-side validation** is the authority. It runs in an environment the user cannot tamper with. Every form action, every API route, every load function that accepts user input must validate that input on the server. This is not optional. This is the law.

The key insight: **you write the schema once and import it in both places**. The client uses it for fast feedback. The server uses it for enforcement. Same schema, two purposes.

## The Shared Schema Pattern

The single most important architectural decision for validation in SvelteKit is where your schemas live. The answer is `$lib/schemas/`.

### Folder Structure

```
src/
├── lib/
│   ├── schemas/
│   │   ├── user.ts          # User registration, login, profile update
│   │   ├── post.ts          # Blog post create, update
│   │   ├── contact.ts       # Contact form
│   │   ├── search.ts        # Search and pagination params
│   │   └── index.ts         # Re-exports for convenience
│   ├── server/
│   │   └── database.ts
│   └── components/
│       └── ui/
│           └── FieldError.svelte
├── routes/
│   ├── register/
│   │   ├── +page.svelte     # Imports schema for client validation
│   │   └── +page.server.ts  # Imports same schema for server validation
│   └── api/
│       └── users/
│           └── +server.ts   # Imports same schema for API validation
```

### Why This Matters

```typescript
// src/lib/schemas/user.ts
import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().email('Please enter a valid email').toLowerCase(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must include an uppercase letter')
    .regex(/[0-9]/, 'Must include a number')
});

// Type is derived from the schema — not defined separately
export type RegisterInput = z.infer<typeof registerSchema>;
```

This schema is the **single source of truth** for three things simultaneously:

1. **Validation rules** — what data is acceptable
2. **TypeScript types** — what shape the data has after validation
3. **Error messages** — what to tell the user when validation fails

Without shared schemas, you end up with validation logic scattered across files, types that drift out of sync with validation rules, and error messages that contradict each other. The `$lib/schemas/` pattern eliminates all three problems.

### The Same Schema in Valibot

```typescript
// src/lib/schemas/user.ts (Valibot version)
import * as v from 'valibot';

export const registerSchema = v.object({
  name: v.pipe(
    v.string('Name is required'),
    v.trim(),
    v.minLength(2, 'Name must be at least 2 characters'),
    v.maxLength(100, 'Name must be under 100 characters')
  ),
  email: v.pipe(
    v.string('Email is required'),
    v.trim(),
    v.email('Please enter a valid email'),
    v.toLowerCase()
  ),
  password: v.pipe(
    v.string('Password is required'),
    v.minLength(8, 'Password must be at least 8 characters'),
    v.regex(/[A-Z]/, 'Must include an uppercase letter'),
    v.regex(/[0-9]/, 'Must include a number')
  )
});

export type RegisterInput = v.InferOutput<typeof registerSchema>;
```

From here on, every example imports from `$lib/schemas/`. This is the foundation everything else builds on.

## Form Action Validation with Zod

Form actions are the primary way SvelteKit processes form submissions. They run exclusively on the server, making them the authoritative validation point. You will learn form actions fully in module 19 — here we focus on how schema validation slots into the pattern.

### WRONG: Inline Validation in the Action

```typescript
// src/routes/register/+page.server.ts — WRONG
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    const errors: Record<string, string> = {};
    if (!name || name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email';
    if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters';
    // What about uppercase? Numbers? Trimming? Lowercasing email? Already incomplete.

    if (Object.keys(errors).length > 0) return fail(400, { errors, values: { name, email } });
    return { success: true };
  }
};
```

Problems: validation rules are embedded in the action and cannot be reused on the client. No TypeScript type inference. No data transformation. Easy to forget rules or have them diverge. If you add a field, you update validation in multiple places.

### CORRECT: Schema-Based Validation

```typescript
// src/routes/register/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { registerSchema } from '$lib/schemas/user';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = registerSchema.safeParse(data);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      }

      return fail(400, {
        errors,
        values: { name: data.name as string, email: data.email as string }
        // Never return password
      });
    }

    // result.data is fully typed: { name: string; email: string; password: string }
    // Transforms already applied: name is trimmed, email is lowercased
    const { name, email, password } = result.data;
    // await createUser(name, email, password);

    return { success: true };
  }
};
```

The schema handles everything: type checking, constraint validation, data transformation, and error messages. The action code is just plumbing — parse, check, respond.

### Displaying Errors in the Page

```svelte
<!-- src/routes/register/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<form method="POST" use:enhance={() => {
  return async ({ update }) => {
    await update({ reset: false });
  };
}}>
  <!-- Repeat this pattern for each field -->
  <div class="field">
    <label for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      value={form?.values?.email ?? ''}
      aria-invalid={form?.errors?.email ? true : undefined}
      aria-describedby={form?.errors?.email ? 'email-error' : undefined}
    />
    {#if form?.errors?.email}
      <p id="email-error" class="error" role="alert">{form.errors.email}</p>
    {/if}
  </div>

  <!-- ... name and password fields follow the same pattern ... -->
  <button type="submit">Register</button>
</form>
```

The key details: `use:enhance` with `{ reset: false }` preserves user input after a validation failure. `aria-invalid` and `aria-describedby` ensure screen readers announce errors. `role="alert"` makes errors announced immediately when they appear.

## Form Action Validation with Valibot

The pattern is nearly identical. The main difference is how you extract errors from the result — Valibot structures its issues differently than Zod.

### The Action

```typescript
// src/routes/register/+page.server.ts (Valibot version)
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import * as v from 'valibot';
import { registerSchema } from '$lib/schemas/user';

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = Object.fromEntries(formData);

    const result = v.safeParse(registerSchema, data);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.issues) {
        const field = issue.path?.[0]?.key as string;
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      }

      return fail(400, {
        errors,
        values: { name: data.name as string, email: data.email as string }
      });
    }

    const { name, email, password } = result.output;
    // await createUser(name, email, password);

    return { success: true };
  }
};
```

Notice the differences from Zod: `v.safeParse(schema, data)` instead of `schema.safeParse(data)`, `result.issues` instead of `result.error.issues`, `issue.path?.[0]?.key` instead of `issue.path[0]`, and `result.output` instead of `result.data`.

### A flattenErrors Utility

As we saw in the Valibot lesson, Valibot's issue structure can be nested. A utility function that converts issues into a simple `Record<string, string[]>` saves repeated work:

```typescript
// src/lib/utils/validation.ts
import type { BaseIssue } from 'valibot';

/**
 * Converts Valibot issues into a flat record of field names to error messages.
 * Returns all errors per field (not just the first), letting the UI decide
 * how many to display.
 */
export function flattenErrors(
  issues: BaseIssue<unknown>[]
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === 'string') {
      if (!errors[key]) {
        errors[key] = [];
      }
      errors[key].push(issue.message);
    }
  }

  return errors;
}

/**
 * Same as flattenErrors but returns only the first error per field.
 * Better for form UIs where showing one error at a time is less overwhelming.
 */
export function flattenFirstError(
  issues: BaseIssue<unknown>[]
): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of issues) {
    const key = issue.path?.[0]?.key;
    if (typeof key === 'string' && !errors[key]) {
      errors[key] = issue.message;
    }
  }

  return errors;
}
```

Now the action becomes cleaner:

```typescript
import { flattenFirstError } from '$lib/utils/validation';

// Inside the action:
if (!result.success) {
  return fail(400, {
    errors: flattenFirstError(result.issues),
    values: { name: data.name as string, email: data.email as string }
  });
}
```

This utility works for any Valibot schema in any action or API route — write it once, use it everywhere.

## API Route Validation

API routes in `+server.ts` serve external clients, mobile apps, webhooks, and your own frontend `fetch()` calls. The data entering these routes is even less trustworthy than form submissions because there is no browser enforcing field types. A `POST` body could contain anything.

### Validating a POST Body

```typescript
// src/routes/api/users/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { registerSchema } from '$lib/schemas/user';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw error(400, { message: 'Request body must be valid JSON' });
  }

  const result = registerSchema.safeParse(body);

  if (!result.success) {
    // Return structured errors so API clients can display field-level messages
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? '_root');
      if (!fieldErrors[field]) fieldErrors[field] = [];
      fieldErrors[field].push(issue.message);
    }

    return json({ error: 'Validation failed', fields: fieldErrors }, { status: 400 });
  }

  // result.data is fully typed and transformed
  const user = result.data;
  // const created = await db.insert(users).values(user);

  return json({ user }, { status: 201 });
};
```

Key differences from form actions: you parse JSON instead of FormData, you return `json()` instead of `fail()`, and you include structured error details in the response body so API consumers can programmatically handle specific field errors.

### Validating GET Query Parameters

GET requests carry data in the URL. Query params are always strings, so your schema needs to handle coercion:

```typescript
// src/lib/schemas/search.ts
import { z } from 'zod';

export const searchParamsSchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['newest', 'oldest', 'relevant']).default('relevant')
});

export type SearchParams = z.infer<typeof searchParamsSchema>;
```

```typescript
// src/routes/api/search/+server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchParamsSchema } from '$lib/schemas/search';

export const GET: RequestHandler = async ({ url }) => {
  const rawParams = Object.fromEntries(url.searchParams);
  const result = searchParamsSchema.safeParse(rawParams);

  if (!result.success) {
    return json(
      { error: 'Invalid query parameters', details: result.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { q, page, limit, sort } = result.data;
  // page is a number (coerced from string), limit has a default, sort is a valid enum value
  // const results = await searchProducts(q, { page, limit, sort });

  return json({ results: [], page, limit });
};
```

The `z.coerce.number()` is critical here. URL search params are always strings — `?page=2` gives you the string `"2"`, not the number `2`. Coercion handles this conversion as part of validation, so by the time you use `result.data.page`, it is guaranteed to be a valid integer.

### Valibot Note on Query Params

The Valibot equivalent replaces `z.coerce.number()` with an explicit `v.transform(Number)` step in the pipe. For example, `page` becomes `v.optional(v.pipe(v.string(), v.transform(Number), v.integer(), v.minValue(1)), '1')`. Both achieve the same result — the approach differs, not the outcome.

## Load Function Validation

Load functions in `+page.server.ts` receive URL parameters and search params that come from the user's browser. A `params.id` that should be a UUID could be anything — validate it before using it in a database query.

### Validating Route Parameters

```typescript
// src/lib/schemas/params.ts
import { z } from 'zod';

export const uuidParam = z.string().uuid('Invalid ID format');

export const paginationParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
```

```typescript
// src/routes/users/[id]/+page.server.ts
import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { uuidParam } from '$lib/schemas/params';

export const load: PageServerLoad = async ({ params }) => {
  const result = uuidParam.safeParse(params.id);

  if (!result.success) {
    throw error(404, 'User not found');
  }

  // result.data is a validated UUID string
  // const user = await db.select().from(users).where(eq(users.id, result.data));
  const user = { id: result.data, name: 'Alice', email: 'alice@example.com' };

  return { user };
};
```

Notice we throw a 404, not a 400. From the user's perspective, a malformed ID means the resource does not exist — they do not need to know about UUIDs. This is a UX and security choice: do not reveal your internal data model in error messages.

### Validating Search Params in Load Functions

```typescript
// src/routes/products/+page.server.ts
import type { PageServerLoad } from './$types';
import { paginationParams } from '$lib/schemas/params';

export const load: PageServerLoad = async ({ url }) => {
  const rawParams = {
    page: url.searchParams.get('page') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined
  };

  // If params are invalid, fall back to defaults rather than throwing
  const result = paginationParams.safeParse(rawParams);
  const { page, limit } = result.success ? result.data : { page: 1, limit: 20 };

  // const products = await db.select().from(products).limit(limit).offset((page - 1) * limit);

  return {
    products: [],
    pagination: { page, limit, total: 0 }
  };
};
```

The fallback-to-defaults pattern is often better than throwing errors for search params. If someone visits `/products?page=abc`, showing page 1 is friendlier than showing an error page. Use your judgment: throw for params that must be valid (like a user ID), fall back for params that have sensible defaults (like pagination).

## Client-Side Pre-Validation

Server validation ensures security. Client validation ensures a good experience. The user should not wait for a server round trip to learn their email is malformed. The trick is using the **same schema** on the client so your rules never diverge.

### WRONG: Duplicate Validation Logic

```svelte
<!-- WRONG — validation rules are duplicated and will drift -->
<script lang="ts">
  let errors = $state<Record<string, string>>({});

  function validate(name: string, email: string, password: string) {
    errors = {};
    // These rules are copy-pasted from the server — they WILL get out of sync
    if (name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Invalid email';
    if (password.length < 8) errors.password = 'Too short';
    // Forgot the uppercase check? The number check? Already out of sync.
    return Object.keys(errors).length === 0;
  }
</script>
```

### CORRECT: Import the Shared Schema

```svelte
<!-- src/routes/register/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';
  import { registerSchema } from '$lib/schemas/user';

  let { form }: { form: ActionData } = $props();

  let clientErrors = $state<Record<string, string>>({});
  let touched = $state<Record<string, boolean>>({});

  function validateField(field: string, value: string) {
    const fieldSchema = registerSchema.shape[field as keyof typeof registerSchema.shape];
    if (!fieldSchema) return;

    const result = fieldSchema.safeParse(value);
    if (!result.success) {
      clientErrors[field] = result.error.issues[0].message;
    } else {
      delete clientErrors[field];
    }
  }

  function handleBlur(field: string, value: string) {
    touched[field] = true;
    validateField(field, value);
  }

  function handleSubmit(event: SubmitEvent) {
    const formData = new FormData(event.target as HTMLFormElement);
    const data = Object.fromEntries(formData);
    const result = registerSchema.safeParse(data);

    if (!result.success) {
      clientErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!clientErrors[field]) clientErrors[field] = issue.message;
        touched[field] = true;
      }
      event.preventDefault(); // Stop submission — errors found
      return;
    }

    clientErrors = {};
    // Validation passed — let the form submit to the server
    // The server will validate again (defense in depth)
  }
</script>

<form method="POST" onsubmit={handleSubmit} use:enhance={() => {
  return async ({ update }) => {
    await update({ reset: false });
  };
}}>
  <!-- Repeat this pattern for each field (name, email, password) -->
  <div class="field">
    <label for="email">Email</label>
    <input
      id="email"
      name="email"
      type="email"
      value={form?.values?.email ?? ''}
      onblur={(e) => handleBlur('email', e.currentTarget.value)}
      aria-invalid={touched.email && (clientErrors.email || form?.errors?.email) ? true : undefined}
      aria-describedby={clientErrors.email || form?.errors?.email ? 'email-error' : undefined}
    />
    {#if touched.email && clientErrors.email}
      <p id="email-error" class="error" role="alert">{clientErrors.email}</p>
    {:else if form?.errors?.email}
      <p id="email-error" class="error" role="alert">{form.errors.email}</p>
    {/if}
  </div>

  <!-- ... name and password fields follow the same pattern ... -->

  <button type="submit">Register</button>
</form>
```

The critical detail: `registerSchema` is the exact same import used in `+page.server.ts`. If you add a validation rule to the schema, both client and server get it immediately. Zero drift. The `touched` state ensures we only show client errors for fields the user has interacted with — we do not yell at them before they have had a chance to type.

## Remote Functions Validation

SvelteKit's `form()` remote functions (module 41) take schema validation a step further by making the schema a first-class part of the function definition. You will learn remote functions in depth later, but it is worth previewing how they integrate with the validation patterns you are learning now.

A remote function defines its validation schema inline. The schema validates on the server, and the function provides field helpers that make error display trivial:

```typescript
// src/lib/api/posts.remote.ts
import { form } from '$app/server';
import * as v from 'valibot';

export const createPost = form(
  v.object({
    title: v.pipe(
      v.string(),
      v.trim(),
      v.minLength(3, 'Title must be at least 3 characters'),
      v.maxLength(200, 'Title must be under 200 characters')
    ),
    body: v.pipe(
      v.string(),
      v.minLength(10, 'Body must be at least 10 characters')
    ),
    category: v.picklist(['tech', 'design', 'news'], 'Please select a category')
  }),
  async (data) => {
    // data is fully validated and typed — just do the work
    // await db.insert(postsTable).values(data);
  }
);
```

In the component, field helpers generate all the attributes you need:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
</script>

<form {...createPost}>
  <label>
    Title
    <input {...createPost.fields.title.as('text')} />
  </label>

  {#each createPost.fields.title.issues() as issue}
    <p class="error" role="alert">{issue}</p>
  {/each}

  <label>
    Body
    <textarea {...createPost.fields.body.as('textarea')}></textarea>
  </label>

  {#each createPost.fields.body.issues() as issue}
    <p class="error" role="alert">{issue}</p>
  {/each}

  <button type="submit">Publish</button>
</form>
```

The `.as('text')` helper sets `name`, `type`, `value`, `aria-invalid`, and `aria-describedby` attributes automatically. The `.issues()` method returns validation error messages for that specific field. No manual error extraction, no `Record<string, string>` plumbing. The schema does everything.

This is the direction SvelteKit's form handling is heading: schema validation is not bolted on — it is built in. The patterns you are learning in this lesson (shared schemas, server validation, client feedback) are the same patterns, just with less boilerplate.

## FormData Parsing Utilities

There is a gap between what `FormData` gives you and what your schema expects. `FormData.get()` returns `string | File | null`. Checkboxes submit `"on"` or nothing. Number inputs submit strings. Multi-selects require `getAll()`. A parsing utility bridges this gap.

### The Problem

`Object.fromEntries(formData)` looks clean but has four bugs: (1) checkboxes submit `"on"` instead of `true`, and nothing when unchecked — not `false`; (2) number inputs submit strings like `"25"` — your schema expects a number; (3) multi-selects lose all but the last value because `Object.fromEntries` deduplicates keys; (4) unchecked checkboxes have no entry at all, so your schema never sees `{ agree: false }`.

### A parseFormData Utility

```typescript
// src/lib/utils/form-data.ts

interface ParseOptions {
  /** Field names that should be parsed as booleans (checkboxes) */
  booleans?: string[];
  /** Field names that should be parsed as numbers */
  numbers?: string[];
  /** Field names that should be parsed as arrays (multi-select, repeated fields) */
  arrays?: string[];
}

/**
 * Converts FormData into a plain object suitable for schema validation.
 * Handles checkboxes (on/off → boolean), number coercion, and multi-value fields.
 */
export function parseFormData(formData: FormData, options: ParseOptions = {}): Record<string, unknown> {
  const { booleans = [], numbers = [], arrays = [] } = options;
  const result: Record<string, unknown> = {};

  // Handle arrays first (getAll captures all values)
  for (const field of arrays) {
    result[field] = formData.getAll(field).map(String);
  }

  // Handle booleans (checkboxes)
  for (const field of booleans) {
    result[field] = formData.has(field);
  }

  // Handle remaining fields
  for (const [key, value] of formData.entries()) {
    if (arrays.includes(key) || booleans.includes(key)) continue; // Already handled

    if (numbers.includes(key)) {
      const str = value.toString();
      result[key] = str === '' ? undefined : Number(str);
    } else {
      result[key] = value; // string or File
    }
  }

  return result;
}
```

### Using It in a Form Action (Zod)

```typescript
// src/routes/settings/+page.server.ts
import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { parseFormData } from '$lib/utils/form-data';

const settingsSchema = z.object({
  displayName: z.string().trim().min(1, 'Display name is required').max(50),
  bio: z.string().max(500).default(''),
  emailNotifications: z.boolean(),
  maxResults: z.number().int().min(5).max(100),
  interests: z.array(z.string()).min(1, 'Select at least one interest')
});

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const data = parseFormData(formData, {
      booleans: ['emailNotifications'],
      numbers: ['maxResults'],
      arrays: ['interests']
    });

    const result = settingsSchema.safeParse(data);

    if (!result.success) {
      const errors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!errors[field]) errors[field] = issue.message;
      }
      return fail(400, { errors });
    }

    // result.data has correct types:
    // emailNotifications is boolean, maxResults is number, interests is string[]
    return { success: true };
  }
};
```

The `parseFormData` utility is library-agnostic. For Valibot, swap the Zod schema for its Valibot equivalent, use `v.safeParse(schema, data)`, and extract errors with the `flattenFirstError` utility from earlier. The `parseFormData` call and its options stay identical — write the utility once, use it with either library.

## Advanced Patterns

### Schema Composition: Base, Create, and Update

Real applications rarely have just one schema per entity. You need a base schema (shared rules), a creation schema (all fields required), and an update schema (all fields optional for PATCH operations):

```typescript
// src/lib/schemas/post.ts
import { z } from 'zod';

// Base schema — shared field definitions
const postBase = z.object({
  title: z.string().trim().min(3).max(200),
  body: z.string().min(10),
  category: z.enum(['tech', 'design', 'news']),
  published: z.boolean().default(false)
});

// Create schema — all fields required (except those with defaults)
export const createPostSchema = postBase;

// Update schema — all fields optional (PATCH semantics)
export const updatePostSchema = postBase.partial();

// With ID — for operations that reference an existing post
export const postWithIdSchema = postBase.extend({
  id: z.string().uuid()
});

// Types derived from schemas
export type CreatePost = z.infer<typeof createPostSchema>;
export type UpdatePost = z.infer<typeof updatePostSchema>;
export type PostWithId = z.infer<typeof postWithIdSchema>;
```

For Valibot, use `v.partial(postBase)` for the update schema and `v.object({ ...postBase.entries, id: v.pipe(v.string(), v.uuid()) })` to extend with an ID field.

Now your PUT and PATCH handlers use different schemas for the same entity:

```typescript
// src/routes/api/posts/[id]/+server.ts
export const PUT: RequestHandler = async ({ request, params }) => {
  const body = await request.json();
  const result = createPostSchema.safeParse(body); // All fields required
  // ...
};

export const PATCH: RequestHandler = async ({ request, params }) => {
  const body = await request.json();
  const result = updatePostSchema.safeParse(body); // All fields optional
  // ...
};
```

### Conditional Validation: Discriminated Schemas

Sometimes the validation rules depend on a field's value. A payment form validates different fields depending on whether the user chose "credit card" or "bank transfer":

```typescript
// src/lib/schemas/payment.ts
import { z } from 'zod';

const creditCardSchema = z.object({
  method: z.literal('credit_card'),
  cardNumber: z.string().regex(/^\d{16}$/, 'Card number must be 16 digits'),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/, 'Use MM/YY format'),
  cvv: z.string().regex(/^\d{3,4}$/, 'CVV must be 3 or 4 digits')
});

const bankTransferSchema = z.object({
  method: z.literal('bank_transfer'),
  accountNumber: z.string().min(8, 'Invalid account number'),
  routingNumber: z.string().length(9, 'Routing number must be 9 digits')
});

// Zod picks the right schema based on the 'method' field
export const paymentSchema = z.discriminatedUnion('method', [
  creditCardSchema,
  bankTransferSchema
]);

export type PaymentInput = z.infer<typeof paymentSchema>;
```

The Valibot equivalent uses `v.variant('method', [...])` instead of `z.discriminatedUnion()` — as we covered in the Valibot lesson.

In your form action, you parse the form data once, and the discriminated union validates the correct set of fields based on the `method` value. If someone submits `method=credit_card` without a `cardNumber`, the error is specific: "Card number must be 16 digits." If they submit `method=bank_transfer`, the card fields are not checked at all.

### File Upload Validation

FormData can contain `File` objects from `<input type="file">`. Schema validation can check file type and size:

```typescript
// src/lib/schemas/upload.ts
import { z } from 'zod';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export const avatarUploadSchema = z.object({
  avatar: z
    .instanceof(File, { message: 'Please select a file' })
    .refine((file) => file.size > 0, 'File is empty')
    .refine((file) => file.size <= MAX_FILE_SIZE, 'File must be under 5MB')
    .refine(
      (file) => ACCEPTED_TYPES.includes(file.type),
      'Only JPEG, PNG, and WebP images are accepted'
    )
});
```

```typescript
// In a form action:
export const actions: Actions = {
  upload: async ({ request }) => {
    const formData = await request.formData();
    const data = { avatar: formData.get('avatar') };

    const result = avatarUploadSchema.safeParse(data);

    if (!result.success) {
      return fail(400, {
        errors: { avatar: result.error.issues[0].message }
      });
    }

    const file = result.data.avatar;
    // file is a validated File object: correct type, under 5MB
    // await uploadToStorage(file);

    return { success: true };
  }
};
```

Note: `z.instanceof(File)` works in SvelteKit because form actions run in a Node-compatible environment that has the `File` class. For Valibot, use `v.instance(File)` in the same way.

### Environment Variable Validation

Your app depends on environment variables being present and correctly formatted. Validate them at startup so you get a clear error instead of a cryptic runtime failure:

```typescript
// src/lib/server/env.ts
import { z } from 'zod';
import { env } from '$env/dynamic/private';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535),
  REDIS_URL: z.string().url().optional()
});

const result = envSchema.safeParse(env);

if (!result.success) {
  console.error('Invalid environment variables:');
  for (const issue of result.error.issues) {
    console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  }
  throw new Error('Environment validation failed — check your .env file');
}

export const validatedEnv = result.data;
```

Now import `validatedEnv` instead of `env` throughout your server code. You get TypeScript autocomplete, guaranteed presence, and correct types. If someone deploys without setting `DATABASE_URL`, the app fails immediately with a clear message instead of crashing at the first database call.

## Error Display Component

After writing error display markup a few times, you will want a reusable component. This `FieldError` component handles the `aria-describedby` linkage and renders accessible error messages:

```svelte
<!-- src/lib/components/ui/FieldError.svelte -->
<script lang="ts">
  interface Props {
    /** The field name — used to generate a unique ID for aria-describedby */
    field: string;
    /** The error message, if any. Falsy values render nothing. */
    error: string | undefined | null;
  }

  let { field, error }: Props = $props();

  let id = $derived(`${field}-error`);
</script>

{#if error}
  <p {id} class="field-error" role="alert">
    {error}
  </p>
{/if}

<style>
  .field-error {
    color: #dc2626;
    font-size: 0.875rem;
    margin: 4px 0 0;
  }
</style>
```

Use it in forms to replace the repeated `{#if}` blocks: `<FieldError field="email" error={form?.errors?.email} />`. The input still needs `aria-describedby="email-error"` to link to the error — the component generates that ID from the `field` prop.

The component is intentionally minimal. It does one thing: render an accessible error message with a predictable ID. Do not try to build a mega-component that handles input rendering, label rendering, error rendering, and accessibility all at once — that becomes an unmanageable abstraction. Keep the pieces small and compose them.

## Testing Schemas

Schemas are pure functions: data in, result out. This makes them ideal for unit testing. Test them independently from your routes and actions so you catch validation bugs early.

### Example Tests (Zod)

```typescript
// src/lib/schemas/user.test.ts
import { describe, it, expect } from 'vitest';
import { registerSchema } from './user';

describe('registerSchema', () => {
  const validData = {
    name: 'Alice Johnson',
    email: 'alice@example.com',
    password: 'Secure1pass'
  };

  it('accepts valid data', () => {
    const result = registerSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('trims name and lowercases email', () => {
    const result = registerSchema.safeParse({
      ...validData,
      name: '  Alice  ',
      email: 'ALICE@EXAMPLE.COM'
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Alice');
      expect(result.data.email).toBe('alice@example.com');
    }
  });

  it('rejects short password with a clear message', () => {
    const result = registerSchema.safeParse({ ...validData, password: 'Ab1' });

    expect(result.success).toBe(false);
    if (!result.success) {
      const passwordErrors = result.error.issues.filter((i) => i.path[0] === 'password');
      expect(passwordErrors[0].message).toContain('at least 8 characters');
    }
  });

  it('rejects invalid email format', () => {
    const result = registerSchema.safeParse({ ...validData, email: 'not-an-email' });
    expect(result.success).toBe(false);
  });
});
```

For Valibot, the test structure is identical — swap `registerSchema.safeParse(data)` for `v.safeParse(registerSchema, data)`, access `result.issues` instead of `result.error.issues`, and use `issue.path?.[0]?.key` instead of `issue.path[0]` to read the field name.

### What to Test

Focus your schema tests on:

1. **Valid data passes** — the happy path. If this fails, your schema is too strict.
2. **Each validation rule rejects** — test boundary cases: one character too short, missing required fields, wrong format.
3. **Transforms produce expected output** — `trim()`, `toLowerCase()`, `transform()` results should be exact.
4. **Edge cases** — empty strings, very long strings, Unicode characters, special characters, `null`, `undefined`.
5. **Cross-field validation** — if you use `.refine()` or `v.forward(v.check(...))`, test the interaction between fields (e.g., password and confirmPassword must match).

Schema tests are fast (no I/O, no database, no network) and catch bugs early. Run them as part of your standard `vitest` suite.

## Try It

### Exercise 1: Contact Form with Shared Schema

Build a contact form that validates on both client and server.

1. Create `src/lib/schemas/contact.ts` with a schema for `name` (2-100 chars, trimmed), `email` (valid email, lowercased), `subject` (one of "general", "support", "billing"), and `message` (10-2000 chars). Use whichever library you prefer.
2. Create `src/routes/contact/+page.server.ts` with a form action that validates using the schema and returns field errors with `fail()`.
3. Create `src/routes/contact/+page.svelte` that imports the same schema for client-side validation on blur, shows errors next to each field, and preserves input values after server-side validation failure.
4. Include a `<select>` for the subject field and verify the schema rejects invalid subject values.

### Exercise 2: API Route with Pagination

Build a search API that validates query parameters.

1. Create `src/lib/schemas/search.ts` with a schema for `q` (1-200 chars), `page` (positive integer, default 1), `limit` (1-100 integer, default 20), and `category` (optional, one of several predefined values).
2. Create `src/routes/api/search/+server.ts` with a GET handler that validates `url.searchParams` using the schema.
3. Return a 400 with structured error details if validation fails. Return mock results with pagination metadata if validation passes.
4. Test the endpoint by visiting `/api/search?q=test&page=abc` — it should return a 400 error. `/api/search?q=test` should return results with default pagination.

### Exercise 3: Multi-Schema Settings Page

Build a settings page that handles checkboxes, numbers, and arrays.

1. Create `src/lib/schemas/settings.ts` with a schema for `displayName` (required string), `bio` (optional, max 500 chars), `emailNotifications` (boolean), `theme` (one of "light", "dark", "system"), `fontSize` (number, 12-24), and `interests` (array of strings, 1-5 items).
2. Use the `parseFormData` utility from this lesson to handle checkbox, number, and multi-select fields.
3. Write Vitest tests for the schema: valid data passes, missing required fields fail, number boundaries work, array length constraints work.
4. Create the form action and page component with full error handling.

## Key Takeaways

- Place schemas in `$lib/schemas/` and import them on both client and server — single source of truth for types, validation rules, and error messages
- Client-side validation is for UX (instant feedback); server-side validation is for security (cannot be bypassed). You need both, always.
- In form actions, use `safeParse()` to validate, transform errors into a field-keyed object, and return them with `fail(400, { errors, values })` — never return sensitive fields like passwords
- In API routes, wrap `request.json()` in a try/catch, validate with `safeParse()`, and return structured JSON errors with a 400 status
- In load functions, validate `params` and `url.searchParams` — throw 404 for invalid resource IDs, fall back to defaults for invalid pagination params
- Use `z.coerce.number()` (Zod) or `v.transform(Number)` (Valibot) to handle string-to-number conversion for URL params and form fields
- Build a `parseFormData()` utility to handle checkboxes (boolean), number fields (coercion), and multi-selects (arrays) — FormData does not give you these types natively
- Compose schemas with `.extend()` / `.partial()` (Zod) or `v.partial()` / spread entries (Valibot) to create related schemas for create, update, and read operations
- Use discriminated unions for conditional validation where different fields apply based on a selector value
- Validate environment variables at startup with a schema — fail immediately with a clear message instead of crashing at runtime
- Build a minimal `FieldError.svelte` component for accessible error display — keep it simple and composable
- Test schemas with Vitest: valid data passes, invalid data produces the right errors, transforms produce expected output, edge cases are covered
- Remote functions (module 41) integrate schema validation natively — the schema is the function's contract, and field helpers eliminate error display boilerplate
