# State Patterns

Now that you know how to create and share state, let us explore patterns that solve real-world problems. These are not abstract concepts — they are battle-tested solutions to issues you will encounter the moment your app grows beyond a few pages. Every pattern here addresses a specific failure mode: impossible UI states, stale derived data, lost user input, race conditions between client and server, or debugging nightmares in production.

State management is less about the tools you use and more about how you organize data flow. The mental model is simple: state flows down, events flow up, and derived values are computed — never stored independently. The patterns in this lesson will help you keep state predictable, efficient, and easy to debug.

## The Reducer Pattern

When multiple actions can modify the same state, scattering mutation logic across components creates bugs. The reducer pattern centralizes all state transitions into a single function. Every mutation flows through one place, making the logic auditable and testable.

```typescript
// src/lib/state/cart-reducer.svelte.ts

type CartItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type CartAction =
  | { type: 'ADD_ITEM'; item: Omit<CartItem, 'quantity'> }
  | { type: 'REMOVE_ITEM'; id: string }
  | { type: 'UPDATE_QUANTITY'; id: string; quantity: number }
  | { type: 'APPLY_COUPON'; code: string; discount: number }
  | { type: 'CLEAR' };

type CartState = {
  items: CartItem[];
  coupon: { code: string; discount: number } | null;
};

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existing = state.items.find(i => i.id === action.item.id);
      if (existing) {
        return {
          ...state,
          items: state.items.map(i =>
            i.id === action.item.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          )
        };
      }
      return {
        ...state,
        items: [...state.items, { ...action.item, quantity: 1 }]
      };
    }
    case 'REMOVE_ITEM':
      return {
        ...state,
        items: state.items.filter(i => i.id !== action.id)
      };
    case 'UPDATE_QUANTITY':
      return {
        ...state,
        items: action.quantity <= 0
          ? state.items.filter(i => i.id !== action.id)
          : state.items.map(i =>
              i.id === action.id ? { ...i, quantity: action.quantity } : i
            )
      };
    case 'APPLY_COUPON':
      return {
        ...state,
        coupon: { code: action.code, discount: action.discount }
      };
    case 'CLEAR':
      return { items: [], coupon: null };
  }
}

class CartStore {
  #state = $state<CartState>({ items: [], coupon: null });

  // Expose read-only access to state
  get items() { return this.#state.items; }
  get coupon() { return this.#state.coupon; }

  // Derived values computed from the canonical state
  subtotal = $derived(
    this.#state.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  );

  discount = $derived(
    this.#state.coupon
      ? this.subtotal * this.#state.coupon.discount
      : 0
  );

  total = $derived(this.subtotal - this.discount);
  itemCount = $derived(this.#state.items.reduce((sum, i) => sum + i.quantity, 0));

  dispatch(action: CartAction) {
    this.#state = cartReducer(this.#state, action);
  }
}

export const cart = new CartStore();
```

The key insight: `dispatch` is the only way to modify state. This means you can log every action, replay them for debugging, or serialize them for undo/redo. The reducer is a pure function — given the same state and action, it always returns the same result. This makes it trivially testable:

```typescript
// cart-reducer.test.ts
import { describe, it, expect } from 'vitest';

describe('cartReducer', () => {
  it('adds a new item with quantity 1', () => {
    const state = { items: [], coupon: null };
    const result = cartReducer(state, {
      type: 'ADD_ITEM',
      item: { id: '1', name: 'Shirt', price: 29.99 }
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(1);
  });

  it('increments quantity for existing items', () => {
    const state = {
      items: [{ id: '1', name: 'Shirt', price: 29.99, quantity: 1 }],
      coupon: null
    };
    const result = cartReducer(state, {
      type: 'ADD_ITEM',
      item: { id: '1', name: 'Shirt', price: 29.99 }
    });
    expect(result.items[0].quantity).toBe(2);
  });
});
```

## Simple State Machines

A state machine ensures your UI can only be in one valid state at a time. Instead of juggling multiple booleans — `isLoading`, `isError`, `isSuccess` — you use a single discriminated union. This eliminates impossible states entirely. You cannot be loading and errored simultaneously. You cannot be both idle and successful.

The mental model: draw a diagram of circles (states) and arrows (transitions). Each arrow is labeled with the event that triggers it. If there is no arrow from state A to state B, that transition is forbidden. The code enforces the diagram.

