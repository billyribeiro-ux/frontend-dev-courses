# Installing Your Tools

Before you can build SvelteKit applications, you need a handful of tools on your computer. Think of this as setting up a woodworking shop -- you need the right workbench, the right power tools, and the right measuring instruments before you can build anything well. Skipping this step or cutting corners here leads to mysterious errors later, so take your time and get it right.

But this lesson goes further than "install these things." Understanding _why_ each tool exists, _how_ it works under the hood, and _what_ tradeoffs it makes will transform you from someone who follows install instructions into someone who can debug their own toolchain. Every production outage I have traced to a tooling misconfiguration could have been prevented by the knowledge in this lesson.

This lesson walks you through each tool, explains _why_ you need it, how it works internally, and finishes with a verification checklist. If you already have these tools installed, skip ahead to the checklist at the bottom to make sure your versions are current.

## Node.js -- The JavaScript Runtime

JavaScript was born inside the browser. For decades, that was the only place it could run. **Node.js** changed that -- it is a runtime that lets you execute JavaScript on your own computer, outside of any browser. It is built on Chrome's V8 engine, the same engine that runs JavaScript when you visit a website in Chrome.

SvelteKit relies on Node.js for everything behind the scenes: running the development server, compiling your `.svelte` files into optimized JavaScript, resolving imports, handling server-side rendering, and producing your final production build. Without Node.js, none of the tooling works.

### How Node.js Actually Works -- The Event Loop Mental Model

To use Node.js effectively (and to debug the weird things that happen when your dev server stalls or your build seems stuck), you need a mental model of its architecture.

Node.js runs on a **single-threaded event loop**. This sounds limiting, but it is precisely what makes it excellent for I/O-heavy tasks like serving web applications. Here is the simplified flow:

1. **Call stack** -- JavaScript executes code synchronously on a single thread. When you call a function, it goes on the stack. When it returns, it comes off.
2. **Node APIs** -- When your code initiates an I/O operation (reading a file, making an HTTP request, querying a database), Node hands it off to the operating system or a thread pool managed by **libuv**. Your JavaScript thread does not wait -- it moves to the next line of code.
3. **Callback queue** -- When the I/O operation completes, the callback (or Promise resolution) is placed in a queue.
4. **Event loop** -- A tight loop that checks: "Is the call stack empty? If so, take the next item from the callback queue and push it onto the stack."

This is why Node.js can handle thousands of concurrent connections with a single thread -- it never blocks waiting for I/O. But it also means that CPU-intensive synchronous code (like a massive JSON parse or a complex regular expression) blocks the entire event loop. When your SvelteKit dev server freezes momentarily during a large build step, this is why.

```
┌───────────────────────────────┐
│         Call Stack            │   ← JavaScript executes here (single thread)
│  executeModule()              │
│  compileComponent()           │
└──────────┬────────────────────┘
           │ async I/O
           ▼
┌───────────────────────────────┐
│      libuv Thread Pool        │   ← File reads, DNS lookups, crypto
│  readFile('App.svelte')       │
│  fsWatch('/src/routes/')      │
└──────────┬────────────────────┘
           │ completed
           ▼
┌───────────────────────────────┐
│       Callback Queue          │   ← Waiting for the call stack to clear
│  onFileRead(contents)         │
└──────────┬────────────────────┘
           │ event loop picks up
           ▼
┌───────────────────────────────┐
│         Call Stack            │   ← Callback executes
│  onFileRead(contents)         │
└───────────────────────────────┘
```

Why does this matter for SvelteKit development? Three concrete reasons:

1. **File watching** -- When Vite watches your files for changes, it uses Node's `fs.watch` (backed by libuv's OS-level file system notifications). Understanding this explains why HMR sometimes misses changes on network-mounted drives or certain Linux file systems where inotify does not work.
2. **Build performance** -- Vite uses `esbuild` (written in Go, running as a native binary) for TypeScript transforms and `Rollup` for production bundling. Both run as separate processes to avoid blocking Node's event loop. If you see your CPU spike during `npm run build`, it is these tools doing their work outside the Node thread.
3. **Server-side rendering** -- When SvelteKit renders a page on the server, it runs your component code in Node.js. If a component's initialization does something CPU-intensive (processing a large dataset inline), it blocks the event loop and delays responses to all other users. This is why SvelteKit's data loading functions (`load`) exist -- they are designed to handle async work properly.

