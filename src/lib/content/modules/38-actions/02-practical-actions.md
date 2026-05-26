# Practical Actions

Now that you understand the anatomy of an action — mount, update, destroy — it is time to build real ones. Actions shine when you need reusable DOM behavior that does not belong in a component's template logic. In this lesson you will build nine production-quality actions you can drop into any project, covering common needs from tooltips and click-outside detection to drag-and-drop, focus traps, lazy loading, and textarea auto-resize. Each action is typed, handles edge cases, and cleans up properly.

The mental model: an action is a function that receives a DOM node and does something imperative with it. It returns cleanup logic. It can accept parameters that update reactively. Think of actions as reusable plugins for DOM elements.

## Click Outside

Detecting clicks outside an element is essential for closing dropdowns, modals, and popovers. This version handles several edge cases that naive implementations miss:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

interface ClickOutsideOptions {
  callback: () => void;
  /** Elements that should NOT trigger the callback when clicked */
  ignore?: (HTMLElement | string)[];
  /** Whether to use capture phase (default: true) */
  capture?: boolean;
}

export const clickOutside: Action<HTMLElement, ClickOutsideOptions | (() => void)> = (
  node,
  options
) => {
  let config = normalizeOptions(options);

  function normalizeOptions(opts: ClickOutsideOptions | (() => void)): ClickOutsideOptions {
    return typeof opts === 'function' ? { callback: opts } : opts;
  }

  function shouldIgnore(target: Node): boolean {
    if (!config.ignore) return false;

    return config.ignore.some((ignored) => {
      if (typeof ignored === 'string') {
        // CSS selector — check if target matches or is inside a matching element
        const el = (target as Element).closest?.(ignored);
        return el !== null;
      }
      return ignored.contains(target as Node);
    });
  }

  function handleClick(e: MouseEvent) {
    const target = e.target as Node;

    // Check if the click was outside the node
    if (!node.contains(target) && !shouldIgnore(target)) {
      config.callback();
    }
  }

  // Use a microtask delay to avoid catching the click that opened the element
  // Without this, clicking a toggle button opens AND immediately closes the dropdown
  const timer = setTimeout(() => {
    document.addEventListener('click', handleClick, config.capture ?? true);
  }, 0);

  return {
    update(newOptions) {
      config = normalizeOptions(newOptions);
    },
    destroy() {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick, config.capture ?? true);
    }
  };
};
```

```svelte
<script lang="ts">
  import { clickOutside } from '$lib/actions/clickOutside';
  let open = $state(false);
</script>

