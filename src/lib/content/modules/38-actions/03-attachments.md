# Attachments

Svelte 5 introduced a new way to run code when DOM elements mount: **attachments**. While actions (`use:`) have been the go-to for imperative DOM access, attachments offer a fully reactive alternative using the `{@attach}` directive. They re-run automatically when reactive dependencies change, making them ideal for one-off DOM manipulation that needs to stay in sync with your component's state.

Think of actions as reusable tools you put in a toolbox. Attachments are more like inline instructions — written right where you need them, tightly coupled to the component's reactive state. This lesson covers the core `{@attach}` directive, cleanup functions, `createAttachmentKey()` for programmatic attachment spreading, `fromAction()` for converting existing actions, attachment composition patterns, reactive attachments in depth, and how attachments interact with snippets and components.

## The {@attach} Directive

An attachment is a function on any element that receives the DOM node when it mounts. You write it inline using `{@attach}`:

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

Every time `color` changes, the attachment function re-runs with the same DOM node. There is no need for an `update()` method like with actions — reactivity is automatic. This is the fundamental difference: attachments are reactive effects tied to DOM elements.

### How Attachments Work Under the Hood

An attachment is essentially a `$effect` scoped to a DOM element's lifetime. When the element mounts, Svelte creates a reactive scope and runs your attachment function inside it. Any `$state` or `$derived` values read during execution become dependencies. When those dependencies change, the attachment's cleanup function runs (if one was returned) and the attachment function re-runs.

When the element is removed from the DOM, the cleanup function runs one final time and the reactive scope is destroyed. This is identical to `$effect` semantics.

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

When `interval` changes, the cleanup function clears the old timer before the attachment sets up a new one with the updated interval. Without cleanup, you would accumulate timers and eventually crash the browser.

### Cleanup Execution Order

1. Element mounts -> attachment function runs
2. A dependency changes -> cleanup runs -> attachment function runs again
3. Element unmounts -> cleanup runs one final time

This is the exact same lifecycle as `$effect`. If you already understand effects, you understand attachments.

## Fully Reactive — No update() Needed

The key difference between actions and attachments is reactivity. With actions, you must manually handle parameter changes in an `update()` method. Attachments automatically re-run whenever any reactive value they read changes:

```svelte
<script lang="ts">
  let fontSize = $state(16);
  let fontWeight = $state<'normal' | 'bold'>('normal');
  let textColor = $state('#333');
  let letterSpacing = $state(0);
</script>

<p {@attach (node) => {
  node.style.fontSize = `${fontSize}px`;
  node.style.fontWeight = fontWeight;
  node.style.color = textColor;
  node.style.letterSpacing = `${letterSpacing}px`;
}}>
  This text reacts to all four controls simultaneously.
</p>

<div class="controls">
  <label>Size: <input type="range" min="12" max="48" bind:value={fontSize} /> {fontSize}px</label>
  <label>
    <input type="checkbox" onchange={(e) => fontWeight = e.currentTarget.checked ? 'bold' : 'normal'} /> Bold
  </label>
  <label>Color: <input type="color" bind:value={textColor} /></label>
  <label>Spacing: <input type="range" min="0" max="10" bind:value={letterSpacing} /> {letterSpacing}px</label>
</div>
```

With an action, you would need to pass all four values as a single parameter object and handle `update()` manually. Attachments just work — they read reactive state and re-run when it changes.

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

Because the attachment reads `text` implicitly through the bound value (Svelte tracks that the textarea's value is bound to `text`, making `text` a dependency of the attachment), it re-runs every time the user types, recalculating the height.

## Practical Example: Focus Management

Focus an input conditionally based on reactive state:

```svelte
<script lang="ts">
  let editing = $state(false);
</script>

<button onclick={() => editing = true}>Edit Title</button>

{#if editing}
  <input
    value="My Title"
    {@attach (node) => {
      node.focus();
      node.select();
    }}
    onblur={() => editing = false}
    onkeydown={(e) => e.key === 'Enter' && (editing = false)}
  />
{:else}
  <h2>My Title</h2>
{/if}
```

The attachment runs when the input mounts (when `editing` becomes `true`), immediately focusing and selecting the text. No `onMount` needed, no `tick()` needed.

## Practical Example: Canvas Drawing

Attachments are excellent for imperative APIs like Canvas:

```svelte
<script lang="ts">
  let width = $state(300);
  let height = $state(200);
  let hue = $state(180);
</script>

<canvas
  {width}
  {height}
  {@attach (node) => {
    const ctx = node.getContext('2d')!;
    ctx.clearRect(0, 0, width, height);

    // Draw a gradient background
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `hsl(${hue}, 80%, 60%)`);
    gradient.addColorStop(1, `hsl(${hue + 60}, 80%, 40%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // Draw circles
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.arc(
        (width / 6) * (i + 1),
        height / 2,
        Math.min(width, height) / 8,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = `hsl(${hue + i * 30}, 70%, 80%)`;
      ctx.fill();
    }
  }}
