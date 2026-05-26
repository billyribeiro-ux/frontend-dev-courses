# Creating a SvelteKit Project

Now that your tools are installed, it is time to create your first SvelteKit project. This is the moment where theory becomes tangible — within a few minutes you will have a working application running on your machine, and you will see code changes appear in the browser the instant you save a file.

But we are not just going to run a command and move on. Understanding _what_ the scaffolding tool creates and _why_ each option matters will save you confusion later when you need to change these decisions — and you will.

## Svelte vs. SvelteKit — Understanding the Difference

Before we create anything, let's clarify what you are building. **Svelte** and **SvelteKit** are related but distinct:

- **Svelte** is a _component framework_. It gives you a way to write reactive UI components in `.svelte` files using a clean, expressive syntax. Svelte compiles these components into efficient vanilla JavaScript at build time — no runtime framework ships to the browser.
- **SvelteKit** is a _full application framework_ built on top of Svelte. It adds everything you need to build a real application: file-based routing, server-side rendering (SSR), API routes, data loading, deployment adapters, and a development server powered by Vite.

Think of it this way: Svelte is the language for writing components. SvelteKit is the architecture for building applications out of those components. You rarely use Svelte without SvelteKit, just as you rarely write React components without Next.js or a similar framework in professional work.

There is also a **Svelte library** project type, which is for publishing reusable component packages to npm. Unless you are building a component library for other developers to consume, you want a **SvelteKit app** project. That is what we will create.

## Running the Project Generator

Open your terminal, navigate to the folder where you want your projects to live, and run:

```bash
npx sv create my-app
```

Let's break this command down:

- **`npx`** — Runs a package without installing it globally. It downloads the latest version of `sv`, executes it, and cleans up. This ensures you always use the newest scaffolding tool.
- **`sv`** — The official Svelte CLI. It replaced the older `create-svelte` tool and handles project creation, adding integrations, and more.
- **`create`** — Tells `sv` you want to scaffold a new project.
- **`my-app`** — The directory name for your project. Choose something meaningful for real projects.

### Understanding Each Option

The CLI will ask you a series of questions. Here is what each one means and why the recommended choices matter:

**Template: SvelteKit minimal**

You will see options like "SvelteKit minimal", "SvelteKit demo app", and "Svelte library". Choose **SvelteKit minimal**. It gives you a clean starting point — a single page with no demo content to delete. The demo app includes example routes and styling that look impressive but get in your way when you start building your own thing. The library template is for npm package authors, not application developers.

**Type checking: Yes, using TypeScript syntax**

This adds TypeScript support using the `lang="ts"` attribute in your `<script>` blocks. You write TypeScript syntax inside Svelte components — type annotations, interfaces, generics — but your `.svelte` files remain `.svelte` files, not `.ts` files.

```svelte
<script lang="ts">
  let count: number = $state(0);
  // TypeScript catches errors here at development time
</script>
```

TypeScript is not optional decoration. It is the single biggest productivity multiplier in frontend development. It catches bugs before they reach the browser, enables intelligent autocomplete, and serves as living documentation for your code. Choose TypeScript. Always.

**Additional options: Prettier, ESLint, Vitest, Playwright**

- **Prettier** — Adds a `.prettierrc` configuration file and a `format` script. Code formatting becomes automatic and consistent. There is no reason not to include this.
- **ESLint** — Adds linting rules that catch common mistakes (unused variables, accessibility issues, unreachable code). Includes Svelte-specific rules that understand `.svelte` file structure.
- **Vitest** — Adds a unit testing framework. Vitest is built on Vite (the same build tool SvelteKit uses), so it starts fast and understands your project's import aliases out of the box. Even if you are not writing tests yet, having the infrastructure ready removes a barrier when you need it.
- **Playwright** — Adds end-to-end testing. Playwright launches a real browser and interacts with your application the way a user would — clicking buttons, filling forms, navigating pages. This is overkill for a learning project, but essential for production applications.

For this course, select **Prettier** and **ESLint** at minimum. Add **Vitest** if you want to write unit tests as you learn.

These tools work together to form a quality pipeline. Prettier handles formatting (how code looks), ESLint handles correctness (whether code follows best practices), and TypeScript handles types (whether data flows correctly). When you save a file, Prettier formats it. When you run `npm run lint`, ESLint scans for problems. When you run `npm run check`, TypeScript and Svelte's type checker analyze your entire project. Each tool catches a different category of mistake, and together they catch almost everything before it reaches a user.

## Installing Dependencies

Once scaffolding is complete, move into your project and install dependencies:

```bash
cd my-app
npm install
```

What actually happens when you run `npm install`:

