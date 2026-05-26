# Actions Basics

## What Actions Are

Every Svelte component is a self-contained unit of markup, styles, and behavior. But sometimes you need to reach past the template abstraction and touch the raw DOM element underneath. You might need to integrate a third-party library that expects a DOM node, set up a complex event listener pattern, trap focus inside a modal, measure an element's dimensions on resize, or wire up an IntersectionObserver. These are all imperative, side-effectful operations that do not map cleanly to declarative template syntax.

**Actions** are Svelte's answer to this problem. An action is a plain function that receives a DOM node when it mounts. You attach it with the `use:` directive, and Svelte handles the lifecycle -- calling your function at mount time, notifying you when parameters change, and giving you a hook to clean up when the element is removed.

The mental model is straightforward: an action is a reusable chunk of DOM behavior that you can attach to any element, in any component, without wrapping that element in a component. That last point matters. Before actions existed, if you wanted reusable DOM behavior, you had to create a wrapper component -- `<ClickOutside>`, `<Tooltip>`, `<IntersectionObserver>` -- that added an extra DOM node and made composition awkward. Actions let you attach behavior directly to existing elements without changing the DOM tree.

```svelte
<!-- Without actions: wrapper component adds an extra <div> -->
<ClickOutsideWrapper onclickoutside={() => open = false}>
  <div class="dropdown">...</div>
</ClickOutsideWrapper>

<!-- With actions: behavior attached directly, no extra DOM -->
<div class="dropdown" use:clickOutside={() => open = false}>...</div>
```

This distinction is not cosmetic. Extra wrapper elements break CSS layouts (especially flexbox and grid), interfere with accessibility trees, and add noise to the DOM. Actions solve all of this by operating directly on the target element.

## The `use:action` Directive Lifecycle: Mount, Update, Destroy

An action's lifecycle mirrors the element it is attached to. Understanding when each phase fires is essential for writing correct actions.

### Mount

When Svelte creates the DOM element and inserts it into the document, it calls your action function with the element as the first argument. This is where you set up event listeners, initialize third-party libraries, start observers, or modify the element.

```typescript
function myAction(node: HTMLElement) {
  // This runs once, when the element is inserted into the DOM.
  // 'node' is the actual DOM element -- you have full imperative access.
  console.log('Mounted:', node.tagName, node.getBoundingClientRect());
}
```

A critical detail: the element is already in the DOM when your action runs. This means `getBoundingClientRect()` returns real dimensions, `getComputedStyle()` works, and the element is visible (assuming no CSS hides it). This is different from some frameworks where lifecycle hooks fire before the element is attached to the document.

### Update

If you pass a parameter to the action via `use:action={value}`, Svelte tracks that value reactively. When it changes, Svelte calls the `update` method on the object your action returned. This is how your action stays synchronized with Svelte's reactive state.

```typescript
function myAction(node: HTMLElement, param: string) {
  // Initial setup with 'param'
  node.title = param;

  return {
    update(newParam: string) {
      // Called whenever 'param' changes reactively
      node.title = newParam;
    }
  };
}
```

The `update` function receives the new parameter value. It does **not** receive the old value -- if you need the old value for diffing or cleanup, you must store it yourself in a closure variable.

### Destroy

When the element is removed from the DOM (because a conditional block hides it, the component unmounts, or a keyed each block removes it), Svelte calls the `destroy` method on the returned object. This is where you remove event listeners, disconnect observers, clear timers, and release any resources.

```typescript
function myAction(node: HTMLElement) {
  const handler = (e: MouseEvent) => { /* ... */ };
  window.addEventListener('mousemove', handler);

  return {
    destroy() {
      window.removeEventListener('mousemove', handler);
    }
  };
}
```

If you do not clean up, the event listener keeps running even after the element is gone. This is a memory leak -- the handler holds a reference to `node`, preventing it from being garbage collected, and the handler itself continues to fire on every mouse move, doing work on a node that no longer exists.

### The Complete TypeScript Signature

Svelte provides the `Action` type from `svelte/action` for typing your actions correctly:

```typescript
import type { Action } from 'svelte/action';

// The full generic signature:
// Action<Element, Parameter, Attributes>
//
// Element    - the type of DOM element (HTMLElement, HTMLInputElement, SVGElement, etc.)
// Parameter  - the type of the value passed via use:action={value} (use 'undefined' for no param)
// Attributes - additional attributes the action adds to the element (for type checking in templates)

// Action with no parameter
const noParam: Action<HTMLElement> = (node) => {
  return { destroy() {} };
};

// Action with a required parameter
const withParam: Action<HTMLElement, string> = (node, param) => {
  // 'param' is typed as 'string'
  return {
    update(newParam) { /* newParam is 'string' */ },
    destroy() {}
  };
};

// Action with an optional parameter
const optionalParam: Action<HTMLElement, string | undefined> = (node, param) => {
  // 'param' is typed as 'string | undefined'
  return {
    update(newParam) {},
    destroy() {}
  };
};
```

The return value is typed as `void | { update?: (param: Parameter) => void; destroy?: () => void }`. You can return nothing, return just `destroy`, return just `update`, or return both. Svelte only calls the methods you provide.

## Creating a Basic Action

With the lifecycle model clear, here is the simplest possible action:

