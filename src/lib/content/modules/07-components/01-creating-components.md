# Creating Components

So far, you have been writing everything in a single Svelte file. That works for small experiments, but real websites have dozens or hundreds of pieces — navbars, buttons, cards, modals, footers. If you put all of that in one file, it would be thousands of lines of unmanageable code.

**Components** solve this. A component is a self-contained, reusable piece of your UI. You write it once in its own `.svelte` file, then use it anywhere. Think of components like LEGO bricks — small, independent pieces that snap together to build something bigger.

## The Mental Model: Components as UI Units

Before diving into syntax, understand what a component *is* at a conceptual level. A component is a unit of encapsulation that bundles three concerns together:

1. **Structure** (HTML markup) — what the user sees
2. **Behavior** (JavaScript logic) — how it responds to interaction
3. **Presentation** (CSS styles) — how it looks

Each component owns all three. This is fundamentally different from the traditional web development approach where HTML, CSS, and JavaScript lived in separate files. Svelte's single-file component model means everything about a `Button` lives in `Button.svelte`. When you need to change the button, you open one file — not three.

This co-location principle scales. In a 500-component application, you never wonder "where is the CSS for this button?" or "which script file handles this card's click logic?" — the answer is always the component file itself.

Components also establish **boundaries**. Each component manages its own state. CSS defined inside a component cannot leak out and accidentally break another component. Data flows through explicit channels (props in, events/callbacks out). These boundaries are what make large applications manageable.

## The `.svelte` File Anatomy

Every `.svelte` file can have up to three top-level sections, all optional:

```svelte
<!-- MyComponent.svelte -->
<script>
  // JavaScript logic: state, props, imports, functions
  // This runs once per component instance
  let count = $state(0);
</script>

<!-- HTML markup: the component's visual output -->
<!-- This is the ONLY required section -->
<button onclick={() => count++}>
  Clicked {count} times
</button>

<style>
  /* CSS styles: scoped to THIS component only */
  /* Svelte adds unique class names at compile time */
  button {
    background: #3498db;
    color: white;
  }
</style>
```

The order does not technically matter, but the convention is `<script>` first, then markup, then `<style>`. Follow this convention — every Svelte developer expects it, and it makes codebases consistent.

**Key details about each section:**

- **`<script>`** — Runs once when the component is created (per instance). Variables declared here are the component's state. Imports happen here. You can have at most one `<script>` block (there is also `<script context="module">` for code shared across all instances, but that is an advanced topic for later).

- **Markup** — Plain HTML with Svelte's template syntax (`{expressions}`, `{#if}`, `{#each}`, etc.). This is the only section that *must* exist — a `.svelte` file with just `<p>Hello</p>` is a valid component.

- **`<style>`** — Standard CSS, but scoped. Svelte's compiler rewrites selectors to include a unique hash class, so `.card { ... }` in one component will never affect `.card` in another. If you need global styles, use the `:global()` modifier.

## Creating Your First Component

A component is simply a `.svelte` file. Let's create a `Button.svelte` component:

```svelte
<!-- Button.svelte -->
<button class="btn">Click Me</button>

<style>
  .btn {
    padding: 10px 20px;
    background: #3498db;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .btn:hover {
    background: #2980b9;
  }

  .btn:focus-visible {
    outline: 2px solid #3498db;
    outline-offset: 2px;
  }
</style>
```

That is a complete component. It has HTML and scoped CSS — no `<script>` needed unless you want logic. The compiler transforms this into an efficient JavaScript class that knows how to create, update, and destroy its DOM elements.

## Importing and Using Components

To use a component in another file, you **import** it and then use it like an HTML tag. Component names must start with a capital letter — this is how Svelte distinguishes your components from native HTML elements:

```svelte
<!-- App.svelte -->
<script>
  import Button from './Button.svelte';
</script>

<h1>My App</h1>
<Button />
<Button />
<Button />
```

This renders three buttons, each using the HTML and CSS from `Button.svelte`. Change the style in `Button.svelte` and all three update.

**Why capital letters?** HTML elements are lowercase (`<div>`, `<button>`, `<span>`). Svelte uses the capital letter convention to know that `<Button />` is a component reference, not an HTML `<button>` element. This is a hard rule — `<button />` creates an HTML button; `<Button />` instantiates your component.

