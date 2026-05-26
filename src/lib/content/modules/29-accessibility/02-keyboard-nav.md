# Keyboard Navigation

Many users navigate entirely with a keyboard — people with motor disabilities, power users who never leave the home row, screen reader users, and anyone whose mouse just stopped working. If your app only works with a mouse, you are locking out a significant portion of your audience. In the United States alone, approximately 8% of adults have a motor disability that affects their use of input devices.

Keyboard navigation follows a simple mental model: **Tab** moves focus between interactive elements, **Enter** and **Space** activate them, **Arrow keys** navigate within composite widgets, and **Escape** closes things. Your job is to make sure focus moves logically, is always visible, and never gets trapped in a dead end.

Getting keyboard navigation right is not just a compliance checkbox. It is a fundamental measure of your interface's quality. An app that handles keyboard navigation well has a clean, logical DOM structure, proper semantic HTML, and thoughtful interaction design. These same qualities make the app better for everyone.

## Focus Management Fundamentals

The browser maintains a single point of focus — one element at a time receives keyboard events. Understanding which elements are focusable by default and how to manage focus programmatically is the foundation of keyboard accessibility.

### Natively Focusable Elements

The browser automatically makes certain elements focusable without any extra attributes:

- `<a href="...">` — Links (only with an `href` attribute)
- `<button>` — Buttons
- `<input>`, `<textarea>`, `<select>` — Form controls
- `<details>` / `<summary>` — Disclosure widgets
- `<dialog>` — Dialog elements (when opened)
- Elements with `contenteditable`

These elements are focusable because users expect to interact with them via keyboard. They also have built-in keyboard behaviors — buttons respond to Enter and Space, links respond to Enter, checkboxes toggle with Space.

### Custom Interactive Elements

When you build interactive elements from non-interactive HTML (like `<div>` or `<span>`), you must add focus and keyboard support manually:

```svelte
<!-- BAD: looks like a button but is invisible to keyboard users -->
<div class="btn" onclick={handleClick}>
  Click me
</div>

<!-- GOOD: natively accessible, keyboard support built in -->
<button onclick={handleClick}>
  Click me
</button>

<!-- When you must use a div (rare), add ALL required attributes -->
<div
  role="button"
  tabindex="0"
  onclick={handleClick}
  onkeydown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Custom Button
</div>
```

The custom div approach requires `role="button"` (so screen readers announce it correctly), `tabindex="0"` (so Tab reaches it), and keyboard event handling (so Enter and Space activate it). That is three attributes to replicate what `<button>` gives you for free. Always prefer native elements.

## Tabindex Explained

The `tabindex` attribute controls keyboard focus behavior. There are exactly three useful values:

### tabindex="0" — Join the Natural Tab Order

Adds the element to the tab sequence based on its position in the DOM. Use this for custom interactive elements that should be reachable via Tab:

```svelte
<div role="button" tabindex="0" onclick={handleClick}>
  Custom interactive element
</div>
```

### tabindex="-1" — Focusable Only via JavaScript

Removes the element from the Tab sequence but allows it to receive focus programmatically via `.focus()`. Use this for elements that should be focused in response to an action but should not appear in the normal Tab flow:

```svelte
<script lang="ts">
  let errorBox: HTMLDivElement;

  function showError() {
    // Focus the error message so screen readers announce it
    errorBox.focus();
  }
</script>

<div tabindex="-1" bind:this={errorBox} role="alert">
  Please fix the errors below.
</div>
```

Common uses for `tabindex="-1"`:
- Error message containers that should be focused when errors appear
- Section headings that receive focus after navigation
- The `<main>` element for skip link targets
- Individual items in a roving tabindex pattern (see below)

### Positive tabindex — Never Use This

`tabindex="1"` or higher forces the element to the front of the tab order. This sounds useful but creates chaos:

```svelte
<!-- DON'T DO THIS — the user will tab to this before anything else on the page -->
<input tabindex="1" />

<!-- Then this... -->
<input tabindex="2" />

<!-- Then everything without tabindex -->
<button>Submit</button>
```

Positive tabindex overrides the natural DOM order. Maintaining it across a large application is impossible, and it confuses users who expect Tab to follow visual order. Every accessibility guideline explicitly warns against it.

## Focus Traps for Modals and Dialogs

When a modal dialog opens, focus must stay inside it. If a user Tabs past the last element in the modal, focus should wrap to the first element — not escape into the obscured content behind. This is called a **focus trap**.

