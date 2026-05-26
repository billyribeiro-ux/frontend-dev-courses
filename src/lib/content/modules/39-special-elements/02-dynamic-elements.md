# Dynamic Elements

In most Svelte components, every HTML tag is known at compile time. You write `<h2>`, `<button>`, `<div>`, and the compiler knows exactly what DOM nodes to create. But there are legitimate cases where the tag itself is a runtime decision: a heading component that accepts a `level` prop, a rich text renderer that maps node types to semantic elements, or a design system primitive that can render as a `<button>` or an `<a>` depending on whether it receives an `href`.

Svelte handles these situations with special elements — compiler-recognized tags that give you declarative access to things that would otherwise require imperative DOM APIs like `document.createElement()`. The mental model is straightforward: wherever you would normally reach for a string-based DOM manipulation in vanilla JavaScript, Svelte probably has a special element that lets you express the same intent right in your template, with full reactivity and automatic cleanup.

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

The real-world test: if you find yourself writing a lot of conditional attributes *inside* the `<svelte:element>`, you have probably outgrown it. Switch to `{#if}` branches where each path is explicit and self-documenting.

### A Practical Example: Polymorphic Box Component

Design systems often need a "Box" or "Container" primitive that renders as different semantic elements:

```svelte
<!-- Box.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    as?: string;
    padding?: 'sm' | 'md' | 'lg';
    children: Snippet;
  }

  let { as = 'div', padding = 'md', children }: Props = $props();
</script>

<svelte:element this={as} class="box box--{padding}">
  {@render children()}
</svelte:element>

<style>
  .box { border-radius: 8px; }
  .box--sm { padding: 0.5rem; }
  .box--md { padding: 1rem; }
  .box--lg { padding: 2rem; }
</style>
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
```

This pattern is common in component libraries like Chakra UI and Radix. The `as` prop lets consumers control semantics without the library needing to anticipate every possible element.

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
    <div class="error-card">
      <h3>Something went wrong</h3>
      <p>{error.message}</p>
      <button onclick={reset}>Try Again</button>
    </div>
  {/snippet}
</svelte:boundary>
```

Clicking "Try Again" calls `reset`, which re-mounts the child component from scratch. Error boundaries are especially powerful when wrapping independent sections of your UI — one section can fail without taking down the rest:

```svelte
<script lang="ts">
  import UserProfile from '$lib/components/UserProfile.svelte';
  import ActivityFeed from '$lib/components/ActivityFeed.svelte';
</script>

<svelte:boundary>
  <UserProfile />
  {#snippet failed(error, reset)}
    <p>Could not load profile. <button onclick={reset}>Retry</button></p>
  {/snippet}
</svelte:boundary>

<svelte:boundary>
  <ActivityFeed />
  {#snippet failed(error, reset)}
    <p>Could not load activity. <button onclick={reset}>Retry</button></p>
  {/snippet}
</svelte:boundary>
```

Think of error boundaries as bulkheads on a ship. A leak in one compartment does not sink the vessel. In practice, wrap each independent feature area in its own boundary — especially anything that depends on third-party data or user-generated content.

## svelte:options — Compiler Configuration

The `<svelte:options>` tag configures the compiler for a specific component. It must appear at the top level of your `.svelte` file, outside any `<script>` or element:

```svelte
<svelte:options runes={true} />
```

### Available Options

**`runes`** — Explicitly opts a component into (or out of) Svelte 5 rune mode. This is critical during migration: in a mixed codebase, you can convert components one at a time by adding `runes={true}` to components that are ready for Svelte 5 reactivity while leaving legacy components untouched.

**`customElement`** — Compiles the component as a native Web Component (Custom Element):

```svelte
<svelte:options customElement="my-counter" />

<script lang="ts">
  let count = $state(0);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

This produces a real custom element usable in any HTML page, any framework, or no framework at all. The tag name must contain a hyphen (that is a Web Components spec requirement, not a Svelte one). The `customElement` option also accepts an object for advanced configuration — shadow DOM mode, props handling, and lifecycle callbacks.

**`namespace`** — Set to `"svg"` or `"mathml"` for components that render SVG or MathML content. Without this, Svelte creates elements in the HTML namespace, which will silently break SVG rendering.

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

A common pitfall: module-level state is shared across all instances of the component, which means it is also shared across all requests on the server. In SvelteKit, if you put mutable state in `<script module>`, one user's request can leak data into another user's response. Use module-level code for constants and types. Use instance-level `$state` for anything mutable.

## The Big Picture: Special Elements as Declarative Escape Hatches

Step back and look at what all these special elements have in common. Each one takes something that would normally require imperative JavaScript — `document.createElement(tagName)`, `window.addEventListener(...)`, `document.head.appendChild(...)` — and wraps it in declarative template syntax that the compiler can reason about, optimize, and clean up.

This is the same philosophy behind Svelte's reactivity system. Instead of manually calling `setState()` or `forceUpdate()`, you write `$state` and let the compiler generate the update code. Special elements extend that principle to parts of the browser API that live outside the component tree.

When you encounter a situation where you are reaching for raw DOM APIs in `onMount`, ask yourself: is there a special element that already handles this? More often than not, there is.

## Try It

Build a configurable "Card" component that uses three special element patterns together:

1. Accept an `as` prop (defaulting to `'div'`) and render the card wrapper with `<svelte:element this={as}>`.
2. Accept a `heading` prop and a `headingLevel` prop (1-6). Render the heading with `<svelte:element this={`h${headingLevel}`}>`.
3. Accept a `component` prop of type `Component | null`. If provided, render it dynamically inside the card using the Svelte 5 direct-variable pattern. If null, render default content.
4. Wrap the dynamic component in a `<svelte:boundary>` so that a failing component shows a "Widget failed to load" message with a retry button.
5. Use `<script module>` to export `type CardProps` with the full interface.

Test it by creating a component that intentionally throws, and verify the error boundary catches it while the rest of the card still renders.

## Key Takeaways

- `<svelte:element this={tag}>` renders dynamic HTML elements — when `this` is falsy, nothing renders at all (no error, no output)
- Use `<svelte:element>` when only the tag changes; use `{#if}` blocks when different tags need different attributes and behavior
- In Svelte 5, dynamic components do not need `<svelte:component>` — store a component in a reactive variable and render it directly with `<Component />`
- Components are first-class values in Svelte 5: store them in arrays, pass them as props, use them in lookups
- `<svelte:boundary>` catches runtime errors in child components with `onerror` and renders a `failed` snippet as fallback
- `<svelte:options>` configures the compiler per component: `runes`, `customElement`, `namespace`, `css`
- `<svelte:window>`, `<svelte:document>`, `<svelte:body>`, and `<svelte:head>` give declarative access to browser globals with automatic lifecycle cleanup
- `<svelte:head>` is critical for SEO in SvelteKit — the server renders head tags into the initial HTML response
- `<script module>` runs once per module, not per instance — use it for types and constants, never for mutable per-request state
- Special elements are declarative escape hatches: they replace imperative DOM APIs with template syntax the compiler can optimize and clean up
