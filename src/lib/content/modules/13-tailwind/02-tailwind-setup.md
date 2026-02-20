# Setting Up Tailwind v4

Tailwind CSS v4 is a major overhaul of the framework. It is faster, simpler to configure, and uses a new CSS-first approach. Gone is the `tailwind.config.js` file — customization now happens directly in your CSS using the `@theme` directive. Setup is also much simpler: one import and one Vite plugin.

This lesson walks you through installing and configuring Tailwind v4 in a SvelteKit project from scratch.

## Installation

Install Tailwind and its Vite plugin:

```bash
npm install tailwindcss @tailwindcss/vite
```

That is it for dependencies. No PostCSS config, no separate CLI tool.

## Adding the Vite Plugin

Open your `vite.config.ts` and add the Tailwind plugin:

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit()
  ]
});
```

The Tailwind plugin handles all the CSS processing automatically during development and production builds.

## Importing Tailwind in CSS

Create or update your global CSS file to import Tailwind:

```css
/* src/app.css */
@import 'tailwindcss';
```

That single line gives you access to every Tailwind utility class. Make sure this CSS file is imported in your root layout:

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
```

Start your dev server and Tailwind is ready:

```bash
npm run dev
```

## Customizing with @theme

In Tailwind v4, customization happens in CSS using the `@theme` directive. This replaces the old `tailwind.config.js` approach:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-brand: #ff3e00;
  --color-brand-light: #ff6b3d;
  --color-brand-dark: #cc3200;

  --font-heading: 'Inter', sans-serif;
  --font-body: 'Inter', sans-serif;

  --breakpoint-xs: 30rem;
}
```

Now you can use these custom values as Tailwind utilities:

```svelte
<h1 class="text-brand font-heading text-3xl">
  Welcome to My App
</h1>

<button class="bg-brand hover:bg-brand-light text-white px-4 py-2 rounded-lg">
  Get Started
</button>
```

## Extending the Default Theme

You can add to the existing Tailwind theme without replacing it. Custom colors, fonts, and spacing all merge with the defaults:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  /* Custom colors (added alongside default palette) */
  --color-primary: #ff3e00;
  --color-secondary: #676778;
  --color-accent: #6c5ce7;

  /* Custom spacing values */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;

  /* Custom border radius */
  --radius-card: 12px;
}
```

```svelte
<div class="bg-primary text-white p-18 rounded-card">
  Custom themed content
</div>
```

## Verifying the Setup

Create a test page to verify everything is working:

```svelte
<!-- src/routes/+page.svelte -->
<div class="min-h-screen bg-gray-50 flex items-center justify-center">
  <div class="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
    <h1 class="text-3xl font-bold text-gray-900 mb-4">
      Tailwind is Working!
    </h1>
    <p class="text-gray-600 mb-6">
      If you can see styled content, your setup is correct.
    </p>
    <button class="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition">
      Click Me
    </button>
  </div>
</div>
```

If you see a centered card with a blue button, Tailwind v4 is working correctly.

## Try It

Follow the installation steps to add Tailwind v4 to your SvelteKit project. Add custom brand colors using `@theme` in your `app.css`. Build a simple hero section using Tailwind utilities and your custom colors. Verify hover states and responsive prefixes work correctly.

## Key Takeaways

- Tailwind v4 uses `@import 'tailwindcss'` in your CSS file — no config file needed
- Install `tailwindcss` and `@tailwindcss/vite` as the only dependencies
- Add the Vite plugin to `vite.config.ts` for automatic CSS processing
- Customize your theme with the `@theme` directive directly in CSS
- Custom `@theme` values become usable Tailwind utilities automatically
- Import `app.css` in your root `+layout.svelte` to apply styles globally