### The Native Solution: `<dialog>` with showModal()

The HTML `<dialog>` element with `showModal()` provides built-in focus trapping, backdrop handling, and focus restoration. Always prefer this over custom implementations:

```svelte
<script lang="ts">
  let { open = $bindable(), onconfirm, oncancel }: {
    open: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  } = $props();

  let dialog: HTMLDialogElement;

  $effect(() => {
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  });

  function handleCancel() {
    open = false;
    oncancel();
  }

  function handleConfirm() {
    open = false;
    onconfirm();
  }
</script>

<dialog
  bind:this={dialog}
  onclose={() => open = false}
  oncancel={handleCancel}
>
  <h2>Confirm Deletion</h2>
  <p>This action cannot be undone. Are you sure you want to delete this item?</p>
  <footer>
    <button onclick={handleCancel}>Cancel</button>
    <button onclick={handleConfirm} class="danger">Delete</button>
  </footer>
</dialog>

<style>
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  dialog {
    border: none;
    border-radius: 8px;
    padding: 2rem;
    max-width: 480px;
    width: 90%;
  }

  footer {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }
</style>
```

What `showModal()` gives you for free:
- **Focus trapping** — Tab stays within the dialog
- **Focus restoration** — When the dialog closes, focus returns to the element that opened it
- **Backdrop** — The `::backdrop` pseudo-element prevents interaction with background content
- **Escape to close** — Pressing Escape fires the `cancel` event and closes the dialog
- **Inert background** — Content behind the dialog is marked inert (not focusable, not clickable)

### Building a Custom Focus Trap (When You Cannot Use `<dialog>`)

For non-dialog overlays (slide-out panels, drawers, custom dropdowns), you may need a manual focus trap:

```svelte
<script lang="ts">
  let { open, onclose }: { open: boolean; onclose: () => void } = $props();
  let panel: HTMLElement;
  let previousFocus: HTMLElement | null = null;

  $effect(() => {
    if (open) {
      // Remember what was focused before
      previousFocus = document.activeElement as HTMLElement;

      // Focus the first focusable element in the panel
      requestAnimationFrame(() => {
        const firstFocusable = panel.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      });
    } else if (previousFocus) {
      // Restore focus when closing
      previousFocus.focus();
      previousFocus = null;
    }
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      onclose();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusableElements = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift+Tab on first element → wrap to last
      if (document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab on last element → wrap to first
      if (document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={onclose}></div>
  <aside
    bind:this={panel}
    role="dialog"
    aria-modal="true"
    aria-label="Settings panel"
    onkeydown={handleKeydown}
  >
    <h2>Settings</h2>
    <label>
      Theme
      <select>
        <option>Light</option>
        <option>Dark</option>
        <option>System</option>
      </select>
    </label>
    <label>
      <input type="checkbox" /> Enable notifications
    </label>
    <button onclick={onclose}>Close</button>
  </aside>
{/if}
```

The focus trap pattern has four critical parts:
1. **Save the previous focus** before opening
2. **Move focus into the container** when it opens
3. **Trap Tab and Shift+Tab** to cycle within the container
4. **Restore focus** to the previous element when closing

## Skip Links

On pages with large navigation menus, keyboard users should not have to Tab through dozens of links to reach the main content. A **skip link** is a hidden link that becomes visible on focus and jumps directly to the main content:

```svelte
<!-- src/routes/+layout.svelte -->
<a href="#main-content" class="skip-link">Skip to main content</a>

<nav aria-label="Main navigation">
  <a href="/">Home</a>
  <a href="/products">Products</a>
  <a href="/about">About</a>
  <a href="/blog">Blog</a>
  <a href="/contact">Contact</a>
  <!-- Imagine 10 more links here -->
</nav>

<main id="main-content" tabindex="-1">
  {@render children()}
</main>

<style>
  .skip-link {
    position: absolute;
    top: -100%;
    left: 16px;
    padding: 12px 24px;
    background: #1a1a2e;
    color: #fff;
    font-weight: 600;
    text-decoration: none;
    border-radius: 0 0 8px 8px;
    z-index: 10000;
    transition: top 0.2s ease;
  }

  .skip-link:focus {
    top: 0;
  }
</style>
```

The skip link is the first focusable element on the page. When a user presses Tab, it appears. Pressing Enter jumps focus to `<main>`. The `tabindex="-1"` on `<main>` makes it focusable via the hash link but does not add it to the Tab order.