```typescript
// src/lib/state/form-machine.svelte.ts
type FormState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'success'; message: string }
  | { status: 'error'; error: string; retryCount: number };

class FormMachine {
  current = $state<FormState>({ status: 'idle' });

  // Derived booleans for template convenience
  isSubmitting = $derived(this.current.status === 'submitting');
  isIdle = $derived(this.current.status === 'idle');

  submit() {
    // Guard: only allow submitting from idle or error states
    if (this.current.status !== 'idle' && this.current.status !== 'error') {
      return;
    }
    this.current = { status: 'submitting' };
  }

  succeed(message: string) {
    if (this.current.status !== 'submitting') return;
    this.current = { status: 'success', message };
  }

  fail(error: string) {
    if (this.current.status !== 'submitting') return;
    const retryCount = this.current.status === 'submitting' ? 0 : 0;
    this.current = { status: 'error', error, retryCount };
  }

  reset() {
    this.current = { status: 'idle' };
  }
}

export const formState = new FormMachine();
```

Notice how the state carries associated data. The error state has an `error` string and `retryCount`. The success state has a `message`. You cannot accidentally read `error` when in the success state because TypeScript narrows the type.

```svelte
<script lang="ts">
  import { formState } from '$lib/state/form-machine.svelte';

  async function handleSubmit() {
    formState.submit();
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ message: 'Hello' })
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      formState.succeed('Message sent successfully!');
    } catch (err) {
      formState.fail(err instanceof Error ? err.message : 'Unknown error');
    }
  }
</script>

{#if formState.current.status === 'idle'}
  <button onclick={handleSubmit}>Submit</button>
{:else if formState.current.status === 'submitting'}
  <p>Sending...</p>
{:else if formState.current.status === 'success'}
  <p>{formState.current.message}</p>
  <button onclick={() => formState.reset()}>Send Another</button>
{:else if formState.current.status === 'error'}
  <p>Error: {formState.current.error}</p>
  <button onclick={handleSubmit}>Retry</button>
  <button onclick={() => formState.reset()}>Cancel</button>
{/if}
```

For complex flows with many states — think a multi-step checkout, a file upload pipeline, or a game — consider modeling the entire flow as a state machine. The upfront investment in defining valid transitions prevents entire categories of bugs.

## Multi-Step State Machine

Real applications often have state machines with many states and complex transitions. Here is a checkout flow that prevents users from reaching invalid states:

```typescript
// src/lib/state/checkout-machine.svelte.ts
type CheckoutStep =
  | { step: 'cart'; validationErrors: string[] }
  | { step: 'shipping'; address: Partial<ShippingAddress> }
  | { step: 'payment'; paymentMethod: string | null }
  | { step: 'confirming' }
  | { step: 'complete'; orderId: string }
  | { step: 'failed'; error: string; failedAt: string };

type ShippingAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
};

class CheckoutMachine {
  current = $state<CheckoutStep>({ step: 'cart', validationErrors: [] });

  // Guard: only move forward from allowed states
  toShipping() {
    if (this.current.step !== 'cart') return;
    this.current = { step: 'shipping', address: {} };
  }

  toPayment(address: ShippingAddress) {
    if (this.current.step !== 'shipping') return;
    this.current = { step: 'payment', paymentMethod: null };
  }

  toConfirming(paymentMethod: string) {
    if (this.current.step !== 'payment') return;
    this.current = { step: 'confirming' };
  }

  complete(orderId: string) {
    if (this.current.step !== 'confirming') return;
    this.current = { step: 'complete', orderId };
  }

  fail(error: string) {
    if (this.current.step !== 'confirming') return;
    this.current = { step: 'failed', error, failedAt: new Date().toISOString() };
  }

  // Allow going back — but only to specific previous steps
  back() {
    switch (this.current.step) {
      case 'shipping':
        this.current = { step: 'cart', validationErrors: [] };
        break;
      case 'payment':
        this.current = { step: 'shipping', address: {} };
        break;
      case 'failed':
        this.current = { step: 'payment', paymentMethod: null };
        break;
    }
  }

  reset() {
    this.current = { step: 'cart', validationErrors: [] };
  }
}

export const checkout = new CheckoutMachine();
```

## Derived State and Derived Chains

Use `$derived` to compute values from existing state. Derived state always stays in sync and never gets stale. The key rule: **never store a value that can be computed from other state**. If you store it separately, you create a synchronization bug waiting to happen.

