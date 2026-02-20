# Actions Basics

Svelte components give you full control over markup and styles, but sometimes you need to interact with the raw DOM element itself. Maybe you want to integrate a third-party library, set up a complex event listener, or manipulate an element in a way that does not fit neatly into the template. That is exactly what **actions** are for.

An action is a function that runs when an element is created in the DOM. You attach it with the `use:` directive, and Svelte handles calling it at the right time. Actions are the bridge between Svelte's declarative templates and imperative DOM manipulation.

## Creating a Basic Action

An action is simply a function that receives a DOM node as its argument:

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

When Svelte creates the `<p>` element, it calls `highlight(node)` with the actual DOM element. You can do anything with that node — add styles, attach event listeners, initialize a library, or measure its size.

## Cleanup with destroy()

Actions often set things up that need to be torn down — event listeners, intervals, observers. Return an object with a `destroy()` method and Svelte calls it when the element is removed from the DOM:

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

Without the `destroy()` cleanup, the event listener would leak — it would keep running even after the element is removed. Always clean up after yourself.

## Actions with Parameters

Actions can accept a second argument for configuration. Pass the parameter with `use:action={value}`:

```svelte
<script lang="ts">
  function tooltip(node: HTMLElement, text: string) {
    node.title = text;
    node.style.cursor = 'help';
    node.style.textDecoration = 'underline dotted';

    return {
      update(newText: string) {
        node.title = newText;
      },
      destroy() {
        node.title = '';
      }
    };
  }

  let message = $state('Hello from the tooltip!');
</script>

<p use:tooltip={message}>Hover over me</p>
<input type="text" bind:value={message} placeholder="Change tooltip text" />
```

The `update()` method is called whenever the parameter value changes reactively. This is how your action stays in sync with Svelte's reactive system.

## TypeScript Typing

Svelte provides an `Action` type from `svelte/action` for properly typing your actions. It takes optional generics for the element type and the parameter type:

```typescript
// src/lib/actions/highlight.ts
import type { Action } from 'svelte/action';

interface HighlightParams {
  color: string;
  bold: boolean;
}

export const highlight: Action<HTMLElement, HighlightParams> = (node, params) => {
  function applyStyles(p: HighlightParams) {
    node.style.backgroundColor = p.color;
    node.style.fontWeight = p.bold ? 'bold' : 'normal';
  }

  applyStyles(params);

  return {
    update(newParams) {
      applyStyles(newParams);
    },
    destroy() {
      node.style.backgroundColor = '';
      node.style.fontWeight = '';
    }
  };
};
```

Use the typed action in any component with `use:highlight={{ color, bold }}`. By exporting actions from separate files, you build a reusable library of DOM behaviors.

## Try It

Create a `cssClass` action that accepts a string parameter. On mount, it adds that CSS class to the element. When the parameter changes (via `update`), it removes the old class and adds the new one. On `destroy`, it removes the class entirely. Use the `Action` type from `svelte/action` for proper TypeScript typing.

## Key Takeaways

- Actions are functions attached to elements with `use:action` that run when the element mounts
- The function receives the raw DOM node, giving you full imperative access
- Return a `destroy()` method to clean up event listeners, observers, or other side effects
- Pass parameters with `use:action={value}` and handle changes with the `update()` method
- Use the `Action` type from `svelte/action` for TypeScript support
- Actions are ideal for reusable DOM behaviors that can be shared across components