### Multiple Skip Links

Complex pages may need multiple skip targets:

```svelte
<div class="skip-links">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <a href="#search" class="skip-link">Skip to search</a>
  <a href="#footer-nav" class="skip-link">Skip to footer navigation</a>
</div>
```

## Roving Tabindex for Composite Widgets

In composite widgets like tab panels, menus, and toolbars, only one item should be in the Tab order at a time. Arrow keys move between items within the widget, and Tab moves focus out of the widget entirely. This is called the **roving tabindex** pattern.

The concept: one item has `tabindex="0"` (the active one), all others have `tabindex="-1"`. When the user presses an arrow key, move `tabindex="0"` to the next item and focus it.

### Tab Panel Example

```svelte
<script lang="ts">
  let tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'features', label: 'Features' },
    { id: 'pricing', label: 'Pricing' },
    { id: 'reviews', label: 'Reviews' }
  ];

  let activeTab = $state(0);
  let tabRefs: HTMLButtonElement[] = [];

  function handleTabKeydown(event: KeyboardEvent, index: number) {
    let newIndex = index;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        newIndex = (index + 1) % tabs.length;
        break;
      case 'ArrowLeft':
        event.preventDefault();
        newIndex = (index - 1 + tabs.length) % tabs.length;
        break;
      case 'Home':
        event.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return; // Do not update for other keys
    }

    activeTab = newIndex;
    tabRefs[newIndex]?.focus();
  }
</script>

<div role="tablist" aria-label="Product information">
  {#each tabs as tab, i}
    <button
      role="tab"
      id="tab-{tab.id}"
      aria-selected={i === activeTab}
      aria-controls="panel-{tab.id}"
      tabindex={i === activeTab ? 0 : -1}
      bind:this={tabRefs[i]}
      onclick={() => activeTab = i}
      onkeydown={(e) => handleTabKeydown(e, i)}
    >
      {tab.label}
    </button>
  {/each}
</div>

{#each tabs as tab, i}
  <div
    role="tabpanel"
    id="panel-{tab.id}"
    aria-labelledby="tab-{tab.id}"
    hidden={i !== activeTab}
    tabindex="0"
  >
    <p>Content for {tab.label} tab.</p>
  </div>
{/each}
```

Key details in this implementation:
- `role="tablist"` on the container, `role="tab"` on each button, `role="tabpanel"` on each panel
- `aria-selected` indicates the active tab
- `aria-controls` links each tab to its panel
- Only the active tab has `tabindex="0"` — pressing Tab from the tab list moves focus to the panel content, not the next tab
- `ArrowLeft` / `ArrowRight` navigate between tabs (wrapping at the ends)
- `Home` / `End` jump to the first / last tab

### Menu Navigation

Vertical menus use `ArrowUp` / `ArrowDown` instead of left/right:

```svelte
<script lang="ts">
  let items = [
    { label: 'Edit', action: () => console.log('edit') },
    { label: 'Duplicate', action: () => console.log('duplicate') },
    { label: 'Archive', action: () => console.log('archive') },
    { label: 'Delete', action: () => console.log('delete') }
  ];

  let activeIndex = $state(0);
  let itemRefs: HTMLElement[] = [];

  function handleKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        itemRefs[activeIndex]?.focus();
        break;
      case 'ArrowUp':
        event.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        itemRefs[activeIndex]?.focus();
        break;
      case 'Home':
        event.preventDefault();
        activeIndex = 0;
        itemRefs[0]?.focus();
        break;
      case 'End':
        event.preventDefault();
        activeIndex = items.length - 1;
        itemRefs[items.length - 1]?.focus();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        items[activeIndex].action();
        break;
    }
  }
</script>

<ul role="menu" onkeydown={handleKeydown}>
  {#each items as item, i}
    <li
      role="menuitem"
      tabindex={i === activeIndex ? 0 : -1}
      bind:this={itemRefs[i]}
      onclick={item.action}
    >
      {item.label}
    </li>
  {/each}
</ul>
```

## Focus-Visible vs Focus

When a user clicks a button, the browser shows a focus ring around it. Many designers find this ugly and remove it — breaking keyboard navigation. The `:focus-visible` pseudo-class solves this by showing the focus ring only for keyboard navigation:

```css
/* BAD — removes all focus indicators */
*:focus {
  outline: none;
}

/* GOOD — custom style only for keyboard users */
*:focus-visible {
  outline: 3px solid #4f46e5;
  outline-offset: 2px;
  border-radius: 4px;
}

/* Hide the outline for mouse/touch users */
*:focus:not(:focus-visible) {
  outline: none;
}
```

The browser uses heuristics to determine when `:focus-visible` applies:
- **Keyboard navigation** (Tab, Shift+Tab) — `:focus-visible` matches
- **Mouse click** on a button — `:focus-visible` does not match
- **Mouse click** on an input — `:focus-visible` matches (because the user will type)

### Designing Good Focus Indicators

A focus indicator must be visible on all backgrounds. A thin blue outline works on white but disappears on blue. Use a combination of outline and offset:

```css
:focus-visible {
  outline: 3px solid #4f46e5;
  outline-offset: 3px;
  border-radius: 4px;
}

/* For dark backgrounds */
.dark :focus-visible {
  outline-color: #93c5fd;
}

/* High contrast mode support */
@media (forced-colors: active) {
  :focus-visible {
    outline: 3px solid CanvasText;
  }
}
```

WCAG 2.2 (Level AA) requires that focus indicators have a contrast ratio of at least 3:1 against adjacent colors and are at least 2px thick. The `outline-offset` creates a gap between the element and the outline, which helps the indicator stand out on any background.

## Managing Focus During SvelteKit Navigation

SvelteKit uses client-side navigation — when the user clicks a link, the page content changes without a full page reload. This creates a focus management challenge: after navigation, where should focus go?

By default, SvelteKit moves focus to the `<body>` element after navigation, which means the next Tab press starts from the top of the page. This is usually correct, but you can customize it:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { afterNavigate } from '$app/navigation';

  let mainContent: HTMLElement;

  afterNavigate(() => {
    // Move focus to main content after navigation
    // This skips the header/nav on every page change
    mainContent?.focus();
  });
</script>

<nav>
  <a href="/">Home</a>
  <a href="/products">Products</a>
</nav>

<main bind:this={mainContent} tabindex="-1">
  {@render children()}
</main>
```

### Announcing Route Changes

Screen readers may not announce client-side navigation. Add a live region that announces the new page:

```svelte
<script lang="ts">
  import { page } from '$app/state';

  let announcement = $derived(`Navigated to ${$page.url.pathname}`);
</script>

<!-- Visually hidden but announced by screen readers -->
<div
  role="status"
  aria-live="polite"
  aria-atomic="true"
  class="sr-only"
>
  {announcement}
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }
</style>
```

## Building an Accessible Dropdown Menu: Step by Step

Let me walk through building a complete, accessible dropdown menu from scratch. This is one of the most common custom widgets and one of the most commonly broken:

```svelte
<!-- src/lib/components/DropdownMenu.svelte -->
<script lang="ts">
  import { tick } from 'svelte';

  type MenuItem = {
    label: string;
    action: () => void;
    disabled?: boolean;
  };

  let { label, items }: { label: string; items: MenuItem[] } = $props();

  let open = $state(false);
  let activeIndex = $state(-1);
  let triggerRef: HTMLButtonElement;
  let menuRef: HTMLUListElement;
  let itemRefs: HTMLLIElement[] = [];

  async function openMenu() {
    open = true;
    activeIndex = 0;
    await tick(); // Wait for DOM to update
    itemRefs[0]?.focus();
  }

  function closeMenu() {
    open = false;
    activeIndex = -1;
    triggerRef?.focus(); // Return focus to trigger
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        event.preventDefault();
        openMenu();
        break;
      case 'ArrowUp':
        event.preventDefault();
        open = true;
        activeIndex = items.length - 1;
        tick().then(() => itemRefs[activeIndex]?.focus());
        break;
    }
  }

  function handleMenuKeydown(event: KeyboardEvent) {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        activeIndex = (activeIndex + 1) % items.length;
        // Skip disabled items
        while (items[activeIndex]?.disabled) {
          activeIndex = (activeIndex + 1) % items.length;
        }
        itemRefs[activeIndex]?.focus();
        break;

      case 'ArrowUp':
        event.preventDefault();
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        while (items[activeIndex]?.disabled) {
          activeIndex = (activeIndex - 1 + items.length) % items.length;
        }
        itemRefs[activeIndex]?.focus();
        break;

      case 'Home':
        event.preventDefault();
        activeIndex = items.findIndex(item => !item.disabled);
        itemRefs[activeIndex]?.focus();
        break;

      case 'End':
        event.preventDefault();
        for (let i = items.length - 1; i >= 0; i--) {
          if (!items[i].disabled) {
            activeIndex = i;
            break;
          }
        }
        itemRefs[activeIndex]?.focus();
        break;

      case 'Escape':
        event.preventDefault();
        closeMenu();
        break;

      case 'Tab':
        // Close menu on Tab (focus moves naturally)
        closeMenu();
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (!items[activeIndex]?.disabled) {
          items[activeIndex].action();
          closeMenu();
        }
        break;

      default:
        // Type-ahead: jump to item starting with typed character
        if (event.key.length === 1) {
          const char = event.key.toLowerCase();
          const startIndex = (activeIndex + 1) % items.length;
          for (let i = 0; i < items.length; i++) {
            const index = (startIndex + i) % items.length;
            if (items[index].label.toLowerCase().startsWith(char) && !items[index].disabled) {
              activeIndex = index;
              itemRefs[index]?.focus();
              break;
            }
          }
        }
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (open && !triggerRef.contains(event.target as Node) && !menuRef?.contains(event.target as Node)) {
      closeMenu();
    }
  }
