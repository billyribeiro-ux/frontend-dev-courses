# Type Basics

JavaScript is a **dynamically typed** language — you can put a number in a variable and then change it to a string without any warning. That flexibility is great for small scripts, but in larger applications it leads to bugs that are hard to track down. TypeScript solves this by adding **type annotations** to your code, so mistakes are caught before your code ever runs.

TypeScript is not a separate language you need to learn from scratch. It is JavaScript with optional type hints. SvelteKit projects come with TypeScript support built in, and you have been using it since you chose TypeScript during project setup. In this lesson, you will learn the basics of type annotations, how they interact with Svelte 5, and the patterns that separate beginner TypeScript from production-grade TypeScript.

## Why TypeScript?

Here is the pitch in one sentence: **types are documentation that the compiler checks for you.**

```js
let price = 29.99;
price = "free"; // No error in JavaScript, but probably a bug!
```

With TypeScript, the second line produces an error at edit-time, before you even save the file. But catching typos is the small win. The real payoff shows up in three places:

1. **Refactoring confidence.** When you rename a field from `userName` to `displayName`, TypeScript finds every file that references the old name. Without types, you grep and hope.
2. **Self-documenting code.** A function signature like `function calculateTax(price: number, rate: number): number` tells you everything you need to know without reading the body.
3. **Editor intelligence.** TypeScript powers autocomplete, inline documentation, and "go to definition." The better your types, the smarter your editor becomes.

The mental model is simple: TypeScript is a conversation between you and the compiler. You tell it what shape your data has, and it tells you every place where you violated that shape.

## Type Annotations and Basic Types

To add a type, use a colon after the variable name:

```typescript
// Primitives
let title: string = "Hello";
let count: number = 42;
let isActive: boolean = false;

// Arrays — two equivalent syntaxes
let tags: string[] = ["svelte", "typescript", "css"];
let scores: Array<number> = [98, 85, 92];

// Objects — inline shape
let user: { name: string; age: number } = { name: "Alice", age: 25 };

// Nullable — explicit when a value might not exist
let selected: string | null = null;
```

If you try to assign the wrong type, TypeScript flags it immediately:

```typescript
let score: number = 100;
score = "high"; // Error: Type 'string' is not assignable to type 'number'
```

Notice `string | null` — that vertical bar means "this value is either a string OR null." This is called a **union type**, and we will dig into it shortly. TypeScript forces you to handle both possibilities before using the value, which eliminates an entire category of "cannot read property of null" runtime errors.

## Type Inference — Let TypeScript Do the Work

TypeScript is smart. When you assign a value immediately, it figures out the type on its own:

```typescript
let name = "Alice";       // TypeScript infers: string
let age = 25;             // TypeScript infers: number
let tags = ["a", "b"];    // TypeScript infers: string[]
```

This is called **type inference**, and it is one of TypeScript's best features. You write fewer annotations than you might expect. A good rule of thumb:

- **Let TypeScript infer** when the type is obvious from the assignment.
- **Annotate explicitly** when there is no immediate assignment, when the type is complex, or when you want to be precise about what a function accepts and returns.

```typescript
let count = 0;                         // inference handles it
let username: string;                  // no initial value — annotate
function greet(name: string): string { // parameters always need annotations
  return `Hello, ${name}!`;
}
```

Over-annotating makes code noisy. Under-annotating leaves the compiler guessing. The sweet spot: annotate function signatures and complex structures, let inference handle the rest.

## Interfaces vs Type Aliases

Once your objects get complex, inline types become unwieldy. TypeScript gives you two ways to name a shape:

```typescript
// Interface — describes the shape of an object
interface User { id: number; name: string; email: string }

// Type alias — also describes a shape, plus more
type User = { id: number; name: string; email: string };
```

For simple object shapes, they are interchangeable. The differences matter at scale:

**Use interfaces** for objects you might extend, and when consumers might need to augment your types:

```typescript
interface BaseEntity { id: number; createdAt: Date }
interface User extends BaseEntity { name: string; email: string }
// User now has id, createdAt, name, and email
```

**Use type aliases** for unions, intersections, and primitive aliases:

```typescript
type Status = "loading" | "success" | "error";
type Coordinate = [number, number];
type ApiResult = SuccessResponse | ErrorResponse;
```

A practical guideline: use `interface` for things (User, Product, Order) and `type` for concepts (Status, Theme, ApiResult).

## Union Types and Discriminated Unions

Union types model real-world data where a value can be one of several shapes. This comes up constantly in frontend work:

```typescript
type Status = "idle" | "loading" | "success" | "error";
let requestStatus: Status = "idle";
requestStatus = "pending"; // Error: not assignable to type 'Status'
```

**Discriminated unions** take this further by modeling data where the shape changes based on a tag field:

```typescript
type ApiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; message: string };

function renderState(state: ApiState) {
  switch (state.status) {
    case "success":
      return `Found ${state.data.length} users`; // TS knows .data exists here
    case "error":
      return `Error: ${state.message}`;          // TS knows .message exists here
  }
}
```

This pattern eliminates impossible states. You cannot accidentally access `state.data` when the request is still loading — the compiler stops you. It maps perfectly to Svelte's `{#if}` blocks.

## TypeScript in Svelte Components

Add `lang="ts"` to the `<script>` tag. In Svelte 5, type your props using the `$props()` rune:

```svelte
<script lang="ts">
  interface Props {
    name: string;
    count?: number;                    // optional prop
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
- **Derived state** via `$derived()` automatically infers its type — no annotation needed.

### Typed State

State variables created with `$state()` benefit from inference too, but sometimes need help:

```svelte
<script lang="ts">
  let query = $state("");                        // inferred as string
  let results = $state<string[]>([]);            // generic syntax — empty array needs it
  let selected = $state<User | null>(null);      // explicitly nullable
</script>
```

When the initial value does not fully describe the type — an empty array or `null` — use the generic syntax `$state<Type>(value)` to tell TypeScript what the state will eventually hold.

## Generics — Functions That Stay Flexible

Generics let you write functions that work with any data type while preserving type safety. Think of them as **type parameters** — the caller fills in the blank:

```typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const name = first(["Alice", "Bob"]);   // inferred: string | undefined
const score = first([98, 85, 92]);      // inferred: number | undefined
```

The `<T>` is a placeholder filled in when you call the function. You rarely specify it explicitly — TypeScript infers it from the arguments. Generics shine in data-fetching layers:

```typescript
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as T;
}

const users = await fetchJson<User[]>("/api/users");
// users is typed as User[] — full autocomplete and type checking
```

## Utility Types — The Ones You Will Actually Use

TypeScript ships with built-in types that transform existing types. Four cover most real-world needs:

```typescript
interface User { id: number; name: string; email: string; avatar: string }

type UserUpdate = Partial<User>;            // all properties become optional
type UserPreview = Pick<User, "name" | "avatar">;  // only name and avatar
type NewUser = Omit<User, "id">;            // everything except id
type UserById = Record<string, User>;       // dictionary/map type

// They compose together:
type UserPatch = Partial<Omit<User, "id">>; // optional fields, no id
```

- **`Partial<T>`** — perfect for update/patch operations
- **`Pick<T, Keys>`** — great for component props that only need part of a model
- **`Omit<T, Keys>`** — useful for create operations ("everything except the id")
- **`Record<K, V>`** — when your keys are dynamic but values have a known shape

## Real Example: Typed API Response in a Svelte Component

Here is a realistic pattern that ties everything together — discriminated unions, typed state, and template narrowing:

```svelte
<script lang="ts">
  interface Product { id: number; name: string; price: number; inStock: boolean }

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
      state = {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error"
      };
    }
  }
</script>

<button onclick={loadProducts} disabled={state.status === "loading"}>Load Products</button>

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

Inside the `{:else if state.status === "success"}` block, TypeScript knows `state.data` exists. Inside the error block, it knows `state.message` exists. The discriminated union makes impossible states impossible.

## Common TypeScript Mistakes in Svelte

**Reaching for `any`.** When TypeScript complains and you do not know the fix, `any` is tempting. Resist it — `any` disables type checking for that value and every value it touches, spreading like a virus through your code. Always type the expected shape: `let data: Product[] = await res.json()`.

**Overusing `as` (type assertions).** Type assertions tell the compiler "trust me, I know better." Every `as` is a spot where the compiler cannot protect you. Use `as` only when you genuinely have more information than the compiler — DOM element types are the classic valid case (`event.target as HTMLInputElement`). Avoid `as` when you are just silencing an error you do not understand — fix the underlying type instead.

**Forgetting to type event handlers.** Svelte event handlers often trip people up. Type the event parameter and assert the target:

```svelte
<script lang="ts">
  function handleInput(event: Event) {
    const target = event.target as HTMLInputElement;
    console.log(target.value);
  }
</script>
<input oninput={handleInput} />
```

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
