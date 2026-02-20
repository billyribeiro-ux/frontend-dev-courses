# Practical Actions

Now that you understand the anatomy of an action — mount, update, destroy — it is time to build real ones. Actions shine when you need reusable DOM behavior that does not belong in a component's template logic. In this lesson you will build six practical actions you can drop into any project.

Each example is self-contained. You can put these in a `$lib/actions/` folder and import them wherever you need them.

## Click Outside

Detecting clicks outside an element is essential for closing dropdowns, modals, and popovers. This action listens for clicks on the document and fires a callback when the click lands outside the target element:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  let handler = callback;

  function handleClick(e: MouseEvent) {
    if (!node.contains(e.target as Node)) {
      handler();
    }
  }

  document.addEventListener('click', handleClick, true);

  return {
    update(newCallback) {
      handler = newCallback;
    },
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
};
```

```svelte
<script lang="ts">
  import { clickOutside } from '$lib/actions/clickOutside';

  let open = $state(false);
</script>

<div class="wrapper">
  <button onclick={() => open = !open}>Toggle Menu</button>

  {#if open}
    <div class="dropdown" use:clickOutside={() => open = false}>
      <a href="/profile">Profile</a>
      <a href="/settings">Settings</a>
      <a href="/logout">Logout</a>
    </div>
  {/if}
</div>
```

The `true` in `addEventListener` uses the capture phase, so the handler fires before the click reaches the button itself. This prevents the button's own click from immediately closing the dropdown.

## Tooltip

This action creates a floating tooltip on hover. It dynamically positions a `<div>` near the element:

```typescript
// src/lib/actions/tooltip.ts
import type { Action } from 'svelte/action';

export const tooltip: Action<HTMLElement, string> = (node, text) => {
  let tooltipEl: HTMLDivElement | null = null;
  let currentText = text;

  function show() {
    tooltipEl = document.createElement('div');
    tooltipEl.textContent = currentText;
    Object.assign(tooltipEl.style, {
      position: 'absolute',
      background: '#333',
      color: '#fff',
      padding: '6px 10px',
      borderRadius: '4px',
      fontSize: '13px',
      pointerEvents: 'none',
      zIndex: '1000',
      whiteSpace: 'nowrap'
    });
    document.body.appendChild(tooltipEl);

    const rect = node.getBoundingClientRect();
    tooltipEl.style.left = `${rect.left + rect.width / 2 - tooltipEl.offsetWidth / 2}px`;
    tooltipEl.style.top = `${rect.top - tooltipEl.offsetHeight - 8 + window.scrollY}px`;
  }

  function hide() {
    tooltipEl?.remove();
    tooltipEl = null;
  }

  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);

  return {
    update(newText) {
      currentText = newText;
      if (tooltipEl) tooltipEl.textContent = newText;
    },
    destroy() {
      hide();
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
    }
  };
};
```

```svelte
<script lang="ts">
  import { tooltip } from '$lib/actions/tooltip';
</script>

<button use:tooltip={'Save your changes'}>Save</button>
<button use:tooltip={'Discard and go back'}>Cancel</button>
```

## Intersection Observer

This action triggers a callback when an element enters the viewport. Perfect for lazy loading images, triggering scroll animations, or tracking visibility:

```typescript
// src/lib/actions/inview.ts
import type { Action } from 'svelte/action';

interface InViewParams {
  onEnter?: () => void;
  onLeave?: () => void;
  threshold?: number;
}

export const inview: Action<HTMLElement, InViewParams> = (node, params) => {
  let current = params;

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        current.onEnter?.();
      } else {
        current.onLeave?.();
      }
    },
    { threshold: current.threshold ?? 0.5 }
  );

  observer.observe(node);

  return {
    update(newParams) {
      current = newParams;
    },
    destroy() {
      observer.disconnect();
    }
  };
};
```

```svelte
<script lang="ts">
  import { inview } from '$lib/actions/inview';

  let visible = $state(false);
</script>

<div style="height: 120vh; display: grid; place-items: end center;">
  <p>Scroll down to reveal the card.</p>
</div>

<div
  class="card"
  class:visible
  use:inview={{
    onEnter: () => visible = true,
    onLeave: () => visible = false,
    threshold: 0.3
  }}
>
  <h2>I fade in when visible!</h2>
