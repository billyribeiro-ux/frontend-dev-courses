# Actions Basics

Svelte components give you full control over markup and styles, but sometimes you need to interact with the raw DOM element itself. Maybe you want to integrate a third-party library that expects a DOM node. Maybe you need to set up an IntersectionObserver for lazy loading. Maybe you want a click-outside handler for dropdown menus. These are all imperative DOM operations that do not fit neatly into a declarative template.

That is exactly what **actions** are for. An action is Svelte's answer to: "I need to do something to a DOM element that is not covered by a built-in directive." Actions give you a clean, reusable pattern for attaching behavior to elements — declaratively in the template, but with full imperative access to the DOM node underneath.

## The `use:action` Directive

An action is a function that receives a DOM node as its first argument. You attach it to an element with the `use:` directive:

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

When Svelte creates the `<p>` element and inserts it into the DOM, it calls `highlight(node)` with the actual DOM element. You can do anything with that node — add styles, attach event listeners, initialize a third-party library, measure its dimensions, set up observers.

The key mental model: **actions are a bridge between Svelte's declarative templates and imperative DOM manipulation.** They let you write `use:tooltip` in your template instead of scattering `$effect` blocks throughout your components. The action encapsulates the DOM behavior in one place, and you apply it anywhere with a single directive.

## Action Lifecycle: Mount, Update, Destroy

An action's lifecycle mirrors the element it is attached to:

1. **Mount** — The function runs when the element is inserted into the DOM.
2. **Update** — If the action accepts a parameter, the `update()` method runs whenever that parameter changes.
3. **Destroy** — The `destroy()` method runs when the element is removed from the DOM.

Return an object with `update` and/or `destroy` methods to hook into the full lifecycle:

```svelte
<script lang="ts">
  function trackMouse(node: HTMLElement) {
    // MOUNT: set up the event listener
    function handleMove(e: MouseEvent) {
      node.textContent = `Mouse: ${e.clientX}, ${e.clientY}`;
    }

    window.addEventListener('mousemove', handleMove);

    return {
      // DESTROY: clean up when the element is removed
      destroy() {
        window.removeEventListener('mousemove', handleMove);
      }
    };
  }
</script>

<div use:trackMouse>Move your mouse around</div>
```

Without the `destroy()` cleanup, the event listener would leak — it would keep firing even after the element is removed from the DOM. This is the most common source of bugs in actions: **always clean up side effects.** Event listeners, intervals, timeouts, observers, mutation observers, resize observers — if you set it up, tear it down.

## Parameters and Reactive Updates

Actions can accept a second argument for configuration. Pass the parameter with `use:action={value}`:

```svelte
<script lang="ts">
  function tooltip(node: HTMLElement, text: string) {
    const tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.textContent = text;

    function show(e: MouseEvent) {
      tip.style.left = `${e.pageX + 10}px`;
      tip.style.top = `${e.pageY + 10}px`;
      document.body.appendChild(tip);
    }

    function hide() { tip.remove(); }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);

    return {
      update(newText: string) {
        // Runs whenever the parameter changes reactively
        tip.textContent = newText;
      },
      destroy() {
        tip.remove();
        node.removeEventListener('mouseenter', show);
        node.removeEventListener('mouseleave', hide);
      }
    };
  }

  let message = $state('Hello from the tooltip!');
</script>

<p use:tooltip={message}>Hover over me</p>
<input type="text" bind:value={message} placeholder="Change tooltip text" />
```

The `update()` method is called whenever the parameter value changes reactively. Without it, the tooltip would show stale text after a parameter change. You can also pass objects as parameters (`use:tooltip={{ text, position }}`) for more complex configuration — the `update` method receives the entire new object.

## Real-World Use Case: Click Outside Detection

One of the most common action patterns is detecting clicks outside an element — essential for closing dropdown menus, popovers, and dialogs. Let's build it step by step:

