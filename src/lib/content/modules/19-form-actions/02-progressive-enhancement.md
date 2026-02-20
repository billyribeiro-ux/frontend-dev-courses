# Progressive Enhancement

SvelteKit form actions work without JavaScript by default — the browser submits the form, the server processes it, and the page reloads with updated data. This is called **progressive enhancement**: the basic experience works for everyone, and JavaScript adds a better experience on top.

The `use:enhance` directive upgrades a standard form submission into an AJAX-style request. The page updates without a full reload, giving users a smoother experience while maintaining the same server-side logic.

## Basic use:enhance

Import `enhance` from `$app/forms` and add it to your form:

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
```

With `use:enhance`, submitting the form:

1. Sends the data via fetch (no page reload)
2. Invalidates all load functions to refresh data
3. Updates the `form` prop with the action's response
4. Resets the form fields on success

The server code stays exactly the same. Only the client-side behavior improves.

## Custom Enhance Callbacks

Pass a function to `use:enhance` for custom behavior. The function runs before the submission and returns a callback that runs after:

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
      await update();
      submitting = false;
    };
  }}
>
  <input name="title" required />
  <button type="submit" disabled={submitting}>
    {submitting ? 'Saving...' : 'Add'}
  </button>
</form>
```

The function receives no arguments before submit. The returned callback receives an object with `result`, `update`, and `formElement`.

## Optimistic UI

Optimistic UI updates the interface immediately before the server confirms the change. This makes the app feel instant:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms';

  let { data } = $props();
  let optimisticTodos = $state<Array<{ id: number; text: string }>>([]);

  let todos = $derived([...data.todos, ...optimisticTodos]);
</script>

<form
  method="POST"
  action="?/create"
  use:enhance={({ formData }) => {
    const text = formData.get('text') as string;
    const tempId = Date.now();

    // Add immediately before server responds
    optimisticTodos.push({ id: tempId, text });

    return async ({ update }) => {
      await update();
      // Clear optimistic items — real data comes from the server
      optimisticTodos = [];
    };
  }}
>
  <input name="text" placeholder="New todo..." required />
  <button type="submit">Add</button>
</form>

<ul>
  {#each todos as todo}
    <li>{todo.text}</li>
  {/each}
</ul>
```

The todo appears instantly in the list. When the server responds, `update()` refreshes the real data and the optimistic placeholder is removed.

## Controlling the Update

The returned callback can skip the default update behavior for full control:

```svelte
<form
  method="POST"
  action="?/delete"
  use:enhance={() => {
    return async ({ result, update }) => {
      if (result.type === 'success') {
        // Custom success handling
        await update();
      } else if (result.type === 'failure') {
        // Handle failure without resetting the form
        await update({ reset: false });
      }
    };
  }}
>
```

Pass `{ reset: false }` to `update()` to keep the form values after submission — useful when validation fails and you want to preserve the user's input.

## Try It

Build a todo list with optimistic delete. When the user clicks "Delete" on a todo, immediately hide it from the list using a reactive set of hidden IDs. If the server action fails, remove the ID from the hidden set so the todo reappears. Use `use:enhance` with a custom callback to handle both success and failure.

## Key Takeaways

- `use:enhance` upgrades forms to submit without page reloads
- Without arguments, it handles invalidation, form reset, and `form` prop updates automatically
- Pass a function for custom behavior: it runs before submit and returns an after-submit callback
- The callback receives `result` (the action's response) and `update` (the default behavior)
- Optimistic UI adds items to the interface before the server confirms, then syncs on response
- Use `{ reset: false }` in `update()` to keep form values after failed validation
