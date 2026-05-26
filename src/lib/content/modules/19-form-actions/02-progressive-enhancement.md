# Progressive Enhancement

Progressive enhancement is a philosophy: **build the foundation first, then layer improvements on top**. A form should work with nothing but HTML and the server. When JavaScript loads, it gets *better* -- smoother, faster, more responsive -- but it never becomes *required*.

SvelteKit embraces this philosophy at its core. Your form actions run on the server. A plain `<form method="POST">` submits data, the server processes it, and the browser reloads with the result. It works in every browser, on every device, on slow connections, with JavaScript disabled, and for screen readers. That is your baseline.

The `use:enhance` directive then upgrades that baseline into a modern, single-page-app experience -- without changing a single line of server code.

## Why Progressive Enhancement Matters

Before diving into the API, understand *why* this approach is valuable:

- **Resilience**: JavaScript fails more often than you think -- ad blockers, network errors, slow CDNs, browser bugs, corporate proxy interference, and slow 3G connections where the JS bundle times out. Forms that require JS break silently. Forms that work without JS always work.
- **Accessibility**: Screen readers and assistive technology work with standard HTML forms natively. Custom JS-driven forms often break accessibility unless carefully tested. A `<form>` with `<input name="email">` and a `<button type="submit">` is universally understood by every assistive device.
- **SEO**: Search engine crawlers may not execute JavaScript. Server-rendered form responses are visible; client-only interactions are not.
- **Performance on slow connections**: On a 2G connection, a 200KB JavaScript bundle takes seconds to download and parse. A plain HTML form works immediately. The JS enhancement arrives later and improves the experience.
- **Progressive loading**: On first page load, the HTML arrives and the form is functional before JavaScript has finished downloading. There is no "loading..." state where buttons do not work.
- **Testing**: Server-rendered forms can be tested with simple HTTP requests. You do not need a browser, Puppeteer, or Playwright to verify that a form submission creates a record in the database. `curl -X POST` works.

This is not about supporting users who deliberately disable JavaScript. It is about building apps that are robust by default and excellent when conditions are ideal. Think of it as engineering for the real world, where networks are unreliable and devices are diverse.

## The Three Layers of Progressive Enhancement

Think of progressive enhancement as three layers, each building on the previous one:

```
Layer 3: Optimistic UI      ← instant perceived response
Layer 2: Enhanced (use:enhance)  ← smooth AJAX, no page reload
Layer 1: Baseline (HTML form)    ← always works, no JS required
```

If Layer 3 fails (optimistic state conflicts with server), Layer 2 handles it gracefully. If Layer 2 fails (JavaScript error, bundle not loaded), Layer 1 catches it. Each layer is a complete experience, not a degraded one. The user on Layer 1 gets a working form. The user on Layer 3 gets an instant, app-like experience. Neither feels broken.

## Basic use:enhance

Import `enhance` from `$app/forms` and add it as an action directive on your form:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { data, form }: { data: any; form: ActionData } = $props();
</script>

<form method="POST" action="?/create" use:enhance>
  <input name="title" required />
  <button type="submit">Add</button>
</form>

