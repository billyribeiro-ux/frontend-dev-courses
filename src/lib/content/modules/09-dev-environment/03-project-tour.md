# Project Tour

You have a running SvelteKit project. Before you start building, let's walk through every file and folder so you understand what each piece does, _why_ it exists, and where to put things. This is not just orientation -- it is the foundation for a critical mental model:

**In SvelteKit, your directory structure IS your application architecture.**

There is no separate router configuration, no manifest file mapping URLs to components, no wiring code. You create a file in the right place, and SvelteKit does the rest. This convention-over-configuration philosophy means that understanding the project structure is the same as understanding the framework.

I have onboarded dozens of developers onto SvelteKit projects. The ones who internalize this file structure on day one are productive within hours. The ones who skip this step and "learn as they go" spend weeks confused about where things live and why.

## The Complete Project Structure

Here is what a fresh SvelteKit project looks like, annotated with what each piece does:

```bash
my-app/
├── .svelte-kit/                   # Generated files (gitignored)
│   ├── generated/                 # Client/server entry points
│   ├── types/                     # Auto-generated route types
│   └── tsconfig.json              # Extended TypeScript config
├── src/
│   ├── routes/                    # Your pages and API endpoints
│   │   └── +page.svelte           # Home page (localhost:5173/)
│   ├── lib/                       # Shared code, components, utilities
│   │   ├── server/                # Server-only code (enforced at build)
│   │   └── index.ts               # Re-exports for the $lib alias
│   ├── app.html                   # The HTML shell template
│   ├── app.css                    # Global styles (if added)
│   ├── app.d.ts                   # TypeScript type declarations
│   └── hooks.server.ts            # Server hooks (request lifecycle)
├── static/                        # Files served as-is (favicon, images)
│   └── favicon.png
├── svelte.config.js               # SvelteKit configuration
├── vite.config.ts                 # Build tool configuration
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # Dependencies and scripts
├── package-lock.json              # Locked dependency versions
├── .prettierrc                    # Prettier formatting rules
├── .prettierignore                # Files Prettier should skip
├── eslint.config.js               # ESLint linting rules
├── .gitignore                     # Files excluded from version control
└── .node-version                  # Node.js version for the team (optional)
```

Let's explore each area in depth, starting with the files you will touch daily and moving to the ones you configure once and rarely revisit.

## `src/routes/` -- File-Based Routing

This is where you will spend most of your time, and it is the most important concept to internalize early. Every directory inside `src/routes/` corresponds to a URL segment. Every `+page.svelte` file inside a directory becomes a page at that URL.

```bash
src/routes/
├── +page.svelte                 # → /
├── +layout.svelte               # → wraps all pages
├── about/
│   └── +page.svelte             # → /about
├── blog/
│   ├── +page.svelte             # → /blog
│   ├── +page.server.ts          # → data loader for /blog
│   └── [slug]/
│       ├── +page.svelte         # → /blog/hello-world, /blog/anything
│       └── +page.server.ts      # → data loader for /blog/:slug
├── settings/
│   ├── +layout.svelte           # → wraps all settings pages
│   └── profile/
│       └── +page.svelte         # → /settings/profile
└── api/
    └── posts/
        └── +server.ts           # → API endpoint: GET/POST /api/posts
```

The rules are simple but worth enumerating completely:

- **Directories = URL segments.** `src/routes/about/` maps to `/about`. `src/routes/blog/` maps to `/blog`.
- **`+page.svelte` = the page component.** This is the file SvelteKit renders when a user navigates to that URL. The `+` prefix is intentional -- it distinguishes SvelteKit's special files from your regular components.
- **`[brackets]` = dynamic parameters.** `src/routes/blog/[slug]/` matches any URL like `/blog/hello-world` or `/blog/my-first-post`. The `slug` value is available as a route parameter.
- **`[...rest]` = catch-all parameters.** `src/routes/docs/[...path]/` matches `/docs/getting-started`, `/docs/api/components`, or any depth.
- **`(groups)` = route groups.** Parenthesized directories group routes without affecting the URL. `src/routes/(marketing)/about/` still maps to `/about`, not `/(marketing)/about`.
- **`[[optional]]` = optional parameters.** Double brackets make a segment optional. `src/routes/[[lang]]/about/` matches both `/about` and `/en/about`.
- **Nesting = hierarchy.** Deeply nested folders create deeply nested URLs, naturally.

