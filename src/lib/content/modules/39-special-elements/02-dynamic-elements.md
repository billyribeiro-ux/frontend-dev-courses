# Dynamic Elements

In most Svelte components, every HTML tag is known at compile time. You write `<h2>`, `<button>`, `<div>`, and the compiler knows exactly what DOM nodes to create. But there are legitimate cases where the tag itself is a runtime decision: a heading component that accepts a `level` prop, a rich text renderer that maps node types to semantic elements, or a design system primitive that can render as a `<button>` or an `<a>` depending on whether it receives an `href`.

Svelte handles these situations with special elements — compiler-recognized tags that give you declarative access to things that would otherwise require imperative DOM APIs like `document.createElement()`. The mental model is straightforward: wherever you would normally reach for a string-based DOM manipulation in vanilla JavaScript, Svelte probably has a special element that lets you express the same intent right in your template, with full reactivity and automatic cleanup.

The deeper architectural insight is this: these special elements are not runtime abstractions layered on top of the DOM. They are **compile-time instructions** that tell the Svelte compiler to generate different code paths. When you write `<svelte:element this={tag}>`, the compiler emits code that handles element creation, attribute diffing, and teardown for a tag name that is only known at runtime. Understanding this distinction matters because it explains both the capabilities and the limitations of each special element.

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

### The Teardown/Rebuild Mental Model

This teardown behavior has real performance implications that you must understand. Every time the `this` value changes:

1. Svelte removes all event listeners from the old element
2. Svelte destroys the old DOM node and all its children
3. Svelte creates a new DOM node with the new tag name
4. Svelte re-applies all attributes, classes, styles, and bindings
5. Svelte re-attaches all event listeners
6. If transitions are present, the old element runs its `out` transition and the new element runs its `in` transition

This means that any internal DOM state is lost — scroll position within a container, text selection, focus state, uncontrolled form input values. If the element contains a video player, playback resets. If it contains a canvas, the drawing is gone.

```svelte
<!-- WRONG: Changing the wrapper tag resets the input's value -->
<script lang="ts">
  let wrapper = $state<'div' | 'section'>('div');
  // The input inside will lose its typed text when wrapper changes!
</script>

<svelte:element this={wrapper}>
  <input type="text" placeholder="Type something, then change the wrapper..." />
</svelte:element>

<button onclick={() => wrapper = wrapper === 'div' ? 'section' : 'div'}>
  Toggle wrapper
</button>
```

```svelte
<!-- CORRECT: Bind the input value to preserve it across teardowns -->
<script lang="ts">
  let wrapper = $state<'div' | 'section'>('div');
  let inputValue = $state('');
</script>

<svelte:element this={wrapper}>
  <input type="text" bind:value={inputValue} placeholder="This value survives wrapper changes" />
</svelte:element>

<button onclick={() => wrapper = wrapper === 'div' ? 'section' : 'div'}>
  Toggle wrapper
</button>
```

The lesson: if your dynamic element wraps stateful children, make sure that state lives in your component (via `$state` or `bind:`), not in the DOM.

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

### The Falsy `this` Behavior

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

This is worth knowing because it can surprise you in subtle ways. If your tag variable is derived from data that might be missing, you will get invisible content — no error, no warning, just silence. This is one of the most common sources of "where did my content go?" debugging sessions:

```svelte
<!-- WRONG: If tagMap doesn't have the key, content vanishes silently -->
<script lang="ts">
  const tagMap: Record<string, string> = {
    heading: 'h2',
    paragraph: 'p',
    code: 'pre'
  };

  let nodeType = $state('emphasis'); // Not in tagMap!
  let resolvedTag = $derived(tagMap[nodeType]); // undefined!
</script>

<svelte:element this={resolvedTag}>
  This content is invisible and you will spend 30 minutes finding out why.
</svelte:element>
```

