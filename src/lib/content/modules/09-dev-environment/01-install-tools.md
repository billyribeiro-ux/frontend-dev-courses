# Installing Your Tools

Before you can build SvelteKit applications, you need two essential tools on your computer: **Node.js** (the JavaScript runtime) and **VS Code** (the code editor). Think of Node.js as the engine that powers your development server and builds your project, and VS Code as the workshop where you write your code.

This lesson walks you through installing everything from scratch. If you already have these tools installed, skip ahead to the verification step at the bottom to make sure your versions are up to date.

## Installing Node.js

Node.js lets you run JavaScript outside the browser. SvelteKit uses it to power its development server, build your site, and manage packages.

1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** (Long Term Support) version — this is the stable, recommended version
3. Run the installer and accept the defaults

After installation, open your terminal (Terminal on Mac, PowerShell on Windows) and verify it worked:

```bash
node -v
# Should output something like: v22.x.x

npm -v
# Should output something like: 10.x.x
```

`npm` (Node Package Manager) is installed automatically with Node.js. You will use it to install libraries and run your project.

## Installing VS Code

Visual Studio Code is a free, lightweight code editor built by Microsoft. It is the most popular editor for web development.

1. Go to [code.visualstudio.com](https://code.visualstudio.com)
2. Download the version for your operating system
3. Run the installer and accept the defaults

## Essential Extensions

Extensions add superpowers to VS Code. Open VS Code and install these by clicking the Extensions icon in the left sidebar (or press `Ctrl+Shift+X`):

1. **Svelte for VS Code** — Syntax highlighting, autocomplete, and error checking for `.svelte` files
2. **Prettier - Code Formatter** — Automatically formats your code so it always looks clean
3. **ESLint** — Catches common coding mistakes before they become bugs

After installing Prettier, enable format-on-save so your code is always tidy:

```json
// VS Code settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode"
}
```

## Verifying Your Setup

Run these commands in your terminal to confirm everything is ready:

```bash
# Check Node.js version (should be 20 or higher)
node -v

# Check npm version
npm -v

# Check that VS Code is accessible from terminal
code --version
```

If all three commands print version numbers, you are good to go.

## Try It

Open your terminal and run `node -v` and `npm -v`. If either command is not found, revisit the Node.js installation step. Then open VS Code, navigate to Extensions, and confirm that "Svelte for VS Code" appears in your installed list.

## Key Takeaways

- **Node.js LTS** is the JavaScript runtime required for SvelteKit development
- **npm** comes bundled with Node.js and manages your project dependencies
- **VS Code** is the recommended editor with excellent Svelte support
- The **Svelte for VS Code** extension is essential for syntax highlighting and autocomplete
- **Prettier** keeps your code consistently formatted with zero effort
- Always verify your installation with `node -v` and `npm -v` before starting a project