```typescript
// src/lib/state/todos.svelte.ts
class TodoStore {
  items = $state<Array<{ id: number; text: string; done: boolean; category: string }>>([]);
  filter = $state<'all' | 'active' | 'completed'>('all');
  searchQuery = $state('');

  // First-level derivations
  completed = $derived(this.items.filter(t => t.done));
  remaining = $derived(this.items.filter(t => !t.done));
  progress = $derived(
    this.items.length ? Math.round((this.completed.length / this.items.length) * 100) : 0
  );

  // Second-level derivation: filtered depends on filter + items
  filtered = $derived.by(() => {
    let result = this.items;

    // Apply status filter
    switch (this.filter) {
      case 'active':
        result = result.filter(t => !t.done);
        break;
      case 'completed':
        result = result.filter(t => t.done);
        break;
    }

    // Apply search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      result = result.filter(t => t.text.toLowerCase().includes(query));
    }

    return result;
  });

  // Third-level derivation: grouped depends on filtered
  groupedByCategory = $derived.by(() => {
    const groups = new Map<string, typeof this.filtered>();
    for (const item of this.filtered) {
      const list = groups.get(item.category) ?? [];
      list.push(item);
      groups.set(item.category, list);
    }
    return groups;
  });

  // Summary depends on multiple derivations
  summary = $derived(
    `${this.remaining.length} remaining, ${this.completed.length} done (${this.progress}%)`
  );

  add(text: string, category: string = 'general') {
    this.items.push({ id: Date.now(), text, done: false, category });
  }

  toggle(id: number) {
    const item = this.items.find(t => t.id === id);
    if (item) item.done = !item.done;
  }

  remove(id: number) {
    const index = this.items.findIndex(t => t.id === id);
    if (index !== -1) this.items.splice(index, 1);
  }
}

export const todos = new TodoStore();
```

**Performance of derived chains.** Svelte 5 tracks fine-grained dependencies. When you change `searchQuery`, only `filtered`, `groupedByCategory`, and anything reading those values re-evaluates. The `completed`, `remaining`, and `progress` derivations do not run because they depend on `items` (which did not change), not on `searchQuery`. This is the advantage of `$derived` over manual computation — the framework handles the dependency graph for you.

Use `$derived.by` when the derivation needs multiple statements or conditional logic. Use plain `$derived` for single-expression computations.

**Warning about derived chains:** do not create circular dependencies. If `A` derives from `B` and `B` derives from `A`, Svelte will throw an error. Always ensure your dependency graph is a directed acyclic graph (DAG).

## Optimistic Updates

Do not make users wait for the server. Update the UI immediately and roll back if the request fails. This pattern makes your app feel instant, even on slow connections.

The key to getting this right: save a snapshot of the previous state before the optimistic update, then restore that exact snapshot if the server rejects the change.

```typescript
// src/lib/state/tasks.svelte.ts

type Task = {
  id: number;
  title: string;
  completed: boolean;
  position: number;
};

class TaskStore {
  tasks = $state<Task[]>([]);
  #pendingOps = $state(0);
  isSyncing = $derived(this.#pendingOps > 0);

  async deleteTask(id: number) {
    // Snapshot for rollback
    const snapshot = $state.snapshot(this.tasks);

    // Optimistic: remove immediately
    this.tasks = this.tasks.filter(t => t.id !== id);
    this.#pendingOps++;

    try {
      const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
    } catch (err) {
      // Rollback on failure
      this.tasks = snapshot;
      console.error('Delete failed, rolled back:', err);
      // In production, show a toast notification to the user
    } finally {
      this.#pendingOps--;
    }
  }

  async toggleComplete(id: number) {
    const snapshot = $state.snapshot(this.tasks);
    const task = this.tasks.find(t => t.id === id);
    if (!task) return;

    // Optimistic update
    task.completed = !task.completed;
    this.#pendingOps++;

    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: task.completed })
      });
      if (!res.ok) throw new Error(`Toggle failed: ${res.status}`);
    } catch (err) {
      this.tasks = snapshot;
      console.error('Toggle failed, rolled back:', err);
    } finally {
      this.#pendingOps--;
    }
  }

  async reorder(fromIndex: number, toIndex: number) {
    const snapshot = $state.snapshot(this.tasks);

    // Optimistic reorder
    const [moved] = this.tasks.splice(fromIndex, 1);
    this.tasks.splice(toIndex, 0, moved);

    // Recalculate positions
    this.tasks.forEach((t, i) => { t.position = i; });
    this.#pendingOps++;

    try {
      const res = await fetch('/api/tasks/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: this.tasks.map(t => ({ id: t.id, position: t.position }))
        })
      });
      if (!res.ok) throw new Error('Reorder failed');
    } catch (err) {
      this.tasks = snapshot;
      console.error('Reorder failed, rolled back:', err);
    } finally {
      this.#pendingOps--;
    }
  }
}

export const taskStore = new TaskStore();
```

