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

### Step 5: Default Values and Optional Props

Not every prop needs to be required. You can set defaults:

```svelte
<script>
  let { title, description = 'No description provided.' } = $props();
</script>
```

Now if a parent uses `<Card title="Hello" />` without a description, it gracefully falls back to the default text instead of showing `undefined`. This is JavaScript destructuring with default values — nothing Svelte-specific about the syntax.

Think of defaults as your component's safety net. A well-designed component should never render broken UI just because a parent forgot a prop.

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

## A Complete Example: Course Card Grid

Let's put it all together with something that feels like a real application. We will build a page that displays a grid of course cards.

First, the `Card.svelte` component:

```svelte
<script>
  let { title, description, level = 'Beginner' } = $props();
</script>

<article class="card">
  <span class="badge">{level}</span>
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
    background: #fff0ed;
    color: #ff3e00;
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
      title: 'Svelte Fundamentals',
      description: 'Learn the core concepts of Svelte 5, from components and reactivity to lifecycle and events.',
      level: 'Beginner'
    },
    {
      title: 'SvelteKit Routing',
      description: 'Build multi-page applications with file-based routing, layouts, and data loading.',
      level: 'Intermediate'
    },
    {
      title: 'Advanced State Patterns',
      description: 'Master runes, stores, and derived state for complex application architectures.',
      level: 'Advanced'
    }
  ];
</script>

<main>
  <h1>Available Courses</h1>
  <div class="grid">
    {#each courses as course}
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
    margin: 0 0 32px;
    color: #222;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 24px;
  }
</style>
```

A few things to notice in this example:

- **The `{#each}` block** iterates over the `courses` array and renders a `Card` for each item. This is how Svelte handles lists — no `.map()` call like React, just a clear template syntax.
- **The data lives in the parent.** The parent has the list of courses. The `Card` component has no idea how many cards there are or what the other cards say. It just knows how to render *one* card.
- **The grid layout is in the parent's CSS.** The card does not know it is in a grid. The parent decides the layout. This is good separation of responsibility — the card handles how one card looks, the parent handles how cards are arranged.

## Why Components Are the Most Important Abstraction

Components are not just an organizational trick. They change how you think about building software for the web.

**Without components**, you have a big pool of HTML, a big pool of CSS, and a big pool of JavaScript. Changing one thing risks breaking something else. Finding the code for a specific feature means searching across three files (or thirty). Testing a piece of UI means somehow isolating it from everything it is tangled with.

**With components**, your UI is a tree of independent, self-contained units. Each one is small enough to fit in your head. Each one has a clear contract (its props). Each one can be worked on independently. When something breaks, you know exactly which component to look at.

This is the same principle behind functions in programming, microservices in backend architecture, and modular design in general: **break complex systems into small, composable parts with clear interfaces.**

Components are the unit of reuse, the unit of reasoning, and the unit of testing in modern UI development. Every lesson that follows builds on this foundation.

## Key Takeaways

- A **component** is a self-contained unit of UI — markup, styles, and logic in one file
- The `.svelte` file format puts all three concerns together because they *are* one concern: a piece of your interface
- **Props** are the component's public API — inputs that flow down from parent to child
- Svelte **compiles** your components at build time into optimized vanilla JavaScript — no virtual DOM, no runtime framework
- CSS in Svelte is **scoped** to the component, preventing styles from leaking across your app
- Your application is a **tree of components**, with data flowing down through props
- Components are the most important abstraction in modern UI development — they are how you organize, reuse, and reason about your interface

## Try It

1. **Build a `ProfileCard` component:** Create a component that accepts `name`, `role`, and `avatarUrl` as props. Display the avatar as an image, the name as a heading, and the role as a subtitle. Style it nicely. Then use it three times in a parent component with different data for each.

2. **Add an optional prop:** Add a `featured` prop to the `Card` component from the lesson (default: `false`). When `featured` is `true`, the card should have a colored left border and a slightly different background. Hint: you can conditionally apply a CSS class using `class:featured={featured}` on the element.

3. **Create a component tree:** Build a small page with at least three levels of nesting. For example: a `Page` component that renders a `Section` component, which renders multiple `Card` components. Pass data from the top (`Page`) all the way down to the bottom (`Card`) through props. Notice how data flows in one direction — always downward.

4. **Inspect the compiled output:** If you are curious about what Svelte generates, go to the [Svelte REPL](https://svelte.dev/playground) and write a simple component. Click the "JS output" tab on the right. You do not need to understand every line — just notice how your declarative Svelte code becomes imperative DOM operations. That is the compiler at work.
