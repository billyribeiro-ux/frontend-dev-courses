# Project Tour

You have a running SvelteKit project. Before you start building, let's walk through every file and folder so you understand what each piece does, _why_ it exists, and where to put things. This is not just orientation -- it is the foundation for a critical mental model:

**In SvelteKit, your directory structure IS your application architecture.**

There is no separate router configuration, no manifest file mapping URLs to components, no wiring code. You create a file in the right place, and SvelteKit does the rest. This convention-over-configuration philosophy means that understanding the project structure is the same as understanding the framework.

A principal engineer can open any SvelteKit project and immediately understand its architecture by scanning the file tree. This is by design, and it is one of SvelteKit's most powerful properties.

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
│   ├── app.css                  # Global styles (if using Tailwind v4)
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

Let's explore each area in depth -- not just what they are, but _why_ they exist and how they interact.

## `src/routes/` -- File-Based Routing

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
- **`+page.svelte` = the page component.** This is the file SvelteKit renders when a user navigates to that URL. The `+` prefix is intentional -- it distinguishes SvelteKit's special files from your regular components.
- **`[brackets]` = dynamic parameters.** `src/routes/blog/[slug]/` matches any URL like `/blog/hello-world` or `/blog/my-first-post`. The `slug` value is available as a route parameter in your component.
- **Nesting = hierarchy.** Deeply nested folders create deeply nested URLs, naturally.

### Why the `+` Prefix Matters

The `+` prefix is not arbitrary decoration. It solves a real architectural problem: how does the framework distinguish between its special files and your regular component files?

```bash
src/routes/blog/
├── +page.svelte          # SvelteKit page -- rendered at /blog
├── +page.server.ts       # SvelteKit data loader -- runs on the server
├── +layout.svelte        # SvelteKit layout -- wraps child pages
├── PostCard.svelte        # YOUR component -- imported by +page.svelte
├── CategoryFilter.svelte  # YOUR component -- imported by +page.svelte
└── helpers.ts             # YOUR utility -- imported by +page.server.ts
```

Files starting with `+` belong to SvelteKit. Everything else belongs to you. You can co-locate components, utilities, types, and test files right next to the routes that use them. This is a significant architectural advantage -- related files live together instead of being scattered across distant directories.

```
# WRONG mental model: "Components must live in src/lib/components/"
# This forces you to navigate away from the route to find related components.
# A component used by only one page should live next to that page.

# CORRECT mental model: "Co-locate until you share"
# Keep a component next to the route that uses it.
# Move it to $lib only when a second route needs it.
# This minimizes the distance between related code.
```

### Other Special Files in Routes

`+page.svelte` is not the only special file. As you progress through this course, you will meet:

- **`+layout.svelte`** -- A wrapper component that surrounds every page in that directory (and its children). Navigation bars, sidebars, and footers live here.
- **`+page.ts`** (or `+page.server.ts`) -- A data-loading file that runs before the page renders. This is where you fetch data from APIs or databases.
- **`+error.svelte`** -- A custom error page for when something goes wrong in that route.
- **`+server.ts`** -- An API endpoint. No page component, just a function that handles HTTP requests and returns JSON.
- **`+layout.server.ts`** -- A server-side data loader for layouts, providing data to all child pages.
- **`+layout.ts`** -- A universal (runs on server and client) data loader for layouts.

Here is the complete mental map of how these files interact for a single route:

```
  Request to /blog/hello-world
  ───────────────────────────────────────────────────────────
  1. hooks.server.ts          (runs on EVERY request -- auth, logging)
  2. +layout.server.ts        (root layout data -- user info, nav items)
  3. blog/+layout.server.ts   (blog layout data -- categories, tags)
  4. blog/[slug]/+page.server.ts  (page data -- the actual post)
  5. +layout.svelte            (root layout -- header, footer)
  6. blog/+layout.svelte       (blog layout -- sidebar, breadcrumbs)
  7. blog/[slug]/+page.svelte  (page -- renders the post content)
  ───────────────────────────────────────────────────────────
  Data flows DOWN: each layout/page receives data from its loader
  Layouts NEST: each wraps the next, Russian-doll style
```