**Race condition awareness.** If the user rapidly toggles a task, you could end up with two in-flight requests that return in the wrong order. The snapshot approach handles this naturally — each operation captures the state at its point in time. For more complex scenarios (like real-time collaborative editing), you need conflict resolution strategies like operational transforms or CRDTs, which are beyond the scope of this lesson.

## Undo/Redo with the Command Pattern

The command pattern takes undo/redo further than a simple history stack. Each action is an object that knows how to execute itself and how to reverse itself. This makes undo/redo work for any operation, not just text changes.

```typescript
// src/lib/state/command-history.svelte.ts

interface Command {
  execute(): void;
  undo(): void;
  description: string;
}

class CommandHistory {
  #undoStack = $state<Command[]>([]);
  #redoStack = $state<Command[]>([]);
  #maxHistory: number;

  canUndo = $derived(this.#undoStack.length > 0);
  canRedo = $derived(this.#redoStack.length > 0);
  undoDescription = $derived(
    this.#undoStack.length > 0
      ? this.#undoStack[this.#undoStack.length - 1].description
      : ''
  );
  redoDescription = $derived(
    this.#redoStack.length > 0
      ? this.#redoStack[this.#redoStack.length - 1].description
      : ''
  );

  constructor(maxHistory = 50) {
    this.#maxHistory = maxHistory;
  }

  execute(command: Command) {
    command.execute();
    this.#undoStack.push(command);
    // Clear redo stack — new action invalidates future history
    this.#redoStack = [];
    // Trim history if it exceeds max
    if (this.#undoStack.length > this.#maxHistory) {
      this.#undoStack.shift();
    }
  }

  undo() {
    const command = this.#undoStack.pop();
    if (!command) return;
    command.undo();
    this.#redoStack.push(command);
  }

  redo() {
    const command = this.#redoStack.pop();
    if (!command) return;
    command.execute();
    this.#undoStack.push(command);
  }

  clear() {
    this.#undoStack = [];
    this.#redoStack = [];
  }
}

export const history = new CommandHistory();
```

Now create concrete commands for your domain:

```typescript
// src/lib/state/canvas-commands.svelte.ts
import { history } from './command-history.svelte';

type Shape = {
  id: string;
  type: 'rect' | 'circle' | 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

class CanvasStore {
  shapes = $state<Shape[]>([]);
  selectedId = $state<string | null>(null);

  selected = $derived(this.shapes.find(s => s.id === this.selectedId) ?? null);

  addShape(shape: Shape) {
    history.execute({
      description: `Add ${shape.type}`,
      execute: () => {
        this.shapes.push(shape);
        this.selectedId = shape.id;
      },
      undo: () => {
        this.shapes = this.shapes.filter(s => s.id !== shape.id);
        this.selectedId = null;
      }
    });
  }

  moveShape(id: string, newX: number, newY: number) {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape) return;

    const oldX = shape.x;
    const oldY = shape.y;

    history.execute({
      description: `Move ${shape.type}`,
      execute: () => {
        const s = this.shapes.find(s => s.id === id);
        if (s) { s.x = newX; s.y = newY; }
      },
      undo: () => {
        const s = this.shapes.find(s => s.id === id);
        if (s) { s.x = oldX; s.y = oldY; }
      }
    });
  }

  changeColor(id: string, newColor: string) {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape) return;

    const oldColor = shape.color;

    history.execute({
      description: `Change color to ${newColor}`,
      execute: () => {
        const s = this.shapes.find(s => s.id === id);
        if (s) s.color = newColor;
      },
      undo: () => {
        const s = this.shapes.find(s => s.id === id);
        if (s) s.color = oldColor;
      }
    });
  }

  deleteShape(id: string) {
    const shape = this.shapes.find(s => s.id === id);
    if (!shape) return;

    const snapshot = { ...shape };
    const index = this.shapes.findIndex(s => s.id === id);

    history.execute({
      description: `Delete ${shape.type}`,
      execute: () => {
        this.shapes = this.shapes.filter(s => s.id !== id);
        if (this.selectedId === id) this.selectedId = null;
      },
      undo: () => {
        this.shapes.splice(index, 0, snapshot);
        this.selectedId = id;
      }
    });
  }
}

export const canvas = new CanvasStore();
```

Wire up keyboard shortcuts in a component:

```svelte
<script lang="ts">
  import { history } from '$lib/state/command-history.svelte';
  import { canvas } from '$lib/state/canvas-commands.svelte';

  function handleKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        history.redo();
      } else {
        history.undo();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="toolbar">
  <button onclick={() => history.undo()} disabled={!history.canUndo}>
    Undo {history.undoDescription}
  </button>
  <button onclick={() => history.redo()} disabled={!history.canRedo}>
    Redo {history.redoDescription}
  </button>
</div>
```

## State Sync: Local + Server

Real applications maintain state in two places: the client (for instant UI) and the server (for persistence). The challenge is keeping them synchronized without race conditions, stale data, or lost updates.

```typescript
// src/lib/state/synced-store.svelte.ts

type SyncStatus = 'synced' | 'pending' | 'saving' | 'error';

class SyncedStore<T extends { id: string }> {
  items = $state<T[]>([]);
  #syncStatus = $state<Map<string, SyncStatus>>(new Map());
  #saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  #endpoint: string;

  lastSyncedAt = $state<Date | null>(null);
  pendingCount = $derived(
    [...this.#syncStatus.values()].filter(s => s !== 'synced').length
  );

  constructor(endpoint: string) {
    this.#endpoint = endpoint;
  }

  async load() {
    const res = await fetch(this.#endpoint);
    if (!res.ok) throw new Error('Failed to load data');
    this.items = await res.json();
    this.lastSyncedAt = new Date();
    // Mark all as synced
    for (const item of this.items) {
      this.#syncStatus.set(item.id, 'synced');
    }
  }

  getStatus(id: string): SyncStatus {
    return this.#syncStatus.get(id) ?? 'synced';
  }

  // Update locally and schedule a server save with debounce
  update(id: string, changes: Partial<T>) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    // Apply local changes immediately
    Object.assign(item, changes);
    this.#syncStatus.set(id, 'pending');

    // Debounce server save — wait 500ms after last change
    const existing = this.#saveTimers.get(id);
    if (existing) clearTimeout(existing);

    this.#saveTimers.set(
      id,
      setTimeout(() => this.#saveToServer(id), 500)
    );
  }

  async #saveToServer(id: string) {
    const item = this.items.find(i => i.id === id);
    if (!item) return;

    this.#syncStatus.set(id, 'saving');

    try {
      const res = await fetch(`${this.#endpoint}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify($state.snapshot(item))
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      this.#syncStatus.set(id, 'synced');
      this.lastSyncedAt = new Date();
    } catch (err) {
      this.#syncStatus.set(id, 'error');
      console.error(`Failed to save item ${id}:`, err);
    }
  }

  // Force sync all pending items (e.g., before page unload)
  async flush() {
    // Clear all debounce timers
    for (const timer of this.#saveTimers.values()) {
      clearTimeout(timer);
    }
    this.#saveTimers.clear();

    // Save all pending items
    const pending = this.items.filter(
      i => this.#syncStatus.get(i.id) !== 'synced'
    );

    await Promise.allSettled(
      pending.map(item => this.#saveToServer(item.id))
    );
  }
}