{#if form?.error}
  <p class="text-red-600 text-sm mt-2">{form.error}</p>
{/if}
```

Without `use:enhance`, this form triggers a full page navigation on submit -- the browser sends a POST request, the server responds, and the entire page reloads. With `use:enhance`, the same form:

1. **Prevents the full page reload** -- intercepts the native form submission via `event.preventDefault()`
2. **Sends the data via `fetch`** -- makes the same POST request but as an AJAX call
3. **Invalidates all load functions** -- re-runs your `load` functions to refresh page data
4. **Updates `form` prop** -- makes the action's response available as the `form` prop (the `ActionData`)
5. **Resets the form fields** on success (but not on failure, preserving user input)

The server code stays exactly the same. The `use:enhance` directive is purely a client-side upgrade. If JavaScript has not loaded yet, the form falls back to native browser submission -- which still works because your server action handles it either way.

A subtle detail that matters: `use:enhance` uses the same serialization as native form submission. It reads the `FormData` from the actual `<form>` element, including hidden fields, selected radio buttons, checked checkboxes, and file inputs. This means your server action receives exactly the same data whether JavaScript is loaded or not. There is no divergence to debug.

## How It Works Under the Hood

Understanding the mechanism helps you debug issues and write better custom callbacks:

```
Without use:enhance (native HTML form):
  User clicks submit
  → Browser serializes all <input>, <select>, <textarea> with name attributes
  → Browser sends POST request (full navigation, browser shows loading indicator)
  → Server runs the form action, returns HTML (full page)
  → Browser replaces the ENTIRE page (scroll position lost, state reset)
  → If the action used fail(), the form prop has error data
  → If the action used redirect(), browser follows the redirect

With use:enhance (JavaScript-enhanced):
  User clicks submit
  → SvelteKit intercepts the submit event (event.preventDefault())
  → SvelteKit reads FormData from the form element (same serialization)
  → SvelteKit sends a fetch() POST request with the same FormData
  → Server runs the same action, returns the result as JSON (not full HTML)
  → SvelteKit processes the result:
      - type: 'success' → invalidates load functions, updates form prop, resets form
      - type: 'failure' → updates form prop (form values preserved in inputs)
      - type: 'redirect' → navigates via goto() (client-side, no page reload)
      - type: 'error' → shows the nearest +error.svelte page
```

The key insight: the server does the same work in both cases. The difference is entirely in how the browser handles the submission and the response. This is why progressive enhancement works so well in SvelteKit -- the server is the source of truth, and the client just optimizes the delivery.

### The Result Types Explained

The action's return value determines the `result.type` in the enhance callback:

```typescript
// src/routes/todos/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';

export const actions = {
  create: async ({ request, locals }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;

    // Validation failure → result.type === 'failure'
    if (!title || title.trim().length === 0) {
      return fail(400, { error: 'Title is required', title });
      // fail() returns the data as form prop AND sets type to 'failure'
      // The status code (400) is sent to the client
    }

    // Success → result.type === 'success'
    const todo = await db.insert(todos).values({ title, userId: locals.user.id }).returning();
    return { success: true, id: todo[0].id };
    // Returning a plain object sets type to 'success'

    // Redirect → result.type === 'redirect'
    // throw redirect(303, '/todos');
    // Throwing redirect sets type to 'redirect' with a location

    // Error → result.type === 'error'
    // throw error(500, 'Database connection failed');
    // Throwing error sets type to 'error'
  }
};
```

Understanding these types is essential for writing correct enhance callbacks.

## Custom Enhance Callbacks

Pass a function to `use:enhance` to customize the behavior. The function receives the form submission context and runs *before* the request is sent. It can return an async callback that runs *after* the server responds:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let submitting = $state(false);
  let errorMessage = $state('');
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={({ formData, cancel, formElement, action, submitter }) => {
    // === BEFORE SUBMISSION ===
    // This code runs BEFORE the request is sent to the server.
    // Use it for: client-side validation, loading states, modifying data, canceling

    const title = formData.get('title') as string;

    // Client-side validation (UX convenience, not security)
    if (title.length < 3) {
      errorMessage = 'Title must be at least 3 characters';
      cancel(); // Prevent the request from being sent
      return;   // No return callback needed since we cancelled
    }

    submitting = true;
    errorMessage = '';

    // You can modify formData before it is sent
    formData.set('title', title.trim());
    formData.set('createdAt', new Date().toISOString());

    // === AFTER SUBMISSION ===
    // Return an async function that handles the server response.
    return async ({ result, update }) => {
      submitting = false;

      if (result.type === 'success') {
        // Let SvelteKit handle the default behavior:
        // invalidate loads, update form prop, reset form fields
        await update();
      } else if (result.type === 'failure') {
        // Show the error but keep form values
        errorMessage = result.data?.error ?? 'Something went wrong';
        await update({ reset: false }); // CRITICAL: do not clear the form
      } else if (result.type === 'redirect') {
        // SvelteKit handles redirects automatically when you call update()
        await update();
      } else if (result.type === 'error') {
        // Unexpected server error (500, network failure, etc.)
        errorMessage = 'An unexpected error occurred. Please try again.';
        // NOT calling update() — handle entirely in our code
      }
    };
  }}
>
  <input name="title" required />
  <button type="submit" disabled={submitting}>
    {submitting ? 'Saving...' : 'Add'}
  </button>
</form>

{#if errorMessage}
  <p class="text-red-600 text-sm mt-2" role="alert">{errorMessage}</p>
{/if}
```

### The Before-Submit Object

The function passed to `use:enhance` receives an object with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `formData` | `FormData` | The serialized form data. You can read, modify, add, or delete fields. |
| `formElement` | `HTMLFormElement` | The actual `<form>` DOM element. |
| `cancel()` | `() => void` | Call this to abort the submission entirely. No request is sent. |
| `action` | `URL` | The URL the form will submit to (e.g., `?/create`). |
| `submitter` | `HTMLElement \| null` | The button or element that triggered the submission. Useful when a form has multiple submit buttons. |

### The After-Submit Object

The returned async function receives:

| Property | Type | Description |
|----------|------|-------------|
| `result` | `ActionResult` | The server's response: `{ type, data?, status?, location? }` |
| `update(opts?)` | `Function` | Runs default SvelteKit behavior (invalidate, reset, update form prop). |
| `formElement` | `HTMLFormElement` | The form DOM element. |
| `formData` | `FormData` | The original FormData that was sent. |

### The update() Function

`update()` deserves its own explanation because misunderstanding it causes the most common bugs:

```typescript
// Default behavior: invalidate + reset form + update form prop
await update();

// Keep form values after failure (most important option)
await update({ reset: false });

// Invalidate only specific routes (advanced)
await update({ invalidateAll: false });
// When invalidateAll is false, SvelteKit does NOT re-run load functions.
// Use this when you handle data updates manually.
```

If you do NOT call `update()` at all, SvelteKit does nothing -- no invalidation, no form reset, no `form` prop update. You are in full control. This is useful for fully custom UX but dangerous if you forget that load functions will not re-run.

```typescript
// WRONG: not calling update() and wondering why the list did not refresh
return async ({ result }) => {
  if (result.type === 'success') {
    showToast('Item created!');
    // Forgot to call update() — load functions do not re-run
    // The new item does not appear in the list
  }
};

// CORRECT: call update() to refresh data
return async ({ result, update }) => {
  if (result.type === 'success') {
    showToast('Item created!');
    await update(); // Re-runs load functions, form resets, data refreshes
  }
};
```

## Validation: Client and Server

A critical principle: **always validate on the server, optionally validate on the client**.

Client-side validation (in the `use:enhance` callback) provides instant feedback -- the user sees an error before the request is sent. But it can be bypassed by anyone who opens the browser console, uses curl, or sends a direct HTTP request. Server-side validation in your form action is the actual security boundary.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let errors = $state<Record<string, string>>({});
  let submitting = $state(false);
</script>

<form
  method="POST"
  action="?/register"
  use:enhance={({ formData, cancel }) => {
    errors = {}; // Clear previous errors

    // === CLIENT-SIDE VALIDATION ===
    // Nice UX, not a security measure. Can be bypassed.
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }
    if (password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // If any client-side errors, cancel submission
    if (Object.keys(errors).length > 0) {
      cancel();
      return;
    }

    submitting = true;

    return async ({ result, update }) => {
      submitting = false;

      if (result.type === 'failure') {
        // === SERVER-SIDE VALIDATION ERRORS ===
        // This is the real check. The server might reject the email
        // as already taken, which client-side cannot know.
        if (result.data?.errors) {
          errors = result.data.errors;
        } else {
          errors = { form: result.data?.message ?? 'Registration failed' };
        }
        await update({ reset: false }); // Keep form values
      } else {
        await update();
      }
    };
  }}
>
  <div>
    <label for="email">Email</label>
    <input id="email" name="email" type="email" required
           class="w-full rounded-lg border p-3"
           class:border-red-500={errors.email} />
    {#if errors.email}
      <p class="text-red-600 text-sm mt-1" role="alert">{errors.email}</p>
    {/if}
  </div>

  <div class="mt-4">
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required
           class="w-full rounded-lg border p-3"
           class:border-red-500={errors.password} />
    {#if errors.password}
      <p class="text-red-600 text-sm mt-1" role="alert">{errors.password}</p>
    {/if}
  </div>

  <div class="mt-4">
    <label for="confirmPassword">Confirm Password</label>
    <input id="confirmPassword" name="confirmPassword" type="password" required
           class="w-full rounded-lg border p-3"
           class:border-red-500={errors.confirmPassword} />
    {#if errors.confirmPassword}
      <p class="text-red-600 text-sm mt-1" role="alert">{errors.confirmPassword}</p>
    {/if}
  </div>

  <button type="submit" disabled={submitting}
          class="mt-6 w-full rounded-lg bg-blue-600 py-3 text-white
                 disabled:opacity-50">
    {submitting ? 'Creating account...' : 'Create Account'}
  </button>

  {#if errors.form}
    <p class="text-red-600 text-sm mt-2" role="alert">{errors.form}</p>
  {/if}
</form>
```

The corresponding server action:

```typescript
// src/routes/register/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
  register: async ({ request }) => {
    const formData = await request.formData();
    const email = (formData.get('email') as string)?.trim();
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    // SERVER-SIDE VALIDATION — this is the security boundary
    const errors: Record<string, string> = {};

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Valid email address required';
    }
    if (!password || password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (password !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    if (Object.keys(errors).length > 0) {
      // Return validation errors AND the submitted values
      // so the form can be repopulated (except passwords)
      return fail(400, { errors, email });
    }

    // Check if email is already taken (server-only check)
    const existing = await db.select().from(users)
      .where(eq(users.email, email)).limit(1);

    if (existing.length > 0) {
      return fail(409, {
        errors: { email: 'An account with this email already exists' },
        email
      });
    }

    // Create the account
    const hashedPassword = await hashPassword(password);
    await db.insert(users).values({ email, password: hashedPassword });

    throw redirect(303, '/login?registered=true');
  }
};
```

Key patterns in this example:
- Client validates format (instant feedback). Server validates business rules (email uniqueness).
- `fail()` returns the submitted email so the form can repopulate it. Passwords are NOT returned -- never send passwords back to the client.
- The server uses `fail(400, ...)` for validation errors and `fail(409, ...)` for conflict (email taken). The status code matters for error tracking.

With progressive enhancement, the server validation works even without JavaScript -- the user submits the form natively, the server validates and returns an error via `fail()`, and the page reloads with `form.errors` populated. The client-side validation is purely an improvement to the experience, not a replacement for server logic.

## Preserving Form State Across Failures

One of the most frustrating user experiences is filling out a long form, submitting it, and having all your input erased because of a validation error. `use:enhance` with `{ reset: false }` prevents this, but you also need to handle the no-JS case:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';
  import type { ActionData } from './$types';

  let { form }: { form: ActionData } = $props();
</script>

<form method="POST" action="?/create" use:enhance={({ formData }) => {
  return async ({ result, update }) => {
    if (result.type === 'failure') {
      await update({ reset: false }); // Keep form values
    } else {
      await update(); // Reset on success
    }
  };
}}>
  <!-- Use form?.fieldName to repopulate on server-side validation failure (no-JS case) -->
  <input name="title" value={form?.title ?? ''} required />
  <input name="url" value={form?.url ?? ''} required />
  <textarea name="description">{form?.description ?? ''}</textarea>

  <button type="submit">Create</button>
</form>
```

```typescript
// Server action that returns submitted values on failure
export const actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const url = formData.get('url') as string;
    const description = formData.get('description') as string;

    if (!title) {
      // Return the submitted values so the form can repopulate
      return fail(400, {
        error: 'Title is required',
        title, url, description  // Send back all values except sensitive data
      });
    }

    // ... create the resource ...
    return { success: true };
  }
};
```

The `value={form?.title ?? ''}` pattern works in both cases:
- **With JS**: `use:enhance` prevents the page reload and `{ reset: false }` keeps values in the inputs. The `form?.title` is the server response from `fail()`.
- **Without JS**: The page reloads after the POST, and `form?.title` contains the value from `fail()` which repopulates the input.

## Optimistic UI

Optimistic UI updates the interface immediately *before* the server confirms the change. This makes the app feel instant -- the user sees their action reflected immediately instead of waiting for a network round-trip.

The pattern: add the item to local state immediately, send the request, and clean up when the server responds.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  // Temporary items shown while waiting for server confirmation
  let optimisticTodos = $state<Array<{
    id: string;
    text: string;
    pending: boolean;
  }>>([]);

  // Combine real data (from load function) with optimistic items
  let allTodos = $derived([
    ...data.todos,
    ...optimisticTodos
  ]);
</script>

<form
  method="POST"
  action="?/addTodo"
  use:enhance={({ formData, formElement }) => {
    const text = formData.get('text') as string;
    const tempId = crypto.randomUUID();

    // OPTIMISTIC: add the todo BEFORE the server responds
    optimisticTodos = [...optimisticTodos, { id: tempId, text, pending: true }];

    // Clear the input immediately for fast re-entry
    formElement.reset();

    return async ({ result, update }) => {
      if (result.type === 'success') {
        // Server confirmed — clear ALL optimistic items.
        // The re-run load function provides the real data.
        optimisticTodos = [];
        await update({ reset: false }); // Don't reset — we already cleared it
      } else {
        // Server rejected — ROLLBACK the optimistic item
        optimisticTodos = optimisticTodos.filter(t => t.id !== tempId);
        await update({ reset: false });
      }
    };
  }}
>
  <input name="text" placeholder="New todo..." required
         class="w-full rounded-lg border p-3" />
  <button type="submit" class="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-white">
    Add
  </button>
</form>

<ul class="mt-6 space-y-2">
  {#each allTodos as todo (todo.id)}
    <li class="flex items-center gap-3 rounded-lg border p-3"
        class:opacity-60={todo.pending}>
      <span class="flex-1">{todo.text}</span>
      {#if todo.pending}
        <span class="text-xs text-gray-400">Saving...</span>
      {/if}
    </li>
  {/each}
</ul>
```

The todo appears instantly in the list with reduced opacity indicating it is being saved. If the server succeeds, the load function re-runs and replaces the optimistic item with the real one. If the server fails, the optimistic item is removed -- the todo "disappears," signaling to the user that it was not saved.

### Optimistic Delete

Optimistic delete is even simpler -- hide the item immediately and restore it if the server rejects:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  // Track which items are being deleted (hidden optimistically)
  let deletingIds = $state<Set<string>>(new Set());

  // Filter out items being deleted
  let visibleTodos = $derived(
    data.todos.filter(todo => !deletingIds.has(todo.id))
  );
</script>

<ul class="space-y-2">
  {#each visibleTodos as todo (todo.id)}
    <li class="flex items-center gap-3 rounded-lg border p-3">
      <span class="flex-1">{todo.text}</span>

      <form method="POST" action="?/deleteTodo"
            use:enhance={() => {
              // OPTIMISTIC: hide immediately
              deletingIds = new Set([...deletingIds, todo.id]);

              return async ({ result, update }) => {
                if (result.type === 'success') {
                  // Confirmed — clean up the set, real data comes from load
                  deletingIds = new Set([...deletingIds].filter(id => id !== todo.id));
                  await update();
                } else {
                  // ROLLBACK — show the item again
                  deletingIds = new Set([...deletingIds].filter(id => id !== todo.id));
                  await update({ reset: false });
                }
              };
            }}>
        <input type="hidden" name="id" value={todo.id} />
        <button type="submit" class="text-red-600 text-sm hover:underline">
          Delete
        </button>
      </form>
    </li>
  {/each}
</ul>
```

The hidden `<input type="hidden" name="id" value={todo.id}>` is crucial for progressive enhancement. Without JS, the native form submission sends the `id` to the server. With JS, `use:enhance` reads it from the FormData. The same markup works both ways.

### Optimistic Toggle (Like Button)

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  // Track optimistic like state
  let optimisticLike = $state<boolean | null>(null);
  let optimisticCount = $state<number | null>(null);

  let isLiked = $derived(optimisticLike ?? data.post.isLiked);
  let likeCount = $derived(optimisticCount ?? data.post.likeCount);
</script>

<form method="POST" action="?/toggleLike"
      use:enhance={() => {
        // OPTIMISTIC: toggle immediately
        const wasLiked = isLiked;
        optimisticLike = !wasLiked;
        optimisticCount = likeCount + (wasLiked ? -1 : 1);

        return async ({ result, update }) => {
          if (result.type === 'success') {
            // Clear optimistic state — real data comes from load
            optimisticLike = null;
            optimisticCount = null;
            await update({ reset: false });
          } else {
            // ROLLBACK
            optimisticLike = null;
            optimisticCount = null;
            await update({ reset: false });
          }
        };
      }}>
  <input type="hidden" name="postId" value={data.post.id} />
  <button type="submit"
          class="flex items-center gap-2 rounded-full px-4 py-2 transition-colors
                 {isLiked ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}">
    <span>{isLiked ? '♥' : '♡'}</span>
    <span>{likeCount}</span>
  </button>
</form>
```

### When to Use Optimistic UI

Optimistic UI is best for actions that almost always succeed:

| Good candidates | Bad candidates |
|----------------|----------------|
| Adding a comment | Payment processing |
| Toggling a like/favorite | Complex validation (email uniqueness) |
| Reordering a list | File uploads |
| Marking as read/unread | Account deletion |
| Quick settings toggles | Operations with rate limits |

For actions that frequently fail (payment processing, complex validation), showing a loading state is more honest than pretending the action succeeded. For destructive actions (deletion), consider a brief undo window instead of optimistic removal.

## Multiple Submit Buttons

A single form can have multiple submit buttons that trigger different actions. The `submitter` property in the enhance callback tells you which button was clicked:

```svelte
<form method="POST" use:enhance={({ submitter }) => {
  // submitter is the <button> element that was clicked
  const action = submitter?.getAttribute('formaction');

  if (action === '?/delete') {
    if (!confirm('Are you sure you want to delete this?')) {
      cancel();
      return;
    }
  }

  return async ({ result, update }) => {
    await update();
  };
}}>
  <input name="title" value={data.item.title} />

  <!-- Default action: save -->
  <button type="submit" formaction="?/save"
          class="rounded-lg bg-blue-600 px-4 py-2 text-white">
    Save
  </button>

  <!-- Alternative action: delete -->
  <button type="submit" formaction="?/delete"
          class="rounded-lg bg-red-600 px-4 py-2 text-white">
    Delete
  </button>

  <!-- Alternative action: publish -->
  <button type="submit" formaction="?/publish"
          class="rounded-lg bg-green-600 px-4 py-2 text-white">
    Publish
  </button>
</form>
```

The `formaction` attribute on the button overrides the form's `action` attribute. This works both with and without JavaScript -- native form submission supports `formaction` natively.

## File Uploads with Progressive Enhancement

File uploads need special handling because `FormData` with files cannot be serialized to JSON. Fortunately, `use:enhance` handles this automatically -- it sends the `FormData` as `multipart/form-data`, just like native form submission:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let uploading = $state(false);
  let preview = $state<string | null>(null);
</script>

<form
  method="POST"
  action="?/uploadAvatar"
  enctype="multipart/form-data"
  use:enhance={() => {
    uploading = true;

    return async ({ result, update }) => {
      uploading = false;

      if (result.type === 'success') {
        preview = null; // Clear preview, real image comes from load
        await update();
      } else {
        await update({ reset: false });
      }
    };
  }}
>
  <input
    type="file"
    name="avatar"
    accept="image/png, image/jpeg, image/webp"
    onchange={(e) => {
      const file = e.currentTarget.files?.[0];
      if (file) {
        preview = URL.createObjectURL(file);
      }
    }}
  />

  {#if preview}
    <img src={preview} alt="Preview" class="mt-4 w-32 h-32 rounded-full object-cover" />
  {/if}

  <button type="submit" disabled={uploading}
          class="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50">
    {uploading ? 'Uploading...' : 'Upload Avatar'}
  </button>
</form>
```

The `enctype="multipart/form-data"` attribute is required for file uploads. Without it, the browser sends the file name as text instead of the file contents. This attribute works for both native submission and `use:enhance`.

## Debouncing and Preventing Double Submission

Double submission is a common problem: the user clicks the submit button twice, and two items are created. `use:enhance` does NOT prevent this by default. You need to handle it:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let submitting = $state(false);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    submitting = true;

    return async ({ update }) => {
      submitting = false;
      await update();
    };
  }}
>
  <input name="title" required />

  <!-- disabled prevents clicks AND removes the button from tab order -->
  <button type="submit" disabled={submitting}
          class="rounded-lg bg-blue-600 px-4 py-2 text-white
                 disabled:cursor-not-allowed disabled:opacity-50">
    {submitting ? 'Creating...' : 'Create'}
  </button>
</form>
```

For the no-JS case, preventing double submission is harder. Some approaches:
- Server-side idempotency: include a hidden field with a unique token. The server checks if that token was already used.
- After-redirect pattern: use `throw redirect(303, '/success')` so the POST/Redirect/GET pattern prevents resubmission on page refresh.

```svelte
<!-- Server-side double-submission prevention -->
<form method="POST" action="?/create" use:enhance>
  <input type="hidden" name="idempotencyKey" value={crypto.randomUUID()} />
  <input name="title" required />
  <button type="submit">Create</button>
</form>
```

```typescript
// Server action with idempotency check
export const actions = {
  create: async ({ request }) => {
    const formData = await request.formData();
    const key = formData.get('idempotencyKey') as string;

    // Check if this key was already processed
    const existing = await db.select().from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key)).limit(1);

    if (existing.length > 0) {
      // Already processed — return the original result
      return { success: true, duplicate: true };
    }

    // Process the request and record the key
    await db.insert(idempotencyKeys).values({ key });
    // ... create the resource ...
  }
};
```

## Controlling the Update

The `update()` function in the return callback runs SvelteKit's default post-submission behavior. Understanding when to call it, skip it, or customize it is critical:

```svelte
<form
  method="POST"
  action="?/delete"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'success') {
        // OPTION 1: Default behavior
        // Invalidates all load functions, resets form, updates form prop
        await update();

        // OPTION 2: Default behavior but keep form values
        await update({ reset: false });

        // OPTION 3: Skip invalidation (you handle data updates manually)
        await update({ invalidateAll: false });

        // OPTION 4: Full manual control (no update at all)
        // You must handle everything yourself:
        // - Data will NOT refresh (load functions do not re-run)
        // - Form will NOT reset
        // - form prop will NOT update
        showToast('Deleted successfully');
        // WARNING: if you skip update(), your UI may show stale data
      }
    };
  }}
