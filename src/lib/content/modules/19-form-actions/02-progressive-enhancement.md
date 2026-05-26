# Progressive Enhancement

Progressive enhancement is a philosophy: **build the foundation first, then layer improvements on top**. A form should work with nothing but HTML and the server. When JavaScript loads, it gets *better* — smoother, faster, more responsive — but it never becomes *required*.

SvelteKit embraces this philosophy at its core. Your form actions run on the server. A plain `<form method="POST">` submits data, the server processes it, and the browser reloads with the result. It works in every browser, on every device, on slow connections, with JavaScript disabled, and for screen readers. That is your baseline.

The `use:enhance` directive then upgrades that baseline into a modern, single-page-app experience — without changing a single line of server code.

## Why Progressive Enhancement Matters

Before diving into the API, understand *why* this approach is valuable:

- **Resilience**: JavaScript fails more often than you think — ad blockers, network errors, slow CDNs, browser bugs. Forms that require JS break silently. Forms that work without JS always work.
- **Accessibility**: Screen readers and assistive technology work with standard HTML forms natively. Custom JS-driven forms often break accessibility unless carefully tested.
- **SEO**: Search engine crawlers may not execute JavaScript. Server-rendered form responses are visible; client-only interactions are not.
- **Performance on slow connections**: On a 2G connection, a 200KB JavaScript bundle takes seconds to download and parse. A plain HTML form works immediately. The JS enhancement arrives later and improves the experience.
- **Progressive loading**: On first page load, the HTML arrives and the form is functional before JavaScript has finished downloading. There is no "loading..." state where buttons do not work.

This is not about supporting users who deliberately disable JavaScript. It is about building apps that are robust by default and excellent when conditions are ideal.

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
  <p class="error">{form.error}</p>
{/if}
```

Without `use:enhance`, this form triggers a full page navigation on submit — the browser sends a POST request, the server responds, and the entire page reloads. With `use:enhance`, the same form:

1. **Prevents the full page reload** — intercepts the native form submission
2. **Sends the data via `fetch`** — makes the same POST request but as an AJAX call
3. **Invalidates all load functions** — re-runs your `load` functions to refresh page data
4. **Updates `$page.form`** — makes the action's response available as the `form` prop
5. **Resets the form fields** on success (but not on failure)

The server code stays exactly the same. The `use:enhance` directive is purely a client-side upgrade. If JavaScript has not loaded yet, the form falls back to native browser submission — which still works because your server action handles it either way.

## How It Works Under the Hood

Understanding the mechanism helps you debug issues and write better custom callbacks:

```
Without use:enhance (native HTML form):
  User clicks submit
  → Browser serializes form data
  → Browser sends POST request (full navigation)
  → Server runs the action, returns HTML
  → Browser replaces the entire page

With use:enhance (JavaScript-enhanced):
  User clicks submit
  → SvelteKit intercepts the submit event (event.preventDefault())
  → SvelteKit serializes the form data
  → SvelteKit sends a fetch() POST request with the same data
  → Server runs the same action, returns the result as JSON
  → SvelteKit processes the result:
      - On success: invalidates load functions, updates $page.form, resets form
      - On failure: updates $page.form (keeps form values)
      - On redirect: navigates via client-side routing
```

The key insight: the server does the same work in both cases. The difference is entirely in how the browser handles the submission and the response. This is why progressive enhancement works so well in SvelteKit — the server is the source of truth, and the client just optimizes the delivery.

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
  use:enhance={({ formData, cancel, formElement }) => {
    // BEFORE submission — validate, show loading state, modify data
    const title = formData.get('title') as string;

    if (title.length < 3) {
      errorMessage = 'Title must be at least 3 characters';
      cancel(); // Prevent the request from being sent
      return;   // No return callback needed
    }

    submitting = true;
    errorMessage = '';

    // AFTER submission — handle the response
    return async ({ result, update }) => {
      submitting = false;

      if (result.type === 'success') {
        // Let SvelteKit handle the default behavior
        await update();
      } else if (result.type === 'failure') {
        // Show the error but keep form values
        errorMessage = result.data?.message ?? 'Something went wrong';
        await update({ reset: false });
      } else if (result.type === 'redirect') {
        // SvelteKit handles redirects automatically
        await update();
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
  <p class="error">{errorMessage}</p>
{/if}
```

The before-submit function receives:

- **`formData`** — the `FormData` object (you can read, modify, or add fields)
- **`formElement`** — the HTML form element
- **`cancel()`** — call this to abort the submission entirely
- **`action`** — the URL the form will submit to
- **`submitter`** — the button/element that triggered the submission

The after-submit callback receives:

- **`result`** — the action's response: `{ type: 'success' | 'failure' | 'redirect' | 'error', data?, status?, location? }`
- **`update(options?)`** — runs the default behavior (invalidate, update form prop, reset). Call it to let SvelteKit handle things; skip it for full manual control
- **`formElement`** — the HTML form element
- **`formData`** — the original `FormData` object

## Validation: Client and Server

A critical principle: **always validate on the server, optionally validate on the client**.

Client-side validation (in the `use:enhance` callback) provides instant feedback — the user sees an error before the request is sent. But it can be bypassed by anyone who opens the browser console. Server-side validation in your form action is the actual security boundary.

```svelte
<form
  method="POST"
  action="?/register"
  use:enhance={({ formData, cancel }) => {
    // Client-side validation — nice UX, not a security measure
    const email = formData.get('email') as string;
    if (!email.includes('@')) {
      errorMessage = 'Please enter a valid email';
      cancel();
      return;
    }

    return async ({ result, update }) => {
      if (result.type === 'failure') {
        // Server-side validation failed — this is the real check
        errorMessage = result.data?.message ?? 'Validation failed';
        await update({ reset: false });
      } else {
        await update();
      }
    };
  }}
>
```

