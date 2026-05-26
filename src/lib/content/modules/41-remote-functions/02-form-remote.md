# Form Functions

Traditional SvelteKit form actions work well, but they live in `+page.server.ts` and are tightly bound to a specific route. The `form` remote function offers an alternative: declarative form handling that lives in `.remote.ts` files and can be shared across any component. It provides built-in schema validation, field helpers, and progressive enhancement out of the box.

Think of `form()` as the evolution of form actions — same server-side processing, but with a richer API for building form UIs and better co-location with the components that use them.

## The Mental Model: Forms as Declared Contracts

A form function declares a contract between the client and server. The Valibot schema defines *what* the server accepts, and the handler defines *what happens* with valid data. The client gets field helpers, validation errors, and submission management for free. This is fundamentally different from manually wiring up `fetch` calls — the contract is explicit, type-safe, and enforced at both ends.

Think of it in three layers:

```
┌─────────────────────────────────────────┐
│  Client: Field helpers, preflight       │  ← Instant feedback
│  validation, optimistic UI              │
├─────────────────────────────────────────┤
│  Transport: Progressive enhancement,   │  ← Automatic
│  serialization, CSRF protection         │
├─────────────────────────────────────────┤
│  Server: Schema validation, handler,   │  ← Trusted boundary
│  database writes, error responses       │
└─────────────────────────────────────────┘
```

The client never needs to know *how* the form is submitted. It just spreads the form object and uses field helpers. The transport layer handles progressive enhancement (works without JavaScript), CSRF tokens, and content encoding. The server validates everything again — because client-side validation is a courtesy, not security.

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

The schema does double duty: it validates incoming data *and* generates TypeScript types. The handler receives fully validated, typed data — you never need to check if `data.title` is a string or if it meets the minimum length. That work is done.

### WRONG vs CORRECT: Schema Design

```typescript
// WRONG — validation logic inside the handler
export const createPost = form(
  v.object({
    title: v.string(),   // No constraints — anything passes
    body: v.string(),
  }),
  async (data) => {
    // Now you are doing validation in the handler — duplicating work
    if (data.title.length < 3) {
      // How do you even return field-level errors from here?
      throw new Error('Title too short');
    }
    await db.insert(postsTable).values(data);
  }
);

// CORRECT — validation in the schema, handler only does business logic
export const createPost = form(
  v.object({
    title: v.pipe(
      v.string(),
      v.minLength(3, 'Title must be at least 3 characters'),
      v.maxLength(200, 'Title must be under 200 characters')
    ),
    body: v.pipe(
      v.string(),
      v.minLength(10, 'Body must be at least 10 characters')
    ),
  }),
  async (data) => {
    // data is guaranteed valid — just do the work
    await db.insert(postsTable).values(data);
  }
);
```

Put all validation logic in the schema. The handler should assume valid data and focus on the business operation. This keeps validation co-located, makes it reusable (you can share schemas between form and preflight), and ensures field-level errors map cleanly to the UI.

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

### What `.as()` Actually Generates

The `.as()` helper returns a spread of HTML attributes appropriate for the input type:

```typescript
// createPost.fields.title.as('text') returns something like:
{
  name: 'title',
  type: 'text',
  value: '...',        // current field value
  'aria-invalid': ..., // true if field has validation errors
  'aria-describedby': ... // ID of error message element
}
```

This means accessibility attributes are wired up automatically. Screen readers announce validation errors because `aria-invalid` and `aria-describedby` are set. You get accessible forms without extra effort.

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

### Building a Reusable Form Field Component

Field helpers compose naturally into reusable components:

```svelte
<!-- src/lib/components/ui/FormField.svelte -->
<script lang="ts">
  let { field, label, type = 'text', ...rest } = $props();
</script>

<div class="form-field">
  <label class="form-label">
    {label}
    {#if type === 'textarea'}
      <textarea {...field.as('textarea')} {...rest}></textarea>
    {:else}
      <input {...field.as(type)} {...rest} />
    {/if}
  </label>

  {#each field.issues() as issue}
    <p class="form-error" role="alert">{issue}</p>
  {/each}
</div>
```

Now your form pages become cleaner:

```svelte
<script lang="ts">
  import { createPost } from '$lib/api/posts.remote';
  import FormField from '$lib/components/ui/FormField.svelte';
</script>

<form {...createPost}>
  <FormField field={createPost.fields.title} label="Title" />
  <FormField field={createPost.fields.body} label="Body" type="textarea" rows="5" />
  <button type="submit">Publish</button>
</form>
```

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

### The enhance Lifecycle

Understanding the enhance lifecycle helps you build sophisticated submission flows:

```svelte
<form
  {...createPost}
  use:createPost.enhance={() => {
    // 1. BEFORE submission — runs synchronously
    //    Use this for: showing loading state, disabling UI, optimistic updates
    const loadingToast = toast.loading('Saving...');

    return async ({ result, update }) => {
      // 2. AFTER submission — runs with the server response
      //    result.type is 'success', 'failure', 'redirect', or 'error'
      loadingToast.dismiss();

      if (result.type === 'success') {
        toast.success('Saved!');
        // update() applies the default SvelteKit behavior (reset form, update data)
        await update();
      } else if (result.type === 'failure') {
        // Server returned validation errors — they are already in .issues()
        toast.error('Please fix the errors below.');
        // Do NOT call update() — keep the user's input in the form
      } else if (result.type === 'redirect') {
        toast.success('Saved! Redirecting...');
        await update(); // Follows the redirect
      } else if (result.type === 'error') {
        toast.error('Server error. Please try again.');
      }
    };
  }}
>
```

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

