# Drag-and-Drop with Actions

A Kanban board without drag-and-drop is just a list with extra steps. Dragging a task card from "In Progress" to "Done" is the defining interaction of TeamBoard, and it needs to feel instant, tactile, and responsive. In this lesson you will build a suite of custom Svelte actions that handle drag-and-drop, click-outside dismissal, tooltips, and long-press for mobile context menus — all from scratch using pointer events.

Why pointer events instead of the HTML Drag and Drop API? The native API is notoriously quirky — it fires different events on mobile vs desktop, has limited styling control during the drag, and behaves inconsistently across browsers. Pointer events (`pointerdown`, `pointermove`, `pointerup`) give you a single, unified model that works identically with mouse, touch, and stylus. You get full control over the visual feedback, and you can add physics-based motion later without fighting the browser.

## The draggable Action

The `draggable` action makes any element movable. It tracks the initial pointer position, applies CSS transforms as the user drags, and dispatches custom events so parent components can react:

```typescript
// src/lib/actions/drag.ts
import type { Action } from 'svelte/action';

export interface DraggableParams {
  enabled?: boolean;
  axis?: 'both' | 'x' | 'y';
  handle?: string; // CSS selector for drag handle within the element
  data?: unknown; // Arbitrary data passed through drag events
}

interface DragEventDetail {
  x: number;
  y: number;
  dx: number; // total delta from start
  dy: number;
  data: unknown;
  node: HTMLElement;
}

export const draggable: Action<HTMLElement, DraggableParams> = (node, params = {}) => {
  let enabled = params.enabled ?? true;
  let axis = params.axis ?? 'both';
  let handle = params.handle;
  let data = params.data;

  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let isDragging = false;

  function isHandle(target: EventTarget | null): boolean {
    if (!handle) return true; // No handle specified — entire element is draggable
    if (!(target instanceof HTMLElement)) return false;
    return target.closest(handle) !== null;
  }

  function onPointerDown(event: PointerEvent) {
    if (!enabled || !isHandle(event.target)) return;

    // Prevent text selection and capture the pointer
    event.preventDefault();
    node.setPointerCapture(event.pointerId);

    startX = event.clientX;
    startY = event.clientY;
    currentX = 0;
    currentY = 0;
    isDragging = true;

    node.style.zIndex = '1000';
    node.style.cursor = 'grabbing';
    node.style.userSelect = 'none';

    node.dispatchEvent(
      new CustomEvent<DragEventDetail>('dragstart', {
        detail: { x: startX, y: startY, dx: 0, dy: 0, data, node }
      })
    );
  }

  function onPointerMove(event: PointerEvent) {
    if (!isDragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    currentX = axis === 'y' ? 0 : dx;
    currentY = axis === 'x' ? 0 : dy;

    node.style.transform = `translate(${currentX}px, ${currentY}px)`;

    node.dispatchEvent(
      new CustomEvent<DragEventDetail>('dragmove', {
        detail: { x: event.clientX, y: event.clientY, dx: currentX, dy: currentY, data, node }
      })
    );
  }

  function onPointerUp(event: PointerEvent) {
    if (!isDragging) return;

    isDragging = false;
    node.releasePointerCapture(event.pointerId);

    // Reset visual styles
    node.style.transform = '';
    node.style.zIndex = '';
    node.style.cursor = '';
    node.style.userSelect = '';

    node.dispatchEvent(
      new CustomEvent<DragEventDetail>('dragend', {
        detail: { x: event.clientX, y: event.clientY, dx: currentX, dy: currentY, data, node }
      })
    );
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointermove', onPointerMove);
  node.addEventListener('pointerup', onPointerUp);

  return {
    update(newParams: DraggableParams) {
      enabled = newParams.enabled ?? true;
      axis = newParams.axis ?? 'both';
      handle = newParams.handle;
      data = newParams.data;
    },
    destroy() {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
    }
  };
};
```

Let's walk through the design decisions:

