# Notification System with Transitions

A project manager without notifications is just a spreadsheet. When a teammate assigns you a task, when someone comments on your card, or when a deadline approaches, you need to know about it — and you need to know about it in a way that feels polished and intentional, not jarring. That means smooth entrance animations, graceful exits, and a system that works both as ephemeral toasts (quick pop-ups that disappear) and as a persistent notification history you can review later.

This lesson builds the complete notification system for TeamBoard: a toast renderer with entrance and exit transitions, a notification dropdown with loading states, physics-based badge animations, and window-level event handling for marking notifications as read when the user returns to the tab.

## Toast Component with Entrance and Exit Transitions

Each toast slides in from the right side of the screen and fades out when dismissed. Using separate `in:` and `out:` directives gives you different animations for each direction:

```svelte
<!-- src/lib/components/ui/NotificationToast.svelte -->
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { flip } from 'svelte/animate';

  type Toast = {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    duration?: number;
  };

  let { toasts, onDismiss }: {
    toasts: Toast[];
    onDismiss: (id: string) => void;
  } = $props();
</script>

<div class="toast-container" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div
      class="toast toast-{toast.type}"
      role="alert"
      in:fly={{ x: 300, duration: 300 }}
      out:fade={{ duration: 200 }}
      animate:flip={{ duration: 250 }}
    >
      <div class="toast-icon">
        {#if toast.type === 'success'}
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
          </svg>
        {:else if toast.type === 'error'}
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
          </svg>
        {:else}
          <svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20">
            <path d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"/>
          </svg>
        {/if}
      </div>
      <div class="toast-content">
        <p class="toast-title">{toast.title}</p>
        <p class="toast-message">{toast.message}</p>
      </div>
      <button
        class="toast-close"
        onclick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
      >
        &times;
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 9999;
    max-width: 380px;
  }

  .toast {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 10px;
    color: white;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
    font-size: 0.9rem;
  }

  .toast-success { background: #16a34a; }
  .toast-error { background: #dc2626; }
  .toast-info { background: #2563eb; }
  .toast-warning { background: #d97706; }

  .toast-icon { flex-shrink: 0; margin-top: 1px; }
  .toast-content { flex: 1; }
  .toast-title { font-weight: 600; margin: 0 0 2px; }
  .toast-message { margin: 0; opacity: 0.9; font-size: 0.85rem; }

  .toast-close {
    background: none;
    border: none;
    color: white;
    font-size: 1.3rem;
    cursor: pointer;
    padding: 0 2px;
    opacity: 0.7;
    line-height: 1;
  }

  .toast-close:hover { opacity: 1; }
</style>
```

The `in:fly={{ x: 300, duration: 300 }}` makes each toast slide in from 300 pixels to the right — matching the toast container's position on the right edge of the screen. The `out:fade={{ duration: 200 }}` makes dismissed toasts dissolve rather than slide back out, which feels less distracting.

## animate:flip for Smooth Reordering

The `animate:flip` directive on each toast element is the secret ingredient. When a toast in the middle of the stack is dismissed, the remaining toasts need to shift position. Without `animate:flip`, they would jump instantly to their new positions. With it, they glide smoothly into place.

FLIP stands for First, Last, Invert, Play. Svelte measures each element's position before and after the DOM change, then animates from the old position to the new one. You get free layout animations just by adding the directive.

```svelte
{#each toasts as toast (toast.id)}
  <div
    in:fly={{ x: 300, duration: 300 }}
    out:fade={{ duration: 200 }}
    animate:flip={{ duration: 250 }}
  >
    <!-- toast content -->
  </div>
{/each}
```

Two things are required for `animate:flip` to work: the `{#each}` block must have a key expression `(toast.id)` so Svelte can track identity, and the elements must be direct children of the `{#each}` block. If you wrap the toast in a container `<div>` inside the each block, the flip needs to be on that container, not a child within it.

## Toast Queue with Auto-Dismiss

The toast component above is stateless — it just renders what it receives. The state management lives in a module that any part of the application can import:

```typescript
// src/lib/state/toast.svelte.ts
type ToastType = 'success' | 'error' | 'info' | 'warning';

type Toast = {
  id: string;
  type: ToastType;
  title: string;
  message: string;
  duration: number;
};

let toasts = $state<Toast[]>([]);
let toastCounter = 0;

// Track active timers so we can clean them up
const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function addToast(
  title: string,
  message: string,
  type: ToastType = 'info',
  duration: number = 4000
) {
  const id = `toast-${++toastCounter}`;

  toasts = [...toasts, { id, type, title, message, duration }];

  // Auto-dismiss after the specified duration
  if (duration > 0) {
    const timer = setTimeout(() => {
      dismissToast(id);
    }, duration);
    timers.set(id, timer);
  }

  return id;
}

export function dismissToast(id: string) {
  // Clear the auto-dismiss timer if it exists
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }

  toasts = toasts.filter(t => t.id !== id);
}

export function getToasts() {
  return toasts;
}

// Convenience shortcuts
export const toast = {
  success: (title: string, message: string) =>
    addToast(title, message, 'success'),
  error: (title: string, message: string) =>
    addToast(title, message, 'error', 6000),
  info: (title: string, message: string) =>
    addToast(title, message, 'info'),
  warning: (title: string, message: string) =>
    addToast(title, message, 'warning', 5000)
};
```

Error toasts stick around longer (6 seconds) because users need more time to read error messages. You can dismiss any toast early by clicking the close button, which calls `dismissToast` and clears the pending timer.

Mount the toast renderer once at the app layout level so it is always visible:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import NotificationToast from '$components/ui/NotificationToast.svelte';
  import { getToasts, dismissToast } from '$lib/state/toast.svelte';

  let { children } = $props();
</script>

{@render children()}

<NotificationToast toasts={getToasts()} onDismiss={dismissToast} />
```

Then fire toasts from anywhere — form actions, SSE handlers, button clicks:

```typescript
// In any component or module
import { toast } from '$lib/state/toast.svelte';

toast.success('Task created', 'Your new task is ready in the Backlog column.');
toast.error('Move failed', 'You do not have permission to edit this board.');
toast.info('New comment', 'Sarah commented on "Fix login bug".');
```

## Spring-Based Badge Animation

The notification badge in the header shows the count of unread notifications. When that count changes, a simple number swap feels flat. Using `Spring` from `svelte/motion` adds physics-based animation — the badge bounces slightly as the number updates, drawing the user's eye without being obnoxious.

```svelte
<!-- src/lib/components/layout/NotificationBadge.svelte -->
<script lang="ts">
  import { Spring } from 'svelte/motion';

  let { count }: { count: number } = $props();

  // The spring creates a smooth animated value that settles
  // with a slight bounce. Stiffness controls how fast it snaps,
  // damping controls how much it bounces.
  const animatedScale = new Spring(1, {
    stiffness: 300,
    damping: 15
  });

  // Whenever count changes, trigger a bounce: scale up to 1.4,
  // then the spring settles it back to 1.0 with a bounce
  $effect(() => {
    if (count > 0) {
      animatedScale.target = 1.4;
      // After a short delay, spring back to normal
      setTimeout(() => animatedScale.target = 1.0, 100);
    }
  });
</script>

{#if count > 0}
  <span
    class="badge"
    style:transform="scale({animatedScale.current})"
  >
    {count > 99 ? '99+' : count}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background: #dc2626;
    color: white;
    font-size: 0.7rem;
    font-weight: 700;
    line-height: 1;
    transform-origin: center;
  }
