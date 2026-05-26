# Creating a SvelteKit Project

Now that your tools are installed, it is time to create your first SvelteKit project. This is the moment where theory becomes tangible -- within a few minutes you will have a working application running on your machine, and you will see code changes appear in the browser the instant you save a file.

But we are not just going to run a command and move on. Understanding _what_ the scaffolding tool creates, _why_ each option matters, and _how_ the underlying tools work will save you confusion later when you need to change these decisions -- and you will. I have seen teams waste days debugging build issues that would have been obvious if they understood the toolchain they were using.

## Svelte vs. SvelteKit -- Understanding the Difference

Before we create anything, let's clarify what you are building. **Svelte** and **SvelteKit** are related but distinct:

- **Svelte** is a _component framework_. It gives you a way to write reactive UI components in `.svelte` files using a clean, expressive syntax. Svelte compiles these components into efficient vanilla JavaScript at build time -- no runtime framework ships to the browser.
- **SvelteKit** is a _full application framework_ built on top of Svelte. It adds everything you need to build a real application: file-based routing, server-side rendering (SSR), API routes, data loading, deployment adapters, and a development server powered by Vite.

Think of it this way: Svelte is the language for writing components. SvelteKit is the architecture for building applications out of those components. You rarely use Svelte without SvelteKit, just as you rarely write React components without Next.js or a similar framework in professional work.

### What SvelteKit Gives You Over Svelte Alone

If you tried to build a production application with Svelte alone (without SvelteKit), here is what you would need to set up yourself:

| Concern | Without SvelteKit | With SvelteKit |
|---------|-------------------|----------------|
| Routing | Install a router library, configure routes manually, handle code splitting yourself | File-based routing with automatic code splitting |
| Server-side rendering | Set up a Node server, render components manually, handle hydration | Built-in SSR with automatic hydration |
| Data loading | Write fetch logic in components, handle loading/error states manually, manage client/server data flow | `load` functions with typed data, streaming, and error boundaries |
| API endpoints | Set up Express/Fastify/Hono, configure CORS, handle serialization | `+server.ts` files with typed request handlers |
| Static asset handling | Configure a CDN, set up fingerprinting, manage cache headers | Built-in with Vite's asset pipeline |
| Build and deployment | Configure Rollup/Webpack, write deployment scripts, manage environment variables | Adapters for every platform (Vercel, Cloudflare, Node, static) |
| Development experience | Configure Vite manually, set up HMR, configure proxies | Zero-config dev server with HMR |
| SEO and meta tags | Build a `<head>` management system | `<svelte:head>` with SSR support |
| Form handling | Roll your own form processing, CSRF protection, validation | Form actions with progressive enhancement |
| Prerendering | Build a static site generator | Per-route prerendering configuration |

SvelteKit does not just save you time -- it saves you from making architectural decisions that are hard to reverse. The routing convention, the data loading pattern, the server/client boundary -- these are decisions the framework has already made well, so you can focus on your application.

There is also a **Svelte library** project type, which is for publishing reusable component packages to npm. Unless you are building a component library for other developers to consume, you want a **SvelteKit app** project. That is what we will create.

## Running the Project Generator

Open your terminal, navigate to the folder where you want your projects to live, and run:

```bash
npx sv create my-app
```

Let's break this command down piece by piece:

- **`npx`** -- Runs a package without installing it globally. It downloads the latest version of `sv`, executes it, and cleans up. This ensures you always use the newest scaffolding tool. Under the hood, npx checks your local `node_modules/.bin` first, then your global installs, and only downloads from the registry if neither has it.
- **`sv`** -- The official Svelte CLI. It replaced the older `create-svelte` tool and handles project creation, adding integrations, and more.
- **`create`** -- Tells `sv` you want to scaffold a new project.
- **`my-app`** -- The directory name for your project. Choose something meaningful for real projects.

### Alternative Invocations

You do not always need `npx`. If you want to use pnpm or bun:

```bash
# With pnpm (automatically uses pnpx):
pnpm create svelte@latest my-app

# With bun:
bunx sv create my-app

# Or install sv globally (useful if you create projects often):
npm install -g sv
sv create my-app
```

The `sv` CLI also supports non-interactive mode for CI/scripts:

```bash
# Skip all prompts with flags:
npx sv create my-app --template minimal --types ts --no-add-ons
```

### Understanding Each Option

The CLI will ask you a series of questions. Here is what each one means, what it does to your project, and why the recommended choices matter:

**Template: SvelteKit minimal**

You will see options like "SvelteKit minimal", "SvelteKit demo app", and "Svelte library". Choose **SvelteKit minimal**. It gives you a clean starting point -- a single page with no demo content to delete. The demo app includes example routes and styling that look impressive but get in your way when you start building your own thing. The library template is for npm package authors, not application developers.

What each template actually scaffolds:

- **SvelteKit minimal** -- One route (`+page.svelte`), `app.html`, configuration files. Clean slate.
- **SvelteKit demo** -- Multiple routes with a counter, navigation, Sverdle game demo. Educational but creates cleanup work.
- **Svelte library** -- Configured with `@sveltejs/package` for building and publishing a component library to npm. Includes `src/lib` as the package entry point and a `src/routes` for a documentation site.

**Type checking: Yes, using TypeScript syntax**

This adds TypeScript support using the `lang="ts"` attribute in your `<script>` blocks. You write TypeScript syntax inside Svelte components -- type annotations, interfaces, generics -- but your `.svelte` files remain `.svelte` files, not `.ts` files.

```svelte
<script lang="ts">
  let count: number = $state(0);
  // TypeScript catches errors here at development time

  interface Product {
    id: string;
    name: string;
    price: number;
  }

  let products: Product[] = $state([]);
</script>
```

The alternative option "Yes, using JSDoc comments" lets you add type annotations in plain JavaScript files using `/** @type {number} */` comments. This works but is verbose, less powerful (no generics syntax, no utility types inline), and most of the Svelte ecosystem's examples and documentation assume TypeScript.

TypeScript is not optional decoration. It is the single biggest productivity multiplier in frontend development. It catches bugs before they reach the browser, enables intelligent autocomplete, and serves as living documentation for your code. Choose TypeScript. Always.

**What TypeScript support actually adds to your project:**

- `tsconfig.json` -- TypeScript compiler configuration
- `app.d.ts` -- Type declarations for SvelteKit's generated types
- `lang="ts"` capability in `.svelte` files
- The `svelte-check` command for project-wide type checking
- Type inference for `load` function return values, form actions, and route parameters

**Additional options (add-ons): Prettier, ESLint, Vitest, Playwright**

- **Prettier** -- Adds a `.prettierrc` configuration file, the `prettier-plugin-svelte` package, and a `format` script. Code formatting becomes automatic and consistent. There is no reason not to include this.
- **ESLint** -- Adds linting rules that catch common mistakes (unused variables, accessibility issues, unreachable code). Includes Svelte-specific rules from `eslint-plugin-svelte` that understand `.svelte` file structure -- for example, it can warn about reactive assignments in wrong contexts, accessibility issues in Svelte template syntax, and unused `$state` variables.
- **Vitest** -- Adds a unit testing framework configured to work with your project. Vitest is built on Vite (the same build tool SvelteKit uses), so it starts fast and understands your project's import aliases (`$lib`, `$app/*`) out of the box. Even if you are not writing tests yet, having the infrastructure ready removes a barrier when you need it.
- **Playwright** -- Adds end-to-end testing. Playwright launches a real browser and interacts with your application the way a user would -- clicking buttons, filling forms, navigating pages. It includes a `test` script and a configuration file. This is overkill for a learning project, but essential for production applications.

Additional add-ons you might see:

- **Tailwind CSS** -- Adds Tailwind CSS v4 with the Svelte plugin, `app.css` with Tailwind imports, and PostCSS configuration.
- **mdsvex** -- Markdown preprocessor for Svelte. Lets you write `.svx` files that combine Markdown with Svelte components. Used for blogs, documentation sites, and content-heavy pages.
- **Paraglide** -- Internationalization (i18n) library that integrates with SvelteKit's routing for type-safe translations.

For this course, select **Prettier** and **ESLint** at minimum. Add **Vitest** if you want to write unit tests as you learn.

### How These Tools Form a Quality Pipeline

These tools work together to form a multi-layer quality pipeline. Each one catches a different category of mistake, and together they catch almost everything before it reaches a user:

```
Your Code
    │
    ▼
┌─────────────────┐
│    Prettier      │  Layer 1: Formatting (how code looks)
│  (on save)       │  Tabs, line breaks, quotes, semicolons
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    ESLint        │  Layer 2: Correctness (whether code follows best practices)
│  (on save +      │  Unused vars, accessibility, Svelte-specific rules
│   pre-commit)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  TypeScript +    │  Layer 3: Types (whether data flows correctly)
│  svelte-check    │  Type mismatches, missing props, null safety
│  (npm run check) │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│    Vitest        │  Layer 4: Unit Tests (whether logic is correct)
│  (npm run test)  │  Component behavior, utility functions, edge cases
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Playwright     │  Layer 5: E2E Tests (whether the app works end-to-end)
│  (npm run test:  │  User flows, form submissions, navigation
│   integration)   │
└─────────────────┘
```

When you save a file, Prettier formats it. ESLint runs and auto-fixes what it can. When you run `npm run check`, TypeScript and Svelte's type checker analyze your entire project. Each layer catches bugs the previous layers cannot. Prettier cannot tell you a variable is unused. ESLint cannot tell you a function returns `string | null` when you expected `string`. TypeScript cannot tell you the login flow is broken. Together, they create a safety net that lets you move fast with confidence.

## Installing Dependencies

Once scaffolding is complete, move into your project and install dependencies:

```bash
cd my-app
npm install
```

### What Actually Happens During `npm install`

This seemingly simple command triggers a complex multi-step process:

1. **Read `package.json`** -- npm finds your project's declared dependencies. A fresh SvelteKit project has surprisingly few direct dependencies (typically `@sveltejs/adapter-auto`, `@sveltejs/kit`, `@sveltejs/vite-plugin-svelte`, `svelte`, `vite`, and your optional tooling).

2. **Resolve the dependency tree** -- Each dependency has its own dependencies, which have their own dependencies. npm resolves the entire tree, handling version conflicts along the way. A typical SvelteKit project resolves to 200-400 transitive packages. This is not bloat -- it is the cost of having specialized tools for every task (parsing, transforming, optimizing, serving).

3. **Fetch packages** -- npm downloads tarballs from the npm registry (`registry.npmjs.org`). Packages are cached locally in `~/.npm`, so subsequent installs of the same version are near-instant.

4. **Extract and link** -- npm extracts tarballs into `node_modules`, arranging them in a flat structure (hoisting where possible to reduce duplication).

5. **Run lifecycle scripts** -- Some packages define `postinstall` scripts that run after extraction. For example, `@sveltejs/kit` runs `svelte-kit sync` to generate type definitions.

6. **Write the lockfile** -- npm writes (or updates) `package-lock.json` with the exact resolved versions, URLs, and integrity hashes.

The `node_modules` folder will be large (often 100-200MB). This is normal. It is excluded from version control by the `.gitignore` file that `sv create` generated for you. Every developer runs `npm install` to recreate it from the lockfile.

### Understanding `devDependencies` vs `dependencies`

Look at your `package.json` after scaffolding:

```json
{
  "devDependencies": {
    "@sveltejs/adapter-auto": "^4.0.0",
    "@sveltejs/kit": "^2.0.0",
    "@sveltejs/vite-plugin-svelte": "^5.0.0",
    "svelte": "^5.0.0",
    "typescript": "^5.0.0",
    "vite": "^6.0.0"
  }
}
```

Notice: everything is a `devDependency`. This seems counterintuitive -- surely Svelte is needed at runtime? But remember: Svelte is a _compiler_. At build time, it transforms your `.svelte` files into plain JavaScript. The built output does not import from `svelte` at runtime (with a few exceptions for runtime helpers that are inlined). SvelteKit itself is also a build-time tool -- the adapter produces a standalone server or static files that run without SvelteKit installed.

This is different from frameworks like React, where `react` and `react-dom` are `dependencies` because the React runtime must be present when the application runs. Svelte's compiler approach means your production bundle is smaller and your deployment is simpler.

If you add server-side libraries (a database driver, an email service), those go in `dependencies` because they are needed when the server runs in production.

## Starting the Dev Server

With dependencies installed, start the development server:

```bash
npm run dev
```

