# Creating a SvelteKit Project

Now that your tools are installed, it is time to create your first SvelteKit project. This is the moment where theory becomes tangible -- within a few minutes you will have a working application running on your machine, and you will see code changes appear in the browser the instant you save a file.

But we are not just going to run a command and move on. Understanding _what_ the scaffolding tool creates, _why_ each option matters, and _how_ the underlying tools work will save you confusion later when you need to change these decisions -- and you will. The scaffolding step is where dozens of architectural choices are made silently on your behalf, and a principal engineer understands every one of them.

## Svelte vs. SvelteKit -- Understanding the Difference

Before we create anything, let's clarify what you are building. **Svelte** and **SvelteKit** are related but distinct:

- **Svelte** is a _component framework_. It gives you a way to write reactive UI components in `.svelte` files using a clean, expressive syntax. Svelte compiles these components into efficient vanilla JavaScript at build time -- no runtime framework ships to the browser.
- **SvelteKit** is a _full application framework_ built on top of Svelte. It adds everything you need to build a real application: file-based routing, server-side rendering (SSR), API routes, data loading, deployment adapters, and a development server powered by Vite.

Think of it this way: Svelte is the language for writing components. SvelteKit is the architecture for building applications out of those components. You rarely use Svelte without SvelteKit, just as you rarely write React components without Next.js or a similar framework in professional work.

There is also a **Svelte library** project type, which is for publishing reusable component packages to npm. Unless you are building a component library for other developers to consume, you want a **SvelteKit app** project. That is what we will create.

### The Architectural Layer Cake

Understanding the relationship between these layers prevents a common source of confusion. Here is the full stack from bottom to top:

```
  Your Application Code         (your .svelte files, routes, logic)
  ─────────────────────────
  SvelteKit                      (routing, SSR, load functions, adapters)
  ─────────────────────────
  Svelte Compiler                (compiles .svelte to JS/CSS at build time)
  ─────────────────────────
  Vite                           (dev server, HMR, bundling, module resolution)
  ─────────────────────────
  Node.js                        (JavaScript runtime, npm, file system access)
```

Each layer depends on the one below it. SvelteKit cannot function without Vite. Vite cannot function without Node.js. Your application code sits on top of all of them, benefiting from each layer without needing to interact with it directly.

This layering matters when you encounter errors. A "Cannot find module" error is usually a Node.js or npm layer problem. A compilation error about invalid syntax is a Svelte compiler issue. A "404 Not Found" for a route you know exists is typically a SvelteKit routing issue. Knowing which layer produced the error tells you where to look for the fix.

## Running the Project Generator

Open your terminal, navigate to the folder where you want your projects to live, and run:

```bash
npx sv create my-app
```

Let's break this command down:

- **`npx`** -- Runs a package without installing it globally. It downloads the latest version of `sv`, executes it, and cleans up. This ensures you always use the newest scaffolding tool.
- **`sv`** -- The official Svelte CLI. It replaced the older `create-svelte` tool and handles project creation, adding integrations, and more.
- **`create`** -- Tells `sv` you want to scaffold a new project.
- **`my-app`** -- The directory name for your project. Choose something meaningful for real projects.

### Why `npx` Instead of a Global Install

You might wonder why we do not install `sv` globally with `npm install -g sv`. There are several architectural reasons:

**Version pinning.** `npx` always fetches the latest version. A globally installed CLI can become stale -- six months later, you scaffold a project with an outdated tool that generates outdated configuration. This is a subtle trap because the project _works_, but it uses older patterns, older dependency versions, and misses improvements made to the scaffolding tool.

**Zero-maintenance.** A global install needs periodic updating. `npx` is stateless -- no maintenance required.

**Team consistency.** If every team member uses `npx`, everyone scaffolds with the same version. If some people have global installs at different versions, you get subtly different starting points.

The tradeoff is a few seconds of download time on each run. That cost is negligible compared to the debugging hours saved by always starting from the latest template.

### Understanding Each Option

The CLI will ask you a series of questions. Here is what each one means and why the recommended choices matter:

**Template: SvelteKit minimal**

