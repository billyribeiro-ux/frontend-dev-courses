# Practical Actions

Now that you understand the anatomy of an action — mount, update, destroy — it is time to build real ones. Actions shine when you need reusable DOM behavior that does not belong in a component's template logic. In this lesson you will build six practical actions you can drop into any project.

## Click Outside

Detecting clicks outside an element is essential for closing dropdowns, modals, and popovers:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  let handler = callback;
  function handleClick(e: MouseEvent) {
    if (!node.contains(e.target as Node)) handler();
  }
  document.addEventListener('click', handleClick, true);

  return {
    update(newCallback) { handler = newCallback; },
    destroy() { document.removeEventListener('click', handleClick, true); }
  };
};
```

```svelte
<script lang="ts">
  import { clickOutside } from '$lib/actions/clickOutside';
  let open = $state(false);
</script>

<button onclick={() => open = !open}>Toggle Menu</button>
{#if open}
  <div class="dropdown" use:clickOutside={() => open = false}>
    <a href="/profile">Profile</a>
    <a href="/settings">Settings</a>
  </div>
{/if}
```

The `true` in `addEventListener` uses the capture phase, so the handler fires before the button's own click can immediately close the dropdown.

## Tooltip

This action creates a floating tooltip on hover, positioned above the element:

```typescript
// src/lib/actions/tooltip.ts
import type { Action } from 'svelte/action';

export const tooltip: Action<HTMLElement, string> = (node, text) => {
  let el: HTMLDivElement | null = null;
  let currentText = text;

  function show() {
    el = document.createElement('div');
    el.textContent = currentText;
    Object.assign(el.style, {
      position: 'absolute', background: '#333', color: '#fff',
      padding: '6px 10px', borderRadius: '4px', fontSize: '13px',
      pointerEvents: 'none', zIndex: '1000'
    });
    document.body.appendChild(el);
    const rect = node.getBoundingClientRect();
    el.style.left = `${rect.left + rect.width / 2 - el.offsetWidth / 2}px`;
    el.style.top = `${rect.top - el.offsetHeight - 8 + window.scrollY}px`;
  }
  function hide() { el?.remove(); el = null; }

  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);

  return {
    update(newText) { currentText = newText; if (el) el.textContent = newText; },
    destroy() { hide(); node.removeEventListener('mouseenter', show); node.removeEventListener('mouseleave', hide); }
  };
};
```

```svelte
<button use:tooltip={'Save your changes'}>Save</button>
<button use:tooltip={'Discard and go back'}>Cancel</button>
```

## Intersection Observer

Trigger a callback when an element enters or leaves the viewport — perfect for lazy loading and scroll animations:

```typescript
// src/lib/actions/inview.ts
import type { Action } from 'svelte/action';

export const inview: Action<HTMLElement, { onEnter?: () => void; onLeave?: () => void; threshold?: number }> = (node, params) => {
  let current = params;
  const observer = new IntersectionObserver(
    ([entry]) => entry.isIntersecting ? current.onEnter?.() : current.onLeave?.(),
    { threshold: current.threshold ?? 0.5 }
  );
  observer.observe(node);

  return {
    update(newParams) { current = newParams; },
    destroy() { observer.disconnect(); }
  };
};
```

```svelte
<script lang="ts">
  import { inview } from '$lib/actions/inview';
  let visible = $state(false);
</script>

<div use:inview={{ onEnter: () => visible = true, onLeave: () => visible = false }} class:visible>
  I fade in when scrolled into view!
</div>
```

## Copy to Clipboard

One-click copy with visual feedback using a data attribute:

```typescript
// src/lib/actions/clipboard.ts
import type { Action } from 'svelte/action';

export const clipboard: Action<HTMLElement, string | undefined> = (node, text) => {
  let currentText = text;
  async function handleClick() {
    await navigator.clipboard.writeText(currentText ?? node.textContent ?? '');
    node.dataset.copied = 'true';
    setTimeout(() => delete node.dataset.copied, 2000);
  }
  node.addEventListener('click', handleClick);
  node.style.cursor = 'pointer';

  return {
    update(newText) { currentText = newText; },
    destroy() { node.removeEventListener('click', handleClick); }
  };
};
```

```svelte
<code use:clipboard={'npm install svelte@latest'}>npm install svelte@latest</code>
```

## Auto Focus

Focus an input when it mounts, with an option to select all text:

```typescript
// src/lib/actions/autofocus.ts
import type { Action } from 'svelte/action';

export const autofocus: Action<HTMLElement, { select?: boolean; delay?: number } | undefined> = (node, params) => {
  const timer = setTimeout(() => {
    node.focus();
    if (params?.select && node instanceof HTMLInputElement) node.select();
  }, params?.delay ?? 0);

  return { destroy() { clearTimeout(timer); } };
};
```

```svelte
<input use:autofocus={{ select: true }} value="Edit me" />
```

## Long Press

Detect a press-and-hold gesture, useful for mobile context menus:

```typescript
// src/lib/actions/longpress.ts
import type { Action } from 'svelte/action';

export const longpress: Action<HTMLElement, { duration?: number; onLongPress: () => void }> = (node, params) => {
  let current = params;
  let timer: ReturnType<typeof setTimeout>;
  function start() { timer = setTimeout(() => current.onLongPress(), current.duration ?? 500); }
  function cancel() { clearTimeout(timer); }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);

  return {
    update(p) { current = p; },
    destroy() { cancel(); node.removeEventListener('pointerdown', start); node.removeEventListener('pointerup', cancel); node.removeEventListener('pointerleave', cancel); }
  };
};
```

```svelte
<script lang="ts">
  import { longpress } from '$lib/actions/longpress';
  let message = $state('Press and hold the button...');
</script>

<button use:longpress={{ duration: 800, onLongPress: () => message = 'Long press detected!' }}>
  Hold Me
</button>
<p>{message}</p>
```

## Try It

Build a `draggable` action that lets a user drag an element around the screen. Listen for `pointerdown`, `pointermove`, and `pointerup` events, update the element's position with `transform: translate(x, y)`, and clean up all listeners on destroy.

## Key Takeaways

- **Click outside** uses `document.addEventListener` in the capture phase to detect clicks outside a node
- **Tooltips** create and position a dynamic element using `getBoundingClientRect`
- **Intersection Observer** wraps the browser API and disconnects on destroy to prevent leaks
- **Clipboard** uses `navigator.clipboard.writeText` and data attributes for visual feedback
- **Auto focus** uses `setTimeout` to allow the DOM to settle before focusing
- **Long press** uses pointer events with a timer, working on both mouse and touch devices
- Every action follows the same pattern: set up on mount, return `update` and `destroy`