With progressive enhancement, the server validation works even without JavaScript — the user submits the form natively, the server validates and returns an error, and the page reloads with the error message. The client-side validation is purely an improvement to the experience, not a replacement for server logic.

## Optimistic UI

Optimistic UI updates the interface immediately *before* the server confirms the change. This makes the app feel instant — the user sees their action reflected immediately instead of waiting for a network round-trip.

The pattern: add the item to local state immediately, send the request, and clean up when the server responds.

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();

  // Temporary items shown while waiting for server confirmation
  let optimisticTodos = $state<Array<{ id: string; text: string; pending: boolean }>>([]);

  // Combine real data with optimistic items
  let allTodos = $derived([
    ...data.todos,
    ...optimisticTodos
  ]);
</script>

<form
  method="POST"
  action="?/addTodo"
  use:enhance={({ formData }) => {
    const text = formData.get('text') as string;
    const tempId = crypto.randomUUID();

    // Optimistically add the todo BEFORE the server responds
    optimisticTodos.push({ id: tempId, text, pending: true });

    return async ({ result, update }) => {
      if (result.type === 'success') {
        // Server confirmed — clear optimistic items,
        // real data comes from the re-run load function
        optimisticTodos = [];
        await update();
      } else {
        // Server rejected — remove the optimistic item (rollback)
        optimisticTodos = optimisticTodos.filter(t => t.id !== tempId);
        await update({ reset: false });
      }
    };
  }}
>
  <input name="text" placeholder="New todo..." required />
  <button type="submit">Add</button>
</form>

<ul>
  {#each allTodos as todo}
    <li class:pending={todo.pending}>
      {todo.text}
      {#if todo.pending}
        <span class="saving">Saving...</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .pending {
    opacity: 0.6;
  }
</style>
```

The todo appears instantly in the list with a visual indicator that it is being saved. If the server succeeds, the load function re-runs and replaces the optimistic item with the real one. If the server fails, the optimistic item is removed — the todo "disappears," signaling to the user that it was not saved.

### When to Use Optimistic UI

Optimistic UI is best for actions that almost always succeed — adding a comment, toggling a like, reordering a list. For actions that frequently fail (payment processing, complex validation), showing a loading state is more honest than pretending the action succeeded.

Think of progressive enhancement as three layers, each building on the previous one:
1. **No JS**: Form submits natively, page reloads, server validation errors show via `form?.error`
2. **With JS**: No page reload, smooth AJAX submission, loading state on the button
3. **Optimistic**: Changes appear instantly before the server confirms

If any layer fails, the layers below still work.

## Controlling the Update

The `update()` function in the return callback runs SvelteKit's default post-submission behavior. You can customize it or skip it entirely:

```svelte
<form
  method="POST"
  action="?/delete"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'success') {
        // Run default behavior (invalidate loads, update form prop, reset)
        await update();
      } else if (result.type === 'failure') {
        // Keep form values after validation failure
        await update({ reset: false });
      } else if (result.type === 'error') {
        // Unexpected server error — handle manually
        alert('Something went wrong. Please try again.');
        // NOT calling update() — skip default behavior entirely
      }
    };
  }}
>
```

If you do not call `update()` at all, SvelteKit does nothing — no invalidation, no form reset, no `$page.form` update. You are in full control. This is useful when you want to handle the response entirely in your own code, but be aware that skipping `update()` means load functions will not re-run and your data may become stale.

## Common Mistakes

**Relying only on client-side validation:**
The `cancel()` function in the enhance callback is a UX convenience. An attacker can submit the form directly to your server endpoint, bypassing all client-side checks. Always validate in your form action.

**Not handling the no-JS case:**
If your form only works with `use:enhance` (e.g., you build the FormData entirely in JavaScript without corresponding form fields), it breaks without JS. Always make sure there are actual `<input>` elements with `name` attributes so the native form submission sends the right data.

**Forgetting `{ reset: false }` on failure:**
By default, `update()` resets form fields. If validation fails and you call `update()` without `{ reset: false }`, the user loses everything they typed. This is frustrating and unnecessary.

**Not showing loading state:**
Without a visual indicator, the user does not know the form is submitting. They may click the button again, causing duplicate submissions. Always disable the button and show feedback during submission.

**Optimistic UI without rollback:**
If you optimistically add an item but do not remove it when the server rejects the request, the UI shows data that does not exist. Always handle the failure case.

## Try It

1. Build a todo list with optimistic delete. When the user clicks "Delete," immediately hide the item by adding its ID to a `$state` set of hidden IDs. If the server action fails, remove the ID from the set so the item reappears. Make sure the delete works without JavaScript too (native form submit with page reload).

2. Create a registration form with both client-side and server-side validation. The client should check that passwords match and are at least 8 characters (instant feedback). The server should check if the email is already taken. Use `{ reset: false }` on failure so the user does not have to retype everything.

3. Build a "like" button using optimistic UI. Show the incremented count immediately when clicked, and roll it back if the server returns an error. Bonus: prevent double-clicking by disabling the button during submission.

## Key Takeaways

- Progressive enhancement means the form works without JavaScript and gets better with it — resilience by default
- `use:enhance` intercepts native form submission, sends a fetch request, and updates the page without a reload
- The server code is identical with or without `use:enhance` — the directive is purely a client-side upgrade
- Custom callbacks run before (validate, show loading, cancel) and after (handle result, rollback) submission
- Always validate on the server — client-side validation is a UX convenience, not a security measure
- Use `{ reset: false }` in `update()` to preserve form values after validation failures
- Optimistic UI shows changes immediately but must handle rollback when the server rejects the request
- Always include actual form fields with `name` attributes so native submission works without JavaScript
