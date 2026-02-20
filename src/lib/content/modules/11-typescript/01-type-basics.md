# Type Basics

JavaScript is a **dynamically typed** language — you can put a number in a variable and then change it to a string without any warning. That flexibility is great for small scripts, but in larger applications it leads to bugs that are hard to track down. TypeScript solves this by adding **type annotations** to your code, so mistakes are caught before your code ever runs.

TypeScript is not a separate language you need to learn from scratch. It is JavaScript with optional type hints. SvelteKit projects come with TypeScript support built in, and you have been using it since you chose TypeScript during project setup. In this lesson, you will learn the basics of type annotations and how to use them in your Svelte components.

## Why TypeScript?

Consider this JavaScript code:

```js
let price = 29.99;
price = "free"; // No error in JavaScript, but probably a bug!
```

With TypeScript, the second line would produce an error at edit-time, before you even save the file. Your editor underlines the mistake in red and tells you exactly what went wrong.

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

// Arrays
let tags: string[] = ["svelte", "typescript", "css"];
let scores: number[] = [98, 85, 92];

// Objects (we'll cover interfaces next lesson)
let user: { name: string; age: number } = {
  name: "Alice",
  age: 25
};
```

## Using TypeScript in Svelte

To enable TypeScript in a Svelte component, add `lang="ts"` to the `<script>` tag:

```svelte
<script lang="ts">
  let greeting: string = "Hello, Svelte!";
  let clickCount: number = 0;
  let items: string[] = ["Apples", "Bananas", "Cherries"];

  function increment(): void {
    clickCount += 1;
  }
</script>

<h1>{greeting}</h1>
<p>Clicked {clickCount} times</p>
<button onclick={increment}>Click me</button>

<ul>
  {#each items as item}
    <li>{item}</li>
  {/each}
</ul>
```

The `: void` on the function means it does not return a value. TypeScript can usually infer the return type, but being explicit makes your intent clear.

## Type Inference

TypeScript is smart. When you assign a value immediately, it can figure out the type on its own:

```typescript
let name = "Alice";       // TypeScript infers: string
let age = 25;             // TypeScript infers: number
let active = true;        // TypeScript infers: boolean
```

You do not need to annotate everything. Use explicit types when the value is not assigned right away, when the type is complex, or when you want to be extra clear about your intent.

## Try It

Open a `+page.svelte` file in your project and add `lang="ts"` to the script tag. Declare variables with type annotations for a string, a number, a boolean, and an array of strings. Try assigning a wrong type to one of them and observe the error your editor shows.

## Key Takeaways

- TypeScript adds **type safety** to JavaScript, catching bugs before runtime
- Use `let name: string` syntax to annotate variable types
- The basic types are `string`, `number`, `boolean`, and arrays like `string[]`
- Add `lang="ts"` to `<script>` tags in Svelte to enable TypeScript
- TypeScript can **infer** types from assigned values, so you do not need to annotate everything
- Functions can annotate parameter types and return types for clarity
