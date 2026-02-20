# Window & Document

Most of the time you work with elements inside your component. But some events and data live at a higher level — the browser window, the document, or the body. Scroll position, keyboard shortcuts, screen size, online/offline status — these are all window- or document-level concerns.

Svelte provides special elements that let you interact with these global objects declaratively, right in your template. No manual `addEventListener` calls or `onMount` cleanup needed.

## svelte:window Events

The `<svelte:window>` element lets you listen to events on the `window` object:

```svelte
<script lang="ts">
  let key = $state('');
</script>

<svelte:window onkeydown={(e) => key = e.key} />

<p>Last key pressed: <kbd>{key || 'none'}</kbd></p>
```

Svelte automatically adds the event listener when the component mounts and removes it when the component is destroyed.

## svelte:window Bindings

You can bind to several window properties for reactive access to browser state:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let innerHeight = $state(0);
  let scrollY = $state(0);
  let online = $state(true);
</script>

<svelte:window bind:innerWidth bind:innerHeight bind:scrollY bind:online />

<div class="status-bar">
  <span>Viewport: {innerWidth} x {innerHeight}</span>
  <span>Scroll: {Math.round(scrollY)}px</span>
  <span>{online ? 'Online' : 'Offline'}</span>
</div>
```

Available bindings include `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `scrollX`, `scrollY`, `devicePixelRatio`, and `online`. The scroll bindings are two-way — you can write to them to programmatically scroll the page.

## Scroll-to-Top Button

Combining a scroll binding with `$derived`, you can build a scroll-to-top button:

```svelte
<script lang="ts">
  let scrollY = $state(0);
  let showButton = $derived(scrollY > 300);
</script>

<svelte:window bind:scrollY />

{#if showButton}
  <button class="scroll-top" onclick={() => scrollY = 0}>Back to Top</button>
{/if}
```

Setting `scrollY = 0` scrolls the page to the top because the binding is two-way.

## Responsive Layout with innerWidth

Use the reactive `innerWidth` binding to change layout based on screen size:

```svelte
<script lang="ts">
  let innerWidth = $state(0);
  let layout = $derived(innerWidth < 640 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop');
</script>

<svelte:window bind:innerWidth />

<nav>
  {#if layout === 'mobile'}
    <button>Menu</button>
  {:else}
    <a href="/">Home</a>
    <a href="/about">About</a>
    <a href="/contact">Contact</a>
  {/if}
</nav>
```

## svelte:document

The `<svelte:document>` element listens to events on the `document` object — useful for events like `visibilitychange`:

```svelte
<script lang="ts">
  let visible = $state(true);
  let hiddenCount = $state(0);
</script>

<svelte:document onvisibilitychange={() => {
  visible = !document.hidden;
  if (document.hidden) hiddenCount++;
}} />

<p>Tab is {visible ? 'visible' : 'hidden'}</p>
<p>You have left this tab {hiddenCount} time{hiddenCount === 1 ? '' : 's'}.</p>
```

## svelte:body

The `<svelte:body>` element listens to events on the `<body>`, most commonly for detecting when the mouse enters or leaves the page:

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

## svelte:head

The `<svelte:head>` element injects content into the HTML `<head>`. This is essential for SEO, page titles, and meta tags:

```svelte
<script lang="ts">
  let pageTitle = $state('Dashboard');
</script>

<svelte:head>
  <title>{pageTitle} | My App</title>
  <meta name="description" content="View your account dashboard." />
</svelte:head>

<h1>{pageTitle}</h1>
```

In SvelteKit, `<svelte:head>` works on both server and client. The server renders the head tags into the initial HTML response, which is critical for search engines.

## Keyboard Shortcut Handler

Combining `<svelte:window>` with keyboard events, you can build a shortcut system:

```svelte
<script lang="ts">
  let lastAction = $state('None');

  function handleShortcut(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 's') { e.preventDefault(); lastAction = 'Save'; }
    if (e.key === 'k') { e.preventDefault(); lastAction = 'Search'; }
  }
</script>

<svelte:window onkeydown={handleShortcut} />

<p>Last shortcut: <strong>{lastAction}</strong></p>
<p>Try Ctrl+S or Ctrl+K</p>
```

## Try It

Build a "reading progress" bar that uses `<svelte:window>` to bind `scrollY` and `innerHeight`, calculates the scroll percentage with `$derived`, and displays a fixed progress bar at the top of the viewport. Add a `<svelte:head>` tag that sets the page title. Bonus: use `<svelte:document>` to pause the indicator when the tab is hidden.

## Key Takeaways

- `<svelte:window>` lets you listen to window events and bind to properties like `innerWidth`, `scrollY`, and `online`
- Scroll bindings are two-way — set `scrollY = 0` to scroll the page programmatically
- `<svelte:document>` handles document-level events like `visibilitychange`
- `<svelte:body>` handles body-level events like `mouseenter` and `mouseleave`
- `<svelte:head>` injects tags into the HTML `<head>` — essential for page titles, meta tags, and SEO
- All special elements handle listener cleanup automatically when the component is destroyed
