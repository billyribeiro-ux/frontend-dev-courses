# Testing the Application

You have built a real-time Kanban board with drag-and-drop, authentication, streaming data, notifications, and collaborative features. It works today. But will it work tomorrow, after you refactor the board state module? Will it work next month, after you add swimlanes? Will it work after a dependency update? Testing is what separates a project that works from a project you can confidently change.

This lesson builds a test suite for TeamBoard at every layer of the testing pyramid: fast unit tests for state logic, component tests for UI behavior, integration tests for remote functions, and an end-to-end test for the critical user flow. By the end, you will have concrete, runnable test files and a clear understanding of what to test at each level.

## The Testing Pyramid

Before writing any tests, understand the structure:

```
        /\
       /  \        E2E Tests (Playwright)
      / 1-3 \      Full user flows, real browser
     /--------\
    /          \   Component Tests (@testing-library/svelte)
   /   5-10     \  Render components, check output & interactions
  /--------------\
 /                \ Unit Tests (Vitest)
/     Many (20+)   \ Pure functions, state logic, actions
/--------------------\
```

**Unit tests** are fast (milliseconds), cheap to write, and test isolated logic. Write many of them. **Component tests** render Svelte components in a simulated DOM environment and verify they produce the right output. Write a moderate number. **E2E tests** launch a real browser and simulate a real user. They are slow, flaky-prone, and expensive — write just enough to cover critical paths.

## Unit Testing the Board State Module

The board state module (`board.svelte.ts`) is the heart of TeamBoard. It manages columns, tasks, drag state, and derived computations. Every function in this module can be tested in isolation with Vitest.

### Test Setup

First, configure Vitest to handle Svelte 5's `.svelte.ts` files:

```typescript
// vite.config.ts
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts']
  }
});
```

```typescript
// src/tests/setup.ts
import '@testing-library/jest-dom/vitest';
```

### Testing $state Mutations and $derived Updates

The key insight for testing `.svelte.ts` modules: reactive state and derived values work inside Vitest because the Svelte compiler processes the file. You create the state, mutate it, and assert on the derived values. Svelte's reactivity runs synchronously during tests, so derived values update immediately after mutations:

```typescript
// src/lib/state/board.test.ts
import { describe, it, expect } from 'vitest';
import { flushSync } from 'svelte';
import { createBoardState } from './board.svelte';

function createTestColumns() {
  return [
    {
      id: 1,
      name: 'To Do',
      position: 0,
      tasks: [
        { id: 101, title: 'Design mockups', columnId: 1, position: 0, priority: 'high', assignee: null, dueDate: '2025-01-01' },
        { id: 102, title: 'Write specs', columnId: 1, position: 1, priority: 'medium', assignee: null, dueDate: null }
      ]
    },
    {
      id: 2,
      name: 'In Progress',
      position: 1,
      tasks: [
        { id: 201, title: 'Build API', columnId: 2, position: 0, priority: 'high', assignee: { name: 'Alice' }, dueDate: null }
      ]
    },
    {
      id: 3,
      name: 'Done',
      position: 2,
      tasks: []
    }
  ];
}

describe('Board State', () => {
  it('initializes with columns and members', () => {
    const board = createBoardState();
    const columns = createTestColumns();

    board.initialize(1, 100, columns, [{ id: 1, name: 'Alice' }]);

    expect(board.columns).toHaveLength(3);
    expect(board.boardMembers).toHaveLength(1);
    expect(board.totalTasks).toBe(3);
  });

  it('moves a task between columns', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    // Move "Design mockups" from To Do to In Progress
    board.moveTask(101, 1, 2, 0);

    flushSync();

    // Task is no longer in To Do
    expect(board.columns[0].tasks.find(t => t.id === 101)).toBeUndefined();

    // Task is now in In Progress at position 0
    const movedTask = board.columns[1].tasks.find(t => t.id === 101);
    expect(movedTask).toBeDefined();
    expect(movedTask!.columnId).toBe(2);
    expect(movedTask!.position).toBe(0);

    // Previously existing task in In Progress is now at position 1
    expect(board.columns[1].tasks.find(t => t.id === 201)!.position).toBe(1);
  });

  it('updates derived task counts after mutation', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    expect(board.columnTaskCounts).toEqual({ 1: 2, 2: 1, 3: 0 });

    board.moveTask(101, 1, 2, 1);
    flushSync();

    expect(board.columnTaskCounts).toEqual({ 1: 1, 2: 2, 3: 0 });
  });

  it('computes overdue tasks correctly', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    flushSync();

    // Task 101 has dueDate '2025-01-01' which is in the past
    const overdue = board.overdueTasks;
    expect(overdue).toHaveLength(1);
    expect(overdue[0].id).toBe(101);
  });

  it('adds a task to a column', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    board.addTask(3, {
      id: 301,
      title: 'Celebrate',
      columnId: 3,
      position: 0,
      priority: 'low',
      assignee: null,
      dueDate: null
    });

    flushSync();

    expect(board.columns[2].tasks).toHaveLength(1);
    expect(board.totalTasks).toBe(4);
  });

  it('removes a task and updates positions', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    board.removeTask(101);
    flushSync();

    expect(board.columns[0].tasks).toHaveLength(1);
    expect(board.columns[0].tasks[0].id).toBe(102);
    expect(board.columns[0].tasks[0].position).toBe(0);
  });
});

describe('Board Snapshots', () => {
  it('returns plain objects from $state.snapshot()', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    const snapshot = board.getSnapshot();

    // Snapshot should be a plain object, not a reactive proxy
    expect(snapshot.columns).toBeInstanceOf(Array);
    expect(JSON.stringify(snapshot)).toBeTruthy(); // serializable

    // Verify the data is correct
    expect(snapshot.columns).toHaveLength(3);
    expect(snapshot.boardId).toBe(1);
    expect(snapshot.projectId).toBe(100);
  });

  it('snapshot is disconnected from reactive state', () => {
    const board = createBoardState();
    board.initialize(1, 100, createTestColumns(), []);

    const snapshot = board.getSnapshot();
    const originalLength = snapshot.columns[0].tasks.length;

    // Mutate the live state
    board.addTask(1, {
      id: 999,
      title: 'New task',
      columnId: 1,
      position: 0,
      priority: 'low',
      assignee: null,
      dueDate: null
    });

    flushSync();

    // Snapshot should NOT reflect the mutation
    expect(snapshot.columns[0].tasks).toHaveLength(originalLength);

    // Live state SHOULD reflect the mutation
    expect(board.columns[0].tasks).toHaveLength(originalLength + 1);
  });
});
```

