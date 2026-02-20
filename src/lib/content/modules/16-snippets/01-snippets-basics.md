# Snippets Basics

In Svelte 5, **snippets** are a way to define reusable chunks of markup within a component. Think of them as local templates — you define a block of HTML once and render it in multiple places, or pass it to a child component to control how that component displays content.

Snippets replace the old slot-based approach from Svelte 4. They are more flexible, more explicit, and easier to type with TypeScript. If you have used slots before, snippets are the modern replacement. If you are new to Svelte, snippets are simply the way to pass template content between components.

## Defining a Snippet

Use the `{#snippet}` block to define a reusable chunk of markup:

```svelte
<!-- src/routes/+page.svelte -->
{#snippet greeting(name)}
  <div class="greeting">
    <h2>Hello, {name}!</h2>
    <p>Welcome to our site.</p>
  </div>
{/snippet}

{@render greeting("Alice")}
{@render greeting("Bob")}
{@render greeting("Charlie")}
```

The `{#snippet name(params)}` block defines the template. The `{@render name(args)}` tag renders it. You can render the same snippet multiple times with different arguments.

## Passing Snippets to Components

The real power of snippets is passing them to child components, letting the parent control how the child renders content:

```svelte
<!-- src/lib/components/List.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    items: string[];
    row: Snippet<[string]>;
  }

  let { items, row }: Props = $props();
</script>

<ul>
  {#each items as item}
    <li>{@render row(item)}</li>
  {/each}
</ul>
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import List from '$lib/components/List.svelte';

  const fruits = ['Apple', 'Banana', 'Cherry'];
</script>

<List items={fruits}>
  {#snippet row(fruit)}
    <span class="fruit">{fruit}</span>
  {/snippet}
</List>
```

The parent defines how each row looks. The child handles the iteration and structure. This is a clean separation of concerns.

## The children Snippet

When you put content between a component's opening and closing tags, Svelte automatically creates a `children` snippet:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    children: Snippet;
  }

  let { title, children }: Props = $props();
</script>

<div class="card">
  <h3>{title}</h3>
  <div class="content">
    {@render children()}
  </div>
</div>
```

```svelte
<!-- Usage -->
<Card title="My Card">
  <p>This content becomes the children snippet.</p>
  <p>You can put anything here.</p>
</Card>
```

This is how layouts work too — `{@render children()}` renders the page content inside the layout.

## Snippets with Multiple Parameters

Snippets can accept multiple parameters for complex rendering:

```svelte
<!-- src/lib/components/DataTable.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    data: any[];
    header: Snippet;
    row: Snippet<[any, number]>;
  }

  let { data, header, row }: Props = $props();
</script>

<table>
  <thead>
    {@render header()}
  </thead>
  <tbody>
    {#each data as item, index}
      <tr>{@render row(item, index)}</tr>
    {/each}
  </tbody>
</table>
```

```svelte
<!-- Usage -->
<script lang="ts">
  import DataTable from '$lib/components/DataTable.svelte';

  const users = [
    { name: 'Alice', email: 'alice@example.com' },
    { name: 'Bob', email: 'bob@example.com' }
  ];
</script>

<DataTable data={users}>
  {#snippet header()}
    <th>Name</th>
    <th>Email</th>
    <th>#</th>
  {/snippet}

  {#snippet row(user, index)}
    <td>{user.name}</td>
    <td>{user.email}</td>
    <td>{index + 1}</td>
  {/snippet}
</DataTable>
```

## Try It

Create a `Card` component that accepts a `children` snippet and an optional `footer` snippet. Then create a `List` component that accepts a `row` snippet with a parameter. Use both components on a page, passing different snippet content to each instance.

## Key Takeaways

- **Snippets** are reusable blocks of markup defined with `{#snippet name(params)}`
- Render snippets with `{@render name(args)}` — they can be called multiple times
- Snippets replace slots from Svelte 4 with a more explicit, type-safe approach
- Pass snippets as props to let parent components control child rendering
- Content between component tags becomes the `children` snippet automatically
- Type snippets with `Snippet` and `Snippet<[ParamType]>` from the `svelte` module
