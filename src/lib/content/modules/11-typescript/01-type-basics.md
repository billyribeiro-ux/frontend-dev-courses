# Type Basics

JavaScript is a **dynamically typed** language — you can put a number in a variable and then change it to a string without any warning. That flexibility is great for small scripts, but in larger applications it leads to bugs that are hard to track down. TypeScript solves this by adding **type annotations** to your code, so mistakes are caught before your code ever runs.

TypeScript is not a separate language you need to learn from scratch. It is JavaScript with optional type hints. SvelteKit projects come with TypeScript support built in, and you have been using it since you chose TypeScript during project setup. In this lesson, you will learn the basics of type annotations, how they interact with Svelte 5, and the patterns that separate beginner TypeScript from production-grade TypeScript.

## Why TypeScript?

Here is the pitch in one sentence: **types are documentation that the compiler checks for you.**

```js
let price = 29.99;
price = "free"; // No error in JavaScript, but probably a bug!
```

With TypeScript, the second line produces an error at edit-time, before you even save the file. But catching typos is the small win. The real payoff shows up in five places:

1. **Refactoring confidence.** When you rename a field from `userName` to `displayName`, TypeScript finds every file that references the old name. Without types, you grep and hope.
2. **Self-documenting code.** A function signature like `function calculateTax(price: number, rate: number): number` tells you everything you need to know without reading the body. Six months from now, you (or a teammate) will thank you.
3. **Editor intelligence.** TypeScript powers autocomplete, inline documentation, and "go to definition." The better your types, the smarter your editor becomes.
4. **Impossible state prevention.** With discriminated unions (covered below), you can make certain kinds of bugs literally impossible to write. The compiler rejects code that tries to access data in an invalid state.
5. **Onboarding acceleration.** New team members can navigate a typed codebase without asking "what shape does this object have?" — the types answer that question everywhere.

The mental model is simple: TypeScript is a conversation between you and the compiler. You tell it what shape your data has, and it tells you every place where you violated that shape.

### What TypeScript Is NOT