### WRONG vs CORRECT: Preflight Schema Design

```typescript
// WRONG — preflight schema is stricter than server schema
// Server allows 3+ chars, but preflight requires 5+ chars
const postForm = createPost.preflight(
  v.object({
    title: v.pipe(v.string(), v.minLength(5, 'Title too short')),
    //                                     ^ Different from server (3)
  })
);
// This confuses users: the client says "too short" but the server would accept it.

// CORRECT — preflight schema matches or is a subset of server schema
const postForm = createPost.preflight(
  v.object({
    title: v.pipe(v.string(), v.minLength(3, 'Title too short')),
    //                                     ^ Same as server
  })
);
```

The preflight schema should match the server schema or be less strict. The server is the authority — the preflight is just a fast feedback shortcut. Mismatched schemas create confusing UX where the client rejects input the server would accept, or vice versa.

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

After a failed submission, the email field repopulates with the user's input, but the password fields remain empty. This is a security feature — passwords should never be echoed in HTML responses, even to the same user.

### Why This Matters

Without the underscore convention, a failed registration would include the password in the HTML response. If the response is cached (CDN misconfiguration), or if the user has a browser extension that reads page content, or if the response is logged server-side, the password is exposed. The underscore prefix eliminates this entire class of vulnerability.

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

### When You Need form.for

| Scenario | Need `form.for`? | Why |
|----------|------------------|-----|
| Single form on a page | No | One instance is the default |
| Inline editing in a list | Yes | Each row needs independent state |
| Multi-step wizard | No | One form with conditional fields |
| Repeated cards with "Quick Edit" | Yes | Each card submits independently |
| Comment reply forms | Yes | Each comment thread has its own reply |

## Programmatic Validation with form.validate

Sometimes you need to validate a form without submitting it — for example, to check fields on blur or before enabling a submit button. The `.validate()` method triggers validation and populates `.issues()` without making a server request:

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

### Multi-Step Wizard Pattern

```svelte
<script lang="ts">
  import { registerUser } from '$lib/api/auth.remote';
  import * as v from 'valibot';

  let step = $state(1);

  const regForm = registerUser.preflight(
    v.object({
      email: v.pipe(v.string(), v.email()),
      _password: v.pipe(v.string(), v.minLength(8)),
      displayName: v.pipe(v.string(), v.minLength(2)),
      bio: v.optional(v.string())
    })
  );

  async function nextStep() {
    const result = await regForm.validate();

    // Only check fields for the current step
    if (step === 1) {
      const emailOk = regForm.fields.email.issues().length === 0;
      const passwordOk = regForm.fields._password.issues().length === 0;
      if (emailOk && passwordOk) step = 2;
    } else if (step === 2) {
      const nameOk = regForm.fields.displayName.issues().length === 0;
      if (nameOk) step = 3;
    }
  }
</script>

<form {...regForm}>
  {#if step === 1}
    <input {...regForm.fields.email.as('email')} placeholder="Email" />
    <input {...regForm.fields._password.as('password')} placeholder="Password" />
    <button type="button" onclick={nextStep}>Next</button>
  {:else if step === 2}
    <input {...regForm.fields.displayName.as('text')} placeholder="Display Name" />
    <button type="button" onclick={() => step = 1}>Back</button>
    <button type="button" onclick={nextStep}>Next</button>
  {:else}
    <textarea {...regForm.fields.bio.as('textarea')} placeholder="Bio (optional)"></textarea>
    <button type="button" onclick={() => step = 2}>Back</button>
    <button type="submit">Create Account</button>
  {/if}
</form>
```

## Optimistic Updates with withOverride

When a mutation succeeds, you often want the UI to update immediately without waiting for a query refresh. `withOverride` lets you optimistically apply new data to a query's `.current` value during a form submission:

```svelte
<script lang="ts">
  import { getProducts } from '$lib/api/products.remote';
  import { updateProduct } from '$lib/api/products.remote';

  const products = getProducts();
  let editingId = $state<string | null>(null);
  let pendingChanges = $state<Record<string, any>>({});
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

### Why Rollback Must Always Be Called

```typescript
// WRONG — forgetting to call rollback
const rollback = products.withOverride(optimisticData);
return async ({ result }) => {
  if (result.type === 'success') {
    await products.refresh();
    // Forgot rollback() — the override stays active,
    // and future refreshes are masked by stale optimistic data
  }
};

