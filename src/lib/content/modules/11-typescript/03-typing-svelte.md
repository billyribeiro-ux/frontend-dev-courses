# TypeScript in Svelte

Now that you understand TypeScript basics, interfaces, and type aliases, it is time to see how they integrate with Svelte 5's features. Typing your props, state, and event handlers makes your components self-documenting and catches bugs before they reach the browser.

Svelte 5 introduced new reactive primitives — `$props()`, `$state()`, and `$derived()` — and they all work seamlessly with TypeScript. This lesson goes deep: typing every Svelte 5 primitive, typing load functions and form actions, building generic components, typing snippets and children, working with `ComponentProps`, and strict mode considerations for production applications.

## Typing $props() with Inline Types

The simplest approach is to define an interface directly in the component's script block:

```svelte
<!-- src/lib/components/UserCard.svelte -->
<script lang="ts">
  interface Props {
    name: string;
    email: string;
    avatar?: string;
    role?: "admin" | "user" | "guest";
  }

  let { name, email, avatar, role = "user" }: Props = $props();
</script>

<div class="card">
  {#if avatar}
    <img src={avatar} alt={name} />
  {/if}
  <h2>{name}</h2>
  <p>{email}</p>
  <span class="badge">{role}</span>
</div>
```

If a parent component passes the wrong type, TypeScript flags it immediately:

```svelte
<!-- This would produce a TypeScript error -->
<UserCard name={42} email="test@test.com" />
<!-- Error: Type 'number' is not assignable to type 'string' -->
```

When the default value makes the type obvious, you can skip the interface entirely for simple components:

```svelte
<script lang="ts">
  let { count = 0, label = "Count" } = $props();
  // TypeScript infers: count: number, label: string
</script>
```

But explicit interfaces are always better for non-trivial components. They serve as documentation, enable IDE autocompletion for consumers, and catch mistakes when the component API changes.

## Typing $props() with Imported Interfaces

For shared types, import them from your types file. This is the standard pattern for production SvelteKit applications:

```typescript
// src/lib/types.ts
export interface User {
  id: number;
  name: string;
  email: string;
  avatarUrl: string | null;
  role: "admin" | "editor" | "reader";
}

export interface PostPreview {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  author: Pick<User, "id" | "name" | "avatarUrl">;
  publishedAt: string;
}
```

```svelte
<!-- src/lib/components/PostCard.svelte -->
<script lang="ts">
  import type { PostPreview } from '$lib/types';

  interface Props {
    post: PostPreview;
    featured?: boolean;
    onselect?: (post: PostPreview) => void;
  }

  let { post, featured = false, onselect }: Props = $props();
</script>

<article class:featured>
  <h2>{post.title}</h2>
  <p>{post.excerpt}</p>
  <button onclick={() => onselect?.(post)}>Read more</button>
</article>
```

Notice the callback prop `onselect`. The `?.()` optional chaining ensures we only call it if the parent provided it. This is a clean pattern for component events in Svelte 5 — callback props replace the old `createEventDispatcher`.

## Rest Props and HTML Attributes

Components often need to forward HTML attributes to their root element. Use rest props with the appropriate HTML attributes type:

```svelte
<!-- src/lib/components/Button.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  interface Props extends HTMLButtonAttributes {
    variant?: "primary" | "secondary" | "ghost" | "danger";
    size?: "sm" | "md" | "lg";
    loading?: boolean;
    children: Snippet;
  }

  let {
    variant = "primary",
    size = "md",
    loading = false,
    children,
    ...restProps
  }: Props = $props();
</script>

<button
  class="btn btn-{variant} btn-{size}"
  disabled={loading || restProps.disabled}
  {...restProps}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {/if}
  {@render children()}
</button>
```

Now consumers can pass any standard button attribute and it will be forwarded:

```svelte
<Button variant="primary" type="submit" aria-label="Save changes" disabled={!isValid}>
  Save
</Button>
```

The `HTMLButtonAttributes` type includes `onclick`, `disabled`, `type`, `form`, `aria-*`, and every other valid button attribute. Other common base types: `HTMLInputAttributes`, `HTMLAnchorAttributes`, `HTMLDivAttributes`.