TypeScript does not run in the browser. It is a development tool. The TypeScript compiler (`tsc`) or your bundler (Vite, in SvelteKit's case) strips all type annotations during build, producing plain JavaScript. This means:

- Types have **zero runtime cost** — no performance impact whatsoever
- Types cannot enforce constraints at runtime (a user can still send `"abc"` to an API endpoint that expects a number)
- Types are a **compile-time contract**, not a runtime guard

This distinction matters. TypeScript protects you from your own mistakes and your team's mistakes. It does not protect you from external data. For that, you need runtime validation (Zod, Valibot, or manual checks), which we cover in a later lesson.

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

// Tuples — fixed-length arrays with specific types per position
let coordinate: [number, number] = [40.7128, -74.0060];
let entry: [string, number] = ["Alice", 100];

// Objects — inline shape
let user: { name: string; age: number } = { name: "Alice", age: 25 };

// Nullable — explicit when a value might not exist
let selected: string | null = null;

// Undefined vs null — TypeScript distinguishes them
let pending: string | undefined;  // declared but not yet assigned
let cleared: string | null = null; // explicitly empty
```

If you try to assign the wrong type, TypeScript flags it immediately:

```typescript
let score: number = 100;
score = "high"; // Error: Type 'string' is not assignable to type 'number'
```

Notice `string | null` — that vertical bar means "this value is either a string OR null." This is called a **union type**, and we will dig into it shortly. TypeScript forces you to handle both possibilities before using the value, which eliminates an entire category of "cannot read property of null" runtime errors.

### The `any`, `unknown`, and `never` Types

These three special types often confuse beginners, but each has a clear purpose:

```typescript
// any — disables type checking entirely. THE ESCAPE HATCH.
let dangerous: any = "hello";
dangerous = 42;
dangerous.nonExistentMethod(); // No error! TypeScript trusts you completely.
// AVOID any. It defeats the purpose of TypeScript.

// unknown — the safe version of "I don't know what this is"
let mystery: unknown = getExternalData();
// mystery.toUpperCase();  // Error! Must narrow the type first
if (typeof mystery === "string") {
  mystery.toUpperCase(); // OK — TypeScript knows it's a string here
}

// never — represents values that never occur
function throwError(message: string): never {
  throw new Error(message); // This function never returns
}

function exhaustiveCheck(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
```

The key insight: `any` says "I don't care about types here" and `unknown` says "I don't know the type yet, but I'll check before using it." In production code, `unknown` is almost always what you want when dealing with external data.

## Type Inference — Let TypeScript Do the Work

TypeScript is smart. When you assign a value immediately, it figures out the type on its own:

```typescript
let name = "Alice";       // TypeScript infers: string
let age = 25;             // TypeScript infers: number
let tags = ["a", "b"];    // TypeScript infers: string[]

// Inference works with complex expressions too
let doubled = [1, 2, 3].map(n => n * 2);  // infers: number[]
let first = ["a", "b", "c"][0];           // infers: string
let parsed = parseInt("42");               // infers: number
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

### How Deep Does Inference Go?

TypeScript's inference engine is remarkably sophisticated. It can infer return types from function bodies, narrow types through control flow, and even infer generic type parameters:

```typescript
// Return type inference — no annotation needed
function createUser(name: string, age: number) {
  return { name, age, createdAt: new Date() };
}
// Inferred return type: { name: string; age: number; createdAt: Date }

// Control flow narrowing
function processValue(value: string | number) {
  if (typeof value === "string") {
    // TypeScript knows value is string here
    return value.toUpperCase();
  }
  // TypeScript knows value is number here
  return value.toFixed(2);
}

// Array method inference
const numbers = [1, 2, 3, 4, 5];
const evens = numbers.filter(n => n % 2 === 0);  // infers: number[]
const strings = numbers.map(n => String(n));       // infers: string[]
const sum = numbers.reduce((acc, n) => acc + n, 0); // infers: number
```

The lesson here: TypeScript is much smarter than most developers give it credit for. Before adding a type annotation, check if inference already has it right. Your editor will show the inferred type when you hover over a variable.

## Interfaces vs Type Aliases

Once your objects get complex, inline types become unwieldy. TypeScript gives you two ways to name a shape:

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

### Interfaces: Extension and Declaration Merging

**Use interfaces** for objects you might extend, and when consumers might need to augment your types:

```typescript
// Extension — building on existing shapes
interface BaseEntity {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

interface User extends BaseEntity {
  name: string;
  email: string;
}

interface Admin extends User {
  permissions: string[];
  department: string;
}
// Admin has: id, createdAt, updatedAt, name, email, permissions, department

// Multiple extension
interface Auditable {
  lastModifiedBy: string;
}

interface AuditedUser extends User, Auditable {
  // Has everything from User + Auditable
}

// Declaration merging — interfaces with the same name combine automatically
interface Window {
  myCustomProperty: string;
}
// This merges with the built-in Window interface, adding your property
// This is ONLY possible with interfaces, not type aliases
```

Declaration merging is a powerful feature for library authors — it lets consumers extend your types without modifying your code. In application code, it is less common but occasionally useful for extending built-in types like `Window` or `Document`.

### Type Aliases: Unions, Intersections, and Composition

**Use type aliases** for unions, intersections, primitives, tuples, and computed types:

```typescript
// Union types — only possible with type aliases
type Status = "loading" | "success" | "error";
type Theme = "light" | "dark" | "system";
type Coordinate = [number, number];
type StringOrNumber = string | number;

// Intersection types — combining shapes
type WithTimestamps = {
  createdAt: Date;
  updatedAt: Date;
};

type User = {
  id: number;
  name: string;
  email: string;
};

type TimestampedUser = User & WithTimestamps;
// Has all properties from both types

// Conditional types — type-level logic (advanced)
type ApiResult<T> = T extends Error ? { success: false; error: T } : { success: true; data: T };

// Mapped types — transforming existing types
type Readonly<T> = { readonly [K in keyof T]: T[K] };
type Optional<T> = { [K in keyof T]?: T[K] };
```

**A practical guideline:** use `interface` for things (User, Product, Order, Settings) and `type` for concepts (Status, Theme, ApiResult, EventHandler). If you are unsure, use `type` — it can do everything `interface` can plus more.

### The Intersection vs Extension Mental Model

Extension (`extends`) creates a strict hierarchy: Admin IS a User. If `User` changes, `Admin` changes too.

Intersection (`&`) combines shapes: `TimestampedUser` has the properties of both types, but neither type "owns" the other. They remain independent.

```typescript
// WRONG way to think about it:
// "Intersection = AND, Union = OR"

// CORRECT way to think about it:
// Intersection = an object that satisfies BOTH types
// Union = a value that satisfies EITHER type

type A = { name: string };
type B = { age: number };

type Both = A & B;    // Must have BOTH name AND age
type Either = A | B;  // Must have name OR age (or both)

let both: Both = { name: "Alice", age: 25 };  // OK
let either: Either = { name: "Alice" };         // OK — satisfies A
```

## Union Types and Discriminated Unions

Union types model real-world data where a value can be one of several shapes. This comes up constantly in frontend work:

```typescript
type Status = "idle" | "loading" | "success" | "error";
let requestStatus: Status = "idle";
requestStatus = "pending"; // Error: '"pending"' is not assignable to type 'Status'
```

### String Literal Unions: The Simplest Pattern

String literal unions replace enums in most TypeScript code. They are simpler, do not generate runtime JavaScript, and work naturally with equality checks:

```typescript
type Direction = "north" | "south" | "east" | "west";
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type Size = "sm" | "md" | "lg" | "xl";
type Priority = "low" | "medium" | "high" | "urgent";

function handleDirection(dir: Direction) {
  // TypeScript provides autocomplete for all four values
  // and errors on any value not in the union
}
```

### Discriminated Unions: The Most Powerful TypeScript Pattern

**Discriminated unions** take this further by modeling data where the shape changes based on a tag field. This is, in my experience, the single most important TypeScript pattern for frontend development. It eliminates impossible states at compile time.

```typescript
// The discriminant field is "status" — each variant has a unique value for it
type ApiState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T; fetchedAt: Date }
  | { status: "error"; message: string; code: number; retryable: boolean };

function renderState(state: ApiState<User[]>) {
  switch (state.status) {
    case "idle":
      return "Click to load";
    case "loading":
      return "Loading...";
    case "success":
      // TypeScript KNOWS state.data exists here — it narrows the type
      return `Found ${state.data.length} users (fetched at ${state.fetchedAt})`;
    case "error":
      // TypeScript KNOWS state.message, state.code, and state.retryable exist here
      return `Error ${state.code}: ${state.message}`;
  }
}
```

Why is this so powerful? Consider the alternative — separate boolean flags:

```typescript
// WRONG: Boolean flags create impossible states
interface ApiState {
  isLoading: boolean;
  isError: boolean;
  data: User[] | null;
  errorMessage: string | null;
}
// Can isLoading AND isError both be true? What does that mean?
// Can data be non-null when isError is true? Is that stale data or a bug?
// These questions have no answer in the type system.

// CORRECT: Discriminated union makes impossible states impossible
type ApiState =
  | { status: "loading" }
  | { status: "success"; data: User[] }
  | { status: "error"; message: string };
// Each state has EXACTLY the data it needs. Nothing more, nothing less.
```

### Discriminated Unions as State Machines

Discriminated unions naturally model state machines. Here is a real-world example — a multi-step form:

```typescript
type CheckoutState =
  | { step: "cart"; items: CartItem[] }
  | { step: "shipping"; items: CartItem[]; address: Address }
  | { step: "payment"; items: CartItem[]; address: Address; paymentMethod: PaymentMethod }
  | { step: "confirmation"; orderId: string; total: number }
  | { step: "error"; message: string; previousStep: "cart" | "shipping" | "payment" };

function getNextAction(state: CheckoutState): string {
  switch (state.step) {
    case "cart":
      return state.items.length > 0 ? "Proceed to Shipping" : "Add items";
    case "shipping":
      return "Proceed to Payment";
    case "payment":
      return `Pay with ${state.paymentMethod.type}`;
    case "confirmation":
      return `Order #${state.orderId} confirmed!`;
    case "error":
      return `Error: ${state.message}. Go back to ${state.previousStep}`;
  }
}
```

Each step has exactly the data it needs. You cannot access `paymentMethod` in the cart step. You cannot access `items` in the confirmation step. The type system enforces the flow.

### Exhaustive Checking with `never`

One of the most useful patterns with discriminated unions is exhaustive checking — ensuring you handle every variant:

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rectangle"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rectangle":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
    default: {
      // This line ensures ALL variants are handled
      const _exhaustive: never = shape;
      throw new Error(`Unknown shape: ${_exhaustive}`);
    }
  }
}
// If you add a new shape variant later, TypeScript will error HERE,
// telling you that the new variant is not assignable to `never`.
```