Notice the use of `flushSync()` from `svelte`. In a test environment, derived values sometimes need an explicit synchronization point. `flushSync()` forces Svelte to process all pending reactive updates before the next assertion. This is the test equivalent of what the browser does automatically between microtasks.

## Unit Testing Custom Actions

Actions are functions that receive a DOM node and parameters. Testing them means creating a real DOM element, calling the action, simulating events, and verifying the element was modified correctly.

### Testing the draggable Action

```typescript
// src/lib/actions/drag.test.ts
import { describe, it, expect, vi } from 'vitest';
import { draggable } from './drag';

function createTestElement(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);

  // jsdom does not implement setPointerCapture
  el.setPointerCapture = vi.fn();
  el.releasePointerCapture = vi.fn();

  return el;
}

function firePointerEvent(el: HTMLElement, type: string, options: Partial<PointerEvent> = {}) {
  const event = new PointerEvent(type, {
    bubbles: true,
    clientX: options.clientX ?? 0,
    clientY: options.clientY ?? 0,
    pointerId: 1,
    ...options
  });
  el.dispatchEvent(event);
}

describe('draggable action', () => {
  it('applies grab cursor and sets z-index on pointerdown', () => {
    const el = createTestElement();
    const cleanup = draggable(el, { enabled: true });

    firePointerEvent(el, 'pointerdown', { clientX: 100, clientY: 200 });

    expect(el.style.cursor).toBe('grabbing');
    expect(el.style.zIndex).toBe('1000');

    cleanup?.destroy?.();
    el.remove();
  });

  it('dispatches custom dragstart event with coordinates', () => {
    const el = createTestElement();
    const handler = vi.fn();
    el.addEventListener('dragstart', handler);

    draggable(el, { enabled: true, data: { taskId: 42 } });

    firePointerEvent(el, 'pointerdown', { clientX: 150, clientY: 250 });

    expect(handler).toHaveBeenCalledOnce();
    const detail = handler.mock.calls[0][0].detail;
    expect(detail.x).toBe(150);
    expect(detail.y).toBe(250);
    expect(detail.data).toEqual({ taskId: 42 });

    el.remove();
  });

  it('does nothing when disabled', () => {
    const el = createTestElement();
    const handler = vi.fn();
    el.addEventListener('dragstart', handler);

    draggable(el, { enabled: false });
    firePointerEvent(el, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(handler).not.toHaveBeenCalled();
    expect(el.style.cursor).not.toBe('grabbing');

    el.remove();
  });

  it('cleans up event listeners on destroy', () => {
    const el = createTestElement();
    const result = draggable(el, { enabled: true });

    // Destroy the action
    result?.destroy?.();

    // After destroy, pointerdown should not trigger drag behavior
    const handler = vi.fn();
    el.addEventListener('dragstart', handler);
    firePointerEvent(el, 'pointerdown', { clientX: 100, clientY: 100 });

    expect(handler).not.toHaveBeenCalled();

    el.remove();
  });
});
```