```svelte
<!-- CORRECT: Always provide a fallback -->
<script lang="ts">
  const tagMap: Record<string, string> = {
    heading: 'h2',
    paragraph: 'p',
    code: 'pre'
  };

  let nodeType = $state('emphasis');
  let resolvedTag = $derived(tagMap[nodeType] ?? 'span');
</script>

<svelte:element this={resolvedTag}>
  This content always renders, falling back to a span.
</svelte:element>
```

A useful defensive pattern for development is to add a derived check:

```svelte
<script lang="ts">
  let tag = $derived(computeTag());

  $effect(() => {
    if (!tag) {
      console.warn(`[DynamicElement] Resolved tag is falsy: ${tag}. Content will not render.`);
    }
  });
</script>
```

### Valid Tag Names and Security

`<svelte:element>` accepts any string as a tag name, but the browser will only create a valid HTML element. If you pass a nonsensical string like `'not-a-tag'`, the browser creates an `HTMLUnknownElement` — it renders, but it has no semantic meaning and no built-in behavior. This is by browser spec, not a Svelte concern.

More critically, `<svelte:element>` does **not** execute `<script>` tags. If the tag name is `'script'`, Svelte creates a `<script>` element in the DOM, but the browser will not execute it because it was inserted via `innerHTML`-adjacent mechanisms, not through the parser. This is important for security: a CMS or user-generated content system that maps node types to elements is not vulnerable to script injection through `<svelte:element>` tag names alone. However, you should still validate tag names against a known allowlist in any user-facing system.

```typescript
// In a rich text renderer, validate the tag name
const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'blockquote', 'pre', 'code', 'em', 'strong',
  'ul', 'ol', 'li', 'a', 'span', 'div'
]);

function resolveTag(nodeType: string): string {
  const tag = nodeTypeToTagMap[nodeType];
  if (!tag || !ALLOWED_TAGS.has(tag)) return 'div';
  return tag;
}
```

### When to Use svelte:element vs. Conditional Rendering

You might wonder: why not just use `{#if}` blocks?

```svelte
<!-- Conditional approach -->
{#if level === 1}
  <h1>{text}</h1>
{:else if level === 2}
  <h2>{text}</h2>
{:else if level === 3}
  <h3>{text}</h3>
{:else}
  <h4>{text}</h4>
{/if}

<!-- Dynamic element approach -->
<svelte:element this={`h${level}`}>{text}</svelte:element>
```

Both work, but they make different tradeoffs:

**Use `<svelte:element>`** when the tag is the only thing that changes and the content, attributes, and behavior are identical across tags. Heading levels, semantic wrappers (`section` vs. `article` vs. `div`), and polymorphic design system primitives are all good fits.

**Use `{#if}` blocks** when different tags need different attributes, children, or behavior. A component that renders as a `<button>` with `onclick` or an `<a>` with `href` and `target` is usually clearer with explicit branches, because each branch can have its own attribute set without runtime conditionals.

The real-world test: if you find yourself writing a lot of conditional attributes *inside* the `<svelte:element>`, you have probably outgrown it. Switch to `{#if}` branches where each path is explicit and self-documenting:

```svelte
<!-- WRONG: Too many conditionals inside svelte:element -->
<script lang="ts">
  interface Props {
    href?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
    children: import('svelte').Snippet;
  }

  let { href, disabled, type = 'button', children }: Props = $props();
  let tag = $derived(href ? 'a' : 'button');
</script>

<svelte:element
  this={tag}
  href={tag === 'a' ? href : undefined}
  target={tag === 'a' ? '_blank' : undefined}
  rel={tag === 'a' ? 'noopener noreferrer' : undefined}
  disabled={tag === 'button' ? disabled : undefined}
  type={tag === 'button' ? type : undefined}
  role={tag === 'a' ? 'button' : undefined}
>
  {@render children()}
</svelte:element>
```

```svelte
<!-- CORRECT: Separate branches are clearer -->
<script lang="ts">
  interface Props {
    href?: string;
    disabled?: boolean;
    type?: 'button' | 'submit';
    children: import('svelte').Snippet;
  }

  let { href, disabled, type = 'button', children }: Props = $props();
</script>

{#if href}
  <a {href} target="_blank" rel="noopener noreferrer" role="button">
    {@render children()}
  </a>
{:else}
  <button {type} {disabled}>
    {@render children()}
  </button>
{/if}
```