This is invaluable in production. When you add a new status, payment method, or notification type months later, the compiler points you to every switch statement that needs updating. No runtime surprises.

## TypeScript in Svelte Components

Add `lang="ts"` to the `<script>` tag. In Svelte 5, type your props using the `$props()` rune:

```svelte
<script lang="ts">
  interface Props {
    name: string;
    count?: number;                          // optional prop
    variant?: "primary" | "secondary";       // union for constrained values
    items?: string[];                        // optional array
    onAction?: (id: string) => void;         // optional callback
    children?: import('svelte').Snippet;     // optional children snippet
  }

  let {
    name,
    count = 0,
    variant = "primary",
    items = [],
    onAction,
    children
  }: Props = $props();

  let doubled = $derived(count * 2);

  function increment(): void {
    count += 1;
  }

  function handleClick(id: string): void {
    onAction?.(id);  // optional chaining — only call if onAction exists
  }
</script>

<div class="card {variant}">
  <h2>Hello, {name}!</h2>
  <p>Count: {count} (doubled: {doubled})</p>
  <button onclick={increment}>Increment</button>

  {#if items.length > 0}
    <ul>
      {#each items as item}
        <li>{item}</li>
      {/each}
    </ul>
  {/if}

  {#if children}
    {@render children()}
  {/if}
</div>
```