### Why LTS Matters

When you visit [nodejs.org](https://nodejs.org), you will see two download options: **LTS** (Long Term Support) and **Current**. Always choose LTS. Here is why:

- **LTS releases** receive security patches and bug fixes for 30 months. They are the versions that every major framework tests against, and the versions that production servers run.
- **Current releases** include the newest language features but may introduce breaking changes. Libraries you depend on may not have been tested against them yet.

The Node.js release schedule follows a predictable pattern. Even-numbered versions (18, 20, 22, 24) become LTS releases. Odd-numbered versions (19, 21, 23) are short-lived "Current" releases that never receive long-term support. As of this writing, Node.js 22 is the active LTS.

For professional work, stability beats novelty. LTS is the default for a reason. I have seen production deployments break because a developer used a Current release locally, relied on a V8 feature flag that was not yet stable, and the CI server (running LTS) could not reproduce the behavior. Always match your local Node version to what your CI and production servers run.

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

If you work on multiple projects -- or if you plan to -- different projects may require different Node.js versions. Installing Node.js directly from the website gives you exactly one version, globally. That works for now, but it becomes a problem fast.

**nvm** (Node Version Manager) and **fnm** (Fast Node Manager) solve this. They let you install multiple Node.js versions side by side and switch between them per project.

```bash
# Install fnm (faster, recommended — written in Rust, starts in ~40ms vs nvm's ~200ms)
# macOS / Linux:
curl -fsSL https://fnm.vercel.app/install | bash

# Windows (PowerShell):
winget install Schniz.fnm

# Then install and use a specific Node version:
fnm install 22
fnm use 22

# Or with nvm:
nvm install 22
nvm use 22
```

**Why fnm over nvm?** nvm is the original and most widely documented, but it is a shell script that adds ~200ms to every new terminal session. fnm is a compiled Rust binary that adds ~40ms. On a fast machine you might not notice, but when you open 20 terminal tabs a day, it adds up. Both are excellent; fnm is just faster.

#### Automatic Version Switching in Teams

A project can specify its required Node version in a `.node-version` or `.nvmrc` file at the repository root:

```bash
# .node-version (preferred — works with fnm, nvm, volta, and asdf)
22.12.0
```

When you `cd` into that project, fnm or nvm automatically switches to the correct version. This prevents the "works on my machine" problem where one teammate is running Node 18 and another is running Node 22.

To enable automatic switching with fnm, add this to your shell profile:

```bash
# ~/.bashrc, ~/.zshrc, or equivalent
eval "$(fnm env --use-on-cd)"
```

With nvm, you need a shell hook. Add this to `~/.zshrc`:

```bash
autoload -U add-zsh-hook
load-nvmrc() {
  local nvmrc_path="$(nvm_find_nvmrc)"
  if [ -n "$nvmrc_path" ]; then
    local nvmrc_node_version=$(nvm version "$(cat "${nvmrc_path}")")
    if [ "$nvmrc_node_version" = "N/A" ]; then
      nvm install
    elif [ "$nvmrc_node_version" != "$(nvm version)" ]; then
      nvm use
    fi
  fi
}
add-zsh-hook chdir load-nvmrc
load-nvmrc
```

For teams, commit a `.node-version` file and document the version manager in your README. This single file eliminates an entire category of "it does not build on my machine" issues.

You do not need a version manager to complete this course, but knowing they exist will save you headaches in the future.

## npm and pnpm -- Package Managers

When you installed Node.js, you got **npm** (Node Package Manager) for free. npm does three things:

1. **Installs packages** -- Downloads libraries from the npm registry (the world's largest collection of JavaScript packages) and places them in a `node_modules` folder in your project.
2. **Resolves dependencies** -- Libraries depend on other libraries. npm figures out the entire dependency tree, resolves version conflicts, and ensures every package gets a compatible version of its dependencies.
3. **Runs scripts** -- The `scripts` section in `package.json` defines commands like `dev`, `build`, and `lint`. npm executes them for you.

### The Lockfile: Why `package-lock.json` Matters

When you run `npm install`, npm writes a **lockfile** (`package-lock.json`). This file records the _exact_ version of every package that was installed, including all nested dependencies.

Why does this matter? Consider this scenario without a lockfile:

- You run `npm install` today and get `svelte@5.1.0`.
- Your teammate runs `npm install` next week and gets `svelte@5.2.0` because a new version was published.
- A subtle bug exists in 5.2.0. Your teammate's build breaks, but yours works fine. Nobody understands why.

The lockfile prevents this. It pins every version so that `npm install` always produces identical `node_modules` on every machine, every CI run, every time. **Always commit your lockfile to version control.**

#### Lockfile Internals -- What Is Actually in There

The `package-lock.json` file is a JSON document that maps every package name to:

- The exact resolved version (`"version": "5.1.0"`)
- The resolved tarball URL (`"resolved": "https://registry.npmjs.org/svelte/-/svelte-5.1.0.tgz"`)
- An integrity hash (`"integrity": "sha512-..."`) for tamper detection
- The dependency tree structure (which package depends on which)

```json
{
  "name": "my-app",
  "lockfileVersion": 3,
  "packages": {
    "node_modules/svelte": {
      "version": "5.1.0",
      "resolved": "https://registry.npmjs.org/svelte/-/svelte-5.1.0.tgz",
      "integrity": "sha512-abc123...",
      "dependencies": {
        "acorn": "^8.12.1",
        "esm-env": "^1.2.1"
      }
    }
  }
}
```

The integrity hash is critical for security. When npm downloads a package in CI, it compares the hash of what it downloaded against what the lockfile says. If they do not match, the install fails. This prevents supply-chain attacks where a malicious actor replaces a package tarball on the registry.

**`npm ci` vs `npm install` in CI pipelines:**

| Command | Reads lockfile | Modifies lockfile | Speed | Use case |
|---------|---------------|-------------------|-------|----------|
| `npm install` | Yes, but may update it | Yes | Slower | Local development |
| `npm ci` | Yes, strictly | No (fails if mismatch) | Faster | CI/CD pipelines |

Always use `npm ci` in your CI pipeline. It is faster (it deletes `node_modules` and installs from scratch using only the lockfile) and it fails if the lockfile is out of sync with `package.json`. This guarantees your CI builds exactly what the lockfile describes.

### pnpm: A Faster, More Efficient Alternative

**pnpm** is an alternative package manager that is faster and uses dramatically less disk space. Instead of copying packages into every project's `node_modules`, it stores them once in a global content-addressable store (`~/.pnpm-store`) and creates hard links.

```bash
# Install pnpm globally
npm install -g pnpm

# Or use corepack (built into Node.js 16.13+):
corepack enable
corepack prepare pnpm@latest --activate

# Use it the same way as npm
pnpm install
pnpm run dev
```

#### How pnpm's node_modules Structure Differs

npm uses a **flat** `node_modules` structure. Every dependency (including transitive ones) is hoisted to the top level. This means your code can accidentally import a package you never declared as a dependency -- it just happens to be there because something else depends on it. This is called **phantom dependencies**, and it causes builds to break when an update removes that transitive dependency.

pnpm uses a **strict** structure with symlinks. Only packages you explicitly declare in `package.json` appear at the top level of `node_modules`. Everything else is nested. This catches phantom dependency bugs early instead of letting them lurk until production.

```
# npm's flat structure (phantom dependencies possible):
node_modules/
├── svelte/
├── acorn/          ← Not your dependency, but you CAN import it
├── esm-env/        ← Same — transitive dependency, accidentally accessible
└── ...

# pnpm's strict structure (safe):
node_modules/
├── svelte -> .pnpm/svelte@5.1.0/node_modules/svelte
├── .pnpm/
│   ├── svelte@5.1.0/
│   │   └── node_modules/
│   │       ├── svelte/      ← The actual package files
│   │       ├── acorn/       ← Symlink to .pnpm/acorn@8.x
│   │       └── esm-env/     ← Symlink to .pnpm/esm-env@1.x
│   ├── acorn@8.12.1/
│   └── esm-env@1.2.1/
```

#### Bun: The All-in-One Contender

**Bun** is a newer JavaScript runtime (not just a package manager) written in Zig. It includes a runtime, a package manager, a bundler, and a test runner -- all in one binary. Bun's package manager is _extremely_ fast because it uses system-level optimizations and a custom linker.

```bash
# Install bun
curl -fsSL https://bun.sh/install | bash

# Use as package manager
bun install
bun run dev
```

Bun is compelling for speed, but there are tradeoffs to consider:

| Feature | npm | pnpm | Bun |
|---------|-----|------|-----|
| Install speed | Baseline | ~2x faster | ~5-10x faster |
| Disk efficiency | Flat copies | Content-addressed store | Hard links |
| Phantom dependency protection | No | Yes | No |
| Node.js compatibility | N/A (is npm) | Full | ~98% (edge cases exist) |
| Production maturity | Decades | Years | Maturing rapidly |
| SvelteKit support | Official | Official | Community-tested |

For this course, we use `npm` because it ships with Node.js and has zero setup friction. In production teams, I recommend pnpm for its correctness guarantees around phantom dependencies. Bun is worth evaluating for CI speed if your pipeline is package-install-bound.

SvelteKit works identically with npm, pnpm, or bun. This course uses `npm` in all examples for simplicity, but everything translates directly if you prefer an alternative.

## Installing VS Code

Visual Studio Code is a free, lightweight code editor built by Microsoft. It is the most popular editor for web development -- not because of hype, but because the extension ecosystem is unmatched for frontend work.

1. Go to [code.visualstudio.com](https://code.visualstudio.com)
2. Download the version for your operating system
3. Run the installer and accept the defaults

After installation, launch VS Code. If you are on macOS, open the Command Palette (`Cmd+Shift+P`), type "shell command", and select **Install 'code' command in PATH**. This lets you open projects from the terminal with `code my-app`.

### VS Code Architecture -- Why It Is Fast Enough

VS Code is an Electron application -- it runs Chromium and Node.js under the hood. You might worry about performance, but Microsoft has done significant work to keep it responsive: the editor rendering uses a canvas-based approach, extensions run in separate processes (the "Extension Host"), and heavy analysis (like TypeScript type checking) runs in worker threads. Understanding this architecture helps when debugging sluggish behavior -- if VS Code is slow, the culprit is almost always a misbehaving extension running in the Extension Host, not VS Code itself.

## Essential Extensions

Extensions turn VS Code from a good text editor into a specialized Svelte development environment. Open VS Code and install these by clicking the Extensions icon in the left sidebar (or press `Ctrl+Shift+X` / `Cmd+Shift+X`):

### 1. Svelte for VS Code (Essential)

**Extension ID:** `svelte.svelte-vscode`

This is the single most important extension for this course. It provides:

- **Syntax highlighting** for `.svelte` files -- `<script>`, `<style>`, and template blocks are colored correctly
- **Diagnostics** -- Red squiggly lines under errors before you even save the file
- **IntelliSense** -- Autocomplete for component props, store values, Svelte-specific syntax like `$state`, `$derived`, and `$effect`
- **Auto-imports** -- Type a component name and the extension adds the import statement for you
- **Go to definition** -- Ctrl+click on a component or function to jump to its source
- **Rune awareness** -- The extension understands Svelte 5 runes (`$state`, `$derived`, `$effect`, `$props`) and provides correct completions and hover information

Without this extension, you are writing Svelte code blind. Install it first.

**How the Svelte language server works:** The extension runs a Language Server Protocol (LSP) server that understands `.svelte` file structure. It parses the `<script>`, `<style>`, and template blocks separately, delegates TypeScript analysis to the TypeScript language service, CSS analysis to VS Code's built-in CSS service, and provides its own template analysis for Svelte-specific syntax. When you hover over `$state`, it knows to show you Svelte's rune documentation, not a generic TypeScript hover.

### 2. Prettier - Code Formatter (Essential)

**Extension ID:** `esbenp.prettier-vscode`

Prettier automatically formats your code on every save. It handles indentation, line breaks, quote styles, trailing commas -- all the stylistic decisions that waste time in code reviews. Your entire team writes code that looks identical, because the machine formats it.

### 3. ESLint (Essential)

**Extension ID:** `dbaeumer.vscode-eslint`

ESLint catches bugs and enforces coding standards. It warns you about unused variables, unreachable code, missing accessibility attributes, and dozens of other common mistakes. Think of it as a spellchecker for code.

### 4. Tailwind CSS IntelliSense (Recommended)

**Extension ID:** `bradlc.vscode-tailwindcss`

If you use Tailwind CSS (which pairs beautifully with Svelte), this extension provides autocomplete for utility classes, shows you the CSS each class generates on hover, and highlights invalid class names.

### 5. Error Lens (Recommended)

**Extension ID:** `usernamehw.errorlens`

Error Lens shows ESLint errors and TypeScript diagnostics inline, directly next to the problematic line, instead of requiring you to hover. This makes problems impossible to miss and significantly speeds up development.

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

### Workspace Settings for Svelte Projects

For team consistency, commit a `.vscode/settings.json` file to your repository. This ensures every developer on the team gets the same editor behavior, regardless of their personal settings:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "[svelte]": {
    "editor.defaultFormatter": "svelte.svelte-vscode"
  },
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[json]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "files.exclude": {
    "**/.svelte-kit": true,
    "**/node_modules": true
  },
  "search.exclude": {
    "**/.svelte-kit": true,
    "**/node_modules": true
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "svelte.enable-ts-plugin": true
}
```

Key decisions in this config:

- **`editor.codeActionsOnSave`** -- Auto-fixes ESLint issues on save (like removing unused imports)
- **`files.exclude`** and **`search.exclude`** -- Hides generated files and `node_modules` from the file explorer and search results, reducing noise
- **`typescript.tsdk`** -- Points VS Code at the project's TypeScript version instead of its built-in one, ensuring consistent behavior across teammates
- **`svelte.enable-ts-plugin`** -- Enables the Svelte TypeScript plugin, which gives TypeScript awareness of `.svelte` file exports in `.ts` files

Also commit a `.vscode/extensions.json` file to recommend extensions to your team:

```json
{
  "recommendations": [
    "svelte.svelte-vscode",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "usernamehw.errorlens"
  ]
}
```

When a teammate opens the project, VS Code shows a notification asking if they want to install the recommended extensions. This eliminates the "which extensions do I need?" question entirely.

### EditorConfig for Cross-Editor Consistency

Not everyone uses VS Code. If your team includes developers who use Neovim, WebStorm, or other editors, an `.editorconfig` file ensures basic formatting rules are shared:

```ini
# .editorconfig
root = true

[*]
indent_style = tab
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[*.{yaml,yml}]
indent_style = space
indent_size = 2
```

SvelteKit projects use tabs by default (matching the Svelte team's convention). The `.editorconfig` file ensures this is enforced regardless of the editor. Note: VS Code requires the "EditorConfig for VS Code" extension (`editorconfig.editorconfig`) to respect this file.

### Prettier Configuration for Svelte

The `.prettierrc` file created by `sv create` works out of the box, but understanding the options lets you customize it for your team:

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

Key options:

- **`useTabs: true`** -- The Svelte ecosystem convention. Tabs are more accessible (users can configure their display width) and produce smaller files.
- **`singleQuote: true`** -- Less visual noise than double quotes. Consistency matters more than the choice itself.
- **`trailingComma: "none"`** -- Svelte's convention. Some teams prefer `"all"` for cleaner git diffs (adding an item to the end of a list does not modify the previous line).
- **`plugins`** -- The `prettier-plugin-svelte` package teaches Prettier how to format `.svelte` files, including the template syntax, `{#if}` blocks, and `{#each}` loops.

**A `.prettierignore` file** prevents Prettier from touching files it should not:

```
# .prettierignore
.svelte-kit/
build/
node_modules/
package-lock.json
pnpm-lock.yaml
```

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

VS Code has a built-in terminal (`` Ctrl+` `` or `` Cmd+` ``). Use it so you can write code and run commands in the same window without switching applications.

### Shell Choice: bash, zsh, PowerShell, or fish

Your shell affects your daily experience more than most people realize:

- **bash** -- The default on most Linux distributions. Mature, well-documented, universally available.
- **zsh** -- The default on macOS since Catalina. Superset of bash with better autocompletion, globbing, and plugin support (especially with Oh My Zsh or Starship prompt).
- **PowerShell** -- The default on Windows. Modern versions (`pwsh`) are cross-platform. Commands differ from bash/zsh, but all npm/node commands work identically.
- **fish** -- The "friendly interactive shell." Excellent autocompletion out of the box, but its scripting syntax is incompatible with bash/zsh, which means many online tutorials need adaptation.

For this course, all commands work in any shell. If you are on macOS or Linux, you are already using zsh or bash. On Windows, I recommend using the VS Code terminal with PowerShell, or install Windows Subsystem for Linux (WSL) for a full Linux environment inside Windows.

## Git -- Version Control

Git is not strictly a Svelte tool, but `sv create` initializes a git repository for you, and every professional project uses it. If you do not have git installed:

```bash
# macOS (comes with Xcode Command Line Tools):
xcode-select --install

# Windows:
# Download from https://git-scm.com/download/win

# Linux (Debian/Ubuntu):
sudo apt install git

# Verify:
git --version
```

Configure your identity (one-time setup):

```bash
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

## Verifying Your Setup -- The Checklist

Run each of these commands and confirm you get version numbers, not errors:

```bash
# 1. Node.js (should be v20 or higher, v22 LTS recommended)
node -v

# 2. npm (should be v10 or higher)
npm -v

# 3. VS Code CLI (should print a version number)
code --version

# 4. git (should be v2.x)
git --version

# 5. Confirm npm can reach the registry
npm ping
# Should output: Ping success

# 6. (Optional) If using pnpm
pnpm -v

# 7. (Optional) If using fnm
fnm --version
```

If `node` or `npm` is not found, revisit the Node.js installation step. If `code` is not found, install the shell command from VS Code's Command Palette (macOS) or ensure the VS Code installation directory is in your system's PATH (Windows -- the installer usually handles this).

### Troubleshooting Common Installation Issues

**`EACCES` permission errors on macOS/Linux:**
Never use `sudo npm install -g`. Instead, either use a version manager (fnm/nvm, which installs Node in your home directory) or configure npm's prefix:

```bash
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
# Add to your shell profile (~/.bashrc, ~/.zshrc):
export PATH="$HOME/.npm-global/bin:$PATH"
```

**Windows execution policy errors:**
PowerShell may block npm scripts with "running scripts is disabled on this system." Fix this by running PowerShell as Administrator:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Slow npm install behind corporate proxy/VPN:**
Configure npm to use your proxy:

```bash
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080
```

**Multiple Node.js installations conflicting:**
If you installed Node from the website and then installed fnm/nvm, you may have two Node installations fighting each other. Uninstall the website version and use only the version manager.

```bash
# Check which node is running:
which node      # macOS/Linux
where node      # Windows

# Should point to your version manager's directory, not /usr/local/bin
```

## Try It

Open your terminal and run every command in the checklist above. Then open VS Code, navigate to Extensions, and confirm you see "Svelte for VS Code" and "Prettier" in your installed list. Enable format-on-save if you have not already.

Create a `.vscode` folder in your project (you can do this after creating your project in the next lesson) and add a `settings.json` file with the workspace settings shown above. Add an `extensions.json` with the recommended extensions. This five-minute investment pays for itself every single day, and it means the next person to join your project starts with a fully configured editor.

## Key Takeaways

- **Node.js** is the JavaScript runtime that powers SvelteKit's toolchain -- it uses a single-threaded event loop with non-blocking I/O, which is why it handles many concurrent connections but can stall on CPU-heavy synchronous work
- Always install the **LTS** version for stability -- even-numbered releases (20, 22, 24) become LTS, odd-numbered releases do not
- **nvm or fnm** let you manage multiple Node.js versions -- fnm is faster (Rust binary vs shell script) and both support automatic switching via `.node-version` files
- **npm** resolves dependencies, installs packages into `node_modules`, and runs project scripts -- use `npm ci` in CI pipelines for reproducible installs
- **Lockfiles** (`package-lock.json`) pin exact dependency versions with integrity hashes -- always commit them to version control
- **pnpm** prevents phantom dependency bugs with its strict `node_modules` layout and saves disk space with content-addressed storage -- it is the recommended choice for professional teams
- **VS Code** with the **Svelte for VS Code** extension gives you syntax highlighting, diagnostics, IntelliSense, auto-imports, and rune-aware completions
- Commit `.vscode/settings.json` and `.vscode/extensions.json` to your repository for team-wide editor consistency
- **EditorConfig** ensures basic formatting (tabs, line endings, charset) is consistent across different editors
- **Prettier** auto-formats on save; **ESLint** catches bugs and enforces standards -- configure both to run on save for zero-friction code quality
- Verify your setup with the checklist before creating your first project -- debugging installation issues during project work is frustrating and avoidable