### A Practical Example: Polymorphic Box Component

Design systems often need a "Box" or "Container" primitive that renders as different semantic elements. This is one of the most common uses of `<svelte:element>` in production:

```svelte
<!-- Box.svelte -->
<script module lang="ts">
  export type BoxTag = 'div' | 'section' | 'article' | 'aside' | 'main' | 'nav' | 'header' | 'footer';

  export interface BoxProps {
    as?: BoxTag;
    padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
    rounded?: boolean;
    children: import('svelte').Snippet;
  }
</script>

<script lang="ts">
  let { as = 'div', padding = 'md', rounded = true, children }: BoxProps = $props();

  const padClasses: Record<NonNullable<BoxProps['padding']>, string> = {
    none: '',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6',
    xl: 'p-8'
  };
</script>

<svelte:element
  this={as}
  class="box {padClasses[padding]} {rounded ? 'rounded-lg' : ''}"
>
  {@render children()}
</svelte:element>
```

Usage:

```svelte
<Box as="section" padding="lg">
  <h2>Dashboard</h2>
  <p>Welcome back.</p>
</Box>

<Box as="aside" padding="sm">
  <p>Sidebar content</p>
</Box>

<Box as="nav" padding="md">
  <a href="/">Home</a>
  <a href="/about">About</a>
</Box>
```

This pattern is common in component libraries like Chakra UI and Radix. The `as` prop lets consumers control semantics without the library needing to anticipate every possible element. Notice the type constraint on `BoxTag` — this prevents consumers from passing arbitrary strings like `'script'` or `'iframe'`.

### Rich Text Renderer Pattern

One of the most powerful uses of `<svelte:element>` is rendering structured content from a CMS or Markdown parser. Each node in the content tree maps to an HTML element:

```svelte
<!-- RichTextNode.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface ContentNode {
    type: string;
    text?: string;
    children?: ContentNode[];
    attrs?: Record<string, string>;
  }

  interface Props {
    node: ContentNode;
  }

  let { node }: Props = $props();

  const typeToTag: Record<string, string> = {
    paragraph: 'p',
    heading1: 'h1',
    heading2: 'h2',
    heading3: 'h3',
    blockquote: 'blockquote',
    'code-block': 'pre',
    'list-ordered': 'ol',
    'list-unordered': 'ul',
    'list-item': 'li',
    emphasis: 'em',
    strong: 'strong',
  };

  let tag = $derived(typeToTag[node.type] ?? 'span');
</script>

<svelte:element this={tag} {...node.attrs}>
  {#if node.text}
    {node.text}
  {/if}
  {#if node.children}
    {#each node.children as child}
      <svelte:self node={child} />
    {/each}
  {/if}
</svelte:element>
```

This recursive pattern renders an entire document tree. Each node resolves its tag from the map, renders its text content, and recursively renders children. The `<svelte:self>` tag lets the component call itself for nested nodes. The `{...node.attrs}` spread passes through any HTML attributes (like `href` on links) from the CMS data.

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
- Lazy-load them with dynamic `import()`

```svelte
<script lang="ts">
  import type { Component } from 'svelte';
  import Header from './Header.svelte';
  import Sidebar from './Sidebar.svelte';
  import Footer from './Footer.svelte';

  interface LayoutSlot {
    component: Component;
    props: Record<string, unknown>;
  }

  let slots: LayoutSlot[] = $state([
    { component: Header, props: { title: 'My App' } },
    { component: Sidebar, props: { collapsed: false } },
    { component: Footer, props: { year: 2026 } }
  ]);
</script>

{#each slots as { component: Cmp, props }}
  <Cmp {...props} />
{/each}
```

This pattern is how you build plugin systems, configurable dashboards, and layout engines. The component itself becomes data.

### Lazy-Loading Dynamic Components

In production applications, you often want to load components only when they are needed. Combine dynamic components with `import()` for code-splitting:

```svelte
<script lang="ts">
  import type { Component } from 'svelte';

  let ActiveWidget: Component | null = $state(null);
  let loading = $state(false);

  async function loadWidget(name: string) {
    loading = true;
    try {
      // Vite creates a separate chunk for each dynamic import
      const module = await import(`$lib/widgets/${name}.svelte`);
      ActiveWidget = module.default;
    } catch (e) {
      console.error(`Failed to load widget: ${name}`, e);
      ActiveWidget = null;
    } finally {
      loading = false;
    }
  }
</script>

<nav>
  <button onclick={() => loadWidget('TextWidget')}>Text</button>
  <button onclick={() => loadWidget('ChartWidget')}>Chart</button>
  <button onclick={() => loadWidget('HeavyAnalytics')}>Analytics</button>
</nav>

{#if loading}
  <div class="p-8 text-center text-gray-400">Loading widget...</div>
{:else if ActiveWidget}
  <ActiveWidget />
{:else}
  <p class="text-gray-400">Select a widget</p>
{/if}
```

Each widget is a separate JavaScript chunk. The `HeavyAnalytics` component — which might pull in D3 and other large dependencies — is never downloaded until the user clicks the button. This is a significant performance win for dashboards with many optional features.

### The svelte:component Fallback and Migration

`<svelte:component>` still works in Svelte 5 and you will see it in codebases that have not migrated. The key behavioral differences from the Svelte 5 direct-variable approach:

| Behavior | `<svelte:component this={C}>` | `<C />` (Svelte 5) |
|---|---|---|
| Falsy `this` | Renders nothing silently | Runtime error |
| Component type | Any value | Must be a valid component |
| Syntax overhead | More verbose | Minimal |
| IDE support | Limited | Full autocomplete and type checking |

Guard against falsy values when using direct variables:

```svelte
<!-- WRONG: Will error if ActiveWidget is undefined -->
<ActiveWidget />

<!-- CORRECT: Guard with {#if} -->
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
    <div class="error-card">
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
```

### Error Boundary Architecture: The Bulkhead Pattern

Think of error boundaries as bulkheads on a ship. A leak in one compartment does not sink the vessel. In practice, wrap each independent feature area in its own boundary — especially anything that depends on third-party data or user-generated content:

```svelte
<script lang="ts">
  import UserProfile from '$lib/components/UserProfile.svelte';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
  import RecommendationEngine from '$lib/components/RecommendationEngine.svelte';

  function logError(area: string) {
    return (error: Error) => {
      // Send to your error tracking service
      console.error(`[${area}] Component error:`, error);
      // trackError({ area, message: error.message, stack: error.stack });
    };
  }
</script>

<div class="dashboard-grid">
  <svelte:boundary onerror={logError('profile')}>
    <UserProfile />
    {#snippet failed(error, reset)}
      <div class="error-panel">
        <p>Could not load profile.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>

  <svelte:boundary onerror={logError('feed')}>
    <ActivityFeed />
    {#snippet failed(error, reset)}
      <div class="error-panel">
        <p>Could not load activity.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>

  <svelte:boundary onerror={logError('recommendations')}>
    <RecommendationEngine />
    {#snippet failed(error, reset)}
      <div class="error-panel">
        <p>Recommendations unavailable.</p>
        <button onclick={reset}>Retry</button>
      </div>
    {/snippet}
  </svelte:boundary>
</div>
```

### What Error Boundaries Do and Do Not Catch

Error boundaries catch synchronous errors thrown during component rendering and `$effect` execution. They do **not** catch:

- Errors in event handlers (these are caught by the browser's normal error handling)
- Errors in `setTimeout` or `setInterval` callbacks
- Errors in `async` functions after an `await` point
- Errors thrown in the boundary component itself (only children are caught)

```svelte
<!-- This error IS caught by the parent boundary -->
<script lang="ts">
  let count = $state(0);

  // Throws during rendering — caught by boundary
  if (count < 0) {
    throw new Error('Count cannot be negative');
  }
</script>

<!-- This error is NOT caught by the parent boundary -->
<script lang="ts">
  function handleClick() {
    // Event handler errors are not caught by svelte:boundary
    throw new Error('Click handler failed');
  }
</script>
<button onclick={handleClick}>Click</button>
```

For event handler errors, use try/catch within the handler itself. For async errors, handle them with standard promise error handling.

### Reset Behavior Deep Dive

When `reset()` is called, Svelte completely destroys the failed children and re-mounts them from scratch. This means:

- All component state is reset to initial values
- All `$effect` callbacks run again
- If the error was caused by bad data, and the data has not changed, the error will happen again immediately

For transient errors (network timeouts, race conditions), reset works well. For errors caused by bad data, you need to fix the data before resetting:

```svelte
<svelte:boundary onerror={(error) => console.error(error)}>
  <DataDrivenWidget {data} />

  {#snippet failed(error, reset)}
    <div class="error-panel">
      <p>Widget failed: {error.message}</p>
      <button onclick={() => {
        // Fix the data before resetting
        data = getDefaultData();
        reset();
      }}>
        Reset with defaults
      </button>
    </div>
  {/snippet}
</svelte:boundary>
```

## svelte:options — Compiler Configuration

The `<svelte:options>` tag configures the compiler for a specific component. It must appear at the top level of your `.svelte` file, outside any `<script>` or element:

```svelte
<svelte:options runes={true} />
```

### Available Options

**`runes`** — Explicitly opts a component into (or out of) Svelte 5 rune mode. This is critical during migration: in a mixed codebase, you can convert components one at a time by adding `runes={true}` to components that are ready for Svelte 5 reactivity while leaving legacy components untouched. In a greenfield Svelte 5 project, this is the default and you never need it.

**`customElement`** — Compiles the component as a native Web Component (Custom Element):

```svelte
<svelte:options customElement="my-counter" />

<script lang="ts">
  let count = $state(0);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

This produces a real custom element usable in any HTML page, any framework, or no framework at all. The tag name must contain a hyphen (that is a Web Components spec requirement, not a Svelte one). The `customElement` option also accepts an object for advanced configuration — shadow DOM mode, props handling, and lifecycle callbacks:

```svelte
<svelte:options
  customElement={{
    tag: 'my-counter',
    shadow: 'open',
    props: {
      count: { reflect: true, type: 'Number' }
    }
  }}
/>
```

**`namespace`** — Set to `"svg"` or `"mathml"` for components that render SVG or MathML content. Without this, Svelte creates elements in the HTML namespace, which will silently break SVG rendering:

```svelte
<!-- WRONG: Without namespace, SVG elements are created in HTML namespace -->
<circle cx="50" cy="50" r="40" fill="blue" />

<!-- CORRECT: Set namespace for SVG components -->
<svelte:options namespace="svg" />
<circle cx="50" cy="50" r="40" fill="blue" />
```

**`css`** — Set to `"injected"` to force styles to be injected at runtime rather than extracted at build time. This is primarily useful for custom elements where style extraction does not apply.

## The Window, Document, Body, and Head Elements

Svelte provides four special elements for interacting with the browser environment outside your component tree: `<svelte:window>`, `<svelte:document>`, `<svelte:body>`, and `<svelte:head>`. These are covered in depth in the [Window & Document](/modules/39-special-elements/01-window-document) lesson, but here is how they fit into the bigger picture.

The mental model: your component template describes a subtree of the DOM. But some concerns live *above* that subtree — scroll position on the window, visibility state on the document, mouse presence on the body, meta tags in the head. These special elements let you reach up and interact with those global objects declaratively, without imperative `addEventListener` calls or `onMount` cleanup boilerplate.

| Element | Target | Common use cases |
|---|---|---|
| `<svelte:window>` | `window` | Keyboard shortcuts, scroll position, resize, online/offline |
| `<svelte:document>` | `document` | Visibility change, fullscreen, selection change |
| `<svelte:body>` | `<body>` | Mouse enter/leave, drag-and-drop over the page |
| `<svelte:head>` | `<head>` | Page title, meta tags, Open Graph, structured data |

The key architectural insight: Svelte attaches and removes these listeners as part of the component lifecycle. When the component is destroyed, the listeners vanish. This means you can use these elements inside conditionally rendered components and the cleanup is automatic. No memory leaks, no stale listeners.

`<svelte:head>` deserves special attention in SvelteKit applications. It is how you control SEO — the server renders your head tags into the initial HTML response, so search engine crawlers see proper `<title>` and `<meta>` tags without waiting for JavaScript:

```svelte
<!-- +page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.product.name} | My Store</title>
  <meta name="description" content={data.product.summary} />
  <meta property="og:title" content={data.product.name} />
  <meta property="og:image" content={data.product.imageUrl} />