A few things to notice:

- **Props are typed with an interface** and destructured from `$props()`. The `?` marks optional props.
- **Default values** are assigned in the destructuring (`count = 0`).
- **Derived state** via `$derived()` automatically infers its type — no annotation needed.
- **Callback props** use function types: `(id: string) => void`.
- **Optional chaining** (`onAction?.(id)`) safely calls the function only if it was passed.

### Typing Props with Generics

For reusable components that work with any data type, use generic props:

```svelte
<script lang="ts" generics="T extends { id: string | number }">
  interface Props {
    items: T[];
    selected?: T | null;
    onSelect?: (item: T) => void;
    labelFn: (item: T) => string;
  }

  let { items, selected = null, onSelect, labelFn }: Props = $props();
</script>

{#each items as item (item.id)}
  <button
    class:selected={selected?.id === item.id}
    onclick={() => onSelect?.(item)}
  >
    {labelFn(item)}
  </button>
{/each}
```

The `generics` attribute on the script tag declares type parameters. The constraint `T extends { id: string | number }` ensures that whatever type `T` is, it must have an `id` property. The component caller gets full type safety:

```svelte
<script lang="ts">
  import SelectList from './SelectList.svelte';

  interface Product {
    id: number;
    name: string;
    price: number;
  }

  let products: Product[] = [
    { id: 1, name: "Widget", price: 9.99 },
    { id: 2, name: "Gadget", price: 19.99 }
  ];

  let selected = $state<Product | null>(null);
</script>

<!-- TypeScript infers T = Product from the items prop -->
<SelectList
  items={products}
  {selected}
  onSelect={(product) => selected = product}
  labelFn={(p) => `${p.name} — $${p.price}`}
/>
<!-- p is typed as Product — full autocomplete! -->
```

### Typed State

State variables created with `$state()` benefit from inference too, but sometimes need help:

```svelte
<script lang="ts">
  let query = $state("");                        // inferred as string
  let count = $state(0);                         // inferred as number
  let active = $state(true);                     // inferred as boolean
  let results = $state<string[]>([]);            // generic syntax — empty array needs it
  let selected = $state<User | null>(null);      // explicitly nullable
  let formData = $state<Partial<User>>({});      // partial object
  let items = $state<Map<string, Product>>(new Map()); // complex collections
</script>
```