You do not need to memorize all of these now. The key insight is that SvelteKit uses filename conventions -- always starting with `+` -- to know how to handle each file. Regular `.svelte` files without the `+` prefix are just components, not pages.

### Route Groups: Organizing Without Affecting URLs

Sometimes you want to group routes for organizational purposes without adding a URL segment. Route groups use parentheses:

```bash
src/routes/
├── (marketing)/               # Group -- does NOT add /marketing/ to URLs
│   ├── +layout.svelte          # Shared layout for marketing pages
│   ├── about/
│   │   └── +page.svelte        # → /about (not /marketing/about)
│   └── pricing/
│       └── +page.svelte        # → /pricing
├── (app)/                      # Group -- does NOT add /app/ to URLs
│   ├── +layout.svelte          # Different layout for app pages
│   ├── dashboard/
│   │   └── +page.svelte        # → /dashboard
│   └── settings/
│       └── +page.svelte        # → /settings
└── +layout.svelte              # Root layout (wraps everything)
```

This is a powerful pattern for applying different layouts to different sections of your application without the layout boundary leaking into your URLs.

```
# WRONG: Creating /app/dashboard and /marketing/about routes
# Your URLs now contain implementation details. Users see /app/ in the URL
# for no reason. Changing your layout strategy means changing all your URLs.

# CORRECT: Using route groups (parentheses)
# URLs stay clean: /dashboard, /about, /pricing
# Layout boundaries are organizational, not visible to users.
# You can restructure layouts without breaking bookmarks or SEO.
```

### Rest Parameters and Optional Parameters

Beyond basic `[param]` segments, SvelteKit supports advanced routing patterns:

```bash
src/routes/
├── docs/[...path]/             # Rest parameter: matches /docs/a/b/c
│   └── +page.svelte            # path = "a/b/c"
├── [[lang]]/                   # Optional parameter: matches / AND /en, /fr
│   └── +page.svelte
└── items/[id=integer]/         # Parameter matching: only matches /items/123
    └── +page.svelte            # (requires a param matcher defined separately)
```

Parameter matchers are defined in `src/params/`:

```typescript
// src/params/integer.ts
import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => {
  return /^\d+$/.test(param);
};
```

This ensures `/items/123` matches but `/items/abc` returns a 404. Without matchers, `[id]` would match any string, and you would need to validate in your load function -- a worse pattern because invalid URLs should not reach your data loading logic.

## `src/lib/` -- Shared Code and the `$lib` Alias

The `src/lib/` directory is for code that is shared across your application -- reusable components, utility functions, constants, type definitions, and anything that does not belong to a specific route.

SvelteKit provides the **`$lib` alias** so you never have to write fragile relative imports:

```svelte
<script lang="ts">
  // WRONG: Relative imports break when you move files
  // import Button from '../../../lib/components/Button.svelte';

  // CORRECT: Absolute alias -- works regardless of file location
  import Button from '$lib/components/Button.svelte';
  import { formatDate } from '$lib/utils/date';
  import type { User } from '$lib/types';
</script>

<Button>Click me</Button>
```

The `$lib` alias always resolves to `src/lib/`, no matter how deeply nested the importing file is. This is not just convenience -- it is a design decision that encourages good architecture. When moving a component from one route to another, none of your `$lib` imports break.

### A Production-Grade `lib` Organization

As your project grows, a sensible structure inside `src/lib/` might look like this:

```bash
src/lib/
├── components/          # Reusable UI components
│   ├── ui/              # Primitive UI elements (Button, Card, Input)
│   │   ├── Button.svelte
│   │   ├── Card.svelte
│   │   └── Input.svelte
│   └── features/        # Feature-specific composed components
│       ├── PostCard.svelte
│       └── UserAvatar.svelte
├── server/              # Server-only code (ENFORCED by SvelteKit)
│   ├── db/
│   │   ├── index.ts     # Database client
│   │   └── schema.ts    # Drizzle schema definitions
│   └── auth.ts          # Authentication logic
├── utils/               # Pure functions and helpers
│   ├── date.ts
│   ├── validation.ts
│   └── format.ts
├── types/               # TypeScript type definitions
│   └── index.ts
└── index.ts             # Re-exports for convenient access
```