**Self-closing tags**: Components can use self-closing syntax (`<Button />`) when they have no children. If a component accepts children (via snippets), you use opening and closing tags: `<Card>content here</Card>`.

## The Component Tree

When you use components inside other components, you create a tree structure. This tree is the architecture of your entire application:

```
App
├── Navbar
│   ├── Logo
│   └── NavLinks
├── Main
│   ├── Hero
│   ├── CardGrid
│   │   ├── Card
│   │   ├── Card
│   │   └── Card
│   └── Newsletter
└── Footer
    ├── FooterLinks
    └── Copyright
```

Data flows **down** this tree through props (parent passes data to child). Actions flow **up** through callbacks (child calls a function that parent provided). This unidirectional flow is what makes applications predictable and debuggable.

Every SvelteKit application has an implicit root: the layout components. Your `+layout.svelte` wraps your `+page.svelte`, which contains your components. Understanding this tree helps you reason about where state should live — typically at the lowest common ancestor of all components that need it.

## Component Naming Conventions

Consistent naming prevents confusion as projects grow:

| Convention | Example | When to Use |
|---|---|---|
| PascalCase file names | `UserCard.svelte` | Always — this is the standard |
| Descriptive, specific names | `ProductCard.svelte` | Prefer over generic `Card.svelte` |
| Prefix with domain | `AuthLoginForm.svelte` | When organizing by feature |
| `index.svelte` with barrel | `Button/index.svelte` | For components with related files |

**Naming rules of thumb:**
- Name what it *is*, not what it *does*: `SearchInput.svelte` rather than `HandleSearch.svelte`
- Be specific enough to find with file search: `DashboardSidebar.svelte` rather than `Sidebar.svelte` if you have multiple sidebars
- Match the component name to the file name — `UserAvatar.svelte` exports the component you use as `<UserAvatar />`

## Organizing Components in `$lib`

A typical SvelteKit project organizes components in a `src/lib/components` folder. SvelteKit provides the `$lib` alias that points to `src/lib`:

```
src/
  lib/
    components/
      ui/
        Button.svelte
        Input.svelte
        Modal.svelte
        Badge.svelte
      layout/
        Navbar.svelte
        Footer.svelte
        Sidebar.svelte
      features/
        auth/
          LoginForm.svelte
          SignupForm.svelte
        dashboard/
          StatsCard.svelte
          ActivityFeed.svelte
  routes/
    +page.svelte
    +layout.svelte
```

Import paths use `$lib` as a shortcut to `src/lib`:

```svelte
<script>
  import Button from '$lib/components/ui/Button.svelte';
  import Navbar from '$lib/components/layout/Navbar.svelte';
  import LoginForm from '$lib/components/features/auth/LoginForm.svelte';
</script>
```

**Why `$lib`?** Without it, you would write fragile relative paths like `../../../lib/components/Button.svelte`. The `$lib` alias is absolute from `src/lib`, so it works no matter how deeply nested your importing file is. This is configured automatically by SvelteKit — no setup needed.

**Barrel exports for convenience**: For frequently used components, create an `index.ts` file:

```typescript
// src/lib/components/ui/index.ts
export { default as Button } from './Button.svelte';
export { default as Input } from './Input.svelte';
export { default as Modal } from './Modal.svelte';
export { default as Badge } from './Badge.svelte';
```

Now import multiple components cleanly:

```svelte
<script>
  import { Button, Input, Badge } from '$lib/components/ui';
</script>
```

## What the Compiler Actually Does

Svelte is a *compiler*, not a runtime framework. When you build your project, the Svelte compiler transforms each `.svelte` file into optimized JavaScript. Understanding this helps you reason about performance.

Here is what happens at a high level:

1. **Parse** — The compiler reads your `.svelte` file and breaks it into its three sections (script, markup, style).
2. **Analyze** — It identifies reactive state (`$state`), derived values (`$derived`), effects (`$effect`), and template bindings.
3. **Generate** — It outputs a JavaScript module that creates and updates DOM elements directly. No virtual DOM, no diffing.
4. **Scope CSS** — It adds unique hashes to CSS selectors so styles are scoped, and tree-shakes unused styles.

The compiled output for a simple component is surprisingly small. A component with some state and a click handler might compile to 30-50 lines of efficient JavaScript. This is why Svelte applications tend to be smaller than equivalent React or Vue applications — there is no framework runtime to ship.