When the initial value does not fully describe the type — an empty array, `null`, or an empty object — use the generic syntax `$state<Type>(value)` to tell TypeScript what the state will eventually hold. Without it, `$state([])` infers as `never[]`, which rejects every `.push()` call.

## Generics — Functions That Stay Flexible

Generics let you write functions that work with any data type while preserving type safety. Think of them as **type parameters** — the caller fills in the blank:

```typescript
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

const name = first(["Alice", "Bob"]);   // inferred: string | undefined
const score = first([98, 85, 92]);      // inferred: number | undefined
```

The `<T>` is a placeholder filled in when you call the function. You rarely specify it explicitly — TypeScript infers it from the arguments.

### Generic Constraints

Constrain generics when you need to access specific properties:

```typescript
// Without constraint — can only use methods available on all types
function getLength<T>(value: T): number {
  // return value.length;  // Error! T might not have .length
  return 0;
}

// With constraint — T must have a .length property
function getLength<T extends { length: number }>(value: T): number {
  return value.length;  // OK! TypeScript knows T has .length
}

getLength("hello");       // OK — string has .length
getLength([1, 2, 3]);     // OK — array has .length
getLength(42);            // Error! number doesn't have .length

// Constraint using keyof — ensure key exists on the object
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}

const user = { name: "Alice", age: 25 };
const name = getProperty(user, "name");   // inferred: string
const age = getProperty(user, "age");     // inferred: number
// getProperty(user, "email");            // Error! "email" is not a key of user
```

### Generics in Data-Fetching Layers

Generics shine in data-fetching utilities:

```typescript
// Type-safe API client
async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as T;
}

const users = await fetchJson<User[]>("/api/users");
// users is typed as User[] — full autocomplete and type checking

// More sophisticated: generic with error handling
type Result<T, E = Error> =
  | { ok: true; data: T }
  | { ok: false; error: E };

async function safeFetch<T>(url: string): Promise<Result<T>> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return { ok: false, error: new Error(`HTTP ${response.status}`) };
    }
    const data: T = await response.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

const result = await safeFetch<User[]>("/api/users");
if (result.ok) {
  console.log(result.data);  // TypeScript knows this is User[]
} else {
  console.error(result.error); // TypeScript knows this is Error
}
```

## Utility Types — The Ones You Will Actually Use

TypeScript ships with built-in types that transform existing types. Here are the ones you will reach for weekly:

```typescript
interface User {
  id: number;
  name: string;
  email: string;
  avatar: string;
  role: "admin" | "editor" | "viewer";
}
```

### Partial, Required, Readonly

```typescript
// Partial<T> — all properties become optional
type UserUpdate = Partial<User>;
// { id?: number; name?: string; email?: string; avatar?: string; role?: ... }
// Perfect for PATCH/update operations where you only send changed fields

// Required<T> — all properties become required (removes ?)
interface Config {
  theme?: string;
  fontSize?: number;
  language?: string;
}
type FullConfig = Required<Config>;
// { theme: string; fontSize: number; language: string }
// Perfect for ensuring all config values are set after merging with defaults

// Readonly<T> — all properties become readonly
type FrozenUser = Readonly<User>;
// Cannot reassign any property — useful for immutable data patterns
const user: FrozenUser = { id: 1, name: "Alice", email: "a@b.com", avatar: "", role: "admin" };
// user.name = "Bob";  // Error! Cannot assign to 'name' because it is a read-only property
```

### Pick, Omit

```typescript
// Pick<T, Keys> — select specific properties
type UserPreview = Pick<User, "name" | "avatar">;
// { name: string; avatar: string }
// Great for component props that only need part of a model

// Omit<T, Keys> — remove specific properties
type NewUser = Omit<User, "id">;
// { name: string; email: string; avatar: string; role: ... }
// Useful for create operations ("everything except the auto-generated id")

// They compose together:
type UserPatch = Partial<Omit<User, "id">>;
// Optional fields, no id — perfect for update forms
```

### Record