>
```

## Accessibility Patterns for Enhanced Forms

Progressive enhancement and accessibility go hand in hand. Here are production patterns:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let submitting = $state(false);
  let errors = $state<Record<string, string>>({});
  let successMessage = $state('');
</script>

<!-- Announce form status to screen readers -->
<div aria-live="polite" aria-atomic="true" class="sr-only">
  {#if submitting}
    Submitting form...
  {:else if successMessage}
    {successMessage}
  {:else if Object.keys(errors).length > 0}
    Form has {Object.keys(errors).length} error{Object.keys(errors).length > 1 ? 's' : ''}.
  {/if}
</div>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    submitting = true;
    errors = {};
    successMessage = '';

    return async ({ result, update }) => {
      submitting = false;

      if (result.type === 'success') {
        successMessage = 'Item created successfully!';
        await update();
      } else if (result.type === 'failure') {
        errors = result.data?.errors ?? {};
        await update({ reset: false });

        // Focus the first field with an error
        const firstErrorField = document.querySelector('[aria-invalid="true"]');
        if (firstErrorField instanceof HTMLElement) {
          firstErrorField.focus();
        }
      }
    };
  }}
  novalidate
>
  <div>
    <label for="title">Title</label>
    <input
      id="title"
      name="title"
      required
      aria-invalid={!!errors.title}
      aria-describedby={errors.title ? 'title-error' : undefined}
      class="w-full rounded-lg border p-3"
      class:border-red-500={errors.title}
    />
    {#if errors.title}
      <p id="title-error" class="text-red-600 text-sm mt-1" role="alert">
        {errors.title}
      </p>
    {/if}
  </div>

  <button
    type="submit"
    disabled={submitting}
    aria-busy={submitting}
    class="mt-4 rounded-lg bg-blue-600 px-4 py-3 text-white disabled:opacity-50"
  >
    {submitting ? 'Creating...' : 'Create Item'}
  </button>
</form>
```