<!-- Simple usage -->
<button onclick={() => open = !open}>Toggle Menu</button>
{#if open}
  <div class="dropdown" use:clickOutside={() => open = false}>
    <a href="/profile">Profile</a>
    <a href="/settings">Settings</a>
  </div>
{/if}

<!-- Advanced usage: ignore the toggle button and another element -->
<button id="menu-toggle" onclick={() => open = !open}>Toggle</button>
{#if open}
  <div class="dropdown" use:clickOutside={{
    callback: () => open = false,
    ignore: ['#menu-toggle', '.notification-panel']
  }}>
    Menu content
  </div>
{/if}
```

**Edge cases handled:** The `setTimeout(0)` prevents the click that opens the element from immediately closing it. The `ignore` option prevents closing when clicking specific related elements (like the toggle button). The capture phase ensures the handler fires before event.stopPropagation in child elements.

## Tooltip

This action creates a floating tooltip on hover, properly positioned to avoid viewport overflow:

```typescript
// src/lib/actions/tooltip.ts
import type { Action } from 'svelte/action';

interface TooltipOptions {
  text: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export const tooltip: Action<HTMLElement, string | TooltipOptions> = (node, options) => {
  let config = normalize(options);
  let el: HTMLDivElement | null = null;
  let showTimer: ReturnType<typeof setTimeout>;
  let arrowEl: HTMLDivElement | null = null;

  function normalize(opts: string | TooltipOptions): Required<TooltipOptions> {
    const defaults = { position: 'top' as const, delay: 200 };
    if (typeof opts === 'string') return { ...defaults, text: opts };
    return { ...defaults, ...opts };
  }

  function createTooltip(): HTMLDivElement {
    const div = document.createElement('div');
    div.textContent = config.text;
    div.setAttribute('role', 'tooltip');
    Object.assign(div.style, {
      position: 'fixed',
      background: '#1a1a1a',
      color: '#fff',
      padding: '6px 12px',
      borderRadius: '6px',
      fontSize: '13px',
      lineHeight: '1.4',
      pointerEvents: 'none',
      zIndex: '9999',
      maxWidth: '250px',
      wordWrap: 'break-word',
      opacity: '0',
      transition: 'opacity 150ms ease'
    });

    // Arrow
    arrowEl = document.createElement('div');
    Object.assign(arrowEl.style, {
      position: 'absolute',
      width: '8px',
      height: '8px',
      background: '#1a1a1a',
      transform: 'rotate(45deg)',
      pointerEvents: 'none'
    });
    div.appendChild(arrowEl);

    return div;
  }

  function position() {
    if (!el) return;
    const rect = node.getBoundingClientRect();
    const tipRect = el.getBoundingClientRect();

    let top: number;
    let left: number;

    switch (config.position) {
      case 'bottom':
        top = rect.bottom + 8;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        if (arrowEl) Object.assign(arrowEl.style, { top: '-4px', left: `${tipRect.width / 2 - 4}px` });
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.left - tipRect.width - 8;
        if (arrowEl) Object.assign(arrowEl.style, { top: `${tipRect.height / 2 - 4}px`, right: '-4px' });
        break;
      case 'right':
        top = rect.top + rect.height / 2 - tipRect.height / 2;
        left = rect.right + 8;
        if (arrowEl) Object.assign(arrowEl.style, { top: `${tipRect.height / 2 - 4}px`, left: '-4px' });
        break;
      default: // top
        top = rect.top - tipRect.height - 8;
        left = rect.left + rect.width / 2 - tipRect.width / 2;
        if (arrowEl) Object.assign(arrowEl.style, { bottom: '-4px', left: `${tipRect.width / 2 - 4}px` });
    }

    // Clamp to viewport
    left = Math.max(8, Math.min(left, window.innerWidth - tipRect.width - 8));
    top = Math.max(8, Math.min(top, window.innerHeight - tipRect.height - 8));

    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function show() {
    showTimer = setTimeout(() => {
      el = createTooltip();
      document.body.appendChild(el);
      // Force layout calculation then position
      el.getBoundingClientRect();
      position();
      // Fade in
      requestAnimationFrame(() => {
        if (el) el.style.opacity = '1';
      });
    }, config.delay);
  }

  function hide() {
    clearTimeout(showTimer);
    if (el) {
      el.remove();
      el = null;
      arrowEl = null;
    }
  }

  // Set accessible attribute
  node.setAttribute('aria-label', config.text);

  node.addEventListener('mouseenter', show);
  node.addEventListener('mouseleave', hide);
  node.addEventListener('focus', show);
  node.addEventListener('blur', hide);

  return {
    update(newOptions) {
      config = normalize(newOptions);
      node.setAttribute('aria-label', config.text);
      if (el) el.textContent = config.text;
    },
    destroy() {
      hide();
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
      node.removeEventListener('focus', show);
      node.removeEventListener('blur', hide);
    }
  };
};
```

```svelte
<button use:tooltip={'Save your changes'}>Save</button>
<button use:tooltip={{ text: 'Discard and go back', position: 'bottom' }}>Cancel</button>
<button use:tooltip={{ text: 'This may take a moment', position: 'right', delay: 500 }}>
  Generate Report
</button>
```

**Production details:** The tooltip uses `position: fixed` with viewport clamping so it never overflows off-screen. It includes an arrow for visual anchoring. The `delay` option prevents tooltips from flickering when the mouse briefly passes over elements. Focus/blur handlers make it accessible for keyboard users.

## Intersection Observer

Trigger a callback when an element enters or leaves the viewport. This version supports one-shot triggering for animations that should only play once, and root margin for triggering before the element is fully visible:

```typescript
// src/lib/actions/inview.ts
import type { Action } from 'svelte/action';

interface InviewOptions {
  onEnter?: (entry: IntersectionObserverEntry) => void;
  onLeave?: (entry: IntersectionObserverEntry) => void;
  threshold?: number | number[];
  rootMargin?: string;
  once?: boolean;
}

export const inview: Action<HTMLElement, InviewOptions> = (node, params) => {
  let current = params;
  let hasEntered = false;

  function createObserver(): IntersectionObserver {
    return new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          current.onEnter?.(entry);
          hasEntered = true;
          if (current.once) {
            observer.disconnect();
          }
        } else if (hasEntered) {
          // Only fire onLeave if we have previously entered
          current.onLeave?.(entry);
        }
      },
      {
        threshold: current.threshold ?? 0.1,
        rootMargin: current.rootMargin ?? '0px'
      }
    );
  }

  let observer = createObserver();
  observer.observe(node);

  return {
    update(newParams) {
      // If observer options changed, recreate the observer
      if (
        newParams.threshold !== current.threshold ||
        newParams.rootMargin !== current.rootMargin
      ) {
        observer.disconnect();
        current = newParams;
        hasEntered = false;
        observer = createObserver();
        observer.observe(node);
      } else {
        current = newParams;
      }
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
  let animatedOnce = $state(false);
</script>

<!-- Fade in on scroll, fade out when leaving -->
<div
  use:inview={{
    onEnter: () => visible = true,
    onLeave: () => visible = false,
    threshold: 0.3
  }}
  class="transition-opacity duration-500 {visible ? 'opacity-100' : 'opacity-0'}"
>
  I fade in when scrolled into view!
</div>

<!-- Animate once and stay visible -->
<div
  use:inview={{
    onEnter: () => animatedOnce = true,
    once: true,
    rootMargin: '0px 0px -100px 0px' // Trigger 100px before element reaches viewport bottom
  }}
  class="transition-all duration-700 {animatedOnce ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}"
>
  I slide up once and stay!
</div>
```

## Auto-Resize Textarea

A textarea that grows to fit its content, with optional min/max height constraints:

```typescript
// src/lib/actions/autoResize.ts
import type { Action } from 'svelte/action';

interface AutoResizeOptions {
  minHeight?: number;
  maxHeight?: number;
}

export const autoResize: Action<HTMLTextAreaElement, AutoResizeOptions | undefined> = (
  node,
  options
) => {
  let config = options ?? {};

  function resize() {
    // Reset height to auto so scrollHeight recalculates
    node.style.height = 'auto';

    let newHeight = node.scrollHeight;

    if (config.minHeight && newHeight < config.minHeight) {
      newHeight = config.minHeight;
    }

    if (config.maxHeight && newHeight > config.maxHeight) {
      newHeight = config.maxHeight;
      node.style.overflowY = 'auto';
    } else {
      node.style.overflowY = 'hidden';
    }

    node.style.height = `${newHeight}px`;
  }

  node.style.resize = 'none';
  node.style.overflow = 'hidden';

  // Resize on input
  node.addEventListener('input', resize);

  // Initial resize (content may already exist)
  resize();

  // Also resize when the element becomes visible (e.g., inside a tab)
  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(node);

  return {
    update(newOptions) {
      config = newOptions ?? {};
      resize();
    },
    destroy() {
      node.removeEventListener('input', resize);
      resizeObserver.disconnect();
    }
  };
};
```

```svelte
<script lang="ts">
  import { autoResize } from '$lib/actions/autoResize';
  let message = $state('');
</script>

<!-- Basic: grows indefinitely -->
<textarea use:autoResize bind:value={message} placeholder="Type something..." />

<!-- Constrained: min 80px, max 300px -->
<textarea
  use:autoResize={{ minHeight: 80, maxHeight: 300 }}
  bind:value={message}
  placeholder="Constrained growth..."
/>
```

**Why ResizeObserver?** The textarea might be inside a tab panel or accordion that starts hidden. When it becomes visible, the initial size calculation was wrong. `ResizeObserver` detects when the element's dimensions change and recalculates.

## Copy to Clipboard

One-click copy with visual feedback, fallback for older browsers, and customizable feedback duration:

```typescript
// src/lib/actions/clipboard.ts
import type { Action } from 'svelte/action';

interface ClipboardOptions {
  text?: string;
  onCopy?: () => void;
  onError?: (error: Error) => void;
  feedbackMs?: number;
}

export const clipboard: Action<HTMLElement, string | ClipboardOptions | undefined> = (
  node,
  options
) => {
  let config = normalize(options);

  function normalize(opts: string | ClipboardOptions | undefined): ClipboardOptions {
    if (!opts) return {};
    if (typeof opts === 'string') return { text: opts };
    return opts;
  }

  async function handleClick() {
    const textToCopy = config.text ?? node.textContent ?? '';

    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for older browsers or non-HTTPS contexts
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.cssText = 'position:fixed;left:-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      // Visual feedback via data attribute
      node.dataset.copied = 'true';
      config.onCopy?.();

      setTimeout(() => {
        delete node.dataset.copied;
      }, config.feedbackMs ?? 2000);
    } catch (err) {
      config.onError?.(err as Error);
    }
  }

  node.addEventListener('click', handleClick);
  node.style.cursor = 'pointer';
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');

  // Support keyboard activation
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }
  node.addEventListener('keydown', handleKeydown);

  return {
    update(newOptions) {
      config = normalize(newOptions);
    },
    destroy() {
      node.removeEventListener('click', handleClick);
      node.removeEventListener('keydown', handleKeydown);
    }
  };
};
```

```svelte
<script lang="ts">
  import { clipboard } from '$lib/actions/clipboard';
</script>

<code
  use:clipboard={'npm install svelte@latest'}
  class="data-[copied]:bg-green-100 transition-colors"
>
  npm install svelte@latest
</code>

<!-- With callbacks -->
<button use:clipboard={{
  text: 'https://example.com/share/abc',
  onCopy: () => alert('Link copied!'),
  feedbackMs: 3000
}}>
  Copy Share Link
</button>

<style>
  code[data-copied]::after {
    content: ' Copied!';
    color: green;
  }
</style>
```

## Focus Trap

Keep focus within a container element — essential for accessible modals and dialogs:

```typescript
// src/lib/actions/focusTrap.ts
import type { Action } from 'svelte/action';

export const focusTrap: Action<HTMLElement, boolean | undefined> = (node, active = true) => {
  let isActive = active;
  let previouslyFocused: HTMLElement | null = null;

  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
  ].join(', ');

  function getFocusableElements(): HTMLElement[] {
    return Array.from(node.querySelectorAll(focusableSelector)).filter(
      (el) => {
        const htmlEl = el as HTMLElement;
        return htmlEl.offsetParent !== null; // Exclude hidden elements
      }
    ) as HTMLElement[];
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isActive || e.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey) {
      // Shift+Tab: if on first element, wrap to last
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      // Tab: if on last element, wrap to first
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function activate() {
    previouslyFocused = document.activeElement as HTMLElement;

    // Focus the first focusable element inside the container
    const focusable = getFocusableElements();
    if (focusable.length > 0) {
      // Prefer an element with autofocus attribute
      const autoFocused = focusable.find((el) => el.hasAttribute('autofocus'));
      (autoFocused ?? focusable[0]).focus();
    } else {
      // No focusable children — make the container focusable
      node.setAttribute('tabindex', '-1');
      node.focus();
    }

    document.addEventListener('keydown', handleKeydown);
  }

  function deactivate() {
    document.removeEventListener('keydown', handleKeydown);
    // Restore focus to the element that was focused before the trap
    previouslyFocused?.focus();
  }

  if (isActive) activate();

  return {
    update(newActive) {
      const wasActive = isActive;
      isActive = newActive ?? true;

      if (isActive && !wasActive) activate();
      if (!isActive && wasActive) deactivate();
    },
    destroy() {
      deactivate();
    }
  };
};
```

```svelte
<script lang="ts">
  import { focusTrap } from '$lib/actions/focusTrap';
  let showModal = $state(false);
</script>

<button onclick={() => showModal = true}>Open Modal</button>

{#if showModal}
  <div class="modal-backdrop">
    <div class="modal" use:focusTrap role="dialog" aria-modal="true">
      <h2>Modal Title</h2>
      <p>Tab key cycles through focusable elements in this modal only.</p>
      <input placeholder="Name" />
      <input placeholder="Email" type="email" />
      <div class="flex gap-2">
        <button onclick={() => showModal = false}>Cancel</button>
        <button autofocus>Confirm</button>
      </div>
    </div>
  </div>
{/if}
```

**Accessibility details:** The trap returns focus to the previously focused element when destroyed (when the modal closes). It prefers elements with `autofocus`. It handles empty containers by making the container itself focusable. Hidden elements (display:none) are excluded from the focusable set.

## Drag and Drop

Enable drag-and-drop repositioning on any element:

```typescript
// src/lib/actions/draggable.ts
import type { Action } from 'svelte/action';

interface DraggableOptions {
  bounds?: 'parent' | 'viewport' | HTMLElement;
  handle?: string; // CSS selector for drag handle
  onDragStart?: (position: { x: number; y: number }) => void;
  onDrag?: (position: { x: number; y: number }) => void;
  onDragEnd?: (position: { x: number; y: number }) => void;
}

export const draggable: Action<HTMLElement, DraggableOptions | undefined> = (node, options) => {
  let config = options ?? {};
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  function getHandle(): HTMLElement {
    if (config.handle) {
      return node.querySelector(config.handle) as HTMLElement ?? node;
    }
    return node;
  }

  function getBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    if (!config.bounds) return null;

    if (config.bounds === 'viewport') {
      return {
        minX: 0,
        minY: 0,
        maxX: window.innerWidth - node.offsetWidth,
        maxY: window.innerHeight - node.offsetHeight
      };
    }

    const parent = config.bounds === 'parent' ? node.parentElement! : config.bounds;
    const parentRect = parent.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();

    return {
      minX: parentRect.left - nodeRect.left + x,
      minY: parentRect.top - nodeRect.top + y,
      maxX: parentRect.right - nodeRect.right + x,
      maxY: parentRect.bottom - nodeRect.bottom + y
    };
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function handlePointerDown(e: PointerEvent) {
    // Only left mouse button or touch
    if (e.button !== 0) return;

    isDragging = true;
    startX = e.clientX - x;
    startY = e.clientY - y;

    node.style.cursor = 'grabbing';
    node.style.userSelect = 'none';
    node.setPointerCapture(e.pointerId);

    config.onDragStart?.({ x, y });
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;

    let newX = e.clientX - startX;
    let newY = e.clientY - startY;

    const bounds = getBounds();
    if (bounds) {
      newX = clamp(newX, bounds.minX, bounds.maxX);
      newY = clamp(newY, bounds.minY, bounds.maxY);
    }

    x = newX;
    y = newY;

    node.style.transform = `translate(${x}px, ${y}px)`;
    config.onDrag?.({ x, y });
  }

  function handlePointerUp() {
    if (!isDragging) return;

    isDragging = false;
    node.style.cursor = config.handle ? '' : 'grab';
    node.style.userSelect = '';

    config.onDragEnd?.({ x, y });
  }

  const handle = getHandle();
  handle.style.cursor = 'grab';
  handle.addEventListener('pointerdown', handlePointerDown);
  node.addEventListener('pointermove', handlePointerMove);
  node.addEventListener('pointerup', handlePointerUp);

  return {
    update(newOptions) {
      config = newOptions ?? {};
    },
    destroy() {
      handle.removeEventListener('pointerdown', handlePointerDown);
      node.removeEventListener('pointermove', handlePointerMove);
      node.removeEventListener('pointerup', handlePointerUp);
    }
  };
};
```

```svelte
<script lang="ts">
  import { draggable } from '$lib/actions/draggable';
  let position = $state({ x: 0, y: 0 });
</script>

<!-- Basic draggable -->
<div use:draggable class="w-48 h-48 bg-blue-500 rounded-lg text-white p-4">
  Drag me anywhere!
</div>

<!-- Bounded to parent -->
<div class="relative w-full h-96 border-2 border-dashed">
  <div
    use:draggable={{
      bounds: 'parent',
      onDrag: (pos) => position = pos
    }}
    class="w-24 h-24 bg-green-500 rounded-lg"
  ></div>
  <p class="absolute bottom-2 left-2 text-sm text-gray-500">
    Position: ({position.x}, {position.y})
  </p>
</div>

<!-- With a drag handle -->
<div use:draggable={{ handle: '.drag-handle', bounds: 'viewport' }}
     class="w-72 bg-white shadow-xl rounded-lg overflow-hidden">
  <div class="drag-handle bg-gray-100 px-4 py-2 cursor-grab flex items-center justify-between">
    <span class="font-semibold">Draggable Panel</span>
    <span class="text-gray-400">&#8942;&#8942;</span>
  </div>
  <div class="p-4">
    <p>Only the header is draggable.</p>
  </div>
</div>
```

## Lazy Loading Images

Load images only when they enter the viewport, with a blur-up placeholder effect:

```typescript
// src/lib/actions/lazyImage.ts
import type { Action } from 'svelte/action';

interface LazyImageOptions {
  src: string;
  placeholder?: string; // Low-res placeholder or solid color
  rootMargin?: string;
}

export const lazyImage: Action<HTMLImageElement, LazyImageOptions | string> = (node, options) => {
  let config = normalize(options);

  function normalize(opts: LazyImageOptions | string): LazyImageOptions {
    if (typeof opts === 'string') return { src: opts };
    return opts;
  }

  // Set placeholder
  if (config.placeholder) {
    node.src = config.placeholder;
    node.style.filter = 'blur(10px)';
    node.style.transition = 'filter 0.3s ease';
  }

  // Check if native lazy loading is supported and sufficient
  if ('loading' in HTMLImageElement.prototype && !config.placeholder) {
    node.src = config.src;
    node.loading = 'lazy';
    return {};
  }

  const observer = new IntersectionObserver(
    ([entry]) => {
      if (entry.isIntersecting) {
        // Create a hidden image to preload
        const img = new Image();
        img.onload = () => {
          node.src = config.src;
          node.style.filter = '';
          node.classList.add('loaded');
        };
        img.onerror = () => {
          node.alt = `Failed to load: ${node.alt}`;
        };
        img.src = config.src;

        observer.disconnect();
      }
    },
    { rootMargin: config.rootMargin ?? '200px 0px' } // Start loading 200px before viewport
  );

  observer.observe(node);

  return {
    update(newOptions) {
      config = normalize(newOptions);
    },
    destroy() {
      observer.disconnect();
    }
  };
};
```

```svelte
<script lang="ts">
  import { lazyImage } from '$lib/actions/lazyImage';
</script>

<!-- Simple lazy loading -->
<img use:lazyImage={'/images/hero.jpg'} alt="Hero" />

<!-- With blur-up placeholder -->
<img
  use:lazyImage={{
    src: '/images/product-large.jpg',
    placeholder: '/images/product-tiny.jpg',
    rootMargin: '400px 0px'
  }}
  alt="Product"
  class="w-full h-64 object-cover"
/>
```

## Combining Multiple Actions

You can apply multiple actions to the same element. They compose naturally because each action operates independently on the DOM node:

```svelte
<script lang="ts">
  import { tooltip } from '$lib/actions/tooltip';
  import { clipboard } from '$lib/actions/clipboard';
  import { inview } from '$lib/actions/inview';

  let visible = $state(false);
</script>

<!-- Three actions on one element -->
<code
  use:tooltip={'Click to copy'}
  use:clipboard={'npm install svelte@latest'}
  use:inview={{ onEnter: () => visible = true, once: true }}
  class="transition-opacity duration-500 {visible ? 'opacity-100' : 'opacity-0'}
         data-[copied]:text-green-600 cursor-pointer"
>
  npm install svelte@latest
</code>
```

Actions compose well because they follow a simple contract: take a node, do your thing, clean up when done. No action knows about or conflicts with the others.

## Testing Actions

Actions are plain functions that receive a DOM node. You can test them with any DOM testing library:

```typescript
// src/lib/actions/clickOutside.test.ts
import { describe, it, expect, vi } from 'vitest';
import { clickOutside } from './clickOutside';

describe('clickOutside', () => {
  it('calls callback when clicking outside the element', async () => {
    const container = document.createElement('div');
    const target = document.createElement('div');
    container.appendChild(target);
    document.body.appendChild(container);

    const callback = vi.fn();
    const action = clickOutside(target, callback);

    // Wait for the setTimeout(0) in the action
    await new Promise((r) => setTimeout(r, 10));

    // Click outside
    document.body.click();
    expect(callback).toHaveBeenCalledTimes(1);

    // Click inside
    callback.mockClear();
    target.click();
    expect(callback).not.toHaveBeenCalled();

    action?.destroy?.();
    container.remove();
  });

  it('does not call callback for ignored elements', async () => {
    const target = document.createElement('div');
    const ignored = document.createElement('button');
    ignored.id = 'toggle';
    document.body.appendChild(target);
    document.body.appendChild(ignored);

    const callback = vi.fn();
    const action = clickOutside(target, {
      callback,
      ignore: ['#toggle']
    });

    await new Promise((r) => setTimeout(r, 10));

    ignored.click();
    expect(callback).not.toHaveBeenCalled();

    action?.destroy?.();
    target.remove();
    ignored.remove();
  });

  it('cleans up event listeners on destroy', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const callback = vi.fn();
    const action = clickOutside(target, callback);

    await new Promise((r) => setTimeout(r, 10));
    action?.destroy?.();

    document.body.click();
    expect(callback).not.toHaveBeenCalled();

    target.remove();
  });
});
```

## Try It

1. Build a `draggable` action that lets a user drag an element around the screen. It should listen for `pointerdown`, `pointermove`, and `pointerup` events, update the element's position with `transform: translate(x, y)`, and clean up all listeners on destroy. Add a `bounds: 'parent'` option that constrains movement to the parent element.

2. Create a `portal` action that moves an element to a different part of the DOM (e.g., `document.body`) when it mounts, and moves it back when it unmounts. This is useful for modals and tooltips that need to escape `overflow: hidden` containers.

3. Combine `clickOutside`, `focusTrap`, and a Svelte transition to build a complete accessible modal component. The modal should trap focus, close on outside click, close on Escape key, and restore focus to the trigger element when closed.

## Key Takeaways

- **Click outside** uses capture-phase event listening and a microtask delay to avoid catching the opening click; supports ignoring specific elements
- **Tooltips** use `position: fixed` with viewport clamping and arrows for production-quality positioning; include keyboard accessibility via focus/blur
- **Intersection Observer** wraps the browser API with support for one-shot animations (`once: true`) and root margin for early triggering
- **Auto-resize textarea** combines input event listeners with ResizeObserver for correct sizing even when the element starts hidden
- **Clipboard** includes a fallback for non-HTTPS contexts, keyboard activation for accessibility, and customizable feedback duration
- **Focus trap** handles Tab/Shift+Tab wrapping, prefers `autofocus` elements, excludes hidden elements, and restores focus on destroy
- **Drag and drop** uses pointer capture for reliable tracking, supports drag handles and boundary constraints
- **Lazy loading** combines IntersectionObserver with blur-up placeholders for smooth loading transitions
- Multiple actions compose naturally on the same element — each operates independently
- Test actions by creating DOM elements in tests and asserting on callback invocations and DOM mutations
- Every action follows the same pattern: set up on mount, return `update` and `destroy`
