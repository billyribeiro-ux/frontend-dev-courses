# Code Splitting

When a user visits your app, the browser downloads JavaScript before anything interactive can happen. The more JavaScript you ship, the longer users wait. **Code splitting** breaks your app into smaller chunks so the browser only downloads what is needed for the current page.

The great news: SvelteKit does code splitting automatically. Every route gets its own chunk, so visiting the home page does not force users to download the JavaScript for your admin dashboard. But understanding how this works — and how to take it further — helps you build faster apps.

## How SvelteKit Auto-Splits Code

SvelteKit creates a separate JavaScript bundle for each route. When a user navigates to a page, the browser downloads only the code for that specific route:

```
src/routes/
  +page.svelte        → chunk for "/"
  about/+page.svelte  → chunk for "/about"
  blog/+page.svelte   → chunk for "/blog"
```

Shared code (components, utilities) gets extracted into common chunks that are loaded once and reused across routes. You do not need to configure any of this — it happens automatically through Vite's bundling.

## Dynamic Imports

For components that are not needed immediately, use dynamic `import()` to load them on demand:

```svelte
<script lang="ts">
  let showEditor = $state(false);
  let EditorComponent: any = $state(null);

  async function openEditor() {
    if (!EditorComponent) {
      const module = await import('$lib/components/RichTextEditor.svelte');
      EditorComponent = module.default;
    }
    showEditor = true;
  }
</script>

<button onclick={openEditor}>Open Editor</button>

{#if showEditor && EditorComponent}
  <EditorComponent />
{/if}
```

The `RichTextEditor` bundle is not downloaded until the user clicks the button. This is perfect for heavy components like editors, charts, and maps.

## Lazy Loading Components

Create a reusable lazy-loading wrapper:

```svelte
<!-- src/lib/components/Lazy.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let { loader, ...rest }: { loader: () => Promise<any>; [key: string]: any } = $props();
  let Component: any = $state(null);
  let loading = $state(true);

  onMount(async () => {
    const module = await loader();
    Component = module.default;
    loading = false;
  });
</script>

{#if loading}
  <div class="skeleton" aria-busy="true">Loading...</div>
{:else if Component}
  <Component {...rest} />
{/if}
```

Use it anywhere:

```svelte
<Lazy loader={() => import('$lib/components/Chart.svelte')} data={chartData} />
```

## Reducing Initial Bundle Size

Beyond route-based splitting, you can reduce what ships on first load:

**1. Audit your imports** — Large libraries can bloat bundles:

```typescript
// Bad: imports the entire library
import _ from 'lodash';
_.debounce(fn, 300);

// Good: import only what you need
import debounce from 'lodash/debounce';
debounce(fn, 300);

// Best: write it yourself (debounce is ~10 lines)
```

**2. Check your bundle** — Use the Vite bundle analyzer:

```bash
npm install -D rollup-plugin-visualizer
```

```typescript
// vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    sveltekit(),
    visualizer({ open: true, gzipSize: true })
  ]
});
```

Run `npm run build` and a visual treemap opens showing exactly what is in your bundle.

**3. Move heavy code server-side** — If a library is only used in `+page.server.ts` or `+server.ts`, it never ships to the browser:

```typescript
// This code only runs on the server — never bundled for the client
// src/routes/api/pdf/+server.ts
import PDFDocument from 'pdfkit';
```

## Preloading

SvelteKit preloads the next page's code when a user hovers over a link, making navigation feel instant:

```svelte
<!-- SvelteKit preloads this automatically on hover -->
<a href="/products">Products</a>

<!-- Disable preloading for rarely-visited pages -->
<a href="/terms" data-sveltekit-preload-data="off">Terms</a>
```

## Try It

Run the bundle visualizer on your project. Identify the three largest dependencies in your client bundle. For each one, determine if it can be dynamically imported, replaced with a smaller alternative, or moved to server-only code.

## Key Takeaways

- SvelteKit automatically code-splits by route so each page only loads its own JavaScript
- Use dynamic `import()` for heavy components that are not needed on initial render
- Audit your bundle with `rollup-plugin-visualizer` to find unexpectedly large dependencies
- Import specific functions from libraries instead of the entire package
- Move heavy processing to `+server.ts` or `+page.server.ts` to keep it off the client
- SvelteKit preloads linked pages on hover for near-instant navigation