Key accessibility details:
- `aria-live="polite"` with a visually hidden div announces form status changes to screen readers
- `aria-invalid="true"` on fields with errors tells screen readers the field has an error
- `aria-describedby` links the input to its error message so screen readers read both
- `aria-busy` on the submit button indicates the action is in progress
- `novalidate` on the form disables browser validation bubbles (you handle validation yourself for better UX)
- Focus management: after a failure, focus moves to the first invalid field

## Common Mistakes

**Relying only on client-side validation:**
The `cancel()` function in the enhance callback is a UX convenience. An attacker can submit the form directly to your server endpoint via `curl`, bypassing all client-side checks. Always validate in your form action.

**Not handling the no-JS case:**
If your form only works with `use:enhance` (e.g., you build the FormData entirely in JavaScript without corresponding form fields), it breaks without JS. Always make sure there are actual `<input>` elements with `name` attributes so the native form submission sends the right data.

```svelte
<!-- WRONG: data only exists in JavaScript state, not in form fields -->
<script>
  let items = $state([{ id: 1, name: 'Item 1' }]);
</script>
<form method="POST" use:enhance={({ formData }) => {
  formData.set('items', JSON.stringify(items)); // No <input> for this
}}>
  <button type="submit">Save</button>
</form>

<!-- CORRECT: hidden inputs mirror the JavaScript state -->
<form method="POST" use:enhance>
  {#each items as item}
    <input type="hidden" name="itemIds" value={item.id} />
  {/each}
  <button type="submit">Save</button>
</form>
```

