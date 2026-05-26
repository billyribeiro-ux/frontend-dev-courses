# Snippets Basics

In Svelte 4, if you wanted a parent component to control what a child renders, you used **slots**. Slots worked, but they had significant limitations: they were stringly-typed, difficult to compose, and their TypeScript story was incomplete. Svelte 5 replaces slots entirely with **snippets** — a first-class way to define reusable chunks of markup within a component, pass them as props to child components, and render them with full type safety.

Snippets are one of Svelte 5's most important features. They eliminate an entire category of bugs that came from untyped slot content, they compose naturally (you can define a snippet inside another snippet), and they make your component APIs explicit. Where a slot was an invisible hole in a component's markup, a snippet is a named, typed, parameterized template that appears in the component's props interface.

Think of a snippet as a local function, except instead of returning a value, it returns a chunk of markup. You define it with `{#snippet}`, you render it with `{@render}`, and you can pass it around like any other value.

## Defining and Rendering Snippets

Use the `{#snippet}` block to define a reusable chunk of markup:

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  const people = ['Alice', 'Bob', 'Charlie'];
</script>

{#snippet greeting(name: string)}
  <div class="greeting">
    <h2>Hello, {name}!</h2>
    <p>Welcome to our platform.</p>
  </div>
{/snippet}

{#each people as person}
  {@render greeting(person)}
{/each}
```

The `{#snippet name(params)}` block defines the template. The `{@render name(args)}` tag renders it. You can render the same snippet multiple times with different arguments — each render produces independent DOM.

Snippets are defined inside the component's markup, not in the `<script>` block. They have access to all variables in scope, including reactive state:

```svelte
<script lang="ts">
  let showDetails = $state(false);

  interface Product {
    name: string;
    price: number;
    description: string;
  }

  const products: Product[] = [
    { name: 'Widget', price: 9.99, description: 'A useful widget.' },
    { name: 'Gadget', price: 19.99, description: 'An amazing gadget.' }
  ];
</script>

{#snippet productCard(product: Product)}
  <div class="card">
    <h3>{product.name}</h3>
    <p class="price">${product.price.toFixed(2)}</p>
    {#if showDetails}
      <p class="description">{product.description}</p>
    {/if}
  </div>
{/snippet}

<button onclick={() => showDetails = !showDetails}>
  {showDetails ? 'Hide' : 'Show'} details
</button>

{#each products as product}
  {@render productCard(product)}
{/each}
```

The `showDetails` state is reactive inside the snippet. When it changes, every rendered instance of `productCard` updates. This is a key difference from helper functions — snippets participate in Svelte's reactivity system.

## Snippets with Multiple Parameters

Snippets can accept any number of typed parameters:

```svelte
{#snippet tableCell(value: string, highlight: boolean, columnIndex: number)}
  <td class:highlighted={highlight} data-col={columnIndex}>
    {value}
  </td>
{/snippet}

{@render tableCell("Alice", true, 0)}
{@render tableCell("alice@email.com", false, 1)}
```

For complex parameter types, define an interface:

```svelte
<script lang="ts">
  interface TableColumn {
    key: string;
    label: string;
    sortable: boolean;
  }
</script>

{#snippet columnHeader(col: TableColumn, index: number)}
  <th class:sortable={col.sortable}>
    {col.label}
    {#if col.sortable}
      <button onclick={() => sortBy(col.key)}>Sort</button>
    {/if}
  </th>
{/snippet}
```

## The children Snippet

When you put content between a component's opening and closing tags, Svelte automatically creates a snippet called `children`:

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
  <div class="card-header">
    <h3>{title}</h3>
  </div>
  <div class="card-body">
    {@render children()}
  </div>
</div>
```

```svelte
<!-- Usage -->
<Card title="Welcome">
  <p>This content becomes the children snippet.</p>
  <p>You can put anything here — text, elements, other components.</p>
</Card>
```

This is how SvelteKit's `+layout.svelte` works. The layout receives a `children` snippet that represents the current page's content, and `{@render children()}` places it in the layout.

The `children` snippet is just a convention — there is nothing magic about the name. Svelte creates it automatically from the content between a component's tags, but it is a regular snippet prop that you declare in your `Props` interface.

## Passing Snippets as Props

The real power of snippets emerges when you pass them to child components, letting the parent control how the child renders content. This inverts control: the child defines the structure, the parent defines the presentation.

```svelte
<!-- src/lib/components/List.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    items: string[];
    row: Snippet<[string]>;
    empty?: Snippet;
  }

  let { items, row, empty }: Props = $props();
</script>

{#if items.length === 0}
  {#if empty}
    {@render empty()}
  {:else}
    <p>No items found.</p>
  {/if}
{:else}
  <ul>
    {#each items as item}
      <li>{@render row(item)}</li>
    {/each}
  </ul>
{/if}
```

```svelte
<!-- Usage -->
<script lang="ts">
  import List from '$lib/components/List.svelte';

  const fruits = ['Apple', 'Banana', 'Cherry'];
  const emptyList: string[] = [];
</script>

<!-- Basic usage -->
<List items={fruits}>
  {#snippet row(fruit)}
    <span class="fruit">{fruit}</span>
  {/snippet}
</List>

<!-- With custom empty state -->
<List items={emptyList}>
  {#snippet row(item)}
    <span>{item}</span>
  {/snippet}

  {#snippet empty()}
    <div class="empty-state">
      <p>Your list is empty.</p>
      <button>Add an item</button>
    </div>
  {/snippet}
</List>
```

The `Snippet<[string]>` type means "a snippet that takes one parameter of type `string`." The type parameter is a tuple — `Snippet<[string, number]>` means two parameters. Plain `Snippet` (no type parameter) means the snippet takes no parameters.

## Optional Snippets with Fallback Content

Components often need a default rendering when the parent does not provide a snippet. Use optional chaining with a fallback:

```svelte
<!-- src/lib/components/Modal.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    onclose: () => void;
    title: string;
    children: Snippet;
    footer?: Snippet;
    icon?: Snippet;
  }

  let { open, onclose, title, children, footer, icon }: Props = $props();
</script>

{#if open}
  <div class="modal-backdrop" onclick={onclose}>
    <div class="modal" onclick={(e) => e.stopPropagation()}>
      <header class="modal-header">
        {#if icon}
          <span class="modal-icon">{@render icon()}</span>
        {/if}
        <h2>{title}</h2>
        <button class="close-button" onclick={onclose}>X</button>
      </header>

      <div class="modal-body">
        {@render children()}
      </div>

      <footer class="modal-footer">
        {#if footer}
          {@render footer()}
        {:else}
          <button onclick={onclose}>Close</button>
        {/if}
      </footer>
    </div>
  </div>
{/if}
```

```svelte
<!-- Usage: basic modal with default footer -->
<Modal open={showBasicModal} onclose={() => showBasicModal = false} title="Confirm">
  <p>Are you sure you want to continue?</p>
</Modal>

<!-- Usage: modal with custom footer and icon -->
<Modal open={showDeleteModal} onclose={() => showDeleteModal = false} title="Delete Item">
  {#snippet icon()}
    <svg viewBox="0 0 24 24"><path d="..." /></svg>
  {/snippet}

  <p>This action cannot be undone. The item will be permanently deleted.</p>

  {#snippet footer()}
    <button onclick={() => showDeleteModal = false}>Cancel</button>
    <button class="danger" onclick={handleDelete}>Delete</button>
  {/snippet}
</Modal>
```

## Complete Example: Data Table Component

Here is a production-quality data table that demonstrates snippets at their most powerful — the child component handles sorting, pagination, and structure while the parent controls every aspect of rendering:

```svelte
<!-- src/lib/components/DataTable.svelte -->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Props {
    data: T[];
    header: Snippet;
    row: Snippet<[T, number]>;
    empty?: Snippet;
    caption?: Snippet;
    pageSize?: number;
  }

  let {
    data,
    header,
    row,
    empty,
    caption,
    pageSize = 10
  }: Props = $props();

  let currentPage = $state(1);

  let totalPages = $derived(Math.ceil(data.length / pageSize));
  let paginatedData = $derived(
    data.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  function goToPage(page: number) {
    currentPage = Math.max(1, Math.min(page, totalPages));
  }
</script>

<div class="table-container">
  <table>
    {#if caption}
      <caption>{@render caption()}</caption>
    {/if}
    <thead>
      <tr>{@render header()}</tr>
    </thead>
    <tbody>
      {#if paginatedData.length === 0}
        <tr>
          <td colspan="100">
            {#if empty}
              {@render empty()}
            {:else}
              <p>No data available.</p>
            {/if}
          </td>
        </tr>
      {:else}
        {#each paginatedData as item, index}
          <tr>{@render row(item, (currentPage - 1) * pageSize + index)}</tr>
        {/each}
      {/if}
    </tbody>
  </table>

  {#if totalPages > 1}
    <nav class="pagination">
      <button onclick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
        Previous
      </button>
      <span>Page {currentPage} of {totalPages}</span>
      <button onclick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}>
        Next
      </button>
    </nav>
  {/if}
</div>
```

```svelte
<!-- Usage -->
<script lang="ts">
  import DataTable from '$lib/components/DataTable.svelte';

  interface User {
    id: string;
    name: string;
    email: string;
    role: 'admin' | 'editor' | 'viewer';
    lastLogin: string;
  }

  const users: User[] = [
    { id: '1', name: 'Alice', email: 'alice@example.com', role: 'admin', lastLogin: '2025-03-15' },
    { id: '2', name: 'Bob', email: 'bob@example.com', role: 'editor', lastLogin: '2025-03-14' },
    { id: '3', name: 'Charlie', email: 'charlie@example.com', role: 'viewer', lastLogin: '2025-03-10' }
  ];
</script>

<DataTable data={users} pageSize={5}>
  {#snippet caption()}
    <strong>Team Members</strong> — {users.length} total
  {/snippet}

  {#snippet header()}
    <th>Name</th>
    <th>Email</th>
    <th>Role</th>
    <th>Last Login</th>
    <th>Actions</th>
  {/snippet}

  {#snippet row(user: User, index: number)}
    <td>
      <div class="user-cell">
        <span class="avatar">{user.name[0]}</span>
        {user.name}
      </div>
    </td>
    <td>{user.email}</td>
    <td>
      <span class="badge badge-{user.role}">{user.role}</span>
    </td>
    <td>{user.lastLogin}</td>
    <td>
      <button onclick={() => editUser(user.id)}>Edit</button>
      <button onclick={() => deleteUser(user.id)}>Delete</button>
    </td>
  {/snippet}

  {#snippet empty()}
    <div class="empty-state">
      <p>No team members found.</p>
      <button>Invite someone</button>
    </div>
  {/snippet}
</DataTable>
```

Notice the `generics="T"` on the `<script>` tag. This makes the component generic — `T` is inferred from the `data` prop, and the `row` snippet's parameter is automatically typed as `T`. This is full type-safe component composition.

## Why Snippets Are Better Than Slots

If you are coming from Svelte 4, here is why the migration to snippets is worth it:

### 1. Type Safety

Slots in Svelte 4 had no type checking. You could pass any content to a named slot, and if the slot exposed values via `let:`, they were untyped:

```svelte
<!-- Svelte 4 (old) — no type safety -->
<DataTable {data} let:item let:index>
  <!-- item and index are 'any' — no autocomplete, no error checking -->
  <td>{item.naem}</td> <!-- typo not caught -->
</DataTable>
```

```svelte
<!-- Svelte 5 (new) — full type safety -->
<DataTable {data}>
  {#snippet row(item: User, index: number)}
    <td>{item.naem}</td> <!-- TypeScript catches the typo -->
  {/snippet}
</DataTable>
```

### 2. Multiple Instances

Slots could only appear once per component. If you needed to render the same content twice (like a preview and an actual render), you could not reuse a slot. Snippets can be rendered any number of times:

```svelte
<!-- A component can render a snippet multiple times -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    preview: Snippet;
  }

  let { preview }: Props = $props();
</script>

<!-- Render in the preview pane -->
<div class="preview-pane">
  {@render preview()}
</div>

<!-- Render in the main area -->
<div class="main-area">
  {@render preview()}
</div>
```

### 3. Composition

Snippets compose naturally. You can define a snippet inside another snippet, pass snippets to other snippets, and build complex layouts from simple building blocks:

```svelte
{#snippet wrapper(content: Snippet)}
  <div class="wrapper">
    {@render content()}
  </div>
{/snippet}

{#snippet innerContent()}
  <p>This is nested inside the wrapper.</p>
{/snippet}

{@render wrapper(innerContent)}
```

### 4. Explicit API

With slots, a component's API was implicit — you had to read the source code to know which named slots were available and what values they exposed. With snippets, every piece of injectable content is a typed prop:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  // The Props interface IS the API documentation
  interface Props {
    data: User[];
    header: Snippet;                    // Required
    row: Snippet<[User, number]>;       // Required, typed parameters
    footer?: Snippet;                   // Optional
    empty?: Snippet;                    // Optional
  }
</script>
```

## Converting from Svelte 4 Slots to Svelte 5 Snippets

If you are migrating an existing codebase, here are the conversion patterns:

### Default Slot to children

```svelte
<!-- Svelte 4 -->
<div class="card">
  <slot />
</div>

<!-- Svelte 5 -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="card">
  {@render children()}
</div>
```

### Named Slot to Named Snippet

```svelte
<!-- Svelte 4 -->
<div class="card">
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</div>

<!-- Svelte 5 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    header: Snippet;
    children: Snippet;
    footer?: Snippet;
  }

  let { header, children, footer }: Props = $props();
</script>

<div class="card">
  <header>{@render header()}</header>
  <main>{@render children()}</main>
  {#if footer}
    <footer>{@render footer()}</footer>
  {/if}
</div>
```

### Slot Props (let:) to Snippet Parameters

```svelte
<!-- Svelte 4 -->
<ul>
  {#each items as item, index}
    <li><slot {item} {index} /></li>
  {/each}
</ul>

<!-- Usage (Svelte 4) -->
<List {items} let:item let:index>
  <span>{index}: {item.name}</span>
</List>

<!-- Svelte 5 -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    items: Item[];
    row: Snippet<[Item, number]>;
  }

  let { items, row }: Props = $props();
</script>

<ul>
  {#each items as item, index}
    <li>{@render row(item, index)}</li>
  {/each}
</ul>

<!-- Usage (Svelte 5) -->
<List {items}>
  {#snippet row(item, index)}
    <span>{index}: {item.name}</span>
  {/snippet}
</List>
```

## Complete Example: Composable Card Component

Here is a card component that uses snippets for maximum flexibility:

```svelte
<!-- src/lib/components/Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
    header?: Snippet;
    footer?: Snippet;
    media?: Snippet;
    variant?: 'default' | 'outlined' | 'elevated';
    onclick?: () => void;
  }

  let {
    children,
    header,
    footer,
    media,
    variant = 'default',
    onclick
  }: Props = $props();
</script>

<div
  class="card card-{variant}"
  class:clickable={!!onclick}
  onclick={onclick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
>
  {#if media}
    <div class="card-media">
      {@render media()}
    </div>
  {/if}

  {#if header}
    <div class="card-header">
      {@render header()}
    </div>
  {/if}

  <div class="card-body">
    {@render children()}
  </div>

  {#if footer}
    <div class="card-footer">
      {@render footer()}
    </div>
  {/if}
</div>
```

```svelte
<!-- Usage: Multiple card variations from one component -->
<script lang="ts">
  import Card from '$lib/components/Card.svelte';
</script>

<!-- Simple card — just children -->
<Card>
  <p>A basic card with some text.</p>
</Card>

<!-- Blog post card — header, media, children, footer -->
<Card variant="elevated">
  {#snippet media()}
    <img src="/images/post-cover.jpg" alt="Post cover" />
  {/snippet}

  {#snippet header()}
    <span class="tag">Tutorial</span>
    <h3>Getting Started with Svelte 5</h3>
    <p class="author">By Jane Doe — March 15, 2025</p>
  {/snippet}

  <p>Learn the fundamentals of Svelte 5, including runes, snippets, and the new reactivity system.</p>

  {#snippet footer()}
    <a href="/blog/getting-started">Read more</a>
    <button>Bookmark</button>
  {/snippet}
</Card>

<!-- Clickable pricing card -->
<Card variant="outlined" onclick={() => selectPlan('pro')}>
  {#snippet header()}
    <h3>Pro Plan</h3>
    <p class="price">$29/mo</p>
  {/snippet}

  <ul>
    <li>Unlimited projects</li>
    <li>Priority support</li>
    <li>Custom domain</li>
  </ul>
</Card>
```

One component definition, three completely different visual presentations — all fully typed.

## Try It

### Exercise 1: Card with Optional Snippets
Create a `Card` component that accepts `children`, an optional `header` snippet, and an optional `footer` snippet. When a footer is not provided, render a default "Learn more" link. Use the card in three variations: plain content, content with header, and content with header and custom footer.

### Exercise 2: Typed Data List
Create a `List` component that accepts a generic `row` snippet with typed parameters. Use it to render a list of users where each row shows the user's name, email, and a delete button. The row snippet should receive the user object and the index.

### Exercise 3: Modal with Snippet Zones
Build a `Modal` component with snippets for `title`, `children` (body), and `footer`. The title snippet should be required, the footer should be optional with a default "Close" button. Create a confirmation modal and a form modal that use different footer layouts.

### Exercise 4: Migration Practice
Take a Svelte 4 component that uses a default slot and two named slots (`header` and `actions`). Convert it to Svelte 5 using the `children` snippet and two named snippet props. Add TypeScript types to the snippet props.

## Key Takeaways

- **Snippets** are reusable blocks of markup defined with `{#snippet name(params)}` and rendered with `{@render name(args)}`
- Snippets replace slots from Svelte 4 with a more explicit, type-safe, and composable approach
- Content between a component's tags becomes the `children` snippet automatically
- Type snippets with `Snippet` (no params), `Snippet<[Type]>` (one param), or `Snippet<[Type1, Type2]>` (multiple params)
- Pass snippets as props to let parent components control child rendering — this is the inversion of control pattern
- Optional snippets use the `?` modifier in the Props interface and conditional rendering in the template
- Snippets can access reactive state from their enclosing scope — they participate in Svelte's reactivity system
- Unlike slots, snippets can be rendered multiple times, composed inside other snippets, and fully type-checked
- Use generic components (`generics="T"` on the script tag) for maximum type inference with snippet parameters
- The conversion from Svelte 4 slots to Svelte 5 snippets is mechanical: default slot becomes `children`, named slots become named snippet props, `let:` directives become snippet parameters
