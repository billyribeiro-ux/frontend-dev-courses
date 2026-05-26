# Dynamic Elements

In most Svelte components, every HTML tag is known at compile time. You write `<h2>`, `<button>`, `<div>`, and the compiler knows exactly what DOM nodes to create. But there are legitimate cases where the tag itself is a runtime decision: a heading component that accepts a `level` prop, a rich text renderer that maps node types to semantic elements, or a design system primitive that can render as a `<button>` or an `<a>` depending on whether it receives an `href`.

Svelte handles these situations with special elements — compiler-recognized tags that give you declarative access to things that would otherwise require imperative DOM APIs like `document.createElement()`. The mental model is straightforward: wherever you would normally reach for a string-based DOM manipulation in vanilla JavaScript, Svelte probably has a special element that lets you express the same intent right in your template, with full reactivity and automatic cleanup.

This lesson is a comprehensive reference for every special element in Svelte 5. We will cover not just the syntax but the architectural patterns, performance implications, and edge cases that the official documentation hints at but does not fully explain.

## svelte:element — Dynamic HTML Tags

The `<svelte:element>` tag renders whichever HTML element the `this` prop evaluates to at runtime:

```svelte
<script lang="ts">
  let level = $state(2);
  let tag = $derived(`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6');
</script>

<svelte:element this={tag}>
  This is a heading level {level}
</svelte:element>

<label>
  Heading level:
  <input type="range" min={1} max={6} bind:value={level} /> h{level}
</label>
```

This works exactly like writing `<h2>` directly, except the tag name comes from a variable. Svelte destroys the old element and creates a new one when the tag changes — this is a full teardown and rebuild, not an in-place mutation. The browser does not support changing an element's tag name after creation (there is no `element.tagName = 'h3'`), so Svelte does the only thing it can: remove the old node and insert a new one.

You can apply attributes, event handlers, bindings, classes, styles, transitions — everything you would use on a regular element:

```svelte
<script lang="ts">
  let tag = $state<'button' | 'a'>('button');
  let href = $derived(tag === 'a' ? '/about' : undefined);
</script>

<svelte:element
  this={tag}
  {href}
  class="action-trigger"
  onclick={() => console.log('clicked')}
>
  Click me
</svelte:element>
```

### Performance Implications

Because changing `this` triggers a full DOM teardown and rebuild, avoid putting rapidly-changing values as the tag. An animation that cycles through tags on every frame would be pathologically slow — each frame destroys and recreates the entire subtree. The `<svelte:element>` is designed for values that change infrequently: user selections, prop values, configuration lookups.

If you need frequent visual changes on the same element, use CSS classes, styles, or attributes instead — those can be updated in-place without recreating the DOM node.

### The Falsy this Behavior

When `this` evaluates to `null`, `undefined`, or any falsy value, Svelte renders nothing — no element, no children. This is not a bug; it is a deliberate design choice that lets you conditionally suppress rendering:

```svelte
<script lang="ts">
  // When semanticTag is null, the wrapper disappears entirely
  let semanticTag = $state<string | null>('section');
</script>

<svelte:element this={semanticTag}>
  <p>This paragraph may or may not have a wrapper.</p>
</svelte:element>
```

This is worth knowing because it can surprise you. If your tag variable is derived from data that might be missing, you will get invisible content — no error, no warning, just silence. Defensive code should handle this:

```svelte
{@const resolvedTag = tag || 'div'}
<svelte:element this={resolvedTag}>
  Content that always renders