You will see options like "SvelteKit minimal", "SvelteKit demo app", and "Svelte library". Choose **SvelteKit minimal**. It gives you a clean starting point -- a single page with no demo content to delete. The demo app includes example routes and styling that look impressive but get in your way when you start building your own thing. The library template is for npm package authors, not application developers.

```
# WRONG mental model: "The demo app will teach me patterns"
# It actually teaches you patterns you will immediately delete.
# Starting with clutter means your first task is cleanup, not building.

# CORRECT mental model: "Minimal template = maximum control"
# You add exactly what you need, when you need it.
# Every file in the project exists because you put it there.
```

**Type checking: Yes, using TypeScript syntax**

This adds TypeScript support using the `lang="ts"` attribute in your `<script>` blocks. You write TypeScript syntax inside Svelte components -- type annotations, interfaces, generics -- but your `.svelte` files remain `.svelte` files, not `.ts` files.

```svelte
<script lang="ts">
  let count: number = $state(0);
  // TypeScript catches errors here at development time
</script>
```

TypeScript is not optional decoration. It is the single biggest productivity multiplier in frontend development. It catches bugs before they reach the browser, enables intelligent autocomplete, and serves as living documentation for your code. Choose TypeScript. Always.

There is a deeper architectural point here. Svelte 5's runes (`$state`, `$derived`, `$effect`) have first-class TypeScript support. The compiler understands that `$state(0)` returns a `number`, that `$derived(() => count * 2)` infers the return type, and that `$props()` can be typed with an interface. Without TypeScript, you lose all of this -- your editor cannot help you catch prop mismatches, wrong state types, or incorrect derived computations. TypeScript is not just "nice to have" with Svelte 5 -- it is integral to the development experience.

**Additional options: Prettier, ESLint, Vitest, Playwright**

- **Prettier** -- Adds a `.prettierrc` configuration file and a `format` script. Code formatting becomes automatic and consistent. There is no reason not to include this.
- **ESLint** -- Adds linting rules that catch common mistakes (unused variables, accessibility issues, unreachable code). Includes Svelte-specific rules that understand `.svelte` file structure.
- **Vitest** -- Adds a unit testing framework. Vitest is built on Vite (the same build tool SvelteKit uses), so it starts fast and understands your project's import aliases out of the box. Even if you are not writing tests yet, having the infrastructure ready removes a barrier when you need it.
- **Playwright** -- Adds end-to-end testing. Playwright launches a real browser and interacts with your application the way a user would -- clicking buttons, filling forms, navigating pages.

For this course, select **Prettier** and **ESLint** at minimum. Add **Vitest** if you want to write unit tests as you learn.

### The Quality Pipeline Mental Model

These tools work together to form a quality pipeline, and understanding their roles prevents the common mistake of thinking they are redundant:

```
  Prettier          ESLint            TypeScript          Svelte Check
  ─────────         ──────            ──────────          ────────────
  HOW code looks    WHETHER code      WHETHER data        WHETHER Svelte
  (formatting)      follows rules     flows correctly     templates are
                    (patterns)        (types)             correct (a11y,
                                                          bindings, props)

  Runs on save      Runs on commit    Runs on check       Runs on check
  (instant)         (fast)            (slower)            (slower)
```

Each tool catches a different category of mistake, and together they catch almost everything before it reaches a user. Prettier handles formatting (how code looks), ESLint handles correctness (whether code follows best practices), TypeScript handles types (whether data flows correctly), and `svelte-check` validates template bindings, accessibility, and prop types.

A common architectural mistake is to rely on only one of these. "We have TypeScript, so we do not need ESLint" misunderstands what each tool does. TypeScript does not catch unused variables, accessibility violations, or code style inconsistencies. ESLint does not catch type errors. Prettier does not catch anything -- it just formats. You need all of them.

### The `sv add` Command for Post-Creation Setup

After creating a project, you can add integrations with `sv add`. This is the preferred way to add tools like Tailwind CSS, Drizzle, Lucia, and others:

```bash
# Add Tailwind CSS v4 (uses the @theme directive, not tailwind.config.js)
npx sv add tailwindcss

# Add Drizzle ORM with SQLite
npx sv add drizzle

# Add Lucia authentication
npx sv add lucia
```

