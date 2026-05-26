# Attachments

Svelte 5 introduced a new way to run code when DOM elements mount: **attachments**. While actions (`use:`) have been the go-to for imperative DOM access, attachments offer a fully reactive alternative using the `{@attach}` directive. They re-run automatically when reactive dependencies change, making them ideal for one-off DOM manipulation that needs to stay in sync with your component's state.

Think of actions as reusable tools you put in a toolbox. Attachments are more like inline instructions — written right where you need them, tightly coupled to the component's reactive state.

## The {@attach} Directive

An attachment is an inline function on any element that receives the DOM node when it mounts:

```svelte
<script lang="ts">
  let color = $state('#3498db');
</script>

<div {@attach (node) => {
  node.style.backgroundColor = color;
  node.style.padding = '16px';
  node.style.borderRadius = '8px';
  node.style.color = '#fff';
}}>
  This box reacts to the color picker.
</div>

<input type="color" bind:value={color} />
```

Every time `color` changes, the attachment function re-runs with the same DOM node. There is no need for an `update()` method like with actions — reactivity is automatic.

## Cleanup Functions

Just like `$effect`, attachments can return a cleanup function. Svelte calls it before re-running the attachment and when the element is removed from the DOM:

```svelte
<script lang="ts">
  let interval = $state(1000);
  let count = $state(0);
</script>

<div {@attach (node) => {
  const timer = setInterval(() => {
    count++;
    node.textContent = `Count: ${count}`;
  }, interval);

  return () => clearInterval(timer);
}}>
  Count: 0
</div>

<label>
  Interval: <input type="range" min="100" max="2000" step="100" bind:value={interval} />
  {interval}ms
</label>
```

When `interval` changes, the cleanup function clears the old timer before the attachment sets up a new one with the updated interval.

## Fully Reactive — No update() Needed

The key difference between actions and attachments is reactivity. With actions, you must manually handle parameter changes in an `update()` method. Attachments automatically re-run whenever any reactive value they read changes:

```svelte
<script lang="ts">
  let fontSize = $state(16);
  let fontWeight = $state('normal');
  let textColor = $state('#333');
</script>

<p {@attach (node) => {
  node.style.fontSize = `${fontSize}px`;
  node.style.fontWeight = fontWeight;
  node.style.color = textColor;
}}>
  This text reacts to all three controls at once.
</p>

<label>Size: <input type="range" min="12" max="48" bind:value={fontSize} /> {fontSize}px</label>
<label>
  <input type="checkbox" onchange={(e) => fontWeight = e.currentTarget.checked ? 'bold' : 'normal'} /> Bold
</label>
<input type="color" bind:value={textColor} />
```

With an action, you would need to pass all three values as a single parameter object and handle `update()` manually. Attachments just work.

## Practical Example: Auto-Resize Textarea

A textarea that grows to fit its content is a common UI pattern. An attachment handles this cleanly:

```svelte
<script lang="ts">
  let text = $state('');
</script>

<textarea
  bind:value={text}
  {@attach (node) => {
    node.style.overflow = 'hidden';
    node.style.resize = 'none';
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;
  }}
  placeholder="Start typing... the textarea will grow."
></textarea>
```

Because the attachment reads `text` implicitly through the bound value, it re-runs every time the user types, recalculating the height.

## When to Use Actions vs Attachments

| | Actions (`use:`) | Attachments (`{@attach}`) |
|---|---|---|
| Reusability | Defined once, used on many elements | Inline, specific to one element |
| Reactivity | Manual via `update()` | Automatic, like `$effect` |
| Parameters | Single value or object | Reads any `$state` in scope |
| Best for | Shared behaviors (tooltip, click-outside) | One-off DOM manipulation tied to local state |

Use actions when you want a reusable behavior you can share across components. Use attachments when you need quick, reactive DOM access that is specific to a single element in a single component.

## Creating Attachment Keys with createAttachmentKey()

Starting in Svelte 5.29, you can use `createAttachmentKey()` to create a unique symbol key that lets you programmatically spread attachments onto elements. This is useful when a component wants to declaratively add attachments to elements via props or context, rather than requiring consumers to manually apply `{@attach}` directives.

