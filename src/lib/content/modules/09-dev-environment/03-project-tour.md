# Project Tour

You have a running SvelteKit project. Before you start building, let's walk through every file and folder so you understand what each piece does and where to put things. This is not just orientation — it is the foundation for a critical mental model:

**In SvelteKit, your directory structure IS your application architecture.**

There is no separate router configuration, no manifest file mapping URLs to components, no wiring code. You create a file in the right place, and SvelteKit does the rest. This convention-over-configuration philosophy means that understanding the project structure is the same as understanding the framework.

## The Complete Project Structure

Here is what a fresh SvelteKit project looks like, annotated with what each piece does:

```bash
my-app/
├── src/
│   ├── routes/                  # Your pages and API endpoints
│   │   └── +page.svelte         # Home page (localhost:5173/)
│   ├── lib/                     # Shared code, components, utilities
│   │   └── index.ts             # Re-exports for the $lib alias
│   ├── app.html                 # The HTML shell template
│   └── app.d.ts                 # TypeScript type declarations
├── static/                      # Files served as-is (favicon, images)
│   └── favicon.png
├── svelte.config.js             # SvelteKit configuration
├── vite.config.ts               # Build tool configuration
├── tsconfig.json                # TypeScript configuration
├── package.json                 # Dependencies and scripts
├── package-lock.json            # Locked dependency versions
├── .prettierrc                  # Prettier formatting rules
├── eslint.config.js             # ESLint linting rules
└── .gitignore                   # Files excluded from version control
```

Let's explore each area in depth.

## `src/routes/` — File-Based Routing

This is where you will spend most of your time, and it is the most important concept to internalize early. Every directory inside `src/routes/` corresponds to a URL segment. Every `+page.svelte` file inside a directory becomes a page at that URL.

```bash
src/routes/
├── +page.svelte                 # → /
├── about/
│   └── +page.svelte             # → /about
├── blog/
│   ├── +page.svelte             # → /blog
│   └── [slug]/
│       └── +page.svelte         # → /blog/hello-world, /blog/anything
└── settings/
    └── profile/
        └── +page.svelte         # → /settings/profile
```

The rules are simple:

- **Directories = URL segments.** `src/routes/about/` maps to `/about`. `src/routes/blog/` maps to `/blog`.
- **`+page.svelte` = the page component.** This is the file SvelteKit renders when a user navigates to that URL. The `+` prefix is intentional — it distinguishes SvelteKit's special files from your regular components.
- **`[brackets]` = dynamic parameters.** `src/routes/blog/[slug]/` matches any URL like `/blog/hello-world` or `/blog/my-first-post`. The `slug` value is available as a route parameter in your component.
- **Nesting = hierarchy.** Deeply nested folders create deeply nested URLs, naturally.

### Other Special Files in Routes

`+page.svelte` is not the only special file. As you progress through this course, you will meet:

- **`+layout.svelte`** — A wrapper component that surrounds every page in that directory (and its children). Navigation bars, sidebars, and footers live here.
- **`+page.ts`** (or `+page.server.ts`) — A data-loading file that runs before the page renders. This is where you fetch data from APIs or databases.
- **`+error.svelte`** — A custom error page for when something goes wrong in that route.
- **`+server.ts`** — An API endpoint. No page component, just a function that handles HTTP requests and returns JSON.

You do not need to memorize these now. The key insight is that SvelteKit uses filename conventions — always starting with `+` — to know how to handle each file. Regular `.svelte` files without the `+` prefix are just components, not pages.

## `src/lib/` — Shared Code and the `$lib` Alias

The `src/lib/` directory is for code that is shared across your application — reusable components, utility functions, constants, type definitions, stores, and anything that does not belong to a specific route.

SvelteKit provides the **`$lib` alias** so you never have to write fragile relative imports:

```svelte
<script lang="ts">
  // Instead of this (brittle, breaks when you move files):
  // import Button from '../../../lib/components/Button.svelte';

  // You write this (always works, regardless of file location):
  import Button from '$lib/components/Button.svelte';
  import { formatDate } from '$lib/utils/date';
  import type { User } from '$lib/types';
</script>

<Button>Click me</Button>
```

