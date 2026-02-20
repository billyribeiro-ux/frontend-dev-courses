# Interfaces & Types

When your data gets more complex — a user object with a name, email, and avatar, or a blog post with a title, content, and tags — writing inline types becomes messy. TypeScript provides **interfaces** and **type aliases** to define reusable shapes for your data. Once defined, you can use them everywhere and TypeScript will make sure your data always matches the expected structure.

This lesson teaches you how to define, use, and organize custom types so your SvelteKit application stays reliable as it grows.

## Defining Interfaces

An interface describes the shape of an object — what properties it has and what types those properties are:

```typescript
interface User {
  name: string;
  email: string;
  age: number;
}

let currentUser: User = {
  name: "Alice",
  email: "alice@example.com",
  age: 28
};
```

If you forget a property or use the wrong type, TypeScript catches it:

```typescript
let badUser: User = {
  name: "Bob",
  email: "bob@example.com"
  // Error: Property 'age' is missing
};
```

## Type Aliases

A **type alias** uses the `type` keyword and works similarly:

```typescript
type BlogPost = {
  title: string;
  content: string;
  published: boolean;
  tags: string[];
};
```

Type aliases can also define union types and other patterns that interfaces cannot:

```typescript
type Status = "draft" | "published" | "archived";
type ID = string | number;
```

## Optional Properties

Not every property is always present. Mark optional properties with `?`:

```typescript
interface Product {
  name: string;
  price: number;
  description?: string;   // Optional — may or may not exist
  imageUrl?: string;       // Optional
}

// Both are valid:
let basic: Product = { name: "Widget", price: 9.99 };
let detailed: Product = {
  name: "Gadget",
  price: 19.99,
  description: "A fancy gadget",
  imageUrl: "/images/gadget.jpg"
};
```

## Typing Arrays of Objects

Combine interfaces with arrays to type collections of data:

```typescript
interface NavItem {
  label: string;
  href: string;
  icon?: string;
}

const navigation: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog", icon: "pencil" }
];
```

This pattern is incredibly common in SvelteKit — you will use it for navigation menus, card grids, table rows, and any list of structured data.

## Interface vs Type: When to Use Which

Both work for defining object shapes. Here is a simple guideline:

```typescript
// Use INTERFACE for object shapes (components, props, API responses)
interface CardProps {
  title: string;
  description: string;
  imageUrl?: string;
}

// Use TYPE for unions, primitives, and computed types
type Theme = "light" | "dark";
type Size = "sm" | "md" | "lg";
type ButtonVariant = "primary" | "secondary" | "ghost";
```

Use **interface** when you are describing the shape of an object or component props. Use **type** when you need unions, intersections, or non-object types.

## Organizing Types in SvelteKit

Put shared types in `src/lib/types.ts` so any component can import them:

```typescript
// src/lib/types.ts
export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export interface BlogPost {
  slug: string;
  title: string;
  content: string;
  author: User;
  publishedAt: string;
}
```

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  import type { BlogPost } from '$lib/types';

  let { data } = $props();
  const posts: BlogPost[] = data.posts;
</script>
```

## Try It

Create a `src/lib/types.ts` file with interfaces for a `Project` (title, description, url, tags array) and a `NavItem` (label, href, optional icon). Import and use them in a `+page.svelte` file to render a list of projects.

## Key Takeaways

- **Interfaces** define reusable shapes for objects and component props
- **Type aliases** are best for unions, primitives, and computed types
- Use `?` to mark optional properties that may or may not exist
- Type arrays of objects with `InterfaceName[]` syntax
- Store shared types in `src/lib/types.ts` and import them with `$lib`
- Use `import type` when importing only type information