The `sv add` command modifies your project files correctly -- it updates `package.json`, adds configuration files, and adjusts `vite.config.ts` or `svelte.config.js` as needed. Manually installing these tools is error-prone because you might miss a configuration step. Let the CLI handle it.

```
# WRONG: Manually installing Tailwind CSS
npm install tailwindcss
# Then manually creating config files, modifying PostCSS config,
# adding directives to your CSS... easy to miss a step.

# CORRECT: Using sv add
npx sv add tailwindcss
# Handles all configuration automatically.
# Tailwind v4 uses the @theme directive in CSS, not tailwind.config.js.
```

## Installing Dependencies

Once scaffolding is complete, move into your project and install dependencies:

```bash
cd my-app
npm install
```

What actually happens when you run `npm install`:

1. npm reads `package.json` to find your project's dependencies (Svelte, SvelteKit, Vite, TypeScript, etc.)
2. It resolves the full dependency tree -- your dependencies have their own dependencies, which have their own dependencies. A typical SvelteKit project has hundreds of transitive packages.
3. It downloads everything into the `node_modules` directory.
4. It writes (or updates) `package-lock.json` with the exact resolved versions.

The `node_modules` folder will be large (often 100MB+). This is normal. It is excluded from version control by the `.gitignore` file that `sv create` generated for you. Every developer runs `npm install` to recreate it from the lockfile.

### The Lockfile: Why It Matters Architecturally

The `package-lock.json` file deserves special attention because it is frequently misunderstood. Here is the mental model:

- `package.json` says **what you want**: `"svelte": "^5.0.0"` means "any version from 5.0.0 up to (but not including) 6.0.0."
- `package-lock.json` says **what you got**: the exact version (e.g., `5.2.7`) that was resolved when someone last ran `npm install`.

```
# WRONG: "The lockfile is auto-generated noise, I will .gitignore it"
# Result: Every developer and CI server gets different dependency versions.
# Builds that work on your machine fail in production. Subtle bugs appear
# only in certain environments. This is a real production incident waiting to happen.

# CORRECT: "The lockfile is a reproducibility guarantee"
# Commit it. Every environment installs identical versions.
# Updates happen explicitly with `npm update`, not implicitly.
```

**Always commit `package-lock.json` to version control.** It guarantees that every developer, CI server, and production deployment uses the exact same dependency tree. Without it, `npm install` might resolve to different versions on different machines, creating the worst kind of bugs: ones that only appear in specific environments.

### Dependencies vs DevDependencies

The `package.json` splits dependencies into two sections:

```json
{
  "dependencies": {
    // Shipped to production -- runtime code
  },
  "devDependencies": {
    "@sveltejs/kit": "^2.0.0",
    "svelte": "^5.0.0",
    "vite": "^6.0.0",
    "typescript": "^5.0.0"
    // Only needed during development and build
  }
}
```

You might notice that Svelte, SvelteKit, and even Vite are listed as `devDependencies`. This is correct and intentional. Because Svelte compiles your components at build time, the Svelte runtime is not shipped to the browser as a dependency -- it is consumed during the build process. The compiled output is vanilla JavaScript that has no dependency on Svelte at all. This is fundamentally different from React, where the React runtime ships to every user's browser.

### Understanding Semantic Versioning

The version numbers in `package.json` follow **semantic versioning (semver)**, and the prefix characters control how npm resolves updates:

```
"svelte": "^5.2.7"
           │ │ │ └── Patch: bug fixes only (safe to update)
           │ │ └──── Minor: new features, backwards compatible (safe to update)
           │ └────── Major: breaking changes (NOT safe to auto-update)
           └──────── ^ means "compatible with": allows minor and patch updates

"svelte": "~5.2.7"   # ~ means patch updates only (5.2.x)
"svelte": "5.2.7"    # Exact version, no updates
"svelte": ">=5.0.0"  # Any version 5.0.0 or higher (risky!)
```

The `^` prefix is the default and the most common. It says "I trust this package not to break things in minor releases." The lockfile then pins the exact version so you control when updates happen.

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