SvelteKit does not enforce this structure -- it is your choice. But the `$lib` alias gives you a stable root to build from, which naturally encourages organizing your shared code into logical directories.

### The `$lib/server` Security Boundary

There is a `$lib/server` convention that is more than a convention -- it is an enforced security boundary. Any code in `src/lib/server/` can only be imported from server-side files (`+page.server.ts`, `+server.ts`, `hooks.server.ts`). SvelteKit enforces this at build time:

```typescript
// src/lib/server/db/index.ts
import Database from 'better-sqlite3';
const db = new Database('local.db');
export default db;
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  // BUILD ERROR: Cannot import $lib/server/db in client code!
  import db from '$lib/server/db';
</script>
```

This compile-time enforcement prevents you from accidentally shipping database credentials, API keys, or server logic to the browser. In frameworks without this boundary, developers regularly leak sensitive code to the client bundle without realizing it -- a security vulnerability discovered only during an audit or, worse, by an attacker.

```
# WRONG: Putting database code in $lib/db/
# There is no compile-time protection. A typo in an import path
# could bundle your database driver into the client JavaScript.
# You would not know until someone inspects the bundle or exploits it.

# CORRECT: Putting database code in $lib/server/db/
# SvelteKit fails the build if any client code imports from $lib/server/.
# The security boundary is enforced by the compiler, not by developer discipline.
```

## `src/app.html` -- The HTML Shell

This file is the outermost template for your entire application. It is a regular HTML file with special placeholders:

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

- **`%sveltekit.head%`** -- SvelteKit injects `<link>` tags, `<style>` blocks, `<meta>` tags (from `<svelte:head>`), and preload hints here during rendering.
- **`%sveltekit.body%`** -- This is where your rendered page content goes. SvelteKit replaces this placeholder with the HTML output of your current route's page and layout components.
- **`%sveltekit.assets%`** -- Resolves to the path where static assets are served from.

You rarely edit this file after initial setup. It is the frame; your routes and layouts are the paintings.

### When You DO Edit `app.html`

Despite being "set and forget" in most cases, there are legitimate reasons to modify `app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <!-- External fonts -- loaded before page render for performance -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />

    <!-- Global meta tags that apply to every page -->
    <meta name="theme-color" content="#0f172a" />

    %sveltekit.head%
  </head>
  <body data-sveltekit-prerender="true">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

The key principle: `app.html` is for things that apply to literally every page and must be in the HTML document before SvelteKit hydrates. For page-specific meta tags, use `<svelte:head>` in your components:

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.post.title} | My Blog</title>
  <meta name="description" content={data.post.excerpt} />
</svelte:head>

<article>
  <h1>{data.post.title}</h1>
  <!-- ... -->
</article>
```

## `src/app.d.ts` -- Type Declarations

This file extends SvelteKit's built-in types with your application-specific types. It is where you tell TypeScript about the shape of your `event.locals`, your `page.data`, and other SvelteKit-specific objects:

```typescript
// src/app.d.ts
declare global {
  namespace App {
    // Shared data available to all server-side code
    interface Locals {
      user: {
        id: string;
        email: string;
        role: 'admin' | 'editor' | 'viewer';
      } | null;
    }

    // The shape of errors thrown by your app
    interface Error {
      message: string;
      code?: string;
    }

    // Data available in the page store
    interface PageData {
      // Automatically inferred from load functions
    }

    // Platform-specific context (Cloudflare, Vercel, etc.)
    interface Platform {}
  }
}

export {};
```

The `App.Locals` interface is particularly important. When you validate a session in `hooks.server.ts` and attach the user to `event.locals`, this interface tells TypeScript what `event.locals.user` looks like throughout your entire application. Without it, every access to `event.locals.user` would be `any` -- no autocompletion, no type checking, no safety.

