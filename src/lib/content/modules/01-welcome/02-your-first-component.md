# Your First Svelte Component

In the previous lesson, you learned that every web page is made of HTML, CSS, and JavaScript. Now we are going to learn the most important idea in modern UI development: **the component.**

This is not just a Svelte concept. Components are how every modern framework — React, Vue, Angular, Svelte — organizes code. Learn to think in components and you can work in any of them.

## What is a Component?

A component is a **self-contained, reusable unit of UI.** It bundles together the structure (HTML), presentation (CSS), and behavior (JavaScript) for one piece of your interface.

Think about a website like YouTube. You do not build that as one massive HTML file. Instead, you break it into pieces:

- A `SearchBar` component
- A `VideoCard` component (used dozens of times on the homepage)
- A `Sidebar` component
- A `CommentThread` component, containing many `Comment` components

Each of these components is its own file. Each owns its own markup, styles, and logic. Each can be developed, tested, and reasoned about independently. And each can be reused — the same `VideoCard` component renders every video thumbnail on the page, just with different data passed in.

> **Mental model:** A component is like a function, but for UI. A function takes inputs and returns a value. A component takes inputs (props) and returns a piece of the screen. Just as functions let you organize and reuse logic, components let you organize and reuse interface.

### Why Components Won

Before components, web development looked like this: you had an `index.html` file with all your markup, a `styles.css` file with all your styles, and a `script.js` file with all your logic. A change to the "product card" meant updating three files and hoping you did not accidentally break the navigation bar in the process.

Components solved this by co-locating related code. Instead of organizing by technology (all HTML together, all CSS together, all JS together), you organize by feature (everything about the product card together, everything about the navigation together).

This is the same evolution that happened in backend development — from monolithic files organized by layer (all controllers, all models, all views) to modules organized by feature (user module, payment module, notification module). The insight is universal: **group by what changes together, not by what looks similar.**

## The `.svelte` File Format

In Svelte, every component is a single `.svelte` file. The file has three optional sections:

```svelte
<script>
  // JavaScript — your data and logic
</script>

<!-- HTML — your markup (the structure the user sees) -->

<style>
  /* CSS — your styles (scoped to this component) */
</style>
```

This is called a **single-file component**, and it is one of Svelte's best design decisions. Here is why:

**Everything related to one piece of UI lives in one place.** When you need to change how a card looks, you open one file — not three. The JavaScript that controls the card, the HTML that defines it, and the CSS that styles it are all right there, within scroll distance of each other.

Some frameworks (older Angular, for instance) split each component into three separate files: `card.component.ts`, `card.component.html`, `card.component.css`. The idea was "separation of concerns" — keep technologies apart. But in practice, when you change a component's behavior, you almost always change its markup and styles too. Splitting by technology means bouncing between three files for every change. Splitting by component means opening one file and seeing the full picture.

> **The real separation of concerns is not HTML vs. CSS vs. JS. It is component A vs. component B.** Each component is a concern. Keep it self-contained.

Another thing: all three sections are optional. A component with only markup is perfectly valid:

```svelte
<footer>
  <p>&copy; 2026 My Company</p>
</footer>
```

That is a complete Svelte component. No script, no style. You add those sections when you need them.

### Section Order Matters (For Humans)

Svelte does not care what order the sections appear in. But conventions exist for a reason. The standard order is:

```svelte
<script>
  // 1. Logic first — the data your template needs
</script>

<!-- 2. Markup second — the structure that uses the data -->

<style>
  /* 3. Styles last — the presentation of the structure */
</style>
```

This top-down order mirrors how you think about a component: "What data does it need? How is it structured? How does it look?" Some teams place `<style>` before the markup. Either is fine — the important thing is consistency across your project. Pick a convention and stick with it.

## Building a Real Component

Let's build a `Card` component step by step, the way you would in a real project.

### Step 1: Just the Markup

Start with the HTML. What does a card look like structurally?

```svelte
<div class="card">
  <h2>Getting Started with Svelte</h2>
  <p>Learn the fundamentals of Svelte 5 and build your first component.</p>
</div>
```

