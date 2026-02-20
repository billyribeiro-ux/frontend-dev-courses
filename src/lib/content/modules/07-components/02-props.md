# Component Props

Right now, your components always display the same content. Every `Card` has the same title. Every `Button` says the same thing. That is like having LEGO bricks that are all the same shape — useful, but limited.

**Props** (short for properties) let you pass data into a component from the outside. This makes components truly reusable — the same Card component can display different titles, different descriptions, and different images depending on what you pass in.

## The $props() Rune

In Svelte 5, you receive props using the `$props()` rune. Here is a simple example:

```svelte
<!-- Greeting.svelte -->
<script>
  let { name } = $props();
</script>

<h2>Hello, {name}!</h2>
```

Now when you use this component, you pass in the `name`:

```svelte
<!-- App.svelte -->
<script>
  import Greeting from './Greeting.svelte';
</script>

<Greeting name="Alex" />
<Greeting name="Sam" />
<Greeting name="Jordan" />
```

This renders three different greetings, all from the same component.

## Multiple Props

Components can accept as many props as you need:

```svelte
<!-- UserCard.svelte -->
<script>
  let { name, role, avatar } = $props();
</script>

<div class="card">
  <img src={avatar} alt="{name}'s avatar" />
  <h3>{name}</h3>
  <p>{role}</p>
</div>

<style>
  .card {
    text-align: center;
    padding: 20px;
    border: 1px solid #e0e0e0;
    border-radius: 10px;
  }

  img {
    width: 80px;
    height: 80px;
    border-radius: 50%;
  }

  h3 { margin: 12px 0 4px; }
  p { color: #666; margin: 0; }
</style>
```

```svelte
<!-- App.svelte -->
<script>
  import UserCard from './UserCard.svelte';
</script>

<UserCard
  name="Alex Chen"
  role="Frontend Developer"
  avatar="https://picsum.photos/id/64/80/80"
/>

<UserCard
  name="Sam Rivera"
  role="UX Designer"
  avatar="https://picsum.photos/id/65/80/80"
/>
```

## Default Values

Sometimes a prop should have a fallback value when nothing is passed in. Set defaults by using assignment in the destructuring:

```svelte
<!-- Button.svelte -->
<script>
  let { label = "Click Me", variant = "primary" } = $props();
</script>

<button class="btn {variant}">
  {label}
</button>

<style>
  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    color: white;
  }

  .primary { background: #3498db; }
  .danger { background: #e74c3c; }
  .success { background: #27ae60; }
</style>
```

```svelte
<script>
  import Button from './Button.svelte';
</script>

<Button />                          <!-- Uses defaults: "Click Me", primary -->
<Button label="Delete" variant="danger" />
<Button label="Save" variant="success" />
```

## One-Way Data Flow

Props flow in one direction: **parent to child**. A child component should never directly modify a prop. This keeps your data flow predictable:

```svelte
<!-- Parent.svelte -->
<script>
  import Counter from './Counter.svelte';
  let count = $state(0);
</script>

<Counter value={count} />
<button onclick={() => count++}>Increment from Parent</button>
```

```svelte
<!-- Counter.svelte -->
<script>
  let { value } = $props();
</script>

<p>Count: {value}</p>
<!-- value++ would be wrong! Don't modify props directly. -->
```

The parent owns the data and passes it down. If the child needs to change it, you pass down a callback function (we will cover this pattern soon).

## Passing Event Handlers as Props

A common pattern is passing an `onclick` handler from parent to child:

```svelte
<!-- AlertButton.svelte -->
<script>
  let { label = "Click", onclick } = $props();
</script>

<button class="btn" {onclick}>
  {label}
</button>

<style>
  .btn {
    padding: 10px 20px;
    background: #9b59b6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }
</style>
```

```svelte
<!-- App.svelte -->
<script>
  import AlertButton from './AlertButton.svelte';

  let message = $state("...");
</script>

<AlertButton
  label="Say Hello"
  onclick={() => message = "Hello!"}
/>
<AlertButton
  label="Say Goodbye"
  onclick={() => message = "Goodbye!"}
/>

<p>{message}</p>
```

## A Practical Example: Product Card

Here is a real-world component with multiple props and defaults:

```svelte
<!-- ProductCard.svelte -->
<script>
  let {
    title,
    price,
    image = "https://picsum.photos/300/200",
    onSale = false,
    rating = 0
  } = $props();
</script>

<div class="product">
  <img src={image} alt={title} />
  <div class="info">
    <h3>{title}</h3>
    <p class="price" class:sale={onSale}>
      ${price.toFixed(2)}
      {#if onSale}
        <span class="badge">SALE</span>
      {/if}
    </p>
    <p class="rating">{"★".repeat(rating)}{"☆".repeat(5 - rating)}</p>
  </div>
</div>

<style>
  .product {
    border: 1px solid #eee;
    border-radius: 10px;
    overflow: hidden;
    max-width: 300px;
  }

  img {
    width: 100%;
    height: 200px;
    object-fit: cover;
  }

  .info { padding: 16px; }
  .info h3 { margin: 0 0 8px; }

  .price { font-size: 1.3rem; font-weight: bold; color: #2c3e50; }
  .price.sale { color: #e74c3c; }

  .badge {
    font-size: 0.7rem;
    background: #e74c3c;
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    vertical-align: middle;
  }

  .rating { color: #f39c12; margin: 4px 0 0; }
</style>
```

```svelte
<script>
  import ProductCard from './ProductCard.svelte';
</script>

<ProductCard title="Wireless Headphones" price={79.99} rating={4} />
<ProductCard title="Mechanical Keyboard" price={129.99} onSale={true} rating={5} />
```

## Try It

Build a reusable `Alert` component that accepts:
- A `message` prop (required, string)
- A `type` prop with a default of `"info"` (can be `"info"`, `"success"`, `"warning"`, `"error"`)
- Style each type with a different background color
- Use it in a parent component with all four types

## Key Takeaways

- `$props()` receives data passed from a parent component
- Destructure props: `let { name, age } = $props()`
- Set defaults with assignment: `let { color = "blue" } = $props()`
- Props flow one way: **parent to child** (never modify a prop in the child)
- Pass callback functions as props to let children communicate with parents
- Props make components reusable — same component, different data