```
# WRONG: Skipping app.d.ts and casting everywhere
const user = event.locals.user as any; // No type safety

# CORRECT: Defining the interface once in app.d.ts
// Now event.locals.user is typed everywhere, automatically
if (event.locals.user) {
  console.log(event.locals.user.email); // TypeScript knows this is string
  console.log(event.locals.user.role);  // TypeScript knows this is 'admin' | 'editor' | 'viewer'
}
```

## `src/app.css` -- Global Styles

If you added Tailwind CSS via `sv add tailwindcss`, this file contains the Tailwind v4 directives:

```css
/* src/app.css */
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --font-sans: 'Inter', sans-serif;
}
```

Note that Tailwind CSS v4 uses the `@theme` directive in CSS files instead of the old `tailwind.config.js` approach. The configuration is now CSS-native, which means your design tokens live alongside your styles.

```
# WRONG (Tailwind v3 pattern -- do not use with v4):
# tailwind.config.js with theme.extend

# CORRECT (Tailwind v4 pattern):
# @theme directive in your CSS file
# Design tokens are CSS custom properties
```

## `static/` -- Files Served As-Is

Everything in the `static/` directory is served at the root of your site, without any processing or fingerprinting:

- **`favicon.png`** -- Your site's icon (displayed in browser tabs)
- **`robots.txt`** -- Instructions for search engine crawlers
- **`manifest.json`** -- PWA configuration, if applicable
- **Images and fonts** that you want at fixed, predictable URLs

```svelte
<!-- Referencing static files -- paths start from / (the site root) -->
<img src="/hero-image.jpg" alt="Hero banner" />
<link rel="icon" href="/favicon.png" />
```

Notice you do not include `static/` in the path. The file at `static/hero-image.jpg` is served at `/hero-image.jpg`.

### Static Files vs. Imported Assets

Understanding when to use `static/` versus importing assets is an important architectural decision:

```svelte
<script lang="ts">
  // IMPORTED: Vite processes this -- optimizes, fingerprints, includes in build graph
  import heroImage from '$lib/assets/hero.jpg';
</script>

<!-- STATIC: Served as-is -- no optimization, no fingerprinting, fixed URL -->
<img src="/hero-image.jpg" alt="Hero banner" />

<!-- IMPORTED: The URL includes a content hash for cache busting -->
<img src={heroImage} alt="Hero banner" />
<!-- Renders as: <img src="/assets/hero-a1b2c3d4.jpg" alt="Hero banner" /> -->
```

| Use Case | Static | Import |
|----------|--------|--------|
| Favicon, robots.txt, social images | Yes | No |
| Component-specific images | No | Yes |
| Images that change with each deploy | No | Yes (fingerprinted) |
| Images shared via fixed URLs (emails, docs) | Yes | No |
| Images you want Vite to optimize | No | Yes |

The fingerprinting that imported assets get is important for performance. A file served from `static/` at `/hero.jpg` cannot be aggressively cached because the browser has no way to know when the content changes. A fingerprinted file like `/assets/hero-a1b2c3d4.jpg` can be cached forever -- if the content changes, the hash changes, and the browser fetches the new version automatically.

## `svelte.config.js` -- SvelteKit Configuration

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

- **`adapter`** -- Determines how your application is packaged for deployment. `adapter-auto` detects your hosting platform automatically. For specific targets, you use `adapter-node` (Node.js server), `adapter-static` (static site generation), `adapter-vercel`, `adapter-cloudflare`, etc.
- **`preprocess`** -- Transforms your code before Svelte compiles it. `vitePreprocess()` handles TypeScript, SCSS, PostCSS, and other preprocessors.
- **`alias`** -- Custom import aliases beyond the built-in `$lib`.

### Adapter Deep Dive

The adapter is the most architecturally consequential setting in this file, because it determines your deployment model:

```js
// Static site -- generates HTML files, no server needed
import adapter from '@sveltejs/adapter-static';

// Node.js server -- traditional server deployment
import adapter from '@sveltejs/adapter-node';

// Vercel -- serverless functions + edge
import adapter from '@sveltejs/adapter-vercel';

// Cloudflare Pages -- edge workers
import adapter from '@sveltejs/adapter-cloudflare';

// Auto -- detects platform from environment
import adapter from '@sveltejs/adapter-auto';
```

