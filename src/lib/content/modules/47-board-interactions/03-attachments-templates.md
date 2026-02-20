# Attachments & Template Patterns

The previous two lessons focused on reusable actions and polished animations. This lesson shifts to the smaller template-level tools that round out TeamBoard's interactivity: attachments for reactive DOM manipulation, template directives for computed values and forced re-mounts, dynamic elements for flexible rendering, and SSR-safe ID generation for accessible forms.

These features are not glamorous on their own, but they solve real problems you will hit in every non-trivial application. A textarea that auto-resizes as you type. A task detail panel that fully resets when you switch between tasks. Computed values inline in a loop without cluttering your script block. Heading levels that adjust to context. Form inputs that pair with labels correctly on both server and client.

Let's build them all into TeamBoard.

## {@attach} for Auto-Resizing Textareas

Task descriptions in TeamBoard use a textarea that should grow taller as the user types, then shrink back when they delete text. An attachment is the perfect tool because it needs to re-run every time the textarea content changes — and attachments are fully reactive to state changes without any `update()` ceremony.

```svelte
<!-- src/lib/components/board/TaskDescription.svelte -->
<script lang="ts">
  interface Props {
    description: string;
    onchange: (value: string) => void;
  }

  let { description = $bindable(), onchange }: Props = $props();
</script>

<textarea
  bind:value={description}
  oninput={() => onchange(description)}
  placeholder="Add a description..."
  {@attach (node) => {
    // Auto-resize logic
    node.style.overflow = 'hidden';
    node.style.resize = 'none';

    // Reset height to auto so scrollHeight reflects actual content height
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight}px`;

    // Also observe resizes from external layout changes
    const observer = new ResizeObserver(() => {
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight}px`;
    });
    observer.observe(node);

    // Cleanup: disconnect the observer when the attachment re-runs or element unmounts
    return () => observer.disconnect();
  }}
></textarea>

<style>
  textarea {
    width: 100%;
    min-height: 80px;
    padding: 12px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    font-family: inherit;
    font-size: 0.9rem;
    line-height: 1.5;
    color: #334155;
    transition: border-color 150ms;
  }

  textarea:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }
</style>
```

Here is what happens under the hood: the attachment function reads `description` because it accesses `node.scrollHeight` after the textarea's value has been set by Svelte's `bind:value`. Every time `description` changes (via typing), Svelte re-runs the attachment. The cleanup function disconnects the old `ResizeObserver` before the new one is created, preventing memory leaks.

Why the `ResizeObserver`? The textarea might resize for reasons other than typing — the browser window could be resized, or a sidebar could collapse, changing the available width. The observer catches these cases.

Compare this to how you would do the same thing with an action:

```svelte
<!-- Action approach (more boilerplate) -->
<textarea use:autoResize={description} bind:value={description}></textarea>
```

The action version requires passing `description` as a parameter and implementing `update()` to re-run the resize logic. The attachment version just reads the state directly — no parameter passing, no `update()`. For one-off DOM manipulation tightly coupled to local state, attachments win on ergonomics.

## {@attach} for Syntax-Highlighted Code Blocks

Task descriptions in TeamBoard can contain code snippets (think of a task like "Fix the SQL injection in this query" with an embedded code sample). An attachment can apply syntax highlighting on mount and re-run when the content changes:

```svelte
<script lang="ts">
  // Using highlight.js for syntax highlighting
  import hljs from 'highlight.js';
  import 'highlight.js/styles/github.css';

  interface Props {
    code: string;
    language: string;
  }

  let { code, language }: Props = $props();
</script>

<pre><code
  class="language-{language}"
  {@attach (node) => {
    // Set the raw text first
    node.textContent = code;

    // Apply syntax highlighting
    hljs.highlightElement(node);

    // Cleanup: reset to plain text so the next run starts clean
    return () => {
      node.textContent = code;
      node.classList.remove('hljs');
    };
  }}
></code></pre>

<style>
  pre {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 16px;
    overflow-x: auto;
    font-size: 0.85rem;
    line-height: 1.6;
  }

  code {
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
  }
</style>
```

When `code` or `language` changes, the attachment re-runs: the cleanup function strips the old highlighting, and the new run applies fresh highlighting with the updated content. This pattern works the same way with Prism.js, Shiki, or any other highlighting library — anything that takes a DOM node and mutates it.

## Attachments vs Actions: When to Use Each

You have seen both patterns now across this course. Here is the definitive guide to choosing:

| | Actions (`use:`) | Attachments (`{@attach}`) |
|---|---|---|
| **Defined** | In a separate function/file | Inline on the element |
| **Reusability** | Used on many elements across many components | Specific to one element in one component |
| **Reactivity** | Params change via `update()` callback | Automatic — re-runs when any `$state` it reads changes |
| **Cleanup** | Return `{ destroy() }` | Return a function (like `$effect`) |
| **TypeScript** | `Action<HTMLElement, Params>` from `svelte/action` | Inline — types inferred from scope |
| **Use when** | Building a reusable library (tooltip, drag, click-outside) | One-off DOM work tied to local state (auto-resize, highlight) |

The key insight: actions are **reusable tools**, attachments are **inline instructions**. If you find yourself copying the same attachment across multiple components, extract it into an action. If an action only ever appears in one place and reads local state, consider inlining it as an attachment.

## {#key} for Resetting Task Detail Panels

When a user clicks different tasks in TeamBoard, the task detail panel on the right should fully reset — all local state cleared, all effects re-run, all entry transitions replayed. Without `{#key}`, Svelte would reuse the same component instance and just update the props, which means old local state lingers:

```svelte
<!-- src/routes/(app)/[teamSlug]/boards/[boardId]/+page.svelte -->
<script lang="ts">
  import TaskDetailPanel from '$components/board/TaskDetailPanel.svelte';

  let selectedTaskId: number | null = $state(null);
</script>

<div class="board-layout">
  <div class="columns">
    <!-- Board columns here... -->
  </div>

  {#if selectedTaskId}
    {#key selectedTaskId}
      <TaskDetailPanel
        taskId={selectedTaskId}
        onclose={() => selectedTaskId = null}
      />
    {/key}
  {/if}
</div>
```

What `{#key selectedTaskId}` does: every time `selectedTaskId` changes, Svelte **destroys** the old `TaskDetailPanel` instance and **creates** a fresh one. This means:

- All `$state` inside `TaskDetailPanel` resets to initial values (unsaved edits gone, scroll position reset)
- All `$effect` blocks run fresh (data fetching re-triggers for the new task)
- All `in:` transitions replay (the panel slides in again)
- All `onMount` logic re-executes

Without `{#key}`, switching from task 5 to task 8 would keep the same component mounted and just update `taskId` via props. That sounds efficient, but it causes bugs: the comment draft from task 5 is still in the textarea, the scroll position is stuck at the bottom, and the entrance transition does not replay because the component never unmounted.

Here is the `TaskDetailPanel` component that benefits from this forced re-mount:

```svelte
<!-- src/lib/components/board/TaskDetailPanel.svelte -->
<script lang="ts">
  import { fly } from 'svelte/transition';
  import { createMotionPreference } from '$state/motion.svelte';

  interface Props {
    taskId: number;
    onclose: () => void;
  }

  let { taskId, onclose }: Props = $props();
  const motion = createMotionPreference();

  // These all reset on re-mount thanks to {#key}
  let commentDraft = $state('');
  let activeTab = $state<'details' | 'activity'>('details');
  let task = $state<any>(null);
  let loading = $state(true);

  // Fetches fresh data on every mount
  $effect(() => {
    loading = true;
    fetch(`/api/tasks/${taskId}`)
      .then((r) => r.json())
      .then((data) => {
        task = data;
        loading = false;
      });
  });
</script>

<aside
  class="detail-panel"
  transition:fly={{ x: 300, duration: motion.duration(300) }}
>
  {#if loading}
    <div class="skeleton">Loading...</div>
  {:else if task}
    <header>
      <h2>{task.title}</h2>
      <button onclick={onclose} aria-label="Close panel">&times;</button>
    </header>

    <nav class="tabs">
      <button
        class:active={activeTab === 'details'}
        onclick={() => activeTab = 'details'}
      >
        Details
      </button>
      <button
        class:active={activeTab === 'activity'}
        onclick={() => activeTab = 'activity'}
      >
        Activity
      </button>
    </nav>

    {#if activeTab === 'details'}
      <div class="tab-content">
        <p>{task.description}</p>
      </div>
    {:else}
      <div class="tab-content">
        <p>Activity feed for task {taskId}</p>
      </div>
    {/if}

    <div class="comment-box">
      <textarea bind:value={commentDraft} placeholder="Write a comment..."></textarea>
      <button disabled={!commentDraft.trim()}>Post Comment</button>
    </div>
  {/if}
</aside>
```

The rule of thumb: use `{#key}` when changing a prop should feel like navigating to an entirely different page, not updating the current one.

## {@const} for Computed Values in Each Blocks

Inside TeamBoard's task lists, you often need computed values derived from each task — how many days since creation, what color to show for the priority, the assignee's initials. Computing these in the `{#each}` body with `{@const}` keeps them close to where they are used instead of cluttering the script block with helper functions:

```svelte
<script lang="ts">
  interface Task {
    id: number;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assignee: { name: string; email: string } | null;
    createdAt: Date;
    dueDate: Date | null;
  }

  interface Props {
    tasks: Task[];
  }

  let { tasks }: Props = $props();

  const priorityConfig: Record<string, { color: string; label: string }> = {
    low: { color: '#22c55e', label: 'Low' },
    medium: { color: '#eab308', label: 'Medium' },
    high: { color: '#f97316', label: 'High' },
    urgent: { color: '#ef4444', label: 'Urgent' }
  };
</script>

<ul class="task-list">
  {#each tasks as task (task.id)}
    {@const daysSinceCreation = Math.floor(
      (Date.now() - task.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )}
    {@const priorityInfo = priorityConfig[task.priority]}
    {@const assigneeInitials = task.assignee
      ? task.assignee.name
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : null}
    {@const isOverdue = task.dueDate ? task.dueDate < new Date() : false}

    <li class="task-card" class:overdue={isOverdue}>
      <div class="task-header">
        <span
          class="priority-badge"
          style="background: {priorityInfo.color}"
        >
          {priorityInfo.label}
        </span>
        <span class="task-title">{task.title}</span>
      </div>

      <div class="task-meta">
        <span class="age" title="Created {task.createdAt.toLocaleDateString()}">
          {#if daysSinceCreation === 0}
            Today
          {:else if daysSinceCreation === 1}
            Yesterday
          {:else}
            {daysSinceCreation}d ago
          {/if}
        </span>

        {#if isOverdue}
          <span class="overdue-badge">Overdue</span>
        {/if}

        {#if assigneeInitials}
          <span class="avatar" title={task.assignee?.name}>
            {assigneeInitials}
          </span>
        {/if}
      </div>
    </li>
  {/each}
</ul>

<style>
  .task-list {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .task-card {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .task-card.overdue {
    border-color: #fca5a5;
    background: #fef2f2;
  }

  .task-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .priority-badge {
    color: white;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .task-title {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .task-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    color: #64748b;
  }

  .overdue-badge {
    color: #ef4444;
    font-weight: 600;
    font-size: 0.75rem;
  }

  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #6366f1;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.65rem;
    font-weight: 600;
    margin-left: auto;
  }
</style>
```

A few rules about `{@const}`:

- It must be at the top level of a block scope (`{#each}`, `{#if}`, `{#snippet}`, etc.) — you cannot use it at the component's root level.
- You can declare multiple `{@const}` in a row, and later ones can reference earlier ones (like `isOverdue` could reference `daysSinceCreation` if you needed it to).
- The values are truly constant within that iteration — they are not reactive. They are recomputed when the each block re-renders because the underlying data changed.

Why use `{@const}` instead of a helper function? You could write `getDaysSinceCreation(task.createdAt)` and call it in the template. But `{@const}` keeps the computation visible right where it is consumed, which makes the template self-documenting. For simple derivations, it is the cleaner choice. For complex logic shared across components, a helper function is still better.

## svelte:element for Dynamic Heading Levels

TeamBoard's board has a visual hierarchy: the board title is an `<h2>`, column headers are `<h3>`, and section headers within the task detail panel are `<h4>`. But sometimes the same component is rendered at different nesting depths. A `BoardSection` component might be an `<h3>` when used at the top level or an `<h4>` when nested inside a group.

`svelte:element` lets you render a dynamic HTML tag:

```svelte
<!-- src/lib/components/ui/SectionHeader.svelte -->
<script lang="ts">
  interface Props {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    children: import('svelte').Snippet;
  }

  let { level = 2, children }: Props = $props();

  // Compute the tag name from the level
  let tag = $derived(`h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6');
</script>

<svelte:element this={tag} class="section-header level-{level}">
  {@render children()}
</svelte:element>

<style>
  .section-header {
    margin: 0 0 12px;
    font-weight: 600;
    color: #1e293b;
  }

  .level-2 { font-size: 1.25rem; }
  .level-3 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
  .level-4 { font-size: 0.9rem; color: #64748b; }
</style>
```

Use it in the board layout:

```svelte
<script lang="ts">
  import SectionHeader from '$components/ui/SectionHeader.svelte';
</script>

<SectionHeader level={2}>Sprint Planning Board</SectionHeader>

<div class="column">
  <SectionHeader level={3}>To Do</SectionHeader>
  <!-- tasks... -->
</div>

<div class="task-detail">
  <SectionHeader level={4}>Description</SectionHeader>
  <!-- description content... -->
</div>
```

Why does this matter? Semantic HTML heading levels are critical for accessibility. Screen readers use heading levels to build a navigable document outline. If you hardcode `<h3>` in a component that sometimes renders at the `<h4>` level, screen reader users get a broken outline with missing or skipped levels. `svelte:element` solves this cleanly.

You can also use `svelte:element` for other dynamic tag scenarios:

```svelte
<script lang="ts">
  interface Props {
    href?: string;
    children: import('svelte').Snippet;
  }

  let { href, children }: Props = $props();

  // Render as <a> if href is provided, otherwise <button>
  let tag = $derived(href ? 'a' : 'button');
</script>

<svelte:element this={tag} {href} class="action-link">
  {@render children()}
</svelte:element>
```

If `this` evaluates to `null` or `undefined`, no element is rendered at all. This can be useful for conditional wrappers, but be careful — it also means a typo in the tag name silently renders nothing.

## $props.id() for Accessible Form Labels

TeamBoard's task creation form has multiple input fields. Each input needs a unique `id` attribute that matches its `<label>`'s `for` attribute. In a client-only app you might use `Math.random()` or a counter, but in SvelteKit with SSR, the ID must match between the server-rendered HTML and the client hydration. If they differ, you get a hydration mismatch error.

`$props.id()` generates a unique, SSR-safe ID that is stable across server and client:

```svelte
<!-- src/lib/components/board/TaskCreateForm.svelte -->
<script lang="ts">
  interface Props {
    columnId: string;
    oncreate: (task: { title: string; priority: string; assigneeId: number | null }) => void;
    oncancel: () => void;
  }

  let { columnId, oncreate, oncancel }: Props = $props();

  let title = $state('');
  let priority = $state('medium');
  let assigneeId = $state<number | null>(null);

  // Generate unique, SSR-safe IDs for this component instance
  const titleId = $props.id();
  const priorityId = $props.id();
  const assigneeId_ = $props.id();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    oncreate({
      title: title.trim(),
      priority,
      assigneeId
    });

    // Reset form
    title = '';
    priority = 'medium';
    assigneeId = null;
  }
</script>

<form onsubmit={handleSubmit} class="task-form">
  <div class="field">
    <label for={titleId}>Title</label>
    <input
      id={titleId}
      type="text"
      bind:value={title}
      placeholder="What needs to be done?"
      required
    />
  </div>

  <div class="field">
    <label for={priorityId}>Priority</label>
    <select id={priorityId} bind:value={priority}>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
      <option value="urgent">Urgent</option>
    </select>
  </div>

  <div class="field">
    <label for={assigneeId_}>Assignee</label>
    <select id={assigneeId_} bind:value={assigneeId}>
      <option value={null}>Unassigned</option>
      <option value={1}>Alice</option>
      <option value={2}>Bob</option>
      <option value={3}>Carol</option>
    </select>
  </div>

  <div class="form-actions">
    <button type="submit" class="primary" disabled={!title.trim()}>
      Create Task
    </button>
    <button type="button" onclick={oncancel}>
      Cancel
    </button>
  </div>
</form>

<style>
  .task-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  input, select {
    padding: 8px 12px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 0.9rem;
    color: #334155;
  }

  input:focus, select:focus {
    outline: none;
    border-color: #6366f1;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .form-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  button {
    padding: 8px 16px;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 0.85rem;
  }

  button.primary {
    background: #6366f1;
    color: white;
    border-color: #6366f1;
  }

  button.primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

Why do label/input pairs matter? When a `<label>` is associated with an input via matching `for`/`id` attributes:

- Clicking the label focuses the input (bigger hit target, especially on mobile)
- Screen readers announce the label text when the input is focused
- Automated accessibility testing tools can verify the association

Without `$props.id()`, you might be tempted to use hardcoded strings like `id="task-title"`. But if you render two `TaskCreateForm` instances on the same page (one per column, perhaps), you get duplicate IDs — which is invalid HTML and confuses assistive technology.

`$props.id()` guarantees uniqueness across component instances and stability across SSR/hydration boundaries. Each call returns a different ID, and calling it the same number of times on the server and client produces the same sequence.

## Putting It All Together

Here is how these patterns combine in a realistic board page:

```svelte
<!-- Simplified board page showing all patterns -->
<script lang="ts">
  import SectionHeader from '$components/ui/SectionHeader.svelte';
  import TaskCreateForm from '$components/board/TaskCreateForm.svelte';
  import hljs from 'highlight.js';

  interface Task {
    id: number;
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high' | 'urgent';
    assignee: { name: string } | null;
    createdAt: Date;
    codeSnippet?: { code: string; language: string };
  }

  let selectedTaskId: number | null = $state(null);
  let tasks: Task[] = $state([
    /* ... loaded from server ... */
  ]);

  const priorityConfig: Record<string, { color: string; label: string }> = {
    low: { color: '#22c55e', label: 'Low' },
    medium: { color: '#eab308', label: 'Medium' },
    high: { color: '#f97316', label: 'High' },
    urgent: { color: '#ef4444', label: 'Urgent' }
  };
</script>

<!-- Dynamic heading level -->
<SectionHeader level={2}>Sprint Board</SectionHeader>

<!-- Task list with computed values -->
{#each tasks as task (task.id)}
  {@const priorityInfo = priorityConfig[task.priority]}
  {@const initials = task.assignee
    ? task.assignee.name.split(' ').map(n => n[0]).join('').toUpperCase()
    : '?'}

  <button class="task-row" onclick={() => selectedTaskId = task.id}>
    <span style="color: {priorityInfo.color}">{priorityInfo.label}</span>
    <span>{task.title}</span>
    <span class="avatar">{initials}</span>
  </button>
{/each}

<!-- Force full re-mount on task switch -->
{#if selectedTaskId}
  {#key selectedTaskId}
    {@const task = tasks.find(t => t.id === selectedTaskId)}

    {#if task}
      <aside class="detail-panel">
        <SectionHeader level={3}>{task.title}</SectionHeader>

        <!-- Auto-resizing description textarea -->
        <textarea
          value={task.description}
          {@attach (node) => {
            node.style.overflow = 'hidden';
            node.style.resize = 'none';
            node.style.height = 'auto';
            node.style.height = `${node.scrollHeight}px`;
          }}
        ></textarea>

        <!-- Syntax highlighted code -->
        {#if task.codeSnippet}
          <SectionHeader level={4}>Code Reference</SectionHeader>
          <pre><code
            {@attach (node) => {
              node.textContent = task.codeSnippet!.code;
              hljs.highlightElement(node);
              return () => {
                node.textContent = task.codeSnippet!.code;
                node.classList.remove('hljs');
              };
            }}
          ></code></pre>
        {/if}
      </aside>
    {/if}
  {/key}
{/if}
```

Every pattern serves a purpose: `{@const}` avoids cluttering the script block with per-task computations, `{#key}` guarantees a clean slate when switching tasks, `{@attach}` handles reactive DOM manipulation without pulling in a full action, `svelte:element` (via `SectionHeader`) maintains proper heading hierarchy, and `$props.id()` (in the form component) keeps labels accessible and SSR-safe.

## Try It

Build a `TaskQuickEditor` component that combines several patterns from this lesson:

1. Use `{@attach}` on a textarea that auto-resizes as the user types a task description.
2. Below the textarea, render a live preview of the description. If the description contains a fenced code block (text between triple backticks), use another `{@attach}` to apply syntax highlighting to the code block element.
3. Wrap the entire component in `{#key taskId}` so that switching between tasks resets the local editing state (draft text, preview scroll position).
4. Add a "Priority" and "Assignee" select using `$props.id()` for accessible label pairing.
5. Inside the preview, use `{@const}` to compute the word count of the description and display it below the preview.

## Key Takeaways

- `{@attach}` runs on mount and re-runs automatically when reactive state changes — ideal for one-off DOM manipulation like auto-resizing textareas and applying syntax highlighting
- Attachments return a cleanup function (not a `{ destroy() }` object) that runs before re-execution and on unmount — use it to disconnect observers, clear timers, or reset DOM mutations
- Use actions for reusable, cross-component behaviors (tooltip, drag, click-outside) and attachments for inline, component-specific DOM work
- `{#key expression}` destroys and recreates its contents when the expression changes — use it to force full re-mounts when changing a prop should reset all local state and replay transitions
- `{@const}` declares computed values inside template block scopes like `{#each}` — keeps derived values close to where they are used without cluttering the script block
- `svelte:element` renders a dynamic HTML tag based on a variable — essential for components that need to render different semantic elements based on context (heading levels, link vs button)
- `$props.id()` generates unique IDs that match between SSR and client hydration — always use it for label/input `for`/`id` pairs instead of hardcoded strings or random values
