# Variables & $state()

Up until now, everything on your page has been static — the same text, the same styles, nothing changes. It is time to change that. **JavaScript variables** let you store data, and Svelte 5's **$state() rune** makes that data reactive, meaning your page automatically updates when the data changes.

This is where things start to get exciting. Once you understand variables and state, you can build counters, toggle dark mode, update text dynamically, and so much more.

## What is a Variable?

A variable is a named container for a value. You create variables inside the `<script>` tag of your Svelte component:

```svelte
<script>
  let name = "Alex";
  let age = 25;
  let isStudent = true;
</script>

<p>Name: {name}</p>
<p>Age: {age}</p>
<p>Student: {isStudent}</p>
```

## let vs const

JavaScript has two main ways to declare variables:

- **`let`** — the value can change later
- **`const`** — the value can never change (constant)

```svelte
<script>
  let score = 0;        // Can change later
  const maxScore = 100;  // Will never change

  score = 10; // This works fine
  // maxScore = 200; // ERROR! Cannot reassign a const
</script>

<p>Score: {score} / {maxScore}</p>
```

Use `const` for values that should never change (like configuration or labels). Use `let` for everything else.

## Data Types

JavaScript has several types of data you will use constantly:

```svelte
<script>
  // String — text wrapped in quotes
  let greeting = "Hello, world!";

  // Number — numeric values (no quotes!)
  let temperature = 72;
  let price = 9.99;

  // Boolean — true or false
  let isLoggedIn = false;
</script>

<p>{greeting}</p>
<p>Temperature: {temperature} degrees</p>
<p>Price: ${price}</p>
<p>Logged in: {isLoggedIn}</p>
```

| Type | Examples | Use For |
|------|----------|---------|
| String | `"hello"`, `'world'` | Text, names, messages |
| Number | `42`, `3.14`, `-10` | Counts, prices, measurements |
| Boolean | `true`, `false` | On/off states, yes/no flags |

## Reactive State with $state()

Here is where Svelte 5 shines. A regular `let` variable works for displaying data, but if you want the page to **react** when the variable changes, you need the `$state()` rune:

```svelte
<script>
  let count = $state(0);
</script>

<p>Count: {count}</p>
```

The `$state()` function tells Svelte: "Watch this variable. Whenever it changes, update the page automatically." Without `$state()`, Svelte would not know to re-render when the value changes.

## When Do You Need $state()?

Use `$state()` when the value will change after the component first renders — like user input, button clicks, or data loading. Use a plain `let` or `const` when the value is set once and never changes.

```svelte
<script>
  // Static — never changes after setup
  const appName = "My App";

  // Reactive — will change based on user actions
  let theme = $state("light");
  let notificationCount = $state(0);
</script>

<h1>{appName}</h1>
<p>Theme: {theme}</p>
<p>Notifications: {notificationCount}</p>
```

## A Complete Example

```svelte
<script>
  const title = "Profile";
  let name = $state("Alex");
  let score = $state(0);
  let isOnline = $state(true);
</script>

<h1>{title}</h1>
<div class="profile">
  <p><strong>Name:</strong> {name}</p>
  <p><strong>Score:</strong> {score}</p>
  <p><strong>Status:</strong> {isOnline ? "Online" : "Offline"}</p>
</div>

<style>
  .profile {
    padding: 16px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 1px solid #dee2e6;
  }
</style>
```

## Try It

Create a "Player Stats" component that has:
- A `const` for the game name
- A `$state()` variable for player name (string)
- A `$state()` variable for score (number)
- A `$state()` variable for whether the game is active (boolean)
- Display all the values in styled HTML

## Key Takeaways

- `let` creates a variable that can change; `const` creates one that cannot
- The three core data types are **string** (text), **number**, and **boolean** (true/false)
- `$state()` is a Svelte 5 rune that makes a variable **reactive** — the UI updates when it changes
- Use `$state()` for values that change over time; use plain `let`/`const` for static values
- Display variables in HTML with curly braces: `{variableName}`