```
# WRONG mental model: "I will pick the adapter later"
# The adapter affects what features you can use. adapter-static
# cannot use server-side load functions or form actions.
# Choosing late means discovering your code does not work on your target.

# CORRECT mental model: "The adapter constrains my architecture"
# Choose early. If you need form actions and SSR, you need a server adapter.
# If you want a CDN-only deploy, use adapter-static and avoid server features.
```

You usually configure this file once and rarely touch it again, unless you are changing deployment targets or adding preprocessors.

## `vite.config.ts` -- The Build Tool

Vite is the build tool and development server underneath SvelteKit. Its configuration file looks like this:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

The `sveltekit()` plugin does the heavy lifting -- it teaches Vite how to handle `.svelte` files, implements file-based routing, manages server-side rendering, and orchestrates the build process.

### Production Vite Configuration

For production projects, you might extend `vite.config.ts`:

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000,
    // Proxy API calls to a backend during development
    proxy: {
      '/api/external': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  },
  build: {
    sourcemap: true
  }
});
```

Understanding the relationship: SvelteKit _uses_ Vite, not the other way around. SvelteKit is the framework; Vite is the engine that compiles and serves your code. When you run `npm run dev`, SvelteKit tells Vite what to do.

## `tsconfig.json` -- TypeScript Configuration

The TypeScript configuration extends a SvelteKit-specific base:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "allowJs": true,
    "checkJs": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "sourceMap": true,
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

The `extends` field is critical: it points to a generated configuration inside `.svelte-kit/` that includes path aliases (`$lib`, `$app/state`, `$env`), Svelte-specific settings, and type references. This is why running `svelte-kit sync` matters -- it generates this base configuration.

**Do not remove `strict: true`.** Strict mode enables the most valuable TypeScript checks: `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, and others. Without strict mode, TypeScript catches far fewer bugs, and you lose the primary benefit of using it.

```
# WRONG: Setting "strict": false "to make TypeScript easier"
# You are not making it easier. You are making it useless.
# Without strict mode, TypeScript allows implicit any, null is
# assignable to everything, and function parameter types are not checked.
# You might as well not use TypeScript at all.

# CORRECT: Keep "strict": true and learn to work with it
# The "friction" of strict mode IS the value. Every error it catches
# is a bug that would have reached production.
```

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

- **`dev`** -- Starts the development server with HMR. This is what you run while coding.
- **`build`** -- Compiles your application for production. Svelte components are compiled to optimized JavaScript, CSS is extracted and minified, code splitting is applied, and the adapter packages everything for your deployment target.
- **`preview`** -- Serves the production build locally so you can test it before deploying.
- **`check`** -- Runs `svelte-check`, which type-checks your entire project, including the interplay between TypeScript and Svelte template syntax.
- **`check:watch`** -- Same as `check` but runs continuously, re-checking when files change.
- **`lint`** -- Runs ESLint across your project to catch code quality issues.
- **`format`** -- Runs Prettier to format every file in your project.

### The Development Workflow

A production-grade development workflow uses these scripts at specific times:

```
  While coding:     npm run dev          (always running in a terminal)
  Before commit:    npm run check        (catch type errors)
                    npm run lint         (catch code quality issues)
                    npm run format       (fix formatting)
  Before deploy:    npm run build        (compile for production)
                    npm run preview      (verify the production build)
  In CI/CD:         npm run check && npm run lint && npm run build
                    (all three must pass before merge/deploy)
```

A common mistake is to only run `build` before deploying. The `check` command catches errors that `build` does not -- particularly type errors in template expressions and incorrect prop types. Always run `check` in your CI/CD pipeline.

## `eslint.config.js` -- Linting Configuration

SvelteKit generates a flat ESLint configuration using the modern config format:

```js
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser
      }
    }
  },
  {
    ignores: ['build/', '.svelte-kit/', 'dist/']
  }
);
```