</div>

<style>
  .card {
    padding: 24px;
    background: #f0f0f0;
    border-radius: 8px;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.5s, transform 0.5s;
  }
  .card.visible {
    opacity: 1;
    transform: translateY(0);
  }
</style>
```

## Copy to Clipboard

One-click copy with visual feedback. The action copies the element's text content (or a provided string) to the clipboard:

```typescript
// src/lib/actions/clipboard.ts
import type { Action } from 'svelte/action';

export const clipboard: Action<HTMLElement, string | undefined> = (node, text) => {
  let currentText = text;

  async function handleClick() {
    const content = currentText ?? node.textContent ?? '';
    await navigator.clipboard.writeText(content);

    node.dataset.copied = 'true';
    setTimeout(() => delete node.dataset.copied, 2000);
  }

  node.addEventListener('click', handleClick);
  node.style.cursor = 'pointer';

  return {
    update(newText) {
      currentText = newText;
    },
    destroy() {
      node.removeEventListener('click', handleClick);
    }
  };
};
```

```svelte
<script lang="ts">
  import { clipboard } from '$lib/actions/clipboard';

  let code = 'npm install svelte@latest';
</script>

<code use:clipboard={code}>{code}</code>

<style>
  code {
    padding: 8px 12px;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 4px;
    display: inline-block;
  }
  code:hover { background: #2d2d2d; }
  :global(code[data-copied='true']) {
    outline: 2px solid #4caf50;
  }
</style>
```

## Auto Focus

A simple but frequently needed action — focus an input when it mounts. Optionally select all text inside it:

```typescript
// src/lib/actions/autofocus.ts
import type { Action } from 'svelte/action';

interface AutofocusParams {
  select?: boolean;
  delay?: number;
}

export const autofocus: Action<HTMLElement, AutofocusParams | undefined> = (node, params) => {
  const delay = params?.delay ?? 0;

  const timer = setTimeout(() => {
    node.focus();
    if (params?.select && node instanceof HTMLInputElement) {
      node.select();
    }
  }, delay);

  return {
    destroy() {
      clearTimeout(timer);
    }
  };
};
```

```svelte
<script lang="ts">
  import { autofocus } from '$lib/actions/autofocus';
</script>

<input use:autofocus={{ select: true }} value="Edit me" />
```

## Long Press

Detect a press-and-hold gesture. This is useful for mobile interfaces where a long press triggers a context menu or special action:

```typescript
// src/lib/actions/longpress.ts
import type { Action } from 'svelte/action';

interface LongPressParams {
  duration?: number;
  onLongPress: () => void;
}

export const longpress: Action<HTMLElement, LongPressParams> = (node, params) => {
  let current = params;
  let timer: ReturnType<typeof setTimeout>;

  function start() {
    timer = setTimeout(() => {
      current.onLongPress();
    }, current.duration ?? 500);
  }

  function cancel() {
    clearTimeout(timer);
  }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);

  return {
    update(newParams) {
      current = newParams;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointerleave', cancel);
    }
  };
};
```

```svelte
<script lang="ts">
  import { longpress } from '$lib/actions/longpress';

  let message = $state('Press and hold the button...');
</script>

<button
  use:longpress={{
    duration: 800,
    onLongPress: () => message = 'Long press detected!'
  }}
>
  Hold Me
</button>

<p>{message}</p>
```

## Try It

Build a `draggable` action that lets a user drag an element around the screen. The action should listen for `pointerdown`, `pointermove`, and `pointerup` events, update the element's position using `transform: translate(x, y)`, and clean up all listeners on destroy. Bonus: accept a `bounds` parameter to constrain movement within the viewport.

## Key Takeaways

- **Click outside** uses `document.addEventListener` in the capture phase to detect clicks outside a node
- **Tooltips** create and position a dynamic element relative to the target using `getBoundingClientRect`
- **Intersection Observer** wraps the browser API cleanly and disconnects on destroy to prevent leaks
- **Clipboard** uses `navigator.clipboard.writeText` and data attributes for visual feedback
- **Auto focus** uses `setTimeout` to allow the DOM to settle before focusing
- **Long press** uses pointer events with a timer, making it work on both mouse and touch devices
- Every action follows the same pattern: set up on mount, return `update` and `destroy` for lifecycle management