### The `+` File Convention -- Every Special File Explained

`+page.svelte` is not the only special file. SvelteKit uses the `+` prefix for all framework-managed files. Here is the complete list, with when and why you would use each:

**`+page.svelte`** -- The page component. This is what the user sees. It receives data from its loader via the `data` prop.

**`+page.ts`** -- A **universal** load function. Runs on both the server (during SSR) and the client (during client-side navigation). Use this when your data comes from a public API, computed values, or anything that does not require server secrets.

```typescript
// src/routes/blog/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch('/api/posts');
  const posts = await response.json();
  return { posts };
};
```

**`+page.server.ts`** -- A **server-only** load function. Runs exclusively on the server. Use this when you need database access, API keys, or any data that must never reach the client. Also supports form actions for handling form submissions.

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/database';

export const load: PageServerLoad = async () => {
  const posts = await db.select().from(postsTable);
  return { posts };
};
```

**`+layout.svelte`** -- A wrapper component that surrounds every page in that directory (and its children). Navigation bars, sidebars, and footers live here. Layouts nest automatically -- a root layout wraps everything, a route-group layout wraps its group, etc.

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<nav>
  <a href="/">Home</a>
  <a href="/about">About</a>
</nav>

<main>
  {@render children()}
</main>

<footer>Built with SvelteKit</footer>
```

**`+layout.ts` / `+layout.server.ts`** -- Load functions for layouts. Data loaded here is available to every page the layout wraps. Use this for user authentication, global settings, or any data that every child page needs.

**`+error.svelte`** -- A custom error page for when something goes wrong in that route or its children. If not provided, SvelteKit shows a default error page.

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/state';
</script>

<h1>{page.status}</h1>
<p>{page.error?.message}</p>
```

**`+server.ts`** -- An API endpoint. No page component, just functions that handle HTTP methods (GET, POST, PUT, DELETE, PATCH) and return responses.

```typescript
// src/routes/api/posts/+server.ts
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/database';