This renders, but the title and description are hardcoded. This card can only ever say one thing. That is not useful — we want to reuse this component with different content.

### Step 2: Adding Props — The Component's Public API

**Props** (short for properties) are how a parent component passes data down to a child component. They are the component's public interface — the inputs it accepts.

In Svelte 5, you declare props using `$props()`:

```svelte
<script>
  let { title, description } = $props();
</script>

<div class="card">
  <h2>{title}</h2>
  <p>{description}</p>
</div>
```

Now this component does not decide its own content. The parent decides what `title` and `description` to pass in. The component just knows *how to display* a card — not *what* the card says.

This is a critical design principle: **components describe the shape of UI, and data flows in from above.**

Let's break down the `$props()` syntax:

```svelte
<script>
  // $props() returns an object containing all the props the parent passed.
  // We destructure it to get individual variables.
  let { title, description } = $props();

  // This is JavaScript destructuring — the same syntax you use with objects:
  // const { name, age } = person;

  // Each destructured variable becomes available in your template.
</script>
```

The `$props()` rune is Svelte 5's way of declaring props. It replaces the older `export let` syntax from Svelte 4. The destructuring pattern makes it clear exactly which props your component accepts — it is both documentation and implementation in one line.

### Step 3: Using the Component

Here is how a parent component would use our `Card`:

```svelte
<script>
  import Card from './Card.svelte';
</script>

<Card title="Getting Started" description="Learn the fundamentals of Svelte 5." />
<Card title="Components Deep Dive" description="Build reusable, composable UI." />
<Card title="State Management" description="Manage data that changes over time." />
```

One component definition, three instances, each with different data. This is the power of components: define the pattern once, use it everywhere.

Notice the import statement. In Svelte, you import components like you import any JavaScript module. The file name (`Card.svelte`) becomes the component name (`Card`). Capital first letter, by convention — this is how Svelte (and you) distinguish components from regular HTML elements.

```svelte
<script>
  import Card from './Card.svelte';  // Capital C — this is a component
</script>

<!-- Svelte tells apart components from HTML elements by the capital letter -->
<Card title="Hello" />    <!-- Component — Svelte looks for Card.svelte -->
<div class="wrapper">     <!-- HTML element — rendered directly -->
  <card>                   <!-- HTML element — NOT a component (lowercase) -->
  </card>
</div>
```

This convention is not arbitrary. It is how the Svelte compiler distinguishes between native HTML elements and your custom components. Always use PascalCase for component names.

### Step 4: Adding Styles

Let's make our card look like a real card:

```svelte
<script>
  let { title, description } = $props();
</script>

<div class="card">
  <h2>{title}</h2>
  <p>{description}</p>
</div>

<style>
  .card {
    max-width: 400px;
    padding: 24px;
    border-radius: 12px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: box-shadow 0.2s ease;
  }

  .card:hover {
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  h2 {
    margin: 0 0 8px;
    color: #333;
    font-size: 1.25rem;
  }

  p {
    margin: 0;
    color: #666;
    line-height: 1.5;
  }
</style>
```

Here is something important: **the CSS in this component is scoped.** That `h2` style only affects `<h2>` elements *inside this component*. If you have another component with its own `<h2>`, this style will not touch it.

Svelte achieves this by adding a unique class to the component's elements at compile time (something like `svelte-abc123`) and rewriting your CSS selectors to include it. You never see this — it just works. But it eliminates one of the oldest headaches in web development: CSS that accidentally leaks across your app.

### How Scoped CSS Works Under the Hood

Let's see what the compiler actually does. Your component:

```svelte
<h2>Hello</h2>
<style>
  h2 { color: red; }
</style>
```

Becomes something like:

```html
<h2 class="svelte-abc123">Hello</h2>
<style>
  h2.svelte-abc123 { color: red; }
</style>
```