**Forgetting `{ reset: false }` on failure:**
By default, `update()` resets form fields. If validation fails and you call `update()` without `{ reset: false }`, the user loses everything they typed. This is frustrating and unnecessary.

```typescript
// WRONG: user typed 500 words into a textarea, server rejected it, all gone
return async ({ result, update }) => {
  if (result.type === 'failure') {
    await update(); // This resets the form — user's input is erased
  }
};

// CORRECT: preserve input on failure
return async ({ result, update }) => {
  if (result.type === 'failure') {
    await update({ reset: false }); // Form values preserved
  }
};
```

**Not showing loading state:**
Without a visual indicator, the user does not know the form is submitting. They may click the button again, causing duplicate submissions. Always disable the button and show feedback during submission.

**Optimistic UI without rollback:**
If you optimistically add an item but do not remove it when the server rejects the request, the UI shows data that does not exist. Always handle the failure case.

**Not returning submitted values from fail():**
When the form submits without JS and validation fails, the page reloads. If your `fail()` response does not include the submitted values, the form is empty and the user has to start over.

```typescript
// WRONG: fail without returning submitted values
return fail(400, { error: 'Title too short' });

// CORRECT: return submitted values so the form repopulates
return fail(400, { error: 'Title too short', title, description, url });
```

**Using GET instead of POST for mutations:**
Forms that change data must use `method="POST"`. GET requests are for reading data -- they can be cached, prefetched, bookmarked, and repeated by the browser. A GET form that deletes a record will delete it again if the user presses back or refreshes.