## Typing $state()

When you need typed reactive state, use the generic syntax `$state<T>()`:

```svelte
<script lang="ts">
  import type { User, PostPreview } from '$lib/types';

  // Simple types are inferred automatically
  let count = $state(0);              // inferred as number
  let name = $state("Alice");         // inferred as string
  let visible = $state(true);         // inferred as boolean

  // Use the generic when the initial value doesn't tell the full story
  let selectedPost = $state<PostPreview | null>(null);
  let items = $state<string[]>([]);
  let currentUser = $state<User | undefined>(undefined);

  // Discriminated union for complex state
  type ModalState =
    | { open: false }
    | { open: true; title: string; content: string };

  let modal = $state<ModalState>({ open: false });

  function openModal(title: string, content: string) {
    modal = { open: true, title, content };
  }

  function closeModal() {
    modal = { open: false };
  }
</script>

{#if modal.open}
  <!-- TypeScript knows title and content exist here -->
  <div class="modal">
    <h2>{modal.title}</h2>
    <p>{modal.content}</p>
    <button onclick={closeModal}>Close</button>
  </div>
{/if}
```

The generic `<PostPreview | null>` tells TypeScript the state starts as `null` but will eventually hold a `PostPreview`. Without it, TypeScript would infer the type as just `null`, and you would not be able to assign a `PostPreview` later.

### $state with objects and deep reactivity

Svelte 5's `$state` creates deeply reactive state for objects and arrays. TypeScript's type checking works at every level:

```svelte
<script lang="ts">
  interface TodoItem {
    id: number;
    text: string;
    completed: boolean;
  }

  let todos = $state<TodoItem[]>([
    { id: 1, text: "Learn Svelte", completed: true },
    { id: 2, text: "Learn TypeScript", completed: false }
  ]);

  function toggleTodo(id: number) {
    const todo = todos.find(t => t.id === id);
    if (todo) {
      todo.completed = !todo.completed; // Deep reactivity — this triggers updates
    }
  }

  function addTodo(text: string) {
    todos.push({
      id: Date.now(),
      text,
      completed: false
    });
  }
</script>
```

## Typing $derived()

Derived values are usually inferred automatically, but you can be explicit when the expression is complex:

```svelte
<script lang="ts">
  interface Product {
    name: string;
    price: number;
    quantity: number;
    taxRate: number;
  }

  let products = $state<Product[]>([
    { name: "Widget", price: 9.99, quantity: 2, taxRate: 0.08 },
    { name: "Gadget", price: 19.99, quantity: 1, taxRate: 0.08 }
  ]);

  let search = $state("");

  // Inferred as Product[]
  let filtered = $derived(
    products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
  );

  // Inferred as number
  let itemCount = $derived(filtered.length);

  // Complex derived — type is inferred correctly
  let cartSummary = $derived(() => {
    const subtotal = products.reduce((sum, p) => sum + p.price * p.quantity, 0);
    const tax = products.reduce((sum, p) => sum + p.price * p.quantity * p.taxRate, 0);
    return {
      subtotal,
      tax,
      total: subtotal + tax,
      itemCount: products.reduce((sum, p) => sum + p.quantity, 0)
    };
  });
</script>

<input bind:value={search} placeholder="Search products..." />
<p>{itemCount} products found</p>
<p>Total: ${cartSummary().total.toFixed(2)}</p>
```

Note that `$derived(() => ...)` with an arrow function (sometimes called `$derived.by`) returns a function you must call with `()`. The inferred return type comes from the function's return statement.

## Typing Event Handlers

HTML event handlers in Svelte receive standard DOM event types. Here is a comprehensive reference:

```svelte
<script lang="ts">
  let value = $state("");
  let mousePos = $state({ x: 0, y: 0 });

  // Form events
  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    value = event.currentTarget.value;
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget as HTMLFormElement);
    console.log("Submitted:", Object.fromEntries(formData));
  }

  // Mouse events
  function handleClick(event: MouseEvent) {
    console.log(`Clicked at (${event.clientX}, ${event.clientY})`);
  }

  function handleMouseMove(event: MouseEvent) {
    mousePos = { x: event.clientX, y: event.clientY };
  }

  // Keyboard events
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      console.log("Submit on Enter");
    }
    if (event.key === "Escape") {
      console.log("Escape pressed");
    }
  }

  // Focus events
  function handleFocus(event: FocusEvent) {
    const target = event.currentTarget as HTMLInputElement;
    target.select();
  }

  // Drag events
  function handleDragStart(event: DragEvent) {
    event.dataTransfer?.setData("text/plain", "dragged-item-id");
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    const data = event.dataTransfer?.getData("text/plain");
    console.log("Dropped:", data);
  }
</script>

<form onsubmit={handleSubmit}>
  <input
    type="text"
    oninput={handleInput}
    onfocus={handleFocus}
    onkeydown={handleKeyDown}
    value={value}
  />
  <button type="submit" onclick={handleClick}>Submit</button>
</form>

<div
  onmousemove={handleMouseMove}
  ondragover={(e) => e.preventDefault()}
  ondrop={handleDrop}
>
  Mouse: {mousePos.x}, {mousePos.y}
</div>
```

Common event types: `Event`, `MouseEvent`, `KeyboardEvent`, `SubmitEvent`, `FocusEvent`, `InputEvent`, `DragEvent`, `TouchEvent`, `WheelEvent`, `ClipboardEvent`, `AnimationEvent`, `TransitionEvent`.

### The `currentTarget` typing pattern

The most reliable way to type event targets in Svelte is with the intersection type `Event & { currentTarget: HTMLInputElement }`. This gives you typed access to `currentTarget` without needing `as` casts:

```svelte
<script lang="ts">
  function handleChange(event: Event & { currentTarget: HTMLSelectElement }) {
    // event.currentTarget is typed as HTMLSelectElement — no cast needed
    const selectedValue = event.currentTarget.value;
    const selectedIndex = event.currentTarget.selectedIndex;
  }
</script>

<select onchange={handleChange}>
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

## Typing Component Refs with bind:this

When you bind to a component instance, use the `Component` type from Svelte:

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  import TextInput from './TextInput.svelte';

  let inputRef: TextInput;

  function focusInput() {
    // If TextInput exports a 'focus' function, you can call it
    inputRef.focus();
  }
</script>

<TextInput bind:this={inputRef} />
<button onclick={focusInput}>Focus Input</button>
```

For the child component to expose methods, it must use `export function`:

```svelte
<!-- TextInput.svelte -->
<script lang="ts">
  let inputEl: HTMLInputElement;

  export function focus() {
    inputEl.focus();
  }

  export function clear() {
    inputEl.value = "";
  }
</script>

<input bind:this={inputEl} type="text" />
```

## Typing Context with setContext/getContext

Svelte's context API benefits enormously from TypeScript. The pattern is to create a typed key and helper functions:

```typescript
// src/lib/context/theme.ts
import { setContext, getContext } from 'svelte';

export interface ThemeContext {
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;
}

const THEME_KEY = Symbol('theme');

export function setThemeContext(ctx: ThemeContext) {
  setContext(THEME_KEY, ctx);
}

export function getThemeContext(): ThemeContext {
  return getContext<ThemeContext>(THEME_KEY);
}
```

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { setThemeContext, type ThemeContext } from '$lib/context/theme';

  let theme = $state<"light" | "dark">("light");

  setThemeContext({
    get theme() { return theme; },
    toggleTheme: () => { theme = theme === "light" ? "dark" : "light"; },
    setTheme: (t) => { theme = t; }
  });

  let { children }: { children: Snippet } = $props();
</script>

<div class:dark={theme === "dark"}>
  {@render children()}
</div>
```

```svelte
<!-- Any deeply nested component -->
<script lang="ts">
  import { getThemeContext } from '$lib/context/theme';

  const { theme, toggleTheme } = getThemeContext();
</script>

<button onclick={toggleTheme}>
  Current: {theme}