### Testing the clickOutside Action

```typescript
// src/lib/actions/clickOutside.test.ts
import { describe, it, expect, vi } from 'vitest';
import { clickOutside } from './clickOutside';

describe('clickOutside action', () => {
  it('calls the callback when clicking outside the element', () => {
    const el = document.createElement('div');
    const outsideEl = document.createElement('div');
    document.body.appendChild(el);
    document.body.appendChild(outsideEl);

    const callback = vi.fn();
    const cleanup = clickOutside(el, { onClickOutside: callback });

    // Click outside
    outsideEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).toHaveBeenCalledOnce();

    cleanup?.destroy?.();
    el.remove();
    outsideEl.remove();
  });

  it('does NOT call the callback when clicking inside the element', () => {
    const el = document.createElement('div');
    const child = document.createElement('span');
    el.appendChild(child);
    document.body.appendChild(el);

    const callback = vi.fn();
    clickOutside(el, { onClickOutside: callback });

    // Click inside (on child)
    child.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).not.toHaveBeenCalled();

    el.remove();
  });

  it('cleans up the document listener on destroy', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    const callback = vi.fn();
    const cleanup = clickOutside(el, { onClickOutside: callback });

    cleanup?.destroy?.();

    // Click outside after destroy
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callback).not.toHaveBeenCalled();

    el.remove();
  });
});
```

The pattern for testing actions: create a real DOM element, attach the action, simulate browser events, assert on side effects (DOM changes, dispatched events, callback invocations), and verify cleanup on destroy.

## Component Tests with @testing-library/svelte

Component tests render actual Svelte components and assert on what the user sees and interacts with. Install the testing library:

```bash
npm install -D @testing-library/svelte @testing-library/jest-dom
```

### Testing TaskCard

```typescript
// src/lib/components/TaskCard.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TaskCard from './TaskCard.svelte';

describe('TaskCard', () => {
  const defaultTask = {
    id: 1,
    title: 'Implement login flow',
    priority: 'high',
    assignee: { name: 'Alice', avatarUrl: '/alice.jpg' },
    dueDate: '2025-06-15',
    columnId: 1,
    position: 0
  };

  it('renders the task title', () => {
    render(TaskCard, {
      props: { task: defaultTask, columnName: 'To Do' }
    });

    expect(screen.getByText('Implement login flow')).toBeInTheDocument();
  });

  it('shows the priority badge', () => {
    render(TaskCard, {
      props: { task: defaultTask, columnName: 'To Do' }
    });

    const badge = screen.getByText('high');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('priority-high');
  });

  it('displays the assignee name', () => {
    render(TaskCard, {
      props: { task: defaultTask, columnName: 'To Do' }
    });

    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows "Unassigned" when no assignee', () => {
    const unassignedTask = { ...defaultTask, assignee: null };
    render(TaskCard, {
      props: { task: unassignedTask, columnName: 'To Do' }
    });

    expect(screen.getByText('Unassigned')).toBeInTheDocument();
  });

  it('has accessible aria-label with task details', () => {
    render(TaskCard, {
      props: { task: defaultTask, columnName: 'In Progress' }
    });

    const card = screen.getByRole('option');
    expect(card).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Implement login flow')
    );
    expect(card).toHaveAttribute(
      'aria-label',
      expect.stringContaining('In Progress')
    );
  });
});
```

### Testing NotificationToast

The notification component auto-dismisses after a timeout and has transition classes. Test both behaviors:

```typescript
// src/lib/components/NotificationToast.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import NotificationToast from './NotificationToast.svelte';

describe('NotificationToast', () => {
  it('renders the notification message', () => {
    render(NotificationToast, {
      props: {
        message: 'Task moved to Done',
        type: 'success',
        duration: 5000
      }
    });

    expect(screen.getByText('Task moved to Done')).toBeInTheDocument();
  });

  it('applies the correct type class', () => {
    render(NotificationToast, {
      props: {
        message: 'Something went wrong',
        type: 'error',
        duration: 5000
      }
    });

    const toast = screen.getByRole('alert');
    expect(toast).toHaveClass('toast-error');
  });

  it('auto-dismisses after the specified duration', async () => {
    vi.useFakeTimers();

    render(NotificationToast, {
      props: {
        message: 'Disappearing soon',
        type: 'info',
        duration: 3000
      }
    });

    expect(screen.getByText('Disappearing soon')).toBeInTheDocument();

    // Advance timers past the duration
    vi.advanceTimersByTime(3500);

    await waitFor(() => {
      expect(screen.queryByText('Disappearing soon')).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it('has an accessible role of alert', () => {
    render(NotificationToast, {
      props: {
        message: 'Important update',
        type: 'warning',
        duration: 5000
      }
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

### Testing a Component That Uses Context

Components that read from Svelte context (via `getContext`) need a provider wrapper in tests. Create a test helper:

```typescript
// src/tests/renderWithContext.ts
import { render, type RenderResult } from '@testing-library/svelte';
import ContextProvider from './ContextProvider.svelte';
import type { ComponentProps, Component } from 'svelte';

export function renderWithContext<C extends Component>(
  component: C,
  props: ComponentProps<C>,
  contextValues: Record<string, unknown>
): RenderResult<C> {
  return render(ContextProvider, {
    props: {
      component,
      componentProps: props,
      contextValues
    }
  }) as unknown as RenderResult<C>;
}
```

```svelte
<!-- src/tests/ContextProvider.svelte -->
<script lang="ts">
  import { setContext, type Component } from 'svelte';

  let {
    component,
    componentProps,
    contextValues
  }: {
    component: Component;
    componentProps: Record<string, unknown>;
    contextValues: Record<string, unknown>;
  } = $props();

  // Set all provided context values
  for (const [key, value] of Object.entries(contextValues)) {
    setContext(key, value);
  }
</script>

<svelte:component this={component} {...componentProps} />
```

Now test a component that depends on context:

```typescript
// src/lib/components/BoardHeader.test.ts
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/svelte';
import { renderWithContext } from '../../tests/renderWithContext';
import BoardHeader from './BoardHeader.svelte';

describe('BoardHeader', () => {
  it('displays the team name from context', () => {
    renderWithContext(
      BoardHeader,
      { boardName: 'Sprint 12' },
      {
        team: { name: 'Engineering', slug: 'engineering' },
        currentUser: { name: 'Alice', role: 'admin' }
      }
    );

    expect(screen.getByText('Engineering')).toBeInTheDocument();
    expect(screen.getByText('Sprint 12')).toBeInTheDocument();
  });
});
```

## Integration Tests for Remote Functions

Remote functions (`query`, `form`, `command`) bridge the client and server. Integration tests verify that the full pipeline works — from the function call through validation to the database query and back.

### Testing a query() Function

```typescript
// src/lib/api/teams.remote.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
vi.mock('$lib/server/database', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([
      { id: 1, name: 'Engineering', slug: 'engineering' },
      { id: 2, name: 'Design', slug: 'design' }
    ])
  }
}));

// Mock the server function wrappers
vi.mock('$app/server', () => ({
  query: (schemaOrFn: unknown, maybeFn?: unknown) => {
    // If called with schema + function, return the function
    const fn = typeof schemaOrFn === 'function' ? schemaOrFn : maybeFn;
    return fn;
  }
}));

describe('Teams remote functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTeams returns all teams', async () => {
    const { getTeams } = await import('./teams.remote');

    const teams = await getTeams();

    expect(teams).toHaveLength(2);
    expect(teams[0]).toEqual({
      id: 1,
      name: 'Engineering',
      slug: 'engineering'
    });
  });
});
```

### Testing a form() Function with Validation

```typescript
// src/lib/api/tasks.remote.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/database', () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([
      { id: 1, title: 'New task', priority: 'high', columnId: 1 }
    ])
  }
}));

vi.mock('$app/server', () => ({
  form: (schema: unknown, fn: Function) => {
    // Return a function that validates then calls the handler
    return async (data: unknown) => {
      // In a real test you might validate against the schema here
      return fn(data);
    };
  }
}));