export const GET: RequestHandler = async () => {
  const posts = await db.select().from(postsTable);
  return json(posts);
};

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const post = await db.insert(postsTable).values(body).returning();
  return json(post, { status: 201 });
};
```

### The Decision Framework: `+page.ts` vs `+page.server.ts`

This decision trips up every beginner. Here is the definitive guide:

| Question | `+page.ts` (universal) | `+page.server.ts` (server-only) |
|----------|----------------------|-------------------------------|
| Needs database access? | No | **Yes** |
| Needs API keys / secrets? | No | **Yes** |
| Needs `fs` / file system? | No | **Yes** |
| Data from a public API? | **Yes** | Also works |
| Runs during client-side nav? | **Yes** (avoids server round-trip) | No (always hits server) |
| Can use `fetch` to same origin? | **Yes** (uses browser fetch on client) | **Yes** (direct function call) |
| Can return non-serializable data? | No (must cross server→client boundary) | No (same constraint) |
| Supports form actions? | No | **Yes** |

**The rule of thumb:** Start with `+page.server.ts`. It is more secure (code never reaches the client), supports form actions, and works for every use case. Move to `+page.ts` only when you need client-side execution (rare) or want to avoid a server round-trip during client-side navigation (performance optimization for public data).

## `src/lib/` -- Shared Code and the `$lib` Alias

The `src/lib/` directory is for code that is shared across your application -- reusable components, utility functions, constants, type definitions, state, and anything that does not belong to a specific route.

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

### How `$lib` Works Under the Hood

The `$lib` alias is not magic -- it is a **Vite alias** configured by the SvelteKit plugin. When the SvelteKit plugin initializes in `vite.config.ts`, it adds this to Vite's resolve configuration:

```javascript
// What SvelteKit does internally (simplified):
{
  resolve: {
    alias: {
      '$lib': '/absolute/path/to/your/project/src/lib',
      '$app': '/path/to/.svelte-kit/runtime/app'
    }
  }
}
```

When Vite encounters `import X from '$lib/components/Button.svelte'`, it resolves `$lib` to `src/lib` and finds the file at `src/lib/components/Button.svelte`. This happens at build time -- there is no runtime resolution cost.

You can add custom aliases in `svelte.config.js`:

```javascript
// svelte.config.js
const config = {
  kit: {
    alias: {
      $components: 'src/lib/components',
      $utils: 'src/lib/utils',
      $types: 'src/lib/types'
    }
  }
};
```

Now you can write `import Button from '$components/Button.svelte'`. However, I recommend against excessive aliasing. `$lib` is universally understood in the Svelte ecosystem. Custom aliases create a learning curve for new team members and make it harder to search for imports. Use `$lib/components/Button.svelte` -- the extra path segment is worth the clarity.

### A Production-Grade `lib` Organization

As your project grows, a sensible structure inside `src/lib/` might look like this:

```bash
src/lib/
├── components/              # Reusable UI components
│   ├── ui/                  # Primitives (Button, Input, Card, Modal)
│   │   ├── Button.svelte
│   │   ├── Input.svelte
│   │   └── Card.svelte
│   ├── layout/              # Structural components (Header, Footer, Sidebar)
│   │   ├── Header.svelte
│   │   └── Footer.svelte
│   └── domain/              # Business-specific components (ProductCard, UserAvatar)
│       ├── ProductCard.svelte
│       └── UserAvatar.svelte
├── server/                  # Server-only code (enforced!)
│   ├── database.ts          # Database connection and queries
│   ├── auth.ts              # Authentication logic
│   └── email.ts             # Email sending service
├── utils/                   # Pure functions and helpers
│   ├── date.ts
│   ├── validation.ts
│   └── format.ts
├── state/                   # Shared reactive state (.svelte.ts files)
│   ├── cart.svelte.ts
│   └── auth.svelte.ts
├── types/                   # TypeScript type definitions
│   └── index.ts
└── index.ts                 # Re-exports for convenient access
```

### `$lib/server` -- The Security Boundary

Any code in `src/lib/server/` can only be imported from server-side files (`+page.server.ts`, `+server.ts`, `hooks.server.ts`, other files in `$lib/server/`). SvelteKit enforces this at build time -- if you accidentally import a server-only module in a client-side component, the build fails with a clear error:

```
Cannot import $lib/server/database.ts into client-side code
```

This prevents you from leaking database credentials, API keys, or server logic to the browser. It is not a lint rule you can disable -- it is a hard compiler error.

```typescript
// src/lib/server/database.ts -- ONLY importable from server code
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const connection = postgres(process.env.DATABASE_URL!);
export const db = drizzle(connection);
```

```svelte
<!-- src/routes/products/+page.svelte -->
<script lang="ts">
  // This would FAIL at build time:
  // import { db } from '$lib/server/database';
  //
  // Error: Cannot import $lib/server/database.ts into client-side code

  // Instead, use data from a server load function:
  let { data } = $props();
</script>
```

This enforcement is one of the most important features of SvelteKit's architecture. In other frameworks, accidentally exposing server secrets is a common security vulnerability. SvelteKit makes it structurally impossible.

## `src/app.html` -- The HTML Shell

This file is the outermost template for your entire application. It is a regular HTML file with special placeholders that SvelteKit fills in:

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

### Every Placeholder Explained

- **`%sveltekit.head%`** -- SvelteKit injects several things here during rendering:
  - `<link>` tags for CSS files (component styles extracted during build)
  - `<link rel="modulepreload">` hints for JavaScript modules the page will need
  - Content from `<svelte:head>` blocks in your components (title, meta tags, OpenGraph)
  - Inline `<style>` blocks in development mode
  - Serialized data from load functions (as `<script>` tags containing JSON)

- **`%sveltekit.body%`** -- The rendered HTML output of your current route's page and layout components. During SSR, this contains the fully rendered HTML. After hydration, Svelte takes over and manages this DOM.

- **`%sveltekit.assets%`** -- Resolves to the path where static assets are served from. Usually this is an empty string (assets are at the root), but it can be a CDN URL if you configure `paths.assets` in `svelte.config.js`.

- **`%sveltekit.nonce%`** -- A Content Security Policy nonce value. If you configure CSP in your hooks, this placeholder is replaced with the nonce value so inline scripts and styles are allowed by the CSP policy.

- **`%sveltekit.env.[NAME]%`** -- Public environment variables. `%sveltekit.env.PUBLIC_API_URL%` is replaced with the value of the `PUBLIC_API_URL` environment variable.

### When to Edit `app.html`

You rarely edit this file after initial setup. Common reasons include:

- Adding a Google Fonts `<link>` tag to the `<head>`
- Adding global `<meta>` tags (charset, viewport are already there)
- Adding a Content Security Policy `<meta>` tag
- Changing the `lang` attribute for internationalization
- Adding a "no-JavaScript" `<noscript>` fallback
- Adding analytics snippet that must load before the application
- Setting `class` or `data-theme` on `<body>` for dark mode

```html
<!-- Example: Adding a dark mode class and a web font -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
    %sveltekit.head%
  </head>
  <body>
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