</svelte:element>
```

### When to Use svelte:element vs. Conditional Rendering

You might wonder: why not just use `{#if}` blocks?

```svelte
<!-- Conditional approach — explicit but verbose -->
{#if level === 1}
  <h1>{text}</h1>
{:else if level === 2}
  <h2>{text}</h2>
{:else if level === 3}
  <h3>{text}</h3>
{:else if level === 4}
  <h4>{text}</h4>
{:else if level === 5}
  <h5>{text}</h5>
{:else}
  <h6>{text}</h6>
{/if}

<!-- Dynamic element approach — concise and scalable -->
<svelte:element this={`h${level}`}>{text}</svelte:element>
```

Both work, but they make different tradeoffs:

**Use `<svelte:element>`** when the tag is the only thing that changes and the content, attributes, and behavior are identical across tags. Heading levels, semantic wrappers (`section` vs. `article` vs. `div`), and polymorphic design system primitives are all good fits.

**Use `{#if}` blocks** when different tags need different attributes, children, or behavior. A component that renders as a `<button>` with `onclick` or an `<a>` with `href` and `target` is usually clearer with explicit branches, because each branch can have its own attribute set without runtime conditionals.

The real-world test: if you find yourself writing a lot of conditional attributes *inside* the `<svelte:element>`, you have probably outgrown it. Switch to `{#if}` branches where each path is explicit and self-documenting.

### A Practical Example: Polymorphic Box Component

Design systems often need a "Box" or "Container" primitive that renders as different semantic elements:

```svelte
<!-- Box.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    as?: string;
    padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
    rounded?: boolean;
    shadow?: boolean;
    children: Snippet;
    [key: string]: any; // Allow arbitrary HTML attributes
  }

  let {
    as = 'div',
    padding = 'md',
    rounded = true,
    shadow = false,
    children,
    ...restProps
  }: Props = $props();
</script>

<svelte:element
  this={as}
  class="box box--{padding}"
  class:box--rounded={rounded}
  class:box--shadow={shadow}
  {...restProps}
>
  {@render children()}
</svelte:element>

<style>
  .box { }
  .box--none { padding: 0; }
  .box--sm { padding: 0.5rem; }
  .box--md { padding: 1rem; }
  .box--lg { padding: 1.5rem; }
  .box--xl { padding: 2rem; }
  .box--rounded { border-radius: 8px; }
  .box--shadow { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); }
</style>
```

Usage:

```svelte
<Box as="section" padding="lg" shadow>
  <h2>Dashboard</h2>
  <p>Welcome back.</p>
</Box>

<Box as="aside" padding="sm">
  <p>Sidebar content</p>
</Box>

<Box as="article" padding="md" id="main-content" role="main">
  <p>Article body</p>
</Box>
```

This pattern is common in component libraries like Chakra UI and Radix. The `as` prop lets consumers control semantics without the library needing to anticipate every possible element. The `...restProps` spread passes through any HTML attributes the consumer provides.

### Advanced: Polymorphic Link/Button Component

A more complex polymorphic component that switches between `<a>` and `<button>` based on whether `href` is provided:

```svelte
<!-- Action.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    href?: string;
    target?: string;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    onclick?: (e: Event) => void;
    children: Snippet;
  }

  let {
    href,
    target,
    disabled = false,
    variant = 'primary',
    size = 'md',
    onclick,
    children
  }: Props = $props();
</script>

<!-- Use {#if} here because the attribute sets differ significantly -->
{#if href}
  <a
    {href}
    {target}
    class="action action--{variant} action--{size}"
    class:action--disabled={disabled}
    aria-disabled={disabled || undefined}
    onclick={(e) => {
      if (disabled) { e.preventDefault(); return; }
      onclick?.(e);
    }}
    rel={target === '_blank' ? 'noopener noreferrer' : undefined}
  >
    {@render children()}
  </a>
{:else}
  <button
    type="button"
    class="action action--{variant} action--{size}"
    {disabled}
    {onclick}
  >
    {@render children()}
  </button>
{/if}

<style>
  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 600;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    text-decoration: none;
    border: none;
    font-family: inherit;
  }

  .action--sm { padding: 0.375rem 0.75rem; font-size: 0.875rem; }
  .action--md { padding: 0.625rem 1.25rem; font-size: 1rem; }
  .action--lg { padding: 0.75rem 1.5rem; font-size: 1.125rem; }

  .action--primary { background: #3b82f6; color: white; }
  .action--primary:hover { background: #2563eb; }
  .action--secondary { background: white; color: #374151; border: 2px solid #d1d5db; }
  .action--ghost { background: transparent; color: #3b82f6; }

  .action--disabled {
    opacity: 0.5;
    cursor: not-allowed;
    pointer-events: none;
  }
</style>
```

This deliberately uses `{#if}` instead of `<svelte:element>` because `<a>` and `<button>` have meaningfully different attributes (`href`/`target`/`rel` vs `disabled`/`type`). Explicit branches make the contract clear and prevent accidentally passing a `disabled` attribute to an `<a>` tag (which does not support it natively).

## Dynamic Components — The Svelte 5 Way

In Svelte 4, rendering a dynamic component required the `<svelte:component>` special element:

```svelte
<!-- Svelte 4 pattern (still works but no longer necessary) -->
<svelte:component this={CurrentComponent} {someProp} />
```

Svelte 5 simplified this significantly. Components are first-class values, so you can store them in reactive state and render them directly:

```svelte
<script lang="ts">
  import TextWidget from '$lib/components/TextWidget.svelte';
  import ChartWidget from '$lib/components/ChartWidget.svelte';
  import TableWidget from '$lib/components/TableWidget.svelte';
  import type { Component } from 'svelte';

  const widgetMap: Record<string, Component> = {
    text: TextWidget,
    chart: ChartWidget,
    table: TableWidget
  };

  let widgetType = $state('text');
  let ActiveWidget = $derived(widgetMap[widgetType]);
</script>

<select bind:value={widgetType}>
  <option value="text">Text</option>
  <option value="chart">Chart</option>
  <option value="table">Table</option>
</select>

<!-- Just use the variable directly — no <svelte:component> needed -->
<ActiveWidget title="My Widget" />
```

This works because Svelte 5 compiles components into plain functions. A component variable is just a reference to a function, and the template syntax `<ActiveWidget />` works whether `ActiveWidget` is an import or a reactive variable. When `ActiveWidget` changes, Svelte destroys the old component instance and mounts the new one — just like `<svelte:element>` does for HTML tags.

### Why This Matters Architecturally

The removal of the `<svelte:component>` ceremony reflects a deeper design principle in Svelte 5: components are values, not special template constructs. This means you can:

- Store components in arrays and iterate over them with `{#each}`
- Pass components as props to other components
- Return components from functions
- Use them in `Map` or `Record` lookups
- Combine them with dynamic imports for code-split plugin systems

```svelte
<script lang="ts">
  import type { Component } from 'svelte';
  import Header from './Header.svelte';
  import Sidebar from './Sidebar.svelte';
  import Footer from './Footer.svelte';

  interface LayoutSlot {
    component: Component;
    props: Record<string, unknown>;
    key: string;
  }

  let slots: LayoutSlot[] = $state([
    { component: Header, props: { title: 'My App' }, key: 'header' },
    { component: Sidebar, props: { collapsed: false }, key: 'sidebar' },
    { component: Footer, props: { year: 2026 }, key: 'footer' }
  ]);

  // Reorder, add, or remove layout sections at runtime
  function moveUp(index: number) {
    if (index === 0) return;
    [slots[index - 1], slots[index]] = [slots[index], slots[index - 1]];
  }
</script>

{#each slots as { component: Cmp, props, key } (key)}
  <Cmp {...props} />
{/each}
```

This pattern is how you build plugin systems, configurable dashboards, and layout engines. The component itself becomes data.

### Dynamic Components with Code Splitting

Combine dynamic components with dynamic imports for code-split widget systems:

```svelte
<script lang="ts">
  import type { Component } from 'svelte';

  interface Widget {
    id: string;
    type: string;
    config: Record<string, unknown>;
  }

  let { widgets }: { widgets: Widget[] } = $props();

  // Lazy-load widget components based on type
  const loaders: Record<string, () => Promise<{ default: Component }>> = {
    chart: () => import('$lib/widgets/Chart.svelte'),
    table: () => import('$lib/widgets/DataTable.svelte'),
    map: () => import('$lib/widgets/Map.svelte'),
    metrics: () => import('$lib/widgets/Metrics.svelte')
  };
</script>

{#each widgets as widget (widget.id)}
  {@const loader = loaders[widget.type]}
  {#if loader}
    {#await loader()}
      <div class="widget-skeleton" aria-busy="true">Loading {widget.type}...</div>
    {:then { default: WidgetComponent }}
      <WidgetComponent {...widget.config} />
    {:catch error}
      <div class="widget-error" role="alert">Failed to load {widget.type}: {error.message}</div>
    {/await}
  {:else}
    <div class="widget-error">Unknown widget type: {widget.type}</div>
  {/if}
{/each}
```

Each widget type is its own code-split chunk. A dashboard with 10 widget types only downloads the JavaScript for the widgets actually present on the page.

### The svelte:component Fallback

`<svelte:component>` still works in Svelte 5 and you will see it in codebases that have not migrated. The key behavioral difference from the Svelte 5 direct-variable approach: when `this` is falsy, `<svelte:component>` renders nothing (same as `<svelte:element>`). With the direct variable approach, rendering a falsy component value is a runtime error. Guard against it:

```svelte
{#if ActiveWidget}
  <ActiveWidget />
{:else}
  <p>No widget selected.</p>
{/if}
```

## svelte:boundary — Error Boundaries

Runtime errors in components can crash your entire application. The `<svelte:boundary>` element catches errors thrown by its children, letting you show a fallback UI instead of a blank page. This was introduced in Svelte 5.

The `onerror` callback receives the error and a `reset` function. The `failed` snippet defines what to show when an error occurs:

```svelte
<script lang="ts">
  import RiskyWidget from '$lib/components/RiskyWidget.svelte';
</script>

<svelte:boundary onerror={(error, reset) => console.error('Caught:', error)}>
  <RiskyWidget />

  {#snippet failed(error, reset)}
    <div class="error-card" role="alert">
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
```

Clicking "Try Again" calls `reset`, which re-mounts the child component from scratch. Error boundaries are especially powerful when wrapping independent sections of your UI — one section can fail without taking down the rest.

### Error Boundary Architecture: The Bulkhead Pattern

Think of error boundaries as bulkheads on a ship. A leak in one compartment does not sink the vessel. In practice, wrap each independent feature area in its own boundary — especially anything that depends on third-party data or user-generated content:

```svelte
<script lang="ts">
  import UserProfile from '$lib/components/UserProfile.svelte';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import Recommendations from '$lib/components/Recommendations.svelte';

  function logError(error: Error, reset: () => void) {
    console.error('Component error:', error);
  }
</script>

<div class="dashboard-grid">
  <svelte:boundary onerror={logError}>
    <UserProfile />
    {#snippet failed(error, reset)}
      <div class="widget-error">
        <p>Could not load profile.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>

  <svelte:boundary onerror={logError}>
    <ActivityFeed />
    {#snippet failed(error, reset)}
      <div class="widget-error">
        <p>Could not load activity feed.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>

  <svelte:boundary onerror={logError}>
    <Recommendations />
    {#snippet failed(error, reset)}
      <div class="widget-error">
        <p>Could not load recommendations.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>
</div>
```

If the Recommendations component throws because the ML service is down, the Profile and Activity Feed continue working. Without error boundaries, the entire page would crash.

### What Error Boundaries Catch and Do Not Catch

Error boundaries catch errors thrown during **rendering** — component initialization, reactive updates, and effect execution. They do NOT catch:

- Errors in asynchronous code (`setTimeout`, `fetch.then()`) unless the error is thrown during a reactive update triggered by the async result
- Errors in event handlers — these are caught by the browser's default error handling
- Errors in the error boundary component itself — if the `failed` snippet throws, the error propagates up

### Reusable Error Boundary Component

Extract the error boundary pattern into a reusable component:

```svelte
<!-- ErrorBoundary.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    fallbackTitle?: string;
    showDetails?: boolean;
    onError?: (error: Error) => void;
    children: Snippet;
  }

  let {
    fallbackTitle = 'Something went wrong',
    showDetails = false,
    onError,
    children
  }: Props = $props();

  function handleError(error: Error, reset: () => void) {
    onError?.(error);
  }
</script>

<svelte:boundary onerror={handleError}>
  {@render children()}

  {#snippet failed(error, reset)}
    <div class="error-boundary" role="alert">
      <h3>{fallbackTitle}</h3>
      {#if showDetails}
        <pre class="error-details">{error.message}</pre>
      {/if}
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>

<style>
  .error-boundary {
    padding: 1.5rem;
    border: 2px solid #fee2e2;
    border-radius: 0.5rem;
    background: #fef2f2;
    text-align: center;
  }

  .error-boundary h3 {
    color: #991b1b;
    margin: 0 0 0.5rem;
  }

  .error-details {
    background: #1f2937;
    color: #f87171;
    padding: 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8rem;
    text-align: left;
    overflow-x: auto;
    margin: 0.75rem 0;
  }

  .error-boundary button {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-weight: 500;
  }
</style>
```

## svelte:window — Window Events and Bindings

The `<svelte:window>` element lets you listen to events on the `window` object and bind to window properties, all with automatic cleanup:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let scrollY = $state(0);
  let online = $state(true);

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      closeModal();
    }
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  }
</script>

