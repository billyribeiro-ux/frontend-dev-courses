# Project Tour

You have a running SvelteKit project. Now let's understand what all those files and folders actually do. Knowing your way around the project structure is essential — it tells you where to put pages, components, images, and configuration.

SvelteKit uses a **file-based routing** system, which means the files and folders you create inside `src/routes/` directly map to URLs in your browser. There is no separate router configuration file. This convention-over-configuration approach makes SvelteKit projects predictable and easy to navigate.

## The Project Structure

Here is what a fresh SvelteKit project looks like:

```bash
my-app/
├── src/
│   ├── routes/
│   │   └── +page.svelte      # Home page (localhost:5173/)
│   ├── lib/
│   │   └── index.ts           # Shared utilities & components
│   └── app.html               # The HTML shell for your app
├── static/
│   └── favicon.png            # Static assets (images, fonts)
├── svelte.config.js           # SvelteKit configuration
├── vite.config.ts             # Vite bundler configuration
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript configuration
```

## src/routes — Your Pages

This is where you spend most of your time. Every `+page.svelte` file inside `src/routes/` becomes a page on your site:

```bash
src/routes/
├── +page.svelte               # → /
├── about/
│   └── +page.svelte           # → /about
└── blog/
    ├── +page.svelte           # → /blog
    └── [slug]/
        └── +page.svelte       # → /blog/any-post-title
```

The `+page.svelte` naming convention is required. SvelteKit uses the `+` prefix to distinguish special files from regular components.

## src/lib — Shared Code

The `src/lib/` directory holds reusable components, utilities, and data that are shared across pages. SvelteKit provides the `$lib` alias so you can import from it cleanly:

```svelte
<script lang="ts">
  import Button from '$lib/components/Button.svelte';
  import { formatDate } from '$lib/utils';
</script>

<Button>Click me</Button>
```

No more `../../../` import paths. The `$lib` alias always points to `src/lib/`.

## static/ — Static Assets

Files in the `static/` directory are served as-is at the root of your site. Put images, fonts, `robots.txt`, and other files here:

```svelte
<!-- Referencing a file in static/ -->
<img src="/hero-image.jpg" alt="Hero" />
<link rel="icon" href="/favicon.png" />
```

Notice the path starts with `/` — no need to reference the `static` folder by name.

## Configuration Files

- **svelte.config.js** — Controls SvelteKit behavior: adapters for deployment, preprocessors, path aliases
- **vite.config.ts** — Configures the Vite bundler that powers the dev server and builds
- **package.json** — Lists your dependencies and defines scripts like `dev`, `build`, and `lint`

## How File-Based Routing Works

The key insight is that folder structure equals URL structure. When you create a file at `src/routes/contact/+page.svelte`, SvelteKit automatically creates a `/contact` route. No imports, no router config, no wiring — just create the file and it works.

```svelte
<!-- src/routes/contact/+page.svelte -->
<h1>Contact Us</h1>
<p>Send us a message at hello@example.com</p>
```

Visit `http://localhost:5173/contact` and there is your page.

## Try It

Open your project in VS Code. Create a new folder at `src/routes/about/` and add a `+page.svelte` file inside it with a heading and a paragraph. Start your dev server and visit `http://localhost:5173/about` to see your new page. Then explore the other files in the project to familiarize yourself with the structure.

## Key Takeaways

- `src/routes/` contains your pages — each `+page.svelte` maps to a URL
- `src/lib/` holds shared components and utilities, accessible via the `$lib` alias
- `static/` stores images, fonts, and other assets served at the site root
- SvelteKit uses **file-based routing** — folder structure equals URL structure
- The `+` prefix marks special SvelteKit files (`+page.svelte`, `+layout.svelte`, etc.)
- Configuration lives in `svelte.config.js`, `vite.config.ts`, and `package.json`
