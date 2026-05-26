# Type Basics

JavaScript is a **dynamically typed** language — you can put a number in a variable and then change it to a string without any warning. That flexibility is great for small scripts, but in larger applications it leads to bugs that are hard to track down. TypeScript solves this by adding **type annotations** to your code, so mistakes are caught before your code ever runs.

TypeScript is not a separate language you need to learn from scratch. It is JavaScript with optional type hints. SvelteKit projects come with TypeScript support built in, and you have been using it since you chose TypeScript during project setup. In this lesson, you will learn the basics of type annotations, how they interact with Svelte 5, and the patterns that separate beginner TypeScript from production-grade TypeScript.

## Why TypeScript?

Here is the pitch in one sentence: **types are documentation that the compiler checks for you.**

Consider this JavaScript code:

```js
let price = 29.99;
price = "free"; // No error in JavaScript, but probably a bug!
```

With TypeScript, the second line produces an error at edit-time, before you even save the file. Your editor underlines the mistake in red and tells you exactly what went wrong.

But catching typos is the small win. The real payoff shows up in three places:

1. **Refactoring confidence.** When you rename a field from `userName` to `displayName`, TypeScript finds every file that references the old name. Without types, you grep and hope.
2. **Self-documenting code.** A function signature like `function calculateTax(price: number, rate: number): number` tells you everything you need to know without reading the body. Six months from now, your future self will thank you.
3. **Editor intelligence.** TypeScript powers autocomplete, inline documentation, and "go to definition." The better your types, the smarter your editor becomes.

The mental model is simple: TypeScript is a conversation between you and the compiler. You tell it what shape your data has, and it tells you every place where you violated that shape.

## Type Annotations

To add a type to a variable, use a colon after the variable name:

```typescript
let name: string = "Alice";
let age: number = 25;
let isStudent: boolean = true;
```

If you try to assign the wrong type, TypeScript flags it immediately:

```typescript
let score: number = 100;
score = "high"; // Error: Type 'string' is not assignable to type 'number'
```

## Basic Types

Here are the types you will use most often:

```typescript
// Primitives
let title: string = "Hello";
let count: number = 42;
let isActive: boolean = false;

// Arrays — two equivalent syntaxes
let tags: string[] = ["svelte", "typescript", "css"];
let scores: Array<number> = [98, 85, 92];

// Objects — inline shape
let user: { name: string; age: number } = {
  name: "Alice",
  age: 25
};

// null and undefined — explicit when a value might not exist
let selected: string | null = null;
```

Notice `string | null` — that vertical bar means "this value is either a string OR null." This is called a **union type**, and we will dig into it shortly. For now, just know that TypeScript forces you to handle both possibilities before using the value, which eliminates an entire category of "cannot read property of null" runtime errors.

## Type Inference — Let TypeScript Do the Work

TypeScript is smart. When you assign a value immediately, it figures out the type on its own:

```typescript
let name = "Alice";       // TypeScript infers: string
let age = 25;             // TypeScript infers: number
let active = true;        // TypeScript infers: boolean
let tags = ["a", "b"];    // TypeScript infers: string[]
```

This is called **type inference**, and it is one of TypeScript's best features. You write fewer annotations than you might expect because the compiler already knows. A good rule of thumb:

- **Let TypeScript infer** when the type is obvious from the assignment.
- **Annotate explicitly** when there is no immediate assignment, when the type is complex, or when you want to be precise about what a function accepts and returns.

```typescript
// No annotation needed — inference handles it
let count = 0;
let items = ["Apples", "Bananas"];

// Annotation helpful — no initial value
let username: string;

// Annotation helpful — function parameters (TypeScript can't infer these)
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

Over-annotating makes code noisy. Under-annotating leaves the compiler guessing. The sweet spot is: annotate function signatures and complex structures, let inference handle the rest.

## Interfaces vs Type Aliases

Once your objects get more complex, inline types become unwieldy. TypeScript gives you two ways to name a shape: **interfaces** and **type aliases**.

```typescript
// Interface — describes the shape of an object
interface User {
  id: number;
  name: string;
  email: string;
}

// Type alias — also describes a shape, plus more
type User = {
  id: number;
  name: string;
  email: string;
};
```

For simple object shapes, they are interchangeable. The differences matter at scale:

**Use interfaces when:**
- You are describing the shape of an object or class
- You want to extend or merge declarations (interfaces can be extended with `extends`)
- You are building a library where consumers might need to augment your types

```typescript
interface BaseEntity {
  id: number;
  createdAt: Date;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}
