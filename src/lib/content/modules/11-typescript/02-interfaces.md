# Interfaces & Types

When your data gets more complex — a user object with a name, email, and avatar, or a blog post with a title, content, and tags — writing inline types becomes messy. TypeScript provides **interfaces** and **type aliases** to define reusable shapes for your data. Once defined, you can use them everywhere and TypeScript will make sure your data always matches the expected structure.

This lesson teaches you how to define, use, and organize custom types so your SvelteKit application stays reliable as it grows. We will go well beyond the basics: structural typing, discriminated unions for state machines, index signatures, mapped types, conditional types, template literal types, and complete typed data models for a real SvelteKit application.

## Structural Typing: How TypeScript Actually Checks Types

Before you write a single interface, you need to understand the foundational idea behind TypeScript's type system: **structural typing** (also called duck typing). TypeScript does not care about the *name* of a type. It cares about the *shape*. If an object has all the required properties with the correct types, it fits — regardless of what type it was declared as.

```typescript
interface Dog {
  name: string;
  breed: string;
}

interface Pet {
  name: string;
  breed: string;
}

let myDog: Dog = { name: "Rex", breed: "Labrador" };
let myPet: Pet = myDog; // No error — same shape
```

This is fundamentally different from nominal typing (used in Java, C#, Kotlin) where `Dog` and `Pet` would be incompatible types even if they have identical fields. In TypeScript, structure is all that matters.

This has a practical consequence: excess property checking. TypeScript *does* warn you when you pass an object literal directly with extra properties, but it does *not* warn when the object comes from a variable:

```typescript
interface UserProps {
  name: string;
  email: string;
}

// Direct object literal — TypeScript catches extra properties
const user: UserProps = {
  name: "Alice",
  email: "alice@example.com",
  age: 28 // Error: Object literal may only specify known properties
};

// Through a variable — no error, because structural typing allows subtypes
const fullUser = { name: "Alice", email: "alice@example.com", age: 28 };
const userProps: UserProps = fullUser; // No error — fullUser has the required shape
```

This behavior is intentional. The excess property check on object literals catches typos (like writing `colour` instead of `color`), while the relaxed check on variables allows polymorphism.

## Defining Interfaces

An interface describes the shape of an object — what properties it has and what types those properties are:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  age: number;
}

let currentUser: User = {
  id: 1,
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
  // Error: Property 'id' is missing in type '{ name: string; email: string; }'
  // Error: Property 'age' is missing
};
```

## Type Aliases

A **type alias** uses the `type` keyword and works similarly for object shapes:

```typescript
type BlogPost = {
  title: string;
  content: string;
  published: boolean;
  tags: string[];
};
```

Type aliases can also define union types, tuple types, and other patterns that interfaces cannot:

```typescript
type Status = "draft" | "published" | "archived";
type ID = string | number;
type Pair = [string, number];
type Callback = (value: string) => void;
```

## Interface vs Type: The Complete Comparison

Both work for defining object shapes, but they have real differences that matter in production codebases.

### Declaration merging (interfaces only)

Interfaces with the same name in the same scope automatically merge their declarations. This is useful for extending third-party types:

```typescript
// From a library's type definitions
interface Window {
  title: string;
}

// Your code — merges with the existing Window interface
interface Window {
  analytics: {
    track: (event: string) => void;
  };
}

// Now Window has both 'title' and 'analytics'
```

Type aliases cannot be reopened. Declaring the same type alias twice is a compile error:

```typescript
type Config = { debug: boolean };
type Config = { verbose: boolean }; // Error: Duplicate identifier 'Config'
```

### Extending vs Intersection

Interfaces extend other interfaces with the `extends` keyword. Type aliases combine with the `&` (intersection) operator:

```typescript
// Interface extension
interface Animal {
  name: string;
  species: string;
}

interface Pet extends Animal {
  owner: string;
  vaccinated: boolean;
}

// Type intersection
type Animal2 = {
  name: string;
  species: string;
};

type Pet2 = Animal2 & {
  owner: string;
  vaccinated: boolean;
};
```

Both produce the same shape. However, interface `extends` gives you better error messages when there are conflicts. If you extend an interface with an incompatible property, TypeScript catches it immediately. With intersection types, conflicting properties silently become `never`:

```typescript
interface Base {
  id: string;
}