Here is what just happened behind the scenes:

1. npm looked up the `dev` script in `package.json` and found `"vite dev"`.
2. **Vite** started -- Vite is the build tool and development server that SvelteKit uses under the hood. It is extremely fast because it serves your source files directly using native ES modules instead of bundling everything up front.
3. Vite loaded the **SvelteKit Vite plugin**, which knows how to compile `.svelte` files and implement file-based routing.
4. A local HTTP server started on port 5173.
5. A **WebSocket connection** was established between the server and the browser for Hot Module Replacement.

Open `http://localhost:5173` in your browser. You will see the SvelteKit welcome page.

### Why Port 5173?

Port 5173 is Vite's default. The number is not arbitrary -- in "leet speak," 5173 loosely spells "SITE." If port 5173 is occupied, Vite automatically increments to 5174, 5175, and so on. You can set a specific port in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 3000 // Use a fixed port if you prefer
  }
});
```

For production, you would never use Vite's dev server. The production server is whatever your adapter targets -- Node.js, Vercel, Cloudflare Workers, or a static file server.

## Hot Module Replacement: Why Development Feels Instant

When you edit a `.svelte` file and save it, the browser updates within milliseconds -- without a full page refresh. This is **Hot Module Replacement (HMR)**, and understanding how it works helps you appreciate why modern development feels so different from the "edit, rebuild, refresh" cycle of older tools.

Here is the flow:

```
  1. You save a file
  2. OS file watcher notifies Vite (< 1ms)
  3. Vite recompiles ONLY the changed file (< 50ms for a typical component)
  4. Vite sends the new module over WebSocket to the browser
  5. Browser replaces the old module in-place, preserving state
  6. Svelte re-renders only the affected parts of the DOM

  Total time: typically 30-100ms from save to visible update
```

That last point is critical. If you have a counter at 5 and you change the button's color, the counter stays at 5. The page does not reload. Your form inputs are not cleared. Your scroll position is preserved. HMR makes the feedback loop between writing code and seeing results nearly instantaneous, which fundamentally changes how you develop.

### Why HMR Changes How You Think About Development

To appreciate why this matters, consider the alternative. Without HMR, every change requires a full page reload: the browser discards all JavaScript state, re-fetches the page, re-parses the HTML, and re-executes all your scripts. If you were filling out a multi-step form and tweaking the third step's styling, you would have to click through steps one and two after every single save.

With HMR, you stay exactly where you are. The cost of experimenting drops to near zero, which encourages you to experiment more -- and experimenting more is how you learn faster.

This has a deeper architectural implication: HMR enables a "design in the browser" workflow. Instead of meticulously planning every CSS value in a design tool and then translating it to code, you can adjust values live and see the result instantly. This tight feedback loop produces better results because you are making decisions in the actual medium (the browser) rather than in a simulation (a design tool).

### When HMR Breaks (and Why)

HMR is not magic, and knowing its limitations saves debugging time:

```
# HMR works perfectly for:
- Template changes (HTML in .svelte files)
- Style changes (CSS in .svelte files)
- Reactive state updates (changes to $state, $derived logic)
- Component prop changes

# HMR may require a full reload for:
- Changes to module-level side effects (top-level code that runs on import)
- Changes to route structure (adding/renaming +page.svelte files)
- Changes to configuration files (svelte.config.js, vite.config.ts)
- Changes to hooks (hooks.server.ts)

# HMR will lose state when:
- You change a component's exported props ($props) signature
- You modify $effect cleanup functions (effects are torn down and recreated)
- A parent component re-mounts due to structural changes
```

When HMR fails gracefully, Vite falls back to a full page reload. You will see a "page reload" message in the terminal. This is not an error -- it is Vite saying "I cannot safely hot-swap this change, so I am doing a clean reload instead."

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

### Going Deeper: Derived State and Effects

Now extend the example to see how Svelte 5's reactivity model works with HMR:

```svelte
<script lang="ts">
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log(`Count changed to ${count}, doubled is ${doubled}`);
  });
</script>