## applyAction for Manual Result Handling

When you skip `update()` entirely and want to manually trigger SvelteKit's default handling for specific result types, use `applyAction`:

```svelte
<script lang="ts">
  import { enhance, applyAction } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={() => {
    return async ({ result }) => {
      // Custom handling: show toast, log analytics, etc.
      if (result.type === 'success') {
        showToast('Created!');
        trackEvent('item_created');

        // Manually trigger SvelteKit's default behavior
        await invalidateAll(); // Re-run all load functions
        await applyAction(result); // Update form prop, handle redirects
      } else if (result.type === 'failure') {
        await applyAction(result); // Update form prop with errors
      } else if (result.type === 'redirect') {
        await applyAction(result); // Navigate to the redirect URL
      } else if (result.type === 'error') {
        await applyAction(result); // Show the +error.svelte page
      }
    };
  }}
>
```

`applyAction` is useful when you need to do something custom (analytics, toasts, animations) AND still have SvelteKit handle the standard behavior. It is more granular than `update()` because you call `invalidateAll()` and `applyAction()` separately.

## Try It

1. **Optimistic delete with rollback.** Build a todo list where clicking "Delete" immediately hides the item by adding its ID to a `$state` set of hidden IDs. If the server action fails, remove the ID from the set so the item reappears with a brief "flash" to signal the failure. Include a hidden input with the todo ID so the delete works without JavaScript too (native form submit with page reload).

