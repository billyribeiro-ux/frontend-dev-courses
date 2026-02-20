# Keyboard Navigation

Many users navigate entirely with a keyboard — people with motor disabilities, power users, and anyone whose mouse just stopped working. If your app only works with a mouse, you are locking out a significant portion of your audience.

Keyboard navigation follows a simple model: the **Tab** key moves focus between interactive elements, **Enter** and **Space** activate them, and **Escape** closes things. Your job is to make sure focus moves logically, is always visible, and never gets trapped.

## Focus Management

The browser automatically makes certain elements focusable: links, buttons, inputs, selects, and textareas. Custom interactive elements need help:

```svelte
<!-- Native elements are focusable by default -->
<button>Click me</button>
<a href="/about">About</a>
<input type="text" />

<!-- Custom elements need tabindex -->
<div
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => e.key === 'Enter' && handleClick()}
>
  Custom Button
</div>
```

## Tabindex Explained

The `tabindex` attribute controls keyboard focus behavior:

- `tabindex="0"` — Adds the element to the natural tab order (based on DOM position)
- `tabindex="-1"` — Makes the element focusable via JavaScript but not via Tab key
- `tabindex="1"` or higher — **Avoid this!** It forces a specific tab order and creates confusion

```svelte
<!-- Programmatically focusable (for dialogs, error messages) -->
<div tabindex="-1" bind:this={errorBox}>
  Please fix the errors below.
</div>

<script>
  let errorBox: HTMLDivElement;

  function showError() {
    errorBox.focus(); // Moves focus here on error
  }
</script>
```

## Focus Traps for Modals

When a modal dialog opens, focus must stay inside it. Users should not be able to Tab into the content behind the modal:

```svelte
<script lang="ts">
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();
  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open) {
      dialog.showModal(); // Native <dialog> traps focus automatically
    } else {
      dialog.close();
    }
  });
</script>

<dialog bind:this={dialog} onclose={onclose}>
  <h2>Confirm Action</h2>
  <p>Are you sure you want to continue?</p>
  <div>
    <button onclick={onclose}>Cancel</button>
    <button onclick={() => { /* confirm */ onclose(); }}>Confirm</button>
  </div>
</dialog>
```

The native `<dialog>` element with `showModal()` handles focus trapping automatically. It also returns focus to the previously focused element when closed. Use this instead of building your own focus trap.

## Skip Links

On pages with large navigation menus, keyboard users should not have to Tab through every link to reach the main content:

```svelte
<!-- src/routes/+layout.svelte -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<nav>
  <!-- Many navigation links -->
</nav>

<main id="main-content" tabindex="-1">
  <slot />
</main>

<style>
  .skip-link {
    position: absolute;
    top: -100%;
    left: 0;
    padding: 8px 16px;
    background: #000;
    color: #fff;
    z-index: 100;
  }

  .skip-link:focus {
    top: 0;
  }
</style>
```

The link is invisible until the user Tabs to it, then it appears at the top of the page.

## Keyboard Event Handlers

When building custom interactive elements, handle keyboard events properly:

```svelte
<script lang="ts">
  let items = ['Home', 'Products', 'About', 'Contact'];
  let activeIndex = $state(0);

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        activeIndex = 0;
        break;
      case 'End':
        activeIndex = items.length - 1;
        break;
    }
  }
</script>

<ul role="listbox" onkeydown={handleKeydown}>
  {#each items as item, i}
    <li
      role="option"
      aria-selected={i === activeIndex}
      tabindex={i === activeIndex ? 0 : -1}
    >
      {item}
    </li>
  {/each}
</ul>
```

## Visible Focus Indicators

Never remove focus outlines without providing an alternative. Users need to see where focus is:

```css
/* Bad: removes all focus indicators */
*:focus { outline: none; }

/* Good: custom focus style */
*:focus-visible {
  outline: 2px solid #4f46e5;
  outline-offset: 2px;
  border-radius: 2px;
}
```

The `:focus-visible` pseudo-class shows the outline only for keyboard navigation, not for mouse clicks.

## Try It

Build an accessible dropdown menu. It should open with Enter or Space, allow arrow keys to navigate between items, close with Escape, and return focus to the trigger button when closed. Make sure focus is visible at all times.

## Key Takeaways

- All interactive elements must be reachable and usable with a keyboard alone
- Use `tabindex="0"` to add custom elements to the tab order; use `tabindex="-1"` for programmatic focus
- The native `<dialog>` element with `showModal()` provides built-in focus trapping
- Skip links help keyboard users bypass repetitive navigation
- Always provide visible focus indicators — `:focus-visible` shows them only for keyboard users
- Handle `ArrowUp`, `ArrowDown`, `Enter`, `Escape`, and `Home`/`End` keys for custom widgets