The Svelte ESLint plugin is essential -- it understands `.svelte` file structure and catches Svelte-specific issues like accessibility violations, invalid template syntax, and incorrect reactive declarations.

## `.prettierrc` -- Formatting Configuration

Prettier handles code formatting. The default configuration is minimal:

```json
{
  "useTabs": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "plugins": ["prettier-plugin-svelte"],
  "overrides": [
    {
      "files": "*.svelte",
      "options": {
        "parser": "svelte"
      }
    }
  ]
}
```

The `prettier-plugin-svelte` is required to format `.svelte` files correctly. Without it, Prettier treats Svelte templates as plain HTML and produces incorrect formatting.

## The Mental Model: Files Are Architecture

Here is the single most important idea to take away from this tour:

In SvelteKit, **the file system is the framework**. Your directory structure is not just organization -- it is configuration. Where you place a file determines what it does:

- A file at `src/routes/blog/+page.svelte` becomes a page at `/blog`.
- A file at `src/routes/blog/+page.server.ts` becomes the data loader for that page.
- A file at `src/routes/api/posts/+server.ts` becomes an API endpoint at `/api/posts`.
- A file at `src/lib/components/Card.svelte` becomes a reusable component importable from anywhere via `$lib`.
- A file at `src/lib/server/db/index.ts` becomes server-only code that cannot leak to the browser.
- A file at `static/og-image.png` becomes a publicly accessible asset at `/og-image.png`.

There is no central routing table. There is no manifest. There is no "register this component" step. You create a file in the right place, with the right name, and SvelteKit knows what to do with it.

### Comparing Approaches: Convention vs Configuration

To appreciate what SvelteKit gives you, consider how routing works in a configuration-based framework:

```typescript
// Configuration-based routing (React Router, Vue Router, etc.)
// You must write and maintain this mapping manually
const routes = [
  { path: '/', component: HomePage },
  { path: '/about', component: AboutPage },
  { path: '/blog', component: BlogListPage },
  { path: '/blog/:slug', component: BlogPostPage },
  { path: '/settings/profile', component: ProfilePage },
  // ... grows with every page, can become stale, can have typos
];

// SvelteKit convention-based routing
// The routing IS the file structure -- no mapping to maintain
// src/routes/+page.svelte                    → /
// src/routes/about/+page.svelte              → /about
// src/routes/blog/+page.svelte               → /blog
// src/routes/blog/[slug]/+page.svelte        → /blog/:slug
// src/routes/settings/profile/+page.svelte   → /settings/profile
```

With convention-based routing, you cannot have a route without a file, and you cannot have an orphaned file without a route. The mapping is always in sync because there is no mapping -- they are the same thing.

### Scaling the Architecture

As your project grows, you will appreciate this deeply. A new teammate can open the `src/routes/` directory and immediately understand every page in your application, how they are nested, and where to find the code for any URL. That is a superpower.

Here is how a mature SvelteKit project might look:

```bash
src/
├── routes/
│   ├── +layout.svelte               # Root layout (nav, footer)
│   ├── +layout.server.ts            # Root data (user session)
│   ├── +page.svelte                 # Home page
│   ├── +error.svelte                # Global error page
│   ├── (marketing)/                 # Marketing pages (different layout)
│   │   ├── +layout.svelte
│   │   ├── about/+page.svelte
│   │   ├── pricing/+page.svelte
│   │   └── contact/+page.svelte
│   ├── (app)/                       # App pages (auth required)
│   │   ├── +layout.svelte
│   │   ├── +layout.server.ts        # Auth guard -- redirects if not logged in
│   │   ├── dashboard/
│   │   │   ├── +page.svelte
│   │   │   └── +page.server.ts
│   │   ├── projects/
│   │   │   ├── +page.svelte         # List projects
│   │   │   ├── +page.server.ts      # Load projects from DB
│   │   │   └── [id]/
│   │   │       ├── +page.svelte     # View project
│   │   │       ├── +page.server.ts  # Load project data
│   │   │       └── ProjectHeader.svelte  # Co-located component
│   │   └── settings/
│   │       ├── +page.svelte
│   │       └── profile/+page.svelte
│   └── api/                          # API endpoints
│       └── webhooks/
│           └── stripe/+server.ts
├── lib/
│   ├── components/
│   │   ├── ui/                       # Shared UI primitives
│   │   └── features/                 # Feature-specific components
│   ├── server/
│   │   ├── db/                       # Database layer
│   │   └── auth.ts                   # Auth logic
│   ├── utils/                        # Shared utilities
│   └── types/                        # Shared types
├── app.html                          # HTML shell
├── app.css                           # Global styles / Tailwind
└── app.d.ts                          # Type declarations
```