<h1>Hello, SvelteKit!</h1>
<button onclick={() => count++}>
  Clicked {count} times (doubled: {doubled})
</button>
```

Click the button a few times. Open the browser console -- you will see the effect logging each change. Now modify the `$derived` computation to `count * 3` and save. The `doubled` value updates (it is now tripled), but `count` retains its value. The `$effect` tears down and recreates with the new dependency, logging the current state.

This is the power of the runes system combined with HMR -- your reactive graph updates surgically without losing state.

## Stopping the Dev Server

To stop the dev server, press `Ctrl+C` in the terminal. This sends a SIGINT signal to the process, which Vite handles gracefully by cleaning up and exiting.

A common mistake is to close the terminal window without stopping the server. The process keeps running in the background, consuming resources and holding the port. If you accidentally do this:

```bash
# Find and kill orphaned Vite processes
# macOS/Linux
lsof -i :5173 | grep LISTEN
kill <PID>

# Or if you know it is a node process
pkill -f "vite dev"
```

For professional development, you will typically have multiple terminal panes open:

```
Terminal 1:  npm run dev          (dev server -- always running)
Terminal 2:  npm run check:watch  (continuous type checking)
Terminal 3:  general commands     (git, npm install, etc.)
```

VS Code's integrated terminal supports split panes (Ctrl+Shift+5), making this workflow natural.

## Understanding the Build Pipeline

When you eventually run `npm run build` for production, an entirely different pipeline kicks in:

```
  npm run build
  ─────────────
  1. Vite resolves all imports and builds a dependency graph
  2. Svelte compiler converts .svelte files to optimized JS + CSS
  3. Vite bundles, tree-shakes, and code-splits the output
  4. CSS is extracted, minified, and fingerprinted
  5. The SvelteKit adapter packages everything for your target platform
  6. Output goes to .svelte-kit/output/ and then to build/ (or similar)

  Dev server:    serves source files, compiles on demand, no optimization
  Build:         compiles everything up front, fully optimized for production
```

The build output is dramatically smaller than your source code. A typical SvelteKit app compiles to a few hundred kilobytes of JavaScript -- compared to React apps that start at 40KB just for the framework runtime. This is because Svelte compiles away -- the framework does not exist at runtime.

## Environment Variables: Development vs Production

SvelteKit uses Vite's environment variable system. Variables prefixed with `PUBLIC_` are available in client-side code. All other variables are server-only:

```bash
# .env (local development -- never commit this file)
DATABASE_URL=sqlite:local.db
SECRET_KEY=dev-secret-do-not-use-in-prod
PUBLIC_APP_NAME=My App
```

```typescript
// Server-side code (+page.server.ts, hooks.server.ts)
import { DATABASE_URL, SECRET_KEY } from '$env/static/private';

// Client-side code (anywhere, including .svelte files)
import { PUBLIC_APP_NAME } from '$env/static/public';
```

```
# WRONG: Putting secrets in PUBLIC_ variables
PUBLIC_DATABASE_URL=sqlite:local.db
# This ships your database URL to every user's browser!

# WRONG: Trying to access private variables in client code
import { SECRET_KEY } from '$env/static/private';
# SvelteKit build error: cannot import private env in client code

# CORRECT: Private vars for server, PUBLIC_ vars for client
# SvelteKit enforces this boundary at compile time
```

SvelteKit also provides `$env/dynamic/private` and `$env/dynamic/public` for variables that are read at runtime instead of baked in at build time. Use static imports when the value is known at build time (most cases) and dynamic imports when the value varies per deployment (e.g., environment-specific configuration in a containerized setup).

### The `.env` File Hierarchy

SvelteKit loads environment variables from multiple files, with a specific precedence order:

```
.env                  # Always loaded (base defaults)
.env.local            # Always loaded, higher priority (local overrides)
.env.[mode]           # Loaded for specific mode (.env.development, .env.production)
.env.[mode].local     # Mode-specific local overrides (highest priority)
```

```
# WRONG: Committing .env with real secrets
# Anyone with access to your repo can read your database password.