// Clear error: Types of property 'id' are incompatible
interface Child extends Base {
  id: number; // Error!
}

// No error — but id is now 'string & number', which is 'never'
type BaseType = { id: string };
type ChildType = BaseType & { id: number }; // id: never — silent bug
```

### When to use which

Use **interface** when:
- Defining object shapes (component props, API responses, data models)
- You want declaration merging (augmenting third-party types)
- You are building a library where consumers may need to extend your types

Use **type** when:
- Defining union types (`type Status = "active" | "inactive"`)
- Defining tuple types (`type Coordinate = [number, number]`)
- Creating mapped or conditional types
- Defining function signatures (`type Handler = (e: Event) => void`)
- Naming primitive type aliases (`type UserID = string`)

In practice, a good rule: default to `interface` for objects, `type` for everything else.

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

When you access an optional property, TypeScript knows it could be `undefined`. You must handle that:

```typescript
function getDescription(product: Product): string {
  // product.description is string | undefined
  return product.description ?? "No description available";
}
```

## Readonly Properties

Mark properties that should never be reassigned after creation:

```typescript
interface Config {
  readonly apiUrl: string;
  readonly apiKey: string;
  debug: boolean; // This one can be changed
}

const config: Config = {
  apiUrl: "https://api.example.com",
  apiKey: "abc123",
  debug: false
};

config.debug = true;        // OK
config.apiUrl = "new-url";  // Error: Cannot assign to 'apiUrl' because it is a read-only property
```

For deeply immutable objects, use the `Readonly<T>` utility type, which makes *all* properties readonly:

```typescript
const frozenConfig: Readonly<Config> = {
  apiUrl: "https://api.example.com",
  apiKey: "abc123",
  debug: false
};

frozenConfig.debug = true; // Error — everything is readonly now
```

## Extending Interfaces

Interfaces can extend one or more other interfaces, building up complex types from simpler ones:

```typescript
interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

interface SoftDeletable {
  deletedAt: string | null;
}

interface BaseEntity {
  id: number;
}

// Extend multiple interfaces
interface User extends BaseEntity, Timestamped, SoftDeletable {
  name: string;
  email: string;
  role: "admin" | "user";
}

// User now has: id, createdAt, updatedAt, deletedAt, name, email, role
```

This pattern is extremely common in production applications. You define base traits (`Timestamped`, `SoftDeletable`, `BaseEntity`) once and compose them into every model. When you add a new field to `Timestamped`, every entity that extends it automatically gets the change.

## Typing Arrays of Objects

Combine interfaces with arrays to type collections of data:

```typescript
interface NavItem {
  label: string;
  href: string;
  icon?: string;
  children?: NavItem[]; // Recursive type — NavItem can contain NavItems
}

const navigation: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "About", href: "/about" },
  {
    label: "Blog",
    href: "/blog",
    icon: "pencil",
    children: [
      { label: "Latest", href: "/blog/latest" },
      { label: "Archive", href: "/blog/archive" }
    ]
  }
];
```

This pattern is incredibly common in SvelteKit — you will use it for navigation menus, card grids, table rows, and any list of structured data. Notice the recursive `children` property: a `NavItem` can contain more `NavItem`s, enabling nested menus.

## Discriminated Unions for State Machines

One of TypeScript's most powerful patterns is the **discriminated union** — a union type where each member has a shared property (the "discriminant") that TypeScript can use to narrow the type. This is the correct way to model states in your application.

```typescript
// A network request can be in one of four states
type RequestState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