```svelte
<script lang="ts">
  function highlight(node: HTMLElement) {
    node.style.backgroundColor = '#ffffcc';
    node.style.padding = '4px';
  }
</script>

<p use:highlight>This paragraph is highlighted on mount.</p>
<p>This paragraph is not.</p>
```

When Svelte creates the first `<p>`, it calls `highlight(node)` with the actual DOM element. You have full imperative access -- styles, attributes, children, event listeners, anything the DOM API supports. The second `<p>` is untouched because it does not have the `use:highlight` directive.

This action has no cleanup and no parameters. It runs once on mount, modifies the element, and is done. This is the simplest case, but most real actions need at least cleanup.

## Cleanup with destroy()

Actions that set up ongoing behavior -- event listeners, timers, observers, mutation watchers -- must clean up after themselves. Return an object with a `destroy()` method:

```svelte
<script lang="ts">
  function trackMouse(node: HTMLElement) {
    function handleMove(e: MouseEvent) {
      node.textContent = `Mouse: ${e.clientX}, ${e.clientY}`;
    }

    window.addEventListener('mousemove', handleMove);

    return {
      destroy() {
        window.removeEventListener('mousemove', handleMove);
      }
    };
  }
</script>

<div use:trackMouse>Move your mouse around</div>
```

Without the `destroy()` cleanup, the event listener would leak. Here is what happens step by step when the element is conditionally rendered:

```svelte
{#if showTracker}
  <div use:trackMouse>Move your mouse around</div>
{/if}
```

1. User sets `showTracker = true` -- Svelte creates the `<div>`, calls `trackMouse(node)`, listener is added to `window`.
2. User sets `showTracker = false` -- Svelte removes the `<div>`, calls `destroy()`, listener is removed from `window`.
3. User sets `showTracker = true` again -- Svelte creates a **new** `<div>`, calls `trackMouse(node)` again with the new node.

Each mount/destroy cycle is independent. The action function runs fresh each time, and a new closure captures the new node.

## Parameters and Reactivity

Actions can accept a second argument for configuration. You pass the parameter with `use:action={value}`:

```svelte
<script lang="ts">
  import type { Action } from 'svelte/action';

  const tooltip: Action<HTMLElement, string> = (node, text) => {
    node.title = text;
    node.style.cursor = 'help';
    node.style.textDecoration = 'underline dotted';

    return {
      update(newText: string) {
        node.title = newText;
      },
      destroy() {
        node.title = '';
        node.style.cursor = '';
        node.style.textDecoration = '';
      }
    };
  };

  let message = $state('Hello from the tooltip!');
</script>

<p use:tooltip={message}>Hover over me</p>
<input type="text" bind:value={message} placeholder="Change tooltip text" />
```

The `update()` method is called whenever the parameter value changes reactively. In this case, typing into the input updates `message`, which triggers `update(newText)` on the action. The tooltip text stays in sync without any manual wiring.

### How Svelte Calls update

Svelte instruments the parameter expression as a reactive dependency. When any `$state` referenced in the expression changes, Svelte re-evaluates the expression and, if the result has changed, calls `update()` with the new value.

For primitive parameters (strings, numbers, booleans), Svelte compares by value -- `update` only fires if the new value is different from the old one. For object parameters, Svelte compares by reference. This means if you mutate a property on the same object, Svelte will not see the change:

```svelte
<script lang="ts">
  let config = $state({ color: 'red', size: 16 });

  // This WILL trigger update -- new object reference
  function changeColor() {
    config = { ...config, color: 'blue' };
  }

  // In Svelte 5, $state objects are deeply reactive proxies, so property
  // mutations are tracked. But when passing non-reactive objects or values
  // from props, the reference comparison still applies. The safest pattern
  // is to always create new objects when you want update to fire.
</script>

<div use:styled={config}>...</div>
```

### Object Parameters for Complex Configuration

For actions with multiple configuration options, use an object parameter:

```typescript
import type { Action } from 'svelte/action';

interface ScrollShadowParams {
  color?: string;
  size?: number;
  direction?: 'vertical' | 'horizontal' | 'both';
}

export const scrollShadow: Action<HTMLElement, ScrollShadowParams> = (node, params) => {
  let current = { color: 'rgba(0,0,0,0.15)', size: 16, direction: 'vertical' as const, ...params };

  function applyGradients() {
    const { scrollTop, scrollHeight, clientHeight, scrollLeft, scrollWidth, clientWidth } = node;
    const shadows: string[] = [];

    if (current.direction !== 'horizontal') {
      if (scrollTop > 0) {
        shadows.push(`inset 0 ${current.size}px ${current.size}px -${current.size}px ${current.color}`);
      }
      if (scrollTop + clientHeight < scrollHeight) {
        shadows.push(`inset 0 -${current.size}px ${current.size}px -${current.size}px ${current.color}`);
      }
    }
    if (current.direction !== 'vertical') {
      if (scrollLeft > 0) {
        shadows.push(`inset ${current.size}px 0 ${current.size}px -${current.size}px ${current.color}`);
      }
      if (scrollLeft + clientWidth < scrollWidth) {
        shadows.push(`inset -${current.size}px 0 ${current.size}px -${current.size}px ${current.color}`);
      }
    }

    node.style.boxShadow = shadows.join(', ') || 'none';
  }

  node.addEventListener('scroll', applyGradients, { passive: true });
  applyGradients();

  return {
    update(newParams) {
      current = { ...current, ...newParams };
      applyGradients();
    },
    destroy() {
      node.removeEventListener('scroll', applyGradients);
      node.style.boxShadow = '';
    }
  };
};
```

