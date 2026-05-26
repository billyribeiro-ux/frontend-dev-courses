# Window & Document

Most of the time you work with elements inside your component. But some events and data live at a higher level — the browser window, the document, or the body. Scroll position, keyboard shortcuts, screen size, online/offline status, device pixel ratio — these are all window- or document-level concerns that every non-trivial application must handle.

Svelte provides four special elements that let you interact with these global objects declaratively: `<svelte:window>`, `<svelte:document>`, `<svelte:body>`, and `<svelte:head>`. No manual `addEventListener` calls, no `onMount` cleanup, no forgotten `removeEventListener` memory leaks. The compiler generates the setup and teardown code for you.

Understanding these elements deeply is essential for building responsive layouts, keyboard-driven interfaces, scroll-aware components, offline-capable applications, and SEO-optimized pages.

## svelte:window — Events

The `<svelte:window>` element lets you listen to events on the `window` object. It accepts any event handler you would normally pass to `window.addEventListener`, but with Svelte's `on` prefix syntax:

```svelte
<script lang="ts">
  let key = $state('');
  let keyCode = $state(0);
</script>

<svelte:window onkeydown={(e) => {
  key = e.key;
  keyCode = e.keyCode;
}} />

<p>Last key pressed: <kbd>{key || 'none'}</kbd> (code: {keyCode})</p>
```

