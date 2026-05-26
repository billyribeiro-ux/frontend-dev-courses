# Installing Your Tools

Before you can build SvelteKit applications, you need a handful of tools on your computer. Think of this as setting up a woodworking shop — you need the right workbench, the right power tools, and the right measuring instruments before you can build anything well. Skipping this step or cutting corners here leads to mysterious errors later, so take your time and get it right.

This lesson walks you through each tool, explains _why_ you need it, and finishes with a verification checklist. If you already have these tools installed, skip ahead to the checklist at the bottom to make sure your versions are current.

## Node.js — The JavaScript Runtime

JavaScript was born inside the browser. For decades, that was the only place it could run. **Node.js** changed that — it is a runtime that lets you execute JavaScript on your own computer, outside of any browser. It is built on Chrome's V8 engine, the same engine that runs JavaScript when you visit a website in Chrome.

SvelteKit relies on Node.js for everything behind the scenes: running the development server, compiling your `.svelte` files into optimized JavaScript, resolving imports, handling server-side rendering, and producing your final production build. Without Node.js, none of the tooling works.

### Why LTS Matters

When you visit [nodejs.org](https://nodejs.org), you will see two download options: **LTS** (Long Term Support) and **Current**. Always choose LTS. Here is why:

- **LTS releases** receive security patches and bug fixes for 30 months. They are the versions that every major framework tests against, and the versions that production servers run.
- **Current releases** include the newest language features but may introduce breaking changes. Libraries you depend on may not have been tested against them yet.

For professional work, stability beats novelty. LTS is the default for a reason.

### Installing Node.js (Simple Path)

1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** version (v22.x or later recommended)
3. Run the installer and accept the defaults

After installation, open your terminal (Terminal on Mac, PowerShell on Windows) and verify:

```bash
node -v
# Should output something like: v22.x.x

npm -v
# Should output something like: 10.x.x
```

### Version Management with nvm or fnm (Recommended)

If you work on multiple projects — or if you plan to — different projects may require different Node.js versions. Installing Node.js directly from the website gives you exactly one version, globally. That works for now, but it becomes a problem fast.

**nvm** (Node Version Manager) and **fnm** (Fast Node Manager) solve this. They let you install multiple Node.js versions side by side and switch between them per project.

```bash
# Install fnm (faster, recommended for beginners)
# macOS / Linux:
curl -fsSL https://fnm.vercel.app/install | bash

# Then install and use a specific Node version:
fnm install 22
fnm use 22

# Or with nvm:
nvm install 22
nvm use 22
```

A project can specify its required Node version in a `.node-version` or `.nvmrc` file. When you `cd` into that project, fnm or nvm automatically switches to the correct version. This prevents the "works on my machine" problem where one teammate is running Node 18 and another is running Node 22.

You do not need a version manager to complete this course, but knowing they exist will save you headaches in the future.

## npm and pnpm — Package Managers

When you installed Node.js, you got **npm** (Node Package Manager) for free. npm does three things:

1. **Installs packages** — Downloads libraries from the npm registry (the world's largest collection of JavaScript packages) and places them in a `node_modules` folder in your project.
2. **Resolves dependencies** — Libraries depend on other libraries. npm figures out the entire dependency tree, resolves version conflicts, and ensures every package gets a compatible version of its dependencies.
3. **Runs scripts** — The `scripts` section in `package.json` defines commands like `dev`, `build`, and `lint`. npm executes them for you.

### The Lockfile: Why `package-lock.json` Matters

When you run `npm install`, npm writes a **lockfile** (`package-lock.json`). This file records the _exact_ version of every package that was installed, including all nested dependencies.

Why does this matter? Consider this scenario without a lockfile:

- You run `npm install` today and get `svelte@5.1.0`.
- Your teammate runs `npm install` next week and gets `svelte@5.2.0` because a new version was published.
- A subtle bug exists in 5.2.0. Your teammate's build breaks, but yours works fine. Nobody understands why.

The lockfile prevents this. It pins every version so that `npm install` always produces identical `node_modules` on every machine, every CI run, every time. **Always commit your lockfile to version control.**

### pnpm: A Faster Alternative

**pnpm** is an alternative package manager that is faster and uses less disk space. Instead of copying packages into every project's `node_modules`, it stores them once in a global cache and creates hard links. For a single project this is a nice-to-have; across dozens of projects it saves gigabytes.

```bash
# Install pnpm globally
npm install -g pnpm

# Use it the same way as npm
pnpm install
pnpm run dev
```

SvelteKit works identically with npm or pnpm. This course uses `npm` in all examples for simplicity, but everything translates directly to `pnpm` if you prefer it.

## Installing VS Code

Visual Studio Code is a free, lightweight code editor built by Microsoft. It is the most popular editor for web development — not because of hype, but because the extension ecosystem is unmatched for frontend work.

1. Go to [code.visualstudio.com](https://code.visualstudio.com)
2. Download the version for your operating system
3. Run the installer and accept the defaults

After installation, launch VS Code. If you are on macOS, open the Command Palette (`Cmd+Shift+P`), type "shell command", and select **Install 'code' command in PATH**. This lets you open projects from the terminal with `code my-app`.

## Essential Extensions

Extensions turn VS Code from a good text editor into a specialized Svelte development environment. Open VS Code and install these by clicking the Extensions icon in the left sidebar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`):

### 1. Svelte for VS Code (Essential)

This is the single most important extension for this course. It provides:

- **Syntax highlighting** for `.svelte` files — `<script>`, `<style>`, and template blocks are colored correctly
- **Diagnostics** — Red squiggly lines under errors before you even save the file
- **IntelliSense** — Autocomplete for component props, store values, Svelte-specific syntax like `$state`, `$derived`, and `$effect`
- **Auto-imports** — Type a component name and the extension adds the import statement for you
- **Go to definition** — Ctrl+click on a component or function to jump to its source

Without this extension, you are writing Svelte code blind. Install it first.

### 2. Prettier - Code Formatter (Essential)

Prettier automatically formats your code on every save. It handles indentation, line breaks, quote styles, trailing commas — all the stylistic decisions that waste time in code reviews. Your entire team writes code that looks identical, because the machine formats it.

### 3. ESLint (Essential)

ESLint catches bugs and enforces coding standards. It warns you about unused variables, unreachable code, missing accessibility attributes, and dozens of other common mistakes. Think of it as a spellchecker for code.

### 4. Tailwind CSS IntelliSense (Recommended)

If you use Tailwind CSS (which pairs beautifully with Svelte), this extension provides autocomplete for utility classes, shows you the CSS each class generates on hover, and highlights invalid class names.

### Configuring Format-on-Save

After installing Prettier, configure VS Code to format automatically. Open Settings (`Ctrl+,` / `Cmd+,`), search for "format on save", and enable it. Or add this to your VS Code `settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[svelte]": {
    "editor.defaultFormatter": "svelte.svelte-vscode"
  }
}
```

The `[svelte]` block tells VS Code to use the Svelte extension's formatter for `.svelte` files, which understands the Svelte template syntax that Prettier alone might not handle perfectly.

## Terminal Basics

You will use the terminal frequently in this course. If you have never used one, here are the commands you need:

```bash
# Print the current directory
pwd

# List files in the current directory
ls              # macOS / Linux
dir             # Windows (PowerShell also supports ls)

# Change directory
cd my-app       # Move into a folder
cd ..           # Move up one level
cd ~            # Go to your home directory

# Create a directory
mkdir my-project

# Clear the terminal screen
clear           # macOS / Linux
cls             # Windows
```

VS Code has a built-in terminal (`Ctrl+`` ` or `Cmd+`` `). Use it so you can write code and run commands in the same window without switching applications.

## Verifying Your Setup — The Checklist

Run each of these commands and confirm you get version numbers, not errors:

```bash
# 1. Node.js (should be v20 or higher)
node -v

# 2. npm (should be v10 or higher)
npm -v

# 3. VS Code CLI (should print a version number)
code --version

# 4. Confirm npm can reach the registry
npm ping
# Should output: Ping success

# 5. (Optional) If using pnpm
pnpm -v
```

If `node` or `npm` is not found, revisit the Node.js installation step. If `code` is not found, install the shell command from VS Code's Command Palette (macOS) or ensure the VS Code installation directory is in your system's PATH (Windows — the installer usually handles this).

## Try It

Open your terminal and run every command in the checklist above. Then open VS Code, navigate to Extensions, and confirm you see "Svelte for VS Code" and "Prettier" in your installed list. Enable format-on-save if you have not already. This five-minute investment pays for itself every single day.

## Key Takeaways

- **Node.js** is the JavaScript runtime that powers SvelteKit's toolchain — always install the **LTS** version for stability
- **nvm or fnm** let you manage multiple Node.js versions, which matters when you work across projects
- **npm** resolves dependencies, installs packages into `node_modules`, and runs project scripts
- **Lockfiles** (`package-lock.json`) pin exact dependency versions — always commit them to version control
- **pnpm** is a faster, disk-efficient alternative to npm that works identically with SvelteKit
- **VS Code** with the **Svelte for VS Code** extension gives you syntax highlighting, diagnostics, IntelliSense, and auto-imports
- **Prettier** auto-formats on save; **ESLint** catches bugs early — both eliminate entire categories of team friction
- Verify your setup with the checklist before creating your first project — debugging installation issues during project work is frustrating and avoidable