// Usage
export const notes = new SyncedStore<{
  id: string;
  title: string;
  content: string;
  updatedAt: string;
}>('/api/notes');
```

Show sync status in the UI:

```svelte
<script lang="ts">
  import { notes } from '$lib/state/synced-store.svelte';
  import { onMount } from 'svelte';

  onMount(() => {
    notes.load();

    // Flush pending saves before the user leaves
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (notes.pendingCount > 0) {
        e.preventDefault();
        notes.flush();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  });
</script>

<div class="sync-bar">
  {#if notes.pendingCount > 0}
    <span class="pending">Saving {notes.pendingCount} changes...</span>
  {:else}
    <span class="synced">All changes saved</span>
  {/if}
</div>

{#each notes.items as note}
  <div class="note" class:saving={notes.getStatus(note.id) === 'saving'}>
    <input
      value={note.title}
      oninput={(e) => notes.update(note.id, { title: e.currentTarget.value })}
    />
    <textarea
      value={note.content}
      oninput={(e) => notes.update(note.id, { content: e.currentTarget.value })}
    ></textarea>
    <span class="status">{notes.getStatus(note.id)}</span>
  </div>
{/each}
```

## Immutable Patterns with `$state.raw`

By default, `$state` deeply proxies objects and arrays, making every nested property reactive. This is powerful but has a cost: every property access goes through a proxy. For large datasets that you replace wholesale (like paginated API results), use `$state.raw` to skip the proxy overhead.

```typescript
// src/lib/state/data-table.svelte.ts

type Row = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
};

class DataTableStore {
  // Raw state — no deep proxying. Svelte tracks assignment, not mutation.
  rows = $state.raw<Row[]>([]);
  page = $state(1);
  pageSize = $state(25);
  totalPages = $state(1);
  sortBy = $state<keyof Row>('name');
  sortDir = $state<'asc' | 'desc'>('asc');

  // Derived works the same with raw state
  sorted = $derived.by(() => {
    const copy = [...this.rows];
    copy.sort((a, b) => {
      const valA = a[this.sortBy];
      const valB = b[this.sortBy];
      const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
      return this.sortDir === 'asc' ? cmp : -cmp;
    });
    return copy;
  });

  async loadPage(page: number) {
    this.page = page;
    const res = await fetch(
      `/api/users?page=${page}&size=${this.pageSize}&sort=${this.sortBy}&dir=${this.sortDir}`
    );
    const data = await res.json();

    // Replace the entire array — this is what triggers reactivity with raw state
    this.rows = data.rows;
    this.totalPages = data.totalPages;
  }

  toggleSort(column: keyof Row) {
    if (this.sortBy === column) {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortDir = 'asc';
    }
    this.loadPage(1);
  }
}

export const dataTable = new DataTableStore();
```

**When to use `$state.raw`:**
- Large arrays (100+ items) that you replace entirely, not mutate individually
- Data from API responses that you display but rarely edit in place
- Immutable data structures where you always create new objects

**When to use regular `$state`:**
- Interactive data where individual properties change (form fields, toggles)
- Small arrays where items are added, removed, or reordered
- Any state where you need fine-grained mutation tracking

The rule of thumb: if you always reassign the entire value, use `$state.raw`. If you mutate individual properties or array elements, use `$state`.

## Debugging with `$inspect`

`$inspect` is a development-only rune that logs state changes. It is stripped from production builds, so you can leave it in your code without performance concerns.

```typescript
// src/lib/state/debug-example.svelte.ts

class AuthStore {
  user = $state<{ name: string; email: string } | null>(null);
  token = $state<string | null>(null);
  isAuthenticated = $derived(this.user !== null && this.token !== null);

  // This runs in development only. Removed in production builds.
  // Place $inspect calls at the top level of a .svelte or .svelte.ts file.
}
```

```svelte
<script lang="ts">
  import { todos } from '$lib/state/todos.svelte';

  // Basic: logs whenever todos.items changes
  $inspect(todos.items);

  // With custom handler: send to a debug panel instead of console
  $inspect(todos.items).with((type, value) => {
    if (type === 'update') {
      console.table(value);  // Pretty-print as table
    }
  });

  // Track multiple values
  $inspect(todos.filter, todos.searchQuery);

  // Track derived values to verify they recompute correctly
  $inspect(todos.filtered.length);
</script>
```

`$inspect` fires on two occasions: `'init'` (when the value is first set) and `'update'` (when it changes). The `.with()` callback lets you customize what happens — log to a debug panel, send to a monitoring service, or trigger breakpoints:

```svelte
<script lang="ts">
  import { cart } from '$lib/state/cart-reducer.svelte';

  // Trigger a debugger breakpoint when total exceeds a threshold
  $inspect(cart.total).with((type, value) => {
    if (type === 'update' && value > 10000) {
      debugger; // Pause execution for inspection
    }
  });
</script>
```

## Class-Based State Management

Svelte 5's class-based approach is not just syntactic sugar — it provides genuine encapsulation. Private fields (`#`) prevent external code from bypassing your state transitions. Public methods define the API surface. Derived values expose computed state without allowing consumers to overwrite them.

Here is a production-quality auth store that demonstrates proper encapsulation:

```typescript
// src/lib/state/auth.svelte.ts

type User = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  avatarUrl: string | null;
};

type AuthState =
  | { status: 'unauthenticated' }
  | { status: 'authenticating' }
  | { status: 'authenticated'; user: User; expiresAt: number }
  | { status: 'error'; error: string };

class AuthStore {
  #state = $state<AuthState>({ status: 'unauthenticated' });
  #refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Public read-only access
  get status() { return this.#state.status; }

  user = $derived(
    this.#state.status === 'authenticated' ? this.#state.user : null
  );
  isAdmin = $derived(
    this.#state.status === 'authenticated' && this.#state.user.role === 'admin'
  );
  isAuthenticated = $derived(this.#state.status === 'authenticated');
  error = $derived(
    this.#state.status === 'error' ? this.#state.error : null
  );

  async login(email: string, password: string) {
    if (this.#state.status === 'authenticating') return;
    this.#state = { status: 'authenticating' };

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message ?? 'Login failed');
      }

      const { user, expiresIn } = await res.json();
      const expiresAt = Date.now() + expiresIn * 1000;
      this.#state = { status: 'authenticated', user, expiresAt };
      this.#scheduleRefresh(expiresIn);
    } catch (err) {
      this.#state = {
        status: 'error',
        error: err instanceof Error ? err.message : 'Login failed'
      };
    }
  }

  async logout() {
    if (this.#refreshTimer) clearTimeout(this.#refreshTimer);
    await fetch('/api/auth/logout', { method: 'POST' });
    this.#state = { status: 'unauthenticated' };
  }

  #scheduleRefresh(expiresInSeconds: number) {
    // Refresh the token 60 seconds before it expires
    const refreshIn = (expiresInSeconds - 60) * 1000;
    if (refreshIn <= 0) return;

    this.#refreshTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST' });
        if (!res.ok) throw new Error('Refresh failed');
        const { user, expiresIn } = await res.json();
        const expiresAt = Date.now() + expiresIn * 1000;
        this.#state = { status: 'authenticated', user, expiresAt };
        this.#scheduleRefresh(expiresIn);
      } catch {
        this.#state = { status: 'unauthenticated' };
      }
    }, refreshIn);
  }
}

// Singleton — one instance for the entire app
export const auth = new AuthStore();
```

## Complete Complex State Example

Let us combine every pattern into a realistic project management board. This example uses a state machine for board status, a reducer for card operations, optimistic updates for drag-and-drop, derived state for filtered views, and command history for undo/redo.

```typescript
// src/lib/state/board.svelte.ts

type Card = {
  id: string;
  title: string;
  description: string;
  columnId: string;
  position: number;
  assigneeId: string | null;
  labels: string[];
  createdAt: string;
};

type Column = {
  id: string;
  title: string;
  position: number;
};

type BoardAction =
  | { type: 'MOVE_CARD'; cardId: string; toColumnId: string; toPosition: number }
  | { type: 'ADD_CARD'; card: Card }
  | { type: 'UPDATE_CARD'; cardId: string; changes: Partial<Card> }
  | { type: 'DELETE_CARD'; cardId: string }
  | { type: 'ADD_COLUMN'; column: Column }
  | { type: 'RENAME_COLUMN'; columnId: string; title: string };

type BoardData = {
  columns: Column[];
  cards: Card[];
};

function boardReducer(state: BoardData, action: BoardAction): BoardData {
  switch (action.type) {
    case 'MOVE_CARD': {
      const cards = state.cards.map(c => {
        if (c.id === action.cardId) {
          return { ...c, columnId: action.toColumnId, position: action.toPosition };
        }
        return c;
      });
      return { ...state, cards };
    }
    case 'ADD_CARD':
      return { ...state, cards: [...state.cards, action.card] };
    case 'UPDATE_CARD': {
      const cards = state.cards.map(c =>
        c.id === action.cardId ? { ...c, ...action.changes } : c
      );
      return { ...state, cards };
    }
    case 'DELETE_CARD':
      return { ...state, cards: state.cards.filter(c => c.id !== action.cardId) };
    case 'ADD_COLUMN':
      return { ...state, columns: [...state.columns, action.column] };
    case 'RENAME_COLUMN': {
      const columns = state.columns.map(c =>
        c.id === action.columnId ? { ...c, title: action.title } : c
      );
      return { ...state, columns };
    }
  }
}

class BoardStore {
  #data = $state<BoardData>({ columns: [], cards: [] });
  #history = $state<BoardData[]>([]);
  #historyIndex = $state(-1);
  #maxHistory = 30;

  filterLabel = $state<string | null>(null);
  filterAssignee = $state<string | null>(null);
  searchQuery = $state('');

  // Read-only views
  get columns() { return this.#data.columns.sort((a, b) => a.position - b.position); }

  // Cards for a given column, filtered and sorted
  cardsForColumn(columnId: string): Card[] {
    return this.filteredCards
      .filter(c => c.columnId === columnId)
      .sort((a, b) => a.position - b.position);
  }

  filteredCards = $derived.by(() => {
    let cards = this.#data.cards;

    if (this.filterLabel) {
      cards = cards.filter(c => c.labels.includes(this.filterLabel!));
    }
    if (this.filterAssignee) {
      cards = cards.filter(c => c.assigneeId === this.filterAssignee);
    }
    if (this.searchQuery.trim()) {
      const q = this.searchQuery.toLowerCase();
      cards = cards.filter(
        c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
      );
    }

    return cards;
  });

  totalCards = $derived(this.#data.cards.length);
  canUndo = $derived(this.#historyIndex > 0);
  canRedo = $derived(this.#historyIndex < this.#history.length - 1);

  dispatch(action: BoardAction) {
    // Save current state to history before applying
    const snapshot = $state.snapshot(this.#data);
    this.#history = this.#history.slice(0, this.#historyIndex + 1);
    this.#history.push(snapshot);
    if (this.#history.length > this.#maxHistory) {
      this.#history.shift();
    }
    this.#historyIndex = this.#history.length - 1;

    // Apply action
    this.#data = boardReducer(this.#data, action);
  }

  undo() {
    if (!this.canUndo) return;
    this.#historyIndex--;
    this.#data = $state.snapshot(this.#history[this.#historyIndex]);
  }

  redo() {
    if (!this.canRedo) return;
    this.#historyIndex++;
    this.#data = $state.snapshot(this.#history[this.#historyIndex]);
  }

  // Optimistic move with server sync
  async moveCard(cardId: string, toColumnId: string, toPosition: number) {
    const snapshot = $state.snapshot(this.#data);

    this.dispatch({
      type: 'MOVE_CARD',
      cardId,
      toColumnId,
      toPosition
    });

    try {
      const res = await fetch(`/api/board/cards/${cardId}/move`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columnId: toColumnId, position: toPosition })
      });
      if (!res.ok) throw new Error('Move failed');
    } catch (err) {
      // Rollback
      this.#data = snapshot;
      console.error('Move failed, rolled back:', err);
    }
  }

  async load() {
    const res = await fetch('/api/board');
    if (!res.ok) throw new Error('Failed to load board');
    const data: BoardData = await res.json();
    this.#data = data;
    this.#history = [data];
    this.#historyIndex = 0;
  }
}

export const board = new BoardStore();
```

This example demonstrates how patterns compose. The reducer keeps mutations predictable. The history stack enables undo/redo. Optimistic updates make drag-and-drop feel instant. Derived state handles filtering without storing filtered copies. The class encapsulates everything behind a clean API.

## Try It

Build a shopping list state class that combines several patterns:

1. Use a state machine for fetch status (`idle`, `loading`, `loaded`, `error`) with discriminated unions so each state carries appropriate data
2. Implement a reducer with typed actions: `ADD_ITEM`, `REMOVE_ITEM`, `UPDATE_QUANTITY`, `TOGGLE_PURCHASED`
3. Derive `totalCost`, `purchasedCount`, `remainingItems`, and `groupedByCategory` from the item list
4. Implement optimistic removal with rollback — when a user deletes an item, remove it from the UI immediately and restore it if the server returns an error
5. Add undo/redo for add and remove operations using the command pattern
6. Add `$inspect` calls to track state changes during development

This exercise forces you to think about how patterns interact. The state machine guards the reducer (you cannot dispatch `ADD_ITEM` while the list is in `loading` state). The derived values recompute when the reducer produces new state. The optimistic update snapshots and restores reducer state. Each pattern reinforces the others.

## Key Takeaways

- The **reducer pattern** centralizes all state transitions into a pure function, making mutations predictable, testable, and auditable
- **State machines** with discriminated unions prevent impossible states — you cannot be loading and errored simultaneously because the type system forbids it
- **Derived chains** in Svelte 5 are fine-grained: changing a filter only recomputes derivations that depend on that filter, not unrelated derivations
- **Optimistic updates** require a snapshot before mutation and a rollback path — use `$state.snapshot()` to capture deep copies of reactive state
- The **command pattern** enables undo/redo for any operation by pairing each action with its inverse
- **State sync** between client and server uses debounced saves, status tracking per item, and flush-on-unload to prevent data loss
- **`$state.raw`** skips deep proxying for large datasets you replace wholesale, improving performance for data tables and paginated lists
- **`$inspect`** logs state changes in development and is stripped from production builds — use it liberally for debugging
- **Class-based state** with private fields (`#`) provides real encapsulation — external code cannot bypass your state transitions
- Patterns **compose naturally**: a board store can use a reducer for mutations, a history stack for undo, optimistic updates for drag-and-drop, and derived state for filtering, all in one cohesive class
