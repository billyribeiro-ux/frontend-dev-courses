# Creating Components

So far, you have been writing everything in a single Svelte file. That works for small experiments, but real websites have dozens or hundreds of pieces — navbars, buttons, cards, modals, footers. If you put all of that in one file, it would be thousands of lines of unmanageable code.

**Components** solve this. A component is a self-contained, reusable piece of your UI. You write it once in its own `.svelte` file, then use it anywhere. Think of components like LEGO bricks — small, independent pieces that snap together to build something bigger.

## Why Components?

Imagine you have a card that appears in ten places on your site. Without components, you copy-paste the same HTML and CSS ten times. When you need to change the card design, you update it in ten places. With components, you change it in one file and every instance updates automatically.

Benefits of components:
- **Reusability** — write once, use everywhere
- **Organization** — each piece lives in its own file
- **Isolation** — CSS is scoped, so styles never leak
- **Maintainability** — change one file to update every instance

## Creating Your First Component

A component is simply a `.svelte` file. Let's create a `Button.svelte` component:

```svelte
<!-- Button.svelte -->
<button class="btn">Click Me</button>

<style>
  .btn {
    padding: 10px 20px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
  }

  .btn:hover {
    background: #2980b9;
  }
</style>
```

That is a complete component. It has HTML and scoped CSS — no `<script>` needed unless you want logic.

## Importing and Using Components

To use a component in another file, you **import** it and then use it like an HTML tag. Component names must start with a capital letter:

```svelte
<!-- App.svelte -->
<script>
  import Button from './Button.svelte';
</script>

<h1>My App</h1>
<Button />
<Button />
<Button />
```

This renders three buttons, each using the HTML and CSS from `Button.svelte`. Change the style in `Button.svelte` and all three update.

## A Practical Example: Card Component

Let's create a reusable card:

```svelte
<!-- Card.svelte -->
<div class="card">
  <h3>Card Title</h3>
  <p>This is a reusable card component with scoped styles.</p>
</div>

<style>
  .card {
    padding: 20px;
    background: white;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .card h3 {
    margin: 0 0 8px;
    color: #2c3e50;
  }

  .card p {
    margin: 0;
    color: #666;
    line-height: 1.5;
  }
</style>
```

Now use it in your main page:

```svelte
<!-- App.svelte -->
<script>
  import Card from './Card.svelte';
</script>

<h1>Dashboard</h1>

<div class="grid">
  <Card />
  <Card />
  <Card />
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
    padding: 16px;
  }
</style>
```

## Organizing Your Files

A typical Svelte project organizes components in a `lib/components` folder:

```
src/
  lib/
    components/
      Button.svelte
      Card.svelte
      Navbar.svelte
      Footer.svelte
  routes/
    +page.svelte
```

Import paths use `$lib` as a shortcut to `src/lib`:

```svelte
<script>
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';
</script>
```

## Components with Logic

Components can have their own state and behavior, completely independent from other components:

```svelte
<!-- LikeButton.svelte -->
<script>
  let likes = $state(0);
</script>

<button class="like-btn" onclick={() => likes++}>
  ♥ {likes} {likes === 1 ? 'Like' : 'Likes'}
</button>

<style>
  .like-btn {
    padding: 8px 16px;
    background: white;
    border: 2px solid #e74c3c;
    color: #e74c3c;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  .like-btn:hover {
    background: #e74c3c;
    color: white;
  }
</style>
```

Each `<LikeButton />` you place on the page has its own independent `likes` counter:

```svelte
<script>
  import LikeButton from './LikeButton.svelte';
</script>

<h2>Post 1</h2>
<LikeButton />

<h2>Post 2</h2>
<LikeButton />
```

Clicking one button does not affect the other — each component instance has its own state.

## Try It

Create three separate components:
1. `Header.svelte` — a page header with a title and navigation
2. `Card.svelte` — a styled card with a title and description
3. `App.svelte` — a main file that imports and uses both Header and Card (use multiple Card instances)

## Key Takeaways

- A **component** is a `.svelte` file that contains HTML, CSS, and optionally JavaScript
- Import components with `import Name from './Name.svelte'` and use them like `<Name />`
- Component names must start with a **capital letter**
- Each component instance has its own **independent state**
- Scoped CSS means styles never leak between components
- Components make your code reusable, organized, and easy to maintain