2. **Registration form with dual validation.** Create a registration form with email, password, and confirm password fields. Client-side validation checks that passwords match and are at least 8 characters (instant feedback via the enhance callback). Server-side validation checks if the email is already taken (via `fail(409, ...)`). Use `{ reset: false }` on failure so the user does not have to retype everything. Return all submitted values except passwords from `fail()`.

3. **Like button with optimistic toggle.** Build a "like" button using optimistic UI. Show the toggled state and updated count immediately when clicked. Roll back both the visual state and count if the server returns an error. Use a hidden input for the post ID so it works without JS. Prevent double-clicking by disabling the button during submission.

4. **File upload with preview.** Build a file upload form with image preview (using `URL.createObjectURL`) and a progress indicator. Use `enctype="multipart/form-data"` and handle the file in a server action. Show the uploaded image from the server response after success.

5. **Multi-action form.** Create a form with three submit buttons: Save (draft), Publish, and Delete. Each button uses a different `formaction`. Add a confirmation dialog for the delete action in the enhance callback. Ensure all three actions work without JavaScript.

6. **Accessible form with error focus.** Build a multi-field form with proper ARIA attributes (`aria-invalid`, `aria-describedby`, `aria-live` region). After a validation failure, automatically focus the first field with an error. Include a screen-reader-only status region that announces submission progress and results.