></canvas>

<label>Hue: <input type="range" min="0" max="360" bind:value={hue} /></label>
<label>Width: <input type="range" min="200" max="600" bind:value={width} /></label>
```

Every time `hue` or `width` changes, the entire canvas redraws. This is exactly what you want for a canvas — you typically redraw everything on each change anyway.

## When to Use Actions vs Attachments

| | Actions (`use:`) | Attachments (`{@attach}`) |
|---|---|---|
| Reusability | Defined once, used on many elements | Inline, specific to one element |
| Reactivity | Manual via `update()` | Automatic, like `$effect` |
| Parameters | Single value or object | Reads any `$state` in scope |
| File location | Separate `.ts` file | Inline in component |
| Best for | Shared behaviors (tooltip, click-outside) | One-off DOM manipulation tied to local state |
| Cleanup | Return `{ destroy() {} }` | Return `() => {}` |
| Library usage | Standard for published libraries | Best for app-level code |

**Use actions** when you want a reusable behavior you can share across components or publish as a library. Actions have a clear, well-established API surface.

**Use attachments** when you need quick, reactive DOM access that is specific to a single element in a single component. Attachments reduce boilerplate by eliminating the need for a separate file and the `update()` method.

## Creating Attachment Keys with createAttachmentKey()

Starting in Svelte 5.29, you can use `createAttachmentKey()` to create a unique symbol key that lets you programmatically spread attachments onto elements. This is the bridge between component-level logic and element-level DOM access — it lets a parent component or context provider declaratively add behavior to elements in child components.

### How It Works

`createAttachmentKey()` returns a symbol. When you spread an object containing this symbol as a key onto an element, Svelte treats the value as an attachment function and runs it when the element mounts.

```svelte
<!-- Tooltip.svelte -->
<script lang="ts" module>
  import { createAttachmentKey } from 'svelte';

  // Export the key so consumers can use it
  export const tooltipKey = createAttachmentKey();
</script>