```svelte
<div
  use:scrollShadow={{ color: 'rgba(0,0,0,0.2)', size: 20, direction: 'both' }}
  style="max-height: 200px; overflow: auto;"
>
  <!-- Long content here -->
</div>
```

## Building Production Actions Step by Step

### clickOutside: Complete with Event Delegation

Detecting clicks outside an element is essential for closing dropdowns, modals, and popovers:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  let currentCallback = callback;

  function handleClick(event: MouseEvent) {
    const target = event.target as Node;
    if (!node.contains(target)) {
      currentCallback();
    }
  }

  // Use setTimeout to avoid catching the click that opened the element.
  // The click that triggered the mount happens in the same event loop tick,
  // so registering the listener immediately would close the dropdown instantly.
  setTimeout(() => {
    document.addEventListener('click', handleClick, true);
  }, 0);

  return {
    update(newCallback) {
      currentCallback = newCallback;
    },
    destroy() {
      document.removeEventListener('click', handleClick, true);
    }
  };
};
```

The `true` argument uses the capture phase, so the handler fires before any `stopPropagation()` calls in the event's path. The `setTimeout` with 0ms delay pushes listener registration to the next microtask, after the opening click has finished propagating.

For high-volume usage (many dropdowns on one page), you can centralize into a single global listener using event delegation:

```typescript
// Centralized click-outside manager: one global listener for all instances
const registeredNodes = new Set<{ node: HTMLElement; callback: () => void }>();

function globalClickHandler(e: MouseEvent) {
  for (const entry of registeredNodes) {
    if (!entry.node.contains(e.target as Node)) {
      entry.callback();
    }
  }
}

let listenerAttached = false;

export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  const entry = { node, callback };

  setTimeout(() => {
    registeredNodes.add(entry);
    if (!listenerAttached) {
      document.addEventListener('click', globalClickHandler, true);
      listenerAttached = true;
    }
  }, 0);

  return {
    update(newCallback) { entry.callback = newCallback; },
    destroy() {
      registeredNodes.delete(entry);
      if (registeredNodes.size === 0) {
        document.removeEventListener('click', globalClickHandler, true);
        listenerAttached = false;
      }
    }
  };
};
```

This uses one document listener regardless of how many elements use the action. The trade-off is complexity -- only reach for this when you actually have many simultaneous instances.

### longpress: Touch and Mouse Event Handling

A press-and-hold gesture that handles both mouse and touch inputs, with configurable duration:

```typescript
// src/lib/actions/longpress.ts
import type { Action } from 'svelte/action';

interface LongPressParams {
  duration?: number;
  onLongPress: () => void;
}

interface LongPressAttributes {
  onlongpress?: (event: CustomEvent) => void;
}

export const longpress: Action<HTMLElement, LongPressParams, LongPressAttributes> = (
  node,
  params
) => {
  let current = params;
  let timer: ReturnType<typeof setTimeout>;
  let triggered = false;

  function start(e: PointerEvent) {
    // Ignore right-clicks and multi-touch
    if (e.button !== 0) return;

    triggered = false;
    // Prevent text selection during long press
    node.style.userSelect = 'none';
    node.style.webkitUserSelect = 'none';
    node.setPointerCapture(e.pointerId);

    timer = setTimeout(() => {
      triggered = true;
      current.onLongPress();
      node.dispatchEvent(new CustomEvent('longpress', { bubbles: true }));

      // Haptic feedback on supported devices
      if ('vibrate' in navigator) {
        navigator.vibrate(50);
      }
    }, current.duration ?? 500);
  }

  function cancel() {
    clearTimeout(timer);
    node.style.userSelect = '';
    node.style.webkitUserSelect = '';
  }

  function preventClick(e: MouseEvent) {
    // If the long press fired, swallow the subsequent click
    if (triggered) {
      e.preventDefault();
      e.stopPropagation();
      triggered = false;
    }
  }

  node.addEventListener('pointerdown', start);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('click', preventClick, true);

  // Prevent context menu on long press (mobile)
  const preventContext = (e: Event) => e.preventDefault();
  node.addEventListener('contextmenu', preventContext);

  return {
    update(p) { current = p; },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', start);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('click', preventClick, true);
      node.removeEventListener('contextmenu', preventContext);
    }
  };
};
```

Key details in this implementation:

- **Pointer events** instead of separate mouse and touch events. The `pointer*` events unify mouse, touch, and pen input into one set of handlers.
- **`setPointerCapture`** ensures the element continues to receive pointer events even if the user's finger drifts outside the element boundary during the press.
- **Click prevention** -- after a long press fires, the browser still generates a `click` event. The `preventClick` handler swallows it so you do not accidentally trigger a click handler too.
- **Context menu suppression** -- on mobile, a long press normally opens the context menu. Preventing it keeps the UX clean.
- **Haptic feedback** via `navigator.vibrate()` gives the user physical confirmation on supported devices.

### intersection: IntersectionObserver for Lazy Loading and Scroll Animations

A production-quality IntersectionObserver wrapper that supports lazy loading (fire once), scroll animations (enter/leave), and configurable thresholds:

```typescript
// src/lib/actions/intersection.ts
import type { Action } from 'svelte/action';