## `src/app.d.ts` -- TypeScript Declarations

This file declares types for SvelteKit-specific globals. A fresh project includes:

```typescript
// See https://svelte.dev/docs/kit/types#app
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
```

These interfaces are initially commented out. You uncomment and populate them as your application grows:

**`App.Error`** -- The shape of error objects. Customize this to include user-friendly messages, error codes, or tracking IDs:

```typescript
interface Error {
  message: string;
  code?: string;
  errorId?: string;
}
```

**`App.Locals`** -- Data attached to each request by your server hooks. This is where you put the authenticated user, session data, or request-scoped values:

```typescript
interface Locals {
  user: { id: string; email: string; role: 'admin' | 'user' } | null;
  requestId: string;
}
```

**`App.PageData`** -- The shape of data shared across all pages (from the root layout's load function). This gives type safety to `page.data` without specifying it per-route.

**`App.Platform`** -- Platform-specific context from your adapter. For example, Cloudflare Workers provides `env` and `context` objects here.

## `src/hooks.server.ts` -- The Request Lifecycle

Hooks are middleware-like functions that run on every server request. This file is optional but essential for production applications.

```typescript
// src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // This runs for EVERY request — before any route handling

  // Example: Read a session cookie and attach user to locals
  const sessionId = event.cookies.get('session');
  if (sessionId) {
    const user = await getUserFromSession(sessionId);
    event.locals.user = user;
  }

  // Continue to the route handler
  const response = await resolve(event);

  // This runs AFTER the route handler — you can modify the response
  response.headers.set('X-Request-Id', crypto.randomUUID());

  return response;
};
```

### The Request Lifecycle in Full

Understanding where hooks fit in the request pipeline prevents confusion about execution order:

```
Browser Request
    │
    ▼
┌──────────────────────────────────────┐
│  hooks.server.ts: handle()           │  1. Server hook
│  - Authentication                    │
│  - Request logging                   │
│  - Rate limiting                     │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  +layout.server.ts: load()           │  2. Root layout load
│  - User data, global settings        │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  +page.server.ts: load()             │  3. Page load
│  - Route-specific data               │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  SSR: +layout.svelte + +page.svelte  │  4. Server-side render
│  - Components render to HTML         │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  app.html template                   │  5. Inject into HTML shell
│  - %sveltekit.head% filled           │
│  - %sveltekit.body% filled           │
└──────────┬───────────────────────────┘
           │
           ▼
Browser receives HTML + JS
    │
    ▼
Hydration (Svelte takes over the DOM)
```

Other hooks you can define:

- **`handleFetch`** -- Intercepts `fetch` calls made during SSR. Use this to rewrite URLs (e.g., internal API calls during SSR should hit `localhost` instead of the public domain) or add authentication headers.
- **`handleError`** -- Called when an unexpected error occurs during loading or rendering. Use this for error reporting (Sentry, LogRocket).

```typescript
// src/hooks.server.ts
import type { HandleServerError } from '@sveltejs/kit';

export const handleError: HandleServerError = async ({ error, event, status, message }) => {
  const errorId = crypto.randomUUID();
  console.error(`[${errorId}]`, error);

  // Report to error tracking service
  // await sentry.captureException(error, { extra: { errorId, url: event.url } });

  return {
    message: 'An unexpected error occurred',
    errorId
  };
};
```

## `.svelte-kit/` -- Generated Files

This directory is created by `svelte-kit sync` (which runs automatically during `npm install` and `npm run dev`). It is **gitignored** -- never commit it. Understanding what is inside helps you debug type errors and understand SvelteKit's internals.

```bash
.svelte-kit/
├── ambient.d.ts               # Declares $app/*, $env/* module types
├── generated/
│   ├── client/                # Client-side app entry point
│   │   ├── app.js             # Client router, hydration setup
│   │   └── nodes/             # One file per route node (page, layout)
│   ├── server/                # Server-side entry point
│   │   └── internal.js        # Server handler, SSR setup
│   └── root.svelte            # Root component that wraps everything
├── types/
│   └── src/routes/
│       ├── $types.d.ts        # Types for root route (PageLoad, etc.)
│       ├── blog/
│       │   ├── $types.d.ts    # Types for /blog (includes 'slug' param)
│       │   └── [slug]/
│       │       └── $types.d.ts
│       └── ...
└── tsconfig.json              # Extends your tsconfig, adds path aliases
```

### The `$types` Auto-Generation

The most important generated files are the `$types.d.ts` files in each route directory. When you import from `./$types`:

```typescript
import type { PageServerLoad } from './$types';
```

TypeScript resolves this to `.svelte-kit/types/src/routes/blog/$types.d.ts`, which contains types specific to that route:

```typescript
// Auto-generated — includes route params, parent data, etc.
export type PageServerLoad = (event: {
  params: { slug: string };  // Derived from [slug] in the path
  parent: () => Promise<LayoutData>;
  // ... other event properties
}) => MaybePromise<Record<string, any>>;
```

This is why route parameters are automatically typed -- SvelteKit scans your directory structure, sees `[slug]`, and generates `params: { slug: string }`. If you rename the folder from `[slug]` to `[id]`, the type updates automatically on the next `svelte-kit sync`.

If TypeScript ever shows errors about missing `$types`, run:

```bash
npx svelte-kit sync
```

## `static/` -- Files Served As-Is

Everything in the `static/` directory is served at the root of your site, without any processing or fingerprinting. This is where you put files that should not go through the build pipeline:

- **`favicon.png`** -- Your site's icon (displayed in browser tabs)
- **`robots.txt`** -- Instructions for search engine crawlers
- **`manifest.json`** -- PWA configuration, if applicable
- **Images and fonts** that you want at fixed, predictable URLs
- **`_headers`** or **`_redirects`** -- Platform-specific files (Netlify, Cloudflare Pages)
- **Verification files** -- Google Search Console, domain verification

```svelte
<!-- Referencing static files — paths start from / (the site root) -->
<img src="/hero-image.jpg" alt="Hero banner" />
<link rel="icon" href="/favicon.png" />
```

Notice you do not include `static/` in the path. The file at `static/hero-image.jpg` is served at `/hero-image.jpg`.

### `static/` vs Vite Imports -- The Decision

| Use `static/` when... | Use Vite imports when... |
|------------------------|--------------------------|
| File needs a fixed, predictable URL | File is tightly coupled to a component |
| File is referenced externally (social media, RSS) | You want automatic optimization |
| File is a non-code asset (robots.txt, manifest) | You want content-hash fingerprinting |
| File changes rarely | File changes often |
| File must not be renamed (SEO, backlinks) | Cache busting matters |

```svelte
<!-- Vite import — processed, fingerprinted, optimized -->
<script lang="ts">
  import heroImage from '$lib/assets/hero.jpg';
  // heroImage = '/assets/hero-a1b2c3.jpg' (fingerprinted path)
</script>
<img src={heroImage} alt="Hero" />

<!-- Static reference — fixed path, no processing -->
<img src="/hero-image.jpg" alt="Hero" />
```

## `svelte.config.js` -- SvelteKit Configuration

This file controls how SvelteKit processes your project. A minimal configuration looks like:

```javascript
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

### Every Important Configuration Option

**`adapter`** -- Determines how your application is packaged for deployment. This is the bridge between SvelteKit and your production environment:

```javascript
// Auto-detect platform (Vercel, Cloudflare, Netlify):
import adapter from '@sveltejs/adapter-auto';

// Node.js server (self-hosted, Docker, Railway):
import adapter from '@sveltejs/adapter-node';

// Static site generation (GitHub Pages, S3):
import adapter from '@sveltejs/adapter-static';

// Cloudflare Workers/Pages:
import adapter from '@sveltejs/adapter-cloudflare';

// Vercel (serverless functions):
import adapter from '@sveltejs/adapter-vercel';
```

**`preprocess`** -- Transforms your code before the Svelte compiler sees it. `vitePreprocess()` handles TypeScript, SCSS, PostCSS, and other preprocessors. If you write `<script lang="ts">`, this is what converts the TypeScript to JavaScript before compilation:

```javascript
preprocess: vitePreprocess()
// This handles:
// - <script lang="ts"> → JavaScript
// - <style lang="scss"> → CSS
// - <style lang="postcss"> → CSS (with PostCSS plugins)
```

**`kit.alias`** -- Custom import aliases beyond the built-in `$lib`:

```javascript
kit: {
  alias: {
    $components: 'src/lib/components',
    $utils: 'src/lib/utils'
  }
}
```

**`kit.paths`** -- Configure base path and asset path:

```javascript
kit: {
  paths: {
    base: '/my-app',        // If deployed at example.com/my-app
    assets: 'https://cdn.example.com'  // CDN for static assets
  }
}
```

**`kit.csp`** -- Content Security Policy headers:

```javascript
kit: {
  csp: {
    directives: {
      'script-src': ['self'],
      'style-src': ['self', 'unsafe-inline']
    }
  }
}
```

**`kit.env`** -- Configure environment variable prefixes:

```javascript
kit: {
  env: {
    publicPrefix: 'PUBLIC_',    // Default — env vars with this prefix are exposed to the client
    privatePrefix: ''           // Default — all other env vars are server-only
  }
}
```

## `vite.config.ts` -- The Build Tool

Vite is the build tool and development server underneath SvelteKit. Its configuration file looks like this:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

The `sveltekit()` plugin does the heavy lifting -- it teaches Vite how to handle `.svelte` files, implements file-based routing, manages server-side rendering, and orchestrates the build process.

### Common Vite Customizations

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],

  // Proxy API requests during development
  server: {
    proxy: {
      '/api/external': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/external/, '')
      }
    }
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: ['lodash-es']  // Pre-bundle large ESM packages
  },

  // Configure build output
  build: {
    sourcemap: true  // Enable source maps in production (useful for error tracking)
  }
});
```

Understanding the relationship: SvelteKit _uses_ Vite, not the other way around. SvelteKit is the framework; Vite is the engine that compiles and serves your code. When you run `npm run dev`, SvelteKit tells Vite what to do.

## `tsconfig.json` -- TypeScript Configuration

The TypeScript config in a SvelteKit project is minimal because it _extends_ SvelteKit's generated config:

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

The extended `.svelte-kit/tsconfig.json` (generated by `svelte-kit sync`) adds:
- Path aliases (`$lib`, `$app`, `$env`)
- Svelte file handling
- Route type paths

**Never modify `.svelte-kit/tsconfig.json` directly** -- it is regenerated on every sync. Add your customizations to the root `tsconfig.json`.

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
- **`preview`** -- Serves the production build locally so you can test it before deploying. This is the closest thing to "what will users see" without actually deploying.
- **`check`** -- Runs `svelte-kit sync` (regenerates types) then `svelte-check`, which type-checks your entire project, including the interplay between TypeScript and Svelte template syntax. Run this before committing -- it catches errors that your editor might miss.
- **`check:watch`** -- Same as `check` but watches for file changes. Useful during refactoring.
- **`lint`** -- Runs ESLint across your project to catch code quality issues.
- **`format`** -- Runs Prettier to format every file in your project.

A typical development workflow: run `dev` while you code, run `check` and `lint` before you commit, run `build` and `preview` before you deploy.

### Adding Custom Scripts

As your project grows, you will add scripts:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "format": "prettier --write .",
    "test": "vitest",
    "test:unit": "vitest run",
    "test:e2e": "playwright test",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "ci": "npm run check && npm run lint && npm run test:unit && npm run build"
  }
}
```

The `ci` script is particularly valuable -- it runs every quality check in sequence, exactly as your CI pipeline would. Run it before pushing to catch everything locally.

## The Mental Model: Files Are Architecture

Here is the single most important idea to take away from this tour:

In SvelteKit, **the file system is the framework**. Your directory structure is not just organization -- it is configuration. Where you place a file determines what it does:

- A file at `src/routes/blog/+page.svelte` becomes a page at `/blog`.
- A file at `src/routes/blog/+page.server.ts` becomes the data loader for that page.
- A file at `src/routes/api/posts/+server.ts` becomes an API endpoint at `/api/posts`.
- A file at `src/lib/components/Card.svelte` becomes a reusable component importable from anywhere via `$lib`.
- A file at `src/lib/server/database.ts` becomes server-only code that the compiler prevents from leaking to clients.
- A file at `static/og-image.png` becomes a publicly accessible asset at `/og-image.png`.
- A file at `src/hooks.server.ts` becomes middleware that runs on every server request.

There is no central routing table. There is no manifest. There is no "register this component" step. You create a file in the right place, with the right name, and SvelteKit knows what to do with it. This is the power of convention over configuration -- it eliminates an entire category of boilerplate and makes your project's architecture visible at a glance.

### The SvelteKit Module Resolution Chain

When you import something in a SvelteKit project, the resolution follows a specific chain:

1. **`$app/*`** -- SvelteKit runtime modules (`$app/navigation`, `$app/state`, `$app/environment`, `$app/forms`, `$app/server`)
2. **`$env/*`** -- Environment variables (`$env/static/private`, `$env/static/public`, `$env/dynamic/private`, `$env/dynamic/public`)
3. **`$lib/*`** -- Your shared code (`src/lib/`)
4. **Custom aliases** -- Anything you defined in `kit.alias`
5. **Relative paths** -- `./Component.svelte`, `../utils`
6. **Node modules** -- `svelte`, `@sveltejs/kit`, etc. from `node_modules/`

All of these (except relative paths and node modules) are resolved via Vite aliases that SvelteKit configures. When you see an import starting with `$`, it is always a Vite alias.

As your project grows, you will appreciate this deeply. A new teammate can open the `src/routes/` directory and immediately understand every page in your application, how they are nested, and where to find the code for any URL. That is a superpower.

## Try It

Open your project in VS Code. Do each of these exercises to build muscle memory with the project structure:

1. Create a new folder at `src/routes/about/` and add a `+page.svelte` file with a heading and paragraph. Start your dev server and visit `http://localhost:5173/about` to see your new page -- no configuration needed.

2. Create `src/routes/about/+page.server.ts` with a load function that returns `{ createdAt: new Date().toISOString() }`. Import the data in your page component and display it. Notice the auto-generated types when you import from `./$types`.

3. Create `src/lib/components/Card.svelte` with a simple card component. Import it in your about page using `$lib/components/Card.svelte`. Then move the about page to a deeper path and confirm the import still works without changes.

4. Explore each of the configuration files: open `app.html` and find the `%sveltekit.head%` and `%sveltekit.body%` placeholders. Open `svelte.config.js` and identify the adapter and preprocessor. Open `package.json` and read through the scripts. Open `.svelte-kit/types/src/routes/$types.d.ts` and see the auto-generated types.

5. Run `npm run check` and confirm zero errors. Then intentionally introduce a type error (pass a number where a string is expected) and run `check` again to see the error reporting.

The more familiar you are with this structure now, the more confident you will feel as we start building real features.

## Key Takeaways

- **`src/routes/`** is file-based routing -- directories become URL segments, `+page.svelte` files become pages, `[brackets]` create dynamic parameters, `(groups)` organize without affecting URLs
- Every `+` prefixed file has a specific role: `+page.svelte` (UI), `+page.server.ts` (server data), `+layout.svelte` (wrapper), `+server.ts` (API endpoint), `+error.svelte` (error UI)
- Start with `+page.server.ts` for data loading -- it is more secure and supports form actions; use `+page.ts` only when you specifically need client-side execution
- **`src/lib/`** holds shared code accessible via the **`$lib`** Vite alias, eliminating brittle relative imports
- **`$lib/server/`** is a compiler-enforced security boundary -- code there cannot be imported into client-side files, preventing accidental secret exposure
- **`src/app.html`** is the HTML shell with five placeholders (`%sveltekit.head%`, `%sveltekit.body%`, `%sveltekit.assets%`, `%sveltekit.nonce%`, `%sveltekit.env.*%`)
- **`src/app.d.ts`** declares app-wide types (`App.Locals`, `App.Error`, `App.PageData`) that flow through load functions, hooks, and components
- **`src/hooks.server.ts`** runs on every request before route handling -- use it for authentication, logging, and request-scoped data
- **`.svelte-kit/`** contains generated types and entry points -- never edit directly, never commit, regenerate with `svelte-kit sync`
- **`static/`** serves files as-is at the site root -- no processing, no fingerprinting; use Vite imports for assets that need optimization
- **`svelte.config.js`** controls adapters (deployment targets), preprocessors (TypeScript, SCSS), aliases, paths, CSP, and environment variable prefixes
- **`vite.config.ts`** configures the underlying build tool -- SvelteKit uses Vite, not the other way around
- **`package.json`** scripts define your workflow: `dev` for coding, `build` for production, `check` for type-checking, `lint` for code quality
- The core mental model: **your directory structure IS your application architecture** -- SvelteKit turns file system conventions into framework behavior with zero boilerplate
