# Component Props

Right now, your components always display the same content. Every `Card` has the same title. Every `Button` says the same thing. That is like having LEGO bricks that are all the same shape — useful, but limited.

**Props** (short for properties) let you pass data into a component from the outside. This makes components truly reusable — the same Card component can display different titles, different descriptions, and different images depending on what you pass in.

## The Mental Model: Props as a Contract

Think of props as the component's public API. When you define props, you are declaring: "Here is what I need from whoever uses me." A `Button` component might declare it needs a `label` string and optionally a `variant`. The parent provides those values when it uses the component.

This creates a clear contract between parent and child. The parent knows what data the child expects. The child knows it will receive certain values. Neither needs to know about the other's internals. This boundary is what makes components composable — you can drop a `Button` into any page without understanding how that page works.

Props also establish **direction**. Data flows *down* through props: parent to child. This one-way flow is a deliberate design decision. When you debug an issue with a component's data, you only need to look *up* — at whoever passed the prop. You never need to wonder if some distant sibling component mutated your data.

## The $props() Rune

In Svelte 5, you receive props using the `$props()` rune. This is a compile-time directive — the compiler sees `$props()` and generates the code to receive values from the parent. Here is a simple example:

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

This renders three different greetings, all from the same component. The `$props()` call returns an object with all the props the parent provided. Destructuring (`let { name } = $props()`) extracts individual props as variables you can use in your template.

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
    object-fit: cover;
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
  let { label = "Click Me", variant = "primary", size = "md", disabled = false } = $props();
</script>

<button class="btn {variant} {size}" {disabled}>
  {label}
</button>

