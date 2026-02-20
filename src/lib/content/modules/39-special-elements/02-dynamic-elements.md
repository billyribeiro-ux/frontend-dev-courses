# Dynamic Elements

Sometimes you do not know at build time which HTML element to render, or you need to protect your UI from unexpected runtime errors. Svelte provides special elements for these situations — dynamic element rendering, error boundaries, component-level configuration, and module-scoped code.

## svelte:element

The `<svelte:element>` tag renders a dynamic HTML element based on a variable. This is useful when the element type is determined at runtime:

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

The `this` prop determines which element is rendered. If it is `null` or `undefined`, nothing renders. You can apply attributes, event handlers, and bindings just like a normal element.

## svelte:boundary (Error Boundaries)

Runtime errors in components can crash your entire application. The `<svelte:boundary>` element catches errors thrown by its children, letting you show a fallback UI instead of a blank page. This is new in Svelte 5.

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

## svelte:options

The `<svelte:options>` tag configures the compiler for a specific component. It goes at the top level of your `.svelte` file:

```svelte
<svelte:options runes={true} />
```

The `runes` option explicitly opts a component into Svelte 5 rune mode — useful in projects migrating from Svelte 4. For building web components, use `customElement`:

```svelte
<svelte:options customElement="my-counter" />

<script lang="ts">
  let count = $state(0);
</script>

<button onclick={() => count++}>Count: {count}</button>
```

This compiles the component as a native custom element usable in any HTML page. The `namespace` option (`"svg"` or `"mathml"`) is for components that render SVG or MathML content.

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

This is a common pattern for co-locating a component's TypeScript types with the component itself.

## Try It

Build a `DynamicHeading` component that accepts a `level` prop (1-6) and renders the appropriate heading element using `<svelte:element>`. Wrap it in a `<svelte:boundary>` so that if an invalid level is passed, the component throws an error and the boundary shows a fallback message with a retry button. Use `<script module>` to export a `type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6`.

## Key Takeaways

- `<svelte:element this={tag}>` renders dynamic HTML elements — the tag is determined at runtime
- `<svelte:boundary>` catches runtime errors in child components with `onerror` and renders a `failed` snippet as fallback
- Error boundaries let different sections of your UI fail independently without crashing the whole page
- `<svelte:options>` configures the compiler per component: `runes`, `customElement`, `namespace`
- `<script module>` runs once per module, not per instance — use it for shared state, types, and module-level exports
- Module-level exports are importable as named imports alongside the default component import