# CORRECT: Commit .env with safe defaults, use .env.local for secrets
# .env          → DATABASE_URL=sqlite:local.db (safe default)
# .env.local    → DATABASE_URL=postgres://prod:secret@host/db (gitignored)
# .env.production → PUBLIC_API_URL=https://api.myapp.com
```

The `.local` files are automatically gitignored by `sv create`. This is the correct pattern: commit safe defaults, override locally with secrets.

## Adding Tailwind CSS v4

Most SvelteKit projects use Tailwind CSS for styling. Add it immediately after creating your project:

```bash
npx sv add tailwindcss
```

This creates a `src/app.css` file with the Tailwind import and sets up the necessary configuration. Tailwind CSS v4 uses a fundamentally different configuration approach than v3:

```css
/* src/app.css -- Tailwind v4 syntax */
@import 'tailwindcss';

@theme {
  --color-primary: #3b82f6;
  --color-secondary: #10b981;
  --font-sans: 'Inter', sans-serif;
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-lg: 1024px;
}
```

```
# WRONG (Tailwind v3 pattern -- do NOT use with v4):
# Creating tailwind.config.js with module.exports
# Using @tailwind base/components/utilities directives
# Configuring content paths in the config file

# CORRECT (Tailwind v4 pattern):
# Using @import 'tailwindcss' in your CSS file
# Using @theme directive for design tokens
# Configuration lives in CSS, not in JavaScript
```

Tailwind v4 eliminates the separate configuration file entirely. Your design tokens are CSS custom properties defined with `@theme`, which means your styling configuration lives in the same language as your styles. This is a significant architectural simplification.

## Common Issues and How to Fix Them

### Port 5173 is already in use

This means another process (probably a previous dev server you forgot to stop) is using that port. Either stop the other process or start on a different port:

```bash
npm run dev -- --port 3000
```

To find and kill the existing process:

```bash
# macOS/Linux: find what is using port 5173
lsof -i :5173

# Then kill the process
kill -9 <PID>
```

### `command not found: node` after installation

Your terminal does not know where Node.js is installed. Close and reopen your terminal -- installation updates to PATH often require a new shell session. On macOS, if you used a version manager, make sure you ran `fnm use` or `nvm use`.

### Permission errors on macOS/Linux

If you see `EACCES` errors when installing global packages, do not use `sudo npm install`. Instead, configure npm to use a different directory for global installs, or switch to a version manager like fnm which installs Node.js in your home directory where permissions are not an issue.

```
# WRONG: Using sudo to fix permission errors
sudo npm install -g something
# This installs packages as root, creating a mess of ownership issues
# that will haunt you across every future npm operation.

# CORRECT: Use a version manager (fnm, nvm)
# These install Node.js in your home directory where you have full permissions.
# No sudo needed, ever.
```

### `Cannot find module` or resolution errors

This usually means `npm install` was not run, or it failed partway through. Delete the `node_modules` folder and the lockfile, then reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Node version mismatch warnings

SvelteKit requires Node.js 18.13 or later. If you see version warnings, upgrade Node.js. If you are using a version manager, run `fnm install 22` or `nvm install 22` and switch to it.

You can check your current Node.js version at any time:

```bash
node --version
# v22.x.x  (good -- current LTS)

npm --version
# 10.x.x
```

Use even-numbered Node.js versions (18, 20, 22) for production. Odd-numbered versions are "current" releases with shorter support windows and are not recommended for production use.

### TypeScript errors on fresh project

If you see TypeScript errors immediately after scaffolding, run the sync command to generate SvelteKit's type definitions:

```bash
npx svelte-kit sync
```

This generates the `$types`, `$app/state`, `$env`, and other module declarations that TypeScript needs to understand SvelteKit's runtime imports. The sync runs automatically during `dev` and `build`, but if you open the project in your editor before running the dev server, TypeScript may complain until you sync manually.

### The `.svelte-kit` Directory

You will notice a `.svelte-kit` directory appears after running `dev` or `build`. This is SvelteKit's internal output directory containing generated types, the built application, and internal configuration. It is listed in `.gitignore` and should never be committed. If things get into a strange state, deleting `.svelte-kit` and restarting the dev server is a safe reset:

```bash
rm -rf .svelte-kit
npm run dev
```

### Vite Dependency Pre-Bundling Issues

Occasionally, Vite's dependency optimizer gets confused -- especially after installing new packages. If you see strange import errors after `npm install`, force Vite to re-optimize:

```bash
# Delete the Vite cache and restart
rm -rf node_modules/.vite
npm run dev
```

Vite pre-bundles your `node_modules` dependencies on first startup for performance. When you add or update packages, the cache can become stale. Deleting it forces a fresh optimization pass.

## Project Naming and Organization Conventions

For real projects, a few naming conventions matter:

```bash
# Use kebab-case for project directories
npx sv create my-awesome-app     # Good
npx sv create myAwesomeApp       # Works, but unconventional
npx sv create My Awesome App     # Broken -- spaces in path names cause problems

