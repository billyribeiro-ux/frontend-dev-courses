# State Patterns

Now that you know how to create and share state, let us explore patterns that solve real-world problems. These are not abstract concepts — they are solutions to issues you will encounter the moment your app grows beyond a few pages.

State management is less about the tools you use and more about how you organize data. The patterns in this lesson will help you keep state predictable, efficient, and easy to debug.

## Simple State Machines

A state machine ensures your UI can only be in one valid state at a time. Instead of juggling multiple booleans, use a single string value:

```typescript
// src/lib/state/form-machine.svelte.ts
type FormState = 'idle' | 'submitting' | 'success' | 'error';

class FormMachine {
  current = $state<FormState>('idle');
  errorMessage = $state('');

  submit() {
    this.current = 'submitting';
    this.errorMessage = '';
  }

  succeed() {
    this.current = 'success';
  }

  fail(message: string) {
    this.current = 'error';
    this.errorMessage = message;
  }

  reset() {
    this.current = 'idle';
    this.errorMessage = '';
  }
}

export const formState = new FormMachine();
```

```svelte
<script>
  import { formState } from '$lib/state/form-machine.svelte';
</script>

{#if formState.current === 'idle'}
  <button onclick={() => formState.submit()}>Submit</button>
{:else if formState.current === 'submitting'}
  <p>Sending...</p>
{:else if formState.current === 'success'}
  <p>Done!</p>
{:else if formState.current === 'error'}
  <p>Error: {formState.errorMessage}</p>
  <button onclick={() => formState.reset()}>Try Again</button>
{/if}
```

No more impossible states like `isLoading: true` and `isError: true` at the same time.

## Derived State

Use `$derived` to compute values from existing state. Derived state always stays in sync and never gets stale:

```typescript
// src/lib/state/todos.svelte.ts
class TodoStore {
  items = $state<Array<{ id: number; text: string; done: boolean }>>([]);

  completed = $derived(this.items.filter(t => t.done));
  remaining = $derived(this.items.filter(t => !t.done));
  progress = $derived(
    this.items.length ? Math.round((this.completed.length / this.items.length) * 100) : 0
  );

  add(text: string) {
    this.items.push({ id: Date.now(), text, done: false });
  }

  toggle(id: number) {
    const item = this.items.find(t => t.id === id);
    if (item) item.done = !item.done;
  }
}

export const todos = new TodoStore();
```

## Optimistic Updates

Do not make users wait for the server. Update the UI immediately and roll back if the request fails:

```typescript
// src/lib/state/tasks.svelte.ts
class TaskStore {
  tasks = $state<Array<{ id: number; title: string }>>([]);

  async deleteTask(id: number) {
    // Save a copy for rollback
    const backup = [...this.tasks];

    // Optimistic: remove immediately
    this.tasks = this.tasks.filter(t => t.id !== id);

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
    } catch {
      // Rollback on failure
      this.tasks = backup;
    }
  }
}

export const taskStore = new TaskStore();
```

## Undo/Redo Pattern

Keep a history stack to enable undo and redo:

```typescript
// src/lib/state/editor.svelte.ts
class EditorState {
  content = $state('');
  private history = $state<string[]>(['']);
  private historyIndex = $state(0);

  get canUndo() {
    return this.historyIndex > 0;
  }

  get canRedo() {
    return this.historyIndex < this.history.length - 1;
  }

  update(newContent: string) {
    // Discard any redo history
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(newContent);
    this.historyIndex++;
    this.content = newContent;
  }

  undo() {
    if (!this.canUndo) return;
    this.historyIndex--;
    this.content = this.history[this.historyIndex];
  }

  redo() {
    if (!this.canRedo) return;
    this.historyIndex++;
    this.content = this.history[this.historyIndex];
  }
}

export const editor = new EditorState();
```

## Try It

Build a shopping list state class that combines several patterns: use a state machine for fetch status (`idle`, `loading`, `loaded`, `error`), derive a `totalCost` from the items, and implement optimistic removal with rollback.

## Key Takeaways

- State machines prevent impossible states by using a single status value instead of multiple booleans
- `$derived` computes values from other state and keeps them automatically in sync
- Optimistic updates improve perceived performance by updating the UI before the server responds
- Undo/redo uses a history stack and an index pointer to navigate between previous states
- Combining these patterns creates robust, production-quality state management without external libraries