```typescript
// Record<K, V> — create an object type with specific key and value types
type UserById = Record<string, User>;
// { [key: string]: User }

type RolePermissions = Record<User["role"], string[]>;
// { admin: string[]; editor: string[]; viewer: string[] }

// Practical: tracking loading states per ID
type LoadingStates = Record<string, "idle" | "loading" | "done" | "error">;
let states: LoadingStates = {
  "user-1": "loading",
  "user-2": "done"
};
```

### ReturnType, Awaited, Parameters

```typescript
// ReturnType<T> — extract the return type of a function
function createUser(name: string, email: string) {
  return { id: crypto.randomUUID(), name, email, createdAt: new Date() };
}
type CreatedUser = ReturnType<typeof createUser>;
// { id: string; name: string; email: string; createdAt: Date }
// Useful when you don't control the function definition

// Awaited<T> — unwrap a Promise type
type UserPromise = Promise<User[]>;
type ResolvedUsers = Awaited<UserPromise>;  // User[]
// Essential for typing data from async functions

// Parameters<T> — extract the parameter types as a tuple
type CreateUserParams = Parameters<typeof createUser>;  // [string, string]
// Useful for wrapping or decorating existing functions

// Extract / Exclude — filter union types
type AllStatuses = "idle" | "loading" | "success" | "error";
type ActiveStatuses = Exclude<AllStatuses, "idle">;   // "loading" | "success" | "error"
type SuccessStates = Extract<AllStatuses, "success" | "error">; // "success" | "error"
```

### NonNullable

```typescript
// NonNullable<T> — removes null and undefined from a type
type MaybeUser = User | null | undefined;
type DefiniteUser = NonNullable<MaybeUser>;  // User
// Useful after filtering out null values from arrays:
const users: (User | null)[] = [user1, null, user2, null, user3];
const validUsers: User[] = users.filter((u): u is User => u !== null);
```

## The `satisfies` Operator

The `satisfies` operator (TypeScript 4.9+) validates that an expression matches a type without changing the inferred type. This gives you both validation and precise inference:

```typescript
// Without satisfies — type is widened
const palette: Record<string, string | string[]> = {
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  gradient: ["#000", "#fff"]
};
palette.red.toUpperCase();  // Error! TypeScript thinks it could be string[]

// With satisfies — validated but type stays precise
const palette = {
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  gradient: ["#000", "#fff"]
} satisfies Record<string, string | string[]>;

palette.red.toUpperCase();  // OK! TypeScript knows red is a string
palette.gradient.map(g => g.toUpperCase()); // OK! TypeScript knows gradient is string[]
```

Common use case in Svelte — validating config objects:

```typescript
type Routes = Record<string, { label: string; icon: string }>;

const routes = {
  "/": { label: "Home", icon: "house" },
  "/about": { label: "About", icon: "info" },
  "/contact": { label: "Contact", icon: "mail" }
} satisfies Routes;

// routes["/"].label is string (precise), but TypeScript verified the shape matches Routes
```

## Const Assertions

The `as const` assertion tells TypeScript to infer the narrowest possible type — literal types instead of general types, readonly arrays instead of mutable ones:

```typescript
// Without as const
const colors = ["red", "green", "blue"];
// Type: string[]

// With as const
const colors = ["red", "green", "blue"] as const;
// Type: readonly ["red", "green", "blue"]
// Each element is a literal type, not just string

// Deriving a union type from a const array
type Color = typeof colors[number]; // "red" | "green" | "blue"

// Config objects with as const
const config = {
  api: "https://api.example.com",
  timeout: 5000,
  retries: 3
} as const;
// Type: { readonly api: "https://api.example.com"; readonly timeout: 5000; readonly retries: 3 }

// Without as const, the types would be string and number
```

This is incredibly useful for deriving union types from arrays, creating config objects with literal types, and ensuring objects are not accidentally mutated.

## Typing API Responses

In real applications, data comes from APIs, and typing that boundary is critical:

```typescript
// Define the expected shape of API responses
interface ApiResponse<T> {
  data: T;
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

interface ApiError {
  message: string;
  code: string;
  details?: Record<string, string[]>;
}

// In a SvelteKit load function
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
  const response = await fetch('/api/products');

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message);
  }

  const result: ApiResponse<Product[]> = await response.json();

  return {
    products: result.data,
    pagination: result.pagination
  };
};
```