</button>
```

Using a `Symbol` key prevents naming collisions. The helper functions ensure the context is always accessed with the correct type — no `as` casts needed.

## Typing Load Functions

SvelteKit generates types for every route's load function. These generated types ensure your load function's return value matches what the page expects.

### PageServerLoad (server-side data loading)

```typescript
// src/routes/blog/+page.server.ts
import type { PageServerLoad } from './$types';
import type { PostPreview } from '$lib/types';

export const load: PageServerLoad = async ({ url, locals, fetch }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const perPage = 10;

  const response = await fetch(`/api/posts?page=${page}&per_page=${perPage}`);
  const data: { posts: PostPreview[]; total: number } = await response.json();

  return {
    posts: data.posts,
    pagination: {
      page,
      perPage,
      total: data.total,
      totalPages: Math.ceil(data.total / perPage)
    },
    user: locals.user  // from hooks.server.ts
  };
};
```

### PageLoad (universal data loading)

```typescript
// src/routes/blog/[slug]/+page.ts
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch, data }) => {
  // params.slug is typed as string because the route is [slug]
  const response = await fetch(`/api/posts/${params.slug}`);

  if (!response.ok) {
    throw error(404, 'Post not found');
  }

  const post = await response.json();

  return {
    post,
    // data from +page.server.ts is available if it exists
    seo: {
      title: post.title,
      description: post.excerpt
    }
  };
};
```

### LayoutServerLoad

```typescript
// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  return {
    user: locals.user ?? null,
    theme: (cookies.get('theme') as 'light' | 'dark') ?? 'light'
  };
};
```

### Using load data in components

The `$types` module also generates the `PageData` type. Use it for type-safe access:

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  // data.posts, data.pagination, data.user are all typed
</script>

<h1>Blog Posts</h1>
{#each data.posts as post}
  <a href="/blog/{post.slug}">{post.title}</a>
{/each}
```

## Typing Form Actions

SvelteKit form actions handle POST requests. Type them for reliable server-side form processing:

```typescript
// src/routes/contact/+page.server.ts
import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';

interface ContactForm {
  name: string;
  email: string;
  message: string;
}

export const load: PageServerLoad = async () => {
  return {
    submitted: false
  };
};

export const actions: Actions = {
  default: async ({ request }) => {
    const formData = await request.formData();

    const name = formData.get('name') as string | null;
    const email = formData.get('email') as string | null;
    const message = formData.get('message') as string | null;

    // Validate
    const errors: Partial<Record<keyof ContactForm, string>> = {};

    if (!name || name.trim().length < 2) {
      errors.name = "Name must be at least 2 characters";
    }
    if (!email || !email.includes('@')) {
      errors.email = "Please enter a valid email";
    }
    if (!message || message.trim().length < 10) {
      errors.message = "Message must be at least 10 characters";
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, {
        errors,
        values: { name: name ?? "", email: email ?? "", message: message ?? "" }
      });
    }

    // Process the form (send email, save to DB, etc.)
    await sendContactEmail({ name: name!, email: email!, message: message! });

    return { success: true };
  }
};
```

```svelte
<!-- src/routes/contact/+page.svelte -->
<script lang="ts">
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

{#if form?.success}
  <p class="text-green-600">Thank you! Your message has been sent.</p>
{:else}
  <form method="POST">
    <label>
      Name
      <input name="name" value={form?.values?.name ?? ""} />
      {#if form?.errors?.name}
        <span class="error">{form.errors.name}</span>
      {/if}
    </label>

    <label>
      Email
      <input name="email" type="email" value={form?.values?.email ?? ""} />
      {#if form?.errors?.email}
        <span class="error">{form.errors.email}</span>
      {/if}
    </label>

    <label>
      Message
      <textarea name="message">{form?.values?.message ?? ""}</textarea>
      {#if form?.errors?.message}
        <span class="error">{form.errors.message}</span>
      {/if}
    </label>

    <button type="submit">Send</button>
  </form>
{/if}
```

## Generic Components

Svelte 5 supports generic components — components that work with any type while maintaining type safety. This uses the `generics` attribute on the script tag:

```svelte
<!-- src/lib/components/DataList.svelte -->
<script lang="ts" generics="T extends { id: number | string }">
  import type { Snippet } from 'svelte';

  interface Props {
    items: T[];
    renderItem: Snippet<[T]>;
    keyField?: keyof T;
    emptyMessage?: string;
    onselect?: (item: T) => void;
  }

  let {
    items,
    renderItem,
    keyField = "id" as keyof T,
    emptyMessage = "No items found",
    onselect
  }: Props = $props();
</script>

{#if items.length === 0}
  <p class="empty">{emptyMessage}</p>
{:else}
  <ul>
    {#each items as item (item[keyField])}
      <li>
        <button onclick={() => onselect?.(item)}>
          {@render renderItem(item)}
        </button>
      </li>
    {/each}
  </ul>
{/if}
```

Usage — TypeScript infers `T` from the items you pass:

```svelte
<script lang="ts">
  import DataList from '$lib/components/DataList.svelte';

  interface User {
    id: number;
    name: string;
    email: string;
  }

  interface Product {
    id: string;
    name: string;
    price: number;
  }

  const users: User[] = [
    { id: 1, name: "Alice", email: "alice@example.com" },
    { id: 2, name: "Bob", email: "bob@example.com" }
  ];

  const products: Product[] = [
    { id: "p1", name: "Widget", price: 9.99 },
    { id: "p2", name: "Gadget", price: 19.99 }
  ];

  function handleUserSelect(user: User) {
    // user is typed as User — full autocompletion
    console.log(user.email);
  }

  function handleProductSelect(product: Product) {
    // product is typed as Product
    console.log(product.price);
  }
</script>

<!-- T is inferred as User -->
<DataList items={users} onselect={handleUserSelect}>
  {#snippet renderItem(user)}
    <span>{user.name} ({user.email})</span>
  {/snippet}
</DataList>

<!-- T is inferred as Product -->
<DataList items={products} onselect={handleProductSelect}>
  {#snippet renderItem(product)}
    <span>{product.name} — ${product.price}</span>
  {/snippet}
</DataList>
```

The generic constraint `T extends { id: number | string }` ensures every item has an `id` that can be used as a key. This is how you build truly reusable, type-safe component libraries.

## Typing Snippets and Children

Svelte 5 replaces slots with snippets. Here is how to type them:

```svelte
<!-- Basic children snippet -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();
</script>

<div class="wrapper">
  {@render children()}
</div>
```

Snippets can receive parameters, and you type those with a tuple:

```svelte
<!-- src/lib/components/Table.svelte -->
<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';

  interface Column<T> {
    key: keyof T;
    label: string;
    sortable?: boolean;
  }

  interface Props {
    data: T[];
    columns: Column<T>[];
    header?: Snippet<[Column<T>]>;      // Receives one Column<T>
    cell?: Snippet<[T, Column<T>]>;     // Receives a row and a column
    empty?: Snippet;                     // No parameters
  }

  let { data, columns, header, cell, empty }: Props = $props();
</script>

<table>
  <thead>
    <tr>
      {#each columns as col}
        <th>
          {#if header}
            {@render header(col)}
          {:else}
            {col.label}
          {/if}
        </th>
      {/each}
    </tr>
  </thead>
  <tbody>
    {#if data.length === 0}
      <tr>
        <td colspan={columns.length}>
          {#if empty}
            {@render empty()}
          {:else}
            No data available
          {/if}
        </td>
      </tr>
    {:else}
      {#each data as row}
        <tr>
          {#each columns as col}
            <td>
              {#if cell}
                {@render cell(row, col)}
              {:else}
                {String(row[col.key])}
              {/if}
            </td>
          {/each}
        </tr>
      {/each}
    {/if}
  </tbody>
</table>
```

## ComponentProps Utility Type

Extract the props type from an existing component — useful when wrapping components or building higher-order patterns:

```svelte
<script lang="ts">
  import type { ComponentProps } from 'svelte';
  import Button from '$lib/components/Button.svelte';
  import Card from '$lib/components/Card.svelte';

  // Extract the props type from Button
  type ButtonProps = ComponentProps<typeof Button>;

  // Now you can use ButtonProps as a type
  const defaultButtonProps: Partial<ButtonProps> = {
    variant: "primary",
    size: "md"
  };

  // Useful for wrapper components
  interface Props {
    buttonProps?: Partial<ButtonProps>;
    cardProps: ComponentProps<typeof Card>;
  }

  let { buttonProps = {}, cardProps }: Props = $props();
</script>

<Card {...cardProps}>
  <Button {...defaultButtonProps} {...buttonProps}>
    Click me
  </Button>
</Card>
```

This is particularly valuable when building component libraries or design systems where components compose other components.

## Typing Stores

While Svelte 5 favors `$state` and `$derived` over stores, you will still encounter stores in existing codebases and for cross-component state. Type them with generics:

```typescript
// src/lib/stores/auth.ts
import { writable, derived, type Writable, type Readable } from 'svelte/store';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

function createAuthStore() {
  const { subscribe, set, update }: Writable<AuthState> = writable({
    user: null,
    loading: false,
    error: null
  });

  return {
    subscribe,
    login: async (email: string, password: string) => {
      update(state => ({ ...state, loading: true, error: null }));
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
          headers: { 'Content-Type': 'application/json' }
        });
        const user: AuthUser = await response.json();
        set({ user, loading: false, error: null });
      } catch (e) {
        update(state => ({ ...state, loading: false, error: 'Login failed' }));
      }
    },
    logout: () => set({ user: null, loading: false, error: null })
  };
}

export const auth = createAuthStore();

// Derived store — typed automatically
export const isAuthenticated: Readable<boolean> = derived(
  auth,
  ($auth) => $auth.user !== null
);

export const userRole: Readable<string | null> = derived(
  auth,
  ($auth) => $auth.user?.role ?? null
);
```

## The $$Props Escape Hatch

Sometimes you need to accept any prop — for wrapper components, layout components, or components that forward everything to a child. The `$$Props` type is a built-in escape hatch:

```svelte
<!-- src/lib/components/ConditionalWrapper.svelte -->
<script lang="ts">
  import type { Snippet } from 'svelte';

  // Accept the known props plus allow anything else
  interface Props {
    condition: boolean;
    wrapper: typeof import('svelte').SvelteComponent;
    children: Snippet;
    [key: string]: unknown; // Allow arbitrary props to forward
  }

  let { condition, wrapper: Wrapper, children, ...rest }: Props = $props();
</script>

{#if condition}
  <Wrapper {...rest}>
    {@render children()}
  </Wrapper>
{:else}
  {@render children()}
{/if}
```

Use this sparingly. Explicit prop types are always better for type safety and IDE support. The escape hatch is for genuinely dynamic situations.

## TypeScript Strict Mode Considerations

SvelteKit projects default to strict mode in `tsconfig.json`. Here are the flags that matter most for Svelte development and what they catch:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

### strictNullChecks (included in strict)

Forces you to handle `null` and `undefined` explicitly:

```svelte
<script lang="ts">
  let user = $state<{ name: string } | null>(null);

  // Error with strictNullChecks: Object is possibly 'null'
  // let userName = user.name;

  // Correct: guard against null
  let userName = $derived(user?.name ?? "Anonymous");
</script>
```

### noUncheckedIndexedAccess

Array access and index signatures return `T | undefined` instead of `T`:

```typescript
const items = ["a", "b", "c"];

// With noUncheckedIndexedAccess:
const first = items[0]; // type is string | undefined

// You must check before using
if (first !== undefined) {
  console.log(first.toUpperCase()); // Safe
}

// Or use non-null assertion if you are certain
const definitelyFirst = items[0]!; // string — you take responsibility
```

This flag catches real bugs in production code — out-of-bounds array access is a common source of runtime errors.

### exactOptionalPropertyTypes

Distinguishes between "property is missing" and "property is explicitly undefined":