The selector `h2` is rewritten to `h2.svelte-abc123`, which only matches `<h2>` elements that have the component's unique class. Other `<h2>` elements on the page are unaffected. This is automatic and invisible — you write normal CSS and get encapsulation for free.

This means you can use simple selectors like `h2`, `p`, `.card` without worrying about naming collisions. No BEM, no CSS Modules, no `styled-components` — just plain CSS that stays where it belongs.

### Step 5: Default Values and Optional Props

Not every prop needs to be required. You can set defaults:

```svelte
<script>
  let { title, description = 'No description provided.' } = $props();
</script>
```

Now if a parent uses `<Card title="Hello" />` without a description, it gracefully falls back to the default text instead of showing `undefined`. This is JavaScript destructuring with default values — nothing Svelte-specific about the syntax.

Think of defaults as your component's safety net. A well-designed component should never render broken UI just because a parent forgot a prop.

### WRONG vs CORRECT: Prop Defaults

```svelte
<!-- WRONG: No defaults. If parent forgets a prop, UI breaks. -->
<script>
  let { title, description, imageUrl } = $props();
</script>

<div class="card">
  <img src={imageUrl} alt={title} />  <!-- src is undefined — broken image -->
  <h2>{title}</h2>                    <!-- shows "undefined" as text -->
  <p>{description}</p>                <!-- shows "undefined" as text -->
</div>

<!-- CORRECT: Sensible defaults for optional props. -->
<script>
  let { title = 'Untitled', description = '', imageUrl = '/placeholder.png' } = $props();
</script>

<div class="card">
  <img src={imageUrl} alt={title} />  <!-- Shows placeholder if no image -->
  <h2>{title}</h2>                    <!-- Shows "Untitled" if no title -->
  {#if description}
    <p>{description}</p>              <!-- Only renders if description exists -->
  {/if}
</div>
```

The rule: required props (the component truly cannot function without them) have no default. Optional props (nice to have, but the component works without them) always have defaults. Most components have a mix of both.

## How Svelte Actually Compiles This

This is where Svelte gets genuinely interesting. Let's pull back the curtain.

When you write a Svelte component, you are not writing code that runs as-is in the browser. The **Svelte compiler** reads your `.svelte` file at build time and generates optimized vanilla JavaScript.

Here is the simplified mental model of what happens to our `Card` component:

1. The compiler parses your `<script>`, markup, and `<style>` sections
2. It analyzes which variables are used in the template and could change
3. It generates JavaScript code that creates the DOM elements directly (`document.createElement('div')`, etc.)
4. For any dynamic part (like `{title}`), it generates code that updates *just that specific text node* when the prop changes
5. It processes your CSS, scopes it, and emits a regular stylesheet

The output is lean, surgical JavaScript. No virtual DOM. No diffing algorithm. No runtime framework sitting in the browser interpreting your components. Just direct DOM manipulation — exactly what you would write by hand, but generated automatically and without the mistakes.

> **Why this matters:** In React, every time state changes, the framework re-runs your component function, builds a virtual DOM tree, diffs it against the previous one, and figures out what changed. In Svelte, the compiler already knows at build time which DOM nodes depend on which variables. It generates an `update` function that targets those nodes directly. No diffing needed. This is why Svelte apps tend to be smaller and faster.

You do not need to think about this while writing Svelte. But knowing it gives you confidence: that clean, simple code you are writing is not hiding expensive runtime work. It is *actually* simple all the way down.

### Compilation: A Concrete Example

Consider this tiny component:

```svelte
<script>
  let { name } = $props();
  let count = $state(0);
</script>

<p>Hello, {name}! You clicked {count} times.</p>
<button onclick={() => count++}>Click me</button>
```

The compiler sees two dynamic expressions: `{name}` and `{count}`. It knows `name` comes from props (can change when parent re-renders) and `count` is local state (changes when the button is clicked). It generates code that:

1. Creates a `<p>` element and a `<button>` element once
2. Sets the initial text content using `name` and `count`
3. For `name`: watches for prop changes and updates only the text node containing the name
4. For `count`: after `count++` runs, updates only the text node containing the count