// CORRECT — always call rollback in both success and failure paths
const rollback = products.withOverride(optimisticData);
return async ({ result }) => {
  if (result.type === 'success') {
    await products.refresh();
    rollback();  // Remove override after getting fresh data
  } else {
    rollback();  // Revert on failure
  }
};
```

The override acts as a mask over the real query data. If you never remove it, the mask stays, and the query's `.current` returns the stale optimistic data forever — even after a `refresh()` fetches new server data. Always call `rollback()`.

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

### Why requested() Is Better Than a Separate Fetch

```
Without requested():
  Client → POST /delete → Server deletes → 200 OK
  Client → GET  /products → Server queries → 200 + data
  (Two round trips)

With requested():
  Client → POST /delete → Server deletes + queries → 200 OK + fresh data
  (One round trip — the refresh data piggybacks on the mutation response)
```

This is especially impactful on high-latency connections (mobile, international users). Every eliminated round trip saves 100-500ms of perceived latency.

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

The `invalid` response populates the corresponding field's `.issues()` array, so your existing error display logic handles both schema errors and business logic errors. No special client-side handling needed — the same `{#each field.issues() as issue}` loop shows both types of errors.

### Combining Schema and Business Validation

The flow for a registration form:

```
1. Preflight: "Is the email format valid?" → instant client feedback
2. Schema:    "Is the email format valid?" → server re-checks (defense in depth)
3. Handler:   "Is the email already taken?" → server-only check (requires DB)
                                              ↓
                                    invalid(409, { email: ['Already registered'] })
                                              ↓
                                    Populates .issues() on the client
```

All three levels of validation feed into the same `.issues()` array. The user sees error messages under each field regardless of where the validation ran. This unified error surface is one of the biggest advantages of `form()` over manual `fetch` + state management.

## When to Use form() vs Traditional Form Actions

| Scenario | Use |
|----------|-----|
| Form logic shared across multiple pages | `form()` remote function |
| Component-level form encapsulation | `form()` remote function |
| Simple single-page form | Traditional form action |
| Must work with zero JavaScript | Traditional form action |
| Need field helpers and preflight validation | `form()` remote function |
| Inline editing in a reusable list component | `form()` with `form.for` |
| Multi-step wizard with per-step validation | `form()` with `.validate()` |
| Form in a modal or slide-over panel | `form()` remote function |
| Optimistic updates with rollback | `form()` with `withOverride` |

Both approaches work with progressive enhancement. Traditional form actions are simpler for basic cases. Remote form functions shine when you need reusable form logic, rich field APIs, or forms embedded in shared components.

### The Architecture Decision

If you are building a simple contact form on a single page, a traditional `+page.server.ts` action is fewer lines of code and perfectly adequate. But the moment you have forms that appear in multiple places (an "Edit Task" form in both a modal and a page, a "Quick Add" form in a sidebar and a toolbar), `form()` pays for itself immediately. You define the schema, validation, and handler once, and every consumer gets the full field helper API.

## Try It

Create a user registration form using `form()` with a Valibot schema:

1. Define a form function in `src/lib/api/auth.remote.ts` with `email`, `_password` (sensitive), `_confirmPassword` (sensitive), and `displayName` fields. Add validation: email must be valid, password minimum 8 characters, displayName minimum 2 characters.
2. Add a cross-field validation check in the handler: if `_password !== _confirmPassword`, return `invalid(400, { _confirmPassword: ['Passwords do not match'] })`.
3. Add preflight validation for instant client-side feedback. Ensure the preflight schema matches the server schema constraints.
4. Build a `<FormField>` component that renders a label, the appropriate input via `.as()`, and error messages from `.issues()`.
5. Display validation errors under each field using `.issues()`.
6. Add an `.enhance` callback that shows a loading toast during submission, a success toast on completion, and redirects to `/login`.
7. Add a "strength indicator" that reads `_password.value()` and shows weak/medium/strong based on length and character variety.
8. Build a multi-step version: step 1 for email and password, step 2 for displayName. Use `.validate()` to check step 1 before advancing to step 2.

## Key Takeaways

- `form()` from `$app/server` provides declarative form handling in `.remote.ts` files — schema defines the contract, handler does the work
- Spread the form object onto `<form>` to wire up action, method, and encoding automatically
- Field helpers (`.as()`, `.value()`, `.set()`, `.issues()`) simplify building form UIs and include accessibility attributes
- `.enhance` customizes submission behavior for optimistic UI, toasts, and redirects — always handle both success and failure paths
- `.preflight` adds instant client-side validation before the server round-trip — keep the schema consistent with the server schema
- Fields prefixed with `_` are sensitive and will not be repopulated after failed submissions — use for passwords and secrets
- Use `invalid()` from `@sveltejs/kit` for server-side validation errors that need database access — errors populate the same `.issues()` array
- `form.for(id)` creates isolated form instances for repeated elements like list items, each with independent state
- `.validate()` triggers validation without submitting, useful for on-blur checks, multi-step forms, and enabling/disabling submit buttons
- `withOverride` on a query enables optimistic updates during mutations — always call the `rollback` function in both success and failure paths
- `requested()` lets the server accept client-requested query refreshes, bundling fresh data into the mutation response to eliminate extra round trips
- Choose `form()` for reusable, component-level forms; use traditional actions for simple, route-bound forms
- Put validation logic in the schema, not the handler — schemas provide field-level errors, type safety, and reusability