</style>
```

The `Spring` class creates a reactive object that animates toward its target using a physics simulation. With `stiffness: 300` and `damping: 15`, the badge overshoots slightly and oscillates before settling — like a real physical object coming to rest. The `animatedScale.current` property holds the spring's current value, which Svelte re-renders on every animation frame.

## Notification Dropdown with use:clickOutside

The header bell icon toggles a dropdown showing recent notifications. Clicking outside the dropdown should close it. This is a classic use case for a Svelte action:

```typescript
// src/lib/actions/click-outside.ts
export function clickOutside(
  node: HTMLElement,
  callback: () => void
) {
  function handleClick(event: MouseEvent) {
    if (
      node &&
      !node.contains(event.target as Node) &&
      !event.defaultPrevented
    ) {
      callback();
    }
  }

  document.addEventListener('click', handleClick, true);

  return {
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
}
```

Now build the dropdown component that uses this action:

```svelte
<!-- src/lib/components/layout/NotificationDropdown.svelte -->
<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { clickOutside } from '$actions/click-outside';
  import NotificationBadge from './NotificationBadge.svelte';
  import { query } from '$lib/api/notifications.remote';

  type Notification = {
    id: number;
    title: string;
    message: string;
    read: boolean;
    createdAt: string;
    type: 'task-assigned' | 'comment' | 'mention' | 'deadline';
  };

  let { unreadCount }: { unreadCount: number } = $props();

  let open = $state(false);
  let notificationsPromise = $state<Promise<Notification[]> | null>(null);

  function toggle() {
    open = !open;
    if (open && !notificationsPromise) {
      // Only fetch when opening for the first time
      notificationsPromise = query('getNotifications', { limit: 20 });
    }
  }

  function close() {
    open = false;
  }
</script>

<div class="notification-wrapper" use:clickOutside={close}>
  <button class="bell-button" onclick={toggle} aria-label="Notifications">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="22" height="22">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
    <NotificationBadge count={unreadCount} />
  </button>

  {#if open}
    <div class="dropdown" transition:fly={{ y: -8, duration: 200 }}>
      <div class="dropdown-header">
        <h3>Notifications</h3>
        {#if unreadCount > 0}
          <button class="mark-read-btn">Mark all read</button>
        {/if}
      </div>

      <div class="dropdown-body">
        {#if notificationsPromise}
          {#await notificationsPromise}
            <!-- Pending: skeleton loaders -->
            <div class="skeleton-list">
              {#each Array(4) as _}
                <div class="skeleton-item">
                  <div class="skeleton-line wide"></div>
                  <div class="skeleton-line narrow"></div>
                </div>
              {/each}
            </div>

          {:then notifications}
            <!-- Resolved: render the notification list -->
            {#if notifications.length === 0}
              <p class="empty-state">No notifications yet.</p>
            {:else}
              {#each notifications as notif (notif.id)}
                <div class="notif-item" class:unread={!notif.read}>
                  <div class="notif-dot"></div>
                  <div class="notif-content">
                    <p class="notif-title">{notif.title}</p>
                    <p class="notif-message">{notif.message}</p>
                    <time class="notif-time">
                      {new Date(notif.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                </div>
              {/each}
            {/if}

          {:catch error}
            <!-- Error: show a fallback message -->
            <div class="error-state">
              <p>Failed to load notifications.</p>
              <button onclick={() => {
                notificationsPromise = query('getNotifications', { limit: 20 });
              }}>
                Try Again
              </button>
            </div>
          {/await}
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .notification-wrapper {
    position: relative;
  }

  .bell-button {
    position: relative;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    color: #374151;
    border-radius: 8px;
  }

  .bell-button:hover { background: #f3f4f6; }

  .dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 8px;
    width: 360px;
    max-height: 480px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .dropdown-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border-bottom: 1px solid #f3f4f6;
  }

  .dropdown-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .mark-read-btn {
    background: none;
    border: none;
    color: #6366f1;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .dropdown-body {
    overflow-y: auto;
    flex: 1;
  }

  .notif-item {
    display: flex;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid #f9fafb;
    cursor: pointer;
  }

  .notif-item:hover { background: #f9fafb; }
  .notif-item.unread { background: #f0f4ff; }
  .notif-item.unread:hover { background: #e8edfc; }

  .notif-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #d1d5db;
    margin-top: 6px;
    flex-shrink: 0;
  }

  .unread .notif-dot { background: #6366f1; }
  .notif-content { flex: 1; }
  .notif-title { margin: 0; font-weight: 600; font-size: 0.875rem; }
  .notif-message { margin: 2px 0 4px; font-size: 0.8rem; color: #6b7280; }
  .notif-time { font-size: 0.75rem; color: #9ca3af; }

  .skeleton-list { padding: 8px 0; }
  .skeleton-item { padding: 12px 16px; }
  .skeleton-line {
    height: 12px;
    border-radius: 6px;
    background: #f3f4f6;
    margin-bottom: 8px;
  }
  .skeleton-line.wide { width: 80%; }
  .skeleton-line.narrow { width: 50%; }

  .empty-state {
    padding: 32px 16px;
    text-align: center;
    color: #9ca3af;
  }

  .error-state {
    padding: 24px 16px;
    text-align: center;
    color: #dc2626;
  }

  .error-state button {
    margin-top: 8px;
    padding: 6px 16px;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.8rem;
  }
</style>
```

The `{#await notificationsPromise}` block gives you three clean states with zero manual tracking. When `notificationsPromise` is pending, the skeleton loaders appear. When it resolves, you get the notification list. If it rejects, the error fallback shows a retry button that replaces the promise with a fresh one.

## Mark as Read on Tab Focus

Users often switch between tabs. When they come back to TeamBoard, any visible notifications should automatically be marked as read. The `<svelte:window>` special element lets you listen for window-level events declaratively:

```svelte
<!-- In the app layout or notification provider -->
<script lang="ts">
  import { command } from '$lib/api/notifications.remote';

  let unreadCount = $state(0);
  let lastFocusedAt = $state(Date.now());

  async function markAsRead() {
    // Only mark as read if the tab was blurred for at least 2 seconds
    // to avoid marking on rapid tab-switches
    if (Date.now() - lastFocusedAt < 2000) return;
    if (unreadCount === 0) return;

    try {
      await command('markNotificationsRead', {
        upTo: new Date().toISOString()
      });
      unreadCount = 0;
    } catch (err) {
      console.error('Failed to mark notifications as read:', err);
    }
  }

  function recordBlur() {
    lastFocusedAt = Date.now();
  }
</script>

<svelte:window onfocus={markAsRead} onblur={recordBlur} />
```

The `onfocus` handler fires every time the user returns to the tab. The `onblur` handler records when they left, so you can apply a minimum-away-time threshold and avoid marking notifications as read during quick alt-tabs.

## The Complete Notification System

Here is how all the pieces fit together in the app layout:

```svelte
<!-- src/routes/(app)/+layout.svelte -->
<script lang="ts">
  import NotificationToast from '$components/ui/NotificationToast.svelte';
  import NotificationDropdown from '$components/layout/NotificationDropdown.svelte';
  import Header from '$components/layout/Header.svelte';
  import { getToasts, dismissToast } from '$lib/state/toast.svelte';
  import { command } from '$lib/api/notifications.remote';

  let { children, data } = $props();

  let unreadCount = $state(data.unreadNotificationCount);

  async function markAsRead() {
    if (unreadCount === 0) return;
    try {
      await command('markNotificationsRead', {
        upTo: new Date().toISOString()
      });
      unreadCount = 0;
    } catch {
      // Silent failure — not critical
    }
  }
</script>

<svelte:window onfocus={markAsRead} />

<Header>
  {#snippet actions()}
    <NotificationDropdown {unreadCount} />
  {/snippet}
</Header>

<main>
  {@render children()}
</main>

<!-- Toast renderer — always present, renders above all content -->
<NotificationToast toasts={getToasts()} onDismiss={dismissToast} />
```

The notification system has four layers:

1. **Toast state** (`toast.svelte.ts`) — a module-level `$state` array that any component or module can push to, with auto-dismiss timers.
2. **Toast renderer** (`NotificationToast.svelte`) — mounted once in the layout, renders the stack with `fly`/`fade` transitions and `animate:flip` for smooth reordering.
3. **Dropdown** (`NotificationDropdown.svelte`) — persistent notification history loaded with `{#await}`, closed with `use:clickOutside`.
4. **Badge** (`NotificationBadge.svelte`) — unread count with a `Spring`-based bounce animation.

SSE events from the previous lesson trigger toasts for actions by other team members:

```typescript
// In the SSE event handler from lesson 1
sse.on('task-created', (event) => {
  const { createdBy, taskTitle } = event as TaskCreatedEvent;

  // Only show toast for other users' actions
  if (createdBy.id !== currentUser.id) {
    toast.info(
      'New task',
      `${createdBy.name} created "${taskTitle}"`
    );
  }

  // Update board state...
});
```

## Try It

Build a "Toast Playground" page that demonstrates all the features:

1. Add four buttons that each create a different toast type (success, error, info, warning).
2. Add a "Rapid Fire" button that creates 5 toasts in quick succession with 200ms delays — watch the `animate:flip` reorder as earlier toasts auto-dismiss while later ones are still entering.
3. Create a toast counter using `$derived` that shows how many toasts are currently visible.
4. Add a "Dismiss All" button that clears every toast at once.
5. Experiment with the spring parameters on the badge — try `stiffness: 100, damping: 5` for a slow, wobbly bounce, then `stiffness: 500, damping: 25` for a tight snap.

## Key Takeaways

- Use `in:fly` and `out:fade` on toast elements for distinct entrance and exit animations — slide in from the side, fade out on dismiss
- `animate:flip` makes remaining items glide smoothly when a sibling is removed from the middle of a list — requires a keyed `{#each}` block
- Manage toast state in a module-level `$state` array with `setTimeout` for auto-dismiss and manual `clearTimeout` for early dismissal
- `Spring` from `svelte/motion` adds physics-based animation to numeric values — use it for badge counts, progress indicators, and other values that benefit from natural-feeling motion
- The `use:clickOutside` action pattern attaches a document-level click listener and checks `node.contains()` — remember to clean up in the `destroy` function
- `{#await promise}` gives you pending, resolved, and rejected states with zero boilerplate — perfect for loading notification history
- `<svelte:window onfocus={handler}>` fires when the user returns to the tab — use it for marking notifications as read or refreshing stale data
- Mount the toast renderer once at the layout level so it is always available, and import the `toast` helper from anywhere in the app to trigger notifications