No virtual DOM diff. No re-running the entire component. No checking every element on the page. Just surgical updates to the two text nodes that actually changed. This is what "compiled reactivity" means.

## The Component Tree

Your application is not just one component. It is a **tree of components**, just like HTML is a tree of elements.

```
App
├── Header
│   ├── Logo
│   └── Navigation
├── Main
│   ├── Card (title="Getting Started")
│   ├── Card (title="Components")
│   └── Card (title="State")
└── Footer
```

The `App` component is the root. It renders `Header`, `Main`, and `Footer`. `Header` renders `Logo` and `Navigation`. `Main` renders three `Card` instances. Each parent passes data down to its children via props.

This tree structure is how you think about your application. When something looks wrong on screen, you ask: "Which component is responsible for this piece of UI?" You open that file, and everything you need is right there.

Data flows **down** the tree through props. A parent decides what to show; a child decides how to show it. This one-directional data flow makes your application predictable — you can always trace where a piece of data came from by following the props upward.

### Visualizing Data Flow

```
         App
         │
    ┌────┼────┐
    │    │    │
  Header Main  Footer
    │    │
    │    ├── Card ← receives { title, description }
    │    ├── Card ← receives { title, description }
    │    └── Card ← receives { title, description }
    │
    ├── Logo  ← receives { src }
    └── Nav   ← receives { links }

Data flows DOWN (props).
Events bubble UP (callbacks).
```

A parent passes data down to its children. When a child needs to communicate back up (like "the user clicked me"), it calls a callback function that the parent passed down as a prop. We will cover this pattern in detail in a future lesson. For now, the key insight is: **data flows in one direction — downward.**

## The {#each} Block: Rendering Lists

Most real applications display lists of things — products, messages, users, tasks. Svelte provides the `{#each}` block for iterating over arrays:

```svelte
<script>
  let fruits = ['Apple', 'Banana', 'Cherry'];
</script>

<ul>
  {#each fruits as fruit}
    <li>{fruit}</li>
  {/each}
</ul>
```

The `{#each}` block takes an array and a name for each item. It renders its contents once for each element. The variable `fruit` is scoped to the block — it only exists between `{#each}` and `{/each}`.

You can also get the index:

```svelte
{#each fruits as fruit, index}
  <li>{index + 1}. {fruit}</li>
{/each}
```

### Keyed Each Blocks

When items in a list can change (be added, removed, or reordered), you should provide a **key** — a unique identifier for each item. This tells Svelte which DOM elements correspond to which data items:

```svelte
<script>
  let todos = [
    { id: 1, text: 'Learn Svelte' },
    { id: 2, text: 'Build an app' },
    { id: 3, text: 'Deploy' }
  ];
</script>

{#each todos as todo (todo.id)}
  <div>{todo.text}</div>
{/each}
```

The `(todo.id)` after the iteration variable is the key expression. Without a key, Svelte updates list items by position — which can cause bugs when items are reordered or removed. With a key, Svelte tracks each item by identity and can efficiently move, add, or remove DOM elements.

### WRONG vs CORRECT: Each Block Keys

```svelte
<!-- WRONG: No key. If you remove item 2, Svelte updates items by index.
     Item 3 gets item 2's DOM node. If those items had input fields,
     the values would be wrong. -->
{#each todos as todo}
  <div>
    <input type="text" value={todo.text} />
  </div>
{/each}

<!-- CORRECT: Key by unique ID. Each DOM node tracks its data item. -->
{#each todos as todo (todo.id)}
  <div>
    <input type="text" value={todo.text} />
  </div>
{/each}
```

Rule of thumb: always use a key when your list can change. Use a stable, unique identifier (like a database ID), not the array index.

## Conditional Rendering: {#if} Blocks

Components often need to show or hide content based on conditions:

```svelte
<script>
  let { loggedIn = false, username = '' } = $props();
</script>

{#if loggedIn}
  <p>Welcome back, {username}!</p>
{:else}
  <p>Please log in to continue.</p>
{/if}
```

