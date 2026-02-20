# App Navigation

SvelteKit intercepts link clicks and performs client-side navigation automatically, but real applications need more control. You might need to navigate after a form submission, warn users about unsaved changes, track page views for analytics, or update the URL without a full page load. The `$app/navigation` module provides functions for all of these scenarios.

These functions only work in the browser. They run inside components, actions, or event handlers — never in server load functions.

## Programmatic Navigation with goto

The `goto` function navigates to a URL from JavaScript. It accepts an options object for fine-grained control:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';

  async function handleCheckout() {
    const order = await submitOrder();

    // Replace history entry so "Back" skips the checkout page
    goto(`/orders/${order.id}`, { replaceState: true });
  }

  function openSettings() {
    // Prevent scroll reset after navigation
    goto('/settings', { noScroll: true });
  }

  function refreshDashboard() {
    // Navigate and re-run all load functions
    goto('/dashboard', { invalidateAll: true });
  }
</script>
```

The full set of options includes `replaceState`, `noScroll`, `keepFocus`, `invalidateAll`, and `state`. The `state` option attaches data to the history entry that you can read later through `$page.state`.

## Intercepting Navigation with beforeNavigate

`beforeNavigate` runs before the user leaves the current page. You can cancel the navigation or redirect elsewhere. This is essential for protecting unsaved form data:

```svelte
<script lang="ts">
  import { beforeNavigate } from '$app/navigation';

  let hasUnsavedChanges = $state(false);

  beforeNavigate((navigation) => {
    if (hasUnsavedChanges) {
      if (!confirm('You have unsaved changes. Leave this page?')) {
        navigation.cancel();
      }
    }
  });
</script>

<form>
  <input oninput={() => hasUnsavedChanges = true} />
  <button type="submit">Save</button>
</form>
```

The `navigation` object includes `from`, `to`, `type` (link, goto, popstate, etc.), and `willUnload` (true when navigating to an external URL). When `willUnload` is true, calling `cancel()` is the only option — you cannot redirect.

## Running Code After Navigation with afterNavigate

`afterNavigate` fires after a navigation completes and the new page is rendered. Common uses include analytics tracking and scroll restoration:

```svelte
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  afterNavigate((navigation) => {
    // Track page views
    analytics.track('pageview', {
      from: navigation.from?.url.pathname,
      to: navigation.to?.url.pathname
    });
  });
</script>
```

Because it runs after the DOM has updated, `afterNavigate` is a safe place to interact with DOM elements on the new page.

## View Transitions with onNavigate

`onNavigate` runs during navigation and can return a promise. This makes it the integration point for the View Transitions API:

```svelte
<script lang="ts">
  import { onNavigate } from '$app/navigation';

  onNavigate((navigation) => {
    if (!document.startViewTransition) return;

    return new Promise((resolve) => {
      document.startViewTransition(async () => {
        resolve();
        await navigation.complete;
      });
    });
  });
</script>
```

Place this in your root `+layout.svelte` to enable view transitions across your entire app. The browser will animate between the old and new page states.

## Shallow Routing with pushState and replaceState

Sometimes you want to change the URL without triggering a full navigation — for example, opening a modal that should have its own shareable URL:

```svelte
<script lang="ts">
  import { pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';

  function openModal(productId: string) {
    pushState(`/products/${productId}`, { showModal: true });
  }

  function closeModal() {
    history.back();
  }
</script>

{#if $page.state.showModal}
  <div class="modal-overlay" onclick={closeModal}>
    <div class="modal">
      <h2>Product Details</h2>
      <p>This modal has its own URL!</p>
    </div>
  </div>
{/if}
```

`pushState` adds a new history entry. `replaceState` overwrites the current one. Neither triggers load functions — the page component stays mounted with its current data.

## Refreshing Data with invalidate and invalidateAll

When data changes on the server (after a mutation, a webhook, or a timer), you can re-run load functions without a full navigation:

```svelte
<script lang="ts">
  import { invalidate, invalidateAll } from '$app/navigation';

  async function markAsRead(notificationId: string) {
    await fetch(`/api/notifications/${notificationId}`, { method: 'PATCH' });

    // Re-run load functions that depend on this URL
    invalidate('/api/notifications');
  }

  async function refreshEverything() {
    // Re-run ALL load functions on the current page
    invalidateAll();
  }
</script>
```

`invalidate` targets load functions that called `fetch` with a matching URL or that declared a dependency with `depends('custom:key')`. `invalidateAll` re-runs every load function on the current page.

## Try It

Build a multi-step form wizard with three steps. Use `goto` with `replaceState` to navigate between steps so that the browser back button goes to the page before the wizard, not the previous step. Add a `beforeNavigate` guard that warns the user if they try to leave mid-wizard. After the final step, navigate to a confirmation page and use `afterNavigate` to log the completed flow.

## Key Takeaways

- `goto(url, opts)` provides programmatic navigation with options for history, scroll, focus, and data invalidation
- `beforeNavigate` intercepts navigation before it happens — use it for unsaved changes warnings
- `afterNavigate` runs after the new page renders — ideal for analytics and DOM interactions
- `onNavigate` integrates with the View Transitions API for animated page transitions
- `pushState` and `replaceState` update the URL without a full navigation — perfect for modals and filters
- `invalidate` and `invalidateAll` re-run load functions to refresh server data without a page reload