// TypeScript narrows the type based on the discriminant
function renderRequest<T>(state: RequestState<T>): string {
  switch (state.status) {
    case "idle":
      return "Ready to load";
    case "loading":
      return "Loading...";
    case "success":
      return `Got data: ${JSON.stringify(state.data)}`; // TypeScript knows 'data' exists here
    case "error":
      return `Error: ${state.error}`; // TypeScript knows 'error' exists here
  }
}
```

The `status` field is the discriminant. When you check `state.status === "success"`, TypeScript knows the state *must* be `{ status: "success"; data: T }`, so it allows access to `state.data`. This is exhaustive: if you add a new status variant and forget to handle it in the switch, TypeScript will warn you (if you enable `noImplicitReturns`).

Use discriminated unions in SvelteKit for:

```svelte
<script lang="ts">
  type FormState =
    | { status: "idle" }
    | { status: "submitting" }
    | { status: "success"; message: string }
    | { status: "error"; errors: Record<string, string> };

  let formState = $state<FormState>({ status: "idle" });

  async function handleSubmit() {
    formState = { status: "submitting" };

    try {
      const result = await submitForm();
      formState = { status: "success", message: result.message };
    } catch (e) {
      formState = { status: "error", errors: { form: "Submission failed" } };
    }
  }
</script>