- **`setPointerCapture`** ensures that even if the pointer leaves the element mid-drag, the element keeps receiving events. Without this, dragging quickly would "lose" the element when the cursor outruns it.
- **`axis` constraint** lets you restrict drag to horizontal-only (for reordering columns) or vertical-only (for reordering tasks within a column).
- **`handle` selector** means you can designate a small grip icon as the drag target instead of the entire card. Users can still select text in the card body without triggering a drag.
- **Custom events** (`dragstart`, `dragmove`, `dragend`) carry a `detail` payload, so the parent component knows exactly where the drag started, where it ended, and what data was being dragged.

## The dropzone Action

A draggable element needs somewhere to land. The `dropzone` action highlights when a draggable item hovers over it and dispatches a custom `drop` event when the item is released:

```typescript
// src/lib/actions/drag.ts (continued)
export interface DropzoneParams {
  enabled?: boolean;
  accepts?: string; // Optional type filter
  hoverClass?: string;
}

interface DropEventDetail {
  data: unknown;
  x: number;
  y: number;
}

export const dropzone: Action<HTMLElement, DropzoneParams> = (node, params = {}) => {
  let enabled = params.enabled ?? true;
  let hoverClass = params.hoverClass ?? 'dropzone-hover';

  function isOverDropzone(x: number, y: number): boolean {
    const rect = node.getBoundingClientRect();
    return (
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom
    );
  }

  // Listen for dragmove events bubbling up from draggable children or siblings
  function onDragMove(event: Event) {
    if (!enabled) return;
    const detail = (event as CustomEvent<DragEventDetail>).detail;

    if (isOverDropzone(detail.x, detail.y)) {
      node.classList.add(hoverClass);
    } else {
      node.classList.remove(hoverClass);
    }
  }

  function onDragEnd(event: Event) {
    if (!enabled) return;
    const detail = (event as CustomEvent<DragEventDetail>).detail;

    node.classList.remove(hoverClass);

    if (isOverDropzone(detail.x, detail.y)) {
      node.dispatchEvent(
        new CustomEvent<DropEventDetail>('drop', {
          detail: { data: detail.data, x: detail.x, y: detail.y }
        })
      );
    }
  }

  // Listen on the document so we catch drags from anywhere on the board
  document.addEventListener('dragmove', onDragMove, true);
  document.addEventListener('dragend', onDragEnd, true);

  return {
    update(newParams: DropzoneParams) {
      enabled = newParams.enabled ?? true;
      hoverClass = newParams.hoverClass ?? 'dropzone-hover';
    },
    destroy() {
      document.removeEventListener('dragmove', onDragMove, true);
      document.removeEventListener('dragend', onDragEnd, true);
      node.classList.remove(hoverClass);
    }
  };
};
```

The dropzone listens on `document` in the capture phase so it can intercept `dragmove` and `dragend` custom events dispatched from any draggable element on the page. It uses `getBoundingClientRect()` to do hit testing — checking whether the pointer coordinates fall within the dropzone's bounds. The `hoverClass` parameter lets you customize the visual feedback per dropzone (maybe columns glow blue while the trash area glows red).

## The clickOutside Action

Task cards often open edit popovers or detail panels. Clicking outside should dismiss them. This is a common enough pattern to warrant its own reusable action:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

interface ClickOutsideParams {
  enabled?: boolean;
  exclude?: string[]; // CSS selectors for elements that should NOT trigger close
}

export const clickOutside: Action<HTMLElement, ClickOutsideParams | undefined> = (
  node,
  params
) => {
  let enabled = params?.enabled ?? true;
  let exclude = params?.exclude ?? [];

  function handlePointerDown(event: PointerEvent) {
    if (!enabled) return;

    const target = event.target as HTMLElement;

    // Is the click inside the node itself?
    if (node.contains(target)) return;

    // Is the click on an excluded element?
    const isExcluded = exclude.some((selector) => target.closest(selector) !== null);
    if (isExcluded) return;

    node.dispatchEvent(new CustomEvent('clickoutside'));
  }

  // Use pointerdown instead of click — it fires before focus changes,
  // which prevents race conditions with blur-based logic
  document.addEventListener('pointerdown', handlePointerDown, true);

  return {
    update(newParams: ClickOutsideParams | undefined) {
      enabled = newParams?.enabled ?? true;
      exclude = newParams?.exclude ?? [];
    },
    destroy() {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    }
  };
};
```

Why `pointerdown` instead of `click`? The `click` event fires after `mouseup`, which means focus has already shifted by the time your handler runs. This causes annoying race conditions — a dropdown might close and immediately reopen because the button that triggered it receives the click event too. Using `pointerdown` fires first, giving you clean control over dismissal.

Here is how you use it on a task edit popover:

```svelte
<script lang="ts">
  import { clickOutside } from '$actions/clickOutside';

  let isEditing = $state(false);
  let taskTitle = $state('Build user authentication');