// User now has id, createdAt, name, and email
```

**Use type aliases when:**
- You need union types (this OR that)
- You need intersection types (this AND that)
- You are aliasing primitives or tuples

```typescript
type Status = "loading" | "success" | "error";
type Coordinate = [number, number];
type ApiResult = SuccessResponse | ErrorResponse;
```

A practical guideline: use `interface` for things (User, Product, Order) and `type` for concepts (Status, Theme, ApiResult).

## Union Types and Discriminated Unions

Union types model real-world data where a value can be one of several shapes. This comes up constantly in frontend work — think of a network request that might be loading, successful, or failed.

```typescript
type Status = "idle" | "loading" | "success" | "error";

let requestStatus: Status = "idle";
requestStatus = "loading"; // fine
requestStatus = "pending"; // Error: not assignable to type 'Status'
```

**Discriminated unions** take this further. They model data where the shape changes based on a tag field:

```typescript
type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; message: string };
```

The `status` field is the **discriminant** — TypeScript uses it to narrow the type:

```typescript
function renderState(state: ApiState) {
  switch (state.status) {
    case "idle":
      return "Ready to fetch";
    case "loading":
      return "Loading...";
    case "success":
      return `Found ${state.data.length} users`; // TypeScript knows .data exists here
    case "error":
      return `Error: ${state.message}`; // TypeScript knows .message exists here
  }
}
```

This pattern eliminates impossible states from your code. You cannot accidentally access `state.data` when the request is still loading — the compiler stops you. This is one of the most powerful patterns in TypeScript, and it maps perfectly to Svelte's `{#if}` blocks.

## TypeScript in Svelte Components

To enable TypeScript in a Svelte component, add `lang="ts"` to the `<script>` tag. In Svelte 5, you type your props using the `$props()` rune:

```svelte
<script lang="ts">
  interface Props {
    name: string;
    count?: number; // optional prop — defaults to undefined
    variant?: "primary" | "secondary";
  }

  let { name, count = 0, variant = "primary" }: Props = $props();

  let doubled = $derived(count * 2);

  function increment(): void {
    count += 1;
  }
</script>

<div class="card {variant}">
  <h2>Hello, {name}!</h2>
  <p>Count: {count} (doubled: {doubled})</p>
  <button onclick={increment}>Increment</button>
</div>
```

A few things to notice:

- **Props are typed with an interface** and destructured from `$props()`. The `?` marks optional props.
- **Default values** are assigned in the destructuring (`count = 0`).
- **Derived state** via `$derived()` automatically infers its type from the expression — no annotation needed.
- The function's `: void` return type says it does not return a value. TypeScript can infer this, but being explicit on public-facing functions makes intent clear.

### Typed State

State variables created with `$state()` also benefit from type inference:

```svelte
<script lang="ts">
  // TypeScript infers these from the initial values
  let query = $state("");
  let results = $state<string[]>([]); // generic syntax when inference needs help
  let selected = $state<User | null>(null); // explicitly nullable
</script>
```

When the initial value does not fully describe the type — an empty array or `null` — use the generic syntax `$state<Type>(initialValue)` to tell TypeScript what the state will eventually hold.

## Generics — Functions That Stay Flexible

Generics let you write functions and types that work with any data type while preserving type safety. Think of them as **type parameters** — the caller fills in the blank.

```typescript
// Without generics — you'd need separate functions for each type
function firstString(arr: string[]): string | undefined {
  return arr[0];
}
function firstNumber(arr: number[]): number | undefined {
  return arr[0];
}

// With generics — one function handles all types
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const name = first(["Alice", "Bob"]);   // TypeScript infers: string | undefined
const score = first([98, 85, 92]);      // TypeScript infers: number | undefined
```

The `<T>` is a placeholder that gets filled in when you call the function. You rarely need to specify it explicitly — TypeScript infers it from the arguments.

Generics shine in utility functions and data-fetching layers:

```typescript
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as T;
}

// The caller specifies what shape to expect
const users = await fetchJson<User[]>("/api/users");
// users is typed as User[] — full autocomplete and type checking
```

## Utility Types — The Ones You Will Actually Use

TypeScript ships with built-in utility types that transform existing types. Four of them cover the vast majority of real-world needs:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  avatar: string;
}

// Partial<T> — all properties become optional
// Perfect for update/patch operations
type UserUpdate = Partial<User>;
// { id?: number; name?: string; email?: string; avatar?: string }

// Pick<T, Keys> — select specific properties
// Great for component props that only need part of a model
type UserPreview = Pick<User, "name" | "avatar">;
// { name: string; avatar: string }