## Key Takeaways

- Progressive enhancement means the form works without JavaScript and gets better with it -- resilience by default, not graceful degradation
- `use:enhance` intercepts native form submission, sends a fetch request, and updates the page without a reload. The server code is identical with or without the directive
- Custom callbacks run before (validate, show loading, modify FormData, cancel) and after (handle result, rollback optimistic updates) submission
- The `result.type` is one of `'success'`, `'failure'`, `'redirect'`, or `'error'` -- handle each case explicitly
- Always validate on the server -- client-side validation is a UX convenience, not a security measure. `cancel()` in the enhance callback can be bypassed
- Use `{ reset: false }` in `update()` to preserve form values after validation failures. This is the single most common mistake in SvelteKit forms
- Return submitted values (except passwords) from `fail()` so the form repopulates on no-JS page reloads
- Optimistic UI shows changes immediately but must handle rollback when the server rejects the request. Use it for actions that almost always succeed (likes, comments, toggles), not for risky operations (payments, deletions)
- Always include actual form fields with `name` attributes so native submission works without JavaScript. Hidden inputs are your friend for values managed in JavaScript
- Prevent double submission by disabling the submit button during the request. For server-side protection, use idempotency keys
- `applyAction()` and `invalidateAll()` give you granular control when you need custom behavior between form submission and SvelteKit's default handling
- Accessibility matters: use `aria-invalid`, `aria-describedby`, `aria-live` regions, and focus management to make forms work for all users
- File uploads work with `use:enhance` -- just add `enctype="multipart/form-data"` to the form
- Multiple submit buttons with `formaction` attributes let a single form trigger different server actions, and this pattern works both with and without JavaScript
