# Your First Svelte Component

Now that you know what a web page is, let's build one! We're going to create a **greeting card** — a simple component that displays a personalized message.

## What is a Component?

A **component** is a reusable piece of your website. Think of it like a LEGO brick — you build small pieces, then combine them into something bigger.

In Svelte, every `.svelte` file is a component. Each component has three sections:

1. `<script>` — Your JavaScript (the logic)
2. The HTML — Your markup (what you see)
3. `<style>` — Your CSS (how it looks)

## Building the Greeting Card

Let's start with the simplest possible component:

```svelte
<h1>Hello!</h1>
<p>Welcome to Svelte.</p>
```

That's valid Svelte! You don't even need the `<script>` or `<style>` tags if you don't need them. But let's make it more interesting.

### Adding Style

```svelte
<div class="card">
  <h1>Hello!</h1>
  <p>Welcome to the Svelte 5 Bootcamp.</p>
</div>

<style>
  .card {
    max-width: 400px;
    padding: 32px;
    border-radius: 12px;
    background: white;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    text-align: center;
  }

  h1 {
    color: #ff3e00;
    margin: 0 0 8px;
  }

  p {
    color: #666;
    margin: 0;
  }
</style>
```

### Making it Dynamic

Now let's add some JavaScript to make the name changeable:

```svelte
<script>
  let name = "Student";
</script>

<div class="card">
  <h1>Hello, {name}!</h1>
  <p>Welcome to the Svelte 5 Bootcamp.</p>
</div>
```

See that `{name}`? That's called **interpolation**. Svelte replaces `{name}` with the value of the `name` variable. Change the value of `name` and watch the greeting update!

## Your Project: Personal Greeting Card

Build a greeting card that includes:
- Your name in the heading
- A short welcome message
- A colored background
- Rounded corners and a shadow

Try modifying the code in the editor to customize your card!

## Key Takeaways

- A **component** is a reusable piece of UI in a `.svelte` file
- Components can have `<script>`, HTML, and `<style>` sections
- Use `{variableName}` to display JavaScript values in your HTML
- CSS in Svelte is **scoped** — it only affects the component it's in