// Omit<T, Keys> — remove specific properties
// Useful for "everything except the id" (e.g., create operations)
type NewUser = Omit<User, "id">;
// { name: string; email: string; avatar: string }

// Record<K, V> — dictionary/map type
// When your keys are dynamic but the values have a known shape
type UserById = Record<string, User>;
// { [key: string]: User }
```

These compose together beautifully:

```typescript
// "An optional subset of User, excluding the id"
type UserPatch = Partial<Omit<User, "id">>;
```

## Real Example: Typed API Response in a Svelte Component

Here is a realistic pattern — fetching and displaying typed data in a Svelte 5 component:

```svelte
<script lang="ts">
  interface Product {
    id: number;
    name: string;
    price: number;
    inStock: boolean;
  }

  type FetchState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: Product[] }
    | { status: "error"; message: string };

  let state = $state<FetchState>({ status: "idle" });

  async function loadProducts() {
    state = { status: "loading" };
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Product[] = await res.json();
      state = { status: "success", data };
    } catch (err) {
      state = { status: "error", message: err instanceof Error ? err.message : "Unknown error" };
    }
  }
</script>

<button onclick={loadProducts} disabled={state.status === "loading"}>
  Load Products
</button>

{#if state.status === "loading"}
  <p>Loading...</p>
{:else if state.status === "success"}
  <ul>
    {#each state.data as product}
      <li>{product.name} — ${product.price}</li>
    {/each}
  </ul>
{:else if state.status === "error"}
  <p class="error">{state.message}</p>
{/if}
```

Notice how TypeScript and Svelte's template logic work together. Inside the `{:else if state.status === "success"}` block, TypeScript knows that `state.data` exists. Inside the error block, it knows `state.message` exists. The discriminated union makes impossible states impossible.

## Common TypeScript Mistakes in Svelte

### Reaching for `any`

When TypeScript complains and you do not know the fix, `any` is tempting. Resist it. Using `any` disables type checking for that value and every value it touches — it spreads like a virus through your code.

```typescript
// Bad — defeats the purpose of TypeScript
let data: any = await res.json();

// Better — type the expected shape
let data: Product[] = await res.json();

// Best — validate at runtime too (for untrusted external data)
const raw = await res.json();
const data = raw as Product[]; // assertion — you trust the source
```

### Overusing `as` (type assertions)

Type assertions (`as`) tell the compiler "trust me, I know better." Sometimes you do. But every `as` is a spot where the compiler cannot protect you.

```typescript
// Dangerous — if the API changes, this silently breaks
const user = data as User;

// Safer — let TypeScript verify through assignment
const user: User = data; // compiler checks the shape
```

Use `as` when you genuinely have more information than the compiler (e.g., DOM element types: `event.target as HTMLInputElement`). Avoid it when you are just silencing an error you do not understand — fix the underlying type instead.

### Forgetting to type event handlers

Svelte event handlers often trip people up. Type the event parameter explicitly:

```svelte
<script lang="ts">
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    console.log(target.value);
  }
</script>

<input oninput={handleInput} />
```

The `as HTMLInputElement` assertion is appropriate here because you know the event target is an input element — this is one of the valid uses of `as`.

## Try It

1. Create a `Product` interface with fields for `id` (number), `name` (string), `price` (number), and `category` (a union of `"electronics" | "clothing" | "food"`).
2. Write a function `formatProduct(product: Product): string` that returns a formatted string.
3. Create a discriminated union type for a shopping cart state with variants for `"empty"`, `"active"` (with items), and `"checkout"` (with items and a total).
4. Use `Pick` to create a `ProductCard` type that only has `name` and `price`.
5. Build a Svelte component that uses `$state<Product[]>([])` and renders the products in a list.

## Key Takeaways

- TypeScript adds **type safety** to JavaScript — types are documentation the compiler checks
- Use `let name: string` syntax to annotate variable types, but **let inference handle** the obvious cases
- **Interfaces** describe object shapes and support extension; **type aliases** handle unions, intersections, and complex compositions
- **Union types** model "this or that"; **discriminated unions** model state machines with impossible states eliminated
- In Svelte 5, type props with an interface and `$props()`, type state with `$state<Type>()` when inference needs help
- **Generics** (`<T>`) let you write flexible, reusable functions without sacrificing type safety
- **Utility types** (`Partial`, `Pick`, `Omit`, `Record`) transform existing types for common patterns
- Avoid `any` — it disables type checking. Use `as` sparingly and only when you genuinely know more than the compiler