interface IntersectionParams {
  onEnter?: (entry: IntersectionObserverEntry) => void;
  onLeave?: (entry: IntersectionObserverEntry) => void;
  threshold?: number | number[];
  rootMargin?: string;
  once?: boolean;
}

export const intersection: Action<HTMLElement, IntersectionParams> = (node, params) => {
  let observer: IntersectionObserver;
  let hasTriggered = false;

  function createObserver(p: IntersectionParams) {
    observer?.disconnect();
    hasTriggered = false;

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            p.onEnter?.(entry);
            if (p.once) {
              observer.disconnect();
              hasTriggered = true;
            }
          } else {
            // Only call onLeave if we are not in once mode or have not triggered
            if (!hasTriggered) {
              p.onLeave?.(entry);
            }
          }
        }
      },
      {
        threshold: p.threshold ?? 0,
        rootMargin: p.rootMargin ?? '0px'
      }
    );

    observer.observe(node);
  }

  createObserver(params);

  return {
    update(newParams) {
      createObserver(newParams);
    },
    destroy() {
      observer.disconnect();
    }
  };
};
```

```svelte
<script lang="ts">
  import { intersection } from '$lib/actions/intersection';

  let visible = $state(false);
  let loaded = $state(false);
</script>

<!-- Fade-in animation on scroll -->
<section
  use:intersection={{
    onEnter: () => visible = true,
    onLeave: () => visible = false,
    threshold: 0.3
  }}
  class="card"
  class:visible
>
  <h2>This card fades in on scroll</h2>
</section>

<!-- Lazy loading: trigger once when near the viewport -->
<div
  use:intersection={{
    onEnter: () => { loaded = true; },
    once: true,
    rootMargin: '200px'
  }}