```typescript
// src/lib/actions/clickOutside.ts
import type { Action } from 'svelte/action';

export const clickOutside: Action<HTMLElement, () => void> = (node, callback) => {
  let currentCallback = callback;

  function handleClick(event: MouseEvent) {
    const target = event.target as Node;

    // Check if the click was outside the node
    if (!node.contains(target)) {
      currentCallback();
    }
  }

  // Use setTimeout to avoid catching the click that opened the element
  // (the click that triggered the mount happens in the same event loop tick)
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

```svelte
<script lang="ts">
  import { clickOutside } from '$lib/actions/clickOutside';

  let isOpen = $state(false);
</script>

<div class="dropdown">
  <button onclick={() => isOpen = !isOpen}>
    Menu
  </button>

  {#if isOpen}
    <div class="dropdown-panel" use:clickOutside={() => isOpen = false}>
      <a href="/profile">Profile</a>
      <a href="/settings">Settings</a>
      <button onclick={() => isOpen = false}>Close</button>
    </div>
  {/if}
</div>
```

Notice the `setTimeout` in the action. Without it, the click that opens the dropdown would immediately trigger the click-outside handler and close it. This is a subtle timing issue that catches many developers. The `setTimeout` with 0ms delay pushes the listener registration to the next microtask, after the opening click has finished propagating.

We also use `capture: true` (the third argument to `addEventListener`) to catch clicks during the capture phase. This ensures our handler runs before any `stopPropagation()` calls in the event's path.

## Real-World Use Case: Intersection Observer

Another powerful action pattern: triggering behavior when an element enters or leaves the viewport. This is the foundation for lazy loading, infinite scroll, and scroll-triggered animations:

```typescript
// src/lib/actions/inView.ts
import type { Action } from 'svelte/action';

interface InViewParams {
  onEnter?: (entry: IntersectionObserverEntry) => void;
  onLeave?: (entry: IntersectionObserverEntry) => void;
  threshold?: number;
  rootMargin?: string;
  once?: boolean; // disconnect after first intersection (for lazy loading)
}

export const inView: Action<HTMLElement, InViewParams> = (node, params) => {
  let observer: IntersectionObserver;

  function createObserver(p: InViewParams) {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            p.onEnter?.(entry);
            if (p.once) observer.disconnect();
          } else {
            p.onLeave?.(entry);
          }
        }
      },
      { threshold: p.threshold ?? 0, rootMargin: p.rootMargin ?? '0px' }
    );
    observer.observe(node);
  }

  createObserver(params);

  return {
    update(newParams) { createObserver(newParams); },
    destroy() { observer.disconnect(); }
  };
};
```

```svelte
<!-- Fade in when scrolled into view -->
<div use:inView={{ onEnter: () => visible = true, onLeave: () => visible = false, threshold: 0.3 }}
  class="card" class:visible>
  <h2>This card fades in on scroll</h2>
</div>

<!-- Lazy load: only trigger once when the image is near the viewport -->
<img use:inView={{ onEnter: (e) => { (e.target as HTMLImageElement).src = '/heavy-image.jpg'; }, once: true }}
  alt="Lazy loaded image" />
```

## TypeScript Typing

Svelte provides an `Action` type from `svelte/action` with generics for the element type and parameter type:

```typescript
import type { Action } from 'svelte/action';

// No parameters — typed to HTMLInputElement
export const autofocus: Action<HTMLInputElement> = (node) => {
  node.focus();
};