```svelte
<!-- Tooltip.svelte -->
<script lang="ts" module>
  import { createAttachmentKey } from 'svelte';

  // Create a unique key that represents this attachment
  export const tooltipKey = createAttachmentKey();
</script>

<script lang="ts">
  import { setContext } from 'svelte';

  let { children } = $props();

  // Provide an attachment via context using the key
  setContext(tooltipKey, (node: HTMLElement) => {
    let tip: HTMLDivElement | null = null;

    function show() {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = node.getAttribute('aria-label') ?? '';
      node.appendChild(tip);
    }

    function hide() {
      tip?.remove();
    }

    node.addEventListener('mouseenter', show);
    node.addEventListener('mouseleave', hide);

    return () => {
      node.removeEventListener('mouseenter', show);
      node.removeEventListener('mouseleave', hide);
      tip?.remove();
    };
  });
</script>

{@render children()}
```

A consumer can then apply the attachment by spreading the key onto any element:

```svelte
<script lang="ts">
  import Tooltip, { tooltipKey } from './Tooltip.svelte';
  import { getContext } from 'svelte';

  const tooltip = getContext(tooltipKey);
</script>

<Tooltip>
  <button {...{ [tooltipKey]: true }} aria-label="Save your work">
    Save
  </button>
</Tooltip>
```

The key advantage of `createAttachmentKey()` is that it enables library authors to provide attachment behaviors without requiring the consumer to write `{@attach}` directives directly. The attachment is declaratively applied through the component tree.

## Converting Actions to Attachments with fromAction()

If you have existing Svelte actions (functions designed for the `use:` directive) and want to use them as attachments, `fromAction()` provides a direct conversion path. This is especially valuable for library authors who already ship action-based APIs and want to support the attachment model without rewriting everything from scratch.

```svelte
<script lang="ts">
  import { fromAction } from 'svelte';
  import { clickOutside } from './actions.js';

  let showDropdown = $state(false);

  // Convert the existing action into an attachment
  const clickOutsideAttachment = fromAction(clickOutside);
</script>

<button onclick={() => showDropdown = !showDropdown}>Toggle Menu</button>

{#if showDropdown}
  <div {@attach clickOutsideAttachment(() => {
    showDropdown = false;
  })}>
    <ul>
      <li>Option A</li>
      <li>Option B</li>
      <li>Option C</li>
    </ul>
  </div>
{/if}
```

In this example, `clickOutside` is a traditional action that accepts a callback parameter. `fromAction()` wraps it so it conforms to the attachment interface: it receives the DOM node, passes through the parameter, and handles cleanup automatically.

The original action module stays unchanged:

```ts
// actions.ts
export function clickOutside(node: HTMLElement, callback: () => void) {
  function handleClick(event: MouseEvent) {
    if (!node.contains(event.target as Node)) {
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

`fromAction()` bridges the gap between the action API (`destroy` / `update`) and the attachment API (cleanup functions and automatic reactivity). Use it when migrating existing libraries or when you want to mix actions and attachments in the same codebase.

## Try It

Create a component with an `<input>` and a `<div>`. Use an attachment on the `<div>` that reads the input's bound value and sets the div's `textContent` and adjusts the background color based on the text length (short = green, medium = yellow, long = red). Verify that the attachment re-runs reactively as you type.

## Key Takeaways

- Attachments use `{@attach (node) => { ... }}` to run code when an element mounts
- They are fully reactive — they automatically re-run when any `$state` they read changes
- Return a cleanup function to tear down side effects before re-running or on unmount
- Actions are better for reusable, shareable DOM behaviors exported from separate files
- Attachments are better for one-off, inline DOM manipulation tightly coupled to component state
- Attachments follow the same cleanup pattern as `$effect` — return a function, not an object
- `createAttachmentKey()` (Svelte 5.29+) creates a unique symbol key for spreading attachments onto elements programmatically via props or context
- `fromAction()` converts existing `use:` directive actions into attachments, providing a migration path for libraries with action-based APIs