>
  {#if loaded}
    <img src="/heavy-image.jpg" alt="Lazy loaded" />
  {:else}
    <div class="skeleton" style="height: 300px; background: #eee;" />
  {/if}
</div>

<style>
  .card {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  }
  .card.visible {
    opacity: 1;
    transform: translateY(0);
  }
</style>
```

The `rootMargin: '200px'` setting on the lazy load example starts loading the image 200 pixels before it enters the viewport, so the user never sees a blank space.

### autosize: Textarea that Grows with Content

A textarea that grows to fit its content is deceptively tricky. You need to handle initial content, dynamic input, programmatic changes, font loading, and container resizes:

```typescript
// src/lib/actions/autosize.ts
import type { Action } from 'svelte/action';

interface AutosizeParams {
  minRows?: number;
  maxRows?: number;
}

export const autosize: Action<HTMLTextAreaElement, AutosizeParams | undefined> = (node, params) => {
  let minHeight = 0;
  let maxHeight = Infinity;

  function computeLimits(p: AutosizeParams | undefined) {
    const style = getComputedStyle(node);
    const lineHeight = parseFloat(style.lineHeight) || 20;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;
    const chrome = paddingTop + paddingBottom + borderTop + borderBottom;

    minHeight = (p?.minRows ?? 1) * lineHeight + chrome;
    maxHeight = p?.maxRows ? p.maxRows * lineHeight + chrome : Infinity;
  }

  function resize() {
    // Reset height to auto so scrollHeight reflects actual content
    node.style.height = 'auto';
    const newHeight = Math.min(Math.max(node.scrollHeight, minHeight), maxHeight);
    node.style.height = `${newHeight}px`;
    // Show scrollbar only when content exceeds max height
    node.style.overflow = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  computeLimits(params);
  node.style.resize = 'none';
  node.style.overflow = 'hidden';
  node.style.boxSizing = 'border-box';

  node.addEventListener('input', resize);
  resize(); // Handle initial content

  // ResizeObserver catches container resizes and font loading
  const observer = new ResizeObserver(() => resize());
  observer.observe(node);

  return {
    update(newParams) {
      computeLimits(newParams);
      resize();
    },
    destroy() {
      node.removeEventListener('input', resize);
      observer.disconnect();
      node.style.resize = '';
      node.style.overflow = '';
    }
  };
};
```

```svelte
<script lang="ts">
  import { autosize } from '$lib/actions/autosize';
  let bio = $state('');
</script>

<textarea
  use:autosize={{ minRows: 3, maxRows: 10 }}
  bind:value={bio}
  placeholder="Tell us about yourself..."
></textarea>
```

Edge cases this handles: `box-sizing: border-box` ensures height includes padding and borders. The ResizeObserver catches responsive layout changes and font loading. When content exceeds max height, overflow switches to `auto` to show a scrollbar.

### portal: Moving an Element to document.body

A portal moves an element from its current position in the DOM to somewhere else, typically `document.body`. This is essential for modals, tooltips, and dropdowns that need to break out of `overflow: hidden` containers:

```typescript
// src/lib/actions/portal.ts
import type { Action } from 'svelte/action';

export const portal: Action<HTMLElement, string | HTMLElement | undefined> = (node, target) => {
  let targetEl = resolveTarget(target);

  function resolveTarget(t: string | HTMLElement | undefined): HTMLElement {
    if (t instanceof HTMLElement) return t;
    if (typeof t === 'string') {
      const found = document.querySelector(t);
      if (!found) {
        console.warn(`Portal target "${t}" not found, falling back to document.body`);
        return document.body;
      }
      return found as HTMLElement;
    }
    return document.body;
  }

  targetEl.appendChild(node);

  return {
    update(newTarget) {
      const newTargetEl = resolveTarget(newTarget);
      if (newTargetEl !== targetEl) {
        newTargetEl.appendChild(node);
        targetEl = newTargetEl;
      }
    },
    destroy() {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  };
};
```

```svelte
<script lang="ts">
  import { portal } from '$lib/actions/portal';
  let showModal = $state(false);
</script>

<div style="overflow: hidden; height: 100px;">
  <p>This container clips overflow.</p>

  {#if showModal}
    <div use:portal class="modal-overlay">
      <div class="modal">
        <p>I am rendered at document.body, not inside the overflow container!</p>
        <button onclick={() => showModal = false}>Close</button>
      </div>
    </div>
  {/if}
</div>

<button onclick={() => showModal = true}>Open Modal</button>
```

Portal caveats to know:

- **Scoped styles** may not apply because the element physically moves outside the component's DOM tree. Use `:global()` or unscoped classes for portaled content.
- **DOM events** bubble up the physical DOM tree, not the Svelte component tree. If the portaled element is at `document.body`, click events bubble to `<body>`, not to the component that rendered it.
- **SSR** -- portals cannot work during server-side rendering because there is no `document.body`. Only use portals inside `{#if}` blocks that are false on the server, or guard with a browser check.

### clipboard: Copy to Clipboard with Fallback

A clipboard action that handles both the modern async Clipboard API and the legacy `execCommand` fallback:

```typescript
// src/lib/actions/clipboard.ts
import type { Action } from 'svelte/action';

interface ClipboardParams {
  text?: string;
  onCopy?: () => void;
  onError?: (error: Error) => void;
}

interface ClipboardAttributes {
  oncopy_success?: (event: CustomEvent<{ text: string }>) => void;
  oncopy_error?: (event: CustomEvent<{ error: Error }>) => void;
}

export const clipboard: Action<HTMLElement, ClipboardParams | string, ClipboardAttributes> = (
  node,
  params
) => {
  let current = typeof params === 'string' ? { text: params } : params;

  async function handleClick() {
    const textToCopy = current.text ?? node.textContent ?? '';

    try {
      if (navigator.clipboard && window.isSecureContext) {
        // Modern Clipboard API (requires HTTPS or localhost)
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for older browsers and HTTP contexts
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      current.onCopy?.();
      node.dispatchEvent(new CustomEvent('copy_success', {
        detail: { text: textToCopy },
        bubbles: true
      }));

      // Visual feedback via data attribute
      node.dataset.copied = 'true';
      setTimeout(() => delete node.dataset.copied, 2000);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Copy failed');
      current.onError?.(err);
      node.dispatchEvent(new CustomEvent('copy_error', {
        detail: { error: err },
        bubbles: true
      }));
    }
  }

  node.addEventListener('click', handleClick);
  node.style.cursor = 'pointer';
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');

  // Keyboard accessibility: trigger on Enter/Space
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
  node.addEventListener('keydown', handleKeydown);

  return {
    update(newParams) {
      current = typeof newParams === 'string' ? { text: newParams } : newParams;
    },
    destroy() {
      node.removeEventListener('click', handleClick);
      node.removeEventListener('keydown', handleKeydown);
      node.style.cursor = '';
      node.removeAttribute('role');
      node.removeAttribute('tabindex');
    }
  };
};
```

```svelte
<script lang="ts">
  import { clipboard } from '$lib/actions/clipboard';

  let copied = $state(false);
  const code = 'npm install svelte@latest';
</script>

<code
  use:clipboard={{
    text: code,
    onCopy: () => { copied = true; setTimeout(() => copied = false, 2000); }
  }}
>
  {code}
  <span class="copy-hint">{copied ? 'Copied!' : 'Click to copy'}</span>
</code>
```

This implementation adds `role="button"` and `tabindex="0"` to make the element keyboard-accessible. It handles the Enter and Space keys for users who navigate with keyboards. The fallback path for `execCommand` handles HTTP contexts where the modern Clipboard API is not available.

## Action Typing with `Action<HTMLElement, Parameters>` from `svelte/action`

Beyond the basic generics, the `Action` type gives you several capabilities worth understanding in depth.

### Restricting Element Types

The first generic constrains which HTML elements can use the action. This is a compile-time safety net:

```typescript
import type { Action } from 'svelte/action';

// Only works on input elements
export const autoSelect: Action<HTMLInputElement> = (node) => {
  node.select(); // TypeScript knows 'node' has a .select() method
};

// Only works on video elements
export const autoPlay: Action<HTMLVideoElement, { muted?: boolean }> = (node, params) => {
  node.muted = params?.muted ?? true;
  node.play().catch(() => {}); // Autoplay may be blocked by browser policy
};
```

```svelte
<!-- Compile error: <div> is not an HTMLInputElement -->
<div use:autoSelect>...</div>

<!-- Works: <input> is an HTMLInputElement -->
<input use:autoSelect value="Select me on focus" />

<!-- Works: <video> is an HTMLVideoElement -->
<video use:autoPlay={{ muted: true }} src="/intro.mp4"></video>
```

### Declaring Custom Events with the Attributes Generic

The third generic parameter declares custom events so the template type checker knows about them:

```typescript
import type { Action } from 'svelte/action';

interface ResizeAttributes {
  onresized?: (event: CustomEvent<{ width: number; height: number }>) => void;
}

export const resizable: Action<HTMLElement, undefined, ResizeAttributes> = (node) => {
  const observer = new ResizeObserver((entries) => {
    const { width, height } = entries[0].contentRect;
    node.dispatchEvent(new CustomEvent('resized', {
      detail: { width, height },
      bubbles: true
    }));
  });

  observer.observe(node);

  return {
    destroy() { observer.disconnect(); }
  };
};
```

```svelte
<!-- TypeScript knows 'onresized' is a valid event on this element -->
<div use:resizable onresized={(e) => console.log(e.detail.width, e.detail.height)}>
  Resize me
</div>
```

## Event Dispatching from Actions

Actions can communicate back to the component by dispatching custom events on the node. This is the idiomatic way for an action to notify its parent of something happening:

```typescript
import type { Action } from 'svelte/action';

interface SwipeDetail {
  direction: 'left' | 'right' | 'up' | 'down';
  distance: number;
  duration: number;
}

interface SwipeAttributes {
  onswipe?: (event: CustomEvent<SwipeDetail>) => void;
}

export const swipeable: Action<
  HTMLElement,
  { threshold?: number } | undefined,
  SwipeAttributes
> = (node, params) => {
  const threshold = params?.threshold ?? 50;
  let startX: number, startY: number, startTime: number;

  function handleStart(e: PointerEvent) {
    startX = e.clientX;
    startY = e.clientY;
    startTime = Date.now();
  }

  function handleEnd(e: PointerEvent) {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const duration = Date.now() - startTime;

    if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

    const direction: SwipeDetail['direction'] =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? 'right' : 'left'
        : dy > 0 ? 'down' : 'up';

    node.dispatchEvent(new CustomEvent<SwipeDetail>('swipe', {
      detail: { direction, distance: Math.max(Math.abs(dx), Math.abs(dy)), duration },
      bubbles: true
    }));
  }

  node.addEventListener('pointerdown', handleStart);
  node.addEventListener('pointerup', handleEnd);

  return {
    destroy() {
      node.removeEventListener('pointerdown', handleStart);
      node.removeEventListener('pointerup', handleEnd);
    }
  };
};
```

```svelte
<script lang="ts">
  import { swipeable } from '$lib/actions/swipeable';

  let lastSwipe = $state('None');
</script>

<div
  use:swipeable={{ threshold: 30 }}
  onswipe={(e: CustomEvent) => lastSwipe = e.detail.direction}
  style="width: 300px; height: 200px; background: #f0f0f0; touch-action: none;"
>
  Swipe me! Last direction: {lastSwipe}
</div>
```

## Multiple Actions on the Same Element: Composition Patterns

You can attach as many actions as you want to a single element. Each action operates independently:

```svelte
<div
  use:tooltip={'Click to copy'}
  use:clipboard={codeSnippet}
  use:intersection={{ onEnter: () => visible = true, once: true }}
>
  {codeSnippet}
</div>
```

When you find yourself applying the same set of actions repeatedly, create a higher-order action that combines them:

```typescript
import type { Action } from 'svelte/action';
import { tooltip } from './tooltip';
import { clipboard } from './clipboard';

interface CopyableCodeParams {
  text: string;
  tooltipText?: string;
}

export const copyableCode: Action<HTMLElement, CopyableCodeParams> = (node, params) => {
  const tooltipResult = tooltip(node, params.tooltipText ?? 'Click to copy');
  const clipboardResult = clipboard(node, { text: params.text });

  return {
    update(newParams) {
      tooltipResult?.update?.(newParams.tooltipText ?? 'Click to copy');
      clipboardResult?.update?.({ text: newParams.text });
    },
    destroy() {
      tooltipResult?.destroy?.();
      clipboardResult?.destroy?.();
    }
  };
};
```

## Actions vs $effect vs Attachments: The Decision Framework

Svelte 5 gives you three tools for imperative DOM access. Understanding when to use each is critical.

### Actions (`use:`)

Use actions when the behavior is **reusable across components** and **encapsulated as a module**:

```typescript
// Exported from a shared file, used in many components
export const focusTrap: Action<HTMLElement> = (node) => { /* ... */ };
```

Actions have explicit `update` and `destroy` lifecycle methods. They are the right choice for library code, design system primitives, and any DOM behavior you want to share. The action function runs once on mount, giving you clear performance characteristics.

### $effect

Use `$effect` when the behavior is specific to this component and tightly coupled to its state:

```svelte
<script lang="ts">
  let canvas: HTMLCanvasElement;
  let color = $state('#ff0000');

  $effect(() => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  });
</script>

<canvas bind:this={canvas} width="400" height="200"></canvas>
```

The downside: you need `bind:this` to get the node reference, which adds a variable declaration. The effect does not run until after the first render, so there is a brief moment where `canvas` is `undefined`.

### Attachments (`{@attach}`)

Use attachments for **inline, one-off DOM manipulation** that is automatically reactive:

```svelte
<div {@attach (node) => {
  node.style.transform = `rotate(${angle}deg)`;
}}>
  Rotated content
</div>
```

Attachments re-run automatically when any `$state` they read changes. No manual `update()` needed. But they cannot be easily extracted to separate files or shared across components.

### Decision Table

| Criterion | Action | $effect | Attachment |
|---|---|---|---|
| Reusable across components? | Best choice | Poor | Poor |
| Needs reactive updates? | Manual `update()` | Automatic | Automatic |
| Library/package code? | Yes | No | Awkward |
| SSR-safe? | Yes (skipped in SSR) | Needs guards | Yes (skipped in SSR) |
| Node reference needed? | No (`use:` provides it) | Yes (`bind:this`) | No (`{@attach}` provides it) |
| Declarative cleanup? | `destroy()` method | Return from `$effect` | Return function |

**Rule of thumb**: If you are writing it once for one element in one component, use an attachment or `$effect`. If you plan to reuse it or export it, write an action.

## Performance: Avoiding Memory Leaks, Passive Listeners, Debouncing

### Passive Event Listeners

When attaching scroll or touch event listeners, use `{ passive: true }` to tell the browser you will not call `preventDefault()`. This allows the browser to optimize scrolling:

```typescript
export const parallax: Action<HTMLElement, number> = (node, speed) => {
  let currentSpeed = speed;

  function handleScroll() {
    const rect = node.getBoundingClientRect();
    const offset = (window.innerHeight - rect.top) * currentSpeed;
    node.style.transform = `translateY(${offset}px)`;
  }

  // Passive: browser can scroll without waiting for our handler
  window.addEventListener('scroll', handleScroll, { passive: true });

  return {
    update(newSpeed) { currentSpeed = newSpeed; },
    destroy() { window.removeEventListener('scroll', handleScroll); }
  };
};
```

Without `{ passive: true }`, the browser must wait for your handler to finish before it can scroll the page, causing visible jank on every frame.

### Debouncing in Actions

Actions that respond to high-frequency events (scroll, resize, mousemove, input) should debounce or throttle their work:

```typescript
import type { Action } from 'svelte/action';

export const resizeObserver: Action<HTMLElement, (entry: ResizeObserverEntry) => void> = (
  node,
  callback
) => {
  let currentCallback = callback;
  let rafId: number | null = null;

  const observer = new ResizeObserver((entries) => {
    // Use requestAnimationFrame to batch resize callbacks to one per frame
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      for (const entry of entries) {
        currentCallback(entry);
      }
      rafId = null;
    });
  });

  observer.observe(node);

  return {
    update(newCallback) { currentCallback = newCallback; },
    destroy() {
      observer.disconnect();
      if (rafId !== null) cancelAnimationFrame(rafId);
    }
  };
};
```

### Memory Leak Checklist

1. **Event listeners on `window`, `document`, or other global objects** -- always remove in `destroy()`.
2. **Observers** (`IntersectionObserver`, `MutationObserver`, `ResizeObserver`) -- always `disconnect()`.
3. **Timers** (`setTimeout`, `setInterval`) -- always `clearTimeout` / `clearInterval`.
4. **Third-party library instances** -- always call their cleanup methods.
5. **Closures holding large data** -- null them out in `destroy()` to help the garbage collector.

```typescript
// Anti-pattern: listener on window without cleanup
const bad: Action<HTMLElement> = (node) => {
  window.addEventListener('resize', () => {
    node.style.width = `${window.innerWidth}px`;
  });
  // No destroy! This listener runs forever.
};

// Correct: cleanup in destroy
const good: Action<HTMLElement> = (node) => {
  const handler = () => {
    node.style.width = `${window.innerWidth}px`;
  };
  window.addEventListener('resize', handler);

  return {
    destroy() {
      window.removeEventListener('resize', handler);
    }
  };
};
```

## Testing Actions

Actions are plain functions, which makes them straightforward to test. You need a DOM environment (jsdom or happy-dom) and a way to simulate the action lifecycle:

```typescript
// src/lib/actions/__tests__/clickOutside.test.ts
import { describe, it, expect, vi } from 'vitest';
import { clickOutside } from '../clickOutside';

describe('clickOutside', () => {
  it('calls callback when clicking outside the node', async () => {
    const node = document.createElement('div');
    const callback = vi.fn();
    document.body.appendChild(node);

    clickOutside(node, callback);

    // Wait for the setTimeout(0) inside the action
    await new Promise((r) => setTimeout(r, 10));

    // Click inside -- should NOT trigger
    node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).not.toHaveBeenCalled();

    // Click outside -- should trigger
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).toHaveBeenCalledOnce();

    document.body.removeChild(node);
  });

  it('updates the callback when update() is called', async () => {
    const node = document.createElement('div');
    const callback1 = vi.fn();
    const callback2 = vi.fn();
    document.body.appendChild(node);

    const result = clickOutside(node, callback1);
    await new Promise((r) => setTimeout(r, 10));

    result?.update?.(callback2);

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback1).not.toHaveBeenCalled();
    expect(callback2).toHaveBeenCalledOnce();

    result?.destroy?.();
    document.body.removeChild(node);
  });

  it('removes event listener on destroy', async () => {
    const node = document.createElement('div');
    const callback = vi.fn();
    document.body.appendChild(node);

    const result = clickOutside(node, callback);
    await new Promise((r) => setTimeout(r, 10));

    result?.destroy?.();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).not.toHaveBeenCalled();

    document.body.removeChild(node);
  });
});
```

### Testing Actions That Dispatch Events

```typescript
describe('swipeable', () => {
  it('dispatches a swipe event on horizontal drag', () => {
    const node = document.createElement('div');
    const handler = vi.fn();
    node.addEventListener('swipe', handler);

    swipeable(node, { threshold: 10 });

    node.dispatchEvent(new PointerEvent('pointerdown', {
      clientX: 0, clientY: 0, bubbles: true
    }));

    node.dispatchEvent(new PointerEvent('pointerup', {
      clientX: 100, clientY: 5, bubbles: true
    }));

    expect(handler).toHaveBeenCalledOnce();
    const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.direction).toBe('right');
    expect(detail.distance).toBe(100);
  });
});
```

The key insight is that actions are just functions. You call them with a DOM node, exercise the behavior, and assert on the results. You call `update()` to test parameter changes and `destroy()` to test cleanup. No special test harness needed.

## Common Pitfalls

### 1. Forgetting that update receives the new value, not the old one

```typescript
// Wrong: cannot diff without storing the previous value
const action: Action<HTMLElement, string[]> = (node, items) => {
  return {
    update(newItems) {
      // 'items' in the outer closure still holds the INITIAL value
    }
  };
};

// Correct: track the previous value in a closure variable
const action: Action<HTMLElement, string[]> = (node, items) => {
  let previous = items;

  return {
    update(newItems) {
      const added = newItems.filter(i => !previous.includes(i));
      const removed = previous.filter(i => !newItems.includes(i));
      previous = newItems;
    }
  };
};
```

### 2. Running browser APIs at module scope

Actions only run in the browser. Svelte skips `use:` directives during SSR. But if your action module has top-level code that references `window` or `document`, it will throw during SSR:

```typescript
// This crashes during SSR -- 'window' evaluated at import time
const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

export const darkMode: Action<HTMLElement> = (node) => { /* ... */ };

// Fix: access browser APIs inside the function body
export const darkMode: Action<HTMLElement> = (node) => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  // ...
};
```

### 3. Using actions when a simpler approach works

Not everything needs an action. If you just need to set an attribute or add a class, use Svelte's template syntax:

```svelte
<!-- Overkill: action just to set a class -->
<div use:addClass={'highlighted'}>...</div>

<!-- Better: Svelte class directive -->
<div class:highlighted>...</div>

<!-- Overkill: action just to set an attribute -->
<div use:setAttr={{ 'data-testid': 'card' }}>...</div>

<!-- Better: just set the attribute directly -->
<div data-testid="card">...</div>
```

### 4. Not handling the element being in a conditional block

When an element is inside an `{#if}` or `{#each}` block, it may be removed and re-created multiple times. Each time, the action gets a fresh `node`. Do not store references to old nodes in module-level state without cleaning them up:

```typescript
// Potential problem: module-level map that grows forever
const nodeMap = new Map<HTMLElement, SomeData>();

const action: Action<HTMLElement> = (node) => {
  nodeMap.set(node, { /* ... */ });

  return {
    destroy() {
      // MUST clean up the map entry
      nodeMap.delete(node);
    }
  };
};
```

## Try It

1. Create a `cssClass` action that accepts a string parameter. On mount, add that CSS class to the element. When the parameter changes (via `update`), remove the old class and add the new one. On `destroy`, remove the class entirely. Track the previous class name in a closure variable. Type it with `Action` from `svelte/action`.

2. Build a `trapFocus` action for modal dialogs. When mounted, find all focusable elements inside the node (`input`, `button`, `a[href]`, `textarea`, `select`, `[tabindex]:not([tabindex="-1"])`), focus the first one, and intercept Tab/Shift+Tab keypresses to cycle focus within the node. On destroy, restore focus to the element that was focused before the trap was activated. This is a real accessibility requirement for modals.

3. Create a `shortcut` action that accepts `{ key: string; modifier?: 'ctrl' | 'shift' | 'alt'; handler: () => void }`. It should listen for the specified keyboard shortcut on `window` and call the handler when it matches. Support multiple shortcuts on different elements. Write a test using Vitest that verifies the shortcut fires and cleans up on destroy.

## Key Takeaways

- Actions are functions attached to elements with `use:action` that run when the element mounts into the DOM -- they bridge declarative templates and imperative DOM manipulation without adding wrapper elements
- The lifecycle is mount (function called) -> update (parameter changes) -> destroy (element removed) -- return `{ update, destroy }` from the function
- The function receives the raw DOM node, giving you full imperative access to styles, attributes, events, and children
- Return a `destroy()` method to clean up event listeners, observers, timers, and third-party library instances -- leaked resources are the most common action bug
- Pass parameters with `use:action={value}` and handle changes with `update()` -- the method receives the new value only, so track the previous value yourself if you need to diff
- Use the `Action<Element, Parameter, Attributes>` type from `svelte/action` for TypeScript support, including element type constraints and custom event typing
- Dispatch custom events with `node.dispatchEvent(new CustomEvent(...))` to communicate back to the component
- Multiple actions on one element work independently; compose them with higher-order actions when needed
- Actions are the right choice for reusable, exportable DOM behaviors; use `$effect` or attachments for one-off, component-specific needs
- Use passive event listeners for scroll and touch handlers, debounce high-frequency events with `requestAnimationFrame`, and always clean up global listeners
- Actions are plain functions and can be unit-tested by calling them with a DOM node and exercising the lifecycle methods