<svelte:window
  bind:innerWidth
  bind:innerHeight
  bind:scrollY
  bind:online
  onkeydown={handleKeydown}
/>

<p>Window: {innerWidth}x{innerHeight}</p>
<p>Scroll position: {scrollY}px</p>
<p>Network: {online ? 'Online' : 'Offline'}</p>
```

### Available Window Bindings

| Binding | Writable | Description |
|---------|----------|-------------|
| `innerWidth` | No | Viewport width in pixels |
| `innerHeight` | No | Viewport height in pixels |
| `outerWidth` | No | Outer window width |
| `outerHeight` | No | Outer window height |
| `scrollX` | Yes | Horizontal scroll position |
| `scrollY` | Yes | Vertical scroll position |
| `online` | No | Network connectivity (`navigator.onLine`) |
| `devicePixelRatio` | No | Display density (1 for standard, 2 for retina) |

Writing to `scrollY` or `scrollX` scrolls the window — this is how you build "scroll to top" buttons or programmatic scroll management.

### Practical Pattern: Scroll-Aware Header

```svelte
<script lang="ts">
  let scrollY = $state(0);
  let lastScrollY = $state(0);
  let headerVisible = $state(true);

  $effect(() => {
    if (scrollY < 100) {
      headerVisible = true;
    } else if (scrollY < lastScrollY) {
      headerVisible = true;
    } else if (scrollY > lastScrollY + 10) {
      headerVisible = false;
    }
    lastScrollY = scrollY;
  });