</script>

{#if isEditing}
  <div
    class="edit-popover"
    use:clickOutside={{ exclude: ['.edit-trigger'] }}
    onclickoutside={() => isEditing = false}
  >
    <input type="text" bind:value={taskTitle} />
    <button onclick={() => isEditing = false}>Save</button>
  </div>
{/if}

<button class="edit-trigger" onclick={() => isEditing = true}>
  Edit Task
</button>
```

The `exclude` parameter is important — without it, clicking the "Edit Task" button would trigger `clickOutside` (because the button is outside the popover), closing it immediately after it opens.

## The tooltip Action

Task cards in TeamBoard show tooltips for truncated titles, due dates, and assignee names. This action positions a tooltip relative to the target element using `getBoundingClientRect()`:

```typescript
// src/lib/actions/tooltip.ts
import type { Action } from 'svelte/action';

interface TooltipParams {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const tooltip: Action<HTMLElement, TooltipParams | string> = (node, params) => {
  const config = typeof params === 'string' ? { text: params } : params;
  let text = config.text;
  let position = config.position ?? 'top';
  let delay = config.delay ?? 400;

  let tooltipEl: HTMLDivElement | null = null;
  let showTimeout: ReturnType<typeof setTimeout>;

  function createTooltip() {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'action-tooltip';
    tooltipEl.textContent = text;
    tooltipEl.setAttribute('role', 'tooltip');

    // Style it
    Object.assign(tooltipEl.style, {
      position: 'fixed',
      padding: '6px 10px',
      background: '#1e293b',
      color: '#f8fafc',
      fontSize: '0.8rem',
      borderRadius: '6px',
      pointerEvents: 'none',
      zIndex: '9999',
      whiteSpace: 'nowrap',
      opacity: '0',
      transition: 'opacity 150ms ease'
    });

    document.body.appendChild(tooltipEl);

    // Position based on the target element
    const rect = node.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();

    let top: number;
    let left: number;

    switch (position) {
      case 'top':
        top = rect.top - tipRect.height - 8;
        left = rect.left + (rect.width - tipRect.width) / 2;
        break;
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + (rect.width - tipRect.width) / 2;
        break;
      case 'left':
        top = rect.top + (rect.height - tipRect.height) / 2;
        left = rect.left - tipRect.width - 8;
        break;
      case 'right':
        top = rect.top + (rect.height - tipRect.height) / 2;
        left = rect.right + 8;
        break;
    }

    // Clamp to viewport
    top = Math.max(4, Math.min(top, window.innerHeight - tipRect.height - 4));
    left = Math.max(4, Math.min(left, window.innerWidth - tipRect.width - 4));

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;

    // Fade in
    requestAnimationFrame(() => {
      if (tooltipEl) tooltipEl.style.opacity = '1';
    });
  }

  function removeTooltip() {
    clearTimeout(showTimeout);
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }

  function onPointerEnter() {
    showTimeout = setTimeout(createTooltip, delay);
  }

  function onPointerLeave() {
    removeTooltip();
  }

  node.addEventListener('pointerenter', onPointerEnter);
  node.addEventListener('pointerleave', onPointerLeave);

  return {
    update(newParams: TooltipParams | string) {
      const newConfig = typeof newParams === 'string' ? { text: newParams } : newParams;
      text = newConfig.text;
      position = newConfig.position ?? 'top';
      delay = newConfig.delay ?? 400;
      // If tooltip is visible, update its content
      if (tooltipEl) tooltipEl.textContent = text;
    },
    destroy() {
      removeTooltip();
      node.removeEventListener('pointerenter', onPointerEnter);
      node.removeEventListener('pointerleave', onPointerLeave);
    }
  };
};
```

A few important details:

- **`role="tooltip"`** makes it accessible to screen readers.
- **Viewport clamping** prevents the tooltip from overflowing off-screen. Without `Math.max`/`Math.min`, a tooltip near the right edge would be cut off.
- **`requestAnimationFrame`** for the opacity transition ensures the browser has time to paint the element at opacity 0 before transitioning to opacity 1. Without this, the fade-in would not play.
- **The `delay`** parameter defaults to 400ms, preventing tooltips from flashing when the user moves the mouse across many elements quickly.

## The longpress Action

On mobile, there is no hover or right-click. A long press is the standard gesture for context menus. This action fires a custom `longpress` event after the user holds down for a configurable duration:

```typescript
// src/lib/actions/longpress.ts
import type { Action } from 'svelte/action';

interface LongpressParams {
  duration?: number;
  enabled?: boolean;
}

export const longpress: Action<HTMLElement, LongpressParams | number | undefined> = (
  node,
  params
) => {
  const config =
    typeof params === 'number'
      ? { duration: params }
      : params ?? {};

  let duration = config.duration ?? 500;
  let enabled = config.enabled ?? true;
  let timer: ReturnType<typeof setTimeout>;

  function onPointerDown(event: PointerEvent) {
    if (!enabled) return;

    // Only respond to primary pointer (no right-click, no multi-touch)
    if (event.button !== 0) return;

    timer = setTimeout(() => {
      node.dispatchEvent(
        new CustomEvent('longpress', {
          detail: { x: event.clientX, y: event.clientY }
        })
      );
    }, duration);
  }

  function cancel() {
    clearTimeout(timer);
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointermove', cancel); // Cancel if the user drags instead

  return {
    update(newParams: LongpressParams | number | undefined) {
      const newConfig =
        typeof newParams === 'number'
          ? { duration: newParams }
          : newParams ?? {};
      duration = newConfig.duration ?? 500;
      enabled = newConfig.enabled ?? true;
    },
    destroy() {
      clearTimeout(timer);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('pointermove', cancel);
    }
  };
};
```

The `pointermove` listener is a subtle but important detail. Without it, a user trying to drag a card would accidentally trigger the long-press if their finger stayed down long enough. By cancelling on any movement, the long-press only fires for a true stationary hold.

## Combining Actions on a TaskCard

Here is how all five actions come together on a single `TaskCard` component in TeamBoard:

```svelte
<!-- src/lib/components/board/TaskCard.svelte -->
<script lang="ts">
  import { draggable } from '$actions/drag';
  import { clickOutside } from '$actions/clickOutside';
  import { tooltip } from '$actions/tooltip';
  import { longpress } from '$actions/longpress';

  interface Props {
    task: {
      id: number;
      title: string;
      priority: 'low' | 'medium' | 'high' | 'urgent';
      assignee?: { name: string; initials: string };
    };
    onmove?: (taskId: number, x: number, y: number) => void;
  }

  let { task, onmove }: Props = $props();

  let isEditing = $state(false);
  let showContextMenu = $state(false);

  const priorityColors: Record<string, string> = {
    low: '#22c55e',
    medium: '#eab308',
    high: '#f97316',
    urgent: '#ef4444'
  };

  function handleDragEnd(event: CustomEvent) {
    const { x, y } = event.detail;
    onmove?.(task.id, x, y);
  }

  function handleLongpress() {
    showContextMenu = true;
  }
</script>

<div
  class="task-card"
  use:draggable={{ handle: '.drag-handle', data: { taskId: task.id } }}
  use:tooltip={{ text: task.title, position: 'top', delay: 600 }}
  use:longpress={{ duration: 500 }}
  ondragend={handleDragEnd}
  onlongpress={handleLongpress}
  role="listitem"
  aria-label="Task: {task.title}"
>
  <div class="drag-handle" aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12">
      <circle cx="3" cy="3" r="1.5" fill="currentColor" />
      <circle cx="9" cy="3" r="1.5" fill="currentColor" />
      <circle cx="3" cy="9" r="1.5" fill="currentColor" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
    </svg>
  </div>

  <div class="card-content">
    <span
      class="priority-dot"
      style="background: {priorityColors[task.priority]}"
      use:tooltip={task.priority}
    ></span>
    <span class="title">{task.title}</span>
  </div>

  {#if task.assignee}
    <div
      class="avatar"
      use:tooltip={task.assignee.name}
    >
      {task.assignee.initials}
    </div>
  {/if}
</div>

{#if showContextMenu}
  <div
    class="context-menu"
    use:clickOutside
    onclickoutside={() => showContextMenu = false}
  >
    <button onclick={() => { isEditing = true; showContextMenu = false; }}>Edit</button>
    <button onclick={() => console.log('Delete', task.id)}>Delete</button>
    <button onclick={() => showContextMenu = false}>Cancel</button>
  </div>
{/if}

<style>
  .task-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: default;
    touch-action: none; /* Prevents browser scroll during drag on mobile */
  }

  .drag-handle {
    cursor: grab;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .card-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .priority-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #6366f1;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .context-menu {
    position: absolute;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    padding: 4px;
    z-index: 100;
    display: flex;
    flex-direction: column;
  }

  .context-menu button {
    padding: 8px 16px;
    border: none;
    background: none;
    text-align: left;
    border-radius: 4px;
    cursor: pointer;
  }

  .context-menu button:hover {
    background: #f1f5f9;
  }
</style>
```

Notice how `touch-action: none` on the card is essential. Without it, mobile browsers will intercept the pointer events and scroll the page instead of letting your drag action handle them. This one CSS property saves you from a world of mobile drag-and-drop pain.

Also notice the `handle` option — users can grab the six-dot grip to drag, but clicking the card title or avatar does not start a drag. This lets text selection and button clicks work normally on the rest of the card.

## Action Composition Patterns

When you have multiple actions on a single element, they are completely independent. Each action's `destroy()` runs when the element unmounts, and each action's `update()` runs when its params change. There is no conflict between them.

However, there are a few patterns to keep in mind:

```svelte
<!-- Pattern 1: Actions with no params -->
<div use:clickOutside>...</div>

<!-- Pattern 2: Actions with a simple value -->
<div use:tooltip={'Edit this task'}>...</div>
<div use:longpress={800}>...</div>

<!-- Pattern 3: Actions with an object param -->
<div use:draggable={{ axis: 'y', handle: '.grip' }}>...</div>

<!-- Pattern 4: Multiple actions + event handlers -->
<div
  use:draggable={{ data: task }}
  use:tooltip={task.title}
  use:longpress
  ondragend={handleDrop}
  onlongpress={openMenu}
  onclickoutside={closeMenu}
>
  ...
</div>
```

Each custom event dispatched by an action can be handled with the standard `on<eventname>` attribute syntax. The events bubble up through the DOM tree, which means a parent component can also listen for `dragend` events from any child.

## Try It

Build a `focusTrap` action for the task creation modal. When applied to a container element, it should:

1. On mount, find all focusable elements inside the container (`button`, `input`, `textarea`, `select`, `a[href]`, `[tabindex]`).
2. Listen for `keydown` events. When the user presses Tab on the last focusable element, focus should wrap to the first. When they press Shift+Tab on the first element, focus should wrap to the last.
3. On mount, focus the first focusable element inside the container.
4. Return a `destroy()` that removes the keydown listener.
5. Type it with `Action<HTMLElement, { initialFocus?: string }>` where `initialFocus` is an optional CSS selector for which element to focus first.

This is a critical accessibility action — modal dialogs must trap focus so keyboard users do not tab into the content behind the modal.

## Key Takeaways

- Pointer events (`pointerdown`, `pointermove`, `pointerup`) provide a unified input model for mouse, touch, and stylus — use them instead of the HTML Drag and Drop API for custom drag interactions
- `setPointerCapture()` ensures the element keeps receiving events even if the pointer moves outside it during a drag
- Custom events dispatched from actions (`new CustomEvent('dragend', { detail })`) integrate with Svelte's `on<event>` handler syntax
- The `update()` method on actions keeps them in sync when reactive params change — always implement it for actions that accept params
- `touch-action: none` in CSS is essential for preventing mobile browsers from hijacking pointer events for scrolling
- Actions compose cleanly — multiple `use:` directives on one element work independently, each with their own lifecycle
- Always clean up in `destroy()`: remove event listeners, clear timeouts, remove dynamically created DOM elements