Svelte automatically adds the event listener when the component mounts and removes it when the component is destroyed. This is not just convenience — it eliminates an entire category of bugs. Consider what the manual equivalent looks like:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  let key = $state('');

  // You must handle setup AND teardown manually
  onMount(() => {
    const handler = (e: KeyboardEvent) => { key = e.key; };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
</script>
```

The declarative version is shorter, impossible to forget the cleanup, and expresses intent more clearly. The compiler also handles SSR correctly — `<svelte:window>` is a no-op on the server where there is no `window` object. The manual version would crash during SSR unless you guarded it with `if (typeof window !== 'undefined')`.

### Multiple Event Handlers

You can attach multiple event handlers to the same `<svelte:window>`:

```svelte
<script lang="ts">
  let lastEvent = $state('none');
  let isOnline = $state(true);
</script>

<svelte:window
  onkeydown={(e) => lastEvent = `keydown: ${e.key}`}
  onresize={() => lastEvent = 'resize'}
  ononline={() => isOnline = true}
  onoffline={() => isOnline = false}
/>

<p>Last event: {lastEvent}</p>
<p>Status: {isOnline ? 'Online' : 'Offline'}</p>
```

You can also have multiple `<svelte:window>` elements in a single component. Svelte merges them. This can be useful when you want to keep concerns separated in the template, though in practice a single element with multiple handlers is more common.

### Event Modifiers and Options

Svelte supports event options via the `capture` and `passive` suffixes. For window events you sometimes need `capture` to intercept events before they reach child elements:

```svelte
<script lang="ts">
  // Capture phase — runs before any element handlers
  function handleKeyCapture(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // Close modals, dropdowns, etc. before anything else processes the event
      e.stopPropagation();
    }
  }
</script>

<svelte:window onkeydowncapture={handleKeyCapture} />
```

For scroll and touch events, the `passive` option tells the browser the handler will not call `preventDefault()`, allowing it to optimize scrolling performance:

```svelte
<svelte:window ontouchstartpassive={(e) => {
  // This handler cannot call e.preventDefault()
  // but the browser can start scrolling immediately
  console.log('Touch started');
}} />
```

## svelte:window — Bindings

Beyond events, `<svelte:window>` supports bindings to several window properties. These give you reactive access to browser state that updates automatically:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let outerWidth = $state(0);
  let outerHeight = $state(0);
  let scrollX = $state(0);
  let scrollY = $state(0);
  let online = $state(true);
  let devicePixelRatio = $state(1);
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  bind:outerWidth
  bind:outerHeight
  bind:scrollX
  bind:scrollY
  bind:online
  bind:devicePixelRatio
/>

<div class="status-bar">
  <span>Viewport: {innerWidth} x {innerHeight}</span>
  <span>Window: {outerWidth} x {outerHeight}</span>
  <span>Scroll: ({Math.round(scrollX)}, {Math.round(scrollY)})</span>
  <span>{online ? 'Online' : 'Offline'}</span>
  <span>DPR: {devicePixelRatio}</span>
</div>
```

Here is the complete list and what each binding does:

| Binding | Type | Two-way | Description |
|---------|------|---------|-------------|
| `innerWidth` | `number` | Read-only | Viewport width in CSS pixels |
| `innerHeight` | `number` | Read-only | Viewport height in CSS pixels |
| `outerWidth` | `number` | Read-only | Full window width (including browser chrome) |
| `outerHeight` | `number` | Read-only | Full window height (including browser chrome) |
| `scrollX` | `number` | **Two-way** | Horizontal scroll position |
| `scrollY` | `number` | **Two-way** | Vertical scroll position |
| `online` | `boolean` | Read-only | Network connectivity status |
| `devicePixelRatio` | `number` | Read-only | Physical pixels per CSS pixel (retina detection) |

The scroll bindings are the only two-way bindings. Setting `scrollY = 0` scrolls the page to the top. Setting `scrollX = 500` scrolls horizontally. This is equivalent to calling `window.scrollTo()` but integrates seamlessly with Svelte's reactivity system.

### Understanding devicePixelRatio

The `devicePixelRatio` binding is crucial for high-DPI rendering. A standard display has a DPR of 1. Retina displays have 2 or 3. This matters when rendering to `<canvas>` elements or choosing image resolutions:

```svelte
<script lang="ts">
  let dpr = $state(1);
  let imageSize = $derived(dpr >= 2 ? '2x' : '1x');
</script>

<svelte:window bind:devicePixelRatio={dpr} />

<img
  src="/product-{imageSize}.jpg"
  alt="Product"
  width="400"
  height="300"
/>
```

The DPR can actually change at runtime — if the user drags the browser window from a retina display to an external monitor, or if they change the browser zoom level. The binding reactively updates when this happens.

## Scroll-to-Top Button

Combining a scroll binding with `$derived`, you can build a scroll-to-top button that appears only when the user has scrolled down:

```svelte
<script lang="ts">
  let scrollY = $state(0);
  let showButton = $derived(scrollY > 300);
</script>

<svelte:window bind:scrollY />

{#if showButton}
  <button
    class="scroll-top"
    onclick={() => scrollY = 0}
    aria-label="Scroll to top"
  >
    &uarr; Top
  </button>
{/if}

<style>
  .scroll-top {
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    z-index: 50;
    padding: 0.75rem 1.25rem;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    transition: opacity 0.2s ease;
  }
  .scroll-top:hover { background: #333; }
</style>
```

Setting `scrollY = 0` scrolls the page to the top because the binding is two-way. For smooth scrolling, you would instead call `window.scrollTo({ top: 0, behavior: 'smooth' })` directly, since setting the binding scrolls instantly.

## Debouncing Window Events

Window events like `resize` and `scroll` fire at extremely high rates — potentially 60+ times per second. If your handler does expensive work (DOM measurements, layout recalculations, network requests), you need to debounce or throttle it:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let layout = $state('desktop');
  let resizeCount = $state(0);

  // Debounce: only run after the user stops resizing for 150ms
  let timeout: ReturnType<typeof setTimeout>;

  function handleResize() {
    resizeCount++;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      // This runs once after resizing settles
      layout = innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop';
    }, 150);
  }
</script>

<svelte:window bind:innerWidth onresize={handleResize} />

<p>Layout: {layout} (resize fired {resizeCount} times)</p>
```

A reusable debounce utility makes this pattern cleaner:

```typescript
// src/lib/utils/timing.ts
export function debounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number
): T {
  let timeout: ReturnType<typeof setTimeout>;
  return ((...args: any[]) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), delay);
  }) as T;
}