// With a parameter
export const maxLength: Action<HTMLInputElement, number> = (node, max) => {
  let currentMax = max;
  function handleInput() {
    if (node.value.length > currentMax) node.value = node.value.slice(0, currentMax);
  }
  node.addEventListener('input', handleInput);
  return {
    update(newMax) { currentMax = newMax; },
    destroy() { node.removeEventListener('input', handleInput); }
  };
};
```

```svelte
<!-- Type error if used on a <div> — the action expects HTMLInputElement -->
<input use:autofocus use:maxLength={100} placeholder="Auto-focused, max 100 chars" />
```

By typing the first generic as `HTMLInputElement` instead of `HTMLElement`, you get compile-time safety. Export typed actions from `$lib/actions/` to build a reusable library of DOM behaviors.

## Combining Multiple Actions on a Single Element

One of the strengths of actions is composability. You can attach multiple actions to the same element, and each manages its own lifecycle independently:

```svelte
<!-- A dropdown panel with multiple behaviors composed together -->
{#if isOpen}
  <div
    class="panel"
    use:clickOutside={() => isOpen = false}
    use:trapFocus
    use:inView={{ onLeave: () => isOpen = false, threshold: 0 }}
  >
    <input use:autofocus placeholder="Search..." />
    <button>Option 1</button>
    <button>Option 2</button>
  </div>
{/if}
```

`clickOutside` manages the document click listener. `trapFocus` manages the keydown listener for Tab cycling. `inView` manages the IntersectionObserver. When the element is removed, all three `destroy()` methods are called automatically. This is clean composition without coupling — each action is self-contained and testable on its own.

## Actions vs $effect: When to Use Which

Both actions and `$effect` can manipulate the DOM. The distinction is about **reusability and intent**:

**Use `$effect`** when the behavior is specific to this component and tightly coupled to its state — like drawing on a canvas based on component-specific reactive values. You would not extract it into a reusable module.

**Use actions** when the behavior is generic and reusable across components:

```svelte
<!-- Any component can use these — no copy-paste needed -->
<div use:clickOutside={handleClose}>...</div>
<input use:autofocus />
<section use:inView={{ onEnter: loadMore, once: true }}>...</section>
```

The heuristic: **actions are for reusable DOM behaviors; effects are for component-specific reactions.** If you would put it in a shared `$lib/actions/` directory, it is an action. If it only makes sense inside this one component, it is an effect.

## Actions and Attachments: The Evolution

In Svelte 5, **attachments** are the evolution of actions. Attachments use the `{@attach}` syntax and are more tightly integrated with the component model — they can use `$effect`, `$state`, and other runes directly inside the attachment function.

Actions (`use:`) remain fully supported and are the right choice for most DOM behavior patterns, especially when you need the explicit `update()` lifecycle hook or when working with existing action libraries. Think of attachments as the next generation that you will encounter as the ecosystem evolves — but actions are battle-tested and not going anywhere.

## Try It

1. Create a `cssClass` action that accepts a string parameter. On mount, add that CSS class to the element. When the parameter changes (via `update`), remove the old class and add the new one. On `destroy`, remove the class entirely. Type it with the `Action` type from `svelte/action`.

2. Build a `longPress` action that dispatches a custom `longpress` event after the user holds down the mouse button for 500ms. Accept a `duration` parameter to make the threshold configurable. Remember to clean up the timer if the user releases early.

3. Build a `clipboard` action that copies the element's text content to the clipboard when clicked. Show a brief "Copied!" tooltip using the tooltip pattern from earlier in this lesson.

## Key Takeaways

- Actions are functions attached to elements with `use:action` that run when the element mounts — they bridge declarative templates and imperative DOM manipulation
- The function receives the raw DOM node, giving you full imperative access to set up event listeners, observers, and third-party integrations
- Return `{ update, destroy }` for the full lifecycle: `update` handles parameter changes, `destroy` cleans up side effects
- Always clean up in `destroy()` — leaked event listeners and observers are the most common action bug
- Actions are reusable across components; `$effect` is for component-specific behavior — if you are copy-pasting an effect, extract an action
- Use the `Action` type from `svelte/action` for TypeScript safety, including element type constraints
- Multiple actions compose cleanly on a single element — each manages its own lifecycle independently
- Common action patterns: click-outside detection, intersection observer, tooltips, auto-focus, focus trapping, clipboard access
- Attachments (`{@attach}`) are the evolution of actions in Svelte 5, with deeper rune integration — but actions remain fully supported