</script>

<svelte:window bind:scrollY />

<header class="fixed-header" class:header-hidden={!headerVisible}>
  <nav>Navigation</nav>
</header>

<style>
  .fixed-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    transform: translateY(0);
    transition: transform 0.3s ease;
    z-index: 100;
    background: white;
  }

  .header-hidden {
    transform: translateY(-100%);
  }
</style>
```

### Practical Pattern: Keyboard Shortcuts Manager

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

  let shortcuts: Shortcut[] = [
    { key: 'k', ctrl: true, action: () => openSearch(), description: 'Open search' },
    { key: '/', action: () => openSearch(), description: 'Open search' },
    { key: 'Escape', action: () => closeAll(), description: 'Close dialogs' },
    { key: 'n', ctrl: true, action: () => createNew(), description: 'Create new item' }
  ];

  function handleKeydown(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

    for (const shortcut of shortcuts) {
      if (
        e.key === shortcut.key &&
        !!e.ctrlKey === !!shortcut.ctrl &&
        !!e.shiftKey === !!shortcut.shift &&
        !!e.altKey === !!shortcut.alt
      ) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
```

## svelte:document — Document Events

The `<svelte:document>` element listens to events on the `document` object. The key events not available on `window` are `visibilitychange` and `selectionchange`:

```svelte
<script lang="ts">
  let visible = $state(true);
  let selectedText = $state('');

  function handleVisibilityChange() {
    visible = !document.hidden;
    if (!visible) {
      pauseAnimations();
      pausePolling();
    } else {
      resumeAnimations();
      resumePolling();
    }
  }

  function handleSelectionChange() {
    selectedText = document.getSelection()?.toString() ?? '';
  }
</script>

<svelte:document
  onvisibilitychange={handleVisibilityChange}
  onselectionchange={handleSelectionChange}
/>

{#if selectedText}
  <div class="selection-toolbar">
    <button onclick={() => navigator.clipboard.writeText(selectedText)}>Copy</button>
    <button onclick={() => shareText(selectedText)}>Share</button>
  </div>
{/if}
```