<script lang="ts">
  import { setContext } from 'svelte';

  let { text, children } = $props();

  // Provide the attachment function via context
  setContext(tooltipKey, (node: HTMLElement) => {
    let tip: HTMLDivElement | null = null;

    function show() {
      tip = document.createElement('div');
      tip.className = 'tooltip';
      tip.textContent = text;
      Object.assign(tip.style, {
        position: 'fixed',
        background: '#333',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        zIndex: '9999',
        pointerEvents: 'none'
      });
      document.body.appendChild(tip);

      const rect = node.getBoundingClientRect();
      tip.style.left = `${rect.left + rect.width / 2 - tip.offsetWidth / 2}px`;
      tip.style.top = `${rect.top - tip.offsetHeight - 6}px`;
    }

    function hide() {
      tip?.remove();
      tip = null;
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

A consumer applies the attachment by spreading the key onto any element:

```svelte
<script lang="ts">
  import Tooltip, { tooltipKey } from './Tooltip.svelte';
  import { getContext } from 'svelte';

  const tooltip = getContext(tooltipKey);
</script>

<Tooltip text="Save your work">
  <button {...{ [tooltipKey]: true }} aria-label="Save your work">
    Save
  </button>
</Tooltip>
```

### Why Use Attachment Keys?

The key advantage is **inversion of control**. Instead of the consumer knowing how to apply a behavior (writing `use:tooltip` or `{@attach ...}`), the provider declares the behavior and the consumer just opts in by spreading a key. This is powerful for:

1. **Design systems** — A `<FormField>` component can provide a validation attachment that automatically highlights invalid inputs.
2. **Accessibility layers** — A provider can add ARIA attributes and keyboard handlers to elements without the consumer writing imperative code.
3. **Animation systems** — A `<AnimatePresence>` component can provide entry/exit animations via attachment keys.

### Attachment Key with Reactive Context

Attachment keys become powerful when combined with reactive context:

```svelte
<!-- ThemeProvider.svelte -->
<script lang="ts" module>
  import { createAttachmentKey } from 'svelte';
  export const themedKey = createAttachmentKey();
</script>

<script lang="ts">
  import { setContext } from 'svelte';

  let { theme = 'light', children } = $props();

  // The attachment function closes over the reactive `theme` prop
  setContext(themedKey, (node: HTMLElement) => {
    // This re-runs when `theme` changes because it reads a reactive value
    node.dataset.theme = theme;
    node.style.backgroundColor = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    node.style.color = theme === 'dark' ? '#ffffff' : '#1a1a1a';
    node.style.transition = 'background-color 0.3s, color 0.3s';
  });
</script>

{@render children()}
```

```svelte
<script lang="ts">
  import ThemeProvider, { themedKey } from './ThemeProvider.svelte';
  let dark = $state(false);
</script>

<ThemeProvider theme={dark ? 'dark' : 'light'}>
  <div {...{ [themedKey]: true }} class="p-8 rounded-lg">
    <p>This element follows the theme!</p>
    <button onclick={() => dark = !dark}>Toggle Theme</button>
  </div>
</ThemeProvider>
```

## Converting Actions to Attachments with fromAction()

If you have existing Svelte actions (functions designed for the `use:` directive) and want to use them as attachments, `fromAction()` provides a direct conversion path. This is especially valuable for library authors who already ship action-based APIs and want to support the attachment model without rewriting everything from scratch.

### Basic Conversion

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

### How fromAction() Bridges the APIs

`fromAction()` takes an action function and returns a function that produces an attachment. The bridge handles three things:

1. **Mount:** It calls the action with the node and the parameter, storing the return value.
2. **Update:** When reactive dependencies change, it calls the action's `update()` method (if present) with the new parameter.
3. **Cleanup:** When the attachment cleans up (re-run or unmount), it calls the action's `destroy()` method.

This means you get the reactivity benefits of attachments while reusing your existing action code.

### Converting Actions with Complex Parameters

```typescript
// An action with an options object
export function tooltip(node: HTMLElement, options: { text: string; position: 'top' | 'bottom' }) {
  // ... implementation
  return {
    update(newOptions: typeof options) { /* ... */ },
    destroy() { /* ... */ }
  };
}
```

```svelte
<script lang="ts">
  import { fromAction } from 'svelte';
  import { tooltip } from './actions.js';

  const tooltipAttachment = fromAction(tooltip);
  let position = $state<'top' | 'bottom'>('top');
</script>

<!-- The parameter is reactive — when `position` changes,
     fromAction calls the original action's update() method -->
<button {@attach tooltipAttachment({ text: 'Hello', position })}>
  Hover me
</button>

<button onclick={() => position = position === 'top' ? 'bottom' : 'top'}>
  Toggle Position
</button>
```

### When to Convert vs Rewrite

Use `fromAction()` when:
- You have a large library of battle-tested actions
- You want to gradually migrate to attachments
- You need to use an action in a context where `use:` is not available (e.g., inside a component that receives elements via snippets)

Rewrite as a native attachment when:
- The action is simple and benefits from direct reactive access
- You do not need to support both `use:` and `{@attach}` APIs
- The action's `update()` logic is complex and would be simpler as a re-run

## Attachment Composition

Multiple attachments compose naturally on the same element, just like multiple actions:

```svelte
<script lang="ts">
  let fontSize = $state(16);
  let bgColor = $state('#f0f0f0');
  let rotation = $state(0);
</script>

<!-- Multiple attachments on one element -->
<div
  {@attach (node) => {
    node.style.fontSize = `${fontSize}px`;
  }}
  {@attach (node) => {
    node.style.backgroundColor = bgColor;
  }}
  {@attach (node) => {
    node.style.transform = `rotate(${rotation}deg)`;
    node.style.transition = 'transform 0.3s ease';
  }}
>
  Multiple attachments, each handling one concern
</div>
```

Each attachment runs independently and has its own reactive scope. Changing `fontSize` only re-runs the first attachment, not the others. This is efficient — Svelte tracks dependencies per attachment, not per element.

### Composing Attachments with Utility Functions

For reusable attachment logic that is not complex enough to warrant a full action, create helper functions that return attachment functions:

```svelte
<script lang="ts">
  // Reusable attachment factories
  function withStyle(styles: () => Record<string, string>) {
    return (node: HTMLElement) => {
      const s = styles();
      Object.assign(node.style, s);
    };
  }

  function withClass(classes: () => string) {
    return (node: HTMLElement) => {
      const cls = classes();
      node.className = cls;
    };
  }

  function onResize(callback: (entry: ResizeObserverEntry) => void) {
    return (node: HTMLElement) => {
      const observer = new ResizeObserver(([entry]) => callback(entry));
      observer.observe(node);
      return () => observer.disconnect();
    };
  }

  let width = $state(0);
  let color = $state('#3498db');
</script>

<div
  {@attach withStyle(() => ({
    backgroundColor: color,
    padding: '16px',
    borderRadius: '8px',
    color: '#fff'
  }))}
  {@attach onResize((entry) => {
    width = Math.round(entry.contentRect.width);
  })}
>
  This div is {width}px wide
</div>

<input type="color" bind:value={color} />
```

These factory functions give you the reusability of actions with the reactivity of attachments. They are regular functions that return attachment functions — no special API needed.

## Reactive Attachments in Depth

Understanding exactly when attachments re-run is critical for performance. The rules are identical to `$effect`:

1. **Synchronous reads are tracked.** If your attachment reads `$state` or `$derived` values synchronously during execution, those become dependencies.
2. **Async reads are NOT tracked.** Reads inside `setTimeout`, `Promise.then`, or event handlers are not tracked.
3. **Conditional reads create conditional dependencies.** If you read a value inside an `if` block, it is only a dependency when that branch executes.

```svelte
<script lang="ts">
  let x = $state(0);
  let y = $state(0);
  let showBorder = $state(false);
</script>

<div {@attach (node) => {
  // x and y are always dependencies
  node.style.transform = `translate(${x}px, ${y}px)`;

  // showBorder is always a dependency, but borderColor
  // is only a dependency when showBorder is true
  if (showBorder) {
    node.style.border = `2px solid red`;
  } else {
    node.style.border = 'none';
  }
}}>
  Move me
</div>
```

### Avoiding Unnecessary Re-runs

If your attachment has expensive setup logic that should not re-run on every dependency change, split it into a setup phase (using the node directly) and a reactive phase (reading state):

```svelte
<script lang="ts">
  let volume = $state(0.5);
  let playing = $state(false);
</script>

<audio
  src="/music.mp3"
  {@attach (node) => {
    // Expensive setup — only runs once when the element mounts
    const audioContext = new AudioContext();
    const source = audioContext.createMediaElementSource(node);
    const gainNode = audioContext.createGain();
    source.connect(gainNode).connect(audioContext.destination);

    // Reactive updates — run whenever volume or playing changes
    // Because these read $state, Svelte tracks them
    // But the setup above does NOT re-run because it does not read $state
    $effect(() => {
      gainNode.gain.value = volume;
    });

    $effect(() => {
      if (playing) node.play();
      else node.pause();
    });

    return () => {
      audioContext.close();
    };
  }}
></audio>
```

Wait — you cannot nest `$effect` inside an attachment in real Svelte code. The point here is architectural: if you need to separate one-time setup from reactive updates, use an action instead, or extract the reactive logic into a separate `$effect` in the `<script>` block.

## Attachments with Snippets

Attachments work inside snippets, which is useful for render delegation patterns:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { renderItem }: { renderItem: Snippet<[{ name: string; highlighted: boolean }]> } = $props();

  const items = [
    { name: 'Apple', highlighted: true },
    { name: 'Banana', highlighted: false },
    { name: 'Cherry', highlighted: true }
  ];
</script>

{#each items as item}
  {@render renderItem(item)}
{/each}
```

The consumer can use attachments in the snippet:

```svelte
<script lang="ts">
  import List from './List.svelte';
</script>

<List>
  {#snippet renderItem(item)}
    <li {@attach (node) => {
      if (item.highlighted) {
        node.style.backgroundColor = '#fef3c7';
        node.style.fontWeight = 'bold';
      }
    }}>
      {item.name}
    </li>
  {/snippet}
</List>
```

## Complete Example: Interactive Dashboard Card

Combining multiple attachment patterns in a real-world component:

```svelte
<script lang="ts">
  let expanded = $state(false);
  let dragOffset = $state({ x: 0, y: 0 });
  let cardWidth = $state(0);

  function makeDraggable(node: HTMLElement) {
    let startX = 0;
    let startY = 0;
    let dragging = false;

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      startX = e.clientX - dragOffset.x;
      startY = e.clientY - dragOffset.y;
      node.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragging) return;
      dragOffset = { x: e.clientX - startX, y: e.clientY - startY };
    }

    function onPointerUp() {
      dragging = false;
    }

    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerUp);

    return () => {
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerUp);
    };
  }
</script>

<div
  class="dashboard-card"
  {@attach (node) => {
    // Position from drag state
    node.style.transform = `translate(${dragOffset.x}px, ${dragOffset.y}px)`;
  }}
  {@attach (node) => {
    // Expanded/collapsed state
    node.style.maxHeight = expanded ? '500px' : '120px';
    node.style.overflow = 'hidden';
    node.style.transition = 'max-height 0.3s ease';
  }}
  {@attach makeDraggable}
  {@attach (node) => {
    // Track width for responsive behavior
    const observer = new ResizeObserver(([entry]) => {
      cardWidth = entry.contentRect.width;
    });
    observer.observe(node);
    return () => observer.disconnect();
  }}
>
  <div class="card-header" style="cursor: grab;">
    <h3>Revenue</h3>
    <span class="text-sm text-gray-500">
      {cardWidth > 300 ? 'Detailed View' : 'Compact'}
    </span>
  </div>

  <div class="card-body">
    <p class="text-2xl font-bold">$12,450</p>
    <button onclick={() => expanded = !expanded}>
      {expanded ? 'Collapse' : 'Expand'}
    </button>
  </div>

  {#if expanded}
    <div class="card-details">
      <p>Monthly breakdown, charts, and detailed metrics go here.</p>
    </div>
  {/if}
</div>
```

This example shows four attachments on a single element, each handling a separate concern: positioning, expand/collapse animation, drag behavior, and size tracking. They compose cleanly because each operates independently.

## Try It

1. Create a component with an `<input>` and a `<div>`. Use an attachment on the `<div>` that reads the input's bound value and sets the div's `textContent`. Adjust the background color based on text length: green for 0-10 characters, yellow for 11-30, red for 31+. Verify that the attachment re-runs reactively as you type.

2. Build a `ThemeProvider` component using `createAttachmentKey()` that provides a theming attachment via context. Child elements that spread the key should automatically receive background and text colors that match the current theme. Add a toggle button to switch between light and dark modes and verify all themed elements update.

3. Take the `tooltip` action from the previous lesson and convert it to an attachment using `fromAction()`. Use it on several elements and verify that the tooltip text updates reactively when a `$state` value changes (something the original action required `update()` for).

4. Create a canvas drawing component that uses an attachment to render a visualization. The visualization should reactively update when sliders control parameters like hue, number of shapes, and animation speed. Include cleanup logic to cancel any `requestAnimationFrame` loops.

## Key Takeaways

- Attachments use `{@attach (node) => { ... }}` to run code when an element mounts — they are reactive effects scoped to a DOM element's lifetime
- They are fully reactive — they automatically re-run when any `$state` or `$derived` they read changes, with the same dependency tracking rules as `$effect`
- Return a cleanup function to tear down side effects before re-running or on unmount — same pattern as `$effect`
- Actions are better for reusable, shareable DOM behaviors exported from separate files; attachments are better for one-off, inline DOM manipulation tightly coupled to component state
- Multiple attachments compose naturally on the same element, each with its own independent reactive scope
- Attachment helper functions (factories that return attachment functions) give you reusability without the ceremony of a full action
- `createAttachmentKey()` (Svelte 5.29+) creates a unique symbol key for spreading attachments onto elements programmatically via props or context — enabling inversion of control patterns for design systems and provider components
- `fromAction()` converts existing `use:` directive actions into attachments, providing a migration path for libraries with action-based APIs; it bridges `destroy()`/`update()` to the cleanup function model
- Attachments work inside snippets, enabling render delegation patterns where the consumer controls DOM behavior
- Attachments follow the same cleanup pattern as `$effect` — return a function, not an object with `destroy()`