The `$lib` alias always resolves to `src/lib/`, no matter how deeply nested the importing file is. This is not just convenience — it is a design decision that encourages good architecture. When moving a component from one route to another, none of your `$lib` imports break.

### A Common `lib` Organization

As your project grows, a sensible structure inside `src/lib/` might look like this:

```bash
src/lib/
├── components/          # Reusable UI components
│   ├── Button.svelte
│   ├── Card.svelte
│   └── Header.svelte
├── utils/               # Pure functions and helpers
│   ├── date.ts
│   └── validation.ts
├── stores/              # Shared reactive state
│   └── auth.ts
├── types/               # TypeScript type definitions
│   └── index.ts
└── index.ts             # Re-exports for convenient access
```

SvelteKit does not enforce this structure — it is your choice. But the `$lib` alias gives you a stable root to build from, which naturally encourages organizing your shared code into logical directories.

There is also a `$lib/server` convention. Any code in `src/lib/server/` can only be imported from server-side files (`+page.server.ts`, `+server.ts`). SvelteKit enforces this at build time — if you accidentally import a server-only module in a client-side component, the build fails. This prevents you from leaking database credentials, API keys, or server logic to the browser.

## `src/app.html` — The HTML Shell

This file is the outermost template for your entire application. It is a regular HTML file with two special placeholders:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-prerender="true">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

- **`%sveltekit.head%`** — SvelteKit injects `<link>` tags, `<style>` blocks, `<meta>` tags (from `<svelte:head>`), and preload hints here during rendering.
- **`%sveltekit.body%`** — This is where your rendered page content goes. SvelteKit replaces this placeholder with the HTML output of your current route's page and layout components.
- **`%sveltekit.assets%`** — Resolves to the path where static assets are served from.

You rarely edit this file after initial setup. It is the frame; your routes and layouts are the paintings.

## `static/` — Files Served As-Is

Everything in the `static/` directory is served at the root of your site, without any processing or fingerprinting. This is where you put files that should not go through the build pipeline:

- **`favicon.png`** — Your site's icon (displayed in browser tabs)
- **`robots.txt`** — Instructions for search engine crawlers
- **`manifest.json`** — PWA configuration, if applicable
- **Images and fonts** that you want at fixed, predictable URLs

```svelte
<!-- Referencing static files — paths start from / (the site root) -->
<img src="/hero-image.jpg" alt="Hero banner" />
<link rel="icon" href="/favicon.png" />
```

Notice you do not include `static/` in the path. The file at `static/hero-image.jpg` is served at `/hero-image.jpg`.

**When to use `static/` vs. imports:** If you import an image in a component (`import hero from './hero.jpg'`), Vite processes it — optimizing, fingerprinting the filename for cache busting, and including it in the build graph. For images that change rarely and need stable URLs (like favicons or social sharing images), `static/` is the right choice. For images tightly coupled to components, importing gives you better caching and optimization.

## `svelte.config.js` — SvelteKit Configuration

This file controls how SvelteKit processes your project. A minimal configuration looks like:

```js
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter()
  }
};

export default config;
```

The key settings:

- **`adapter`** — Determines how your application is packaged for deployment. `adapter-auto` detects your hosting platform automatically. For specific targets, you use `adapter-node` (Node.js server), `adapter-static` (static site generation), `adapter-vercel`, `adapter-cloudflare`, etc. The adapter is the bridge between SvelteKit and your production environment.
- **`preprocess`** — Transforms your code before Svelte compiles it. `vitePreprocess()` handles TypeScript, SCSS, PostCSS, and other preprocessors. If you write `<script lang="ts">`, this is what converts the TypeScript to JavaScript before the Svelte compiler sees it.
- **`alias`** — Custom import aliases beyond the built-in `$lib`. Useful for large projects where you want shortcuts like `$components` or `$utils`.

You usually configure this file once and rarely touch it again, unless you are changing deployment targets or adding preprocessors.

## `vite.config.ts` — The Build Tool