The `visibilitychange` event is particularly useful for performance — you can pause expensive animations, polling, and data fetching when the user switches to another tab.

## svelte:body — Body Element Events

The `<svelte:body>` element listens to events on the `<body>` element. The most common use case is detecting when the mouse enters or leaves the page entirely, and page-level drag-and-drop:

```svelte
<script lang="ts">
  let mouseInPage = $state(true);
  let isDraggingOver = $state(false);
</script>

<svelte:body
  onmouseenter={() => { mouseInPage = true; }}
  onmouseleave={() => { mouseInPage = false; }}
  ondragenter={(e) => { e.preventDefault(); isDraggingOver = true; }}
  ondragover={(e) => { e.preventDefault(); }}
  ondragleave={() => { isDraggingOver = false; }}
  ondrop={(e) => {
    e.preventDefault();
    isDraggingOver = false;
    handleFileDrop(e);
  }}
/>

{#if isDraggingOver}
  <div class="drop-overlay">
    Drop files here to upload
  </div>
{/if}
```

## svelte:head — Document Head Management

The `<svelte:head>` element injects content into the document's `<head>`. In SvelteKit, this is critical for SEO because the server renders head tags into the initial HTML response:

```svelte
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.product.name} | My Store</title>
  <meta name="description" content={data.product.summary} />

  <!-- Open Graph for social sharing -->
  <meta property="og:title" content={data.product.name} />
  <meta property="og:description" content={data.product.summary} />
  <meta property="og:image" content={data.product.imageUrl} />
  <meta property="og:type" content="product" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={data.product.name} />
  <meta name="twitter:image" content={data.product.imageUrl} />

  <!-- Structured data for rich search results -->
  {@html `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Product",
    "name": data.product.name,
    "description": data.product.summary,
    "image": data.product.imageUrl,
    "offers": {
      "@type": "Offer",
      "price": data.product.price,
      "priceCurrency": "USD"
    }
  })}</script>`}

  <!-- Preload critical resources -->
  <link rel="preload" as="image" href={data.product.imageUrl} />

  <!-- Canonical URL -->
  <link rel="canonical" href="https://mystore.com/products/{data.product.slug}" />
</svelte:head>
```