</svelte:head>
```

### Head Tag Deduplication and Ordering

When multiple components render `<svelte:head>` content, Svelte appends them in component mount order. This means a child page component's `<title>` appears after a layout component's `<title>`, and the browser uses the last one. This is usually what you want — the most specific component wins:

```svelte
<!-- +layout.svelte sets a default title -->
<svelte:head>
  <title>My Store</title>
</svelte:head>

<!-- +page.svelte overrides with a specific title -->
<svelte:head>
  <title>{data.product.name} | My Store</title>
</svelte:head>
<!-- Browser uses this one because it appears last in the DOM -->
```

However, Svelte does not deduplicate `<meta>` tags. If both layout and page set `<meta name="description">`, you get two — which is invalid HTML. Handle this by only setting meta tags at the most specific level, or by using a shared SEO component that accepts all values and renders them once.

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
</script>

<script lang="ts">
  instanceCount++;
  let id = $state(instanceCount);
</script>

<p>I am instance #{id} of {instanceCount} total.</p>
```

Module-level exports are importable as named imports alongside the default component import:

```typescript
import MyComponent, { type TabItem } from '$lib/components/MyComponent.svelte';
```

This is a common pattern for co-locating a component's TypeScript types with the component itself. It also works for exporting constants, helper functions, or anything else that does not depend on a specific component instance.

### When Module-Level Code Goes Wrong

A common and dangerous pitfall: module-level state is shared across all instances of the component, which means it is also shared across all requests on the server. In SvelteKit, if you put mutable state in `<script module>`, one user's request can leak data into another user's response:

```svelte
<!-- WRONG: Mutable module-level state leaks between SSR requests -->
<script module lang="ts">
  let cachedUser: User | null = null; // Shared across ALL requests!
</script>

<script lang="ts">
  import { onMount } from 'svelte';

  onMount(async () => {
    if (!cachedUser) {
      cachedUser = await fetchUser();
    }
  });
</script>
```

```svelte
<!-- CORRECT: Use instance-level state for mutable data -->
<script module lang="ts">
  // Only constants and types here
  export interface User {
    id: number;
    name: string;
  }

  export const ROLES = ['admin', 'editor', 'viewer'] as const;
</script>

<script lang="ts">
  let user: User | null = $state(null);

  $effect(() => {
    fetchUser().then(u => user = u);
  });
</script>
```

The rule is simple: `<script module>` for immutable data (types, constants, pure functions). `<script>` with `$state` for anything mutable.

## The Big Picture: Special Elements as Declarative Escape Hatches

Step back and look at what all these special elements have in common. Each one takes something that would normally require imperative JavaScript — `document.createElement(tagName)`, `window.addEventListener(...)`, `document.head.appendChild(...)` — and wraps it in declarative template syntax that the compiler can reason about, optimize, and clean up.

This is the same philosophy behind Svelte's reactivity system. Instead of manually calling `setState()` or `forceUpdate()`, you write `$state` and let the compiler generate the update code. Special elements extend that principle to parts of the browser API that live outside the component tree.

The architectural hierarchy looks like this:

| Need | Imperative approach | Svelte declarative equivalent |
|---|---|---|
| Dynamic tag name | `document.createElement(tag)` | `<svelte:element this={tag}>` |
| Dynamic component | Manual mount/destroy | `<Component />` with reactive variable |
| Error isolation | `try/catch` in lifecycle | `<svelte:boundary>` |
| Window events | `window.addEventListener(...)` | `<svelte:window on...>` |
| Document events | `document.addEventListener(...)` | `<svelte:document on...>` |
| Body events | `document.body.addEventListener(...)` | `<svelte:body on...>` |
| Head management | `document.head.appendChild(...)` | `<svelte:head>` |
| Compiler config | CLI flags, config files | `<svelte:options>` |
| Module scope | Separate JS files | `<script module>` |

When you encounter a situation where you are reaching for raw DOM APIs in `onMount`, ask yourself: is there a special element that already handles this? More often than not, there is.

## Try It

Build a configurable "Card" component that exercises multiple special element patterns in concert:

1. **Polymorphic wrapper:** Accept an `as` prop (defaulting to `'div'`) constrained to `'div' | 'section' | 'article' | 'aside'`. Render the card wrapper with `<svelte:element this={as}>`. Add a fallback so that invalid values default to `'div'`.

2. **Dynamic heading:** Accept a `heading` prop (string) and a `headingLevel` prop (1-6). Render the heading with `<svelte:element this={`h${headingLevel}`}>`. Validate the level and clamp it to the 1-6 range.

3. **Dynamic widget:** Accept a `widget` prop of type `Component | null`. If provided, render it dynamically inside the card using the Svelte 5 direct-variable pattern (no `<svelte:component>`). If null, render a default "No widget loaded" message. Include a guard `{#if}` to prevent runtime errors from falsy component values.

4. **Error isolation:** Wrap the dynamic widget in a `<svelte:boundary>` with an `onerror` handler that logs the error with the card's heading for context. The `failed` snippet should display "Widget failed to load" with the error message and a "Retry" button that calls `reset`.

5. **Type export:** Use `<script module>` to export a `CardProps` interface with the full prop types. Verify you can import the type from another component: `import Card, { type CardProps } from './Card.svelte'`.

6. **Test the boundary:** Create a `BrokenWidget.svelte` that throws an error after incrementing a counter past 3. Mount it inside your Card and verify the boundary catches the error, displays the fallback, and resets successfully.

## Key Takeaways

- `<svelte:element this={tag}>` renders dynamic HTML elements — when `this` is falsy, nothing renders at all (no error, no output), which is a common source of invisible content bugs
- The element is fully torn down and rebuilt when the tag changes — all internal DOM state (focus, scroll, selection) is lost, so bind stateful children to `$state`
- Use `<svelte:element>` when only the tag changes; use `{#if}` blocks when different tags need different attributes and behavior — if you have more than two conditional attributes, switch to `{#if}`
- Always validate and provide fallbacks for dynamic tag names, especially when the tag comes from external data (CMS, user input, API responses)
- In Svelte 5, dynamic components do not need `<svelte:component>` — store a component in a reactive variable and render it directly with `<Component />`
- Components are first-class values in Svelte 5: store them in arrays, pass them as props, lazy-load them with `import()`, use them in Map or Record lookups
- Unlike `<svelte:component>`, the direct variable approach throws a runtime error on falsy values — always guard with `{#if}`
- `<svelte:boundary>` catches synchronous rendering errors in child components — it does **not** catch event handler errors, async errors after await, or setTimeout callbacks
- The `reset()` function destroys and re-mounts children from scratch — if the error was caused by bad data, fix the data before calling reset
- `<svelte:options>` configures the compiler per component: `runes`, `customElement` (with optional shadow DOM and reflected props), `namespace`, `css`
- `<svelte:head>` appends content in mount order — the last `<title>` wins, but `<meta>` tags are not deduplicated
- `<script module>` runs once per module, not per instance — use it exclusively for types, constants, and pure functions; never for mutable state, which leaks between SSR requests
- Special elements are declarative escape hatches that replace imperative DOM APIs with template syntax the compiler can optimize, type-check, and automatically clean up