**The practical implication**: You do not pay a per-component tax. Creating many small components does not bloat your bundle the way it might in a runtime framework. Feel free to extract components aggressively.

## Components with Logic

Components can have their own state and behavior, completely independent from other components:

```svelte
<!-- LikeButton.svelte -->
<script>
  let likes = $state(0);
  let liked = $state(false);

  function toggle() {
    liked = !liked;
    likes += liked ? 1 : -1;
  }
</script>

<button
  class="like-btn"
  class:active={liked}
  onclick={toggle}
  aria-label={liked ? 'Unlike' : 'Like'}
  aria-pressed={liked}
>
  {liked ? '♥' : '♡'} {likes} {likes === 1 ? 'Like' : 'Likes'}
</button>

<style>
  .like-btn {
    padding: 8px 16px;
    background: white;
    border: 2px solid #e74c3c;
    color: #e74c3c;
    border-radius: 20px;
    cursor: pointer;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }

  .like-btn:hover {
    background: #fde8e8;
  }

  .like-btn.active {
    background: #e74c3c;
    color: white;
  }
</style>
```

Each `<LikeButton />` you place on the page has its own independent `likes` counter:

```svelte
<script>
  import LikeButton from './LikeButton.svelte';
</script>

<h2>Post 1</h2>
<LikeButton />

<h2>Post 2</h2>
<LikeButton />
```

Clicking one button does not affect the other — each component instance has its own state. This is a core principle: component instances are isolated. Two `<LikeButton />` tags create two completely separate objects in memory, each tracking their own `likes` and `liked` values.

## When to Extract a Component

Beginners often ask: "When should I create a new component?" Here are reliable heuristics:

**Extract when you want to name a concept.** If you find yourself writing a comment like `<!-- user profile section -->`, that is a signal. The comment *is* the component name: `<UserProfile />`.

**Extract when you want to reuse.** If the same markup appears twice, it belongs in a component. Even if it appears once now but you can foresee reuse, extract it.

**Extract when a file gets hard to navigate.** If you are scrolling past 200 lines of markup, split it. Each component should fit comfortably on one screen (roughly 50-150 lines).

**Extract when state is self-contained.** If a group of variables and functions only relate to each other (like `isOpen`, `toggle`, and modal markup), they are a natural component.

**Do NOT extract prematurely.** If something is used once and is only 10 lines, keeping it inline is fine. Over-componentizing creates a maze of tiny files that is harder to follow than a slightly longer single file.

**The rule of thumb**: If you can give it a name and it makes your code clearer, extract it. If extracting it makes you jump between files to understand a simple flow, keep it inline.

## Complete Example: Building a Component Library

Let's build a small set of components that work together — a pattern you will use in every real project:

```svelte
<!-- src/lib/components/ui/Avatar.svelte -->
<script>
  let { src, alt, size = 'md' } = $props();

  const sizes = {
    sm: '32px',
    md: '48px',
    lg: '64px',
    xl: '96px'
  };
</script>

<img
  class="avatar avatar-{size}"
  {src}
  {alt}
  width={sizes[size]}
  height={sizes[size]}
/>

<style>
  .avatar {
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #e0e0e0;
  }

  .avatar-sm { width: 32px; height: 32px; }
  .avatar-md { width: 48px; height: 48px; }
  .avatar-lg { width: 64px; height: 64px; }
  .avatar-xl { width: 96px; height: 96px; }
</style>
```

```svelte
<!-- src/lib/components/ui/Badge.svelte -->
<script>
  let { text, variant = 'default' } = $props();
</script>

<span class="badge badge-{variant}">{text}</span>

<style>
  .badge {
    display: inline-block;
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .badge-default { background: #e2e8f0; color: #475569; }
  .badge-success { background: #dcfce7; color: #166534; }
  .badge-warning { background: #fef9c3; color: #854d0e; }
  .badge-danger  { background: #fee2e2; color: #991b1b; }
  .badge-info    { background: #dbeafe; color: #1e40af; }
</style>
```

```svelte
<!-- src/lib/components/ui/Card.svelte -->
<script>
  let { variant = 'default' } = $props();
</script>

<div class="card card-{variant}">
  {@render children()}
</div>

{#snippet children()}
  <!-- fallback: empty card -->
{/snippet}

<style>
  .card {
    padding: 24px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .card-elevated {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border: none;
  }

  .card-outlined {
    box-shadow: none;
    border: 2px solid #e2e8f0;
  }
</style>
```