The `<svelte:head>` element is deduplicated — if multiple components set `<title>`, the last one rendered wins. When a component with `<svelte:head>` is destroyed (navigating away from a page), its head elements are automatically removed.

## svelte:options — Compiler Configuration

The `<svelte:options>` tag configures the compiler for a specific component. It must appear at the top level:

```svelte
<svelte:options runes={true} />
```

### Available Options

**`runes`** — Explicitly opts a component into (or out of) Svelte 5 rune mode:

```svelte
<svelte:options runes={true} />  <!-- Force runes in a non-runes project -->
<svelte:options runes={false} /> <!-- Force legacy mode in a runes project -->
```

**`customElement`** — Compiles the component as a native Web Component:

```svelte
<svelte:options customElement="my-counter" />

<script lang="ts">
  let count = $state(0);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

The `customElement` option also accepts an object for advanced configuration:

```svelte
<svelte:options
  customElement={{
    tag: 'my-counter',
    shadow: 'open',
    props: {
      count: { reflect: true, type: 'Number', attribute: 'initial-count' }
    }
  }}
/>
```

**`namespace`** — Set to `"svg"` or `"mathml"` for components that render SVG or MathML content. Without this, Svelte creates elements in the HTML namespace, which silently breaks SVG rendering.

**`css`** — Set to `"injected"` to force styles to be injected at runtime rather than extracted at build time.

## Module-Level Code with script module

Normally, the code in `<script>` runs once per component instance. Use `<script module>` for code that runs once per module — shared constants, counters, or exported types:

```svelte
<script module lang="ts">
  let instanceCount = 0;

  export interface TabItem {
    label: string;
    value: string;
    disabled?: boolean;
  }

  export const TAB_VARIANTS = ['default', 'pills', 'underline'] as const;
  export type TabVariant = typeof TAB_VARIANTS[number];
</script>