The `{#if}` block renders its contents only when the condition is true. The `{:else}` clause provides an alternative. You can also chain conditions with `{:else if}`:

```svelte
{#if score >= 90}
  <span class="grade">A</span>
{:else if score >= 80}
  <span class="grade">B</span>
{:else if score >= 70}
  <span class="grade">C</span>
{:else}
  <span class="grade">F</span>
{/if}
```

This is how components make decisions. The template is not just static HTML — it is a description of *what should appear given the current state.* When the state changes, Svelte automatically updates the DOM to match.

## A Complete Example: Course Card Grid

Let's put it all together with something that feels like a real application. We will build a page that displays a grid of course cards with filtering.

First, the `Card.svelte` component:

```svelte
<script>
  let { title, description, level = 'Beginner' } = $props();

  // Compute the badge color based on level
  const badgeColors = {
    Beginner: { bg: '#fff0ed', text: '#ff3e00' },
    Intermediate: { bg: '#e0f2fe', text: '#0369a1' },
    Advanced: { bg: '#faf5ff', text: '#7c3aed' }
  };

  let colors = $derived(badgeColors[level] || badgeColors.Beginner);
</script>

<article class="card">
  <span class="badge" style="background: {colors.bg}; color: {colors.text}">
    {level}
  </span>
  <h2>{title}</h2>
  <p>{description}</p>
</article>

<style>
  .card {
    padding: 24px;
    border-radius: 12px;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .card:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  h2 {
    margin: 12px 0 8px;
    font-size: 1.25rem;
    color: #222;
  }

  p {
    margin: 0;
    color: #666;
    line-height: 1.6;
    font-size: 0.95rem;
  }
</style>
```

Now, the parent page that uses it:

```svelte
<script>
  import Card from './Card.svelte';

  const courses = [
    {
      id: 1,
      title: 'Svelte Fundamentals',
      description: 'Learn the core concepts of Svelte 5, from components and reactivity to lifecycle and events.',
      level: 'Beginner'
    },
    {
      id: 2,
      title: 'SvelteKit Routing',
      description: 'Build multi-page applications with file-based routing, layouts, and data loading.',
      level: 'Intermediate'
    },
    {
      id: 3,
      title: 'Advanced State Patterns',
      description: 'Master runes, stores, and derived state for complex application architectures.',
      level: 'Advanced'
    },
    {
      id: 4,
      title: 'Tailwind Integration',
      description: 'Style your Svelte components with Tailwind CSS v4 and build a design system.',
      level: 'Intermediate'
    }
  ];

  let filter = $state('All');

  let filteredCourses = $derived(
    filter === 'All'
      ? courses
      : courses.filter(c => c.level === filter)
  );
</script>

<main>
  <h1>Available Courses</h1>

  <div class="filters">
    {#each ['All', 'Beginner', 'Intermediate', 'Advanced'] as level}
      <button
        class:active={filter === level}
        onclick={() => filter = level}
      >
        {level}
      </button>
    {/each}
  </div>

  <p class="count">{filteredCourses.length} courses</p>

  <div class="grid">
    {#each filteredCourses as course (course.id)}
      <Card
        title={course.title}
        description={course.description}
        level={course.level}
      />
    {/each}
  </div>
</main>

<style>
  main {
    max-width: 900px;
    margin: 0 auto;
    padding: 48px 24px;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 16px;
    color: #222;
  }

  .filters {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
  }

  .filters button {
    padding: 6px 16px;
    border: 1px solid #ddd;
    border-radius: 100px;
    background: white;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.15s ease;
  }

  .filters button.active {
    background: #222;
    color: white;
    border-color: #222;
  }

  .count {
    color: #888;
    font-size: 0.9rem;
    margin-bottom: 16px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 24px;
  }
</style>
```

A few things to notice in this example:

- **The `{#each}` block** iterates over the `filteredCourses` array and renders a `Card` for each item. This is how Svelte handles lists — no `.map()` call like React, just a clear template syntax.
- **Keyed each block**: The `(course.id)` key ensures Svelte tracks each card by its ID, not by position. When filtering changes the list, cards are correctly added/removed.
- **`$state` and `$derived`**: The `filter` variable uses `$state` because it changes when the user clicks. The `filteredCourses` uses `$derived` because it is computed from `filter` and `courses`. When `filter` changes, `filteredCourses` automatically recomputes.
- **The data lives in the parent.** The parent has the list of courses. The `Card` component has no idea how many cards there are or what the other cards say. It just knows how to render *one* card.
- **The grid layout is in the parent's CSS.** The card does not know it is in a grid. The parent decides the layout. This is good separation of responsibility — the card handles how one card looks, the parent handles how cards are arranged.
- **Conditional styling with `class:active`**: The `class:active={filter === level}` directive adds the `active` class when the condition is true and removes it when it is false. This is Svelte's way of toggling CSS classes based on state.

## Common Beginner Mistakes

### Mistake 1: Putting Logic in the Template

```svelte
<!-- WRONG: Complex logic cluttering the template -->
<p>
  {#if items.length > 0 && items.filter(i => i.active).length > 0}
    {items.filter(i => i.active).length} active items out of {items.length}
  {:else if items.length > 0}
    No active items
  {:else}
    No items at all
  {/if}
</p>

<!-- CORRECT: Compute in script, use in template -->
<script>
  let { items } = $props();
  let activeCount = $derived(items.filter(i => i.active).length);
</script>

{#if items.length === 0}
  <p>No items at all</p>
{:else if activeCount === 0}
  <p>No active items</p>
{:else}
  <p>{activeCount} active items out of {items.length}</p>
{/if}
```

### Mistake 2: Modifying Props Directly

```svelte
<!-- WRONG: Mutating a prop. Props flow DOWN. Children should not change them. -->
<script>
  let { user } = $props();
</script>

<button onclick={() => user.name = 'New Name'}>
  Change Name
</button>
<!-- This mutates the parent's data, which breaks the one-way data flow
     and makes bugs very hard to trace. -->

<!-- CORRECT: Use local state or notify the parent via a callback. -->
<script>
  let { user, onNameChange } = $props();
  let editedName = $state(user.name);
</script>

<input bind:value={editedName} />
<button onclick={() => onNameChange(editedName)}>
  Save
</button>
```

### Mistake 3: Massive Components

```svelte
<!-- WRONG: A 500-line component that does everything -->
<script>
  // ... 200 lines of logic for header, sidebar, content, footer,
  // modal, form validation, data fetching, animations ...
</script>

<!-- ... 200 lines of markup ... -->
<!-- ... 100 lines of styles ... -->

<!-- CORRECT: Break it into focused components -->
<script>
  import Header from './Header.svelte';
  import Sidebar from './Sidebar.svelte';
  import ContentArea from './ContentArea.svelte';
  import Footer from './Footer.svelte';
</script>

<Header />
<div class="layout">
  <Sidebar />
  <ContentArea />
</div>
<Footer />
```

A good rule of thumb: if a component is longer than 150-200 lines, or if you find yourself adding comments like "// --- Sidebar Logic ---" to separate sections, it is time to extract sub-components.

## Why Components Are the Most Important Abstraction

Components are not just an organizational trick. They change how you think about building software for the web.

**Without components**, you have a big pool of HTML, a big pool of CSS, and a big pool of JavaScript. Changing one thing risks breaking something else. Finding the code for a specific feature means searching across three files (or thirty). Testing a piece of UI means somehow isolating it from everything it is tangled with.

**With components**, your UI is a tree of independent, self-contained units. Each one is small enough to fit in your head. Each one has a clear contract (its props). Each one can be worked on independently. When something breaks, you know exactly which component to look at.

This is the same principle behind functions in programming, microservices in backend architecture, and modular design in general: **break complex systems into small, composable parts with clear interfaces.**

Components are the unit of reuse, the unit of reasoning, and the unit of testing in modern UI development. Every lesson that follows builds on this foundation.

### The Component Design Checklist