1. npm reads `package.json` to find your project's dependencies (Svelte, SvelteKit, Vite, TypeScript, etc.)
2. It resolves the full dependency tree — your dependencies have their own dependencies, which have their own dependencies. A typical SvelteKit project has hundreds of transitive packages.
3. It downloads everything into the `node_modules` directory.
4. It writes (or updates) `package-lock.json` with the exact resolved versions.

The `node_modules` folder will be large (often 100MB+). This is normal. It is excluded from version control by the `.gitignore` file that `sv create` generated for you. Every developer runs `npm install` to recreate it from the lockfile.

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
2. **Vite** started — Vite is the build tool and development server that SvelteKit uses under the hood. It is extremely fast because it serves your source files directly using native ES modules instead of bundling everything up front.
3. Vite loaded the **SvelteKit Vite plugin**, which knows how to compile `.svelte` files and implement file-based routing.
4. A local HTTP server started on port 5173.
5. A **WebSocket connection** was established between the server and the browser for Hot Module Replacement.

Open `http://localhost:5173` in your browser. You will see the SvelteKit welcome page.

## Hot Module Replacement: Why Development Feels Instant

When you edit a `.svelte` file and save it, the browser updates within milliseconds — without a full page refresh. This is **Hot Module Replacement (HMR)**, and understanding how it works helps you appreciate why modern development feels so different from the "edit, rebuild, refresh" cycle of older tools.

Here is the flow:

1. You save a file.
2. Vite detects the file change via the operating system's file watcher.
3. Vite recompiles _only that one file_ — not the entire project.
4. Vite sends the updated module to the browser over the WebSocket connection.
5. The browser replaces the old module with the new one _in place_, preserving component state.

That last point is critical. If you have a counter at 5 and you change the button's color, the counter stays at 5. The page does not reload. Your form inputs are not cleared. Your scroll position is preserved. HMR makes the feedback loop between writing code and seeing results nearly instantaneous, which fundamentally changes how you develop.

To appreciate why this matters, consider the alternative. Without HMR, every change requires a full page reload: the browser discards all JavaScript state, re-fetches the page, re-parses the HTML, and re-executes all your scripts. If you were filling out a multi-step form and tweaking the third step's styling, you would have to click through steps one and two after every single save. With HMR, you stay exactly where you are. The cost of experimenting drops to near zero, which encourages you to experiment more — and experimenting more is how you learn faster.

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

Save the file. Watch the browser — the text updates instantly. No refresh, no rebuild, no waiting. That is HMR in action.

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

## Common Issues and How to Fix Them

### Port 5173 is already in use

This means another process (probably a previous dev server you forgot to stop) is using that port. Either stop the other process or start on a different port:

```bash
npm run dev -- --port 3000
```

### `command not found: node` after installation

Your terminal does not know where Node.js is installed. Close and reopen your terminal — installation updates to PATH often require a new shell session. On macOS, if you used a version manager, make sure you ran `fnm use` or `nvm use`.

### Permission errors on macOS/Linux

If you see `EACCES` errors when installing global packages, do not use `sudo npm install`. Instead, configure npm to use a different directory for global installs, or switch to a version manager like fnm which installs Node.js in your home directory where permissions are not an issue.

### `Cannot find module` or resolution errors

This usually means `npm install` was not run, or it failed partway through. Delete the `node_modules` folder and the lockfile, then reinstall:

```bash
rm -rf node_modules package-lock.json
npm install
```

### Node version mismatch warnings

SvelteKit requires Node.js 18.13 or later. If you see version warnings, upgrade Node.js. If you are using a version manager, run `fnm install 22` or `nvm install 22` and switch to it.

## Try It

Create a new SvelteKit project using the steps above. Start the dev server and open the welcome page in your browser. Then open `src/routes/+page.svelte`, add a counter with `$state`, and watch the browser update as you save. Click the button a few times, then edit the heading text and save again — confirm that the counter value is preserved. This is the development experience you will have for the rest of the course.

## Key Takeaways

- **`npx sv create my-app`** scaffolds a new SvelteKit project — always choose the **SvelteKit minimal** template for a clean start
- **SvelteKit** builds on Svelte by adding routing, SSR, API routes, and deployment adapters — it is the application framework, not just the component compiler
- Always select **TypeScript**, **Prettier**, and **ESLint** — these are non-negotiable for professional development
- **`npm install`** resolves the full dependency tree and writes exact versions to the lockfile for reproducibility
- **Vite** powers the dev server — it serves source files directly using native ES modules, which is why startup is nearly instant
- **Hot Module Replacement** pushes updated modules to the browser over WebSocket without a full page refresh, preserving component state
- When something goes wrong, check the common issues list before searching — port conflicts, missing installs, and version mismatches account for the vast majority of setup problems