<script lang="ts">
  instanceCount++;
  let id = $state(instanceCount);
</script>

<p>I am instance #{id} of {instanceCount} total.</p>
```

Module-level exports are importable as named imports alongside the default component import:

```typescript
import MyComponent, { type TabItem, TAB_VARIANTS } from '$lib/components/MyComponent.svelte';
```

### When Module-Level Code Goes Wrong

Module-level state is shared across all instances of the component, which means it is also shared across all requests on the server. In SvelteKit, mutable state in `<script module>` can leak data between user requests. Use module-level code for constants and types. Use instance-level `$state` for anything mutable.

## The Big Picture: Special Elements as Declarative Escape Hatches

Step back and look at what all these special elements have in common. Each one takes something that would normally require imperative JavaScript — `document.createElement(tagName)`, `window.addEventListener(...)`, `document.head.appendChild(...)`, `try/catch` around component rendering — and wraps it in declarative template syntax that the compiler can reason about, optimize, and clean up.

The key architectural insight: Svelte attaches and removes these listeners as part of the component lifecycle. When the component is destroyed, the listeners vanish. This means you can use these elements inside conditionally rendered components and the cleanup is automatic. No memory leaks, no stale listeners, no `removeEventListener` boilerplate.

When you encounter a situation where you are reaching for raw DOM APIs in `onMount`, ask yourself: is there a special element that already handles this? More often than not, there is.

## Try It

Build a configurable "Card" component that uses multiple special element patterns together:

1. Accept an `as` prop (defaulting to `'div'`) and render the card wrapper with `<svelte:element this={as}>`.
2. Accept a `heading` prop and a `headingLevel` prop (1-6). Render the heading with `<svelte:element this={`h${headingLevel}`}>`.
3. Accept a `component` prop of type `Component | null`. If provided, render it dynamically inside the card using the Svelte 5 direct-variable pattern. If null, render default content via a `children` snippet.
4. Wrap the dynamic component in a `<svelte:boundary>` so that a failing component shows a "Widget failed to load" message with a retry button.
5. Use `<script module>` to export `type CardProps` with the full interface.
6. Add a `<svelte:window>` binding to detect the viewport width. If the viewport is under 640px, collapse the card body by default and show an expand/collapse toggle.
7. Use `<svelte:head>` to set the page title when the card is the "featured" card.

Test it by creating a component that intentionally throws, and verify the error boundary catches it while the rest of the card still renders.

## Key Takeaways

- `<svelte:element this={tag}>` renders dynamic HTML elements — when `this` is falsy, nothing renders at all (no error, no output)
- Changing the `this` value triggers a full DOM teardown and rebuild — avoid rapidly changing tag values
- Use `<svelte:element>` when only the tag changes; use `{#if}` blocks when different tags need different attributes and behavior
- In Svelte 5, dynamic components do not need `<svelte:component>` — store a component in a reactive variable and render it directly with `<Component />`
- Components are first-class values in Svelte 5: store them in arrays, pass them as props, use them in lookups, combine with dynamic imports for code-split plugin systems
- `<svelte:boundary>` catches runtime errors in child components with `onerror` and renders a `failed` snippet as fallback — use the bulkhead pattern to isolate independent feature areas
- Error boundaries catch rendering errors but not async errors or event handler errors — combine with `handleError` hooks for comprehensive coverage
- `<svelte:window>` provides reactive bindings to `innerWidth`, `innerHeight`, `scrollX`, `scrollY`, `online`, and `devicePixelRatio` with automatic cleanup
- `<svelte:document>` listens to document events like `visibilitychange` and `selectionchange` that are not available on `window`
- `<svelte:body>` handles mouse enter/leave and drag-and-drop at the page level
- `<svelte:head>` is critical for SEO in SvelteKit — the server renders head tags into the initial HTML response, and elements are automatically removed when the component is destroyed
- `<svelte:options>` configures the compiler per component: `runes`, `customElement` (with advanced object syntax), `namespace`, `css`
- `<script module>` runs once per module, not per instance — use it for types, constants, and exports, never for mutable per-request state
- Special elements are declarative escape hatches: they replace imperative DOM APIs with template syntax the compiler can optimize and clean up automatically