# For a monorepo with multiple apps
my-company/
├── apps/
│   ├── web/                     # SvelteKit app
│   └── docs/                    # Documentation site
├── packages/
│   ├── ui/                      # Shared component library
│   └── utils/                   # Shared utilities
└── package.json                 # Workspace root
```

If you are starting a professional project, consider your directory structure from day one. Moving a project later means updating CI/CD pipelines, deployment configurations, documentation links, and team muscle memory. It is much cheaper to get it right at creation time.

## Git Initialization and First Commit

The `sv create` command initializes a Git repository and creates a `.gitignore` for you. Understanding what is excluded matters:

```bash
# .gitignore (generated by sv create)
.DS_Store
node_modules         # Recreated by npm install
/build               # Production build output
/.svelte-kit         # Generated types and internal files
.env                 # Environment variables (may contain secrets)
.env.*               # Environment-specific overrides
!.env.example        # Exception: commit the example file
vite.config.js.timestamp-*  # Vite temp files
```

Your first commit should happen immediately after creation, before you start modifying files. This gives you a clean baseline to diff against:

```bash
cd my-app
npm install
git add -A
git commit -m "Initial SvelteKit project scaffold"
```

```
# WRONG: Making changes before your first commit
# You lose the ability to see what the scaffolding tool generated
# versus what you modified. Debugging "why does my project differ
# from the default?" becomes impossible.

# CORRECT: Commit immediately, then start modifying
# git diff shows exactly what you changed from the baseline.
# If something breaks, you can compare against the clean scaffold.
```

## Understanding `svelte.config.js`

The scaffolding tool creates a `svelte.config.js` file that controls how SvelteKit behaves. Understanding its options early prevents confusion later:

```javascript
import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Preprocess lets Svelte understand TypeScript, SCSS, etc.
  preprocess: vitePreprocess(),

  kit: {
    // The adapter determines where/how the app is deployed
    adapter: adapter()
  }
};

export default config;
```

**`adapter`** is the most important option. It controls how SvelteKit packages your app for deployment. `adapter-auto` detects your deployment target automatically (Vercel, Netlify, Cloudflare), but for production you should use a specific adapter:

```javascript
// For Node.js server deployment
import adapter from '@sveltejs/adapter-node';

// For static site generation (no server needed)
import adapter from '@sveltejs/adapter-static';

// For Vercel specifically
import adapter from '@sveltejs/adapter-vercel';
```

```
# WRONG: Leaving adapter-auto in production
# It works, but it is implicit. If your CI environment differs from
# your deployment target, adapter-auto might choose the wrong adapter.

# CORRECT: Explicitly set the adapter for your deployment target
# This makes the deployment strategy visible and intentional.
```

**`preprocess`** is what lets you write TypeScript in `<script lang="ts">` blocks. Without it, the Svelte compiler would choke on TypeScript syntax because Svelte only natively understands JavaScript. The preprocessor runs first, converts TypeScript to JavaScript, then hands the result to the Svelte compiler.

## Understanding `vite.config.ts`

The `vite.config.ts` file configures Vite, the build tool underneath SvelteKit:

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()]
});
```

This is minimal by design. The `sveltekit()` plugin handles most configuration automatically -- it registers the Svelte compiler, sets up file-based routing, configures SSR, and manages the dev server. You add to this file when you need Vite-specific features:

```typescript
export default defineConfig({
  plugins: [sveltekit()],

  server: {
    port: 3000,           // Fixed port instead of 5173
    open: true,           // Auto-open browser on dev start
    host: true            // Expose to network (useful for mobile testing)
  },

  // Optimize specific dependencies
  optimizeDeps: {
    include: ['lodash-es'] // Pre-bundle for faster dev startup
  }
});
```

The key insight: most of the time you do not need to touch this file. SvelteKit's Vite plugin handles the complexity. Only add configuration when you have a specific need -- a custom port, proxy for API development, or dependency optimization hints.

## The `npm run` Scripts

The `package.json` contains several scripts that drive your development workflow. Understanding each one prevents the "which command do I run?" confusion:

```json
{
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "vite preview",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
    "lint": "prettier --check . && eslint .",
    "format": "prettier --write ."
  }
}
```

```
dev        → Start the development server with HMR
build      → Compile and optimize for production
preview    → Serve the production build locally (test before deploying)
check      → Run TypeScript and Svelte type checking (catches type errors)
check:watch → Same as check but re-runs on file changes
lint       → Verify formatting and code quality without changing files
format     → Auto-fix formatting issues across all files
```

The `preview` command is especially useful and often overlooked. After running `npm run build`, run `npm run preview` to serve the production build locally. This catches issues that only appear in production mode -- for example, missing environment variables, SSR-only code that breaks during prerendering, or assets that were tree-shaken incorrectly. Always preview before deploying.

## Try It

Create a new SvelteKit project using the steps above. Select TypeScript, Prettier, and ESLint. Start the dev server and open the welcome page in your browser.

Then open `src/routes/+page.svelte` and build a small interactive component:

1. Add a `count` variable using `$state(0)`
2. Add a `doubled` value using `$derived(count * 2)`
3. Add an `$effect` that logs the count to the console
4. Create a button that increments the count
5. Display both `count` and `doubled` in the template

Click the button a few times, then edit the heading text and save again -- confirm that the counter value is preserved while the heading updates. Open the browser console and verify that the effect logs on each click. This is the development experience you will have for the rest of the course.

Then try adding a `.env` file with `PUBLIC_APP_NAME=My First App` and display it in your component using `import { PUBLIC_APP_NAME } from '$env/static/public'`. Restart the dev server (env changes require a restart) and verify that the value appears in the browser.

## Key Takeaways

- **`npx sv create my-app`** scaffolds a new SvelteKit project -- always choose the **SvelteKit minimal** template for a clean start
- **SvelteKit** builds on Svelte by adding routing, SSR, API routes, and deployment adapters -- it is the application framework, not just the component compiler
- The **layer cake** (Node.js, Vite, Svelte Compiler, SvelteKit, Your Code) helps you diagnose which layer produced an error
- Always select **TypeScript**, **Prettier**, and **ESLint** -- these form a quality pipeline where each tool catches a different category of mistake
- Use **`npx`** instead of global installs to guarantee you always scaffold with the latest tool version
- **`npm install`** resolves the full dependency tree and writes exact versions to the lockfile -- **always commit the lockfile** for reproducibility
- Svelte and SvelteKit are **devDependencies** because the compiler runs at build time -- no Svelte runtime ships to the browser
- **Vite** powers the dev server -- it serves source files directly using native ES modules, which is why startup is nearly instant
- **Hot Module Replacement** pushes updated modules to the browser over WebSocket without a full page refresh, preserving component state -- know when it works, when it falls back, and when it loses state
- **Environment variables** use the `PUBLIC_` prefix convention -- SvelteKit enforces the server/client boundary at compile time
- Use **`sv add`** to add integrations like Tailwind CSS, Drizzle, and Lucia -- the CLI handles configuration that is error-prone to do manually
- When something goes wrong, check the common issues list before searching -- port conflicts, missing installs, and version mismatches account for the vast majority of setup problems
- The `.svelte-kit` directory is generated output -- delete it as a safe reset when things get into a strange state
- **Commit immediately** after scaffolding to preserve a clean baseline for diffing