{#if formState.status === "idle"}
  <button onclick={handleSubmit}>Submit</button>
{:else if formState.status === "submitting"}
  <p>Submitting...</p>
{:else if formState.status === "success"}
  <p class="text-green-600">{formState.message}</p>
{:else if formState.status === "error"}
  <p class="text-red-600">{formState.errors.form}</p>
{/if}
```

This is far safer than the common anti-pattern of tracking `isLoading`, `isError`, `data`, and `error` as separate booleans and nullable values. With the discriminated union, impossible states are unrepresentable: you cannot have `status: "loading"` and `data` at the same time.

## Index Signatures

When you don't know property names ahead of time, use index signatures:

```typescript
// A dictionary of string keys to string values
interface TranslationDictionary {
  [key: string]: string;
}

const translations: TranslationDictionary = {
  greeting: "Hello",
  farewell: "Goodbye",
  thanks: "Thank you"
};

// Combining known properties with an index signature
interface ApiResponse {
  status: number;
  message: string;
  [key: string]: unknown; // Allow additional properties
}
```

The `Record<K, V>` utility type is often cleaner than index signatures:

```typescript
// These are equivalent:
interface StringMap {
  [key: string]: string;
}

type StringMap2 = Record<string, string>;

// Record with a union key type — only allows specific keys
type ThemeColors = Record<"primary" | "secondary" | "accent", string>;

const colors: ThemeColors = {
  primary: "#ff3e00",
  secondary: "#676778",
  accent: "#6c5ce7"
};
```

## Mapped Types

Mapped types transform every property of an existing type. TypeScript includes several built-in mapped types, and you can create your own:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  role: "admin" | "user";
}

// Built-in utility types (these ARE mapped types under the hood)
type PartialUser = Partial<User>;        // All properties optional
type RequiredUser = Required<User>;      // All properties required
type ReadonlyUser = Readonly<User>;      // All properties readonly
type UserPreview = Pick<User, "id" | "name">;  // Only id and name
type UserUpdate = Omit<User, "id">;      // Everything except id

// Custom mapped type: make all properties nullable
type Nullable<T> = {
  [K in keyof T]: T[K] | null;
};

type NullableUser = Nullable<User>;
// { id: number | null; name: string | null; email: string | null; role: "admin" | "user" | null }
```

These are extraordinarily useful in SvelteKit. Consider a form where every field starts empty:

```typescript
interface CreatePostForm {
  title: string;
  content: string;
  tags: string[];
  published: boolean;
}

// Form state where everything is optional (user fills in fields over time)
type PostFormDraft = Partial<CreatePostForm>;

// API update endpoint — you only send the fields that changed
type UpdatePostPayload = Partial<Omit<CreatePostForm, "published">>;
```

## Conditional Types

Conditional types select one of two types based on a condition. They follow the pattern `T extends U ? X : Y`:

```typescript
// Extract the return type of a function
type ReturnOf<T> = T extends (...args: any[]) => infer R ? R : never;

type StringFn = () => string;
type NumberFn = (x: number) => number;

type A = ReturnOf<StringFn>; // string
type B = ReturnOf<NumberFn>; // number

// Practical example: extract the resolved type from a Promise
type Awaited<T> = T extends Promise<infer U> ? U : T;

type C = Awaited<Promise<string>>;  // string
type D = Awaited<string>;           // string (not a promise, returns as-is)
```

A real-world SvelteKit pattern — extract the data type from a load function:

```typescript
// If your load function returns { posts: Post[] }, extract that type
type LoadData<T extends (...args: any[]) => Promise<any>> =
  T extends (...args: any[]) => Promise<infer R> ? R : never;
```

TypeScript's built-in utility types like `ReturnType<T>`, `Parameters<T>`, and `Awaited<T>` are all conditional types under the hood. You rarely need to write your own, but understanding the concept helps you read library type definitions.

## Template Literal Types

TypeScript can construct types from string templates, which is remarkably powerful for defining CSS-like APIs and event names:

```typescript
type Color = "red" | "blue" | "green";
type Shade = "light" | "dark";

// Produces: "light-red" | "light-blue" | "light-green" | "dark-red" | "dark-blue" | "dark-green"
type ColorVariant = `${Shade}-${Color}`;

// Event handler names
type DomEvent = "click" | "focus" | "blur" | "input";
type EventHandler = `on${Capitalize<DomEvent>}`;
// "onClick" | "onFocus" | "onBlur" | "onInput"

// CSS custom properties
type ThemeToken = "primary" | "secondary" | "accent";
type CSSVar = `--color-${ThemeToken}`;
// "--color-primary" | "--color-secondary" | "--color-accent"
```

A practical pattern for a design system:

```typescript
type Size = "xs" | "sm" | "md" | "lg" | "xl";
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

// Generate all possible class names
type ButtonClass = `btn-${ButtonVariant}-${Size}`;

// Use in a component
function getButtonClass(variant: ButtonVariant, size: Size): ButtonClass {
  return `btn-${variant}-${size}`;
}
```

## Typing API Responses

Real applications talk to APIs. Type your responses to catch data shape issues early:

```typescript
// Generic paginated API response
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
  };
}

// Specific API responses
interface ApiUser {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

interface ApiPost {
  id: number;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  author: ApiUser;
  tags: string[];
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

// Usage in a SvelteKit load function
type PostListResponse = PaginatedResponse<ApiPost>;
type UserListResponse = PaginatedResponse<ApiUser>;
```

When the API uses snake_case but your frontend uses camelCase, create both types and a transformer:

```typescript
// API shape (snake_case from the server)
interface ApiUser {
  id: number;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  created_at: string;
}

// App shape (camelCase for your components)
interface User {
  id: number;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  createdAt: Date;
}

// Type-safe transformer
function toUser(api: ApiUser): User {
  return {
    id: api.id,
    firstName: api.first_name,
    lastName: api.last_name,
    avatarUrl: api.avatar_url,
    createdAt: new Date(api.created_at)
  };
}
```

## Complete Typed Data Model for a SvelteKit App

Here is a complete, production-quality type system for a blog application. This is the kind of `types.ts` file you would find in a real SvelteKit project:

```typescript
// src/lib/types.ts

// ─── Base Traits ───────────────────────────────────────────────
export interface BaseEntity {
  id: number;
}

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletable {
  deletedAt: string | null;
}

// ─── User ──────────────────────────────────────────────────────
export type UserRole = "admin" | "editor" | "author" | "reader";

export interface User extends BaseEntity, Timestamped {
  name: string;
  email: string;
  avatarUrl: string | null;
  role: UserRole;
  bio?: string;
}

export type UserPreview = Pick<User, "id" | "name" | "avatarUrl">;
export type CreateUserPayload = Omit<User, "id" | "createdAt" | "updatedAt">;
export type UpdateUserPayload = Partial<Omit<User, "id" | "createdAt" | "updatedAt">>;

// ─── Blog Post ─────────────────────────────────────────────────
export type PostStatus = "draft" | "published" | "archived";

export interface Post extends BaseEntity, Timestamped, SoftDeletable {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  coverImageUrl: string | null;
  status: PostStatus;
  author: UserPreview;
  tags: Tag[];
  publishedAt: string | null;
  readingTimeMinutes: number;
}

export type PostPreview = Pick<Post, "id" | "title" | "slug" | "excerpt" | "coverImageUrl" | "author" | "publishedAt" | "readingTimeMinutes" | "tags">;
export type CreatePostPayload = Pick<Post, "title" | "content" | "excerpt" | "status" | "tags"> & {
  coverImage?: File;
};

// ─── Tag ───────────────────────────────────────────────────────
export interface Tag extends BaseEntity {
  name: string;
  slug: string;
  postCount: number;
}

// ─── Comment ───────────────────────────────────────────────────
export interface Comment extends BaseEntity, Timestamped {
  postId: number;
  author: UserPreview;
  content: string;
  parentId: number | null; // null = top-level, number = reply
  children?: Comment[];    // Recursive for nested threads
}

// ─── API Response Wrappers ─────────────────────────────────────
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string[]>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginatedData<T> {
  items: T[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

// ─── App State Types ───────────────────────────────────────────
export type Theme = "light" | "dark" | "system";

export interface AppSettings {
  theme: Theme;
  sidebarCollapsed: boolean;
  postsPerPage: 10 | 25 | 50;
}

// ─── Navigation ────────────────────────────────────────────────
export interface NavItem {
  label: string;
  href: string;
  icon?: string;
  badge?: number;
  children?: NavItem[];
}
```

Then use these types across your SvelteKit application:

```svelte
<!-- src/routes/blog/+page.svelte -->
<script lang="ts">
  import type { PostPreview, PaginatedData } from '$lib/types';

  let { data } = $props();
  const posts: PaginatedData<PostPreview> = data.posts;
</script>

{#each posts.items as post}
  <article>
    <h2><a href="/blog/{post.slug}">{post.title}</a></h2>
    <p>{post.excerpt}</p>
    <span>{post.readingTimeMinutes} min read</span>
  </article>
{/each}
```

## Organizing Types in SvelteKit

For small projects, a single `src/lib/types.ts` file works well. As your project grows, split types by domain:

```
src/lib/types/
  index.ts        # Re-exports everything
  user.ts         # User, UserRole, UserPreview
  post.ts         # Post, PostStatus, PostPreview
  api.ts          # ApiResponse, PaginatedData, ApiError
  navigation.ts   # NavItem, Breadcrumb
```

The `index.ts` re-exports for a clean import path:

```typescript
// src/lib/types/index.ts
export * from './user';
export * from './post';
export * from './api';
export * from './navigation';
```

```svelte
<!-- Components import from the barrel file -->
<script lang="ts">
  import type { User, PostPreview, NavItem } from '$lib/types';
</script>
```

Always use `import type` when importing only type information. This tells the bundler the import can be erased completely — no runtime code is included:

```typescript
// Good — erased at build time
import type { User } from '$lib/types';

// Also good — mixed import
import { formatDate, type User } from '$lib/utils';
```

## Try It

1. Create a `src/lib/types.ts` file with a complete data model for a project portfolio: `Project` (id, title, description, url, tags, status, createdAt), `NavItem` (label, href, optional icon, optional children), and a `RequestState<T>` discriminated union (idle, loading, success with data, error with message).

2. Import these types into a `+page.svelte` file. Create a `$state<RequestState<Project[]>>` that starts as `{ status: "idle" }` and use the discriminated union to conditionally render loading, error, and success states.

3. Create an `ApiResponse<T>` type that wraps either `{ ok: true; data: T }` or `{ ok: false; error: string }`. Write a typed `fetchProjects` function that returns `Promise<ApiResponse<Project[]>>`.

## Key Takeaways

- TypeScript uses **structural typing** — types are compatible if their shapes match, regardless of name
- **Interfaces** define reusable shapes and support declaration merging and `extends`
- **Type aliases** are best for unions, tuples, primitives, mapped types, and conditional types
- Use `?` for optional properties and `readonly` for immutable properties
- **Discriminated unions** model state machines safely — impossible states become unrepresentable
- **Index signatures** and `Record<K, V>` type objects with dynamic keys
- **Mapped types** (`Partial`, `Pick`, `Omit`, `Readonly`) transform existing types
- **Conditional types** select types based on conditions — most built-in utilities use them
- **Template literal types** construct string types from templates
- Organize types in `src/lib/types.ts` (or a `types/` directory) and import with `import type`
- Type your API responses early — it catches data shape mismatches before they reach production