</script>

<svelte:document onclick={handleClickOutside} />

<div class="dropdown">
  <button
    bind:this={triggerRef}
    aria-haspopup="true"
    aria-expanded={open}
    onclick={() => open ? closeMenu() : openMenu()}
    onkeydown={handleTriggerKeydown}
  >
    {label}
    <span aria-hidden="true">{open ? '▲' : '▼'}</span>
  </button>

  {#if open}
    <ul
      role="menu"
      bind:this={menuRef}
      onkeydown={handleMenuKeydown}
    >
      {#each items as item, i}
        <li
          role="menuitem"
          tabindex={i === activeIndex ? 0 : -1}
          aria-disabled={item.disabled || undefined}
          bind:this={itemRefs[i]}
          onclick={() => {
            if (!item.disabled) {
              item.action();
              closeMenu();
            }
          }}
        >
          {item.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
    display: inline-block;
  }

  ul {
    position: absolute;
    top: 100%;
    left: 0;
    margin: 4px 0 0;
    padding: 4px 0;
    list-style: none;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    min-width: 180px;
    z-index: 50;
  }

  li {
    padding: 8px 16px;
    cursor: pointer;
  }

  li:hover,
  li:focus-visible {
    background: #f1f5f9;
    outline: none;
  }

  li[aria-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

This dropdown handles every keyboard interaction required by the WAI-ARIA Menu pattern:
- **Enter/Space/ArrowDown** on the trigger opens the menu and focuses the first item
- **ArrowUp** on the trigger opens the menu and focuses the last item
- **ArrowDown/ArrowUp** in the menu navigates between items (skipping disabled ones)
- **Home/End** jump to the first/last item
- **Escape** closes the menu and returns focus to the trigger
- **Tab** closes the menu and moves focus to the next focusable element
- **Enter/Space** on an item activates it and closes the menu
- **Type-ahead** — typing a character jumps to the next item starting with that letter
- **Click outside** closes the menu
- `aria-haspopup` and `aria-expanded` communicate state to screen readers
- `aria-disabled` marks disabled items without removing them from the navigation

## Building an Accessible Modal with Focus Trap

Here is a complete modal component that does not use `<dialog>` (for cases where you need custom styling or behavior that `<dialog>` does not support):

```svelte
<!-- src/lib/components/Modal.svelte -->
<script lang="ts">
  import { tick } from 'svelte';

  let {
    open = $bindable(),
    title,
    children,
    onclose
  }: {
    open: boolean;
    title: string;
    children: any;
    onclose?: () => void;
  } = $props();

  let modalRef: HTMLDivElement;
  let previousFocus: HTMLElement | null = null;
  let titleId = `modal-title-${Math.random().toString(36).slice(2)}`;

  $effect(() => {
    if (open) {
      previousFocus = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden'; // Prevent background scrolling

      tick().then(() => {
        // Focus the first focusable element, or the modal itself
        const focusable = getFocusableElements();
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef?.focus();
        }
      });
    } else {
      document.body.style.overflow = '';
      if (previousFocus) {
        previousFocus.focus();
        previousFocus = null;
      }
    }
  });

  function getFocusableElements(): HTMLElement[] {
    if (!modalRef) return [];
    return Array.from(
      modalRef.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function close() {
    open = false;
    onclose?.();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close}></div>
  <div
    bind:this={modalRef}
    role="dialog"
    aria-modal="true"
    aria-labelledby={titleId}
    tabindex="-1"
    onkeydown={handleKeydown}
    class="modal"
  >
    <header>
      <h2 id={titleId}>{title}</h2>
      <button onclick={close} aria-label="Close dialog" class="close-btn">
        &times;
      </button>
    </header>
    <div class="content">
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 100;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: white;
    border-radius: 12px;
    padding: 0;
    max-width: 560px;
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
    z-index: 101;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem 1.5rem 0;
  }

  .content {
    padding: 1rem 1.5rem 1.5rem;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: #f1f5f9;
  }
</style>
```

## Keyboard Shortcuts with Modifier Keys

Some applications provide keyboard shortcuts for power users. Implement them carefully — do not override browser defaults, and always make them discoverable:

```svelte
<script lang="ts">
  import { browser } from '$app/environment';

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Use Ctrl (Windows/Linux) or Cmd (Mac)
    const modifier = event.metaKey || event.ctrlKey;

    if (modifier && event.key === 'k') {
      event.preventDefault();
      openSearchPalette();
    }

    if (modifier && event.key === '/') {
      event.preventDefault();
      openShortcutsHelp();
    }

    // Single-key shortcuts (only when not in an input)
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (!isInput) {
      if (event.key === '?') openShortcutsHelp();
      if (event.key === 'g' && !modifier) {
        // Wait for next key (go to...)
        waitForNextKey((key) => {
          if (key === 'h') goto('/');
          if (key === 'p') goto('/products');
          if (key === 's') goto('/settings');
        });
      }
    }
  }
</script>

{#if browser}
  <svelte:document onkeydown={handleGlobalKeydown} />
{/if}
```

**Rules for keyboard shortcuts**:
- Never override browser shortcuts (`Ctrl+T`, `Ctrl+W`, `Ctrl+L`, etc.)
- Do not trigger shortcuts when focus is in a text input
- Always provide a way to discover shortcuts (a help dialog, a "?" shortcut)
- Make shortcuts optional — every action must also be available through the regular UI
- Use common conventions: `Ctrl+K` for search, `Escape` to close, `?` for help

## Try It

### Exercise 1: Accessible Tabs Component

Build a tab interface with three tabs ("Description", "Specifications", "Reviews"). Implement the full roving tabindex pattern: Arrow keys navigate between tabs, Home/End jump to first/last, Enter/Space activate a tab, and Tab moves focus from the tab list to the active panel content. Verify that each tab has `role="tab"`, `aria-selected`, and `aria-controls`, and each panel has `role="tabpanel"` and `aria-labelledby`.

### Exercise 2: Focus Management After Dynamic Content

Build a "Load More" button at the bottom of a product list. When clicked, it fetches more products and appends them to the list. After loading, move focus to the first newly added product so keyboard users do not lose their place. Ensure the focus indicator is visible and the screen reader announces "5 more products loaded".

### Exercise 3: Accessible Combobox (Autocomplete)

Build a search input with an autocomplete dropdown. When the user types, a list of suggestions appears. Arrow keys navigate the suggestions, Enter selects one, and Escape closes the dropdown. Use `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, and `aria-activedescendant` to communicate state to screen readers.

## Key Takeaways

- All interactive elements must be reachable and usable with a keyboard alone — this is a WCAG Level A requirement
- Use native HTML elements (`<button>`, `<a>`, `<input>`) whenever possible — they provide keyboard support for free
- `tabindex="0"` adds custom elements to the tab order; `tabindex="-1"` makes them programmatically focusable; never use positive tabindex values
- The native `<dialog>` element with `showModal()` provides built-in focus trapping, backdrop, Escape-to-close, and focus restoration
- Skip links let keyboard users bypass navigation menus — make them the first focusable element on the page
- The roving tabindex pattern (`tabindex="0"` on the active item, `tabindex="-1"` on all others) is the standard approach for composite widgets like tabs, menus, and toolbars
- `:focus-visible` shows focus indicators only for keyboard navigation, preserving visual cleanliness for mouse users while ensuring keyboard users always see where focus is
- After SvelteKit client-side navigation, manage focus explicitly — move it to the main content area and announce the route change for screen readers
- Always restore focus to the trigger element when closing modals, dropdowns, and overlays
- Handle `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, `Space`, `Escape`, `Home`, `End`, and `Tab` for custom widgets
