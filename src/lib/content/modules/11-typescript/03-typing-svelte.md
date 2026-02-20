# TypeScript in Svelte

Now that you understand TypeScript basics, interfaces, and type aliases, it is time to see how they integrate with Svelte 5's features. Typing your props, state, and event handlers makes your components self-documenting and catches bugs before they reach the browser.

Svelte 5 introduced new reactive primitives — `$props()`, `$state()`, and `$derived()` — and they all work seamlessly with TypeScript. This lesson shows you how to type each one and how to share types between components.

## Typing $props()

Components receive data through props. In Svelte 5, you destructure props from `$props()` and type them with an interface:

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

## Typing $state()

When you need typed reactive state, use the generic syntax `$state<T>()`:

```svelte
<script lang="ts">
  import type { BlogPost } from '$lib/types';

  // Simple types are inferred automatically
  let count = $state(0);              // inferred as number
  let name = $state("Alice");         // inferred as string

  // Use the generic when the initial value doesn't tell the full story
  let selectedPost = $state<BlogPost | null>(null);
  let items = $state<string[]>([]);

  function selectPost(post: BlogPost) {
    selectedPost = post;
  }

  function addItem(item: string) {
    items.push(item);
  }
</script>
```

The generic `<BlogPost | null>` tells TypeScript the state starts as `null` but will eventually hold a `BlogPost`. Without it, TypeScript would infer the type as just `null`.

## Typing $derived()

Derived values are usually inferred automatically, but you can be explicit when needed:

```svelte
<script lang="ts">
  let items = $state<string[]>(["apple", "banana", "cherry"]);
  let search = $state("");

  // Type is inferred as string[]
  let filtered = $derived(
    items.filter((item) => item.includes(search))
  );

  // Type is inferred as number
  let count = $derived(filtered.length);
</script>

<input bind:value={search} placeholder="Search..." />
<p>{count} results</p>
{#each filtered as item}
  <p>{item}</p>
{/each}
```

## Typing Event Handlers

HTML event handlers in Svelte receive standard DOM event types:

```svelte
<script lang="ts">
  let value = $state("");

  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    value = target.value;
  }

  function handleClick(event: MouseEvent) {
    console.log(`Clicked at (${event.clientX}, ${event.clientY})`);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    console.log("Form submitted with:", value);
  }
</script>

<form onsubmit={handleSubmit}>
  <input type="text" oninput={handleInput} value={value} />
  <button type="submit" onclick={handleClick}>Submit</button>
</form>
```

Common event types include `Event`, `MouseEvent`, `KeyboardEvent`, `SubmitEvent`, `FocusEvent`, and `InputEvent`.

## Importing Types Across Components

Define types once and share them across your entire application:

```typescript
// src/lib/types.ts
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[];
}

export interface PageData {
  title: string;
  description: string;
}
```

```svelte
<!-- src/lib/components/NavBar.svelte -->
<script lang="ts">
  import type { NavItem } from '$lib/types';

  interface Props {
    items: NavItem[];
    currentPath: string;
  }

  let { items, currentPath }: Props = $props();
</script>

<nav>
  {#each items as item}
    <a href={item.href} class:active={currentPath === item.href}>
      {item.label}
    </a>
  {/each}
</nav>
```

## Try It

Create a `UserCard.svelte` component with typed props (name, email, optional avatar URL). Use `$state<User | null>(null)` to track a selected user. Create a list of users and display the selected user's card when clicked. Make sure all props, state, and event handlers are fully typed.

## Key Takeaways

- Type `$props()` by destructuring with an interface: `let { name }: Props = $props()`
- Use `$state<T>()` generics when the initial value does not fully describe the type
- `$derived()` usually infers its type automatically from the expression
- Event handlers use standard DOM types: `MouseEvent`, `SubmitEvent`, `KeyboardEvent`
- Use `as HTMLInputElement` to narrow event target types
- Share types across components via `src/lib/types.ts` and `import type`