**Important caveat:** `response.json()` returns `any` by default. The type assertion `const result: ApiResponse<Product[]> = await response.json()` tells TypeScript what you expect, but does NOT validate at runtime. If the API returns something different, you will get a runtime error, not a compile error. For critical API boundaries, use a validation library like Zod:

```typescript
import { z } from 'zod';

const ProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  price: z.number().positive(),
  category: z.enum(["electronics", "clothing", "food"])
});

type Product = z.infer<typeof ProductSchema>; // Derive type from schema

const data = await response.json();
const products = z.array(ProductSchema).parse(data);
// Now products is BOTH typed AND runtime-validated
```

## Real Example: Typed API Response in a Svelte Component

Here is a realistic pattern that ties everything together — discriminated unions, typed state, generics, and template narrowing:

```svelte
<script lang="ts">
  interface Product {
    id: number;
    name: string;
    price: number;
    inStock: boolean;
    category: "electronics" | "clothing" | "food";
  }

  type FetchState<T> =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "success"; data: T; fetchedAt: Date }
    | { status: "error"; message: string; retryCount: number };

  let state = $state<FetchState<Product[]>>({ status: "idle" });
  let filter = $state<Product["category"] | "all">("all");

  let filteredProducts = $derived(
    state.status === "success"
      ? filter === "all"
        ? state.data
        : state.data.filter(p => p.category === filter)
      : []
  );

  async function loadProducts() {
    state = { status: "loading" };
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Product[] = await res.json();
      state = { status: "success", data, fetchedAt: new Date() };
    } catch (err) {
      const retryCount = state.status === "error" ? state.status === "error" ? 1 : 0 : 0;
      state = {
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
        retryCount
      };
    }
  }
</script>

<button onclick={loadProducts} disabled={state.status === "loading"}>
  {state.status === "loading" ? "Loading..." : "Load Products"}
</button>

{#if state.status === "success"}
  <p>Fetched at {state.fetchedAt.toLocaleTimeString()}</p>

  <select bind:value={filter}>
    <option value="all">All</option>
    <option value="electronics">Electronics</option>
    <option value="clothing">Clothing</option>
    <option value="food">Food</option>
  </select>

  <ul>
    {#each filteredProducts as product (product.id)}
      <li>
        {product.name} — ${product.price.toFixed(2)}
        {#if !product.inStock}
          <span class="out-of-stock">(Out of Stock)</span>
        {/if}
      </li>
    {/each}
  </ul>
{:else if state.status === "error"}
  <p class="error">{state.message}</p>
  <button onclick={loadProducts}>
    Retry (attempt {state.retryCount + 1})
  </button>
{:else if state.status === "loading"}
  <p>Loading products...</p>
{/if}
```

Inside the `{:else if state.status === "success"}` block, TypeScript knows `state.data` and `state.fetchedAt` exist. Inside the error block, it knows `state.message` and `state.retryCount` exist. The discriminated union makes impossible states impossible — in the template, in the component logic, everywhere.

## Common TypeScript Mistakes in Svelte

### Mistake 1: Reaching for `any`

When TypeScript complains and you do not know the fix, `any` is tempting. Resist it — `any` disables type checking for that value and every value it touches, spreading like a virus through your code:

```typescript
// WRONG: any infects everything it touches
let data: any = await res.json();
let name = data.user.name;     // No type checking — data is any, so name is any
let upper = name.toUpperCase(); // No error even if name is actually a number

// CORRECT: type the expected shape
interface ApiResponse { user: { name: string } }
let data: ApiResponse = await res.json();
let name = data.user.name;     // string — full type checking
```

If you truly do not know the type, use `unknown` instead of `any`. It forces you to narrow before using the value.

### Mistake 2: Overusing `as` (Type Assertions)

Type assertions tell the compiler "trust me, I know better." Every `as` is a spot where the compiler cannot protect you:

```typescript
// WRONG: silencing an error you don't understand
const data = fetchSomething() as User; // What if it's not actually a User?

// CORRECT: let type inference work, or narrow properly
const data = fetchSomething();
if (isUser(data)) {
  // data is User here — safely narrowed
}

// ACCEPTABLE: DOM element types (the classic valid case)
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  console.log(target.value);
}
```