Now compose them into a feature component:

```svelte
<!-- src/lib/components/features/TeamMember.svelte -->
<script>
  import Avatar from '$lib/components/ui/Avatar.svelte';
  import Badge from '$lib/components/ui/Badge.svelte';
  import Card from '$lib/components/ui/Card.svelte';

  let { name, role, avatar, status = 'active' } = $props();

  const statusVariant = {
    active: 'success',
    away: 'warning',
    offline: 'default'
  };
</script>

<Card variant="elevated">
  <div class="member">
    <Avatar src={avatar} alt="{name}'s photo" size="lg" />
    <div class="info">
      <h3>{name}</h3>
      <p>{role}</p>
      <Badge text={status} variant={statusVariant[status]} />
    </div>
  </div>
</Card>

<style>
  .member {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .info h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #1e293b;
  }

  .info p {
    margin: 4px 0 8px;
    color: #64748b;
    font-size: 0.9rem;
  }
</style>
```

And use it in a page:

```svelte
<!-- src/routes/team/+page.svelte -->
<script>
  import TeamMember from '$lib/components/features/TeamMember.svelte';

  const team = [
    { name: 'Alex Chen', role: 'Lead Engineer', avatar: '/avatars/alex.jpg', status: 'active' },
    { name: 'Sam Rivera', role: 'Designer', avatar: '/avatars/sam.jpg', status: 'away' },
    { name: 'Jordan Lee', role: 'PM', avatar: '/avatars/jordan.jpg', status: 'active' }
  ];
</script>

<h1>Our Team</h1>

<div class="team-grid">
  {#each team as member}
    <TeamMember {...member} />
  {/each}
</div>

<style>
  .team-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
    padding: 20px;
  }
</style>
```

This pattern — small UI primitives composed into feature components, used in pages — is how professional Svelte applications are structured. The UI components (`Avatar`, `Badge`, `Card`) are generic and reusable across the entire app. The feature components (`TeamMember`) combine them for specific use cases. The pages wire everything together with data.

## Common Mistakes and Edge Cases

**Forgetting the capital letter**: `<button />` creates an HTML button. `<Button />` instantiates your component. This is the most common beginner mistake and produces confusing results — your component's styles and logic simply do not appear.

**Circular imports**: Component A imports Component B, which imports Component A. Svelte will error or produce undefined behavior. If two components need to reference each other, restructure so a parent component orchestrates both.

**Huge monolith components**: If your component exceeds 300 lines, it almost certainly should be split. The exception is complex form pages where splitting would obscure the data flow.

**Empty `<script>` blocks**: If your component has no logic, omit the `<script>` block entirely. Adding an empty one is harmless but pointless.

## Try It

Build a small component library with these four components:

1. **`Header.svelte`** — A page header that accepts a `title` prop. Include a navigation bar with at least three links. Use flexbox to position the title on the left and links on the right.

2. **`StatCard.svelte`** — A statistics card that accepts `label`, `value`, and `trend` props (trend is `"up"` or `"down"`). Display the value prominently with a colored arrow indicator for the trend.

3. **`UserList.svelte`** — A component that accepts an array of user objects and renders each one using an `Avatar` component you also create.

4. **`Dashboard.svelte`** — A main page component that imports all the above and arranges them in a grid layout. Use at least three `StatCard` instances and a `UserList`.

Focus on file organization: place UI components in `$lib/components/ui/` and the Dashboard in `$lib/components/features/`.

## Key Takeaways

- A **component** is a `.svelte` file that bundles HTML, CSS, and optionally JavaScript into one self-contained unit
- The file has three optional sections: `<script>` (logic), markup (HTML), and `<style>` (scoped CSS), conventionally in that order
- Import components with `import Name from './Name.svelte'` and use them like `<Name />`
- Component names must start with a **capital letter** to distinguish them from HTML elements
- Each component instance has its own **independent state** — instances do not share data
- Svelte is a compiler that turns `.svelte` files into optimized JavaScript with no virtual DOM
- CSS is scoped by default — styles in one component cannot affect another
- Organize components in `$lib/components/` and use the `$lib` alias for clean imports
- Extract a component when you can name the concept, want to reuse it, or need to reduce file size
- Compose small primitive components into larger feature components — this is the professional pattern
