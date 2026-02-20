# Creating a SvelteKit Project

Now that your tools are installed, it is time to create your first SvelteKit project. SvelteKit provides an official scaffolding tool that sets up everything you need in seconds — TypeScript, linting, formatting, and a working dev server.

By the end of this lesson you will have a running SvelteKit application on your machine. You will see changes you make in code appear instantly in the browser thanks to hot module replacement (HMR).

## Running the Project Generator

Open your terminal, navigate to the folder where you want your projects, and run:

```bash
npx sv create my-app
```

The `sv` CLI will ask you a series of questions. Here are the recommended choices for this course:

```bash
# Template: SvelteKit minimal
# Type checking: Yes, using TypeScript syntax
# Additional options: Select Prettier and ESLint
```

Once the scaffolding is complete, move into your project and install dependencies:

```bash
cd my-app
npm install
```

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

Open `http://localhost:5173` in your browser. You will see the SvelteKit welcome page. Congratulations — your project is running!

## Understanding the Options

Here is what each option you chose does:

- **TypeScript syntax** — Lets you add type annotations inside `<script lang="ts">` blocks for safer code
- **Prettier** — Adds a `.prettierrc` config file and formats your code automatically
- **ESLint** — Adds linting rules that catch common mistakes and enforce consistent style

These tools work together. When you save a file, Prettier formats it. When you run `npm run lint`, ESLint checks for problems.

## Useful Dev Commands

Your new project comes with several scripts defined in `package.json`:

```bash
# Start the dev server with hot reload
npm run dev

# Build the production version of your app
npm run build

# Preview the production build locally
npm run preview

# Run the linter to check for issues
npm run lint

# Format all files with Prettier
npm run format
```

## Try It

Create a new SvelteKit project using the steps above. Start the dev server and open the welcome page in your browser. Then open `src/routes/+page.svelte` in VS Code, change the heading text, and watch the browser update automatically without a full page refresh.

## Key Takeaways

- `npx sv create my-app` scaffolds a new SvelteKit project with sensible defaults
- Always select **TypeScript**, **Prettier**, and **ESLint** for a professional setup
- `npm install` downloads all dependencies into the `node_modules` folder
- `npm run dev` starts a local development server with hot module replacement
- The dev server runs at `http://localhost:5173` by default
- Changes to `.svelte` files appear instantly in the browser