When creating a new component, ask yourself:

1. **What does it display?** (markup) — Define the structure first.
2. **What inputs does it need?** (props) — What data comes from the parent?
3. **What decisions does it make?** (logic) — What computations or conditions does it contain?
4. **What does it look like?** (styles) — How is it visually presented?
5. **What outputs does it produce?** (events/callbacks) — Does the parent need to know about user interactions?

A well-designed component has clear answers to each of these questions. A poorly designed component blurs the boundaries — it fetches its own data instead of receiving it as props, it reaches outside its boundaries to style other components, or it tries to do too many things.

## Svelte vs Other Frameworks: Component Syntax Comparison

Understanding how Svelte compares helps you see what is unique about it:

```jsx
// React — JSX (JavaScript expressions that look like HTML)
function Card({ title, description }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  );
}
```

```vue
<!-- Vue — Single File Component (similar to Svelte) -->
<template>
  <div class="card">
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
  </div>
</template>

<script setup>
defineProps(['title', 'description'])
</script>
```

```svelte
<!-- Svelte — Single File Component (cleanest syntax) -->
<script>
  let { title, description } = $props();
</script>

<div class="card">
  <h2>{title}</h2>
  <p>{description}</p>
</div>
```

Notice how Svelte's syntax is closest to plain HTML. There is no `className` (React's workaround for the reserved `class` keyword in JavaScript). No double-brace expressions. No special template syntax like `v-for` or `v-if` (Vue). Svelte uses HTML with a few additions (`{#each}`, `{#if}`), making it the easiest framework to learn if you already know HTML.

## Key Takeaways

- A **component** is a self-contained unit of UI — markup, styles, and logic in one file
- The `.svelte` file format puts all three concerns together because they *are* one concern: a piece of your interface
- **Props** are the component's public API — inputs that flow down from parent to child, declared with `$props()` in Svelte 5
- Always provide **default values** for optional props so your component never renders broken UI
- Svelte **compiles** your components at build time into optimized vanilla JavaScript — no virtual DOM, no runtime framework, just surgical DOM updates
- CSS in Svelte is **scoped** to the component by default, preventing styles from leaking across your app
- Your application is a **tree of components**, with data flowing down through props (one-way data flow)
- Use **`{#each}`** for lists (always with a key for dynamic lists) and **`{#if}`** for conditional rendering
- Use **`$derived`** for values computed from state — keep complex logic in the script section, not in the template
- Components are the most important abstraction in modern UI development — they are how you organize, reuse, and reason about your interface
- Keep components focused: if it exceeds 150-200 lines or does more than one thing, extract sub-components

## Try It

1. **Build a `ProfileCard` component:** Create a component that accepts `name`, `role`, and `avatarUrl` as props. Display the avatar as an image, the name as a heading, and the role as a subtitle. Add a default value for `avatarUrl` that shows a placeholder image. Style it nicely. Then use it three times in a parent component with different data for each.

2. **Add an optional prop with conditional styling:** Add a `featured` prop to the `Card` component from the lesson (default: `false`). When `featured` is `true`, the card should have a colored left border and a slightly different background. Use `class:featured={featured}` to conditionally apply a CSS class.

3. **Build a filterable list:** Create an array of at least 6 items with a `category` property (like "Fruit", "Vegetable", "Grain"). Use `{#each}` with a key to render them, and add filter buttons that update a `$state` variable. Use `$derived` to compute the filtered list. Display the count of shown items.

4. **Create a component tree:** Build a small page with at least three levels of nesting. For example: a `Page` component that renders a `Section` component, which renders multiple `Card` components. Pass data from the top (`Page`) all the way down to the bottom (`Card`) through props. Notice how data flows in one direction — always downward.

5. **Inspect the compiled output:** Go to the [Svelte REPL](https://svelte.dev/playground) and write a simple component with a `$state` variable and a button that changes it. Click the "JS output" tab on the right. You do not need to understand every line — just notice how your declarative Svelte code becomes imperative DOM operations. That is the compiler at work.