You should see output like this:

```bash
  VITE v6.x.x  ready in 500ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### What Just Happened -- The Full Chain

Here is the complete chain of events, from your terminal command to pixels on screen:

1. **npm looks up the `dev` script** in `package.json` and finds `"vite dev"`.
2. **Vite starts** -- Vite is the build tool and development server that SvelteKit uses under the hood.
3. **Vite loads plugins** -- It reads `vite.config.ts` and initializes the `sveltekit()` plugin, which registers the Svelte compiler as a Vite transform.
4. **SvelteKit generates types** -- The SvelteKit plugin runs `svelte-kit sync`, generating TypeScript declarations in `.svelte-kit/types/` for your routes, params, and load functions.
5. **An HTTP server starts** on port 5173 -- This is not a traditional server that reads static files. It is a "transform-on-demand" server that compiles files the moment the browser requests them.
6. **A WebSocket server starts** alongside the HTTP server for Hot Module Replacement.
7. **The server is ready** -- Vite prints the URL and waits for requests.

When you open `http://localhost:5173` in your browser:

8. The browser requests `/`. Vite intercepts this and serves `src/app.html` with injected script tags.
9. The browser's JavaScript fetches your root layout and page components. Vite compiles them _on demand_ -- your `.svelte` file is transformed to JavaScript only when the browser asks for it.
10. The compiled JavaScript runs in the browser, mounting your Svelte components to the DOM.

## Vite -- The Build Engine Under SvelteKit

Vite deserves its own section because understanding why it is fast changes how you think about modern development. Vite (French for "quick," created by Evan You, who also created Vue.js) is fundamentally different from older bundlers like Webpack.

### Why Vite Is Fast -- The Architecture

Traditional bundlers (Webpack, Parcel) follow a **bundle-first** approach:

1. Start from the entry point
2. Crawl the entire import graph
3. Bundle everything into one or more output files
4. Serve the bundle to the browser

For a large project, step 2-3 can take 10-30 seconds on cold start. Every file in your project is read, parsed, and bundled before you see anything.

Vite follows a **serve-first** approach in development:

1. Start the server immediately (no bundling)
2. When the browser requests a file, transform it on demand
3. Serve the transformed file as a native ES module
4. Let the browser resolve imports by making additional requests

```
Traditional Bundler (Webpack):
  Source Files → [Bundle Everything] → Single Bundle → Browser
  Cold start: 10-30 seconds

Vite:
  Browser request → [Transform single file] → ES Module → Browser
  Cold start: < 1 second
```

This works because modern browsers natively support ES modules (`import`/`export`). Instead of bundling hundreds of files into one, Vite serves each file individually and lets the browser's module system handle the dependency graph. The browser makes more HTTP/2 requests, but each one is tiny and fast.

### The Two Engines Inside Vite

Vite uses two different tools for different purposes, and understanding why helps when you encounter performance issues:

**esbuild (development):**
- Written in Go, compiled to native code -- 10-100x faster than JavaScript-based tools
- Handles TypeScript transpilation, JSX transformation, and CSS modules
- Does NOT do type checking (that is TypeScript's job via `svelte-check`)
- Used for dependency pre-bundling: Vite scans your `node_modules` and pre-bundles large libraries (like Svelte's runtime helpers) into single files to reduce HTTP requests

**Rollup (production build):**
- The production bundler, written in JavaScript
- More configurable than esbuild, better tree-shaking, more mature plugin ecosystem
- Produces highly optimized output: code splitting, minification, asset fingerprinting
- Slower than esbuild, but production builds happen once, not on every save

```
Development:
  .svelte → Svelte compiler → JS → esbuild → ES Module → Browser
  Speed: milliseconds per file

Production (npm run build):
  .svelte → Svelte compiler → JS → Rollup → Optimized bundles
  Speed: seconds for entire project
```

### Dependency Pre-Bundling

When you first run `npm run dev`, Vite scans your imports and pre-bundles your `node_modules` dependencies. This is necessary because many npm packages are published as CommonJS (`require`/`module.exports`), not ES modules, and browsers cannot import CommonJS. Vite uses esbuild to convert everything to ESM and combine many small files into fewer ones.

You will see this in your terminal on first run:

```
Optimizing dependencies:
  svelte, @sveltejs/kit, ...
```

The results are cached in `node_modules/.vite`. Subsequent starts skip this step. If you ever see stale behavior after installing a new package, you can force re-optimization:

```bash
# Delete the Vite cache and restart:
rm -rf node_modules/.vite
npm run dev
```

## Hot Module Replacement: Why Development Feels Instant

When you edit a `.svelte` file and save it, the browser updates within milliseconds -- without a full page refresh. This is **Hot Module Replacement (HMR)**, and understanding how it works at a technical level helps you debug the rare cases where it does not behave as expected.

### The HMR Protocol

Here is the complete flow:

1. **File system event** -- You save a file. The OS notifies Vite via `fs.watch` (or `chokidar` on platforms where native watching is unreliable).

2. **Module graph invalidation** -- Vite maintains an in-memory graph of every module and its dependencies. When a file changes, Vite walks the graph upward to find the "HMR boundary" -- the nearest module that knows how to accept updates. For Svelte components, the Svelte plugin registers each component as its own HMR boundary.

3. **Recompilation** -- Vite recompiles _only the changed file_. The Svelte compiler transforms the `.svelte` file into JavaScript, and esbuild handles any TypeScript. This typically takes 5-50ms.

4. **WebSocket notification** -- Vite sends a message over the WebSocket connection to the browser: "Module `/src/routes/+page.svelte` has changed. Here is the new code."

5. **Hot swap** -- The browser's HMR runtime replaces the old module with the new one. For Svelte components, this means:
   - The component's template and reactive declarations are updated
   - `$state` values are **preserved** (the old state is migrated to the new component instance)
   - `$effect` callbacks are re-run with the new dependencies
   - CSS changes are applied by replacing the `<style>` tag

6. **DOM update** -- Svelte's reactivity system reconciles the DOM with the new template. Only the changed parts of the DOM are touched.

### Module Graph Invalidation -- The Key Concept

The module graph is what makes HMR surgical rather than brute-force. Consider this dependency chain:

```
+page.svelte → imports Header.svelte → imports Logo.svelte
                                      → imports NavLinks.svelte
```

If you edit `Logo.svelte`, Vite does not recompile `Header.svelte` or `+page.svelte`. It recompiles only `Logo.svelte`, sends the update to the browser, and the browser replaces just that module. The key is that `Logo.svelte` is an HMR boundary -- it can accept its own updates without requiring its parent to update.

But if you change a utility function that is imported by multiple components:

```
utils/format.ts → imported by ProductCard.svelte
                → imported by CartSummary.svelte
                → imported by OrderHistory.svelte
```

Vite invalidates all three components and sends updates for each one. This is still fast (three compilations instead of one), but it shows why keeping utility files small and focused can improve HMR performance in large projects.

### When HMR Fails -- Full Reload Triggers

HMR is not magic. Certain changes force a full page reload:

- **Editing `app.html`** -- This is the HTML shell; there is no way to hot-replace it.
- **Changing `svelte.config.js` or `vite.config.ts`** -- Configuration changes require a server restart.
- **Modifying a module that is not an HMR boundary** -- If a changed module is imported at the top level of a non-component file and no ancestor is an HMR boundary, Vite falls back to a full reload.
- **Syntax errors** -- If your file has a syntax error, the HMR update fails and Vite shows an error overlay. Fix the error and save again -- it recovers automatically.

### State Preservation -- What Is Kept and What Is Not

HMR preserves `$state` values, but not everything:

| Preserved | Not Preserved |
|-----------|---------------|
| `$state` variable values | `$effect` side effects (re-run) |
| Form input values | `onMount` callbacks (re-run) |
| Scroll position | `setTimeout`/`setInterval` (old ones leak if not cleaned up) |
| Component tree structure | URL/route state (same URL, so usually fine) |

This means if you have a `$effect` that sets up a WebSocket connection, HMR will establish a _new_ connection without closing the old one. This is why cleanup in `$effect` is important:

```svelte
<script lang="ts">
  // WRONG: Leaks connections during HMR
  $effect(() => {
    const ws = new WebSocket('wss://api.example.com');
    ws.onmessage = (e) => console.log(e.data);
  });

  // CORRECT: Cleanup function closes the old connection
  $effect(() => {
    const ws = new WebSocket('wss://api.example.com');
    ws.onmessage = (e) => console.log(e.data);
    return () => ws.close();
  });
</script>
```

## Your First Modification

Let's prove that this works. Open `src/routes/+page.svelte` in VS Code. You will see something like:

```svelte
<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
```

Change the heading text:

```svelte
<h1>Hello, SvelteKit!</h1>
<p>This is my first project.</p>
```

Save the file. Watch the browser -- the text updates instantly. No refresh, no rebuild, no waiting. That is HMR in action.

Now try something more interesting. Add a reactive variable:

```svelte
<script lang="ts">
  let count = $state(0);
</script>

<h1>Hello, SvelteKit!</h1>
<button onclick={() => count++}>
  Clicked {count} times
</button>
```

Save, click the button a few times to increment the counter, then change the heading text again and save. Notice: the heading updates, but the counter value is preserved. HMR replaced the template without resetting your component state.

### Going Further -- Understanding the Compiled Output

To see what Svelte does with your component, open your browser's DevTools, go to the Network tab, and filter by JS. Find the request for `+page.svelte`. The response is not your original Svelte code -- it is compiled JavaScript that looks something like:

```javascript
// Simplified view of compiled output
import { $state } from 'svelte/internal';

export default function Page($$anchor) {
  let count = $state(0);

  // Template rendering code...
  // DOM creation and update code...
  // Event listener for the button click...
}
```

The Svelte compiler has transformed your declarative template into imperative DOM operations. There is no virtual DOM diffing, no runtime template parsing. The compiler generates the minimal code needed to create and update exactly the DOM nodes your template describes. This is why Svelte applications are small and fast -- the compiler does the work at build time so the browser does not have to at runtime.

## Production Build -- How It Differs from Development

Development and production are fundamentally different modes:

```bash
# Development (what you have been using):
npm run dev     # Vite dev server, no bundling, HMR

# Production build:
npm run build   # Rollup bundles, optimizes, and outputs to /build

# Preview the production build locally:
npm run preview # Serves the built output on localhost:4173
```

### What `npm run build` Does

1. **SvelteKit analyzes your routes** -- It discovers all pages, layouts, load functions, and API endpoints.
2. **Svelte compiler runs on every `.svelte` file** -- Components are compiled to optimized JavaScript with no development-mode warnings.
3. **Rollup bundles the output** -- Code splitting is applied automatically: each route gets its own chunk, shared code is extracted into common chunks.
4. **CSS is extracted and minified** -- Component styles are combined, deduplicated, and minified into separate CSS files.
5. **Assets are fingerprinted** -- File names get content hashes (e.g., `app-a1b2c3.js`) for aggressive cache headers.
6. **The adapter packages everything** -- `adapter-auto` detects your platform and produces the appropriate output format.
7. **Prerendering runs** -- Any pages marked for prerendering are rendered to static HTML at build time.

The output goes to `.svelte-kit/output` (intermediate) and then to `build/` (final, adapter-specific). The production build is typically 50-200KB of JavaScript for a medium-sized application, compared to the megabytes of unoptimized modules served in development.

### Preview Before You Deploy

Always run `npm run preview` before deploying:

```bash
npm run build && npm run preview
```

Preview serves the production build locally on port 4173. This catches issues that only appear in production mode:
- Missing environment variables (dev might use defaults)
- Broken imports (dev is more lenient about module resolution)
- SSR errors (components that reference `window` or `document` without guards)
- Bundle size surprises (check the Network tab)

## Common Issues and How to Fix Them

### Port 5173 is already in use

This means another process (probably a previous dev server you forgot to stop) is using that port. Either stop the other process or start on a different port:

```bash
npm run dev -- --port 3000

# Or find and kill the process using the port:
# macOS/Linux:
lsof -i :5173
kill -9 <PID>

# Windows PowerShell:
netstat -ano | findstr :5173
taskkill /PID <PID> /F
```

### `command not found: node` after installation

Your terminal does not know where Node.js is installed. Close and reopen your terminal -- installation updates to PATH often require a new shell session. On macOS, if you used a version manager, make sure you ran `fnm use` or `nvm use`.

### Permission errors on macOS/Linux

If you see `EACCES` errors when installing global packages, do not use `sudo npm install`. Instead, configure npm to use a different directory for global installs, or switch to a version manager like fnm which installs Node.js in your home directory where permissions are not an issue.

### `Cannot find module` or resolution errors

This usually means `npm install` was not run, or it failed partway through. Delete the `node_modules` folder and the lockfile, then reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

If the error mentions a `.svelte-kit` path, regenerate the types:

```bash
npx svelte-kit sync
```

### Node version mismatch warnings

SvelteKit requires Node.js 18.13 or later. If you see version warnings, upgrade Node.js. If you are using a version manager, run `fnm install 22` or `nvm install 22` and switch to it.

### TypeScript errors in fresh project

If `npm run check` shows errors in a brand-new project, ensure you ran `npm install` completely and that `svelte-kit sync` has been executed (it runs automatically during install, but network issues can interrupt it):

```bash
npx svelte-kit sync
npm run check
```

### HMR stops working or gets stuck

Occasionally the HMR connection drops (especially on unstable networks or after laptop sleep). Symptoms: changes are not reflected, or you see a "connection lost" overlay. Fixes:

1. Hard refresh the browser (`Ctrl+Shift+R` / `Cmd+Shift+R`)
2. If that does not work, restart the dev server (`Ctrl+C`, then `npm run dev`)
3. If problems persist, clear the Vite cache: `rm -rf node_modules/.vite && npm run dev`

### Slow dev server startup

If the dev server takes more than a few seconds to start:

1. **Too many files in `node_modules`** -- Consider switching to pnpm
2. **File system watcher limits (Linux)** -- Increase the inotify limit:
   ```bash
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
   ```
3. **Antivirus scanning** -- Exclude your project directory and `node_modules` from real-time scanning
4. **Network drives** -- Vite's file watcher does not work reliably on network-mounted directories. Clone your project to a local drive.

## Try It

Create a new SvelteKit project using the steps above. Choose the minimal template, TypeScript, Prettier, and ESLint. Start the dev server and open the welcome page in your browser.

Then open `src/routes/+page.svelte`, add a counter with `$state`, and watch the browser update as you save. Click the button a few times, then edit the heading text and save again -- confirm that the counter value is preserved. This is the development experience you will have for the rest of the course.

Next, run `npm run build` followed by `npm run preview`. Open `http://localhost:4173` and confirm your application works in production mode. Open DevTools, go to the Network tab, and look at the JavaScript files being loaded -- notice the content hashes in the filenames and the much smaller file sizes compared to development mode.

Finally, open the browser DevTools Network tab while in dev mode. Save a file and watch the WebSocket messages in the WS tab. You will see the HMR update protocol in action -- the server sending module update notifications and the client requesting the new code.

## Key Takeaways

- **`npx sv create my-app`** scaffolds a new SvelteKit project -- always choose the **SvelteKit minimal** template for a clean start
- **SvelteKit** builds on Svelte by adding routing, SSR, API routes, data loading, form actions, and deployment adapters -- it is the application framework, not just the component compiler
- Always select **TypeScript**, **Prettier**, and **ESLint** -- these form a multi-layer quality pipeline where each tool catches a different category of bugs
- **`npm install`** resolves the full dependency tree (200-400 transitive packages), verifies integrity hashes, and writes exact versions to the lockfile for reproducibility
- SvelteKit dependencies are all `devDependencies` because Svelte is a compiler -- the production output does not import the framework at runtime
- **Vite** powers the dev server using a **serve-first** architecture -- it serves files as native ES modules instead of bundling, which is why startup is nearly instant
- Vite uses **esbuild** (native Go binary) for fast development transforms and **Rollup** for optimized production bundles
- **Hot Module Replacement** uses WebSocket to push updated modules to the browser, Svelte's HMR support preserves `$state` values across updates, and the module graph determines which files need recompilation
- HMR preserves component state but re-runs effects -- always provide cleanup functions in `$effect` to prevent resource leaks during development
- **`npm run build`** produces optimized output with code splitting, CSS extraction, asset fingerprinting, and adapter-specific packaging -- always test with `npm run preview` before deploying
- When something goes wrong, check the common issues list -- port conflicts, missing installs, stale caches, and version mismatches account for the vast majority of setup problems