describe('Task form functions', () => {
  it('createTask inserts a task and returns it', async () => {
    const { createTask } = await import('./tasks.remote');

    const result = await createTask({
      title: 'New task',
      priority: 'high',
      columnId: 1
    });

    expect(result.id).toBe(1);
    expect(result.title).toBe('New task');
  });
});
```

### Testing a command() with .updates()

```typescript
// src/lib/api/board.remote.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/database', () => ({
  db: {
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ id: 101, columnId: 2, position: 0 }])
  }
}));

vi.mock('$app/server', () => ({
  command: (schema: unknown, fn: Function) => {
    const handler = async (data: unknown) => fn(data);
    handler.updates = vi.fn().mockReturnValue(handler);
    return handler;
  }
}));

describe('Board command functions', () => {
  it('moveTask updates the task column and position', async () => {
    const { moveTask } = await import('./board.remote');

    const result = await moveTask({
      taskId: 101,
      toColumnId: 2,
      position: 0
    });

    expect(result[0].columnId).toBe(2);
    expect(result[0].position).toBe(0);
  });
});
```

These integration tests verify that your remote functions call the right database queries with the right arguments. They mock the database layer but test the actual function logic, including validation schemas and data transformations.

## E2E Test with Playwright

The end-to-end test covers the critical user flow: log in, navigate to a board, create a task, drag it to a new column, add a comment, and verify everything. This test runs in a real browser against a running instance of the application.

### Setup

```bash
npm install -D @playwright/test
npx playwright install
```

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  webServer: {
    command: 'npm run build && npm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: 'http://localhost:4173'
  }
});
```

### Page Object Pattern

Create page objects that encapsulate page-specific selectors and actions. This keeps tests readable and makes maintenance easier when the UI changes:

```typescript
// e2e/pages/LoginPage.ts
import type { Page } from '@playwright/test';

export class LoginPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/login');
  }

  async login(email: string, password: string) {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
  }

  async expectError(message: string) {
    await this.page.getByText(message).waitFor();
  }
}
```

```typescript
// e2e/pages/DashboardPage.ts
import type { Page } from '@playwright/test';

export class DashboardPage {
  constructor(private page: Page) {}

  async expectLoaded() {
    await this.page.waitForURL('**/dashboard');
    await this.page.getByRole('heading', { name: /dashboard/i }).waitFor();
  }

  async openBoard(boardName: string) {
    await this.page.getByRole('link', { name: boardName }).click();
  }
}
```

```typescript
// e2e/pages/BoardPage.ts
import type { Page, Locator } from '@playwright/test';

export class BoardPage {
  constructor(private page: Page) {}

  async expectLoaded() {
    await this.page.locator('.board').waitFor();
  }

  getColumn(name: string): Locator {
    return this.page.locator('.column').filter({ hasText: name });
  }

  getTask(title: string): Locator {
    return this.page.locator('.task-card').filter({ hasText: title });
  }

  async createTask(columnName: string, title: string) {
    const column = this.getColumn(columnName);
    await column.getByPlaceholder('Add a task').fill(title);
    await column.getByRole('button', { name: 'Add' }).click();
    // Wait for the task to appear
    await this.getTask(title).waitFor();
  }

  async dragTask(taskTitle: string, toColumnName: string) {
    const task = this.getTask(taskTitle);
    const targetColumn = this.getColumn(toColumnName);

    // Get bounding boxes for drag coordinates
    const taskBox = await task.boundingBox();
    const columnBox = await targetColumn.boundingBox();
    if (!taskBox || !columnBox) throw new Error('Elements not visible');

    // Simulate drag via pointer events
    await this.page.mouse.move(
      taskBox.x + taskBox.width / 2,
      taskBox.y + taskBox.height / 2
    );
    await this.page.mouse.down();
    await this.page.mouse.move(
      columnBox.x + columnBox.width / 2,
      columnBox.y + columnBox.height / 2,
      { steps: 10 } // smooth drag with intermediate steps
    );
    await this.page.mouse.up();
  }

  async openTask(title: string) {
    await this.getTask(title).click();
    await this.page.locator('[role="dialog"]').waitFor();
  }

  async addComment(text: string) {
    await this.page.getByLabel('Add a comment').fill(text);
    await this.page.getByRole('button', { name: 'Post Comment' }).click();
    await this.page.getByText(text).waitFor();
  }

  async closeModal() {
    await this.page.getByRole('button', { name: 'Close' }).click();
    await this.page.locator('[role="dialog"]').waitFor({ state: 'detached' });
  }
}
```