export function throttle<T extends (...args: any[]) => void>(
  fn: T,
  interval: number
): T {
  let lastTime = 0;
  return ((...args: any[]) => {
    const now = Date.now();
    if (now - lastTime >= interval) {
      lastTime = now;
      fn(...args);
    }
  }) as T;
}
```

```svelte
<script lang="ts">
  import { debounce } from '$lib/utils/timing';

  let innerWidth = $state(0);
  let layout = $state('desktop');

  const updateLayout = debounce(() => {
    layout = innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop';
  }, 150);
</script>

<svelte:window bind:innerWidth onresize={updateLayout} />
```

However, for the specific case of responsive layout, you do not actually need to debounce at all. The `bind:innerWidth` itself is already efficient — Svelte uses `ResizeObserver` under the hood. You only need debouncing when the handler performs expensive work beyond simple state updates.

## Responsive Layout with innerWidth

Use the reactive `innerWidth` binding to switch layouts based on screen size. This is JavaScript-based responsive design that supplements CSS media queries for cases where you need conditional rendering (not just styling):

```svelte
<script lang="ts">
  let innerWidth = $state(0);

  const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280
  } as const;

  let layout = $derived<'mobile' | 'tablet' | 'desktop'>(
    innerWidth < BREAKPOINTS.sm ? 'mobile'
    : innerWidth < BREAKPOINTS.lg ? 'tablet'
    : 'desktop'
  );

  let isMobile = $derived(innerWidth < BREAKPOINTS.sm);
  let isTablet = $derived(innerWidth >= BREAKPOINTS.sm && innerWidth < BREAKPOINTS.lg);
  let isDesktop = $derived(innerWidth >= BREAKPOINTS.lg);
</script>

<svelte:window bind:innerWidth />