<style>
  .btn {
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    color: white;
    transition: opacity 0.2s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sm  { padding: 6px 12px; font-size: 0.85rem; }
  .md  { padding: 10px 20px; font-size: 1rem; }
  .lg  { padding: 14px 28px; font-size: 1.1rem; }

  .primary { background: #3498db; }
  .danger  { background: #e74c3c; }
  .success { background: #27ae60; }
  .ghost   { background: transparent; color: #333; border: 1px solid #ccc; }
</style>
```

```svelte
<script>
  import Button from './Button.svelte';
</script>

<Button />                                    <!-- Uses all defaults -->
<Button label="Delete" variant="danger" />    <!-- Overrides two props -->
<Button label="Save" variant="success" size="lg" />
<Button label="Cancel" variant="ghost" />
<Button label="Processing..." disabled={true} />
```

**Important**: Default values are only used when the prop is `undefined` — not when it is `null`. If a parent passes `variant={null}`, the default is *not* applied. This is a common source of bugs. If you need to handle `null`, use nullish coalescing in your template: `{variant ?? 'primary'}`.

## Required vs Optional Props

Any prop without a default is implicitly required. Svelte will not error at runtime if you omit it (the value will simply be `undefined`), but TypeScript will catch it at compile time if you type your props:

```svelte
<!-- Alert.svelte -->
<script lang="ts">
  interface Props {
    message: string;           // Required — no default
    type?: 'info' | 'success' | 'warning' | 'error';  // Optional
    dismissible?: boolean;     // Optional
  }

  let { message, type = 'info', dismissible = false }: Props = $props();

  let visible = $state(true);
</script>

{#if visible}
  <div class="alert alert-{type}" role="alert">
    <p>{message}</p>
    {#if dismissible}
      <button class="close" onclick={() => visible = false} aria-label="Dismiss">
        &times;
      </button>
    {/if}
  </div>
{/if}

<style>
  .alert {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-radius: 8px;
    margin-bottom: 8px;
  }

  .alert-info    { background: #dbeafe; color: #1e40af; }
  .alert-success { background: #dcfce7; color: #166534; }
  .alert-warning { background: #fef9c3; color: #854d0e; }
  .alert-error   { background: #fee2e2; color: #991b1b; }

  .close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: inherit;
    padding: 0 4px;
  }

  p { margin: 0; }
</style>
```

```svelte
<Alert message="File saved successfully" type="success" dismissible />
<Alert message="Check your input" type="warning" />
<Alert message="Something went wrong" type="error" dismissible />
<!-- <Alert /> would cause a TypeScript error: 'message' is required -->
```

## Rest Props with `...rest`

Sometimes you want to forward HTML attributes to an underlying element without listing every possible attribute. The rest pattern captures everything you did not explicitly destructure:

```svelte
<!-- Input.svelte -->
<script lang="ts">
  let { label, error, ...rest } = $props();
</script>

<div class="field">
  {#if label}
    <label for={rest.id}>{label}</label>
  {/if}
  <input class:has-error={error} {...rest} />
  {#if error}
    <span class="error">{error}</span>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 16px;
  }

  label {
    font-weight: 600;
    font-size: 0.9rem;
  }

  input {
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 1rem;
  }

  input.has-error {
    border-color: #ef4444;
  }

  .error {
    color: #ef4444;
    font-size: 0.85rem;
  }
</style>
```

```svelte
<script>
  import Input from './Input.svelte';
</script>

<!-- All standard HTML attributes pass through via ...rest -->
<Input
  label="Email"
  type="email"
  id="email"
  placeholder="you@example.com"
  required
  autocomplete="email"
/>

<Input
  label="Username"
  type="text"
  id="username"
  minlength={3}
  maxlength={20}
  error="Username is already taken"
/>
```

The rest pattern is essential for building component libraries. Without it, you would need to explicitly declare every possible HTML attribute (`type`, `placeholder`, `required`, `autocomplete`, `minlength`, `maxlength`, `disabled`, `readonly`, `pattern`, etc.) — an impractical list. With `...rest`, your component transparently supports all HTML attributes by forwarding them to the underlying element.

**Gotcha**: Rest props include everything the parent passed that you did not destructure. If a parent passes a prop you did not expect, it gets spread onto the HTML element. This can cause `Unknown prop` warnings or invalid HTML attributes. Be deliberate about what you spread.

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

The parent owns the data and passes it down. If the child needs to change it, you pass down a callback function.

**Why not just mutate props?** If a child could modify a prop, you would have two sources of truth — the parent's state and the child's mutation. When a bug appears, you would not know which one caused the value to change. One-way flow eliminates this ambiguity: the parent is always the single source of truth.

## Passing Callback Functions as Props

When a child needs to communicate *up* to its parent, the parent passes a callback function as a prop:

```svelte
<!-- TodoItem.svelte -->
<script>
  let { id, text, done, onToggle, onDelete } = $props();
</script>

<div class="todo" class:done>
  <label>
    <input type="checkbox" checked={done} onchange={() => onToggle(id)} />
    <span>{text}</span>
  </label>
  <button class="delete" onclick={() => onDelete(id)} aria-label="Delete {text}">
    &times;
  </button>
</div>

<style>
  .todo {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid #eee;
  }

  .done span {
    text-decoration: line-through;
    color: #999;
  }

  .delete {
    background: none;
    border: none;
    color: #e74c3c;
    font-size: 1.3rem;
    cursor: pointer;
  }
</style>
```

```svelte
<!-- TodoList.svelte -->
<script>
  import TodoItem from './TodoItem.svelte';

  let todos = $state([
    { id: 1, text: 'Learn Svelte', done: false },
    { id: 2, text: 'Build a project', done: false },
    { id: 3, text: 'Deploy to production', done: false }
  ]);

  function toggle(id) {
    todos = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
  }

  function remove(id) {
    todos = todos.filter(t => t.id !== id);
  }
</script>

{#each todos as todo (todo.id)}
  <TodoItem
    id={todo.id}
    text={todo.text}
    done={todo.done}
    onToggle={toggle}
    onDelete={remove}
  />
{/each}
```

The parent owns the `todos` array. The child items only receive data and invoke callbacks. This keeps state management centralized and predictable.

## The Spread Pattern

When you have an object whose keys match a component's props, you can spread it:

```svelte
<script>
  import ProductCard from './ProductCard.svelte';

  const products = [
    { title: 'Keyboard', price: 129.99, rating: 5, onSale: true },
    { title: 'Mouse', price: 49.99, rating: 4, onSale: false },
    { title: 'Monitor', price: 599.99, rating: 5, onSale: true }
  ];
</script>

{#each products as product}
  <!-- Instead of passing each prop individually: -->
  <!-- <ProductCard title={product.title} price={product.price} ... /> -->

  <!-- Spread the entire object: -->
  <ProductCard {...product} />
{/each}
```

**When to use spread**: It is convenient for data-driven rendering (like mapping over an array) and for forwarding props through intermediate components. But use it thoughtfully — spreading makes it harder to see exactly which props are being passed. For components where clarity matters (like a complex form), explicit props are better.

**When NOT to use spread**: Do not spread user-controlled data directly onto components or HTML elements. An attacker could inject unexpected attributes. Always validate or pick specific keys from untrusted data.

## $bindable() for Two-Way Binding

Sometimes one-way flow is too verbose. For form components especially, you want the parent to be able to `bind:` to a child's prop. The `$bindable()` rune opts a specific prop into two-way binding:

```svelte
<!-- SearchInput.svelte -->
<script>
  let { value = $bindable(''), placeholder = 'Search...' } = $props();
</script>

<div class="search">
  <svg class="icon" viewBox="0 0 24 24" width="18" height="18">
    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2"/>
    <line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2"/>
  </svg>
  <input type="search" bind:value {placeholder} />
</div>

<style>
  .search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: white;
  }

  .icon { color: #9ca3af; flex-shrink: 0; }

  input {
    border: none;
    outline: none;
    font-size: 1rem;
    width: 100%;
  }
</style>
```

```svelte
<!-- App.svelte -->
<script>
  import SearchInput from './SearchInput.svelte';

  let query = $state('');

  let items = ['Apples', 'Bananas', 'Cherries', 'Dates', 'Elderberries'];
  let filtered = $derived(
    items.filter(item => item.toLowerCase().includes(query.toLowerCase()))
  );
</script>

<SearchInput bind:value={query} placeholder="Filter fruits..." />

<ul>
  {#each filtered as item}
    <li>{item}</li>
  {/each}
</ul>
```

The `$bindable()` call in the child declares that `value` can participate in two-way binding. Without `$bindable()`, attempting `bind:value` on the component would produce a compiler error.

**When to use `$bindable()`**: Primarily for form-like components where the parent needs to read and write a value: inputs, selects, toggles, color pickers, sliders. For everything else, prefer callbacks.

## Typing Props with TypeScript

For production code, type your props. This catches errors at build time and provides autocomplete in your editor:

```svelte
<!-- DataTable.svelte -->
<script lang="ts">
  interface Column {
    key: string;
    label: string;
    align?: 'left' | 'center' | 'right';
    format?: (value: unknown) => string;
  }

  interface Props {
    columns: Column[];
    rows: Record<string, unknown>[];
    striped?: boolean;
    compact?: boolean;
    onRowClick?: (row: Record<string, unknown>, index: number) => void;
  }

  let {
    columns,
    rows,
    striped = false,
    compact = false,
    onRowClick
  }: Props = $props();
</script>

<table class:striped class:compact>
  <thead>
    <tr>
      {#each columns as col}
        <th style:text-align={col.align ?? 'left'}>{col.label}</th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#each rows as row, i}
      <tr
        class:clickable={!!onRowClick}
        onclick={() => onRowClick?.(row, i)}
      >
        {#each columns as col}
          <td style:text-align={col.align ?? 'left'}>
            {col.format ? col.format(row[col.key]) : row[col.key]}
          </td>
        {/each}
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { font-weight: 600; color: #475569; background: #f8fafc; }
  .compact th, .compact td { padding: 8px 12px; font-size: 0.9rem; }
  .striped tbody tr:nth-child(even) { background: #f8fafc; }
  .clickable { cursor: pointer; }
  .clickable:hover { background: #f1f5f9; }
</style>
```

Typed props give you:
- **Autocomplete** — your editor suggests valid props as you type
- **Error detection** — passing a number where a string is expected produces a red squiggle
- **Documentation** — the interface itself documents what the component accepts
- **Refactoring safety** — renaming a prop updates all type errors across your project

## $props.id() for Unique IDs

When building accessible form components, you need unique `id` attributes to connect `<label>` with `<input>`. The `$props.id()` utility generates a unique ID per component instance:

```svelte
<!-- FormField.svelte -->
<script>
  let { label, error, ...inputProps } = $props();
  const id = $props.id();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <input {id} aria-describedby={error ? `${id}-error` : undefined} {...inputProps} />
  {#if error}
    <span id="{id}-error" class="error" role="alert">{error}</span>
  {/if}
</div>

<style>
  .field { margin-bottom: 16px; }
  label { display: block; font-weight: 600; margin-bottom: 4px; }
  input { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; }
  .error { color: #ef4444; font-size: 0.85rem; margin-top: 4px; display: block; }
</style>
```

Each `<FormField />` instance gets a unique ID, so multiple instances on the same page never collide. This is much safer than hardcoding IDs or generating random strings.

## The Children Snippet as Implicit Prop

When you write content between a component's opening and closing tags, Svelte passes it as the `children` snippet:

```svelte
<!-- Card.svelte -->
<script>
  let { title, children } = $props();
</script>

<div class="card">
  {#if title}
    <h3 class="card-title">{title}</h3>
  {/if}
  <div class="card-body">
    {@render children()}
  </div>
</div>

<style>
  .card {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    overflow: hidden;
  }

  .card-title {
    margin: 0;
    padding: 16px 20px;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
    font-size: 1.1rem;
  }

  .card-body {
    padding: 20px;
  }
</style>
```

```svelte
<!-- Usage -->
<Card title="User Profile">
  <p>This content is the children snippet.</p>
  <p>You can put any markup here — text, other components, anything.</p>
</Card>
```

The `children` snippet is what makes components like `<Card>`, `<Modal>`, and `<Layout>` possible. Without it, every component would need to receive all its content via string props, which is far too limiting.

## Forwarding Props to Child Components

In layered architectures, intermediate components often need to pass props through to their children. Here are the patterns:

```svelte
<!-- IconButton.svelte — wraps Button with an icon -->
<script>
  import Button from './Button.svelte';

  let { icon, children, ...buttonProps } = $props();
</script>

<Button {...buttonProps}>
  <span class="icon-btn-content">
    <span class="icon">{@html icon}</span>
    {@render children()}
  </span>
</Button>

<style>
  .icon-btn-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
```

This `IconButton` adds an icon but forwards everything else (`variant`, `size`, `disabled`, `onclick`, etc.) to the underlying `Button`. The parent can use `IconButton` exactly like `Button` but with an icon.

## Prop Validation Patterns

For production components, you sometimes need to validate prop values beyond what TypeScript catches:

```svelte
<!-- Rating.svelte -->
<script lang="ts">
  interface Props {
    value: number;
    max?: number;
    readonly?: boolean;
    onChange?: (value: number) => void;
  }

  let { value, max = 5, readonly = false, onChange }: Props = $props();

  // Runtime validation — catches bugs during development
  $effect(() => {
    if (import.meta.env.DEV) {
      if (value < 0 || value > max) {
        console.warn(`Rating: value (${value}) is out of range [0, ${max}]`);
      }
      if (max < 1) {
        console.warn(`Rating: max (${max}) must be at least 1`);
      }
    }
  });
</script>

<div class="rating" role="group" aria-label="Rating: {value} out of {max}">
  {#each Array(max) as _, i}
    <button
      class="star"
      class:filled={i < value}
      disabled={readonly}
      onclick={() => onChange?.(i + 1)}
      aria-label="Rate {i + 1} out of {max}"
    >
      {i < value ? '★' : '☆'}
    </button>
  {/each}
</div>

<style>
  .rating { display: flex; gap: 2px; }
  .star {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #d1d5db;
    padding: 2px;
    transition: color 0.15s;
  }
  .star.filled { color: #f59e0b; }
  .star:hover:not(:disabled) { color: #fbbf24; }
  .star:disabled { cursor: default; }
</style>
```

The `import.meta.env.DEV` guard ensures validation warnings only run during development and are stripped from production builds.

## Complete Compound Component Example

Here is a real-world pattern: a compound component where a parent component provides context to tightly coupled children. This Accordion example uses props and callbacks to coordinate:

```svelte
<!-- Accordion.svelte -->
<script>
  let { children } = $props();
  let openIndex = $state(-1);

  function toggle(index) {
    openIndex = openIndex === index ? -1 : index;
  }
</script>

<div class="accordion">
  {@render children({ openIndex, toggle })}
</div>

<style>
  .accordion {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    overflow: hidden;
  }
</style>
```

```svelte
<!-- AccordionItem.svelte -->
<script>
  let { title, index, isOpen, onToggle, children } = $props();
</script>

<div class="accordion-item">
  <button
    class="accordion-header"
    class:open={isOpen}
    onclick={() => onToggle(index)}
    aria-expanded={isOpen}
  >
    <span>{title}</span>
    <span class="chevron" class:rotated={isOpen}>&#9660;</span>
  </button>
  {#if isOpen}
    <div class="accordion-body">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .accordion-item { border-bottom: 1px solid #e2e8f0; }
  .accordion-item:last-child { border-bottom: none; }

  .accordion-header {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    background: white;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-weight: 600;
    text-align: left;
  }

  .accordion-header:hover { background: #f8fafc; }
  .accordion-header.open { background: #f1f5f9; }

  .chevron { transition: transform 0.2s ease; font-size: 0.75rem; }
  .chevron.rotated { transform: rotate(180deg); }

  .accordion-body { padding: 16px 20px; color: #475569; line-height: 1.6; }
</style>
```

```svelte
<!-- Usage -->
<script>
  import Accordion from './Accordion.svelte';
  import AccordionItem from './AccordionItem.svelte';

  const faqs = [
    { title: 'What is Svelte?', body: 'Svelte is a compiler that turns declarative components into efficient JavaScript.' },
    { title: 'How are props different from state?', body: 'Props come from a parent component. State is owned by the component itself.' },
    { title: 'When should I use $bindable()?', body: 'Use it for form-like components where the parent needs read/write access to a value.' }
  ];
</script>

<Accordion>
  {#snippet children({ openIndex, toggle })}
    {#each faqs as faq, i}
      <AccordionItem
        title={faq.title}
        index={i}
        isOpen={openIndex === i}
        onToggle={toggle}
      >
        <p>{faq.body}</p>
      </AccordionItem>
    {/each}
  {/snippet}
</Accordion>
```

This compound pattern lets the `Accordion` manage which item is open while each `AccordionItem` handles its own rendering. The parent (usage site) wires them together. This is a professional pattern you will see in component libraries.

## Try It

Build a reusable `Alert` component and a reusable `Modal` component:

**Alert** — accepts:
- A `message` prop (required, string)
- A `type` prop with a default of `"info"` (can be `"info"`, `"success"`, `"warning"`, `"error"`)
- A `dismissible` prop (default `false`) that shows a close button
- An `onDismiss` callback prop
- Style each type with a different background color

**Modal** — accepts:
- A `title` prop (required)
- A `children` snippet for the body content
- An `open` prop with `$bindable()` so the parent can control visibility
- An `onClose` callback prop
- A backdrop that closes the modal when clicked

Use both in a parent component: show four `Alert` variants and a button that opens the `Modal`.

## Key Takeaways

- `$props()` receives data passed from a parent component, returning an object you destructure
- Set defaults with assignment: `let { color = "blue" } = $props()` — only applied when the value is `undefined`
- Props flow one way: **parent to child** — never modify a prop in the child
- Use `...rest` to capture and forward unknown props to underlying HTML elements
- `$bindable()` opts a prop into two-way binding — use for form-like components
- Type your props with TypeScript interfaces for editor autocomplete and compile-time safety
- Use `$props.id()` to generate unique IDs for accessible form components
- `children` is an implicit snippet prop for content between a component's tags
- Pass callback functions as props to let children communicate with parents
- Spread objects onto components with `{...data}` for data-driven rendering
- Compound components use props and callbacks to coordinate tightly coupled parent-child groups