```typescript
interface Settings {
  theme?: "light" | "dark"; // Property can be missing
}

// With exactOptionalPropertyTypes:
const s1: Settings = {};                  // OK — theme is missing
const s2: Settings = { theme: "dark" };   // OK
const s3: Settings = { theme: undefined }; // Error — undefined is not "light" | "dark"
```

## Complete Example: Typed SvelteKit Page

Bringing everything together in a single, production-quality page:

```typescript
// src/routes/dashboard/+page.server.ts
import type { PageServerLoad, Actions } from './$types';
import { fail } from '@sveltejs/kit';

interface DashboardStats {
  totalPosts: number;
  totalViews: number;
  recentComments: number;
}

export const load: PageServerLoad = async ({ locals, fetch }) => {
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  const [statsRes, postsRes] = await Promise.all([
    fetch('/api/dashboard/stats'),
    fetch('/api/posts?author=' + locals.user.id)
  ]);

  const stats: DashboardStats = await statsRes.json();
  const posts = await postsRes.json();

  return {
    user: locals.user,
    stats,
    posts
  };
};

export const actions: Actions = {
  createPost: async ({ request, locals }) => {
    const data = await request.formData();
    const title = data.get('title') as string;
    const content = data.get('content') as string;

    if (!title || title.length < 3) {
      return fail(400, { error: 'Title must be at least 3 characters', title, content });
    }

    // Save post...
    return { success: true };
  }
};
```

```svelte
<!-- src/routes/dashboard/+page.svelte -->
<script lang="ts">
  import type { PageData, ActionData } from './$types';
  import StatCard from '$lib/components/StatCard.svelte';
  import PostList from '$lib/components/PostList.svelte';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let showCreateForm = $state(false);
</script>

<h1>Welcome, {data.user.name}</h1>

<div class="stats-grid">
  <StatCard label="Total Posts" value={data.stats.totalPosts} />
  <StatCard label="Total Views" value={data.stats.totalViews} />
  <StatCard label="Recent Comments" value={data.stats.recentComments} />
</div>

<PostList posts={data.posts} />

{#if showCreateForm}
  <form method="POST" action="?/createPost">
    <input name="title" value={form?.title ?? ""} placeholder="Post title" />
    {#if form?.error}
      <p class="error">{form.error}</p>
    {/if}
    <textarea name="content">{form?.content ?? ""}</textarea>
    <button type="submit">Create Post</button>
  </form>
{/if}
```

## Try It

1. Build a `SearchableList.svelte` generic component using `<script lang="ts" generics="T extends { id: number; name: string }">`. It should accept `items: T[]`, a `renderItem: Snippet<[T]>`, and an `onsearch` callback. Include a search input that filters items by name.

2. Create a typed context for a shopping cart: define `CartContext` with `items`, `addItem`, `removeItem`, and `total`. Use `setContext`/`getContext` with a Symbol key and typed helper functions. Wire it into a `+layout.svelte` and consume it from a product page.

3. Build a contact form page with `+page.server.ts` actions. Type the form validation with `Partial<Record<keyof FormData, string>>` for errors. Return `fail(400, { errors, values })` on validation failure. Display errors inline next to each field in the Svelte component.

## Key Takeaways

- Type `$props()` by destructuring with an interface: `let { name }: Props = $props()`
- Use `HTMLButtonAttributes` / `HTMLInputAttributes` to accept and forward standard HTML attributes with rest props
- Use `$state<T>()` generics when the initial value does not fully describe the type
- `$derived()` usually infers its type automatically from the expression
- Event handlers use standard DOM types — prefer `Event & { currentTarget: HTMLElement }` over `as` casts
- Type context with Symbol keys and helper functions for full type safety
- SvelteKit generates `PageServerLoad`, `PageLoad`, `Actions`, `PageData`, and `ActionData` types per route
- Generic components use `<script lang="ts" generics="T">` for reusable, type-safe patterns
- Snippets are typed with `Snippet` (no params) or `Snippet<[T]>` (with params)
- `ComponentProps<typeof Component>` extracts the props type from any component
- Enable `noUncheckedIndexedAccess` in `tsconfig.json` to catch out-of-bounds array access
- Share types across components via `src/lib/types.ts` and `import type`