### Mistake 3: Not Typing Event Handlers

Svelte event handlers often trip people up:

```svelte
<script lang="ts">
  // WRONG: untyped event
  function handleInput(event) {
    console.log(event.target.value); // TypeScript can't verify .value exists
  }

  // CORRECT: typed event with target assertion
  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    console.log(event.currentTarget.value); // Type-safe!
  }

  // ALSO CORRECT: using the Event type and asserting target
  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
  }
</script>

<input oninput={handleInput} />
<form onsubmit={handleSubmit}>...</form>
```

### Mistake 4: Forgetting That $state([]) Infers as never[]

```svelte
<script lang="ts">
  // WRONG: items is never[] — you can't push anything to it
  let items = $state([]);
  items.push("hello"); // Error: Argument of type 'string' is not assignable to parameter of type 'never'

  // CORRECT: explicitly type the array contents
  let items = $state<string[]>([]);
  items.push("hello"); // OK
</script>
```

### Mistake 5: Over-Annotating Obvious Types

```typescript
// WRONG: noisy and redundant
const name: string = "Alice";
const count: number = 42;
const active: boolean = true;
const items: string[] = ["a", "b", "c"];

// CORRECT: let inference work
const name = "Alice";
const count = 42;
const active = true;
const items = ["a", "b", "c"];

// DO annotate when inference can't help:
let name: string;              // no initial value
let items: Product[] = [];     // empty array
let selected: User | null = null; // nullable
function greet(name: string): string { ... } // function signatures
```

## Try It

1. Create a `Product` interface with fields for `id` (number), `name` (string), `price` (number), `inStock` (boolean), and `category` (a union of `"electronics" | "clothing" | "food"`).
2. Write a function `formatProduct(product: Product): string` that returns a formatted string including price with 2 decimal places and stock status.
3. Create a discriminated union type `CartState` for a shopping cart with variants for `"empty"`, `"active"` (with items array and itemCount), `"checkout"` (with items, total, and shippingAddress), and `"confirmed"` (with orderId and estimatedDelivery as a Date).
4. Write a function `describeCart(state: CartState): string` that uses a switch with exhaustive checking (the `never` trick) to describe each state.
5. Use `Pick` to create a `ProductCard` type that only has `name`, `price`, and `inStock`.
6. Use `Partial<Omit<Product, "id">>` to create an `UpdateProduct` type for patch operations.
7. Build a Svelte component that uses `$state<Product[]>([])`, renders the products in a list with category filtering, and uses `$derived` to compute the total price and in-stock count.
8. Add a `satisfies` check to ensure your filter options array matches the Product category union.

## Key Takeaways

- TypeScript adds **type safety** to JavaScript — types are documentation the compiler checks, with zero runtime cost
- Use `let name: string` syntax to annotate variable types, but **let inference handle** the obvious cases — over-annotating is as bad as under-annotating
- **Interfaces** describe object shapes, support extension and declaration merging; **type aliases** handle unions, intersections, tuples, and complex compositions
- **Discriminated unions** are the most powerful TypeScript pattern — they model state machines, eliminate impossible states, and integrate perfectly with Svelte's `{#if}` blocks
- Use exhaustive checking with `never` to ensure every variant is handled — the compiler will error when you add new variants
- In Svelte 5, type props with an interface and `$props()`, type state with `$state<Type>()` when inference needs help, use `generics` attribute for reusable generic components
- **Generics** (`<T>`) let you write flexible, reusable functions without sacrificing type safety — add constraints with `extends` when you need to access specific properties
- **Utility types** (`Partial`, `Pick`, `Omit`, `Record`, `ReturnType`, `Awaited`, `NonNullable`) transform existing types — learn to compose them for complex patterns
- The `satisfies` operator validates a value matches a type without widening its inferred type — use it for config objects and constant declarations
- `as const` creates literal types and readonly structures — use it to derive union types from arrays and create immutable configs
- Avoid `any` (use `unknown` instead), minimize `as` assertions, always type event handlers, and remember that `$state([])` needs a generic type parameter