Vite is the build tool and development server underneath SvelteKit. Its configuration file looks like this:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

The `sveltekit()` plugin does the heavy lifting — it teaches Vite how to handle `.svelte` files, implements file-based routing, manages server-side rendering, and orchestrates the build process.

You can extend this file to add Vite plugins (image optimization, PWA support, bundle analysis), configure the dev server (proxy settings for APIs, HTTPS), or adjust build output. But the default configuration works for most projects.

Understanding the relationship: SvelteKit _uses_ Vite, not the other way around. SvelteKit is the framework; Vite is the engine that compiles and serves your code. When you run `npm run dev`, SvelteKit tells Vite what to do.

## `package.json` Scripts

The `scripts` section in `package.json` defines the commands you use daily:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

What each script does:

- **`dev`** — Starts the development server with HMR. This is what you run while coding.
- **`build`** — Compiles your application for production. Svelte components are compiled to optimized JavaScript, CSS is extracted and minified, code splitting is applied, and the adapter packages everything for your deployment target.
- **`preview`** — Serves the production build locally so you can test it before deploying. This is the closest thing to "what will users see" without actually deploying.
- **`check`** — Runs `svelte-check`, which type-checks your entire project, including the interplay between TypeScript and Svelte template syntax. Run this before committing — it catches errors that your editor might miss.
- **`lint`** — Runs ESLint across your project to catch code quality issues.
- **`format`** — Runs Prettier to format every file in your project.

A typical development workflow: run `dev` while you code, run `check` and `lint` before you commit, run `build` and `preview` before you deploy.

## The Mental Model: Files Are Architecture

Here is the single most important idea to take away from this tour:

In SvelteKit, **the file system is the framework**. Your directory structure is not just organization — it is configuration. Where you place a file determines what it does:

- A file at `src/routes/blog/+page.svelte` becomes a page at `/blog`.
- A file at `src/routes/blog/+page.server.ts` becomes the data loader for that page.
- A file at `src/routes/api/posts/+server.ts` becomes an API endpoint at `/api/posts`.
- A file at `src/lib/components/Card.svelte` becomes a reusable component importable from anywhere via `$lib`.
- A file at `static/og-image.png` becomes a publicly accessible asset at `/og-image.png`.

There is no central routing table. There is no manifest. There is no "register this component" step. You create a file in the right place, with the right name, and SvelteKit knows what to do with it. This is the power of convention over configuration — it eliminates an entire category of boilerplate and makes your project's architecture visible at a glance.

As your project grows, you will appreciate this deeply. A new teammate can open the `src/routes/` directory and immediately understand every page in your application, how they are nested, and where to find the code for any URL. That is a superpower.

## Try It

Open your project in VS Code. Create a new folder at `src/routes/about/` and add a `+page.svelte` file inside it with a heading and a paragraph. Start your dev server and visit `http://localhost:5173/about` to see your new page — no configuration needed.

Then explore each of the files we discussed: open `app.html` and find the `%sveltekit.head%` and `%sveltekit.body%` placeholders. Open `svelte.config.js` and identify the adapter and preprocessor. Open `package.json` and read through the scripts. The more familiar you are with this structure now, the more confident you will feel as we start building real features.

## Key Takeaways

- **`src/routes/`** is file-based routing — directories become URL segments, `+page.svelte` files become pages, `[brackets]` create dynamic parameters
- **`src/lib/`** holds shared code accessible via the **`$lib`** alias, eliminating brittle relative imports
- **`src/app.html`** is the HTML shell — `%sveltekit.head%` and `%sveltekit.body%` are replaced at render time
- **`static/`** serves files as-is at the site root — no processing, no fingerprinting
- **`svelte.config.js`** controls adapters (deployment targets), preprocessors (TypeScript, SCSS), and aliases
- **`vite.config.ts`** configures the underlying build tool — SvelteKit uses Vite, not the other way around
- **`package.json`** scripts define your workflow: `dev` for coding, `build` for production, `check` for type-checking, `lint` for code quality
- The core mental model: **your directory structure IS your application architecture** — SvelteKit turns file system conventions into framework behavior with zero boilerplate