### The Full E2E Test

```typescript
// e2e/critical-flow.test.ts
import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { BoardPage } from './pages/BoardPage';

test.describe('Critical user flow', () => {
  test('login → dashboard → board → create task → drag → comment', async ({ page }) => {
    // 1. Navigate to login and authenticate
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login('alice@example.com', 'password123');

    // 2. Verify landing on dashboard
    const dashboard = new DashboardPage(page);
    await dashboard.expectLoaded();

    // 3. Click into a board
    await dashboard.openBoard('Sprint 12');
    const board = new BoardPage(page);
    await board.expectLoaded();

    // 4. Create a new task in the "To Do" column
    await board.createTask('To Do', 'Write E2E tests');
    const newTask = board.getTask('Write E2E tests');
    await expect(newTask).toBeVisible();

    // 5. Drag the task to "In Progress"
    await board.dragTask('Write E2E tests', 'In Progress');

    // 6. Verify the task appears in the new column
    const inProgressColumn = board.getColumn('In Progress');
    await expect(inProgressColumn.getByText('Write E2E tests')).toBeVisible();

    // Verify the task is no longer in "To Do"
    const toDoColumn = board.getColumn('To Do');
    await expect(toDoColumn.getByText('Write E2E tests')).not.toBeVisible();

    // 7. Open the task modal
    await board.openTask('Write E2E tests');
    await expect(page.locator('[role="dialog"]')).toBeVisible();

    // 8. Add a comment
    await board.addComment('E2E test confirms this works!');
    await expect(page.getByText('E2E test confirms this works!')).toBeVisible();

    // 9. Close the modal
    await board.closeModal();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();

    // Verify we are back on the board
    await expect(page.locator('.board')).toBeVisible();
  });
});
```

This single test covers the most critical path through the application. If this test passes, you know login, navigation, task creation, drag-and-drop, modals, and comments all work together. If it fails, you know exactly where in the user flow things broke.

### Running Tests

Run each layer independently:

```bash
# Unit tests — fast, run on every save
npx vitest run

# Unit tests in watch mode during development
npx vitest

# E2E tests — slow, run before deploy
npx playwright test

# E2E tests with browser visible for debugging
npx playwright test --headed

# Generate HTML report for E2E results
npx playwright show-report
```

## Try It

1. Write unit tests for your `board.svelte.ts` module. Test `moveTask`, `addTask`, and `removeTask`. Verify that `$derived.by()` values (task counts, overdue tasks) update correctly after each mutation. Use `flushSync()` between mutation and assertion.

2. Write a test for one of your custom actions. Create a DOM element, attach the action, simulate events, and assert on the side effects. Verify that the action cleans up properly on destroy.

3. Install `@testing-library/svelte` and write component tests for `TaskCard`. Render it with different props (with assignee, without assignee, different priorities) and verify the rendered output matches expectations.

4. If you have a component that uses Svelte context, create a `ContextProvider` test wrapper and use it to render the component with mock context values.

5. Install Playwright and write an E2E test for your most critical user flow. Use the page object pattern to keep your test readable. Run it with `--headed` to watch it execute.

6. Count your tests by layer. Do you have more unit tests than component tests? More component tests than E2E tests? If not, consider whether you are testing at the right level.

## Key Takeaways

- The testing pyramid guides where to invest: many fast unit tests, fewer component tests, minimal E2E tests
- Svelte 5's `.svelte.ts` modules are testable with Vitest — reactive state and derived values work in the test environment, use `flushSync()` to synchronize updates
- `$state.snapshot()` returns plain objects that are disconnected from reactive state — test this property explicitly to verify serialization safety
- Actions are tested by creating real DOM elements, simulating pointer/mouse events, and asserting on DOM changes and dispatched custom events
- `@testing-library/svelte` renders real Svelte components and encourages testing from the user's perspective — query by role, label, and text, not by CSS class
- Components that depend on context need a test wrapper that calls `setContext` before rendering the component under test
- Remote functions are tested by mocking the database layer and verifying the function logic, validation, and data transformations
- Playwright E2E tests use the page object pattern to encapsulate selectors and actions, making tests readable and maintainable
- Run unit tests on every save (watch mode), component tests before merging, and E2E tests before deploying