Every page, every layout, every API endpoint, and every data loader is discoverable from the file tree alone. No grep required.

## Try It

Open your project in VS Code. Complete each of these tasks:

1. **Create a route:** Add a folder at `src/routes/about/` with a `+page.svelte` file inside it containing a heading and a paragraph. Start your dev server and visit `http://localhost:5173/about` to see your new page -- no configuration needed.

2. **Co-locate a component:** Create a `Greeting.svelte` file (no `+` prefix) in the same `about/` directory. Import and use it in `+page.svelte`. Observe that this component file does not create a new route.

3. **Create a shared component:** Move `Greeting.svelte` to `src/lib/components/Greeting.svelte`. Update the import in `about/+page.svelte` to use `$lib/components/Greeting.svelte`. Verify it still works.

4. **Explore the configuration:** Open `app.html` and find the `%sveltekit.head%` and `%sveltekit.body%` placeholders. Open `svelte.config.js` and identify the adapter and preprocessor. Open `package.json` and read through the scripts.

5. **Type your app:** Open `src/app.d.ts` and add a `user` property to the `App.Locals` interface with `id: string` and `email: string`. Notice that TypeScript now knows about `event.locals.user` in any `+page.server.ts` file.

6. **Test the build pipeline:** Run `npm run check` to type-check your project. Run `npm run build` to create a production build. Run `npm run preview` to serve it locally and verify everything works.

7. **Create a dynamic route:** Add `src/routes/greet/[name]/+page.svelte`. Use `$props()` to access `data` from a `+page.ts` load function that reads the `name` parameter from `params`. Visit `/greet/world` and see your dynamic content.

The more familiar you are with this structure now, the more confident you will feel as we start building real features.

## Key Takeaways

- **`src/routes/`** is file-based routing -- directories become URL segments, `+page.svelte` files become pages, `[brackets]` create dynamic parameters, `(groups)` organize without affecting URLs
- The **`+` prefix** distinguishes SvelteKit special files from your components -- co-locate components next to routes and move to `$lib` only when shared
- **`src/lib/`** holds shared code accessible via the **`$lib`** alias, eliminating brittle relative imports
- **`$lib/server/`** is a compile-time enforced security boundary -- code there cannot be imported by client-side files, preventing accidental credential leaks
- **`src/app.html`** is the HTML shell -- `%sveltekit.head%` and `%sveltekit.body%` are replaced at render time; use `<svelte:head>` in components for page-specific meta
- **`src/app.d.ts`** defines TypeScript types for `event.locals`, errors, and platform -- set this up early to get type safety across your entire application
- **`src/app.css`** holds global styles -- Tailwind v4 uses `@theme` in CSS, not `tailwind.config.js`
- **`static/`** serves files as-is at the site root -- use imported assets for fingerprinted, optimized, cache-friendly delivery
- **`svelte.config.js`** controls adapters and preprocessors -- the adapter constrains what features your app can use, so choose early
- **`vite.config.ts`** configures the underlying build tool -- SvelteKit uses Vite, not the other way around
- **`tsconfig.json`** must keep `strict: true` -- the friction of strict mode IS the value of TypeScript
- **`package.json`** scripts define your workflow: `dev` for coding, `check` and `lint` before commit, `build` and `preview` before deploy
- The core mental model: **your directory structure IS your application architecture** -- SvelteKit turns file system conventions into framework behavior with zero boilerplate