<nav class="main-nav">
  {#if isMobile}
    <button aria-label="Open menu">&#9776;</button>
    <span class="logo">Store</span>
    <button aria-label="Cart">&#128722;</button>
  {:else if isTablet}
    <span class="logo">My Store</span>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/products">Products</a>
    </div>
    <button aria-label="Cart">Cart (3)</button>
  {:else}
    <span class="logo">My Online Store</span>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/products">Products</a>
      <a href="/about">About</a>
      <a href="/contact">Contact</a>
    </div>
    <div class="nav-actions">
      <input type="search" placeholder="Search..." />
      <a href="/account">Account</a>
      <a href="/cart">Cart (3)</a>
    </div>
  {/if}
</nav>
```

**When to use this vs CSS media queries:** Use CSS `@media` when you are only changing styles (display, positioning, font size). Use `bind:innerWidth` when you need to render entirely different component trees — different navigation structures, different data table layouts, or conditional mounting of heavy components. CSS cannot conditionally render or destroy DOM elements.

## Online/Offline Detection

The `online` binding tracks whether the browser has network connectivity. This is essential for progressive web apps and any app that should degrade gracefully when the network disappears:

```svelte
<script lang="ts">
  let online = $state(true);
  let offlineSince = $state<Date | null>(null);
  let pendingActions = $state<string[]>([]);

  $effect(() => {
    if (!online && offlineSince === null) {
      offlineSince = new Date();
    }
    if (online && offlineSince) {
      const duration = Date.now() - offlineSince.getTime();
      console.log(`Was offline for ${Math.round(duration / 1000)}s`);
      offlineSince = null;
      // Sync pending actions
      flushPendingActions();
    }
  });

  function flushPendingActions() {
    // Re-send any actions queued while offline
    for (const action of pendingActions) {
      console.log('Syncing:', action);
    }
    pendingActions = [];
  }

  function addToCart(item: string) {
    if (online) {
      // Send to server immediately
      fetch('/api/cart', { method: 'POST', body: JSON.stringify({ item }) });
    } else {
      // Queue for later
      pendingActions.push(`add-to-cart:${item}`);
    }
  }
</script>

<svelte:window bind:online />

{#if !online}
  <div class="offline-banner" role="alert">
    You are offline. Changes will be saved when you reconnect.
    {#if pendingActions.length > 0}
      <span>({pendingActions.length} pending)</span>
    {/if}
  </div>
{/if}
```

## svelte:document — Document-Level Events

The `<svelte:document>` element listens to events on the `document` object. Some events only fire on `document`, not on `window`:

### visibilitychange

Detect when the user switches tabs. This is essential for pausing expensive operations, stopping timers, or saving state when the user leaves:

```svelte
<script lang="ts">
  let visible = $state(true);
  let hiddenCount = $state(0);
  let totalHiddenTime = $state(0);
  let lastHiddenAt = $state(0);
</script>

<svelte:document onvisibilitychange={() => {
  visible = !document.hidden;
  if (document.hidden) {
    hiddenCount++;
    lastHiddenAt = Date.now();
  } else if (lastHiddenAt > 0) {
    totalHiddenTime += Date.now() - lastHiddenAt;
  }
}} />

<p>Tab is {visible ? 'visible' : 'hidden'}</p>
<p>You have left this tab {hiddenCount} time{hiddenCount === 1 ? '' : 's'}.</p>
<p>Total time away: {Math.round(totalHiddenTime / 1000)}s</p>
```

Real-world uses for `visibilitychange`:
- Pause video or audio playback when the tab is hidden
- Stop polling APIs to save bandwidth and server load
- Pause game loops or animations
- Save draft content to `localStorage` as a safety measure
- Track engagement time accurately (exclude hidden time)

### selectionchange

Track text selection on the page. This is useful for building annotation tools, highlight-and-share features, or context menus:

```svelte
<script lang="ts">
  let selectedText = $state('');
  let selectionRect = $state<{ top: number; left: number } | null>(null);

  function handleSelectionChange() {
    const selection = document.getSelection();
    const text = selection?.toString().trim() ?? '';
    selectedText = text;

    if (text && selection?.rangeCount) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      selectionRect = {
        top: rect.top + window.scrollY - 40,
        left: rect.left + rect.width / 2
      };
    } else {
      selectionRect = null;
    }
  }
</script>

<svelte:document onselectionchange={handleSelectionChange} />

<article>
  <p>Select any text in this article to see a share tooltip appear above it.</p>
  <p>This pattern is used by Medium, Notion, and many other content platforms.</p>
</article>

{#if selectionRect && selectedText}
  <div
    class="selection-tooltip"
    style="top: {selectionRect.top}px; left: {selectionRect.left}px"
  >
    <button onclick={() => navigator.clipboard.writeText(selectedText)}>Copy</button>
    <button onclick={() => {/* share logic */}}>Share</button>
  </div>
{/if}

<style>
  .selection-tooltip {
    position: absolute;
    transform: translateX(-50%);
    background: #111;
    color: #fff;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    display: flex;
    gap: 0.5rem;
    z-index: 100;
  }
  .selection-tooltip button {
    background: none;
    color: #fff;
    border: none;
    cursor: pointer;
    font-size: 0.75rem;
  }
</style>
```

### fullscreenchange

React to the page entering or exiting fullscreen mode:

```svelte
<script lang="ts">
  let isFullscreen = $state(false);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  }
</script>

<svelte:document onfullscreenchange={() => {
  isFullscreen = !!document.fullscreenElement;
}} />

<button onclick={toggleFullscreen}>
  {isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
</button>
```

## svelte:body — Body Events

The `<svelte:body>` element listens to events on the `<body>`. The most common use case is detecting when the mouse enters or leaves the entire page:

```svelte
<script lang="ts">
  let mouseInPage = $state(true);
</script>

<svelte:body
  onmouseenter={() => mouseInPage = true}
  onmouseleave={() => mouseInPage = false}
/>

<p>{mouseInPage ? 'Mouse is in the page' : 'Mouse left the page'}</p>
```

### Drag-and-Drop with svelte:body

`<svelte:body>` is essential for drag-and-drop file uploads. You want to show a drop zone overlay when the user drags a file over the page, and hide it when they leave:

```svelte
<script lang="ts">
  let isDragging = $state(false);
  let dragCounter = $state(0); // Track enter/leave pairs

  function handleDragEnter(e: DragEvent) {
    e.preventDefault();
    dragCounter++;
    if (e.dataTransfer?.types.includes('Files')) {
      isDragging = true;
    }
  }

  function handleDragLeave() {
    dragCounter--;
    if (dragCounter === 0) {
      isDragging = false;
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    dragCounter = 0;

    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length > 0) {
      console.log('Dropped files:', files.map(f => f.name));
      // Upload files...
    }
  }
</script>

<svelte:body
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={(e) => e.preventDefault()}
  ondrop={handleDrop}
/>

{#if isDragging}
  <div class="drop-overlay">
    <div class="drop-message">
      <p>Drop files here to upload</p>
    </div>
  </div>
{/if}

<style>
  .drop-overlay {
    position: fixed;
    inset: 0;
    background: rgba(59, 130, 246, 0.1);
    border: 3px dashed #3b82f6;
    z-index: 1000;
    display: grid;
    place-items: center;
    pointer-events: none;
  }
  .drop-message {
    background: white;
    padding: 2rem 3rem;
    border-radius: 1rem;
    box-shadow: 0 4px 24px rgba(0,0,0,0.1);
    font-size: 1.25rem;
    font-weight: 600;
  }
</style>
```

The `dragCounter` technique is important. `dragenter` and `dragleave` fire for every child element the cursor passes over. Without the counter, the drop zone would flicker as the mouse moves between elements. Incrementing on enter and decrementing on leave ensures `isDragging` only becomes `false` when the mouse truly leaves the body.

## svelte:head — Dynamic Document Head

The `<svelte:head>` element injects content into the HTML `<head>`. This is essential for SEO, page titles, Open Graph tags, and loading external resources:

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.product.name} | My Store</title>
  <meta name="description" content={data.product.description.slice(0, 155)} />

  <!-- Open Graph for social sharing -->
  <meta property="og:title" content={data.product.name} />
  <meta property="og:description" content={data.product.description.slice(0, 155)} />
  <meta property="og:image" content={data.product.imageUrl} />
  <meta property="og:type" content="product" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.product.name} />
  <meta name="twitter:image" content={data.product.imageUrl} />

  <!-- Structured data for search engines -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": data.product.name,
    "description": data.product.description,
    "image": data.product.imageUrl,
    "offers": {
      "@type": "Offer",
      "price": (data.product.priceCents / 100).toFixed(2),
      "priceCurrency": "USD"
    }
  })}</script>`}
</svelte:head>
```

In SvelteKit, `<svelte:head>` works on both server and client. The server renders the head tags into the initial HTML response, which is critical for search engines and social media crawlers that do not execute JavaScript. When the client hydrates and takes over, it manages the head tags dynamically as the user navigates between pages.

**Important:** Multiple components can use `<svelte:head>`. Tags are merged. If two components set `<title>`, the last one rendered wins. In SvelteKit, the page component's title typically overrides the layout's title.

## Keyboard Shortcut System

Combining `<svelte:window>` with keyboard events, you can build a robust shortcut system. Production applications need to handle modifier keys, prevent conflicts with browser shortcuts, and support configurable bindings:

```svelte
<script lang="ts">
  type Shortcut = {
    key: string;
    ctrl?: boolean;
    shift?: boolean;
    alt?: boolean;
    action: () => void;
    description: string;
  };

  let lastAction = $state('None');
  let showHelp = $state(false);

  const shortcuts: Shortcut[] = [
    { key: 's', ctrl: true, action: () => save(), description: 'Save' },
    { key: 'k', ctrl: true, action: () => openSearch(), description: 'Search' },
    { key: 'n', ctrl: true, shift: true, action: () => newItem(), description: 'New item' },
    { key: '/', action: () => showHelp = !showHelp, description: 'Toggle help' },
    { key: 'Escape', action: () => closeAll(), description: 'Close panels' },
  ];

  function handleKeydown(e: KeyboardEvent) {
    // Skip if user is typing in an input
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    for (const shortcut of shortcuts) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;

      if (e.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.action();
        lastAction = shortcut.description;
        return;
      }
    }
  }

  function save() { console.log('Saving...'); }
  function openSearch() { console.log('Opening search...'); }
  function newItem() { console.log('Creating new item...'); }
  function closeAll() { showHelp = false; }
</script>

<svelte:window onkeydown={handleKeydown} />

<p>Last shortcut: <strong>{lastAction}</strong></p>

{#if showHelp}
  <div class="shortcut-help">
    <h3>Keyboard Shortcuts</h3>
    <dl>
      {#each shortcuts as s}
        <div class="shortcut-row">
          <dt>
            {#if s.ctrl}<kbd>Ctrl</kbd> + {/if}
            {#if s.shift}<kbd>Shift</kbd> + {/if}
            {#if s.alt}<kbd>Alt</kbd> + {/if}
            <kbd>{s.key}</kbd>
          </dt>
          <dd>{s.description}</dd>
        </div>
      {/each}
    </dl>
  </div>
{/if}
```

The check for `target.tagName === 'INPUT'` is crucial. Without it, pressing `/` while typing in a search box would toggle the help panel instead of typing the character. Every keyboard shortcut system in a real application needs this guard.

## Complete Responsive Layout Manager

Here is a comprehensive example combining multiple special elements into a responsive, scroll-aware, connectivity-aware layout:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let scrollY = $state(0);
  let online = $state(true);
  let dpr = $state(1);
  let tabVisible = $state(true);
  let mouseInPage = $state(true);

  // Responsive breakpoints
  let isMobile = $derived(innerWidth < 640);
  let isTablet = $derived(innerWidth >= 640 && innerWidth < 1024);
  let isDesktop = $derived(innerWidth >= 1024);
  let isLandscape = $derived(innerWidth > innerHeight);

  // Scroll state
  let scrollProgress = $derived(
    typeof document !== 'undefined'
      ? Math.min(scrollY / (document.documentElement.scrollHeight - innerHeight), 1)
      : 0
  );
  let isScrolled = $derived(scrollY > 64);
  let showScrollTop = $derived(scrollY > 500);

  // Previous scroll position for direction detection
  let prevScrollY = $state(0);
  let scrollDirection = $derived<'up' | 'down'>(scrollY > prevScrollY ? 'down' : 'up');
  let hideNav = $derived(scrollDirection === 'down' && scrollY > 200);

  $effect(() => {
    // Use a small delay so derived has time to compute direction
    const timeout = setTimeout(() => { prevScrollY = scrollY; }, 50);
    return () => clearTimeout(timeout);
  });
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  bind:scrollY
  bind:online
  bind:devicePixelRatio={dpr}
/>

<svelte:document onvisibilitychange={() => {
  tabVisible = !document.hidden;
}} />

<svelte:body
  onmouseenter={() => mouseInPage = true}
  onmouseleave={() => mouseInPage = false}
/>

<svelte:head>
  <title>My App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</svelte:head>

<!-- Offline banner -->
{#if !online}
  <div class="offline-banner" role="alert">
    You are offline. Some features may be unavailable.
  </div>
{/if}

<!-- Scroll progress bar -->
<div class="progress-bar" style="width: {scrollProgress * 100}%"></div>

<!-- Collapsible header -->
<header class="main-header" class:hidden={hideNav} class:scrolled={isScrolled}>
  {#if isMobile}
    <button aria-label="Menu">&#9776;</button>
    <h1>App</h1>
  {:else}
    <h1>My Application</h1>
    <nav>
      <a href="/">Home</a>
      <a href="/dashboard">Dashboard</a>
      {#if isDesktop}
        <a href="/analytics">Analytics</a>
        <a href="/settings">Settings</a>
      {/if}
    </nav>
  {/if}
</header>

<!-- Scroll to top -->
{#if showScrollTop}
  <button
    class="scroll-top"
    onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    aria-label="Scroll to top"
  >
    &uarr;
  </button>
{/if}

<!-- Debug overlay (development only) -->
<div class="debug-overlay">
  {innerWidth}x{innerHeight} | DPR:{dpr} |
  {isMobile ? 'Mobile' : isTablet ? 'Tablet' : 'Desktop'} |
  {isLandscape ? 'Landscape' : 'Portrait'} |
  {online ? 'Online' : 'Offline'} |
  {tabVisible ? 'Visible' : 'Hidden'} |
  {mouseInPage ? 'Mouse in' : 'Mouse out'}
</div>

<style>
  .offline-banner {
    position: fixed; top: 0; left: 0; right: 0;
    background: #ef4444; color: white;
    text-align: center; padding: 0.5rem;
    z-index: 200; font-size: 0.875rem;
  }
  .progress-bar {
    position: fixed; top: 0; left: 0; height: 3px;
    background: #3b82f6; z-index: 100;
    transition: width 50ms linear;
  }
  .main-header {
    position: sticky; top: 0;
    background: white; padding: 1rem;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    transition: transform 0.3s ease, box-shadow 0.3s ease;
    z-index: 50;
    display: flex; align-items: center; justify-content: space-between;
  }
  .main-header.hidden { transform: translateY(-100%); }
  .main-header.scrolled { box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .scroll-top {
    position: fixed; bottom: 2rem; right: 2rem;
    width: 3rem; height: 3rem;
    border-radius: 50%; border: none;
    background: #111; color: white;
    font-size: 1.25rem; cursor: pointer;
    z-index: 50;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  .debug-overlay {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,0.85); color: #0f0;
    font-family: monospace; font-size: 0.75rem;
    padding: 0.25rem 0.5rem; z-index: 200;
  }
  nav { display: flex; gap: 1rem; }
  nav a { text-decoration: none; color: #333; }
</style>
```

This example demonstrates: hiding the navigation on scroll-down and showing it on scroll-up (a common mobile pattern), a reading progress bar, offline detection, responsive navigation that changes structure at breakpoints, and a debug overlay showing all the current window state.

## Try It

Build a "reading progress" component that uses `<svelte:window>` to bind `scrollY` and `innerHeight`, calculates the scroll percentage with `$derived`, and displays a fixed progress bar at the top of the viewport. Add `<svelte:head>` to set the page title dynamically based on a `title` prop. Use `<svelte:document>` to pause the progress indicator (dim it) when the tab is hidden, and resume when it becomes visible again. Finally, add `<svelte:body>` to detect when the mouse leaves the page and show a subtle "come back" tooltip near the top of the viewport. Use the debounce utility for any scroll event handlers that perform expensive calculations.

## Key Takeaways

- `<svelte:window>` lets you listen to window events and bind to properties like `innerWidth`, `scrollY`, and `online` — the compiler handles setup, teardown, and SSR safety
- Scroll bindings (`scrollX`, `scrollY`) are two-way — set them to scroll the page programmatically
- The `devicePixelRatio` binding updates reactively when the user changes zoom or moves the window between displays
- Debounce or throttle expensive window event handlers (`resize`, `scroll`) but know that simple state updates from bindings are already efficient
- `<svelte:document>` handles document-level events like `visibilitychange`, `selectionchange`, and `fullscreenchange` that do not exist on `window`
- `<svelte:body>` handles body-level events like `mouseenter`, `mouseleave`, and drag events — the `dragCounter` pattern prevents flickering during drag-and-drop
- `<svelte:head>` injects tags into the HTML `<head>` and works on both server (SSR/SEO) and client (SPA navigation) — multiple components can use it, with the last-rendered tag winning for duplicates
- Always guard keyboard shortcuts against input elements to prevent intercepting normal typing
- Combine multiple special elements to build production-quality responsive, scroll-aware, connectivity-aware layouts
